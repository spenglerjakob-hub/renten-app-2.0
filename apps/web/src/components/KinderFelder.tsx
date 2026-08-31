import { avdKinderzulageBis, type AvdKind, type AvdParameter } from '@renten/engine';
import { Schalter } from './Feld';

/**
 * Eine Zeile je Kind: Geburtsjahr, Haken "in Ausbildung", und bei gesetztem
 * Haken das Jahr, in dem die Ausbildung endet.
 *
 * Bewusst OHNE Zugriff auf den Store: dieselben Zeilen stehen auf der
 * Landingpage zum Altersvorsorgedepot, die vom Rentenplaner unabhaengig ist
 * und keinen Store hat. Wer hier `useSzenario` einbaut, koppelt beide wieder
 * aneinander.
 *
 * Das restliche "noch N Jahre" kommt aus `avdKinderzulageBis` — derselben
 * Funktion, mit der auch gerechnet wird. Die Regel hier nachzubauen war schon
 * einmal der Grund, warum die Seite eine andere Zahl zeigte, als sie rechnete.
 */
export function KinderZeilen({
  kinder, onKind, a, jetzt,
}: {
  kinder: readonly AvdKind[];
  onKind: (index: number, p: Partial<AvdKind>) => void;
  /** Liefert die Altersgrenzen 18 und 25 — keine festen Zahlen im Markup */
  a: AvdParameter;
  jetzt: number;
}) {
  if (kinder.length === 0) return null;

  return (
    <div className="mt-2 space-y-2">
      {kinder.map((kind, i) => {
        const bis = avdKinderzulageBis(kind, a);
        const jahre = bis - Math.max(jetzt, a.abJahr) + 1;
        const inAusbildung = kind.ausbildungBisJahr !== undefined;

        return (
          <div key={i} className="rounded-lg border border-slate-200 bg-white p-2">
            <div className="flex items-center gap-2">
              <label className="w-24 shrink-0 text-xs text-slate-600" htmlFor={`kind-${i}`}>
                {i + 1}. Kind, geb.
              </label>
              <input
                id={`kind-${i}`}
                type="number"
                value={kind.geburtsjahr}
                min={1900}
                max={2200}
                onChange={(e) => onKind(i, { geburtsjahr: Number(e.target.value) })}
                className="w-full rounded-md border border-slate-300 p-1.5 text-sm tabular-nums"
              />
              <span className="w-24 shrink-0 text-right text-[10px] text-slate-500">
                {jahre <= 0 ? 'kein Anspruch' : jahre === 1 ? 'noch 1 Jahr' : `noch ${jahre} Jahre`}
              </span>
            </div>

            <div className="mt-1.5">
              <Schalter
                label="in Ausbildung oder Studium"
                wert={inAusbildung}
                onChange={(an) => onKind(i, {
                  // Vorbelegt mit einem PLAUSIBLEN Ende, nicht mit dem
                  // Hoechstwert: "bis 25 fuer alle" war genau der Fehler, den
                  // diese Aenderung behebt. 18 plus drei Jahre Ausbildung.
                  ausbildungBisJahr: an
                    ? kind.geburtsjahr + a.kinderzulageBisAlter + 3
                    : undefined,
                })}
              />
            </div>

            {inAusbildung && (
              <div className="mt-1.5 flex items-center gap-2 pl-6">
                <label className="w-24 shrink-0 text-xs text-slate-600" htmlFor={`kind-${i}-bis`}>
                  bis Ende
                </label>
                <input
                  id={`kind-${i}-bis`}
                  type="number"
                  value={kind.ausbildungBisJahr}
                  min={kind.geburtsjahr}
                  // Hoechstens bis 25 — das Feld soll kein Jahr anbieten, das
                  // das Gesetz ohnehin nicht mehr foerdert.
                  max={kind.geburtsjahr + a.kinderzulageBisAlterAusbildung - 1}
                  onChange={(e) => onKind(i, { ausbildungBisJahr: Number(e.target.value) })}
                  className="w-full rounded-md border border-slate-300 p-1.5 text-sm tabular-nums"
                />
                <span className="w-24 shrink-0 text-right text-[10px] text-slate-500">
                  dann {(kind.ausbildungBisJahr ?? 0) - kind.geburtsjahr} J. alt
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Erklaertext unter den Zeilen. Steht hier, damit alle drei Erfassungsstellen
 * dieselbe Auskunft geben.
 */
export function KinderHinweis({ a }: { a: AvdParameter }) {
  return (
    <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
      Die Kinderzulage läuft, solange Kindergeld fließt: bis {a.kinderzulageBisAlter} —
      und bei Ausbildung oder Studium so lange, wie diese dauert, längstens bis{' '}
      {a.kinderzulageBisAlterAusbildung}.
    </p>
  );
}
