import { describe, expect, it } from 'vitest';
import { bavMitarbeiter } from '@renten/engine';
import { beratungDatenSchema, firmenAngebotSchema, type BeratungDaten } from '@renten/schema';
import {
  P, beginnVon, beitragsRechnung, grvMinderungVon, grvVon, hochrechnung, kennzahlenRechnung, leistungsRechnung,
  monateDerUmwandlung, nettolohnHeute, probeabrechnung, rahmenVoll, reglerGrenzen, steuerVon, szenarioAusBeratung,
  umwandlungFuerNetto, versorgungslueckeRechnung,
} from './rechnung';

const firma = firmenAngebotSchema.parse({ bundesland: 'Bayern', modell: { art: 'zuschuss', quote: 0.5, deckelMonat: 100 } });
const matchingFirma = firmenAngebotSchema.parse({ modell: { art: 'matching', weg: 'dv', matchingMonat: 100 } });

/** Das Beispiel aus dem Gespraech: 54.000 € brutto, 200 € Umwandlung ab 01.01.2027, Rente ab 01.04.2052. */
const anna = (umwandlungMonat = 200, versicherer: Partial<BeratungDaten['versicherer']['direkt']> = {}): BeratungDaten =>
  beratungDatenSchema.parse({
    angaben: { name: 'Anna Beispiel', geburtsdatum: '15.03.1985', jahresbrutto: 54_000 },
    umwandlungMonat,
    entscheidung: { beginn: '01.01.2027' },
    versicherer: { direkt: versicherer },
  });
const HEUTE = new Date('2026-10-21T12:00:00');

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

  it('Beginn: laut Entscheidung, sonst laut Firma, sonst der nächste Monatserste', () => {
    const d = beratung();
    expect(beginnVon(d, firma, HEUTE)).toEqual({ jahr: 2026, monat: 11 });
    expect(beginnVon(d, firma, new Date('2026-12-05T12:00:00'))).toEqual({ jahr: 2027, monat: 1 });
    expect(beginnVon(d, { ...firma, beginn: '01.02.2027' }, HEUTE)).toEqual({ jahr: 2027, monat: 2 });
    expect(beginnVon(anna(), { ...firma, beginn: '01.02.2027' }, HEUTE)).toEqual({ jahr: 2027, monat: 1 });
  });

  it('Monate der Umwandlung: vom Beginn bis vor den Rentenbeginn', () => {
    expect(monateDerUmwandlung(anna(), firma, HEUTE)).toBe(303);
    expect(monateDerUmwandlung(beratung(), firma, HEUTE)).toBe(366);
    expect(monateDerUmwandlung(beratung({ geburtsdatum: '' }), firma, HEUTE)).toBe(0);
  });

  it('Minderung: fehlende Entgeltpunkte je Jahr × Jahre × Rentenwert, monatsgenau', () => {
    const d = anna();
    const m = grvMinderungVon(d, firma, beitragsRechnung(firma, d), P, HEUTE);
    expect(m.svFreiJahr).toBeCloseTo(2400, 6);
    expect(m.jahre).toBeCloseTo(25.25, 9);
    expect(m.entgeltpunkteJeJahr).toBeCloseTo(2400 / P.durchschnittsentgelt, 9);
    expect(m.renteMonat).toBeCloseTo(m.entgeltpunkteJeJahr * 25.25 * P.rentenwert, 9);
    // Rechtsstand 2026: 51.944 € Durchschnittsentgelt, 42,52 € Rentenwert — das Beispiel aus dem Gespräch
    if (P.jahr === 2026) expect(m.renteMonat).toBeCloseTo(49.61, 2);
    expect(m.ueberBbg).toBe(false);
  });

  it('über der Beitragsbemessungsgrenze keine Minderung', () => {
    const d = anna();
    const reich = { ...d, angaben: { ...d.angaben, jahresbrutto: 120_000 } };
    const m = grvMinderungVon(reich, firma, beitragsRechnung(firma, reich), P, HEUTE);
    expect(m.renteMonat).toBe(0);
    expect(m.ueberBbg).toBe(true);
  });
});

