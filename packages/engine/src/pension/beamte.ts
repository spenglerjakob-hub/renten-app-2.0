import { besoldungstabelle, type Besoldungsgruppe } from './besoldung-daten.js';

export interface BesoldungErgebnis {
  /** Monatliches Grundgehalt inkl. Familienzuschlaegen */
  brutto: number;
  grundgehalt: number;
  familienzuschlag: number;
  /** false => Oberflaeche muss den Wert als Naeherung kennzeichnen */
  belegt: boolean;
  quelle: string;
}

export function besoldung(
  gruppe: Besoldungsgruppe | string,
  stufe: number,
  land: string,
  jahr: number,
  opts: { verheiratet?: boolean; kinder?: number } = {},
): BesoldungErgebnis {
  const tabelle = besoldungstabelle(land, jahr);
  const g = tabelle.gruppen[gruppe] ?? tabelle.gruppen['A13']!;
  const idx = Math.min(Math.max(1, Math.floor(stufe)), g.stufen.length) - 1;
  const grundgehalt = g.stufen[idx]!;

  let zuschlag = 0;
  if (opts.verheiratet) zuschlag += tabelle.familienzuschlag.stufe1;
  zuschlag += Math.max(0, opts.kinder ?? 0) * tabelle.familienzuschlag.jeKind;

  return {
    brutto: grundgehalt + zuschlag,
    grundgehalt,
    familienzuschlag: zuschlag,
    belegt: tabelle.belegt,
    quelle: tabelle.quelle,
  };
}

/**
 * Ruhegehaltssatz § 14 BeamtVG: 1,79375 % je ruhegehaltfaehigem Dienstjahr,
 * gedeckelt bei 71,75 %.
 */
export const RUHEGEHALT_PRO_JAHR = 0.0179375;
export const RUHEGEHALT_MAX = 0.7175;

export interface Dienstzeitraum {
  /** Beschaeftigungsgrad in Prozent (0 = Beurlaubung, 50 = Halbtags, ...) */
  beschaeftigungsgrad: number;
  jahre: number;
}

export function ruhegehaltssatz(gesamtJahre: number, teilzeiten: readonly Dienstzeitraum[] = []): number {
  if (gesamtJahre <= 0) return 0;
  let fehlend = 0;
  for (const z of teilzeiten) {
    if (z.jahre > 0) fehlend += z.jahre * (1 - Math.min(100, Math.max(0, z.beschaeftigungsgrad)) / 100);
  }
  const anrechenbar = Math.max(0, gesamtJahre - fehlend);
  return Math.min(RUHEGEHALT_MAX, anrechenbar * RUHEGEHALT_PRO_JAHR);
}

/**
 * Versorgungsabschlag bei vorzeitigem Ruhestand § 14 Abs. 3 BeamtVG:
 * 0,3 % je Monat, gedeckelt bei 10,8 % (Antragsruhestand).
 *
 * Der Prototyp verwendete hier die GRV-Formel mit einer Deckelung von 14,4 %
 * (Befund C4).
 */
export function versorgungsabschlag(alterBeiPensionierung: number, regelgrenze = 67): number {
  if (alterBeiPensionierung >= regelgrenze) return 0;
  const monate = Math.ceil((regelgrenze - alterBeiPensionierung) * 12);
  return Math.min(0.108, monate * 0.003);
}

/**
 * Mindestversorgung § 14 Abs. 4 BeamtVG (amtsunabhaengig):
 * 65 % der Endstufe von A4 zzgl. eines Festbetrags. Fehlte im Prototyp.
 */
export function mindestversorgung(land: string, jahr: number): number {
  const t = besoldungstabelle(land, jahr);
  const a7 = t.gruppen['A7'];
  if (!a7) return 0;
  // A4 ist in der Naeherungstabelle nicht enthalten; als konservative Untergrenze
  // dient der Einstiegswert von A7 mit einem Abschlag.
  return (a7.stufen[0] ?? 0) * 0.65;
}
