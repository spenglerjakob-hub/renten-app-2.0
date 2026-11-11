import type { LegalParameters } from '../params/types.js';
import type { KinderStatus } from '../social/kv-pv.js';
import { entgeltpunkteJahr } from '../pension/grv.js';
import { STEUER_FREI_QUOTE, SV_FREI_QUOTE } from './vertrags-tuev.js';
import {
  matchingModell, zuschussModell, festbetragModell,
  optimaleUmwandlung, zuschussVollAusschoepfen, festbetragVollAusschoepfen,
  type BisherigeLeistungen, type MatchingSteuer, type UmwandlungsWeg,
} from './matching-modell.js';

/**
 * BAV FUER DEN MITARBEITER — das Angebot der Firma aus seiner Sicht.
 *
 * Die Mitarbeiterberatung zeigt einem Mitarbeiter, was das Modell seiner
 * Firma fuer IHN bedeutet. Gerechnet wird ausschliesslich mit
 * `matchingModell`, `zuschussModell` und `festbetragModell` — dieselben
 * Funktionen wie auf den Arbeitgeber-Seiten. Mitarbeiter und Arbeitgeber
 * sehen deshalb dieselben Zahlen; eine zweite Fassung der Formeln gibt es
 * nicht.
 *
 * Was nur den Arbeitgeber angeht (Steuersatz des Unternehmens, Umlagen),
 * aendert an der Seite des Mitarbeiters nichts. Es zaehlt allein fuer die
 * Netto-Belastung des Arbeitgebers (`arbeitgeberBelastung`, Uebersicht fuer
 * den Arbeitgeber) und wird ohne Angabe mit null gerechnet.
 * Die Hinweise sind eigene: Die der Modelle sprechen den Arbeitgeber an
 * („Der Zuschuss senkt Ihre Kosten …“), hier geht es um den Mitarbeiter.
 */

/**
 * Das Modell der Firma — wie es auf der Arbeitgeber-Seite eingestellt wurde.
 * Beim Zuschuss heisst `deckelMonat` 0: ohne Deckel — so steht es im Angebot
 * der Firma und in der Vereinbarung.
 */
export type FirmenModell =
  | { art: 'zuschuss'; quote: number; deckelMonat: number }
  | { art: 'festbetrag'; festbetragMonat: number; mindestUmwandlungMonat: number }
  | { art: 'matching'; weg: UmwandlungsWeg; matchingMonat: number; zuschussImMatching: boolean };

export interface MitarbeiterEingaben {
  jahresbrutto: number;
  umwandlungMonat: number;
  privatVersichert: boolean;
  pkvPraemieMonat: number;
  kinder: KinderStatus;
  /**
   * Laufende Beitraege in eine bestehende Direktversicherung oder
   * Pensionskasse (Mitarbeiter und Arbeitgeber), Monat. Sie belegen die
   * Freigrenzen vor dem neuen Vertrag.
   */
  bavBestandMonat: number;
}

/** Ein Vertrag, in den das Modell einzahlt. */
export interface MitarbeiterVertrag {
  /** 'direkt': Direktversicherung, Pensionskasse oder Pensionsfonds (§ 3 Nr. 63 EStG) */
  weg: 'direkt' | 'ukasse';
  beitragMonat: number;
  /** davon traegt der Arbeitgeber */
  arbeitgeberMonat: number;
}

/** Was nur den Arbeitgeber angeht — die Saetze seiner Firma. */
export interface FirmenSaetze {
  /** Steuersatz des Unternehmens auf den Gewinn, z. B. 0,30 fuer eine GmbH */
  unternehmensSteuersatz: number;
  /** Umlagen U1, U2 und Insolvenzgeld als Satz auf das RV-pflichtige Entgelt */
  umlagenSatz: number;
}

/**
 * Was der Beitrag den Arbeitgeber netto kostet — dieselben Posten wie auf den
 * Arbeitgeber-Seiten: Er spart Sozialabgaben und Umlagen auf die
 * beitragsfreie Umwandlung; was danach bleibt, ist Betriebsausgabe und senkt
 * die Steuer auf den Gewinn.
 */
export interface ArbeitgeberBelastung {
  /** = `arbeitgeberMonat`: Pflichtzuschuss und was er darueber hinaus gibt */
  beitragMonat: number;
  /** Gesparte Arbeitgeberanteile zur Sozialversicherung — die Umwandlung ist beitragsfrei */
  svErsparnisMonat: number;
  /** Gesparte Umlagen; 0 ohne Umlagensatz */
  umlagenErsparnisMonat: number;
  /** = Beitrag − SV-Ersparnis − Umlagen; negativ, wenn die Ersparnis den Beitrag uebersteigt */
  kostenVorSteuerMonat: number;
  /** Steuer auf den Gewinn, die der Aufwand spart; negativ mit `kostenVorSteuerMonat` */
  steuerersparnisMonat: number;
  /** = Kosten vor Steuer − Steuerersparnis */
  nettoKostenMonat: number;
}

