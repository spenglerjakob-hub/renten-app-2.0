import { describe, it, expect } from 'vitest';
import {
  matchingModell, optimaleUmwandlung, arbeitgeberSvErsparnis, type MatchingEingaben,
  zuschussModell, zuschussVollAusschoepfen, zuschussStaffel, type ZuschussEingaben,
} from '../src/analyse/matching-modell.js';
import { vertragsTuev, type TuevKontext } from '../src/analyse/vertrags-tuev.js';
import { parameterFuer } from '../src/params/registry.js';
import { bruttoZuNetto } from '../src/erwerb/netto.js';
import { PKV_VORGABE } from '../src/social/pkv.js';
import type { Szenario } from '../src/model.js';

const p = parameterFuer(2026, { indexRate: 0 });
const steuer = { verheiratet: false, bundesland: 'Nordrhein-Westfalen', kirchensteuerpflichtig: false };
const svGrenze = (0.04 * p.bbgRvJahr) / 12; // 338 EUR

const eingaben = (over: Partial<MatchingEingaben> = {}): MatchingEingaben => ({
  jahresbrutto: 54_000,
  umwandlungMonat: 293.91,
  weg: 'dv',
  matchingMonat: 338,
  zuschussImMatching: false,
  unternehmensSteuersatz: 0.3,
  umlagenSatz: 0,
  privatVersichert: false,
  pkvPraemieMonat: 0,
  kinder: { hatKinder: false, kinderUnter25: 0 },
  ...over,
});

describe('Matching-Modell: Beispiel aus dem Beratungsgespraech', () => {
  it('294 EUR Umwandlung + 44 EUR Zuschuss in die DV, 338 EUR U-Kasse', () => {
    const r = matchingModell(eingaben(), steuer, p);
    expect(r.arbeitgeber.pflichtzuschussMonat).toBeCloseTo(44.09, 1);
    expect(r.vertrag.gesamtMonat).toBeCloseTo(676, 0);
    expect(r.mitarbeiter.svPflichtigMonat).toBeCloseTo(0, 6);
    // 44,09 + 338 − 62,16 = 319,93 vor Steuern, bei 30 % rund 224 EUR
    expect(r.arbeitgeber.svErsparnisMonat).toBeCloseTo(62.16, 1);
    expect(r.arbeitgeber.nettoKostenMonat).toBeCloseTo(223.95, 0);
    // zvE aus dem Brutto abgeleitet (54.000 EUR, ledig, ohne Kinder)
    expect(r.mitarbeiter.nettoAufwandMonat).toBeCloseTo(156.5, 0);
    expect(r.hebelMitarbeiter).toBeGreaterThan(4);
  });

  it('Mitarbeiterseite stimmt mit dem Vertrags-TUEV ueberein', () => {
    const r = matchingModell(eingaben(), steuer, p);
    const zve = bruttoZuNetto(54_000, { ...steuer, kinder: { hatKinder: false, kinderUnter25: 0 } }, p).zve;
    const k = {
      jahresbrutto: 54_000, zveHeute: zve, beamter: false, privatVersichert: false, pkvPraemieMonat: 0,
      selbststaendig: false, grvBeitragJahr: 0, rentenbeginnJahr: 2042, alterBeiRentenbeginn: 67,
      bruttoRenteMonat: 0, kvPvMonat: 0, steuerMonat: 0, nettoRenteMonat: 0,
      bruttoKapital: 0, steuerKapital: 0, kvPvKapital: 0, nettoKapital: 0,
    } satisfies TuevKontext;
    const sz = {
      haushalt: { verheiratet: false, bundesland: steuer.bundesland, kirchensteuer: false, kinder: [], pkv: PKV_VORGABE },
    } as unknown as Szenario;
    const t = vertragsTuev(
      { id: 'v', inhaber: 'A', schicht: 2, typ: 'bav', name: 'DV', brutto: 0, strategie: 'rente', altvertrag: false },
      {
        beitragMonat: r.vertrag.direktversicherungMonat, agZuschussMonat: r.arbeitgeber.pflichtzuschussMonat,
        dynamik: 0, kinder: [], beginnJahr: 2026, lebenserwartung: 85,
      },
      k, sz, p,
    );
    expect(r.mitarbeiter.nettoAufwandMonat).toBeCloseTo(t.echterAufwandMonat, 2);
    expect(r.mitarbeiter.svErsparnisMonat).toBeCloseTo(t.svErsparnisMonat, 2);
  });

  it('wörtlich 338 EUR umgewandelt: Zuschuss belegt den Rahmen, 50,70 EUR werden beitragspflichtig', () => {
    const r = matchingModell(eingaben({ umwandlungMonat: 338 }), steuer, p);
    expect(r.arbeitgeber.pflichtzuschussMonat).toBeCloseTo(50.7, 1);
    expect(r.mitarbeiter.svPflichtigMonat).toBeCloseTo(50.7, 1);
    expect(r.hinweise.join(' ')).toContain('Optimal');
    // Teurer fuer den Arbeitgeber als die optimale Aufteilung
    expect(r.arbeitgeber.nettoKostenMonat)
      .toBeGreaterThan(matchingModell(eingaben(), steuer, p).arbeitgeber.nettoKostenMonat);
  });

  it('Zuschuss im Matching enthalten: in die U-Kasse fliesst nur der Rest', () => {
    const r = matchingModell(eingaben({ zuschussImMatching: true }), steuer, p);
    expect(r.arbeitgeber.ukasseMonat).toBeCloseTo(338 - 44.09, 1);
    expect(r.vertrag.gesamtMonat).toBeCloseTo(293.91 + 338, 0);
    expect(r.arbeitgeber.nettoKostenMonat).toBeCloseTo((338 - 62.16) * 0.7, 0);
  });

  it('Umwandlung in die U-Kasse: kein Pflichtzuschuss, volle Ersparnis', () => {
    const r = matchingModell(eingaben({ weg: 'ukasse', umwandlungMonat: 338 }), steuer, p);
    expect(r.arbeitgeber.pflichtzuschussMonat).toBe(0);
    expect(r.vertrag.direktversicherungMonat).toBe(0);
    expect(r.vertrag.ukasseMonat).toBeCloseTo(676, 0);
    expect(r.arbeitgeber.svErsparnisMonat).toBeCloseTo(338 * 0.2115, 1);
    expect(r.arbeitgeber.nettoKostenMonat).toBeCloseTo((338 - 338 * 0.2115) * 0.7, 0);
  });
});

