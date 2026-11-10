import type { VersichertePerson } from '../model.js';
import { ertragsanteil } from '../pension/freibetraege.js';
import { kapitalversicherungErtrag } from '../products/kapitalanlage.js';
import { alterExakt, parseDatum, toDe, type Datum } from '../util/datum.js';

/**
 * KINDERPOLICE — eine private Rentenversicherung, die der Kunde (Vater,
 * Mutter, Grosseltern) fuer ein Kind abschliesst und bezahlt.
 *
 * Versicherungsnehmer und Beitragszahler ist der Kunde, versicherte Person
 * und spaeter Empfaenger das Kind. Daraus folgen drei Unterschiede zu einem
 * eigenen Vertrag:
 *
 *  1. Die Rente beginnt mit dem VERTRAGSENDE BEIM KIND — meist mit seinem
 *     67. Geburtstag, Jahrzehnte nach dem Ruhestand des Kunden. Sie zaehlt
 *     deshalb nie zur Rente des Kunden; `projiziere` laesst solche Vertraege
 *     weg.
 *  2. Die Beitraege enden haeufig lange vor der Auszahlung (vorbelegt: mit
 *     dem 18. Geburtstag). Danach ruht der Vertrag — das Geld arbeitet weiter.
 *  3. Besteuert wird beim KIND, zu seinem persoenlichen Satz im Alter. Den
 *     kennt heute niemand; er ist eine Annahme, vorbelegt mit 25 %.
 *
 * Gerechnet wird wie bei einer eigenen privaten Rente: Die laufende Rente
 * mit dem Ertragsanteil nach dem Alter bei Rentenbeginn (§ 22 Nr. 1 S. 3
 * Buchst. a Doppelbuchst. bb EStG), die Kapitalauszahlung mit dem Ertrag
 * nach § 20 Abs. 1 Nr. 6 EStG — zur Haelfte, wenn der Vertrag mindestens 12
 * Jahre lief und die Auszahlung nach dem 62. Geburtstag liegt. Kranken- und
 * Pflegeversicherung fallen nicht an: Eine private Rente ist in der
 * Krankenversicherung der Rentner beitragsfrei (Annahme: das Kind ist dort
 * pflichtversichert).
 */

/** Rentenalter des Kindes, wenn der Vertrag nichts anderes sagt. */
export const KINDERPOLICE_RENTENALTER = 67;
/** Bis zu diesem Geburtstag zahlt der Kunde, wenn nichts anderes erfasst ist. */
export const KINDERPOLICE_BEITRAG_BIS_ALTER = 18;
/** Lebenserwartung des Kindes fuer die Dauer der Rente — juenger, also laenger als die eigene. */
export const KINDERPOLICE_LEBENSERWARTUNG = 90;

/** 29. Februar in einem Jahr ohne Schalttag: der 28. */
function geburtstagIm(geburt: Datum, jahr: number): Datum {
  const schalt = (jahr % 4 === 0 && jahr % 100 !== 0) || jahr % 400 === 0;
  const tag = geburt.monat === 2 && geburt.tag === 29 && !schalt ? 28 : geburt.tag;
  return { jahr, monat: geburt.monat, tag };
}

/**
 * Der Rentenbeginn beim Kind: laut Vertrag, sonst der Erste des Monats nach
 * dem 67. Geburtstag. Null, solange das Geburtsdatum nicht lesbar ist.
 */
export function kinderRentenbeginn(vp: Pick<VersichertePerson, 'geburtsdatum' | 'rentenbeginn'>): Datum | null {
  const fest = parseDatum(vp.rentenbeginn);
  if (fest) return fest;
  const g = parseDatum(vp.geburtsdatum);
  if (!g) return null;
  const dezember = g.monat === 12;
  return { jahr: g.jahr + KINDERPOLICE_RENTENALTER + (dezember ? 1 : 0), monat: dezember ? 1 : g.monat + 1, tag: 1 };
}