describe('Versorgungslücke', () => {
  it('Nettolohn heute gegen die gesetzliche Rente netto, in heutiger Kaufkraft', () => {
    const v = versorgungslueckeRechnung(firma, anna())!;
    expect(v.lohn.bruttoMonat).toBeCloseTo(4500, 6);
    expect(v.lohn.nettoMonat).toBeCloseTo(v.lohn.bruttoMonat - v.lohn.steuernMonat - v.lohn.svMonat, 6);
    expect(v.rente.nettoMonat).toBeGreaterThan(0);
    expect(v.rente.nettoMonat).toBeCloseTo(v.rente.bruttoMonat - v.rente.kvPvMonat - v.rente.steuerMonat, 6);
    expect(v.lueckeMonat).toBeCloseTo(v.lohn.nettoMonat - v.rente.nettoMonat, 6);
    expect(v.anteil).toBeCloseTo(v.rente.nettoMonat / v.lohn.nettoMonat, 9);
    expect(v.grv.geschaetzt).toBe(true);
    expect(v.rentenbeginn).toBe('01.04.2052');
    expect(v.alterBeiRentenbeginn).toBe(67);
  });

  it('eine eingetragene Rente ersetzt die Schätzung; ohne Geburtsdatum keine Rechnung', () => {
    const d = anna();
    const geschaetzt = versorgungslueckeRechnung(firma, d)!;
    const eingetragen = versorgungslueckeRechnung(firma, { ...d, angaben: { ...d.angaben, grvRente: 2500 } })!;
    expect(eingetragen.grv).toEqual({ monat: 2500, geschaetzt: false });
    expect(eingetragen.rente.nettoMonat).toBeGreaterThan(geschaetzt.rente.nettoMonat);
    expect(versorgungslueckeRechnung(firma, beratung({ geburtsdatum: '' }))).toBeNull();
  });

  it('der Nettolohn ist derselbe wie in der Probeabrechnung „ohne bAV“', () => {
    const d = anna();
    expect(probeabrechnung(firma, d, beitragsRechnung(firma, d)).netto.ohne).toBeCloseTo(nettolohnHeute(d.angaben, firma).nettoMonat, 9);
  });
});

describe('Netto-Regler', () => {
  it('netto → brutto → netto, auf den Cent', () => {
    const d = anna();
    for (const netto of [25, 80, 100, 160]) {
      const u = umwandlungFuerNetto(firma, d, netto);
      expect(beitragsRechnung(firma, { ...d, umwandlungMonat: u }).nettoAufwandMonat).toBeCloseTo(netto, 1);
    }
    expect(umwandlungFuerNetto(firma, d, 50)).toBeLessThan(umwandlungFuerNetto(firma, d, 60));
    expect(umwandlungFuerNetto(firma, d, 0)).toBe(0);
  });

  it('Grenzen: der steuerfreie Rahmen oben, „Rahmen voll“ als Marke', () => {
    const d = anna();
    const g = reglerGrenzen(firma, d);
    expect(g.maxUmwandlung).toBe(Math.floor((0.08 * P.bbgRvJahr) / 12));
    expect(umwandlungFuerNetto(firma, d, g.maxNetto + 500)).toBe(g.maxUmwandlung);
    expect(g.vollUmwandlung).toBeCloseTo(rahmenVoll(firma, d.angaben), 6);
    expect(g.vollNetto).toBeGreaterThan(0);
    expect(g.vollNetto).toBeLessThan(g.maxNetto);
  });
});

describe('Probeabrechnung', () => {
  it('Netto-Differenz = Eigenbeteiligung; Steuer- und SV-Differenz = Ersparnisse', () => {
    const d = anna();
    const r = beitragsRechnung(firma, d);
    const a = probeabrechnung(firma, d, r);
    expect(a.netto.ohne - a.netto.mit).toBeCloseTo(r.nettoAufwandMonat, 9);
    expect(a.eigenbeteiligungMonat).toBe(r.nettoAufwandMonat);
    expect(a.steuern.ohne - a.steuern.mit).toBeCloseTo(r.steuerersparnisMonat, 9);
    expect(a.sv.ohne - a.sv.mit).toBeCloseTo(r.svErsparnisMonat, 9);
    // Netto mit bAV = Brutto − Umwandlung − Steuern − Sozialabgaben
    expect(a.netto.mit).toBeCloseTo(a.bruttoMonat - a.umwandlungMonat - a.steuern.mit - a.sv.mit, 6);
    // innerhalb beider Rahmen sinken Steuer- und SV-Brutto um die ganze Umwandlung
    expect(a.steuerBrutto.mit).toBeCloseTo(4300, 6);
    expect(a.svBrutto.mit).toBeCloseTo(4300, 6);
  });

  it('über dem steuerfreien Rahmen bleibt der Rest steuerpflichtig', () => {
    const d = anna(700);
    const r = beitragsRechnung(firma, d);
    expect(r.steuerpflichtigMonat).toBeGreaterThan(0);
    expect(probeabrechnung(firma, d, r).steuerBrutto.mit).toBeCloseTo(4500 - 700 + r.steuerpflichtigMonat, 6);
  });
});