/**
 * Die Pruefung des gesetzlichen Zuschusses (§ 1a Abs. 1a BetrAVG): 15 % der
 * Umwandlung, soweit der Arbeitgeber durch sie Sozialabgaben spart. Die
 * Modelle zahlen ihn immer mindestens; hier steht, ob die Regel der Firma
 * dafuer reicht oder aufgestockt wird — etwa ein Festbetrag von 50 €, sobald
 * 15 % der Umwandlung mehr ergeben.
 */
export interface Mindestzuschuss {
  /** 15 % der Umwandlung */
  quoteMonat: number;
  /** Was der Arbeitgeber auf die Umwandlung an Sozialabgaben spart — bis dahin reicht die Pflicht („soweit“) */
  ersparnisMonat: number;
  /** Der gesetzliche Zuschuss: 15 %, hoechstens die Ersparnis */
  mindestMonat: number;
  /** Was die Regel der Firma allein ergaebe — beim Matching mit enthaltenem Zuschuss das Matching */
  regelMonat: number;
  /** Die Regel bleibt unter dem gesetzlichen Zuschuss: gezahlt wird er, nicht die Regel */
  aufgestockt: boolean;
}

export interface MitarbeiterBav {
  umwandlungMonat: number;
  svErsparnisMonat: number;
  steuerersparnisMonat: number;
  /** Was die Umwandlung den Mitarbeiter netto kostet */
  nettoAufwandMonat: number;
  /** Teil der Umwandlung, auf den weiter Sozialabgaben fallen */
  svPflichtigMonat: number;
  /** Teil der Umwandlung ueber dem steuerfreien Rahmen (8 % der BBG) — er wird versteuert */
  steuerpflichtigMonat: number;
  /** Gesetzlicher Pflichtzuschuss (§ 1a Abs. 1a BetrAVG) */
  pflichtzuschussMonat: number;
  /** Was der Arbeitgeber darueber hinaus gibt: Zuschuss, Festbetrag oder Matching */
  freiwilligMonat: number;
  arbeitgeberMonat: number;
  vertraege: MitarbeiterVertrag[];
  gesamtMonat: number;
  /** Im Vertrag je Euro Netto-Aufwand */
  hebel: number;
  /** Was der Beitrag den Arbeitgeber netto kostet — mit den Saetzen seiner Firma */
  arbeitgeberBelastung: ArbeitgeberBelastung;
  /** Null ohne Umwandlung und bei Umwandlung in die Unterstuetzungskasse — dort gibt es keinen gesetzlichen Zuschuss */
  mindestzuschuss: Mindestzuschuss | null;
  hinweise: string[];
}

const euro = (n: number) => `${Math.round(n).toLocaleString('de-DE')} €`;

/** Eine bestehende bAV belegt die Rahmen — wie der Bestand auf den Arbeitgeber-Seiten, ohne VL. */
const bisher = (bavBestandMonat: number): BisherigeLeistungen | undefined =>
  bavBestandMonat > 0 ? { vlMonat: 0, vlUmgang: 'anrechnen', bavBestandMonat } : undefined;

/** Der Deckel fuers Rechnen: 0 heisst ohne Deckel. */
const deckel = (deckelMonat: number) => (deckelMonat > 0 ? deckelMonat : Number.POSITIVE_INFINITY);

/** Was die Regel der Firma fuer eine Umwandlung allein ergaebe — ohne den gesetzlichen Zuschuss als Untergrenze. */
function regelMonat(modell: FirmenModell, u: number, pflichtMonat: number): number {
  if (modell.art === 'zuschuss') return Math.min(Math.max(0, modell.quote) * u, deckel(modell.deckelMonat));
  if (modell.art === 'festbetrag') return u + 0.005 >= modell.mindestUmwandlungMonat ? Math.max(0, modell.festbetragMonat) : 0;
  // Matching: Ist der Zuschuss enthalten, ist das Matching die ganze Regel; sonst kommt er obendrauf.
  return Math.max(0, modell.matchingMonat) + (modell.zuschussImMatching ? 0 : pflichtMonat);
}

