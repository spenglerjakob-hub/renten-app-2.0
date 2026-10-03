import type { LegalParameters } from '../params/types.js';
import { zusatzsteuer } from '../tax/haushalt.js';
import { bruttoZuNetto } from '../erwerb/netto.js';
import type { KinderStatus } from '../social/kv-pv.js';
import { svWirkung, SV_FREI_QUOTE, STEUER_FREI_QUOTE, type SvKontext } from './vertrags-tuev.js';

/**
 * MATCHING-MODELL: Der Mitarbeiter wandelt Entgelt um, der Arbeitgeber legt
 * einen eigenen Beitrag in eine Unterstuetzungskasse dazu.
 *
 * Die Rechnung fuer das Gespraech mit dem ARBEITGEBER. Sie beantwortet drei
 * Fragen: Was kostet ihn das wirklich, was kostet es den Mitarbeiter, und was
 * haette derselbe Betrag als Gehaltserhoehung bewirkt?
 *
 * DIE DREI STELLSCHRAUBEN, an denen die Rechnung haengt:
 *
 * 1. DER PFLICHTZUSCHUSS (§ 1a Abs. 1a BetrAVG). Wandelt der Mitarbeiter in
 *    eine Direktversicherung, Pensionskasse oder einen Pensionsfonds um, muss
 *    der Arbeitgeber 15 % des umgewandelten Entgelts dorthin weiterleiten —
 *    soweit er selbst Sozialabgaben spart. Nach dem Wortlaut erfuellt ein
 *    Beitrag in die Unterstuetzungskasse das NICHT; er kann aber Teil des
 *    Matching-Betrags sein (`zuschussImMatching`). Bei einer Umwandlung in
 *    die Unterstuetzungskasse gibt es keine Zuschusspflicht.
 *
 * 2. DIE FREIGRENZEN. In der Direktversicherung gelten 4 % der
 *    Beitragsbemessungsgrenze beitragsfrei und 8 % steuerfrei — fuer Arbeitgeber-
 *    und Arbeitnehmeranteil zusammen, der Arbeitgeberanteil zuerst. Der
 *    Pflichtzuschuss verbraucht den Rahmen also mit. Optimal ist, wenn
 *    Umwandlung und Zuschuss zusammen genau 4 % ergeben.
 *
 * 3. DIE UNTERSTUETZUNGSKASSE DES ARBEITGEBERS. Rein arbeitgeberfinanziert ist
 *    sie weder Lohn noch Arbeitsentgelt: ohne Grenze steuer- und beitragsfrei,
 *    fuer den Arbeitgeber Betriebsausgabe (§ 4d EStG). Sie belegt keinen der
 *    Rahmen oben.
 *
 * NICHT ENTHALTEN: PSV-Beitrag und Verwaltungskosten der Unterstuetzungskasse
 * (gering, vom Anbieter abhaengig) und die Leistungsseite im Alter.
 */

export type UmwandlungsWeg = 'dv' | 'ukasse';

/**
 * Was der Arbeitgeber HEUTE schon leistet — damit die Seite zeigen kann, was
 * der Umstieg auf das Modell tatsaechlich MEHR kostet.
 *
 * VL (vermoegenswirksame Leistungen) sind heute Lohn: steuer- und
 * beitragspflichtig, der Arbeitgeber zahlt seinen SV-Anteil darauf. Im neuen
 * Modell sind sie in beiden Varianten kein Lohn mehr:
 *   - 'anrechnen': Die VL entfaellt, der Arbeitgeberbeitrag des Modells
 *     ersetzt sie.
 *   - 'zusaetzlich': Die VL fliesst als zusaetzlicher Arbeitgeberbeitrag in
 *     die Betriebsrente — steuer- und beitragsfrei statt als Lohn. Im
 *     Zuschuss- und Festbetragsmodell in dieselbe Direktversicherung (sie
 *     belegt den Rahmen dann zuerst), im Matching-Modell in die
 *     Unterstuetzungskasse (ohne Rahmen).
 * Das eingegebene Jahresbrutto versteht sich EINSCHLIESSLICH der VL.
 *
 * Bestehende bAV-Beitraege in Direktversicherung oder Pensionskasse laufen
 * weiter und belegen die Rahmen von 4 % und 8 % schon. Vereinfachung: Sie
 * belegen ihn VOR dem neuen Vertrag. Streng genommen kaemen erst alle
 * Arbeitgeberbeitraege, dann die Umwandlungen (siehe `BavVorbelegung` im TUEV)
 * — fuer die Kosten des Arbeitgebers macht das kaum einen Unterschied.
 */
export interface BisherigeLeistungen {
  /** VL des Arbeitgebers je Mitarbeiter, Monat */
  vlMonat: number;
  vlUmgang: 'anrechnen' | 'zusaetzlich';
  /** Laufende Beitraege in bestehende DV/Pensionskasse (Arbeitgeber und Mitarbeiter), Monat */
  bavBestandMonat: number;
}

/** Bisher gegen neu — nur, wenn heute VL gezahlt werden. */
export interface Umstieg {
  vlMonat: number;
  vlUmgang: BisherigeLeistungen['vlUmgang'];
  bisher: {
    vlMonat: number;
    /** Arbeitgeberanteil SV und Umlagen auf die VL */
    agAbgabenMonat: number;
    kostenVorSteuerMonat: number;
    steuerersparnisMonat: number;
    nettoKostenMonat: number;
  };
  neu: {
    /** Kosten des Modells vor Steuern (Zuschuss abzueglich gesparter Abgaben) */
    modellKostenVorSteuerMonat: number;
    /** Die VL als Arbeitgeberbeitrag in der Betriebsrente — 0 bei 'anrechnen' */
    vlInBavMonat: number;
    kostenVorSteuerMonat: number;
    steuerersparnisMonat: number;
    nettoKostenMonat: number;
  };
  /** Was der Umstieg den Arbeitgeber gegenueber heute mehr kostet, netto (negativ: er spart) */
  mehrkostenNettoMonat: number;
  /** Was die VL dem Mitarbeiter heute netto bringt */
  vlNettoMitarbeiterMonat: number;
  /** Was insgesamt in die Betriebsrente fliesst, mit der VL */
  vorsorgeMitVlMonat: number;
}

