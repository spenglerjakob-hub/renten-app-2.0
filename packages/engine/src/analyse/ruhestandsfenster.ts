import type { Jahreszeile, ProjektionsErgebnis } from '../projection/timeline.js';

/**
 * Die Jahre, die im Gutachten gezeigt werden.
 *
 * Der Bildschirm zeigt die ganze Zeitachse — vom heutigen Jahr bis zum
 * 100. Lebensjahr. Auf Papier ist das unbrauchbar: bei rund 60 Balken faellt
 * die Balkenbreite auf den Mindestwert und ergibt Haarstriche, und die
 * Erwerbsjahre davor kennt der Kunde ohnehin.
 *
 * Gezeigt wird deshalb der RUHESTAND: ab 65, und wenn die Rente frueher
 * beginnt, ab dem tatsaechlichen Rentenbeginn — sonst fehlten genau die
 * Jahre, um die es bei einem vorgezogenen Rentenbeginn geht.
 *
 * Die Regel steht hier und nicht in der Oberflaeche, weil sie eine
 * Rechenregel ist und sich pruefen laesst.
 */
export function ruhestandsfenster(
  ergebnis: ProjektionsErgebnis,
  bisAlter = 95,
): Jahreszeile[] {
  if (ergebnis.zeilen.length === 0) return [];

  const beiRente = ergebnis.zeilen.find((z) => z.jahr === ergebnis.ruhestandsjahr)
    ?? ergebnis.zeilen.find((z) => z.vollstaendigImRuhestand);

  // Ohne erkennbaren Rentenbeginn bleibt es bei der Regelaltersgrenze.
  const abAlter = Math.min(65, beiRente?.alterA ?? 65);

  // Wer heute schon aelter ist, bekommt keine Vergangenheit angezeigt: die
  // Zeitachse beginnt im laufenden Jahr, frueher gibt es schlicht nichts.
  const start = Math.max(abAlter, ergebnis.zeilen[0]!.alterA);

  return ergebnis.zeilen.filter((z) => z.alterA >= start && z.alterA <= bisAlter);
}
