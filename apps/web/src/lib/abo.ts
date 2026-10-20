import { useState } from 'react';
import {
  FRUEHSTART_RABATT_PROZENT, MAX_NUTZER, PAKETE, stripeStaffeln, type Intervall, type PaketId,
} from '@renten/schema/preise';
import { supabase } from './supabase';

/**
 * Buchen und Verwalten des Abos — beides bei Stripe.
 *
 * Die Edge Functions `abo-kasse` und `abo-portal` legen eine Checkout- bzw.
 * Portal-Sitzung an und antworten mit deren Adresse; der Browser geht
 * dorthin und kommt danach zurueck. Hier steht weder ein Preis noch ein
 * Schluessel: Stripe rechnet mit den Preisen, die aus `@renten/schema`
 * angelegt wurden.
 *
 * Aufgerufen wird nur, wenn `zahlung_bereit` gesetzt ist (siehe
 * `mein_zugang()`) — vorher sind die Knoepfe gesperrt.
 */

export type Weiterleitung = { url: string } | { fehler: string };

/** Nur echte Stripe-Seiten — die Antwort bestimmt, wohin der Browser geht. */
const STRIPE_SEITE = /^https:\/\/(checkout|billing)\.stripe\.com\//;

async function aufrufen(funktion: string, body: Record<string, unknown>): Promise<Weiterleitung> {
  if (!supabase) return { fehler: 'Die Anmeldung ist nicht eingerichtet.' };
  const { data, error } = await supabase.functions.invoke(funktion, { body });
  const url = (data as { url?: unknown } | null)?.url;
  if (error || typeof url !== 'string' || !STRIPE_SEITE.test(url)) {
    return { fehler: 'Die Verbindung zum Zahlungsdienst hat nicht geklappt. Bitte versuchen Sie es gleich noch einmal.' };
  }
  return { url };
}

/** Zur Kasse: Paket, Zahlweise und Zahl der Plaetze. */
export const zurKasse = (paket: PaketId, intervall: Intervall, plaetze: number) =>
  aufrufen('abo-kasse', { paket, intervall, plaetze });

/** Ins Kundenportal: Zahlungsdaten, Rechnungen, Plaetze, Paketwechsel, Kuendigung. */
export const zumPortal = () => aufrufen('abo-portal', {});

/**
 * Fuer Knoepfe, die zu Stripe fuehren: laedt, bis die Seite wechselt, und
 * zeigt sonst den Fehler.
 */
export function useWeiterleitung() {
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const los = async (aufruf: () => Promise<Weiterleitung>) => {
    setLaedt(true);
    setFehler(null);
    const r = await aufruf();
    if ('url' in r) {
      window.location.assign(r.url);
      return;
    }
    setLaedt(false);
    setFehler(r.fehler);
  };
  return { laedt, fehler, los };
}

export type Abgleich = { modus: 'test' | 'live'; bericht: Record<string, string> } | { fehler: string };

/**
 * "Preise in Stripe abgleichen" — nur fuer den Betreiber. Schickt die
 * Staffeln aus `@renten/schema` an `abo-preise`; die Funktion legt Produkte,
 * Preise, Gutschein, Steuersatz und Kundenportal an oder zieht sie nach.
 */
export async function preiseAbgleichen(): Promise<Abgleich> {
  if (!supabase) return { fehler: 'Die Anmeldung ist nicht eingerichtet.' };
  const { data, error } = await supabase.functions.invoke('abo-preise', {
    body: {
      pakete: PAKETE.map((p) => ({
        id: p.id, name: p.name, kurz: p.kurz,
        staffeln: { monat: stripeStaffeln(p.id, 'monat'), jahr: stripeStaffeln(p.id, 'jahr') },
      })),
      rabattProzent: FRUEHSTART_RABATT_PROZENT,
      maxPlaetze: MAX_NUTZER,
    },
  });
  const r = data as { modus?: unknown; bericht?: unknown } | null;
  if (error || (r?.modus !== 'test' && r?.modus !== 'live') || !r.bericht || typeof r.bericht !== 'object') {
    let meldung = '';
    try { meldung = String(((await (error as { context?: Response })?.context?.json()) as { meldung?: unknown })?.meldung ?? ''); } catch { /* ohne Text */ }
    return { fehler: `Der Abgleich hat nicht geklappt.${meldung ? ` Stripe meldet: ${meldung}` : ''}` };
  }
  return { modus: r.modus, bericht: r.bericht as Record<string, string> };
}
