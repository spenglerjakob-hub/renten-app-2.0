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
  /*
    5 % NACH KOSTEN — die Vorgabe fuer Bildschirm und Gutachten (bis November
    2026 waren es 6 %). Sie gilt fuer die Sparzeit und fuer die Zeit der
    Entnahme; wer anders rechnen will, aendert sie im Sparrechner unter
    „Annahmen“.
  */
  rendite: 0.05,
  /*
    OHNE Beitragsdynamik. Sie war mit 3 % vorbelegt und liess die noetige
    Startrate kleiner aussehen, als sie ist — wer nicht jedes Jahr erhoeht,
    verfehlt das Ziel. Die Dynamikstufen darunter zeigen weiterhin, was eine
    Steigerung braechte; wer sie will, waehlt sie bewusst.
  */
  dynamik: 0,
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
 * Das Kapital, das bei Rentenbeginn noetig ist, um `nettoMonat` zu zahlen.
 * Die Entnahme muss mit der Inflation wachsen, sonst deckt sie die Luecke
 * nur im ersten Jahr.
 */
function kapitalFuer(
  szenario: SzenarioParsed,
  eingaben: SparzielEingaben,
  p: ReturnType<typeof parameterFuer>,
  nettoMonat: number,
): number {
  return benoetigtesKapital(
    {
      zielNettoMonat: nettoMonat,
      dauerJahre: eingaben.auszahldauer,
      rendite: eingaben.rendite,
      dynamik: szenario.annahmen.inflation,
      kirchensteuerpflichtig: szenario.haushalt.kirchensteuer,
      bundesland: szenario.haushalt.bundesland,
    },
    p,
  );
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

  const zielkapital = kapitalFuer(szenario, eingaben, p, luecke);

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

/** Was ein Wunschbeitrag von der Luecke schliesst. */
export interface Wunschbeitrag {
  /** Der Beitrag, der die ganze Luecke schloesse — der Startbeitrag des Sparrechners */
  noetig: number;
  /** Der Teil der Luecke im Monat, den der Wunschbeitrag deckt — Betrag des Rentenjahres */
  gedecktMonat: number;
  /** Derselbe Teil in heutiger Kaufkraft */
  gedecktHeute: number;
  /** Was offen bleibt, Betrag des Rentenjahres */
  restMonat: number;
  /** Anteil der Luecke, 0 bis 1 — mehr als geschlossen ist geschlossen */
  anteil: number;
  /*
    DASSELBE ALS KAPITAL — so zeigt es der Sparrechner: Eine Summe laesst sich
    greifen, „x % der Luecke“ nicht. Alle vier sind Geld des Rentenjahres, wie
    `zielkapital` in der Rechnung darueber.
  */
  /** Das Kapital, das die ganze Luecke braucht */
  zielkapital: number;
  /** Was der Wunschbeitrag bis zum Rentenbeginn anspart — auch ueber das Zielkapital hinaus */
  kapital: number;
  /** Ist die Luecke geschlossen? Auf den Euro genau wie der angezeigte Startbeitrag. */
  geschlossen: boolean;
  /** Was zum Zielkapital fehlt — 0, sobald die Luecke geschlossen ist */
  kapitalFehlt: number;
  /** Was ueber das Zielkapital hinaus entsteht, der Vermoegensaufbau — 0, solange noch etwas fehlt */
  kapitalMehr: number;
}

/**
 * DIE RECHNUNG DES SPARRECHNERS RUECKWAERTS: nicht „was kostet die Luecke“,
 * sondern „was schliesst der Betrag, den ich zuruecklegen will“.
 *
 * Mit denselben Annahmen wie die Rechnung darueber: Der Beitrag baut einen
 * Teil des Zielkapitals auf (die Sparrate ist dem Kapital proportional), und
 * gesucht ist die Monatsrente, die dieses Kapital traegt. Das laeuft nicht
 * einfach im Dreisatz — die Abgeltungsteuer laesst den Sparerpauschbetrag
 * frei, ein kleines Kapital wird also milder besteuert —, deshalb per
 * Halbierung ueber dieselbe Funktion `benoetigtesKapital`.
 *
 * `null`, wenn es nichts zu schliessen gibt (wie `sparzielRechnen`).
 */
export function wunschbeitragRechnen(
  szenario: SzenarioParsed,
  zeile: Jahreszeile,
  eingaben: SparzielEingaben,
  beitragMonat: number,
): Wunschbeitrag | null {
  const r = sparzielRechnen(szenario, zeile, eingaben);
  if (!r) return null;
  const noetig = r.gewaehlt.startbeitrag;
  const beitrag = Math.max(0, beitragMonat);
  let gedecktMonat: number;
  if (noetig <= 0 || beitrag >= noetig) {
    gedecktMonat = r.luecke;
  } else if (beitrag === 0) {
    gedecktMonat = 0;
  } else {
    const p = parameterFuer(zeile.jahr, {
      indexRate: szenario.annahmen.tarifIndex,
      zusatzbeitrag: szenario.haushalt.zusatzbeitrag,
    });
    const kapital = r.zielkapital * (beitrag / noetig);
    let [unten, oben] = [0, r.luecke];
    for (let i = 0; i < 40; i++) {
      const mitte = (unten + oben) / 2;
      if (kapitalFuer(szenario, eingaben, p, mitte) > kapital) oben = mitte; else unten = mitte;
    }
    gedecktMonat = (unten + oben) / 2;
  }
  /*
    Die Sparrate ist dem Kapital proportional: Das Doppelte des noetigen
    Beitrags baut das Doppelte des Zielkapitals auf. Was darueber liegt, ist
    Vermoegensaufbau.

    GESCHLOSSEN auf den Euro: Der Startbeitrag steht als ganze Zahl da
    („779 €“), gerechnet ist er mit Nachkommastellen (778,85 €). Wer genau
    diese Zahl eintraegt, hat die Luecke geschlossen — und liest weder „es
    fehlen 156 €“ (die angezeigte Zahl ist abgerundet) noch „dazu 90 €
    Vermögen“ (sie ist aufgerundet). Auf den Euro gleich heisst: genau das
    Zielkapital.
  */
  const genau = noetig > 0 && Math.round(beitrag) === Math.round(noetig);
  const kapital = noetig <= 0 || genau ? r.zielkapital : r.zielkapital * (beitrag / noetig);
  const geschlossen = noetig <= 0 || Math.round(beitrag) >= Math.round(noetig);
  return {
    noetig,
    gedecktMonat,
    gedecktHeute: gedecktMonat / zeile.kaufkraftfaktor,
    restMonat: Math.max(0, r.luecke - gedecktMonat),
    anteil: r.luecke > 0 ? Math.min(1, gedecktMonat / r.luecke) : 1,
    zielkapital: r.zielkapital,
    kapital,
    geschlossen,
    kapitalFehlt: geschlossen ? 0 : Math.max(0, r.zielkapital - kapital),
    kapitalMehr: geschlossen ? Math.max(0, kapital - r.zielkapital) : 0,
  };
}
