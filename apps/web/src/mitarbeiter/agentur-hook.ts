import { useEffect, useMemo, useState } from 'react';
import { agenturLaden, agenturLogoLaden, type Agentur } from '../lib/bav-agenturen';
import type { Firma } from '../lib/bav-beratung';
import type { Auftritt } from '../features/auftritt';
import { useAuftritt } from '../store/auftritt';
import { useZugang } from '../store/zugang';
import { agenturAuftritt } from './agentur-texte';

/*
 * Die Agentur einer Firma — geladen, wo sie gebraucht wird: im Kopf der
 * Firma, fuer den Rueckweg zur Agentur und fuer den Briefkopf der Unterlagen.
 *
 * Gemerkt fuer die Dauer der Seite: Wer von der Firma in eine Beratung geht,
 * hat den Auftritt der Agentur sofort — nicht erst nach der Antwort der
 * Datenbank. Aendert jemand die Daten, merkt `agenturMerken` den neuen Stand.
 *
 * Bewusst ohne die Bausteine der Mitarbeiterberatung: Auch die
 * Arbeitgeber-Seiten lesen hier den Auftritt (`useGeltenderAuftritt`) und
 * sollen deren Bundle nicht mitladen.
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

/** Das Logo einer Agentur als Object-URL — null: keines, oder es laedt noch. Beim Wechsel wird die alte URL freigegeben. */
export function useAgenturLogo(pfad: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let aktiv = true;
    let geladen: string | null = null;
    setUrl(null);
    if (pfad) {
      void agenturLogoLaden(pfad).then((u) => {
        if (aktiv) { geladen = u; setUrl(u); } else if (u) URL.revokeObjectURL(u);
      });
    }
    return () => {
      aktiv = false;
      if (geladen) URL.revokeObjectURL(geladen);
    };
  }, [pfad]);
  return url;
}

/** Der eigene Auftritt des angemeldeten Kontos — geladen, falls es noch niemand getan hat. */
function useEigenerAuftritt(): Auftritt | null {
  const auftritt = useAuftritt((s) => s.auftritt);
  const status = useAuftritt((s) => s.status);
  const laden = useAuftritt((s) => s.laden);
  useEffect(() => { if (status === 'aus') void laden(); }, [status, laden]);
  return auftritt;
}

/**
 * Der Auftritt auf den Unterlagen einer Firma: der des angemeldeten Beraters —
 * bei einer Firma einer Agentur mit deren Angaben und Auftritt (`agenturAuftritt`).
 */
export function useUnterlagenAuftritt(firma: Pick<Firma, 'agentur'> | null): Auftritt | null {
  const eigen = useEigenerAuftritt();
  const id = firma?.agentur ?? null;
  const agentur = useFirmenAgentur(id);
  const logo = useAgenturLogo(agentur?.logoPfad ?? null);
  const mitglied = useZugang((s) => id !== null && s.zugang?.agentur === id);
  return useMemo(() => agenturAuftritt(eigen, agentur, mitglied, logo), [eigen, agentur, mitglied, logo]);
}

/**
 * Der Auftritt, der fuer das angemeldete Konto gilt — auf den
 * Arbeitgeber-Seiten, wo keine Firma einer Agentur im Spiel sein muss: Ein
 * Zugang einer Agentur traegt deren Auftritt (Name, Logo, Farbe), alle
 * anderen ihren eigenen wie bisher.
 */
export function useGeltenderAuftritt(): Auftritt | null {
  const eigen = useEigenerAuftritt();
  const id = useZugang((s) => s.zugang?.agentur ?? null);
  const agentur = useFirmenAgentur(id);
  const logo = useAgenturLogo(agentur?.logoPfad ?? null);
  return useMemo(() => agenturAuftritt(eigen, agentur, true, logo), [eigen, agentur, logo]);
}
