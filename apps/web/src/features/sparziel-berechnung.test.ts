import { describe, expect, it } from 'vitest';
import type { Jahreszeile } from '@renten/engine';
import { standardSzenario } from '../store/standard';
import { sparzielRechnen, wunschbeitragRechnen, SPARZIEL_VORGABE } from './sparziel-berechnung';

/** Eine Zeile des Rentenjahres mit 1.500 € Lücke, 26 Jahre entfernt. */
const zeile = (luecke = 1500): Jahreszeile => ({
  jahr: new Date().getFullYear() + 26,
  zielNettoMonat: 3400,
  nettoMonat: 3400 - luecke,
  kaufkraftfaktor: 1.67,
}) as unknown as Jahreszeile;

describe('wunschbeitragRechnen — was ein Beitrag von der Lücke schließt', () => {
  const s = standardSzenario();
  const voll = sparzielRechnen(s, zeile(), SPARZIEL_VORGABE)!;

  it('der nötige Beitrag schließt die Lücke ganz — derselbe wie im Sparrechner', () => {
    const w = wunschbeitragRechnen(s, zeile(), SPARZIEL_VORGABE, voll.gewaehlt.startbeitrag)!;
    expect(w.noetig).toBe(voll.gewaehlt.startbeitrag);
    expect(w.anteil).toBe(1);
    expect(w.gedecktMonat).toBe(1500);
    expect(w.restMonat).toBe(0);
  });

  it('mehr als nötig bleibt bei „ganz“', () => {
    const w = wunschbeitragRechnen(s, zeile(), SPARZIEL_VORGABE, voll.gewaehlt.startbeitrag * 3)!;
    expect(w.anteil).toBe(1);
    expect(w.restMonat).toBe(0);
  });

  it('kein Beitrag schließt nichts', () => {
    const w = wunschbeitragRechnen(s, zeile(), SPARZIEL_VORGABE, 0)!;
    expect(w.anteil).toBe(0);
    expect(w.gedecktMonat).toBe(0);
    expect(w.restMonat).toBe(1500);
  });

  it('der halbe Beitrag schließt etwa die Hälfte — eher etwas mehr, weil ein kleines Kapital milder besteuert wird', () => {
    const w = wunschbeitragRechnen(s, zeile(), SPARZIEL_VORGABE, voll.gewaehlt.startbeitrag / 2)!;
    expect(w.anteil).toBeGreaterThanOrEqual(0.5 - 1e-6);
    expect(w.anteil).toBeLessThan(0.6);
    expect(w.gedecktMonat + w.restMonat).toBeCloseTo(1500, 6);
    expect(w.gedecktHeute).toBeCloseTo(w.gedecktMonat / 1.67, 6);
  });

  it('mehr Beitrag schließt nie weniger', () => {
    const anteile = [50, 100, 200, 400, 800].map((b) => wunschbeitragRechnen(s, zeile(), SPARZIEL_VORGABE, b)!.anteil);
    for (let i = 1; i < anteile.length; i++) expect(anteile[i]!).toBeGreaterThanOrEqual(anteile[i - 1]!);
    expect(anteile[0]!).toBeGreaterThan(0);
  });

  it('die Rückrechnung passt zur Hinrechnung: der gedeckte Betrag als eigene Lücke kostet wieder den Beitrag', () => {
    const w = wunschbeitragRechnen(s, zeile(), SPARZIEL_VORGABE, 200)!;
    const zurueck = sparzielRechnen(s, zeile(w.gedecktMonat), SPARZIEL_VORGABE)!;
    expect(zurueck.gewaehlt.startbeitrag).toBeCloseTo(200, 2);
  });

  it('ohne Lücke gibt es nichts zu rechnen', () => {
    expect(wunschbeitragRechnen(s, zeile(0), SPARZIEL_VORGABE, 100)).toBeNull();
  });
});
