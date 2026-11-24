import { useCallback } from 'react';
import { useSzenario } from '../store/szenario';
import { fehlt } from './vorbelegung';

/**
 * FEHLT DIESE ANGABE NOCH? — fuer die Felder der Angaben.
 *
 * `leer` zeigt das Feld leer, gleich welcher Platzhalter im Fall liegt;
 * `onLeeren` nimmt die Angabe wieder zurueck, wenn jemand das Feld leert —
 * ein leeres Feld ist dann wieder eine fehlende Angabe und keine 0.
 *
 * Eigene Datei, weil `features/vorbelegung.ts` rein bleibt: Der Store
 * importiert von dort, und ein Store-Import zurueck waere ein Kreis.
 */
export function useFehlt(): (pfad: string) => { leer: boolean; onLeeren: () => void } {
  const s = useSzenario((x) => x.szenario);
  const leeren = useSzenario((x) => x.leeren);
  return useCallback((pfad: string) => ({
    leer: fehlt(s, pfad),
    onLeeren: () => leeren(pfad),
  }), [s, leeren]);
}
