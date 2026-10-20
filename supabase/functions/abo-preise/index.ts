/**
 * abo-preise — "Preise in Stripe abgleichen" (nur fuer den Betreiber).
 *
 * Bringt Stripe auf den Stand von `packages/schema/src/preise.ts`. Die
 * Oberflaeche schickt die Staffeln von dort mit; hier steht kein Preis.
 * Angelegt bzw. nachgezogen werden:
 *   - je Paket ein Produkt (`rentenplaner_<paket>`),
 *   - je Paket und Zahlweise ein Staffelpreis (tiers_mode "volume") mit dem
 *     Lookup-Key `<paket>_<intervall>`,
 *   - der Early-Adopter-Gutschein (Prozent aufs erste Jahr),
 *   - der Steuersatz "USt. 19 %", exklusiv (entfaellt mit Stripe Tax),
 *   - die Konfiguration des Kundenportals: Pakete und Zahlweisen wechseln,
 *     Plaetze aendern, Kuendigung zum Laufzeitende.
 *
 * IDEMPOTENT: Was schon stimmt, bleibt. Ein Preis in Stripe laesst sich nicht
 * aendern — weicht eine Staffel ab, entsteht ein neuer Preis, der den
 * Lookup-Key uebernimmt; der alte wird archiviert. Laufende Abos behalten
 * ihren alten Preis, bis man sie bewusst umstellt.
 */
import { aboKontext, adminDb, angemeldet, antwort, CORS } from '../_shared/konto.ts';
import {
  FRUEHSTART_GUTSCHEIN, MARKE, portalKonfiguration, produktId, steuersatz, stripe, stripeEingerichtet,
  StripeFehler, stripeTaxAktiv,
} from '../_shared/stripe.ts';

/** Umsatzsteuer in Deutschland — kein Preis, deshalb hier. */
const UST_PROZENT = 19;
/** Der Early-Adopter-Rabatt gilt fuer die ersten zwoelf Monate. */
const RABATT_MONATE = 12;
const SEITE = 'https://js-rentenplaner.de';

type Staffel = { up_to: number | 'inf'; unit_amount: number };
interface PaketEingabe { id: string; name: string; kurz: string; staffeln: { monat: Staffel[]; jahr: Staffel[] } }
interface Preis {
  id: string;
  product: string;
  currency: string;
  tax_behavior: string | null;
  recurring: { interval: string } | null;
  tiers?: { up_to: number | null; unit_amount: number | null }[];
}

const INTERVALL = { monat: 'month', jahr: 'year' } as const;

function staffelnGueltig(s: unknown): s is Staffel[] {
  return Array.isArray(s) && s.length > 0 && s.length <= 10 && s.every((x, i) =>
    x && typeof x === 'object'
    && Number.isInteger((x as Staffel).unit_amount) && (x as Staffel).unit_amount > 0
    && (i === s.length - 1 ? (x as Staffel).up_to === 'inf'
      : Number.isInteger((x as Staffel).up_to) && ((x as Staffel).up_to as number) > 0));
}

function eingabeGueltig(e: Record<string, unknown>): { pakete: PaketEingabe[]; rabatt: number; maxPlaetze: number } | null {
  const pakete = e.pakete;
  const rabatt = Number(e.rabattProzent);
  const maxPlaetze = Number(e.maxPlaetze);
  if (!Array.isArray(pakete) || pakete.length === 0 || pakete.length > 5) return null;
  if (!Number.isInteger(rabatt) || rabatt < 0 || rabatt > 100) return null;
  if (!Number.isInteger(maxPlaetze) || maxPlaetze < 1 || maxPlaetze > 500) return null;
  for (const p of pakete as PaketEingabe[]) {
    if (!['alles', 'rente', 'ag'].includes(p?.id) || typeof p.name !== 'string' || typeof p.kurz !== 'string') return null;
    if (!staffelnGueltig(p.staffeln?.monat) || !staffelnGueltig(p.staffeln?.jahr)) return null;
  }
  return { pakete: pakete as PaketEingabe[], rabatt, maxPlaetze };
}

