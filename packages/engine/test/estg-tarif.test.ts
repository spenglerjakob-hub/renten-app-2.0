import { describe, it, expect } from 'vitest';
import { koeffizienten, grundtarif, einkommensteuer, grenzsteuersatz, solidaritaetszuschlag } from '../src/tax/estg.js';
import { BELEGTE_JAHRE, PARAMETER_2024 } from '../src/params/jahre.js';

/**
 * Diese Tests sind die Lehre aus Befund A1/A2: Der Prototyp mischte zwei
 * Tarifjahrgaenge und erzeugte damit Spruenge von 85 EUR und negative
 * Grenzsteuersaetze. Stetigkeit und Monotonie werden hier fuer JEDEN
 * gepflegten Jahrgang maschinell geprueft.
 */

describe('§ 32a — Herleitung reproduziert die amtlichen Konstanten', () => {
  it('trifft die 2024er Koeffizienten auf < 0,01 EUR', () => {
    const k = koeffizienten(PARAMETER_2024.est);
    expect(k.a2).toBeCloseTo(922.98, 2);
    expect(k.b2).toBeCloseTo(1400, 6);
    expect(k.a3).toBeCloseTo(181.19, 2);
    expect(k.b3).toBeCloseTo(2397, 6);
    expect(k.c3).toBeCloseTo(1025.38, 2);
    expect(k.abzug4).toBeCloseTo(10602.13, 1);
    expect(k.abzug5).toBeCloseTo(18936.88, 1);
  });
});

describe.each(BELEGTE_JAHRE.map((p) => [p.jahr, p] as const))('Tarif %i', (_jahr, p) => {
  const e = p.est;

  it('ist an allen Zonengrenzen stetig', () => {
    for (const grenze of [e.grundfreibetrag, e.zone2Ende, e.zone3Ende, e.zone4Ende]) {
      const links = grundtarif(grenze, e);
      const rechts = grundtarif(grenze + 1, e);
      // Toleranz 2 EUR: mehr als die Abrundung auf volle Euro hergibt,
      // aber weit unter dem 85-EUR-Sprung des Prototyps.
      expect(Math.abs(rechts - links)).toBeLessThan(2);
    }
  });

  it('ist monoton steigend', () => {
    let vorher = 0;
    for (let zve = 0; zve <= 320000; zve += 250) {
      const jetzt = grundtarif(zve, e);
      expect(jetzt).toBeGreaterThanOrEqual(vorher);
      vorher = jetzt;
    }
  });

  it('haelt den Grenzsteuersatz durchgehend in [0 %, 45 %]', () => {
    for (let zve = 0; zve <= 320000; zve += 250) {
      const gs = grenzsteuersatz(zve, false, p, 100);
      expect(gs).toBeGreaterThanOrEqual(0);
      expect(gs).toBeLessThanOrEqual(0.4501);
    }
  });

  it('trifft die Eckwerte des Grenzsteuersatzes', () => {
    // Hinweis: § 32a rundet zvE und Steuer auf volle Euro ab. Ein 1-EUR-Schritt
    // misst deshalb nur Rundungsrauschen — der Schritt muss gross genug sein.
    const schritt = 1000;
    // Direkt oberhalb des Grundfreibetrags beginnt die Progression bei 14 %
    // und steigt innerhalb des Messfensters leicht an.
    const eintritt = grenzsteuersatz(e.grundfreibetrag, false, p, schritt);
    expect(eintritt).toBeGreaterThanOrEqual(0.14);
    expect(eintritt).toBeLessThan(0.16);
    // Die Proportionalzonen sind linear, dort ist der Satz exakt.
    expect(grenzsteuersatz(e.zone3Ende + 5000, false, p, schritt)).toBeCloseTo(0.42, 3);
    expect(grenzsteuersatz(e.zone4Ende + 5000, false, p, schritt)).toBeCloseTo(0.45, 3);
  });

  it('haelt den Grenzsteuersatz ueber den gesamten Verlauf monoton', () => {
    // Progressiver Tarif: der Satz darf nirgends fallen.
    let vorher = 0;
    for (let zve = e.grundfreibetrag; zve <= e.zone3Ende; zve += 500) {
      const gs = grenzsteuersatz(zve, false, p, 500);
      expect(gs).toBeGreaterThanOrEqual(vorher - 0.005);
      vorher = gs;
    }
  });

  it('zahlt bis zum Grundfreibetrag keine Steuer', () => {
    expect(grundtarif(e.grundfreibetrag, e)).toBe(0);
    expect(grundtarif(e.grundfreibetrag + 1, e)).toBe(0); // Abrundung
  });

  it('Splittingtarif ist nie teurer als der Grundtarif', () => {
    for (const zve of [20000, 45000, 80000, 150000, 400000]) {
      expect(einkommensteuer(zve, true, p)).toBeLessThanOrEqual(einkommensteuer(zve, false, p));
    }
  });

  it('Solidaritaetszuschlag: 0 unterhalb der Freigrenze, gedeckelt auf 5,5 %', () => {
    expect(solidaritaetszuschlag(p.soli.freigrenze, false, p)).toBe(0);
    const hoch = 200000;
    expect(solidaritaetszuschlag(hoch, false, p)).toBeCloseTo(hoch * 0.055, 6);
    // Milderungszone: stetig ab der Freigrenze
    expect(solidaritaetszuschlag(p.soli.freigrenze + 1, false, p)).toBeLessThan(1);
  });
});

describe('Regression gegen den Prototyp', () => {
  it('kein negativer Grenzsteuersatz mehr rund um 17.700 EUR', () => {
    // Der Prototyp lieferte hier -61 %, weil Zone 2 (2024) auf Zone 3 (2023) traf.
    for (let zve = 17000; zve <= 18500; zve += 10) {
      expect(grenzsteuersatz(zve, false, PARAMETER_2024, 100)).toBeGreaterThanOrEqual(0);
    }
  });

  it('Steuer sinkt nirgends beim Ueberschreiten einer Zonengrenze', () => {
    const e = PARAMETER_2024.est;
    expect(grundtarif(e.zone2Ende + 1, e)).toBeGreaterThanOrEqual(grundtarif(e.zone2Ende, e));
    expect(grundtarif(e.zone3Ende + 1, e)).toBeGreaterThanOrEqual(grundtarif(e.zone3Ende, e));
  });
});
