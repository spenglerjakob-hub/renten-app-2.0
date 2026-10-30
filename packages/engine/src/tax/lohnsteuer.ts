import type { LegalParameters } from '../params/types.js';
import { grundtarif, kirchensteuersatz, solidaritaetszuschlag } from './estg.js';

/**
 * LOHNSTEUER NACH STEUERKLASSE (§ 38b, § 39b EStG) — was der Arbeitgeber
 * jeden Monat einbehaelt, aufs Jahr gerechnet.
 *
 * Die Einkommensteuer (`einkommensteuer`) ist das Ergebnis des Jahres, die
 * Lohnsteuer der Abzug auf der Gehaltsabrechnung. Fuer Ledige (I) und in
 * Steuerklasse IV sind beide gleich. III und V verteilen die Steuer eines
 * Paares ungleich — III zieht wenig ab, V viel; die Steuererklaerung gleicht
 * das aus.
 *
 * Gerechnet wird auf dem zvE der Rechnung, nicht mit der Vorsorgepauschale
 * des Programmablaufplans: eine Naeherung, die auf der Abrechnung um wenige
 * Euro abweichen kann. Ebenso ohne Kinderfreibetraege bei Soli und
 * Kirchensteuer. Steuerklasse VI (zweites Dienstverhaeltnis) gibt es hier
 * nicht.
 */
export type Steuerklasse = 1 | 2 | 3 | 4 | 5;

export const STEUERKLASSEN: readonly Steuerklasse[] = [1, 2, 3, 4, 5];

/**
 * Steuerklasse V nach § 39b Abs. 2 Satz 7 EStG, wie im Programmablaufplan
 * (`MST5_6`, `UP5_6`): das Doppelte des Unterschieds zwischen der Steuer auf
 * das 1,25- und das 0,75-Fache des zvE, mindestens 14 % — auf den Teil ueber
 * W1 hoechstens 42 %, ueber W2 genau 42 %, ueber W3 45 %.
 */
function klasseFuenf(zve: number, p: LegalParameters): number {
  const x = Math.floor(Math.max(0, zve));
  const { w1Stkl5: w1, w2Stkl5: w2, w3Stkl5: w3 } = p.lohnsteuer;
  const up = (z: number) => Math.max(2 * (grundtarif(z * 1.25, p.est) - grundtarif(z * 0.75, p.est)), Math.floor(z * 0.14));
  if (x > w2) {
    const st = up(w2);
    return x > w3
      ? Math.floor(Math.floor(st + (w3 - w2) * 0.42) + (x - w3) * 0.45)
      : Math.floor(st + (x - w2) * 0.42);
  }
  const st = up(x);
  if (x <= w1) return st;
  return Math.min(st, Math.floor(up(w1) + (x - w1) * 0.42));
}

/** Die Jahreslohnsteuer ohne Soli und Kirchensteuer. */
export function lohnsteuerJahr(zve: number, klasse: Steuerklasse, p: LegalParameters): number {
  switch (klasse) {
    case 2: return grundtarif(Math.max(0, zve - p.lohnsteuer.entlastungAlleinerziehend), p.est);
    case 3: return 2 * grundtarif(zve / 2, p.est);
    case 5: return klasseFuenf(zve, p);
    default: return grundtarif(zve, p.est);
  }
}

/** Lohnsteuer, Soli (in III mit doppelter Freigrenze) und Kirchensteuer. */
export function lohnsteuerMitZuschlaegen(
  zve: number,
  klasse: Steuerklasse,
  o: { bundesland: string; kirchensteuerpflichtig: boolean },
  p: LegalParameters,
): { lohnsteuer: number; soli: number; kirchensteuer: number } {
  const lohnsteuer = lohnsteuerJahr(zve, klasse, p);
  return {
    lohnsteuer,
    soli: solidaritaetszuschlag(lohnsteuer, klasse === 3, p),
    kirchensteuer: o.kirchensteuerpflichtig ? lohnsteuer * kirchensteuersatz(o.bundesland) : 0,
  };
}

/**
 * Was ein zusaetzliches zvE an Lohnsteuer samt Zuschlaegen kostet — wie
 * `zusatzsteuer` fuer die Jahressteuer. Mit negativem Vorzeichen gelesen:
 * was eine Entgeltumwandlung auf der Abrechnung spart.
 */
export function lohnsteuerZusatz(
  zveBasis: number,
  zusatz: number,
  klasse: Steuerklasse,
  o: { bundesland: string; kirchensteuerpflichtig: boolean },
  p: LegalParameters,
): number {
  if (zusatz <= 0) return 0;
  const summe = (z: number) => {
    const s = lohnsteuerMitZuschlaegen(z, klasse, o, p);
    return s.lohnsteuer + s.soli + s.kirchensteuer;
  };
  return summe(zveBasis + zusatz) - summe(zveBasis);
}

/** Der Grenzsteuersatz der Lohnsteuer — wie `grenzsteuersatz`, nach Steuerklasse. */
export function grenzLohnsteuersatz(zve: number, klasse: Steuerklasse, p: LegalParameters, schritt = 100): number {
  if (schritt <= 0) return 0;
  return (lohnsteuerJahr(zve + schritt, klasse, p) - lohnsteuerJahr(zve, klasse, p)) / schritt;
}
