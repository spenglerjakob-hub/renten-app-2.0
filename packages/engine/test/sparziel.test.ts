import { describe, it, expect } from 'vitest';
import {
  versorgungsluecke, benoetigtesKapital, benoetigteSparrate, sparrateZuRente,
} from '../src/analyse/sparziel.js';
import { entnahmeplanBewerten, entnahmeRate } from '../src/products/entnahmeplaner.js';
import { parameterFuer } from '../src/params/registry.js';
import type { Jahreszeile } from '../src/projection/timeline.js';

const p = parameterFuer(2026, { indexRate: 0 });
const opt = { kirchensteuerpflichtig: false, bundesland: 'Nordrhein-Westfalen' };

const zeile = (netto: number, ziel: number): Jahreszeile => ({
  jahr: 2060, alterA: 67, alterB: null,
  vollstaendigImRuhestand: true, gemischtePhase: false,
  bruttoGesamt: 0, kvPvGesamt: 0, steuerGesamt: 0, nettoGesamt: netto * 12,
  nettoMonat: netto, zielNettoMonat: ziel, kaufkraftfaktor: 2,
  zve: 0, durchschnittssatz: 0, grenzsatz: 0,
  posten: [], parameterFortgeschrieben: false,
});

describe('Versorgungsluecke', () => {
  it('ist der Fehlbetrag, nie ein Ueberschuss', () => {
    expect(versorgungsluecke(zeile(2000, 3000))).toBe(1000);
    expect(versorgungsluecke(zeile(3000, 2000))).toBe(0);
  });
});

describe('Benoetigte Sparrate', () => {
  it('trifft ohne Dynamik dieselbe Rate wie eine Jahresschleife', () => {
    // Gegenprobe mit der Vorwaertsrechnung: Beitraege unterjaehrig angelegt,
    // also mit einem halben Jahr verzinst.
    const jahre = 20, rendite = 0.05;
    const r = benoetigteSparrate({ zielkapital: 300_000, jahre, rendite, dynamik: 0 });

    let kapital = 0;
    for (let j = 0; j < jahre; j++) {
      kapital += r.startbeitrag * 12 * Math.pow(1 + rendite, jahre - j - 0.5);
    }
    expect(kapital).toBeCloseTo(300_000, 2);
  });

  it('trifft MIT Dynamik ebenfalls das Zielkapital', () => {
    const jahre = 25, rendite = 0.05, dynamik = 0.03;
    const r = benoetigteSparrate({ zielkapital: 500_000, jahre, rendite, dynamik });

    let kapital = 0;
    for (let j = 0; j < jahre; j++) {
      kapital += r.startbeitrag * 12 * Math.pow(1 + dynamik, j) * Math.pow(1 + rendite, jahre - j - 0.5);
    }
    expect(kapital).toBeCloseTo(500_000, 2);
  });

  it('senkt mit steigender Dynamik den Start- und hebt den Endbeitrag', () => {
    // Genau das ist der Sinn einer Dynamik: klein anfangen, gross aufhoeren.
    const basis = { zielkapital: 400_000, jahre: 25, rendite: 0.05 };
    const ohne = benoetigteSparrate({ ...basis, dynamik: 0 });
    const mit = benoetigteSparrate({ ...basis, dynamik: 0.05 });

    expect(mit.startbeitrag).toBeLessThan(ohne.startbeitrag);
    expect(mit.endbeitrag).toBeGreaterThan(ohne.endbeitrag);
    expect(ohne.startbeitrag).toBeCloseTo(ohne.endbeitrag, 6);
  });

  it('haelt den Sonderfall Rendite gleich Dynamik aus', () => {
    // Dort hat der geschlossene Ausdruck eine Nullstelle im Nenner.
    const r = benoetigteSparrate({ zielkapital: 300_000, jahre: 20, rendite: 0.04, dynamik: 0.04 });
    expect(r.startbeitrag).toBeGreaterThan(0);
    expect(Number.isFinite(r.startbeitrag)).toBe(true);

    let kapital = 0;
    for (let j = 0; j < 20; j++) {
      kapital += r.startbeitrag * 12 * Math.pow(1.04, j) * Math.pow(1.04, 20 - j - 0.5);
    }
    expect(kapital).toBeCloseTo(300_000, 2);
  });

  it('liefert ohne Ziel oder ohne Zeit null statt unendlich', () => {
    expect(benoetigteSparrate({ zielkapital: 0, jahre: 20, rendite: 0.05, dynamik: 0 }).startbeitrag).toBe(0);
    expect(benoetigteSparrate({ zielkapital: 300_000, jahre: 0, rendite: 0.05, dynamik: 0 }).startbeitrag).toBe(0);
    // Rentenbeginn in der Vergangenheit darf nicht in negative Jahre laufen.
    expect(benoetigteSparrate({ zielkapital: 300_000, jahre: -5, rendite: 0.05, dynamik: 0 }).startbeitrag).toBe(0);
  });

  it('kommt ohne Rendite auf die schlichte Division', () => {
    const r = benoetigteSparrate({ zielkapital: 120_000, jahre: 10, rendite: 0, dynamik: 0 });
    expect(r.startbeitrag).toBeCloseTo(120_000 / (10 * 12), 6);
  });
});

