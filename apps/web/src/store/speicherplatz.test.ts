import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { importiere } from '@renten/schema';

/**
 * DER EIGENE SPEICHERPLATZ der Vertragspruefung: Sie rechnet mit demselben
 * Speicher wie der Rechner, aber ihr Fall darf den Fall im Rechner nie
 * beruehren. Und der Musterfall nennt, woher er kommt.
 */

const RECHNER = 'rentenplaner.szenario.v1';
const PRUEFUNG = 'rentenplaner.vertragspruefung.v1';

let speicher: Map<string, string>;
beforeEach(() => {
  speicher = new Map();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => speicher.get(k) ?? null,
    setItem: (k: string, v: string) => { speicher.set(k, v); },
    removeItem: (k: string) => { speicher.delete(k); },
    clear: () => speicher.clear(),
    key: () => null,
    length: 0,
  } as Storage;
});
afterEach(() => { delete (globalThis as { localStorage?: Storage }).localStorage; });

const gelesen = (k: string) => {
  const roh = speicher.get(k);
  if (!roh) return null;
  const r = importiere(roh);
  return r.ok ? r.szenario : null;
};

describe('Speicherplatz der Vertragsprüfung', () => {
  it('schreibt nur in den eigenen Platz; der Fall im Rechner bleibt unberührt', async () => {
    const { useSzenario, szenarioSpeicherWaehlen } = await import('./szenario');
    // Ein Fall im Rechner …
    useSzenario.getState().setzePerson('A', { vorname: 'Erika', name: 'Erika' });
    const rechnerVorher = speicher.get(RECHNER);
    expect(gelesen(RECHNER)?.personen[0]?.vorname).toBe('Erika');

    // … und die Vertragspruefung beginnt leer, mit eigenem Platz
    szenarioSpeicherWaehlen(PRUEFUNG);
    expect(useSzenario.getState().szenario.personen[0]?.vorname ?? '').toBe('');
    const id = useSzenario.getState().vertragHinzufuegen(3, 'prvRente');
    useSzenario.getState().kinderpoliceUmschalten(id, true);
    useSzenario.getState().setzePerson('A', { vorname: 'Opa', name: 'Opa' });

    expect(speicher.get(RECHNER)).toBe(rechnerVorher);
    expect(gelesen(PRUEFUNG)?.vertraege.map((v) => v.typ)).toEqual(['prvRente']);
    expect(gelesen(PRUEFUNG)?.personen[0]?.vorname).toBe('Opa');

    // Beim naechsten Aufruf liegt der Fall der Vertragspruefung wieder da
    szenarioSpeicherWaehlen(PRUEFUNG);
    expect(useSzenario.getState().szenario.vertraege[0]?.versichertePerson).toBeDefined();

    // Neu beginnen leert nur den eigenen Platz
    useSzenario.getState().zuruecksetzen();
    expect(gelesen(PRUEFUNG)?.vertraege).toEqual([]);
    expect(speicher.get(RECHNER)).toBe(rechnerVorher);
  });

  it('vertragHinzufuegen legt die gewünschte Vertragsart an und gibt die ID zurück', async () => {
    const { useSzenario, szenarioSpeicherWaehlen } = await import('./szenario');
    szenarioSpeicherWaehlen(PRUEFUNG);
    const st = useSzenario.getState();
    const riester = st.vertragHinzufuegen(2, 'riester');
    const ohne = st.vertragHinzufuegen(1);
    const v = useSzenario.getState().szenario.vertraege;
    expect(v.find((x) => x.id === riester)).toMatchObject({ schicht: 2, typ: 'riester' });
    expect(v.find((x) => x.id === ohne)).toMatchObject({ schicht: 1, typ: 'basis' });
  });
});

describe('Musterfall mit Herkunft', () => {
  it('die Vertragsprüfung legt ihren Fall mit Herkunft ab', async () => {
    const { musterfallMerken, offenerMusterfall } = await import('../lib/musterfall');
    const { standardSzenario } = await import('./standard');
    expect(musterfallMerken(standardSzenario(), 'Opa · 2 Verträge', 'vertragspruefung')).toBe(true);
    expect(offenerMusterfall()).toMatchObject({ kurz: 'Opa · 2 Verträge', herkunft: 'vertragspruefung' });
  });

  it('ältere Einträge ohne Herkunft stammen aus der Schnellrechnung', async () => {
    const { musterfallMerken, offenerMusterfall } = await import('../lib/musterfall');
    const { standardSzenario } = await import('./standard');
    musterfallMerken(standardSzenario(), 'Jahrgang 1985');
    expect(offenerMusterfall()?.herkunft).toBe('schnellrechnung');
    const roh = JSON.parse(speicher.get('rentenplaner.musterfall.v1')!) as Record<string, unknown>;
    delete roh.herkunft;
    speicher.set('rentenplaner.musterfall.v1', JSON.stringify(roh));
    expect(offenerMusterfall()?.herkunft).toBe('schnellrechnung');
  });
});
