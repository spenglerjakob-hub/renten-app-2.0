import { describe, expect, it } from 'vitest';
import {
  BEZUGSRECHTE, BEZUGSRECHT_VORGABE, antragAngabenSchema, braucheBank, eingangUebernehmen, ibanBereinigt,
  ibanFehler, ibanFormatiert, ibanGueltig, offeneAngaben,
} from '../src/antrag.js';

describe('Bezugsrechte', () => {
  it('vier Punkte im Wortlaut, vorbelegt der erste', () => {
    expect(BEZUGSRECHTE.map((b) => b.wert)).toEqual([1, 2, 3, 4]);
    expect(BEZUGSRECHT_VORGABE).toBe(1);
    expect(BEZUGSRECHTE[0].text).toBe('der Ehegatte, mit dem der Versicherungsnehmer (VN) im Zeitpunkt des Todes verheiratet war. '
      + 'Ist dieser vorverstorben, die Kinder des VN i.S.v. § 10 Absatz 1 Nr. 2 b) EStG');
    expect(BEZUGSRECHTE[3].text).toBe('die Kinder des Versicherungsnehmers gemäß § 10 Absatz 1 Nr. 2 b) EStG');
  });
});

describe('IBAN', () => {
  it('Pruefziffer nach Modulo 97 — wie in der Datenbank', () => {
    expect(ibanGueltig('DE89370400440532013000')).toBe(true);
    expect(ibanGueltig('de89 3704 0044 0532 0130 00')).toBe(true);
    expect(ibanGueltig('DE89370400440532013001')).toBe(false);
    expect(ibanGueltig('GB82 WEST 1234 5698 7654 32')).toBe(true);
    expect(ibanGueltig('AT61 1904 3002 3457 3201')).toBe(true);
    // Deutschland: 22 Stellen
    expect(ibanGueltig('DE8937040044053201300')).toBe(false);
    expect(ibanGueltig('')).toBe(false);
  });

  it('in Vierergruppen', () => {
    expect(ibanFormatiert('de89370400440532013000')).toBe('DE89 3704 0044 0532 0130 00');
  });

  const PRUEFZIFFER_DE = 'Die Prüfziffer stimmt nicht: Die zwei Ziffern nach „DE“ passen nicht zu Bankleitzahl und Kontonummer. '
    + 'Bitte Stelle für Stelle vergleichen.';
  const PRUEFZIFFER_ANDERE = 'Die Prüfziffer stimmt nicht: Die zwei Ziffern nach dem Länderkürzel passen nicht zum Rest der IBAN. '
    + 'Bitte Stelle für Stelle vergleichen.';

  it('die Meldung nennt die Ursache — zu kurz ist nicht „Prüfziffer“', () => {
    // Der Fall vom Bildschirmfoto: 18 statt 22 Stellen
    expect(ibanFehler('DE23 6605 5555 5555 54')).toBe('Eine deutsche IBAN hat 22\u00a0Stellen — hier sind es\u00a018.');
    expect(ibanFehler('DE89 3704 0044 0532 0130 000')).toBe('Eine deutsche IBAN hat 22\u00a0Stellen — hier sind es\u00a023.');
    // Beim Tippen zählt sie mit, schon ab dem „D“
    expect(ibanFehler('d')).toBe('Eine deutsche IBAN hat 22\u00a0Stellen — hier ist es eine.');
    expect(ibanFehler('DE89 37')).toBe('Eine deutsche IBAN hat 22\u00a0Stellen — hier sind es\u00a06.');
    expect(ibanFehler('DE89 3704 0044 0532 0130 01')).toBe(PRUEFZIFFER_DE);
    // Ausgedacht, aber 22 Stellen: Die Prüfziffer passt nur zufällig
    expect(ibanFehler('DE23 6605 5555 5555 5555 54')).toBe(PRUEFZIFFER_DE);
    expect(ibanFehler('DE89 37O4 0044 0532 0130 00')).toBe('Nach „DE“ folgen nur Ziffern — steht irgendwo ein O statt einer 0?');
    expect(ibanFehler('DE89-3704-0044-0532-0130-00')).toBe('Eine IBAN besteht nur aus Buchstaben und Ziffern.');
    expect(ibanFehler('3704 0044 0532 0130 00')).toBe('Eine IBAN beginnt mit dem Länderkürzel und zwei Ziffern, etwa „DE12“.');
    expect(ibanFehler('DEX9')).toBe('Eine IBAN beginnt mit dem Länderkürzel und zwei Ziffern, etwa „DE12“.');
    expect(ibanFehler('AT61 1904 3002')).toBe('Eine IBAN hat 15 bis 34\u00a0Stellen — hier sind es\u00a012.');
    expect(ibanFehler('AT61 1904 3002 3457 3202')).toBe(PRUEFZIFFER_ANDERE);
    // Gültig oder leer: keine Meldung
    expect(ibanFehler('de89 3704 0044 0532 0130 00')).toBeNull();
    expect(ibanFehler('GB82 WEST 1234 5698 7654 32')).toBeNull();
    expect(ibanFehler('AT61 1904 3002 3457 3201')).toBeNull();
    expect(ibanFehler('   ')).toBeNull();
  });

  it('Meldung und Gültigkeit sagen dasselbe — auch für Zufallseingaben', () => {
    const zeichen = 'DEATGB0123456789O -';
    let s = 42;
    // Park-Miller: bleibt in sicheren Ganzzahlen, jeder Lauf prüft dieselben Proben
    const zufall = () => { s = (s * 16807) % 2147483647; return s; };
    const proben = ['DE89370400440532013000', 'GB82WEST12345698765432'];
    for (let i = 0; i < 5000; i++) {
      const laenge = zufall() % 36;
      proben.push(Array.from({ length: laenge }, () => zeichen[zufall() % zeichen.length]).join(''));
      // Eine gültige IBAN mit einer vertauschten oder geänderten Stelle
      const g = proben[i % 2]!;
      const k = 4 + (zufall() % (g.length - 4));
      proben.push(g.slice(0, k) + zeichen[zufall() % 12] + g.slice(k + 1));
    }
    for (const p of proben) {
      expect(ibanFehler(p) === null, p).toBe(!ibanBereinigt(p) || ibanGueltig(p));
    }
  });
});

