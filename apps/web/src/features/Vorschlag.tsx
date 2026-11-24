import { useId, useMemo } from 'react';
import { ArrowRight, ListChecks, Sparkles } from 'lucide-react';
import type { Jahreszeile, Loesungsmix, MixTeil, MixWuensche } from '@renten/engine';
import { useSzenario, type SzenarioParsed } from '../store/szenario';
import { ZahlFeld, euro, euroGenau } from '../components/Feld';
import { EINLEITUNG, Hervor, Kernsatz, KNOPF, LINK, Posten, Titel } from '../components/stil';
import { Aufklapper } from '../components/Frage';
import { useAnsprache } from '../components/Ansprache';
import { anteilAmNetto } from './bezug';
import { angeboteAusMix, MIX_FARBE, vorschlagStand } from './vorschlag-berechnung';
import {
  MIX_NAME, MIX_REGELN, MIX_ROLLE, WUNSCH_FRAGEN, mixAusgelassenText, mixDazu, mixGrund, mixKurz,
  type WunschFrage as Frage,
} from './vorschlag-texte';

/**
 * DER VORSCHLAG — der erste Schritt zu den Loesungen: vier Fragen dazu, was
 * dem Kunden wichtig ist, und daraus der Mix, der zu ihm passt.
 *
 * Bis November 2026 stand hier der Vergleich „Was wird aus X € netto?": vier
 * Loesungen nebeneinander, die Wahl blieb offen. Im Gespraech ist die Frage
 * aber „Was passt zu mir?" — und die Antwort ist selten EINE Loesung. Wer
 * Zulagen mitnehmen und trotzdem an sein Geld kommen will, braucht zwei.
 *
 * Links die Fragen, rechts der Vorschlag: Jede Antwort aendert ihn sofort,
 * und beide stehen im selben Blick. Gerechnet wird im Rechenkern
 * (`loesungsmix`) nach festen Regeln — sie stehen zum Aufklappen darunter.
 *
 * KEINE ANTWORT IST VORBELEGT. Ein Vorschlag aus Vorgaben waere keiner, der
 * zu diesem Kunden passt; er entsteht erst aus dem, was er sagt.
 */

const cent = (n: number) => euroGenau(Math.round(n * 100) / 100);
const anteilText = (a: number) => `${Math.round(a * 100)} %`;

