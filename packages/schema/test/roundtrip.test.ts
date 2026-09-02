import { describe, it, expect } from 'vitest';
import { szenarioSchema } from '../src/szenario.js';
import { importiere, exportiere, ausLegacyFormat, annahmenKoppeln } from '../src/migration.js';

const vollstaendig = {
  schemaVersion: 1 as const,
  haushalt: { verheiratet: true, bundesland: 'Bayern', kirchensteuer: true, hatKinder: true, kinderUnter25: 2, kvStatus: 'freiwillig' as const, pkvPraemieMonat: 0, zielNettoHeute: 3200 },
  // Gekoppelt: gehaltsdynamik folgt der inflation, tarifIndex der rentendynamik.
  annahmen: { inflation: 0.025, rentendynamik: 0.015, tarifIndex: 0.015, gehaltsdynamik: 0.025 },
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

describe('Abwaertskompatibilitaet', () => {
  it('liest Dateien ohne das neue tuev-Feld ohne Warnung ein', () => {
    // Der Vertrags-TUEV kam spaeter dazu. Frueher gespeicherte Szenarien und
    // Exportdateien duerfen dadurch nicht unlesbar werden.
    const alt = JSON.stringify(vollstaendig);
    expect(JSON.parse(alt).tuev).toBeUndefined();

    const r = importiere(alt);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.szenario.tuev).toEqual([]);
    expect(r.warnungen).toEqual([]);
  });

  it('liest Dateien ohne rentenbeginnManuell ein und setzt die Marke auf false', () => {
    const r = importiere(JSON.stringify(vollstaendig));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.szenario.personen[0]!.rentenbeginnManuell).toBe(false);
  });

  it('stellt ein Depot von "ignorieren" auf "kapital" um und warnt dabei', () => {
    // Die Strategie "Nicht einrechnen" wurde beim Depot durch
    // "Kapitalauszahlung" ersetzt. Die Umstellung aendert KEINE
    // Monatsbetraege — der Vertrag war vorher wie nachher nicht im laufenden
    // Netto — es kommt nur die Angabe hinzu, was netto ausgezahlt wuerde.
    const alt = {
      ...vollstaendig,
      vertraege: [
        { id: 'd1', inhaber: 'A' as const, schicht: 3 as const, typ: 'etf' as const, name: 'Depot',
          brutto: 0, strategie: 'ignorieren' as const, altvertrag: false, kapitalHeute: 50000 },
        { id: 'v1', inhaber: 'A' as const, schicht: 2 as const, typ: 'bav' as const, name: 'bAV',
          brutto: 300, strategie: 'ignorieren' as const, altvertrag: false },
      ],
    };
    const r = importiere(JSON.stringify(alt));
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.szenario.vertraege[0]!.strategie).toBe('kapital');
    // Bei anderen Vertragsarten bleibt "ignorieren" erhalten — dort ist es
    // weiterhin nuetzlich, einen Vertrag herauszunehmen.
    expect(r.szenario.vertraege[1]!.strategie).toBe('ignorieren');
    expect(r.warnungen.join(' ')).toContain('Kapitalauszahlung');
  });

  it('laesst ein Depot mit anderer Strategie unangetastet', () => {
    const s = {
      ...vollstaendig,
      vertraege: [
        { id: 'd1', inhaber: 'A' as const, schicht: 3 as const, typ: 'etf' as const, name: 'Depot',
          brutto: 0, strategie: 'rente' as const, altvertrag: false, kapitalHeute: 50000 },
      ],
    };
    const r = importiere(JSON.stringify(s));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.szenario.vertraege[0]!.strategie).toBe('rente');
    expect(r.warnungen.join(' ')).not.toContain('Kapitalauszahlung');
  });

  it('erhaelt erfasste TUEV-Positionen ueber Export und Import', () => {
    const mitTuev = szenarioSchema.parse({
      ...vollstaendig,
      tuev: [{
        id: 't1', vertragId: 'v1', beitragMonat: 250, dynamik: 0.02,
        agZuschussMonat: 50, kinder: [{ id: 'k1', geburtsjahr: 2019 }],
        beginnJahr: 2020, lebenserwartung: 88, vergleichen: true,
      }],
    });
    const r = importiere(exportiere(mitTuev));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.szenario.tuev).toEqual(mitTuev.tuev);
  });
});

