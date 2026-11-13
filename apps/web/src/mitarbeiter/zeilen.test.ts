import { describe, expect, it } from 'vitest';
import { beratungDatenSchema, firmenAngebotSchema, type BeratungDaten } from '@renten/schema';
import { euro, euroGenau } from '../components/Feld';
import {
  beitragsRechnung, hochrechnung, kennzahlenRechnung, leistungsRechnung, lueckeMitBetriebsrente, probeabrechnung,
  spaeterBeginnen, versorgungslueckeRechnung,
} from './rechnung';
import {
  abrechnungZeile, anbieterSatz, angabenZeile, angebotSatz, angebotVertraege, axaZeile, einkommenZeile, entscheidungZeile,
  grvZeile, hochrechnungZeile, kennzahlenZeile, kvZeile, leistungZeile, lueckeMitZeile, lueckeZeile, ortZeile, personZeile,
  rechnungZeile, spaeterZeile, unterlagenZeile, vertragZeile, vorsorgeZeile,
} from './zeilen';

const HEUTE = new Date(2026, 10, 12); // 12.11.2026

const firma = firmenAngebotSchema.parse({
  bundesland: 'Bayern', versicherer: 'Musterleben', tarif: 'Klassik',
  modell: { art: 'zuschuss', quote: 0.5, deckelMonat: 100 },
});
const matching = firmenAngebotSchema.parse({ ukasse: 'Muster-Kasse e. V.', modell: { art: 'matching', weg: 'dv', matchingMonat: 100 } });

const beratung = (
  angaben: Partial<BeratungDaten['angaben']> = {}, rest: Record<string, unknown> = {},
): BeratungDaten => beratungDatenSchema.parse({
  angaben: { name: 'Anna Beispiel', geburtsdatum: '15.03.1985', jahresbrutto: 54_000, ...angaben },
  umwandlungMonat: 200,
  ...rest,
});

describe('Angebot', () => {
  it('die Regel der Firma ohne Punkt', () => {
    // Zwischen Betrag und € steht ein geschuetztes Leerzeichen
    expect(angebotSatz(firma)).toMatch(/^Ihr Arbeitgeber gibt 50 % Ihres Beitrags dazu, höchstens 100\s€ im Monat$/);
  });

  it('Weg und Anbieter — im Matching-Modell beide Verträge', () => {
    expect(angebotVertraege(firma)).toEqual(['direkt']);
    expect(anbieterSatz(firma)).toBe('Direktversicherung — Musterleben, Tarif Klassik');
    expect(angebotVertraege(matching)).toEqual(['direkt', 'ukasse']);
    expect(anbieterSatz(matching)).toBe('Direktversicherung · Unterstützungskasse — Muster-Kasse e. V.');
  });
});

describe('Angaben', () => {
  it('Person: Name, Alter und Rentenbeginn', () => {
    expect(personZeile(beratung().angaben, HEUTE)).toEqual({ ergebnis: 'Anna Beispiel, 41 · Rentenbeginn 01.04.2052', fehlt: undefined });
  });

  it('was fehlt, steht da — der leere Kreis statt des Hakens', () => {
    expect(personZeile(beratung({ name: '', geburtsdatum: '' }).angaben, HEUTE)).toEqual({ ergebnis: undefined, fehlt: 'Name und Geburtsdatum fehlen' });
    expect(personZeile(beratung({ name: '' }).angaben, HEUTE).fehlt).toBe('Name fehlt');
    expect(einkommenZeile(beratung({ jahresbrutto: 0 }).angaben)).toEqual({ fehlt: 'Bruttogehalt fehlt' });
  });

  it('Einkommen: Monatsgehalt, Steuerklasse, Kinder nur wenn vorhanden', () => {
    expect(einkommenZeile(beratung().angaben).ergebnis).toBe(`${euro(4500)} brutto im Monat · Steuerklasse I`);
    const mitKindern = beratung({ steuerklasse: 3, gehaelter: 13, kinder: [{ geburtsjahr: 2015 }, { geburtsjahr: 2018 }] }).angaben;
    expect(einkommenZeile(mitKindern).ergebnis).toBe(`${euro(54_000 / 13)} brutto im Monat · Steuerklasse III · 2 Kinder`);
  });

  it('Krankenversicherung: gesetzlich mit Kasse und Zusatzbeitrag, privat mit Beitrag', () => {
    expect(kvZeile(beratung({ krankenkasse: 'Musterkasse', zusatzbeitrag: 0.029 }).angaben).ergebnis)
      .toBe('gesetzlich · Musterkasse · 2,90 % Zusatzbeitrag');
    expect(kvZeile(beratung({ kv: 'privat', pkvPraemieMonat: 450 }).angaben).ergebnis).toBe(`privat · ${euro(450)} im Monat`);
  });

  it('bisherige Vorsorge', () => {
    expect(vorsorgeZeile(beratung().angaben).ergebnis).toBe('Keine bestehende Betriebsrente');
    expect(vorsorgeZeile(beratung({ bavBestandMonat: 80 }).angaben).ergebnis).toBe(`Bestehende Betriebsrente ${euro(80)} im Monat`);
  });

  it('der ganze Schritt: wer und mit welchem Gehalt, sonst was fehlt', () => {
    expect(angabenZeile(beratung().angaben, HEUTE)).toEqual({ ergebnis: `Anna Beispiel, 41 · ${euro(4500)} brutto im Monat`, fehlt: undefined });
    expect(angabenZeile(beratung({ name: '', geburtsdatum: '', jahresbrutto: 0 }).angaben, HEUTE))
      .toEqual({ ergebnis: undefined, fehlt: 'Name und Geburtsdatum und Bruttogehalt fehlen' });
  });
});

