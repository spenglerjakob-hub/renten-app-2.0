import type { LegalParameters } from '../params/types.js';
import { zusatzsteuer } from '../tax/haushalt.js';
import { euroText } from '../util/text.js';
import { svWirkung, SV_FREI_QUOTE, STEUER_FREI_QUOTE } from './vertrags-tuev.js';
import { avdZulagen, avdSteuervorteil } from '../products/altersvorsorgedepot.js';
import {
  basisrahmenJahr, BAV_AG_PFLICHTZUSCHUSS, type FoerderKontext, type SteuerOptionen,
} from './foerdercheck.js';

/**
 * LOESUNGSVERGLEICH — was wird aus einem Euro, den man NETTO aufwendet?
 *
 * Der Fördercheck fragt, welcher Rahmen frei ist. Diese Rechnung dreht die
 * Frage um, so wie sie im Gespraech gestellt wird: „Ich kann 100 EUR im Monat
 * entbehren — wo bringen sie am meisten?" Dafuer wird je Loesung der BEITRAG
 * gesucht, der nach Steuer- und Abgabenersparnis genau diesen Netto-Aufwand
 * kostet, und daneben gestellt, was am Ende im Vertrag landet:
 *
 *   - bAV (Entgeltumwandlung): Brutto wird umgewandelt, Steuer und
 *     Sozialabgaben sinken, der Arbeitgeber legt mindestens 15 % dazu,
 *   - Basisrente: der Beitrag mindert das zu versteuernde Einkommen,
 *   - Altersvorsorgedepot: Eigenbeitrag plus Grund- und Kinderzulage, dazu
 *     ein Steuervorteil, soweit er ueber die Zulage hinausgeht,
 *   - privat (Rentenversicherung, Depot): ohne Foerderung, 100 bleiben 100.
 *
 * MARGINAL gerechnet: Was heute schon in eine bAV, Basisrente oder ein
 * Altersvorsorgedepot fliesst, belegt die Rahmen und senkt den Steuersatz;
 * gerechnet wird, was ein ZUSAETZLICHER Beitrag bewirkt. Dieselben Bausteine
 * wie im Fördercheck und im Vertrags-TUEV — `svWirkung`, `zusatzsteuer`,
 * `avdZulagen`, `avdSteuervorteil` —, keine zweite Fassung der Formeln.
 *
 * DIE AUSZAHLSEITE FEHLT HIER BEWUSST. Was aus dem Vertrag spaeter netto
 * wird, haengt am Angebot: Rente, Kapital, Besteuerung, Kranken-
 * versicherung. Das rechnet der Vertrags-TUEV fuer die erfassten Angebote.
 */

export type LoesungId = 'bav' | 'avd' | 'basis' | 'privat';

export interface Loesung {
  id: LoesungId;
  titel: string;
  schicht: 1 | 2 | 3;
  /** false: fuer diesen Haushalt nicht zu haben (etwa bAV fuer Beamte) */
  verfuegbar: boolean;
  /** Was aus der eigenen Tasche geht, im Monat */
  nettoMonat: number;
  /** Der Beitrag, den man selbst leistet — bei der bAV die Bruttoumwandlung */
  eigenbeitragMonat: number;
  steuerErsparnisMonat: number;
  svErsparnisMonat: number;
  zulageMonat: number;
  agZuschussMonat: number;
  /** Was im Vertrag landet: Eigenbeitrag plus Zulage plus Arbeitgeber */
  vertragMonat: number;
  /** Vertrag je Euro Netto-Aufwand */
  hebel: number;
  /**
   * true: Der gewuenschte Netto-Aufwand passt nicht ganz in den
   * Foerderrahmen. Gerechnet ist dann mit dem Rahmen; `nettoMonat` liegt
   * unter dem Wunsch.
   */
  begrenzt: boolean;
  /** Wie die Auszahlung spaeter besteuert wird — ein Satz */
  besteuerung: string;
  hinweise: string[];
}

export interface LoesungsOptionen {
  /**
   * Zuschuss des Arbeitgebers als Anteil der Umwandlung. Mindestens der
   * gesetzliche Pflichtzuschuss (15 %, soweit der Arbeitgeber Abgaben spart);
   * ein Zuschussmodell mit 50 % traegt man hier ein.
   */
  agZuschussQuote?: number;
}

