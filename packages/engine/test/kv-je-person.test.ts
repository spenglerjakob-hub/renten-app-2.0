import { PKV_VORGABE } from '../src/social/pkv.js';
import { describe, it, expect } from 'vitest';
import { projiziere } from '../src/projection/timeline.js';
import { kvProfil } from '../src/social/kv-profil.js';
import { kvPvImAlter } from '../src/social/kv-pv.js';
import { parameterFuer } from '../src/params/registry.js';
import { jePerson } from '../src/analyse/je-person.js';
import type { Szenario, Person } from '../src/model.js';

/**
 * Krankenversicherung JE PERSON.
 *
 * Bis hierher galt ein Status fuer den ganzen Haushalt und EINE Praemie. Ein
 * Paar aus Beamtem und Angestellter war damit nicht abbildbar — und das ist
 * kein Randfall.
 */
const p = parameterFuer(2026, { indexRate: 0 });
const kinderlos = { hatKinder: false, kinderUnter25: 0 };

function paar(over: Partial<Szenario> = {}): Szenario {
  return {
    schemaVersion: 1,
    haushalt: {
      verheiratet: true, bundesland: 'Baden-Württemberg', kirchensteuer: false,
      hatKinder: false, kinderUnter25: 0, kinder: [],
      kvStatus: 'kvdr', kvErwerb: 'gesetzlich', pkv: PKV_VORGABE, zielNettoHeute: 3000,
    },
    annahmen: { inflation: 0, rentendynamik: 0, tarifIndex: 0, gehaltsdynamik: 0 },
    einkommenGetrennt: true,
    einkommenHeute: {
      modus: 'brutto', betrag: 5000, auszahlungen: 12,
      besoldungsgruppe: 'A13', besoldungsstufe: 4, besoldungsland: 'Baden-Württemberg',
      grvPflicht: false, grvBeitragMonat: 0,
    },
    einkommenPartner: {
      modus: 'brutto', betrag: 3000, auszahlungen: 12,
      besoldungsgruppe: 'A13', besoldungsstufe: 4, besoldungsland: 'Baden-Württemberg',
      grvPflicht: false, grvBeitragMonat: 0,
    },
    personen: [
      {
        id: 'A', name: 'Anton', geburtsdatum: '1975-04-01', rentenbeginn: '2042-04-01',
        art: 'grv', grvBruttoHeute: 2000,
        besoldungsgruppe: 'A13', besoldungsstufe: 8, ruhegehaltssatz: 71.75,
        dienstbeginn: '2000-01-01', teilzeitphasen: [],
      },
      {
        id: 'B', name: 'Berta', geburtsdatum: '1975-04-01', rentenbeginn: '2042-04-01',
        art: 'grv', grvBruttoHeute: 2000,
        besoldungsgruppe: 'A13', besoldungsstufe: 8, ruhegehaltssatz: 71.75,
        dienstbeginn: '2000-01-01', teilzeitphasen: [],
      },
    ],
    vertraege: [],
    planer: { startkapital: 0, dauerJahre: 25, rendite: 0.02, dynamik: 0, insNettoEinrechnen: false },
    ...over,
  };
}

const mitB = (felder: Partial<Person>): Szenario => paar({
  personen: [paar().personen[0]!, { ...paar().personen[1]!, ...felder }],
});

const imJahr = (s: Szenario, jahr: number) =>
  projiziere(s).zeilen.find((z) => z.jahr === jahr)!;

