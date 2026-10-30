import { describe, it, expect } from 'vitest';
import {
  grenzLohnsteuersatz, lohnsteuerJahr, lohnsteuerMitZuschlaegen, lohnsteuerZusatz, STEUERKLASSEN,
} from '../src/tax/lohnsteuer.js';
import { einkommensteuer, grundtarif } from '../src/tax/estg.js';
import { zusatzsteuer } from '../src/tax/haushalt.js';
import { bruttoZuNetto } from '../src/erwerb/netto.js';
import { bavMitarbeiter, type FirmenModell } from '../src/analyse/bav-mitarbeiter.js';
import { parameterFuer } from '../src/params/registry.js';

const p = parameterFuer(2026, { indexRate: 0 });
const ort = { bundesland: 'Nordrhein-Westfalen', kirchensteuerpflichtig: false };
const ZVE = [0, 9_000, 14_000, 25_000, 34_939, 40_000, 60_000, 100_000, 250_000];

describe('Lohnsteuer nach Steuerklasse: der Tarif', () => {
  it('I und IV sind der Grundtarif, III das Splitting — wie die Jahressteuer', () => {
    for (const zve of ZVE) {
      expect(lohnsteuerJahr(zve, 1, p)).toBe(einkommensteuer(zve, false, p));
      expect(lohnsteuerJahr(zve, 4, p)).toBe(einkommensteuer(zve, false, p));
      expect(lohnsteuerJahr(zve, 3, p)).toBe(einkommensteuer(zve, true, p));
    }
  });

  it('II zieht vorher den Entlastungsbetrag für Alleinerziehende ab (4.260 €)', () => {
    expect(p.lohnsteuer.entlastungAlleinerziehend).toBe(4260);
    expect(lohnsteuerJahr(40_000, 2, p)).toBe(grundtarif(40_000 - 4260, p.est));
    expect(lohnsteuerJahr(40_000, 2, p)).toBeLessThan(lohnsteuerJahr(40_000, 1, p));
  });

  it('V: mindestens 14 % — schon ab dem ersten Euro, ohne Grundfreibetrag', () => {
    expect(lohnsteuerJahr(10_000, 5, p)).toBe(1400);
    for (const zve of ZVE) expect(lohnsteuerJahr(zve, 5, p)).toBeGreaterThanOrEqual(Math.floor(zve * 0.14));
  });

  it('V: über W2 genau 42 %, über W3 45 % auf jeden weiteren Euro', () => {
    const { w2Stkl5: w2, w3Stkl5: w3 } = p.lohnsteuer;
    expect([w2, w3]).toEqual([34_939, 222_260]);
    expect(lohnsteuerJahr(w2 + 10_100, 5, p) - lohnsteuerJahr(w2 + 100, 5, p)).toBeCloseTo(4200, -1);
    expect(lohnsteuerJahr(w3 + 10_100, 5, p) - lohnsteuerJahr(w3 + 100, 5, p)).toBeCloseTo(4500, -1);
  });

  it('V: stetig an W1, W2 und W3 — kein Sprung', () => {
    for (const w of [p.lohnsteuer.w1Stkl5, p.lohnsteuer.w2Stkl5, p.lohnsteuer.w3Stkl5]) {
      expect(Math.abs(lohnsteuerJahr(w + 1, 5, p) - lohnsteuerJahr(w, 5, p))).toBeLessThanOrEqual(2);
    }
  });

  it('III ≤ I = IV ≤ V für jedes Einkommen', () => {
    for (const zve of ZVE) {
      const [eins, , drei, vier, fuenf] = STEUERKLASSEN.map((k) => lohnsteuerJahr(zve, k, p));
      expect(drei).toBeLessThanOrEqual(eins!);
      expect(vier).toBe(eins);
      expect(fuenf).toBeGreaterThanOrEqual(eins!);
    }
  });

  it('Soli: in III mit doppelter Freigrenze, Kirchensteuer 8 % in Bayern', () => {
    const eins = lohnsteuerMitZuschlaegen(120_000, 1, ort, p);
    const drei = lohnsteuerMitZuschlaegen(120_000, 3, ort, p);
    expect(eins.soli).toBeGreaterThan(0);
    expect(drei.soli).toBe(0);
    const bayern = lohnsteuerMitZuschlaegen(50_000, 1, { bundesland: 'Bayern', kirchensteuerpflichtig: true }, p);
    expect(bayern.kirchensteuer).toBeCloseTo(bayern.lohnsteuer * 0.08, 6);
  });

  it('Zusatz und Grenzsatz: in I wie die Jahressteuer, in V höher, in III niedriger', () => {
    const o = { ...ort, verheiratet: false };
    expect(lohnsteuerZusatz(40_000, 1_800, 1, ort, p)).toBeCloseTo(zusatzsteuer(40_000, 1_800, o, p), 6);
    expect(lohnsteuerZusatz(40_000, 1_800, 5, ort, p)).toBeGreaterThan(lohnsteuerZusatz(40_000, 1_800, 1, ort, p));
    expect(lohnsteuerZusatz(40_000, 1_800, 3, ort, p)).toBeLessThan(lohnsteuerZusatz(40_000, 1_800, 1, ort, p));
    expect(grenzLohnsteuersatz(60_000, 5, p)).toBeCloseTo(0.42, 2);
  });

  it('Fortgeschriebene Jahre: die Grenzen der Klasse V wachsen mit dem Index, der Entlastungsbetrag bleibt', () => {
    const q = parameterFuer(2030, { indexRate: 0.02 });
    expect(q.lohnsteuer.w2Stkl5).toBeGreaterThan(p.lohnsteuer.w2Stkl5);
    expect(q.lohnsteuer.entlastungAlleinerziehend).toBe(4260);
    expect(parameterFuer(2027, { indexRate: 0 }).lohnsteuer).toEqual(p.lohnsteuer);
  });
});

