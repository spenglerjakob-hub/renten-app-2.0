import type { ProjektionsErgebnis } from '@renten/engine';
import { prozent } from '../components/Feld';

/**
 * BEZUGSGROESSEN — Beitraege ins Verhaeltnis gesetzt.
 *
 * Eine Sparrate von 412 EUR sagt fuer sich wenig; „15 % des heutigen
 * Haushaltsnettos“ sagt, was sie fuer den Haushalt bedeutet. Die Bezugsgroesse
 * ist ueberall dieselbe Zahl: das Netto des laufenden Jahres aus der
 * Projektion, wie es die Basisdaten neben dem Ziel nennen.
 */

/**
 * Das heutige Haushaltsnetto im Monat — oder 0, wenn es keines gibt: ohne
 * Ergebnis, und wenn der Ruhestand schon begonnen hat (dann ist die erste
 * Zeile kein Erwerbsjahr mehr).
 */
export function nettoHeuteMonat(ergebnis: ProjektionsErgebnis | null | undefined): number {
  const z = ergebnis?.zeilen[0];
  return z && !z.vollstaendigImRuhestand ? z.nettoGesamt / 12 : 0;
}

/** „3,7 %“ — ein Betrag als Anteil am heutigen Netto; null ohne Bezugsgroesse. */
export function anteilAmNetto(betrag: number, netto: number): string | null {
  return netto > 0 && betrag > 0 ? prozent(betrag / netto, 1) : null;
}

/** Anteil an der Luecke, hoechstens 100 % — „schliesst sie ganz“ statt „134 %“. */
export function anteilAnLuecke(anteil: number): string {
  return anteil >= 0.995 ? 'ganz' : prozent(anteil, 0);
}
