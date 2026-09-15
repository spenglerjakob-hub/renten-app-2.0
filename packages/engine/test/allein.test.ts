import { PKV_VORGABE } from '../src/social/pkv.js';
import { describe, it, expect } from 'vitest';
import { projiziere } from '../src/projection/timeline.js';
import { nurPerson, EINZELQUOTE } from '../src/analyse/allein.js';
import { jePerson } from '../src/analyse/je-person.js';
import type { Szenario } from '../src/model.js';

/**
 * Die Einzelbetrachtung.
 *
 * Der gefaehrlichste Teil ist nicht die Rechnung, sondern das
 * Zusammenstreichen: Ein blosses Filtern liefert stillschweigend falsche
 * Zahlen, weil die Zeitachse Vertraege mit fremdem Inhaber auf Person A
 * zurueckfallen laesst und das Erwerbseinkommen nach Koepfen teilt. Die
 * ersten drei Tests halten genau das fest.
 */
function paar(over: Partial<Szenario> = {}): Szenario {
  return {
    schemaVersion: 1,
    haushalt: {
      verheiratet: true, bundesland: 'Baden-Württemberg', kirchensteuer: false,
      hatKinder: false, kinderUnter25: 0, kinder: [],
      kvStatus: 'kvdr', kvErwerb: 'gesetzlich', pkv: PKV_VORGABE, zielNettoHeute: 3000,
    },
    annahmen: { inflation: 0.02, rentendynamik: 0.01, tarifIndex: 0.01, gehaltsdynamik: 0.02 },
    einkommenGetrennt: true,
    einkommenHeute: {
      modus: 'brutto', betrag: 8000, auszahlungen: 12,
      besoldungsgruppe: 'A13', besoldungsstufe: 4, besoldungsland: 'Baden-Württemberg',
      grvPflicht: false, grvBeitragMonat: 0,
    },
    einkommenPartner: {
      modus: 'brutto', betrag: 2500, auszahlungen: 12,
      besoldungsgruppe: 'A13', besoldungsstufe: 4, besoldungsland: 'Baden-Württemberg',
      grvPflicht: false, grvBeitragMonat: 0,
    },
    personen: [
      {
        id: 'A', name: 'Anton', geburtsdatum: '1975-04-01', rentenbeginn: '2042-04-01',
        art: 'grv', grvBruttoHeute: 2400,
        besoldungsgruppe: 'A13', besoldungsstufe: 8, ruhegehaltssatz: 71.75,
        dienstbeginn: '2000-01-01', teilzeitphasen: [],
      },
      {
        id: 'B', name: 'Berta', geburtsdatum: '1978-04-01', rentenbeginn: '2045-04-01',
        art: 'grv', grvBruttoHeute: 700,
        besoldungsgruppe: 'A13', besoldungsstufe: 8, ruhegehaltssatz: 71.75,
        dienstbeginn: '2000-01-01', teilzeitphasen: [],
      },
    ],
    vertraege: [
      {
        id: 'vA', inhaber: 'A', schicht: 2, typ: 'bav', name: 'Direktversicherung',
        brutto: 500, strategie: 'rente', altvertrag: false,
      },
      {
        id: 'vB', inhaber: 'B', schicht: 3, typ: 'prvRente', name: 'Privatrente',
        brutto: 200, strategie: 'rente', altvertrag: false,
      },
    ],
    planer: { startkapital: 0, dauerJahre: 25, rendite: 0.02, dynamik: 0, insNettoEinrechnen: false },
    ...over,
  };
}

const imJahr = (s: Szenario, jahr: number) =>
  projiziere(s).zeilen.find((z) => z.jahr === jahr)!;

describe('Das Zusammenstreichen', () => {
  it('die Vertraege des Partners sind weg — und fallen nicht auf die eigene Rechnung zurueck', () => {
    // DER Test gegen `?? personA`: Ein blosses Filtern der Personen haette
    // Bertas Privatrente in Antons Rechnung stehen lassen.
    const e = projiziere(nurPerson(paar(), 'A'));
    for (const z of e.zeilen) {
      expect(z.posten.some((x) => x.id === 'vB')).toBe(false);
    }
    expect(imJahr(nurPerson(paar(), 'A'), 2050).posten.some((x) => x.id === 'vA')).toBe(true);
  });

  it('Person B verschwindet nicht, sondern rechnet mit ihren eigenen Daten', () => {
    // Gegenprobe zum Personenfilter der Zeitachse: `verheiratet: false` ohne
    // Umschreiben auf 'A' haette eine leere Zeitachse ergeben.
    const e = projiziere(nurPerson(paar(), 'B'));
    expect(e.zeilen.length).toBeGreaterThan(0);
    // Bertas Rentenbeginn, nicht Antons.
    expect(e.ruhestandsjahr).toBe(2045);
    expect(imJahr(nurPerson(paar(), 'B'), 2050).posten.some((x) => x.id === 'vB')).toBe(true);
  });

  it('bei getrennten Einkommen bekommt jeder sein eigenes', () => {
    const jetzt = new Date().getFullYear();
    const erwerb = (s: Szenario) => imJahr(s, jetzt).posten
      .filter((x) => x.id.startsWith('erwerb'))
      .reduce((sum, x) => sum + x.bruttoJahr, 0);

    // Berta verdient 2.500, nicht Antons 8.000 und auch nicht die Haelfte
    // der Summe. Ohne Umlegen von `einkommenPartner` bekaeme sie 8.000.
    expect(erwerb(nurPerson(paar(), 'B'))).toBeCloseTo(2500 * 12, 0);
    expect(erwerb(nurPerson(paar(), 'A'))).toBeCloseTo(8000 * 12, 0);
  });

  it('ohne getrennte Erfassung wird der Haushaltsbetrag geteilt', () => {
    const jetzt = new Date().getFullYear();
    const s = paar({ einkommenGetrennt: false });
    const erwerb = imJahr(nurPerson(s, 'B'), jetzt).posten
      .filter((x) => x.id.startsWith('erwerb'))
      .reduce((sum, x) => sum + x.bruttoJahr, 0);
    expect(erwerb).toBeCloseTo(8000 * 12 / 2, 0);
  });
});