export interface MatchingEingaben {
  /** Jahresbrutto des Mitarbeiters vor der Umwandlung */
  jahresbrutto: number;
  /** Entgeltumwandlung des Mitarbeiters, Monat */
  umwandlungMonat: number;
  /** Wohin der Mitarbeiter umwandelt */
  weg: UmwandlungsWeg;
  /** Matching-Beitrag des Arbeitgebers, Monat */
  matchingMonat: number;
  /**
   * Der Pflichtzuschuss ist im Matching-Betrag enthalten: In die
   * Unterstuetzungskasse fliesst dann nur der Rest.
   */
  zuschussImMatching: boolean;
  /**
   * Steuersatz des Unternehmens auf den Gewinn, z. B. 0,30 fuer eine GmbH
   * (Koerperschaftsteuer mit Soli plus Gewerbesteuer bei 400 % Hebesatz).
   */
  unternehmensSteuersatz: number;
  /** Umlagen U1, U2 und Insolvenzgeld als Satz auf das RV-pflichtige Entgelt */
  umlagenSatz: number;
  privatVersichert: boolean;
  /** Monatliche PKV-Praemie — Bezugsgroesse fuer den Arbeitgeberzuschuss */
  pkvPraemieMonat: number;
  kinder: KinderStatus;
  /** Was der Arbeitgeber heute schon leistet (VL, bestehende bAV) */
  bisher?: BisherigeLeistungen;
}

export interface MatchingSteuer {
  verheiratet: boolean;
  bundesland: string;
  kirchensteuerpflichtig: boolean;
}

/**
 * Dieselben Kosten vor Steuern als Gehaltserhoehung — mit allen
 * Zwischenschritten, damit die Seite die Rechnung Zeile fuer Zeile neben
 * das Modell stellen kann.
 */
export interface GehaltsVergleich {
  bruttoMonat: number;
  /** Arbeitgeberanteil Sozialversicherung plus Umlagen auf die Erhoehung */
  agAbgabenMonat: number;
  /** = Brutto + AG-Abgaben; gleich den Kosten vor Steuern des Modells */
  kostenVorSteuerMonat: number;
  steuerersparnisMonat: number;
  nettoKostenMonat: number;
  /** Sozialabgaben des Mitarbeiters auf die Erhoehung */
  svMonat: number;
  /** Lohnsteuer, Soli und ggf. Kirchensteuer auf die Erhoehung */
  steuerMonat: number;
  nettoMonat: number;
}

export interface MatchingErgebnis {
  mitarbeiter: {
    umwandlungMonat: number;
    svErsparnisMonat: number;
    steuerersparnisMonat: number;
    /** Was die Umwandlung ihn netto kostet */
    nettoAufwandMonat: number;
    /** Teil der Umwandlung, auf den er weiter Sozialabgaben zahlt */
    svPflichtigMonat: number;
  };
  arbeitgeber: {
    pflichtzuschussMonat: number;
    ukasseMonat: number;
    /** Gesparte Arbeitgeberanteile zur Sozialversicherung */
    svErsparnisMonat: number;
    umlagenErsparnisMonat: number;
    kostenVorSteuerMonat: number;
    steuerersparnisMonat: number;
    nettoKostenMonat: number;
  };
  vertrag: {
    direktversicherungMonat: number;
    ukasseMonat: number;
    gesamtMonat: number;
  };
  /** Dieselben Kosten vor Steuern als Gehaltserhoehung */
  gehalt: GehaltsVergleich | null;
  /** Im Vertrag je Euro Nettoaufwand des Mitarbeiters */
  hebelMitarbeiter: number;
  /** Im Vertrag je Euro Nettokosten des Arbeitgebers */
  hebelArbeitgeber: number;
  /** Gegenueber den bisherigen VL — null ohne VL */
  umstieg: Umstieg | null;
  hinweise: string[];
}

/** § 1a Abs. 1a BetrAVG — derselbe Satz wie `BAV_AG_PFLICHTZUSCHUSS` im Foerdercheck. */
const BAV_PFLICHTZUSCHUSS_QUOTE = 0.15;

const euro = (n: number) =>
  `${Math.round(n).toLocaleString('de-DE')} €`;

/** Der Teil einer Umwandlung, der unter der Grenze liegt — wie im TUEV. */
function unterGrenze(brutto: number, umwandlung: number, bbg: number): number {
  const vorher = Math.min(Math.max(0, brutto), bbg);
  const nachher = Math.min(Math.max(0, brutto - umwandlung), bbg);
  return Math.max(0, vorher - nachher);
}

/**
 * Was der ARBEITGEBER an Sozialabgaben spart, wenn `umwandlungJahr` Entgelt
 * beitragsfrei wird, Jahresbetrag. Umgekehrt gelesen: was er auf eine
 * Gehaltserhoehung dieser Hoehe zahlt (dann mit dem erhoehten Brutto).
 *
 * Wie `svWirkung`, nur mit den Arbeitgebersaetzen: In Sachsen traegt der
 * Arbeitgeber 0,5 Prozentpunkte weniger Pflegeversicherung. Bei privat
 * Versicherten spart er keine Kranken- und Pflegebeitraege — wohl aber den
 * Zuschuss zur PKV, wenn dieser am Gehalt haengt.
 */
export function arbeitgeberSvErsparnis(
  umwandlungJahr: number,
  k: SvKontext,
  bundesland: string,
  p: LegalParameters,
): number {
  if (k.beamter || k.selbststaendig) return 0;
  const u = Math.max(0, umwandlungJahr);
  const rvTeil = unterGrenze(k.jahresbrutto, u, p.bbgRvJahr);
  const rvAv = rvTeil * (p.rvSatzGesamt / 2 + p.avSatzGesamt / 2);
  if (k.privatVersichert) return rvAv + svWirkung(u, k, p).verlorenerZuschuss;
  const kvTeil = unterGrenze(k.jahresbrutto, u, p.bbgKvJahr);
  const sachsen = bundesland === 'Sachsen' ? p.pv.arbeitnehmerAnteilSachsenAufschlag : 0;
  const kvPv = kvTeil * (p.kv.allgemeinerSatz / 2 + p.kv.zusatzbeitrag / 2 + p.pv.satz / 2 - sachsen);
  return rvAv + kvPv;
}

/** Jahresbrutto ohne die VL — im neuen Modell sind sie kein Lohn mehr. */
const bruttoOhneVl = (brutto: number, b?: BisherigeLeistungen): number =>
  Math.max(0, brutto - Math.max(0, b?.vlMonat ?? 0) * 12);

