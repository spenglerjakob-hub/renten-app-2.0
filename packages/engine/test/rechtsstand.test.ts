import { describe, it, expect } from 'vitest';
import { PARAMETER_2024, PARAMETER_2025, PARAMETER_2026 } from '../src/params/jahre.js';
import { parameterFuer } from '../src/params/registry.js';
import { avdGegenFreiesDepot } from '../src/products/altersvorsorgedepot.js';

/*
 * Werte des Rechtsstands, die das Jahr vorgibt und die sich nicht aus einer
 * Formel ergeben. Ein Wert, der zum Jahreswechsel nur aus dem Vorjahr
 * mitgenommen wurde, faellt hier auf.
 */
describe('Basiszins der Vorabpauschale (§ 18 Abs. 4 InvStG)', () => {
  it('steht je Jahr mit dem Wert des BMF-Schreibens', () => {
    expect(PARAMETER_2024.basiszins).toBe(0.0229); // BMF-Schreiben vom 5.1.2024
    expect(PARAMETER_2025.basiszins).toBe(0.0253); // BMF-Schreiben vom 10.1.2025
    expect(PARAMETER_2026.basiszins).toBe(0.032); // BMF-Schreiben vom 13.1.2026
  });

  it('bleibt in der Fortschreibung auf dem letzten bekannten Wert', () => {
    // Fuer kuenftige Jahre kennt ihn niemand — er wird nicht mit indexiert.
    const spaet = parameterFuer(2045, { indexRate: 0.02 });
    expect(spaet.extrapoliert).toBe(true);
    expect(spaet.basiszins).toBe(parameterFuer(2044, { indexRate: 0.02 }).basiszins);
    expect(spaet.basiszins).toBeGreaterThan(0);
  });

  it('wirkt im Vergleich mit dem freien Depot: mehr Vorabpauschale, weniger Steuer bei der Entnahme', () => {
    const p = parameterFuer(2027, { indexRate: 0 });
    const opt = { verheiratet: false, bundesland: 'Baden-Württemberg', kirchensteuerpflichtig: false };
    const fall = {
      beitragMonat: 150, jahre: 30, renditeBrutto: 0.06, kosten: 0.01, kinder: [],
      alterHeute: 37, alterBeiRente: 67, startjahr: 2027, auszahldauer: 18, renditeAuszahlung: 0,
      zveHeute: 50_000, steuersatzImAlter: 0.25,
    };
    const niedrig = avdGegenFreiesDepot(fall, opt, { ...p, basiszins: 0.0253 });
    const hoch = avdGegenFreiesDepot(fall, opt, { ...p, basiszins: 0.032 });

    // Die Vorabpauschale kostet waehrend des Ansparens Steuer — das Depot waechst etwas langsamer.
    expect(hoch.frei.endkapital).toBeLessThan(niedrig.frei.endkapital);
    // Dafuer ist bei der Entnahme weniger Gewinn uebrig, der noch zu versteuern ist.
    expect(hoch.frei.steuerJahr).toBeLessThan(niedrig.frei.steuerJahr);
    // Die gefoerderte Seite kennt keine Vorabpauschale.
    expect(hoch.gefoerdert.nettoMonat).toBe(niedrig.gefoerdert.nettoMonat);
    // Die Wirkung bleibt klein: unter 1 % der Netto-Auszahlung.
    expect(Math.abs(hoch.frei.nettoMonat - niedrig.frei.nettoMonat) / niedrig.frei.nettoMonat).toBeLessThan(0.01);
  });
});
