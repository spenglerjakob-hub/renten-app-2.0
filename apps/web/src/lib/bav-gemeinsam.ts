import { supabase } from './supabase';

/**
 * bAV-Mitarbeiterberatung: Firmen im Buero gemeinsam beraten (Migration
 * 20261027160000). Wer eine Firma angelegt hat, gibt sie fuer sein Buero frei
 * („Abo & Team“); dann sehen und bearbeiten alle Kollegen im Buero alle
 * Beratungen der Firma, das Angebot pflegt weiter er allein.
 *
 * Duenne Huellen um die Funktionen der Datenbank, wie `team.ts` fuer das
 * Buero. Wer was darf, pruefen die Funktionen selbst (freigeben nur, wer die
 * Firma angelegt hat); hier wird nur uebersetzt.
 */

export interface Kollege {
  nutzer: string;
  /** Aus „Ihr Auftritt“, sonst die E-Mail-Adresse */
  name: string;
  /** Die Agentur aus „Ihr Auftritt“, oder leer */
  agentur: string;
  /** Wer das Buero fuehrt (das Abo verwaltet) oder Mitglied */
  rolle: 'inhaber' | 'mitglied';
  /** Der angemeldete Berater selbst */
  ich: boolean;
}

export type FreigabeAntwort = 'ok' | 'kein_buero' | 'fehler';

const text = (v: unknown) => (typeof v === 'string' ? v : '');

export function kollegeAus(z: Record<string, unknown>): Kollege {
  return {
    nutzer: text(z.nutzer),
    name: text(z.name),
    agentur: text(z.agentur),
    rolle: z.rolle === 'inhaber' ? 'inhaber' : 'mitglied',
    ich: z.ich === true,
  };
}

/** Die Antwort von `bav_firma_freigeben` — Unbekanntes gilt als Fehler. */
export const freigabeAntwortAus = (roh: unknown): FreigabeAntwort =>
  (roh === 'ok' || roh === 'kein_buero' ? roh : 'fehler');

/** Der Name eines Kollegen — null, wenn er nicht (mehr) im Buero ist. */
export const kollegenName = (kollegen: readonly Kollege[], nutzer: string): string | null =>
  kollegen.find((k) => k.nutzer === nutzer)?.name || null;

/** Die Mitglieder des eigenen Bueros, man selbst eingeschlossen — ohne Buero leer. */
export async function kollegenLaden(): Promise<Kollege[] | 'fehler'> {
  if (!supabase) return 'fehler';
  try {
    const { data, error } = await supabase.rpc('bav_kollegen');
    if (error || !Array.isArray(data)) return 'fehler';
    return (data as Record<string, unknown>[]).map(kollegeAus);
  } catch {
    return 'fehler';
  }
}

/**
 * Freigeben oder die Freigabe beenden. Endet sie, gehen die Beratungen der
 * Kollegen in dieser Firma an den, der sie angelegt hat.
 */
export async function firmaFreigeben(firma: string, an: boolean): Promise<FreigabeAntwort> {
  if (!supabase) return 'fehler';
  try {
    const { data, error } = await supabase.rpc('bav_firma_freigeben', { p_firma: firma, p_freigeben: an });
    return error ? 'fehler' : freigabeAntwortAus(data);
  } catch {
    return 'fehler';
  }
}
