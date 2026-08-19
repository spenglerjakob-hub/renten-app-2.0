import type { LegalParameters } from '../params/types.js';

/**
 * Vorabpauschale § 18 InvStG.
 *
 * Besteuert waehrend der Ansparphase jaehrlich einen fiktiven Mindestertrag.
 * Gezahlte Vorabpauschalen erhoehen die Anschaffungskosten und mindern damit
 * den spaeteren Veraeusserungsgewinn. Fehlte im Prototyp vollstaendig und
 * liess das Endkapital zu hoch erscheinen (Befund B7).
 */
export function vorabpauschale(
  wertJahresbeginn: number,
  wertsteigerungImJahr: number,
  basiszins: number,
  teilfreistellung: number,
): number {
  if (wertsteigerungImJahr <= 0) return 0;
  const basisertrag = wertJahresbeginn * basiszins * 0.7;
  const roh = Math.min(basisertrag, wertsteigerungImJahr);
  return Math.max(0, roh) * (1 - teilfreistellung);
}

export interface DepotVerlauf {
  endkapital: number;
  eingezahlt: number;
  /** Steuerlich massgebliche Anschaffungskosten inkl. versteuerter Vorabpauschalen */
  anschaffungskosten: number;
  gezahlteVorabpauschalen: number;
}

/**
 * Simuliert die Ansparphase eines Wertpapierdepots jahrweise.
 * Jahrweise statt geschlossener Formel, damit Vorabpauschale, Depotgebuehr
 * und Sonderzahlungen im richtigen Jahr wirken.
 */
export function ansparphase(
  args: {
    startkapital: number;
    einstandswert?: number;
    sparrateMonat: number;
    jahre: number;
    renditeBrutto: number;
    ter: number;
    ausgabeaufschlag: number;
    depotgebuehrJahr: number;
    sonderzahlung?: number;
    sonderzahlungInJahr?: number;
    teilfreistellung: number;
    basiszins: number;
    sparerpauschbetrag: number;
    abgeltungsteuerSatzEffektiv: number;
  },
): DepotVerlauf {
  const r = Math.max(0, args.renditeBrutto - args.ter);
  let wert = Math.max(0, args.startkapital);
  let eingezahlt = args.startkapital;
  let anschaffung = args.einstandswert ?? args.startkapital;
  let vorabSumme = 0;

  for (let j = 1; j <= args.jahre; j++) {
    const beginn = wert;
    const netteSparrate = args.sparrateMonat * (1 - args.ausgabeaufschlag);
    let zufluss = netteSparrate * 12;
    if (args.sonderzahlung && args.sonderzahlungInJahr === j) {
      zufluss += args.sonderzahlung * (1 - args.ausgabeaufschlag);
      eingezahlt += args.sonderzahlung;
      anschaffung += args.sonderzahlung;
    }
    eingezahlt += args.sparrateMonat * 12;
    anschaffung += args.sparrateMonat * 12;

    // Unterjaehrige Einzahlung naeherungsweise mit halber Rendite
    wert = (beginn + zufluss) * (1 + r) - zufluss * (r / 2);
    wert -= args.depotgebuehrJahr;

    const steigerung = wert - beginn - zufluss;
    const vp = vorabpauschale(beginn, steigerung, args.basiszins, args.teilfreistellung);
    const steuerbar = Math.max(0, vp - args.sparerpauschbetrag);
    const steuer = steuerbar * args.abgeltungsteuerSatzEffektiv;
    if (steuer > 0) {
      wert -= steuer;
      vorabSumme += vp;
      anschaffung += vp; // erhoeht die Anschaffungskosten
    }
    wert = Math.max(0, wert);
  }

  return { endkapital: wert, eingezahlt, anschaffungskosten: anschaffung, gezahlteVorabpauschalen: vorabSumme };
}

/**
 * Entnahmeplan mit FIFO-naeherndem Gewinnanteil.
 *
 * Der Prototyp unterstellte einen ueber die gesamte Laufzeit konstanten
 * Gewinnanteil. Real steigt der steuerpflichtige Anteil jeder Entnahme, weil
 * zuerst die guenstig eingekauften Anteile veraeussert werden.
 */
