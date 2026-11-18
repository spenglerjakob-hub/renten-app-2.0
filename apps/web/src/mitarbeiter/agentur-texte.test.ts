import { describe, expect, it } from 'vitest';
import { agenturDatenSchema } from '@renten/schema';
import { AUFTRITT_LEER } from '../features/auftritt';
import type { Agentur } from '../lib/bav-agenturen';
import type { Firma } from '../lib/bav-beratung';
import { neuesAngebot } from '@renten/schema';
import { agenturAuftritt, agenturKurz, agenturStandText, agenturZeilen } from './agentur-texte';
import { ortAus, ortSuche } from './ort';
import { axaBerater } from './axa';
import { axaAngabenSchema } from '@renten/schema';

const NORD = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const SUED = 'aaaaaaaa-0000-4000-8000-0000000000a2';
const agentur = (id: string, name: string, daten = {}, geaendertAm = '2026-11-01'): Agentur =>
  ({ id, name, daten: agenturDatenSchema.parse(daten), erstelltAm: '2026-10-01', geaendertAm });
const firma = (id: string, a: string | null): Firma => ({
  id, name: id, angebot: neuesAngebot(), logoPfad: null, geaendertAm: '', besitzer: 'x', eigene: false, buero: null,
  agentur: a, aenderbar: a !== null,
});

describe('agenturZeilen — die Übersicht der bAV-Verwaltung', () => {
  const agenturen = [agentur(SUED, 'Süd', {}, '2026-11-10'), agentur(NORD, 'Nord', {}, '2026-11-05')];
  const firmen = [firma('f1', NORD), firma('f2', NORD), firma('f3', SUED), firma('f4', null)];
  const staende = { f1: { offen: 1, teilnahme: 4, verzicht: 0 }, f2: { offen: 0, teilnahme: 2, verzicht: 1 } };
  const zugaenge = { [NORD]: { zugaenge: 2, einladungen: 1 } };

  it('je Agentur: Firmen, Beratungen über alle Firmen, Zugänge', () => {
    const [nord, sued] = agenturZeilen(agenturen, firmen, staende, zugaenge);
    expect([nord!.agentur.name, nord!.firmen, nord!.stand, nord!.zugaenge, nord!.einladungen])
      .toEqual(['Nord', 2, { offen: 1, teilnahme: 6, verzicht: 1 }, 2, 1]);
    expect([sued!.agentur.name, sued!.firmen, sued!.stand, sued!.zugaenge]).toEqual(['Süd', 1, { offen: 0, teilnahme: 0, verzicht: 0 }, 0]);
  });

  it('sortiert nach Name, nach Zahl der Firmen oder zuletzt geändert', () => {
    const namen = (s: Parameters<typeof agenturZeilen>[4]) => agenturZeilen(agenturen, firmen, staende, zugaenge, s).map((z) => z.agentur.name);
    expect(namen('name')).toEqual(['Nord', 'Süd']);
    expect(namen('firmen')).toEqual(['Nord', 'Süd']);
    expect(namen('geaendert')).toEqual(['Süd', 'Nord']);
    expect(agenturZeilen(agenturen, [firma('f3', SUED)], {}, {}, 'firmen').map((z) => z.agentur.name)).toEqual(['Süd', 'Nord']);
  });

  it('die Zeile unter dem Namen', () => {
    expect(agenturStandText({ firmen: 3, zugaenge: 2, einladungen: 1 })).toBe('3 Firmen · 2 Zugänge · 1 offene Einladung');
    expect(agenturStandText({ firmen: 1, zugaenge: 1, einladungen: 0 })).toBe('1 Firma · 1 Zugang');
    expect(agenturStandText({ firmen: 0, zugaenge: 0, einladungen: 2 })).toBe('Noch keine Firma · noch kein Zugang · 2 offene Einladungen');
  });

  it('Ansprechpartner und Organisationsnummer in Kurzform', () => {
    expect(agenturKurz(agenturDatenSchema.parse({ vorname: 'Anna', nachname: 'Agentin', organisationsnummer: ' 4711 ' })))
      .toBe('Anna Agentin · Organr. 4711');
    expect(agenturKurz(agenturDatenSchema.parse({ organisationsnummer: '4711' }))).toBe('Organr. 4711');
    expect(agenturKurz(agenturDatenSchema.parse({}))).toBe('');
  });
});

