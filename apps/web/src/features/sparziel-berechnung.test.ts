import { describe, expect, it } from 'vitest';
import type { Jahreszeile } from '@renten/engine';
import { musterSzenario } from '../test/musterfall';
import { sparzielRechnen, wunschbeitragRechnen, SPARZIEL_VORGABE } from './sparziel-berechnung';

/** Eine Zeile des Rentenjahres mit 1.500 € Lücke, 26 Jahre entfernt. */
const zeile = (luecke = 1500): Jahreszeile => ({
  jahr: new Date().getFullYear() + 26,
  zielNettoMonat: 3400,
  nettoMonat: 3400 - luecke,
  kaufkraftfaktor: 1.67,
}) as unknown as Jahreszeile;

describe('SPARZIEL_VORGABE — womit Sparrechner und Gutachten rechnen', () => {
  it('6 % Rendite nach Kosten, kein steigender Beitrag, 25 Jahre Auszahlung', () => {
    expect(SPARZIEL_VORGABE).toEqual({ rendite: 0.06, dynamik: 0, auszahldauer: 25 });
  });

  it('eine höhere Rendite senkt Kapital und Beitrag', () => {
    const s = musterSzenario();
    const mit5 = sparzielRechnen(s, zeile(), { ...SPARZIEL_VORGABE, rendite: 0.05 })!;
    const mit6 = sparzielRechnen(s, zeile(), SPARZIEL_VORGABE)!;
    expect(mit6.zielkapital).toBeLessThan(mit5.zielkapital);
    expect(mit6.gewaehlt.startbeitrag).toBeLessThan(mit5.gewaehlt.startbeitrag);
  });
});

describe('wunschbeitragRechnen — was ein Beitrag von der Lücke schließt', () => {
  const s = musterSzenario();
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

  describe('als Kapital — angespart, was fehlt, und was darüber hinaus Vermögensaufbau ist', () => {
    const noetig = voll.gewaehlt.startbeitrag;

    it('unter dem nötigen Beitrag: angespart und fehlend ergeben zusammen das Zielkapital', () => {
      const w = wunschbeitragRechnen(s, zeile(), SPARZIEL_VORGABE, noetig / 2)!;
      expect(w.geschlossen).toBe(false);
      expect(w.zielkapital).toBe(voll.zielkapital);
      expect(w.kapital).toBeCloseTo(voll.zielkapital / 2, 6);
      expect(w.kapital + w.kapitalFehlt).toBeCloseTo(voll.zielkapital, 6);
      expect(w.kapitalMehr).toBe(0);
    });

    it('der nötige Beitrag, auf den Euro wie angezeigt, schließt die Summe — nichts fehlt, nichts ist darüber', () => {
      const w = wunschbeitragRechnen(s, zeile(), SPARZIEL_VORGABE, Math.round(noetig))!;
      expect(w.geschlossen).toBe(true);
      expect(w.kapitalFehlt).toBe(0);
      // Hoechstens die Rundung eines halben Euro Beitrag.
      expect(w.kapitalMehr).toBeLessThan(voll.zielkapital * (0.5 / noetig) + 1e-6);
    });

    it('das Doppelte spart das Doppelte an: das Zielkapital für die Altersvorsorge, ebenso viel Vermögensaufbau', () => {
      const w = wunschbeitragRechnen(s, zeile(), SPARZIEL_VORGABE, noetig * 2)!;
      expect(w.geschlossen).toBe(true);
      expect(w.kapital).toBeCloseTo(voll.zielkapital * 2, 6);
      expect(w.kapitalMehr).toBeCloseTo(voll.zielkapital, 6);
      expect(w.kapitalFehlt).toBe(0);
      // Die Lücke bleibt geschlossen — mehr als ganz gibt es dort nicht.
      expect(w.anteil).toBe(1);
    });

    it('kein Beitrag: nichts angespart, das ganze Zielkapital fehlt', () => {
      const w = wunschbeitragRechnen(s, zeile(), SPARZIEL_VORGABE, 0)!;
      expect(w.kapital).toBe(0);
      expect(w.kapitalFehlt).toBe(voll.zielkapital);
    });
  });
});
