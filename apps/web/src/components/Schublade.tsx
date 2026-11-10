import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useModal } from './useModal';

/** So lange gleitet die Schublade — gleich `duration-300` unten. */
const DAUER = 300;

const ruhig = () => typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/**
 * Eine Schublade, die von rechts hereingleitet — fuer Erklaerungen neben der
 * Seite, etwa die Rechnung hinter einer Zahl. Am Telefon nimmt sie die volle
 * Breite ein, am Bildschirm einen schmalen Streifen; die Seite bleibt dahinter
 * sichtbar und abgedunkelt.
 *
 * Sie ist ein modales Fenster wie `Dialog` (Fokus, Escape, ruhender
 * Hintergrund aus `useModal`). Beim Schliessen bleibt sie so lange stehen, bis
 * sie hinausgeglitten ist; bei „Bewegung reduzieren“ erscheint und
 * verschwindet sie ohne Bewegung. Im Druck gibt es sie nicht.
 */
export function Schublade({ offen, titel, untertitel, onSchliessen, children }: {
  offen: boolean;
  titel: string;
  untertitel?: string;
  onSchliessen: () => void;
  children: ReactNode;
}) {
  const kastenRef = useRef<HTMLDivElement>(null);
  const titelId = useId();
  /** Im Dokument — auch noch waehrend des Hinausgleitens */
  const [da, setDa] = useState(offen);
  /** Eingeschoben: steuert die Bewegung */
  const [drin, setDrin] = useState(false);

  useEffect(() => {
    if (offen) {
      setDa(true);
      // Zwei Takte: erst steht sie draussen, dann gleitet sie herein.
      let innen = 0;
      const aussen = requestAnimationFrame(() => { innen = requestAnimationFrame(() => setDrin(true)); });
      return () => { cancelAnimationFrame(aussen); cancelAnimationFrame(innen); };
    }
    setDrin(false);
    const t = window.setTimeout(() => setDa(false), ruhig() ? 0 : DAUER);
    return () => window.clearTimeout(t);
  }, [offen]);

  useModal(offen, kastenRef, onSchliessen);

  /*
    Schon im ersten Takt nach dem Oeffnen im Dokument, nicht erst, wenn `da`
    nachgezogen hat: `useModal` setzt den Fokus in genau diesem Takt — fehlte
    die Schublade da noch, blieb der Fokus draussen und Tab lief ins Leere.
  */
  if (!offen && !da) return null;

  return (
    <div className={`fixed inset-0 z-[60] print:hidden ${offen ? '' : 'pointer-events-none'}`}>
      <div
        aria-hidden
        onMouseDown={onSchliessen}
        className={`absolute inset-0 bg-ui-tinte/40 transition-opacity duration-300 motion-reduce:transition-none ${
          drin ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <div
        ref={kastenRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titelId}
        className={`absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-2xl transition-transform duration-300 ease-out motion-reduce:transition-none ${
          drin ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-ui-linie px-5 py-4">
          <div className="min-w-0">
            <h2 id={titelId} className="ui-titel text-balance text-xl font-normal leading-snug text-ui-tinte">{titel}</h2>
            {untertitel && <p className="mt-1 text-xs leading-relaxed text-ui-schiefer sm:text-sm">{untertitel}</p>}
          </div>
          <button
            type="button"
            onClick={onSchliessen}
            aria-label="Schließen"
            className="shrink-0 rounded-full p-1.5 text-ui-schiefer hover:bg-ui-innen hover:text-ui-tinte"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-8 pt-5">{children}</div>
      </div>
    </div>
  );
}
