import { describe, it, expect } from 'vitest';
import {
  matchingModell, optimaleUmwandlung, arbeitgeberSvErsparnis, type MatchingEingaben,
  zuschussModell, zuschussVollAusschoepfen, zuschussStaffel, type ZuschussEingaben,
  festbetragModell, festbetragGehaltsStaffel, type FestbetragEingaben,
  betriebUmstieg, type BetriebAngaben,
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

describe('Festbetragsmodell: 50 EUR fuer jeden, der mindestens 50 EUR einzahlt', () => {
  const fest = (over: Partial<FestbetragEingaben> = {}): FestbetragEingaben => ({
    jahresbrutto: 54_000,
    umwandlungMonat: 50,
    festbetragMonat: 50,
    mindestUmwandlungMonat: 50,
    unternehmensSteuersatz: 0.3,
    umlagenSatz: 0,
    privatVersichert: false,
    pkvPraemieMonat: 0,
    kinder: { hatKinder: false, kinderUnter25: 0 },
    ...over,
  });

  it('50 EUR Umwandlung: 50 EUR Zuschuss, rund 39 EUR vor und 28 EUR nach Steuern', () => {
    const r = festbetragModell(fest(), steuer, p);
    expect(r.schwelleErreicht).toBe(true);
    expect(r.arbeitgeber.zuschussMonat).toBeCloseTo(50, 6);
    expect(r.arbeitgeber.davonPflichtzuschussMonat).toBeCloseTo(7.5, 6);
    expect(r.arbeitgeber.svErsparnisMonat).toBeCloseTo(50 * 0.2115, 1);
    expect(r.arbeitgeber.kostenVorSteuerMonat).toBeCloseTo(50 - 50 * 0.2115, 1);
    expect(r.arbeitgeber.nettoKostenMonat).toBeCloseTo((50 - 50 * 0.2115) * 0.7, 1);
    expect(r.vertragMonat).toBeCloseTo(100, 6);
  });

  it('unter der Schwelle nur der Pflichtzuschuss', () => {
    const r = festbetragModell(fest({ umwandlungMonat: 40 }), steuer, p);
    expect(r.schwelleErreicht).toBe(false);
    expect(r.arbeitgeber.zuschussMonat).toBeCloseTo(6, 1);
    expect(r.hinweise.join(' ')).toContain('Darunter zahlt der Arbeitgeber nur');
  });

  it('mehr Umwandlung: Zuschuss bleibt, Kosten des Arbeitgebers sinken', () => {
    const r50 = festbetragModell(fest(), steuer, p);
    const r200 = festbetragModell(fest({ umwandlungMonat: 200 }), steuer, p);
    expect(r200.arbeitgeber.zuschussMonat).toBeCloseTo(50, 6);
    expect(r200.arbeitgeber.nettoKostenMonat).toBeLessThan(r50.arbeitgeber.nettoKostenMonat);
  });

  it('ab rund 333 EUR liegt der Pflichtzuschuss ueber dem Festbetrag', () => {
    const r = festbetragModell(fest({ umwandlungMonat: 400 }), steuer, p);
    expect(r.arbeitgeber.zuschussMonat).toBeGreaterThan(50);
    expect(r.hinweise.join(' ')).toContain('über dem Festbetrag');
  });

  it('Gehaltsstaffel: gleicher Zuschuss fuer alle, ueber der KV-Grenze teurer', () => {
    const st = festbetragGehaltsStaffel(fest(), steuer, p);
    expect(st.map((x) => x.zuschussMonat)).toEqual([50, 50, 50, 50]);
    const bei45 = st.find((x) => x.jahresbrutto === 45_000)!;
    const bei80 = st.find((x) => x.jahresbrutto === 80_000)!;
    expect(bei80.arbeitgeberNettoMonat).toBeGreaterThan(bei45.arbeitgeberNettoMonat);
  });

  it('Mitarbeiterseite stimmt mit dem Vertrags-TUEV ueberein', () => {
    const r = festbetragModell(fest({ umwandlungMonat: 120 }), steuer, p);
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
});

describe('Bisherige Leistungen: VL und bestehende bAV', () => {
  const basis = (over: Partial<ZuschussEingaben> = {}): ZuschussEingaben => ({
    jahresbrutto: 54_000,
    umwandlungMonat: 100,
    quote: 0.5,
    deckelMonat: 100,
    unternehmensSteuersatz: 0.3,
    umlagenSatz: 0,
    privatVersichert: false,
    pkvPraemieMonat: 0,
    kinder: { hatKinder: false, kinderUnter25: 0 },
    ...over,
  });
  const vl = (vlUmgang: 'anrechnen' | 'zusaetzlich', vlMonat = 40, bavBestandMonat = 0) =>
    ({ vlMonat, vlUmgang, bavBestandMonat });

  it('ohne bisherige Leistungen: unveraendert, kein Umstieg', () => {
    const ohne = zuschussModell(basis(), steuer, p);
    const null0 = zuschussModell(basis({ bisher: vl('anrechnen', 0, 0) }), steuer, p);
    expect(ohne.umstieg).toBeNull();
    expect(null0.umstieg).toBeNull();
    expect(null0.arbeitgeber.nettoKostenMonat).toBeCloseTo(ohne.arbeitgeber.nettoKostenMonat, 9);
    expect(matchingModell(eingaben(), steuer, p).umstieg).toBeNull();
  });

  it('angerechnet: Mehrkosten = Modell netto (Brutto ohne VL) − bisherige VL netto', () => {
    const r = zuschussModell(basis({ bisher: vl('anrechnen') }), steuer, p);
    const u = r.umstieg!;
    expect(u.bisher.vlMonat).toBe(40);
    expect(u.bisher.agAbgabenMonat).toBeCloseTo(40 * 0.2115, 1);
    expect(u.bisher.nettoKostenMonat).toBeCloseTo(u.bisher.kostenVorSteuerMonat * 0.7, 9);
    expect(u.neu.vlInBavMonat).toBe(0);
    const modell = zuschussModell(basis({ jahresbrutto: 54_000 - 480 }), steuer, p);
    expect(r.arbeitgeber.nettoKostenMonat).toBeCloseTo(modell.arbeitgeber.nettoKostenMonat, 9);
    expect(u.mehrkostenNettoMonat).toBeCloseTo(modell.arbeitgeber.nettoKostenMonat - u.bisher.nettoKostenMonat, 9);
    expect(u.vlNettoMitarbeiterMonat).toBeGreaterThan(15);
    expect(u.vlNettoMitarbeiterMonat).toBeLessThan(30);
  });

  it('zusaetzlich: VL ohne Abgaben in derselben Direktversicherung, belegt den Rahmen zuerst', () => {
    const ohne = zuschussModell(basis({ umwandlungMonat: 238, jahresbrutto: 54_000 - 480 }), steuer, p);
    const r = zuschussModell(basis({ umwandlungMonat: 238, bisher: vl('zusaetzlich') }), steuer, p);
    const u = r.umstieg!;
    expect(u.neu.vlInBavMonat).toBe(40);
    expect(u.neu.kostenVorSteuerMonat).toBeCloseTo(u.neu.modellKostenVorSteuerMonat + 40, 9);
    expect(u.vorsorgeMitVlMonat).toBeCloseTo(r.vertragMonat + 40, 9);
    // 238 + 100 Zuschuss fuellen den Rahmen schon — mit 40 EUR VL davor werden 40 EUR der Umwandlung pflichtig.
    expect(ohne.mitarbeiter.svPflichtigMonat).toBeLessThan(1);
    expect(r.mitarbeiter.svPflichtigMonat).toBeCloseTo(40, 0);
    expect(u.mehrkostenNettoMonat).toBeGreaterThan(zuschussModell(basis({ umwandlungMonat: 238, bisher: vl('anrechnen') }), steuer, p).umstieg!.mehrkostenNettoMonat);
  });

  it('Matching zusaetzlich: VL in die Unterstuetzungskasse, der DV-Rahmen bleibt frei', () => {
    const ohne = matchingModell(eingaben({ jahresbrutto: 54_000 - 480 }), steuer, p);
    const r = matchingModell(eingaben({ bisher: vl('zusaetzlich') }), steuer, p);
    expect(r.mitarbeiter.svPflichtigMonat).toBeCloseTo(ohne.mitarbeiter.svPflichtigMonat, 6);
    expect(r.umstieg!.neu.vlInBavMonat).toBe(40);
    expect(r.umstieg!.vorsorgeMitVlMonat).toBeCloseTo(r.vertrag.gesamtMonat + 40, 9);
  });

  it('Bestand fuellt den Rahmen: neue Umwandlung voll pflichtig, voll ausgeschoepft bei 0', () => {
    const svGrenzeMonat = (0.04 * p.bbgRvJahr) / 12;
    const bisher = vl('anrechnen', 0, svGrenzeMonat);
    const r = zuschussModell(basis({ bisher }), steuer, p);
    expect(r.mitarbeiter.svPflichtigMonat).toBeCloseTo(100, 6);
    expect(r.hinweise.some((h) => h.includes('Bestehende Verträge belegen'))).toBe(true);
    expect(zuschussVollAusschoepfen(basis({ bisher }), steuer.bundesland, p)).toBe(0);
    expect(optimaleUmwandlung('dv', basis({ bisher }), steuer.bundesland, p)).toBe(0);
  });
});

describe('Umstieg fuer den ganzen Betrieb', () => {
  const zEin = (over: Partial<ZuschussEingaben> = {}): ZuschussEingaben => ({
    jahresbrutto: 54_000, umwandlungMonat: 100, quote: 0.5, deckelMonat: 100,
    unternehmensSteuersatz: 0.3, umlagenSatz: 0, privatVersichert: false, pkvPraemieMonat: 0,
    kinder: { hatKinder: false, kinderUnter25: 0 }, ...over,
  });
  const angaben = (over: Partial<BetriebAngaben> = {}): BetriebAngaben => ({
    neuTeilnehmer: 10,
    bestand: { anzahl: 0, umwandlungMonat: 100, zuschussQuote: 0.15 },
    vl: { betragMonat: 0, anzahl: 0, umwandler: 0, davonMitGehalt: 0 },
    ...over,
  });
  const zm = (e: ZuschussEingaben) => {
    const r = zuschussModell(e, steuer, p);
    return { kostenVorSteuerMonat: r.arbeitgeber.kostenVorSteuerMonat, vorsorgeMonat: r.vertragMonat, agBeitragMonat: r.arbeitgeber.zuschussMonat };
  };
  const vl = (anzahl: number, umwandler: number, davonMitGehalt: number) =>
    ({ betragMonat: 40, anzahl, umwandler, davonMitGehalt });

  it('nur neue Teilnehmer: bisher 0, neu = n × Modell netto × 12', () => {
    const b = betriebUmstieg(zm, zEin(), angaben(), steuer, p);
    expect(b.zeilen.map((z) => z.gruppe)).toEqual(['neu']);
    expect(b.bisherNettoJahr).toBe(0);
    expect(b.neuNettoJahr).toBeCloseTo(10 * zuschussModell(zEin(), steuer, p).arbeitgeber.nettoKostenMonat * 12, 6);
    expect(b.kopfVl).toBeNull();
  });

  it('Bestand 15 % → Zuschussmodell 50 %: Aufstockung kostet die Differenz', () => {
    const b = betriebUmstieg(zm, zEin(), angaben({ neuTeilnehmer: 0, bestand: { anzahl: 3, umwandlungMonat: 100, zuschussQuote: 0.15 } }), steuer, p);
    const alt = zuschussModell(zEin({ quote: 0.15, deckelMonat: 1e9 }), steuer, p).arbeitgeber.nettoKostenMonat;
    const neu = zuschussModell(zEin(), steuer, p).arbeitgeber.nettoKostenMonat;
    expect(b.zeilen.map((z) => z.gruppe)).toEqual(['bestand']);
    expect(b.mehrkostenNettoJahr).toBeCloseTo(3 * (neu - alt) * 12, 6);
    expect(b.mehrkostenNettoJahr).toBeGreaterThan(0);
  });

  it('Bestand 15 % → Festbetrag 50 EUR', () => {
    const fm = (e: FestbetragEingaben) => {
      const r = festbetragModell(e, steuer, p);
      return { kostenVorSteuerMonat: r.arbeitgeber.kostenVorSteuerMonat, vorsorgeMonat: r.vertragMonat, agBeitragMonat: r.arbeitgeber.zuschussMonat };
    };
    const basis: FestbetragEingaben = { ...zEin(), festbetragMonat: 50, mindestUmwandlungMonat: 50 };
    const b = betriebUmstieg(fm, basis, angaben({ neuTeilnehmer: 0, bestand: { anzahl: 2, umwandlungMonat: 100, zuschussQuote: 0.15 } }), steuer, p);
    const alt = zuschussModell(zEin({ quote: 0.15, deckelMonat: 1e9 }), steuer, p).arbeitgeber.nettoKostenMonat;
    expect(b.mehrkostenNettoJahr).toBeCloseTo(2 * (festbetragModell(basis, steuer, p).arbeitgeber.nettoKostenMonat - alt) * 12, 6);
  });

  it('VL-Umwandler: Entgeltumwandlung der VL, Zuschuss obendrauf', () => {
    const b = betriebUmstieg(zm, zEin(), angaben({ neuTeilnehmer: 0, vl: vl(5, 5, 0) }), steuer, p);
    const k = b.kopfVl!;
    expect(b.zeilen.map((z) => z.gruppe)).toEqual(['vlUmwandlung']);
    expect(k.bisherVorSteuerMonat).toBeCloseTo(40 + 40 * 0.2115, 1);
    // 20 EUR Zuschuss abzueglich rund 8,50 EUR gesparter Abgaben
    expect(k.modellMonat).toBeCloseTo(20 - 40 * 0.2115, 1);
    expect(k.neuVorSteuerMonat).toBeCloseTo(60, 0);
    expect(k.vorsorgeMonat).toBeCloseTo(60, 6);
    expect(k.zuschussMonat).toBeCloseTo(20, 6);
    expect(k.abgabenNeuMonat).toBeCloseTo(0, 6);
    expect(b.mehrkostenNettoJahr).toBeCloseTo(5 * k.modellMonat * 0.7 * 12, 6);
  });

  it('VL + Gehalt: Modell auf Umwandlung plus VL', () => {
    const b = betriebUmstieg(zm, zEin(), angaben({ neuTeilnehmer: 3, vl: vl(3, 3, 3) }), steuer, p);
    expect(b.zeilen.map((z) => [z.gruppe, z.anzahl])).toEqual([['vlGehalt', 3]]);
    const modell = zuschussModell(zEin({ umwandlungMonat: 140 }), steuer, p).arbeitgeber.nettoKostenMonat;
    expect(b.mehrkostenNettoJahr).toBeCloseTo(3 * modell * 12, 6);
  });

  it('VL behalten: bisher = neu', () => {
    const b = betriebUmstieg(zm, zEin(), angaben({ neuTeilnehmer: 0, vl: vl(4, 0, 0) }), steuer, p);
    expect(b.zeilen.map((z) => [z.gruppe, z.anzahl])).toEqual([['vlBehalten', 4]]);
    expect(b.bisherNettoJahr).toBeGreaterThan(0);
    expect(b.mehrkostenNettoJahr).toBeCloseTo(0, 9);
  });

  it('klemmt: Umwandler ≤ Bezieher, mit Gehalt ≤ Umwandler und ≤ Teilnehmer', () => {
    const b = betriebUmstieg(zm, zEin(), angaben({ neuTeilnehmer: 2, vl: vl(6, 9, 5) }), steuer, p);
    expect(b.zeilen.map((z) => [z.gruppe, z.anzahl])).toEqual([['vlGehalt', 2], ['vlUmwandlung', 4]]);
  });

  it('Matching: Bestand rechnet in der Direktversicherung', () => {
    const calls: string[] = [];
    const mm = (e: MatchingEingaben, g: 'neu' | 'bestand') => {
      calls.push(`${g}:${g === 'bestand' ? 'dv' : e.weg}`);
      const r = matchingModell(g === 'bestand' ? { ...e, weg: 'dv' } : e, steuer, p);
      return {
        kostenVorSteuerMonat: r.arbeitgeber.kostenVorSteuerMonat, vorsorgeMonat: r.vertrag.gesamtMonat,
        agBeitragMonat: r.arbeitgeber.pflichtzuschussMonat + r.arbeitgeber.ukasseMonat,
      };
    };
    const b = betriebUmstieg(mm, eingaben({ weg: 'ukasse' }), angaben({ bestand: { anzahl: 2, umwandlungMonat: 100, zuschussQuote: 0.15 } }), steuer, p);
    expect(calls).toEqual(['neu:ukasse', 'bestand:dv']);
    expect(b.zeilen).toHaveLength(2);
  });
});