describe('Benoetigtes Kapital', () => {
  it('Rundreise: das gefundene Kapital traegt genau die Luecke', () => {
    const ziel = 800;
    const k = benoetigtesKapital(
      { zielNettoMonat: ziel, dauerJahre: 25, rendite: 0.03, dynamik: 0.02, ...opt },
      p,
    );
    const zurueck = entnahmeplanBewerten(
      { kapital: k, dauerJahre: 25, rendite: 0.03, dynamik: 0.02, ...opt },
      p,
    );
    expect(zurueck.nettoMonat).toBeCloseTo(ziel, 1);
  });

  it('rechnet die Steuer auf die Entnahme mit ein', () => {
    // Aus dem BRUTTObedarf abgeleitet waere das Kapital zu klein — die
    // Abgeltungsteuer auf den Ertragsanteil fehlte.
    const ziel = 800, dauer = 25, rendite = 0.05, dynamik = 0.02;
    const netto = benoetigtesKapital({ zielNettoMonat: ziel, dauerJahre: dauer, rendite, dynamik, ...opt }, p);

    // Kapital, das ziel BRUTTO traegt — die naive Umkehrung.
    let brutto = 1000;
    for (let i = 0; i < 200; i++) {
      if (entnahmeRate(brutto, dauer, rendite, dynamik) >= ziel) break;
      brutto *= 1.05;
    }
    expect(netto).toBeGreaterThan(brutto);
  });

  it('liefert ohne Luecke null', () => {
    expect(benoetigtesKapital({ zielNettoMonat: 0, dauerJahre: 25, rendite: 0.03, dynamik: 0.02, ...opt }, p)).toBe(0);
  });

  it('braucht mehr Kapital, je laenger es reichen soll', () => {
    const bei = (dauer: number) => benoetigtesKapital(
      { zielNettoMonat: 500, dauerJahre: dauer, rendite: 0.03, dynamik: 0.02, ...opt }, p,
    );
    expect(bei(30)).toBeGreaterThan(bei(20));
  });
});

describe('Sparrate zu Rente — die Gegenrichtung', () => {
  it('ist die Umkehrung von benoetigteSparrate', () => {
    const jahre = 25, rendite = 0.05, dynamik = 0.03;
    const hin = sparrateZuRente({
      beitragMonat: 100, jahre, rendite, dynamik, auszahldauer: 25, entnahmeDynamik: 0.02,
    });
    const zurueck = benoetigteSparrate({ zielkapital: hin.endkapital, jahre, rendite, dynamik });
    expect(zurueck.startbeitrag).toBeCloseTo(100, 6);
  });

  it('mehr Rendite ergibt mehr Rente', () => {
    const bei = (rendite: number) => sparrateZuRente({
      beitragMonat: 100, jahre: 25, rendite, dynamik: 0, auszahldauer: 25, entnahmeDynamik: 0.02,
    }).renteMonat;
    expect(bei(0.06)).toBeGreaterThan(bei(0.05));
  });
});
