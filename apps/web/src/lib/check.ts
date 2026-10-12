import { supabase } from './supabase';

/**
 * Vorsorge-Check zwischen Berater und Kunde — die Datenbankzugriffe.
 *
 * Der Berater legt eine Anfrage an und verschickt den Link mit ihrem Code.
 * Der Kunde reicht damit OHNE Konto ein. Wer was darf, entscheidet allein die
 * Datenbank (supabase/migrations/…_vorsorge_check.sql): Der Kunde kann nur
 * einreichen, lesen kann nur der Berater, dem der Code gehoert.
 */

/** Der Code ist eine UUID; alles andere im Link ist kein Code. */
export const CHECK_CODE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Der Link fuer den Kunden. */
export function checkLink(code: string): string {
  return `${window.location.origin}/vorsorge-check?a=${code}`;
}

export type CodeStatus = 'gueltig' | 'ungueltig' | 'fehler';

/**
 * Laesst sich mit diesem Code noch einreichen? Fragt nur ja oder nein ab —
 * der Kunde erfaehrt so VOR dem Ausfuellen, dass ein Link abgelaufen ist.
 */
export async function codePruefen(code: string): Promise<CodeStatus> {
  if (!supabase || !CHECK_CODE.test(code)) return 'ungueltig';
  const { data, error } = await supabase.rpc('check_code_gueltig', { p_code: code });
  if (error) return 'fehler';
  return data === true ? 'gueltig' : 'ungueltig';
}

/**
 * Einreichen. Ohne `select()`: Der Kunde darf seine Einreichung nicht
 * zuruecklesen, und ein angefordertes Ergebnis liesse den Aufruf scheitern.
 */
export async function einreichen(code: string, daten: unknown): Promise<'ok' | 'ungueltig' | 'fehler'> {
  if (!supabase) return 'fehler';
  const { error } = await supabase.from('check_eingaenge').insert({ code, daten });
  if (!error) return 'ok';
  // 42501: Policy greift (abgelaufen, erfunden); 23505: schon eingereicht.
  if (error.code === '42501' || error.code === '23505') return 'ungueltig';
  return 'fehler';
}

export interface CheckAnfrage {
  code: string;
  kunde: string;
  erstelltAm: string;
  gueltigBis: string;
  eingang: { id: string; eingegangenAm: string } | null;
}

interface AnfrageZeile {
  code: string;
  kunde: string;
  erstellt_am: string;
  gueltig_bis: string;
  check_eingaenge: { id: string; eingegangen_am: string }[] | { id: string; eingegangen_am: string } | null;
}

function zuAnfrage(z: AnfrageZeile): CheckAnfrage {
  const e = Array.isArray(z.check_eingaenge) ? z.check_eingaenge[0] : z.check_eingaenge;
  return {
    code: z.code,
    kunde: z.kunde,
    erstelltAm: z.erstellt_am,
    gueltigBis: z.gueltig_bis,
    eingang: e ? { id: e.id, eingegangenAm: e.eingegangen_am } : null,
  };
}

const SPALTEN = 'code, kunde, erstellt_am, gueltig_bis, check_eingaenge(id, eingegangen_am)';

/** Die eigenen Anfragen, neueste zuerst — die Datenbank liefert nur die eigenen. */
export async function anfragenLaden(): Promise<CheckAnfrage[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('check_anfragen')
    .select(SPALTEN)
    .order('erstellt_am', { ascending: false });
  if (error) throw error;
  return (data as unknown as AnfrageZeile[]).map(zuAnfrage);
}

export async function anfrageAnlegen(kunde: string): Promise<CheckAnfrage> {
  if (!supabase) throw new Error('Keine Verbindung zum Konto-Dienst.');
  const { data, error } = await supabase
    .from('check_anfragen')
    .insert({ kunde: kunde.trim().slice(0, 120) })
    .select(SPALTEN)
    .single();
  if (error) throw error;
  return zuAnfrage(data as unknown as AnfrageZeile);
}

export async function eingangLaden(code: string): Promise<unknown> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('check_eingaenge').select('daten').eq('code', code).single();
  if (error) throw error;
  return (data as { daten: unknown }).daten;
}

/** Loescht die Anfrage — und mit ihr einen etwaigen Eingang. */
export async function anfrageLoeschen(code: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('check_anfragen').delete().eq('code', code);
  if (error) throw error;
}

/* --------------------------------------------------------------------------
   UNTERLAGEN — Fotos und Scans, die der Kunde zum Check hochlaedt.

   Wer was darf, entscheidet wieder die Datenbank
   (supabase/migrations/…_check_dokumente.sql): Der Kunde darf mit einem
   offenen Code hochladen, aber nichts lesen; lesen darf nur der Berater, dem
   der Code gehoert, und erst nach dem Absenden. Entfernen und Aufraeumen
   laufen ueber die Edge Function `check-dokumente`, weil Dateien sich nur
   ueber die Storage-API loeschen lassen.
   -------------------------------------------------------------------------- */

export const DOKUMENTE_BUCKET = 'check-dokumente';
/** Hoechstzahl je Anfrage — dieselbe Grenze wie in `check_dokument_erlaubt`. */
export const DOKUMENTE_HOECHSTENS = 20;
/** Hoechstgroesse je Datei — dieselbe wie am Bucket. */
export const DOKUMENT_MAX_BYTES = 10 * 1024 * 1024;