/**
 * Rahmen in der Direktversicherung, den bestehende Vertraege und — bei
 * 'zusaetzlich' — die umgewidmete VL schon belegen, Jahr. `vlInDv`: Die VL
 * fliesst in die Direktversicherung (Zuschuss-/Festbetragsmodell), nicht in
 * die Unterstuetzungskasse (Matching).
 */
function vorbelegtJahr(b: BisherigeLeistungen | undefined, vlInDv: boolean): number {
  if (!b) return 0;
  const bestand = Math.max(0, b.bavBestandMonat) * 12;
  const vl = vlInDv && b.vlUmgang === 'zusaetzlich' ? Math.max(0, b.vlMonat) * 12 : 0;
  return bestand + vl;
}

/** Der beitragsfreie Rahmen (4 %) nach der Vorbelegung, Jahr. */
const svRahmen = (p: LegalParameters, vorbelegt: number) => Math.max(0, SV_FREI_QUOTE * p.bbgRvJahr - vorbelegt);
/** Der steuerfreie Rahmen (8 %) nach der Vorbelegung, Jahr. */
const steuerRahmen = (p: LegalParameters, vorbelegt: number) => Math.max(0, STEUER_FREI_QUOTE * p.bbgRvJahr - vorbelegt);

interface Aufteilung {
  /** Umwandlung, Jahr */
  e: number;
  /** Pflichtzuschuss, Jahr */
  z: number;
  /** beitragsfreier Teil der Umwandlung, Jahr */
  svFrei: number;
  /** AG-Ersparnis Sozialabgaben, Jahr */
  agSv: number;
}

/**
 * Pflichtzuschuss und beitragsfreier Teil haengen voneinander ab: Der
 * Zuschuss belegt den Rahmen zuerst, und er ist auf die Ersparnis des
 * Arbeitgebers begrenzt, die wiederum am beitragsfreien Teil haengt. Die
 * Schleife daempft, damit sie auch im PKV-Fall sicher zur Ruhe kommt.
 */
function aufteilen(
  e: number, weg: UmwandlungsWeg, sk: SvKontext, bundesland: string, p: LegalParameters, vorbelegt = 0,
): Aufteilung {
  // Die Umwandlung in die Unterstuetzungskasse hat ihren eigenen Rahmen
  // (§ 14 Abs. 1 S. 2 SGB IV) — bestehende Direktversicherungen belegen ihn nicht.
  const svGrenze = weg === 'ukasse' ? SV_FREI_QUOTE * p.bbgRvJahr : svRahmen(p, vorbelegt);
  if (weg === 'ukasse') {
    const svFrei = Math.min(e, svGrenze);
    return { e, z: 0, svFrei, agSv: arbeitgeberSvErsparnis(svFrei, sk, bundesland, p) };
  }
  let z = BAV_PFLICHTZUSCHUSS_QUOTE * e;
  let svFrei = 0, agSv = 0;
  for (let i = 0; i < 60; i++) {
    svFrei = Math.min(e, Math.max(0, svGrenze - z));
    agSv = arbeitgeberSvErsparnis(svFrei, sk, bundesland, p);
    const neu = Math.min(BAV_PFLICHTZUSCHUSS_QUOTE * e, agSv);
    if (Math.abs(neu - z) < 0.001) { z = neu; break; }
    z = (z + neu) / 2;
  }
  svFrei = Math.min(e, Math.max(0, svGrenze - z));
  return { e, z, svFrei, agSv: arbeitgeberSvErsparnis(svFrei, sk, bundesland, p) };
}

type SvEingaben = Pick<MatchingEingaben, 'jahresbrutto' | 'privatVersichert' | 'pkvPraemieMonat' | 'bisher'>;

/** SV-Kontext des Modells — mit dem Brutto OHNE VL. */
const svKontext = (e: SvEingaben): SvKontext => ({
  beamter: false,
  selbststaendig: false,
  privatVersichert: e.privatVersichert,
  pkvPraemieMonat: e.pkvPraemieMonat,
  jahresbrutto: bruttoOhneVl(e.jahresbrutto, e.bisher),
});

/**
 * Die Umwandlung, bei der Umwandlung und Pflichtzuschuss den beitragsfreien
 * Rahmen genau fuellen — Monatsbetrag, auf Cent abgerundet.
 *
 * In der Direktversicherung sind das 2026 rund 294 EUR (plus 44 EUR
 * Zuschuss = 338 EUR), in der Unterstuetzungskasse die vollen 338 EUR.
 */
export function optimaleUmwandlung(
  weg: UmwandlungsWeg,
  e: SvEingaben,
  bundesland: string,
  p: LegalParameters,
): number {
  if (weg === 'ukasse') return Math.floor(SV_FREI_QUOTE * p.bbgRvJahr / 12 * 100) / 100;
  // Im Matching-Modell fliesst die VL in die Unterstuetzungskasse — nur der Bestand belegt den Rahmen.
  const vorbelegt = vorbelegtJahr(e.bisher, false);
  const svGrenze = svRahmen(p, vorbelegt);
  const sk = svKontext(e);
  let lo = 0, hi = svGrenze;
  for (let i = 0; i < 60; i++) {
    const mitte = (lo + hi) / 2;
    const a = aufteilen(mitte, weg, sk, bundesland, p, vorbelegt);
    if (a.e + a.z > svGrenze) hi = mitte; else lo = mitte;
  }
  return Math.floor(lo / 12 * 100) / 100;
}

/**
 * Welche Gehaltserhoehung dieselben Personalkosten vor Steuern verursacht —
 * und was davon beim Mitarbeiter netto ankommt. `null`, wenn das Modell den
 * Arbeitgeber nichts kostet.
 */
/**
 * Bisher gegen neu. `modellKostenVorSteuer` und `vlInBav` als Jahresbetraege;
 * `bruttoMitVl` ist das eingegebene Brutto (mit VL), `sk` der Kontext dazu.
 */
