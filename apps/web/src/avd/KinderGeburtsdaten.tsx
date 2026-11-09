import { Plus, Trash2 } from 'lucide-react';
import { avdKinderzulageBis, parseDatum, type AvdKind, type AvdParameter } from '@renten/engine';
import { DatumFeld, Schalter } from '../components/Feld';
import { KinderHinweis } from '../components/KinderFelder';
import { KNOPF_KLEIN } from '../components/stil';

/**
 * Die Kinder der gefuehrten Eingabe — je Kind das GEBURTSDATUM.
 *
 * Gefragt wird das Datum und nicht nur das Jahr, wie es Besucher ohnehin im
 * Kopf haben. Gerechnet wird weiter mit dem Geburtsjahr (`AvdKind`): Der
 * Rechenkern prueft die Kinderzulage jahrweise. Der Haken „in Ausbildung oder
 * Studium“ arbeitet wie in `components/KinderFelder.tsx` — die dortigen
 * Zeilen (Jahr statt Datum) bleiben fuer den Rechner unveraendert.
 */

export interface KindEingabe {
  /** TT.MM.JJJJ, leer solange nichts eingetragen ist */
  datum: string;
  ausbildungBisJahr?: number;
}

/** Liegt das Datum in der Zukunft? Ein Kind, das noch nicht geboren ist, bekommt keine Zulage. */
function inZukunft(datum: string, heute: Date): boolean {
  const d = parseDatum(datum);
  if (!d) return false;
  return new Date(d.jahr, d.monat - 1, d.tag) > heute;
}

/** Nur Kinder mit lesbarem Geburtsdatum, das nicht in der Zukunft liegt, gehen in die Rechnung. */
export function kinderFuerRechnung(kinder: readonly KindEingabe[], heute = new Date()): AvdKind[] {
  return kinder.flatMap((k) => {
    const d = parseDatum(k.datum);
    if (!d || inZukunft(k.datum, heute)) return [];
    return [k.ausbildungBisJahr !== undefined
      ? { geburtsjahr: d.jahr, ausbildungBisJahr: k.ausbildungBisJahr }
      : { geburtsjahr: d.jahr }];
  });
}

export function KinderGeburtsdaten({ kinder, onAendern, a, jetzt }: {
  kinder: readonly KindEingabe[];
  onAendern: (kinder: KindEingabe[]) => void;
  /** Die Altersgrenzen 18 und 25 — aus dem Rechtsstand, nicht im Markup */
  a: AvdParameter;
  jetzt: number;
}) {
  const heute = new Date();
  const aendern = (i: number, p: Partial<KindEingabe>) =>
    onAendern(kinder.map((k, j) => (j === i ? { ...k, ...p } : k)));

  return (
    <div className="space-y-2">
      {kinder.map((k, i) => {
        const d = parseDatum(k.datum);
        const zukunft = inZukunft(k.datum, heute);
        const gueltig = d !== null && !zukunft;
        const bis = gueltig ? avdKinderzulageBis({ geburtsjahr: d.jahr, ausbildungBisJahr: k.ausbildungBisJahr }, a) : 0;
        const jahre = bis - Math.max(jetzt, a.abJahr) + 1;
        const inAusbildung = k.ausbildungBisJahr !== undefined;

        return (
          <div key={i} className="rounded-[10px] border border-ui-linie bg-ui-karte p-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <DatumFeld
                  label={kinder.length > 1 ? `${i + 1}. Kind – Geburtsdatum` : 'Geburtsdatum deines Kindes'}
                  wert={k.datum}
                  onChange={(datum) => aendern(i, { datum })}
                />
              </div>
              {kinder.length > 1 && (
                <button
                  type="button"
                  onClick={() => onAendern(kinder.filter((_, j) => j !== i))}
                  aria-label={`${i + 1}. Kind entfernen`}
                  className="mt-6 shrink-0 rounded-full p-2 text-ui-schiefer transition-colors hover:bg-ui-innen hover:text-ui-tinte"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              )}
            </div>

            {zukunft && (
              <p className="mt-1.5 text-xs text-rose-700">Das Datum liegt in der Zukunft.</p>
            )}

            {gueltig && (
              <>
                <p className="mt-1.5 text-xs text-ui-schiefer">
                  {jahre <= 0
                    ? 'Kein Anspruch mehr auf Kinderzulage.'
                    : `Kinderzulage noch ${jahre === 1 ? '1 Jahr' : `${jahre} Jahre`}.`}
                </p>
                <div className="mt-2">
                  <Schalter
                    label="in Ausbildung oder Studium"
                    wert={inAusbildung}
                    onChange={(an) => aendern(i, {
                      // Vorbelegt mit einem PLAUSIBLEN Ende, nicht mit dem
                      // Hoechstwert — 18 plus drei Jahre Ausbildung, wie im Rechner.
                      ausbildungBisJahr: an ? d.jahr + a.kinderzulageBisAlter + 3 : undefined,
                    })}
                  />
                </div>
                {inAusbildung && (
                  <div className="mt-1.5 flex items-center gap-2 pl-6">
                    <label className="w-24 shrink-0 text-xs text-ui-tinte/80" htmlFor={`kind-${i}-bis`}>
                      bis Ende
                    </label>
                    <input
                      id={`kind-${i}-bis`}
                      type="number"
                      value={k.ausbildungBisJahr}
                      min={d.jahr}
                      // Hoechstens bis 25 — das Gesetz foerdert darueber nicht.
                      max={d.jahr + a.kinderzulageBisAlterAusbildung - 1}
                      onChange={(e) => aendern(i, { ausbildungBisJahr: Number(e.target.value) })}
                      className="ui-feld w-full p-1.5 text-sm tabular-nums"
                    />
                    <span className="w-24 shrink-0 text-right text-xs text-ui-schiefer">
                      dann {(k.ausbildungBisJahr ?? 0) - d.jahr} J. alt
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => onAendern([...kinder, { datum: '' }])}
        className={KNOPF_KLEIN}
      >
        <Plus className="h-3.5 w-3.5" aria-hidden /> Weiteres Kind
      </button>
      <KinderHinweis a={a} />
    </div>
  );
}
