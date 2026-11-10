import { useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useModal } from './useModal';

/**
 * Schlichtes modales Fenster.
 *
 * Fokus, Escape und der ruhende Hintergrund kommen aus `useModal` — dieselbe
 * Fuehrung wie in der Schublade von rechts.
 */
export function Dialog({
  offen, titel, beschreibung, onSchliessen, schliessbar = true, children,
}: {
  offen: boolean;
  titel: string;
  beschreibung?: string;
  onSchliessen: () => void;
  /**
   * Ist das falsch, entfallen Kreuz, Escape und der Klick auf den
   * Hintergrund. Fuer die wenigen Faelle, in denen eine Angabe wirklich
   * gebraucht wird, bevor es weitergeht — der Dialog muss dann selbst einen
   * Weg nach vorn anbieten, sonst sitzt man fest.
   */
  schliessbar?: boolean;
  children: ReactNode;
}) {
  const kastenRef = useRef<HTMLDivElement>(null);
  useModal(offen, kastenRef, onSchliessen, schliessbar);

  if (!offen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-ui-tinte/40 p-0 sm:items-center sm:p-4 print:hidden"
      onMouseDown={(e) => {
        if (schliessbar && e.target === e.currentTarget) onSchliessen();
      }}
    >
      <div
        ref={kastenRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-titel"
        aria-describedby={beschreibung ? 'dialog-text' : undefined}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
      >
        <header className="sticky top-0 flex items-start justify-between gap-4 border-b border-ui-linie bg-white px-4 py-3 sm:px-6 sm:py-4">
          <div>
            <h2 id="dialog-titel" className="ui-titel text-lg font-normal text-ui-tinte sm:text-xl">{titel}</h2>
            {beschreibung && (
              <p id="dialog-text" className="mt-1 text-xs leading-relaxed text-ui-schiefer sm:text-sm">
                {beschreibung}
              </p>
            )}
          </div>
          {schliessbar && (
            <button
              type="button"
              onClick={onSchliessen}
              aria-label="Schließen"
              className="shrink-0 rounded-full p-1.5 text-ui-schiefer hover:bg-ui-innen hover:text-ui-tinte"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          )}
        </header>
        <div className="px-4 py-4 sm:px-6 sm:py-5">{children}</div>
      </div>
    </div>
  );
}