export function Vorschlag({ zeile, szenario, sparrate, nettoHeute = 0, onUebernommen }: {
  zeile: Jahreszeile | null;
  /** Das Szenario der Ansicht — in der Einzelbetrachtung nur eine Person */
  szenario: SzenarioParsed;
  /** Der Startbeitrag aus dem Sparrechner, falls es eine Luecke gibt */
  sparrate: number | null;
  /** Das heutige Haushaltsnetto im Monat — die Bezugsgroesse fuer den Aufwand */
  nettoHeute?: number;
  /** Der Vorschlag steht bei den Angeboten — weiter dorthin */
  onUebernommen?: () => void;
}) {
  const t = useAnsprache();
  const l = szenario.loesungen;
  const setzeLoesungen = useSzenario((x) => x.setzeLoesungen);
  const vorschlagUebernehmen = useSzenario((x) => x.vorschlagUebernehmen);
  const stand = useMemo(() => vorschlagStand(szenario, zeile), [szenario, zeile]);
  const { mix, wuensche } = stand;

  const antworte = <K extends keyof MixWuensche>(id: K, wert: MixWuensche[K]) =>
    setzeLoesungen({ wuensche: { ...l.wuensche, [id]: wert } });

  const festbetrag = l.agZuschussArt === 'festbetrag';
  const bav = mix?.teile.find((x) => x.id === 'bav');
  /*
    Prozent oder fester Betrag — beide Werte bleiben gemerkt. Beim ersten
    Wechsel auf Euro steht der Zuschuss von eben im Feld, gerundet: Der
    Vorschlag springt dann nicht.
  */
  const zuschussArtWechseln = (art: string) => {
    if (art !== 'prozent' && art !== 'festbetrag') return;
    setzeLoesungen(art === 'festbetrag' && l.agZuschussFestMonat === 0 && bav
      ? { agZuschussArt: art, agZuschussFestMonat: Math.round(bav.loesung.agZuschussMonat) }
      : { agZuschussArt: art });
  };

  const uebernehmen = () => {
    if (!mix) return;
    vorschlagUebernehmen(angeboteAusMix(mix));
    onUebernommen?.();
  };

  return (
    <section aria-labelledby="vorschlag-titel">
      <div className="mb-6">
        <Titel als="h2" id="vorschlag-titel" klasse="flex items-center gap-3">
          <Sparkles className="h-6 w-6 shrink-0 text-ui-schiefer" aria-hidden />
          <span>Welche Mischung passt zu {t.dir}?</span>
        </Titel>
        <p className={`mt-2 ${EINLEITUNG}`}>
          {stand.mitArbeitgeber ? 'Vier' : 'Drei'} Fragen dazu, was {t.dir} bei der Vorsorge wichtig ist. Daraus entsteht
          ein Vorschlag, wie sich {t.dein()} Beitrag auf die Lösungen verteilt — gerechnet mit Zulagen,
          Arbeitgeberzuschuss und {t.dein('em')} persönlichen Steuersatz.
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="ui-karte space-y-6 p-5 sm:p-7">
          <div>
            <ZahlFeld
              label={`${t.Dein()} Beitrag im Monat (netto)`}
              wert={l.nettoMonat}
              onChange={(n) => setzeLoesungen({ nettoMonat: n })}
              einheit="€"
              schritt={25}
              max={10_000}
              hilfe={`Was ${t.du} im Monat aus der eigenen Tasche ${t.w('aufwendest', 'aufwendet', 'aufwenden')} — nach Steuer- und Abgabenersparnis.`}
            />
            {sparrate !== null && sparrate > 0.5 && Math.abs(sparrate - l.nettoMonat) > 0.5 && (
              <button
                type="button"
                onClick={() => setzeLoesungen({ nettoMonat: Math.round(sparrate) })}
                className={`mt-1.5 text-left ${LINK} text-xs`}
              >
                Sparrate aus dem Sparrechner übernehmen ({euro(sparrate)})
              </button>
            )}
          </div>

          <WunschFrage frage={WUNSCH_FRAGEN.verfuegbar} wert={l.wuensche.verfuegbar} onChange={(v) => antworte('verfuegbar', v)} />
          <WunschFrage frage={WUNSCH_FRAGEN.auszahlung} wert={l.wuensche.auszahlung} onChange={(v) => antworte('auszahlung', v)} />
          <WunschFrage frage={WUNSCH_FRAGEN.foerderung} wert={l.wuensche.foerderung} onChange={(v) => antworte('foerderung', v)} />
          {stand.mitArbeitgeber && (
            <div className="space-y-3">
              <WunschFrage frage={WUNSCH_FRAGEN.arbeitgeber} wert={l.wuensche.arbeitgeber} onChange={(v) => antworte('arbeitgeber', v)} />
              {l.wuensche.arbeitgeber === 'ja' && (
                <ZahlFeld
                  label="Arbeitgeberzuschuss zur Betriebsrente"
                  wert={festbetrag ? l.agZuschussFestMonat : Math.round(l.agZuschussQuote * 1000) / 10}
                  onChange={(n) => setzeLoesungen(festbetrag
                    ? { agZuschussFestMonat: n }
                    : { agZuschussQuote: Math.max(0.15, n / 100) })}
                  min={festbetrag ? 0 : 15}
                  max={festbetrag ? 5_000 : 100}
                  einheitWahl={{ optionen: ZUSCHUSS_EINHEITEN, aktiv: l.agZuschussArt, onWechsel: zuschussArtWechseln }}
                  hilfe={festbetrag
                    ? 'Fester Betrag im Monat. Mindestens gilt der gesetzliche Zuschuss: 15 % der Umwandlung, '
                      + 'soweit der Arbeitgeber Abgaben spart.'
                    : 'Mindestens die gesetzlichen 15 %. Bei einem Zuschussmodell etwa 50 %.'}
                />
              )}
            </div>
          )}
        </div>

        <div>
          {/*
            Der Vorschlag aendert sich mit jeder Antwort. Angesagt wird nur die
            Mischung in einer Zeile — der ganze Vorschlag bei jedem Klick waere
            fuer einen Screenreader eine Minute Text.
          */}
          <p role="status" className="sr-only">
            {mix && mix.teile.length > 0
              ? `Vorschlag: ${mixKurz(mix)}`
              : !mix ? `${stand.offen === 1 ? 'Noch eine Antwort' : `Noch ${stand.offen} Antworten`} bis zum Vorschlag` : ''}
          </p>
          {mix && wuensche && mix.teile.length > 0 ? (
            <Mix mix={mix} wuensche={wuensche} nettoHeute={nettoHeute} onUebernehmen={uebernehmen} />
          ) : (
            <div className="rounded-[10px] border border-dashed border-ui-feld-rand px-5 py-10 text-center text-sm leading-relaxed text-ui-schiefer">
              {mix
                ? `Mit einem Beitrag von ${euro(l.nettoMonat)} gibt es nichts zu verteilen — oben einen Beitrag eintragen.`
                : `${stand.offen === 1 ? 'Noch eine Antwort' : `Noch ${stand.offen} Antworten`} — dann steht hier ${t.dein()} Vorschlag.`}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

const ZUSCHUSS_EINHEITEN = [
  { id: 'prozent', text: '%', titel: 'Zuschuss in Prozent der Umwandlung' },
  { id: 'festbetrag', text: '€', titel: 'Zuschuss als fester Betrag im Monat' },
] as const;

/**
 * Eine der Fragen: die Antworten als grosse Knoepfe, darunter in einem Satz,
 * was die Antwort fuer den Vorschlag heisst. Gewaehlt wie ein Reiter,
 * gefuellt in Soot — bis zur Antwort ist keiner gewaehlt.
 */
function WunschFrage<K extends keyof MixWuensche>({ frage, wert, onChange }: {
  frage: Frage<K>; wert: MixWuensche[K] | undefined; onChange: (v: MixWuensche[K]) => void;
}) {
  const t = useAnsprache();
  const id = useId();
  return (
    <div role="group" aria-labelledby={id}>
      <p id={id} className="text-sm font-medium text-ui-tinte">{frage.frage(t)}</p>
      <div className={`mt-2 grid gap-2 ${frage.antworten.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        {frage.antworten.map((a) => {
          const an = wert === a.wert;
          return (
            <button
              key={a.wert}
              type="button"
              aria-pressed={an}
              onClick={() => onChange(a.wert)}
              className={`flex min-h-[3.5rem] min-w-0 flex-col justify-start rounded-[8px] border px-3 py-2.5 text-left transition-colors ${
                an ? 'border-ui-dunkel bg-ui-dunkel text-white' : 'border-ui-zweit-rand bg-ui-karte text-ui-tinte hover:bg-ui-hover'
              }`}
            >
              <span className="block text-sm font-medium leading-snug">{a.text}</span>
              <span className={`mt-0.5 block text-xs leading-snug ${an ? 'text-white/80' : 'text-ui-schiefer'}`}>{a.unter}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Mix({ mix, wuensche, nettoHeute, onUebernehmen }: {
  mix: Loesungsmix; wuensche: MixWuensche; nettoHeute: number; onUebernehmen: () => void;
}) {
  const t = useAnsprache();
  const dazu = mixDazu(mix);
  const anteil = anteilAmNetto(mix.nettoMonat, nettoHeute);
  const vertraege = mix.teile.length === 1 ? `${t.dein('em')} Vertrag` : `${t.dein('en')} Verträgen`;
  return (
    <div className="space-y-5">
      <Kernsatz etikett={`${t.Dein()} Vorschlag`}>
        {mix.dazuMonat >= 0.5
          ? <>Aus <Hervor>{euro(mix.nettoMonat)}</Hervor> im Monat werden <Hervor>{euro(mix.vertragMonat)}</Hervor> in {vertraege}.</>
          : <><Hervor>{euro(mix.nettoMonat)}</Hervor> im Monat, frei verfügbar und ohne Bindung.</>}
      </Kernsatz>

      <div className="ui-karte p-5 sm:p-6">
        <h3 className="text-base font-medium text-ui-tinte">So verteilt sich {t.dein()} Beitrag</h3>
        {/* Ein Ganzes und seine Teile: der Balken, einfarbig abgestuft — die Betraege stehen bei den Bausteinen. */}
        <div className="mt-3 flex h-3 gap-0.5 overflow-hidden rounded-full" aria-hidden>
          {mix.teile.map((x) => (
            <div key={x.id} className={MIX_FARBE[x.id]} style={{ width: `${x.anteil * 100}%` }} />
          ))}
        </div>

        <ul className="mt-2 divide-y divide-ui-linie">
          {mix.teile.map((x) => <Baustein key={x.id} teil={x} mix={mix} wuensche={wuensche} />)}
        </ul>

        {dazu.length > 0 && (
          <dl className="mt-1 border-t border-ui-tinte pt-3 text-sm">
            <Posten text={`${t.Dein()} Netto-Aufwand im Monat`} wert={cent(mix.nettoMonat)} />
            {dazu.map((x) => <Posten key={x.text} text={`+ ${x.text}`} wert={cent(x.wert)} />)}
            <Posten summe text={mix.teile.length === 1 ? 'Fließt in den Vertrag' : 'Fließt in die Verträge'} wert={cent(mix.vertragMonat)} />
          </dl>
        )}
        {anteil && (
          <p className="mt-3 text-xs text-ui-schiefer">
            {t.Dein()} Netto-Aufwand von {euro(mix.nettoMonat)} = <strong className="font-medium text-ui-tinte">{anteil}</strong> {t.dein('es')} heutigen Nettos.
          </p>
        )}

        {(mix.einVertrag || mix.kapitalRegel || mix.uebrigMonat > 0.5) && (
          <div className="mt-3 space-y-1.5 text-xs leading-relaxed text-ui-tinte">
            {mix.einVertrag && (
              <p>Für zwei Verträge ist der Beitrag zu klein — er fließt deshalb in einen. Mit einem höheren Beitrag lässt er sich aufteilen.</p>
            )}
            {mix.kapitalRegel && (
              <p>Kapital im Alter: Voll auszahlen lässt sich nur die private Vorsorge — deshalb bleibt mindestens ein Drittel dort.</p>
            )}
            {mix.uebrigMonat > 0.5 && (
              <p>{euro(mix.uebrigMonat)} sind nicht verplant: Die geförderten Verträge sind voll, und für einen weiteren ist der Rest zu klein.</p>
            )}
          </div>
        )}

        <div className="mt-5 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
          <p className="text-xs leading-relaxed text-ui-schiefer">
            Legt je Baustein ein Angebot an. Dort {t.w('trägst du', 'tragt ihr', 'tragen Sie')} die Rente ein, die der Anbieter nennt.
          </p>
          <button type="button" onClick={onUebernehmen} className={`shrink-0 ${KNOPF}`}>
            Vorschlag übernehmen <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      {mix.ausgelassen.length > 0 && (
        <div className="px-1">
          <h3 className="text-sm font-medium text-ui-tinte">Nicht im Vorschlag</h3>
          <dl className="mt-1.5 space-y-1 text-xs leading-relaxed">
            {mix.ausgelassen.map((a) => (
              <div key={a.id}>
                <dt className="inline font-medium text-ui-tinte">{MIX_NAME[a.id]}: </dt>
                <dd className="inline text-ui-schiefer">{mixAusgelassenText(a, wuensche)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <Aufklapper symbol={ListChecks} titel="So entsteht der Vorschlag" zusatz="Feste Regeln, bei jedem Kunden dieselben">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-ui-schiefer">
          {MIX_REGELN.map((r) => <li key={r}>{r}</li>)}
        </ol>
        <p className="mt-3 text-xs leading-relaxed text-ui-schiefer">
          Das ist die Einzahlseite. Was im Alter davon netto ankommt, hängt am Angebot — an der Rente, die der Anbieter
          nennt, und an Steuer und Krankenversicherung. Das rechnet der Vergleich der Angebote. Ein Vorschlag aus
          {' '}{t.dein('en')} Antworten, keine Empfehlung für ein Produkt oder einen Anbieter.
        </p>
      </Aufklapper>
    </div>
  );
}

/** Ein Baustein des Vorschlags: was er kostet, was daraus wird — und warum er dabei ist. */
function Baustein({ teil, mix, wuensche }: { teil: MixTeil; mix: Loesungsmix; wuensche: MixWuensche }) {
  const t = useAnsprache();
  const l = teil.loesung;
  const gefoerdert = l.vertragMonat - l.nettoMonat >= 0.5;
  const ersparnis: [string, number][] = [
    ...(l.steuerErsparnisMonat >= 0.5 ? [['+ Steuerersparnis', l.steuerErsparnisMonat] as [string, number]] : []),
    ...(l.svErsparnisMonat >= 0.5 ? [['+ Sozialabgaben gespart', l.svErsparnisMonat] as [string, number]] : []),
  ];
  const zusatz: [string, number][] = [
    ...(l.zulageMonat >= 0.5 ? [['+ Zulagen', l.zulageMonat] as [string, number]] : []),
    ...(l.agZuschussMonat >= 0.5 ? [['+ Arbeitgeberzuschuss', l.agZuschussMonat] as [string, number]] : []),
  ];
  return (
    <li className="py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-base font-medium leading-snug text-ui-tinte">
            <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${MIX_FARBE[teil.id]}`} />
            {MIX_NAME[teil.id]}
          </p>
          <p className="mt-0.5 pl-[18px] text-xs text-ui-schiefer">{MIX_ROLLE[teil.id]}</p>
        </div>
        <p className="shrink-0 text-right">
          <span className="block text-base font-medium tabular-nums text-ui-tinte">{euro(l.nettoMonat)}</span>
          <span className="block text-xs tabular-nums text-ui-schiefer">{anteilText(teil.anteil)} {t.dein('es')} Beitrags</span>
        </p>
      </div>
      <p className="mt-2 pl-[18px] text-sm leading-relaxed text-ui-tinte">{mixGrund(teil, mix, wuensche, t)}</p>
      {/* Die Rechnung des Bausteins zum Aufklappen — auf dem Weg genuegt, was daraus wird. */}
      <details className="mt-2 pl-[18px] text-xs">
        <summary className="cursor-pointer text-ui-schiefer underline-offset-4 hover:text-ui-tinte hover:underline">
          {gefoerdert
            ? <>Im Vertrag: <strong className="font-medium tabular-nums text-ui-tinte">{euro(l.vertragMonat)}</strong> im Monat — Rechnung zeigen</>
            : 'Im Alter — Steuer und Krankenversicherung'}
        </summary>
        {gefoerdert && (
          <dl className="mt-2 max-w-sm">
            <Posten text={`${t.Dein()} Netto-Aufwand`} wert={cent(l.nettoMonat)} />
            {ersparnis.map(([text, wert]) => <Posten key={text} text={text} wert={cent(wert)} />)}
            {ersparnis.length > 0 && (
              <Posten text={teil.id === 'bav' ? '= Bruttoumwandlung' : `= ${t.Dein()} Beitrag`} wert={cent(l.eigenbeitragMonat)} />
            )}
            {zusatz.map(([text, wert]) => <Posten key={text} text={text} wert={cent(wert)} />)}
            <Posten summe text="Im Vertrag" wert={cent(l.vertragMonat)} />
          </dl>
        )}
        <p className="mt-2 leading-relaxed text-ui-schiefer">
          <strong className="font-medium text-ui-tinte">Im Alter:</strong> {l.besteuerung}
        </p>
        {l.hinweise.map((h) => <p key={h} className="mt-1 leading-relaxed text-ui-schiefer">{h}</p>)}
      </details>
    </li>
  );
}