describe('Versorgungslücke', () => {
  it('nennt die Lücke im Monat und ihren Anteil am Nettolohn', () => {
    const l = versorgungslueckeRechnung(firma, beratung())!;
    expect(l.lueckeMonat).toBeGreaterThan(1);
    expect(lueckeZeile(l).ergebnis).toBe(`Lücke ${euro(l.lueckeMonat)} im Monat · ${l.lueckeProzent} % des Nettolohns`);
  });

  it('ohne Lücke: das Rentenziel ist erreicht; ohne Rechnung steht nichts da', () => {
    const l = versorgungslueckeRechnung(firma, beratung({ grvRente: 9000 }))!;
    expect(lueckeZeile(l).ergebnis).toBe(`Rentenziel von ${l.zielProzent} % erreicht`);
    expect(lueckeZeile(null)).toEqual({});
  });

  it('die gesetzliche Rente: eingetragen oder geschätzt', () => {
    expect(grvZeile(beratung({ grvRente: 1600 }).angaben, 1432).ergebnis).toBe(`Gesetzliche Rente ${euro(1600)} im Monat, eingetragen`);
    expect(grvZeile(beratung().angaben, 1432).ergebnis).toBe(`Gesetzliche Rente ${euro(1432)} im Monat, geschätzt`);
  });
});

describe('Rechnung', () => {
  const d = beratung();
  const r = beitragsRechnung(firma, d);

  it('Netto-Aufwand und was in die Vorsorge fließt', () => {
    expect(rechnungZeile(r).ergebnis).toBe(`${euro(r.nettoAufwandMonat)} netto im Monat · ${euroGenau(r.gesamtMonat)} in Ihre Vorsorge`);
    expect(r.gesamtMonat).toBeCloseTo(300, 6);
  });

  it('ohne Umwandlung fehlt der Betrag', () => {
    expect(rechnungZeile(beitragsRechnung(firma, beratung({}, { umwandlungMonat: 0 })))).toEqual({ fehlt: 'Noch kein Betrag gewählt' });
  });

  it('Probeabrechnung, Hochrechnung und Warten', () => {
    const a = probeabrechnung(firma, d, r);
    expect(abrechnungZeile(a).ergebnis).toBe(`Netto ${euroGenau(a.netto.mit)} statt ${euroGenau(a.netto.ohne)}`);
    const h = hochrechnung(firma, d, r);
    expect(hochrechnungZeile(h).ergebnis).toBe(`Kapital ${euro(h.kapital)} · Rente ${euro(h.renteMonat)} im Monat, geschätzt`);
    const eins = spaeterBeginnen(h, r.nettoAufwandMonat)[1]!;
    expect(spaeterZeile(eins).ergebnis).toBe(`Ein Jahr warten kostet ${euro(eins.wenigerKapital)} Kapital`);
  });
});

