import { describe, expect, it } from 'vitest';
import {
  AUFTRITT_LEER, FARBVORSCHLAEGE, akzentVariablen, auftrittLeer, auftrittSichtbar, bueroAuftrittAus, cssZeichenkette,
  farbeNormal, fusszeileCss, fusszeileText, kontaktZeile, kontrastZuWeiss, linieKaumSichtbar, mitBueroAuftritt, titelTauglich,
  type Auftritt,
} from './auftritt';

const muster: Auftritt = {
  ...AUFTRITT_LEER,
  firma: 'Muster Finanz GmbH',
  berater: 'Max Mustermann',
  telefon: '0711 123456',
  email: 'max@muster.de',
  web: 'www.muster.de',
};

describe('Akzentfarbe', () => {
  it('Kontrast nach WCAG: Schwarz 21, Weiss 1', () => {
    expect(kontrastZuWeiss('#000000')).toBeCloseTo(21, 5);
    expect(kontrastZuWeiss('#ffffff')).toBeCloseTo(1, 5);
  });

  it('das Gruen der Vorgabe ist fuer Ueberschriften zu hell, Dunkelblau nicht', () => {
    expect(kontrastZuWeiss('#10b981')).toBeLessThan(4.5);
    expect(kontrastZuWeiss('#1e3a8a')).toBeGreaterThan(4.5);
  });

  it('alle Vorschlaege taugen fuer Ueberschriften', () => {
    for (const v of FARBVORSCHLAEGE) expect(titelTauglich(v.farbe), v.name).toBe(true);
  });

  it('dunkle Farbe: Linie und Titel; helle: nur die Linie; keine: nichts', () => {
    expect(akzentVariablen({ farbe: '#1e3a8a' })).toEqual({ '--akzent-linie': '#1e3a8a', '--akzent-titel': '#1e3a8a' });
    expect(akzentVariablen({ farbe: '#fde047' })).toEqual({ '--akzent-linie': '#fde047' });
    expect(akzentVariablen({ farbe: null })).toEqual({});
    expect(akzentVariablen(null)).toEqual({});
    expect(akzentVariablen({ farbe: 'blau' })).toEqual({});
  });

  it('fast weiss oder hellgelb: Linien kaum sichtbar; Bernstein ist zu sehen', () => {
    expect(linieKaumSichtbar('#fafafa')).toBe(true);
    expect(linieKaumSichtbar('#fde047')).toBe(true); // 1,3 : 1
    expect(linieKaumSichtbar('#f59e0b')).toBe(false); // 2,1 : 1 — fuer Titel zu hell, fuer Linien genug
    expect(titelTauglich('#f59e0b')).toBe(false);
    expect(linieKaumSichtbar(null)).toBe(false);
  });

  it('Eingaben werden normalisiert, Ungueltiges wird null', () => {
    expect(farbeNormal('#1E3A8A')).toBe('#1e3a8a');
    expect(farbeNormal(' #0f766e ')).toBe('#0f766e');
    expect(farbeNormal('#abc')).toBeNull();
    expect(farbeNormal('blau')).toBeNull();
    expect(farbeNormal(null)).toBeNull();
  });
});

describe('Auftritt', () => {
  it('leer ist kein Auftritt — eine Farbe allein auch nicht, Leerzeichen ebenso wenig', () => {
    expect(auftrittSichtbar(AUFTRITT_LEER)).toBe(false);
    expect(auftrittSichtbar({ ...AUFTRITT_LEER, farbe: '#1e3a8a' })).toBe(false);
    expect(auftrittSichtbar({ ...AUFTRITT_LEER, firma: '   ' })).toBe(false);
    expect(auftrittSichtbar({ ...AUFTRITT_LEER, logo: 'data:image/png;base64,AAAA' })).toBe(true);
    expect(auftrittSichtbar({ ...AUFTRITT_LEER, telefon: '0711 1' })).toBe(true);
    expect(auftrittSichtbar(null)).toBe(false);
  });

  it('leer heisst: auch keine Farbe', () => {
    expect(auftrittLeer(AUFTRITT_LEER)).toBe(true);
    expect(auftrittLeer({ ...AUFTRITT_LEER, farbe: '#1e3a8a' })).toBe(false);
    expect(auftrittLeer(muster)).toBe(false);
  });

  it('Kontaktzeile ohne leere Teile — der Name steht darueber in eigener Zeile', () => {
    expect(kontaktZeile(muster)).toBe('0711 123456 · max@muster.de · www.muster.de');
    expect(kontaktZeile({ ...muster, telefon: '', web: ' ' })).toBe('max@muster.de');
  });
});

