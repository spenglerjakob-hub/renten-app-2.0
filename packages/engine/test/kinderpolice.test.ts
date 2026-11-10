import { describe, it, expect } from 'vitest';
import { PKV_VORGABE } from '../src/social/pkv.js';
import {
  kinderpoliceAuszahlung, kinderRentenbeginn, beitragBisVorschlag, KINDERPOLICE_LEBENSERWARTUNG,
} from '../src/analyse/kinderpolice.js';
import { vertragsTuev, type TuevAnnahmen, type TuevKontext } from '../src/analyse/vertrags-tuev.js';
import { parameterFuer } from '../src/params/registry.js';
import { projiziere } from '../src/projection/timeline.js';
import { istKinderpolice, type Szenario, type Vertrag, type VersichertePerson } from '../src/model.js';

const p = parameterFuer(2026, { indexRate: 0 });

/** Lena, geboren am 12.03.2025 — die Enkelin im Beispiel des Nutzers. */
const LENA: VersichertePerson = { vorname: 'Lena', geburtsdatum: '12.03.2025', rentenbeginn: '', steuersatzImAlter: 0.25 };

const szenario: Szenario = {
  schemaVersion: 1,
  haushalt: {
    verheiratet: false, bundesland: 'Nordrhein-Westfalen', kirchensteuer: false,
    hatKinder: false, kinderUnter25: 0, kinder: [], kvStatus: 'kvdr', kvErwerb: 'gesetzlich', pkv: PKV_VORGABE,
    zielNettoHeute: 2000,
  },
  annahmen: { inflation: 0.02, rentendynamik: 0.015, tarifIndex: 0.015, gehaltsdynamik: 0.02 },
  einkommenHeute: {
    modus: 'brutto', betrag: 4500, auszahlungen: 12,
    besoldungsgruppe: 'A13', besoldungsstufe: 4, besoldungsland: 'Bund',
    grvPflicht: false, grvBeitragMonat: 0,
  },
  personen: [{
    id: 'A', name: 'Opa', geburtsdatum: '1962-05-01', rentenbeginn: '2028-09-01',
    art: 'grv', grvBruttoHeute: 1800,
    besoldungsgruppe: 'A13', besoldungsstufe: 8, ruhegehaltssatz: 71.75,
    dienstbeginn: '2000-01-01', teilzeitphasen: [],
  }],
  vertraege: [],
  planer: { startkapital: 0, dauerJahre: 25, rendite: 0.02, dynamik: 0, insNettoEinrechnen: false },
};

const kinderpolice: Vertrag = {
  id: 'kind', inhaber: 'A', schicht: 3, typ: 'prvRente', name: 'Kinderpolice Lena',
  brutto: 600, kapitalAlternative: 150_000, strategie: 'rente', altvertrag: false,
  versichertePerson: LENA,
};

describe('Kinderpolice — Rentenbeginn und Beiträge', () => {
  it('Rente ab dem Monat nach dem 67. Geburtstag, Beiträge bis zum 18.', () => {
    expect(kinderRentenbeginn(LENA)).toEqual({ jahr: 2092, monat: 4, tag: 1 });
    expect(kinderRentenbeginn({ geburtsdatum: '15.12.2025', rentenbeginn: '' })).toEqual({ jahr: 2093, monat: 1, tag: 1 });
    expect(beitragBisVorschlag('12.03.2025')).toBe('12.03.2043');
    expect(beitragBisVorschlag('29.02.2024')).toBe('28.02.2042');
  });

  it('ein Vertragsende laut Vertrag geht vor', () => {
    expect(kinderRentenbeginn({ ...LENA, rentenbeginn: '01.07.2090' })).toEqual({ jahr: 2090, monat: 7, tag: 1 });
  });

  it('ohne lesbares Geburtsdatum gibt es nichts zu rechnen', () => {
    expect(kinderRentenbeginn({ geburtsdatum: '12.03.', rentenbeginn: '' })).toBeNull();
    expect(beitragBisVorschlag('')).toBeNull();
    expect(kinderpoliceAuszahlung({
      versichertePerson: { ...LENA, geburtsdatum: '' }, bruttoRenteMonat: 600, bruttoKapital: 0,
      beitragssumme: 0, vertragsbeginnJahr: 2026, altvertrag: false,
    })).toBeNull();
  });
});

