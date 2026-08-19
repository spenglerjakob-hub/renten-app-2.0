import type { LegalParameters } from '../params/types.js';
import { einkommensteuer, solidaritaetszuschlag, kirchensteuersatz } from '../tax/estg.js';
import { kvPvArbeitnehmer, type KinderStatus } from '../social/kv-pv.js';

export interface ErwerbsOptionen {
  verheiratet: boolean;
  bundesland: string;
  kirchensteuerpflichtig: boolean;
  kinder: KinderStatus;
  /** Beamte zahlen keine RV/AV und sind i. d. R. beihilfeberechtigt */
  beamter?: boolean;
  /** Monatliche PKV-Praemie bei Beamten/privat Versicherten */
  pkvPraemieMonat?: number;
}

export interface ErwerbsNetto {
  jahresbrutto: number;
  jahresnetto: number;
  monatsbrutto: number;
  monatsnetto: number;
  sv: number;
  est: number;
  soli: number;
  kirchensteuer: number;
  zve: number;
}

/** Brutto -> Netto fuer die Erwerbsphase. */
export function bruttoZuNetto(
  jahresbrutto: number,
  o: ErwerbsOptionen,
  p: LegalParameters,
): ErwerbsNetto {
  const brutto = Math.max(0, jahresbrutto);

  let sv = 0;
  let vorsorgeAbzug = 0;

  if (o.beamter) {
    // Keine gesetzliche RV/AV. Krankenversicherung privat (Beihilfe).
    const praemie = (o.pkvPraemieMonat ?? 0) * 12;
    sv = praemie;
    vorsorgeAbzug = praemie * 0.8; // Basisabsicherungsanteil
  } else {
    const b = kvPvArbeitnehmer(brutto, o.kinder, p, { sachsen: o.bundesland === 'Sachsen' });
    sv = b.gesamt;
    vorsorgeAbzug = b.abzugsfaehig;
  }

  const zve = Math.max(
    0,
    brutto - p.pauschbetraege.arbeitnehmer - p.pauschbetraege.sonderausgaben - vorsorgeAbzug,
  );

  const est = einkommensteuer(zve, o.verheiratet, p);
  const soli = solidaritaetszuschlag(est, o.verheiratet, p);
  const kist = o.kirchensteuerpflichtig ? est * kirchensteuersatz(o.bundesland) : 0;

  const netto = brutto - sv - est - soli - kist;
  return {
    jahresbrutto: brutto,
    jahresnetto: netto,
    monatsbrutto: brutto / 12,
    monatsnetto: netto / 12,
    sv, est, soli, kirchensteuer: kist, zve,
  };
}

/**
 * Netto -> Brutto durch Bisektion ueber die Vorwaertsfunktion.
 *
 * Der Prototyp schaetzte hier mit festen Faktoren (Netto x 1,55 bzw. x 1,35).
 * Da "Netto" die VOREINSTELLUNG der Gehaltseingabe war, stand damit der
 * gesamte Vertrags-TUEV auf einem geratenen zu versteuernden Einkommen
 * (Befund B9). Die Umkehrung ist monoton, also exakt loesbar.
 */
export function nettoZuBrutto(
  jahresnettoZiel: number,
  o: ErwerbsOptionen,
  p: LegalParameters,
): ErwerbsNetto {
  const ziel = Math.max(0, jahresnettoZiel);
  if (ziel === 0) return bruttoZuNetto(0, o, p);

  let lo = ziel;
  let hi = Math.max(ziel * 3, ziel + 100000);

  // Obergrenze absichern
  let guard = 0;
  while (bruttoZuNetto(hi, o, p).jahresnetto < ziel && guard++ < 60) hi *= 1.5;

  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (bruttoZuNetto(mid, o, p).jahresnetto < ziel) lo = mid;
    else hi = mid;
  }
  return bruttoZuNetto((lo + hi) / 2, o, p);
}
