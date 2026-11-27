import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NUTZUNGSBEDINGUNGEN_FASSUNG } from '../lib/nutzungsbedingungen';

/**
 * Die Fassung der Nutzungsbedingungen steht an zwei Stellen: als Datum unter
 * der Ueberschrift (das liest der Nutzer) und als Konstante (danach fragt die
 * Zugangsschranke neu). Beide muessen dasselbe sagen — sonst stimmt jemand
 * einer Fassung zu, die anders heisst als die, die er liest.
 *
 * Gilt auf dem Arbeitszweig wie auf `live`, wo die aeltere Fassung steht.
 *
 * Was der Test NICHT kann: merken, dass der Text geaendert wurde und das
 * Datum stehen blieb. Wer am Text der Nutzungsbedingungen etwas aendert,
 * setzt beides hoch.
 */
const text = readFileSync(fileURLToPath(new URL('./Seite.tsx', import.meta.url)), 'utf8');
const MONATE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

describe('Fassung der Nutzungsbedingungen', () => {
  it('nennt unter der Überschrift dasselbe Datum wie die Konstante', () => {
    const [jahr, monat, tag] = NUTZUNGSBEDINGUNGEN_FASSUNG.split('-').map(Number) as [number, number, number];
    const daten = [...text.matchAll(/Fassung vom ([^<]+)</g)].map((m) => m[1]);
    expect(daten).toEqual([`${tag}. ${MONATE[monat - 1]} ${jahr}`]);
  });
});
