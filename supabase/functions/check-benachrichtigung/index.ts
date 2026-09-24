/**
 * check-benachrichtigung — E-Mail an den Berater, wenn ein Vorsorge-Check eingeht.
 *
 * Aufgerufen vom Trigger `privat.check_eingang_melden` (pg_net) mit
 * `{ "eingang": "<uuid>" }`. Verschickt wird ueber das eigene Postfach per
 * SMTP auf Port 465 — die Ports 25 und 587 sperrt Supabase fuer Edge
 * Functions.
 *
 * GEHEIMNISSE (Dashboard → Edge Functions → Secrets):
 *   SMTP_HOST      z. B. smtp.hostinger.com
 *   SMTP_USER      das Postfach, z. B. benachrichtigung@js-rentenplaner.de
 *   SMTP_PASS      dessen Passwort
 *   SMTP_PORT      optional, Vorgabe 465 (SSL)
 *   MAIL_ABSENDER  optional, Vorgabe „JS-Rentenplaner <SMTP_USER>"
 *   APP_URL        optional, Vorgabe https://js-rentenplaner.de
 *
 * SCHUTZ OHNE SCHLUESSEL (verify_jwt = false): Die Funktion setzt
 * `benachrichtigt_am` atomar, BEVOR sie verschickt, und nur, wenn er noch leer
 * ist. Je Eingang geht also hoechstens eine Mail hinaus — immer an den Berater,
 * dem die Anfrage gehoert, nie an eine Adresse aus der Anfrage. Wer die
 * Funktion von aussen aufruft, braucht die UUID eines echten Eingangs, die
 * niemand lesen kann, und loest auch dann nur die Mail aus, die ohnehin faellig
 * ist. In der Mail stehen keine Angaben des Kunden, nur der Name, den der
 * Berater selbst eingetragen hat.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.16';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

Deno.serve(async (req) => {
  if (req.method !== 'POST') return antwort(405, { fehler: 'Nur POST' });

  let eingang = '';
  try {
    const roh = await req.text();
    if (roh.length > 1000) return antwort(413, { fehler: 'Zu gross' });
    eingang = String((JSON.parse(roh) as { eingang?: unknown }).eingang ?? '');
  } catch {
    return antwort(400, { fehler: 'Ungueltiger Inhalt' });
  }
  if (!UUID.test(eingang)) return antwort(400, { fehler: 'Ungueltige Kennung' });

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

  // Atomar beanspruchen: nur, wenn noch nicht benachrichtigt.
  const { data: beansprucht, error: fehlerBeanspruchen } = await db
    .from('check_eingaenge')
    .update({ benachrichtigt_am: new Date().toISOString() })
    .eq('id', eingang)
    .is('benachrichtigt_am', null)
    .select('code, eingegangen_am')
    .maybeSingle();
  if (fehlerBeanspruchen) {
    console.error('Beanspruchen fehlgeschlagen', fehlerBeanspruchen);
    return antwort(500, { fehler: 'Datenbank' });
  }
  // Unbekannt oder schon erledigt — bewusst dieselbe Antwort.
  if (!beansprucht) return antwort(200, { status: 'nichts zu tun' });

  const freigeben = () =>
    db.from('check_eingaenge').update({ benachrichtigt_am: null }).eq('id', eingang);

  try {
    const { data: anfrage, error: fehlerAnfrage } = await db
      .from('check_anfragen')
      .select('berater, kunde')
      .eq('code', beansprucht.code)
      .single();
    if (fehlerAnfrage || !anfrage) throw fehlerAnfrage ?? new Error('Anfrage fehlt');

    const { data: nutzer, error: fehlerNutzer } = await db.auth.admin.getUserById(anfrage.berater);
    const empfaenger = nutzer?.user?.email;
    if (fehlerNutzer || !empfaenger) throw fehlerNutzer ?? new Error('Berater ohne E-Mail');

    const kunde = (anfrage.kunde as string).trim() || 'ohne Namen';
    const wann = new Date(beansprucht.eingegangen_am as string).toLocaleString('de-DE', {
      timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'short',
    });
    const appUrl = Deno.env.get('APP_URL') ?? 'https://js-rentenplaner.de';

    const text = [
      'Guten Tag,',
      '',
      `ein Kunde hat seinen Vorsorge-Check eingereicht: ${kunde} (am ${wann}).`,
      '',
      'Sie finden die Angaben im Rentenplaner unter „Vorsorge-Check anfordern“ und können',
      'sie dort mit einem Klick in den Rechner übernehmen:',
      appUrl,
      '',
      'Diese Nachricht enthält bewusst keine Angaben des Kunden.',
      '',
      'JS-Rentenplaner',
    ].join('\n');
    const html = `<p>Guten Tag,</p>
<p>ein Kunde hat seinen Vorsorge-Check eingereicht: <strong>${escapeHtml(kunde)}</strong> (am ${escapeHtml(wann)}).</p>
<p>Sie finden die Angaben im Rentenplaner unter „Vorsorge-Check anfordern“ und können sie dort mit einem Klick in den Rechner übernehmen:<br>
<a href="${escapeHtml(appUrl)}">${escapeHtml(appUrl)}</a></p>
<p style="color:#64748b;font-size:12px">Diese Nachricht enthält bewusst keine Angaben des Kunden.</p>
<p>JS-Rentenplaner</p>`;

    const port = Number(Deno.env.get('SMTP_PORT') ?? '465');
    const transport = nodemailer.createTransport({
      host: smtpHost,
      port,
      secure: port === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });
    await transport.sendMail({
      from: Deno.env.get('MAIL_ABSENDER') ?? `JS-Rentenplaner <${smtpUser}>`,
      to: empfaenger,
      subject: `Neuer Vorsorge-Check eingegangen: ${kunde}`,
      text,
      html,
    });

    return antwort(200, { status: 'verschickt' });
  } catch (e) {
    // Freigeben, damit ein erneuter Aufruf es noch einmal versuchen kann.
    await freigeben();
    console.error('Versand fehlgeschlagen', e instanceof Error ? e.message : e);
    return antwort(502, { fehler: 'Versand fehlgeschlagen' });
  }
});
