import { Plus, Trash2 } from 'lucide-react';
import { FREI_STUFEN_MAX } from '@renten/schema';
import { ProzentFeld, ZahlFeld } from '../components/Feld';
import { KNOPF_KLEIN } from '../components/stil';
import { freiRegelHinweise, stufeHinzu, stufeMoeglich, type FreiRegelEingabe } from './regel';

/**
 * Die Regel des individuellen Modells zum Einstellen — auf der eigenen Seite,
 * im Angebot der Firma und im Betriebs-Check dieselben Felder:
 *
 *   1. feste Zuschuesse nach Stufen: „ab 50 EUR Umwandlung 25 EUR“ — es gilt
 *      die hoechste erreichte Stufe;
 *   2. dazu ein Anteil der GANZEN Umwandlung, auf Wunsch gedeckelt.
 *
 * Ohne Vorbelegung. Die Zeilen bleiben in der Reihenfolge der Eingabe — sie
 * beim Tippen umzusortieren, risse dem Berater das Feld unter den Fingern
 * weg; der Rechenkern ordnet selbst.
 */
export function FreiRegelFelder({ wert, onChange }: { wert: FreiRegelEingabe; onChange: (m: FreiRegelEingabe) => void }) {
  const stufe = (i: number, p: Partial<FreiRegelEingabe['stufen'][number]>) =>
    onChange({ ...wert, stufen: wert.stufen.map((s, j) => (j === i ? { ...s, ...p } : s)) });
  const hinweise = freiRegelHinweise(wert);

  return (
    <div className="space-y-4">
      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="mb-1 text-sm font-medium text-ui-tinte">Fester Zuschuss nach Stufen</legend>
        <p className="mb-3 text-xs leading-relaxed text-ui-schiefer">
          Ab welcher Umwandlung gibt es welchen festen Betrag? Es gilt die höchste erreichte Stufe.
        </p>
        {wert.stufen.length === 0 && <p className="mb-3 text-sm text-ui-schiefer">Noch keine Stufe.</p>}
        <ul className="space-y-3">
          {wert.stufen.map((s, i) => (
            // Der Index als Schluessel: Die Zeilen wechseln die Reihenfolge nicht, und ein Wert als Schluessel verloere beim Tippen den Fokus.
            <li key={i} className="flex gap-1">
              {/* Unten buendig: Bricht eine Beschriftung in der schmalen Spalte um, stehen die Felder trotzdem auf einer Linie. */}
              <div className="grid min-w-0 flex-1 grid-cols-2 items-end gap-2">
                <ZahlFeld label={`Stufe ${i + 1}: ab Umwandlung`} wert={s.abMonat} onChange={(n) => stufe(i, { abMonat: n })}
                  einheit="€" schritt={10} max={10_000} />
                <ZahlFeld label="fester Zuschuss" wert={s.betragMonat} onChange={(n) => stufe(i, { betragMonat: n })}
                  einheit="€" schritt={5} max={10_000} leerBeiNull platzhalter="z. B. 25" />
              </div>
              <button
                type="button"
                onClick={() => onChange({ ...wert, stufen: wert.stufen.filter((_, j) => j !== i) })}
                aria-label={`Stufe ${i + 1} entfernen`}
                className="self-end rounded-full p-2.5 text-ui-schiefer hover:bg-rose-50 hover:text-rose-700"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => onChange({ ...wert, stufen: stufeHinzu(wert.stufen) })}
          disabled={!stufeMoeglich(wert.stufen)}
          className={`mt-3 ${KNOPF_KLEIN}`}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden /> Stufe hinzufügen
        </button>
        {!stufeMoeglich(wert.stufen) && (
          <p className="mt-2 text-xs text-ui-schiefer">Mehr als {FREI_STUFEN_MAX} Stufen nimmt das Modell nicht auf.</p>
        )}
      </fieldset>

      <fieldset className="m-0 min-w-0 space-y-3 border-0 border-t border-ui-linie p-0 pt-4">
        <legend className="sr-only">Prozentualer Zuschuss</legend>
        <ProzentFeld
          label="Dazu Prozent auf die ganze Umwandlung" wert={wert.quote} onChange={(quote) => onChange({ ...wert, quote })}
          min={0} max={100}
          hilfe="0: kein prozentualer Zuschuss. Kommt zum festen Betrag der Stufe hinzu."
        />
        {wert.quote > 0 && (
          <ZahlFeld label="Prozentualer Zuschuss höchstens im Monat" wert={wert.deckelMonat}
            onChange={(deckelMonat) => onChange({ ...wert, deckelMonat })} einheit="€" schritt={10} max={10_000} hilfe="0: ohne Deckel" />
        )}
      </fieldset>

      {hinweise.length > 0 && (
        <ul role="status" className="space-y-1 text-xs leading-relaxed text-ui-tinte">
          {hinweise.map((h) => <li key={h}>{h}</li>)}
        </ul>
      )}
    </div>
  );
}
