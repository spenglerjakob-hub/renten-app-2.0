import { ArrowLeft, ArrowRight } from 'lucide-react';
import { KNOPF, KNOPF_ZWEIT, Etappen } from './stil';

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
 *
 * Gezeichnet als duenne Linien wie die Schritte der Mitarbeiterberatung
 * (`Etappen` aus stil) — eine Schrittleiste fuer alle Seiten.
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
    <div className="print:hidden">
      <Etappen
        schritte={etappen.map((e) => e.text)}
        aktiv={index}
        onWechsel={(i) => onWechsel(etappen[i]!.id)}
        beschriftung="Ablauf der Beratung"
        erledigt={(i) => erledigt?.(etappen[i]!.id) ?? false}
      />
    </div>
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
  /* Wie am Ende jedes Schritts der Beratung: unter einer Haarlinie, links zurueck, rechts weiter. */
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ui-linie pt-6 print:hidden">
      {zurueck ? (
        <button type="button" onClick={() => onWechsel(zurueck.id)} className={KNOPF_ZWEIT}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Zurück:</span> {zurueck.kurz}
        </button>
      ) : <span />}
      {weiter && (
        // ml-auto: Bricht die Zeile am Telefon um, bleibt „Weiter“ rechts.
        <button type="button" onClick={() => onWechsel(weiter.id)} className={`ml-auto ${KNOPF}`}>
          {weiterText ?? <>Weiter: {weiter.text}</>} <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
        </button>
      )}
    </div>
  );
}
