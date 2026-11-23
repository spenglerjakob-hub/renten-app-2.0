import { describe, expect, it } from 'vitest';
import { agenturDatenSchema } from '@renten/schema';
import { AUFTRITT_LEER } from '../features/auftritt';
import type { Agentur } from '../lib/bav-agenturen';
import type { Firma } from '../lib/bav-beratung';
import { neuesAngebot } from '@renten/schema';
import {
  agenturAuftritt, agenturHatAuftritt, agenturKurz, agenturStandText, agenturZeilen, rolleText, zugaengeText, zugangName,
} from './agentur-texte';
import { ortAus, ortSuche } from './ort';
import { axaBerater } from './axa';
import { axaAngabenSchema } from '@renten/schema';

const NORD = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const SUED = 'aaaaaaaa-0000-4000-8000-0000000000a2';
const agentur = (id: string, name: string, daten = {}, geaendertAm = '2026-11-01', logoPfad: string | null = null): Agentur =>
  ({ id, name, daten: agenturDatenSchema.parse(daten), logoPfad, erstelltAm: '2026-10-01', geaendertAm });
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

  it('Name, Ansprechpartner und Kontakt kommen von der Agentur; ohne eigenen Auftritt der Agentur bleiben Logo, Farbe und Zusatz', () => {
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

  it('ein Zugang der Agentur: sein Name und sein Kontakt gehen vor, die Agentur füllt die Lücken', () => {
    const ben = { ...AUFTRITT_LEER, berater: 'Ben Berater', vorname: 'Ben', nachname: 'Berater', email: 'ben@nord.example' };
    expect(agenturAuftritt(ben, nord, true)).toEqual({
      ...ben, firma: 'AXA Agentur Nord', telefon: '040 2',
    });
    // Im Briefkopf steht die Agentur — auch wenn der Zugang einen eigenen Firmennamen hat. Ohne eigenen Namen berät ihr Ansprechpartner.
    expect(agenturAuftritt({ ...AUFTRITT_LEER, firma: 'Büro Ben' }, nord, true))
      .toMatchObject({ firma: 'AXA Agentur Nord', berater: 'Anna Agentin', vorname: 'Anna', nachname: 'Agentin' });
  });

  it('der Auftritt der Agentur gilt für alle: Logo, Akzentfarbe, Internetadresse, Zusatzzeile', () => {
    const pfad = `u/agentur-${NORD}-0123456789abcdef01234567.png`;
    const mit = agentur(NORD, 'AXA Agentur Nord', { farbe: '#0f766e', web: 'www.nord.example', zusatz: 'Vertreter nach § 34d GewO' }, '2026-11-01', pfad);
    const ben = { ...AUFTRITT_LEER, berater: 'Ben Berater', vorname: 'Ben', nachname: 'Berater', telefon: '040 9', email: 'ben@nord.example' };
    expect(agenturAuftritt(ben, mit, true, 'blob:nord')).toEqual({
      ...ben, firma: 'AXA Agentur Nord', farbe: '#0f766e', web: 'www.nord.example', zusatz: 'Vertreter nach § 34d GewO', logo: 'blob:nord',
    });
    // auch für die Verwaltung — statt ihres eigenen Logos und ihrer eigenen Farbe
    expect(agenturAuftritt(eigen, mit, false, 'blob:nord')).toMatchObject({
      firma: 'AXA Agentur Nord', farbe: '#0f766e', web: 'www.nord.example', zusatz: 'Vertreter nach § 34d GewO', logo: 'blob:nord',
    });
    // Solange das Logo der Agentur lädt, steht keines da — nicht das eines anderen.
    expect(agenturAuftritt(eigen, mit)!.logo).toBeNull();
    // Eine Farbe, die keine ist, gilt nicht.
    expect(agenturAuftritt(eigen, agentur(NORD, 'Nord', { farbe: 'blau' }))!.farbe).toBe('#112233');
  });

  it('hat die Agentur einen eigenen Auftritt?', () => {
    expect(agenturHatAuftritt(agentur(NORD, 'Nord'))).toBe(false);
    expect(agenturHatAuftritt(agentur(NORD, 'Nord', { vorname: 'Anna', telefon: '040' }))).toBe(false);
    expect(agenturHatAuftritt(agentur(NORD, 'Nord', { farbe: '#0f766e' }))).toBe(true);
    expect(agenturHatAuftritt(agentur(NORD, 'Nord', { zusatz: 'Register' }))).toBe(true);
    expect(agenturHatAuftritt(agentur(NORD, 'Nord', {}, '', 'u/agentur-x.png'))).toBe(true);
  });

  it('der Ansprechpartner ist die Vorgabe für den Berater im AXA-Antrag — eine Beratung kann einen anderen nennen', () => {
    const auftritt = agenturAuftritt(eigen, nord);
    expect(axaBerater(axaAngabenSchema.parse({}), auftritt)).toEqual({ vorname: 'Anna', nachname: 'Agentin' });
    expect(axaBerater(axaAngabenSchema.parse({ beraterVorname: 'Ben', beraterNachname: 'Berater' }), auftritt))
      .toEqual({ vorname: 'Ben', nachname: 'Berater' });
  });
});

describe('Zugänge einer Agentur in Worten', () => {
  it('der Name, wenn er eingetragen ist — sonst die Adresse mit dem Hinweis, was fehlt', () => {
    expect(zugangName({ name: ' Anna Zwei ', email: 'anna@nord.example' })).toEqual({ haupt: 'Anna Zwei', neben: 'anna@nord.example' });
    expect(zugangName({ name: '', email: 'neu@nord.example' }))
      .toEqual({ haupt: 'neu@nord.example', neben: 'Angaben als Berater noch nicht eingetragen' });
    expect(zugangName({ name: '', email: '' }).haupt).toBe('Ohne E-Mail-Adresse');
  });

  it('Rolle und Zahl der Zugänge', () => {
    expect([rolleText('admin'), rolleText('mitglied')]).toEqual(['Admin', 'Mitglied']);
    expect(zugaengeText([])).toBe('Noch kein Zugang');
    expect(zugaengeText([{ rolle: 'mitglied' }])).toBe('1 Zugang');
    expect(zugaengeText([{ rolle: 'admin' }, { rolle: 'mitglied' }, { rolle: 'mitglied' }])).toBe('3 Zugänge, davon 1 Admin');
    expect(zugaengeText([{ rolle: 'admin' }, { rolle: 'admin' }])).toBe('2 Zugänge, davon 2 Admins');
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
