import { describe, it, expect } from 'vitest';
import {
  firmenAngebotSchema, beratungDatenSchema, angebotLesen, beratungLesen, MODELL_VORGABE,
  STEUERKLASSEN_BERATUNG, GEHAELTER_IM_JAHR, RENTENZIELE, steuerklasseAus,
} from '../src/bav-beratung.js';

describe('Firmenangebot', () => {
  it('leer: alle Vorgaben, Zuschussmodell 50 % bis 100 €', () => {
    const a = firmenAngebotSchema.parse({});
    expect(a.modell).toEqual(MODELL_VORGABE);
    expect(a.durchfuehrungsweg).toBe('direktversicherung');
    expect(a.beginn).toBe('');
  });

  it('jedes der drei Modelle mit seinen Stellschrauben', () => {
    expect(firmenAngebotSchema.parse({ modell: { art: 'festbetrag' } }).modell)
      .toEqual({ art: 'festbetrag', festbetragMonat: 50, mindestUmwandlungMonat: 50 });
    expect(firmenAngebotSchema.parse({ modell: { art: 'matching', weg: 'ukasse', matchingMonat: 200 } }).modell)
      .toEqual({ art: 'matching', weg: 'ukasse', matchingMonat: 200, zuschussImMatching: false });
    expect(firmenAngebotSchema.parse({ modell: { art: 'zuschuss', quote: 0.3, deckelMonat: 80 } }).modell)
      .toEqual({ art: 'zuschuss', quote: 0.3, deckelMonat: 80 });
  });

  it('weist Unsinn ab: Quote über 100 %, negativer Betrag, falsches Datum, zu langer Text', () => {
    expect(firmenAngebotSchema.safeParse({ modell: { art: 'zuschuss', quote: 1.5 } }).success).toBe(false);
    expect(firmenAngebotSchema.safeParse({ modell: { art: 'festbetrag', festbetragMonat: -1 } }).success).toBe(false);
    expect(firmenAngebotSchema.safeParse({ beginn: '2027-01-01' }).success).toBe(false);
    expect(firmenAngebotSchema.safeParse({ hinweise: 'x'.repeat(3001) }).success).toBe(false);
    expect(firmenAngebotSchema.safeParse({ beginn: '01.01.2027' }).success).toBe(true);
  });

  it('lesen: Unbekanntes Modell aus der Datenbank fällt auf die Vorgaben zurück', () => {
    expect(angebotLesen({ modell: { art: 'gold' } }).modell).toEqual(MODELL_VORGABE);
    expect(angebotLesen(null).bundesland).toBe('Nordrhein-Westfalen');
    expect(angebotLesen({ versicherer: 'Muster Leben AG' }).versicherer).toBe('Muster Leben AG');
  });
});