function umstiegRechnen(
  b: BisherigeLeistungen | undefined,
  bruttoMitVl: number,
  modellKostenVorSteuer: number,
  vorsorgeModell: number,
  sk: SvKontext,
  erwerbOpt: Parameters<typeof bruttoZuNetto>[1],
  satz: number,
  umlagenSatz: number,
  bundesland: string,
  p: LegalParameters,
): Umstieg | null {
  const vl = Math.max(0, b?.vlMonat ?? 0) * 12;
  if (!b || vl <= 0) return null;
  // Heute: VL als Lohn. Der Arbeitgeber zahlt darauf seinen SV-Anteil und
  // die Umlagen — genau das, was er spart, wenn sie kein Lohn mehr sind.
  const k = { ...sk, jahresbrutto: bruttoMitVl };
  const abgaben = arbeitgeberSvErsparnis(vl, k, bundesland, p) + unterGrenze(bruttoMitVl, vl, p.bbgRvJahr) * umlagenSatz;
  const bisherKosten = vl + abgaben;
  const vlInBav = b.vlUmgang === 'zusaetzlich' ? vl : 0;
  const neuKosten = modellKostenVorSteuer + vlInBav;
  const vlNetto = bruttoZuNetto(bruttoMitVl, erwerbOpt, p).jahresnetto
    - bruttoZuNetto(Math.max(0, bruttoMitVl - vl), erwerbOpt, p).jahresnetto;
  return {
    vlMonat: vl / 12,
    vlUmgang: b.vlUmgang,
    bisher: {
      vlMonat: vl / 12,
      agAbgabenMonat: abgaben / 12,
      kostenVorSteuerMonat: bisherKosten / 12,
      steuerersparnisMonat: bisherKosten * satz / 12,
      nettoKostenMonat: bisherKosten * (1 - satz) / 12,
    },
    neu: {
      modellKostenVorSteuerMonat: modellKostenVorSteuer / 12,
      vlInBavMonat: vlInBav / 12,
      kostenVorSteuerMonat: neuKosten / 12,
      steuerersparnisMonat: neuKosten * satz / 12,
      nettoKostenMonat: neuKosten * (1 - satz) / 12,
    },
    mehrkostenNettoMonat: (neuKosten - bisherKosten) * (1 - satz) / 12,
    vlNettoMitarbeiterMonat: vlNetto / 12,
    vorsorgeMitVlMonat: (vorsorgeModell + vlInBav) / 12,
  };
}

/** Hinweis zum Bestand — fuer alle drei Modelle gleich. */
function bisherHinweise(b: BisherigeLeistungen | undefined, vorbelegt: number, p: LegalParameters): string[] {
  // Was zur VL zu sagen ist (Vereinbarung noetig, was beim Mitarbeiter
  // wegfaellt), steht beim Vergleich bisher/neu auf der Seite — dort, wo die
  // Zahlen stehen, und im Druck auf derselben Seite.
  const h: string[] = [];
  const bestand = Math.max(0, b?.bavBestandMonat ?? 0) * 12;
  if (bestand > 0) {
    h.push(
      `Bestehende Verträge belegen ${euro(bestand / 12)} des beitragsfreien Rahmens von `
      + `${euro(SV_FREI_QUOTE * p.bbgRvJahr / 12)}${vorbelegt > bestand + 0.5 ? ', die umgewidmete VL weitere ' + euro((vorbelegt - bestand) / 12) : ''}. `
      + `Für den neuen Vertrag bleiben ${euro(svRahmen(p, vorbelegt) / 12)} beitragsfrei.`,
    );
  }
  return h;
}

function gehaltsVergleich(
  kostenVorSteuer: number,
  e: Pick<MatchingEingaben, 'jahresbrutto'>,
  sk: SvKontext,
  erwerbOpt: Parameters<typeof bruttoZuNetto>[1],
  heute: ReturnType<typeof bruttoZuNetto>,
  satz: number,
  umlagenSatz: number,
  bundesland: string,
  p: LegalParameters,
): GehaltsVergleich | null {
  if (kostenVorSteuer <= 1) return null;
  const kostenGehalt = (b: number) => {
    const k2 = { ...sk, jahresbrutto: e.jahresbrutto + b };
    return b + arbeitgeberSvErsparnis(b, k2, bundesland, p)
      + unterGrenze(e.jahresbrutto + b, b, p.bbgRvJahr) * umlagenSatz;
  };
  let lo = 0, hi = kostenVorSteuer;
  for (let i = 0; i < 60; i++) {
    const mitte = (lo + hi) / 2;
    if (kostenGehalt(mitte) > kostenVorSteuer) hi = mitte; else lo = mitte;
  }
  const nachher = bruttoZuNetto(e.jahresbrutto + lo, erwerbOpt, p);
  const kosten = kostenGehalt(lo);
  const sv = nachher.sv - heute.sv;
  const steuer = (nachher.est + nachher.soli + nachher.kirchensteuer) - (heute.est + heute.soli + heute.kirchensteuer);
  return {
    bruttoMonat: lo / 12,
    agAbgabenMonat: (kosten - lo) / 12,
    kostenVorSteuerMonat: kosten / 12,
    steuerersparnisMonat: kosten * satz / 12,
    nettoKostenMonat: kosten * (1 - satz) / 12,
    svMonat: sv / 12,
    steuerMonat: steuer / 12,
    nettoMonat: (nachher.jahresnetto - heute.jahresnetto) / 12,
  };
}

