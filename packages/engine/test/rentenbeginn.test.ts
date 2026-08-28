import { describe, it, expect } from 'vitest';
import { regelaltersgrenze, regelaltersrentenbeginn } from '../src/pension/grv.js';
import { parseDatum, toDe } from '../src/util/datum.js';

/** Kurzschreibweise: deutsches Datum rein, deutsches Datum raus. */
function beginn(geburtDe: string): string {
  return toDe(regelaltersrentenbeginn(parseDatum(geburtDe)!));
}

describe('Regelaltersgrenze § 235 SGB VI', () => {
  it('bleibt fuer Jahrgaenge bis 1946 bei 65 Jahren', () => {
    expect(regelaltersgrenze(1940)).toBe(65);
    expect(regelaltersgrenze(1946)).toBe(65);
  });

  it('steigt fuer 1947 bis 1958 in Monatsschritten', () => {
    expect(regelaltersgrenze(1947)).toBeCloseTo(65 + 1 / 12, 9);
    expect(regelaltersgrenze(1958)).toBeCloseTo(66, 9);
  });

  it('steigt fuer 1959 bis 1963 in Zweimonatsschritten', () => {
    expect(regelaltersgrenze(1959)).toBeCloseTo(66 + 2 / 12, 9);
    expect(regelaltersgrenze(1963)).toBeCloseTo(66 + 10 / 12, 9);
  });

  it('liegt ab Jahrgang 1964 bei 67 Jahren', () => {
    expect(regelaltersgrenze(1964)).toBe(67);
    expect(regelaltersgrenze(1990)).toBe(67);
  });
});

describe('Beginn der Regelaltersrente § 99 SGB VI', () => {
  it('beginnt am Ersten des Folgemonats, wenn nicht am Monatsersten geboren', () => {
    // Jahrgang 1970 -> 67 Jahre -> 15.03.2037 -> Rentenbeginn 01.04.2037
    expect(beginn('15.03.1970')).toBe('01.04.2037');
  });

  it('beginnt im selben Monat, wenn am Monatsersten geboren', () => {
    // Am Ersten sind die Voraussetzungen zu Monatsbeginn erfuellt.
    expect(beginn('01.03.1970')).toBe('01.03.2037');
  });

  it('beruecksichtigt die gestaffelte Grenze der Uebergangsjahrgaenge', () => {
    // Jahrgang 1958: 66 Jahre -> 10.06.2024 -> 01.07.2024
    expect(beginn('10.06.1958')).toBe('01.07.2024');
    // Jahrgang 1960: 66 Jahre + 4 Monate -> 10.06.2026 + 4 M = 10.10.2026
    expect(beginn('10.06.1960')).toBe('01.11.2026');
    // Jahrgang 1946: 65 Jahre
    expect(beginn('10.06.1946')).toBe('01.07.2011');
  });

  it('kommt mit dem 29. Februar zurecht', () => {
    // 29.02.1964 + 67 Jahre = 2031, kein Schaltjahr -> 28.02.2031 -> 01.03.2031
    expect(beginn('29.02.1964')).toBe('01.03.2031');
  });

  it('rollt ueber den Jahreswechsel korrekt', () => {
    // 20.12.1970 + 67 Jahre = 20.12.2037 -> Folgemonat 01.01.2038
    expect(beginn('20.12.1970')).toBe('01.01.2038');
  });

  it('liefert immer den Monatsersten', () => {
    for (const g of ['15.03.1970', '01.03.1970', '31.01.1965', '29.02.1964', '20.12.1970']) {
      expect(regelaltersrentenbeginn(parseDatum(g)!).tag).toBe(1);
    }
  });

  it('liegt nie vor dem Geburtsdatum plus 65 Jahren', () => {
    for (const jahr of [1940, 1950, 1958, 1963, 1964, 1985, 2000]) {
      const g = parseDatum(`15.06.${jahr}`)!;
      const r = regelaltersrentenbeginn(g);
      expect(r.jahr - g.jahr).toBeGreaterThanOrEqual(65);
      expect(r.jahr - g.jahr).toBeLessThanOrEqual(68);
    }
  });
});
