import { describe, it, expect } from 'vitest';
import { bruttoZuNetto, erwerbHaushalt } from '../src/erwerb/netto.js';
import { parameterFuer } from '../src/params/registry.js';
import { projiziere } from '../src/projection/timeline.js';
import type { Szenario } from '../src/model.js';

const p = parameterFuer(2026, { indexRate: 0 });

const opt = {
  verheiratet: true,
  bundesland: 'Baden-Württemberg',
  kirchensteuerpflichtig: false,
  kinder: { hatKinder: false, kinderUnter25: 0 },
};

const angestellt = (jahresbrutto: number) => ({ jahresbrutto, beamter: false });

describe('Erwerbseinkommen des Haushalts', () => {
  it('setzt die Beitragsbemessungsgrenze JE PERSON an', () => {
    // BEFUND: Frueher lief das gesamte Haushaltseinkommen als EINE Person
    // durch bruttoZuNetto. Die Grenzen gelten aber je Person, weshalb die
    // Sozialabgaben deutlich zu niedrig ausfielen.
    const alsEinePerson = bruttoZuNetto(120_000, opt, p);
    const alsPaar = erwerbHaushalt([angestellt(60_000), angestellt(60_000)], opt, p);

    expect(alsPaar.sv).toBeGreaterThan(alsEinePerson.sv);
    // Gemessene Groessenordnung: rund 7 500 EUR im Jahr, also gut 600 im Monat.
    const unterschied = alsPaar.sv - alsEinePerson.sv;
    expect(unterschied).toBeGreaterThan(6_000);
    expect(unterschied).toBeLessThan(9_000);
  });

  it('weist deshalb ein NIEDRIGERES Netto aus als die alte Rechnung', () => {
    const alt = bruttoZuNetto(120_000, opt, p);
    const neu = erwerbHaushalt([angestellt(60_000), angestellt(60_000)], opt, p);
    expect(neu.jahresnetto).toBeLessThan(alt.jahresnetto);
  });

  it('bleibt bei EINER Person identisch zu bruttoZuNetto', () => {
    const einzeln = bruttoZuNetto(60_000, { ...opt, verheiratet: false }, p);
    const ueberHaushalt = erwerbHaushalt([angestellt(60_000)], { ...opt, verheiratet: false }, p);

    expect(ueberHaushalt.sv).toBeCloseTo(einzeln.sv, 6);
    expect(ueberHaushalt.zve).toBeCloseTo(einzeln.zve, 6);
    expect(ueberHaushalt.est).toBeCloseTo(einzeln.est, 6);
    expect(ueberHaushalt.jahresnetto).toBeCloseTo(einzeln.jahresnetto, 6);
  });

  it('besteuert EINMAL gemeinsam, nicht zweimal einzeln', () => {
    // Splitting auf das gemeinsame zvE. Zwei Einzelveranlagungen ergaeben
    // wegen der Progression ein anderes Ergebnis.
    const paar = erwerbHaushalt([angestellt(90_000), angestellt(30_000)], opt, p);
    const zweiEinzeln =
      bruttoZuNetto(90_000, { ...opt, verheiratet: false }, p).est +
      bruttoZuNetto(30_000, { ...opt, verheiratet: false }, p).est;

    expect(paar.est).toBeLessThan(zweiEinzeln);
  });

  it('summiert Brutto und Sozialabgaben ueber alle Personen', () => {
    const r = erwerbHaushalt([angestellt(50_000), angestellt(70_000)], opt, p);
    expect(r.jahresbrutto).toBe(120_000);
    expect(r.proPerson).toHaveLength(2);
    expect(r.sv).toBeCloseTo(r.proPerson[0]!.sv + r.proPerson[1]!.sv, 6);
    expect(r.zve).toBeCloseTo(r.proPerson[0]!.zveBeitrag + r.proPerson[1]!.zveBeitrag, 6);
  });

  it('rechnet ein gemischtes Paar aus Beamter und Angestellter richtig', () => {
    const gemischt = erwerbHaushalt(
      [{ jahresbrutto: 60_000, beamter: true, pkvPraemieMonat: 400 }, angestellt(60_000)],
      opt, p,
    );

    // Die verbeamtete Person zahlt keine RV/AV, sondern die PKV-Praemie.
    expect(gemischt.proPerson[0]!.sv).toBeCloseTo(400 * 12, 6);
    // Die angestellte Person zahlt deutlich mehr.
    expect(gemischt.proPerson[1]!.sv).toBeGreaterThan(gemischt.proPerson[0]!.sv);

    // Gegenprobe: zwei Angestellte zahlen zusammen mehr Sozialabgaben.
    const beideAngestellt = erwerbHaushalt([angestellt(60_000), angestellt(60_000)], opt, p);
    expect(beideAngestellt.sv).toBeGreaterThan(gemischt.sv);
  });

  it('kommt mit einem Alleinverdiener-Paar zurecht', () => {
    const r = erwerbHaushalt([angestellt(120_000), angestellt(0)], opt, p);
    expect(r.proPerson[1]!.sv).toBe(0);
    // Nur ein Einkommen -> nur eine Beitragsbemessungsgrenze wirkt.
    expect(r.sv).toBeCloseTo(bruttoZuNetto(120_000, opt, p).sv, 6);
  });

  it('liefert bei leerer Liste Nullwerte statt NaN', () => {
    const r = erwerbHaushalt([], opt, p);
    expect(r.jahresbrutto).toBe(0);
    expect(r.sv).toBe(0);
    expect(r.jahresnetto).toBe(0);
  });
});

