import { describe, it, expect, beforeEach } from 'vitest';
import {
  ALLE_WAEHLBAREN, GESPRAECH_SEITEN, KENNUNGEN, SCHRITTE, auswahlMerken, bereinigt, gezeigteSeiten, gezeigterSchritt,
  letzteAuswahl, schrittSetzen, schrittSichtbar, schrittStand, seiteSetzen, sichtbareSchritte, stueckAusgeblendet, stueckZeigen,
  weitSichtbar,
} from './gespraech';

const menge = (...s: string[]) => new Set(s);

describe('die Seiten eines Gesprächs', () => {
  it('je Schritt eine Kennung und mindestens eine Seite', () => {
    expect(KENNUNGEN).toHaveLength(SCHRITTE.length);
    for (const k of KENNUNGEN) expect(GESPRAECH_SEITEN[k].length).toBeGreaterThan(0);
  });

  it('immer dabei: der Beitrag, die Entscheidung und die Unterlagen', () => {
    expect(GESPRAECH_SEITEN.rechnung.find((s) => s.id === 'beitrag')?.immer).toBe(true);
    expect(GESPRAECH_SEITEN.entscheidung.every((s) => s.immer)).toBe(true);
    expect(GESPRAECH_SEITEN.unterlagen.every((s) => s.immer)).toBe(true);
    // Alles andere laesst sich abwaehlen.
    expect(ALLE_WAEHLBAREN).toEqual([
      'angebot.angebot', 'angaben.person', 'angaben.einkommen', 'angaben.vorsorge', 'luecke.luecke',
      'rechnung.abrechnung', 'rechnung.spaeter', 'leistung.vertrag', 'leistung.luecke',
    ]);
  });

  it('eine gespeicherte Auswahl: nur, was es gibt und sich abwählen lässt — jede Seite einmal', () => {
    expect(bereinigt(undefined)).toEqual([]);
    expect(bereinigt(['luecke.luecke', 'rechnung.beitrag', 'entscheidung.wahl', 'gibt.es-nicht', 'luecke.luecke', 'angaben.person']))
      .toEqual(['angaben.person', 'luecke.luecke']);
  });
});