/** Vorschlag fuer „Beiträge bis“: der 18. Geburtstag des Kindes (TT.MM.JJJJ). */
export function beitragBisVorschlag(geburtsdatum: string): string | null {
  const g = parseDatum(geburtsdatum);
  return g ? toDe(geburtstagIm(g, g.jahr + KINDERPOLICE_BEITRAG_BIS_ALTER)) : null;
}

export interface KinderpoliceAuszahlung {
  rentenbeginn: Datum;
  /** Vollendete Lebensjahre des Kindes zum Rentenbeginn */
  alterBeiRentenbeginn: number;
  /** Persoenlicher Steuersatz des Kindes im Alter — die Annahme, mit der gerechnet ist */
  steuersatz: number;
  /** Ertragsanteil der laufenden Rente nach dem Alter bei Rentenbeginn */
  ertragsanteil: number;

  bruttoRenteMonat: number;
  steuerMonat: number;
  nettoRenteMonat: number;

  bruttoKapital: number;
  /** Ertrag der Kapitalauszahlung: Auszahlung minus eingezahlte Beitraege */
  ertragKapital: number;
  /** true, wenn nur der halbe Ertrag steuerpflichtig ist (12 Jahre Laufzeit, Auszahlung nach 62) */
  halbeinkuenfte: boolean;
  steuerKapital: number;
  nettoKapital: number;
}

/**
 * Was beim Kind ankommt — Rente und Kapital laut Angebot, nach Steuer.
 *
 * `beitragssumme` ist, was insgesamt eingezahlt wurde; sie bestimmt den
 * Ertrag der Kapitalauszahlung. Null, solange Geburtsdatum oder Rentenbeginn
 * nicht lesbar sind.
 */
export function kinderpoliceAuszahlung(args: {
  versichertePerson: VersichertePerson;
  bruttoRenteMonat: number;
  bruttoKapital: number;
  beitragssumme: number;
  vertragsbeginnJahr: number;
  altvertrag: boolean;
}): KinderpoliceAuszahlung | null {
  const vp = args.versichertePerson;
  const geburt = parseDatum(vp.geburtsdatum);
  const rentenbeginn = kinderRentenbeginn(vp);
  if (!geburt || !rentenbeginn) return null;

  const alterBeiRentenbeginn = Math.max(0, Math.floor(alterExakt(geburt, rentenbeginn) + 1e-9));
  const steuersatz = Math.min(0.45, Math.max(0, vp.steuersatzImAlter));
  const anteil = ertragsanteil(alterBeiRentenbeginn);

  const bruttoRenteMonat = Math.max(0, args.bruttoRenteMonat);
  const steuerMonat = bruttoRenteMonat * anteil * steuersatz;

  const bruttoKapital = Math.max(0, args.bruttoKapital);
  const k = kapitalversicherungErtrag({
    auszahlung: bruttoKapital,
    eingezahlteBeitraege: Math.max(0, args.beitragssumme),
    vertragsbeginnJahr: args.vertragsbeginnJahr,
    auszahlungsJahr: rentenbeginn.jahr,
    alterBeiAuszahlung: alterBeiRentenbeginn,
    // Ohne die Teilfreistellung fondsgebundener Policen — die eher vorsichtige Seite.
    fondsgebunden: false,
    altvertragVor2005: args.altvertrag,
  });
  const steuerKapital = bruttoKapital > 0 ? k.steuerpflichtigerAnteil * steuersatz : 0;

  return {
    rentenbeginn,
    alterBeiRentenbeginn,
    steuersatz,
    ertragsanteil: anteil,
    bruttoRenteMonat,
    steuerMonat,
    nettoRenteMonat: bruttoRenteMonat - steuerMonat,
    bruttoKapital,
    ertragKapital: k.ertrag,
    halbeinkuenfte: k.halbeinkuenfte,
    steuerKapital,
    nettoKapital: bruttoKapital - steuerKapital,
  };
}