const kern = (m: MitarbeiterEingaben, firma?: FirmenSaetze) => ({
  jahresbrutto: Math.max(0, m.jahresbrutto),
  umwandlungMonat: Math.max(0, m.umwandlungMonat),
  unternehmensSteuersatz: firma?.unternehmensSteuersatz ?? 0,
  umlagenSatz: firma?.umlagenSatz ?? 0,
  privatVersichert: m.privatVersichert,
  pkvPraemieMonat: m.privatVersichert ? Math.max(0, m.pkvPraemieMonat) : 0,
  kinder: m.kinder,
  bisher: bisher(m.bavBestandMonat),
});

/** Die Posten des Arbeitgebers aus dem Ergebnis eines Modells — der Beitrag ist der, den der Mitarbeiter sieht. */
const belastung = (
  beitragMonat: number,
  ag: Pick<ArbeitgeberBelastung, 'svErsparnisMonat' | 'umlagenErsparnisMonat' | 'kostenVorSteuerMonat' | 'steuerersparnisMonat' | 'nettoKostenMonat'>,
): ArbeitgeberBelastung => ({
  beitragMonat,
  svErsparnisMonat: ag.svErsparnisMonat,
  umlagenErsparnisMonat: ag.umlagenErsparnisMonat,
  kostenVorSteuerMonat: ag.kostenVorSteuerMonat,
  steuerersparnisMonat: ag.steuerersparnisMonat,
  nettoKostenMonat: ag.nettoKostenMonat,
});

export function bavMitarbeiter(
  modell: FirmenModell,
  m: MitarbeiterEingaben,
  steuerOpt: MatchingSteuer,
  p: LegalParameters,
  /** Nur fuer `arbeitgeberBelastung` — die Seite des Mitarbeiters bleibt gleich */
  firma?: FirmenSaetze,
): MitarbeiterBav {
  let r: Omit<MitarbeiterBav, 'hinweise' | 'mindestzuschuss'>;
  if (modell.art === 'matching') {
    const x = matchingModell(
      { ...kern(m, firma), weg: modell.weg, matchingMonat: modell.matchingMonat, zuschussImMatching: modell.zuschussImMatching },
      steuerOpt, p,
    );
    const vertraege: MitarbeiterVertrag[] = [];
    if (x.vertrag.direktversicherungMonat > 0.005) {
      vertraege.push({ weg: 'direkt', beitragMonat: x.vertrag.direktversicherungMonat, arbeitgeberMonat: x.arbeitgeber.pflichtzuschussMonat });
    }
    if (x.vertrag.ukasseMonat > 0.005) {
      vertraege.push({ weg: 'ukasse', beitragMonat: x.vertrag.ukasseMonat, arbeitgeberMonat: x.arbeitgeber.ukasseMonat });
    }
    r = {
      ...x.mitarbeiter,
      pflichtzuschussMonat: x.arbeitgeber.pflichtzuschussMonat,
      freiwilligMonat: x.arbeitgeber.ukasseMonat,
      arbeitgeberMonat: x.arbeitgeber.pflichtzuschussMonat + x.arbeitgeber.ukasseMonat,
      vertraege,
      gesamtMonat: x.vertrag.gesamtMonat,
      hebel: x.hebelMitarbeiter,
      arbeitgeberBelastung: belastung(x.arbeitgeber.pflichtzuschussMonat + x.arbeitgeber.ukasseMonat, x.arbeitgeber),
    };
  } else {
    const x = modell.art === 'zuschuss'
      ? zuschussModell({ ...kern(m, firma), quote: modell.quote, deckelMonat: deckel(modell.deckelMonat) }, steuerOpt, p)
      : festbetragModell({ ...kern(m, firma), festbetragMonat: modell.festbetragMonat, mindestUmwandlungMonat: modell.mindestUmwandlungMonat }, steuerOpt, p);
    r = {
      ...x.mitarbeiter,
      pflichtzuschussMonat: x.arbeitgeber.davonPflichtzuschussMonat,
      freiwilligMonat: x.arbeitgeber.freiwilligMonat,
      arbeitgeberMonat: x.arbeitgeber.zuschussMonat,
      vertraege: x.vertragMonat > 0.005
        ? [{ weg: 'direkt', beitragMonat: x.vertragMonat, arbeitgeberMonat: x.arbeitgeber.zuschussMonat }]
        : [],
      gesamtMonat: x.vertragMonat,
      hebel: x.hebelMitarbeiter,
      arbeitgeberBelastung: belastung(x.arbeitgeber.zuschussMonat, x.arbeitgeber),
    };
  }
  const mit = { ...r, mindestzuschuss: mindestzuschussPruefen(modell, r) };
  return { ...mit, hinweise: mitarbeiterHinweise(modell, m, mit, p) };
}

