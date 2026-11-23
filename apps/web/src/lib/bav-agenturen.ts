import { agenturDatenLesen, agenturRolleAus, type AgenturDaten, type AgenturRolle } from '@renten/schema';
import { supabase } from './supabase';
import { zufallsname } from './check';
import { useZugang } from '../store/zugang';

/**
 * Agenturen der bAV-Verwaltung — Datenzugriff.
 *
 * Die Verwaltung des Betreibers fuehrt Agenturen; jede hat Firmenkunden
 * (`bav_firmen.agentur`) und eigene Zugaenge, die ueber einen Einladungslink
 * entstehen. Tabellen und Funktionen: Migration 20261118120000_bav_agenturen.
 * Was wer sieht und darf, entscheidet dort die Datenbank — hier wird nur
 * gefragt.
 *
 * OHNE DIE MIGRATION (Test- und Live-Seite teilen die Datenbank, ausgeliefert
 * wird getrennt) gibt es die Tabelle nicht: `agenturenLaden` meldet dann
 * `'fehlt'`, und die Mitarbeiterberatung verhaelt sich wie bisher.
 *
 * ROLLEN UND AUFTRITT (Migration 20261119120000_bav_agentur_rollen) kommen
 * spaeter dazu. Ohne sie gibt es kein Logo der Agentur und keine Admins:
 * Gelesen wird dann ohne die Spalte `logo`, jeder Zugang ist ein Mitglied,
 * und eine Einladung mit Adminrechten laesst sich nicht erstellen.
 */

export interface Agentur {
  id: string;
  name: string;
  daten: AgenturDaten;
  /** Das Logo der Agentur: Pfad im Bucket der Firmenlogos, oder null */
  logoPfad: string | null;
  erstelltAm: string;
  geaendertAm: string;
}

/** Zugaenge und offene Einladungen einer Agentur — fuer die Uebersicht. */
export interface AgenturStand { zugaenge: number; einladungen: number }

export interface AgenturZugang {
  nutzer: string;
  email: string;
  seit: string;
  rolle: AgenturRolle;
  /** Der Name, den der Zugang als Berater eingetragen hat — leer, solange er es nicht getan hat */
  name: string;
  /** Das angemeldete Konto selbst */
  ich: boolean;
}
export interface AgenturEinladung { token: string; erstelltAm: string; gueltigBis: string; rolle: AgenturRolle }
export interface Verwalter { nutzer: string; email: string; seit: string }

export type VerwalterAntwort = 'ok' | 'kein_betreiber' | 'unbekannt' | 'agentur' | 'fehler';

interface AgenturZeile { id: string; name: string; daten: unknown; logo?: unknown; erstellt_am: string; geaendert_am: string }

const SPALTEN_ALT = 'id, name, daten, erstellt_am, geaendert_am';
const SPALTEN_NEU = `${SPALTEN_ALT}, logo`;
/** Kennt die Datenbank die Spalte `logo` schon? Nach der ersten Absage wird ohne sie gelesen. */
let mitLogo = true;
const spalten = () => (mitLogo ? SPALTEN_NEU : SPALTEN_ALT);
/** „Spalte gibt es nicht“ — von Postgres (42703) oder von der Schnittstelle (PGRST204). */
const ohneSpalte = (fehler: { code?: string } | null) => !!fehler && (fehler.code === '42703' || fehler.code === 'PGRST204');
const name120 = (s: string) => s.trim().slice(0, 120);
const text = (v: unknown) => (typeof v === 'string' ? v : '');

export const agenturAus = (z: AgenturZeile): Agentur => ({
  id: z.id, name: z.name, daten: agenturDatenLesen(z.daten),
  logoPfad: typeof z.logo === 'string' && z.logo !== '' ? z.logo : null,
  erstelltAm: z.erstellt_am, geaendertAm: z.geaendert_am,
});

