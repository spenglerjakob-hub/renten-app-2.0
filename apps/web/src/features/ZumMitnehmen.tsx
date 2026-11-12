import { Printer, Save } from 'lucide-react';
import { useAnsprache } from '../components/Ansprache';
import { KNOPF, KNOPF_ZWEIT } from '../components/stil';
import { checkliste } from '../druck/Merkblatt';

/**
 * ZUM MITNEHMEN — das letzte Stueck der Beratung.
 *
 * Bis hierher endete der Abschluss ohne Ende: Drucken und Speichern standen
 * nur im Kopf der Seite, und was der Kunde in den naechsten Wochen erledigen
 * sollte, gab es allein auf der letzten Seite des Gutachtens. Hier steht
 * beides, wo das Gespraech aufhoert: das Gutachten, der gespeicherte Plan
 * und dieselbe Checkliste wie im Ausdruck (`druck/Merkblatt`).
 *
 * Ohne eine Zahl aus dem Fall — wie das Merkblatt: Es gilt auch, wenn noch
 * keine Loesung angenommen ist.
 */
export function ZumMitnehmen({ onDrucken, onSpeichern }: {
  /** Oeffnet das Druckfenster mit der Auswahl der Seiten */
  onDrucken: () => void;
  /** Oeffnet das Konto — dort wird der Plan gespeichert */
  onSpeichern: () => void;
}) {
  const t = useAnsprache();
  return (
    <section aria-labelledby="mitnehmen-titel" className="ui-karte p-5 sm:p-7">
      <h3 id="mitnehmen-titel" className="text-lg font-medium tracking-[-0.01em] text-ui-tinte sm:text-xl">
        Zum Mitnehmen
      </h3>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ui-schiefer">
        Das Gutachten fasst zusammen, was {t.du} eben gesehen {t.w('hast', 'habt')} — zum Ausdrucken oder als PDF.
        Der gespeicherte Plan lässt sich jederzeit wieder öffnen und fortschreiben.
      </p>
      <div className="mt-5 flex flex-wrap gap-3 print:hidden">
        <button type="button" onClick={onDrucken} className={KNOPF}>
          <Printer className="h-4 w-4" aria-hidden /> Gutachten drucken
        </button>
        <button type="button" onClick={onSpeichern} className={KNOPF_ZWEIT}>
          <Save className="h-4 w-4" aria-hidden /> Plan speichern
        </button>
      </div>

      <h4 className="mt-7 border-t border-ui-linie pt-6 text-base font-medium text-ui-tinte">
        Was {t.du} in den nächsten Wochen erledigen {t.w('solltest', 'solltet')}
      </h4>
      <ol className="mt-4 space-y-4">
        {checkliste(t).map((x, i) => (
          <li key={x.was} className="flex gap-3">
            <span aria-hidden className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-ui-linie bg-ui-innen text-xs font-medium tabular-nums text-ui-tinte">
              {i + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ui-tinte">{x.was}</span>
              <span className="mt-0.5 block text-sm leading-relaxed text-ui-schiefer">{x.warum}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
