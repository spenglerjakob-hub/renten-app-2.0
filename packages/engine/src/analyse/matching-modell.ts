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
}

export interface MatchingSteuer {
  verheiratet: boolean;
  bundesland: string;
  kirchensteuerpflichtig: boolean;
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
  /**
   * Dieselben Kosten vor Steuern als Gehaltserhoehung — mit allen
   * Zwischenschritten, damit die Seite die Rechnung Zeile fuer Zeile neben
   * das Modell stellen kann.
   */
  gehalt: {
    bruttoMonat: number;
    /** Arbeitgeberanteil Sozialversicherung plus Umlagen auf die Erhoehung */
    agAbgabenMonat: number;
    /** = Brutto + AG-Abgaben; gleich `arbeitgeber.kostenVorSteuerMonat` */
    kostenVorSteuerMonat: number;
    steuerersparnisMonat: number;
    nettoKostenMonat: number;
    /** Sozialabgaben des Mitarbeiters auf die Erhoehung */
    svMonat: number;
    /** Lohnsteuer, Soli und ggf. Kirchensteuer auf die Erhoehung */
    steuerMonat: number;
    nettoMonat: number;
  } | null;
  /** Im Vertrag je Euro Nettoaufwand des Mitarbeiters */
  hebelMitarbeiter: number;
  /** Im Vertrag je Euro Nettokosten des Arbeitgebers */
  hebelArbeitgeber: number;
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
function aufteilen(e: number, weg: UmwandlungsWeg, sk: SvKontext, bundesland: string, p: LegalParameters): Aufteilung {
  const svGrenze = SV_FREI_QUOTE * p.bbgRvJahr;
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

const svKontext = (e: Pick<MatchingEingaben, 'jahresbrutto' | 'privatVersichert' | 'pkvPraemieMonat'>): SvKontext => ({
  beamter: false,
  selbststaendig: false,
  privatVersichert: e.privatVersichert,
  pkvPraemieMonat: e.pkvPraemieMonat,
  jahresbrutto: e.jahresbrutto,
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
  e: Pick<MatchingEingaben, 'jahresbrutto' | 'privatVersichert' | 'pkvPraemieMonat'>,
  bundesland: string,
  p: LegalParameters,
): number {
  const svGrenze = SV_FREI_QUOTE * p.bbgRvJahr;
  if (weg === 'ukasse') return Math.floor(svGrenze / 12 * 100) / 100;
  const sk = svKontext(e);
  let lo = 0, hi = svGrenze;
  for (let i = 0; i < 60; i++) {
    const mitte = (lo + hi) / 2;
    const a = aufteilen(mitte, weg, sk, bundesland, p);
    if (a.e + a.z > svGrenze) hi = mitte; else lo = mitte;
  }
  return Math.floor(lo / 12 * 100) / 100;
}

export function matchingModell(
  e: MatchingEingaben,
  steuerOpt: MatchingSteuer,
  p: LegalParameters,
): MatchingErgebnis {
  const hinweise: string[] = [];
  const sk = svKontext(e);
  const steuerGrenze = STEUER_FREI_QUOTE * p.bbgRvJahr;
  const svGrenze = SV_FREI_QUOTE * p.bbgRvJahr;
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
  const a = aufteilen(Math.max(0, e.umwandlungMonat) * 12, e.weg, sk, steuerOpt.bundesland, p);
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
  let gehalt: MatchingErgebnis['gehalt'] = null;
  if (kostenVorSteuer > 1) {
    const kostenGehalt = (b: number) => {
      const k2 = { ...sk, jahresbrutto: e.jahresbrutto + b };
      return b + arbeitgeberSvErsparnis(b, k2, steuerOpt.bundesland, p)
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
    gehalt = {
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

  // --- Hinweise ------------------------------------------------------------
  if (e.weg === 'dv' && a.e + a.z > svGrenze + 6) {
    const optimal = optimaleUmwandlung('dv', e, steuerOpt.bundesland, p);
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
    hinweise,
  };
}
