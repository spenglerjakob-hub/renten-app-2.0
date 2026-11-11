import { describe, expect, it } from 'vitest';
import { standardSzenario } from '../store/standard';
import { euro } from '../components/Feld';
import {
  alterAm, datenSatz, einkommenSatz, haushaltSatz, personenSatz, vertraegeSatz, zielSatz,
} from './daten-ergebnis';

const HEUTE = new Date(2026, 10, 11); // 11.11.2026

/** Der Standardfall mit Namen und, auf Wunsch, einem Ehepartner. */
function fall(paar = false) {
  const s = standardSzenario();
  s.personen[0]!.vorname = 'Anna';
  s.personen[0]!.name = 'Anna Beispiel';
  if (paar) {
    s.haushalt.verheiratet = true;
    s.personen.push({ ...s.personen[0]!, id: 'B', vorname: 'Max', name: 'Max Beispiel', geburtsdatum: '15.12.1982' });
  }
  return s;
}

describe('alterAm', () => {
  it('zählt vollendete Jahre — vor dem Geburtstag eines weniger', () => {
    expect(alterAm('01.01.1985', HEUTE)).toBe(41);
    expect(alterAm('15.12.1982', HEUTE)).toBe(43);
    expect(alterAm('11.11.1982', HEUTE)).toBe(44);
  });

  it('ohne gültiges Datum kein Alter', () => {
    expect(alterAm('', HEUTE)).toBeNull();
    expect(alterAm('31.02.1985', HEUTE)).toBeNull();
  });
});

describe('Ergebnis-Sätze der Angaben', () => {
  it('Haushalt: Familienstand, Kinder nur wenn vorhanden, Versicherung', () => {
    const s = fall();
    expect(haushaltSatz(s)).toBe('Alleinstehend · gesetzlich versichert');
    s.haushalt.verheiratet = true;
    s.haushalt.kinderUnter25 = 2;
    s.haushalt.kvStatus = 'pkv';
    expect(haushaltSatz(s)).toBe('Verheiratet · 2 Kinder · privat versichert');
    s.haushalt.kinderUnter25 = 1;
    expect(haushaltSatz(s)).toContain('1 Kind ·');
  });

  it('Person: Vorname, Alter und Rentenanspruch', () => {
    expect(personenSatz(fall(), HEUTE)).toBe(`Anna, 41 · Rentenanspruch ${euro(1500)}`);
  });

  it('ohne Namen steht das Alter in Jahren — kein „Person A“', () => {
    const s = standardSzenario();
    expect(personenSatz(s, HEUTE)).toBe(`41 Jahre · Rentenanspruch ${euro(1500)}`);
  });

  it('Beamte: „Pension“ statt eines Rentenanspruchs', () => {
    const s = fall();
    s.personen[0]!.art = 'pension';
    expect(personenSatz(s, HEUTE)).toBe('Anna, 41 · Pension');
  });

  it('ein Paar: beide mit Alter, ohne Ansprüche', () => {
    expect(personenSatz(fall(true), HEUTE)).toBe('Anna, 41 · Max, 43');
  });

  it('der Ehepartner zählt nur, solange „verheiratet“ gesetzt ist', () => {
    const s = fall(true);
    s.haushalt.verheiratet = false;
    expect(personenSatz(s, HEUTE)).toBe(`Anna, 41 · Rentenanspruch ${euro(1500)}`);
  });

  it('Einkommen je Art', () => {
    const s = fall();
    expect(einkommenSatz(s)).toBe(`${euro(4000)} brutto im Monat`);
    s.einkommenHeute.modus = 'netto';
    expect(einkommenSatz(s)).toBe(`${euro(4000)} netto im Monat`);
    s.einkommenHeute.modus = 'selbststaendig';
    expect(einkommenSatz(s)).toBe(`${euro(4000)} Gewinn im Monat`);
    s.einkommenHeute.modus = 'besoldung';
    expect(einkommenSatz(s)).toBe('Besoldung A13, Stufe 4');
  });

  it('getrennte Einkommen eines Paars stehen beide da', () => {
    const s = fall(true);
    s.einkommenGetrennt = true;
    s.einkommenPartner = { ...s.einkommenHeute, modus: 'netto', betrag: 2100 };
    expect(einkommenSatz(s)).toBe(`${euro(4000)} brutto im Monat · ${euro(2100)} netto im Monat`);
  });

  it('Verträge: Anzahl, „keine“ erst wenn die Frage beantwortet ist', () => {
    const s = fall();
    expect(vertraegeSatz(s, true)).toBe('');
    expect(vertraegeSatz(s, false)).toBe('Keine bestehenden Verträge');
    s.vertraege.push({} as never);
    expect(vertraegeSatz(s, false)).toBe('1 Vertrag');
    s.vertraege.push({} as never);
    expect(vertraegeSatz(s, false)).toBe('2 Verträge');
  });

  it('Ziel und die Zeile der ganzen Etappe', () => {
    const s = fall();
    expect(zielSatz(s)).toBe(`${euro(2000)} netto im Monat, in heutigem Geld`);
    expect(datenSatz(s, HEUTE)).toBe(`Anna, 41 · Ziel ${euro(2000)} netto`);
    expect(datenSatz(fall(true), HEUTE)).toBe(`Anna, 41 · Max, 43 · Ziel ${euro(2000)} netto`);
  });
});