/** Den Beitrag suchen, der genau `ziel` netto kostet — Bisektion, `netto` steigt mit dem Beitrag. */
function suche(netto: (beitrag: number) => number, ziel: number, hoechstens: number): number {
  if (ziel <= 0 || hoechstens <= 0) return 0;
  if (netto(hoechstens) <= ziel) return hoechstens;
  let lo = 0;
  let hi = hoechstens;
  for (let i = 0; i < 60; i += 1) {
    const mitte = (lo + hi) / 2;
    if (netto(mitte) < ziel) lo = mitte; else hi = mitte;
  }
  return (lo + hi) / 2;
}

const leer = (id: LoesungId, titel: string, schicht: 1 | 2 | 3, besteuerung: string, grund: string): Loesung => ({
  id, titel, schicht, verfuegbar: false,
  nettoMonat: 0, eigenbeitragMonat: 0, steuerErsparnisMonat: 0, svErsparnisMonat: 0,
  zulageMonat: 0, agZuschussMonat: 0, vertragMonat: 0, hebel: 0, begrenzt: false,
  besteuerung, hinweise: [grund],
});

function bavLoesung(
  k: FoerderKontext, steuerOpt: SteuerOptionen, p: LegalParameters, nettoJahr: number, opt: LoesungsOptionen,
): Loesung {
  const titel = 'Betriebsrente (Entgeltumwandlung)';
  const besteuerung = 'Rente voll steuerpflichtig, dazu Kranken- und Pflegeversicherung (Freibetrag in der KVdR).';
  if (k.beamter || k.selbststaendig) {
    return leer('bav', titel, 2, besteuerung, k.beamter
      ? 'Beamte wandeln kein Entgelt um.'
      : 'Ohne Arbeitgeber gibt es keine Entgeltumwandlung.');
  }

  const genutzt = Math.max(0, k.bavEigenanteilJahr) + Math.max(0, k.bavArbeitgeberJahr);
  const svGrenze = Math.max(0, SV_FREI_QUOTE * p.bbgRvJahr - genutzt);
  const steuerGrenze = Math.max(0, STEUER_FREI_QUOTE * p.bbgRvJahr - genutzt);
  const quote = Math.max(0, opt.agZuschussQuote ?? BAV_AG_PFLICHTZUSCHUSS);

  /*
    Alle Wirkungen einer Umwandlung von `u` im Jahr. Der Arbeitgeberbeitrag
    verbraucht die Grenzen zuerst (sie gelten fuer die Summe), der eigene
    Teil bekommt den Rest. Ueber der Steuergrenze bringt die Umwandlung
    nichts mehr — dort wird nicht weiter gerechnet.
  */
  const rechne = (u: number) => {
    const zuschussRoh = quote * u;
    const svFrei = Math.min(u, Math.max(0, svGrenze - zuschussRoh));
    const steuerFrei = Math.min(u, Math.max(0, steuerGrenze - zuschussRoh));
    const w = svWirkung(svFrei, k, p);
    const sv = Math.max(0, w.ersparnis);
    const zveMinderung = Math.max(0, steuerFrei - w.wegfallenderAbzug);
    const steuer = Math.max(0, zusatzsteuer(k.zveHeute - zveMinderung, zveMinderung, steuerOpt, p));
    /*
      Der Pflichtzuschuss gilt nur, „soweit" der Arbeitgeber selbst Abgaben
      spart — seine Ersparnis entspricht im Wesentlichen der des Mitarbeiters.
      Ein hoeherer freiwilliger Zuschuss gilt, wie er zugesagt ist.
    */
    const pflicht = Math.min(BAV_AG_PFLICHTZUSCHUSS * u, Math.max(0, w.ersparnis + w.verlorenerZuschuss));
    const zuschuss = quote > BAV_AG_PFLICHTZUSCHUSS ? zuschussRoh : Math.min(zuschussRoh, pflicht);
    return { sv, steuer, zuschuss, netto: u - sv - steuer };
  };

  const hoechstens = steuerGrenze;
  const u = suche((x) => rechne(x).netto, nettoJahr, hoechstens);
  const r = rechne(u);
  const begrenzt = r.netto < nettoJahr - 0.5;
  const hinweise: string[] = [];
  if (hoechstens <= 0.5) hinweise.push('Der steuerfreie Rahmen (8 % der Beitragsbemessungsgrenze) ist ausgeschöpft.');
  else if (begrenzt) {
    hinweise.push(`Mehr als ${euroText(r.netto / 12)} netto im Monat passen nicht in den steuerfreien Rahmen von `
      + `${euroText(steuerGrenze / 12)}.`);
  }
  if (u > svGrenze + 0.5) {
    hinweise.push(`Über ${euroText(svGrenze / 12)} im Monat ist die Umwandlung nur noch steuerfrei — `
      + 'auf diesen Teil fallen volle Sozialabgaben.');
  }
  if (k.privatVersichert) hinweise.push('Privat versichert: Kranken- und Pflegeversicherung sparen nichts, der Arbeitgeberzuschuss zur PKV kann sinken.');
  const vertrag = u + r.zuschuss;
  return {
    id: 'bav', titel, schicht: 2, verfuegbar: true,
    nettoMonat: r.netto / 12,
    eigenbeitragMonat: u / 12,
    steuerErsparnisMonat: r.steuer / 12,
    svErsparnisMonat: r.sv / 12,
    zulageMonat: 0,
    agZuschussMonat: r.zuschuss / 12,
    vertragMonat: vertrag / 12,
    hebel: r.netto > 0 ? vertrag / r.netto : 0,
    begrenzt, besteuerung, hinweise,
  };
}

