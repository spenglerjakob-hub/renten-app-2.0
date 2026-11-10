import { exportiere, importiere, type SzenarioParsed } from '@renten/schema';

/**
 * DER MUSTERFALL — ein Fall aus der Schnellrechnung, der auf das Konto wartet.
 *
 * „Fall speichern“ auf der Schnellrechnung legt ihn hier ab; nach der
 * Anmeldung holt ihn der Rechner ab (`App.tsx`). Er liegt NUR in diesem
 * Browser — kein Server sieht ihn, bevor es ein Konto gibt — und hoechstens
 * 14 Tage: Danach raeumt die naechste Abfrage ihn weg. Die Frist ist
 * Aufraeumen, kein Countdown; angezeigt wird sie nirgends.
 *
 * Dasselbe Muster wie der Vorsorge-Check (Szenario im Speicher, dann zum
 * Rechner) und dieselbe Frist wie die persoenlichen Links.
 */

const SCHLUESSEL = 'rentenplaner.musterfall.v1';
const TAGE = 14;

/**
 * Woher der Fall kommt. Die Vertragspruefung legt ihren Fall auf demselben
 * Weg ab („Im Rechner weiterrechnen“) — das Band im Rechner nennt die Quelle.
 * Aeltere Eintraege ohne Angabe stammen aus der Schnellrechnung.
 */
export type Herkunft = 'schnellrechnung' | 'vertragspruefung';
export const HERKUNFT_TEXT: Record<Herkunft, string> = {
  schnellrechnung: 'aus der Schnellrechnung',
  vertragspruefung: 'aus der Vertragsprüfung',
};

interface Abgelegt {
  seit: number;
  /** Eine Zeile fuer die Anmeldemaske: „Jahrgang 1985 · 4.000 € brutto · …“ */
  kurz: string;
  szenario: string;
  herkunft?: Herkunft;
}

export interface Musterfall {
  szenario: SzenarioParsed;
  kurz: string;
  herkunft: Herkunft;
}

export function musterfallMerken(szenario: SzenarioParsed, kurz: string, herkunft: Herkunft = 'schnellrechnung'): boolean {
  try {
    const wert: Abgelegt = { seit: Date.now(), kurz, szenario: exportiere(szenario), herkunft };
    localStorage.setItem(SCHLUESSEL, JSON.stringify(wert));
    return true;
  } catch {
    return false;
  }
}

export function offenerMusterfall(jetzt = Date.now()): Musterfall | null {
  try {
    const roh = localStorage.getItem(SCHLUESSEL);
    if (!roh) return null;
    const a = JSON.parse(roh) as Partial<Abgelegt>;
    const r = typeof a.szenario === 'string' ? importiere(a.szenario) : null;
    if (!r?.ok || typeof a.seit !== 'number' || jetzt - a.seit > TAGE * 86_400_000) {
      localStorage.removeItem(SCHLUESSEL);
      return null;
    }
    return {
      szenario: r.szenario,
      kurz: typeof a.kurz === 'string' ? a.kurz : '',
      herkunft: a.herkunft === 'vertragspruefung' ? 'vertragspruefung' : 'schnellrechnung',
    };
  } catch {
    return null;
  }
}

export function musterfallVerwerfen(): void {
  try { localStorage.removeItem(SCHLUESSEL); } catch { /* Speicher gesperrt */ }
}
