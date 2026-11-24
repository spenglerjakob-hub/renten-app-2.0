import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Lock } from 'lucide-react';

/**
 * Kaestchen fuer Auswahllisten — was ins Gutachten kommt (`DruckAuswahl`),
 * welche Seiten ein Gespraech zeigt (`mitarbeiter/GespraechFenster`).
 * Beide Listen sehen gleich aus und bedienen sich gleich.
 */

/** Ein Kaestchen mit Text — die ganze Zeile ist anklickbar. */
export function Kaestchen({ an, onChange, zusatz, eingerueckt = false, halb = false, children }: {
  an: boolean;
  onChange: (an: boolean) => void;
  zusatz?: ReactNode;
  eingerueckt?: boolean;
  /** Teilweise gewaehlt — das Sammel-Kaestchen */
  halb?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  const feld = useRef<HTMLInputElement>(null);
  useEffect(() => { if (feld.current) feld.current.indeterminate = halb; }, [halb]);
  return (
    <label htmlFor={id} className={`flex cursor-pointer items-start gap-3 py-2.5 pr-3 text-sm text-ui-tinte hover:bg-ui-hover ${eingerueckt ? 'pl-10' : 'pl-3'}`}>
      <input
        ref={feld} id={id} type="checkbox" checked={an} onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0"
      />
      <span className="min-w-0">
        {children}
        {zusatz && <span className="block text-xs text-ui-schiefer">{zusatz}</span>}
      </span>
    </label>
  );
}

/** Immer dabei: ein Haken ohne Abwahl — das Deckblatt, der Beitrag, die Unterschrift. */
export function FestesKaestchen({ text, zusatz, eingerueckt = false }: { text: string; zusatz?: ReactNode; eingerueckt?: boolean }) {
  return (
    <div className={`flex items-start gap-3 py-2.5 pr-3 text-sm text-ui-schiefer ${eingerueckt ? 'pl-10' : 'pl-3'}`}>
      <input type="checkbox" checked disabled readOnly aria-label={`${text} — immer dabei`} className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">
        {text}
        {zusatz && <span className="block text-xs">{zusatz}</span>}
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 text-xs"><Lock className="h-3 w-3" aria-hidden /> immer dabei</span>
    </div>
  );
}