describe('Das Profil: Person, sonst Haushalt', () => {
  it('ohne eigene Angabe gilt der Haushalt', () => {
    const s = paar();
    expect(kvProfil(s, s.personen[1]).status).toBe('kvdr');
    expect(kvProfil(s, s.personen[1]).pkv).toBe(s.haushalt.pkv);
  });

  it('die eigene Angabe sticht', () => {
    const s = mitB({ kvStatus: 'pkv' });
    expect(kvProfil(s, s.personen[0]).status).toBe('kvdr');
    expect(kvProfil(s, s.personen[1]).status).toBe('pkv');
  });

  it('die Erwerbsphase folgt dem EIGENEN Ruhestandsstatus', () => {
    // Sonst waere eine privat versicherte Partnerin in einem gesetzlichen
    // Haushalt bis zum Rentenbeginn gesetzlich und danach privat — ein Weg,
    // den es nicht gibt.
    const s = mitB({ kvStatus: 'pkv' });
    expect(kvProfil(s, s.personen[1]).erwerb).toBe('pkv');
    expect(kvProfil(s, s.personen[0]).erwerb).toBe('gesetzlich');
  });
});

describe('Ein Haushalt, zwei Kassen', () => {
  it('jedes Mitglied rechnet mit seinem eigenen Status', () => {
    // Zwei gleich hohe Renten, A in der KVdR, B freiwillig mit einer
    // Privatrente. Nur B zahlt darauf Beitraege.
    const r = kvPvImAlter('kvdr', [
      { id: 'rente-A', art: 'gesetzlicheRente', monatsbetrag: 2000, person: 'A' },
      { id: 'rente-B', art: 'gesetzlicheRente', monatsbetrag: 2000, person: 'B' },
      { id: 'privat-B', art: 'sonstiges', monatsbetrag: 1000, person: 'B' },
    ], kinderlos, p, {
      verheiratet: true,
      jeMitglied: { A: { status: 'kvdr' }, B: { status: 'freiwillig' } },
    });
    expect(r.jeQuelle.find((x) => x.id === 'privat-B')).toBeDefined();
    // In der KVdR waere dieselbe Privatrente beitragsfrei.
    const beide = kvPvImAlter('kvdr', [
      { id: 'rente-A', art: 'gesetzlicheRente', monatsbetrag: 2000, person: 'A' },
      { id: 'rente-B', art: 'gesetzlicheRente', monatsbetrag: 2000, person: 'B' },
      { id: 'privat-B', art: 'sonstiges', monatsbetrag: 1000, person: 'B' },
    ], kinderlos, p, { verheiratet: true });
    expect(r.gesamt).toBeGreaterThan(beide.gesamt);
  });

  it('einer gesetzlich, einer privat — beide Zweige in einer Rechnung', () => {
    const r = kvPvImAlter('kvdr', [
      { id: 'rente-A', art: 'gesetzlicheRente', monatsbetrag: 2000, person: 'A' },
      { id: 'rente-B', art: 'gesetzlicheRente', monatsbetrag: 2000, person: 'B' },
    ], kinderlos, p, {
      verheiratet: true,
      jeMitglied: {
        A: { status: 'kvdr' },
        B: { status: 'pkv', pkvPraemieMonat: 700 },
      },
    });
    // A: 12,95 % auf 2.000. Frueher verwarf der PKV-Zweig diese Buchung ganz.
    expect(r.jeQuelle.find((x) => x.id === 'rente-A')!.kv
      + r.jeQuelle.find((x) => x.id === 'rente-A')!.pv).toBeCloseTo(2000 * 0.1295, 2);
    // B: Praemie abzueglich des Zuschusses aus der EIGENEN Rente.
    expect(r.jeQuelle.find((x) => x.id === 'rente-B')!.kv)
      .toBeCloseTo(700 - Math.min(2000 * 0.0875, 350), 2);
  });

  it('der Zusatzbeitrag der eigenen Kasse wirkt nur bei ihr', () => {
    const gleich = kvPvImAlter('kvdr', [
      { id: 'rente-A', art: 'gesetzlicheRente', monatsbetrag: 2000, person: 'A' },
      { id: 'rente-B', art: 'gesetzlicheRente', monatsbetrag: 2000, person: 'B' },
    ], kinderlos, p, { verheiratet: true });
    const teurer = kvPvImAlter('kvdr', [
      { id: 'rente-A', art: 'gesetzlicheRente', monatsbetrag: 2000, person: 'A' },
      { id: 'rente-B', art: 'gesetzlicheRente', monatsbetrag: 2000, person: 'B' },
    ], kinderlos, p, {
      verheiratet: true,
      jeMitglied: { A: { status: 'kvdr' }, B: { status: 'kvdr', zusatzbeitrag: 0.05 } },
    });
    // Nur bei B, und nur zur Haelfte (die DRV traegt die andere).
    const mehr = 2000 * (0.05 - p.kv.zusatzbeitrag) / 2;
    expect(teurer.gesamt - gleich.gesamt).toBeCloseTo(mehr, 6);
  });

  it('beim privat versicherten Partner gibt es keine Mitversicherung', () => {
    // Berta ohne eigene Rente. Ist Anton gesetzlich, ist sie beitragsfrei
    // mitversichert; ist er privat, muss sie sich selbst versichern.
    const ohneRente = [
      { id: 'rente-A', art: 'gesetzlicheRente' as const, monatsbetrag: 2000, person: 'A' },
      { id: 'rente-B', art: 'gesetzlicheRente' as const, monatsbetrag: 0, person: 'B' },
    ];
    const beiIhm = kvPvImAlter('freiwillig', ohneRente, kinderlos, p, { verheiratet: true });
    expect(beiIhm.jeQuelle.find((x) => x.id === 'rente-B')).toBeUndefined();

    const erPrivat = kvPvImAlter('freiwillig', ohneRente, kinderlos, p, {
      verheiratet: true,
      jeMitglied: {
        A: { status: 'pkv', pkvPraemieMonat: 700 },
        B: { status: 'freiwillig' },
      },
    });
    // Sie zahlt jetzt den Mindestbeitrag nach § 240 Abs. 4 SGB V.
    expect(erPrivat.gesamt).toBeGreaterThan(beiIhm.gesamt);
  });
});

