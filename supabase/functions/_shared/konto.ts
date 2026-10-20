/**
 * Was die Abo-Funktionen gemeinsam brauchen: Antworten mit CORS, den
 * Admin-Zugang zur Datenbank, das angemeldete Konto und die Adresse, auf
 * die Stripe zurueckleitet.
 */
import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function antwort(status: number, inhalt: Record<string, unknown>) {
  return new Response(JSON.stringify(inhalt), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/** Der Admin-Schluessel — neue Secret Keys bevorzugt, sonst der alte service_role. */
function adminSchluessel(): string {
  const neu = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (neu) {
    try {
      const k = JSON.parse(neu) as Record<string, string>;
      if (k.default) return k.default;
    } catch { /* weiter mit dem alten Schluessel */ }
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
}

export function adminDb(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, adminSchluessel(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Das angemeldete Konto — das Zugriffstoken wird beim Auth-Server geprueft.
 * verify_jwt ist aus, weil das Gateway nur die alten JWT-Schluessel kennt.
 */
export async function angemeldet(req: Request, db: SupabaseClient): Promise<User | null> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  return error ? null : data?.user ?? null;
}

/** Was `abo_kontext()` ueber ein Konto weiss. */
export interface AboKontext {
  buero: string | null;
  rolle: 'inhaber' | 'mitglied' | null;
  stripe_kunde: string | null;
  stripe_abo: string | null;
  status: string | null;
  paket: string | null;
  kuendigung_zum: string | null;
  abo_aktiv: boolean;
  betreiber: boolean;
  fruehstarter: boolean;
  zahlung_bereit: boolean;
}

export async function aboKontext(db: SupabaseClient, nutzer: string): Promise<AboKontext | null> {
  const { data, error } = await db.rpc('abo_kontext', { p_nutzer: nutzer });
  if (error) throw new Error(`abo_kontext: ${error.message}`);
  return (data as AboKontext | null) ?? null;
}

/**
 * Wohin Stripe zurueckleitet: auf die Seite, von der die Anfrage kam — Test-
 * oder Live-Seite —, aber nur auf eine der eigenen. Eine fremde Herkunft
 * fuehrt auf die Live-Seite.
 */
const EIGENE_SEITEN = [
  'https://js-rentenplaner.de',
  'https://www.js-rentenplaner.de',
  'https://test.js-rentenplaner.de',
  'http://localhost:5173',
  'http://localhost:4173',
];

export function heimat(req: Request): string {
  const herkunft = req.headers.get('Origin') ?? '';
  return EIGENE_SEITEN.includes(herkunft) ? herkunft : EIGENE_SEITEN[0]!;
}
