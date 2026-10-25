import { Coins } from 'lucide-react';

/**
 * „Nominal | Kaufkraft heute“ — derselbe Zustand an zwei Stellen: im
 * Kassenbon und in der Fussleiste. Vorher sass der Schalter nur in der
 * Kopfleiste, und die ist jetzt meist eingeklappt. Ueberall als Pillen wie
 * die Reiter der Beratung; die dunkle Fassung fuer die Fussleiste entfiel
 * mit der dunklen Leiste.
 *
 * `kompakt` zeigt nur das Symbol als Umschalter — fuer die Fussleiste am
 * Telefon, wo neben drei Zahlen kein Platz fuer zwei Woerter ist.
 */
export function KaufkraftSchalter({ wert, onChange, kompakt = false, klasse = '' }: {
  wert: boolean;
  onChange: (b: boolean) => void;
  kompakt?: boolean;
  klasse?: string;
}) {
  if (kompakt) {
    return (
      <button
        type="button"
        onClick={() => onChange(!wert)}
        aria-pressed={wert}
        aria-label="Beträge in heutiger Kaufkraft zeigen"
        title={wert ? 'In heutiger Kaufkraft' : 'Nominal'}
        className={`flex shrink-0 items-center justify-center rounded-full border p-2 transition-colors ${
          wert ? 'border-ui-dunkel bg-ui-dunkel text-white' : 'border-ui-zweit-rand bg-ui-karte text-ui-tinte hover:bg-ui-hover'
        } ${klasse}`}
      >
        <Coins className="h-4 w-4" aria-hidden />
      </button>
    );
  }
  const knopf = (aktiv: boolean) => `rounded-full px-3 py-1.5 transition-colors ${
    aktiv ? 'bg-ui-dunkel text-white' : 'text-ui-schiefer hover:text-ui-tinte'
  }`;
  return (
    <div
      role="group"
      aria-label="Beträge"
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border border-ui-linie bg-ui-karte p-1 text-sm font-medium ${klasse}`}
    >
      <button type="button" aria-pressed={!wert} onClick={() => onChange(false)} className={knopf(!wert)}>
        Nominal
      </button>
      <button type="button" aria-pressed={wert} onClick={() => onChange(true)} className={knopf(wert)}>
        Kaufkraft heute
      </button>
    </div>
  );
}
