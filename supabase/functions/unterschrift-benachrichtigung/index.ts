/**
 * unterschrift-benachrichtigung — E-Mail an den Berater, wenn ein Mitarbeiter per Link unterschrieben hat.
 *
 * Aufgerufen vom Trigger `privat.bav_unterschrift_link_melden` (pg_net) mit
 * `{ "unterschrift": "<uuid>" }`. Verschickt wird wie bei
 * check-benachrichtigung ueber das eigene Postfach per SMTP auf Port 465.
 *
 * GEHEIMNISSE (Dashboard → Edge Functions → Secrets) — dieselben wie bei
 * check-benachrichtigung:
 *   SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_PORT (optional), MAIL_ABSENDER (optional),
 *   APP_URL (optional, Vorgabe https://js-rentenplaner.de — wenn der Link keine Adresse kennt)
 *
 * SCHUTZ OHNE SCHLUESSEL (verify_jwt = false): Die Funktion setzt
 * `benachrichtigt_am` atomar, BEVOR sie verschickt, nur fuer Unterschriften
 * per Link und nur, wenn er noch leer ist. Je Unterschrift geht also
 * hoechstens eine Mail hinaus — immer an den Berater, der den Link erstellt
 * hat (sonst an den, dem die Unterlagen gehoeren), nie an eine andere
 * Adresse. Wer die Funktion von aussen aufruft, braucht die UUID einer echten
 * Unterschrift, die niemand lesen kann, und loest auch dann nur die Mail aus,
 * die ohnehin faellig ist. In der Mail stehen keine Inhalte der Unterlagen,
 * nur Mitarbeiter und Firma, wie der Berater sie eingetragen hat.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.16';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEITEN = ['https://js-rentenplaner.de', 'https://test.js-rentenplaner.de'];

function antwort(status: number, inhalt: Record<string, unknown>) {
  return new Response(JSON.stringify(inhalt), {
    status,
    headers: { 'Content-Type': 'application/json' },
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

/** Fuer Protokolle: `max…@example.de` statt der vollen Adresse. */
const maskiert = (adresse: string) => adresse.replace(/^(.{0,3}).*(@.*)$/, '$1…$2');

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

