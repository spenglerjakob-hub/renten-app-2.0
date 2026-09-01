/**
 * Betragsformat fuer Hinweistexte des Rechenkerns.
 *
 * Hinweise entstehen dort, wo der Grund fuer eine Zahl bekannt ist — im
 * Rechenkern. Sie muessen den Betrag deshalb selbst mitbringen; die
 * Oberflaeche bekommt einen fertigen Satz und keine Bausteine zum
 * Zusammensetzen. Stand doppelt in vertrags-tuev.ts und timeline.ts.
 */
export function euroText(n: number): string {
  return `${Math.round(n).toLocaleString('de-DE')} €`;
}
