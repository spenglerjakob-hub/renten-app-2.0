import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase-Client.
 *
 * Die Anwendung funktioniert VOLLSTAENDIG ohne Supabase: Berechnung im Worker,
 * Zwischenspeicherung im localStorage. Anmeldung und Fern-Speicherung sind ein
 * Zusatz. Fehlt die Konfiguration, bleiben diese Funktionen einfach
 * ausgeblendet — die Anwendung startet trotzdem.
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseKonfiguriert = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = supabaseKonfiguriert
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

/**
 * Zeile der Tabelle public.szenarien.
 * `daten` enthaelt ausschliesslich Eingaben, niemals Rechenergebnisse.
 */
export interface SzenarioZeile {
  id: string;
  besitzer: string;
  name: string;
  daten: unknown;
  schema_version: number;
  erstellt_am: string;
  geaendert_am: string;
}
