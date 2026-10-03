import { ArrowLeft, ArrowRight, Check } from 'lucide-react';

/**
 * Die Etappen der Hauptseite: Angaben, Ergebnis, Sparrechner, Loesungen.
 *
 * WARUM EIN SCHRITT JE ANSICHT und nicht eine lange Seite: Im Gespraech
 * fuehrt der Berater den Kunden durch eine Geschichte — erst wer er ist und
 * was er will, dann wo er steht, dann was es kostet, dann womit. Auf einer
 * langen Seite stand alles gleichzeitig da, und das Ergebnis lag neben
 * Eingaben, die noch gar nicht gemacht waren.
 *
 * Jede Etappe ist trotzdem jederzeit anklickbar: Wer im Ergebnis sieht, dass
 * eine Angabe fehlt, springt zurueck, ohne die Reihenfolge abzulaufen.
 */

export interface Etappe<T extends string> {
  id: T;
  text: string;
  /** Kurzform fuer schmale Bildschirme */
  kurz: string;
}

export function JourneyLeiste<T extends string>({ etappen, aktiv, onWechsel }: {
  etappen: readonly Etappe<T>[];
  aktiv: T;
  onWechsel: (id: T) => void;
}) {
  const index = etappen.findIndex((e) => e.id === aktiv);
  return (
    <nav aria-label="Ablauf der Beratung" className="print:hidden">
      <ol className="flex items-stretch gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm sm:gap-2 sm:p-2">
        {etappen.map((e, i) => {
          const ist = i === index;
          const fertig = i < index;
          return (
            <li key={e.id} className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => onWechsel(e.id)}
                aria-current={ist ? 'step' : undefined}
                className={`flex h-full w-full flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-center transition-colors sm:flex-row sm:gap-2.5 sm:px-3 sm:py-2 sm:text-left ${
                  ist ? 'bg-indigo-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black sm:h-7 sm:w-7 sm:text-sm ${
                    ist ? 'bg-white text-indigo-700' : fertig ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {fertig ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
                </span>
                <span className="min-w-0 text-[10px] font-bold leading-tight sm:text-sm">
                  <span className="sm:hidden">{e.kurz}</span>
                  <span className="hidden sm:inline">{e.text}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** „Zurueck" und „Weiter" am Ende einer Etappe. */
export function JourneyWeiter<T extends string>({ etappen, aktiv, onWechsel, weiterText }: {
  etappen: readonly Etappe<T>[];
  aktiv: T;
  onWechsel: (id: T) => void;
  /** Eigene Beschriftung fuer „Weiter", etwa „Zum Ergebnis" */
  weiterText?: string;
}) {
  const i = etappen.findIndex((e) => e.id === aktiv);
  const zurueck = etappen[i - 1];
  const weiter = etappen[i + 1];
  return (
    <div className="flex items-center justify-between gap-3 print:hidden">
      {zurueck ? (
        <button
          type="button"
          onClick={() => onWechsel(zurueck.id)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 sm:text-sm"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Zurück:</span> {zurueck.kurz}
        </button>
      ) : <span />}
      {weiter && (
        <button
          type="button"
          onClick={() => onWechsel(weiter.id)}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-500 sm:text-sm"
        >
          {weiterText ?? <>Weiter: {weiter.text}</>} <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