describe('Matching-Modell: optimale Aufteilung', () => {
  it('DV: Umwandlung plus Zuschuss fuellen genau 4 %', () => {
    const e = optimaleUmwandlung('dv', eingaben(), steuer.bundesland, p);
    expect(e).toBeCloseTo(svGrenze / 1.15, 0);
    const r = matchingModell(eingaben({ umwandlungMonat: e }), steuer, p);
    expect(r.mitarbeiter.umwandlungMonat + r.arbeitgeber.pflichtzuschussMonat).toBeCloseTo(svGrenze, 0);
    expect(r.mitarbeiter.svPflichtigMonat).toBeLessThan(0.05);
  });

  it('U-Kasse: die vollen 4 %', () => {
    expect(optimaleUmwandlung('ukasse', eingaben(), steuer.bundesland, p)).toBeCloseTo(svGrenze, 1);
  });
});

describe('Matching-Modell: Sonderlagen', () => {
  it('ueber der BBG der Krankenversicherung spart der Arbeitgeber nur RV und AV', () => {
    const k = { beamter: false, selbststaendig: false, privatVersichert: false, pkvPraemieMonat: 0, jahresbrutto: 80_000 };
    const ag = arbeitgeberSvErsparnis(338 * 12, k, steuer.bundesland, p);
    expect(ag / 12).toBeCloseTo(338 * (p.rvSatzGesamt + p.avSatzGesamt) / 2, 1);
    const r = matchingModell(eingaben({ jahresbrutto: 80_000 }), steuer, p);
    expect(r.hinweise.join(' ')).toContain('Beitragsbemessungsgrenze der Krankenversicherung');
  });

  it('privat versichert: keine KV/PV-Ersparnis, Zuschuss auf die Ersparnis begrenzt', () => {
    const r = matchingModell(eingaben({ privatVersichert: true, pkvPraemieMonat: 600 }), steuer, p);
    expect(r.arbeitgeber.svErsparnisMonat).toBeLessThan(293.91 * 0.11);
    expect(r.arbeitgeber.pflichtzuschussMonat).toBeLessThanOrEqual(r.arbeitgeber.svErsparnisMonat + 0.01);
    expect(r.hinweise.join(' ')).toContain('Privat versichert');
  });

  it('Sachsen: der Arbeitgeber traegt 0,5 Punkte weniger Pflegeversicherung', () => {
    const k = { beamter: false, selbststaendig: false, privatVersichert: false, pkvPraemieMonat: 0, jahresbrutto: 54_000 };
    const nrw = arbeitgeberSvErsparnis(12_000, k, 'Nordrhein-Westfalen', p);
    const sachsen = arbeitgeberSvErsparnis(12_000, k, 'Sachsen', p);
    expect(nrw - sachsen).toBeCloseTo(12_000 * 0.005, 6);
  });

  it('Gehaltsvergleich: dieselben Kosten ergeben deutlich weniger netto', () => {
    const r = matchingModell(eingaben(), steuer, p);
    expect(r.gehalt).not.toBeNull();
    const g = r.gehalt!;
    // Brutto plus AG-Anteil ergibt die Kosten vor Steuern
    expect(g.bruttoMonat * (1 + 0.2115)).toBeCloseTo(r.arbeitgeber.kostenVorSteuerMonat, 0);
    expect(g.nettoMonat).toBeLessThan(g.bruttoMonat * 0.65);
    expect(g.nettoMonat).toBeLessThan(r.vertrag.gesamtMonat / 3);
    // Die Zwischenschritte gehen auf
    expect(g.bruttoMonat + g.agAbgabenMonat).toBeCloseTo(g.kostenVorSteuerMonat, 6);
    expect(g.kostenVorSteuerMonat).toBeCloseTo(r.arbeitgeber.kostenVorSteuerMonat, 1);
    expect(g.nettoKostenMonat).toBeCloseTo(r.arbeitgeber.nettoKostenMonat, 1);
    expect(g.bruttoMonat - g.svMonat - g.steuerMonat).toBeCloseTo(g.nettoMonat, 6);
  });

  it('Umlagen erhoehen die Ersparnis des Arbeitgebers', () => {
    const ohne = matchingModell(eingaben(), steuer, p);
    const mit = matchingModell(eingaben({ umlagenSatz: 0.02 }), steuer, p);
    expect(mit.arbeitgeber.umlagenErsparnisMonat).toBeCloseTo(293.91 * 0.02, 1);
    expect(mit.arbeitgeber.nettoKostenMonat).toBeLessThan(ohne.arbeitgeber.nettoKostenMonat);
  });
});

