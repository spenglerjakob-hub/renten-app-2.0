import type { ReactNode } from 'react';
import { Play } from 'lucide-react';
import { Hinweis, KNOPF, KNOPF_KLEIN } from '../components/stil';
import { FestesKaestchen, Kaestchen } from '../components/Kaestchen';
import {
  ALLE_WAEHLBAREN, GESPRAECH_SEITEN, KENNUNGEN, SCHRITTE, gezeigteSeiten, schrittSetzen, schrittStand,
  seiteSetzen, seitenSchluessel, sichtbareSchritte, type Kennung,
} from './gespraech';

/**
 * „GESPRÄCH STARTEN“ — Seite fuer Seite ankreuzen, was der Mitarbeiter zu
 * sehen bekommt. Aufgebaut wie das Druckfenster des Gutachtens: dieselben
 * Kaestchen, dieselbe Schnellwahl, unten der Knopf.
 *
 * Je Schritt eine Zeile; hat er mehrere Seiten, stehen sie eingerueckt
 * darunter und der Schritt traegt das Sammel-Kaestchen. Der Beitrag, die
 * Entscheidung und die Unterlagen sind fest dabei — als Haken ohne Abwahl.
 *
 * Neben jedem Schritt steht, was die Vorbereitung ergeben hat (dieselbe
 * Zeile wie im Ablauf). Fehlt in einer ausgeblendeten Seite noch etwas,
 * sagt das Fenster es, BEVOR das Gespraech beginnt: Im Gespraech kaeme man
 * nicht mehr daran vorbei.
 */
