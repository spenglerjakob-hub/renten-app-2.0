import type { LegalParameters } from '../params/types.js';
import { bruttoZuNetto } from '../erwerb/netto.js';
import type { KinderStatus } from '../social/kv-pv.js';
import { arbeitgeberSvErsparnis, type MatchingSteuer } from './matching-modell.js';

/**
 * BETRIEBLICHE KRANKENVERSICHERUNG (bKV) — die Rechnung fuer den Arbeitgeber.
 *
 * Der Arbeitgeber schliesst fuer seine Belegschaft einen Gruppenvertrag ab
 * (Budget- oder Bausteintarif) und zahlt die Beitraege. Kann der Mitarbeiter
 * nur den Versicherungsschutz verlangen und kein Geld, ist das SACHLOHN
 * (BFH VI R 13/16, BMF-Schreiben zu § 8 EStG). Sachlohn bleibt bis zur
 * monatlichen Freigrenze von 50 EUR steuerfrei (§ 8 Abs. 2 S. 11 EStG) und
 * damit auch beitragsfrei in der Sozialversicherung — vorausgesetzt:
 *   - die Beitraege werden MONATLICH gezahlt (eine Jahreszahlung fliesst in
 *     einem Monat zu und reisst die Grenze),
 *   - die bKV kommt ZUSAETZLICH zum ohnehin geschuldeten Gehalt, nicht per
 *     Gehaltsumwandlung.
 *
 * FREIGRENZE, KEIN FREIBETRAG: Die 50 EUR gelten fuer ALLE Sachbezuege des
 * Monats zusammen (auch Gutschein- und Tankkarten). Liegt die Summe auch nur
 * einen Cent darueber, ist der GESAMTE Betrag steuer- und beitragspflichtig.
 *
 * Fuer den Arbeitgeber sind die Beitraege Betriebsausgabe. Die Rechnung
 * stellt die bKV einer Gehaltserhoehung gegenueber, die beim Mitarbeiter
 * netto genauso viel ankommen laesst — das ist der Vergleich, den ein
 * Arbeitgeber versteht: „Was muesste ich brutto drauflegen?"
 */

/** Sachbezugsfreigrenze im Monat, § 8 Abs. 2 S. 11 EStG (seit 2022). */
export const SACHBEZUG_FREIGRENZE_MONAT = 50;

export interface BkvEingaben {
  /** Beitrag je Mitarbeiter und Monat laut Angebot */
  beitragMonat: number;
  /** Andere Sachbezuege desselben Monats (Gutscheinkarte, Tankkarte …) */
  weitereSachbezuegeMonat: number;
  /** Bruttogehalt eines Beispiel-Mitarbeiters, fuer den Gehaltsvergleich */
  jahresbrutto: number;
  unternehmensSteuersatz: number;
  umlagenSatz: number;
  privatVersichert: boolean;
  pkvPraemieMonat: number;
  kinder: KinderStatus;
}

export interface BkvErgebnis {
  /** bKV und andere Sachbezuege bleiben zusammen in der 50-EUR-Grenze */
  inFreigrenze: boolean;
  /** Freier Rest der Freigrenze nach bKV und anderen Sachbezuegen, Monat */
  freigrenzeRestMonat: number;
  arbeitgeber: {
    beitragMonat: number;
    /** Arbeitgeberanteil SV und Umlagen — nur ausserhalb der Freigrenze */
    abgabenMonat: number;
    kostenVorSteuerMonat: number;
    steuerersparnisMonat: number;
    nettoKostenMonat: number;
  };
  mitarbeiter: {
    /** Wert des Versicherungsschutzes, Monat */
    wertMonat: number;
    /** Steuer und Abgaben, die der Mitarbeiter darauf zahlt — 0 in der Freigrenze */
    abzuegeMonat: number;
  };
  /** Gehaltserhoehung, die beim Mitarbeiter netto denselben Betrag ankommen laesst */
  gehalt: {
    bruttoMonat: number;
    agAbgabenMonat: number;
    kostenVorSteuerMonat: number;
    steuerersparnisMonat: number;
    nettoKostenMonat: number;
    svMonat: number;
    steuerMonat: number;
    nettoMonat: number;
  } | null;
  /** Was der Arbeitgeber gegenueber der Gehaltserhoehung spart, Monat nach Steuern */
  ersparnisGegenGehaltMonat: number;
  hinweise: string[];
}

const euro = (n: number) => `${Math.round(n).toLocaleString('de-DE')} €`;

function unterGrenze(brutto: number, betrag: number, bbg: number): number {
  const vorher = Math.min(Math.max(0, brutto), bbg);
  const nachher = Math.min(Math.max(0, brutto + betrag), bbg);
  return Math.max(0, nachher - vorher);
}

