import { PKV_VORGABE } from '../src/social/pkv.js';
import { describe, it, expect } from 'vitest';
import { projiziere } from '../src/projection/timeline.js';
import { jePerson } from '../src/analyse/je-person.js';
import type { Szenario } from '../src/model.js';

/**
 * Die getrennte Betrachtung eines Ehepaars.
 *
 * Der wichtigste Test ist die INVARIANTE: Was die Bloecke zusammen ergeben,
 * muss genau die Jahreszeile sein. Sie faengt jede Postenquelle, die kuenftig
 * hinzukommt und die Personenzuordnung vergisst — und genau das ist der
 * Fehler, den man sonst erst im Kassenbon eines Kunden sieht.
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
      modus: 'brutto', betrag: 5000, auszahlungen: 12,
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
        id: 'A', name: 'Anna', geburtsdatum: '1975-04-01', rentenbeginn: '2042-04-01',
        art: 'grv', grvBruttoHeute: 1800,
        besoldungsgruppe: 'A13', besoldungsstufe: 8, ruhegehaltssatz: 71.75,
        dienstbeginn: '2000-01-01', teilzeitphasen: [],
      },
      {
        id: 'B', name: 'Bernd', geburtsdatum: '1980-04-01', rentenbeginn: '2047-04-01',
        art: 'grv', grvBruttoHeute: 1200,
        besoldungsgruppe: 'A13', besoldungsstufe: 8, ruhegehaltssatz: 71.75,
        dienstbeginn: '2000-01-01', teilzeitphasen: [],
      },
    ],
    vertraege: [
      {
        id: 'v1', inhaber: 'A', schicht: 2, typ: 'bav', name: 'Direktversicherung',
        brutto: 400, strategie: 'rente', altvertrag: false,
      },
      {
        id: 'v2', inhaber: 'B', schicht: 3, typ: 'prvRente', name: 'Privatrente',
        brutto: 250, strategie: 'rente', altvertrag: false,
      },
    ],
    planer: { startkapital: 0, dauerJahre: 25, rendite: 0.02, dynamik: 0, insNettoEinrechnen: false },
    ...over,
  };
}

describe('Die Jahreszeile je Person', () => {
  it('die Summe der Bloecke ist die Jahreszeile — in jedem Jahr', () => {
    for (const z of projiziere(paar()).zeilen) {
      const b = jePerson(z);
      const summe = (feld: 'bruttoJahr' | 'kvPvJahr' | 'steuerJahr' | 'nettoJahr') =>
        b.reduce((s, x) => s + x[feld], 0);
      expect(summe('bruttoJahr')).toBeCloseTo(z.bruttoGesamt, 6);
      expect(summe('kvPvJahr')).toBeCloseTo(z.kvPvGesamt, 6);
      expect(summe('steuerJahr')).toBeCloseTo(z.steuerGesamt, 6);
      expect(summe('nettoJahr')).toBeCloseTo(z.nettoGesamt, 6);
    }
  });

  it('im vollen Ruhestand stehen genau zwei Bloecke, kein Haushaltsblock', () => {
    const z = projiziere(paar()).zeilen.find((x) => x.jahr === 2050)!;
    const b = jePerson(z);
    expect(b.map((x) => x.person)).toEqual(['A', 'B']);
  });

  it('jeder Block traegt die Vertraege seines Inhabers', () => {
    const z = projiziere(paar()).zeilen.find((x) => x.jahr === 2050)!;
    const [a, bb] = jePerson(z);
    expect(a!.posten.map((x) => x.id).sort()).toEqual(['person-A', 'v1']);
    expect(bb!.posten.map((x) => x.id).sort()).toEqual(['person-B', 'v2']);
  });

  it('die Steuer verteilt sich wie der Beitrag zum zu versteuernden Einkommen', () => {
    // Genau die Zusicherung aus `haushaltssteuer`: EINE Steuer, anteilig
    // zugerechnet. Ein Block mit doppeltem zvE traegt doppelte Steuer.
    const z = projiziere(paar()).zeilen.find((x) => x.jahr === 2050)!;
    const [a, bb] = jePerson(z);
    const zve = (blk: typeof a) => blk!.posten.reduce((s, x) => s + x.zveBeitrag, 0);
    expect(a!.steuerJahr / bb!.steuerJahr).toBeCloseTo(zve(a) / zve(bb), 4);
  });

  it('in der gemischten Phase steht das Erwerbseinkommen beim Arbeitenden', () => {
    const z = projiziere(paar()).zeilen.find((x) => x.jahr === 2044)!;
    expect(z.gemischtePhase).toBe(true);
    const b = jePerson(z);
    const a = b.find((x) => x.person === 'A')!;
    const bernd = b.find((x) => x.person === 'B')!;
    expect(a.posten.some((x) => x.id.startsWith('erwerb'))).toBe(false);
    expect(bernd.posten.some((x) => x.id === 'erwerb-B')).toBe(true);
    // Und Anna bezieht dort bereits Rente.
    expect(a.posten.some((x) => x.id === 'person-A')).toBe(true);
  });

  it('der Entnahmeplan gehoert dem Haushalt', () => {
    const s = paar({
      planer: {
        startkapital: 200_000, dauerJahre: 25, rendite: 0.03, dynamik: 0,
        insNettoEinrechnen: true,
      },
    });
    const z = projiziere(s).zeilen.find((x) => x.jahr === 2050)!;
    const haushalt = jePerson(z).find((x) => x.person === null)!;
    expect(haushalt.posten.map((x) => x.id)).toEqual(['planer']);
    expect(haushalt.bruttoJahr).toBeGreaterThan(0);
  });

  it('ohne Ehepartner gibt es keinen Block B', () => {
    const s = paar({
      haushalt: { ...paar().haushalt, verheiratet: false },
      einkommenGetrennt: false,
    });
    const z = projiziere(s).zeilen.find((x) => x.jahr === 2050)!;
    expect(jePerson(z).map((x) => x.person)).toEqual(['A']);
  });
});