/** Die Tabelle (oder Funktion) gibt es in dieser Datenbank noch nicht. */
const fehlt = (fehler: { code?: string } | null) =>
  !!fehler && (fehler.code === 'PGRST205' || fehler.code === '42P01' || fehler.code === 'PGRST202' || fehler.code === '42883');

/** Alle Agenturen, die das Konto sieht: die Verwaltung alle, ein Mitglied die eigene. */
export async function agenturenLaden(): Promise<Agentur[] | 'fehler' | 'fehlt'> {
  if (!supabase) return 'fehler';
  try {
    let { data, error } = await supabase.from('bav_agenturen').select(spalten()).order('name');
    if (mitLogo && ohneSpalte(error)) {
      mitLogo = false;
      ({ data, error } = await supabase.from('bav_agenturen').select(spalten()).order('name'));
    }
    if (error) return fehlt(error) ? 'fehlt' : 'fehler';
    return (data as unknown as AgenturZeile[]).map(agenturAus);
  } catch {
    return 'fehler';
  }
}

/** null: gibt es nicht (oder nicht fuer dieses Konto). */
export async function agenturLaden(id: string): Promise<Agentur | null | 'fehler'> {
  if (!supabase) return 'fehler';
  try {
    let { data, error } = await supabase.from('bav_agenturen').select(spalten()).eq('id', id).maybeSingle();
    if (mitLogo && ohneSpalte(error)) {
      mitLogo = false;
      ({ data, error } = await supabase.from('bav_agenturen').select(spalten()).eq('id', id).maybeSingle());
    }
    if (error) return fehlt(error) ? null : 'fehler';
    return data ? agenturAus(data as unknown as AgenturZeile) : null;
  } catch {
    return 'fehler';
  }
}

/**
 * Die Agentur, zu der das angemeldete Konto gehoert — null bei allen anderen
 * (auch bei der Verwaltung) und wenn sie gerade nicht zu laden ist. Ihre
 * Daten belegen jede Firma vor, die ein Zugang der Agentur anlegt.
 */
export async function meineAgentur(): Promise<Agentur | null> {
  const id = useZugang.getState().zugang?.agentur ?? null;
  if (!id) return null;
  const a = await agenturLaden(id);
  return a && a !== 'fehler' ? a : null;
}

export async function agenturAnlegen(name: string, daten: AgenturDaten): Promise<Agentur | 'fehler'> {
  if (!supabase || name120(name) === '') return 'fehler';
  try {
    // Ohne `logo` in der Antwort: Eine neue Agentur hat keins, und so geht es auch vor der Migration der Rollen.
    const { data, error } = await supabase.from('bav_agenturen').insert({ name: name120(name), daten }).select(SPALTEN_ALT).single();
    return error ? 'fehler' : agenturAus(data as AgenturZeile);
  } catch {
    return 'fehler';
  }
}

/**
 * Name und Daten speichern — die Verwaltung jede Agentur, ein Admin die
 * eigene. `logoPfad`: weggelassen = unveraendert, null = entfernen, Pfad =
 * das neue Logo (vorher mit `agenturLogoHochladen` hochgeladen).
 */
export async function agenturSpeichern(a: Pick<Agentur, 'id' | 'name' | 'daten'> & { logoPfad?: string | null }): Promise<boolean> {
  if (!supabase || name120(a.name) === '') return false;
  try {
    const { data, error } = await supabase.from('bav_agenturen')
      .update({ name: name120(a.name), daten: a.daten, ...(a.logoPfad !== undefined ? { logo: a.logoPfad } : {}) })
      .eq('id', a.id).select('id');
    return !error && (data ?? []).length > 0;
  } catch {
    return false;
  }
}

// --- Das Logo der Agentur ---------------------------------------------------

/** Derselbe private Bucket wie die Firmenlogos — eigene Regeln, eigenes Namensmuster. */
const LOGO_BUCKET = 'bav-firmenlogos';