export function bkvModell(e: BkvEingaben, steuerOpt: MatchingSteuer, p: LegalParameters): BkvErgebnis {
  const hinweise: string[] = [];
  const beitrag = Math.max(0, e.beitragMonat);
  const weitere = Math.max(0, e.weitereSachbezuegeMonat);
  const satz = Math.min(0.6, Math.max(0, e.unternehmensSteuersatz));
  const umlagenSatz = Math.max(0, e.umlagenSatz);
  const summe = beitrag + weitere;
  const inFreigrenze = summe <= SACHBEZUG_FREIGRENZE_MONAT + 1e-9;

  const erwerbOpt = {
    ...steuerOpt,
    kinder: e.kinder,
    privatVersichert: e.privatVersichert,
    pkvPraemieMonat: e.privatVersichert ? e.pkvPraemieMonat : 0,
  };
  const heute = bruttoZuNetto(Math.max(0, e.jahresbrutto), erwerbOpt, p);
  const sk = {
    beamter: false, selbststaendig: false,
    privatVersichert: e.privatVersichert, pkvPraemieMonat: e.pkvPraemieMonat,
  };
  /** AG-Abgaben (SV-Anteil und Umlagen) auf zusaetzliches Entgelt, Jahr. */
  const agAbgaben = (betragJahr: number) =>
    arbeitgeberSvErsparnis(betragJahr, { ...sk, jahresbrutto: e.jahresbrutto + betragJahr }, steuerOpt.bundesland, p)
    + unterGrenze(e.jahresbrutto, betragJahr, p.bbgRvJahr) * umlagenSatz;

  // --- bKV ------------------------------------------------------------------
  // In der Freigrenze: weder Lohnsteuer noch Sozialabgaben. Darueber ist der
  // Beitrag Arbeitslohn — der Mitarbeiter zahlt darauf Steuer und Abgaben
  // wie auf Gehalt, der Arbeitgeber seinen SV-Anteil.
  let abgabenAg = 0;
  let abzuegeMa = 0;
  if (!inFreigrenze) {
    abgabenAg = agAbgaben(beitrag * 12) / 12;
    const mit = bruttoZuNetto(e.jahresbrutto + beitrag * 12, erwerbOpt, p);
    abzuegeMa = (beitrag * 12 - (mit.jahresnetto - heute.jahresnetto)) / 12;
  }
  const kostenVorSteuer = beitrag + abgabenAg;
  const steuerAg = kostenVorSteuer * satz;
  const nettoAg = kostenVorSteuer - steuerAg;
  const wertNetto = beitrag - abzuegeMa;

  // --- Gehaltserhoehung mit demselben Netto beim Mitarbeiter -----------------
  let gehalt: BkvErgebnis['gehalt'] = null;
  if (wertNetto > 0.5) {
    const ziel = wertNetto * 12;
    let lo = 0, hi = ziel * 4 + 1000;
    for (let i = 0; i < 60; i++) {
      const mitte = (lo + hi) / 2;
      const netto = bruttoZuNetto(e.jahresbrutto + mitte, erwerbOpt, p).jahresnetto - heute.jahresnetto;
      if (netto < ziel) lo = mitte; else hi = mitte;
    }
    const b = hi;
    const nachher = bruttoZuNetto(e.jahresbrutto + b, erwerbOpt, p);
    const ag = agAbgaben(b);
    const kosten = b + ag;
    gehalt = {
      bruttoMonat: b / 12,
      agAbgabenMonat: ag / 12,
      kostenVorSteuerMonat: kosten / 12,
      steuerersparnisMonat: kosten * satz / 12,
      nettoKostenMonat: kosten * (1 - satz) / 12,
      svMonat: (nachher.sv - heute.sv) / 12,
      steuerMonat: ((nachher.est + nachher.soli + nachher.kirchensteuer) - (heute.est + heute.soli + heute.kirchensteuer)) / 12,
      nettoMonat: (nachher.jahresnetto - heute.jahresnetto) / 12,
    };
  }

  // --- Hinweise --------------------------------------------------------------
  if (!inFreigrenze) {
    hinweise.push(
      `bKV und andere Sachbezüge liegen zusammen bei ${euro(summe)} im Monat — über der Freigrenze von `
      + `${euro(SACHBEZUG_FREIGRENZE_MONAT)}. Weil es eine Freigrenze ist und kein Freibetrag, wird damit der `
      + 'GESAMTE Betrag steuer- und beitragspflichtig, nicht nur der Teil darüber. Abhilfe: Beitrag oder andere '
      + 'Sachbezüge senken — oder mit dem Steuerberater eine Pauschalversteuerung prüfen.',
    );
  } else if (weitere > 0) {
    hinweise.push(
      `Die Freigrenze von ${euro(SACHBEZUG_FREIGRENZE_MONAT)} gilt für alle Sachbezüge zusammen. Mit den anderen `
      + `Sachbezügen bleiben noch ${euro(SACHBEZUG_FREIGRENZE_MONAT - summe)} frei.`,
    );
  }
  hinweise.push(
    'Steuerfrei nur bei monatlicher Beitragszahlung und wenn die bKV zusätzlich zum Gehalt gewährt wird — '
    + 'nicht per Gehaltsumwandlung. Der Mitarbeiter darf nur den Versicherungsschutz verlangen können, kein Geld.',
  );

  return {
    inFreigrenze,
    freigrenzeRestMonat: Math.max(0, SACHBEZUG_FREIGRENZE_MONAT - summe),
    arbeitgeber: {
      beitragMonat: beitrag,
      abgabenMonat: abgabenAg,
      kostenVorSteuerMonat: kostenVorSteuer,
      steuerersparnisMonat: steuerAg,
      nettoKostenMonat: nettoAg,
    },
    mitarbeiter: { wertMonat: beitrag, abzuegeMonat: abzuegeMa },
    gehalt,
    // Ueber der Freigrenze sind beide Wege gleich; ohne die Klammer stuende
    // dort aus Rundungsresten der Bisektion „−0 EUR".
    ersparnisGegenGehaltMonat: gehalt ? Math.max(0, gehalt.nettoKostenMonat - nettoAg) : 0,
    hinweise,
  };
}