export function matchingModell(
  eIn: MatchingEingaben,
  steuerOpt: MatchingSteuer,
  p: LegalParameters,
): MatchingErgebnis {
  const hinweise: string[] = [];
  // Gerechnet wird mit dem Brutto OHNE VL — im neuen Modell sind sie kein
  // Lohn mehr. Die VL selbst fliesst hier in die Unterstuetzungskasse und
  // belegt keinen Rahmen; der Bestand schon.
  const b = eIn.bisher;
  const e: MatchingEingaben = { ...eIn, jahresbrutto: bruttoOhneVl(eIn.jahresbrutto, b), bisher: undefined };
  const vorbelegt = vorbelegtJahr(b, false);
  const sk = svKontext(e);
  const steuerGrenze = steuerRahmen(p, vorbelegt);
  const svGrenze = svRahmen(p, vorbelegt);
  const satz = Math.min(0.6, Math.max(0, e.unternehmensSteuersatz));
  const umlagenSatz = Math.max(0, e.umlagenSatz);

  const erwerbOpt = {
    ...steuerOpt,
    kinder: e.kinder,
    privatVersichert: e.privatVersichert,
    pkvPraemieMonat: e.privatVersichert ? e.pkvPraemieMonat : 0,
  };
  const heute = bruttoZuNetto(Math.max(0, e.jahresbrutto), erwerbOpt, p);

  // --- Mitarbeiter ---------------------------------------------------------
  const a = aufteilen(Math.max(0, e.umwandlungMonat) * 12, e.weg, sk, steuerOpt.bundesland, p, vorbelegt);
  const steuerFrei = e.weg === 'dv' ? Math.min(a.e, Math.max(0, steuerGrenze - a.z)) : a.e;
  const wirkung = svWirkung(a.svFrei, sk, p);
  const zveMinderung = Math.max(0, steuerFrei - wirkung.wegfallenderAbzug);
  const steuerAn = zusatzsteuer(heute.zve - zveMinderung, zveMinderung, steuerOpt, p);
  const aufwandAn = Math.max(0, a.e - wirkung.ersparnis - steuerAn);

  // --- Arbeitgeber ---------------------------------------------------------
  const matching = Math.max(0, e.matchingMonat) * 12;
  const ukasseAg = e.zuschussImMatching ? Math.max(0, matching - a.z) : matching;
  const umlagen = unterGrenze(e.jahresbrutto, a.svFrei, p.bbgRvJahr) * umlagenSatz;
  const kostenVorSteuer = a.z + ukasseAg - a.agSv - umlagen;
  const steuerAg = kostenVorSteuer * satz;
  const nettoAg = kostenVorSteuer - steuerAg;

  const dv = e.weg === 'dv' ? a.e + a.z : 0;
  const uk = ukasseAg + (e.weg === 'ukasse' ? a.e : 0);

  // --- Vergleich: dieselben Kosten vor Steuern als Gehaltserhoehung ---------
  const gehalt = gehaltsVergleich(kostenVorSteuer, e, sk, erwerbOpt, heute, satz, umlagenSatz, steuerOpt.bundesland, p);

  // --- Hinweise ------------------------------------------------------------
  if (e.weg === 'dv' && a.e + a.z > svGrenze + 6) {
    const optimal = optimaleUmwandlung('dv', eIn, steuerOpt.bundesland, p);
    hinweise.push(
      `Umwandlung und Pflichtzuschuss liegen zusammen um ${euro((a.e + a.z - svGrenze) / 12)} im Monat `
      + `über dem beitragsfreien Rahmen von ${euro(svGrenze / 12)}. Der Zuschuss wird zuerst `
      + `angerechnet, auf ${euro((a.e - a.svFrei) / 12)} der Umwandlung fallen deshalb Sozialabgaben an. `
      + `Optimal: ${euro(optimal)} umwandeln — mit Zuschuss genau ${euro(svGrenze / 12)}.`,
    );
  }
  if (e.weg === 'dv' && a.e > 0 && a.z < BAV_PFLICHTZUSCHUSS_QUOTE * a.e - 0.5) {
    hinweise.push(
      'Der Pflichtzuschuss ist auf die Sozialabgaben begrenzt, die der Arbeitgeber tatsächlich spart '
      + `(„soweit“, § 1a Abs. 1a BetrAVG) — hier ${euro(a.z / 12)} statt 15 %.`,
    );
  }
  if (e.weg === 'ukasse') {
    hinweise.push(
      'Bei einer Umwandlung in die Unterstützungskasse gibt es keinen Pflichtzuschuss — er gilt nur für '
      + 'Direktversicherung, Pensionskasse und Pensionsfonds. Beitragsfrei sind auch hier 4 % der '
      + 'Beitragsbemessungsgrenze (§ 14 Abs. 1 S. 2 SGB IV), steuerfrei ohne Grenze.',
    );
  } else if (e.matchingMonat > 0 && !e.zuschussImMatching) {
    hinweise.push(
      'Der Pflichtzuschuss fließt in die Direktversicherung, nicht in die Unterstützungskasse. Er kann Teil '
      + 'des Matching-Betrags sein, wenn die Versorgungsordnung das so regelt („Arbeitgeberbeitrag '
      + 'insgesamt … €, der gesetzliche Zuschuss ist darin enthalten“).',
    );
  }
  if (e.privatVersichert) {
    hinweise.push(
      'Privat versichert: Der Arbeitgeber spart nur Renten- und Arbeitslosenversicherung, keine Kranken- '
      + 'und Pflegebeiträge. Die Ersparnis fällt entsprechend kleiner aus.',
    );
  } else if (e.jahresbrutto > p.bbgKvJahr) {
    hinweise.push(
      'Das Gehalt liegt über der Beitragsbemessungsgrenze der Krankenversicherung: Dort spart die Umwandlung '
      + 'keine Beiträge, nur noch bei Renten- und Arbeitslosenversicherung.',
    );
  }

  const umstieg = umstiegRechnen(b, eIn.jahresbrutto, kostenVorSteuer, dv + uk, sk, erwerbOpt, satz, umlagenSatz, steuerOpt.bundesland, p);
  // Bei Umwandlung in die Unterstuetzungskasse belegt der Bestand den Rahmen nicht.
  hinweise.push(...bisherHinweise(e.weg === 'dv' ? b : (b && { ...b, bavBestandMonat: 0 }), e.weg === 'dv' ? vorbelegt : 0, p));

  return {
    mitarbeiter: {
      umwandlungMonat: a.e / 12,
      svErsparnisMonat: wirkung.ersparnis / 12,
      steuerersparnisMonat: steuerAn / 12,
      nettoAufwandMonat: aufwandAn / 12,
      svPflichtigMonat: (a.e - a.svFrei) / 12,
    },
    arbeitgeber: {
      pflichtzuschussMonat: a.z / 12,
      ukasseMonat: ukasseAg / 12,
      svErsparnisMonat: a.agSv / 12,
      umlagenErsparnisMonat: umlagen / 12,
      kostenVorSteuerMonat: kostenVorSteuer / 12,
      steuerersparnisMonat: steuerAg / 12,
      nettoKostenMonat: nettoAg / 12,
    },
    vertrag: { direktversicherungMonat: dv / 12, ukasseMonat: uk / 12, gesamtMonat: (dv + uk) / 12 },
    gehalt,
    hebelMitarbeiter: aufwandAn > 0 ? (dv + uk) / aufwandAn : 0,
    hebelArbeitgeber: nettoAg > 0 ? (dv + uk) / nettoAg : 0,
    umstieg,
    hinweise,
  };
}

/* ==========================================================================
 * ZUSCHUSSMODELL: der Arbeitgeber gibt einen festen Anteil der
 * Entgeltumwandlung dazu, gedeckelt — alles in EINE Direktversicherung.
 *
 * Die einfache Schwester des Matching-Modells: keine Unterstuetzungskasse,
 * kein PSV, ein Vertrag, den der Mitarbeiter beim Wechsel mitnimmt. Der
 * gesetzliche Pflichtzuschuss (§ 1a Abs. 1a BetrAVG) ist im Zuschuss
 * enthalten; liegt die Quote darunter, zahlt der Arbeitgeber mindestens ihn.
 *
 * Weil alles in derselben Direktversicherung liegt, belegt der Zuschuss die
 * Freigrenzen zuerst — wie im TUEV. Voll ausgeschoepft ist der beitragsfreie
 * Rahmen, wenn Umwandlung und Zuschuss zusammen 4 % ergeben.
 * ======================================================================== */