describe('Daten einer Beratung', () => {
  it('leer: offen, ohne Umwandlung, zwei leere Versichererwerte', () => {
    const d = beratungDatenSchema.parse({});
    expect(d.version).toBe(2);
    expect(d.lebenserwartung).toBe(85);
    // Verstellbar ist allein die Rendite der Hochrechnung
    expect(d.hochrechnung).toEqual({ renditeAnsparphase: 0.06 });
    expect(d.entscheidung.status).toBe('offen');
    expect(d.umwandlungMonat).toBe(0);
    expect(d.versicherer.direkt).toEqual({ beitragMonat: 0, garantierteRente: 0, prognoseRente: 0, prognoseKapital: 0, dynamik: 0, ausHochrechnung: false });
    expect(d.angaben.kv).toBe('gesetzlich');
  });

  it('übernimmt Kinder in der Form des Rechners', () => {
    const d = beratungDatenSchema.parse({ angaben: { kinder: [{ geburtsjahr: 2015 }, { geburtsjahr: 2019, ausbildungBisJahr: 2042 }] } });
    expect(d.angaben.kinder).toHaveLength(2);
    expect(beratungDatenSchema.safeParse({ angaben: { kinder: [{ geburtsjahr: 1800 }] } }).success).toBe(false);
  });

  it('nur die drei Status', () => {
    expect(beratungDatenSchema.safeParse({ entscheidung: { status: 'teilnahme' } }).success).toBe(true);
    expect(beratungDatenSchema.safeParse({ entscheidung: { status: 'ja' } }).success).toBe(false);
  });

  it('lesen: Version 1 (sechs Schritte) wird angehoben — man steht wieder im selben Schritt', () => {
    // v1: 0 Angebot, 1 Angaben, 2 Rechnung, 3 Leistung, 4 Entscheidung, 5 Unterlagen
    expect(beratungLesen({ version: 1, schritt: 1 }).schritt).toBe(1);
    expect(beratungLesen({ version: 1, schritt: 2 }).schritt).toBe(3);
    expect(beratungLesen({ version: 1, schritt: 5, angaben: { name: 'Anna' } })).toMatchObject({ version: 2, schritt: 6, angaben: { name: 'Anna' } });
    // Version 2 bleibt, wie sie ist
    expect(beratungLesen({ version: 2, schritt: 2 }).schritt).toBe(2);
  });

  it('lesen: frühere Felder der Hochrechnung werden verworfen, die Rendite bleibt', () => {
    const d = beratungLesen({ version: 2, schritt: 3, beispielZins: 0.05, umwandlungMonat: 200, angaben: { name: 'Anna' } });
    expect(d).toMatchObject({ schritt: 3, umwandlungMonat: 200, angaben: { name: 'Anna' } });
    expect(d).not.toHaveProperty('beispielZins');
    expect(d.hochrechnung).toEqual({ renditeAnsparphase: 0.06 });
    expect(beratungLesen({ hochrechnung: { renditeAnsparphase: 0.05, renditeEntnahme: 0.03, ter: 0.008, entnahmedauer: 25 } }).hochrechnung)
      .toEqual({ renditeAnsparphase: 0.05 });
  });

  it('lesen: Kaputtes fällt auf die Vorgaben zurück', () => {
    expect(beratungLesen({ schritt: 9 }).schritt).toBe(0);
    expect(beratungLesen({ version: 2, lebenserwartung: 300 }).lebenserwartung).toBe(85);
    expect(beratungLesen({ angaben: { name: 'Anna Beispiel' } }).angaben.name).toBe('Anna Beispiel');
  });
});

