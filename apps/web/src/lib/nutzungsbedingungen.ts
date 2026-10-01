/**
 * Fassung der Nutzungsbedingungen, der ein Konto zugestimmt hat.
 *
 * Steht im user_metadata des Kontos (`nutzungsbedingungen`, dazu der
 * Zeitpunkt in `nutzungsbedingungen_am`). user_metadata kann der Nutzer selbst
 * aendern — fuer eine Berechtigung taugte es deshalb nicht. Hier ist es nur
 * der Nachweis, WELCHER Fassung zugestimmt wurde.
 *
 * Neue Fassung: Datum hochsetzen. Dann fragt die Zugangsschranke jedes Konto
 * beim naechsten Besuch einmal erneut.
 */
export const NUTZUNGSBEDINGUNGEN_FASSUNG = '2026-10-01';

export function zustimmungDaten() {
  return { nutzungsbedingungen: NUTZUNGSBEDINGUNGEN_FASSUNG, nutzungsbedingungen_am: new Date().toISOString() };
}
