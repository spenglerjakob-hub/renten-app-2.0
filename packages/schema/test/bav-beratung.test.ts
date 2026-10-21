import { describe, it, expect } from 'vitest';
import {
  firmenAngebotSchema, beratungDatenSchema, angebotLesen, beratungLesen, MODELL_VORGABE,
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
    expect(d.beispielZins).toBe(0.03);
    expect(d.entscheidung.status).toBe('offen');
    expect(d.umwandlungMonat).toBe(0);
    expect(d.versicherer.direkt).toEqual({ beitragMonat: 0, garantierteRente: 0, prognoseRente: 0, prognoseKapital: 0, dynamik: 0 });
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

  it('lesen: Kaputtes fällt auf die Vorgaben zurück', () => {
    expect(beratungLesen({ schritt: 9 }).schritt).toBe(0);
    expect(beratungLesen({ version: 2, lebenserwartung: 300 }).lebenserwartung).toBe(85);
    expect(beratungLesen({ angaben: { name: 'Anna Beispiel' } }).angaben.name).toBe('Anna Beispiel');
  });
});
