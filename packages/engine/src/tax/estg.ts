import type { EstTarifEckwerte, LegalParameters } from '../params/types.js';

/**
 * Grenzsteuersatz-Anker des deutschen Einkommensteuertarifs.
 * Diese drei Werte sind seit Jahrzehnten unveraendert; variabel sind nur die
 * Zonengrenzen. Aus Ankern + Grenzen folgen alle Koeffizienten eindeutig.
 */
const EINGANGSSATZ = 0.14;
const KNICKSATZ = 0.2397; // Grenzsteuersatz am Uebergang Zone 2 -> Zone 3
const SPITZENSATZ = 0.42;
const REICHENSATZ = 0.45;

export interface TarifKoeffizienten {
  a2: number; b2: number;
  a3: number; b3: number; c3: number;
  abzug4: number;
  abzug5: number;
}

/**
 * Leitet die Tarifkoeffizienten aus den Eckwerten ab.
 *
 * Die Konstruktion garantiert:
 *  - Stetigkeit an jeder Zonengrenze (per Definition von c3, abzug4, abzug5)
 *  - stetigen Grenzsteuersatz (per Definition von b2, b3)
 *
 * Damit ist der Sprung von 85 EUR bei zvE 17.005, den der Prototyp durch das
 * Vermischen der Tarifjahrgaenge 2023 und 2024 erzeugte, ausgeschlossen.
 */
export function koeffizienten(e: EstTarifEckwerte): TarifKoeffizienten {
  const Y2 = (e.zone2Ende - e.grundfreibetrag) / 10000;
  const Z3 = (e.zone3Ende - e.zone2Ende) / 10000;

  const b2 = EINGANGSSATZ * 10000;
  const b3 = KNICKSATZ * 10000;
  const a2 = (b3 - b2) / (2 * Y2);
  const a3 = (SPITZENSATZ * 10000 - b3) / (2 * Z3);
  const c3 = (a2 * Y2 + b2) * Y2;
  const steuerAmZone3Ende = (a3 * Z3 + b3) * Z3 + c3;
  const abzug4 = SPITZENSATZ * e.zone3Ende - steuerAmZone3Ende;
  const abzug5 = abzug4 + (REICHENSATZ - SPITZENSATZ) * e.zone4Ende;

  return { a2, b2, a3, b3, c3, abzug4, abzug5 };
}

/** Tarifliche Einkommensteuer auf ein zu versteuerndes Einkommen (Grundtarif). */
export function grundtarif(zve: number, e: EstTarifEckwerte): number {
  // § 32a: Abrundung des zvE auf den vollen Euro.
  const x = Math.floor(Math.max(0, zve));
  if (x <= e.grundfreibetrag) return 0;

  const k = koeffizienten(e);
  let tax: number;
  if (x <= e.zone2Ende) {
    const y = (x - e.grundfreibetrag) / 10000;
    tax = (k.a2 * y + k.b2) * y;
  } else if (x <= e.zone3Ende) {
    const z = (x - e.zone2Ende) / 10000;
    tax = (k.a3 * z + k.b3) * z + k.c3;
  } else if (x <= e.zone4Ende) {
    tax = SPITZENSATZ * x - k.abzug4;
  } else {
    tax = REICHENSATZ * x - k.abzug5;
  }
  // Die festzusetzende Steuer wird auf volle Euro abgerundet.
  return Math.floor(Math.max(0, tax));
}

/**
 * Tarifliche Einkommensteuer inkl. Ehegattensplitting (§ 32a Abs. 5).
 */
export function einkommensteuer(zve: number, verheiratet: boolean, p: LegalParameters): number {
  if (verheiratet) return 2 * grundtarif(zve / 2, p.est);
  return grundtarif(zve, p.est);
}

/**
 * Grenzsteuersatz: Belastung des NAECHSTEN Euro.
 *
 * Wird fuer Entscheidungsfragen gebraucht (lohnt sich eine zusaetzliche
 * Einzahlung?). Bewusst getrennt vom Durchschnittssatz, den der Prototyp
 * faelschlich auch auf Grenzeinkommen anwandte (Befund B2/B3).
 */
export function grenzsteuersatz(zve: number, verheiratet: boolean, p: LegalParameters, schritt = 100): number {
  if (schritt <= 0) return 0;
  const a = einkommensteuer(zve, verheiratet, p);
  const b = einkommensteuer(zve + schritt, verheiratet, p);
  return (b - a) / schritt;
}

/** Durchschnittssteuersatz — nur fuer die Darstellung, nie fuer Grenzbetraege. */
export function durchschnittssteuersatz(zve: number, verheiratet: boolean, p: LegalParameters): number {
  if (zve <= 0) return 0;
  return einkommensteuer(zve, verheiratet, p) / zve;
}

/**
 * Solidaritaetszuschlag mit Freigrenze und Milderungszone (§ 4 SolZG).
 * Fehlte im Prototyp vollstaendig (Befund B6).
 */
export function solidaritaetszuschlag(est: number, verheiratet: boolean, p: LegalParameters): number {
  const faktor = verheiratet ? 2 : 1;
  const freigrenze = p.soli.freigrenze * faktor;
  if (est <= freigrenze) return 0;
  const voll = est * p.soli.satz;
  const gemildert = (est - freigrenze) * p.soli.milderungssatz;
  return Math.min(voll, gemildert);
}

/**
 * Kirchensteuer. Satz ist laenderabhaengig: 8 % in Bayern und
 * Baden-Wuerttemberg, sonst 9 % (Prototyp hatte 8 % fest, Befund C6).
 */
export function kirchensteuersatz(bundesland: string): number {
  return bundesland === 'Bayern' || bundesland === 'Baden-Württemberg' ? 0.08 : 0.09;
}
