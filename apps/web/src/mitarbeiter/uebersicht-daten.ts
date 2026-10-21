import type { BeratungStatus } from '@renten/schema';
import type { Beratung, Firma } from '../lib/bav-beratung';
import { beitragsRechnung } from './rechnung';

/**
 * Die Uebersicht fuer den Arbeitgeber: wer teilnimmt, mit welchem Betrag
 * und ab wann — das, was die Personalabteilung fuer die Lohnabrechnung
 * braucht, und nicht mehr (keine Gehaelter, keine Steuerdaten).
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
}

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
        return { name, status: b.status, umwandlungMonat: 0, arbeitgeberMonat: 0, gesamtMonat: 0, beginn: '' };
      }
      const r = beitragsRechnung(firma.angebot, b.daten);
      return {
        name, status: 'teilnahme',
        umwandlungMonat: r.umwandlungMonat, arbeitgeberMonat: r.arbeitgeberMonat, gesamtMonat: r.gesamtMonat,
        beginn: b.daten.entscheidung.beginn,
      };
    })
    .sort((x, y) => x.name.localeCompare(y.name, 'de'));
}

export function uebersichtSummen(zeilen: readonly UebersichtZeile[]): UebersichtSummen {
  const s: UebersichtSummen = { teilnahmen: 0, verzichte: 0, offen: 0, umwandlungMonat: 0, arbeitgeberMonat: 0, gesamtMonat: 0 };
  for (const z of zeilen) {
    if (z.status === 'teilnahme') s.teilnahmen += 1;
    else if (z.status === 'verzicht') s.verzichte += 1;
    else s.offen += 1;
    s.umwandlungMonat += z.umwandlungMonat;
    s.arbeitgeberMonat += z.arbeitgeberMonat;
    s.gesamtMonat += z.gesamtMonat;
  }
  return s;
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
