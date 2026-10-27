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
export const NUTZUNGSBEDINGUNGEN_FASSUNG = '2026-10-20';

export function zustimmungDaten() {
  return { nutzungsbedingungen: NUTZUNGSBEDINGUNGEN_FASSUNG, nutzungsbedingungen_am: new Date().toISOString() };
}

/**
 * Hat das Konto der Fassung dieser Seite zugestimmt — oder einer neueren?
 *
 * Test- und Live-Seite teilen die Konten, verlangen bis zur Freigabe aber
 * verschiedene Fassungen (live die aeltere, README „Livegang“). Verlangte
 * jede Seite genau ihre eigene, fragte sie nach jeder Zustimmung auf der
 * anderen erneut, und die Zustimmung dort schriebe ihre Fassung zurueck —
 * ein Hin und Her ohne Ende. Erneut gefragt wird deshalb nur, wer eine
 * aeltere Fassung kennt. Daten im Format JJJJ-MM-TT ordnen sich als Text.
 */
export function hatZugestimmt(metadaten: Record<string, unknown> | undefined): boolean {
  const fassung = metadaten?.nutzungsbedingungen;
  return typeof fassung === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fassung) && fassung >= NUTZUNGSBEDINGUNGEN_FASSUNG;
}
