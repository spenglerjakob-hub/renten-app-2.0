import { describe, expect, it } from 'vitest';
import { bavMitarbeiter } from '@renten/engine';
import { beratungDatenSchema, firmenAngebotSchema, type BeratungDaten } from '@renten/schema';
import {
  HOCHRECHNUNG_FEST, P, RENTENANPASSUNG, basisProjektion, automatischerBeginn, beginnDatum, beginnVon, hochrechnungJeVertrag, beitragsRechnung, grvVon, hochrechnung, kennzahlenRechnung, leistungsRechnung,
  laufendesJahresbrutto, monateDerUmwandlung, monatsgehalt, nettolohnHeute, probeabrechnung, rahmenVoll, reglerGrenzen, steuerVon, szenarioAusBeratung,
  umwandlungFuerNetto, versorgungslueckeRechnung, type HochrechnungAnnahmen,
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

  it('leeres Bundesland: das der Firma; gerechnet wird mit der Steuerklasse, das Gehalt des Partners zählt nicht', () => {
    expect(steuerVon(beratung().angaben, firma)).toMatchObject({ bundesland: 'Bayern', steuerklasse: 1, verheiratet: false });
    expect(steuerVon(beratung({ bundesland: 'Hessen' }).angaben, firma).bundesland).toBe('Hessen');
    // Beratungen von vorher: verheiratet ohne Einkommen des Partners ist III, mit Einkommen IV
    expect(steuerVon(beratung({ verheiratet: true, partnerBrutto: 0 }).angaben, firma)).toMatchObject({ steuerklasse: 3, verheiratet: true });
    expect(steuerVon(beratung({ verheiratet: true, partnerBrutto: 40_000 }).angaben, firma)).toMatchObject({ steuerklasse: 4, verheiratet: false });
    expect(steuerVon(beratung({ verheiratet: true, partnerBrutto: 40_000 }).angaben, firma).partnerZveJahr).toBeUndefined();
  });

  it('Beratungen von vorher rechnen wie bisher: ledig im Grundtarif, verheiratet ohne Einkommen des Partners im Splitting', () => {
    const ma = { jahresbrutto: 48_000, umwandlungMonat: 150, privatVersichert: false, pkvPraemieMonat: 0, kinder: { hatKinder: false, kinderUnter25: 0 }, bavBestandMonat: 0 };
    const modell = { art: 'zuschuss', quote: 0.5, deckelMonat: 100 } as const;
    const bisher = (verheiratet: boolean) => bavMitarbeiter(modell, ma, { verheiratet, bundesland: 'Bayern', kirchensteuerpflichtig: false, partnerZveJahr: 0 }, P);
    expect(beitragsRechnung(firma, beratung()).nettoAufwandMonat).toBeCloseTo(bisher(false).nettoAufwandMonat, 9);
    expect(beitragsRechnung(firma, beratung({ verheiratet: true, partnerBrutto: 0 })).nettoAufwandMonat).toBeCloseTo(bisher(true).nettoAufwandMonat, 9);
  });

  it('Steuerklasse V spart bei der Umwandlung mehr Lohnsteuer als I, III weniger', () => {
    const netto = (steuerklasse: 1 | 3 | 5) => beitragsRechnung(firma, beratung({ steuerklasse })).nettoAufwandMonat;
    expect(netto(5)).toBeLessThan(netto(1));
    expect(netto(3)).toBeGreaterThan(netto(1));
  });

  it('Monatsgehalt: der Monat rechnet mit zwölf Monatsgehältern, die Versorgungslücke mit dem ganzen Jahr', () => {
    // 3.750 € × 13 = 48.750 € im Jahr
    const d = beratung({ jahresbrutto: 48_750, gehaelter: 13 });
    expect(monatsgehalt(d.angaben)).toBeCloseTo(3750, 9);
    expect(laufendesJahresbrutto(d.angaben)).toBeCloseTo(45_000, 9);
    expect(probeabrechnung(firma, d, beitragsRechnung(firma, d)).bruttoMonat).toBeCloseTo(3750, 9);
    expect(nettolohnHeute(d.angaben, firma, P, 'jahr').bruttoMonat).toBeCloseTo(48_750 / 12, 9);
    // Mit zwölf Gehältern ist der Monat ein Zwölftel des Jahres — wie bisher
    const zwoelf = beratung();
    expect(laufendesJahresbrutto(zwoelf.angaben)).toBe(48_000);
    expect(nettolohnHeute(zwoelf.angaben, firma).nettoMonat).toBe(nettolohnHeute(zwoelf.angaben, firma, P, 'jahr').nettoMonat);
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
});

describe('Beginn automatisch', () => {
  it('der nächste Monatserste — oder der Beginn laut Angebot; ein eingetragener gilt', () => {
    const ohne = firmenAngebotSchema.parse({});
    expect(automatischerBeginn(ohne, new Date('2026-10-21T12:00:00'))).toBe('01.11.2026');
    expect(automatischerBeginn(ohne, new Date('2026-12-05T12:00:00'))).toBe('01.01.2027');
    expect(automatischerBeginn({ ...ohne, beginn: '01.03.2027' }, HEUTE)).toBe('01.03.2027');
    const d = beratungDatenSchema.parse({ angaben: { geburtsdatum: '15.03.1985' } });
    expect(beginnDatum(d, ohne, HEUTE)).toBe('01.11.2026');
    expect(beginnVon(d, ohne, HEUTE)).toEqual({ jahr: 2026, monat: 11 });
    const eingetragen = { ...d, entscheidung: { ...d.entscheidung, beginn: '01.02.2027' } };
    expect(beginnDatum(eingetragen, ohne, HEUTE)).toBe('01.02.2027');
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
    // In ganzen Prozent, zusammen 100
    expect(v.renteProzent + v.lueckeProzent).toBe(100);
    expect(Math.abs(v.lueckeProzent - (v.lueckeMonat / v.lohn.nettoMonat) * 100)).toBeLessThanOrEqual(0.5 + 1e-9);
    expect(v.rentenanpassung).toBe(RENTENANPASSUNG);
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
    // Reicht die Rente, fehlt nichts
    const reicht = versorgungslueckeRechnung(firma, { ...d, angaben: { ...d.angaben, grvRente: 6000 } })!;
    expect(reicht.lueckeMonat).toBe(0);
    expect(reicht.lueckeProzent).toBe(0);
  });

  it('Rentenanpassung der Beratung: 1,5 % im Szenario, für Lücke und Leistung', () => {
    expect(RENTENANPASSUNG).toBe(0.015);
    const d = anna();
    expect(szenarioAusBeratung(d.angaben, firma, 1500).annahmen.rentendynamik).toBe(0.015);
  });

  it('der Nettolohn ist derselbe wie in der Probeabrechnung „ohne bAV“', () => {
    const d = anna();
    expect(probeabrechnung(firma, d, beitragsRechnung(firma, d)).netto.ohne).toBeCloseTo(nettolohnHeute(d.angaben, firma).nettoMonat, 9);
  });
});

describe('Netto-Regler', () => {
  it('netto → brutto → netto, auf den Cent', () => {
    const d = anna();
    for (const netto of [25, 80, 100, 120]) {
      const u = umwandlungFuerNetto(firma, d, netto);
      expect(beitragsRechnung(firma, { ...d, umwandlungMonat: u }).nettoAufwandMonat).toBeCloseTo(netto, 1);
    }
    expect(umwandlungFuerNetto(firma, d, 50)).toBeLessThan(umwandlungFuerNetto(firma, d, 60));
    expect(umwandlungFuerNetto(firma, d, 0)).toBe(0);
  });

  it('Grenze: der Rahmen frei von Sozialabgaben — 4 % der BBG mit dem Arbeitgeberbeitrag', () => {
    const d = anna();
    const g = reglerGrenzen(firma, d);
    expect(g.maxUmwandlung).toBeCloseTo(rahmenVoll(firma, d.angaben), 6);
    expect(g.rahmenMonat).toBeCloseTo((0.04 * P.bbgRvJahr) / 12, 9);
    // Zuschuss 50 % bis 100 €: Umwandlung und Zuschuss füllen den Rahmen genau
    const r = beitragsRechnung(firma, { ...d, umwandlungMonat: g.maxUmwandlung });
    expect(r.gesamtMonat).toBeCloseTo(g.rahmenMonat, 0);
    expect(r.svPflichtigMonat).toBeCloseTo(0, 6);
    expect(g.maxNetto).toBeCloseTo(r.nettoAufwandMonat, 9);
    // Mehr netto, als der Rahmen hergibt: der volle Rahmen, nicht mehr
    expect(umwandlungFuerNetto(firma, d, g.maxNetto + 500)).toBe(g.maxUmwandlung);
  });

  it('Unterstützungskasse: Die Umwandlung allein füllt den Rahmen', () => {
    const uk = firmenAngebotSchema.parse({ modell: { art: 'matching', weg: 'ukasse', matchingMonat: 100 } });
    expect(reglerGrenzen(uk, anna()).maxUmwandlung).toBeCloseTo(Math.floor(((0.04 * P.bbgRvJahr) / 12) * 100) / 100, 6);
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

describe('Beispielhafte Hochrechnung — wie das ETF-Depot im Rechner, mit festen Annahmen', () => {
  const mitRendite = (d: BeratungDaten, renditeAnsparphase: number): BeratungDaten => ({ ...d, hochrechnung: { renditeAnsparphase } });
  const annahmen = (a: Partial<HochrechnungAnnahmen>): HochrechnungAnnahmen => ({ ...HOCHRECHNUNG_FEST, renditeAnsparphase: 0.06, ...a });

  it('fest im Hintergrund: 2 % in der Entnahmephase, kein Ausgabeaufschlag, 1,5 % laufende Kosten, 30 Jahre', () => {
    expect(HOCHRECHNUNG_FEST).toEqual({ renditeEntnahme: 0.02, ausgabeaufschlag: 0, ter: 0.015, entnahmedauer: 30 });
  });

  it('Vorgabe 6 %: Kapital mit 4,5 % nach Kosten, Rente mit 0,5 % über 30 Jahre', () => {
    const d = anna();
    const r = beitragsRechnung(firma, d);
    const h = hochrechnung(firma, d, r, HEUTE);
    expect(h.annahmen).toEqual({ ...HOCHRECHNUNG_FEST, renditeAnsparphase: 0.06 });
    expect(h.monate).toBe(303);
    expect(h.beitragMonat).toBeCloseTo(r.gesamtMonat, 9);
    expect(h.beitraegeSumme).toBeCloseTo(r.gesamtMonat * 303, 6);
    expect(h.nettoSumme + h.ersparnisSumme + h.arbeitgeberSumme).toBeCloseTo(h.beitraegeSumme, 6);
    const i = Math.pow(1.045, 1 / 12) - 1;
    expect(h.kapital).toBeCloseTo(r.gesamtMonat * ((Math.pow(1 + i, 303) - 1) / i) * (1 + i), 6);
    expect(h.ertrag).toBeCloseTo(h.kapital - h.beitraegeSumme, 9);
    // Dieselbe Formel wie die „Entnahme brutto“ des Depots (`entnahmeplan`)
    expect(h.renteMonat * 12).toBeCloseTo((h.kapital * 0.005) / (1 - Math.pow(1.005, -30)), 6);
    // Anna: 300 € im Monat über 303 Monate
    expect(Math.round(h.kapital)).toBe(167_044);
    expect(Math.round(h.renteMonat)).toBe(501);
  });

  it('die Rendite aus der Beratung wirkt auf Kapital und Rente; die festen Annahmen bleiben', () => {
    const d = anna();
    const r = beitragsRechnung(firma, d);
    const h6 = hochrechnung(firma, d, r, HEUTE);
    const h8 = hochrechnung(firma, mitRendite(d, 0.08), r, HEUTE);
    expect(h8.annahmen).toEqual({ ...HOCHRECHNUNG_FEST, renditeAnsparphase: 0.08 });
    expect(h8.kapital).toBeGreaterThan(h6.kapital);
    // Dieselbe Entnahme: Die Rente waechst im selben Verhaeltnis wie das Kapital
    expect(h8.renteMonat / h8.kapital).toBeCloseTo(h6.renteMonat / h6.kapital, 12);
  });

  it('Formel: Rendite gleich Kosten ergibt Kapital = Beiträge; Ausgabeaufschlag je Beitrag; nicht unter null', () => {
    const d = anna();
    const r = beitragsRechnung(firma, d);
    const h = hochrechnung(firma, d, r, HEUTE, annahmen({ renditeAnsparphase: 0.015 }));
    expect(h.kapital).toBeCloseTo(h.beitraegeSumme, 6);
    const aufschlag = hochrechnung(firma, d, r, HEUTE, annahmen({ renditeAnsparphase: 0.015, ausgabeaufschlag: 0.05 }));
    expect(aufschlag.kapital).toBeCloseTo(h.beitraegeSumme * 0.95, 6);
    expect(aufschlag.ertrag).toBeCloseTo(-h.beitraegeSumme * 0.05, 6);
    expect(hochrechnung(firma, d, r, HEUTE, annahmen({ renditeAnsparphase: 0.01 })).kapital).toBeCloseTo(h.beitraegeSumme, 6);
  });

  it('je Vertrag nach dem Anteil am Beitrag — im Matching-Modell geteilt', () => {
    const d = anna();
    const r = beitragsRechnung(firma, d);
    const h = hochrechnung(firma, d, r, HEUTE);
    expect(hochrechnungJeVertrag(h, r, 'direkt')).toEqual({ renteMonat: Math.round(h.renteMonat), kapital: Math.round(h.kapital) });
    const rm = beitragsRechnung(matchingFirma, d);
    const hm = hochrechnung(matchingFirma, d, rm, HEUTE);
    const teile = rm.vertraege.map((v) => hochrechnungJeVertrag(hm, rm, v.weg));
    expect(teile.length).toBe(2);
    expect(Math.abs(teile.reduce((x, t) => x + t.kapital, 0) - hm.kapital)).toBeLessThanOrEqual(1);
    expect(Math.abs(teile.reduce((x, t) => x + t.renteMonat, 0) - hm.renteMonat)).toBeLessThanOrEqual(1);
  });

  it('Formel: Entnahme ohne Rendite nach Kosten ist das Kapital geteilt durch die Monate', () => {
    const d = anna();
    const h = hochrechnung(firma, d, beitragsRechnung(firma, d), HEUTE, annahmen({ renditeEntnahme: 0.01, entnahmedauer: 25 }));
    expect(h.renteMonat).toBeCloseTo(h.kapital / (25 * 12), 6);
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

  it('aus der geschätzten Hochrechnung übernommen: so gekennzeichnet', () => {
    const d = anna(200, { ...werte, ausHochrechnung: false });
    const r = beitragsRechnung(firma, d);
    expect(kennzahlenRechnung(firma, d, leistungsRechnung(firma, d, r), P, HEUTE)!.geschaetzt).toBe(false);
    const h = hochrechnung(firma, d, r, HEUTE);
    const g = { ...d, versicherer: { ...d.versicherer, direkt: { ...d.versicherer.direkt, prognoseRente: Math.round(h.renteMonat), prognoseKapital: Math.round(h.kapital), ausHochrechnung: true } } };
    const k = kennzahlenRechnung(firma, g, leistungsRechnung(firma, g, r), P, HEUTE)!;
    expect(k.geschaetzt).toBe(true);
    expect(k.prognose!.summeEinzahlung).toBeCloseTo(r.nettoAufwandMonat * 303, 6);
  });
});

describe('Szenario aus den Angaben', () => {
  it('Steuer im Alter: bei III im Splitting mit einem Partner ohne Einkommen und Rente, sonst eine Person im Grundtarif', () => {
    const ledig = szenarioAusBeratung(beratung().angaben, firma, 1400);
    expect(ledig.personen).toHaveLength(1);
    expect(ledig.personen[0]!.grvBruttoHeute).toBe(1400);
    expect(ledig.haushalt.bundesland).toBe('Bayern');
    const drei = szenarioAusBeratung(beratung({ steuerklasse: 3 }).angaben, firma, 1400);
    expect(drei.personen).toHaveLength(2);
    expect(drei.haushalt.verheiratet).toBe(true);
    expect(drei.personen[1]!.grvBruttoHeute).toBe(0);
    for (const steuerklasse of [4, 5] as const) {
      const s = szenarioAusBeratung(beratung({ steuerklasse, verheiratet: true }).angaben, firma, 1400);
      expect(s.personen).toHaveLength(1);
      expect(s.haushalt.verheiratet).toBe(false);
    }
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
    const werte = { beitragMonat: 0, garantierteRente: 420, prognoseRente: 600, prognoseKapital: 162_000, dynamik: 0, ausHochrechnung: false };
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

  it('ohne Minderung: die gesetzliche Rente bleibt, wie sie ist', () => {
    const { d, r, f } = mitWerten();
    const l = leistungsRechnung(f, d, r)!;
    expect(l).not.toHaveProperty('grvMinderungMonat');
    expect(l).not.toHaveProperty('plusHaushaltMonat');
    // Dieselbe Projektion wie die Versorgungsluecke: Die gesetzliche Rente im Szenario ist die unveraenderte
    expect(basisProjektion(d.angaben, f).grv.monat).toBe(1450);
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
