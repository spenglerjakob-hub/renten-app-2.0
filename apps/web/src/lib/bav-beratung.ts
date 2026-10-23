import {
  angebotLesen, beratungLesen, type BeratungDaten, type BeratungStatus, type FirmenAngebot,
} from '@renten/schema';
import { supabase } from './supabase';
import { zufallsname } from './check';

/**
 * bAV-Mitarbeiterberatung im Konto: Firmen (`bav_firmen`), Beratungen
 * (`bav_beratungen`) und Firmenlogos (Bucket `bav-firmenlogos`), Migration
 * 20261021120000.
 *
 * Gesehen wird nur, was dem angemeldeten Berater gehoert — das regelt die
 * Datenbank (Row Level Security). Gelesenes JSON geht durch das Schema
 * (`angebotLesen`, `beratungLesen`): Was nicht passt, bekommt seine Vorgabe.
 *
 * Ein Logo liegt unter <Nutzer-ID>/<Firma>-<24 hex>.png|webp. Ein neues
 * bekommt einen neuen Namen — die Policies erlauben kein Ueberschreiben.
 *
 * Die Unterschrift am Bildschirm (Migration 20261023120000): Bei der ersten
 * Unterschrift werden die Unterlagen festgeschrieben (`bav_unterlagen`), die
 * Unterschriften stehen in `bav_unterschriften`. Geaendert wird dort nichts,
 * nur als Ganzes geloescht.
 */
export const FIRMENLOGO_BUCKET = 'bav-firmenlogos';

export interface Firma {
  id: string;
  name: string;
  angebot: FirmenAngebot;
  /** Pfad im Bucket, oder null */
  logoPfad: string | null;
  geaendertAm: string;
}

export interface Beratung {
  id: string;
  firma: string;
  mitarbeiter: string;
  status: BeratungStatus;
  /** JJJJ-MM-TT, oder null */
  beratenAm: string | null;
  daten: BeratungDaten;
  geaendertAm: string;
}

/** Stand der Beratungen einer Firma — fuer die Liste. */
export type Stand = Record<BeratungStatus, number>;

export type UnterschriftPerson = 'mitarbeiter' | 'berater';
export type UnterlagenArt = 'protokoll' | 'vereinbarung' | 'verzicht';

export interface Unterschrift {
  person: UnterschriftPerson;
  name: string;
  /** Der Linienzug als SVG-Pfad */
  zug: string;
  /** Welche Unterlagen sie abdeckt — von der Datenbank gesetzt */
  dokumente: UnterlagenArt[];
  /** Zeitpunkt der Datenbank */
  unterschriebenAm: string;
}

/** Die festgeschriebenen Unterlagen einer Beratung — ohne das HTML, das kommt erst zum Drucken. */
export interface Unterlagen {
  beratung: string;
  erstelltAm: string;
  /** SHA-256 je Dokument, von der Datenbank gerechnet */
  pruefsummen: Partial<Record<UnterlagenArt, string>>;
  unterschriften: Unterschrift[];
}

const FIRMA_SPALTEN = 'id, name, angebot, logo, geaendert_am';
const BERATUNG_SPALTEN = 'id, firma, mitarbeiter, status, beraten_am, daten, geaendert_am';

interface FirmaZeile { id: string; name: string; angebot: unknown; logo: string | null; geaendert_am: string }
interface BeratungZeile {
  id: string; firma: string; mitarbeiter: string; status: string; beraten_am: string | null; daten: unknown; geaendert_am: string;
}

const firmaAus = (z: FirmaZeile): Firma => ({
  id: z.id, name: z.name, angebot: angebotLesen(z.angebot),
  logoPfad: typeof z.logo === 'string' && z.logo !== '' ? z.logo : null,
  geaendertAm: z.geaendert_am,
});

const STATUS: readonly BeratungStatus[] = ['offen', 'teilnahme', 'verzicht'];
const statusAus = (s: string): BeratungStatus => (STATUS as readonly string[]).includes(s) ? s as BeratungStatus : 'offen';

const beratungAus = (z: BeratungZeile): Beratung => ({
  id: z.id, firma: z.firma, mitarbeiter: z.mitarbeiter, status: statusAus(z.status),
  beratenAm: z.beraten_am, daten: beratungLesen(z.daten), geaendertAm: z.geaendert_am,
});

