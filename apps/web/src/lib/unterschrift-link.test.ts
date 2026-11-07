import { describe, expect, it } from 'vitest';
import {
  codeEingabe, linkSeite, nachweisAus, oeffnenAus, tokenAusAdresse, unterschreibenAus, unterschriftLink,
} from './unterschrift-link';

const TOKEN = '0123456789abcdef0123456789abcdef';

describe('Der Link', () => {
  it('liest den Token aus dem Fragment — nur 32 Hex-Ziffern', () => {
    expect(tokenAusAdresse(`#${TOKEN}`)).toBe(TOKEN);
    expect(tokenAusAdresse(`#${TOKEN.toUpperCase()}`)).toBe(TOKEN);
    expect(tokenAusAdresse(`#${TOKEN.slice(0, 31)}`)).toBeNull();
    expect(tokenAusAdresse(`#${TOKEN}x`)).toBeNull();
    expect(tokenAusAdresse('')).toBeNull();
  });

  it('baut den Link mit dem Token im Fragment', () => {
    expect(unterschriftLink(TOKEN, 'https://js-rentenplaner.de')).toBe(`https://js-rentenplaner.de/unterschrift#${TOKEN}`);
  });

  it('nennt der Datenbank nur die beiden eigenen Seiten', () => {
    expect(linkSeite('https://js-rentenplaner.de')).toBe('https://js-rentenplaner.de');
    expect(linkSeite('https://test.js-rentenplaner.de')).toBe('https://test.js-rentenplaner.de');
    expect(linkSeite('http://localhost:5173')).toBeNull();
  });

  it('nimmt den Code mit Leerzeichen oder Bindestrich, hoechstens sechs Zeichen', () => {
    expect(codeEingabe('482 913')).toBe('482913');
    expect(codeEingabe('482-913')).toBe('482913');
    expect(codeEingabe('4829131')).toBe('482913');
  });
});

describe('Antwort beim Oeffnen', () => {
  const ok = {
    status: 'ok', mitarbeiter: 'Anna Beispiel', firma: 'Muster GmbH', entscheidung: 'teilnahme', axa: false,
    gueltig_bis: '2026-11-16T10:00:00+00:00', festgeschrieben_am: '2026-11-02T10:00:00+00:00',
    pruefsummen: { protokoll: 'aa', vereinbarung: 'bb', fremd: 'cc' },
    unterlagen: { protokoll: '<p>P</p>', vereinbarung: '<p>V</p>' },
    berater: { name: 'Anton Berater', telefon: '0761 1', email: 'a@b.de' },
    unterschriften: [
      { person: 'berater', name: 'Anton Berater', zug: 'M5 5L100 50', dokumente: ['protokoll'], unterschrieben_am: '2026-11-02T10:00:00+00:00', kanal: 'bildschirm' },
      { person: 'chef', name: 'X', zug: 'M5 5L100 50', dokumente: [], unterschrieben_am: '', kanal: 'link' },
    ],
  };

  it('uebernimmt Inhalt und Unterschriften, laesst Unbekanntes weg', () => {
    const v = oeffnenAus(ok);
    expect(v.status).toBe('ok');
    if (v.status !== 'ok') return;
    expect(v.mitarbeiter).toBe('Anna Beispiel');
    expect(v.pruefsummen).toEqual({ protokoll: 'aa', vereinbarung: 'bb' });
    expect(v.unterlagen).toEqual({ protokoll: '<p>P</p>', vereinbarung: '<p>V</p>' });
    expect(v.unterschriften).toEqual([{
      person: 'berater', name: 'Anton Berater', zug: 'M5 5L100 50', dokumente: ['protokoll'],
      unterschriebenAm: '2026-11-02T10:00:00+00:00', kanal: 'bildschirm', nachweis: null,
    }]);
  });

  it('falscher Code mit Rest; ohne Rest gilt der Link als gesperrt', () => {
    expect(oeffnenAus({ status: 'code_falsch', rest: 3 })).toEqual({ status: 'code_falsch', rest: 3 });
    expect(oeffnenAus({ status: 'code_falsch', rest: 0 })).toEqual({ status: 'gesperrt' });
  });

  it('Sperren kommen durch; alles andere ist ein Fehler', () => {
    for (const s of ['ungueltig', 'abgelaufen', 'gesperrt', 'unterschrieben'] as const) {
      expect(oeffnenAus({ status: s })).toEqual({ status: s });
    }
    expect(oeffnenAus(null)).toEqual({ status: 'fehler' });
    expect(oeffnenAus({ status: 'irgendwas' })).toEqual({ status: 'fehler' });
    expect(oeffnenAus({ ...ok, entscheidung: 'offen' })).toEqual({ status: 'fehler' });
    expect(oeffnenAus({ ...ok, unterlagen: { vereinbarung: '<p>V</p>' } })).toEqual({ status: 'fehler' });
  });
});

describe('Antwort beim Unterschreiben', () => {
  it('ok mit Zeitpunkt und Unterlagen', () => {
    expect(unterschreibenAus({ status: 'ok', name: 'Anna', unterschrieben_am: '2026-11-02T10:00:00+00:00', dokumente: ['protokoll', 'x'] }))
      .toEqual({ status: 'ok', name: 'Anna', unterschriebenAm: '2026-11-02T10:00:00+00:00', dokumente: ['protokoll'] });
  });

  it('Ablehnungen der Datenbank', () => {
    expect(unterschreibenAus({ status: 'veraendert' })).toEqual({ status: 'veraendert' });
    expect(unterschreibenAus({ status: 'zug_ungueltig' })).toEqual({ status: 'zug_ungueltig' });
    expect(unterschreibenAus({ status: 'code_falsch', rest: 1 })).toEqual({ status: 'code_falsch', rest: 1 });
    expect(unterschreibenAus({ status: 'ok' })).toEqual({ status: 'fehler' });
  });
});

describe('Der Nachweis', () => {
  it('liest die Felder der Datenbank, leere fallen weg', () => {
    expect(nachweisAus({
      link: 'hash', link_erstellt_am: '2026-11-02T09:00:00+00:00', link_erstellt_von: 'Anton Berater',
      geoeffnet_am: '2026-11-02T09:30:00+00:00', code_bestaetigt_am: '2026-11-02T09:35:00+00:00',
      ip: '203.0.113.7', weiterleitung: '203.0.113.7, 10.0.0.1', browser: '', adresse: 'https://js-rentenplaner.de',
      pruefsummen: { protokoll: 'aa', vereinbarung: 'bb' },
    })).toEqual({
      linkErstelltAm: '2026-11-02T09:00:00+00:00', linkErstelltVon: 'Anton Berater',
      geoeffnetAm: '2026-11-02T09:30:00+00:00', codeBestaetigtAm: '2026-11-02T09:35:00+00:00',
      ip: '203.0.113.7', weiterleitung: '203.0.113.7, 10.0.0.1', browser: undefined, adresse: 'https://js-rentenplaner.de',
      pruefsummen: { protokoll: 'aa', vereinbarung: 'bb' },
    });
    expect(nachweisAus(null)).toBeNull();
  });
});