function basisLoesung(
  k: FoerderKontext, steuerOpt: SteuerOptionen, p: LegalParameters, nettoJahr: number,
): Loesung {
  const titel = 'Basisrente (Rürup)';
  const besteuerung = 'Rente steuerpflichtig (Besteuerungsanteil), in der KVdR beitragsfrei; kein Kapital möglich.';
  const { rahmen } = basisrahmenJahr(k, steuerOpt.verheiratet, p);
  const rechne = (b: number) => {
    const abzug = Math.min(b, rahmen);
    const steuer = Math.max(0, zusatzsteuer(k.zveHeute - abzug, abzug, steuerOpt, p));
    return { steuer, netto: b - steuer };
  };
  /*
    Ueber dem freien Hoechstbetrag wirkt ein Beitrag wie eine ungefoerderte
    Rente mit voller Besteuerung — dort wird nicht weiter gerechnet.
  */
  const b = suche((x) => rechne(x).netto, nettoJahr, Math.max(rahmen, 0));
  const r = rechne(b);
  const begrenzt = r.netto < nettoJahr - 0.5;
  const hinweise: string[] = [];
  if (rahmen <= 0.5) hinweise.push('Der Höchstbetrag für Altersvorsorgeaufwendungen ist schon ausgeschöpft.');
  else if (begrenzt) hinweise.push(`Der freie Höchstbetrag (${euroText(rahmen / 12)} im Monat) begrenzt den Beitrag.`);
  if (r.steuer < 0.5 && b > 0) hinweise.push('Ohne Steuerlast bringt der Abzug nichts — dann fehlt der Basisrente der Vorteil.');
  return {
    id: 'basis', titel, schicht: 1, verfuegbar: rahmen > 0.5,
    nettoMonat: r.netto / 12,
    eigenbeitragMonat: b / 12,
    steuerErsparnisMonat: r.steuer / 12,
    svErsparnisMonat: 0, zulageMonat: 0, agZuschussMonat: 0,
    vertragMonat: b / 12,
    hebel: r.netto > 0 ? b / r.netto : 0,
    begrenzt, besteuerung, hinweise,
  };
}

