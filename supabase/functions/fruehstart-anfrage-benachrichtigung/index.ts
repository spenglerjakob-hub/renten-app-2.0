/**
 * fruehstart-anfrage-benachrichtigung — E-Mail an den Betreiber bei einer
 * neuen Early-Adopter-Anfrage von der Preisseite.
 *
 * Aufgerufen vom Trigger `privat.fruehstart_anfrage_melden` (pg_net) mit
 * `{ "anfrage": "<uuid>" }`. Verschickt wird wie bei den Rueckmeldungen ueber
 * das eigene Postfach per SMTP, mit denselben Geheimnissen: SMTP_HOST,
 * SMTP_USER, SMTP_PASS, optional SMTP_PORT, MAIL_ABSENDER, APP_URL.
 *
 * EMPFAENGER sind die Betreiber-Konten (privat.freizugaenge, grund
 * 'betreiber'). Die Adresse des Interessenten steht als Antwortadresse in der
 * Mail — ein Klick auf „Antworten“ geht an ihn. An die eingetragene Adresse
 * selbst geht von hier NICHTS: Sonst liesse sich das Formular nutzen, um
 * Fremden Mails zu schicken.
 *
 * SCHUTZ OHNE SCHLUESSEL (verify_jwt = false) wie bei den Rueckmeldungen:
 * `fruehstart_anfrage_beanspruchen` setzt `benachrichtigt_am` atomar, BEVOR
 * verschickt wird. Je Anfrage geht hoechstens eine Mail hinaus, immer an den
 * Betreiber. Wer die Funktion von aussen aufruft, braucht die UUID einer
 * echten Anfrage und loest auch dann nur die Mail aus, die ohnehin faellig
 * ist; die Antwort enthaelt keinen Inhalt.
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

/** Ein Wiederholungsversuch nach zwei Sekunden — gegen kurze Stoerungen ("JWT issued at future"). */
async function zweiVersuche<T extends { error: unknown }>(aufruf: () => PromiseLike<T>): Promise<T> {
  const erster = await aufruf();
  if (!erster.error) return erster;
  await new Promise((r) => setTimeout(r, 2000));
  return aufruf();
}

/** Fuer Protokolle: `max…@example.de` statt der vollen Adresse. */
const maskiert = (adresse: string) => adresse.replace(/^(.{0,3}).*(@.*)$/, '$1…$2');

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Kopfzeilen vertragen keine Zeilenumbrueche — der Name kommt aus einem Formular. */
const einzeilig = (s: string) => s.replace(/[\r\n\t]+/g, ' ').trim();

interface Beansprucht {
  id: string;
  erstellt_am: string;
  name: string;
  email: string;
  buero: string;
  berater: number | null;
  betreiber: string[];
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return antwort(405, { fehler: 'Nur POST' });

  let id = '';
  try {
    const roh = await req.text();
    if (roh.length > 1000) return antwort(413, { fehler: 'Zu gross' });
    id = String((JSON.parse(roh) as { anfrage?: unknown }).anfrage ?? '');
  } catch {
    return antwort(400, { fehler: 'Ungueltiger Inhalt' });
  }
  if (!UUID.test(id)) return antwort(400, { fehler: 'Ungueltige Kennung' });

  const smtpHost = Deno.env.get('SMTP_HOST');
  const smtpUser = Deno.env.get('SMTP_USER');
  const smtpPass = Deno.env.get('SMTP_PASS');
  if (!smtpHost || !smtpUser || !smtpPass) {
    console.error('SMTP_HOST, SMTP_USER oder SMTP_PASS fehlen in den Secrets.');
    return antwort(500, { fehler: 'Versand nicht eingerichtet' });
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, adminSchluessel(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await zweiVersuche(() => db.rpc('fruehstart_anfrage_beanspruchen', { p_id: id }));
  if (error) {
    console.error('Beanspruchen fehlgeschlagen', error);
    return antwort(500, { fehler: 'Datenbank' });
  }
  // Unbekannt oder schon erledigt — bewusst dieselbe Antwort.
  if (!data) return antwort(200, { status: 'nichts zu tun' });
  const a = data as Beansprucht;

  const freigeben = () => zweiVersuche(() => db.rpc('fruehstart_anfrage_freigeben', { p_id: id }));

  try {
    const empfaenger = (a.betreiber ?? []).filter((x) => typeof x === 'string' && x.includes('@'));
    if (empfaenger.length === 0) throw new Error('Kein Betreiber-Konto mit E-Mail');

    const name = einzeilig(a.name);
    const wann = new Date(a.erstellt_am).toLocaleString('de-DE', {
      timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'short',
    });
    const appUrl = Deno.env.get('APP_URL') ?? 'https://js-rentenplaner.de';
    const buero = a.buero ? einzeilig(a.buero) : '—';
    const berater = a.berater ? String(a.berater) : '—';

    const text = [
      `Neue Anfrage als Early Adopter am ${wann}`,
      '',
      `Name: ${name}`,
      `E-Mail: ${a.email}`,
      `Büro: ${buero}`,
      `Berater im Büro: ${berater}`,
      '',
      'Zusagen oder absagen: „Abo & Team“ → „Early Adopter: Anfragen“. Bei einer Zusage entsteht der',
      'persönliche Link, und eine fertige E-Mail an den Interessenten öffnet sich in Ihrem Mailprogramm.',
      '',
      `Rechner: ${appUrl}`,
      'Antworten auf diese Mail gehen direkt an den Interessenten.',
    ].join('\n');
    const html = `<p><strong>Neue Anfrage als Early Adopter</strong> am ${escapeHtml(wann)}</p>
<table style="border-collapse:collapse">
<tr><td style="padding:2px 12px 2px 0;color:#64748b">Name</td><td>${escapeHtml(name)}</td></tr>
<tr><td style="padding:2px 12px 2px 0;color:#64748b">E-Mail</td><td>${escapeHtml(a.email)}</td></tr>
<tr><td style="padding:2px 12px 2px 0;color:#64748b">Büro</td><td>${escapeHtml(buero)}</td></tr>
<tr><td style="padding:2px 12px 2px 0;color:#64748b">Berater im Büro</td><td>${escapeHtml(berater)}</td></tr>
</table>
<p>Zusagen oder absagen: <a href="${escapeHtml(appUrl)}">${escapeHtml(appUrl)}</a> → „Abo &amp; Team“ → „Early Adopter: Anfragen“.
Bei einer Zusage entsteht der persönliche Link, und eine fertige E-Mail an den Interessenten öffnet sich in Ihrem Mailprogramm.</p>
<p style="color:#64748b;font-size:12px">Antworten auf diese Mail gehen direkt an den Interessenten.</p>`;

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
      replyTo: { name, address: a.email },
      subject: `Early-Adopter-Anfrage von ${name}`.slice(0, 160),
      text,
      html,
    });

    const abgelehnt = (info.rejected ?? []).length > 0 || (info.accepted ?? []).length === 0;
    if (abgelehnt) throw new Error(`Empfaenger abgelehnt: ${info.response ?? 'ohne Antwort'}`);
    console.log('Verschickt', { an: empfaenger.map(maskiert), id: info.messageId, smtp: info.response });

    return antwort(200, { status: 'verschickt', id: info.messageId, smtp: info.response });
  } catch (e) {
    // Freigeben, damit ein erneuter Aufruf es noch einmal versuchen kann.
    await freigeben();
    console.error('Versand fehlgeschlagen', e instanceof Error ? e.message : e);
    return antwort(502, { fehler: 'Versand fehlgeschlagen' });
  }
});
