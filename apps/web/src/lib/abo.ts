import { useState } from 'react';
import type { Intervall, PaketId } from '@renten/schema/preise';
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
