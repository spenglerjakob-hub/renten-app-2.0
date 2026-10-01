import { describe, it, expect } from 'vitest';
import {
  bkvModell, SACHBEZUG_FREIGRENZE_MONAT, type BkvEingaben, type BkvErgebnis, type BkvWegId,
} from '../src/analyse/bkv.js';
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
  anzahlMitarbeiter: 20,
  pauschsatz40: null,
  pauschsteuer40TraegtMitarbeiter: false,
  ...over,
});
const weg = (r: BkvErgebnis, id: BkvWegId) => r.wege.find((w) => w.id === id)!;

describe('Sachbezug in der Freigrenze', () => {
  it('30 EUR: keine Abgaben, Arbeitgeber zahlt netto 21 EUR', () => {
    const r = bkvModell(eingaben(), steuer, p);
    const w = weg(r, 'sachbezug');
    expect(r.inFreigrenze).toBe(true);
    expect(r.vorauswahl).toBe('sachbezug');
    expect(r.freigrenzeRestMonat).toBeCloseTo(20, 6);
    expect(w.moeglich).toBe(true);
    expect(w.arbeitgeber.abgabenMonat).toBe(0);
    expect(w.arbeitgeber.nettoKostenMonat).toBeCloseTo(21, 6);
    expect(w.mitarbeiter.belastungMonat).toBe(0);
    expect(w.mitarbeiter.vorteilMonat).toBe(30);
    expect(w.hebel).toBeCloseTo(30 / 21, 6);
  });

  it('genau 50 EUR liegen noch in der Freigrenze', () => {
    const r = bkvModell(eingaben({ beitragMonat: SACHBEZUG_FREIGRENZE_MONAT }), steuer, p);
    expect(r.inFreigrenze).toBe(true);
    expect(r.freigrenzeRestMonat).toBe(0);
  });

  it('andere Sachbezuege zaehlen mit; Aufteilen ist dann nicht noetig', () => {
    const r = bkvModell(eingaben({ weitereSachbezuegeMonat: 15 }), steuer, p);
    expect(r.inFreigrenze).toBe(true);
    expect(r.freigrenzeRestMonat).toBeCloseTo(5, 6);
    expect(weg(r, 'aufteilen').moeglich).toBe(false);
    expect(r.hinweise.some((h) => h.includes('alle Sachbezüge zusammen'))).toBe(true);
  });

  it('Gehaltsvergleich: gleiches Netto, fuer den Arbeitgeber teurer', () => {
    const w = weg(bkvModell(eingaben(), steuer, p), 'sachbezug');
    const g = w.gehalt!;
    expect(g.nettoMonat).toBeCloseTo(30, 1);
    expect(g.bruttoMonat).toBeGreaterThan(50);
    expect(g.svMonat + g.steuerMonat).toBeCloseTo(g.bruttoMonat - g.nettoMonat, 1);
    expect(g.kostenVorSteuerMonat - g.steuerersparnisMonat).toBeCloseTo(g.nettoKostenMonat, 6);
    expect(w.ersparnisGegenGehaltMonat).toBeGreaterThan(10);
  });
});