export type DokumentArt = 'einkommen' | 'kv' | 'rente' | 'vertraege' | 'sonstiges';

export const DOKUMENT_ART_TEXT: Record<DokumentArt, string> = {
  einkommen: 'Einkommen',
  kv: 'Krankenversicherung',
  rente: 'Gesetzliche Rente',
  vertraege: 'Verträge',
  sonstiges: 'Weitere Unterlagen',
};

/** Eine hochgeladene Unterlage, wie der Kunde sie in seinem Zwischenstand fuehrt. */
export interface DokumentEintrag {
  pfad: string;
  /** Der Originalname der Datei — fuer die Liste, nicht fuer den Pfad */
  name: string;
  art: DokumentArt;
  groesse: number;
  typ: string;
}

const ENDUNG: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'image/heic': 'heic', 'image/heif': 'heif', 'application/pdf': 'pdf',
};
const TYP_AUS_ENDUNG: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  heic: 'image/heic', heif: 'image/heif', pdf: 'application/pdf',
};

/**
 * Der Dateityp — erlaubt sind Fotos und PDF. Manche Telefone liefern keinen
 * Typ mit; dann entscheidet die Endung.
 */
export function dokumentTyp(datei: { type: string; name: string }): string | null {
  if (ENDUNG[datei.type]) return datei.type;
  return TYP_AUS_ENDUNG[datei.name.toLowerCase().split('.').pop() ?? ''] ?? null;
}

/** Zufaelliger Dateiname: Der Originalname kann Persoenliches enthalten und steht nur in den Metadaten. */
function zufallsname(): string {
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export type HochladenFehler = 'ungueltig' | 'zu-gross' | 'typ' | 'fehler';

export async function dokumentHochladen(
  code: string, datei: Blob, name: string, art: DokumentArt,
): Promise<DokumentEintrag | HochladenFehler> {
  if (!supabase || !CHECK_CODE.test(code)) return 'ungueltig';
  const typ = dokumentTyp({ type: datei.type, name });
  if (!typ) return 'typ';
  if (datei.size > DOKUMENT_MAX_BYTES) return 'zu-gross';

  const pfad = `${code.toLowerCase()}/${zufallsname()}.${ENDUNG[typ]}`;
  const kurzName = name.trim().slice(0, 120) || `Unterlage.${ENDUNG[typ]}`;
  const { error } = await supabase.storage.from(DOKUMENTE_BUCKET).upload(pfad, datei, {
    contentType: typ,
    upsert: false,
    metadata: { name: kurzName, art },
  });
  if (!error) return { pfad, name: kurzName, art, groesse: datei.size, typ };

  // Der Speicher antwortet mit HTTP 400 und dem eigentlichen Code im Text
  // (statusCode „403“, „413“, „415“) — der hat Vorrang.
  const e = error as { status?: number; statusCode?: string; code?: string; message?: string };
  const status = Number(e.statusCode) || e.status;
  if (status === 413 || e.code === 'EntityTooLarge') return 'zu-gross';
  if (status === 415 || e.code === 'InvalidMimeType') return 'typ';
  // Die Policy lehnt ab: Link abgelaufen, schon abgesendet oder 20 Dateien erreicht.
  if (status === 400 || status === 403 || e.code === 'AccessDenied' || /row-level security/i.test(e.message ?? '')) {
    return 'ungueltig';
  }
  return 'fehler';
}

/** Der Kunde nimmt eine Datei zurueck — nur, solange sein Link offen ist. */
export async function dokumentEntfernen(code: string, pfad: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.functions.invoke('check-dokumente', {
    body: { aktion: 'entfernen', code: code.toLowerCase(), pfad },
  });
  return !error;
}

/** Eine Unterlage aus Sicht des Beraters — erst nach dem Eingang sichtbar. */
export interface BeraterDokument {
  code: string;
  pfad: string;
  name: string;
  art: DokumentArt;
  groesse: number | null;
  typ: string | null;
  hochgeladenAm: string;
}

interface DokumentZeile {
  code: string; pfad: string; name: string; art: string;
  groesse: number | null; typ: string | null; hochgeladen_am: string;
}

export async function dokumenteLaden(): Promise<BeraterDokument[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('check_dokumente_liste');
  if (error) throw error;
  return ((data ?? []) as DokumentZeile[]).map((z) => ({
    code: z.code,
    pfad: z.pfad,
    name: z.name,
    art: (z.art in DOKUMENT_ART_TEXT ? z.art : 'sonstiges') as DokumentArt,
    groesse: z.groesse,
    typ: z.typ,
    hochgeladenAm: z.hochgeladen_am,
  }));
}

/** Kurz gueltiger Link auf eine Unterlage — mit `download` als Datei statt zum Ansehen. */
export async function dokumentLink(pfad: string, download?: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.storage.from(DOKUMENTE_BUCKET)
    .createSignedUrl(pfad, 300, download ? { download } : undefined);
  return error ? null : data.signedUrl;
}

/**
 * Verwaiste Unterlagen sofort entfernen — nach dem Loeschen einer Anfrage.
 * Im Hintergrund; was hier nicht klappt, erledigt der naechtliche Lauf.
 */
export function dokumenteAufraeumen(): void {
  if (!supabase) return;
  void supabase.functions.invoke('check-dokumente', { body: { aktion: 'aufraeumen' } }).catch(() => undefined);
}
