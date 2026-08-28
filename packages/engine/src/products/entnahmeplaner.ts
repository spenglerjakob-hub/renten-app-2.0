import type { LegalParameters } from '../params/types.js';
import { abgeltungsteuer } from '../tax/haushalt.js';

/**
 * Dynamischer Entnahmeplan: ein Kapitalstock wird ueber eine feste Zahl von
 * Jahren aufgezehrt, waehrend der Rest weiter verzinst wird und die Entnahme
 * jaehrlich um einen Dynamiksatz steigt.
 *
 * Die Formel stammt aus dem Prototyp. Ihre Fallunterscheidung ist notwendig:
 * bei Rendite == Dynamik hat der geschlossene Ausdruck eine Nullstelle im
 * Nenner, dort gilt die einfache Division.
 */
export function entnahmeRate(
  kapital: number,
  dauerJahre: number,
  rendite: number,
  dynamik: number,
): number {
  if (kapital <= 0 || dauerJahre <= 0) return 0;
  if (Math.abs(rendite - dynamik) < 1e-9) return kapital / (dauerJahre * 12);

  const zaehler = 1 + rendite - (1 + dynamik);
  const nenner = 1 - Math.pow((1 + dynamik) / (1 + rendite), dauerJahre);
  if (Math.abs(nenner) < 1e-12) return kapital / (dauerJahre * 12);

  return (kapital * (zaehler / nenner)) / 12;
}

export interface EntnahmeErgebnis {
  /** Monatliche Bruttoentnahme im ERSTEN Jahr */
  bruttoMonat: number;
  /** Monatliche Nettoentnahme im ERSTEN Jahr */
  nettoMonat: number;
  /** Summe aller Bruttoauszahlungen ueber die Laufzeit */
  summeBrutto: number;
  /**
   * Anteil jeder Auszahlung, der als Ertrag steuerpflichtig ist.
   * Ueber die Laufzeit gemittelt: (Summe Auszahlungen - Kapital) / Summe.
   */
  ertragsquote: number;
  /** Abgeltungsteuer auf die Jahresentnahme des ersten Jahres */
  steuerJahr: number;
}

/**
 * Bewertet einen Entnahmeplan inklusive Besteuerung.
 *
 * WICHTIG (Befund B7): Der Prototyp rechnete hier
 *   steuer = ertrag * 0.25; steuer += steuer * 0.055; steuer += ertrag * 0.08
 * und addierte die Kirchensteuer damit OBENDRAUF. Nach § 32d Abs. 1 S. 4/5
 * EStG mindert die Kirchensteuer jedoch die Kapitalertragsteuer. Deshalb wird
 * hier `abgeltungsteuer` wiederverwendet, das die Ermaessigung korrekt abbildet.
 */
export function entnahmeplanBewerten(
  args: {
    kapital: number;
    dauerJahre: number;
    rendite: number;
    dynamik: number;
    kirchensteuerpflichtig: boolean;
    bundesland: string;
    /** Bereits anderweitig verbrauchter Sparerpauschbetrag mindert diesen hier */
    sparerpauschbetrag?: number;
  },
  p: LegalParameters,
): EntnahmeErgebnis {
  const leer: EntnahmeErgebnis = {
    bruttoMonat: 0, nettoMonat: 0, summeBrutto: 0, ertragsquote: 0, steuerJahr: 0,
  };
  if (args.kapital <= 0 || args.dauerJahre <= 0) return leer;

  const bruttoMonat = entnahmeRate(args.kapital, args.dauerJahre, args.rendite, args.dynamik);
  if (bruttoMonat <= 0) return leer;

  // Summe aller Auszahlungen ueber die Laufzeit, mit Dynamik.
  let summeBrutto = 0;
  let jahresbetrag = bruttoMonat * 12;
  for (let j = 0; j < args.dauerJahre; j++) {
    summeBrutto += jahresbetrag;
    jahresbetrag *= 1 + args.dynamik;
  }

  const ertragsquote = summeBrutto > 0 ? Math.max(0, summeBrutto - args.kapital) / summeBrutto : 0;

  const ertragJahr = bruttoMonat * 12 * ertragsquote;
  const { steuer } = abgeltungsteuer(
    ertragJahr,
    {
      kirchensteuerpflichtig: args.kirchensteuerpflichtig,
      bundesland: args.bundesland,
      sparerpauschbetrag: args.sparerpauschbetrag ?? 0,
    },
    p,
  );

  return {
    bruttoMonat,
    nettoMonat: bruttoMonat - steuer / 12,
    summeBrutto,
    ertragsquote,
    steuerJahr: steuer,
  };
}
