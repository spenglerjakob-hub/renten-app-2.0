/**
 * Stripe ohne SDK: ein schmaler Aufruf der REST-API und die Pruefung der
 * Webhook-Signatur. Gemeinsam genutzt von `abo-kasse`, `abo-portal`,
 * `abo-webhook` und `abo-preise`.
 *
 * DIE API-VERSION IST FEST. Stripe aendert die Form der Antworten nur mit
 * einer neuen Version; ohne Angabe gaelte die Version des Kontos, und eine
 * Umstellung dort koennte die Funktionen still brechen.
 *
 * DER SCHLUESSEL kommt aus dem Secret `STRIPE_SECRET_KEY` (Supabase → Edge
 * Functions → Secrets). Ein Testschluessel (`sk_test_`) bucht nur in der
 * Sandbox, ein Live-Schluessel (`sk_live_`) echt.
 */

export const STRIPE_VERSION = '2025-03-31.basil';

export class StripeFehler extends Error {
  constructor(public status: number, public code: string | undefined, nachricht: string) {
    super(nachricht);
  }
}

export const stripeEingerichtet = () => (Deno.env.get('STRIPE_SECRET_KEY') ?? '') !== '';

type Wert = string | number | boolean | null | undefined | Wert[] | { [k: string]: Wert };

/** Verschachtelte Werte so, wie Stripe sie erwartet: `a[b][0][c]=x`. */
function formular(werte: Record<string, Wert>): URLSearchParams {
  const p = new URLSearchParams();
  const hinzu = (schluessel: string, w: Wert) => {
    if (w === undefined || w === null) return;
    if (Array.isArray(w)) w.forEach((x, i) => hinzu(`${schluessel}[${i}]`, x));
    else if (typeof w === 'object') for (const [k, x] of Object.entries(w)) hinzu(`${schluessel}[${k}]`, x);
    else p.append(schluessel, String(w));
  };
  for (const [k, w] of Object.entries(werte)) hinzu(k, w);
  return p;
}

/**
 * Ein Aufruf der Stripe-API. GET und DELETE schicken die Werte in der
 * Adresse, POST im Koerper. Schreibende Aufrufe koennen einen
 * Idempotenzschluessel mitgeben — ein doppelter Klick legt dann nichts doppelt an.
 */
export async function stripe<T = Record<string, unknown>>(
  methode: 'GET' | 'POST' | 'DELETE',
  pfad: string,
  werte: Record<string, Wert> = {},
  idempotenz?: string,
): Promise<T> {
  const schluessel = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
  if (!schluessel) throw new StripeFehler(500, 'kein_schluessel', 'STRIPE_SECRET_KEY fehlt');
  const form = formular(werte).toString();
  const mitAdresse = methode !== 'POST' && form !== '';
  const kopf: Record<string, string> = {
    Authorization: `Bearer ${schluessel}`,
    'Stripe-Version': STRIPE_VERSION,
  };
  if (methode === 'POST') kopf['Content-Type'] = 'application/x-www-form-urlencoded';
  if (idempotenz) kopf['Idempotency-Key'] = idempotenz;
  const antwort = await fetch(`https://api.stripe.com${pfad}${mitAdresse ? `?${form}` : ''}`, {
    method: methode,
    headers: kopf,
    body: methode === 'POST' ? form : undefined,
  });
  const inhalt = await antwort.json().catch(() => ({})) as Record<string, unknown>;
  if (!antwort.ok) {
    const f = (inhalt.error ?? {}) as { code?: string; message?: string };
    throw new StripeFehler(antwort.status, f.code, f.message ?? `Stripe antwortet ${antwort.status}`);
  }
  return inhalt as T;
}

/** Laeuft ein Abo mit diesem Status? Wie `privat.abo_aktiv` in der Datenbank. */
export const aboAktiv = (status: unknown) =>
  status === 'active' || status === 'trialing' || status === 'past_due';

// ---------------------------------------------------------------------------
// Webhook-Signatur
// ---------------------------------------------------------------------------

/** Aelter darf ein Ereignis nicht sein — gegen wiederholt eingespielte Anfragen. */
const TOLERANZ_S = 300;

function hex(puffer: ArrayBuffer): string {
  return [...new Uint8Array(puffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Vergleich in fester Zeit: Die Dauer verraet nicht, ab wo die Signatur abweicht. */
function gleich(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i += 1) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/**
 * Stammt die Anfrage von Stripe? Kopfzeile `Stripe-Signature: t=…,v1=…`;
 * signiert ist `<t>.<Koerper>` mit HMAC-SHA256 und dem Signing Secret des
 * Endpunkts (`whsec_…`) als Schluessel.
 */
export async function signaturGueltig(koerper: string, kopfzeile: string, geheimnis: string, jetzt = Date.now()): Promise<boolean> {
  if (!geheimnis || !kopfzeile) return false;
  const teile = kopfzeile.split(',').map((t) => t.split('=') as [string, string]);
  const t = teile.find(([k]) => k === 't')?.[1];
  const signaturen = teile.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || !/^\d+$/.test(t) || signaturen.length === 0) return false;
  if (Math.abs(jetzt / 1000 - Number(t)) > TOLERANZ_S) return false;
  const schluessel = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(geheimnis), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const erwartet = hex(await crypto.subtle.sign('HMAC', schluessel, new TextEncoder().encode(`${t}.${koerper}`)));
  return signaturen.some((s) => gleich(s, erwartet));
}

// ---------------------------------------------------------------------------
// Was `abo-preise` in Stripe anlegt und die anderen Funktionen wiederfinden
// ---------------------------------------------------------------------------

/** Produkt je Paket — eigene IDs, damit der Abgleich sie wiederfindet. */
export const produktId = (paket: string) => `rentenplaner_${paket}`;
/** Der Early-Adopter-Rabatt: ein Gutschein mit fester ID. */
export const FRUEHSTART_GUTSCHEIN = 'rentenplaner_fruehstart';
/** Markierung in den Metadaten von Steuersatz und Portal-Konfiguration */
export const MARKE = 'rentenplaner';

interface Liste<T> { data: T[] }

/**
 * Der Steuersatz "USt. 19 %" (exklusiv, Deutschland). Mit dem Secret
 * `STRIPE_STEUER=automatisch` rechnet stattdessen Stripe Tax — dann gibt es
 * keinen festen Satz, und die Funktion liefert null.
 */
export const stripeTaxAktiv = () => Deno.env.get('STRIPE_STEUER') === 'automatisch';

export async function steuersatz(): Promise<string | null> {
  if (stripeTaxAktiv()) return null;
  const l = await stripe<Liste<{ id: string; metadata: Record<string, string> }>>(
    'GET', '/v1/tax_rates', { active: true, limit: 100 },
  );
  return l.data.find((t) => t.metadata?.[MARKE] === 'ust')?.id ?? null;
}

/** Die Konfiguration des Kundenportals, die `abo-preise` pflegt. */
export async function portalKonfiguration(): Promise<string | null> {
  const l = await stripe<Liste<{ id: string; metadata: Record<string, string> }>>(
    'GET', '/v1/billing_portal/configurations', { active: true, limit: 100 },
  );
  return l.data.find((k) => k.metadata?.[MARKE] === 'portal')?.id ?? null;
}
