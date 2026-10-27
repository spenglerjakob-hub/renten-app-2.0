import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { describe, expect, it } from 'vitest';

/*
 * Unterschriebene Unterlagen liegen als HTML in der Datenbank — mit den
 * Klassen, die der Druck beim Unterschreiben hatte. fassung-klassen.txt haelt
 * sie im Stylesheet. Damit die Liste mitwaechst, muss sie heute schon jede
 * Regel erzeugen, die der Druck erzeugt: Aendert ihn spaeter jemand, sind die
 * Klassen der bis dahin unterschriebenen Fassungen schon gesichert.
 *
 * Schlaegt der Test fehl, gehoeren die genannten Klassen in die Liste —
 * ergaenzen, nie kuerzen.
 */
const DRUCK = [
  'mitarbeiter/druck.tsx', 'mitarbeiter/festschreiben.tsx', 'druck/DeckblattKopf.tsx',
  'druck/Bausteine.tsx', 'components/Logo.tsx', 'components/LueckenRing.tsx',
];

const lies = (pfad: string) => readFileSync(new URL(`../${pfad}`, import.meta.url), 'utf8');

/** Die Selektoren, die Tailwind mit der App-Konfiguration fuer diesen Inhalt erzeugt. */
async function selektoren(inhalt: string): Promise<Set<string>> {
  const konfiguration = (await import(/* @vite-ignore */ new URL('../../tailwind.config.js', import.meta.url).href)).default;
  const css = await postcss([tailwindcss({ ...konfiguration, content: [{ raw: inhalt, extension: 'tsx' }] })])
    .process(lies('index.css'), { from: undefined });
  const s = new Set<string>();
  css.root.walkRules((regel) => regel.selectors.forEach((x) => s.add(x)));
  return s;
}

describe('fassung-klassen.txt', () => {
  it('enthaelt jede Klasse, die der Druck heute nutzt', async () => {
    const [druck, liste] = await Promise.all([
      selektoren(DRUCK.map(lies).join('\n')),
      selektoren(lies('mitarbeiter/fassung-klassen.txt')),
    ]);
    expect([...druck].filter((x) => !liste.has(x))).toEqual([]);
  }, 30000);
});