describe('was im Gespräch dasteht', () => {
  it('ohne Abwahl stehen alle sieben Schritte da', () => {
    expect(sichtbareSchritte(menge())).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(gezeigteSeiten(menge())).toBe(12);
  });

  it('Angaben und Versorgungslücke ausgeblendet: fünf Schritte', () => {
    const aus = menge('angaben.person', 'angaben.einkommen', 'angaben.vorsorge', 'luecke.luecke');
    expect(sichtbareSchritte(aus)).toEqual([0, 3, 4, 5, 6]);
    expect(schrittSichtbar(aus, 'angaben')).toBe(false);
    expect(schrittStand(aus, 'angaben')).toBe('keine');
    expect(gezeigteSeiten(aus)).toBe(8);
  });

  it('ein Schritt steht da, sobald eine seiner Seiten gezeigt wird', () => {
    const aus = menge('angaben.person', 'angaben.vorsorge');
    expect(schrittSichtbar(aus, 'angaben')).toBe(true);
    expect(schrittStand(aus, 'angaben')).toBe('einige');
    expect(stueckAusgeblendet(aus, 'angaben', 'person')).toBe(true);
    expect(stueckAusgeblendet(aus, 'angaben', 'einkommen')).toBe(false);
  });

  it('nur das Nötigste: Rechnung, Entscheidung und Unterlagen bleiben — mit dem Beitrag', () => {
    const aus = new Set(ALLE_WAEHLBAREN);
    expect(sichtbareSchritte(aus)).toEqual([3, 5, 6]);
    expect(stueckAusgeblendet(aus, 'rechnung', 'beitrag')).toBe(false);
    expect(stueckAusgeblendet(aus, 'rechnung', 'abrechnung')).toBe(true);
    expect(stueckAusgeblendet(aus, 'entscheidung', 'wahl')).toBe(false);
    expect(schrittStand(aus, 'entscheidung')).toBe('fest');
    expect(gezeigteSeiten(aus)).toBe(3);
  });

  it('feste Seiten lassen sich auch mit einer manipulierten Auswahl nicht ausblenden', () => {
    const aus = menge('rechnung.beitrag', 'entscheidung.wahl', 'unterlagen.unterlagen');
    expect(stueckAusgeblendet(aus, 'rechnung', 'beitrag')).toBe(false);
    expect(sichtbareSchritte(aus)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('je Vertrag ein Stück: „Ihr Vertrag“ steht für alle', () => {
    const aus = menge('leistung.vertrag');
    expect(stueckAusgeblendet(aus, 'leistung', 'vertrag-direkt')).toBe(true);
    expect(stueckAusgeblendet(aus, 'leistung', 'vertrag-ukasse')).toBe(true);
    expect(stueckAusgeblendet(aus, 'leistung', 'luecke')).toBe(false);
    expect(schrittSichtbar(aus, 'leistung')).toBe(true);
  });

  it('Vertiefungen stehen nicht zur Wahl — sie bleiben, solange ihr Schritt dasteht', () => {
    const aus = new Set(ALLE_WAEHLBAREN);
    expect(stueckAusgeblendet(aus, 'angebot', 'bedingungen')).toBe(false);
    expect(stueckAusgeblendet(aus, 'leistung', 'kennzahlen')).toBe(false);
    // Die gleichnamige Seite eines anderen Schritts ist eine andere.
    expect(stueckAusgeblendet(menge('luecke.luecke'), 'leistung', 'luecke')).toBe(false);
  });
});

describe('der Weg durch die gezeigten Schritte', () => {
  const sichtbar = [0, 3, 5, 6];

  it('ein ausgeblendeter Schritt: der nächste, der dasteht — am Ende der letzte', () => {
    expect(gezeigterSchritt(sichtbar, 3)).toBe(3);
    expect(gezeigterSchritt(sichtbar, 1)).toBe(3);
    expect(gezeigterSchritt(sichtbar, 4)).toBe(5);
    expect(gezeigterSchritt([0, 3], 5)).toBe(3);
  });

  it('wie weit man ist, gezählt in gezeigten Schritten', () => {
    expect(weitSichtbar(sichtbar, 0)).toBe(0);
    expect(weitSichtbar(sichtbar, 2)).toBe(0);
    expect(weitSichtbar(sichtbar, 3)).toBe(1);
    expect(weitSichtbar(sichtbar, 4)).toBe(1);
    expect(weitSichtbar(sichtbar, 6)).toBe(3);
  });
});

describe('Seiten wählen', () => {
  it('eine Seite aus- und wieder einblenden', () => {
    const aus = seiteSetzen([], 'luecke', 'luecke', false);
    expect(aus).toEqual(['luecke.luecke']);
    expect(seiteSetzen(aus, 'luecke', 'luecke', true)).toEqual([]);
    // Feste Seiten bleiben, wie sie sind.
    expect(seiteSetzen([], 'rechnung', 'beitrag', false)).toEqual([]);
  });

  it('ein ganzer Schritt auf einmal — der Beitrag bleibt', () => {
    expect(schrittSetzen([], 'angaben', false)).toEqual(['angaben.person', 'angaben.einkommen', 'angaben.vorsorge']);
    expect(schrittSetzen(['angaben.person', 'luecke.luecke'], 'angaben', true)).toEqual(['luecke.luecke']);
    expect(schrittSetzen([], 'rechnung', false)).toEqual(['rechnung.abrechnung', 'rechnung.spaeter']);
    expect(schrittSetzen([], 'entscheidung', false)).toEqual([]);
  });

  it('ein Verweis auf eine ausgeblendete Seite zeigt sie wieder — nur sie', () => {
    const aus = ['angaben.person', 'angaben.einkommen', 'luecke.luecke', 'leistung.vertrag'];
    expect(stueckZeigen(aus, 'angaben', 'einkommen')).toEqual(['angaben.person', 'luecke.luecke', 'leistung.vertrag']);
    expect(stueckZeigen(aus, 'leistung', 'vertrag-direkt')).toEqual(['angaben.person', 'angaben.einkommen', 'luecke.luecke']);
    expect(stueckZeigen(aus, 'angebot', 'bedingungen')).toEqual(aus);
  });
});

describe('die zuletzt benutzte Auswahl', () => {
  const speicher = new Map<string, string>();
  beforeEach(() => {
    speicher.clear();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => speicher.get(k) ?? null,
      setItem: (k: string, v: string) => { speicher.set(k, v); },
    };
  });

  it('gilt als Vorgabe für das nächste Gespräch', () => {
    expect(letzteAuswahl()).toEqual([]);
    auswahlMerken(['luecke.luecke', 'angaben.person', 'rechnung.beitrag']);
    expect(letzteAuswahl()).toEqual(['angaben.person', 'luecke.luecke']);
  });

  it('ein unlesbarer Speicher heißt: alle Seiten', () => {
    speicher.set('mb.gespraech.ausgeblendet', '{kaputt');
    expect(letzteAuswahl()).toEqual([]);
    speicher.set('mb.gespraech.ausgeblendet', '"luecke.luecke"');
    expect(letzteAuswahl()).toEqual([]);
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: () => { throw new Error('gesperrt'); }, setItem: () => { throw new Error('gesperrt'); } };
    expect(letzteAuswahl()).toEqual([]);
    expect(() => auswahlMerken(['luecke.luecke'])).not.toThrow();
  });
});
