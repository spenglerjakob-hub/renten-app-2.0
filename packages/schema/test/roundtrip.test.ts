import { describe, it, expect } from 'vitest';
import { szenarioSchema } from '../src/szenario.js';
import { importiere, exportiere, ausLegacyFormat } from '../src/migration.js';

const vollstaendig = {
  schemaVersion: 1 as const,
  haushalt: { verheiratet: true, bundesland: 'Bayern', kirchensteuer: true, hatKinder: true, kinderUnter25: 2, kvStatus: 'freiwillig' as const, pkvPraemieMonat: 0, zielNettoHeute: 3200 },
  annahmen: { inflation: 0.025, rentendynamik: 0.015, tarifIndex: 0.01, gehaltsdynamik: 0.03 },
  einkommenHeute: { modus: 'besoldung' as const, betrag: 0, auszahlungen: 12, besoldungsgruppe: 'A14', besoldungsstufe: 6, besoldungsland: 'Baden-Württemberg' },
  personen: [
    { id: 'A' as const, name: 'Anna', geburtsdatum: '1980-05-12', rentenbeginn: '2047-06-01', art: 'pension' as const, grvBruttoHeute: 0, besoldungsgruppe: 'A14', besoldungsstufe: 8, ruhegehaltssatz: 68.5, dienstbeginn: '2010-09-01', teilzeitphasen: [{ id: 't1', bezeichnung: 'Elternzeit', vonJahr: 2015, bisJahr: 2017, beschaeftigungsgrad: 0 }] },
    { id: 'B' as const, name: 'Ben', geburtsdatum: '1978-03-03', rentenbeginn: '2045-04-01', art: 'grv' as const, grvBruttoHeute: 2100, besoldungsgruppe: 'A13', besoldungsstufe: 8, ruhegehaltssatz: 71.75, dienstbeginn: '2020-01-01', teilzeitphasen: [] },
  ],
  vertraege: [
    { id: 'v1', inhaber: 'A' as const, schicht: 2 as const, typ: 'bav' as const, name: 'Allianz', brutto: 420, strategie: 'rente' as const, altvertrag: false },
    { id: 'v2', inhaber: 'B' as const, schicht: 3 as const, typ: 'etf' as const, name: 'Depot', brutto: 0, strategie: 'planer' as const, altvertrag: false, kapitalHeute: 50000, sparrate: 400, renditeAnsparphase: 0.06, ter: 0.002, entnahmedauer: 30 },
  ],
  planer: { startkapital: 25000, dauerJahre: 30, rendite: 0.025, dynamik: 0.01, insNettoEinrechnen: true },
};

describe('Szenario-Roundtrip', () => {
  it('Export -> Import ist verlustfrei', () => {
    const parsed = szenarioSchema.parse(vollstaendig);
    const r = importiere(exportiere(parsed));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.szenario).toEqual(parsed);
  });

  it('erhaelt ALLE Felder — kein stilles Verwerfen wie im Prototyp', () => {
    const parsed = szenarioSchema.parse(vollstaendig);
    const r = importiere(exportiere(parsed));
    if (!r.ok) throw new Error('Import fehlgeschlagen');

    // Genau die Felder, die der Prototyp beim Laden verlor
    expect(r.szenario.haushalt.kvStatus).toBe('freiwillig');
    expect(r.szenario.haushalt.kirchensteuer).toBe(true);
    expect(r.szenario.annahmen.tarifIndex).toBe(0.01);
    expect(r.szenario.annahmen.inflation).toBe(0.025);
    expect(r.szenario.personen[0]!.ruhegehaltssatz).toBe(68.5);
    expect(r.szenario.personen[0]!.teilzeitphasen).toHaveLength(1);
    expect(r.szenario.personen[0]!.art).toBe('pension');
    expect(r.szenario.planer.startkapital).toBe(25000);
    expect(r.szenario.planer.insNettoEinrechnen).toBe(true);
    expect(r.szenario.einkommenHeute.besoldungsgruppe).toBe('A14');
  });

  it('meldet fehlerhafte Dateien statt sie stillschweigend zu schlucken', () => {
    const r = importiere('{ kaputt');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fehler[0]).toContain('JSON');
  });

  it('weist ungueltige Werte mit Feldangabe zurueck', () => {
    const kaputt = { ...vollstaendig, personen: [{ ...vollstaendig.personen[0]!, geburtsdatum: '99.99.9999' }] };
    const r = importiere(JSON.stringify(kaputt));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fehler.join(' ')).toContain('geburtsdatum');
  });
});

