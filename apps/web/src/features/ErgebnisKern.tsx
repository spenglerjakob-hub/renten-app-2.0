import { versorgungsluecke, type Jahreszeile } from '@renten/engine';
import { euro } from '../components/Feld';
import { KaufkraftSchalter } from '../components/KaufkraftSchalter';
import { LueckenRing, ZIEL_RING } from '../components/LueckenRing';
import { EINLEITUNG, Hervor, Kernsatz, SCHWEBEND, Titel, Zahl } from '../components/stil';

/*
 * DER KERN DER ETAPPE „ERGEBNIS“ — gebaut wie Schritt 3 der
 * Mitarbeiterberatung und das Ergebnis der Schnellrechnung: die Luecke als
 * Aussage im Titel, der Ring als das eine schwebende Stueck, darunter der
 * Kernsatz. Die Zeile kommt von aussen, damit Titel, Ring, Kassenbon und
 * Fussleiste garantiert dasselbe Jahr zeigen.
 */

/** Was gezeigt wird: nominal oder in heutiger Kaufkraft, je nach Schalter. */
function betraege(zeile: Jahreszeile, kaufkraftHeute: boolean) {
  const f = kaufkraftHeute ? 1 / zeile.kaufkraftfaktor : 1;
  // Die andere Lesart fuer die Fussnote: wer heute sieht, liest dort nominal, und umgekehrt.
  const g = kaufkraftHeute ? 1 : 1 / zeile.kaufkraftfaktor;
  const luecke = versorgungsluecke(zeile);
  const deckung = zeile.zielNettoMonat > 0 ? Math.round((zeile.nettoMonat / zeile.zielNettoMonat) * 100) : 0;
  return { f, g, luecke, deckung };
}

/** Titel und Einleitung der Etappe, mit dem Schalter „Nominal | Kaufkraft heute“. */
export function ErgebnisKopf({ zeile, kaufkraftHeute, onKaufkraftHeute }: {
  zeile: Jahreszeile;
  kaufkraftHeute: boolean;
  onKaufkraftHeute: (b: boolean) => void;
}) {
  const { f, luecke } = betraege(zeile, kaufkraftHeute);
  return (
    <div>
      <Titel gross als="h2">
        {luecke > 0
          ? <>Im Ruhestand fehlen <span className="whitespace-nowrap tabular-nums"><Hervor>{euro(luecke * f)}</Hervor></span> im Monat</>
          : <>Ihr Ziel ist <Hervor>gedeckt</Hervor></>}
      </Titel>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <p className={`${EINLEITUNG} min-w-0 flex-1 basis-72`}>
          Was Ihnen im Jahr {zeile.jahr} netto bleibt — nach Steuern und Kranken- und Pflegeversicherung —
          und wie groß die Lücke zu Ihrem Ziel ist{kaufkraftHeute ? ', in heutiger Kaufkraft.' : `, nominal im Geld des Jahres ${zeile.jahr}.`}
        </p>
        <KaufkraftSchalter wert={kaufkraftHeute} onChange={onKaufkraftHeute} />
      </div>
    </div>
  );
}

/** Der Ring mit Netto und Luecke, darunter der Kernsatz — das schwebende Stueck der Etappe. */
export function ErgebnisRing({ zeile, kaufkraftHeute }: { zeile: Jahreszeile; kaufkraftHeute: boolean }) {
  const { f, g, luecke, deckung } = betraege(zeile, kaufkraftHeute);
  const ziel = zeile.zielNettoMonat * f;
  const netto = zeile.nettoMonat * f;
  return (
    <section aria-label="Ziel, Netto und Lücke" className={`${SCHWEBEND} p-5 sm:p-7`}>
      {/* Der Ring oben, die Zahlen darunter nebeneinander: In der schmalen Spalte des
          Ergebnisses braechen sie neben dem Ring um. */}
      <div className="flex flex-col items-center gap-6">
        <LueckenRing
          ganz={ziel} gedeckt={Math.min(netto, ziel)} luecke={luecke * f}
          gedecktProzent={Math.min(100, deckung)} lueckeProzent={Math.max(0, 100 - deckung)} texte={ZIEL_RING}
        />
        <dl className="grid w-full gap-4 sm:grid-cols-2">
          <Zahl etikett="Netto im Ruhestand" punkt="bg-ui-tinte" wert={euro(netto)} zusatz={`${deckung}\u00a0%`} />
          {luecke > 0 && (
            <Zahl etikett="Versorgungslücke" punkt="bg-ui-luecke ring-1 ring-ui-tinte/20" wert={euro(luecke * f)}
              zusatz={`${100 - deckung}\u00a0%`} />
          )}
        </dl>
      </div>
      <Kernsatz klasse="mt-6">
        {deckung < 100
          ? <>Das Netto deckt <Hervor>{deckung} %</Hervor> des Ziels.</>
          : <>Das Netto erreicht <Hervor>{deckung} %</Hervor> des Ziels.</>}
      </Kernsatz>
      <p className="mt-3 text-xs leading-relaxed text-ui-schiefer">
        {kaufkraftHeute ? `Im Geld des Jahres ${zeile.jahr}` : 'In heutiger Kaufkraft'}: Netto {euro(zeile.nettoMonat * g)} und
        Ziel {euro(zeile.zielNettoMonat * g)} im Monat{luecke > 0 ? `, Lücke ${euro(luecke * g)}` : ''}.
      </p>
    </section>
  );
}