export interface ZuschussEingaben
  extends Omit<MatchingEingaben, 'weg' | 'matchingMonat' | 'zuschussImMatching'> {
  /** Anteil der Umwandlung, den der Arbeitgeber dazugibt, z. B. 0,5 */
  quote: number;
  /** Hoechstbetrag des Zuschusses, Monat */
  deckelMonat: number;
}

export interface ZuschussErgebnis {
  mitarbeiter: MatchingErgebnis['mitarbeiter'];
  arbeitgeber: {
    /** Gesamter Zuschuss in die Direktversicherung */
    zuschussMonat: number;
    /** davon gesetzlicher Pflichtzuschuss */
    davonPflichtzuschussMonat: number;
    /** davon freiwillig ueber die Pflicht hinaus */
    freiwilligMonat: number;
    svErsparnisMonat: number;
    umlagenErsparnisMonat: number;
    kostenVorSteuerMonat: number;
    steuerersparnisMonat: number;
    nettoKostenMonat: number;
  };
  /** Was insgesamt in die Direktversicherung fliesst */
  vertragMonat: number;
  /** Der Deckel begrenzt den Zuschuss */
  gedeckelt: boolean;
  gehalt: GehaltsVergleich | null;
  hebelMitarbeiter: number;
  hebelArbeitgeber: number;
  /** Gegenueber den bisherigen VL — null ohne VL */
  umstieg: Umstieg | null;
  hinweise: string[];
}

interface ZuschussAufteilung {
  e: number;
  ag: number;
  pflicht: number;
  svFrei: number;
  agSv: number;
}

/**
 * Die Zuschussregel eines Modells: Arbeitgeberbeitrag im Jahr fuer eine
 * Umwandlung im Jahr — VOR der Untergrenze Pflichtzuschuss, die
 * `zuschussAufteilen` selbst setzt.
 */
type ZuschussRegel = (umwandlungJahr: number) => number;

const quotenRegel = (quote: number, deckelMonat: number): ZuschussRegel =>
  (e) => Math.min(Math.max(0, quote) * e, Math.max(0, deckelMonat) * 12);

/** Zuschuss, Pflichtzuschuss und beitragsfreier Teil fuer eine Umwandlung (Jahr). */
function zuschussAufteilen(
  e: number, regelFn: ZuschussRegel, sk: SvKontext, bundesland: string, p: LegalParameters, vorbelegt = 0,
): ZuschussAufteilung {
  const svGrenze = svRahmen(p, vorbelegt);
  const regel = Math.max(0, regelFn(e));
  let ag = regel, pflicht = 0, svFrei = 0, agSv = 0;
  // Nur wenn die Regel unter dem Pflichtzuschuss liegt, haengen beide
  // voneinander ab — gedaempft wie in `aufteilen`.
  for (let i = 0; i < 60; i++) {
    svFrei = Math.min(e, Math.max(0, svGrenze - ag));
    agSv = arbeitgeberSvErsparnis(svFrei, sk, bundesland, p);
    pflicht = Math.min(BAV_PFLICHTZUSCHUSS_QUOTE * e, agSv);
    const neu = Math.max(regel, pflicht);
    if (Math.abs(neu - ag) < 0.001) { ag = neu; break; }
    ag = (ag + neu) / 2;
  }
  svFrei = Math.min(e, Math.max(0, svGrenze - ag));
  agSv = arbeitgeberSvErsparnis(svFrei, sk, bundesland, p);
  return { e, ag, pflicht: Math.min(pflicht, ag), svFrei, agSv };
}

/**
 * Die Umwandlung, bei der Umwandlung und Zuschuss den beitragsfreien Rahmen
 * genau fuellen — Monat, auf Cent abgerundet. Mit 50 % und 100 EUR Deckel
 * 2026: 238 EUR.
 */
export function zuschussVollAusschoepfen(
  e: Pick<ZuschussEingaben, 'jahresbrutto' | 'privatVersichert' | 'pkvPraemieMonat' | 'quote' | 'deckelMonat' | 'bisher'>,
  bundesland: string,
  p: LegalParameters,
): number {
  return rahmenVoll(e, quotenRegel(e.quote, e.deckelMonat), bundesland, p, vorbelegtJahr(e.bisher, true));
}

/**
 * Groesste Umwandlung, bei der Umwandlung und Zuschuss noch in den
 * beitragsfreien Rahmen passen. Die Summe steigt mit der Umwandlung (der
 * Zuschuss faellt nie schneller, als die Umwandlung waechst) — deshalb
 * genuegt eine Bisektion.
 */
function rahmenVoll(
  e: SvEingaben,
  regel: ZuschussRegel,
  bundesland: string,
  p: LegalParameters,
  vorbelegt = 0,
): number {
  const svGrenze = svRahmen(p, vorbelegt);
  const sk = svKontext(e);
  let lo = 0, hi = svGrenze;
  for (let i = 0; i < 60; i++) {
    const mitte = (lo + hi) / 2;
    const a = zuschussAufteilen(mitte, regel, sk, bundesland, p, vorbelegt);
    if (a.e + a.ag > svGrenze) hi = mitte; else lo = mitte;
  }
  return Math.floor(lo / 12 * 100) / 100;
}

/** Was beide Zuschussmodelle gemeinsam brauchen — ohne Quote, Deckel oder Festbetrag. */
type KernEingaben = Omit<ZuschussEingaben, 'quote' | 'deckelMonat'>;

/**
 * Die gemeinsame Rechnung von Zuschuss- und Festbetragsmodell: alles in einer
 * Direktversicherung, der Zuschuss nach `regel`, mindestens der
 * Pflichtzuschuss. Modellspezifische Hinweise liefert `eigeneHinweise`; sie
 * stehen nach dem Hinweis zum Rahmen und vor denen zur Krankenversicherung.
 */
