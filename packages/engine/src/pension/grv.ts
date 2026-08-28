import type { LegalParameters } from '../params/types.js';
import { datumPlus, type Datum } from '../util/datum.js';

/**
 * Regelaltersgrenze § 235 SGB VI, gestaffelt nach Geburtsjahrgang.
 * Der Prototyp setzte pauschal 67 fuer alle Jahrgaenge an und berechnete
 * dadurch fuer vor 1964 Geborene Abschlaege, die real nicht anfallen
 * (Befund C2).
 *
 * @returns Regelaltersgrenze in Jahren (z. B. 66.5 fuer 66 Jahre + 6 Monate)
 */
export function regelaltersgrenze(geburtsjahr: number): number {
  if (geburtsjahr <= 1946) return 65;
  if (geburtsjahr <= 1958) return 65 + (geburtsjahr - 1946) / 12;
  if (geburtsjahr <= 1963) return 66 + ((geburtsjahr - 1958) * 2) / 12;
  return 67;
}

/**
 * Beginn der Regelaltersrente aus dem Geburtsdatum.
 *
 * Zwei Regeln greifen nacheinander:
 *  1. § 235 SGB VI — die nach Jahrgang gestaffelte Regelaltersgrenze, oben.
 *  2. § 99 Abs. 1 SGB VI — die Rente beginnt mit dem Kalendermonat, zu dessen
 *     Beginn die Voraussetzungen erfuellt sind. Wer am Monatsersten geboren
 *     ist, erfuellt sie am Ersten dieses Monats; alle anderen erst im Lauf des
 *     Monats, die Rente beginnt dann am Ersten des FOLGEmonats.
 *
 * Beispiel: geboren am 15.03.1970 -> Regelaltersgrenze 67 -> 15.03.2037 ->
 * Rentenbeginn 01.04.2037. Geboren am 01.03.1970 -> 01.03.2037.
 */
export function regelaltersrentenbeginn(geburt: Datum): Datum {
  const grenze = regelaltersgrenze(geburt.jahr);
  const erreicht = datumPlus(geburt, grenze);

  if (geburt.tag === 1) return { ...erreicht, tag: 1 };

  const folgemonat = datumPlus({ ...erreicht, tag: 1 }, 0, 1);
  return { ...folgemonat, tag: 1 };
}

/**
 * Zu- und Abschlaege § 77 SGB VI.
 *  - vorzeitiger Bezug: 0,3 % je Monat Abschlag
 *  - Aufschub ueber die Regelaltersgrenze: 0,5 % je Monat Zuschlag
 *
 * Der Prototyp kannte nur den Abschlag; ein spaeterer Rentenbeginn brachte
 * gar keinen Vorteil.
 *
 * @returns Faktor auf die Rente (< 1 bei Abschlag, > 1 bei Zuschlag)
 */
export function zugangsfaktor(
  alterBeiRentenbeginn: number,
  geburtsjahr: number,
  opts: { besondersLangjaehrigVersichert?: boolean } = {},
): number {
  const rag = regelaltersgrenze(geburtsjahr);

  if (alterBeiRentenbeginn >= rag) {
    const monate = Math.floor((alterBeiRentenbeginn - rag) * 12);
    return 1 + monate * 0.005;
  }

  // 45 Beitragsjahre: abschlagsfreier Bezug ab der Altersgrenze fuer besonders
  // langjaehrig Versicherte (i. d. R. 65 Jahre fuer Jahrgaenge ab 1964).
  if (opts.besondersLangjaehrigVersichert && alterBeiRentenbeginn >= rag - 2) return 1;

  const monate = Math.ceil((rag - alterBeiRentenbeginn) * 12);
  const maxMonate = Math.round((rag - 63) * 12);
  return 1 - Math.min(maxMonate, monate) * 0.003;
}

/**
 * Monatliche Bruttorente aus Entgeltpunkten.
 * Rentenformel: EP x Zugangsfaktor x Rentenartfaktor x aktueller Rentenwert.
 */
export function renteAusEntgeltpunkten(
  entgeltpunkte: number,
  zugangsFaktor: number,
  p: LegalParameters,
  rentenartfaktor = 1.0,
): number {
  return entgeltpunkte * zugangsFaktor * rentenartfaktor * p.rentenwert;
}

/** Entgeltpunkte eines Beitragsjahres: Entgelt / Durchschnittsentgelt, gedeckelt an der BBG. */
export function entgeltpunkteJahr(jahresbrutto: number, p: LegalParameters): number {
  const beitragspflichtig = Math.min(Math.max(0, jahresbrutto), p.bbgRvJahr);
  return beitragspflichtig / p.durchschnittsentgelt;
}

export interface KarriereSchaetzung {
  entgeltpunkte: number;
  /** Monatsrente in HEUTIGER Kaufkraft (ohne Rentenwertdynamik) */
  monatsrenteHeutigeKaufkraft: number;
  hinweis: string;
}

/**
 * Grobe Schaetzung der Entgeltpunkte aus dem heutigen Gehalt.
 *
 * Bewusst in HEUTIGER Kaufkraft: Es wird unterstellt, dass das Gehalt in
 * gleichem Masse steigt wie das Durchschnittsentgelt — dann bleibt der
 * Entgeltpunkt-Zuwachs je Jahr konstant. Die spaetere Aufzinsung mit der
 * Rentendynamik erfolgt AUSSCHLIESSLICH in der Projektion.
 *
 * Der Prototyp mischte beides und konnte dieselbe Steigerung doppelt zaehlen
 * (Befund C-Estimator).
 */
export function schaetzeEntgeltpunkte(
  jahresbruttoHeute: number,
  alterHeute: number,
  alterBeiRentenbeginn: number,
  p: LegalParameters,
  opts: { eintrittsalter?: number; aufbauFaktorBerufsstart?: number } = {},
): KarriereSchaetzung {
  const start = opts.eintrittsalter ?? 22;
  const startAnteil = opts.aufbauFaktorBerufsstart ?? 0.5;
  const ende = Math.floor(alterBeiRentenbeginn);
  if (ende <= start) {
    return { entgeltpunkte: 0, monatsrenteHeutigeKaufkraft: 0, hinweis: 'Kein Beitragszeitraum' };
  }

  const heute = Math.max(start, Math.floor(alterHeute));
  const aufbauJahre = Math.max(0, heute - start);
  let ep = 0;

  for (let alter = start; alter < ende; alter++) {
    let gehalt = jahresbruttoHeute;
    if (alter < heute && aufbauJahre > 0) {
      // Linearer Aufbau vom Berufseinstieg bis heute.
      const t = (alter - start) / aufbauJahre;
      gehalt = jahresbruttoHeute * (startAnteil + (1 - startAnteil) * t);
    }
    ep += entgeltpunkteJahr(gehalt, p);
  }

  return {
    entgeltpunkte: ep,
    monatsrenteHeutigeKaufkraft: ep * p.rentenwert,
    hinweis:
      'Schaetzung in heutiger Kaufkraft. Unterstellt, dass das Gehalt mit dem ' +
      'Durchschnittsentgelt Schritt haelt. Kindererziehungs- und Ausbildungszeiten ' +
      'sind nicht beruecksichtigt — die Renteninformation der DRV ist genauer.',
  };
}
