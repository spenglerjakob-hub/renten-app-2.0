/**
 * rueckmeldung-benachrichtigung — E-Mail an den Betreiber bei neuer Rueckmeldung.
 *
 * Aufgerufen vom Trigger `privat.rueckmeldung_melden` (pg_net) mit
 * `{ "rueckmeldung": "<uuid>" }`. Verschickt wird wie beim Vorsorge-Check ueber
 * das eigene Postfach per SMTP (Port 465), mit denselben Geheimnissen:
 * SMTP_HOST, SMTP_USER, SMTP_PASS, optional SMTP_PORT, MAIL_ABSENDER, APP_URL.
 *
 * EMPFAENGER sind die Betreiber-Konten (privat.freizugaenge, grund
 * 'betreiber') — die Adresse steht in keiner Datei. Hat der Absender
 * Rueckfragen erlaubt, steht er als Antwortadresse in der Mail.
 *
 * SCHUTZ OHNE SCHLUESSEL (verify_jwt = false) wie beim Vorsorge-Check:
 * `rueckmeldung_beanspruchen` setzt `benachrichtigt_am` atomar, BEVOR
 * verschickt wird. Je Rueckmeldung geht hoechstens eine Mail hinaus, immer an
 * den Betreiber. Wer die Funktion von aussen aufruft, braucht die UUID einer
 * echten Rueckmeldung und loest auch dann nur die Mail aus, die ohnehin
 * faellig ist; die Antwort enthaelt keinen Inhalt.
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

const sterne = (n: number | null) => (n ? '★'.repeat(n) + '☆'.repeat(5 - n) : 'ohne Bewertung');

interface Beansprucht {
  id: string;
  erstellt_am: string;
  bewertung: number | null;
  text: string;
  kontakt_ok: boolean;
  seite: string;
  autor: string | null;
  fruehstarter: boolean;
  betreiber: string[];
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return antwort(405, { fehler: 'Nur POST' });

  let id = '';
  try {
    const roh = await req.text();
    if (roh.length > 1000) return antwort(413, { fehler: 'Zu gross' });
    id = String((JSON.parse(roh) as { rueckmeldung?: unknown }).rueckmeldung ?? '');
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

  const { data, error } = await zweiVersuche(() => db.rpc('rueckmeldung_beanspruchen', { p_id: id }));
  if (error) {
    console.error('Beanspruchen fehlgeschlagen', error);
    return antwort(500, { fehler: 'Datenbank' });
  }
  // Unbekannt oder schon erledigt — bewusst dieselbe Antwort.
  if (!data) return antwort(200, { status: 'nichts zu tun' });
  const r = data as Beansprucht;

  const freigeben = () => zweiVersuche(() => db.rpc('rueckmeldung_freigeben', { p_id: id }));

  try {
    const empfaenger = (r.betreiber ?? []).filter((a) => typeof a === 'string' && a.includes('@'));
    if (empfaenger.length === 0) throw new Error('Kein Betreiber-Konto mit E-Mail');

    const von = r.autor ?? 'unbekannt';
    const wann = new Date(r.erstellt_am).toLocaleString('de-DE', {
      timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'short',
    });
    const appUrl = Deno.env.get('APP_URL') ?? 'https://js-rentenplaner.de';
    const vermerk = r.fruehstarter ? 'Early Adopter' : 'Nutzer';
    const kontakt = r.kontakt_ok ? 'Rückfragen erlaubt — einfach auf diese Mail antworten.' : 'Rückfragen nicht erbeten.';

    const text = [
      `Neue Rückmeldung (${vermerk}) am ${wann}`,
      '',
      `Von: ${von}`,
      `Bewertung: ${sterne(r.bewertung)}`,
      `Seite: ${r.seite || '—'}`,
      '',
      r.text || '(ohne Text)',
      '',
      kontakt,
      '',
      `Alle Rückmeldungen: ${appUrl} → „Abo & Team“`,
    ].join('\n');
    const html = `<p><strong>Neue Rückmeldung (${escapeHtml(vermerk)})</strong> am ${escapeHtml(wann)}</p>
<p>Von: ${escapeHtml(von)}<br>Bewertung: <span style="color:#f59e0b">${escapeHtml(sterne(r.bewertung))}</span><br>Seite: ${escapeHtml(r.seite || '—')}</p>
<blockquote style="margin:0;padding:8px 12px;border-left:3px solid #6366f1;background:#f8fafc;white-space:pre-wrap">${escapeHtml(r.text || '(ohne Text)')}</blockquote>
<p style="color:#64748b;font-size:12px">${escapeHtml(kontakt)}<br>Alle Rückmeldungen: <a href="${escapeHtml(appUrl)}">${escapeHtml(appUrl)}</a> → „Abo &amp; Team“</p>`;

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
      ...(r.kontakt_ok && r.autor ? { replyTo: r.autor } : {}),
      subject: `Rückmeldung ${sterne(r.bewertung)} von ${von}`,
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