describe('Kinderpolice — was bei Lena ankommt', () => {
  it('Rente: Ertragsanteil nach dem Alter des Kindes (67 → 17 %), zum angenommenen Satz von 25 %', () => {
    const a = kinderpoliceAuszahlung({
      versichertePerson: LENA, bruttoRenteMonat: 600, bruttoKapital: 0,
      beitragssumme: 9_800, vertragsbeginnJahr: 2026, altvertrag: false,
    })!;
    expect(a.alterBeiRentenbeginn).toBe(67);
    expect(a.ertragsanteil).toBe(0.17);
    expect(a.steuerMonat).toBeCloseTo(600 * 0.17 * 0.25, 6);
    expect(a.nettoRenteMonat).toBeCloseTo(574.5, 6);
  });

  it('Kapital: halber Ertrag (12 Jahre Laufzeit, Auszahlung nach 62), zum Satz des Kindes', () => {
    const a = kinderpoliceAuszahlung({
      versichertePerson: LENA, bruttoRenteMonat: 0, bruttoKapital: 150_000,
      beitragssumme: 9_800, vertragsbeginnJahr: 2026, altvertrag: false,
    })!;
    expect(a.halbeinkuenfte).toBe(true);
    expect(a.ertragKapital).toBeCloseTo(140_200, 6);
    expect(a.steuerKapital).toBeCloseTo(140_200 * 0.5 * 0.25, 6);
    expect(a.nettoKapital).toBeCloseTo(150_000 - 17_525, 6);
  });

  it('der Steuersatz ist eine Annahme und laesst sich aendern', () => {
    const ohne = kinderpoliceAuszahlung({
      versichertePerson: { ...LENA, steuersatzImAlter: 0 }, bruttoRenteMonat: 600, bruttoKapital: 150_000,
      beitragssumme: 9_800, vertragsbeginnJahr: 2026, altvertrag: false,
    })!;
    expect(ohne.nettoRenteMonat).toBe(600);
    expect(ohne.nettoKapital).toBe(150_000);
  });
});

describe('Vertrags-TÜV mit „Beiträge bis“', () => {
  const annahmen = (over: Partial<TuevAnnahmen> = {}): TuevAnnahmen => ({
    beitragMonat: 50, dynamik: 0, agZuschussMonat: 0, kinder: [],
    beginnJahr: 2026, beginnMonat: 12, lebenserwartung: KINDERPOLICE_LEBENSERWARTUNG,
    ...over,
  });
  const auszahlung = kinderpoliceAuszahlung({
    versichertePerson: LENA, bruttoRenteMonat: 600, bruttoKapital: 0,
    beitragssumme: 9_800, vertragsbeginnJahr: 2026, altvertrag: false,
  })!;
  const kontext: TuevKontext = {
    jahresbrutto: 54_000, zveHeute: 40_000, beamter: false, privatVersichert: false, pkvPraemieMonat: 0,
    selbststaendig: false, grvBeitragJahr: 0,
    rentenbeginnJahr: auszahlung.rentenbeginn.jahr, alterBeiRentenbeginn: auszahlung.alterBeiRentenbeginn,
    bruttoRenteMonat: auszahlung.bruttoRenteMonat, kvPvMonat: 0, steuerMonat: auszahlung.steuerMonat,
    nettoRenteMonat: auszahlung.nettoRenteMonat,
    bruttoKapital: 0, steuerKapital: 0, kvPvKapital: 0, nettoKapital: 0,
  };

  it('16 Jahre Beitrag von 12/2026 bis 03/2043, danach ruht der Vertrag bis 2092', () => {
    const r = vertragsTuev(kinderpolice, annahmen({ beitragBis: { jahr: 2043, monat: 3 } }), kontext, szenario, p);
    expect(r.monateEinzahlung).toBe(1 + 16 * 12 + 3);
    expect(r.summeEinzahlung).toBeCloseTo(196 * 50, 6);
    expect(r.jahreEinzahlung).toBe(2092 - 2026);
    expect(r.jahreAuszahlung).toBe(KINDERPOLICE_LEBENSERWARTUNG - 67);
    expect(r.summeAuszahlung).toBeCloseTo(574.5 * 12 * 23, 6);
    // Das Geld arbeitet in der Ruhezeit weiter — die Rendite liegt deutlich ueber null.
    expect(r.rendite).toBeGreaterThan(0.04);
    expect(r.rendite).toBeLessThan(0.08);
  });

  it('ohne Angabe rechnet der TÜV wie bisher bis zum Rentenbeginn', () => {
    const ohne = vertragsTuev(kinderpolice, annahmen(), kontext, szenario, p);
    const mitSpaetemEnde = vertragsTuev(kinderpolice, annahmen({ beitragBis: { jahr: 2200, monat: 12 } }), kontext, szenario, p);
    expect(mitSpaetemEnde).toEqual(ohne);
    expect(ohne.monateEinzahlung).toBe(1 + (2091 - 2026) * 12);
  });
});

describe('Die Kinderpolice zählt nicht zur eigenen Rente', () => {
  it('istKinderpolice erkennt sie an der versicherten Person', () => {
    expect(istKinderpolice(kinderpolice)).toBe(true);
    expect(istKinderpolice({ versichertePerson: undefined })).toBe(false);
  });

  it('die Zeitachse rechnet mit Kinderpolice genau wie ohne', () => {
    const ohne = projiziere(szenario);
    const mit = projiziere({ ...szenario, vertraege: [kinderpolice] });
    expect(mit).toEqual(ohne);
  });

  it('andere Verträge bleiben drin', () => {
    const eigene: Vertrag = { ...kinderpolice, id: 'eigen', versichertePerson: undefined, brutto: 300 };
    const nurEigene = projiziere({ ...szenario, vertraege: [eigene] });
    const beide = projiziere({ ...szenario, vertraege: [kinderpolice, eigene] });
    expect(beide).toEqual(nurEigene);
    expect(beide.zeilen.find((z) => z.jahr === 2029)!.posten.some((x) => x.id === 'eigen')).toBe(true);
  });
});