/**
 * Reicht die Regel der Firma fuer den gesetzlichen Zuschuss? Gerechnet ist er
 * schon — die Modelle zahlen mindestens ihn (`pflichtzuschussMonat`); hier
 * wird es sichtbar.
 */
function mindestzuschussPruefen(
  modell: FirmenModell,
  r: Omit<MitarbeiterBav, 'hinweise' | 'mindestzuschuss'>,
): Mindestzuschuss | null {
  const u = r.umwandlungMonat;
  if (u <= 0.005 || (modell.art === 'matching' && modell.weg === 'ukasse')) return null;
  const mindest = r.pflichtzuschussMonat;
  const regel = regelMonat(modell, u, mindest);
  return {
    quoteMonat: 0.15 * u,
    ersparnisMonat: r.arbeitgeberBelastung.svErsparnisMonat,
    mindestMonat: mindest,
    regelMonat: regel,
    aufgestockt: regel + 0.005 < mindest,
  };
}

/** Hinweise, die den MITARBEITER angehen — aus den Zahlen, nicht aus den Texten der Modelle. */
function mitarbeiterHinweise(
  modell: FirmenModell,
  m: MitarbeiterEingaben,
  r: Omit<MitarbeiterBav, 'hinweise'>,
  p: LegalParameters,
): string[] {
  const h: string[] = [];
  const u = r.umwandlungMonat;
  if (u <= 0) return h;
  // Ob der gesetzliche Zuschuss die Regel uebersteigt, zeigt die Pruefung (`mindestzuschuss`) — dann
  // waere „gedeckelt“ irrefuehrend: Der Arbeitgeber zahlt mehr als den Deckel.
  if (modell.art === 'zuschuss' && modell.deckelMonat > 0 && modell.quote * u > modell.deckelMonat + 0.005 && !r.mindestzuschuss?.aufgestockt) {
    h.push(
      `Der Zuschuss Ihres Arbeitgebers ist bei ${euro(modell.deckelMonat)} im Monat gedeckelt — `
      + 'jeder weitere Euro Umwandlung wird nicht mehr bezuschusst.',
    );
  }
  if (modell.art === 'festbetrag' && u + 0.005 < modell.mindestUmwandlungMonat) {
    h.push(
      `Den Festbetrag von ${euro(modell.festbetragMonat)} gibt Ihr Arbeitgeber ab ${euro(modell.mindestUmwandlungMonat)} `
      + 'Umwandlung im Monat. Darunter gibt es nur den gesetzlichen Zuschuss von 15 %, soweit er Sozialabgaben spart.',
    );
  }
  if (r.svPflichtigMonat > 0.5) {
    h.push(
      `Beitragsfrei sind 4 % der Beitragsbemessungsgrenze, ${euro(SV_FREI_QUOTE * p.bbgRvJahr / 12)} im Monat — `
      + 'der Beitrag des Arbeitgebers zählt zuerst. Auf '
      + `${euro(r.svPflichtigMonat)} Ihrer Umwandlung zahlen Sie deshalb weiter Sozialabgaben.`,
    );
  }
  if (m.privatVersichert) {
    h.push(
      'Privat versichert: Die Umwandlung spart Renten- und Arbeitslosenversicherung, aber keine Kranken- '
      + 'und Pflegebeiträge.',
    );
  } else if (m.jahresbrutto > p.bbgKvJahr) {
    h.push(
      'Ihr Gehalt liegt über der Beitragsbemessungsgrenze der Krankenversicherung: Dort spart die '
      + 'Umwandlung keine Beiträge, nur noch bei Renten- und Arbeitslosenversicherung.',
    );
  }
  return h;
}

/**
 * Die Umwandlung, mit der Umwandlung und Arbeitgeberbeitrag den
 * beitragsfreien Rahmen genau fuellen — Monat, auf Cent abgerundet. Beim
 * Matching-Modell fliesst der Arbeitgeberbeitrag in die
 * Unterstuetzungskasse und belegt keinen Rahmen.
 */
export function bavRahmenVoll(
  modell: FirmenModell,
  m: Pick<MitarbeiterEingaben, 'jahresbrutto' | 'privatVersichert' | 'pkvPraemieMonat' | 'bavBestandMonat'>,
  bundesland: string,
  p: LegalParameters,
): number {
  const e = {
    jahresbrutto: Math.max(0, m.jahresbrutto),
    privatVersichert: m.privatVersichert,
    pkvPraemieMonat: m.privatVersichert ? Math.max(0, m.pkvPraemieMonat) : 0,
    bisher: bisher(m.bavBestandMonat),
  };
  if (modell.art === 'matching') return optimaleUmwandlung(modell.weg, e, bundesland, p);
  if (modell.art === 'zuschuss') {
    return zuschussVollAusschoepfen({ ...e, quote: modell.quote, deckelMonat: deckel(modell.deckelMonat) }, bundesland, p);
  }
  return festbetragVollAusschoepfen(
    { ...e, festbetragMonat: modell.festbetragMonat, mindestUmwandlungMonat: modell.mindestUmwandlungMonat },
    bundesland, p,
  );
}