async function nutzerId(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Laufende Speicherungen von Beratungen. Wer danach Beratungen liest, wartet
 * auf sie — so zeigt die Liste nach „Zurueck“ den neuen Stand, auch wenn die
 * Beratung erst beim Verlassen gespeichert wurde.
 */
const laufend = new Set<Promise<boolean>>();
const laufendeAbwarten = () => Promise.allSettled([...laufend]);
/** Vor dem Festschreiben: Keine aeltere Speicherung darf den neuesten Stand noch ueberholen. */
export const speicherungenAbwarten = laufendeAbwarten;

/** Ein Name auf die Grenze der Datenbank gekappt — leer wird er abgewiesen. */
const name120 = (s: string) => s.trim().slice(0, 120);

// --- Firmen --------------------------------------------------------------

export async function firmenLaden(): Promise<Firma[] | 'fehler'> {
  if (!supabase) return 'fehler';
  try {
    const { data, error } = await supabase.from('bav_firmen').select(FIRMA_SPALTEN).order('name');
    return error ? 'fehler' : (data as FirmaZeile[]).map(firmaAus);
  } catch {
    return 'fehler';
  }
}

/** null: gibt es nicht (oder nicht fuer dieses Konto). */
export async function firmaLaden(id: string): Promise<Firma | null | 'fehler'> {
  if (!supabase) return 'fehler';
  try {
    const { data, error } = await supabase.from('bav_firmen').select(FIRMA_SPALTEN).eq('id', id).maybeSingle();
    if (error) return 'fehler';
    return data ? firmaAus(data as FirmaZeile) : null;
  } catch {
    return 'fehler';
  }
}

/** 'grenze': hoechstens 200 Firmen je Konto. */
export async function firmaAnlegen(name: string, angebot: FirmenAngebot): Promise<Firma | 'fehler' | 'grenze'> {
  if (!supabase || name120(name) === '') return 'fehler';
  try {
    const { data, error } = await supabase.from('bav_firmen')
      .insert({ name: name120(name), angebot })
      .select(FIRMA_SPALTEN).single();
    if (error) return error.code === '23514' && /200 Firmen/.test(error.message) ? 'grenze' : 'fehler';
    return firmaAus(data as FirmaZeile);
  } catch {
    return 'fehler';
  }
}

export async function firmaSpeichern(f: Pick<Firma, 'id' | 'name' | 'angebot' | 'logoPfad'>): Promise<boolean> {
  if (!supabase || name120(f.name) === '') return false;
  try {
    const { error } = await supabase.from('bav_firmen')
      .update({ name: name120(f.name), angebot: f.angebot, logo: f.logoPfad })
      .eq('id', f.id);
    return !error;
  } catch {
    return false;
  }
}

/** Firma, ihre Beratungen (Kaskade) und ihre Logos entfernen. */
export async function firmaLoeschen(id: string): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('bav_firmen').delete().eq('id', id);
    if (error) return false;
  } catch {
    return false;
  }
  await firmenlogosAufraeumen(id, null);
  return true;
}

/** Wie viele Beratungen je Firma offen, mit Teilnahme oder mit Verzicht sind. */
export async function staendeLaden(): Promise<Record<string, Stand> | 'fehler'> {
  if (!supabase) return 'fehler';
  await laufendeAbwarten();
  try {
    const { data, error } = await supabase.from('bav_beratungen').select('firma, status');
    if (error) return 'fehler';
    const stand: Record<string, Stand> = {};
    for (const z of data as { firma: string; status: string }[]) {
      const s = (stand[z.firma] ??= { offen: 0, teilnahme: 0, verzicht: 0 });
      s[statusAus(z.status)] += 1;
    }
    return stand;
  } catch {
    return 'fehler';
  }
}

// --- Beratungen ----------------------------------------------------------

export async function beratungenLaden(firma: string): Promise<Beratung[] | 'fehler'> {
  if (!supabase) return 'fehler';
  await laufendeAbwarten();
  try {
    const { data, error } = await supabase.from('bav_beratungen').select(BERATUNG_SPALTEN)
      .eq('firma', firma).order('erstellt_am');
    return error ? 'fehler' : (data as BeratungZeile[]).map(beratungAus);
  } catch {
    return 'fehler';
  }
}

export async function beratungLaden(id: string): Promise<Beratung | null | 'fehler'> {
  if (!supabase) return 'fehler';
  await laufendeAbwarten();
  try {
    const { data, error } = await supabase.from('bav_beratungen').select(BERATUNG_SPALTEN).eq('id', id).maybeSingle();
    if (error) return 'fehler';
    return data ? beratungAus(data as BeratungZeile) : null;
  } catch {
    return 'fehler';
  }
}

export async function beratungAnlegen(firma: string, daten: BeratungDaten): Promise<Beratung | 'fehler'> {
  if (!supabase) return 'fehler';
  try {
    const { data, error } = await supabase.from('bav_beratungen')
      .insert({ firma, mitarbeiter: name120(daten.angaben.name), status: daten.entscheidung.status, daten })
      .select(BERATUNG_SPALTEN).single();
    return error ? 'fehler' : beratungAus(data as BeratungZeile);
  } catch {
    return 'fehler';
  }
}

