import type { ArbeitgeberBelastung } from '@renten/engine';
import type { BeratungStatus, FirmenAngebot } from '@renten/schema';
import type { Beratung, Firma } from '../lib/bav-beratung';
import { beitragsRechnung } from './rechnung';

/**
 * Die Uebersicht fuer den Arbeitgeber: wer teilnimmt, mit welchem Betrag
 * und ab wann — das, was die Personalabteilung fuer die Lohnabrechnung
 * braucht, und nicht mehr (keine Gehaelter, keine Steuerdaten). Dazu, was
 * die Beitraege den Arbeitgeber netto kosten, und wie viele mitmachen.
 *
 * Die Betraege kommen aus derselben Rechnung wie die Beratung
 * (`beitragsRechnung`), nicht aus gespeicherten Ergebnissen.
 */
export interface UebersichtZeile {
  name: string;
  status: BeratungStatus;
  umwandlungMonat: number;
  arbeitgeberMonat: number;
  gesamtMonat: number;
  /**
   * Was der Beitrag den Arbeitgeber netto kostet — nur fuer die Summe: Je
   * Mitarbeiter verriete sie, wie viel Abgaben auf sein Gehalt fallen.
   */
  belastung: ArbeitgeberBelastung;
  /**
   * Der gesetzliche Zuschuss liegt ueber der Regel der Firma — eingerechnet
   * ist er, nicht die Regel (§ 1a Abs. 1a BetrAVG). Markiert in der Tabelle.
   */
  aufgestockt: boolean;
  /** TT.MM.JJJJ oder leer */
  beginn: string;
}

export interface UebersichtSummen {
  teilnahmen: number;
  verzichte: number;
  offen: number;
  umwandlungMonat: number;
  arbeitgeberMonat: number;
  gesamtMonat: number;
  /** Die Posten der Netto-Belastung, ueber alle Teilnahmen */
  belastung: ArbeitgeberBelastung;
}

const KEINE_BELASTUNG: ArbeitgeberBelastung = {
  beitragMonat: 0, svErsparnisMonat: 0, umlagenErsparnisMonat: 0, kostenVorSteuerMonat: 0, steuerersparnisMonat: 0, nettoKostenMonat: 0,
};

const plus = (x: ArbeitgeberBelastung, y: ArbeitgeberBelastung): ArbeitgeberBelastung => ({
  beitragMonat: x.beitragMonat + y.beitragMonat,
  svErsparnisMonat: x.svErsparnisMonat + y.svErsparnisMonat,
  umlagenErsparnisMonat: x.umlagenErsparnisMonat + y.umlagenErsparnisMonat,
  kostenVorSteuerMonat: x.kostenVorSteuerMonat + y.kostenVorSteuerMonat,
  steuerersparnisMonat: x.steuerersparnisMonat + y.steuerersparnisMonat,
  nettoKostenMonat: x.nettoKostenMonat + y.nettoKostenMonat,
});

export const STATUS_TEXT: Record<BeratungStatus, string> = { teilnahme: 'Teilnahme', verzicht: 'Verzicht', offen: 'offen' };

/** „1 Teilnahme“, „2 Verzichte“, „3 offen“. */
export const anzahlText = (k: BeratungStatus, n: number) =>
  k === 'teilnahme' ? `${n} ${n === 1 ? 'Teilnahme' : 'Teilnahmen'}`
  : k === 'verzicht' ? `${n} ${n === 1 ? 'Verzicht' : 'Verzichte'}`
  : `${n} offen`;

export function uebersichtZeilen(firma: Firma, beratungen: readonly Beratung[]): UebersichtZeile[] {
  return beratungen
    .map((b): UebersichtZeile => {
      const name = b.mitarbeiter || b.daten.angaben.name || 'Ohne Namen';
      if (b.status !== 'teilnahme') {
        return { name, status: b.status, umwandlungMonat: 0, arbeitgeberMonat: 0, gesamtMonat: 0, belastung: KEINE_BELASTUNG, aufgestockt: false, beginn: '' };
      }
      const r = beitragsRechnung(firma.angebot, b.daten);
      return {
        name, status: 'teilnahme',
        umwandlungMonat: r.umwandlungMonat, arbeitgeberMonat: r.arbeitgeberMonat, gesamtMonat: r.gesamtMonat,
        belastung: r.arbeitgeberBelastung,
        aufgestockt: r.mindestzuschuss?.aufgestockt ?? false,
        beginn: b.daten.entscheidung.beginn,
      };
    })
    .sort((x, y) => x.name.localeCompare(y.name, 'de'));
}