export type AgenturLogoFehler = 'zu-gross' | 'typ' | 'fehler';

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
 * Laedt ein Logo fuer die Agentur hoch und liefert seinen Pfad:
 * <eigene ID>/agentur-<Agentur>-<24 hex>.png|webp. Ein neues Logo bekommt
 * einen neuen Namen — die Regeln erlauben kein Ueberschreiben.
 */
export async function agenturLogoHochladen(agentur: string, blob: Blob): Promise<string | AgenturLogoFehler> {
  const id = await nutzerId();
  if (!supabase || !id) return 'fehler';
  const endung = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : null;
  if (!endung) return 'typ';
  const pfad = `${id}/agentur-${agentur}-${zufallsname()}.${endung}`;
  try {
    const { error } = await supabase.storage.from(LOGO_BUCKET).upload(pfad, blob, {
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
export async function agenturLogoLaden(pfad: string): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.storage.from(LOGO_BUCKET).download(pfad);
    return error || !data ? null : URL.createObjectURL(data);
  } catch {
    return null;
  }
}

/**
 * Die eigenen, nicht mehr gebrauchten Logos der Agentur entfernen. Was ein
 * anderer hochgeladen hat, liegt in dessen Ordner und bleibt dort.
 */
export async function agenturLogosAufraeumen(agentur: string, behalten: string | null): Promise<void> {
  const id = await nutzerId();
  if (!supabase || !id) return;
  try {
    const { data } = await supabase.storage.from(LOGO_BUCKET).list(id, { limit: 1000, search: `agentur-${agentur}` });
    const weg = (data ?? [])
      .map((d) => `${id}/${d.name}`)
      .filter((p) => p.startsWith(`${id}/agentur-${agentur}-`) && p !== behalten);
    if (weg.length > 0) await supabase.storage.from(LOGO_BUCKET).remove(weg);
  } catch {
    /* naechstes Mal */
  }
}

/** 'firmen': Die Agentur hat noch Firmen — erst wenn keine mehr da ist, laesst sie sich loeschen. */
export async function agenturLoeschen(id: string): Promise<'ok' | 'firmen' | 'fehler'> {
  if (!supabase) return 'fehler';
  try {
    const { data, error } = await supabase.from('bav_agenturen').delete().eq('id', id).select('id');
    if (error) return error.code === '23503' ? 'firmen' : 'fehler';
    return (data ?? []).length > 0 ? 'ok' : 'fehler';
  } catch {
    return 'fehler';
  }
}

/** Zugaenge und offene Einladungen je Agentur — leer, wenn die Antwort ausbleibt. */
export async function agenturenStandLaden(): Promise<Record<string, AgenturStand>> {
  if (!supabase) return {};
  try {
    const { data, error } = await supabase.rpc('bav_agenturen_stand');
    if (error || !Array.isArray(data)) return {};
    const stand: Record<string, AgenturStand> = {};
    for (const z of data as { agentur?: unknown; zugaenge?: unknown; einladungen?: unknown }[]) {
      if (typeof z.agentur === 'string') stand[z.agentur] = { zugaenge: Number(z.zugaenge) || 0, einladungen: Number(z.einladungen) || 0 };
    }
    return stand;
  } catch {
    return {};
  }
}

// --- Zugaenge und Einladungen ---------------------------------------------

export async function zugaengeLaden(agentur: string): Promise<AgenturZugang[] | 'fehler'> {
  if (!supabase) return 'fehler';
  try {
    const { data, error } = await supabase.rpc('bav_agentur_mitglieder', { p_agentur: agentur });
    if (error || !Array.isArray(data)) return 'fehler';
    return (data as Record<string, unknown>[]).map(zugangAus);
  } catch {
    return 'fehler';
  }
}

/** Eine Zeile von `bav_agentur_mitglieder` — vor der Migration der Rollen ohne Rolle, Name und „ich“. */
export const zugangAus = (z: Record<string, unknown>): AgenturZugang => ({
  nutzer: text(z.nutzer), email: text(z.email), seit: text(z.seit),
  rolle: agenturRolleAus(z.rolle), name: text(z.name).trim(), ich: z.ich === true,
});

/** Adminrechte geben oder nehmen — nur die Verwaltung. */
export async function rolleSetzen(nutzer: string, rolle: AgenturRolle): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data, error } = await supabase.rpc('bav_agentur_rolle_setzen', { p_nutzer: nutzer, p_rolle: rolle });
    return !error && data === true;
  } catch {
    return false;
  }
}

