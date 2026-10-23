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

export function JourneyLeiste<T extends string>({ etappen, aktiv, onWechsel, erledigt }: {
  etappen: readonly Etappe<T>[];
  aktiv: T;
  onWechsel: (id: T) => void;
  /**
   * Ist eine Etappe WIRKLICH erledigt? Nur dann steht ein Haken.
   *
   * Frueher hing der Haken an der Position: Wer direkt auf die letzte Etappe
   * sprang, sah alle davor abgehakt, obwohl dort nichts eingetragen war —
   * Fortschritt, den es nicht gab.
   */
  erledigt?: (id: T) => boolean;
}) {
  const index = etappen.findIndex((e) => e.id === aktiv);
  return (
    <nav aria-label="Ablauf der Beratung" className="print:hidden">
      <ol className="ui-karte flex items-stretch gap-1 p-1.5 sm:gap-2 sm:p-2">
        {etappen.map((e, i) => {
          const ist = i === index;
          const fertig = !ist && (erledigt?.(e.id) ?? false);
          return (
            <li key={e.id} className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => onWechsel(e.id)}
                aria-current={ist ? 'step' : undefined}
                className={`flex h-full w-full flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-center transition-colors sm:flex-row sm:gap-2.5 sm:px-3 sm:py-2 sm:text-left ${
                  ist ? 'bg-ui-dunkel text-white' : 'text-ui-schiefer hover:bg-ui-innen hover:text-ui-tinte'
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums sm:h-7 sm:w-7 sm:text-sm ${
                    ist ? 'bg-white text-ui-tinte' : fertig ? 'bg-ui-tinte text-white' : 'bg-ui-linie text-ui-tinte'
                  }`}
                >
                  {fertig ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
                </span>
                <span className="min-w-0 text-xs font-medium leading-tight sm:text-sm">
                  <span className="sm:hidden">{e.kurz}</span>
                  <span className="hidden sm:inline">{e.text}</span>
                  {fertig && <span className="sr-only"> — erledigt</span>}
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
          className="inline-flex items-center gap-1.5 rounded-full border border-ui-zweit-rand bg-ui-karte px-3 py-2 text-xs font-medium text-ui-tinte hover:bg-ui-innen sm:px-5 sm:py-2.5 sm:text-sm"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Zurück:</span> {zurueck.kurz}
        </button>
      ) : <span />}
      {weiter && (
        <button
          type="button"
          onClick={() => onWechsel(weiter.id)}
          className="inline-flex items-center gap-1.5 rounded-full border border-ui-knopf-rand bg-ui-knopf px-4 py-2 text-xs font-medium text-ui-knopf-schrift hover:bg-ui-knopf-hover sm:px-5 sm:py-2.5 sm:text-sm"
        >
          {weiterText ?? <>Weiter: {weiter.text}</>} <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
