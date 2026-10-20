/**
 * abo-webhook — Stripe meldet hier jede Buchung, Aenderung und Kuendigung;
 * die Funktion schreibt den Stand ins Buero (`privat.abos`).
 *
 * REIHENFOLGE SPIELT KEINE ROLLE: Aus dem Ereignis wird nur der Kunde
 * genommen. Das Abo selbst wird frisch bei Stripe geholt und vollstaendig
 * geschrieben — kommt ein aelteres Ereignis nach einem neueren an, schreibt
 * es trotzdem den aktuellen Stand. Hat ein Kunde mehrere Abos (ein altes,
 * gekuendigtes und ein neues), gilt das laufende.
 *
 * ECHTHEIT: Die Signatur in `Stripe-Signature` wird mit dem Signing Secret
 * des Endpunkts geprueft (Secret `STRIPE_WEBHOOK_SECRET`). Ohne gueltige
 * Signatur wird nichts geschrieben. verify_jwt ist aus — Stripe schickt
 * kein Supabase-Token.
 *
 * ANTWORTEN: 200, sobald geschrieben ist oder es nichts zu schreiben gibt
 * (etwa weil das Konto inzwischen geloescht ist). Bei einer Stoerung 500 —
 * Stripe versucht es dann bis zu drei Tage lang erneut.
 *
 * Abonnierte Ereignisse: checkout.session.completed,
 * customer.subscription.created, .updated, .deleted, .paused, .resumed.
 */
import { adminDb, antwort } from '../_shared/konto.ts';
import { aboAktiv, signaturGueltig, stripe } from '../_shared/stripe.ts';

const EREIGNISSE = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
]);

interface Preis { lookup_key: string | null; metadata: Record<string, string>; recurring: { interval: string } | null }
interface Position { quantity: number; current_period_end?: number; price: Preis }
interface Abo {
  id: string;
  status: string;
  created: number;
  cancel_at: number | null;
  cancel_at_period_end: boolean;
  current_period_end?: number;
  items: { data: Position[] };
}

const zeit = (s: number | null | undefined) => (s ? new Date(s * 1000).toISOString() : null);

/** Paket und Zahlweise des Preises — aus den Metadaten, die `abo-preise` setzt. */
function paketUndIntervall(p: Preis): { paket: string; intervall: string } | null {
  const [ausSchluessel, intervallSchluessel] = (p.lookup_key ?? '').split('_');
  const paket = p.metadata?.paket ?? ausSchluessel;
  const intervall = p.metadata?.intervall ?? intervallSchluessel
    ?? (p.recurring?.interval === 'year' ? 'jahr' : 'monat');
  if (!['alles', 'rente', 'ag'].includes(paket ?? '') || !['monat', 'jahr'].includes(intervall ?? '')) return null;
  return { paket: paket!, intervall: intervall! };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return antwort(405, { fehler: 'Nur POST' });

  const koerper = await req.text();
  const echt = await signaturGueltig(
    koerper, req.headers.get('Stripe-Signature') ?? '', Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '',
  );
  if (!echt) {
    console.warn('Webhook ohne gueltige Signatur abgewiesen');
    return antwort(400, { fehler: 'Signatur ungueltig' });
  }

  const ereignis = JSON.parse(koerper) as { id: string; type: string; data: { object: { customer?: unknown } } };
  if (!EREIGNISSE.has(ereignis.type)) return antwort(200, { status: 'ignoriert' });
  const kunde = ereignis.data.object.customer;
  if (typeof kunde !== 'string') return antwort(200, { status: 'ohne_kunde' });

  try {
    const db = adminDb();
    const { data: buero, error: fehlerBuero } = await db.rpc('buero_zu_kunde', { p_kunde: kunde });
    if (fehlerBuero) throw new Error(`buero_zu_kunde: ${fehlerBuero.message}`);
    if (typeof buero !== 'string') {
      console.warn('Kein Buero zu diesem Kunden — Konto geloescht?', kunde, ereignis.type);
      return antwort(200, { status: 'ohne_buero' });
    }

    const liste = await stripe<{ data: Abo[] }>('GET', '/v1/subscriptions', { customer: kunde, status: 'all', limit: 20 });
    const abos = [...liste.data].sort((a, b) => Number(aboAktiv(b.status)) - Number(aboAktiv(a.status)) || b.created - a.created);
    const abo = abos[0];
    const position = abo?.items.data[0];
    if (!abo || !position) return antwort(200, { status: 'ohne_abo' });

    const art = paketUndIntervall(position.price);
    if (!art) {
      console.error('Preis ohne Paket — nicht von abo-preise angelegt?', abo.id);
      return antwort(200, { status: 'unbekannter_preis' });
    }

    const laeuftBis = zeit(position.current_period_end ?? abo.current_period_end);
    const { error } = await db.rpc('abo_schreiben', {
      p_buero: buero,
      p_stripe_abo: abo.id,
      p_paket: art.paket,
      p_intervall: art.intervall,
      p_plaetze: Math.min(500, Math.max(1, position.quantity || 1)),
      p_status: abo.status,
      p_laeuft_bis: laeuftBis,
      p_kuendigung_zum: zeit(abo.cancel_at) ?? (abo.cancel_at_period_end ? laeuftBis : null),
    });
    if (error) throw new Error(`abo_schreiben: ${error.message}`);
    console.log('Abo geschrieben', ereignis.type, buero, abo.id, abo.status, art.paket, position.quantity);
    return antwort(200, { status: 'geschrieben' });
  } catch (e) {
    console.error('Webhook fehlgeschlagen', ereignis.id, e instanceof Error ? e.message : e);
    return antwort(500, { fehler: 'stoerung' });
  }
});