export function GespraechFenster({ ausgeblendet, onAuswahl, zeilen, laeuft, onStart }: {
  /** Die abgewaehlten Seiten, als „kennung.seite“ */
  ausgeblendet: readonly string[];
  onAuswahl: (a: string[]) => void;
  /** Je Schritt, was seine Zeile im Ablauf sagt — und was noch fehlt */
  zeilen: readonly { ergebnis?: ReactNode; fehlt?: string }[];
  /** Das Gespraech laeuft schon — dann wird die Auswahl nur uebernommen */
  laeuft: boolean;
  onStart: () => void;
}) {
  const aus = new Set(ausgeblendet);
  const sichtbar = sichtbareSchritte(aus);
  const seiten = gezeigteSeiten(aus);
  // Was in einer (auch nur teilweise) ausgeblendeten Stelle noch fehlt.
  const fehlendes = KENNUNGEN.flatMap((k, i) => {
    const fehlt = zeilen[i]?.fehlt;
    return fehlt && schrittStand(aus, k) !== 'alle' && schrittStand(aus, k) !== 'fest' ? [`${SCHRITTE[i]} — ${fehlt}`] : [];
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-ui-schiefer">Schnellwahl:</span>
        <button type="button" className={`${KNOPF_KLEIN} ${GEDRUECKT}`} aria-pressed={aus.size === 0} onClick={() => onAuswahl([])}>
          Alle Seiten
        </button>
        <button
          type="button" className={`${KNOPF_KLEIN} ${GEDRUECKT}`}
          aria-pressed={ALLE_WAEHLBAREN.every((s) => aus.has(s))} onClick={() => onAuswahl([...ALLE_WAEHLBAREN])}
        >
          Nur das Nötigste
        </button>
      </div>

      <fieldset className="min-w-0">
        <legend className="sr-only">Welche Seiten das Gespräch zeigt</legend>
        <ul className="divide-y divide-ui-linie rounded-[10px] border border-ui-linie">
          {KENNUNGEN.map((k, i) => (
            <SchrittZeile
              key={k} kennung={k} name={SCHRITTE[i]!} zeile={zeilen[i]}
              aus={aus} ausgeblendet={ausgeblendet} onAuswahl={onAuswahl}
            />
          ))}
        </ul>
      </fieldset>

      {fehlendes.length > 0 && (
        <Hinweis>
          In ausgeblendeten Seiten fehlt noch etwas:{' '}
          <strong className="font-medium text-ui-tinte">{fehlendes.join('; ')}</strong>. Im Gespräch stehen diese Seiten nicht
          da — am besten vorher ergänzen.
        </Hinweis>
      )}

      {/* Unten im Fenster festgeheftet, wie im Druckfenster. */}
      <div className="sticky bottom-0 -mx-4 -mb-4 flex flex-wrap items-center justify-between gap-3 border-t border-ui-linie bg-white px-4 py-3 sm:-mx-6 sm:-mb-5 sm:px-6 sm:py-4">
        <p className="text-sm text-ui-schiefer">
          {sichtbar.length} von {SCHRITTE.length} Schritten · {seiten === 1 ? 'eine Seite' : `${seiten} Seiten`}
        </p>
        <button type="button" onClick={onStart} className={KNOPF}>
          {laeuft ? 'Auswahl übernehmen' : <><Play className="h-4 w-4" aria-hidden /> Gespräch starten</>}
        </button>
      </div>
    </div>
  );
}

/** Die Schnellwahl, die zur Auswahl passt, steht dunkel — wie der aktive Reiter. */
const GEDRUECKT = 'aria-pressed:border-ui-dunkel aria-pressed:bg-ui-dunkel aria-pressed:text-white aria-pressed:hover:bg-ui-dunkel';

/** Was die Vorbereitung zu diesem Schritt ergeben hat — und was noch fehlt. */
function stand(zeile: { ergebnis?: ReactNode; fehlt?: string } | undefined): ReactNode {
  if (!zeile || (!zeile.ergebnis && !zeile.fehlt)) return undefined;
  return (
    <>
      {zeile.ergebnis}
      {zeile.ergebnis && zeile.fehlt ? ' · ' : ''}
      {zeile.fehlt && <span className="font-medium text-ui-tinte">{zeile.fehlt}</span>}
    </>
  );
}

function SchrittZeile({ kennung, name, zeile, aus, ausgeblendet, onAuswahl }: {
  kennung: Kennung;
  name: string;
  zeile: { ergebnis?: ReactNode; fehlt?: string } | undefined;
  aus: ReadonlySet<string>;
  ausgeblendet: readonly string[];
  onAuswahl: (a: string[]) => void;
}) {
  const seiten = GESPRAECH_SEITEN[kennung];
  const wie = schrittStand(aus, kennung);
  const gezeigt = (id: string) => !aus.has(seitenSchluessel(kennung, id));

  // Der Abschluss: der ganze Schritt ist fest dabei, seine Seiten muss niemand einzeln sehen.
  if (wie === 'fest') return <li><FestesKaestchen text={name} zusatz={stand(zeile)} /></li>;

  // Eine einzige Seite: Der Schritt IST die Seite.
  if (seiten.length === 1) {
    return (
      <li>
        <Kaestchen an={wie === 'alle'} onChange={(an) => onAuswahl(schrittSetzen(ausgeblendet, kennung, an))} zusatz={stand(zeile)}>
          {name}
        </Kaestchen>
      </li>
    );
  }

  const mitFester = seiten.some((s) => s.immer);
  return (
    <li>
      {mitFester ? (
        // Der Schritt bleibt in jedem Fall stehen (der Beitrag) — also kein Sammel-Kaestchen, das ihn scheinbar abwaehlt.
        <p className="py-2.5 pl-3 pr-3 text-sm text-ui-tinte">
          {name}
          {stand(zeile) && <span className="block text-xs text-ui-schiefer">{stand(zeile)}</span>}
        </p>
      ) : (
        // Teilweise gewaehlt: Ein Klick waehlt alle, wie ueblich.
        <Kaestchen
          an={wie === 'alle'} halb={wie === 'einige'}
          onChange={() => onAuswahl(schrittSetzen(ausgeblendet, kennung, wie !== 'alle'))}
          zusatz={stand(zeile)}
        >
          {name}
        </Kaestchen>
      )}
      <ul className="pb-1" aria-label={`Seiten des Schritts „${name}“`}>
        {seiten.map((s) => (
          <li key={s.id}>
            {s.immer
              ? <FestesKaestchen eingerueckt text={s.titel} />
              : (
                <Kaestchen eingerueckt an={gezeigt(s.id)} onChange={(an) => onAuswahl(seiteSetzen(ausgeblendet, kennung, s.id, an))}>
                  {s.titel}
                </Kaestchen>
              )}
          </li>
        ))}
      </ul>
    </li>
  );
}
