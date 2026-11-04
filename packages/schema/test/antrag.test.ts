import { describe, expect, it } from 'vitest';
import {
  BEZUGSRECHTE, BEZUGSRECHT_VORGABE, antragAngabenSchema, braucheBank, eingangUebernehmen, ibanFormatiert,
  ibanGueltig, offeneAngaben,
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
