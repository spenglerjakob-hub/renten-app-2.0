import { describe, it, expect } from 'vitest';
import { bkvModell, SACHBEZUG_FREIGRENZE_MONAT, type BkvEingaben } from '../src/analyse/bkv.js';
import { parameterFuer } from '../src/params/registry.js';

const p = parameterFuer(2026, { indexRate: 0 });
const steuer = { verheiratet: false, bundesland: 'Nordrhein-Westfalen', kirchensteuerpflichtig: false };

const eingaben = (over: Partial<BkvEingaben> = {}): BkvEingaben => ({
  beitragMonat: 30,
  weitereSachbezuegeMonat: 0,
  jahresbrutto: 48_000,
  unternehmensSteuersatz: 0.3,
  umlagenSatz: 0.02,
  privatVersichert: false,
  pkvPraemieMonat: 0,
  kinder: { hatKinder: false, kinderUnter25: 0 },
  ...over,
});

describe('bKV in der Sachbezugsfreigrenze', () => {
  it('30 EUR: keine Abgaben, Arbeitgeber zahlt netto 21 EUR', () => {
    const r = bkvModell(eingaben(), steuer, p);
    expect(r.inFreigrenze).toBe(true);
    expect(r.freigrenzeRestMonat).toBeCloseTo(20, 6);
    expect(r.arbeitgeber.abgabenMonat).toBe(0);
    expect(r.arbeitgeber.nettoKostenMonat).toBeCloseTo(21, 6);
    expect(r.mitarbeiter.abzuegeMonat).toBe(0);
    expect(r.mitarbeiter.wertMonat).toBe(30);
  });

  it('genau 50 EUR liegen noch in der Freigrenze', () => {
    const r = bkvModell(eingaben({ beitragMonat: SACHBEZUG_FREIGRENZE_MONAT }), steuer, p);
    expect(r.inFreigrenze).toBe(true);
    expect(r.freigrenzeRestMonat).toBe(0);
  });

  it('andere Sachbezuege zaehlen mit und verkleinern den Rest', () => {
    const r = bkvModell(eingaben({ weitereSachbezuegeMonat: 15 }), steuer, p);
    expect(r.inFreigrenze).toBe(true);
    expect(r.freigrenzeRestMonat).toBeCloseTo(5, 6);
    expect(r.hinweise.some((h) => h.includes('alle Sachbezüge zusammen'))).toBe(true);
  });
});

describe('bKV ueber der Freigrenze', () => {
  it('40 + 20 EUR: der GESAMTE Betrag wird pflichtig', () => {
    const r = bkvModell(eingaben({ beitragMonat: 40, weitereSachbezuegeMonat: 20 }), steuer, p);
    expect(r.inFreigrenze).toBe(false);
    expect(r.freigrenzeRestMonat).toBe(0);
    expect(r.arbeitgeber.abgabenMonat).toBeGreaterThan(40 * 0.2);
    expect(r.mitarbeiter.abzuegeMonat).toBeGreaterThan(40 * 0.3);
    expect(r.arbeitgeber.nettoKostenMonat).toBeCloseTo((40 + r.arbeitgeber.abgabenMonat) * 0.7, 6);
    expect(r.hinweise.some((h) => h.includes('GESAMTE'))).toBe(true);
  });
});

describe('Vergleich mit einer Gehaltserhoehung', () => {
  it('gleiches Netto beim Mitarbeiter, teurer fuer den Arbeitgeber', () => {
    const r = bkvModell(eingaben(), steuer, p);
    const g = r.gehalt!;
    expect(g.nettoMonat).toBeCloseTo(30, 1);
    expect(g.bruttoMonat).toBeGreaterThan(50);
    expect(g.svMonat + g.steuerMonat).toBeCloseTo(g.bruttoMonat - g.nettoMonat, 1);
    expect(g.kostenVorSteuerMonat - g.steuerersparnisMonat).toBeCloseTo(g.nettoKostenMonat, 6);
    expect(r.ersparnisGegenGehaltMonat).toBeGreaterThan(10);
  });

  it('ueber der Freigrenze: Gehalt muss nur das geminderte Netto erreichen', () => {
    const r = bkvModell(eingaben({ beitragMonat: 60 }), steuer, p);
    expect(r.gehalt!.nettoMonat).toBeCloseTo(60 - r.mitarbeiter.abzuegeMonat, 1);
  });

  it('privat versichert rechnet ohne Fehler', () => {
    const r = bkvModell(eingaben({ jahresbrutto: 90_000, privatVersichert: true, pkvPraemieMonat: 600 }), steuer, p);
    expect(r.gehalt).not.toBeNull();
    expect(Number.isFinite(r.ersparnisGegenGehaltMonat)).toBe(true);
    expect(r.ersparnisGegenGehaltMonat).toBeGreaterThan(0);
  });

  it('ohne Beitrag gibt es keinen Vergleich', () => {
    const r = bkvModell(eingaben({ beitragMonat: 0 }), steuer, p);
    expect(r.gehalt).toBeNull();
    expect(r.ersparnisGegenGehaltMonat).toBe(0);
  });
});
