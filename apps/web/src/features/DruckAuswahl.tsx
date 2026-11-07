import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Lock, Printer } from 'lucide-react';
import { Hinweis, KNOPF, KNOPF_KLEIN, LINK } from '../components/stil';
import type { GutachtenSeite } from '../druck/Gutachten';
import {
  ALLES, KURZ, THEMEN, gewaehlt, pruefungStand, themaSetzen, vertragSetzen, type DruckAuswahl, type Thema,
} from '../druck/druckauswahl';

/**
 * DAS DRUCKFENSTER — Thema fuer Thema ankreuzen, was ins Gutachten kommt.
 *
 * Gezeigt wird nur, was der Fall hergibt (`useGutachtenSeiten`): ohne private
 * Krankenversicherung keine Seite dazu, ohne Vertraege keine Pruefungen. Die
 * Vertrags-Pruefungen stehen je Vertrag darunter, mit einem Sammel-Kaestchen.
 * Deckblatt und Vorbehalt sind fest dabei — als Haken ohne Abwahl.
 *
 * Die Schnellwahl „Kurzfassung“ setzt die Haken wie der fruehere Umfang
 * „kurz“, „Alles“ wie „Ausführlich“.
 */
export function DruckAuswahlFenster({ seiten, auswahl, onAuswahl, beispielwerte, onAngabenPruefen, onDrucken }: {
  /** Alle Seiten, die der Fall hergibt — ungefiltert */
  seiten: GutachtenSeite[];
  auswahl: DruckAuswahl;
  onAuswahl: (a: DruckAuswahl) => void;
  /** Angaben, die noch Beispielwerte sind — dann ein Hinweis vor dem Druck */
  beispielwerte: string[];
  onAngabenPruefen: () => void;
  onDrucken: () => void;
}) {
  const pruefungen = seiten.filter((s) => s.thema === 'pruefung');
  const ids = pruefungen.map((s) => s.vertragId ?? '');
  const themen = THEMEN.filter((t) => t !== 'pruefung' && seiten.some((s) => s.thema === t));
  const mitVorbehalt = seiten.some((s) => s.thema === 'rechtsstand');
  const titelVon = (t: Thema) => seiten.find((s) => s.thema === t)?.titel ?? [];
  const gedruckt = seiten.filter((s) => gewaehlt(s, auswahl)).flatMap((s) => s.titel).length;
  const gleich = (a: DruckAuswahl, b: DruckAuswahl) =>
    THEMEN.every((t) => a.aus.includes(t) === b.aus.includes(t)) && a.vertraegeAus.length === 0 && b.vertraegeAus.length === 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-ui-schiefer">Schnellwahl:</span>
        <button type="button" className={`${KNOPF_KLEIN} ${GEDRUECKT}`} aria-pressed={gleich(auswahl, KURZ)} onClick={() => onAuswahl(KURZ)}>
          Kurzfassung
        </button>
        <button type="button" className={`${KNOPF_KLEIN} ${GEDRUECKT}`} aria-pressed={gleich(auswahl, ALLES)} onClick={() => onAuswahl(ALLES)}>
          Alles
        </button>
      </div>

      <fieldset className="min-w-0">
        <legend className="sr-only">Was ins Gutachten kommt</legend>
        <ul className="divide-y divide-ui-linie rounded-[10px] border border-ui-linie">
          <Fest text="Deckblatt mit Inhaltsverzeichnis" />
          {THEMEN.map((t) => {
            if (t === 'pruefung') {
              return pruefungen.length > 0 ? (
                <Pruefungen
                  key={t} seiten={pruefungen} ids={ids} auswahl={auswahl} onAuswahl={onAuswahl}
                />
              ) : null;
            }
            if (!themen.includes(t)) return null;
            const [titel, ...weitere] = titelVon(t);
            return (
              <li key={t}>
                <Kaestchen
                  an={!auswahl.aus.includes(t)}
                  onChange={(an) => onAuswahl(themaSetzen(auswahl, t, an))}
                  zusatz={weitere.length > 0 ? `dazu: ${weitere.join(', ')}` : undefined}
                >
                  {titel}
                </Kaestchen>
              </li>
            );
          })}
          {mitVorbehalt && <Fest text="Rechtsstand, Methodik und Vorbehalt" />}
        </ul>
      </fieldset>

      {beispielwerte.length > 0 && (
        <Hinweis>
          Diese Angaben sind noch Beispielwerte: <strong className="font-medium text-ui-tinte">{beispielwerte.join(', ')}</strong>.
          Im Gutachten stehen sie gekennzeichnet.{' '}
          <button type="button" onClick={onAngabenPruefen} className={LINK}>Angaben prüfen</button>
        </Hinweis>
      )}

      {/* Unten im Fenster festgeheftet: Bei vielen Vertraegen bliebe der Knopf sonst ausser Sicht. */}
      <div className="sticky bottom-0 -mx-4 -mb-4 flex flex-wrap items-center justify-between gap-3 border-t border-ui-linie bg-white px-4 py-3 sm:-mx-6 sm:-mb-5 sm:px-6 sm:py-4">
        <p className="text-sm text-ui-schiefer">
          Deckblatt und {gedruckt === 1 ? 'ein Abschnitt' : `${gedruckt} Abschnitte`}
        </p>
        <button type="button" onClick={onDrucken} className={KNOPF}>
          <Printer className="h-4 w-4" aria-hidden /> Drucken
        </button>
      </div>
    </div>
  );
}

