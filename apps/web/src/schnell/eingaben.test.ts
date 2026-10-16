import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  alterExakt, heute, parameterFuer, parseDatum, projiziere, regelaltersrentenbeginn, schaetzeEntgeltpunkte,
} from '@renten/engine';
import { szenarioSchema } from '@renten/schema';
import { STANDARD_OFFEN, standardSzenario } from '../store/standard';
import { musterfallMerken, musterfallVerwerfen, offenerMusterfall } from '../lib/musterfall';
import { SCHNELL_BEISPIEL, renteGeschaetzt, schnellRechnen } from './eingaben';

describe('Schnellrechnung', () => {
  it('dieselben Zahlen wie der volle Rechner mit demselben Fall', () => {
    const e = { ...SCHNELL_BEISPIEL, geburtsdatum: '12.05.1980', bruttoMonat: 5200, rente: 1830, ziel: 2600 };
    const r = schnellRechnen(e)!;
    // Derselbe Fall, so wie ihn ein Berater im Rechner eintraegt.
    const s = standardSzenario();
    const imRechner = szenarioSchema.parse({
      ...s,
      haushalt: { ...s.haushalt, zielNettoHeute: 2600 },
      einkommenHeute: { ...s.einkommenHeute, betrag: 5200 },
      personen: [{ ...s.personen[0]!, geburtsdatum: '12.05.1980', rentenbeginn: r.szenario.personen[0]!.rentenbeginn, grvBruttoHeute: 1830 }],
    });
    const e2 = projiziere(imRechner);
    const z2 = e2.zeilen.find((z) => z.jahr === r.zeile.jahr)!;
    expect(r.zeile.nettoMonat).toBeCloseTo(z2.nettoMonat, 6);
    expect(r.zeile.zielNettoMonat).toBeCloseTo(z2.zielNettoMonat, 6);
  });

  it('schaetzt die Rente wie der Karriere-Schaetzer im Rechner', () => {
    const geburt = parseDatum('01.01.1985')!;
    const p = parameterFuer(heute().jahr, { indexRate: 0.01 });
    const erwartet = Math.round(schaetzeEntgeltpunkte(
      48_000, alterExakt(geburt, heute()), alterExakt(geburt, regelaltersrentenbeginn(geburt)), p,
    ).monatsrenteHeutigeKaufkraft);
    expect(renteGeschaetzt(SCHNELL_BEISPIEL)).toBe(erwartet);
    const r = schnellRechnen(SCHNELL_BEISPIEL)!;
    expect(r.rente).toBe(erwartet);
    expect(r.renteGeschaetzt).toBe(true);
  });

  it('ohne eigenes Ziel: Faustregel 80 % des heutigen Nettos, auf 50 € gerundet', () => {
    const r = schnellRechnen(SCHNELL_BEISPIEL)!;
    expect(r.zielAusFaustregel).toBe(true);
    expect(r.zielHeute).toBe(Math.round((r.nettoHeute * 0.8) / 50) * 50);
    expect(r.szenario.haushalt.zielNettoHeute).toBe(r.zielHeute);
  });

  it('unberuehrt bleibt alles offen; angefasst wird geprueft — Schaetzung und Faustregel bleiben Beispielwerte', () => {
    expect(schnellRechnen(SCHNELL_BEISPIEL)!.szenario.offen).toEqual([...STANDARD_OFFEN]);
    const angefasst = new Set(['geburtsdatum', 'brutto', 'rente', 'ziel'] as const);
    const offen = schnellRechnen({ ...SCHNELL_BEISPIEL, bruttoMonat: 5000 }, angefasst)!.szenario.offen!;
    expect(offen).not.toContain('personen.A.geburtsdatum');
    expect(offen).not.toContain('einkommenHeute.betrag');
    // rente und ziel sind null: geschaetzt bzw. Faustregel — keine Angaben des Mandanten.
    expect(offen).toContain('personen.A.grvBruttoHeute');
    expect(offen).toContain('haushalt.zielNettoHeute');
    const eigene = schnellRechnen({ ...SCHNELL_BEISPIEL, rente: 1700, ziel: 2400 }, angefasst)!.szenario.offen!;
    expect(eigene).not.toContain('personen.A.grvBruttoHeute');
    expect(eigene).not.toContain('haushalt.zielNettoHeute');
  });
});

describe('Musterfall', () => {
  let speicher: Map<string, string>;
  beforeEach(() => {
    speicher = new Map();
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => speicher.get(k) ?? null,
      setItem: (k: string, v: string) => { speicher.set(k, v); },
      removeItem: (k: string) => { speicher.delete(k); },
      clear: () => speicher.clear(),
      key: () => null,
      length: 0,
    } as Storage;
  });
  afterEach(() => { delete (globalThis as { localStorage?: Storage }).localStorage; });

  it('merken, wiederfinden, verwerfen', () => {
    const r = schnellRechnen(SCHNELL_BEISPIEL)!;
    expect(musterfallMerken(r.szenario, 'Jahrgang 1985')).toBe(true);
    const m = offenerMusterfall()!;
    expect(m.kurz).toBe('Jahrgang 1985');
    expect(m.szenario.einkommenHeute.betrag).toBe(4000);
    expect(m.szenario.offen).toEqual(r.szenario.offen);
    musterfallVerwerfen();
    expect(offenerMusterfall()).toBeNull();
  });

  it('nach 14 Tagen ist er weg — und wird dabei aufgeraeumt', () => {
    musterfallMerken(schnellRechnen(SCHNELL_BEISPIEL)!.szenario, '');
    expect(offenerMusterfall(Date.now() + 13 * 86_400_000)).not.toBeNull();
    expect(offenerMusterfall(Date.now() + 15 * 86_400_000)).toBeNull();
    expect(speicher.size).toBe(0);
  });

  it('ein kaputter Eintrag wird verworfen statt geladen', () => {
    speicher.set('rentenplaner.musterfall.v1', '{"seit": 1, "szenario": "kein json"}');
    expect(offenerMusterfall()).toBeNull();
    expect(speicher.size).toBe(0);
  });
});