Deno.serve(async (req) => {
  if (req.method !== 'POST') return antwort(405, { fehler: 'Nur POST' });

  let unterschrift = '';
  try {
    const roh = await req.text();
    if (roh.length > 1000) return antwort(413, { fehler: 'Zu gross' });
    unterschrift = String((JSON.parse(roh) as { unterschrift?: unknown }).unterschrift ?? '');
  } catch {
    return antwort(400, { fehler: 'Ungueltiger Inhalt' });
  }
  if (!UUID.test(unterschrift)) return antwort(400, { fehler: 'Ungueltige Kennung' });

  const smtpHost = Deno.env.get('SMTP_HOST');
  const smtpUser = Deno.env.get('SMTP_USER');
  const smtpPass = Deno.env.get('SMTP_PASS');
  if (!smtpHost || !smtpUser || !smtpPass) {
    // Nichts beanspruchen: Wenn die Zugangsdaten spaeter eingetragen sind,
    // soll ein erneuter Aufruf die Mail noch verschicken koennen.
    console.error('SMTP_HOST, SMTP_USER oder SMTP_PASS fehlen in den Secrets.');
    return antwort(500, { fehler: 'Versand nicht eingerichtet' });
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, adminSchluessel(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Atomar beanspruchen: nur Unterschriften per Link, nur, wenn noch nicht benachrichtigt.
  const { data: beansprucht, error: fehlerBeanspruchen } = await db
    .from('bav_unterschriften')
    .update({ benachrichtigt_am: new Date().toISOString() })
    .eq('id', unterschrift)
    .eq('kanal', 'link')
    .is('benachrichtigt_am', null)
    .select('beratung, besitzer, name, unterschrieben_am, nachweis')
    .maybeSingle();
  if (fehlerBeanspruchen) {
    console.error('Beanspruchen fehlgeschlagen', fehlerBeanspruchen);
    return antwort(500, { fehler: 'Datenbank' });
  }
  // Unbekannt, am Bildschirm oder schon erledigt — bewusst dieselbe Antwort.
  if (!beansprucht) return antwort(200, { status: 'nichts zu tun' });

  const freigeben = () =>
    db.from('bav_unterschriften').update({ benachrichtigt_am: null }).eq('id', unterschrift);

  try {
    const nachweis = (beansprucht.nachweis ?? {}) as Record<string, unknown>;
    const ersteller = typeof nachweis.link_erstellt_von_id === 'string' && UUID.test(nachweis.link_erstellt_von_id)
      ? nachweis.link_erstellt_von_id
      : null;

    const { data: beratung, error: fehlerBeratung } = await db
      .from('bav_beratungen')
      .select('firma, bav_firmen(name)')
      .eq('id', beansprucht.beratung)
      .single();
    if (fehlerBeratung || !beratung) throw fehlerBeratung ?? new Error('Beratung fehlt');

    // Wer den Link erstellt hat — gibt es ihn nicht mehr, der Besitzer der Unterlagen.
    let empfaenger: string | undefined;
    for (const id of [ersteller, beansprucht.besitzer as string]) {
      if (!id) continue;
      const { data: nutzer } = await db.auth.admin.getUserById(id);
      empfaenger = nutzer?.user?.email ?? undefined;
      if (empfaenger) break;
    }
    if (!empfaenger) throw new Error('Berater ohne E-Mail');

    const mitarbeiter = (beansprucht.name as string).trim() || 'Ein Mitarbeiter';
    const firmenZeile = beratung.bav_firmen as unknown as { name?: string } | null;
    const firma = (firmenZeile?.name ?? '').trim();
    const wann = new Date(beansprucht.unterschrieben_am as string).toLocaleString('de-DE', {
      timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'short',
    });
    const seite = typeof nachweis.adresse === 'string' && SEITEN.includes(nachweis.adresse)
      ? nachweis.adresse
      : Deno.env.get('APP_URL') ?? 'https://js-rentenplaner.de';
    const ziel = `${seite}/mitarbeiterberatung?firma=${beratung.firma}&beratung=${beansprucht.beratung}`;
    const wer = firma ? `${mitarbeiter} (${firma})` : mitarbeiter;

    const text = [
      'Guten Tag,',
      '',
      `${wer} hat die Unterlagen der bAV-Beratung per Link unterschrieben (am ${wann}).`,
      '',
      'Sie finden die unterschriebenen Unterlagen und den Nachweis in der Mitarbeiterberatung:',
      ziel,
      '',
      'Diese Nachricht enthält bewusst keine Inhalte der Unterlagen.',
      '',
      'JS-Rentenplaner',
    ].join('\n');
    const html = `<p>Guten Tag,</p>
<p><strong>${escapeHtml(wer)}</strong> hat die Unterlagen der bAV-Beratung per Link unterschrieben (am ${escapeHtml(wann)}).</p>
<p>Sie finden die unterschriebenen Unterlagen und den Nachweis in der Mitarbeiterberatung:<br>
<a href="${escapeHtml(ziel)}">${escapeHtml(ziel)}</a></p>
<p style="color:#64748b;font-size:12px">Diese Nachricht enthält bewusst keine Inhalte der Unterlagen.</p>
<p>JS-Rentenplaner</p>`;

    const port = Number(Deno.env.get('SMTP_PORT') ?? '465');
    const transport = nodemailer.createTransport({
      host: smtpHost,
      port,
      secure: port === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });
    const info = await transport.sendMail({
      from: Deno.env.get('MAIL_ABSENDER') ?? `JS-Rentenplaner <${smtpUser}>`,
      to: empfaenger,
      subject: `Unterschrift per Link eingegangen: ${wer}`,
      text,
      html,
    });

    // Wie bei check-benachrichtigung: Antwort des SMTP-Servers und Message-ID ins Protokoll.
    const abgelehnt = (info.rejected ?? []).length > 0 || (info.accepted ?? []).length === 0;
    if (abgelehnt) throw new Error(`Empfaenger abgelehnt: ${info.response ?? 'ohne Antwort'}`);
    console.log('Verschickt', { an: maskiert(empfaenger), id: info.messageId, smtp: info.response });

    return antwort(200, { status: 'verschickt', id: info.messageId, smtp: info.response });
  } catch (e) {
    // Freigeben, damit ein erneuter Aufruf es noch einmal versuchen kann.
    await freigeben();
    console.error('Versand fehlgeschlagen', e instanceof Error ? e.message : e);
    return antwort(502, { fehler: 'Versand fehlgeschlagen' });
  }
});