describe('Ueber der Freigrenze: die anderen Wege', () => {
  const r = bkvModell(eingaben({ beitragMonat: 42.67, weitereSachbezuegeMonat: 20 }), steuer, p);

  it('Sachbezug ist nicht moeglich, Hinweis auf den GESAMTEN Betrag', () => {
    expect(r.inFreigrenze).toBe(false);
    expect(weg(r, 'sachbezug').moeglich).toBe(false);
    expect(r.hinweise.some((h) => h.includes('GESAMTE'))).toBe(true);
  });

  it('Aufteilen: Arbeitgeber 30 EUR steuerfrei, Mitarbeiter den Rest aus dem Netto', () => {
    const w = weg(r, 'aufteilen');
    expect(r.vorauswahl).toBe('aufteilen');
    expect(w.moeglich).toBe(true);
    expect(w.arbeitgeber.beitragMonat).toBeCloseTo(30, 6);
    expect(w.arbeitgeber.abgabenMonat).toBe(0);
    expect(w.arbeitgeber.nettoKostenMonat).toBeCloseTo(21, 6);
    expect(w.mitarbeiter.eigenanteilMonat).toBeCloseTo(12.67, 6);
    expect(w.mitarbeiter.vorteilMonat).toBeCloseTo(30, 6);
  });

  it('Pauschal: 30 % plus Soli beim Arbeitgeber, beim Mitarbeiter nur Sozialabgaben', () => {
    const w = weg(r, 'pauschal37b');
    expect(w.arbeitgeber.pauschsteuerMonat).toBeCloseTo(42.67 * 0.3 * 1.055, 6);
    expect(w.arbeitgeber.abgabenMonat).toBeGreaterThan(42.67 * 0.2);
    // Arbeitnehmeranteil SV rund 21 % — keine Lohnsteuer
    expect(w.mitarbeiter.abzuegeMonat).toBeGreaterThan(42.67 * 0.18);
    expect(w.mitarbeiter.abzuegeMonat).toBeLessThan(42.67 * 0.24);
    expect(w.arbeitgeber.nettoKostenMonat).toBeCloseTo(
      (42.67 + w.arbeitgeber.abgabenMonat + w.arbeitgeber.pauschsteuerMonat) * 0.7, 6,
    );
  });

  it('Pauschal mit Kirchensteuer im Nachweisverfahren', () => {
    const mit = bkvModell(eingaben({ beitragMonat: 60 }), { ...steuer, kirchensteuerpflichtig: true }, p);
    expect(weg(mit, 'pauschal37b').arbeitgeber.pauschsteuerMonat).toBeCloseTo(60 * 0.3 * (1 + 0.055 + 0.09), 6);
  });

  it('Barlohn: kostet so viel wie eine Gehaltserhoehung mit gleichem Netto', () => {
    const w = weg(r, 'barlohn');
    expect(w.mitarbeiter.abzuegeMonat).toBeGreaterThan(42.67 * 0.3);
    expect(w.gehalt!.nettoMonat).toBeCloseTo(w.mitarbeiter.vorteilMonat, 1);
    expect(w.ersparnisGegenGehaltMonat).toBeLessThan(0.05);
  });

  it('Pauschal bringt beim Mitarbeiter mehr an als Barlohn, kostet aber mehr', () => {
    const pa = weg(r, 'pauschal37b');
    const ba = weg(r, 'barlohn');
    expect(pa.mitarbeiter.vorteilMonat).toBeGreaterThan(ba.mitarbeiter.vorteilMonat);
    expect(pa.arbeitgeber.nettoKostenMonat).toBeGreaterThan(ba.arbeitgeber.nettoKostenMonat);
  });

  it('Mitarbeiter zahlt selbst: keine Kosten, kein Vorteil', () => {
    const w = weg(r, 'arbeitnehmer');
    expect(w.arbeitgeber.nettoKostenMonat).toBe(0);
    expect(w.mitarbeiter.eigenanteilMonat).toBeCloseTo(42.67, 6);
    expect(w.mitarbeiter.vorteilMonat).toBeCloseTo(0, 6);
    expect(w.gehalt).toBeNull();
  });

  it('Freigrenze von anderen Sachbezuegen ausgeschoepft: Aufteilen geht nicht', () => {
    const voll = bkvModell(eingaben({ beitragMonat: 20, weitereSachbezuegeMonat: 50 }), steuer, p);
    expect(weg(voll, 'aufteilen').moeglich).toBe(false);
    expect(['pauschal37b', 'pauschal40', 'barlohn']).toContain(voll.vorauswahl);
  });
});

