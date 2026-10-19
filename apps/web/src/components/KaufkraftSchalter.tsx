import { Coins } from 'lucide-react';

/**
 * „Nominal | Kaufkraft heute“ — derselbe Zustand an zwei Stellen: im
 * Kassenbon (hell) und in der Fussleiste (dunkel). Vorher sass der Schalter
 * nur in der Kopfleiste, und die ist jetzt meist eingeklappt.
 *
 * `kompakt` zeigt nur das Symbol als Umschalter — fuer die Fussleiste am
 * Telefon, wo neben drei Kacheln kein Platz fuer zwei Woerter ist.
 */
export function KaufkraftSchalter({ wert, onChange, ton = 'hell', kompakt = false, klasse = '' }: {
  wert: boolean;
  onChange: (b: boolean) => void;
  ton?: 'hell' | 'dunkel';
  kompakt?: boolean;
  klasse?: string;
}) {
  const dunkel = ton === 'dunkel';
  if (kompakt) {
    return (
      <button
        type="button"
        onClick={() => onChange(!wert)}
        aria-pressed={wert}
        aria-label="Beträge in heutiger Kaufkraft zeigen"
        title={wert ? 'In heutiger Kaufkraft' : 'Nominal'}
        className={`flex shrink-0 items-center justify-center rounded-lg border p-2 ${
          wert ? 'border-emerald-500 bg-emerald-600 text-white' : 'border-slate-700 bg-slate-800 text-slate-400'
        } ${klasse}`}
      >
        <Coins className="h-4 w-4" aria-hidden />
      </button>
    );
  }
  const knopf = (aktiv: boolean) => `rounded px-2 py-1 transition-colors ${
    aktiv
      ? dunkel ? 'bg-slate-600 text-white shadow' : 'bg-white text-slate-900 shadow-sm'
      : dunkel ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-800'
  }`;
  return (
    <div
      role="group"
      aria-label="Beträge"
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-md p-0.5 text-xs font-semibold ${
        dunkel ? 'border border-slate-700 bg-slate-800' : 'bg-slate-100'
      } ${klasse}`}
    >
      <button type="button" aria-pressed={!wert} onClick={() => onChange(false)} className={knopf(!wert)}>
        Nominal
      </button>
      <button type="button" aria-pressed={wert} onClick={() => onChange(true)} className={`flex items-center gap-1 ${knopf(wert)}`}>
        <Coins className="h-3 w-3" aria-hidden /> Kaufkraft heute
      </button>
    </div>
  );
}
