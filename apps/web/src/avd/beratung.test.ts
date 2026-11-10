import { describe, expect, it } from 'vitest';
import { anfrageText, betreffText, mailText, type Eckdaten } from './Beratung';

const ECKDATEN: Eckdaten = {
  beitragMonat: 150,
  geburtsdatum: '11.03.2003',
  kinder: [{ geburtsjahr: 2019, ausbildungBisJahr: 2040 }, { geburtsjahr: 2022 }],
  verheiratet: false,
  zulagenJahr: 540,
  bonus: 200,
  steuerersparnisJahr: 146,
  endkapital: 344561,
  rentenbeginnJahr: 2070,
};

/** So kodiert der Link — wie `encodeURIComponent` im Fenster. */
const kodiert = (s: string) => encodeURIComponent(s);

describe('mailText', () => {
  it('schreibt Umlaute, Euro, Striche und Anfuehrungszeichen in ASCII', () => {
    expect(mailText('über hätte Grüße Öl Äpfel Übung Straße')).toBe('ueber haette Gruesse Oel Aepfel Uebung Strasse');
    expect(mailText('150 € — „Test“ … 1 000')).toBe('150 EUR - "Test" ... 1 000');
    expect(mailText('José Françoise Łukasz Søren')).toBe('Jose Francoise Lukasz Soren');
  });

  it('laesst ASCII unveraendert und Schriftzeichen ohne Umschrift stehen', () => {
    expect(mailText('Max Muster, 0170 1234567 (ab 17 Uhr)')).toBe('Max Muster, 0170 1234567 (ab 17 Uhr)');
    expect(mailText('张伟')).toBe('张伟');
  });
});

describe('Beratungsanfrage per Mail-Link', () => {
  const text = anfrageText('Jürgen Müller-Weiß', '0170 1234567', 'werktags ab 17 Uhr', ECKDATEN);
  const betreff = betreffText('Jürgen Müller-Weiß');

  it('Text und Betreff bestehen nur aus ASCII-Zeichen', () => {
    expect(text).toMatch(/^[\x00-\x7F]*$/);
    expect(betreff).toBe('Beratung zum Altersvorsorgedepot - Juergen Mueller-Weiss');
  });

  it('jede Kodierung im Link beginnt mit einer Ziffer — nichts, was Yahoo Mail zerlegt', () => {
    const link = `mailto:berater@example.de?subject=${kodiert(betreff)}&body=${kodiert(text)}`;
    expect(link).not.toMatch(/%[89A-Fa-f]/);
  });

  it('die Angaben stehen lesbar darin — Betraege als EUR mit Tausenderpunkt', () => {
    expect(text).toContain('ich habe mich auf Ihrer Seite zum Altersvorsorgedepot informiert und bitte um eine Beratung.');
    expect(text).toContain('Name: Juergen Mueller-Weiss');
    expect(text).toContain('- Beitrag: 150 EUR im Monat (1.800 EUR im Jahr)');
    expect(text).toContain('- Kinder (Geburtsjahre): 2019 (Ausbildung bis 2040), 2022');
    expect(text).toContain('- Berufseinsteigerbonus: 200 EUR einmalig');
    expect(text).toContain('- Kapital zum Rentenbeginn 2070: 344.561 EUR');
    expect(text).toContain('Mit freundlichen Gruessen\nJuergen Mueller-Weiss');
  });

  it('ohne Namen bleibt der Betreff ohne Bindestrich', () => {
    expect(betreffText('')).toBe('Beratung zum Altersvorsorgedepot');
  });
});