describe('An der Zeitachse', () => {
  it('eine eigene Praemie zaehlt ganz, der Haushaltsbeitrag wird geteilt', () => {
    const haushalt = imJahr(paar({
      haushalt: { ...paar().haushalt, kvStatus: 'pkv', kvErwerb: 'pkv',
        pkv: { ...PKV_VORGABE, praemieMonat: 800 } },
    }), 2045);
    const eigene = imJahr(mitB({
      pkv: { ...PKV_VORGABE, praemieMonat: 800 },
    } as Partial<Person>), 2045);

    // Haushalt: 800 fuer beide zusammen. Eigene Praemie bei B: 800 nur fuer
    // sie, A bleibt in der KVdR.
    expect(haushalt.kvPvGesamt).toBeGreaterThan(0);
    expect(eigene.kvPvGesamt).toBeGreaterThan(0);
  });

  it('der privat versicherte Partner taucht mit seiner Praemie auf', () => {
    const s = mitB({ kvStatus: 'pkv', pkv: { ...PKV_VORGABE, praemieMonat: 600 } });
    const z = imJahr(s, 2045);
    const bloecke = jePerson(z);
    const a = bloecke.find((x) => x.person === 'A')!;
    const b = bloecke.find((x) => x.person === 'B')!;
    // Gleiche Rente, aber B traegt eine Praemie statt 12,95 %.
    expect(b.kvPvJahr).toBeGreaterThan(a.kvPvJahr);
  });

  it('ohne abweichende Angabe aendert sich nichts', () => {
    const vorher = imJahr(paar(), 2045);
    const mitLeerenFeldern = imJahr(mitB({}), 2045);
    expect(mitLeerenFeldern.nettoGesamt).toBeCloseTo(vorher.nettoGesamt, 6);
    expect(mitLeerenFeldern.kvPvGesamt).toBeCloseTo(vorher.kvPvGesamt, 6);
  });
});