describe('Pauschal nach § 40 Abs. 1 S. 1 Nr. 1', () => {
  const r = bkvModell(eingaben({ beitragMonat: 42.67, weitereSachbezuegeMonat: 20 }), steuer, p);
  const w = weg(r, 'pauschal40');

  it('keine Sozialabgaben, Kosten = (Beitrag + Pauschsteuer) nach Steuern', () => {
    expect(w.moeglich).toBe(true);
    expect(w.grund).toBeUndefined();
    expect(w.arbeitgeber.abgabenMonat).toBe(0);
    expect(w.mitarbeiter.belastungMonat).toBe(0);
    expect(w.arbeitgeber.nettoKostenMonat).toBeCloseTo((42.67 + w.arbeitgeber.pauschsteuerMonat) * 0.7, 6);
  });

  it('geschaetzter Nettosteuersatz ergibt den Faktor 1,3 bis 1,5', () => {
    expect(r.pauschsatz40.geschaetzt).toBe(true);
    expect(r.pauschsatz40.satz).toBeGreaterThan(0.2);
    expect(w.faktor).toBeGreaterThan(1.2);
    expect(w.faktor).toBeLessThan(1.6);
    expect(w.arbeitgeber.pauschsteuerMonat).toBeCloseTo(42.67 * r.pauschsatz40.satz * 1.055, 6);
  });

  it('Satz vom Finanzamt wird uebernommen', () => {
    const f = bkvModell(eingaben({ beitragMonat: 42.67, pauschsatz40: 0.25 }), steuer, p);
    expect(f.pauschsatz40).toEqual({ satz: 0.25, geschaetzt: false });
    expect(weg(f, 'pauschal40').arbeitgeber.pauschsteuerMonat).toBeCloseTo(42.67 * 0.25 * 1.055, 6);
  });

  it('abgewaelzt: Arbeitgeber zahlt nur den Beitrag, Mitarbeiter die Steuer zum Bruttosatz', () => {
    const a = bkvModell(eingaben({ beitragMonat: 42.67, pauschsteuer40TraegtMitarbeiter: true }), steuer, p);
    const wa = weg(a, 'pauschal40');
    expect(wa.arbeitgeber.kostenVorSteuerMonat).toBeCloseTo(42.67, 6);
    expect(wa.arbeitgeber.pauschsteuerMonat).toBe(0);
    expect(a.pauschsatz40.satz).toBeLessThan(r.pauschsatz40.satz);
    expect(r.pauschsatz40.satz).toBeCloseTo(a.pauschsatz40.satz / (1 - a.pauschsatz40.satz), 6);
    expect(wa.mitarbeiter.abzuegeMonat).toBeCloseTo(42.67 * a.pauschsatz40.satz * 1.055, 6);
  });

  it('ueber 1.000 EUR im Jahr nicht moeglich', () => {
    const g = bkvModell(eingaben({ beitragMonat: 90 }), steuer, p);
    expect(weg(g, 'pauschal40').moeglich).toBe(false);
  });

  it('unter 20 Mitarbeitern gesperrt, mit Hinweis auf die Ausnahme', () => {
    const k = bkvModell(eingaben({ beitragMonat: 20, weitereSachbezuegeMonat: 50, anzahlMitarbeiter: 19 }), steuer, p);
    expect(weg(k, 'pauschal40').moeglich).toBe(false);
    expect(weg(k, 'pauschal40').grund).toContain('Erst ab 20');
    expect(k.vorauswahl).not.toBe('pauschal40');
    const genau20 = bkvModell(eingaben({ beitragMonat: 20, weitereSachbezuegeMonat: 50, anzahlMitarbeiter: 20 }), steuer, p);
    expect(weg(genau20, 'pauschal40').moeglich).toBe(true);
  });

  it('beim Mitarbeiter bleibt mehr als mit § 37b — keine Sozialabgaben', () => {
    expect(w.mitarbeiter.vorteilMonat).toBeGreaterThan(weg(r, 'pauschal37b').mitarbeiter.vorteilMonat);
    expect(w.hebel).toBeGreaterThan(weg(r, 'pauschal37b').hebel);
  });

  it('ab 20 Mitarbeitern im Vorschlag, wenn Aufteilen nicht geht', () => {
    const v = bkvModell(eingaben({ beitragMonat: 20, weitereSachbezuegeMonat: 50 }), steuer, p);
    expect(v.vorauswahl).toBe('pauschal40');
  });
});

describe('Randfaelle', () => {
  it('privat versichert rechnet ohne Fehler', () => {
    const r = bkvModell(eingaben({ jahresbrutto: 90_000, privatVersichert: true, pkvPraemieMonat: 600, beitragMonat: 60 }), steuer, p);
    for (const w of r.wege) expect(Number.isFinite(w.arbeitgeber.nettoKostenMonat)).toBe(true);
    expect(weg(r, 'sachbezug').gehalt).not.toBeNull();
  });

  it('ohne Beitrag gibt es keinen Vergleich', () => {
    const r = bkvModell(eingaben({ beitragMonat: 0 }), steuer, p);
    expect(weg(r, 'sachbezug').gehalt).toBeNull();
    expect(weg(r, 'sachbezug').ersparnisGegenGehaltMonat).toBe(0);
  });
});