export function uebersichtSummen(zeilen: readonly UebersichtZeile[]): UebersichtSummen {
  const s: UebersichtSummen = {
    teilnahmen: 0, verzichte: 0, offen: 0, umwandlungMonat: 0, arbeitgeberMonat: 0, gesamtMonat: 0, belastung: KEINE_BELASTUNG,
  };
  for (const z of zeilen) {
    if (z.status === 'teilnahme') s.teilnahmen += 1;
    else if (z.status === 'verzicht') s.verzichte += 1;
    else s.offen += 1;
    s.umwandlungMonat += z.umwandlungMonat;
    s.arbeitgeberMonat += z.arbeitgeberMonat;
    s.gesamtMonat += z.gesamtMonat;
    s.belastung = plus(s.belastung, z.belastung);
  }
  return s;
}

/** Wie viele aus der Belegschaft das Angebot nutzen. */
export interface Durchdringung {
  teilnahmen: number;
  /** Bezugsgroesse: die Belegschaft laut Angebot der Firma — mindestens alle Mitarbeiter in der Liste */
  belegschaft: number;
  /** Woher die Bezugsgroesse stammt: dem Angebot der Firma oder der Liste der Beratungen */
  quelle: 'angebot' | 'liste';
  /**
   * Im Angebot steht eine Belegschaft, aber kleiner als die Liste — gezaehlt
   * wird dann die Liste, damit die Quote nicht ueber 100 % steigt.
   */
  angebotZuKlein: boolean;
  /** Anteil 0–1; null ohne Mitarbeiter */
  quote: number | null;
}

/**
 * Die Durchdringungsquote: Teilnahmen je Mitarbeiter im Unternehmen. Ohne
 * Belegschaft im Angebot zaehlen alle Mitarbeiter in der Liste, auch die mit
 * Verzicht oder noch offener Entscheidung.
 */
export function durchdringung(summen: UebersichtSummen, belegschaft: number): Durchdringung {
  const inListe = summen.teilnahmen + summen.verzichte + summen.offen;
  const angebot = Math.max(0, Math.round(belegschaft));
  const ausAngebot = angebot > 0 && angebot >= inListe;
  const n = ausAngebot ? angebot : inListe;
  return {
    teilnahmen: summen.teilnahmen,
    belegschaft: n,
    quelle: ausAngebot ? 'angebot' : 'liste',
    angebotZuKlein: angebot > 0 && angebot < inListe,
    quote: n > 0 ? summen.teilnahmen / n : null,
  };
}

/** Die Fussnote zur Markierung in der Tabelle — am Bildschirm und im Druck. */
export const AUFGESTOCKT_TEXT = '* Gesetzlicher Mindestzuschuss (§ 1a Abs. 1a BetrAVG): 15 % der Umwandlung, soweit der Arbeitgeber '
  + 'Sozialabgaben spart — mehr, als die Regel der Firma ergäbe. Eingerechnet ist der gesetzliche Zuschuss.';

/** „43 %“ — ganze Prozent; null: „—“. */
export const quoteText = (q: number | null) => (q === null ? '—' : `${Math.round(q * 100).toLocaleString('de-DE')} %`);

/** „3 von 12 Mitarbeitern im Unternehmen nutzen das Angebot.“ — mit der Herkunft der Bezugsgroesse. */
export function durchdringungText(d: Durchdringung): string {
  const wer = d.belegschaft === 1 ? 'Mitarbeiter' : 'Mitarbeitern';
  const wo = d.quelle === 'angebot' ? 'im Unternehmen' : 'in der Liste';
  return `${d.teilnahmen} von ${d.belegschaft} ${wer} ${wo} ${d.teilnahmen === 1 ? 'nutzt' : 'nutzen'} das Angebot.`;
}

