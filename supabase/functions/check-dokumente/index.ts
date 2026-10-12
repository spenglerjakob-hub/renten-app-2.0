/**
 * check-dokumente — Unterlagen des Vorsorge-Checks entfernen und aufraeumen.
 *
 * Dateien im Speicher lassen sich nur ueber die Storage-API loeschen (per SQL
 * sperrt es der Trigger storage.protect_delete, und es blieben verwaiste
 * Dateien zurueck). Der Kunde hat dafuer keine Rechte — er darf nur
 * hochladen. Deshalb diese Funktion mit dem Admin-Schluessel, fuer genau zwei
 * Faelle:
 *
 *   { "aktion": "entfernen", "code": "<uuid>", "pfad": "<uuid>/<datei>" }
 *     Der Kunde nimmt eine falsch hochgeladene Datei zurueck. Erlaubt nur,
 *     solange sein Link offen ist (nicht abgelaufen, noch nicht abgesendet),
 *     und nur fuer Dateien unter genau diesem Code. Wer den Link hat, kann
 *     also hoechstens Dateien dieses offenen Links loeschen — lesen nie.
 *
 *   { "aktion": "aufraeumen" }
 *     Loescht alle Dateien, deren Code keine Anfrage mehr hat: abgelaufen,
 *     90 Tage nach Eingang geloescht, vom Berater geloescht, Konto geloescht.
 *     Aufgerufen nachts per Cron (Migration …_check_dokumente.sql) und vom
 *     Rechner, sobald ein Berater eine Anfrage loescht. Ein Aufruf von aussen
 *     ist harmlos: Er raeumt hoechstens frueher auf, was ohnehin geht.
 *
 * verify_jwt ist aus: Der Kunde hat kein Konto, und das Gateway kennt nur die
 * alten JWT-Schluessel. Die Pruefung oben uebernimmt die Funktion selbst.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'check-dokumente';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Dasselbe Muster wie in der Policy (public.check_dokument_erlaubt). */
const DATEI = /^[a-z0-9-]{1,80}\.(jpg|jpeg|png|webp|heic|heif|pdf)$/;
const BLOCK = 1000;

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

/**
 * Ein zweiter Versuch nach kurzer Pause. Die Datenbank weist den Schluessel
 * vereinzelt mit „JWT issued at future" ab — die Uhren gehen um Sekunden
 * auseinander, der naechste Aufruf geht durch. Ein Fehler in der Sache kommt
 * beim zweiten Mal genauso und wird dann gemeldet.
 */
async function zweiVersuche<T extends { error: unknown }>(aufruf: () => PromiseLike<T>): Promise<T> {
  const erster = await aufruf();
  if (!erster.error) return erster;
  await new Promise((weiter) => setTimeout(weiter, 2000));
  return await aufruf();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return antwort(405, { fehler: 'Nur POST' });

  let inhalt: { aktion?: unknown; code?: unknown; pfad?: unknown };
  try {
    inhalt = await req.json();
  } catch {
    return antwort(400, { fehler: 'Ungueltige Anfrage' });
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, adminSchluessel(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (inhalt.aktion === 'entfernen') {
    const code = typeof inhalt.code === 'string' ? inhalt.code.toLowerCase() : '';
    const pfad = typeof inhalt.pfad === 'string' ? inhalt.pfad : '';
    const teile = pfad.split('/');
    if (!UUID.test(code) || teile.length !== 2 || teile[0] !== code || !DATEI.test(teile[1] ?? '')) {
      return antwort(400, { fehler: 'Ungueltiger Pfad' });
    }

    const { data: offen, error } = await zweiVersuche(() => db.rpc('check_code_gueltig', { p_code: code }));
    if (error) {
      console.error('Code nicht pruefbar', error.message);
      return antwort(500, { fehler: 'Pruefung fehlgeschlagen' });
    }
    if (offen !== true) return antwort(403, { fehler: 'Link abgelaufen oder schon abgesendet' });

    const { error: fehler } = await zweiVersuche(() => db.storage.from(BUCKET).remove([pfad]));
    if (fehler) {
      console.error('Entfernen fehlgeschlagen', fehler.message);
      return antwort(500, { fehler: 'Entfernen fehlgeschlagen' });
    }
    return antwort(200, { status: 'entfernt' });
  }

  if (inhalt.aktion === 'aufraeumen') {
    let geloescht = 0;
    // Hoechstens zehn Bloecke je Aufruf — der naechste Lauf macht weiter.
    for (let runde = 0; runde < 10; runde += 1) {
      const { data, error } = await zweiVersuche(() => db.rpc('check_dokumente_verwaist', { p_grenze: BLOCK }));
      if (error) {
        console.error('Verwaiste Unterlagen nicht lesbar', error.message);
        return antwort(500, { fehler: 'Aufraeumen fehlgeschlagen', geloescht });
      }
      const namen = ((data as string[] | null) ?? []).filter((n) => typeof n === 'string');
      if (namen.length === 0) break;
      const { error: fehler } = await zweiVersuche(() => db.storage.from(BUCKET).remove(namen));
      if (fehler) {
        console.error('Loeschen fehlgeschlagen', fehler.message);
        return antwort(500, { fehler: 'Aufraeumen fehlgeschlagen', geloescht });
      }
      geloescht += namen.length;
      if (namen.length < BLOCK) break;
    }
    if (geloescht > 0) console.log('Verwaiste Unterlagen geloescht', geloescht);
    return antwort(200, { geloescht });
  }

  return antwort(400, { fehler: 'Unbekannte Aktion' });
});
