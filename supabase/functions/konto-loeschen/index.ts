/**
 * konto-loeschen — ein angemeldeter Nutzer loescht sein Konto selbst (Art. 17 DSGVO).
 *
 * Geloescht wird der Nutzer in `auth.users`. Alles, was ihm gehoert, haengt
 * per `on delete cascade` daran und geht mit: gespeicherte Szenarien,
 * Vorsorge-Check-Anfragen und die zugehoerigen Eingaenge.
 *
 * DIE HOCHGELADENEN UNTERLAGEN gehen nicht per Kaskade — Dateien lassen sich
 * nur ueber die Storage-API loeschen. Nach dem Loeschen des Nutzers haben sie
 * keine Anfrage mehr und werden hier gleich mit entfernt, nicht erst beim
 * naechtlichen Aufraeumen (Edge Function `check-dokumente`).
 *
 * DIE LOGOS ebenso: das Logo fuers Gutachten (Bucket `branding`, Zeile in
 * `berater_profil`) und die Firmenlogos der Mitarbeiterberatung (Bucket
 * `bav-firmenlogos`, Zeilen in `bav_firmen` und `bav_beratungen`). Die Zeilen
 * gehen per Kaskade, die Dateien nicht. Sie liegen im Ordner mit der ID des
 * Nutzers und werden hier mit entfernt.
 *
 * WER DARF: nur der Inhaber selbst. Das Zugriffstoken aus dem
 * Authorization-Kopf wird beim Auth-Server geprueft (`auth.getUser`); geloescht
 * wird genau der Nutzer, dem es gehoert — eine ID aus dem Anfragekoerper
 * gibt es nicht, also kann niemand ein fremdes Konto angeben.
 *
 * EIN LAUFENDES ABO (Inhaber, nicht gekuendigt) verhindert das Loeschen
 * mit 409 — erst im Kundenportal kuendigen, dann loeschen.
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

/**
 * Ein zweiter Versuch nach kurzer Pause — wie in `check-dokumente`: Die
 * Datenbank weist den Schluessel vereinzelt mit „JWT issued at future" ab.
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

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return antwort(401, { fehler: 'Nicht angemeldet' });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, adminSchluessel(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await db.auth.getUser(token);
  const nutzer = data?.user;
  if (error || !nutzer) return antwort(401, { fehler: 'Anmeldung ungueltig' });

  /*
    Ein laufendes, nicht gekuendigtes Abo des eigenen Bueros: erst kuendigen.
    Sonst liefe die Abrechnung bei Stripe weiter, waehrend Konto und Buero
    weg sind. Ein gekuendigtes Abo endet von selbst zum Laufzeitende.
  */
  const { data: kontext, error: fehlerKontext } = await zweiVersuche(() => db.rpc('abo_kontext', { p_nutzer: nutzer.id }));
  if (fehlerKontext) {
    console.error('Abo nicht geprueft', fehlerKontext.message);
    return antwort(500, { fehler: 'Loeschen fehlgeschlagen' });
  }
  const k = (kontext ?? {}) as { rolle?: string; abo_aktiv?: boolean; kuendigung_zum?: string | null };
  if (k.rolle === 'inhaber' && k.abo_aktiv && !k.kuendigung_zum) {
    return antwort(409, { fehler: 'abo_laeuft' });
  }

  const { error: fehlerLoeschen } = await db.auth.admin.deleteUser(nutzer.id);
  if (fehlerLoeschen) {
    console.error('Loeschen fehlgeschlagen', fehlerLoeschen.message);
    return antwort(500, { fehler: 'Loeschen fehlgeschlagen' });
  }

  /*
    Die Unterlagen der Vorsorge-Checks. Ein Fehler hier laesst das Loeschen
    nicht scheitern — das Konto ist schon weg, und das naechtliche Aufraeumen
    erfasst, was liegen geblieben ist.
  */
  let unterlagen = 0;
  try {
    for (let runde = 0; runde < 10; runde += 1) {
      const { data, error: fehlerListe } = await zweiVersuche(() => db.rpc('check_dokumente_verwaist', { p_grenze: 1000 }));
      if (fehlerListe) throw fehlerListe;
      const namen = ((data as string[] | null) ?? []).filter((n) => typeof n === 'string');
      if (namen.length === 0) break;
      const { error: fehlerDateien } = await zweiVersuche(() => db.storage.from('check-dokumente').remove(namen));
      if (fehlerDateien) throw fehlerDateien;
      unterlagen += namen.length;
      if (namen.length < 1000) break;
    }
  } catch (e) {
    console.error('Unterlagen nicht aufgeraeumt', e instanceof Error ? e.message : e);
  }

  /*
    Die Logos: der Ordner <nutzer.id> in `branding` (Gutachten, hoechstens
    drei Dateien) und in `bav-firmenlogos` (Firmen, hoechstens 400 — Policy).
    Ein Fehler laesst das Loeschen ebenso wenig scheitern wie bei den
    Unterlagen.
  */
  let logos = 0;
  for (const bucket of ['branding', 'bav-firmenlogos']) {
    try {
      const { data: dateien, error: fehlerListe } = await zweiVersuche(
        () => db.storage.from(bucket).list(nutzer.id, { limit: 1000 }),
      );
      if (fehlerListe) throw fehlerListe;
      const namen = (dateien ?? [])
        .map((d) => d.name)
        .filter((n) => typeof n === 'string' && n !== '')
        .map((n) => `${nutzer.id}/${n}`);
      if (namen.length > 0) {
        const { error: fehlerDateien } = await zweiVersuche(() => db.storage.from(bucket).remove(namen));
        if (fehlerDateien) throw fehlerDateien;
        logos += namen.length;
      }
    } catch (e) {
      console.error(`Logos in ${bucket} nicht entfernt`, e instanceof Error ? e.message : e);
    }
  }

  console.log('Konto geloescht', nutzer.id, unterlagen > 0 ? `(${unterlagen} Unterlagen)` : '', logos > 0 ? `(${logos} Logo-Dateien)` : '');
  return antwort(200, { status: 'geloescht' });
});
