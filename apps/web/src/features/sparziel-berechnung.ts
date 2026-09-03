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

/** So viele Jahre muessen zum Sparen mindestens uebrig bleiben. */
const MINDEST_SPARJAHRE = 5;

/** Was es kostet, den Beginn um `wartenJahre` zu verschieben. */
export interface Aufschub {
  wartenJahre: number;
  sparjahre: number;
  startbeitrag: number;
  summeBeitraege: number;
  /** Mehrbetrag im Monat gegenueber dem Beginn heute */
  mehrProMonat: number;
  /** Mehrbetrag ueber die gesamte Sparzeit */
  mehrGesamt: number;
}

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
  /** Was Warten kostet — erste Zeile ist immer "heute beginnen" */
  aufschub: Aufschub[];
  /** Was ein EINZELNES Jahr Warten kostet */
  proJahrWarten: { mehrProMonat: number; mehrGesamt: number };
}

/**
 * Die Stufen der Warten-Tabelle passen sich der verbleibenden Zeit an.
 *
 * Feste 5/10/15 Jahre ergeben bei jemandem, der noch zwoelf Jahre hat, keine
 * Tabelle — und eine Zeile mit zwei verbleibenden Sparjahren nennt Betraege,
 * die niemand aufbringt.
 */
function wartestufen(jahreBisRente: number): number[] {
  const schritt = jahreBisRente >= 25 ? 5 : jahreBisRente >= 15 ? 3 : 2;
  return [0, schritt, schritt * 2, schritt * 3]
    .filter((w) => jahreBisRente - w >= MINDEST_SPARJAHRE);
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

  const p = parameterFuer(zeile.jahr, {
    indexRate: szenario.annahmen.tarifIndex,
    zusatzbeitrag: szenario.haushalt.zusatzbeitrag,
  });

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

  /*
    Was Warten kostet. Dasselbe Zielkapital, dieselbe Rendite, dieselbe
    Dynamik — nur der Beginn wandert. Nur so isoliert die Tabelle den Effekt
    des Wartens und mischt ihn nicht mit einer geaenderten Annahme.
  */
  const nachJahren = (jahre: number) => benoetigteSparrate({
    zielkapital, jahre, rendite: eingaben.rendite, dynamik: eingaben.dynamik,
  });
  const heute = nachJahren(jahreBisRente);
  const aufschub: Aufschub[] = wartestufen(jahreBisRente).map((wartenJahre) => {
    const sparjahre = jahreBisRente - wartenJahre;
    const r = nachJahren(sparjahre);
    return {
      wartenJahre,
      sparjahre,
      startbeitrag: r.startbeitrag,
      summeBeitraege: r.summeBeitraege,
      mehrProMonat: r.startbeitrag - heute.startbeitrag,
      mehrGesamt: r.summeBeitraege - heute.summeBeitraege,
    };
  });

  const einJahr = nachJahren(Math.max(1, jahreBisRente - 1));

  return {
    luecke,
    lueckeHeute: luecke / zeile.kaufkraftfaktor,
    jahreBisRente,
    zielkapital,
    gewaehlt: fuer(eingaben.dynamik),
    varianten: DYNAMIKSTUFEN.map(fuer),
    aufschub,
    proJahrWarten: {
      mehrProMonat: Math.max(0, einJahr.startbeitrag - heute.startbeitrag),
      mehrGesamt: Math.max(0, einJahr.summeBeitraege - heute.summeBeitraege),
    },
  };
}
