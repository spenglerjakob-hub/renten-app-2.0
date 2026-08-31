import { describe, it, expect } from 'vitest';
import { entnahmeRate, entnahmeplanBewerten } from '../src/products/entnahmeplaner.js';
import { projiziere } from '../src/projection/timeline.js';
import { parameterFuer } from '../src/params/registry.js';
import type { Szenario, Vertrag } from '../src/model.js';

const p = parameterFuer(2026, { indexRate: 0 });

function szenario(over: Partial<Szenario> = {}): Szenario {
  return {
    schemaVersion: 1,
    haushalt: {
      verheiratet: false, bundesland: 'Nordrhein-Westfalen', kirchensteuer: false,
      hatKinder: false, kinderUnter25: 0, kinder: [], kvStatus: 'kvdr', pkvPraemieMonat: 0,
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

function vertrag(over: Partial<Vertrag>): Vertrag {
  return {
    id: 'v1', inhaber: 'A', schicht: 3, typ: 'prvRente', name: 'Test',
    brutto: 0, strategie: 'rente', altvertrag: false,
    ...over,
  };
}

describe('Entnahmerate', () => {
  it('teilt bei Rendite gleich Dynamik schlicht auf die Monate auf', () => {
    // Der geschlossene Ausdruck hat hier eine Nullstelle im Nenner.
    const r = entnahmeRate(120_000, 10, 0.02, 0.02);
    expect(r).toBeCloseTo(120_000 / 120, 6);
  });

  it('zahlt bei Rendite ueber Dynamik mehr aus als die reine Aufteilung', () => {
    const ohneZins = 120_000 / (10 * 12);
    const mitZins = entnahmeRate(120_000, 10, 0.05, 0);
    expect(mitZins).toBeGreaterThan(ohneZins);
  });

  it('liefert 0 bei fehlendem Kapital oder fehlender Dauer', () => {
    expect(entnahmeRate(0, 10, 0.02, 0)).toBe(0);
    expect(entnahmeRate(100_000, 0, 0.02, 0)).toBe(0);
  });

  it('zehrt das Kapital ueber die Laufzeit vollstaendig auf', () => {
    // Die Formel ist eine NACHSCHUESSIGE Rente: erst verzinsen, dann entnehmen.
    const kapital = 200_000, jahre = 20, rendite = 0.03;
    const monat = entnahmeRate(kapital, jahre, rendite, 0);
    let rest = kapital;
    for (let j = 0; j < jahre; j++) rest = rest * (1 + rendite) - monat * 12;
    expect(Math.abs(rest)).toBeLessThan(kapital * 0.001);
  });
});

describe('Entnahmeplan mit Besteuerung', () => {
  it('besteuert nur den Ertragsanteil, nicht das eingesetzte Kapital', () => {
    const ohneErtrag = entnahmeplanBewerten(
      { kapital: 120_000, dauerJahre: 10, rendite: 0, dynamik: 0, kirchensteuerpflichtig: false, bundesland: 'Nordrhein-Westfalen' },
      p,
    );
    // Ohne Rendite gibt es keinen Ertrag, also auch keine Steuer.
    expect(ohneErtrag.ertragsquote).toBeCloseTo(0, 6);
    expect(ohneErtrag.steuerJahr).toBeCloseTo(0, 6);
    expect(ohneErtrag.nettoMonat).toBeCloseTo(ohneErtrag.bruttoMonat, 6);
  });

  it('mindert die Kapitalertragsteuer bei Kirchensteuerpflicht, statt sie zu erhoehen', () => {
    // Befund B7: Der Prototyp addierte die Kirchensteuer obendrauf. Nach
    // § 32d Abs. 1 S. 4/5 EStG mindert sie die Kapitalertragsteuer, die
    // Gesamtbelastung liegt also UNTER 25 % zzgl. Soli.
    const basis = { kapital: 300_000, dauerJahre: 20, rendite: 0.04, dynamik: 0, bundesland: 'Nordrhein-Westfalen' };
    const ohne = entnahmeplanBewerten({ ...basis, kirchensteuerpflichtig: false }, p);
    const mit = entnahmeplanBewerten({ ...basis, kirchensteuerpflichtig: true }, p);

    const ertragJahr = ohne.bruttoMonat * 12 * ohne.ertragsquote;
    expect(ertragJahr).toBeGreaterThan(0);

    // Mit Kirchensteuer ist die Gesamtbelastung hoeher als ohne — aber der
    // effektive Kapitalertragsteuersatz sinkt unter 25 %.
    expect(mit.steuerJahr).toBeGreaterThan(ohne.steuerJahr);
    const effektiv = mit.steuerJahr / ertragJahr;
    expect(effektiv).toBeLessThan(0.25 * 1.055 * 1.09);
  });
});

describe('Kapitalvertraege in der Zeitachse', () => {
  it('fuehrt eine bAV-Kapitalauszahlung im Zuflussjahr auf', () => {
    // Regression: Vor der Korrektur gab es fuer bavKapital keinen Zweig in
    // vertragImJahr. Der Betrag verschwand vollstaendig aus der Rechnung.
    const r = projiziere(szenario({
      vertraege: [vertrag({ id: 'bav1', schicht: 2, typ: 'bavKapital', brutto: 100_000 })],
    }));
    const zeile = r.zeilen.find((z) => z.jahr === r.ruhestandsjahr)!;
    const posten = zeile.posten.find((x) => x.id === 'bav1');

    expect(posten).toBeDefined();
    expect(posten!.bruttoJahr).toBe(100_000);
    // Voll steuerpflichtig (§ 22 Nr. 5 EStG), also faellt Steuer an.
    expect(posten!.steuerJahr).toBeGreaterThan(0);
    expect(posten!.nettoJahr).toBeLessThan(100_000);
  });

  it('haelt die KV-Beitragspflicht auf bAV-Kapital ueber 120 Monate aufrecht', () => {
    // § 229 Abs. 1 S. 3 SGB V: 1/120 gilt 10 Jahre lang als Versorgungsbezug.
    const ohne = projiziere(szenario());
    const mit = projiziere(szenario({
      vertraege: [vertrag({ id: 'bav1', schicht: 2, typ: 'bavKapital', brutto: 120_000 })],
    }));

    const kv = (r: ReturnType<typeof projiziere>, versatz: number) =>
      r.zeilen.find((z) => z.jahr === r.ruhestandsjahr + versatz)!.kvPvGesamt;

    // Im 5. Jahr nach Rentenbeginn liegt noch Beitragspflicht vor ...
    expect(kv(mit, 5)).toBeGreaterThan(kv(ohne, 5));
    // ... im 11. Jahr nicht mehr.
    expect(kv(mit, 11)).toBeCloseTo(kv(ohne, 11), 6);
  });

  it('stellt eine private Kapitalwahl nach der 12/62-Regel nur zur Haelfte ins zvE', () => {
    // Beide Vertraege haben dieselbe Beitragssumme (50 400 EUR) und damit
    // denselben Ertrag. Nur die Laufzeit unterscheidet sie:
    // 42 Jahre erfuellt die 12/62-Regel, 7 Jahre nicht.
    const lang = projiziere(szenario({
      vertraege: [vertrag({
        id: 'prv1', typ: 'prvKapital', brutto: 100_000,
        beginnJahr: 2000, monatsbeitrag: 100,
      })],
    }));
    const kurz = projiziere(szenario({
      vertraege: [vertrag({
        id: 'prv1', typ: 'prvKapital', brutto: 100_000,
        beginnJahr: 2035, monatsbeitrag: 600,
      })],
    }));

    const zve = (r: ReturnType<typeof projiziere>) =>
      r.zeilen.find((z) => z.jahr === r.ruhestandsjahr)!.posten.find((x) => x.id === 'prv1')!.zveBeitrag;

    // Ertrag = 100 000 - 50 400 = 49 600
    expect(zve(kurz)).toBeCloseTo(49_600, 0);
    expect(zve(lang)).toBeCloseTo(49_600 / 2, 0);
  });
});

describe('Auszahlungs-Planer in der Projektion', () => {
  it('meldet kein Planerergebnis ohne Kapital', () => {
    expect(projiziere(szenario()).planer).toBeNull();
  });

  it('uebertraegt Kapital aus Vertraegen mit Strategie planer', () => {
    const r = projiziere(szenario({
      vertraege: [vertrag({
        id: 'bav1', schicht: 2, typ: 'bavKapital', brutto: 100_000, strategie: 'planer',
      })],
    }));
    expect(r.planer).not.toBeNull();
    expect(r.planer!.uebertragen).toBeGreaterThan(0);
    // Netto, also weniger als das Brutto-Kapital.
    expect(r.planer!.uebertragen).toBeLessThan(100_000);
    expect(r.planer!.gesamtkapital).toBeCloseTo(r.planer!.uebertragen, 6);
  });

  it('rechnet die Entnahme nur bei gesetztem Schalter ins Netto ein', () => {
    const aus = projiziere(szenario({ planer: { startkapital: 200_000, dauerJahre: 20, rendite: 0.03, dynamik: 0, insNettoEinrechnen: false } }));
    const an = projiziere(szenario({ planer: { startkapital: 200_000, dauerJahre: 20, rendite: 0.03, dynamik: 0, insNettoEinrechnen: true } }));

    const netto = (r: ReturnType<typeof projiziere>) =>
      r.zeilen.find((z) => z.jahr === r.ruhestandsjahr)!.nettoGesamt;

    expect(an.planer!.bruttoMonat).toBeGreaterThan(0);
    expect(netto(an)).toBeGreaterThan(netto(aus));
  });

  it('beendet die Entnahme nach Ablauf der Dauer', () => {
    const r = projiziere(szenario({
      planer: { startkapital: 200_000, dauerJahre: 10, rendite: 0.03, dynamik: 0, insNettoEinrechnen: true },
    }));
    const hat = (versatz: number) =>
      r.zeilen.find((z) => z.jahr === r.ruhestandsjahr + versatz)!.posten.some((x) => x.id === 'planer');

    expect(hat(0)).toBe(true);
    expect(hat(9)).toBe(true);
    expect(hat(10)).toBe(false);
  });

  it('zaehlt ein Vertrag mit Strategie planer nicht doppelt', () => {
    // Das Brutto darf nicht zusaetzlich als laufendes Einkommen erscheinen.
    const r = projiziere(szenario({
      vertraege: [vertrag({
        id: 'bav1', schicht: 2, typ: 'bavKapital', brutto: 100_000, strategie: 'planer',
      })],
    }));
    const zeile = r.zeilen.find((z) => z.jahr === r.ruhestandsjahr)!;
    expect(zeile.posten.some((x) => x.id === 'bav1')).toBe(false);
  });
});
