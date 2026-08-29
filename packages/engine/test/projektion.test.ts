import { describe, it, expect } from 'vitest';
import { projiziere } from '../src/projection/timeline.js';
import type { Szenario } from '../src/model.js';

function szenario(over: Partial<Szenario> = {}): Szenario {
  return {
    schemaVersion: 1,
    haushalt: {
      verheiratet: false, bundesland: 'Nordrhein-Westfalen', kirchensteuer: false,
      hatKinder: false, kinderUnter25: 0, kinderGeburtsjahre: [], kinderInAusbildung: false, kvStatus: 'kvdr', pkvPraemieMonat: 0,
      zielNettoHeute: 2000,
    },
    annahmen: { inflation: 0.02, rentendynamik: 0.02, tarifIndex: 0.02, gehaltsdynamik: 0.02 },
    einkommenHeute: {
      modus: 'brutto', betrag: 4500, auszahlungen: 12,
      besoldungsgruppe: 'A13', besoldungsstufe: 4, besoldungsland: 'Bund',
    },
    personen: [{
      id: 'A', name: 'Test', geburtsdatum: '1975-01-01', rentenbeginn: '2042-01-01',
      art: 'grv', grvBruttoHeute: 1800,
      besoldungsgruppe: 'A13', besoldungsstufe: 8, ruhegehaltssatz: 71.75,
      dienstbeginn: '2000-01-01', teilzeitphasen: [],
    }],
    vertraege: [],
    planer: { startkapital: 0, dauerJahre: 25, rendite: 0.02, dynamik: 0, insNettoEinrechnen: false },
    ...over,
  };
}

describe('Projektion', () => {
  it('liefert eine Zeile je Kalenderjahr bis Alter 100', () => {
    const r = projiziere(szenario());
    expect(r.zeilen.length).toBeGreaterThanOrEqual(50);
    const jahre = r.zeilen.map((z) => z.jahr);
    expect(new Set(jahre).size).toBe(jahre.length);
  });

  it('friert den Rentenfreibetrag als EURO-Betrag ein', () => {
    const r = projiziere(szenario());
    expect(r.freibetraege).toHaveLength(1);
    const fb = r.freibetraege[0]!;
    expect(fb.art).toBe('rente');
    expect(fb.wert.jahresbetrag).toBeGreaterThan(0);
    // Rentenbeginn 2042 -> Besteuerungsanteil 92 %
    expect(fb.wert.besteuerungsanteil).toBeCloseTo(0.82 + (2042 - 2022) * 0.005, 6);
  });

  it('KERNKORREKTUR: das Netto waechst langsamer als das Brutto', () => {
    // Weil der Freibetrag nominal eingefroren bleibt, steigt der
    // steuerpflichtige Anteil jedes Jahr. Der Prototyp liess das Netto mit
    // derselben Rate wachsen wie das Brutto und ueberschaetzte spaetere
    // Jahre dadurch deutlich (Befund B1).
    const r = projiziere(szenario());
    const ruhestand = r.zeilen.filter((z) => z.vollstaendigImRuhestand && z.bruttoGesamt > 0);
    expect(ruhestand.length).toBeGreaterThan(20);

    const erst = ruhestand[0]!;
    const spaet = ruhestand[20]!;

    const bruttoWachstum = spaet.bruttoGesamt / erst.bruttoGesamt;
    const nettoWachstum = spaet.nettoGesamt / erst.nettoGesamt;

    expect(nettoWachstum).toBeLessThan(bruttoWachstum);
  });

  it('die Steuerquote steigt im Ruhestand an', () => {
    const r = projiziere(szenario());
    const ruhestand = r.zeilen.filter((z) => z.vollstaendigImRuhestand && z.bruttoGesamt > 0);
    const quote = (z: (typeof ruhestand)[number]) => z.steuerGesamt / z.bruttoGesamt;
    expect(quote(ruhestand[20]!)).toBeGreaterThan(quote(ruhestand[0]!));
  });

  it('weist fortgeschriebene Jahre als solche aus', () => {
    const r = projiziere(szenario());
    expect(r.rechtsstand.fortgeschriebenAb).toBe(2027);
    expect(r.rechtsstand.text).toContain('fortgeschrieben');
    expect(r.zeilen.some((z) => z.parameterFortgeschrieben)).toBe(true);
  });

  it('bildet die gemischte Phase ab, wenn Partner zu verschiedenen Zeiten in Rente gehen', () => {
    const s = szenario({
      haushalt: { ...szenario().haushalt, verheiratet: true },
      personen: [
        { ...szenario().personen[0]!, id: 'A', rentenbeginn: '2042-01-01' },
        { ...szenario().personen[0]!, id: 'B', name: 'Partner', geburtsdatum: '1980-01-01', rentenbeginn: '2047-01-01' },
      ],
    });
    const r = projiziere(s);
    const gemischt = r.zeilen.filter((z) => z.gemischtePhase);
    // 2042 bis 2046: A bezieht Rente, B arbeitet noch
    expect(gemischt.length).toBe(5);
    expect(gemischt[0]!.jahr).toBe(2042);
    // In dieser Phase gibt es sowohl Erwerbseinkommen als auch Rente
    const z = gemischt[0]!;
    expect(z.posten.some((x) => x.id === 'erwerb')).toBe(true);
    expect(z.posten.some((x) => x.id === 'person-A')).toBe(true);
  });

  it('Steuer und KV/PV summieren sich exakt auf die Postensumme', () => {
    const r = projiziere(szenario());
    for (const z of r.zeilen) {
      const netto = z.posten.reduce((s, x) => s + x.nettoJahr, 0);
      expect(z.nettoGesamt).toBeCloseTo(netto, 6);
      const brutto = z.posten.reduce((s, x) => s + x.bruttoJahr, 0);
      expect(z.bruttoGesamt).toBeCloseTo(brutto, 6);
    }
  });

  it('ist unabhaengig von der Reihenfolge der Vertraege', () => {
    const v = [
      { id: 'v1', inhaber: 'A' as const, schicht: 2 as const, typ: 'bav' as const, name: 'bAV', brutto: 300, strategie: 'rente' as const, altvertrag: false },
      { id: 'v2', inhaber: 'A' as const, schicht: 3 as const, typ: 'prvRente' as const, name: 'Privat', brutto: 200, strategie: 'rente' as const, altvertrag: false },
      { id: 'v3', inhaber: 'A' as const, schicht: 1 as const, typ: 'basis' as const, name: 'Ruerup', brutto: 250, strategie: 'rente' as const, altvertrag: false },
    ];
    const a = projiziere(szenario({ vertraege: v }));
    const b = projiziere(szenario({ vertraege: [...v].reverse() }));
    const jahrA = a.zeilen.find((z) => z.jahr === 2045)!;
    const jahrB = b.zeilen.find((z) => z.jahr === 2045)!;
    expect(jahrB.nettoGesamt).toBeCloseTo(jahrA.nettoGesamt, 6);
    expect(jahrB.steuerGesamt).toBeCloseTo(jahrA.steuerGesamt, 6);
  });

  it('meldet ungueltige Datumsangaben statt NaN zu produzieren', () => {
    const r = projiziere(szenario({
      personen: [{ ...szenario().personen[0]!, geburtsdatum: '99.99.9999' }],
    }));
    expect(r.zeilen).toHaveLength(0);
    expect(r.hinweise[0]).toContain('gueltiges');
  });
});
