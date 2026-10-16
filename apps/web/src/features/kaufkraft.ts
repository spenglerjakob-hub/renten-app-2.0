import { versorgungsluecke, type Jahreszeile } from '@renten/engine';
import { euro, prozent } from '../components/Feld';

/**
 * KAUFKRAFT BIS ZUM RENTENBEGINN — in Euro, fuer das Gespraech.
 *
 * Eine Rechnung fuer Bildschirm, Schnellrechnung und Gutachten. Neu
 * gerechnet wird nichts: Der Kaufkraftfaktor der Jahreszeile rechnet einen
 * Betrag des Rentenjahres auf heutige Preise zurueck — derselbe Faktor wie
 * beim Schalter „Kaufkraft heute“ und auf dem Deckblatt.
 *
 * BEWUSST NICHT: eine Summe der Luecke ueber alle Jahre des Ruhestands.
 * Ohne Zins und ohne Inflation uebertriebe sie; die ehrliche Kapitalzahl ist
 * das noetige Kapital zum Rentenbeginn (`sparzielRechnen`).
 */
export interface Kaufkraft {
  jahr: number;
  /** Preisniveau des Jahres gegenueber heute — 1,67 heisst: 67 % teurer */
  faktor: number;
  bedarfHeute: number;
  bedarfNominal: number;
  nettoNominal: number;
  nettoHeute: number;
  /** Um so viel ist das Netto des Jahres in heutigen Preisen weniger wert */
  verlustMonat: number;
  verlustQuote: number;
  lueckeNominal: number;
  lueckeHeute: number;
}

/** Null, wenn es nichts zu zeigen gibt — etwa wenn der Ruhestand schon begonnen hat. */
export function kaufkraft(zeile: Jahreszeile): Kaufkraft | null {
  const f = zeile.kaufkraftfaktor;
  if (!(f > 1.0001) || zeile.zielNettoMonat <= 0) return null;
  const luecke = versorgungsluecke(zeile);
  return {
    jahr: zeile.jahr,
    faktor: f,
    bedarfHeute: zeile.zielNettoMonat / f,
    bedarfNominal: zeile.zielNettoMonat,
    nettoNominal: zeile.nettoMonat,
    nettoHeute: zeile.nettoMonat / f,
    verlustMonat: zeile.nettoMonat * (1 - 1 / f),
    verlustQuote: 1 - 1 / f,
    lueckeNominal: luecke,
    lueckeHeute: luecke / f,
  };
}

/**
 * Der Satz fuer das Gespraech — und zum Kopieren ins Beratungsprotokoll.
 * Mit der Annahme darin: Eine Zahl ohne ihre Inflationsannahme waere im
 * Protokoll nicht nachvollziehbar.
 */
export function gespraechssatz(k: Kaufkraft, inflation: number): string {
  const netto = `Ihr Netto von ${euro(k.nettoNominal)} im Jahr ${k.jahr} entspricht in heutigen Preisen `
    + `${euro(k.nettoHeute)} (bei ${prozent(inflation)} Inflation pro Jahr).`;
  if (k.lueckeNominal <= 0) return `Ihr Ziel ist voraussichtlich gedeckt. ${netto}`;
  return `Ihnen fehlen im Ruhestand voraussichtlich ${euro(k.lueckeHeute)} im Monat in heutiger Kaufkraft `
    + `— im Jahr ${k.jahr} sind das ${euro(k.lueckeNominal)}. ${netto}`;
}