describe('agenturAuftritt — wessen Name auf den Unterlagen einer Agentur-Firma steht', () => {
  const eigen = { ...AUFTRITT_LEER, firma: 'bAV-Verwaltung GmbH', berater: 'Vera Verwalterin', vorname: 'Vera', nachname: 'Verwalterin',
    telefon: '0761 1', email: 'vera@verwaltung.example', zusatz: 'Register 123', farbe: '#112233', logo: 'blob:logo' };
  const nord = agentur(NORD, 'AXA Agentur Nord', { vorname: 'Anna', nachname: 'Agentin', telefon: '040 2', email: 'anna@nord.example' });

  it('ohne Agentur bleibt der Auftritt des Beraters', () => {
    expect(agenturAuftritt(eigen, null)).toBe(eigen);
    expect(agenturAuftritt(null, null)).toBeNull();
  });

  it('Name, Ansprechpartner und Kontakt kommen von der Agentur; Logo, Farbe und Zusatz bleiben', () => {
    expect(agenturAuftritt(eigen, nord)).toEqual({
      ...eigen, firma: 'AXA Agentur Nord', berater: 'Anna Agentin', vorname: 'Anna', nachname: 'Agentin',
      telefon: '040 2', email: 'anna@nord.example',
    });
  });

  it('was an der Agentur fehlt, bleibt vom Berater', () => {
    const ohne = agenturAuftritt(eigen, agentur(SUED, 'Agentur Süd'))!;
    expect([ohne.firma, ohne.berater, ohne.telefon, ohne.email]).toEqual(['Agentur Süd', 'Vera Verwalterin', '0761 1', 'vera@verwaltung.example']);
  });

  it('ein Konto ohne eigenen Auftritt bekommt den der Agentur', () => {
    expect(agenturAuftritt(null, nord)).toMatchObject({ firma: 'AXA Agentur Nord', berater: 'Anna Agentin', logo: null });
    expect(agenturAuftritt(null, nord, true)).toMatchObject({ firma: 'AXA Agentur Nord', berater: 'Anna Agentin', telefon: '040 2' });
  });

  it('ein Zugang der Agentur: seine eigenen Angaben gehen vor, die Agentur füllt die Lücken', () => {
    const ben = { ...AUFTRITT_LEER, berater: 'Ben Berater', vorname: 'Ben', nachname: 'Berater', email: 'ben@nord.example' };
    expect(agenturAuftritt(ben, nord, true)).toEqual({
      ...ben, firma: 'AXA Agentur Nord', telefon: '040 2',
    });
    // Nur der Name der Firma ist eingetragen: Dann beraet der Ansprechpartner der Agentur.
    expect(agenturAuftritt({ ...AUFTRITT_LEER, firma: 'Büro Ben' }, nord, true))
      .toMatchObject({ firma: 'Büro Ben', berater: 'Anna Agentin', vorname: 'Anna', nachname: 'Agentin' });
  });

  it('der Ansprechpartner ist die Vorgabe für den Berater im AXA-Antrag — eine Beratung kann einen anderen nennen', () => {
    const auftritt = agenturAuftritt(eigen, nord);
    expect(axaBerater(axaAngabenSchema.parse({}), auftritt)).toEqual({ vorname: 'Anna', nachname: 'Agentin' });
    expect(axaBerater(axaAngabenSchema.parse({ beraterVorname: 'Ben', beraterNachname: 'Berater' }), auftritt))
      .toEqual({ vorname: 'Ben', nachname: 'Berater' });
  });
});

describe('Ort — die Agentur in der Adresse', () => {
  it('eine Agentur; mit Firma zählt nur die Firma', () => {
    expect(ortAus(`?agentur=${NORD.toUpperCase()}`)).toEqual({ agentur: NORD, firma: null, beratung: null, reiter: 'mitarbeiter' });
    expect(ortAus(`?agentur=${NORD}&firma=${SUED}`).agentur).toBeNull();
    expect(ortAus('?agentur=unsinn').agentur).toBeNull();
  });

  it('und zurück in die Adresse', () => {
    expect(ortSuche({ agentur: NORD, firma: null, beratung: null, reiter: 'mitarbeiter' })).toBe(`?agentur=${NORD}`);
    expect(ortSuche({ agentur: NORD, firma: SUED, beratung: null, reiter: 'mitarbeiter' })).toBe(`?firma=${SUED}`);
    expect(ortSuche({ firma: null, beratung: null, reiter: 'mitarbeiter' })).toBe('');
  });
});
