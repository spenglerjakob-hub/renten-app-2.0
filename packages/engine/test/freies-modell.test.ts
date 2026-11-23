import { describe, it, expect } from 'vitest';
import {
  freiesModell, freiStaffel, freiVollAusschoepfen, freiStufe, freiStufenGeordnet, freiRegelMonat, freiHoechstMonat,
  zuschussModell, festbetragModell, type FreiEingaben, type FreiStufe,
} from '../src/analyse/matching-modell.js';
import {
  bavMitarbeiter, bavRahmenVoll, bavSteuerRahmenVoll, type FirmenModell, type MitarbeiterEingaben,
} from '../src/analyse/bav-mitarbeiter.js';
import { betriebsCheck, type BetriebsModell } from '../src/analyse/betriebs-check.js';
import { parameterFuer } from '../src/params/registry.js';

const p = parameterFuer(2026, { indexRate: 0 });
const steuer = { verheiratet: false, bundesland: 'Nordrhein-Westfalen', kirchensteuerpflichtig: false };
const svGrenze = (0.04 * p.bbgRvJahr) / 12;
const ohneKinder = { hatKinder: false, kinderUnter25: 0 };

/** Das Beispiel des Auftrags: ab 50 € Umwandlung 25 € fest, ab 70 € 30 € — und dazu 20 % auf die ganze Umwandlung. */
const STUFEN: FreiStufe[] = [{ abMonat: 50, betragMonat: 25 }, { abMonat: 70, betragMonat: 30 }];
const OHNE_DECKEL = Number.POSITIVE_INFINITY;

const e = (over: Partial<FreiEingaben> = {}): FreiEingaben => ({
  jahresbrutto: 48_000, umwandlungMonat: 100, unternehmensSteuersatz: 0.3, umlagenSatz: 0,
  privatVersichert: false, pkvPraemieMonat: 0, kinder: ohneKinder,
  quote: 0.2, deckelMonat: OHNE_DECKEL, stufen: STUFEN,
  ...over,
});
const zuschuss = (umwandlungMonat: number, over: Partial<FreiEingaben> = {}) =>
  freiesModell(e({ umwandlungMonat, ...over }), steuer, p).arbeitgeber.zuschussMonat;

describe('Individuelles Modell — Stufen fester Zuschüsse und ein Anteil der Umwandlung', () => {
  it('das Beispiel: unter 50 € nur die 20 %, ab 50 € 25 € dazu, ab 70 € 30 €', () => {
    expect(zuschuss(40)).toBeCloseTo(8, 6);
    expect(zuschuss(50)).toBeCloseTo(25 + 10, 6);
    expect(zuschuss(69.99)).toBeCloseTo(25 + 13.998, 6);
    expect(zuschuss(70)).toBeCloseTo(30 + 14, 6);
    expect(zuschuss(200)).toBeCloseTo(30 + 40, 6);
  });

  it('es gilt die höchste erreichte Stufe, nicht die Summe der erreichten', () => {
    const r = freiesModell(e({ umwandlungMonat: 100 }), steuer, p);
    expect(r.stufe).toEqual({ abMonat: 70, betragMonat: 30 });
    expect(r.festMonat).toBe(30);
    expect(r.anteilMonat).toBeCloseTo(20, 9);
    expect(r.naechsteStufe).toBeNull();
    expect(r.vertragMonat).toBeCloseTo(100 + 50, 6);
  });

  it('nennt die nächste Stufe, solange es eine gibt', () => {
    expect(freiesModell(e({ umwandlungMonat: 40 }), steuer, p)).toMatchObject({ stufe: null, naechsteStufe: { abMonat: 50, betragMonat: 25 } });
    expect(freiesModell(e({ umwandlungMonat: 60 }), steuer, p)).toMatchObject({
      stufe: { abMonat: 50, betragMonat: 25 }, naechsteStufe: { abMonat: 70, betragMonat: 30 },
    });
  });

  it('der gesetzliche Zuschuss ist enthalten, nicht obendrauf', () => {
    const r = freiesModell(e({ umwandlungMonat: 100 }), steuer, p);
    expect(r.arbeitgeber.davonPflichtzuschussMonat).toBeCloseTo(15, 2);
    expect(r.arbeitgeber.freiwilligMonat).toBeCloseTo(50 - 15, 2);
    expect(r.hinweise.join(' ')).not.toMatch(/Pflichtzuschuss \(15 %\)/);
  });
});

