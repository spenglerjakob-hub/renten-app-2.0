import { describe, expect, it } from 'vitest';
import { emailGueltig, mailEmpfaenger } from './email';

describe('emailGueltig', () => {
  it('nimmt Adressen, auch mit Leerzeichen am Rand', () => {
    for (const s of ['anna@beispiel.de', 'a.b-c+bav@firma.example.com', '  anna@beispiel.de ']) expect(emailGueltig(s)).toBe(true);
  });

  it('findet Tippfehler', () => {
    for (const s of ['', '   ', 'anna', 'anna@', 'anna@beispiel', '@beispiel.de', 'anna beispiel@x.de', 'anna@@beispiel.de', `${'a'.repeat(250)}@x.de`]) {
      expect(emailGueltig(s)).toBe(false);
    }
  });
});

describe('mailEmpfaenger', () => {
  it('eine gültige Adresse steht im Link, das @ lesbar', () => {
    expect(mailEmpfaenger(' anna@beispiel.de ')).toBe('anna@beispiel.de');
    expect(`mailto:${mailEmpfaenger('a.b+bav@firma.de')}?subject=x`).toBe('mailto:a.b%2Bbav@firma.de?subject=x');
  });

  it('was den Link stören könnte, wird kodiert', () => {
    expect(mailEmpfaenger('a&b?c#d@x.de')).toBe('a%26b%3Fc%23d@x.de');
  });

  it('ohne gültige Adresse kein Empfänger — der Berater wählt ihn im Mailprogramm', () => {
    expect(mailEmpfaenger('')).toBe('');
    expect(mailEmpfaenger('anna@beispiel')).toBe('');
  });
});