/** Entfernt den Zugang; seine Firmen in der Agentur gehen samt Beratungen an den, der ihn entfernt. */
export async function zugangEntfernen(nutzer: string): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data, error } = await supabase.rpc('bav_agentur_mitglied_entfernen', { p_nutzer: nutzer });
    return !error && data === true;
  } catch {
    return false;
  }
}

export async function einladungenLaden(agentur: string): Promise<AgenturEinladung[] | 'fehler'> {
  if (!supabase) return 'fehler';
  try {
    const { data, error } = await supabase.rpc('bav_agentur_einladungen', { p_agentur: agentur });
    if (error || !Array.isArray(data)) return 'fehler';
    return (data as Record<string, unknown>[]).map((z) => ({
      token: text(z.token), erstelltAm: text(z.erstellt_am), gueltigBis: text(z.gueltig_bis), rolle: agenturRolleAus(z.rolle),
    }));
  } catch {
    return 'fehler';
  }
}

/**
 * Ein neuer Link — einmal einloesbar, 14 Tage gueltig. Mit `admin` bekommt,
 * wer ihn einloest, Adminrechte. null: hat nicht geklappt. 'ohne-rollen': Die
 * Datenbank kennt noch keine Rollen — ein Link fuer ein Mitglied geht dann
 * trotzdem, einer mit Adminrechten nicht.
 */
export async function einladungErstellen(agentur: string, rolle: AgenturRolle = 'mitglied'): Promise<string | null | 'ohne-rollen'> {
  if (!supabase) return null;
  try {
    let { data, error } = await supabase.rpc('bav_agentur_einladung_erstellen', { p_agentur: agentur, p_rolle: rolle });
    if (fehlt(error)) {
      if (rolle === 'admin') return 'ohne-rollen';
      ({ data, error } = await supabase.rpc('bav_agentur_einladung_erstellen', { p_agentur: agentur }));
    }
    return !error && typeof data === 'string' ? data : null;
  } catch {
    return null;
  }
}

export async function einladungZurueckziehen(token: string): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data, error } = await supabase.rpc('bav_agentur_einladung_zurueckziehen', { p_token: token });
    return !error && data === true;
  } catch {
    return false;
  }
}

// --- Die Verwaltung benennen — nur der Betreiber ---------------------------

export async function verwalterLaden(): Promise<Verwalter[] | 'fehler'> {
  if (!supabase) return 'fehler';
  try {
    const { data, error } = await supabase.rpc('bav_verwalter');
    if (error || !Array.isArray(data)) return 'fehler';
    return (data as Record<string, unknown>[]).map((z) => ({ nutzer: text(z.nutzer), email: text(z.email), seit: text(z.seit) }));
  } catch {
    return 'fehler';
  }
}

export const verwalterAntwortAus = (roh: unknown): VerwalterAntwort =>
  roh === 'ok' || roh === 'kein_betreiber' || roh === 'unbekannt' || roh === 'agentur' ? roh : 'fehler';

export async function verwalterBenennen(email: string): Promise<VerwalterAntwort> {
  if (!supabase) return 'fehler';
  try {
    const { data, error } = await supabase.rpc('bav_verwalter_benennen', { p_email: email.trim() });
    return error ? 'fehler' : verwalterAntwortAus(data);
  } catch {
    return 'fehler';
  }
}

export async function verwalterEntfernen(nutzer: string): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data, error } = await supabase.rpc('bav_verwalter_entfernen', { p_nutzer: nutzer });
    return !error && data === true;
  } catch {
    return false;
  }
}