describe('Individuelles Modell — die Sonderfälle sind die bekannten Modelle', () => {
  const basis = { jahresbrutto: 48_000, umwandlungMonat: 150, unternehmensSteuersatz: 0.3, umlagenSatz: 0.02, privatVersichert: false, pkvPraemieMonat: 0, kinder: ohneKinder };

  it('ohne Stufen: das Zuschussmodell', () => {
    const frei = freiesModell({ ...basis, quote: 0.5, deckelMonat: 100, stufen: [] }, steuer, p);
    const z = zuschussModell({ ...basis, quote: 0.5, deckelMonat: 100 }, steuer, p);
    expect(frei.arbeitgeber).toEqual(z.arbeitgeber);
    expect(frei.mitarbeiter).toEqual(z.mitarbeiter);
    expect(frei.vertragMonat).toBe(z.vertragMonat);
  });

  it('eine Stufe, kein Anteil: das Festbetragsmodell', () => {
    for (const u of [30, 50, 150, 400]) {
      const frei = freiesModell({ ...basis, umwandlungMonat: u, quote: 0, deckelMonat: OHNE_DECKEL, stufen: [{ abMonat: 50, betragMonat: 50 }] }, steuer, p);
      const f = festbetragModell({ ...basis, umwandlungMonat: u, festbetragMonat: 50, mindestUmwandlungMonat: 50 }, steuer, p);
      expect(frei.arbeitgeber).toEqual(f.arbeitgeber);
      expect(frei.mitarbeiter).toEqual(f.mitarbeiter);
    }
  });

  it('ohne Vorbelegung, ohne Regel: nur der gesetzliche Zuschuss — mit Hinweis', () => {
    const r = freiesModell(e({ quote: 0, stufen: [] }), steuer, p);
    expect(r.arbeitgeber.zuschussMonat).toBeCloseTo(15, 2);
    expect(r.arbeitgeber.freiwilligMonat).toBeCloseTo(0, 6);
    expect(r.hinweise[0]).toMatch(/Nach Ihrer Regel gibt es bei dieser Umwandlung keinen Zuschuss/);
  });
});

describe('Individuelles Modell — Grenzen der Regel', () => {
  it('liegt die Regel unter dem gesetzlichen Zuschuss, wird er gezahlt', () => {
    const r = freiesModell(e({ umwandlungMonat: 200, quote: 0, stufen: [{ abMonat: 50, betragMonat: 5 }] }), steuer, p);
    expect(r.arbeitgeber.zuschussMonat).toBeCloseTo(30, 2);
    expect(r.festMonat).toBe(5);
    expect(r.hinweise.some((h) => /gesetzliche Pflichtzuschuss \(15 %\) mit 30 € über dem Zuschuss nach Ihrer Regel \(5 €\)/.test(h))).toBe(true);
  });

  it('der Deckel gilt nur für den Anteil — der feste Betrag kommt dazu', () => {
    const r = freiesModell(e({ umwandlungMonat: 300, quote: 0.5, deckelMonat: 60 }), steuer, p);
    expect(r.anteilMonat).toBe(60);
    expect(r.arbeitgeber.zuschussMonat).toBeCloseTo(90, 6);
    expect(r.gedeckelt).toBe(true);
    expect(freiesModell(e({ umwandlungMonat: 100, quote: 0.5, deckelMonat: 60 }), steuer, p).gedeckelt).toBe(false);
  });

  it('eine höhere Stufe mit kleinerem Betrag: gerechnet wie eingetragen, mit Hinweis', () => {
    const stufen = [{ abMonat: 50, betragMonat: 30 }, { abMonat: 100, betragMonat: 20 }];
    const r = freiesModell(e({ umwandlungMonat: 120, quote: 0, stufen }), steuer, p);
    expect(r.arbeitgeber.zuschussMonat).toBeCloseTo(20, 6);
    expect(r.hinweise.some((h) => /Die Stufe ab 100 € gibt weniger als die Stufe davor/.test(h))).toBe(true);
  });
});