describe('Erwerbseinkommen in der Projektion', () => {
  const basis = (over: Partial<Szenario> = {}): Szenario => ({
    schemaVersion: 1,
    haushalt: {
      verheiratet: true, bundesland: 'Baden-Württemberg', kirchensteuer: false,
      hatKinder: false, kinderUnter25: 0, kvStatus: 'kvdr', pkvPraemieMonat: 0,
      zielNettoHeute: 3000,
    },
    annahmen: { inflation: 0.02, rentendynamik: 0.01, tarifIndex: 0.01, gehaltsdynamik: 0.02 },
    einkommenHeute: {
      modus: 'brutto', betrag: 10_000, auszahlungen: 12,
      besoldungsgruppe: 'A13', besoldungsstufe: 4, besoldungsland: 'Baden-Württemberg',
    },
    personen: [
      { id: 'A', name: 'A', geburtsdatum: '1975-01-01', rentenbeginn: '2042-01-01',
        art: 'grv', grvBruttoHeute: 1500, besoldungsgruppe: 'A13', besoldungsstufe: 8,
        ruhegehaltssatz: 71.75, dienstbeginn: '2000-01-01', teilzeitphasen: [] },
      { id: 'B', name: 'B', geburtsdatum: '1980-01-01', rentenbeginn: '2047-01-01',
        art: 'grv', grvBruttoHeute: 1200, besoldungsgruppe: 'A13', besoldungsstufe: 8,
        ruhegehaltssatz: 71.75, dienstbeginn: '2005-01-01', teilzeitphasen: [] },
    ],
    vertraege: [],
    planer: { startkapital: 0, dauerJahre: 25, rendite: 0.02, dynamik: 0, insNettoEinrechnen: false },
    ...over,
  });

  const erwerbIm = (s: Szenario, jahr: number) =>
    projiziere(s).zeilen.find((z) => z.jahr === jahr)!.posten.find((x) => x.id === 'erwerb');

  it('teilt das Haushaltseinkommen auch pauschal auf zwei Personen auf', () => {
    // 120 000 EUR als EINE Person ergaeben zu niedrige Sozialabgaben.
    const jetzt = new Date().getFullYear();
    const e = erwerbIm(basis(), jetzt)!;
    const alsEinePerson = bruttoZuNetto(120_000, { ...opt, verheiratet: true }, parameterFuer(jetzt, { indexRate: 0.01 }));
    expect(e.kvPvJahr).toBeGreaterThan(alsEinePerson.sv);
  });

  it('laesst bei getrennten Einkommen nur das Einkommen der Person wegfallen, die in Rente geht', () => {
    const s = basis({
      einkommenGetrennt: true,
      einkommenHeute: {
        modus: 'brutto', betrag: 8_000, auszahlungen: 12,
        besoldungsgruppe: 'A13', besoldungsstufe: 4, besoldungsland: 'Baden-Württemberg',
      },
      einkommenPartner: {
        modus: 'brutto', betrag: 2_000, auszahlungen: 12,
        besoldungsgruppe: 'A13', besoldungsstufe: 4, besoldungsland: 'Baden-Württemberg',
      },
    });

    // A geht 2042 in Rente, B erst 2047. Ab 2042 bleibt NUR das kleine
    // Einkommen von B uebrig — nicht die Haelfte des Haushalts.
    const vorher = erwerbIm(s, 2041)!;
    const nachher = erwerbIm(s, 2042)!;
    expect(nachher.bruttoJahr).toBeLessThan(vorher.bruttoJahr * 0.35);
  });

  it('halbiert bei pauschaler Erfassung dagegen nur nach Koepfen', () => {
    const s = basis();
    const vorher = erwerbIm(s, 2041)!;
    const nachher = erwerbIm(s, 2042)!;
    expect(nachher.bruttoJahr / vorher.bruttoJahr).toBeCloseTo(0.5 * 1.02, 2);
  });

  it('rechnet ein gemischtes Paar aus Beamter und Angestellter', () => {
    const s = basis({
      einkommenGetrennt: true,
      einkommenHeute: {
        modus: 'besoldung', betrag: 0, auszahlungen: 12,
        besoldungsgruppe: 'A13', besoldungsstufe: 8, besoldungsland: 'Baden-Württemberg',
      },
      einkommenPartner: {
        modus: 'brutto', betrag: 5_000, auszahlungen: 12,
        besoldungsgruppe: 'A13', besoldungsstufe: 4, besoldungsland: 'Baden-Württemberg',
      },
    });
    const e = erwerbIm(s, new Date().getFullYear())!;
    expect(e.bruttoJahr).toBeGreaterThan(0);
    expect(e.nettoJahr).toBeGreaterThan(0);
    expect(e.nettoJahr).toBeLessThan(e.bruttoJahr);
  });
});