describe('Was das Alleinsein kostet', () => {
  it('Grundtarif statt Splitting: dieselben Einkuenfte kosten mehr Steuer', () => {
    const haushalt = imJahr(paar(), 2050);
    const anteilA = jePerson(haushalt).find((b) => b.person === 'A')!;
    const allein = imJahr(nurPerson(paar(), 'A'), 2050);

    // Dasselbe Brutto — Antons Rente und seine Direktversicherung.
    expect(allein.bruttoGesamt).toBeCloseTo(anteilA.bruttoJahr, 0);
    // Aber ohne den Splittingvorteil des Haushalts.
    expect(allein.steuerGesamt).toBeGreaterThan(anteilA.steuerJahr);
  });

  it('die beitragsfreie Mitversicherung entfaellt', () => {
    // Berta ohne eigene Rente: im Haushalt beitragsfrei mitversichert
    // (§ 10 SGB V), allein freiwilliges Mitglied mit dem Mindestbeitrag
    // nach § 240 Abs. 4 SGB V.
    const ohneRente = paar({
      haushalt: { ...paar().haushalt, kvStatus: 'freiwillig' },
      personen: [paar().personen[0]!, { ...paar().personen[1]!, grvBruttoHeute: 0 }],
      vertraege: [paar().vertraege[0]!],
    });

    const imHaushalt = jePerson(imJahr(ohneRente, 2050)).find((b) => b.person === 'B');
    expect(imHaushalt?.kvPvJahr ?? 0).toBeCloseTo(0, 6);

    const allein = imJahr(nurPerson(ohneRente, 'B'), 2050);
    expect(allein.kvPvGesamt).toBeGreaterThan(0);
  });

  it('das eigene Ziel ersetzt das des Haushalts', () => {
    const ohneEigenes = nurPerson(paar(), 'A');
    expect(ohneEigenes.haushalt.zielNettoHeute).toBeCloseTo(3000 * EINZELQUOTE, 6);

    const mitEigenem = nurPerson(paar({
      personen: [{ ...paar().personen[0]!, zielNettoHeute: 2400 }, paar().personen[1]!],
    }), 'A');
    expect(mitEigenem.haushalt.zielNettoHeute).toBe(2400);
  });

  it('die Praemie haelftig, das Planerkapital draussen', () => {
    const s = paar({
      haushalt: { ...paar().haushalt, pkv: { ...PKV_VORGABE, praemieMonat: 800 } },
      planer: { startkapital: 200_000, dauerJahre: 25, rendite: 0.03, dynamik: 0, insNettoEinrechnen: true },
    });
    const allein = nurPerson(s, 'A');
    expect(allein.haushalt.pkv.praemieMonat).toBe(400);
    expect(allein.planer.startkapital).toBe(0);
    // Und es taucht auch in der Rechnung nicht auf.
    expect(imJahr(allein, 2050).posten.some((x) => x.id === 'planer')).toBe(false);
  });
});

describe('Die Grenzen der Einzelbetrachtung', () => {
  it('bei Alleinstehenden aendert sie nichts', () => {
    const single = paar({
      haushalt: { ...paar().haushalt, verheiratet: false },
      einkommenGetrennt: false,
      personen: [paar().personen[0]!],
      vertraege: [paar().vertraege[0]!],
    });
    const vorher = imJahr(single, 2050);
    const nachher = imJahr(nurPerson(single, 'A'), 2050);
    expect(nachher.bruttoGesamt).toBeCloseTo(vorher.bruttoGesamt, 6);
    expect(nachher.steuerGesamt).toBeCloseTo(vorher.steuerGesamt, 6);
    // Nur das Ziel wechselt auf den Einzelmassstab.
    expect(nachher.nettoGesamt).toBeCloseTo(vorher.nettoGesamt, 6);
  });

  it('zwei Einzellaeufe ergeben NICHT den Haushaltslauf — und das ist richtig so', () => {
    /*
      Diese Zusicherung steht hier, damit sie niemand spaeter als Fehler
      "repariert". Die Summe muss abweichen: Der Haushalt wird zusammen
      veranlagt, und genau der Unterschied ist die Aussage der
      Einzelbetrachtung. Getestet wird die RICHTUNG — allein bleibt weniger.
    */
    const haushalt = imJahr(paar(), 2050);
    const a = imJahr(nurPerson(paar(), 'A'), 2050);
    const b = imJahr(nurPerson(paar(), 'B'), 2050);

    expect(a.bruttoGesamt + b.bruttoGesamt).toBeCloseTo(haushalt.bruttoGesamt, 0);
    expect(a.steuerGesamt + b.steuerGesamt).toBeGreaterThan(haushalt.steuerGesamt);
    expect(a.nettoGesamt + b.nettoGesamt).toBeLessThan(haushalt.nettoGesamt);
  });
});
