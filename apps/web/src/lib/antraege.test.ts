import { describe, expect, it } from 'vitest';
import { antragLink, antragStand, codeAusAdresse, jpegDatenUrl, pruefungAus, seiteAusPfad, zuAntrag } from './antraege';
import { wasserzeichenRaster } from './bild';

const CODE = '0f6c2b1e-7a3d-4c5e-9b8a-1d2e3f4a5b6c';

describe('Link an den Kunden', () => {
  it('der Code steht im Fragment und kommt dort wieder heraus', () => {
    const link = antragLink(CODE.toUpperCase(), 'https://test.js-rentenplaner.de');
    expect(link).toBe(`https://test.js-rentenplaner.de/antrag#${CODE}`);
    expect(codeAusAdresse(`#${CODE}`)).toBe(CODE);
    expect(codeAusAdresse('#kein-code')).toBeNull();
    expect(codeAusAdresse('')).toBeNull();
  });

  it('die Antwort der Datenbank: nur bekannte Felder und Loesungen', () => {
    expect(pruefungAus({ status: 'abgelaufen' })).toEqual({ status: 'abgelaufen' });
    expect(pruefungAus(null)).toEqual({ status: 'fehler' });
    expect(pruefungAus({
      status: 'offen', offen: ['bank', 'geburtsdatum'], bis: '2026-12-04T10:00:00Z',
      loesungen: [{ id: 'p', art: 'privat', anbieter: 'Musterleben' }, { id: 'x', art: 'fremd' }],
    })).toEqual({
      status: 'offen', offen: ['bank'], bis: '2026-12-04T10:00:00Z',
      loesungen: [{ id: 'p', art: 'privat', anbieter: 'Musterleben' }],
    });
  });
});

describe('Stand eines Antrags', () => {
  const jetzt = new Date('2026-11-04T12:00:00Z');
  const basis = { code: null, linkBis: null, eingang: null, eingegangenAm: null };
  it('Entwurf, beim Kunden, abgelaufen, eingegangen, uebernommen', () => {
    expect(antragStand(basis, jetzt)).toBe('entwurf');
    expect(antragStand({ ...basis, code: CODE, linkBis: '2026-12-01T00:00:00Z' }, jetzt)).toBe('beim-kunden');
    expect(antragStand({ ...basis, code: CODE, linkBis: '2026-11-01T00:00:00Z' }, jetzt)).toBe('abgelaufen');
    expect(antragStand({ ...basis, code: CODE, linkBis: '2026-12-01T00:00:00Z', eingang: {}, eingegangenAm: '2026-11-03' }, jetzt))
      .toBe('eingegangen');
    expect(antragStand({ ...basis, code: CODE, linkBis: '2026-12-01T00:00:00Z', eingegangenAm: '2026-11-03' }, jetzt))
      .toBe('uebernommen');
  });

  it('eine Zeile lesen: Unbekanntes faellt weg, statt zu stoeren', () => {
    const a = zuAntrag({
      id: 'a1', kunde: 'Familie Muster', erstellt_am: '2026-11-04', geaendert_am: '2026-11-04',
      loesungen: [{ id: 'p', art: 'privat', anbieter: 'Musterleben' }, { id: 'x', art: 'unbekannt' }],
      angaben: { bezugsrecht: { p: 2 } }, code: null, link_bis: null, offen: ['bank', 'unsinn'],
      eingang: null, eingegangen_am: null,
    });
    expect(a.loesungen.map((l) => l.id)).toEqual(['p']);
    expect(a.angaben.bezugsrecht).toEqual({ p: 2 });
    expect(a.offen).toEqual(['bank']);
  });

  it('die Seite steht im Dateinamen', () => {
    expect(seiteAusPfad(`${CODE}/hinten-0a1b2c.jpg`)).toBe('hinten');
    expect(seiteAusPfad(`${CODE}/vorne-0a1b2c.jpg`)).toBe('vorne');
  });

  it('eine Kopie als data-URL — nur ein JPEG, auch ein grosses', () => {
    expect(jpegDatenUrl(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('data:image/jpeg;base64,/9j/4A==');
    expect(jpegDatenUrl(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
    expect(jpegDatenUrl(new Uint8Array(0))).toBeNull();
    const gross = new Uint8Array(200_000).map((_, i) => i % 251);
    gross.set([0xff, 0xd8, 0xff]);
    const zurueck = atob(jpegDatenUrl(gross)!.slice('data:image/jpeg;base64,'.length));
    expect(zurueck.length).toBe(gross.length);
    expect([...gross].every((b, i) => zurueck.charCodeAt(i) === b)).toBe(true);
  });
});

describe('Wasserzeichen', () => {
  it('ueberdeckt das ganze Bild — auch die Ecken', () => {
    const { schrift, punkte } = wasserzeichenRaster(1600, 1000);
    expect(schrift).toBe(200);
    expect(punkte.length).toBeGreaterThanOrEqual(6);
    // In jedem Viertel des Bildes steht mindestens ein „KOPIE“.
    for (const [x0, y0] of [[0, 0], [800, 0], [0, 500], [800, 500]] as const) {
      expect(punkte.some((p) => p.x >= x0 && p.x < x0 + 800 && p.y >= y0 && p.y < y0 + 500)).toBe(true);
    }
  });

  it('auch bei kleinen Bildern lesbar gross', () => {
    expect(wasserzeichenRaster(80, 50).schrift).toBe(20);
  });
});
