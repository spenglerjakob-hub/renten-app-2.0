import { useEffect, useMemo, useState } from 'react';
import { agenturLaden, type Agentur } from '../lib/bav-agenturen';
import type { Firma } from '../lib/bav-beratung';
import type { Auftritt } from '../features/auftritt';
import { useZugang } from '../store/zugang';
import { agenturAuftritt } from './agentur-texte';
import { useBeraterAuftritt } from './bausteine';

/*
 * Die Agentur einer Firma — geladen, wo sie gebraucht wird: im Kopf der
 * Firma, fuer den Rueckweg zur Agentur und fuer den Briefkopf der Unterlagen.
 *
 * Gemerkt fuer die Dauer der Seite: Wer von der Firma in eine Beratung geht,
 * hat den Auftritt der Agentur sofort — nicht erst nach der Antwort der
 * Datenbank. Aendert die Verwaltung die Daten, merkt `agenturMerken` den
 * neuen Stand.
 */
const gemerkt = new Map<string, Agentur>();

export function agenturMerken(a: Agentur): void {
  gemerkt.set(a.id, a);
}

export function agenturVergessen(id: string): void {
  gemerkt.delete(id);
}

/** null: keine Agentur — oder sie ist (noch) nicht geladen. */
export function useFirmenAgentur(id: string | null): Agentur | null {
  const [agentur, setAgentur] = useState<Agentur | null>(() => (id ? gemerkt.get(id) ?? null : null));
  useEffect(() => {
    if (!id) { setAgentur(null); return undefined; }
    let aktiv = true;
    setAgentur(gemerkt.get(id) ?? null);
    void agenturLaden(id).then((a) => {
      if (!aktiv || !a || a === 'fehler') return;
      gemerkt.set(id, a);
      setAgentur(a);
    });
    return () => { aktiv = false; };
  }, [id]);
  return agentur && agentur.id === id ? agentur : null;
}

/**
 * Der Auftritt auf den Unterlagen einer Firma: der des angemeldeten Beraters —
 * bei einer Firma einer Agentur mit deren Angaben (`agenturAuftritt`).
 */
export function useUnterlagenAuftritt(firma: Pick<Firma, 'agentur'> | null): Auftritt | null {
  const eigen = useBeraterAuftritt();
  const id = firma?.agentur ?? null;
  const agentur = useFirmenAgentur(id);
  const mitglied = useZugang((s) => id !== null && s.zugang?.agentur === id);
  return useMemo(() => agenturAuftritt(eigen, agentur, mitglied), [eigen, agentur, mitglied]);
}
