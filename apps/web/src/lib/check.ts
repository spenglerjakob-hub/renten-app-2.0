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