/** Stimmt der Preis in Stripe mit den Staffeln ueberein? */
function gleich(p: Preis, produkt: string, intervall: 'month' | 'year', staffeln: Staffel[]): boolean {
  if (p.product !== produkt || p.currency !== 'eur' || p.tax_behavior !== 'exclusive' || p.recurring?.interval !== intervall) return false;
  const t = p.tiers ?? [];
  return t.length === staffeln.length && t.every((x, i) =>
    x.unit_amount === staffeln[i]!.unit_amount && (x.up_to ?? 'inf') === staffeln[i]!.up_to);
}

async function produktSichern(p: PaketEingabe): Promise<string> {
  const id = produktId(p.id);
  try {
    const da = await stripe<{ name: string; description: string | null; active: boolean }>('GET', `/v1/products/${id}`);
    if (da.name === p.name && da.description === p.kurz && da.active) return 'unveraendert';
    await stripe('POST', `/v1/products/${id}`, { name: p.name, description: p.kurz, active: true });
    return 'aktualisiert';
  } catch (e) {
    if (!(e instanceof StripeFehler && e.status === 404)) throw e;
  }
  await stripe('POST', '/v1/products', { id, name: p.name, description: p.kurz, metadata: { paket: p.id } });
  return 'neu';
}

async function preisSichern(p: PaketEingabe, intervall: 'monat' | 'jahr'): Promise<{ id: string; stand: string }> {
  const schluessel = `${p.id}_${intervall}`;
  const produkt = produktId(p.id);
  const staffeln = p.staffeln[intervall];
  const l = await stripe<{ data: Preis[] }>('GET', '/v1/prices', {
    lookup_keys: [schluessel], active: true, limit: 1, expand: ['data.tiers'],
  });
  const alt = l.data[0];
  if (alt && gleich(alt, produkt, INTERVALL[intervall], staffeln)) return { id: alt.id, stand: 'unveraendert' };
  const neu = await stripe<{ id: string }>('POST', '/v1/prices', {
    product: produkt,
    currency: 'eur',
    billing_scheme: 'tiered',
    tiers_mode: 'volume',
    tiers: staffeln,
    recurring: { interval: INTERVALL[intervall] },
    tax_behavior: 'exclusive',
    lookup_key: schluessel,
    transfer_lookup_key: true,
    nickname: `${p.name}, ${intervall === 'jahr' ? 'jährlich' : 'monatlich'}`,
    metadata: { paket: p.id, intervall },
  });
  if (alt) await stripe('POST', `/v1/prices/${alt.id}`, { active: false });
  return { id: neu.id, stand: alt ? 'ersetzt' : 'neu' };
}

async function gutscheinSichern(prozent: number): Promise<string> {
  try {
    const da = await stripe<{ percent_off: number | null; duration: string; duration_in_months: number | null }>(
      'GET', `/v1/coupons/${FRUEHSTART_GUTSCHEIN}`,
    );
    if (da.percent_off === prozent && da.duration === 'repeating' && da.duration_in_months === RABATT_MONATE) return 'unveraendert';
    // Ein Gutschein laesst sich nicht aendern. Loeschen beruehrt keine Abos,
    // die ihn schon haben — sie behalten ihren Rabatt.
    await stripe('DELETE', `/v1/coupons/${FRUEHSTART_GUTSCHEIN}`);
  } catch (e) {
    if (!(e instanceof StripeFehler && e.status === 404)) throw e;
  }
  if (prozent === 0) return 'entfernt';
  await stripe('POST', '/v1/coupons', {
    id: FRUEHSTART_GUTSCHEIN,
    percent_off: prozent,
    duration: 'repeating',
    duration_in_months: RABATT_MONATE,
    name: `Early Adopter: ${prozent} % im ersten Jahr`,
  });
  return 'neu';
}

async function steuersatzSichern(): Promise<string> {
  if (stripeTaxAktiv()) return 'stripe_tax';
  if (await steuersatz()) return 'unveraendert';
  await stripe('POST', '/v1/tax_rates', {
    display_name: 'USt.',
    description: `Umsatzsteuer ${UST_PROZENT} %`,
    percentage: UST_PROZENT,
    inclusive: false,
    country: 'DE',
    jurisdiction: 'DE',
    tax_type: 'vat',
    metadata: { [MARKE]: 'ust' },
  });
  return 'neu';
}