/** „30 %“, „25,5 %“ — ein Satz der Firma. */
export const satzText = (x: number) => `${(Math.round(x * 1000) / 10).toLocaleString('de-DE')} %`;

/** Eine Zeile der Aufstellung „Netto-Belastung des Arbeitgebers“. */
export interface BelastungsZeile {
  text: string;
  /** Betrag im Monat, ohne Vorzeichen — das Zeichen steht vorn im Text */
  monat: number;
  art: 'posten' | 'zwischensumme' | 'summe';
}

/**
 * Die Aufstellung: Beitrag, abzueglich der Sozialabgaben (und Umlagen), die
 * die Entgeltumwandlung spart, ergibt den Aufwand vor Steuern; als
 * Betriebsausgabe senkt er die Steuer auf den Gewinn — was bleibt, ist die
 * Netto-Belastung. Am Bildschirm und im Druck dieselben Zeilen.
 *
 * Uebersteigt die Ersparnis den Beitrag — etwa beim blossen
 * Pflichtzuschuss —, wird aus dem Aufwand eine Ersparnis, und die Steuer
 * nimmt einen Teil davon wieder.
 */
export function belastungsZeilen(
  b: ArbeitgeberBelastung, f: Pick<FirmenAngebot, 'unternehmensSteuersatz' | 'umlagenSatz'>,
): BelastungsZeile[] {
  const kosten = b.kostenVorSteuerMonat >= 0;
  const satz = satzText(f.unternehmensSteuersatz);
  return [
    { text: 'Beitrag des Arbeitgebers', monat: b.beitragMonat, art: 'posten' },
    { text: '− gesparte Sozialabgaben durch die Entgeltumwandlung', monat: b.svErsparnisMonat, art: 'posten' },
    ...(f.umlagenSatz > 0
      ? [{ text: `− gesparte Umlagen (${satzText(f.umlagenSatz)})`, monat: b.umlagenErsparnisMonat, art: 'posten' } as const]
      : []),
    { text: kosten ? '= Aufwand vor Steuern' : '= Ersparnis vor Steuern', monat: Math.abs(b.kostenVorSteuerMonat), art: 'zwischensumme' },
    {
      text: kosten ? `− Steuerersparnis als Betriebsausgabe (${satz})` : `− Steuer auf die Ersparnis (${satz})`,
      monat: Math.abs(b.steuerersparnisMonat), art: 'posten',
    },
    { text: kosten ? '= Netto-Belastung' : '= Netto-Ersparnis', monat: Math.abs(b.nettoKostenMonat), art: 'summe' },
  ];
}

const zahl = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });

/**
 * Eine Zelle fuer die CSV-Datei. Namen sind freie Eingaben: Was mit = + - @
 * beginnt, liest eine Tabellenkalkulation als Formel — ein vorangestelltes
 * Hochkomma macht daraus Text.
 */
export function csvZelle(s: string): string {
  const t = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${t.replace(/"/g, '""')}"`;
}

/** UTF-8 mit BOM, Semikolon, deutsche Dezimalzahlen — so oeffnet Excel die Datei ohne Rueckfrage richtig. */
export function uebersichtCsv(zeilen: readonly UebersichtZeile[]): string {
  const kopf = ['Name', 'Entscheidung', 'Umwandlung je Monat', 'Arbeitgeberanteil je Monat', 'Beitrag gesamt je Monat', 'Beginn'];
  const zeile = (z: UebersichtZeile) => [
    csvZelle(z.name), csvZelle(STATUS_TEXT[z.status]),
    zahl(z.umwandlungMonat), zahl(z.arbeitgeberMonat), zahl(z.gesamtMonat), csvZelle(z.beginn),
  ].join(';');
  return `﻿${[kopf.map(csvZelle).join(';'), ...zeilen.map(zeile)].join('\r\n')}\r\n`;
}

/** Ein Dateiname aus dem Firmennamen — ohne Zeichen, die ein Dateisystem stoeren. */
export function csvDateiname(firma: string, heute = new Date()): string {
  const name = firma.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'Firma';
  return `bAV-Uebersicht-${name}-${heute.toISOString().slice(0, 10)}.csv`;
}
