import { describe, it, expect } from 'vitest';
import { internerZins, kennzahlen } from '../src/analyse/kennzahlen.js';

describe('Kennzahlen einer Zahlungsreihe', () => {
  const reihe = {
    einzahlungenJeJahr: Array.from({ length: 20 }, () => 1200),
    auszahlungJeJahr: 3000,
    jahreAuszahlung: 20,
    kapitalEinmalig: 0,
  };

  it('rechnet Hebel, Gewinn und Amortisation', () => {
    const k = kennzahlen(reihe);
    expect(k.summeEinzahlung).toBeCloseTo(24_000, 6);
    expect(k.summeAuszahlung).toBeCloseTo(60_000, 6);
    expect(k.nettoHebel).toBeCloseTo(2.5, 6);
    expect(k.echterGewinn).toBeCloseTo(36_000, 6);
    expect(k.amortisationsJahre).toBeCloseTo(8, 6);
  });

  it('der interne Zins macht den Kapitalwert zu null', () => {
    // Die Probe aufs Exempel: mit dem gefundenen Zins abgezinst muessen sich
    // Ein- und Auszahlungen genau aufheben.
    const r = internerZins(reihe);
    let npv = 0;
    const n = reihe.einzahlungenJeJahr.length;
    for (let t = 0; t < n; t++) npv -= reihe.einzahlungenJeJahr[t]! / Math.pow(1 + r, t + 1);
    for (let t = 1; t <= reihe.jahreAuszahlung; t++) npv += reihe.auszahlungJeJahr / Math.pow(1 + r, n + t);
    expect(npv).toBeCloseTo(0, 4);
  });

  it('ein Verlustgeschaeft hat einen Hebel unter 1 und negative Rendite', () => {
    const k = kennzahlen({ ...reihe, auszahlungJeJahr: 800 });
    expect(k.nettoHebel).toBeLessThan(1);
    expect(k.rendite).toBeLessThan(0);
    expect(k.echterGewinn).toBeLessThan(0);
  });

  it('VERALLGEMEINERUNG: Einmalbetrag UND laufende Rente zaehlen zusammen', () => {
    // Frueher galt entweder das eine oder das andere. Das Altersvorsorgedepot
    // kann beides zugleich: bis zu 30 % auf einen Schlag, der Rest verrentet.
    const nur = kennzahlen(reihe);
    const beides = kennzahlen({ ...reihe, kapitalEinmalig: 20_000 });

    expect(beides.summeAuszahlung).toBeCloseTo(nur.summeAuszahlung + 20_000, 6);
    expect(beides.rendite).toBeGreaterThan(nur.rendite);
    // Der Einmalbetrag kommt frueher — er verkuerzt die Amortisation.
    expect(beides.amortisationsJahre).toBeLessThan(nur.amortisationsJahre);
  });

  it('ohne Einmalbetrag aendert die Verallgemeinerung nichts', () => {
    const a = kennzahlen({ ...reihe, kapitalEinmalig: 0 });
    expect(a.rendite).toBeCloseTo(kennzahlen(reihe).rendite, 12);
  });

  it('nur Einmalbetrag, keine laufende Rente', () => {
    const k = kennzahlen({
      einzahlungenJeJahr: [1000, 1000, 1000],
      auszahlungJeJahr: 0,
      jahreAuszahlung: 0,
      kapitalEinmalig: 6000,
    });
    expect(k.summeAuszahlung).toBeCloseTo(6000, 6);
    expect(k.nettoHebel).toBeCloseTo(2, 6);
    // Ohne laufende Auszahlung gibt es keine Amortisation ueber Rentenjahre.
    expect(k.amortisationsJahre).toBe(0);
  });

  it('haelt eine leere Reihe aus', () => {
    const k = kennzahlen({
      einzahlungenJeJahr: [], auszahlungJeJahr: 0, jahreAuszahlung: 0, kapitalEinmalig: 0,
    });
    expect(k.nettoHebel).toBe(0);
    expect(k.rendite).toBe(0);
  });
});
