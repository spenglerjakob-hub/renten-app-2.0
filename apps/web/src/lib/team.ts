import { supabase } from './supabase';
import type { Rolle } from '../store/zugang';

/**
 * Das Buero: Mitglieder, Einladungen, Austreten — duenne Huellen um die
 * Funktionen der Datenbank (Migration …_abo.sql). Wer was darf, pruefen
 * die Funktionen selbst (nur der Inhaber laedt ein und entfernt, nur
 * Mitglieder treten aus); hier wird nur uebersetzt.
 */

export interface Mitglied {
  nutzer: string;
  email: string;
  rolle: Rolle;
  seit: string;
  /** Unter den gebuchten Plaetzen — sonst ohne Zugang */
  hatPlatz: boolean;
}

export interface OffeneEinladung {
  token: string;
  erstelltAm: string;
  gueltigBis: string;
}

export async function mitgliederLaden(): Promise<Mitglied[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('buero_mitglieder');
  if (error || !Array.isArray(data)) return null;
  return (data as Record<string, unknown>[]).map((m) => ({
    nutzer: String(m.nutzer),
    email: String(m.email ?? ''),
    rolle: m.rolle === 'inhaber' ? 'inhaber' : 'mitglied',
    seit: String(m.seit ?? ''),
    hatPlatz: m.hat_platz === true,
  }));
}

export async function einladungenLaden(): Promise<OffeneEinladung[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('buero_einladungen');
  if (error || !Array.isArray(data)) return null;
  return (data as Record<string, unknown>[]).map((e) => ({
    token: String(e.token),
    erstelltAm: String(e.erstellt_am ?? ''),
    gueltigBis: String(e.gueltig_bis ?? ''),
  }));
}

/** Die Datenbank antwortet mit knappen Ausnahmen — hier stehen sie fuer Menschen. */
function einladungsFehler(e: { code?: string; message?: string }): string {
  const m = e.message ?? '';
  if (e.code === '42501') return 'Einladen kann nur die Person, die das Abo verwaltet.';
  if (m.includes('Alle Plaetze')) return 'Alle Plätze sind belegt. Weitere Plätze buchen Sie unter „Abo verwalten“ dazu.';
  if (m.includes('Kein aktives Abo')) return 'Einladen geht nur, solange das Abo läuft.';
  if (m.includes('Zu viele offene')) return 'Es sind schon 20 Einladungen offen. Ziehen Sie nicht mehr benötigte zurück.';
  return 'Das hat nicht geklappt. Bitte versuchen Sie es noch einmal.';
}

export async function einladungErstellen(): Promise<{ token: string } | { fehler: string }> {
  if (!supabase) return { fehler: 'Die Anmeldung ist nicht eingerichtet.' };
  const { data, error } = await supabase.rpc('einladung_erstellen');
  if (error || typeof data !== 'string') return { fehler: einladungsFehler(error ?? {}) };
  return { token: data };
}

export async function einladungZurueckziehen(token: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.rpc('einladung_zurueckziehen', { p_token: token });
  return !error;
}

export async function mitgliedEntfernen(nutzer: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.rpc('mitglied_entfernen', { p_nutzer: nutzer });
  return !error;
}

export async function bueroVerlassen(): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.rpc('buero_verlassen');
  return !error;
}
