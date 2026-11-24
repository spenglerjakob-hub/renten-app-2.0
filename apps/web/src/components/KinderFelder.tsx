import { avdKinderzulageBis, type AvdKind, type AvdParameter } from '@renten/engine';
import { Schalter } from './Feld';

/** So alt darf ein Kind in der Auswahl des Geburtsjahrs hoechstens sein — darueber gibt es weder Kindergeld noch Zulage. */
export const KIND_HOECHSTALTER = 25;

/**
 * EIN JAHR AUS EINER LISTE — wie die Auswahl der Krankenkasse.
 *
 * Vorher ein Zahlenfeld: Wer das Jahr loeschte, um ein anderes zu tippen,
 * bekam eine „0“, die sich nicht wegloeschen liess (der Browser setzt sie in
 * ein leeres Zahlenfeld zurueck), und aus „0“ und „2019“ wurde „02019“. Eine
 * Liste kennt keine halben Eingaben — und bietet nur Jahre an, die es fuer
 * diese Angabe gibt.
 *
 * Ein gespeichertes Jahr AUSSERHALB der Spanne bleibt als eigener Eintrag
 * stehen: Sonst zeigte die Auswahl ein anderes Jahr, als gerechnet wird.
 */
export function JahrWahl({ id, wert, von, bis, onChange, absteigend = false, klasse = '' }: {
  id: string;
  wert: number;
  von: number;
  bis: number;
  onChange: (jahr: number) => void;
  /** Das juengste Jahr zuerst — fuer Geburtsjahre */
  absteigend?: boolean;
  klasse?: string;
}) {
  const jahre = Array.from({ length: Math.max(0, bis - von + 1) }, (_, i) => (absteigend ? bis - i : von + i));
  return (
    <select
      id={id}
      value={wert}
      onChange={(e) => onChange(Number(e.target.value))}
      className={`ui-feld cursor-pointer tabular-nums ${klasse}`}
    >
      {!jahre.includes(wert) && <option value={wert}>{wert}</option>}
      {jahre.map((j) => <option key={j} value={j}>{j}</option>)}
    </select>
  );
}

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
          <div key={i} className="rounded-[10px] border border-ui-linie bg-ui-karte p-2.5">
            {/* Am Telefon bricht „noch N Jahre“ in die naechste Zeile, statt das Jahr auf zwei Ziffern zu quetschen. */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <label className="w-24 shrink-0 text-xs text-ui-tinte/80" htmlFor={`kind-${i}`}>
                {i + 1}. Kind, geb.
              </label>
              {/* Heute 0 bis 25 Jahre alt. Das Ende der Ausbildung wandert mit — es meint ein Alter, kein Kalenderjahr. */}
              <JahrWahl
                id={`kind-${i}`}
                wert={kind.geburtsjahr}
                von={jetzt - KIND_HOECHSTALTER}
                bis={jetzt}
                absteigend
                onChange={(jahr) => onKind(i, {
                  geburtsjahr: jahr,
                  ...(kind.ausbildungBisJahr !== undefined
                    ? { ausbildungBisJahr: kind.ausbildungBisJahr + jahr - kind.geburtsjahr }
                    : {}),
                })}
                klasse="min-w-[5.5rem] flex-1 p-1.5 text-sm"
              />
              <span className="ml-auto shrink-0 text-right text-xs text-ui-schiefer sm:w-24">
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
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 pl-6">
                <label className="w-24 shrink-0 text-xs text-ui-tinte/80" htmlFor={`kind-${i}-bis`}>
                  bis Ende
                </label>
                {/*
                  Von 18 bis 24: Bis 18 laeuft die Zulage ohnehin, und ab 25
                  foerdert das Gesetz nicht mehr — die Liste bietet kein Jahr
                  an, das nichts aendert.
                */}
                <JahrWahl
                  id={`kind-${i}-bis`}
                  wert={kind.ausbildungBisJahr ?? kind.geburtsjahr + a.kinderzulageBisAlter}
                  von={kind.geburtsjahr + a.kinderzulageBisAlter}
                  bis={kind.geburtsjahr + a.kinderzulageBisAlterAusbildung - 1}
                  onChange={(jahr) => onKind(i, { ausbildungBisJahr: jahr })}
                  klasse="min-w-[5.5rem] flex-1 p-1.5 text-sm"
                />
                <span className="ml-auto shrink-0 text-right text-xs text-ui-schiefer sm:w-24">
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
    <p className="mt-2 text-xs leading-relaxed text-ui-schiefer">
      <KinderHinweisText a={a} />
    </p>
  );
}

/** Derselbe Satz ohne Absatz — fuer das Info-Kaestchen an der Ueberschrift (Angaben im Rechner). */
export function KinderHinweisText({ a }: { a: AvdParameter }) {
  return (
    <>
      Die Kinderzulage läuft, solange Kindergeld fließt: bis {a.kinderzulageBisAlter} —
      und bei Ausbildung oder Studium so lange, wie diese dauert, längstens bis{' '}
      {a.kinderzulageBisAlterAusbildung}.
    </>
  );
}