describe('Fusszeile', () => {
  it('Firma, Name und Telefon — sonst E-Mail und Website', () => {
    expect(fusszeileText(muster)).toBe('Muster Finanz GmbH · Max Mustermann · 0711 123456');
    expect(fusszeileText({ ...AUFTRITT_LEER, email: 'max@muster.de', web: 'www.muster.de' }))
      .toBe('max@muster.de · www.muster.de');
  });

  it('wird auf 100 Zeichen gekappt, Zeilenumbrueche werden Leerzeichen', () => {
    const lang = fusszeileText({ ...AUFTRITT_LEER, firma: 'A'.repeat(120) });
    expect(lang.length).toBe(100);
    expect(lang.endsWith('…')).toBe(true);
    expect(fusszeileText({ ...AUFTRITT_LEER, firma: 'Muster\nFinanz' })).toBe('Muster Finanz');
  });

  it('CSS-Zeichenkette: Anfuehrungszeichen, Backslash, Steuerzeichen, kein „<“', () => {
    expect(cssZeichenkette('Müller "&" Söhne \\ GmbH')).toBe('"Müller \\"&\\" Söhne \\\\ GmbH"');
    expect(cssZeichenkette('a\nb\tc')).toBe('"a b c"');
    const boese = cssZeichenkette('</style><script>alert(1)</script>');
    expect(boese).not.toContain('<');
    expect(boese.startsWith('"') && boese.endsWith('"')).toBe(true);
  });

  it('ohne Auftritt keine Fusszeile — der Ausdruck bleibt wie bisher', () => {
    expect(fusszeileCss(null)).toBe('');
    expect(fusszeileCss(AUFTRITT_LEER)).toBe('');
    expect(fusszeileCss({ ...AUFTRITT_LEER, farbe: '#1e3a8a' })).toBe('');
  });

  it('mit Auftritt: Randfelder links und rechts, Seitenzahl mit Gesamtzahl', () => {
    const css = fusszeileCss(muster);
    expect(css).toContain('@media print { @page {');
    expect(css).toContain('@bottom-left { content: "Muster Finanz GmbH · Max Mustermann · 0711 123456";');
    expect(css).toContain('"erstellt mit dem JS-Rentenplaner · Seite " counter(page) " von " counter(pages)');
  });

  it('nur ein Logo: rechts die Seitenzahl, links nichts', () => {
    const css = fusszeileCss({ ...AUFTRITT_LEER, logo: 'data:image/png;base64,AAAA' });
    expect(css).not.toContain('@bottom-left');
    expect(css).toContain('@bottom-right');
  });
});

describe('Im Büro: Logo, Firmenname und Akzentfarbe vom Inhaber', () => {
  const buero = { firma: 'Agentur K GmbH', farbe: '#0f766e', logo: 'inhaber/logo-0123456789abcdef01234567.png', inhaber: 'Ingrid Inhaberin' };
  const eigen: Auftritt = { ...muster, farbe: '#7f1d1d', logo: 'blob:eigenes', zusatz: 'Reg.-Nr. D-1' };

  it('die Antwort der Datenbank: nur ein Objekt zaehlt, Werte werden geprueft', () => {
    expect(bueroAuftrittAus(null)).toBeNull();
    expect(bueroAuftrittAus([])).toBeNull();
    expect(bueroAuftrittAus('x')).toBeNull();
    expect(bueroAuftrittAus(buero)).toEqual(buero);
    expect(bueroAuftrittAus({ firma: 3, farbe: '#ABC', logo: '', inhaber: null }))
      .toEqual({ firma: '', farbe: null, logo: null, inhaber: '' });
    expect(bueroAuftrittAus({ farbe: '#0F766E' })?.farbe).toBe('#0f766e');
  });

  it('Logo, Firmenname und Farbe vom Buero, Name und Kontakt bleiben die eigenen', () => {
    const a = mitBueroAuftritt(eigen, buero, 'blob:buero');
    expect([a.firma, a.farbe, a.logo]).toEqual(['Agentur K GmbH', '#0f766e', 'blob:buero']);
    expect([a.berater, a.telefon, a.email, a.web, a.zusatz]).toEqual(['Max Mustermann', '0711 123456', 'max@muster.de', 'www.muster.de', 'Reg.-Nr. D-1']);
  });

  it('hat der Inhaber nichts eingetragen, bleibt es leer — auch wenn das Mitglied eigene Werte hat', () => {
    const a = mitBueroAuftritt(eigen, { firma: '', farbe: null, logo: null, inhaber: 'Ingrid Inhaberin' }, null);
    expect([a.firma, a.farbe, a.logo]).toEqual(['', null, null]);
    expect(a.berater).toBe('Max Mustermann');
  });

  it('ohne eigene Angaben: nur das, was das Buero vorgibt', () => {
    const a = mitBueroAuftritt(null, buero, 'blob:buero');
    expect(a).toEqual({ ...AUFTRITT_LEER, firma: 'Agentur K GmbH', farbe: '#0f766e', logo: 'blob:buero' });
    expect(auftrittSichtbar(a)).toBe(true);
    expect(auftrittLeer(mitBueroAuftritt(null, { firma: '', farbe: null, logo: null, inhaber: '' }, null))).toBe(true);
  });
});
