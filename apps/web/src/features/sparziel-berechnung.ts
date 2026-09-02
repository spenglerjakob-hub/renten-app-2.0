import {
  benoetigtesKapital, benoetigteSparrate, versorgungsluecke, parameterFuer,
  type Jahreszeile, type Sparziel,
} from '@renten/engine';
import type { SzenarioParsed } from '../store/szenario';

/**
 * Die Sparziel-Rechnung, einmal fuer Bildschirm und Papier.
 *
 * Dieselbe Trennung wie bei `tuev-berechnung.ts`: die Rechnung steht hier,
 * nicht im JSX. Der Sparrechner auf dem Bildschirm und die Gutachtenseite
 * "Was Sie jetzt tun koennen" muessen zwingend dieselben Zahlen zeigen.
 */

export interface SparzielEingaben {
  /** Rendite NACH Kosten waehrend der Sparzeit */
  rendite: number;
  /** Jaehrliche Steigerung des eigenen Beitrags */
  dynamik: number;
  /** Jahre, ueber die das Kapital im Ruhestand verbraucht wird */
  auszahldauer: number;
}

export const SPARZIEL_VORGABE: SparzielEingaben = {
  rendite: 0.05,
  dynamik: 0.03,
  auszahldauer: 25,
};

/** Die Dynamikstufen der Vergleichstabelle. */
export const DYNAMIKSTUFEN = [0, 0.03, 0.04, 0.05] as const;

export interface SparzielErgebnis {
  /** Fehlbetrag im Monat, Betrag des Rentenjahres */
  luecke: number;
  /** Derselbe Fehlbetrag in heutiger Kaufkraft */
  lueckeHeute: number;
  jahreBisRente: number;
  /** Kapital, das bei Rentenbeginn noetig waere */
  zielkapital: number;
  /** Die gewaehlte Variante */
  gewaehlt: Sparziel;
  /** Dieselbe Rechnung bei 0 / 3 / 4 / 5 % Beitragsdynamik */
  varianten: Sparziel[];
}

/**
 * Gibt `null` zurueck, wenn es nichts zu schliessen gibt — dann entfaellt die
 * Seite, statt eine Null-Empfehlung zu drucken.
 */
export function sparzielRechnen(
  szenario: SzenarioParsed,
  zeile: Jahreszeile,
  eingaben: SparzielEingaben,
): SparzielErgebnis | null {
  const luecke = versorgungsluecke(zeile);
  if (luecke <= 0) return null;

  const jetzt = new Date().getFullYear();
  const jahreBisRente = Math.max(0, zeile.jahr - jetzt);
  if (jahreBisRente <= 0) return null;

  const p = parameterFuer(zeile.jahr, { indexRate: szenario.annahmen.tarifIndex });

  // Die Entnahme muss mit der Inflation wachsen, sonst deckt sie die Luecke
  // nur im ersten Jahr.
  const zielkapital = benoetigtesKapital(
    {
      zielNettoMonat: luecke,
      dauerJahre: eingaben.auszahldauer,
      rendite: eingaben.rendite,
      dynamik: szenario.annahmen.inflation,
      kirchensteuerpflichtig: szenario.haushalt.kirchensteuer,
      bundesland: szenario.haushalt.bundesland,
    },
    p,
  );

  const fuer = (dynamik: number) => benoetigteSparrate({
    zielkapital, jahre: jahreBisRente, rendite: eingaben.rendite, dynamik,
  });

  return {
    luecke,
    lueckeHeute: luecke / zeile.kaufkraftfaktor,
    jahreBisRente,
    zielkapital,
    gewaehlt: fuer(eingaben.dynamik),
    varianten: DYNAMIKSTUFEN.map(fuer),
  };
}
