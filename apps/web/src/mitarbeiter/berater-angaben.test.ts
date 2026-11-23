import { describe, expect, it } from 'vitest';
import { AUFTRITT_LEER } from '../features/auftritt';
import {
  BERATER_FELDER, beraterAngabenAus, beraterAngabenFehler, beraterAngabenSpeichern, beraterAngabenVollstaendig, emailPlausibel,
} from './berater-angaben';

const BEN = { ...AUFTRITT_LEER, berater: 'Ben Berater', vorname: 'Ben', nachname: 'Berater', telefon: '040 9', email: 'ben@nord.example' };

describe('Angaben des Beraters — Pflicht für Zugänge einer Agentur', () => {
  it('vier Angaben: Vorname, Nachname, Telefon, E-Mail', () => {
    expect(BERATER_FELDER).toEqual(['vorname', 'nachname', 'telefon', 'email']);
  });

  it('vollständig erst, wenn alle vier gespeichert sind', () => {
    expect(beraterAngabenVollstaendig(null)).toBe(false);
    expect(beraterAngabenVollstaendig(AUFTRITT_LEER)).toBe(false);
    expect(beraterAngabenVollstaendig(BEN)).toBe(true);
    for (const k of BERATER_FELDER) expect(beraterAngabenVollstaendig({ ...BEN, [k]: ' ' })).toBe(false);
    expect(beraterAngabenVollstaendig({ ...BEN, email: 'ben@nord' })).toBe(false);
    // Firma, Logo und Farbe braucht es nicht — die kommen von der Agentur.
    expect(beraterAngabenVollstaendig({ ...BEN, firma: '', logo: null, farbe: null })).toBe(true);
  });

  it('das Formular beginnt mit dem Gespeicherten — die E-Mail sonst mit der des Kontos', () => {
    expect(beraterAngabenAus(null, 'neu@nord.example')).toEqual({ vorname: '', nachname: '', telefon: '', email: 'neu@nord.example' });
    expect(beraterAngabenAus(BEN, 'konto@nord.example')).toEqual({ vorname: 'Ben', nachname: 'Berater', telefon: '040 9', email: 'ben@nord.example' });
    expect(beraterAngabenAus(null, null).email).toBe('');
  });

  it('was fehlt, steht am Feld', () => {
    expect(beraterAngabenFehler({ vorname: '', nachname: ' ', telefon: '', email: '' })).toEqual({
      vorname: 'Bitte Ihren Vornamen eintragen.', nachname: 'Bitte Ihren Nachnamen eintragen.',
      telefon: 'Bitte eine Telefonnummer eintragen.', email: 'Bitte eine E-Mail-Adresse eintragen.',
    });
    expect(beraterAngabenFehler({ vorname: 'Ben', nachname: 'Berater', telefon: '040 9', email: 'ben@nord' }))
      .toEqual({ email: 'Diese E-Mail-Adresse ist unvollständig.' });
    expect(beraterAngabenFehler({ vorname: 'Ben', nachname: 'Berater', telefon: '040 9', email: 'ben@nord.example' })).toEqual({});
  });

  it('E-Mail: grob geprüft', () => {
    expect([emailPlausibel('a@b.de'), emailPlausibel(' a@b.de '), emailPlausibel('a@b'), emailPlausibel('a b@c.de'), emailPlausibel('')])
      .toEqual([true, true, false, false, false]);
  });

  it('gespeichert werden die vier Angaben und der ganze Name — der Rest der Zeile bleibt', () => {
    const bisher = { ...AUFTRITT_LEER, firma: 'Büro Ben', web: 'www.ben.example', zusatz: 'Register 1', farbe: '#112233', logo: 'blob:x' };
    expect(beraterAngabenSpeichern(bisher, { vorname: ' Ben ', nachname: 'Berater', telefon: ' 040 9', email: 'ben@nord.example ' })).toEqual({
      firma: 'Büro Ben', berater: 'Ben Berater', vorname: 'Ben', nachname: 'Berater', telefon: '040 9', email: 'ben@nord.example',
      web: 'www.ben.example', zusatz: 'Register 1', farbe: '#112233',
    });
    expect(beraterAngabenSpeichern(null, { vorname: 'Ben', nachname: 'Berater', telefon: '040 9', email: 'ben@nord.example' }))
      .toMatchObject({ berater: 'Ben Berater', firma: '', farbe: null });
  });
});
