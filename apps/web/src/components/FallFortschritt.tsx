import { useState } from 'react';
import { ArrowRight, Check, ChevronDown, ChevronUp } from 'lucide-react';
import type { FallSchritt, FallSchrittId } from '../features/fortschritt';

/**
 * Die Leiste „Fall erfasst: 3 von 6“ unter der Etappen-Navigation.
 *
 * Bewusst schlicht: ein Zaehler, ein schmaler Balken, die Schritte. Keine
 * Animation, kein „fast geschafft“ — Profis wollen wissen, was fehlt, nicht
 * angefeuert werden. Offene Schritte sind Knoepfe und fuehren an die Stelle.
 *
 * Eingeklappt auf eine Zeile — auf jedem Geraet. Die sechs Schritte als
 * Pillen standen sonst als dritte Leiste zwischen Etappen-Navigation und
 * erstem Eingabefeld. Offene Schritte gestrichelt wie ein Beispielwert,
 * erledigte mit Haken — ohne Ampelfarben. Sichtbar bleibt der naechste offene Schritt als
 * Sprung; die ganze Liste klappt auf Wunsch auf.
 */
export function FallFortschritt({ schritte, onSprung }: {
  schritte: readonly FallSchritt[];
  onSprung: (id: FallSchrittId) => void;
}) {
  const [auf, setAuf] = useState(false);
  const erledigt = schritte.filter((x) => x.erledigt).length;
  const offen = schritte.length - erledigt;
  const naechster = schritte.find((x) => !x.erledigt);

  return (
    <section aria-label="Fortschritt des Falls" className="ui-karte px-3 py-2 print:hidden">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-2">
          <p className="text-xs font-medium text-ui-tinte sm:text-sm">
            Fall erfasst: {erledigt} von {schritte.length}
          </p>
          <div
            role="progressbar"
            aria-label="Erledigte Schritte"
            aria-valuemin={0}
            aria-valuemax={schritte.length}
            aria-valuenow={erledigt}
            className="h-1.5 w-20 overflow-hidden rounded-full bg-ui-linie sm:w-28"
          >
            <div className="h-full rounded-full bg-ui-tinte" style={{ width: `${(erledigt / schritte.length) * 100}%` }} />
          </div>
        </div>
        {naechster && (
          <button
            type="button"
            onClick={() => onSprung(naechster.id)}
            className="hidden items-center gap-1 rounded-full px-2 py-0.5 text-sm text-ui-schiefer hover:bg-ui-innen hover:text-ui-tinte sm:inline-flex"
          >
            Als Nächstes: <span className="font-medium text-ui-tinte">{naechster.text}</span>
            <ArrowRight className="h-3.5 w-3.5 text-ui-tinte" aria-hidden />
          </button>
        )}
        {offen > 0 && (
          <button
            type="button"
            onClick={() => setAuf((v) => !v)}
            aria-expanded={auf}
            className="ml-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-ui-schiefer hover:bg-ui-innen hover:text-ui-tinte sm:text-sm"
          >
            {offen} offen {auf ? <ChevronUp className="h-3.5 w-3.5" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
          </button>
        )}
        <ol className={`${auf ? 'flex' : 'hidden'} w-full flex-wrap gap-1.5`}>
          {schritte.map((x) => (
            <li key={x.id}>
              {x.erledigt ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-ui-linie bg-ui-innen px-2 py-0.5 text-xs font-medium text-ui-tinte">
                  <Check className="h-3 w-3" aria-hidden />
                  <span>{x.text}{x.mitStandard && <span className="font-normal text-ui-schiefer"> · mit Standardwerten</span>}</span>
                  <span className="sr-only"> — erledigt</span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onSprung(x.id)}
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-ui-schiefer/60 bg-ui-karte px-2 py-0.5 text-left text-xs font-medium text-ui-tinte hover:bg-ui-innen"
                >
                  <span aria-hidden className="h-2 w-2 shrink-0 rounded-full border border-ui-schiefer" />
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
