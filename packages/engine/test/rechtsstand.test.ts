import { describe, it, expect } from 'vitest';
import {
  PARAMETER_2024, PARAMETER_2025, PARAMETER_2026, BASISJAHR, BELEGTE_JAHRE, VORABWERTE, VORAB_2027,
} from '../src/params/jahre.js';
import { parameterFuer, rechtsstandInfo } from '../src/params/registry.js';
import { pvSatzMitglied } from '../src/social/kv-pv.js';
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

/*
 * Vorab bekannte Werte: Die Rechengroessen der Sozialversicherung stehen im
 * Herbst fest, der Steuertarif noch nicht. Sie gelten von selbst ab ihrem
 * Jahr — ohne dass ein halb belegter Jahrgang sich als Rechtsstand ausgibt.
 */
describe('Vorabwerte 2027 — Rechengrößen der Sozialversicherung', () => {
  const ohne = { indexRate: 0 };
  const mit2 = { indexRate: 0.02 };

  it('2026 und früher bleiben, wie sie sind', () => {
    expect(parameterFuer(2026, ohne)).toBe(PARAMETER_2026);
    expect(parameterFuer(2026, mit2)).toBe(PARAMETER_2026);
    expect(parameterFuer(2025, mit2)).toBe(PARAMETER_2025);
  });

  it('ab 2027 gelten die neuen Grenzen und Größen genau', () => {
    for (const fs of [ohne, mit2]) {
      const p = parameterFuer(2027, fs);
      expect(p.bbgRvJahr).toBe(106_200);
      expect(p.bbgRvJahr / 12).toBe(8_850);
      expect(p.bbgKvJahr).toBe(76_500);
      expect(p.bbgKvJahr / 12).toBe(6_375);
      expect(p.bezugsgroesseMonat).toBe(4_130);
      expect(p.bezugsgroesseMonat * 12).toBe(49_560);
      expect(p.durchschnittsentgelt).toBe(53_452);
    }
  });

  it('der Höchstbetrag der Altersvorsorge folgt der knappschaftlichen Grenze: 130.800 € × 24,7 %, aufgerundet', () => {
    expect(Math.ceil(130_800 * 0.247)).toBe(32_308);
    expect(parameterFuer(2027, ohne).hoechstbetragAltersvorsorge).toBe(32_308);
  });

  it('Kinderlose zahlen ab 2027 4,5 % Pflegebeitrag, alle anderen wie bisher', () => {
    const p26 = parameterFuer(2026, ohne);
    const p27 = parameterFuer(2027, ohne);
    expect(p26.pv.satz + p26.pv.kinderloseZuschlag).toBeCloseTo(0.042, 10);
    expect(p27.pv.satz + p27.pv.kinderloseZuschlag).toBeCloseTo(0.045, 10);
    expect(p27.pv.satz).toBe(0.036);
    expect(p27.pv.abschlagJeKind).toBe(p26.pv.abschlagJeKind);
    // Mit einem Kind bleibt es beim allgemeinen Satz.
    expect(pvSatzMitglied({ hatKinder: true, kinderUnter25: 1 }, p27)).toBe(pvSatzMitglied({ hatKinder: true, kinderUnter25: 1 }, p26));
    expect(pvSatzMitglied({ hatKinder: false, kinderUnter25: 0 }, p27)).toBeCloseTo(0.045, 10);
  });

  it('die Beitragssätze sind bestätigt unverändert', () => {
    const p = parameterFuer(2027, ohne);
    expect(p.rvSatzGesamt).toBe(0.186);
    expect(p.avSatzGesamt).toBe(0.026);
    expect(p.kv.allgemeinerSatz).toBe(0.146);
    expect(p.kv.zusatzbeitrag).toBe(0.029); // BMG, 30.10.2026
  });

  it('was daraus folgt, rechnet sich von selbst: 4 % und 8 % der Grenze, Freibetrag der Betriebsrente', () => {
    const p = parameterFuer(2027, ohne);
    expect(p.bbgRvJahr * 0.04 / 12).toBe(354);
    expect(p.bbgRvJahr * 0.08 / 12).toBe(708);
    expect(p.bezugsgroesseMonat / 20).toBe(206.5);
  });

  it('alles Übrige bleibt Fortschreibung aus 2026 — das Jahr gilt weiter als nicht belegt', () => {
    const p = parameterFuer(2027, ohne);
    expect(p.extrapoliert).toBe(true);
    expect(p.quelle).toContain('fortgeschrieben aus 2026');
    expect(p.quelle).toContain(VORAB_2027.quelle);
    expect(p.est).toEqual(PARAMETER_2026.est);
    expect(p.soli).toEqual(PARAMETER_2026.soli);
    expect(p.lohnsteuer).toEqual(PARAMETER_2026.lohnsteuer);
    expect(p.rentenwert).toBe(PARAMETER_2026.rentenwert);
    expect(p.basiszins).toBe(PARAMETER_2026.basiszins);
    // Mit Index wandert der Tarif wie bisher mit, die Vorabwerte nicht.
    const q = parameterFuer(2027, mit2);
    expect(q.est.grundfreibetrag).toBe(Math.round(PARAMETER_2026.est.grundfreibetrag * 1.02));
    expect(q.bbgRvJahr).toBe(106_200);
  });

  it('spätere Jahre schreiben die Vorabwerte von 2027 aus fort, alles andere von 2026 aus', () => {
    const p = parameterFuer(2030, mit2);
    const f3 = Math.pow(1.02, 3);
    const f4 = Math.pow(1.02, 4);
    expect(p.bbgRvJahr).toBe(Math.round(106_200 * f3));
    expect(p.bbgKvJahr).toBe(Math.round(76_500 * f3));
    expect(p.hoechstbetragAltersvorsorge).toBe(Math.round(32_308 * f3));
    expect(p.bezugsgroesseMonat).toBeCloseTo(4_130 * f3, 8);
    expect(p.durchschnittsentgelt).toBeCloseTo(53_452 * f3, 8);
    expect(p.pv.kinderloseZuschlag).toBe(0.009);
    expect(p.est.grundfreibetrag).toBe(Math.round(PARAMETER_2026.est.grundfreibetrag * f4));
    expect(p.rentenwert).toBeCloseTo(PARAMETER_2026.rentenwert * f4, 8);
    // Ohne Index bleiben sie stehen.
    expect(parameterFuer(2040, ohne).bbgRvJahr).toBe(106_200);
  });

  it('der individuelle Zusatzbeitrag wirkt weiter', () => {
    expect(parameterFuer(2027, { indexRate: 0, zusatzbeitrag: 0.035 }).kv.zusatzbeitrag).toBe(0.035);
  });

  it('die Beschreibung des Rechtsstands sagt, was schon eingerechnet ist', () => {
    const r = rechtsstandInfo(2060, { indexRate: 0.015 });
    expect(r.basisjahr).toBe(2026);
    expect(r.fortgeschriebenAb).toBe(2027);
    expect(r.vorab).toEqual([{ jahr: 2027, text: VORAB_2027.text }]);
    expect(r.text).toBe(`Rechtsstand 2026; ab 2027 mit 1,5 % p. a. fortgeschrieben. ${VORAB_2027.text}`);
    // Reicht die Rechnung nicht bis 2027, gibt es nichts zu sagen.
    const kurz = rechtsstandInfo(2026, { indexRate: 0.015 });
    expect(kurz.vorab).toEqual([]);
    expect(kurz.text).toBe('Rechtsstand 2026');
  });

  it('Wächter: Vorabwerte gibt es nur für Jahre nach dem Basisjahr', () => {
    // Wer den vollen Jahrgang anlegt, loescht die Vorabwerte des Jahres — sie
    // sind dann im Jahrgang aufgegangen und wuerden sonst still mitgeschleppt.
    const belegt = new Set(BELEGTE_JAHRE.map((p) => p.jahr));
    for (const v of VORABWERTE) {
      expect(v.jahr, `Vorabwerte ${v.jahr}: Jahrgang ist belegt — Vorabwerte loeschen`).toBeGreaterThan(BASISJAHR.jahr);
      expect(belegt.has(v.jahr)).toBe(false);
    }
    expect([...VORABWERTE].map((v) => v.jahr)).toEqual([...VORABWERTE].map((v) => v.jahr).sort((a, b) => a - b));
  });
});