export function entnahmeplan(
  kapital: number,
  anschaffungskosten: number,
  jahre: number,
  rendite: number,
): { bruttoProJahr: number; gewinnanteilJeJahr: number[] } {
  if (jahre <= 0 || kapital <= 0) return { bruttoProJahr: 0, gewinnanteilJeJahr: [] };
  const r = Math.max(0, rendite);
  const brutto =
    r === 0 ? kapital / jahre : (kapital * r) / (1 - Math.pow(1 + r, -jahre));

  let restWert = kapital;
  let restKosten = Math.min(anschaffungskosten, kapital);
  const anteile: number[] = [];

  for (let j = 0; j < jahre; j++) {
    if (restWert <= 0) { anteile.push(0); continue; }
    const quote = Math.min(1, brutto / restWert);
    const kostenAnteil = restKosten * quote;
    const gewinn = Math.max(0, brutto - kostenAnteil);
    anteile.push(brutto > 0 ? gewinn / brutto : 0);
    restKosten -= kostenAnteil;
    restWert = (restWert - brutto) * (1 + r);
  }
  return { bruttoProJahr: brutto, gewinnanteilJeJahr: anteile };
}

/**
 * Guenstigerpruefung § 32d Abs. 6: Liegt der persoenliche Steuersatz unter
 * 25 %, werden Kapitalertraege auf Antrag mit dem tariflichen Satz besteuert.
 * Bei Rentnern mit kleinen Bezuegen ist das der Regelfall — der Prototyp
 * setzte immer 25 % an.
 */
export function guenstigerpruefung(
  ertrag: number,
  abgeltung: number,
  tariflich: number,
): { steuer: number; tariflichGuenstiger: boolean } {
  if (ertrag <= 0) return { steuer: 0, tariflichGuenstiger: false };
  return tariflich < abgeltung
    ? { steuer: tariflich, tariflichGuenstiger: true }
    : { steuer: abgeltung, tariflichGuenstiger: false };
}

/**
 * Steuerpflichtiger Ertrag einer Kapitallebens-/Rentenversicherung
 * bei Kapitalwahl (§ 20 Abs. 1 Nr. 6 EStG).
 *
 * Halbeinkuenfteverfahren nur, wenn BEIDE Voraussetzungen erfuellt sind:
 * Mindestlaufzeit 12 Jahre UND Auszahlung nach Vollendung des 62. Lebensjahres
 * (60 bei Vertraegen 2005-2011). Der Prototyp pruefte keine der beiden
 * Bedingungen und rechnete immer mit dem halben Ertrag (Befund B8).
 */
export function kapitalversicherungErtrag(args: {
  auszahlung: number;
  eingezahlteBeitraege: number;
  vertragsbeginnJahr: number;
  auszahlungsJahr: number;
  alterBeiAuszahlung: number;
  fondsgebunden: boolean;
  altvertragVor2005: boolean;
}): { ertrag: number; steuerpflichtigerAnteil: number; halbeinkuenfte: boolean; begruendung: string } {
  const ertrag = Math.max(0, args.auszahlung - args.eingezahlteBeitraege);
  if (args.altvertragVor2005) {
    return { ertrag, steuerpflichtigerAnteil: 0, halbeinkuenfte: false, begruendung: 'Altvertrag vor 2005: Ertraege steuerfrei (12 Jahre Laufzeit unterstellt)' };
  }

  const laufzeit = args.auszahlungsJahr - args.vertragsbeginnJahr;
  const mindestalter = args.vertragsbeginnJahr <= 2011 ? 60 : 62;
  const erfuellt = laufzeit >= 12 && args.alterBeiAuszahlung >= mindestalter;

  // Teilfreistellung 15 % nur bei fondsgebundenen Policen.
  const teilfrei = args.fondsgebunden ? 0.85 : 1.0;

  if (!erfuellt) {
    return {
      ertrag,
      steuerpflichtigerAnteil: ertrag * teilfrei,
      halbeinkuenfte: false,
      begruendung: `12/${mindestalter}-Regel nicht erfuellt (Laufzeit ${laufzeit} Jahre, Alter ${Math.floor(args.alterBeiAuszahlung)}): voller Ertrag steuerpflichtig`,
    };
  }
  return {
    ertrag,
    steuerpflichtigerAnteil: ertrag * 0.5 * teilfrei,
    halbeinkuenfte: true,
    begruendung: `12/${mindestalter}-Regel erfuellt: halber Ertrag mit persoenlichem Steuersatz`,
  };
}