describe('Migration aus dem Prototyp-Format', () => {
  const legacy = {
    isMarried: true, hasChurchTax: true, hasChildren: true, kvStatus: 'pkv', pkvPremium: 620,
    targetIncomeToday: 2800, salaryInputMode: 'brutto', salaryInputValue: 5200, salaryMultiplier: 13,
    besoldungLand: 'Hessen', besoldungGruppe: 'A12', besoldungStufe: 5,
    wageGrowthRate: 2.5, inflationRate: 2.0, taxIndexRate: 1.5,
    nameA: 'Anna', birthDateA: '12.05.1980', retDateA: '01.06.2047', pensionTypeA: 'pension',
    grvGrossA: 0, pensionEndGruppeA: 'A14', pensionEndStufeA: 8, pensionSatzA: 68.5,
    serviceStartDateA: '01.09.2010',
    pensionPeriodsA: [{ id: 1, name: 'Elternzeit', start: '01.01.2015', end: '01.01.2017', percentage: 0 }],
    nameB: 'Ben', birthDateB: '03.03.1978', retDateB: '01.04.2045', pensionTypeB: 'grv', grvGrossB: 2100,
    grvIncreaseRate: 1.0,
    contracts: [{ id: 7, layer: 2, type: 'bav', name: 'Allianz', gross: 420, owner: 'A', isOldContract: false }],
    planerCapital: 25000, planerDuration: 30, planerReturn: 2.5, planerDynamic: 1.0, includePlanerInNet: true,
  };

  it('uebernimmt die Felder, die der Prototyp selbst verworfen haette', () => {
    const r = importiere(JSON.stringify(legacy));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = r.szenario;

    expect(r.migriertVon).toBe('prototyp');
    expect(s.haushalt.kvStatus).toBe('pkv');
    expect(s.haushalt.pkvPraemieMonat).toBe(620);
    expect(s.haushalt.kirchensteuer).toBe(true);
    expect(s.annahmen.tarifIndex).toBeCloseTo(0.015, 6);
    expect(s.annahmen.rentendynamik).toBeCloseTo(0.01, 6);
    expect(s.einkommenHeute.modus).toBe('brutto');
    expect(s.einkommenHeute.auszahlungen).toBe(13);
    expect(s.personen).toHaveLength(2);
    expect(s.personen[0]!.art).toBe('pension');
    expect(s.personen[0]!.ruhegehaltssatz).toBe(68.5);
    expect(s.personen[0]!.teilzeitphasen).toHaveLength(1);
    expect(s.personen[0]!.teilzeitphasen[0]!.vonJahr).toBe(2015);
    expect(s.planer.dauerJahre).toBe(30);
    expect(s.planer.insNettoEinrechnen).toBe(true);
  });

  it('rechnet Prozentangaben in Dezimalwerte um', () => {
    const s = ausLegacyFormat(legacy) as { annahmen: { inflation: number } };
    expect(s.annahmen.inflation).toBeCloseTo(0.02, 6);
  });

  it('deutsche Datumsangaben werden akzeptiert', () => {
    const r = importiere(JSON.stringify(legacy));
    if (!r.ok) throw new Error('fehlgeschlagen');
    expect(r.szenario.personen[0]!.geburtsdatum).toBe('12.05.1980');
  });
});