/**
 * Name und Status stehen zusaetzlich in eigenen Spalten — fuer Liste und
 * Uebersicht. Sie kommen immer aus den Daten, damit beides nie auseinanderlaeuft.
 */
export function beratungSpeichern(id: string, daten: BeratungDaten): Promise<boolean> {
  const db = supabase;
  if (!db) return Promise.resolve(false);
  const status = daten.entscheidung.status;
  const beratenAm = status === 'offen' ? null : isoAusDe(daten.entscheidung.datum) ?? new Date().toISOString().slice(0, 10);
  const speichern = (async () => {
    try {
      const { error } = await db.from('bav_beratungen')
        .update({ mitarbeiter: name120(daten.angaben.name), status, beraten_am: beratenAm, daten })
        .eq('id', id);
      return !error;
    } catch {
      return false;
    }
  })();
  laufend.add(speichern);
  void speichern.finally(() => laufend.delete(speichern));
  return speichern;
}

export async function beratungLoeschen(id: string): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('bav_beratungen').delete().eq('id', id);
    return !error;
  } catch {
    return false;
  }
}

/** TT.MM.JJJJ → JJJJ-MM-TT, oder null. */
export function isoAusDe(de: string): string | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(de);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

// --- Firmenlogos ---------------------------------------------------------

export type LogoFehler = 'zu-gross' | 'typ' | 'fehler';

/** Liefert den Pfad des neuen Logos. Die Firma muss schon gespeichert sein (Policy). */
export async function firmenlogoHochladen(firma: string, blob: Blob): Promise<string | LogoFehler> {
  const id = await nutzerId();
  if (!supabase || !id) return 'fehler';
  const endung = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : null;
  if (!endung) return 'typ';
  const pfad = `${id}/${firma}-${zufallsname()}.${endung}`;
  try {
    const { error } = await supabase.storage.from(FIRMENLOGO_BUCKET).upload(pfad, blob, {
      contentType: blob.type, upsert: false, cacheControl: '31536000',
    });
    if (!error) return pfad;
    const e = error as { status?: number; statusCode?: string; code?: string };
    const status = Number(e.statusCode) || e.status;
    if (status === 413 || e.code === 'EntityTooLarge') return 'zu-gross';
    if (status === 415 || e.code === 'InvalidMimeType') return 'typ';
    return 'fehler';
  } catch {
    return 'fehler';
  }
}

/** Das Logo zum Anzeigen und Drucken: als Object-URL, gelesen mit der eigenen Anmeldung. */
export async function firmenlogoLaden(pfad: string): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.storage.from(FIRMENLOGO_BUCKET).download(pfad);
    return error || !data ? null : URL.createObjectURL(data);
  } catch {
    return null;
  }
}

/** Die Logos einer Firma ausser `behalten` entfernen. Was hier nicht klappt, raeumt `konto-loeschen` ab. */
export async function firmenlogosAufraeumen(firma: string, behalten: string | null): Promise<void> {
  const id = await nutzerId();
  if (!supabase || !id) return;
  try {
    const { data } = await supabase.storage.from(FIRMENLOGO_BUCKET).list(id, { limit: 1000, search: firma });
    const weg = (data ?? [])
      .map((d) => `${id}/${d.name}`)
      .filter((p) => p.startsWith(`${id}/${firma}-`) && p !== behalten);
    if (weg.length > 0) await supabase.storage.from(FIRMENLOGO_BUCKET).remove(weg);
  } catch {
    /* naechstes Mal */
  }
}

// --- Unterschriften --------------------------------------------------------

const PERSONEN: readonly UnterschriftPerson[] = ['mitarbeiter', 'berater'];
const ARTEN: readonly UnterlagenArt[] = ['protokoll', 'vereinbarung', 'verzicht'];
const istPerson = (x: unknown): x is UnterschriftPerson => (PERSONEN as readonly unknown[]).includes(x);
const istArt = (x: unknown): x is UnterlagenArt => (ARTEN as readonly unknown[]).includes(x);

interface UnterschriftZeile { person: unknown; name: string; zug: string; dokumente: unknown; unterschrieben_am: string }
interface UnterlagenZeile { beratung: string; erstellt_am: string; pruefsummen: unknown; bav_unterschriften: UnterschriftZeile[] | null }

const unterschriftAus = (z: UnterschriftZeile): Unterschrift | null => (istPerson(z.person) ? {
  person: z.person, name: z.name, zug: z.zug,
  dokumente: Array.isArray(z.dokumente) ? z.dokumente.filter(istArt) : [],
  unterschriebenAm: z.unterschrieben_am,
} : null);