async function portalSichern(produkte: { produkt: string; preise: string[] }[], maxPlaetze: number): Promise<string> {
  const werte = {
    business_profile: {
      headline: 'JS-Rentenplaner: Abo, Plätze und Rechnungen',
      privacy_policy_url: `${SEITE}/datenschutz`,
      terms_of_service_url: `${SEITE}/nutzungsbedingungen`,
    },
    default_return_url: `${SEITE}/?abo`,
    features: {
      customer_update: { enabled: true, allowed_updates: ['address', 'email', 'name', 'tax_id'] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: {
        enabled: true,
        mode: 'at_period_end',
        cancellation_reason: {
          enabled: true,
          options: ['too_expensive', 'missing_features', 'switched_service', 'unused', 'too_complex', 'other'],
        },
      },
      subscription_update: {
        enabled: true,
        default_allowed_updates: ['price', 'quantity'],
        products: produkte.map((p) => ({
          product: p.produkt,
          prices: p.preise,
          adjustable_quantity: { enabled: true, minimum: 1, maximum: maxPlaetze },
        })),
        // Mehr Plaetze oder ein groesseres Paket: die Differenz fuer den laufenden
        // Zeitraum sofort abrechnen. Sonst landet sie auf der naechsten Rechnung,
        // und deren Summe sieht aus, als fehle der Mengenrabatt.
        proration_behavior: 'always_invoice',
        // Weniger Plaetze, ein kleineres Paket oder monatlich statt jaehrlich:
        // erst zum Ende des bezahlten Zeitraums.
        schedule_at_period_end: { conditions: [{ type: 'decreasing_item_amount' }, { type: 'shortening_interval' }] },
      },
    },
    metadata: { [MARKE]: 'portal' },
  };
  const da = await portalKonfiguration();
  if (da) {
    await stripe('POST', `/v1/billing_portal/configurations/${da}`, werte);
    return 'aktualisiert';
  }
  await stripe('POST', '/v1/billing_portal/configurations', werte);
  return 'neu';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return antwort(405, { fehler: 'Nur POST' });
  if (!stripeEingerichtet()) return antwort(503, { fehler: 'nicht_eingerichtet' });

  const db = adminDb();
  const nutzer = await angemeldet(req, db);
  if (!nutzer) return antwort(401, { fehler: 'Nicht angemeldet' });

  const eingabe = eingabeGueltig(await req.json().catch(() => ({})) as Record<string, unknown>);
  if (!eingabe) return antwort(400, { fehler: 'ungueltig' });

  try {
    const k = await aboKontext(db, nutzer.id);
    if (!k?.betreiber) return antwort(403, { fehler: 'nur_betreiber' });

    const bericht: Record<string, string> = {};
    const fuersPortal: { produkt: string; preise: string[] }[] = [];
    for (const p of eingabe.pakete) {
      bericht[`produkt ${p.id}`] = await produktSichern(p);
      const monat = await preisSichern(p, 'monat');
      const jahr = await preisSichern(p, 'jahr');
      bericht[`${p.id}_monat`] = monat.stand;
      bericht[`${p.id}_jahr`] = jahr.stand;
      fuersPortal.push({ produkt: produktId(p.id), preise: [monat.id, jahr.id] });
    }
    bericht.gutschein = await gutscheinSichern(eingabe.rabatt);
    bericht.steuersatz = await steuersatzSichern();
    bericht.portal = await portalSichern(fuersPortal, eingabe.maxPlaetze);

    const modus = (Deno.env.get('STRIPE_SECRET_KEY') ?? '').startsWith('sk_live_') ? 'live' : 'test';
    console.log('Preise abgeglichen', modus, JSON.stringify(bericht));
    return antwort(200, { modus, bericht });
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e);
    console.error('Abgleich fehlgeschlagen', text);
    return antwort(502, { fehler: 'stoerung', meldung: text });
  }
});
