import { Printer } from 'lucide-react';
import { Hinweis, KNOPF, KNOPF_KLEIN, LINK } from '../components/stil';
import { FestesKaestchen, Kaestchen } from '../components/Kaestchen';
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
export function DruckAuswahlFenster({ seiten, auswahl, onAuswahl, fehlend, onAngabenPruefen, onDrucken }: {
  /** Alle Seiten, die der Fall hergibt — ungefiltert */
  seiten: GutachtenSeite[];
  auswahl: DruckAuswahl;
  onAuswahl: (a: DruckAuswahl) => void;
  /** Angaben, die noch fehlen — ohne sie gibt es kein Ergebnis und damit nichts zu drucken */
  fehlend: string[];
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

      {fehlend.length > 0 && (
        <Hinweis>
          Für das Gutachten {fehlend.length === 1 ? 'fehlt noch eine Angabe' : 'fehlen noch Angaben'}:{' '}
          <strong className="font-medium text-ui-tinte">{fehlend.join(', ')}</strong>.{' '}
          <button type="button" onClick={onAngabenPruefen} className={LINK}>Zu den Angaben</button>
        </Hinweis>
      )}

      {/* Unten im Fenster festgeheftet: Bei vielen Vertraegen bliebe der Knopf sonst ausser Sicht. */}
      <div className="sticky bottom-0 -mx-4 -mb-4 flex flex-wrap items-center justify-between gap-3 border-t border-ui-linie bg-white px-4 py-3 sm:-mx-6 sm:-mb-5 sm:px-6 sm:py-4">
        <p className="text-sm text-ui-schiefer">
          Deckblatt und {gedruckt === 1 ? 'ein Abschnitt' : `${gedruckt} Abschnitte`}
        </p>
        <button type="button" onClick={onDrucken} disabled={fehlend.length > 0} className={`${KNOPF} disabled:cursor-not-allowed disabled:opacity-40`}>
          <Printer className="h-4 w-4" aria-hidden /> Drucken
        </button>
      </div>
    </div>
  );
}

/** Die Schnellwahl, die zur Auswahl passt, steht dunkel — wie der aktive Reiter. */
const GEDRUECKT = 'aria-pressed:border-ui-dunkel aria-pressed:bg-ui-dunkel aria-pressed:text-white aria-pressed:hover:bg-ui-dunkel';

/** Deckblatt und Vorbehalt: immer dabei, als Haken ohne Abwahl. */
function Fest({ text }: { text: string }) {
  return <li><FestesKaestchen text={text} /></li>;
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
