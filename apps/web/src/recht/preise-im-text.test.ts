import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EINSTEIGER_BIS, TESTTAGE } from '@renten/schema/preise';

/**
 * Die Nutzungsbedingungen nennen Zahlen des Abos als Text (Seite.tsx sagt,
 * warum). Aendert sich preise.ts, muss der Text mit — sonst verspricht er
 * etwas anderes als die Preisseite.
 *
 * Auf `live` fehlt der Abschnitt „Abo, Preise und Zahlung“, bis die Abrechnung
 * startet. Dann gibt es nichts zu pruefen; steht er da, muss er stimmen.
 */
const text = readFileSync(fileURLToPath(new URL('./Seite.tsx', import.meta.url)), 'utf8');
const klausel = (name: string) => {
  const anfang = text.indexOf(`<strong>${name}.</strong>`);
  return anfang < 0 ? null : text.slice(anfang, text.indexOf('</li>', anfang));
};
const MONATE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

describe('Nutzungsbedingungen und preise.ts', () => {
  it('nennen dieselbe Länge der Testphase', () => {
    const k = klausel('Testphase');
    if (k === null) return;
    expect(k).toContain(`${TESTTAGE} Tage kostenlos`);
  });

  it('nennen dasselbe Ende des Einsteigerpreises', () => {
    const k = klausel('Einsteigerpreis');
    if (k === null) return;
    const [jahr, monat, tag] = EINSTEIGER_BIS.split('-').map(Number) as [number, number, number];
    expect(k).toContain(`bis zum ${tag}. ${MONATE[monat - 1]} ${jahr} beginnen`);
  });

  it('haben beide Klauseln oder keine — der Abschnitt kommt als Ganzes', () => {
    expect(klausel('Testphase') === null).toBe(klausel('Einsteigerpreis') === null);
  });
});
