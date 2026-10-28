import { describe, expect, it } from 'vitest';
import { freigabeAntwortAus, kollegeAus, kollegenName } from './bav-gemeinsam';

describe('Kollegen im Büro', () => {
  it('Name und Agentur aus „Ihr Auftritt“, Rolle und wer man selbst ist', () => {
    expect(kollegeAus({ nutzer: 'i', name: 'Ingrid Inhaberin', agentur: 'Agentur K', rolle: 'inhaber', ich: false }))
      .toEqual({ nutzer: 'i', name: 'Ingrid Inhaberin', agentur: 'Agentur K', rolle: 'inhaber', ich: false });
    expect(kollegeAus({ nutzer: 'm', name: 'm@beispiel.de', rolle: 'mitglied', ich: true }))
      .toEqual({ nutzer: 'm', name: 'm@beispiel.de', agentur: '', rolle: 'mitglied', ich: true });
  });

  it('Unbekanntes führt nie das Büro und ist nie man selbst', () => {
    expect(kollegeAus({ nutzer: 'x', rolle: 'chef' }).rolle).toBe('mitglied');
    expect(kollegeAus({ nutzer: 'x', ich: 'true' }).ich).toBe(false);
  });

  it('der Name eines Kollegen — fehlt er oder ist er leer: null', () => {
    const kollegen = [kollegeAus({ nutzer: 'i', name: 'Ingrid Inhaberin' }), kollegeAus({ nutzer: 'm', name: '' })];
    expect(kollegenName(kollegen, 'i')).toBe('Ingrid Inhaberin');
    expect(kollegenName(kollegen, 'm')).toBeNull();
    expect(kollegenName(kollegen, 'weg')).toBeNull();
  });
});

describe('Antwort auf das Freigeben', () => {
  it('ok und kein_buero — alles andere ist ein Fehler', () => {
    expect(freigabeAntwortAus('ok')).toBe('ok');
    expect(freigabeAntwortAus('kein_buero')).toBe('kein_buero');
    expect(freigabeAntwortAus(null)).toBe('fehler');
    expect(freigabeAntwortAus('OK')).toBe('fehler');
    expect(freigabeAntwortAus({ antwort: 'ok' })).toBe('fehler');
  });
});
