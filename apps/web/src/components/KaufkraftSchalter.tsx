import { Coins } from 'lucide-react';

/**
 * „Nominal | Kaufkraft heute“ — derselbe Zustand an zwei Stellen: im
 * Kassenbon (hell) und in der Fussleiste (dunkel). Vorher sass der Schalter
 * nur in der Kopfleiste, und die ist jetzt meist eingeklappt. Hell steht er
 * auch in der Schnellrechnung — als Pillen wie die Reiter der Beratung.
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
  const knopf = (aktiv: boolean) => (dunkel
    ? `rounded px-2 py-1 transition-colors ${aktiv ? 'bg-slate-600 text-white shadow' : 'text-slate-400 hover:text-white'}`
    : `rounded-full px-3 py-1.5 transition-colors ${aktiv ? 'bg-ui-dunkel text-white' : 'text-ui-schiefer hover:text-ui-tinte'}`);
  return (
    <div
      role="group"
      aria-label="Beträge"
      className={`inline-flex shrink-0 items-center ${
        dunkel
          ? 'gap-0.5 rounded-md border border-slate-700 bg-slate-800 p-0.5 text-xs font-semibold'
          : 'gap-1 rounded-full border border-ui-linie bg-ui-karte p-1 text-sm font-medium'
      } ${klasse}`}
    >
      <button type="button" aria-pressed={!wert} onClick={() => onChange(false)} className={knopf(!wert)}>
        Nominal
      </button>
      <button type="button" aria-pressed={wert} onClick={() => onChange(true)} className={`flex items-center gap-1 ${knopf(wert)}`}>
        {dunkel && <Coins className="h-3 w-3" aria-hidden />} Kaufkraft heute
      </button>
    </div>
  );
}
