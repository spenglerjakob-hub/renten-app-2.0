import { useCallback } from 'react';
import { useSzenario } from '../store/szenario';
import type { Vorbelegt } from '../components/Feld';
import { eintragVon, offenePfade, relevant } from './vorbelegung';

/**
 * Die Marke je Pfad — fuer die Felder der Basisdaten.
 *
 * Eigene Datei, weil `features/vorbelegung.ts` rein bleibt: Der Store
 * importiert von dort, und ein Store-Import zurueck waere ein Kreis.
 */
export function useVorbelegt(): (pfad: string) => Vorbelegt | undefined {
  const s = useSzenario((x) => x.szenario);
  const pruefen = useSzenario((x) => x.pruefen);
  return useCallback((pfad: string) => {
    if (!offenePfade(s).includes(pfad) || !relevant(s, pfad)) return undefined;
    const e = eintragVon(pfad);
    if (!e) return undefined;
    return {
      art: e.art,
      hinweis: e.hinweis,
      onPruefen: e.art === 'beispiel' ? () => pruefen(pfad) : undefined,
    };
  }, [s, pruefen]);
}