function zuschussKern(
  eIn: KernEingaben,
  regel: ZuschussRegel,
  steuerOpt: MatchingSteuer,
  p: LegalParameters,
  eigeneHinweise: (a: ZuschussAufteilung) => string[],
): ZuschussErgebnis {
  const hinweise: string[] = [];
  // Brutto ohne VL; Bestand und (bei 'zusaetzlich') die VL belegen den Rahmen
  // der Direktversicherung zuerst.
  const b = eIn.bisher;
  const e: KernEingaben = { ...eIn, jahresbrutto: bruttoOhneVl(eIn.jahresbrutto, b), bisher: undefined };
  const vorbelegt = vorbelegtJahr(b, true);
  const sk = svKontext(e);
  const svGrenze = svRahmen(p, vorbelegt);
  const steuerGrenze = steuerRahmen(p, vorbelegt);
  const satz = Math.min(0.6, Math.max(0, e.unternehmensSteuersatz));
  const umlagenSatz = Math.max(0, e.umlagenSatz);
  const erwerbOpt = {
    ...steuerOpt,
    kinder: e.kinder,
    privatVersichert: e.privatVersichert,
    pkvPraemieMonat: e.privatVersichert ? e.pkvPraemieMonat : 0,
  };
  const heute = bruttoZuNetto(Math.max(0, e.jahresbrutto), erwerbOpt, p);

  const a = zuschussAufteilen(Math.max(0, e.umwandlungMonat) * 12, regel, sk, steuerOpt.bundesland, p, vorbelegt);

  // --- Mitarbeiter ---------------------------------------------------------
  const steuerFrei = Math.min(a.e, Math.max(0, steuerGrenze - a.ag));
  const wirkung = svWirkung(a.svFrei, sk, p);
  const zveMinderung = Math.max(0, steuerFrei - wirkung.wegfallenderAbzug);
  const steuerAn = zusatzsteuer(heute.zve - zveMinderung, zveMinderung, steuerOpt, p);
  const aufwandAn = Math.max(0, a.e - wirkung.ersparnis - steuerAn);

  // --- Arbeitgeber ---------------------------------------------------------
  const umlagen = unterGrenze(e.jahresbrutto, a.svFrei, p.bbgRvJahr) * umlagenSatz;
  const kostenVorSteuer = a.ag - a.agSv - umlagen;
  const steuerAg = kostenVorSteuer * satz;
  const nettoAg = kostenVorSteuer - steuerAg;
  const vertrag = a.e + a.ag;

  const gehalt = gehaltsVergleich(kostenVorSteuer, e, sk, erwerbOpt, heute, satz, umlagenSatz, steuerOpt.bundesland, p);

  // --- Hinweise ------------------------------------------------------------
  if (a.e > 0 && vertrag > svGrenze + 6) {
    const voll = rahmenVoll(e, regel, steuerOpt.bundesland, p, vorbelegt);
    hinweise.push(
      `Umwandlung und Zuschuss liegen zusammen um ${euro((vertrag - svGrenze) / 12)} im Monat über dem `
      + `beitragsfreien Rahmen von ${euro(svGrenze / 12)}. Der Zuschuss wird zuerst angerechnet, auf `
      + `${euro((a.e - a.svFrei) / 12)} der Umwandlung fallen deshalb Sozialabgaben an. Voll ausgeschöpft `
      + `ist der Rahmen mit ${euro(voll)} Umwandlung.`,
    );
  }
  hinweise.push(...eigeneHinweise(a));
  if (a.ag > svGrenze + 0.5) {
    hinweise.push(
      `Der Zuschuss allein liegt über dem beitragsfreien Rahmen von ${euro(svGrenze / 12)}. Der Rest ist für `
      + 'den Mitarbeiter Arbeitsentgelt; in der Rechnung ist das nicht enthalten.',
    );
  }
  if (e.privatVersichert) {
    hinweise.push(
      'Privat versichert: Der Arbeitgeber spart nur Renten- und Arbeitslosenversicherung, keine Kranken- '
      + 'und Pflegebeiträge. Die Ersparnis fällt entsprechend kleiner aus.',
    );
  } else if (e.jahresbrutto > p.bbgKvJahr) {
    hinweise.push(
      'Das Gehalt liegt über der Beitragsbemessungsgrenze der Krankenversicherung: Dort spart die Umwandlung '
      + 'keine Beiträge, nur noch bei Renten- und Arbeitslosenversicherung.',
    );
  }

  const umstieg = umstiegRechnen(b, eIn.jahresbrutto, kostenVorSteuer, vertrag, sk, erwerbOpt, satz, umlagenSatz, steuerOpt.bundesland, p);
  hinweise.push(...bisherHinweise(b, vorbelegt, p));

  return {
    mitarbeiter: {
      umwandlungMonat: a.e / 12,
      svErsparnisMonat: wirkung.ersparnis / 12,
      steuerersparnisMonat: steuerAn / 12,
      nettoAufwandMonat: aufwandAn / 12,
      svPflichtigMonat: (a.e - a.svFrei) / 12,
    },
    arbeitgeber: {
      zuschussMonat: a.ag / 12,
      davonPflichtzuschussMonat: a.pflicht / 12,
      freiwilligMonat: Math.max(0, a.ag - a.pflicht) / 12,
      svErsparnisMonat: a.agSv / 12,
      umlagenErsparnisMonat: umlagen / 12,
      kostenVorSteuerMonat: kostenVorSteuer / 12,
      steuerersparnisMonat: steuerAg / 12,
      nettoKostenMonat: nettoAg / 12,
    },
    vertragMonat: vertrag / 12,
    gedeckelt: false,
    gehalt,
    hebelMitarbeiter: aufwandAn > 0 ? vertrag / aufwandAn : 0,
    hebelArbeitgeber: nettoAg > 0 ? vertrag / nettoAg : 0,
    umstieg,
    hinweise,
  };
}

export function zuschussModell(
  e: ZuschussEingaben,
  steuerOpt: MatchingSteuer,
  p: LegalParameters,
): ZuschussErgebnis {
  const quote = Math.max(0, e.quote);
  const gedeckeltBei = (u: number) => quote * u > e.deckelMonat * 12 + 0.5;
  const r = zuschussKern(e, quotenRegel(e.quote, e.deckelMonat), steuerOpt, p, (a) => {
    const h: string[] = [];
    if (gedeckeltBei(a.e)) {
      h.push(
        `Der Zuschuss ist bei ${euro(e.deckelMonat)} im Monat gedeckelt — jeder weitere Euro Umwandlung `
        + 'wird nicht mehr bezuschusst. Solange er beitragsfrei bleibt, senkt er die Kosten des Arbeitgebers '
        + 'sogar: Der Zuschuss steht fest, die gesparten Sozialabgaben wachsen mit.',
      );
    }
    if (a.e > 0 && quote * a.e < a.pflicht - 0.5) {
      h.push(
        'Die Zuschussquote liegt unter dem gesetzlichen Pflichtzuschuss. Gezahlt werden mindestens 15 % '
        + 'der Umwandlung, soweit der Arbeitgeber Sozialabgaben spart (§ 1a Abs. 1a BetrAVG).',
      );
    }
    return h;
  });
  return { ...r, gedeckelt: gedeckeltBei(r.mitarbeiter.umwandlungMonat * 12) };
}