describe('Offene Angaben und Uebernahme', () => {
  const loesungen = [{ id: 'p', art: 'privat' as const }, { id: 'g', art: 'bav' as const }];

  it('nach der Bank wird nur gefragt, wenn eine Loesung keine bAV ist', () => {
    expect(braucheBank([{ art: 'bav' }])).toBe(false);
    expect(braucheBank(loesungen)).toBe(true);
  });

  it('was fehlt: Bezugsrecht je Loesung, gueltige Bank, Ausweis', () => {
    const leer = antragAngabenSchema.parse({});
    expect(offeneAngaben(leer, loesungen, false)).toEqual(['bezugsrecht', 'bank', 'ausweis']);
    const voll = antragAngabenSchema.parse({
      bezugsrecht: { p: 1, g: 2 }, bank: { inhaber: 'Max Muster', iban: 'DE89 3704 0044 0532 0130 00' },
    });
    expect(offeneAngaben(voll, loesungen, true)).toEqual([]);
    expect(offeneAngaben({ ...voll, bank: { inhaber: 'Max Muster', iban: 'DE00' } }, loesungen, true)).toEqual(['bank']);
    // Nur bAV: keine Bank
    expect(offeneAngaben(leer, [{ id: 'g', art: 'bav' }], true)).toEqual(['bezugsrecht']);
  });

  it('der Eingang ergaenzt; wo beide etwas haben, gilt der Kunde', () => {
    const angaben = antragAngabenSchema.parse({ bezugsrecht: { p: 1, g: 3 } });
    const neu = eingangUebernehmen(angaben, { bezugsrecht: { p: 2 }, bank: { inhaber: 'Max', iban: 'de89 3704 0044 0532 0130 00' } });
    expect(neu).toEqual({ bezugsrecht: { p: 2, g: 3 }, bank: { inhaber: 'Max', iban: 'DE89370400440532013000' } });
    expect(eingangUebernehmen(neu, {})).toEqual(neu);
  });

  it('das Schema laesst kein Bezugsrecht ausser 1 bis 4 zu', () => {
    expect(antragAngabenSchema.safeParse({ bezugsrecht: { p: 5 } }).success).toBe(false);
    expect(antragAngabenSchema.safeParse({ bezugsrecht: { p: 1.5 } }).success).toBe(false);
  });
});
