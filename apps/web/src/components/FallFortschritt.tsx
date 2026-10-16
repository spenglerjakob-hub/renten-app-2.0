import { useState } from 'react';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import type { FallSchritt, FallSchrittId } from '../features/fortschritt';

/**
 * Die Leiste „Fall erfasst: 3 von 6“ unter der Etappen-Navigation.
 *
 * Bewusst schlicht: ein Zaehler, ein schmaler Balken, die Schritte. Keine
 * Animation, kein „fast geschafft“ — Profis wollen wissen, was fehlt, nicht
 * angefeuert werden. Offene Schritte sind Knoepfe und fuehren an die Stelle.
 *
 * Am Telefon eingeklappt auf eine Zeile; die Liste klappt auf Wunsch auf.
 */
export function FallFortschritt({ schritte, onSprung }: {
  schritte: readonly FallSchritt[];
  onSprung: (id: FallSchrittId) => void;
}) {
  const [auf, setAuf] = useState(false);
  const erledigt = schritte.filter((x) => x.erledigt).length;
  const offen = schritte.length - erledigt;

  return (
    <section aria-label="Fortschritt des Falls" className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm print:hidden">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-2">
          <p className="text-xs font-bold text-slate-800 sm:text-sm">
            Fall erfasst: {erledigt} von {schritte.length}
          </p>
          <div
            role="progressbar"
            aria-label="Erledigte Schritte"
            aria-valuemin={0}
            aria-valuemax={schritte.length}
            aria-valuenow={erledigt}
            className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200 sm:w-28"
          >
            <div className="h-full rounded-full bg-emerald-600" style={{ width: `${(erledigt / schritte.length) * 100}%` }} />
          </div>
        </div>
        {offen > 0 && (
          <button
            type="button"
            onClick={() => setAuf((v) => !v)}
            aria-expanded={auf}
            className="ml-auto flex items-center gap-1 text-xs font-semibold text-slate-600 sm:hidden"
          >
            {offen} offen {auf ? <ChevronUp className="h-3.5 w-3.5" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
          </button>
        )}
        <ol className={`${auf ? 'flex' : 'hidden'} w-full flex-wrap gap-1.5 sm:flex sm:w-auto`}>
          {schritte.map((x) => (
            <li key={x.id}>
              {x.erledigt ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 sm:text-xs">
                  <Check className="h-3 w-3" aria-hidden />
                  <span>{x.text}{x.mitStandard && <span className="font-normal text-emerald-700"> · mit Standardwerten</span>}</span>
                  <span className="sr-only"> — erledigt</span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onSprung(x.id)}
                  className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-left text-[11px] font-semibold text-amber-900 hover:bg-amber-100 sm:text-xs"
                >
                  <span aria-hidden className="h-2 w-2 shrink-0 rounded-full border border-amber-500" />
                  <span>{x.text}{x.offen.length > 0 && <span className="font-normal"> — {x.offen.join(', ')}</span>}</span>
                </button>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
