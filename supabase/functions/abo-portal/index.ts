/**
 * abo-portal — oeffnet das Stripe-Kundenportal fuer das Buero und antwortet
 * mit dessen Adresse. Dort aendert der Inhaber Plaetze und Paket, pflegt
 * Zahlungsdaten, laedt Rechnungen und kuendigt. Was er aendert, schreibt der
 * Webhook (`abo-webhook`) ins Buero.
 *
 * WER DARF: nur der Inhaber eines Bueros, das bei Stripe schon Kunde ist.
 * Mitglieder verwalten das Abo nicht.
 *
 * Das Portal laeuft mit der Konfiguration, die `abo-preise` pflegt (welche
 * Pakete, wie viele Plaetze, Kuendigung zum Laufzeitende). Fehlt sie, nimmt
 * Stripe die Standardkonfiguration aus dem Dashboard.
 */
import { aboKontext, adminDb, angemeldet, antwort, CORS, heimat } from '../_shared/konto.ts';
import { portalKonfiguration, stripe, stripeEingerichtet } from '../_shared/stripe.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return antwort(405, { fehler: 'Nur POST' });
  if (!stripeEingerichtet()) return antwort(503, { fehler: 'nicht_eingerichtet' });

  const db = adminDb();
  const nutzer = await angemeldet(req, db);
  if (!nutzer) return antwort(401, { fehler: 'Nicht angemeldet' });

  try {
    const k = await aboKontext(db, nutzer.id);
    if (!k || k.rolle !== 'inhaber' || !k.stripe_kunde) return antwort(403, { fehler: 'nur_inhaber' });

    const konfiguration = await portalKonfiguration();
    const sitzung = await stripe<{ url: string }>('POST', '/v1/billing_portal/sessions', {
      customer: k.stripe_kunde,
      configuration: konfiguration ?? undefined,
      locale: 'de',
      return_url: `${heimat(req)}/?abo`,
    });
    return antwort(200, { url: sitzung.url });
  } catch (e) {
    console.error('Portal fehlgeschlagen', e instanceof Error ? e.message : e);
    return antwort(502, { fehler: 'stoerung' });
  }
});