describe('Angaben für den AXA-Antrag', () => {
  it('leer: keine Nummern, keine Tätigkeit, nichts beantwortet', () => {
    const a = firmenAngebotSchema.parse({});
    expect([a.kollektivnummer, a.organisationsnummer]).toEqual(['', '']);
    const d = beratungDatenSchema.parse({});
    expect(d.angaben.taetigkeit).toBe('');
    expect(d.entscheidung.axa).toEqual({
      beraterVorname: '', beraterNachname: '', organisationsnummer: '', buBefreiung: '',
      arbeitsunfaehig: '', einschraenkung: '', buRente: '', kanal: '',
      erlaeutert: { versteuerung: '', funktionsweise: '', ausscheiden: '', insolvenz: '' },
    });
  });

  it('Beratungen mit dem ersten AXA-Antrag lesen sich ohne Berater, Organr. und BU-Zusatz', () => {
    const d = beratungLesen({ version: 2, entscheidung: { status: 'teilnahme', axa: { arbeitsunfaehig: 'nein', kanal: 'online' } } });
    expect(d.entscheidung.axa).toMatchObject({ beraterVorname: '', organisationsnummer: '', buBefreiung: '', arbeitsunfaehig: 'nein', kanal: 'online' });
  });

  it('Beratungen von vorher lesen sich ohne die neuen Felder', () => {
    const d = beratungLesen({ version: 2, entscheidung: { status: 'teilnahme', ort: 'Köln' } });
    expect(d.entscheidung.status).toBe('teilnahme');
    expect(d.entscheidung.axa.arbeitsunfaehig).toBe('');
  });

  it('nimmt nur Ja, Nein oder leer und die drei Wege der Beratung', () => {
    const gut = { arbeitsunfaehig: 'nein', einschraenkung: 'ja', buRente: 'nein', kanal: 'persoenlich',
      erlaeutert: { versteuerung: 'ja', funktionsweise: 'ja', ausscheiden: 'ja', insolvenz: 'nein' } };
    expect(beratungDatenSchema.safeParse({ entscheidung: { axa: gut } }).success).toBe(true);
    expect(beratungDatenSchema.safeParse({ entscheidung: { axa: { ...gut, buRente: 'vielleicht' } } }).success).toBe(false);
    expect(beratungDatenSchema.safeParse({ entscheidung: { axa: { ...gut, kanal: 'brief' } } }).success).toBe(false);
    expect(beratungDatenSchema.safeParse({ entscheidung: { axa: { ...gut, buBefreiung: 'ja' } } }).success).toBe(true);
    expect(beratungDatenSchema.safeParse({ entscheidung: { axa: { ...gut, buBefreiung: 'vielleicht' } } }).success).toBe(false);
    expect(beratungDatenSchema.safeParse({ entscheidung: { axa: { ...gut, organisationsnummer: 'x'.repeat(41) } } }).success).toBe(false);
    expect(beratungDatenSchema.safeParse({ entscheidung: { axa: { ...gut, beraterNachname: 'x'.repeat(61) } } }).success).toBe(false);
    expect(firmenAngebotSchema.safeParse({ kollektivnummer: 'x'.repeat(41) }).success).toBe(false);
    expect(beratungDatenSchema.safeParse({ angaben: { taetigkeit: 'Industriemechanikerin' } }).success).toBe(true);
    expect(beratungDatenSchema.safeParse({ angaben: { taetigkeit: 'x'.repeat(81) } }).success).toBe(false);
  });
});

