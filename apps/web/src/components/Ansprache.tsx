import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { SIE, woerter, type Ansprache, type AnspracheWoerter } from '../lib/ansprache';

/**
 * Die Ansprache fuer alles darunter — der Rechner setzt sie (Du, Vorname,
 * Paar oder Person), alle anderen Seiten nicht: Dort bleibt es beim Sie,
 * und geteilte Bausteine erzeugen dasselbe Markup wie zuvor.
 */
const AnspracheKontext = createContext<Ansprache>(SIE);

export function AnspracheGeben({ wert, children }: { wert: Ansprache; children: ReactNode }) {
  return <AnspracheKontext.Provider value={wert}>{children}</AnspracheKontext.Provider>;
}

/** Die Woerter der Ansprache an dieser Stelle: `t.dir`, `t.Dein('e')`, `t.anrede('dir')` … */
export function useAnsprache(): AnspracheWoerter {
  const a = useContext(AnspracheKontext);
  return useMemo(() => woerter(a), [a]);
}
