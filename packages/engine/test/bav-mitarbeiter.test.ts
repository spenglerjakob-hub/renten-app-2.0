import { describe, it, expect } from 'vitest';
import {
  bavMitarbeiter, bavRahmenVoll, bavSteuerRahmenVoll, grvMinderung, type FirmenModell, type MitarbeiterEingaben,
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

describe('Netto-Belastung des Arbeitgebers', () => {
  const firma = { unternehmensSteuersatz: 0.3, umlagenSatz: 0.02 };

  it('dieselben Posten wie auf den Arbeitgeber-Seiten', () => {
    const z = bavMitarbeiter(ZUSCHUSS, ma(), steuer, p, firma).arbeitgeberBelastung;
    const agZ = zuschussModell({ ...agSeite, quote: 0.5, deckelMonat: 100 }, steuer, p).arbeitgeber;
    expect(z).toEqual({
      beitragMonat: agZ.zuschussMonat, svErsparnisMonat: agZ.svErsparnisMonat, umlagenErsparnisMonat: agZ.umlagenErsparnisMonat,
      kostenVorSteuerMonat: agZ.kostenVorSteuerMonat, steuerersparnisMonat: agZ.steuerersparnisMonat, nettoKostenMonat: agZ.nettoKostenMonat,
    });

    const f = bavMitarbeiter(FESTBETRAG, ma(), steuer, p, firma).arbeitgeberBelastung;
    const agF = festbetragModell({ ...agSeite, festbetragMonat: 50, mindestUmwandlungMonat: 50 }, steuer, p).arbeitgeber;
    expect(f.beitragMonat).toBeCloseTo(agF.zuschussMonat, 9);
    expect(f.nettoKostenMonat).toBeCloseTo(agF.nettoKostenMonat, 9);

    const m = bavMitarbeiter(MATCHING, ma(), steuer, p, firma).arbeitgeberBelastung;
    const agM = matchingModell({ ...agSeite, weg: 'dv', matchingMonat: 100, zuschussImMatching: false }, steuer, p).arbeitgeber;
    expect(m.beitragMonat).toBeCloseTo(agM.pflichtzuschussMonat + agM.ukasseMonat, 9);
    expect(m.svErsparnisMonat).toBeCloseTo(agM.svErsparnisMonat, 9);
    expect(m.nettoKostenMonat).toBeCloseTo(agM.nettoKostenMonat, 9);
  });

  it('die Posten gehen auf: Beitrag − Sozialabgaben − Umlagen − Steuer = netto', () => {
    for (const modell of [ZUSCHUSS, FESTBETRAG, MATCHING]) {
      const r = bavMitarbeiter(modell, ma(), steuer, p, firma);
      const b = r.arbeitgeberBelastung;
      expect(b.beitragMonat).toBeCloseTo(r.arbeitgeberMonat, 9);
      expect(b.svErsparnisMonat).toBeGreaterThan(0);
      expect(b.umlagenErsparnisMonat).toBeCloseTo(150 * 0.02, 9);
      expect(b.beitragMonat - b.svErsparnisMonat - b.umlagenErsparnisMonat).toBeCloseTo(b.kostenVorSteuerMonat, 9);
      expect(b.steuerersparnisMonat).toBeCloseTo(b.kostenVorSteuerMonat * 0.3, 9);
      expect(b.kostenVorSteuerMonat - b.steuerersparnisMonat).toBeCloseTo(b.nettoKostenMonat, 9);
      expect(b.nettoKostenMonat).toBeLessThan(b.beitragMonat);
    }
  });

  it('die Seite des Mitarbeiters ändert sich mit den Sätzen der Firma nicht', () => {
    for (const modell of [ZUSCHUSS, FESTBETRAG, MATCHING]) {
      const { arbeitgeberBelastung: ohneSaetze, ...ohne } = bavMitarbeiter(modell, ma(), steuer, p);
      const { arbeitgeberBelastung: mitSaetzen, ...mit } = bavMitarbeiter(modell, ma(), steuer, p, { unternehmensSteuersatz: 0.45, umlagenSatz: 0.035 });
      expect(mit).toEqual(ohne);
      expect(mitSaetzen.beitragMonat).toBe(ohneSaetze.beitragMonat);
      expect(mitSaetzen.nettoKostenMonat).toBeLessThan(ohneSaetze.nettoKostenMonat - 1);
    }
  });

  it('ohne Sätze: keine Umlagen, keine Steuer — netto sind die Kosten vor Steuer', () => {
    const b = bavMitarbeiter(ZUSCHUSS, ma(), steuer, p).arbeitgeberBelastung;
    expect(b.umlagenErsparnisMonat).toBe(0);
    expect(b.steuerersparnisMonat).toBe(0);
    expect(b.nettoKostenMonat).toBe(b.kostenVorSteuerMonat);
  });

  it('nur der Pflichtzuschuss: Die gesparten Abgaben übersteigen ihn — netto bleibt eine Ersparnis', () => {
    const r = bavMitarbeiter({ art: 'zuschuss', quote: 0, deckelMonat: 0 }, ma(), steuer, p, firma);
    expect(r.arbeitgeberMonat).toBeCloseTo(0.15 * 150, 6);
    expect(r.arbeitgeberBelastung.kostenVorSteuerMonat).toBeLessThan(0);
    // Die Ersparnis erhoeht den Gewinn: Die Steuer darauf schmaelert sie, hebt sie aber nicht auf.
    expect(r.arbeitgeberBelastung.steuerersparnisMonat).toBeLessThan(0);
    expect(r.arbeitgeberBelastung.nettoKostenMonat).toBeLessThan(0);
    expect(r.arbeitgeberBelastung.nettoKostenMonat).toBeGreaterThan(r.arbeitgeberBelastung.kostenVorSteuerMonat);
  });
});

describe('Zuschussmodell mit Deckel 0: ohne Deckel', () => {
  const OHNE: FirmenModell = { art: 'zuschuss', quote: 0.5, deckelMonat: 0 };

  it('der Zuschuss wächst mit der Umwandlung, kein Hinweis auf einen Deckel', () => {
    const r = bavMitarbeiter(OHNE, ma({ umwandlungMonat: 200 }), steuer, p);
    expect(r.arbeitgeberMonat).toBeCloseTo(100, 6);
    expect(r.hinweise.some((h) => h.includes('gedeckelt'))).toBe(false);
    expect(r.mindestzuschuss).toMatchObject({ regelMonat: 100, aufgestockt: false });
  });

  it('Rahmen voll: Umwandlung und 50 % füllen die 4 % genau', () => {
    const u = bavRahmenVoll(OHNE, ma(), 'Nordrhein-Westfalen', p);
    expect(u * 1.5).toBeCloseTo(svGrenze, 1);
  });

  it('ein Deckel über 0 gilt weiter', () => {
    expect(bavMitarbeiter({ art: 'zuschuss', quote: 0.5, deckelMonat: 60 }, ma({ umwandlungMonat: 200 }), steuer, p).arbeitgeberMonat).toBeCloseTo(60, 6);
  });
});

describe('Gesetzlicher Mindestzuschuss (§ 1a Abs. 1a BetrAVG)', () => {
  it('im Rahmen deckt der Festbetrag von 50 € die 15 % — nichts aufgestockt', () => {
    const r = bavMitarbeiter(FESTBETRAG, ma({ umwandlungMonat: 288 }), steuer, p);
    expect(r.mindestzuschuss).toMatchObject({ regelMonat: 50, aufgestockt: false });
    expect(r.mindestzuschuss!.quoteMonat).toBeCloseTo(43.2, 6);
    expect(r.arbeitgeberMonat).toBeCloseTo(50, 6);
  });

  it('sind 15 % mehr als der Festbetrag, zahlt der Arbeitgeber den gesetzlichen Zuschuss', () => {
    const r = bavMitarbeiter(FESTBETRAG, ma({ umwandlungMonat: 360 }), steuer, p);
    const z = r.mindestzuschuss!;
    expect(z.aufgestockt).toBe(true);
    expect(z.quoteMonat).toBeCloseTo(54, 6);
    expect(r.arbeitgeberMonat).toBeCloseTo(54, 2);
    expect(z.mindestMonat).toBeCloseTo(r.arbeitgeberMonat, 6);
    expect(z.regelMonat).toBe(50);
  });

  it('„soweit er Sozialabgaben spart“: über dem Rahmen bleibt der Zuschuss bei der Ersparnis', () => {
    const r = bavMitarbeiter(FESTBETRAG, ma({ umwandlungMonat: 600 }), steuer, p);
    const z = r.mindestzuschuss!;
    expect(z.quoteMonat).toBeCloseTo(90, 6);
    expect(z.mindestMonat).toBeLessThan(z.quoteMonat);
    expect(z.mindestMonat).toBeCloseTo(z.ersparnisMonat, 1);
    expect(r.arbeitgeberMonat).toBeCloseTo(z.mindestMonat, 6);
  });

  it('nie unter dem gesetzlichen Zuschuss — über alle Modelle und Beträge bis zum steuerfreien Rahmen', () => {
    const modelle: FirmenModell[] = [
      ZUSCHUSS, FESTBETRAG, MATCHING,
      { art: 'zuschuss', quote: 0.1, deckelMonat: 0 },
      { art: 'zuschuss', quote: 0.5, deckelMonat: 30 },
      { art: 'matching', weg: 'dv', matchingMonat: 30, zuschussImMatching: true },
    ];
    for (const modell of modelle) {
      for (let u = 25; u <= 625; u += 25) {
        const r = bavMitarbeiter(modell, ma({ umwandlungMonat: u }), steuer, p);
        const z = r.mindestzuschuss!;
        const dv = r.vertraege.find((v) => v.weg === 'direkt')!;
        expect(dv.arbeitgeberMonat).toBeGreaterThanOrEqual(Math.min(z.quoteMonat, z.ersparnisMonat) - 0.05);
        expect(r.arbeitgeberMonat).toBeGreaterThanOrEqual(z.regelMonat - 0.005);
        expect(z.aufgestockt).toBe(z.regelMonat + 0.005 < z.mindestMonat);
      }
    }
  });

  it('Zuschuss unter 15 % und Matching mit enthaltenem Zuschuss werden aufgestockt', () => {
    const zehn = bavMitarbeiter({ art: 'zuschuss', quote: 0.1, deckelMonat: 0 }, ma({ umwandlungMonat: 200 }), steuer, p);
    expect(zehn.mindestzuschuss).toMatchObject({ regelMonat: 20, aufgestockt: true });
    expect(zehn.arbeitgeberMonat).toBeCloseTo(30, 6);

    const m = bavMitarbeiter({ art: 'matching', weg: 'dv', matchingMonat: 20, zuschussImMatching: true }, ma({ umwandlungMonat: 200 }), steuer, p);
    expect(m.mindestzuschuss).toMatchObject({ regelMonat: 20, aufgestockt: true });
    expect(m.vertraege.map((v) => v.weg)).toEqual(['direkt']);
    expect(m.arbeitgeberMonat).toBeCloseTo(30, 6);
  });

  it('Festbetrag unter der Mindestumwandlung: nur der gesetzliche Zuschuss', () => {
    const r = bavMitarbeiter(FESTBETRAG, ma({ umwandlungMonat: 40 }), steuer, p);
    expect(r.mindestzuschuss).toMatchObject({ regelMonat: 0, aufgestockt: true });
    expect(r.arbeitgeberMonat).toBeCloseTo(6, 2);
  });

  it('gedeckelter Zuschuss unter dem gesetzlichen: kein Hinweis „gedeckelt“ — der Arbeitgeber zahlt mehr als den Deckel', () => {
    const r = bavMitarbeiter({ art: 'zuschuss', quote: 0.5, deckelMonat: 30 }, ma({ umwandlungMonat: 300 }), steuer, p);
    expect(r.mindestzuschuss!.aufgestockt).toBe(true);
    expect(r.arbeitgeberMonat).toBeGreaterThan(30);
    expect(r.hinweise.some((h) => h.includes('gedeckelt'))).toBe(false);
    // Bleibt der Deckel über dem gesetzlichen Zuschuss, gilt der Hinweis weiter
    expect(bavMitarbeiter(ZUSCHUSS, ma({ umwandlungMonat: 300 }), steuer, p).hinweise.some((h) => h.includes('gedeckelt'))).toBe(true);
  });

  it('ohne Umwandlung und bei Umwandlung in die Unterstützungskasse: keine Prüfung', () => {
    expect(bavMitarbeiter(ZUSCHUSS, ma({ umwandlungMonat: 0 }), steuer, p).mindestzuschuss).toBeNull();
    expect(bavMitarbeiter({ ...MATCHING, weg: 'ukasse' } as FirmenModell, ma(), steuer, p).mindestzuschuss).toBeNull();
  });
});

describe('Steuerfreier Rahmen: Gesamtbeitrag bis 8 % der BBG', () => {
  const grenze8 = (0.08 * p.bbgRvJahr) / 12;

  it('2026 sind das 676 € im Monat', () => {
    expect(grenze8).toBeCloseTo(676, 6);
  });

  it('Festbetrag und Zuschuss: Umwandlung und Arbeitgeberbeitrag füllen die 8 % genau', () => {
    for (const modell of [FESTBETRAG, ZUSCHUSS, { art: 'zuschuss', quote: 0.5, deckelMonat: 0 } as FirmenModell]) {
      const u = bavSteuerRahmenVoll(modell, ma(), 'Nordrhein-Westfalen', p);
      const r = bavMitarbeiter(modell, ma({ umwandlungMonat: u }), steuer, p);
      // Auf Cent gerundet im Rahmen — ein Cent mehr Umwandlung, und der Gesamtbeitrag laege darueber
      expect(r.gesamtMonat).toBeLessThan(grenze8 + 0.005);
      expect(bavMitarbeiter(modell, ma({ umwandlungMonat: u + 0.01 }), steuer, p).gesamtMonat).toBeGreaterThan(grenze8 + 0.005 - 1e-6);
      expect(r.gesamtMonat).toBeCloseTo(grenze8, 1);
      expect(r.steuerpflichtigMonat).toBeCloseTo(0, 2);
      expect(r.svPflichtigMonat).toBeGreaterThan(0); // über den 4 % fallen Sozialabgaben an
      expect(u).toBeGreaterThan(bavRahmenVoll(modell, ma(), 'Nordrhein-Westfalen', p));
    }
  });

  it('am Ende genau 676 €, nicht 675,99 €: Deckel 100 € — 576 € Umwandlung', () => {
    const u = bavSteuerRahmenVoll(ZUSCHUSS, ma(), 'Nordrhein-Westfalen', p);
    expect(u).toBe(576);
    expect(bavMitarbeiter(ZUSCHUSS, ma({ umwandlungMonat: u }), steuer, p).gesamtMonat).toBe(676);
    // 50 % ohne Deckel: 450,67 € brachten 676,005 € — auf Cent 676,01 €, also 450,66 €
    expect(bavSteuerRahmenVoll({ art: 'zuschuss', quote: 0.5, deckelMonat: 0 }, ma(), 'Nordrhein-Westfalen', p)).toBe(450.66);
  });

  it('Matching in die Direktversicherung: zählt die Direktversicherung, das Matching kommt obendrauf', () => {
    const u = bavSteuerRahmenVoll(MATCHING, ma(), 'Nordrhein-Westfalen', p);
    const r = bavMitarbeiter(MATCHING, ma({ umwandlungMonat: u }), steuer, p);
    expect(r.vertraege.find((v) => v.weg === 'direkt')!.beitragMonat).toBeCloseTo(grenze8, 1);
    expect(r.gesamtMonat).toBeCloseTo(grenze8 + 100, 1);
  });

  it('Umwandlung in die Unterstützungskasse: Umwandlung und Matching zusammen', () => {
    const uk = { ...MATCHING, weg: 'ukasse' } as FirmenModell;
    const u = bavSteuerRahmenVoll(uk, ma(), 'Nordrhein-Westfalen', p);
    expect(u).toBeCloseTo(grenze8 - 100, 1);
  });

  it('eine bestehende Betriebsrente belegt den Rahmen zuerst', () => {
    const mit = ma({ bavBestandMonat: 100 });
    const u = bavSteuerRahmenVoll(FESTBETRAG, mit, 'Nordrhein-Westfalen', p);
    const r = bavMitarbeiter(FESTBETRAG, { ...mit, umwandlungMonat: u }, steuer, p);
    expect(r.gesamtMonat).toBeCloseTo(grenze8 - 100, 1);
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

describe('Steuerfreier Rahmen (8 % der BBG)', () => {
  const steuerGrenze = (0.08 * p.bbgRvJahr) / 12;

  it('innerhalb des Rahmens ist nichts steuerpflichtig — in allen drei Modellen', () => {
    for (const modell of [ZUSCHUSS, FESTBETRAG, MATCHING]) {
      expect(bavMitarbeiter(modell, ma(), steuer, p).steuerpflichtigMonat).toBe(0);
    }
  });

  it('darüber wird der Rest versteuert; der Arbeitgeberbeitrag belegt den Rahmen zuerst', () => {
    const z = bavMitarbeiter(ZUSCHUSS, ma({ umwandlungMonat: 700 }), steuer, p);
    // 700 € Umwandlung + 100 € Zuschuss (gedeckelt) gegen den Rahmen
    expect(z.steuerpflichtigMonat).toBeCloseTo(700 + 100 - steuerGrenze, 6);
    const m = bavMitarbeiter(MATCHING, ma({ umwandlungMonat: 700 }), steuer, p);
    // Matching: nur der Pflichtzuschuss liegt mit in der Direktversicherung
    expect(m.steuerpflichtigMonat).toBeCloseTo(700 + m.pflichtzuschussMonat - steuerGrenze, 6);
  });

  it('Umwandlung in die Unterstützungskasse ist ohne Grenze steuerfrei', () => {
    const uk: FirmenModell = { ...MATCHING, weg: 'ukasse' } as FirmenModell;
    expect(bavMitarbeiter(uk, ma({ umwandlungMonat: 900 }), steuer, p).steuerpflichtigMonat).toBe(0);
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