describe('Lohnsteuer nach Steuerklasse: Netto und Entgeltumwandlung', () => {
  const opt = { verheiratet: false, ...ort, kinder: { hatKinder: false, kinderUnter25: 0 } };

  it('Ohne Steuerklasse bleibt alles wie bisher; mit I identisch, mit V weniger Netto', () => {
    const ohne = bruttoZuNetto(48_000, opt, p);
    expect(bruttoZuNetto(48_000, { ...opt, steuerklasse: 1 }, p)).toEqual(ohne);
    // Verheiratet mit Klasse III ist das Splitting ohne Partnereinkommen — wie bisher „verheiratet“
    expect(bruttoZuNetto(48_000, { ...opt, verheiratet: true, steuerklasse: 3 }, p))
      .toEqual(bruttoZuNetto(48_000, { ...opt, verheiratet: true }, p));
    expect(bruttoZuNetto(48_000, { ...opt, verheiratet: true, steuerklasse: 5 }, p).monatsnetto).toBeLessThan(ohne.monatsnetto);
  });

  it('Die Steuerersparnis der Umwandlung folgt der Klasse: V spart mehr als I, III weniger; das Partnereinkommen zählt nicht', () => {
    const modell: FirmenModell = { art: 'zuschuss', quote: 0.5, deckelMonat: 100 };
    const ma = { jahresbrutto: 48_000, umwandlungMonat: 150, privatVersichert: false, pkvPraemieMonat: 0, kinder: opt.kinder, bavBestandMonat: 0 };
    const mit = (steuerklasse: 1 | 3 | 5, partnerZveJahr = 0) =>
      bavMitarbeiter(modell, ma, { ...ort, verheiratet: steuerklasse !== 1, partnerZveJahr, steuerklasse }, p);
    expect(mit(1).steuerersparnisMonat).toBeCloseTo(bavMitarbeiter(modell, ma, { ...ort, verheiratet: false }, p).steuerersparnisMonat, 6);
    expect(mit(5).steuerersparnisMonat).toBeGreaterThan(mit(1).steuerersparnisMonat);
    expect(mit(3).steuerersparnisMonat).toBeLessThan(mit(1).steuerersparnisMonat);
    expect(mit(5, 40_000).steuerersparnisMonat).toBe(mit(5).steuerersparnisMonat);
  });
});
