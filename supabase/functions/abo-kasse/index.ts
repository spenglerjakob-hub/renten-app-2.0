/**
 * abo-kasse — legt eine Stripe-Checkout-Sitzung fuer ein Abo an und
 * antwortet mit deren Adresse. Der Browser geht dorthin, Stripe nimmt die
 * Zahlungsdaten auf und leitet danach auf `/?abo=gebucht` zurueck.
 *
 * Gebucht ist erst, wenn der Webhook (`abo-webhook`) das Abo geschrieben
 * hat — die Kasse selbst schreibt kein Abo, nur das Buero und den Kunden.
 *
 * WER DARF: ein angemeldetes Konto, das kein Mitglied eines fremden Bueros
 * ist und noch kein laufendes Abo hat. Die Buchung muss freigeschaltet sein
 * (`abo_kontext().zahlung_bereit`; anfangs nur fuer den Betreiber).
 *
 * PREISE stehen hier nicht. Gebucht wird der Stripe-Preis mit dem
 * Lookup-Key `<paket>_<intervall>`, den `abo-preise` aus
 * `packages/schema/src/preise.ts` angelegt hat. Der Mengenrabatt steckt in
 * dessen Staffeln.
 *
 * EARLY ADOPTER bekommen den Gutschein (20 % aufs erste Jahr) automatisch —
 * beim ersten Abo ihres Bueros, nicht bei jedem weiteren.
 */
import { aboKontext, adminDb, angemeldet, antwort, CORS, heimat } from '../_shared/konto.ts';
import {
  aboAktiv, FRUEHSTART_GUTSCHEIN, steuersatz, stripe, stripeEingerichtet, StripeFehler, stripeTaxAktiv,
} from '../_shared/stripe.ts';

const PAKETE = ['alles', 'rente', 'ag'];
const INTERVALLE = ['monat', 'jahr'];
/** Muss zu MAX_NUTZER in packages/schema/src/preise.ts passen — darueber gibt es ein Angebot. */
const MAX_PLAETZE = 50;

interface Liste<T> { data: T[] }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return antwort(405, { fehler: 'Nur POST' });
  if (!stripeEingerichtet()) return antwort(503, { fehler: 'nicht_eingerichtet' });

  const eingabe = await req.json().catch(() => ({})) as Record<string, unknown>;
  const paket = String(eingabe.paket ?? '');
  const intervall = String(eingabe.intervall ?? '');
  const plaetze = Number(eingabe.plaetze);
  if (!PAKETE.includes(paket) || !INTERVALLE.includes(intervall)
    || !Number.isInteger(plaetze) || plaetze < 1 || plaetze > MAX_PLAETZE) {
    return antwort(400, { fehler: 'ungueltig' });
  }

  const db = adminDb();
  const nutzer = await angemeldet(req, db);
  if (!nutzer) return antwort(401, { fehler: 'Nicht angemeldet' });

  try {
    const k = await aboKontext(db, nutzer.id);
    if (!k) return antwort(401, { fehler: 'Nicht angemeldet' });
    if (!k.zahlung_bereit) return antwort(403, { fehler: 'nicht_bereit' });
    if (k.rolle === 'mitglied') return antwort(403, { fehler: 'nur_inhaber' });
    if (k.abo_aktiv) return antwort(409, { fehler: 'abo_laeuft' });

    const { data: buero, error: fehlerBuero } = await db.rpc('buero_sichern', { p_nutzer: nutzer.id, p_name: '' });
    if (fehlerBuero || typeof buero !== 'string') throw new Error(`buero_sichern: ${fehlerBuero?.message}`);

    let kunde = k.stripe_kunde;
    if (!kunde) {
      const neu = await stripe<{ id: string }>('POST', '/v1/customers', {
        email: nutzer.email ?? undefined,
        preferred_locales: ['de'],
        metadata: { buero, nutzer: nutzer.id },
      }, `kunde-${buero}`);
      kunde = neu.id;
      const { error } = await db.rpc('buero_stripe_kunde', { p_buero: buero, p_kunde: kunde });
      if (error) throw new Error(`buero_stripe_kunde: ${error.message}`);
    }

    // Der Webhook kann ein paar Sekunden hinterherhinken: Laeuft bei Stripe
    // schon ein Abo, nicht ein zweites verkaufen.
    const abos = await stripe<Liste<{ status: string }>>('GET', '/v1/subscriptions', { customer: kunde, status: 'all', limit: 10 });
    if (abos.data.some((a) => aboAktiv(a.status))) return antwort(409, { fehler: 'abo_laeuft' });

    const schluessel = `${paket}_${intervall}`;
    const preise = await stripe<Liste<{ id: string }>>('GET', '/v1/prices', { lookup_keys: [schluessel], active: true, limit: 1 });
    const preis = preise.data[0]?.id;
    const satz = await steuersatz();
    if (!preis || (!satz && !stripeTaxAktiv())) {
      console.error('Preise in Stripe fehlen — in "Abo & Team" abgleichen', schluessel, satz);
      return antwort(503, { fehler: 'preise_fehlen' });
    }

    let rabatt: { coupon: string }[] | undefined;
    if (k.fruehstarter && !k.stripe_abo) {
      try {
        await stripe('GET', `/v1/coupons/${FRUEHSTART_GUTSCHEIN}`);
        rabatt = [{ coupon: FRUEHSTART_GUTSCHEIN }];
      } catch (e) {
        if (!(e instanceof StripeFehler && e.status === 404)) throw e;
        console.error('Early-Adopter-Gutschein fehlt — in "Abo & Team" abgleichen');
      }
    }

    const basis = heimat(req);
    const sitzung = await stripe<{ url: string }>('POST', '/v1/checkout/sessions', {
      mode: 'subscription',
      customer: kunde,
      client_reference_id: buero,
      line_items: [{ price: preis, quantity: plaetze }],
      subscription_data: {
        metadata: { buero, paket, intervall },
        default_tax_rates: satz ? [satz] : undefined,
      },
      automatic_tax: stripeTaxAktiv() ? { enabled: true } : undefined,
      discounts: rabatt,
      billing_address_collection: 'required',
      customer_update: { address: 'auto', name: 'auto' },
      tax_id_collection: { enabled: true },
      locale: 'de',
      success_url: `${basis}/?abo=gebucht`,
      cancel_url: `${basis}/?abo`,
    });
    console.log('Kasse geoeffnet', buero, schluessel, plaetze, rabatt ? '(Early Adopter)' : '');
    return antwort(200, { url: sitzung.url });
  } catch (e) {
    console.error('Kasse fehlgeschlagen', e instanceof Error ? e.message : e);
    return antwort(502, { fehler: 'stoerung' });
  }
});
