/**
 * konto-loeschen — ein angemeldeter Nutzer loescht sein Konto selbst (Art. 17 DSGVO).
 *
 * Geloescht wird der Nutzer in `auth.users`. Alles, was ihm gehoert, haengt
 * per `on delete cascade` daran und geht mit: gespeicherte Szenarien,
 * Vorsorge-Check-Anfragen und die zugehoerigen Eingaenge.
 *
 * WER DARF: nur der Inhaber selbst. Das Zugriffstoken aus dem
 * Authorization-Kopf wird beim Auth-Server geprueft (`auth.getUser`); geloescht
 * wird genau der Nutzer, dem es gehoert — eine ID aus dem Anfragekoerper
 * gibt es nicht, also kann niemand ein fremdes Konto angeben.
 *
 * verify_jwt ist aus, weil das Gateway nur die alten JWT-Schluessel kennt;
 * die Pruefung uebernimmt `getUser` hier selbst.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function antwort(status: number, inhalt: Record<string, unknown>) {
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return antwort(405, { fehler: 'Nur POST' });

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return antwort(401, { fehler: 'Nicht angemeldet' });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, adminSchluessel(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await db.auth.getUser(token);
  const nutzer = data?.user;
  if (error || !nutzer) return antwort(401, { fehler: 'Anmeldung ungueltig' });

  const { error: fehlerLoeschen } = await db.auth.admin.deleteUser(nutzer.id);
  if (fehlerLoeschen) {
    console.error('Loeschen fehlgeschlagen', fehlerLoeschen.message);
    return antwort(500, { fehler: 'Loeschen fehlgeschlagen' });
  }

  console.log('Konto geloescht', nutzer.id);
  return antwort(200, { status: 'geloescht' });
});
