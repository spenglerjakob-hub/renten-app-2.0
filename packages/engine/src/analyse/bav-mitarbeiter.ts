import type { LegalParameters } from '../params/types.js';
import type { KinderStatus } from '../social/kv-pv.js';
import { entgeltpunkteJahr } from '../pension/grv.js';
import { SV_FREI_QUOTE } from './vertrags-tuev.js';
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
 * aendert an der Seite des Mitarbeiters nichts und wird mit null gerechnet.
 * Die Hinweise sind eigene: Die der Modelle sprechen den Arbeitgeber an
 * („Der Zuschuss senkt Ihre Kosten …“), hier geht es um den Mitarbeiter.
 */

/** Das Modell der Firma — wie es auf der Arbeitgeber-Seite eingestellt wurde. */
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
  hinweise: string[];
}

const euro = (n: number) => `${Math.round(n).toLocaleString('de-DE')} €`;

/** Eine bestehende bAV belegt die Rahmen — wie der Bestand auf den Arbeitgeber-Seiten, ohne VL. */
const bisher = (bavBestandMonat: number): BisherigeLeistungen | undefined =>
  bavBestandMonat > 0 ? { vlMonat: 0, vlUmgang: 'anrechnen', bavBestandMonat } : undefined;

const kern = (m: MitarbeiterEingaben) => ({
  jahresbrutto: Math.max(0, m.jahresbrutto),
  umwandlungMonat: Math.max(0, m.umwandlungMonat),
  unternehmensSteuersatz: 0,
  umlagenSatz: 0,
  privatVersichert: m.privatVersichert,
  pkvPraemieMonat: m.privatVersichert ? Math.max(0, m.pkvPraemieMonat) : 0,
  kinder: m.kinder,
  bisher: bisher(m.bavBestandMonat),
});

export function bavMitarbeiter(
  modell: FirmenModell,
  m: MitarbeiterEingaben,
  steuerOpt: MatchingSteuer,
  p: LegalParameters,
): MitarbeiterBav {
  let r: Omit<MitarbeiterBav, 'hinweise'>;
  if (modell.art === 'matching') {
    const x = matchingModell(
      { ...kern(m), weg: modell.weg, matchingMonat: modell.matchingMonat, zuschussImMatching: modell.zuschussImMatching },
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
    };
  } else {
    const x = modell.art === 'zuschuss'
      ? zuschussModell({ ...kern(m), quote: modell.quote, deckelMonat: modell.deckelMonat }, steuerOpt, p)
      : festbetragModell({ ...kern(m), festbetragMonat: modell.festbetragMonat, mindestUmwandlungMonat: modell.mindestUmwandlungMonat }, steuerOpt, p);
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
    };
  }
  return { ...r, hinweise: mitarbeiterHinweise(modell, m, r, p) };
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
  if (modell.art === 'zuschuss' && modell.quote * u > modell.deckelMonat + 0.005) {
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
    return zuschussVollAusschoepfen({ ...e, quote: modell.quote, deckelMonat: modell.deckelMonat }, bundesland, p);
  }
  return festbetragVollAusschoepfen(
    { ...e, festbetragMonat: modell.festbetragMonat, mindestUmwandlungMonat: modell.mindestUmwandlungMonat },
    bundesland, p,
  );
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
