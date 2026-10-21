import { describe, expect, it } from 'vitest';
import { bavMitarbeiter } from '@renten/engine';
import { beratungDatenSchema, firmenAngebotSchema, type BeratungDaten } from '@renten/schema';
import {
  P, beitragsRechnung, grvVon, jahreBisRente, leistungsRechnung, rahmenVoll, steuerVon, szenarioAusBeratung,
} from './rechnung';

const firma = firmenAngebotSchema.parse({ bundesland: 'Bayern', modell: { art: 'zuschuss', quote: 0.5, deckelMonat: 100 } });
const matchingFirma = firmenAngebotSchema.parse({ modell: { art: 'matching', weg: 'dv', matchingMonat: 100 } });

const beratung = (over: Partial<BeratungDaten['angaben']> = {}, umwandlungMonat = 150): BeratungDaten =>
  beratungDatenSchema.parse({
    angaben: { name: 'Anna Beispiel', geburtsdatum: '15.04.1990', jahresbrutto: 48_000, ...over },
    umwandlungMonat,
  });

describe('Beitragsseite der Mitarbeiterberatung', () => {
  it('rechnet mit dem Rechenkern der Arbeitgeber-Seiten', () => {
    const d = beratung();
    const r = beitragsRechnung(firma, d);
    const direkt = bavMitarbeiter(
      { art: 'zuschuss', quote: 0.5, deckelMonat: 100 },
      { jahresbrutto: 48_000, umwandlungMonat: 150, privatVersichert: false, pkvPraemieMonat: 0, kinder: { hatKinder: false, kinderUnter25: 0 }, bavBestandMonat: 0 },
      { verheiratet: false, bundesland: 'Bayern', kirchensteuerpflichtig: false, partnerZveJahr: 0 },
      P,
    );
    expect(r).toEqual(direkt);
    expect(r.arbeitgeberMonat).toBeCloseTo(75, 6);
  });

  it('leeres Bundesland: das der Firma; verheiratet: das zvE des Partners', () => {
    expect(steuerVon(beratung().angaben, firma).bundesland).toBe('Bayern');
    expect(steuerVon(beratung({ bundesland: 'Hessen' }).angaben, firma).bundesland).toBe('Hessen');
    expect(steuerVon(beratung({ verheiratet: true, partnerBrutto: 40_000 }).angaben, firma).partnerZveJahr).toBeGreaterThan(25_000);
    expect(steuerVon(beratung({ verheiratet: false, partnerBrutto: 40_000 }).angaben, firma).partnerZveJahr).toBe(0);
  });

  it('„Rahmen voll nutzen“ füllt den beitragsfreien Rahmen', () => {
    const d = beratung();
    const voll = rahmenVoll(firma, d.angaben);
    const r = beitragsRechnung(firma, { ...d, umwandlungMonat: voll });
    expect(r.gesamtMonat).toBeCloseTo(0.04 * P.bbgRvJahr / 12, 0);
    expect(r.svPflichtigMonat).toBeCloseTo(0, 6);
  });
});

describe('Gesetzliche Rente', () => {
  it('laut Renteninformation oder geschätzt', () => {
    expect(grvVon(48_000, 1450, '15.04.1990', '01.05.2057')).toEqual({ monat: 1450, geschaetzt: false });
    const g = grvVon(48_000, 0, '15.04.1990', '01.05.2057');
    expect(g.geschaetzt).toBe(true);
    expect(g.monat).toBeGreaterThan(800);
    expect(grvVon(48_000, 0, '', '01.05.2057').monat).toBe(0);
  });

  it('Jahre bis zur Rente aus der Regelaltersgrenze', () => {
    expect(jahreBisRente(beratung().angaben)).toBe(2057 - new Date().getFullYear());
    expect(jahreBisRente(beratung({ geburtsdatum: '' }).angaben)).toBe(0);
  });
});

describe('Szenario aus den Angaben', () => {
  it('ledig: eine Person; verheiratet: zwei, der Partner mit seinem Brutto', () => {
    const ledig = szenarioAusBeratung(beratung().angaben, firma, 1400);
    expect(ledig.personen).toHaveLength(1);
    expect(ledig.personen[0]!.grvBruttoHeute).toBe(1400);
    expect(ledig.haushalt.bundesland).toBe('Bayern');
    const paar = szenarioAusBeratung(beratung({ verheiratet: true, partnerBrutto: 36_000 }).angaben, firma, 1400);
    expect(paar.personen).toHaveLength(2);
    expect(paar.haushalt.verheiratet).toBe(true);
    expect(paar.personen[1]!.grvBruttoHeute).toBeGreaterThan(0);
  });

  it('privat versichert: die Prämie steht im Haushalt', () => {
    const s = szenarioAusBeratung(beratung({ kv: 'privat', pkvPraemieMonat: 520 }).angaben, firma, 1400);
    expect(s.haushalt.kvStatus).toBe('pkv');
    expect(s.haushalt.pkv.praemieMonat).toBe(520);
  });
});

