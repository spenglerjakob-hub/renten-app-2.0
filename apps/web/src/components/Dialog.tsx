import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * Schlichtes modales Fenster.
 *
 * Barrierefreiheit ist hier kein Beiwerk: Ein Dialog, aus dem der Tastaturfokus
 * herausrutscht, ist fuer Tastatur- und Screenreader-Nutzer eine Sackgasse.
 * Deshalb wandert der Fokus beim Oeffnen hinein, bleibt darin gefangen,
 * Escape schliesst, und beim Schliessen kehrt er auf das ausloesende Element
 * zurueck.
 */
export function Dialog({
  offen, titel, beschreibung, onSchliessen, children,
}: {
  offen: boolean;
  titel: string;
  beschreibung?: string;
  onSchliessen: () => void;
  children: ReactNode;
}) {
  const kastenRef = useRef<HTMLDivElement>(null);
  const vorherRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!offen) return;

    vorherRef.current = document.activeElement as HTMLElement | null;
    const kasten = kastenRef.current;
    kasten?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )?.focus();

    const beiTaste = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onSchliessen(); return; }
      if (e.key !== 'Tab' || !kasten) return;

      const ziele = [...kasten.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )].filter((el) => !el.hasAttribute('disabled'));
      if (ziele.length === 0) return;

      const erstes = ziele[0]!;
      const letztes = ziele[ziele.length - 1]!;
      if (e.shiftKey && document.activeElement === erstes) { e.preventDefault(); letztes.focus(); }
      else if (!e.shiftKey && document.activeElement === letztes) { e.preventDefault(); erstes.focus(); }
    };

    document.addEventListener('keydown', beiTaste);
    // Hintergrund nicht mitscrollen lassen.
    const vorherigesOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', beiTaste);
      document.body.style.overflow = vorherigesOverflow;
      vorherRef.current?.focus();
    };
  }, [offen, onSchliessen]);

  if (!offen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4 print:hidden"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onSchliessen(); }}
    >
      <div
        ref={kastenRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-titel"
        aria-describedby={beschreibung ? 'dialog-text' : undefined}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
      >
        <header className="sticky top-0 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 sm:px-6 sm:py-4">
          <div>
            <h2 id="dialog-titel" className="text-base font-bold text-slate-800 sm:text-lg">{titel}</h2>
            {beschreibung && (
              <p id="dialog-text" className="mt-1 text-xs leading-relaxed text-slate-600 sm:text-sm">
                {beschreibung}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onSchliessen}
            aria-label="Schließen"
            className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>
        <div className="px-4 py-4 sm:px-6 sm:py-5">{children}</div>
      </div>
    </div>
  );
}
