import { describe, it, expect } from 'vitest';
import {
  bavMitarbeiter, bavRahmenVoll, grvMinderung, type FirmenModell, type MitarbeiterEingaben,
} from '../src/analyse/bav-mitarbeiter.js';
import {
  zuschussModell, festbetragModell, matchingModell, zuschussVollAusschoepfen, festbetragVollAusschoepfen,
} from '../src/analyse/matching-modell.js';
import { bruttoZuNetto } from '../src/erwerb/netto.js';
import { parameterFuer } from '../src/params/registry.js';

const p = parameterFuer(2026, { indexRate: 0 });
const steuer = { verheiratet: false, bundesland: 'Nordrhein-Westfalen', kirchensteuerpflichtig: false };
const svGrenze = (0.04 * p.bbgRvJahr) / 12;
const ohneKinder = { hatKinder: false, kinderUnter25: 0 };

const ma = (over: Partial<MitarbeiterEingaben> = {}): MitarbeiterEingaben => ({
  jahresbrutto: 48_000,
  umwandlungMonat: 150,
  privatVersichert: false,
  pkvPraemieMonat: 0,
  kinder: ohneKinder,
  bavBestandMonat: 0,
  ...over,
});

const ZUSCHUSS: FirmenModell = { art: 'zuschuss', quote: 0.5, deckelMonat: 100 };
const FESTBETRAG: FirmenModell = { art: 'festbetrag', festbetragMonat: 50, mindestUmwandlungMonat: 50 };
const MATCHING: FirmenModell = { art: 'matching', weg: 'dv', matchingMonat: 100, zuschussImMatching: false };

/** Was die Arbeitgeber-Seiten fuer denselben Mitarbeiter rechnen. */
const agSeite = {
  jahresbrutto: 48_000, umwandlungMonat: 150, unternehmensSteuersatz: 0.3, umlagenSatz: 0.02,
  privatVersichert: false, pkvPraemieMonat: 0, kinder: ohneKinder,
};

describe('Mitarbeiter-Sicht: dieselben Zahlen wie auf den Arbeitgeber-Seiten', () => {
  it('Zuschussmodell', () => {
    const r = bavMitarbeiter(ZUSCHUSS, ma(), steuer, p);
    const ag = zuschussModell({ ...agSeite, quote: 0.5, deckelMonat: 100 }, steuer, p);
    expect(r.nettoAufwandMonat).toBeCloseTo(ag.mitarbeiter.nettoAufwandMonat, 6);
    expect(r.arbeitgeberMonat).toBeCloseTo(ag.arbeitgeber.zuschussMonat, 6);
    expect(r.gesamtMonat).toBeCloseTo(ag.vertragMonat, 6);
    expect(r.arbeitgeberMonat).toBeCloseTo(75, 6);
    expect(r.pflichtzuschussMonat + r.freiwilligMonat).toBeCloseTo(r.arbeitgeberMonat, 6);
    expect(r.vertraege).toEqual([{ weg: 'direkt', beitragMonat: r.gesamtMonat, arbeitgeberMonat: r.arbeitgeberMonat }]);
  });

  it('Festbetrag-Modell: ab der Mindestumwandlung der Festbetrag, darunter der Pflichtzuschuss', () => {
    const r = bavMitarbeiter(FESTBETRAG, ma(), steuer, p);
    const ag = festbetragModell({ ...agSeite, festbetragMonat: 50, mindestUmwandlungMonat: 50 }, steuer, p);
    expect(r.nettoAufwandMonat).toBeCloseTo(ag.mitarbeiter.nettoAufwandMonat, 6);
    expect(r.arbeitgeberMonat).toBeCloseTo(50, 6);

    const darunter = bavMitarbeiter(FESTBETRAG, ma({ umwandlungMonat: 40 }), steuer, p);
    expect(darunter.arbeitgeberMonat).toBeCloseTo(6, 1);
    expect(darunter.hinweise.some((h) => h.includes('ab 50 €'))).toBe(true);
  });

  it('Matching-Modell: Direktversicherung und Unterstützungskasse getrennt', () => {
    const r = bavMitarbeiter(MATCHING, ma(), steuer, p);
    const ag = matchingModell({ ...agSeite, weg: 'dv', matchingMonat: 100, zuschussImMatching: false }, steuer, p);
    expect(r.nettoAufwandMonat).toBeCloseTo(ag.mitarbeiter.nettoAufwandMonat, 6);
    expect(r.gesamtMonat).toBeCloseTo(ag.vertrag.gesamtMonat, 6);
    expect(r.vertraege.map((v) => v.weg)).toEqual(['direkt', 'ukasse']);
    const [dv, uk] = r.vertraege;
    expect(dv!.beitragMonat).toBeCloseTo(150 + ag.arbeitgeber.pflichtzuschussMonat, 6);
    expect(uk!.beitragMonat).toBeCloseTo(100, 6);
    expect(uk!.arbeitgeberMonat).toBeCloseTo(100, 6);
    expect(r.freiwilligMonat).toBeCloseTo(100, 6);
  });

  it('Matching mit Umwandlung in die Unterstützungskasse: ein Vertrag, kein Pflichtzuschuss', () => {
    const r = bavMitarbeiter({ ...MATCHING, weg: 'ukasse' } as FirmenModell, ma(), steuer, p);
    expect(r.pflichtzuschussMonat).toBe(0);
    expect(r.vertraege).toHaveLength(1);
    expect(r.vertraege[0]!.weg).toBe('ukasse');
    expect(r.vertraege[0]!.beitragMonat).toBeCloseTo(250, 6);
  });
});

