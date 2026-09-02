import type { LegalParameters } from '../params/types.js';
import type { Jahreszeile } from '../projection/timeline.js';
import { entnahmeRate, entnahmeplanBewerten } from '../products/entnahmeplaner.js';

/**
 * SPARZIEL — die Umkehrung der Zeitachse.
 *
 * Der Rechenkern lief bisher ausschliesslich vorwaerts: Beitrag → Kapital →
 * Auszahlung. Das Gutachten stellte damit fest, DASS eine Luecke besteht,
 * konnte aber die einzige Frage nicht beantworten, die ein Kunde danach hat:
 * Was muss ich tun? Diese Datei rechnet rueckwaerts — von der Luecke zum
 * Monatsbeitrag.
 */

/**
 * Fehlbetrag im Monat, nominal.
 *
 * Stand wortgleich an drei Stellen der Oberflaeche. Eine Regel, die dreimal
 * kopiert ist, laeuft frueher oder spaeter auseinander.
 */
export function versorgungsluecke(z: Jahreszeile): number {
  return Math.max(0, z.zielNettoMonat - z.nettoMonat);
}

/**
 * Kapital, das bei Rentenbeginn noetig waere, um `zielNettoMonat` NETTO zu
 * tragen.
 *
 * Per Halbierung ueber `entnahmeplanBewerten`: dessen `nettoMonat` steigt
 * streng mit dem Kapital, die Suche konvergiert also sicher.
 *
 * WARUM NICHT die Brutto-Formel invertieren: die Entnahme traegt
 * Abgeltungsteuer auf ihren Ertragsanteil. Wer das Kapital aus dem
 * Bruttobedarf ableitet, nennt einen Betrag, der die Luecke am Ende nicht
 * deckt — und zwar umso weniger, je hoeher die Rendite ist.
 *
 * `dynamik` ist die Inflation: die Entnahme muss mitwachsen, sonst schmilzt
 * die gedeckte Luecke ueber die Jahre weg.
 */
export function benoetigtesKapital(
  args: {
    zielNettoMonat: number;
    dauerJahre: number;
    rendite: number;
    dynamik: number;
    kirchensteuerpflichtig: boolean;
    bundesland: string;
  },
  p: LegalParameters,
): number {
  if (args.zielNettoMonat <= 0 || args.dauerJahre <= 0) return 0;

  const netto = (kapital: number) => entnahmeplanBewerten(
    {
      kapital,
      dauerJahre: args.dauerJahre,
      rendite: args.rendite,
      dynamik: args.dynamik,
      kirchensteuerpflichtig: args.kirchensteuerpflichtig,
      bundesland: args.bundesland,
    },
    p,
  ).nettoMonat;

  // Obergrenze suchen statt raten: bei hoher Dynamik und kleiner Rendite
  // braucht es ein Vielfaches dessen, was eine grobe Schaetzung ergaebe.
  let hoch = Math.max(1000, args.zielNettoMonat * 12 * args.dauerJahre);
  for (let i = 0; i < 40 && netto(hoch) < args.zielNettoMonat; i++) hoch *= 2;

  let tief = 0;
  for (let i = 0; i < 60; i++) {
    const mitte = (tief + hoch) / 2;
    if (netto(mitte) < args.zielNettoMonat) tief = mitte;
    else hoch = mitte;
  }
  return hoch;
}

export interface Sparziel {
  /** Kapital, das bei Rentenbeginn erreicht sein muss */
  zielkapital: number;
  /** Monatlicher Beitrag im ERSTEN Sparjahr */
  startbeitrag: number;
  /** Monatlicher Beitrag im LETZTEN Sparjahr, nach Dynamik */
  endbeitrag: number;
  /** Summe aller Beitraege ueber die Sparzeit */
  summeBeitraege: number;
  jahre: number;
  rendite: number;
  /** Jaehrliche Steigerung des Beitrags */
  dynamik: number;
}

/**
 * Monatlicher STARTbeitrag, der bis zum Rentenbeginn das Zielkapital aufbaut.
 *
 * Mit Beitragsdynamik: der Beitrag im Jahr j ist S · (1+d)^j. Die Beitraege
 * eines Jahres werden unterjaehrig angelegt, also mit einem halben Jahr
 * verzinst — dieselbe Naeherung, die `ansparphase` in der Vorwaertsrechnung
 * benutzt.
 *
 *   K = S · 12 · (1+r)^(n−0,5) · Σ_{j=0}^{n−1} q^j     mit q = (1+d)/(1+r)
 *
 * Die Summe ist geometrisch; bei q = 1 (Dynamik gleich Rendite) hat sie eine
 * Nullstelle im Nenner und ist schlicht n.
 *
 * BEWUSST NICHT `ansparphase` invertiert: dessen Vorabpauschale, laufende
 * Kosten und Ausgabeaufschlag wuerden das Ergebnis an Depot-Annahmen binden,
 * die auf einer Verbraucherseite niemand nachvollziehen kann. `rendite` ist
 * hier die Rendite NACH Kosten.
 */
export function benoetigteSparrate(args: {
  zielkapital: number;
  jahre: number;
  rendite: number;
  dynamik: number;
}): Sparziel {
  const { zielkapital, rendite, dynamik } = args;
  const jahre = Math.max(0, Math.round(args.jahre));

  const leer: Sparziel = {
    zielkapital: Math.max(0, zielkapital),
    startbeitrag: 0, endbeitrag: 0, summeBeitraege: 0,
    jahre, rendite, dynamik,
  };
  if (zielkapital <= 0 || jahre <= 0) return leer;

  const q = (1 + dynamik) / (1 + rendite);
  const faktor = Math.abs(q - 1) < 1e-9 ? jahre : (1 - Math.pow(q, jahre)) / (1 - q);
  const nenner = 12 * Math.pow(1 + rendite, jahre - 0.5) * faktor;
  if (nenner <= 0) return leer;

  const startbeitrag = zielkapital / nenner;
  const endbeitrag = startbeitrag * Math.pow(1 + dynamik, jahre - 1);

  let summeBeitraege = 0;
  for (let j = 0; j < jahre; j++) {
    summeBeitraege += startbeitrag * 12 * Math.pow(1 + dynamik, j);
  }

  return {
    zielkapital, startbeitrag, endbeitrag, summeBeitraege, jahre, rendite, dynamik,
  };
}

/**
 * Die Gegenrichtung: was ein gegebener Monatsbeitrag am Ende an Rente
 * traegt. Fuer die Stellschrauben — "100 EUR mehr im Monat bringen X".
 */
export function sparrateZuRente(args: {
  beitragMonat: number;
  jahre: number;
  rendite: number;
  dynamik: number;
  /** Jahre, ueber die das Kapital spaeter verbraucht wird */
  auszahldauer: number;
  /** Steigerung der Entnahme, ueblicherweise die Inflation */
  entnahmeDynamik: number;
}): { endkapital: number; renteMonat: number } {
  const jahre = Math.max(0, Math.round(args.jahre));
  if (args.beitragMonat <= 0 || jahre <= 0) return { endkapital: 0, renteMonat: 0 };

  const q = (1 + args.dynamik) / (1 + args.rendite);
  const faktor = Math.abs(q - 1) < 1e-9 ? jahre : (1 - Math.pow(q, jahre)) / (1 - q);
  const endkapital = args.beitragMonat * 12 * Math.pow(1 + args.rendite, jahre - 0.5) * faktor;

  return {
    endkapital,
    renteMonat: entnahmeRate(endkapital, args.auszahldauer, args.rendite, args.entnahmeDynamik),
  };
}
