import { createContext, useContext, useMemo } from 'react';
import type { BeratungSprache } from '@renten/schema';

/**
 * DIE SPRACHE DER MITARBEITERBERATUNG — Deutsch oder Englisch, je Beratung
 * gewaehlt (`daten.sprache`).
 *
 * DER DEUTSCHE TEXT BLEIBT, WO ER IST; der englische steht direkt daneben:
 *
 *     const w = useW();
 *     <Karte titel={w('Zur Person', 'About you')}>
 *
 * So liest man beide im Zusammenhang, und am deutschen aendert sich nichts.
 * Kommt eine dritte Sprache dazu, bekommt `Wort` ein drittes Argument — dann
 * zeigt der Compiler jede Stelle, an der sie noch fehlt.
 *
 * Ausserhalb von Komponenten (Saetze in `texte.ts`, Zeilen in `zeilen.ts`)
 * reicht man die Sprache durch und holt sich `wahl(sprache)`.
 *
 * WAS NICHT UEBERSETZT WIRD: Zahlen und Daten. Sie stehen in jeder Sprache
 * in deutscher Schreibweise (1.234,56 €, 01.07.2027) — so wie auf der
 * Gehaltsabrechnung und in den Unterlagen, die der Mitarbeiter unterschreibt.
 * Ein Betrag, der am Bildschirm anders aussieht als im Vertrag, waere die
 * schlechtere Uebersetzung.
 *
 * Die Vorgabe des Kontexts ist Deutsch: Alles ausserhalb der
 * Mitarbeiterberatung (der Rechner, die Arbeitgeberseiten) liest Deutsch,
 * ohne etwas davon zu wissen.
 */
export type Sprache = BeratungSprache;

/** Die Sprachen zur Auswahl — jede in ihrer eigenen Sprache benannt. */
export const SPRACHEN: readonly { id: Sprache; name: string }[] = [
  { id: 'de', name: 'Deutsch' },
  { id: 'en', name: 'English' },
];

/** Deutsch zuerst, dann Englisch — beide vom selben Typ. */
export type Wort = <T>(de: T, en: T) => T;

export const wahl = (sprache: Sprache): Wort => (de, en) => (sprache === 'en' ? en : de);

export const SpracheKontext = createContext<Sprache>('de');

export const useSprache = (): Sprache => useContext(SpracheKontext);

/** `w('Deutsch', 'English')` in der Sprache der Beratung. */
export function useW(): Wort {
  const sprache = useSprache();
  return useMemo(() => wahl(sprache), [sprache]);
}