describe('Stufen lesen', () => {
  it('ordnet nach der Schwelle; bei gleicher Schwelle gilt die spätere; Unsinn fällt weg', () => {
    expect(freiStufenGeordnet([
      { abMonat: 70, betragMonat: 30 }, { abMonat: 50, betragMonat: 20 }, { abMonat: 50, betragMonat: 25 },
      { abMonat: -10, betragMonat: 5 }, { abMonat: Number.NaN, betragMonat: 9 }, { abMonat: 90, betragMonat: -4 },
    ])).toEqual([{ abMonat: 0, betragMonat: 5 }, { abMonat: 50, betragMonat: 25 }, { abMonat: 70, betragMonat: 30 }, { abMonat: 90, betragMonat: 0 }]);
  });

  it('die geltende Stufe — auf den Cent an der Schwelle', () => {
    expect(freiStufe(STUFEN, 49.99)).toBeNull();
    expect(freiStufe(STUFEN, 49.996)?.betragMonat).toBe(25);
    expect(freiStufe(STUFEN, 50)?.betragMonat).toBe(25);
    expect(freiStufe(STUFEN, 1000)?.betragMonat).toBe(30);
    expect(freiStufe(STUFEN, 0)).toBeNull();
    expect(freiStufe([{ abMonat: 0, betragMonat: 10 }], 0)).toBeNull();
    expect(freiStufe([{ abMonat: 0, betragMonat: 10 }], 1)?.betragMonat).toBe(10);
  });

  it('Regel und Höchstbetrag', () => {
    expect(freiRegelMonat({ quote: 0.2, deckelMonat: OHNE_DECKEL, stufen: STUFEN }, 70)).toEqual({ festMonat: 30, anteilMonat: 14, gesamtMonat: 44 });
    expect(freiHoechstMonat({ quote: 0.2, deckelMonat: 80, stufen: STUFEN })).toBe(110);
    expect(freiHoechstMonat({ quote: 0, deckelMonat: 80, stufen: STUFEN })).toBe(30);
    expect(freiHoechstMonat({ quote: 0.2, deckelMonat: OHNE_DECKEL, stufen: STUFEN })).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('Rahmen und Staffel', () => {
  it('voll ausgeschöpft: Umwandlung und Zuschuss füllen 4 % der Beitragsbemessungsgrenze', () => {
    const voll = freiVollAusschoepfen(e(), steuer.bundesland, p);
    const r = freiesModell(e({ umwandlungMonat: voll }), steuer, p);
    expect(r.vertragMonat).toBeLessThanOrEqual(svGrenze + 0.005);
    expect(r.vertragMonat).toBeGreaterThan(svGrenze - 0.05);
    expect(r.mitarbeiter.svPflichtigMonat).toBeCloseTo(0, 2);
    // 1,2 · u + 30 = Grenze
    expect(voll).toBeCloseTo(Math.floor(((svGrenze - 30) / 1.2) * 100) / 100, 2);
  });

  it('die Staffel zeigt jede Schwelle und den vollen Rahmen', () => {
    const s = freiStaffel(e(), steuer, p);
    expect(s.map((z) => z.umwandlungMonat)).toEqual([...s.map((z) => z.umwandlungMonat)].sort((a, b) => a - b));
    expect(s.filter((z) => z.schwelle).map((z) => [z.umwandlungMonat, z.festMonat])).toEqual([[50, 25], [70, 30]]);
    expect(s.filter((z) => z.voll)).toHaveLength(1);
    expect(s.find((z) => z.umwandlungMonat === 100)).toMatchObject({ festMonat: 30, anteilMonat: 20, zuschussMonat: 50, vertragMonat: 150 });
    expect(s.length).toBeLessThanOrEqual(10);
  });

  it('auch mit zehn Stufen höchstens zehn Zeilen — die Schwellen gehen vor', () => {
    const stufen = Array.from({ length: 10 }, (_, i) => ({ abMonat: 30 + i * 20, betragMonat: 10 + i * 5 }));
    const s = freiStaffel(e({ stufen }), steuer, p);
    expect(s).toHaveLength(10);
    expect(s.filter((z) => z.schwelle).length).toBeGreaterThanOrEqual(9);
  });
});

describe('Individuelles Modell in Mitarbeiterberatung und Betriebs-Check', () => {
  const FREI: FirmenModell = { art: 'frei', quote: 0.2, deckelMonat: 0, stufen: STUFEN };
  const ma = (over: Partial<MitarbeiterEingaben> = {}): MitarbeiterEingaben => ({
    jahresbrutto: 48_000, umwandlungMonat: 100, privatVersichert: false, pkvPraemieMonat: 0, kinder: ohneKinder, bavBestandMonat: 0, ...over,
  });

  it('der Mitarbeiter sieht dieselben Zahlen wie die Arbeitgeber-Seite; Deckel 0 heißt ohne Deckel', () => {
    const r = bavMitarbeiter(FREI, ma(), steuer, p);
    const seite = freiesModell(e({ umwandlungMonat: 100 }), steuer, p);
    expect(r.arbeitgeberMonat).toBeCloseTo(50, 6);
    expect(r.nettoAufwandMonat).toBeCloseTo(seite.mitarbeiter.nettoAufwandMonat, 9);
    expect(r.gesamtMonat).toBeCloseTo(150, 6);
    expect(r.vertraege).toEqual([{ weg: 'direkt', beitragMonat: r.gesamtMonat, arbeitgeberMonat: r.arbeitgeberMonat }]);
    expect(r.mindestzuschuss).toMatchObject({ aufgestockt: false });
    expect(r.mindestzuschuss?.regelMonat).toBeCloseTo(50, 6);
  });

  it('Hinweis im Gespräch: was die nächste Stufe bringt', () => {
    expect(bavMitarbeiter(FREI, ma({ umwandlungMonat: 40 }), steuer, p).hinweise)
      .toContain('Ab 50 € Umwandlung im Monat gibt Ihr Arbeitgeber 25 € fest dazu.');
    expect(bavMitarbeiter(FREI, ma({ umwandlungMonat: 60 }), steuer, p).hinweise)
      .toContain('Ab 70 € Umwandlung im Monat gibt Ihr Arbeitgeber 30 € fest dazu statt 25 €.');
    expect(bavMitarbeiter(FREI, ma({ umwandlungMonat: 80 }), steuer, p).hinweise.join(' ')).not.toMatch(/fest dazu/);
  });

  it('unter dem gesetzlichen Zuschuss wird aufgestockt', () => {
    const r = bavMitarbeiter({ art: 'frei', quote: 0, deckelMonat: 0, stufen: [{ abMonat: 100, betragMonat: 20 }] }, ma({ umwandlungMonat: 80 }), steuer, p);
    expect(r.arbeitgeberMonat).toBeCloseTo(12, 2);
    expect(r.mindestzuschuss).toMatchObject({ aufgestockt: true, regelMonat: 0 });
  });

  it('Rahmen: beitragsfrei bis 4 %, steuerfrei bis 8 % — mit Umwandlung und Arbeitgeberbeitrag zusammen', () => {
    const rahmen = bavRahmenVoll(FREI, ma(), steuer.bundesland, p);
    expect(rahmen).toBeCloseTo(freiVollAusschoepfen(e(), steuer.bundesland, p), 2);
    const steuerRahmen = bavSteuerRahmenVoll(FREI, ma(), steuer.bundesland, p);
    expect(bavMitarbeiter(FREI, ma({ umwandlungMonat: steuerRahmen }), steuer, p).gesamtMonat).toBeCloseTo(2 * svGrenze, 1);
  });

  it('Betriebs-Check: je Kopf die Zahlen der Seite', () => {
    const modell: BetriebsModell = { art: 'frei', quote: 0.2, deckelMonat: 0, stufen: STUFEN };
    const r = betriebsCheck({
      gruppen: [{ name: 'Alle', anzahl: 10, jahresbrutto: 48_000 }], modell, umwandlungMonat: 100, quoten: [1],
      vl: { betragMonat: 0, anzahl: 0 }, unternehmensSteuersatz: 0.3, umlagenSatz: 0,
    }, steuer, p);
    const seite = freiesModell(e({ umwandlungMonat: 100 }), steuer, p);
    const k = r.gruppen[0]!.kopf;
    expect(k.agBeitragMonat).toBeCloseTo(50, 6);
    expect(k.agNettoMonat).toBeCloseTo(seite.arbeitgeber.nettoKostenMonat, 9);
    expect(r.szenarien[0]!.agNettoJahr).toBeCloseTo(seite.arbeitgeber.nettoKostenMonat * 12 * 10, 4);
  });
});