describe('Beispielhafte Hochrechnung', () => {
  it('ohne Zins: Kapital = Beiträge; die Teile ergeben die Beiträge', () => {
    const d = anna();
    const r = beitragsRechnung(firma, d);
    const h = hochrechnung(firma, d, r, 0, HEUTE);
    expect(h.monate).toBe(303);
    expect(h.beitraegeSumme).toBeCloseTo(r.gesamtMonat * 303, 6);
    expect(h.kapital).toBeCloseTo(h.beitraegeSumme, 6);
    expect(h.nettoSumme + h.ersparnisSumme + h.arbeitgeberSumme).toBeCloseTo(h.beitraegeSumme, 6);
  });

  it('mit Zins: vorschüssige Monatsbeiträge, Zinsanteil = Kapital − Beiträge', () => {
    const d = anna();
    const r = beitragsRechnung(firma, d);
    const h = hochrechnung(firma, d, r, 0.03, HEUTE);
    const i = Math.pow(1.03, 1 / 12) - 1;
    expect(h.kapital).toBeCloseTo(r.gesamtMonat * ((Math.pow(1 + i, 303) - 1) / i) * (1 + i), 6);
    expect(h.zinsen).toBeCloseTo(h.kapital - h.beitraegeSumme, 9);
    expect(hochrechnung(firma, d, r, 0.05, HEUTE).kapital).toBeGreaterThan(h.kapital);
  });
});

describe('Kennzahlen: Vertrag allein, wie im Vertrags-TÜV', () => {
  const werte = { garantierteRente: 180, prognoseRente: 260, prognoseKapital: 75_000 };

  it('Netto-Aufwand gegen Netto-Rente bis zur Lebenserwartung', () => {
    const d = anna(200, werte);
    const r = beitragsRechnung(firma, d);
    const k = kennzahlenRechnung(firma, d, leistungsRechnung(firma, d, r), P, HEUTE)!;
    expect(k.monateEinzahlung).toBe(303);
    expect(k.jahreAuszahlung).toBe(85 - 67);
    const p = k.prognose!;
    expect(p.summeEinzahlung).toBeCloseTo(r.nettoAufwandMonat * 303, 6);
    expect(p.summeAuszahlung).toBeCloseTo(p.netto * 12 * 18, 6);
    expect(p.nettoHebel).toBeCloseTo(p.summeAuszahlung / p.summeEinzahlung, 9);
    expect(p.echterGewinn).toBeCloseTo(p.summeAuszahlung - p.summeEinzahlung, 6);
    expect(p.amortisationsJahre).toBeCloseTo(p.summeEinzahlung / (p.netto * 12), 9);
    expect(p.rendite).toBeGreaterThan(0);
    expect(k.garantiert!.nettoHebel).toBeLessThan(p.nettoHebel);
    expect(k.kapital!.summeAuszahlung).toBeCloseTo(k.kapital!.netto, 6);
  });

  it('Lebenserwartung und Dynamik wirken; ohne Werte des Versicherers keine Kennzahlen', () => {
    const d = anna(200, werte);
    const r = beitragsRechnung(firma, d);
    const l = leistungsRechnung(firma, d, r);
    const basis = kennzahlenRechnung(firma, d, l, P, HEUTE)!;
    expect(kennzahlenRechnung(firma, { ...d, lebenserwartung: 90 }, l, P, HEUTE)!.prognose!.summeAuszahlung)
      .toBeGreaterThan(basis.prognose!.summeAuszahlung);
    const dyn = { ...d, versicherer: { ...d.versicherer, direkt: { ...d.versicherer.direkt, dynamik: 0.02 } } };
    expect(kennzahlenRechnung(firma, dyn, l, P, HEUTE)!.prognose!.summeEinzahlung)
      .toBeGreaterThan(basis.prognose!.summeEinzahlung);
    const leer = anna();
    expect(kennzahlenRechnung(firma, leer, leistungsRechnung(firma, leer, beitragsRechnung(firma, leer)), P, HEUTE)).toBeNull();
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
