import { GRENZEN, farbeNormal, type Auftritt } from '../features/auftritt';

/**
 * DER AUFTRITT AUS DER SCHNELLRECHNUNG — Logo, Firmenname und Farbe, bevor
 * es ein Konto gibt.
 *
 * Wie der Musterfall (`lib/musterfall.ts`): Er liegt NUR in diesem Browser —
 * kein Server sieht ihn, bevor es ein Konto gibt — und hoechstens 14 Tage.
 * Die Frist ist Aufraeumen, kein Countdown; angezeigt wird sie nirgends.
 * Nach der Anmeldung uebernimmt ihn der Rechner ins Konto (`App.tsx`).
 *
 * Gespeichert wird bei jeder Aenderung; das Logo als Data-URL, so wie
 * `logoVorbereiten` es liefert (PNG oder WebP, hoechstens 1 MB).
 */

const SCHLUESSEL = 'rentenplaner.auftritt.v1';
const TAGE = 14;
const LOGO_MUSTER = /^data:image\/(png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

/** Was die Schnellrechnung anbietet. Name und Kontakt kommen erst im Konto dazu. */
export type AuftrittEntwurf = Pick<Auftritt, 'firma' | 'farbe' | 'logo'>;

interface Abgelegt extends AuftrittEntwurf {
  seit: number;
}

const leer = (e: AuftrittEntwurf) => !e.logo && e.firma.trim() === '' && !e.farbe;

/**
 * 'voll': Der Speicher des Browsers reicht nicht (ein grosses Logo) — die
 * Seite behaelt den Entwurf dann nur bis zum Neuladen und sagt das.
 */
export function auftrittLokalMerken(e: AuftrittEntwurf, jetzt = Date.now()): 'ok' | 'voll' | 'gesperrt' {
  try {
    if (leer(e)) {
      localStorage.removeItem(SCHLUESSEL);
      return 'ok';
    }
    const wert: Abgelegt = {
      seit: jetzt,
      firma: e.firma.slice(0, GRENZEN.firma),
      farbe: farbeNormal(e.farbe),
      logo: e.logo && LOGO_MUSTER.test(e.logo) ? e.logo : null,
    };
    localStorage.setItem(SCHLUESSEL, JSON.stringify(wert));
    return 'ok';
  } catch (fehler) {
    const name = (fehler as { name?: string } | null)?.name ?? '';
    return /quota/i.test(name) ? 'voll' : 'gesperrt';
  }
}

export function offenerAuftrittLokal(jetzt = Date.now()): AuftrittEntwurf | null {
  try {
    const roh = localStorage.getItem(SCHLUESSEL);
    if (!roh) return null;
    const a = lesen(roh);
    if (!a
      || typeof a.seit !== 'number' || jetzt - a.seit > TAGE * 86_400_000
      || typeof a.firma !== 'string' || a.firma.length > GRENZEN.firma
      || !(a.farbe === null || farbeNormal(a.farbe) === a.farbe)
      || !(a.logo === null || (typeof a.logo === 'string' && LOGO_MUSTER.test(a.logo)))) {
      // Abgelaufen oder kaputt: weg damit, statt es zu laden.
      localStorage.removeItem(SCHLUESSEL);
      return null;
    }
    const e: AuftrittEntwurf = { firma: a.firma, farbe: a.farbe ?? null, logo: a.logo ?? null };
    return leer(e) ? null : e;
  } catch {
    return null;
  }
}

function lesen(roh: string): Partial<Abgelegt> | null {
  try {
    const a: unknown = JSON.parse(roh);
    return a !== null && typeof a === 'object' ? (a as Partial<Abgelegt>) : null;
  } catch {
    return null;
  }
}

export function auftrittLokalVerwerfen(): void {
  try { localStorage.removeItem(SCHLUESSEL); } catch { /* Speicher gesperrt */ }
}
