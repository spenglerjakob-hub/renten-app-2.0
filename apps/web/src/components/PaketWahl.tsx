import { useId } from 'react';
import { Minus, Plus } from 'lucide-react';
import {
  MAX_NUTZER, JAHR_MONATE, preisJeNutzer, gesamtpreis, ersparnis,
  type Intervall, type PaketId,
} from '@renten/schema/preise';

/**
 * Bausteine der Paketwahl: Zahlweise, Nutzerzahl, Preis eines Pakets.
 *
 * Fuer die Preisseite und spaeter fuer Sperrseite und "Abo & Team". Hier
 * steht keine Zahl — gerechnet wird ausschliesslich mit preise.ts aus
 * `@renten/schema`. Beides schlank gehalten, ueber den Unterpfad `/preise`
 * und ohne `components/Feld`: Sonst zoegen Szenario-Pruefung (zod) bzw. die
 * ganze Rechenlogik in die Preisseite.
 */

const euroFormat = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const euroCentFormat = new Intl.NumberFormat('de-DE', {
  style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2,
});
/** Ganze Euro, wenn es keine Cent gibt — sonst mit Cent. */
export const preisText = (n: number) => (Number.isInteger(n) ? euroFormat : euroCentFormat).format(n);

export function IntervallSchalter({ wert, onWechsel }: { wert: Intervall; onWechsel: (i: Intervall) => void }) {
  const gratis = 12 - JAHR_MONATE;
  return (
    <div role="radiogroup" aria-label="Zahlweise" className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1">
      {([['monat', 'Monatlich'], ['jahr', 'Jährlich']] as const).map(([id, text]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={wert === id}
          onClick={() => onWechsel(id)}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-bold ${
            wert === id ? 'bg-white text-slate-900 shadow' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          {text}
          {id === 'jahr' && gratis > 0 && (
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
              {gratis} Monate gratis
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function NutzerWahl({ wert, onWechsel }: { wert: number; onWechsel: (n: number) => void }) {
  const id = useId();
  const setze = (n: number) => onWechsel(Math.min(MAX_NUTZER, Math.max(1, Math.round(n) || 1)));
  return (
    <div className="inline-flex items-center gap-2">
      <label htmlFor={id} className="text-sm font-bold text-slate-700">Nutzer</label>
      <div className="inline-flex items-center rounded-lg border border-slate-300 bg-white">
        <button
          type="button"
          aria-label="Ein Nutzer weniger"
          onClick={() => setze(wert - 1)}
          disabled={wert <= 1}
          className="rounded-l-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
        >
          <Minus className="h-4 w-4" aria-hidden />
        </button>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_NUTZER}
          value={wert}
          onChange={(e) => setze(Number(e.target.value))}
          className="w-14 border-x border-slate-200 py-1.5 text-center text-sm font-bold tabular-nums [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <button
          type="button"
          aria-label="Ein Nutzer mehr"
          onClick={() => setze(wert + 1)}
          disabled={wert >= MAX_NUTZER}
          className="rounded-r-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

/** Preis je Nutzer, Summe fuer das Buero und was der Mengenrabatt spart. */
export function PaketPreis({ id, intervall, nutzer }: { id: PaketId; intervall: Intervall; nutzer: number }) {
  const je = preisJeNutzer(id, intervall, nutzer);
  const summe = gesamtpreis(id, intervall, nutzer);
  const spart = ersparnis(id, intervall, nutzer);
  const zeitraum = intervall === 'jahr' ? 'Jahr' : 'Monat';
  return (
    <div>
      <p className="flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-4xl font-black tabular-nums text-slate-900">{preisText(je)}</span>
        <span className="text-sm text-slate-500">je Nutzer und {zeitraum}</span>
      </p>
      {intervall === 'jahr' && (
        <p className="mt-0.5 text-xs text-slate-500">entspricht {preisText(Math.round((je / 12) * 100) / 100)} im Monat</p>
      )}
      {nutzer > 1 && (
        <p className="mt-1.5 text-sm text-slate-700">
          {nutzer} Nutzer: <strong className="tabular-nums">{preisText(summe)}</strong> im {zeitraum}
        </p>
      )}
      {spart > 0 && (
        <p className="mt-0.5 text-xs font-semibold text-emerald-700">
          Mengenrabatt: {preisText(spart)} gespart im {zeitraum}
        </p>
      )}
    </div>
  );
}
