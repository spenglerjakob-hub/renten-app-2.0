import { agenturDatenLesen, type AgenturDaten } from '@renten/schema';
import { supabase } from './supabase';
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
 */

export interface Agentur {
  id: string;
  name: string;
  daten: AgenturDaten;
  erstelltAm: string;
  geaendertAm: string;
}

/** Zugaenge und offene Einladungen einer Agentur — fuer die Uebersicht. */
export interface AgenturStand { zugaenge: number; einladungen: number }

export interface AgenturZugang { nutzer: string; email: string; seit: string }
export interface AgenturEinladung { token: string; erstelltAm: string; gueltigBis: string }
export interface Verwalter { nutzer: string; email: string; seit: string }

export type VerwalterAntwort = 'ok' | 'kein_betreiber' | 'unbekannt' | 'agentur' | 'fehler';

interface AgenturZeile { id: string; name: string; daten: unknown; erstellt_am: string; geaendert_am: string }

const SPALTEN = 'id, name, daten, erstellt_am, geaendert_am';
const name120 = (s: string) => s.trim().slice(0, 120);
const text = (v: unknown) => (typeof v === 'string' ? v : '');

export const agenturAus = (z: AgenturZeile): Agentur => ({
  id: z.id, name: z.name, daten: agenturDatenLesen(z.daten), erstelltAm: z.erstellt_am, geaendertAm: z.geaendert_am,
});

/** Die Tabelle (oder Funktion) gibt es in dieser Datenbank noch nicht. */
const fehlt = (fehler: { code?: string } | null) =>
  !!fehler && (fehler.code === 'PGRST205' || fehler.code === '42P01' || fehler.code === 'PGRST202' || fehler.code === '42883');

/** Alle Agenturen, die das Konto sieht: die Verwaltung alle, ein Mitglied die eigene. */
export async function agenturenLaden(): Promise<Agentur[] | 'fehler' | 'fehlt'> {
  if (!supabase) return 'fehler';
  try {
    const { data, error } = await supabase.from('bav_agenturen').select(SPALTEN).order('name');
    if (error) return fehlt(error) ? 'fehlt' : 'fehler';
    return (data as AgenturZeile[]).map(agenturAus);
  } catch {
    return 'fehler';
  }
}

/** null: gibt es nicht (oder nicht fuer dieses Konto). */
export async function agenturLaden(id: string): Promise<Agentur | null | 'fehler'> {
  if (!supabase) return 'fehler';
  try {
    const { data, error } = await supabase.from('bav_agenturen').select(SPALTEN).eq('id', id).maybeSingle();
    if (error) return fehlt(error) ? null : 'fehler';
    return data ? agenturAus(data as AgenturZeile) : null;
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
    const { data, error } = await supabase.from('bav_agenturen').insert({ name: name120(name), daten }).select(SPALTEN).single();
    return error ? 'fehler' : agenturAus(data as AgenturZeile);
  } catch {
    return 'fehler';
  }
}

export async function agenturSpeichern(a: Pick<Agentur, 'id' | 'name' | 'daten'>): Promise<boolean> {
  if (!supabase || name120(a.name) === '') return false;
  try {
    const { data, error } = await supabase.from('bav_agenturen')
      .update({ name: name120(a.name), daten: a.daten }).eq('id', a.id).select('id');
    return !error && (data ?? []).length > 0;
  } catch {
    return false;
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
    return (data as Record<string, unknown>[]).map((z) => ({ nutzer: text(z.nutzer), email: text(z.email), seit: text(z.seit) }));
  } catch {
    return 'fehler';
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
      token: text(z.token), erstelltAm: text(z.erstellt_am), gueltigBis: text(z.gueltig_bis),
    }));
  } catch {
    return 'fehler';
  }
}

/** Ein neuer Link — einmal einloesbar, 14 Tage gueltig. null: hat nicht geklappt. */
export async function einladungErstellen(agentur: string): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc('bav_agentur_einladung_erstellen', { p_agentur: agentur });
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