function unterlagenAus(z: UnterlagenZeile): Unterlagen {
  const p = z.pruefsummen && typeof z.pruefsummen === 'object' ? z.pruefsummen as Record<string, unknown> : {};
  const pruefsummen: Unterlagen['pruefsummen'] = {};
  for (const a of ARTEN) {
    const wert = p[a];
    if (typeof wert === 'string') pruefsummen[a] = wert;
  }
  const unterschriften = (z.bav_unterschriften ?? [])
    .map(unterschriftAus)
    .filter((u): u is Unterschrift => u !== null)
    .sort((a, b) => PERSONEN.indexOf(a.person) - PERSONEN.indexOf(b.person));
  return { beratung: z.beratung, erstelltAm: z.erstellt_am, pruefsummen, unterschriften };
}

const UNTERLAGEN_SPALTEN = 'beratung, erstellt_am, pruefsummen, bav_unterschriften(person, name, zug, dokumente, unterschrieben_am)';

/** Der Stand der Unterschriften einer Beratung, ohne das HTML — null: nicht unterschrieben. */
export async function unterlagenLaden(beratung: string): Promise<Unterlagen | null | 'fehler'> {
  if (!supabase) return 'fehler';
  try {
    const { data, error } = await supabase.from('bav_unterlagen').select(UNTERLAGEN_SPALTEN).eq('beratung', beratung).maybeSingle();
    if (error) return 'fehler';
    return data ? unterlagenAus(data as unknown as UnterlagenZeile) : null;
  } catch {
    return 'fehler';
  }
}

/** Das festgeschriebene HTML eines Dokuments — erst zum Drucken geladen. */
export async function unterlageHtmlLaden(beratung: string, art: UnterlagenArt): Promise<string | null | 'fehler'> {
  if (!supabase) return 'fehler';
  try {
    const { data, error } = await supabase.from('bav_unterlagen').select(art).eq('beratung', beratung).maybeSingle();
    if (error) return 'fehler';
    const html = (data as Record<string, unknown> | null)?.[art];
    return typeof html === 'string' ? html : null;
  } catch {
    return 'fehler';
  }
}

/** Was bei der ersten Unterschrift festgeschrieben wird: das Protokoll und Vereinbarung oder Verzicht. */
export interface UnterlagenHtml { protokoll: string; vereinbarung?: string; verzicht?: string }

/**
 * Unterschreiben (RPC `bav_unterschreiben`). Gibt es noch keine
 * festgeschriebenen Unterlagen, schreibt die erste Unterschrift `unterlagen`
 * fest — in derselben Transaktion; spaeter bleibt `unterlagen` unbeachtet.
 * 'doppelt': Diese Person hat schon unterschrieben.
 */
export async function unterschreiben(
  beratung: string, person: UnterschriftPerson, name: string, zug: string, unterlagen: UnterlagenHtml | null,
): Promise<Unterschrift | 'doppelt' | 'fehler'> {
  if (!supabase) return 'fehler';
  try {
    const { data, error } = await supabase.rpc('bav_unterschreiben', {
      p_beratung: beratung, p_person: person, p_name: name120(name), p_zug: zug,
      p_protokoll: unterlagen?.protokoll ?? null,
      p_vereinbarung: unterlagen?.vereinbarung ?? null,
      p_verzicht: unterlagen?.verzicht ?? null,
    });
    if (error) return error.code === '23505' ? 'doppelt' : 'fehler';
    return (data && typeof data === 'object' ? unterschriftAus(data as UnterschriftZeile) : null) ?? 'fehler';
  } catch {
    return 'fehler';
  }
}

/** Die Unterschriften aufheben: Die Unterlagen werden geloescht, ihre Unterschriften gehen mit (Kaskade). */
export async function unterschriftenAufheben(beratung: string): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('bav_unterlagen').delete().eq('beratung', beratung);
    return !error;
  } catch {
    return false;
  }
}

/** Welche Beratungen einer Firma unterschrieben sind, mit den Personen — fuer die Liste. */
export async function unterschriebeneLaden(firma: string): Promise<Record<string, UnterschriftPerson[]> | 'fehler'> {
  if (!supabase) return 'fehler';
  try {
    const { data, error } = await supabase.from('bav_unterlagen')
      .select('beratung, bav_beratungen!inner(firma), bav_unterschriften(person)')
      .eq('bav_beratungen.firma', firma);
    if (error) return 'fehler';
    const stand: Record<string, UnterschriftPerson[]> = {};
    for (const z of data as unknown as { beratung: string; bav_unterschriften: { person: unknown }[] | null }[]) {
      stand[z.beratung] = (z.bav_unterschriften ?? []).map((u) => u.person).filter(istPerson);
    }
    return stand;
  } catch {
    return 'fehler';
  }
}