describe('Hinweise für den Mitarbeiter', () => {
  it('Deckel des Zuschusses', () => {
    const r = bavMitarbeiter(ZUSCHUSS, ma({ umwandlungMonat: 250 }), steuer, p);
    expect(r.arbeitgeberMonat).toBeCloseTo(100, 6);
    expect(r.hinweise.some((h) => h.includes('gedeckelt'))).toBe(true);
  });

  it('Über dem beitragsfreien Rahmen: Sozialabgaben auf den Rest', () => {
    const r = bavMitarbeiter(ZUSCHUSS, ma({ umwandlungMonat: 400 }), steuer, p);
    expect(r.svPflichtigMonat).toBeGreaterThan(100);
    expect(r.hinweise.some((h) => h.includes('weiter Sozialabgaben'))).toBe(true);
  });

  it('ohne Umwandlung keine Hinweise', () => {
    expect(bavMitarbeiter(ZUSCHUSS, ma({ umwandlungMonat: 0 }), steuer, p).hinweise).toEqual([]);
  });
});

describe('Verheiratet: das Einkommen des Partners zählt mit', () => {
  it('mit Partnereinkommen spart die Umwandlung mehr Steuer', () => {
    const verh = { ...steuer, verheiratet: true };
    const allein = bavMitarbeiter(ZUSCHUSS, ma(), verh, p);
    const partnerZve = bruttoZuNetto(48_000, { ...steuer, kinder: ohneKinder }, p).zve;
    const zuZweit = bavMitarbeiter(ZUSCHUSS, ma(), { ...verh, partnerZveJahr: partnerZve }, p);
    expect(zuZweit.steuerersparnisMonat).toBeGreaterThan(allein.steuerersparnisMonat + 5);
    expect(zuZweit.nettoAufwandMonat).toBeLessThan(allein.nettoAufwandMonat);
  });

  it('ledig: ein Partnereinkommen wird nicht gelesen', () => {
    const ohne = bavMitarbeiter(ZUSCHUSS, ma(), steuer, p);
    const mit = bavMitarbeiter(ZUSCHUSS, ma(), { ...steuer, partnerZveJahr: 80_000 }, p);
    expect(mit.steuerersparnisMonat).toBeCloseTo(ohne.steuerersparnisMonat, 9);
  });
});

describe('Rahmen voll nutzen', () => {
  it('Zuschussmodell: wie auf der Zuschuss-Seite', () => {
    const v = bavRahmenVoll(ZUSCHUSS, ma(), steuer.bundesland, p);
    expect(v).toBeCloseTo(zuschussVollAusschoepfen(
      { jahresbrutto: 48_000, privatVersichert: false, pkvPraemieMonat: 0, quote: 0.5, deckelMonat: 100 }, steuer.bundesland, p,
    ), 6);
  });

  it('Festbetrag-Modell: Umwandlung und Festbetrag füllen den beitragsfreien Rahmen', () => {
    const v = bavRahmenVoll(FESTBETRAG, ma(), steuer.bundesland, p);
    const r = bavMitarbeiter(FESTBETRAG, ma({ umwandlungMonat: v }), steuer, p);
    expect(r.gesamtMonat).toBeLessThanOrEqual(svGrenze + 0.01);
    expect(r.gesamtMonat).toBeGreaterThan(svGrenze - 0.05);
    expect(r.svPflichtigMonat).toBeCloseTo(0, 6);
    expect(v).toBeCloseTo(festbetragVollAusschoepfen(
      { jahresbrutto: 48_000, privatVersichert: false, pkvPraemieMonat: 0, festbetragMonat: 50, mindestUmwandlungMonat: 50 },
      steuer.bundesland, p,
    ), 6);
  });

  it('Eine bestehende bAV belegt den Rahmen zuerst', () => {
    const frei = bavRahmenVoll(ZUSCHUSS, ma(), steuer.bundesland, p);
    const belegt = bavRahmenVoll(ZUSCHUSS, ma({ bavBestandMonat: 100 }), steuer.bundesland, p);
    expect(belegt).toBeLessThan(frei - 50);
  });
});

describe('Minderung der gesetzlichen Rente', () => {
  it('weniger Entgeltpunkte für den beitragsfreien Teil', () => {
    const g = grvMinderung(48_000, 150, 30, p);
    expect(g.entgeltpunkte).toBeCloseTo((150 * 12 / p.durchschnittsentgelt) * 30, 9);
    expect(g.renteMonat).toBeCloseTo(g.entgeltpunkte * p.rentenwert, 9);
    expect(g.renteMonat).toBeGreaterThan(0);
  });

  it('über der Beitragsbemessungsgrenze kostet die Umwandlung keine Entgeltpunkte', () => {
    expect(grvMinderung(p.bbgRvJahr + 10_000, 300, 30, p).entgeltpunkte).toBe(0);
  });

  it('ohne Jahre oder ohne beitragsfreien Teil keine Minderung', () => {
    expect(grvMinderung(48_000, 150, 0, p).renteMonat).toBe(0);
    expect(grvMinderung(48_000, 0, 30, p).renteMonat).toBe(0);
  });
});
