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

// Supabase empfiehlt den moderneren "sb_publishable_..."-Schluessel, der sich
// unabhaengig rotieren laesst. Der aeltere anon-Schluessel bleibt als
// Rueckfallebene, damit bestehende Konfigurationen weiter funktionieren.
const oeffentlicherSchluessel =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);

export const supabaseKonfiguriert = Boolean(url && oeffentlicherSchluessel);

/**
 * Die Adresse, mit der die Seite geoeffnet wurde — festgehalten, BEVOR der
 * Client entsteht. Der wertet Bestaetigungs-Links im alten Format
 * (`#access_token=…`) selbst aus und raeumt die Adresse dabei auf; danach
 * liesse sich nicht mehr erkennen, dass jemand gerade ueber einen Link kam.
 */
export const adresseBeimStart = typeof window === 'undefined' ? '' : window.location.href;

export const supabase: SupabaseClient | null = supabaseKonfiguriert
  ? createClient(url!, oeffentlicherSchluessel!, {
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