describe('Zuschussmodell: 50 % der Umwandlung, hoechstens 100 EUR', () => {
  const zuschuss = (over: Partial<ZuschussEingaben> = {}): ZuschussEingaben => ({
    jahresbrutto: 54_000,
    umwandlungMonat: 200,
    quote: 0.5,
    deckelMonat: 100,
    unternehmensSteuersatz: 0.3,
    umlagenSatz: 0,
    privatVersichert: false,
    pkvPraemieMonat: 0,
    kinder: { hatKinder: false, kinderUnter25: 0 },
    ...over,
  });

  it('200 EUR Umwandlung: 100 EUR Zuschuss, rund 58 EUR vor und 40 EUR nach Steuern', () => {
    const r = zuschussModell(zuschuss(), steuer, p);
    expect(r.arbeitgeber.zuschussMonat).toBeCloseTo(100, 6);
    expect(r.arbeitgeber.davonPflichtzuschussMonat).toBeCloseTo(30, 6);
    expect(r.arbeitgeber.freiwilligMonat).toBeCloseTo(70, 6);
    expect(r.arbeitgeber.svErsparnisMonat).toBeCloseTo(200 * 0.2115, 1);
    expect(r.arbeitgeber.kostenVorSteuerMonat).toBeCloseTo(57.7, 1);
    expect(r.arbeitgeber.nettoKostenMonat).toBeCloseTo(40.39, 1);
    expect(r.mitarbeiter.svPflichtigMonat).toBeCloseTo(0, 6);
    expect(r.vertragMonat).toBeCloseTo(300, 6);
    expect(r.gedeckelt).toBe(false);
  });

  it('300 EUR: Deckel greift, 38 EUR der Umwandlung werden beitragspflichtig', () => {
    const r = zuschussModell(zuschuss({ umwandlungMonat: 300 }), steuer, p);
    expect(r.gedeckelt).toBe(true);
    expect(r.arbeitgeber.zuschussMonat).toBeCloseTo(100, 6);
    expect(r.mitarbeiter.svPflichtigMonat).toBeCloseTo(300 + 100 - svGrenze, 1);
    expect(r.hinweise.join(' ')).toContain('gedeckelt');
  });

  it('voll ausgeschoepft bei 238 EUR', () => {
    const voll = zuschussVollAusschoepfen(zuschuss(), steuer.bundesland, p);
    expect(voll).toBeCloseTo(svGrenze - 100, 1);
    const r = zuschussModell(zuschuss({ umwandlungMonat: voll }), steuer, p);
    expect(r.mitarbeiter.svPflichtigMonat).toBeLessThan(0.05);
  });

  it('ohne Deckelwirkung: 4 % / 1,5', () => {
    const voll = zuschussVollAusschoepfen(zuschuss({ deckelMonat: 500 }), steuer.bundesland, p);
    expect(voll).toBeCloseTo(svGrenze / 1.5, 0);
  });

  it('Quote unter 15 %: mindestens der Pflichtzuschuss', () => {
    const r = zuschussModell(zuschuss({ quote: 0.1 }), steuer, p);
    expect(r.arbeitgeber.zuschussMonat).toBeCloseTo(30, 1);
    expect(r.hinweise.join(' ')).toContain('Pflichtzuschuss');
  });

  it('Mitarbeiterseite stimmt mit dem Vertrags-TUEV ueberein', () => {
    const r = zuschussModell(zuschuss({ umwandlungMonat: 300 }), steuer, p);
    const zve = bruttoZuNetto(54_000, { ...steuer, kinder: { hatKinder: false, kinderUnter25: 0 } }, p).zve;
    const k = {
      jahresbrutto: 54_000, zveHeute: zve, beamter: false, privatVersichert: false, pkvPraemieMonat: 0,
      selbststaendig: false, grvBeitragJahr: 0, rentenbeginnJahr: 2042, alterBeiRentenbeginn: 67,
      bruttoRenteMonat: 0, kvPvMonat: 0, steuerMonat: 0, nettoRenteMonat: 0,
      bruttoKapital: 0, steuerKapital: 0, kvPvKapital: 0, nettoKapital: 0,
    } satisfies TuevKontext;
    const sz = {
      haushalt: { verheiratet: false, bundesland: steuer.bundesland, kirchensteuer: false, kinder: [], pkv: PKV_VORGABE },
    } as unknown as Szenario;
    const t = vertragsTuev(
      { id: 'v', inhaber: 'A', schicht: 2, typ: 'bav', name: 'DV', brutto: 0, strategie: 'rente', altvertrag: false },
      { beitragMonat: r.vertragMonat, agZuschussMonat: r.arbeitgeber.zuschussMonat, dynamik: 0, kinder: [], beginnJahr: 2026, lebenserwartung: 85 },
      k, sz, p,
    );
    expect(r.mitarbeiter.nettoAufwandMonat).toBeCloseTo(t.echterAufwandMonat, 2);
  });

  it('Staffel: steigt bis zum Deckel, enthaelt die volle Stufe', () => {
    const st = zuschussStaffel(zuschuss(), steuer, p);
    expect(st.map((x) => Math.round(x.umwandlungMonat))).toEqual([50, 100, 150, 200, 238]);
    expect(st[0]!.zuschussMonat).toBeCloseTo(25, 6);
    expect(st.at(-1)!.voll).toBe(true);
    expect(st.at(-1)!.zuschussMonat).toBeCloseTo(100, 6);
    // Bis zum Deckel steigen die Kosten mit der Umwandlung …
    for (let i = 1; i < 4; i++) {
      expect(st[i]!.arbeitgeberNettoMonat).toBeGreaterThan(st[i - 1]!.arbeitgeberNettoMonat);
    }
    // … darueber sinken sie: Der Zuschuss steht, die gesparten Abgaben wachsen.
    expect(st[4]!.arbeitgeberNettoMonat).toBeLessThan(st[3]!.arbeitgeberNettoMonat);
  });
});