/**
 * Die Umwandlung, mit der der Gesamtbeitrag den steuerfreien Rahmen genau
 * fuellt: 8 % der BBG (§ 3 Nr. 63 EStG) — Monat, auf Cent abgerundet.
 * Gezaehlt wird der Vertrag, in den der Mitarbeiter umwandelt: die
 * Direktversicherung mit dem Beitrag des Arbeitgebers dorthin (eine
 * bestehende bAV belegt den Rahmen zuerst), beim Matching mit Umwandlung in
 * die Unterstuetzungskasse diese mit dem Matching. Dort ist die Umwandlung
 * zwar ohne Grenze steuerfrei; die Beratung rechnet trotzdem bis 8 %.
 *
 * Ueber den 4 % (`bavRahmenVoll`) fallen auf die Umwandlung Sozialabgaben
 * an, bis hier bleibt sie steuerfrei. Der Gesamtbeitrag waechst mit der
 * Umwandlung (der Arbeitgeberbeitrag faellt nie, wenn sie steigt) — deshalb
 * genuegt eine Bisektion.
 */
export function bavSteuerRahmenVoll(
  modell: FirmenModell,
  m: Omit<MitarbeiterEingaben, 'umwandlungMonat'>,
  bundesland: string,
  p: LegalParameters,
): number {
  const ukasse = modell.art === 'matching' && modell.weg === 'ukasse';
  const bestand = ukasse ? 0 : Math.max(0, m.bavBestandMonat);
  const grenze = Math.max(0, (STEUER_FREI_QUOTE * p.bbgRvJahr) / 12 - bestand);
  // Die Steuer des Mitarbeiters aendert am Gesamtbeitrag nichts.
  const steuer: MatchingSteuer = { verheiratet: false, bundesland, kirchensteuerpflichtig: false };
  const gesamt = (u: number) => {
    const v = bavMitarbeiter(modell, { ...m, umwandlungMonat: u }, steuer, p).vertraege.find((x) => x.weg === (ukasse ? 'ukasse' : 'direkt'));
    return v ? v.beitragMonat : u;
  };
  let lo = 0, hi = grenze;
  for (let i = 0; i < 50; i++) {
    const mitte = (lo + hi) / 2;
    if (gesamt(mitte) > grenze) hi = mitte; else lo = mitte;
  }
  // Auf Cent: Die Bisektion endet knapp unter der Grenze (575,9999… statt 576) —
  // abgerundet stuenden am Ende des Reglers 675,99 € statt 676 €. Der naechste
  // Cent gilt, solange der Gesamtbeitrag nach Rundung des Arbeitgeberbeitrags
  // auf Cent (wie in der Lohnabrechnung) im Rahmen bleibt: unter einem halben
  // Cent darueber.
  const naechster = Math.round(lo * 100) / 100;
  return gesamt(naechster) < grenze + 0.005 - 1e-9 ? naechster : Math.floor(lo * 100) / 100;
}

/**
 * Um so viel sinkt die gesetzliche Rente, weil die Umwandlung beitragsfrei
 * ist: Weniger rentenversichertes Entgelt bringt weniger Entgeltpunkte.
 *
 * In HEUTIGER Kaufkraft, ohne Zu- oder Abschlag und mit gleichbleibendem
 * Gehalt — die ehrliche Gegenrechnung fuer das Gespraech, keine Prognose.
 * Ueber der Beitragsbemessungsgrenze der Rentenversicherung kostet die
 * Umwandlung keine Entgeltpunkte; `entgeltpunkteJahr` deckelt dort.
 */
export function grvMinderung(
  jahresbrutto: number,
  svFreiMonat: number,
  jahreBisRente: number,
  p: LegalParameters,
): { entgeltpunkte: number; renteMonat: number } {
  const brutto = Math.max(0, jahresbrutto);
  const frei = Math.min(brutto, Math.max(0, svFreiMonat) * 12);
  const jeJahr = entgeltpunkteJahr(brutto, p) - entgeltpunkteJahr(brutto - frei, p);
  const entgeltpunkte = jeJahr * Math.max(0, jahreBisRente);
  return { entgeltpunkte, renteMonat: entgeltpunkte * p.rentenwert };
}