export interface ZuschussStufe {
  umwandlungMonat: number;
  zuschussMonat: number;
  arbeitgeberNettoMonat: number;
  mitarbeiterNettoMonat: number;
  vertragMonat: number;
  /** Die Stufe, die den beitragsfreien Rahmen voll ausschoepft */
  voll: boolean;
}

/**
 * Die Staffel fuer den Arbeitgeber: was kostet ein Mitarbeiter bei 50, 100,
 * 150, 200 EUR Umwandlung — und beim voll ausgeschoepften Rahmen.
 */
export function zuschussStaffel(
  e: ZuschussEingaben,
  steuerOpt: MatchingSteuer,
  p: LegalParameters,
  stufen: readonly number[] = [50, 100, 150, 200],
): ZuschussStufe[] {
  const voll = zuschussVollAusschoepfen(e, steuerOpt.bundesland, p);
  const alle = [...new Set([...stufen, voll])].filter((x) => x > 0).sort((x, y) => x - y);
  return alle.map((u) => {
    const r = zuschussModell({ ...e, umwandlungMonat: u }, steuerOpt, p);
    return {
      umwandlungMonat: u,
      zuschussMonat: r.arbeitgeber.zuschussMonat,
      arbeitgeberNettoMonat: r.arbeitgeber.nettoKostenMonat,
      mitarbeiterNettoMonat: r.mitarbeiter.nettoAufwandMonat,
      vertragMonat: r.vertragMonat,
      voll: u === voll,
    };
  });
}

/* ==========================================================================
 * FESTBETRAGSMODELL: „50 EUR fuer jeden, der mindestens 50 EUR einzahlt".
 *
 * Der Arbeitgeber zahlt einen festen Betrag, sobald der Mitarbeiter eine
 * Mindestumwandlung erreicht — unabhaengig davon, wie viel er darueber hinaus
 * einzahlt und wie viel er verdient. Das ist die Gleichbehandlung, um die es
 * geht: Wer wenig verdient, bekommt denselben Zuschuss wie der Gutverdiener.
 *
 * Darunter gibt es nur den gesetzlichen Pflichtzuschuss. Darueber bleibt der
 * Festbetrag stehen — bis 15 % der Umwandlung mehr ausmachen (bei 50 EUR ab
 * rund 333 EUR Umwandlung); dann gilt die Pflicht.
 * ======================================================================== */

export interface FestbetragEingaben extends KernEingaben {
  /** Fester Arbeitgeberbeitrag, Monat */
  festbetragMonat: number;
  /** Ab dieser Umwandlung (Monat) gibt es den Festbetrag */
  mindestUmwandlungMonat: number;
}

export interface FestbetragErgebnis extends ZuschussErgebnis {
  /** Die Umwandlung erreicht die Mindestumwandlung */
  schwelleErreicht: boolean;
}

const festbetragRegel = (festMonat: number, mindestMonat: number): ZuschussRegel =>
  (e) => (e > 0 && e + 0.005 >= Math.max(0, mindestMonat) * 12 ? Math.max(0, festMonat) * 12 : 0);

export function festbetragModell(
  e: FestbetragEingaben,
  steuerOpt: MatchingSteuer,
  p: LegalParameters,
): FestbetragErgebnis {
  const regel = festbetragRegel(e.festbetragMonat, e.mindestUmwandlungMonat);
  const r = zuschussKern(e, regel, steuerOpt, p, (a) => {
    const h: string[] = [];
    if (a.e > 0 && regel(a.e) === 0) {
      h.push(
        `Der Festbetrag von ${euro(e.festbetragMonat)} gilt ab ${euro(e.mindestUmwandlungMonat)} Umwandlung im `
        + 'Monat. Darunter zahlt der Arbeitgeber nur den gesetzlichen Pflichtzuschuss von 15 %, soweit er '
        + 'Sozialabgaben spart (§ 1a Abs. 1a BetrAVG).',
      );
    }
    if (a.e > 0 && regel(a.e) > 0 && a.pflicht > regel(a.e) + 0.5) {
      h.push(
        `Bei dieser Umwandlung liegt der gesetzliche Pflichtzuschuss (15 %) mit ${euro(a.pflicht / 12)} über dem `
        + `Festbetrag — gezahlt wird der höhere Betrag.`,
      );
    }
    return h;
  });
  const u = r.mitarbeiter.umwandlungMonat * 12;
  return { ...r, schwelleErreicht: u > 0 && regel(u) > 0 };
}

export interface FestbetragStufe {
  jahresbrutto: number;
  zuschussMonat: number;
  arbeitgeberNettoMonat: number;
  mitarbeiterNettoMonat: number;
  vertragMonat: number;
}

/**
 * „Gleich fuer alle": derselbe Festbetrag bei verschiedenen Gehaeltern. Der
 * Beitrag ist ueberall gleich; die Kosten des Arbeitgebers unterscheiden sich
 * nur dort, wo das Gehalt ueber einer Beitragsbemessungsgrenze liegt und die
 * Umwandlung dort keine Abgaben mehr spart.
 */
export function festbetragGehaltsStaffel(
  e: FestbetragEingaben,
  steuerOpt: MatchingSteuer,
  p: LegalParameters,
  gehaelter: readonly number[] = [30_000, 45_000, 60_000, 80_000],
): FestbetragStufe[] {
  return gehaelter.map((b) => {
    const r = festbetragModell({ ...e, jahresbrutto: b }, steuerOpt, p);
    return {
      jahresbrutto: b,
      zuschussMonat: r.arbeitgeber.zuschussMonat,
      arbeitgeberNettoMonat: r.arbeitgeber.nettoKostenMonat,
      mitarbeiterNettoMonat: r.mitarbeiter.nettoAufwandMonat,
      vertragMonat: r.vertragMonat,
    };
  });
}
