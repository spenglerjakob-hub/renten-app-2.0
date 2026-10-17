import { supabase } from './supabase';
import { zufallsname } from './check';
import { GRENZEN, farbeNormal, type Auftritt, type AuftrittText } from '../features/auftritt';

/**
 * „Ihr Auftritt im Gutachten“ im Konto: die Zeile in `berater_profil` und das
 * Logo im privaten Bucket `branding` (Migration 20261017120000).
 *
 * Das Logo liegt unter <Nutzer-ID>/logo-<24 hex>.png|webp. Ein neues Logo
 * bekommt einen neuen Namen — die Policies erlauben kein Ueberschreiben, und
 * so zeigt kein Zwischenspeicher ein altes Logo. Alte Dateien entfernt der
 * Browser selbst (`logosAufraeumen`); mehr als drei laesst die Policy nicht zu.
 */
export const BRANDING_BUCKET = 'branding';

export type Angaben = Omit<Auftritt, 'logo'>;

export interface Profil {
  angaben: Angaben;
  /** Pfad im Bucket, oder null */
  logoPfad: string | null;
}

const SPALTEN = 'firma, berater, telefon, email, web, zusatz, farbe, logo';
const TEXTE: AuftrittText[] = ['firma', 'berater', 'telefon', 'email', 'web', 'zusatz'];

type Zeile = Record<AuftrittText, string> & { farbe: string | null; logo: string | null };

async function nutzerId(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    return null;
  }
}

/** Texte auf die Grenzen der Datenbank gekappt — sonst lehnte sie die ganze Zeile ab. */
function gekappt(a: Angaben): Record<AuftrittText, string> {
  return Object.fromEntries(
    TEXTE.map((k) => [k, (a[k] ?? '').trim().slice(0, GRENZEN[k])]),
  ) as Record<AuftrittText, string>;
}

/** null: noch keine Zeile — 'fehler': nicht erreichbar. */
export async function profilLaden(): Promise<Profil | null | 'fehler'> {
  if (!supabase) return 'fehler';
  try {
    const { data, error } = await supabase.from('berater_profil').select(SPALTEN).maybeSingle();
    if (error) return 'fehler';
    if (!data) return null;
    const z = data as unknown as Zeile;
    const angaben = Object.fromEntries(TEXTE.map((k) => [k, typeof z[k] === 'string' ? z[k] : ''])) as Record<AuftrittText, string>;
    return {
      angaben: { ...angaben, farbe: farbeNormal(z.farbe) },
      logoPfad: typeof z.logo === 'string' && z.logo !== '' ? z.logo : null,
    };
  } catch {
    return 'fehler';
  }
}

export async function profilSpeichern(angaben: Angaben, logoPfad: string | null): Promise<boolean> {
  const id = await nutzerId();
  if (!supabase || !id) return false;
  try {
    const { error } = await supabase.from('berater_profil').upsert(
      { besitzer: id, ...gekappt(angaben), farbe: farbeNormal(angaben.farbe), logo: logoPfad },
      { onConflict: 'besitzer' },
    );
    return !error;
  } catch {
    return false;
  }
}

export type HochladenFehler = 'zu-gross' | 'typ' | 'fehler';

/** Liefert den Pfad des neuen Logos. */
export async function logoHochladen(blob: Blob): Promise<string | HochladenFehler> {
  const id = await nutzerId();
  if (!supabase || !id) return 'fehler';
  const endung = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : null;
  if (!endung) return 'typ';
  const pfad = `${id}/logo-${zufallsname()}.${endung}`;
  try {
    const { error } = await supabase.storage.from(BRANDING_BUCKET).upload(pfad, blob, {
      contentType: blob.type,
      upsert: false,
      // Jeder Name kommt nur einmal vor — lange zwischenspeichern ist unbedenklich.
      cacheControl: '31536000',
    });
    if (!error) return pfad;
    // Wie bei den Unterlagen: Der Speicher antwortet mit HTTP 400 und dem eigentlichen Code im Text.
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
export async function logoLaden(pfad: string): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.storage.from(BRANDING_BUCKET).download(pfad);
    return error || !data ? null : URL.createObjectURL(data);
  } catch {
    return null;
  }
}

/** Alle eigenen Dateien ausser `behalten` entfernen. Was hier nicht klappt, versucht das naechste Speichern. */
export async function logosAufraeumen(behalten: string | null): Promise<void> {
  const id = await nutzerId();
  if (!supabase || !id) return;
  try {
    const { data } = await supabase.storage.from(BRANDING_BUCKET).list(id, { limit: 100 });
    const weg = (data ?? []).map((d) => `${id}/${d.name}`).filter((p) => p !== behalten);
    if (weg.length > 0) await supabase.storage.from(BRANDING_BUCKET).remove(weg);
  } catch {
    /* naechstes Mal */
  }
}

/** Zeile und Logo entfernen. */
export async function profilEntfernen(): Promise<boolean> {
  const id = await nutzerId();
  if (!supabase || !id) return false;
  try {
    const { error } = await supabase.from('berater_profil').delete().eq('besitzer', id);
    if (error) return false;
  } catch {
    return false;
  }
  await logosAufraeumen(null);
  return true;
}
