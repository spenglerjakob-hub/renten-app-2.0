import {
  antragAngabenSchema, antragEingangSchema, antragLoesungSchema, ANTRAG_FELDER,
  type AntragAngaben, type AntragEingang, type AntragFeld, type AntragLoesung,
} from '@renten/schema';
import { supabase } from './supabase';
import { zufallsname, type HochladenFehler } from './check';

/**
 * Anträge nach „Lösungen annehmen“ — die Datenbankzugriffe.
 *
 * Wer was darf, entscheidet allein die Datenbank
 * (supabase/migrations/…_antraege.sql): Der Berater liest und ändert nur
 * seine eigenen Anträge; Code, Frist, offene Felder und Eingang setzen nur
 * deren Funktionen. Der Kunde prüft seinen Link, lädt die Ausweiskopie
 * hoch und reicht ein — lesen kann er nichts.
 */

export const ANTRAG_BUCKET = 'antrag-dokumente';
/** Höchstzahl je Ordner — dieselbe Grenze wie in `antrag_dokument_erlaubt`. */
export const AUSWEIS_HOECHSTENS = 4;
/** Höchstgröße je Datei — dieselbe wie am Bucket. */
export const AUSWEIS_MAX_BYTES = 10 * 1024 * 1024;

/** Der Code ist eine UUID; alles andere im Link ist kein Code. */
export const ANTRAG_CODE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Der Link für den Kunden. Der Code steht im FRAGMENT (#): Das schickt der
 * Browser nicht an den Server, er steht also in keinem Server-Protokoll.
 */
export const antragLink = (code: string, ursprung: string = window.location.origin) =>
  `${ursprung}/antrag#${code.toLowerCase()}`;

/** Der Code aus der Adresse der Kundenseite — oder null. */
export function codeAusAdresse(fragment: string): string | null {
  const roh = decodeURIComponent(fragment.replace(/^#/, '')).trim();
  return ANTRAG_CODE.test(roh) ? roh.toLowerCase() : null;
}

/* --------------------------------------------------------------------------
   BERATER
   -------------------------------------------------------------------------- */

export interface Antrag {
  id: string;
  kunde: string;
  loesungen: AntragLoesung[];
  angaben: AntragAngaben;
  code: string | null;
  linkBis: string | null;
  offen: AntragFeld[];
  eingang: AntragEingang | null;
  eingegangenAm: string | null;
  erstelltAm: string;
  geaendertAm: string;
}

/**
 * Der Stand eines Antrags für die Liste:
 *   entwurf      — noch kein Link an den Kunden
 *   beim-kunden  — Link offen
 *   abgelaufen   — Link abgelaufen, nichts eingegangen
 *   eingegangen  — der Kunde hat geantwortet, noch nicht übernommen
 *   uebernommen  — die Angaben des Kunden stehen im Antrag
 */
export type AntragStand = 'entwurf' | 'beim-kunden' | 'abgelaufen' | 'eingegangen' | 'uebernommen';

export function antragStand(
  a: Pick<Antrag, 'code' | 'linkBis' | 'eingang' | 'eingegangenAm'>, jetzt: Date = new Date(),
): AntragStand {
  if (a.eingegangenAm) return a.eingang ? 'eingegangen' : 'uebernommen';
  if (a.code && a.linkBis) return new Date(a.linkBis).getTime() > jetzt.getTime() ? 'beim-kunden' : 'abgelaufen';
  return 'entwurf';
}

export const STAND_TEXT: Record<AntragStand, string> = {
  entwurf: 'Entwurf',
  'beim-kunden': 'Beim Kunden offen',
  abgelaufen: 'Link abgelaufen',
  eingegangen: 'Eingegangen',
  uebernommen: 'Angaben übernommen',
};

interface AntragZeile {
  id: string;
  kunde: string;
  loesungen: unknown;
  angaben: unknown;
  code: string | null;
  link_bis: string | null;
  offen: string[] | null;
  eingang: unknown;
  eingegangen_am: string | null;
  erstellt_am: string;
  geaendert_am: string;
}

const SPALTEN = 'id, kunde, loesungen, angaben, code, link_bis, offen, eingang, eingegangen_am, erstellt_am, geaendert_am';

/**
 * Eine Zeile lesen — mit denselben Schemata wie beim Schreiben. Was nicht
 * passt, fällt weg, statt die Oberfläche zu stören: eine fremde Lösung
 * aus der Liste, ein unbekanntes Feld aus `offen`.
 */
export function zuAntrag(z: AntragZeile): Antrag {
  const loesungen = Array.isArray(z.loesungen)
    ? z.loesungen.flatMap((l) => {
        const r = antragLoesungSchema.safeParse(l);
        return r.success ? [r.data] : [];
      })
    : [];
  const angaben = antragAngabenSchema.safeParse(z.angaben ?? {});
  const eingang = z.eingang ? antragEingangSchema.safeParse(z.eingang) : null;
  return {
    id: z.id,
    kunde: z.kunde,
    loesungen,
    angaben: angaben.success ? angaben.data : antragAngabenSchema.parse({}),
    code: z.code,
    linkBis: z.link_bis,
    offen: (z.offen ?? []).filter((f): f is AntragFeld => (ANTRAG_FELDER as readonly string[]).includes(f)),
    eingang: eingang?.success ? eingang.data : null,
    eingegangenAm: z.eingegangen_am,
    erstelltAm: z.erstellt_am,
    geaendertAm: z.geaendert_am,
  };
}

function ohneVerbindung(): never {
  throw new Error('Keine Verbindung zum Konto-Dienst.');
}

/** Die eigenen Anträge, neueste zuerst — die Datenbank liefert nur die eigenen. */
export async function antraegeLaden(): Promise<Antrag[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('antraege').select(SPALTEN).order('erstellt_am', { ascending: false });
  if (error) throw error;
  return (data as unknown as AntragZeile[]).map(zuAntrag);
}

/** Ein Antrag — null, wenn es ihn nicht (mehr) gibt oder er einem anderen gehört. */
export async function antragLaden(id: string): Promise<Antrag | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('antraege').select(SPALTEN).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? zuAntrag(data as unknown as AntragZeile) : null;
}

export interface AntragEntwurf {
  /** Fehlt sie oder gibt es den Antrag nicht mehr, entsteht ein neuer. */
  id?: string | null;
  kunde: string;
  loesungen: AntragLoesung[];
  angaben: AntragAngaben;
}

/** Anlegen oder ändern — nur Name, Lösungen und Angaben; den Rest setzt die Datenbank. */
export async function antragSpeichern(e: AntragEntwurf): Promise<Antrag> {
  if (!supabase) ohneVerbindung();
  const zeile = {
    kunde: e.kunde.trim().slice(0, 120),
    loesungen: e.loesungen.map((l) => antragLoesungSchema.parse(l)),
    angaben: antragAngabenSchema.parse(e.angaben),
  };
  if (e.id) {
    const { data, error } = await supabase.from('antraege').update(zeile).eq('id', e.id).select(SPALTEN).maybeSingle();
    if (error) throw error;
    if (data) return zuAntrag(data as unknown as AntragZeile);
    // Inzwischen gelöscht (Frist, anderes Gerät): neu anlegen.
  }
  const { data, error } = await supabase.from('antraege').insert(zeile).select(SPALTEN).single();
  if (error) throw error;
  return zuAntrag(data as unknown as AntragZeile);
}

/** Löscht den Antrag — die Ausweiskopien gehen gleich mit (im Hintergrund). */
export async function antragLoeschen(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('antraege').delete().eq('id', id);
  if (error) throw error;
  antragDokumenteAufraeumen();
}

/** Ein neuer Link an den Kunden. Null: schon eingegangen oder der Antrag ist zu alt. */
export async function antragLinkErstellen(id: string, offen: AntragFeld[]): Promise<{ code: string; linkBis: string } | null> {
  if (!supabase) ohneVerbindung();
  const { data, error } = await supabase.rpc('antrag_link_erstellen', { p_antrag: id, p_offen: offen });
  if (error) throw error;
  const z = (Array.isArray(data) ? data[0] : data) as { code: string; link_bis: string } | undefined;
  return z ? { code: z.code, linkBis: z.link_bis } : null;
}

export async function antragLinkZurueckziehen(id: string): Promise<boolean> {
  if (!supabase) ohneVerbindung();
  const { data, error } = await supabase.rpc('antrag_link_zurueckziehen', { p_antrag: id });
  if (error) throw error;
  antragDokumenteAufraeumen();
  return data === true;
}

/** Übernimmt die zusammengeführten Angaben; die Datenbank löscht dabei den Eingang. */
export async function antragEingangUebernehmen(id: string, angaben: AntragAngaben): Promise<boolean> {
  if (!supabase) ohneVerbindung();
  const { data, error } = await supabase.rpc('antrag_eingang_uebernehmen', {
    p_antrag: id, p_angaben: antragAngabenSchema.parse(angaben),
  });
  if (error) throw error;
  return data === true;
}

/* --------------------------------------------------------------------------
   AUSWEISKOPIEN — der Berater unter `<antrag-id>/`, der Kunde unter `<code>/`.
   Die Seite steht im Dateinamen (`vorne-…`, `hinten-…`): Die Liste des
   Speichers liefert keine eigenen Metadaten mit.
   -------------------------------------------------------------------------- */

export type AusweisSeite = 'vorne' | 'hinten';

export const SEITE_TEXT: Record<AusweisSeite, string> = { vorne: 'Vorderseite', hinten: 'Rückseite' };

export interface AusweisDatei {
  pfad: string;
  seite: AusweisSeite;
  /** Vom Kunden über den Link — sonst vom Berater */
  vomKunden: boolean;
  hochgeladenAm: string;
}

export const ausweisPfad = (ordner: string, seite: AusweisSeite) =>
  `${ordner.toLowerCase()}/${seite}-${zufallsname()}.jpg`;

export const seiteAusPfad = (pfad: string): AusweisSeite =>
  (pfad.split('/').pop() ?? '').startsWith('hinten-') ? 'hinten' : 'vorne';

/** Hochladen — nur JPEG, so wie `ausweisVorbereiten` es liefert. */
export async function ausweisHochladen(ordner: string, bild: Blob, seite: AusweisSeite): Promise<string | HochladenFehler> {
  if (!supabase || !ANTRAG_CODE.test(ordner)) return 'ungueltig';
  if (bild.type !== 'image/jpeg') return 'typ';
  if (bild.size > AUSWEIS_MAX_BYTES) return 'zu-gross';
  const pfad = ausweisPfad(ordner, seite);
  const { error } = await supabase.storage.from(ANTRAG_BUCKET).upload(pfad, bild, {
    contentType: 'image/jpeg', upsert: false,
  });
  if (!error) return pfad;
  const e = error as { status?: number; statusCode?: string; code?: string; message?: string };
  const status = Number(e.statusCode) || e.status;
  if (status === 413 || e.code === 'EntityTooLarge') return 'zu-gross';
  if (status === 415 || e.code === 'InvalidMimeType') return 'typ';
  // Die Policy lehnt ab: Link abgelaufen, schon abgesendet oder vier Dateien erreicht.
  if (status === 400 || status === 403 || e.code === 'AccessDenied' || /row-level security/i.test(e.message ?? '')) {
    return 'ungueltig';
  }
  return 'fehler';
}

/** Die Ausweiskopien eines Antrags: die eigenen und — nach dem Eingang — die des Kunden. */
export async function ausweiseLaden(a: Pick<Antrag, 'id' | 'code' | 'eingegangenAm'>): Promise<AusweisDatei[]> {
  if (!supabase) return [];
  const ordner = [{ name: a.id, vomKunden: false }];
  if (a.code && a.eingegangenAm) ordner.push({ name: a.code, vomKunden: true });
  const listen = await Promise.all(ordner.map(async (o) => {
    const { data, error } = await supabase!.storage.from(ANTRAG_BUCKET).list(o.name, {
      limit: 20, sortBy: { column: 'created_at', order: 'asc' },
    });
    if (error) throw error;
    return (data ?? [])
      .filter((d) => d.name.endsWith('.jpg'))
      .map((d) => ({
        pfad: `${o.name}/${d.name}`,
        seite: seiteAusPfad(d.name),
        vomKunden: o.vomKunden,
        hochgeladenAm: d.created_at ?? '',
      }));
  }));
  return listen.flat();
}

/** Kurz gültiger Link zum Ansehen — fünf Minuten. */
export async function ausweisLink(pfad: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.storage.from(ANTRAG_BUCKET).createSignedUrl(pfad, 300);
  return error ? null : data.signedUrl;
}

/** Ein JPEG als data-URL — `null`, wenn die Bytes kein JPEG sind. */
export function jpegDatenUrl(bytes: Uint8Array): string | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;
  let roh = '';
  for (let i = 0; i < bytes.length; i += 0x8000) roh += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/jpeg;base64,${btoa(roh)}`;
}

/**
 * Eine Kopie ganz geladen, als data-URL — für den Antragsbogen. Er wird erst
 * gedruckt, wenn alle Kopien da sind; mit Links lud das Druckfenster sie
 * selbst nach, und bei langsamer Verbindung fehlten sie im Ausdruck.
 */
export async function ausweisBild(pfad: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.storage.from(ANTRAG_BUCKET).download(pfad);
  if (error || !data) return null;
  return jpegDatenUrl(new Uint8Array(await data.arrayBuffer()));
}

/** Der Berater entfernt eine Kopie (Storage-API; die Datenbank prüft, dass sie ihm gehört). */
export async function ausweisEntfernen(pfad: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.storage.from(ANTRAG_BUCKET).remove([pfad]);
  return !error && (data ?? []).length > 0;
}

/**
 * Verwaiste Kopien sofort entfernen — nach dem Löschen eines Antrags oder
 * dem Zurückziehen eines Links. Im Hintergrund; was hier nicht klappt,
 * erledigt der nächtliche Lauf.
 */
export function antragDokumenteAufraeumen(): void {
  if (!supabase) return;
  void supabase.functions.invoke('antrag-dokumente', { body: { aktion: 'aufraeumen' } }).catch(() => undefined);
}

/* --------------------------------------------------------------------------
   KUNDE — ohne Konto, nur mit dem Code aus dem Link.
   -------------------------------------------------------------------------- */

export interface LinkLoesung {
  id: string;
  art: AntragLoesung['art'];
  anbieter: string;
}

export type LinkPruefung =
  | { status: 'offen'; offen: AntragFeld[]; bis: string; loesungen: LinkLoesung[] }
  | { status: 'ungueltig' | 'abgelaufen' | 'eingereicht' | 'fehler' };

/** Die Antwort der Datenbank lesen — was nicht passt, gilt als ungültig. */
export function pruefungAus(roh: unknown): LinkPruefung {
  if (!roh || typeof roh !== 'object') return { status: 'fehler' };
  const r = roh as { status?: unknown; offen?: unknown; bis?: unknown; loesungen?: unknown };
  if (r.status === 'ungueltig' || r.status === 'abgelaufen' || r.status === 'eingereicht') return { status: r.status };
  if (r.status !== 'offen') return { status: 'fehler' };
  const offen = Array.isArray(r.offen)
    ? r.offen.filter((f): f is AntragFeld => (ANTRAG_FELDER as readonly string[]).includes(String(f)))
    : [];
  const loesungen = Array.isArray(r.loesungen)
    ? r.loesungen.flatMap((l) => {
        const x = l as { id?: unknown; art?: unknown; anbieter?: unknown };
        return typeof x.id === 'string' && ['bav', 'avd', 'basis', 'privat'].includes(String(x.art))
          ? [{ id: x.id, art: x.art as LinkLoesung['art'], anbieter: typeof x.anbieter === 'string' ? x.anbieter : '' }]
          : [];
      })
    : [];
  return { status: 'offen', offen, bis: typeof r.bis === 'string' ? r.bis : '', loesungen };
}

export async function antragLinkPruefen(code: string): Promise<LinkPruefung> {
  if (!supabase || !ANTRAG_CODE.test(code)) return { status: 'ungueltig' };
  const { data, error } = await supabase.rpc('antrag_link_pruefen', { p_code: code });
  if (error) return { status: 'fehler' };
  return pruefungAus(data);
}

export type EinreichenAntwort = 'ok' | 'ungueltig' | 'abgelaufen' | 'eingereicht' | 'angaben' | 'ausweis' | 'fehler';

export async function antragEinreichen(code: string, eingang: AntragEingang): Promise<EinreichenAntwort> {
  if (!supabase || !ANTRAG_CODE.test(code)) return 'ungueltig';
  const { data, error } = await supabase.rpc('antrag_einreichen', { p_code: code, p_angaben: eingang });
  if (error) return 'fehler';
  return (['ok', 'ungueltig', 'abgelaufen', 'eingereicht', 'angaben', 'ausweis'] as const)
    .find((x) => x === data) ?? 'fehler';
}

/** Der Kunde nimmt eine Kopie zurück — nur, solange sein Link offen ist. */
export async function kundeAusweisEntfernen(code: string, pfad: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.functions.invoke('antrag-dokumente', {
    body: { aktion: 'entfernen', code: code.toLowerCase(), pfad },
  });
  return !error;
}
