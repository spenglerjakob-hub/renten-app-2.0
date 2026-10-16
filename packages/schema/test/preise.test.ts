import { describe, it, expect } from 'vitest';
import {
  PAKETE, STAFFEL_AB, JAHR_MONATE,
  staffelIndex, preisJeNutzer, gesamtpreis, ersparnis, jahresvorteil,
  stripeStaffeln, lookupKey, paketDeckt, paketVon, preisJeFall, FAELLE_VORGABE,
} from '../src/preise.js';

describe('Preisstaffel', () => {
  it('ordnet die Nutzerzahl der richtigen Staffel zu', () => {
    const erwartet: [number, number][] = [[1, 0], [2, 0], [3, 1], [4, 1], [5, 2], [7, 2], [8, 3], [50, 3]];
    for (const [nutzer, index] of erwartet) expect(staffelIndex(nutzer)).toBe(index);
  });

  it('behandelt 0, Bruchteile und negative Zahlen wie einen Nutzer', () => {
    expect(staffelIndex(0)).toBe(0);
    expect(staffelIndex(2.9)).toBe(0);
    expect(staffelIndex(-3)).toBe(0);
    expect(gesamtpreis('alles', 'monat', 0)).toBe(59);
  });

  it('liefert die vereinbarten Preise je Nutzer und Monat', () => {
    expect([1, 3, 5, 8].map((n) => preisJeNutzer('alles', 'monat', n))).toEqual([59, 53, 50, 47]);
    expect([1, 3, 5, 8].map((n) => preisJeNutzer('rente', 'monat', n))).toEqual([39, 35, 33, 31]);
    expect([1, 3, 5, 8].map((n) => preisJeNutzer('ag', 'monat', n))).toEqual([29, 26, 25, 23]);
  });

  it('rechnet das Jahr als zehn Monate', () => {
    expect(JAHR_MONATE).toBe(10);
    for (const p of PAKETE) {
      for (const n of [1, 3, 5, 8]) {
        expect(preisJeNutzer(p.id, 'jahr', n)).toBe(preisJeNutzer(p.id, 'monat', n) * 10);
      }
    }
    expect(jahresvorteil('alles', 1)).toBe(59 * 2);
  });

  it('summiert und nennt die Ersparnis gegenüber dem Einzelpreis', () => {
    expect(gesamtpreis('alles', 'monat', 3)).toBe(159);
    expect(gesamtpreis('rente', 'monat', 3)).toBe(105);
    expect(gesamtpreis('ag', 'monat', 3)).toBe(78);
    expect(ersparnis('alles', 'monat', 5)).toBe(5 * 59 - 5 * 50);
    expect(ersparnis('alles', 'monat', 2)).toBe(0);
    expect(gesamtpreis('alles', 'jahr', 8)).toBe(8 * 470);
  });

  it('hat je Paket eine vollständige, fallende Staffel', () => {
    for (const p of PAKETE) {
      expect(p.monat).toHaveLength(STAFFEL_AB.length);
      for (let i = 1; i < p.monat.length; i++) expect(p.monat[i]).toBeLessThanOrEqual(p.monat[i - 1]!);
      for (const m of p.monat) expect(m).toBeGreaterThan(0);
    }
    expect(PAKETE.filter((p) => p.empfohlen).map((p) => p.id)).toEqual(['alles']);
  });
});

describe('Stripe', () => {
  it('baut die Staffeln in Cent mit offenen Grenzen', () => {
    expect(stripeStaffeln('ag', 'monat')).toEqual([
      { up_to: 2, unit_amount: 2900 },
      { up_to: 4, unit_amount: 2600 },
      { up_to: 7, unit_amount: 2500 },
      { up_to: 'inf', unit_amount: 2300 },
    ]);
    expect(stripeStaffeln('alles', 'jahr').map((s) => s.unit_amount)).toEqual([59000, 53000, 50000, 47000]);
    for (const p of PAKETE) {
      for (const s of stripeStaffeln(p.id, 'monat')) expect(Number.isInteger(s.unit_amount)).toBe(true);
    }
  });

  it('benennt die Preise einheitlich', () => {
    expect(lookupKey('rente', 'jahr')).toBe('rente_jahr');
  });
});

describe('Bereiche', () => {
  it('schaltet je Paket die richtigen Teile frei', () => {
    expect(paketDeckt('alles', 'rente')).toBe(true);
    expect(paketDeckt('alles', 'ag')).toBe(true);
    expect(paketDeckt('rente', 'ag')).toBe(false);
    expect(paketDeckt('ag', 'rente')).toBe(false);
    expect(paketDeckt(null, 'rente')).toBe(false);
  });

  it('kennt kein unbekanntes Paket', () => {
    // @ts-expect-error: absichtlich falsche Kennung
    expect(() => paketVon('gold')).toThrow();
  });
});

describe('Preis je Beratungsfall', () => {
  it('teilt den Monatspreis durch die Fälle', () => {
    expect(preisJeFall('alles', 'monat', 1, 5)).toBe(11.8);
    expect(preisJeFall('alles', 'monat', 1, 6)).toBe(9.83);
    expect(preisJeFall('rente', 'monat', 1, 5)).toBe(7.8);
  });

  it('nimmt bei Jahreszahlung ein Zwölftel des Jahrespreises', () => {
    // 59 € × 10 Monatspreise = 590 € im Jahr, 49,17 € im Monat, bei 5 Fällen 9,83 €.
    expect(preisJeFall('alles', 'jahr', 1, 5)).toBe(9.83);
  });

  it('gilt mit dem Staffelpreis des Büros', () => {
    expect(preisJeFall('alles', 'monat', 3, 5)).toBe(10.6);
  });

  it('weniger als ein Fall zählt als einer', () => {
    expect(preisJeFall('alles', 'monat', 1, 0)).toBe(59);
    expect(preisJeFall('alles', 'monat', 1, 0.4)).toBe(59);
  });

  it('die Vorgabe ist vorsichtig', () => {
    expect(FAELLE_VORGABE).toBe(5);
  });
});