describe('Leistung im Alter aus den Werten des Versicherers', () => {
  const mitWerten = (f = firma) => {
    const d = beratung({ grvRente: 1450 });
    const r = beitragsRechnung(f, d);
    const werte = { beitragMonat: 0, garantierteRente: 420, prognoseRente: 600, prognoseKapital: 162_000, dynamik: 0 };
    return { d: { ...d, versicherer: { direkt: werte, ukasse: { ...werte, garantierteRente: 200, prognoseRente: 300, prognoseKapital: 80_000 } } }, r, f };
  };

  it('Rente netto nach Krankenversicherung und Steuer, garantiert und prognostiziert', () => {
    const { d, r, f } = mitWerten();
    const l = leistungsRechnung(f, d, r)!;
    expect(l).not.toBeNull();
    expect(l.vertraege).toHaveLength(1);
    const v = l.vertraege[0]!;
    expect(v.prognose!.bruttoMonat).toBeCloseTo(600, 6);
    expect(v.prognose!.kvPvMonat).toBeGreaterThan(0);
    expect(v.prognose!.steuerMonat).toBeGreaterThan(0);
    expect(v.prognose!.nettoMonat).toBeCloseTo(600 - v.prognose!.kvPvMonat - v.prognose!.steuerMonat, 6);
    expect(v.garantiert!.nettoMonat).toBeLessThan(v.prognose!.nettoMonat);
    expect(v.kapital!.netto).toBeLessThan(162_000);
    expect(v.kapital!.netto).toBeGreaterThan(0);
    expect(v.breakEven!.breakEvenOhneZins).toBeGreaterThan(l.alterBeiRentenbeginn);
  });

  it('unter dem mitwachsenden Freibetrag der Krankenversicherung fällt dort nichts an', () => {
    // 260 € im Jahr 2057 liegen unter Freibetrag und Freigrenze, die mit der Bezugsgroesse steigen.
    const d0 = beratung({ grvRente: 1450 });
    const d = { ...d0, versicherer: { ...d0.versicherer, direkt: { ...d0.versicherer.direkt, prognoseRente: 260 } } };
    const v = leistungsRechnung(firma, d, beitragsRechnung(firma, d))!.vertraege[0]!;
    expect(v.prognose!.kvPvMonat).toBe(0);
    expect(v.prognose!.steuerMonat).toBeGreaterThan(0);
  });

  it('unterm Strich: das Haushaltsnetto steigt — um weniger als die Betriebsrente, die gesetzliche sinkt ja', () => {
    const { d, r, f } = mitWerten();
    const l = leistungsRechnung(f, d, r)!;
    expect(l.grvMinderungMonat).toBeGreaterThan(0);
    expect(l.plusHaushaltMonat!).toBeGreaterThan(0);
    expect(l.plusHaushaltMonat!).toBeLessThan(l.vertraege[0]!.prognose!.nettoMonat);
  });

  it('Matching-Modell: Direktversicherung und Unterstützungskasse je für sich', () => {
    const { d, r, f } = mitWerten(matchingFirma);
    const l = leistungsRechnung(f, d, r)!;
    expect(l.vertraege.map((v) => v.weg)).toEqual(['direkt', 'ukasse']);
    expect(l.vertraege[1]!.prognose!.bruttoMonat).toBeCloseTo(300, 6);
    expect(l.vertraege[1]!.prognose!.nettoMonat).toBeLessThan(300);
  });

  it('ohne Geburtsdatum keine Rechnung; ohne Werte kein Vertrag', () => {
    const d = beratung({ geburtsdatum: '' });
    expect(leistungsRechnung(firma, d, beitragsRechnung(firma, d))).toBeNull();
    const ohneWerte = beratung();
    expect(leistungsRechnung(firma, ohneWerte, beitragsRechnung(firma, ohneWerte))!.vertraege).toEqual([]);
  });
});