describe('Leistung im Alter', () => {
  const mit = beratung({}, { versicherer: { direkt: { garantierteRente: 300, prognoseRente: 520, prognoseKapital: 140_000 } } });
  const r = beitragsRechnung(firma, mit);
  const leistung = leistungsRechnung(firma, mit, r)!;

  it('ein Vertrag: die Prognose netto, als geschätzt gekennzeichnet, wenn sie aus der Hochrechnung stammt', () => {
    const v = leistung.vertraege[0]!;
    expect(vertragZeile(v, false).ergebnis).toBe(`${euro(v.prognose!.nettoMonat)} netto im Monat, Prognose`);
    expect(vertragZeile(v, true).ergebnis).toBe(`${euro(v.prognose!.nettoMonat)} netto im Monat, Prognose geschätzt`);
    expect(vertragZeile({ ...v, prognose: null }, false).ergebnis).toBe(`${euro(v.garantiert!.nettoMonat)} netto im Monat, garantiert`);
    expect(vertragZeile({ ...v, prognose: null, garantiert: null }, false).ergebnis).toBe(`${euro(v.kapital!.netto)} Kapital netto`);
  });

  it('ohne Werte aus dem Angebot fehlt etwas', () => {
    expect(vertragZeile(null, false)).toEqual({ fehlt: 'Werte aus dem Angebot fehlen' });
    const leer = beratung();
    expect(leistungZeile(leistungsRechnung(firma, leer, beitragsRechnung(firma, leer)), beitragsRechnung(firma, leer), leer))
      .toEqual({ fehlt: 'Werte aus dem Angebot fehlen' });
  });

  it('der ganze Schritt: die Netto-Rente; ohne Umwandlung kein Vertrag', () => {
    expect(leistungZeile(leistung, r, mit).ergebnis).toBe(`Betriebsrente ${euro(leistung.vertraege[0]!.prognose!.nettoMonat)} netto im Monat, Prognose`);
    const ohne = beratung({}, { umwandlungMonat: 0 });
    expect(leistungZeile(null, beitragsRechnung(firma, ohne), ohne)).toEqual({ fehlt: 'Ohne Umwandlung kein Vertrag' });
  });

  it('eine Prognose aus der geschätzten Hochrechnung heißt auch in der Zeile des Schritts „geschätzt“', () => {
    const geschaetzt = beratung({}, { versicherer: { direkt: { prognoseRente: 520, prognoseKapital: 140_000, ausHochrechnung: true } } });
    const rg = beitragsRechnung(firma, geschaetzt);
    expect(leistungZeile(leistungsRechnung(firma, geschaetzt, rg), rg, geschaetzt).ergebnis).toMatch(/netto im Monat, Prognose geschätzt$/);
  });

  it('Lücke mit Betriebsrente und Kennzahlen', () => {
    const x = lueckeMitBetriebsrente(versorgungslueckeRechnung(firma, mit), leistung, mit)!;
    expect(lueckeMitZeile(x).ergebnis).toBe(`Schließt ${x.prognose!.prozent} % der Versorgungslücke`);
    expect(lueckeMitZeile({ ...x, prognose: { ...x.prognose!, anteil: 1, prozent: 100 } }).ergebnis).toBe('Schließt die Versorgungslücke ganz');
    const k = kennzahlenRechnung(firma, mit, leistung)!;
    expect(kennzahlenZeile(k).ergebnis).toMatch(/^Nettorendite -?\d+,\d\d % · Netto-Hebel \d+,\d\d ×$/);
  });
});

describe('Entscheidung und Unterlagen', () => {
  const r = beitragsRechnung(firma, beratung());

  it('Teilnahme mit Betrag und Beginn — eingetragen oder vorbelegt', () => {
    const teil = beratung({}, { entscheidung: { status: 'teilnahme', beginn: '01.02.2027' } });
    expect(entscheidungZeile(teil, r, '01.12.2026').ergebnis).toBe(`Teilnahme · ${euroGenau(200)} im Monat ab 01.02.2027`);
    const ohneBeginn = beratung({}, { entscheidung: { status: 'teilnahme' } });
    expect(entscheidungZeile(ohneBeginn, r, '01.12.2026').ergebnis).toBe(`Teilnahme · ${euroGenau(200)} im Monat ab 01.12.2026`);
  });

  it('Verzicht und offen', () => {
    expect(entscheidungZeile(beratung({}, { entscheidung: { status: 'verzicht' } }), r, '').ergebnis).toBe('Verzicht');
    expect(entscheidungZeile(beratung(), r, '').ergebnis).toBe('Noch offen');
  });

  it('AXA-Angaben: vollständig oder wie viele fehlen', () => {
    expect(axaZeile([])).toEqual({ ergebnis: 'Vollständig' });
    expect(axaZeile(['der Kanal'])).toEqual({ fehlt: '1 Angabe fehlt' });
    expect(axaZeile(['a', 'b', 'c'])).toEqual({ fehlt: '3 Angaben fehlen' });
  });

  it('Ort und Datum — ohne Ort fehlt er', () => {
    expect(ortZeile(beratung({}, { entscheidung: { ort: 'Freiburg', datum: '12.11.2026' } }).entscheidung))
      .toEqual({ ergebnis: 'Freiburg, 12.11.2026', fehlt: undefined });
    expect(ortZeile(beratung({}, { entscheidung: { datum: '12.11.2026' } }).entscheidung)).toEqual({ ergebnis: '12.11.2026', fehlt: 'Ort fehlt' });
  });

  it('Unterlagen: unterschrieben mit Zeitpunkt, sonst noch nicht', () => {
    expect(unterlagenZeile(null).ergebnis).toBe('Noch nicht unterschrieben');
    expect(unterlagenZeile('fehler').ergebnis).toBe('Noch nicht unterschrieben');
    const u = { beratung: 'b', erstelltAm: '2026-11-12T13:05:00Z', pruefsummen: {}, unterschriften: [] };
    expect(unterlagenZeile(u).ergebnis).toMatch(/^Unterschrieben am 12\.11\.2026 um \d\d:05 Uhr$/);
  });
});