/** Die Schnellwahl, die zur Auswahl passt, steht dunkel — wie der aktive Reiter. */
const GEDRUECKT = 'aria-pressed:border-ui-dunkel aria-pressed:bg-ui-dunkel aria-pressed:text-white aria-pressed:hover:bg-ui-dunkel';

/** Ein Kaestchen mit Text — die ganze Zeile ist anklickbar. */
function Kaestchen({ an, onChange, zusatz, eingerueckt = false, halb = false, children }: {
  an: boolean;
  onChange: (an: boolean) => void;
  zusatz?: string;
  eingerueckt?: boolean;
  /** Teilweise gewaehlt — das Sammel-Kaestchen */
  halb?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  const feld = useRef<HTMLInputElement>(null);
  useEffect(() => { if (feld.current) feld.current.indeterminate = halb; }, [halb]);
  return (
    <label htmlFor={id} className={`flex cursor-pointer items-start gap-3 py-2.5 pr-3 text-sm text-ui-tinte hover:bg-ui-hover ${eingerueckt ? 'pl-10' : 'pl-3'}`}>
      <input
        ref={feld} id={id} type="checkbox" checked={an} onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0"
      />
      <span className="min-w-0">
        {children}
        {zusatz && <span className="block text-xs text-ui-schiefer">{zusatz}</span>}
      </span>
    </label>
  );
}

/** Deckblatt und Vorbehalt: immer dabei, als Haken ohne Abwahl. */
function Fest({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-3 px-3 py-2.5 text-sm text-ui-schiefer">
      <input type="checkbox" checked disabled readOnly aria-label={`${text} — immer dabei`} className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">{text}</span>
      <span className="inline-flex shrink-0 items-center gap-1 text-xs"><Lock className="h-3 w-3" aria-hidden /> immer dabei</span>
    </li>
  );
}

/** Die Vertrags-Pruefungen: ein Sammel-Kaestchen, darunter jeder Vertrag. */
function Pruefungen({ seiten, ids, auswahl, onAuswahl }: {
  seiten: GutachtenSeite[];
  ids: string[];
  auswahl: DruckAuswahl;
  onAuswahl: (a: DruckAuswahl) => void;
}) {
  const stand = pruefungStand(auswahl, ids);
  const an = seiten.filter((s) => gewaehlt(s, auswahl)).length;
  return (
    <li>
      {/* Teilweise gewaehlt: Ein Klick waehlt alle, wie ueblich. */}
      <Kaestchen
        an={stand === 'alle'} halb={stand === 'einige'}
        onChange={() => onAuswahl(themaSetzen(auswahl, 'pruefung', stand !== 'alle'))}
        zusatz={`${an} von ${seiten.length} ${seiten.length === 1 ? 'Vertrag' : 'Verträgen'} — je Vertrag eine Seite`}
      >
        Vertrags-Prüfungen
      </Kaestchen>
      <ul className="pb-1">
        {seiten.map((s) => (
          <li key={s.vertragId}>
            <Kaestchen
              eingerueckt
              an={gewaehlt(s, auswahl)}
              onChange={(neu) => onAuswahl(vertragSetzen(auswahl, s.vertragId ?? '', neu, ids))}
            >
              {s.name ?? s.titel[0]}
            </Kaestchen>
          </li>
        ))}
      </ul>
    </li>
  );
}