describe('Steuerklasse und Gehälter im Jahr', () => {
  it('neue Beratung: Steuerklasse I, 12 Gehälter', () => {
    const a = beratungDatenSchema.parse({}).angaben;
    expect(a.steuerklasse).toBe(1);
    expect(a.gehaelter).toBe(12);
  });

  it('Beratungen von vorher: ledig I, verheiratet ohne Einkommen des Partners III, mit IV', () => {
    expect(beratungLesen({ angaben: { verheiratet: false } }).angaben.steuerklasse).toBe(1);
    expect(beratungLesen({ angaben: { verheiratet: true, partnerBrutto: 0 } }).angaben.steuerklasse).toBe(3);
    expect(beratungLesen({ angaben: { verheiratet: true, partnerBrutto: 36_000 } }).angaben.steuerklasse).toBe(4);
    expect(steuerklasseAus({ verheiratet: true, partnerBrutto: 0, steuerklasse: 5 })).toBe(5);
  });

  it('eine eingetragene Klasse gilt; nur I bis V, nur 12 bis 14 Gehälter', () => {
    expect(beratungLesen({ angaben: { steuerklasse: 2, verheiratet: false } }).angaben.steuerklasse).toBe(2);
    expect(beratungDatenSchema.safeParse({ angaben: { steuerklasse: 6 } }).success).toBe(false);
    expect(beratungDatenSchema.safeParse({ angaben: { gehaelter: 15 } }).success).toBe(false);
    expect(beratungDatenSchema.parse({ angaben: { gehaelter: 13, jahresbrutto: 52_000 } }).angaben.gehaelter).toBe(13);
    expect(STEUERKLASSEN_BERATUNG).toEqual([1, 2, 3, 4, 5]);
    expect(GEHAELTER_IM_JAHR).toEqual([12, 12.5, 13, 14]);
  });

  it('Rundlauf: was gelesen und wieder gespeichert wird, bleibt gleich', () => {
    const d = beratungLesen({ angaben: { verheiratet: true, partnerBrutto: 0, jahresbrutto: 48_000 } });
    expect(beratungLesen(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });
});

describe('Kontakt, Rentenziel und die Annahmen für den Arbeitgeber', () => {
  it('neu: ohne Kontakt, Rentenziel 78 %, Steuersatz 30 %, ohne Umlagen, Belegschaft aus der Liste', () => {
    const d = beratungDatenSchema.parse({});
    expect([d.angaben.email, d.angaben.telefon]).toEqual(['', '']);
    expect(d.rentenziel).toBe(0.78);
    expect(RENTENZIELE).toEqual([0.7, 0.78, 0.85]);
    expect(RENTENZIELE).toContain(d.rentenziel);
    const a = firmenAngebotSchema.parse({});
    expect([a.unternehmensSteuersatz, a.umlagenSatz, a.belegschaft]).toEqual([0.3, 0, 0]);
  });

  it('Beratungen und Angebote von vorher lesen sich mit den Vorgaben — nichts geht verloren', () => {
    const d = beratungLesen({ version: 2, schritt: 2, angaben: { name: 'Anna Beispiel', jahresbrutto: 48_000 } });
    expect(d).toMatchObject({ schritt: 2, rentenziel: 0.78, angaben: { name: 'Anna Beispiel', email: '', telefon: '' } });
    const a = angebotLesen({ versicherer: 'Muster Leben AG', modell: { art: 'festbetrag' } });
    expect(a).toMatchObject({ versicherer: 'Muster Leben AG', unternehmensSteuersatz: 0.3, umlagenSatz: 0, belegschaft: 0 });
  });

  it('übernimmt, was eingetragen ist', () => {
    const d = beratungLesen({ rentenziel: 0.85, angaben: { email: 'anna@beispiel.de', telefon: '0221 123456' } });
    expect(d.rentenziel).toBe(0.85);
    expect(d.angaben).toMatchObject({ email: 'anna@beispiel.de', telefon: '0221 123456' });
    expect(angebotLesen({ unternehmensSteuersatz: 0.42, umlagenSatz: 0.032, belegschaft: 48 }))
      .toMatchObject({ unternehmensSteuersatz: 0.42, umlagenSatz: 0.032, belegschaft: 48 });
  });

  it('eine Adresse mit Tippfehler bleibt lesbar — geprüft wird am Feld', () => {
    expect(beratungLesen({ angaben: { name: 'Anna', email: 'anna@beispiel' } }).angaben).toMatchObject({ name: 'Anna', email: 'anna@beispiel' });
  });

  it('weist Unsinn ab', () => {
    expect(beratungDatenSchema.safeParse({ rentenziel: 1.2 }).success).toBe(false);
    expect(beratungDatenSchema.safeParse({ rentenziel: 0.3 }).success).toBe(false);
    expect(beratungDatenSchema.safeParse({ angaben: { email: 'x'.repeat(121) } }).success).toBe(false);
    expect(beratungDatenSchema.safeParse({ angaben: { telefon: '1'.repeat(41) } }).success).toBe(false);
    expect(firmenAngebotSchema.safeParse({ unternehmensSteuersatz: 0.7 }).success).toBe(false);
    expect(firmenAngebotSchema.safeParse({ umlagenSatz: -0.01 }).success).toBe(false);
    expect(firmenAngebotSchema.safeParse({ belegschaft: 12.5 }).success).toBe(false);
    expect(firmenAngebotSchema.safeParse({ belegschaft: -1 }).success).toBe(false);
  });

  it('Rundlauf mit den neuen Feldern', () => {
    const d = beratungLesen({ rentenziel: 0.7, angaben: { email: 'a@b.de', telefon: '+49 221 1' } });
    expect(beratungLesen(JSON.parse(JSON.stringify(d)))).toEqual(d);
    const a = angebotLesen({ unternehmensSteuersatz: 0.25, umlagenSatz: 0.0185, belegschaft: 12 });
    expect(angebotLesen(JSON.parse(JSON.stringify(a)))).toEqual(a);
  });
});
