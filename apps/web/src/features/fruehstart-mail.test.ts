import { describe, expect, it } from 'vitest';
import { FRUEHSTART_MONATE, FRUEHSTART_RABATT_PROZENT } from '@renten/schema/preise';
import { LIVE_ADRESSE, absageMail, anfrageLink, mailto, zusageMail } from './fruehstart-mail';

const TOKEN = '5ca873d7-d440-4eae-bc32-ac7563f3c297';
const lesen = (url: string) => {
  const [kopf, rest] = url.split('?');
  const p = new URLSearchParams(rest);
  return { an: decodeURIComponent(kopf!.replace('mailto:', '')), betreff: p.get('subject'), text: p.get('body') ?? '' };
};

describe('Vorbereitete E-Mails zur Early-Adopter-Anfrage', () => {
  it('der Link fuehrt immer auf die Live-Seite', () => {
    expect(anfrageLink(TOKEN)).toBe(`${LIVE_ADRESSE}/?fruehstart=${TOKEN}`);
    expect(LIVE_ADRESSE).toBe('https://js-rentenplaner.de');
  });

  it('Zusage: an den Interessenten, mit Anrede, Link und den Bedingungen', () => {
    const m = lesen(zusageMail({ name: '  Max   Muster ', email: 'max.muster@example.de' }, TOKEN));
    expect(m.an).toBe('max.muster@example.de');
    expect(m.betreff).toBe('Ihr Zugang als Early Adopter beim JS-Rentenplaner');
    expect(m.text.startsWith('Guten Tag Max Muster,')).toBe(true);
    expect(m.text).toContain(anfrageLink(TOKEN));
    expect(m.text).toContain(`${FRUEHSTART_MONATE} Monate kostenlos`);
    expect(m.text).toContain(`${FRUEHSTART_RABATT_PROZENT} % Rabatt auf das erste Jahr`);
    expect(m.text).toContain('Der Link gilt 30 Tage');
  });

  it('Absage: ohne Link, mit Hinweis auf die Testphase', () => {
    const m = lesen(absageMail({ name: 'Erika Beispiel', email: 'erika@example.de' }));
    expect(m.an).toBe('erika@example.de');
    expect(m.text).not.toContain('fruehstart=');
    expect(m.text).toContain('Tage kostenlos und ohne Zahlungsdaten');
  });

  it('mailto: Zeilen mit CRLF, Sonderzeichen sicher kodiert, @ lesbar', () => {
    const url = mailto('a+b@example.de', 'Ä & ?', ['Zeile 1', 'Zeile 2 & = #']);
    expect(url.startsWith('mailto:a%2Bb@example.de?subject=')).toBe(true);
    expect(url).toContain('%0D%0A');
    const m = lesen(url);
    expect(m.betreff).toBe('Ä & ?');
    expect(m.text).toBe('Zeile 1\r\nZeile 2 & = #');
  });
});