describe('Kopplung der Annahmen', () => {
  it('gleicht Gehaltsdynamik an die Inflation an und warnt dabei', () => {
    const abweichend = {
      ...vollstaendig,
      annahmen: { inflation: 0.02, rentendynamik: 0.01, tarifIndex: 0.01, gehaltsdynamik: 0.035 },
    };
    const r = importiere(JSON.stringify(abweichend));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.szenario.annahmen.gehaltsdynamik).toBe(0.02);
    expect(r.warnungen.join(' ')).toContain('Gehaltsdynamik');
  });

  it('gleicht die Steuertarif-Indexierung an die Rentendynamik an und warnt', () => {
    const abweichend = {
      ...vollstaendig,
      annahmen: { inflation: 0.02, rentendynamik: 0.015, tarifIndex: 0, gehaltsdynamik: 0.02 },
    };
    const r = importiere(JSON.stringify(abweichend));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.szenario.annahmen.tarifIndex).toBe(0.015);
    expect(r.warnungen.join(' ')).toContain('Steuertarif');
  });

  it('warnt nicht, wenn die Werte bereits gekoppelt sind', () => {
    const gekoppelt = {
      ...vollstaendig,
      annahmen: { inflation: 0.02, rentendynamik: 0.01, tarifIndex: 0.01, gehaltsdynamik: 0.02 },
    };
    const r = importiere(JSON.stringify(gekoppelt));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnungen).toEqual([]);
  });

  it('laesst den Tarif-Index in Ruhe, wenn er ausdruecklich behalten werden soll', () => {
    // Der Regler in der Rechtsstand-Karte setzt ihn bewusst abweichend.
    const s = szenarioSchema.parse({
      ...vollstaendig,
      annahmen: { inflation: 0.02, rentendynamik: 0.015, tarifIndex: 0, gehaltsdynamik: 0.035 },
    });
    const r = annahmenKoppeln(s, { tarifIndexBehalten: true });
    expect(r.annahmen.tarifIndex).toBe(0);
    expect(r.annahmen.gehaltsdynamik).toBe(0.02);
  });
});

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
    expect(r.szenario.annahmen.tarifIndex).toBe(0.015);
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
    // Die Praemie stand in der Prototyp-Datei unmittelbar im Haushalt und
    // wandert beim Laden in den PKV-Block. Ginge sie dabei verloren, saehe
    // ein PKV-Nutzer nach dem Update eine Praemie von null.
    expect(s.haushalt.pkv.praemieMonat).toBe(620);
    expect(s.haushalt.kirchensteuer).toBe(true);
    expect(s.annahmen.rentendynamik).toBeCloseTo(0.01, 6);
    // Die Prototyp-Datei trug taxIndexRate 1,5 % bei grvIncreaseRate 1,0 %.
    // Durch die Kopplung folgt der Tarif-Index jetzt der Rentendynamik. Das
    // aendert die Zahlen des Nutzers und muss deshalb gemeldet werden.
    expect(s.annahmen.tarifIndex).toBeCloseTo(0.01, 6);
    expect(r.warnungen.join(' ')).toContain('Steuertarif');
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

describe('Kinder: Umschreibung des alten Formats', () => {
  // Bis 2026 standen die Kinder als blosse Liste von Geburtsjahren im
  // Szenario, dazu EIN globaler Schalter "in Ausbildung" fuer alle zusammen.
  // Gespeicherte Dateien tragen diese Form weiter — sie muessen ohne
  // Fehlermeldung und vor allem OHNE Zahlenaenderung lesbar bleiben.
  const mitAltformat = (kinderGeburtsjahre: number[], kinderInAusbildung: boolean) =>
    szenarioSchema.parse({
      ...vollstaendig,
      haushalt: { ...vollstaendig.haushalt, kinderGeburtsjahre, kinderInAusbildung },
    }).haushalt;

  it('ohne Ausbildungsschalter bleibt das Ende bei 18', () => {
    const h = mitAltformat([2010, 2015], false);
    expect(h.kinder).toEqual([{ geburtsjahr: 2010 }, { geburtsjahr: 2015 }]);
  });

  it('mit Ausbildungsschalter bekommt JEDES Kind das damals geltende Ende', () => {
    // Der Schalter hiess "alle bis 25". Genau das wird je Kind eingetragen,
    // damit die Rechnung Zahl fuer Zahl dieselbe bleibt. Eine stille
    // Kuerzung beim Laden waere schlimmer als die zu grosszuegige Altregel.
    const h = mitAltformat([2010, 2015], true);
    expect(h.kinder).toEqual([
      { geburtsjahr: 2010, ausbildungBisJahr: 2035 },
      { geburtsjahr: 2015, ausbildungBisJahr: 2040 },
    ]);
  });

  it('die Altfelder verschwinden beim Lesen — geschrieben werden sie nie wieder', () => {
    const h = mitAltformat([2010], true) as Record<string, unknown>;
    expect(h.kinderGeburtsjahre).toBeUndefined();
    expect(h.kinderInAusbildung).toBeUndefined();
  });

  it('eine neue Datei mit kinder ignoriert die Altfelder', () => {
    const h = szenarioSchema.parse({
      ...vollstaendig,
      haushalt: {
        ...vollstaendig.haushalt,
        kinder: [{ geburtsjahr: 2018, ausbildungBisJahr: 2039 }],
        kinderGeburtsjahre: [1999],
        kinderInAusbildung: true,
      },
    }).haushalt;
    expect(h.kinder).toEqual([{ geburtsjahr: 2018, ausbildungBisJahr: 2039 }]);
  });

  it('ohne jede Kinderangabe bleibt die Liste leer — geraten wird nicht', () => {
    const h = szenarioSchema.parse(vollstaendig).haushalt;
    expect(h.kinder).toEqual([]);
  });

  it('Export und erneuter Import sind stabil', () => {
    const einmal = szenarioSchema.parse({
      ...vollstaendig,
      haushalt: { ...vollstaendig.haushalt, kinderGeburtsjahre: [2010], kinderInAusbildung: true },
    });
    const r = importiere(exportiere(einmal));
    if (!r.ok) throw new Error('fehlgeschlagen');
    expect(r.szenario.haushalt.kinder).toEqual([{ geburtsjahr: 2010, ausbildungBisJahr: 2035 }]);
  });
});