function avdLoesung(
  k: FoerderKontext, steuerOpt: SteuerOptionen, p: LegalParameters, nettoJahr: number,
): Loesung {
  const titel = 'Altersvorsorgedepot';
  const besteuerung = 'Auszahlung voll steuerpflichtig (nachgelagert), in der KVdR beitragsfrei.';
  /*
    Vor dem Startjahr wird mit dem Startjahr gerechnet und das gesagt: Wer
    heute plant, will wissen, was ab dann dazukommt.
  */
  const jahr = Math.max(k.jahr, p.avd.abJahr);
  const alter = k.alter + (jahr - k.jahr);
  const vorher = Math.max(0, k.avdEigenbeitragJahr);
  const zulage = (eigen: number) => {
    const z = avdZulagen({ eigenbeitragJahr: eigen, kinder: k.kinder, alter, jahr }, p.avd);
    // Ohne den einmaligen Berufseinsteigerbonus — er gilt nicht fuer jedes Jahr.
    return z.grundzulage + z.kinderzulage;
  };
  const aufwand = (eigen: number) => avdSteuervorteil(
    { eigenbeitragJahr: eigen, zulagenJahr: zulage(eigen), zveHeute: k.zveHeute }, steuerOpt, p,
  );
  const sockel = aufwand(vorher);
  const rechne = (e: number) => {
    const a = aufwand(vorher + e);
    return {
      netto: a.eigenaufwandNetto - sockel.eigenaufwandNetto,
      zulage: zulage(vorher + e) - zulage(vorher),
      steuer: a.ueberZulagen - sockel.ueberZulagen,
    };
  };
  const frei = Math.max(0, p.avd.hoechstbetragEigenbeitrag - vorher);
  const e = suche((x) => rechne(x).netto, nettoJahr, frei);
  const r = rechne(e);
  const begrenzt = r.netto < nettoJahr - 0.5;
  const hinweise: string[] = [];
  if (k.jahr < p.avd.abJahr) hinweise.push(`Das Altersvorsorgedepot gibt es ab ${p.avd.abJahr}; gerechnet mit den Zulagen ab dann.`);
  if (frei <= 0.5) hinweise.push('Der geförderte Höchstbetrag ist mit dem bestehenden Depot schon ausgeschöpft.');
  else if (begrenzt) {
    hinweise.push(`Gefördert sind Eigenbeiträge bis ${euroText(p.avd.hoechstbetragEigenbeitrag / 12)} im Monat; `
      + 'darüber gibt es keine Zulage mehr.');
  }
  const vertrag = e + r.zulage;
  return {
    id: 'avd', titel, schicht: 2, verfuegbar: frei > 0.5,
    nettoMonat: r.netto / 12,
    eigenbeitragMonat: e / 12,
    steuerErsparnisMonat: Math.max(0, r.steuer) / 12,
    svErsparnisMonat: 0,
    zulageMonat: r.zulage / 12,
    agZuschussMonat: 0,
    vertragMonat: vertrag / 12,
    hebel: r.netto > 0 ? vertrag / r.netto : 0,
    begrenzt, besteuerung, hinweise,
  };
}

function privatLoesung(nettoJahr: number): Loesung {
  return {
    id: 'privat', titel: 'Private Rente / Depot', schicht: 3, verfuegbar: true,
    nettoMonat: nettoJahr / 12,
    eigenbeitragMonat: nettoJahr / 12,
    steuerErsparnisMonat: 0, svErsparnisMonat: 0, zulageMonat: 0, agZuschussMonat: 0,
    vertragMonat: nettoJahr / 12,
    hebel: nettoJahr > 0 ? 1 : 0,
    begrenzt: false,
    besteuerung: 'Rentenversicherung: Rente nur mit dem Ertragsanteil steuerpflichtig, Kapital mit dem halben Ertrag (nach 12 Jahren, ab 62). Depot: Abgeltungsteuer auf Gewinne. In der KVdR beitragsfrei.',
    hinweise: ['Keine Förderung beim Einzahlen — dafür frei verfügbar und im Alter gering besteuert.'],
  };
}

export function loesungsvergleich(
  k: FoerderKontext,
  steuerOpt: SteuerOptionen,
  p: LegalParameters,
  nettoMonat: number,
  opt: LoesungsOptionen = {},
): Loesung[] {
  const nettoJahr = Math.max(0, nettoMonat) * 12;
  return [
    avdLoesung(k, steuerOpt, p, nettoJahr),
    bavLoesung(k, steuerOpt, p, nettoJahr, opt),
    basisLoesung(k, steuerOpt, p, nettoJahr),
    privatLoesung(nettoJahr),
  ];
}
