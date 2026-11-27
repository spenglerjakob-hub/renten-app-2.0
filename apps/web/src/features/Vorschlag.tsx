import { useId, useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, ListChecks, Pencil, Sparkles } from 'lucide-react';
import type { Jahreszeile, LoesungId, Loesungsmix, MixTeil, MixWuensche } from '@renten/engine';
import { useSzenario, type SzenarioParsed } from '../store/szenario';
import { TextFeld, ZahlFeld, euro, euroGenau } from '../components/Feld';
import {
  EINLEITUNG, Hervor, Kernsatz, KNOPF, KNOPF_KLEIN, KNOPF_KLEIN_HAUPT, LINK, Posten, Titel,
} from '../components/stil';
import { Aufklapper } from '../components/Frage';
import { useAnsprache } from '../components/Ansprache';
import { anteilAmNetto } from './bezug';
import {
  angeboteAusMix, eigenAusMix, eigenSetzen, LOESUNG_REIHENFOLGE, MIX_FARBE, vorschlagStand,
  type EigenTeil, type VorschlagStand,
} from './vorschlag-berechnung';
import {
  MIX_NAME, MIX_REGELN, MIX_ROLLE, WUNSCH_FRAGEN, mixAusgelassenText, mixDazu, mixGrund, mixGrundEigen, mixKurz,
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
 *
 * VON HAND ANPASSBAR. Der Vorschlag ist ein Ausgangspunkt: Ueber „Anpassen“
 * traegt der Berater selbst ein, welche Loesung wie viel bekommt — als
 * Netto-Aufwand oder als Beitrag, auf Wunsch mit Anbieter und Tarif
 * (`loesungen.eigen`, gerechnet in `loesungsmixEigen`). Das geht auch ohne
 * Antworten. Was von Hand eingetragen ist, gilt, bis man zum Vorschlag aus
 * den Antworten zurueckkehrt.
 */

const cent = (n: number) => euroGenau(Math.round(n * 100) / 100);
const auf2 = (n: number) => Math.round(n * 100) / 100;
const anteilText = (a: number) => `${Math.round(a * 100)} %`;

type Loesungen = SzenarioParsed['loesungen'];

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
  /** Die Eingabe der Verteilung ist offen — nur die Ansicht; was gilt, steht in `loesungen.eigen`. */
  const [bearbeiten, setBearbeiten] = useState(false);

  const antworte = <K extends keyof MixWuensche>(id: K, wert: MixWuensche[K]) =>
    setzeLoesungen({ wuensche: { ...l.wuensche, [id]: wert } });

  const bav = mix?.teile.find((x) => x.id === 'bav');

  const uebernehmen = () => {
    if (!mix) return;
    vorschlagUebernehmen(angeboteAusMix(mix, l.eigen.aktiv ? l.eigen.teile : []));
    onUebernommen?.();
  };

  /** Zurueck zum Vorschlag aus den Antworten: Was von Hand eingetragen war, gilt nicht mehr. */
  const zuruecksetzen = () => {
    setzeLoesungen({ eigen: { aktiv: false, teile: [] } });
    setBearbeiten(false);
  };

  const eingabe = (
    <Verteilung l={l} stand={stand} onFertig={() => setBearbeiten(false)} onZuruecksetzen={zuruecksetzen} />
  );

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
          {stand.eigen ? (
            /*
              VON HAND: Der Beitrag ist die Summe der eingetragenen Bausteine,
              und die Antworten aendern den Vorschlag nicht. Das steht da, wo
              sonst der Beitrag steht — sonst klickt man Antworten an und
              wundert sich, dass rechts nichts geschieht.
            */
            <div className="ui-innen px-4 py-3">
              <p className="text-sm font-medium text-ui-tinte">Von Hand angepasst</p>
              <p className="mt-1 text-xs leading-relaxed text-ui-schiefer">
                Die Verteilung im Vorschlag ist von Hand eingetragen{mix && mix.nettoMonat > 0.5
                  ? <> — zusammen <span className="font-medium tabular-nums text-ui-tinte">{euro(mix.nettoMonat)}</span> netto im Monat</>
                  : ''}. Die Antworten hier ändern sie nicht.
              </p>
              <button type="button" onClick={zuruecksetzen} className={`mt-2 text-left ${LINK} text-xs print:hidden`}>
                Zurück zum Vorschlag aus den Antworten
              </button>
            </div>
          ) : (
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
          )}

          <WunschFrage frage={WUNSCH_FRAGEN.verfuegbar} wert={l.wuensche.verfuegbar} onChange={(v) => antworte('verfuegbar', v)} />
          <WunschFrage frage={WUNSCH_FRAGEN.auszahlung} wert={l.wuensche.auszahlung} onChange={(v) => antworte('auszahlung', v)} />
          <WunschFrage frage={WUNSCH_FRAGEN.foerderung} wert={l.wuensche.foerderung} onChange={(v) => antworte('foerderung', v)} />
          {stand.mitArbeitgeber && (
            <div className="space-y-3">
              <WunschFrage frage={WUNSCH_FRAGEN.arbeitgeber} wert={l.wuensche.arbeitgeber} onChange={(v) => antworte('arbeitgeber', v)} />
              {/* Von Hand steht der Zuschuss bei der Betriebsrente in der Eingabe — hier nur, solange die Antwort ihn braucht. */}
              {l.wuensche.arbeitgeber === 'ja' && !stand.eigen && (
                <ZuschussFeld l={l} zuschussMonat={bav?.loesung.agZuschussMonat} />
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
          {/*
            EIN Bauteil fuer den Vorschlag und fuer die noch leere Eingabe: Mit
            dem ersten eingetragenen Betrag entsteht der Vorschlag, und die
            Eingabe muss dabei stehen bleiben, wo sie ist — in einem anderen
            Bauteil baute React sie neu auf, und das Feld verloere mitten im
            Tippen den Cursor.
          */}
          {(mix && mix.teile.length > 0 && (stand.eigen || wuensche)) || bearbeiten || stand.eigen ? (
            <Mix
              mix={mix}
              wuensche={wuensche}
              eigen={stand.eigen ? l.eigen.teile : null}
              nettoHeute={nettoHeute}
              onUebernehmen={uebernehmen}
              bearbeiten={bearbeiten}
              onBearbeiten={() => setBearbeiten(true)}
              eingabe={eingabe}
            />
          ) : (
            <div className="rounded-[10px] border border-dashed border-ui-feld-rand px-5 py-10 text-center text-sm leading-relaxed text-ui-schiefer">
              <p>
                {mix
                  ? `Mit einem Beitrag von ${euro(l.nettoMonat)} gibt es nichts zu verteilen — oben einen Beitrag eintragen.`
                  : `${stand.offen === 1 ? 'Noch eine Antwort' : `Noch ${stand.offen} Antworten`} — dann steht hier ${t.dein()} Vorschlag.`}
              </p>
              <button type="button" onClick={() => setBearbeiten(true)} className={`mt-3 ${LINK} text-xs print:hidden`}>
                <Pencil className="h-3.5 w-3.5" aria-hidden /> Oder die Verteilung selbst eintragen
              </button>
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
 * Der Arbeitgeberzuschuss zur Betriebsrente — in Prozent der Umwandlung oder
 * als fester Betrag. Beide Werte bleiben gemerkt. Beim ersten Wechsel auf
 * Euro steht der Zuschuss von eben im Feld, gerundet: Der Vorschlag springt
 * dann nicht.
 */
function ZuschussFeld({ l, zuschussMonat }: {
  l: Loesungen;
  /** Der Zuschuss, wie er gerade gerechnet ist — Vorbelegung fuer den festen Betrag */
  zuschussMonat: number | undefined;
}) {
  const setzeLoesungen = useSzenario((x) => x.setzeLoesungen);
  const festbetrag = l.agZuschussArt === 'festbetrag';
  const wechseln = (art: string) => {
    if (art !== 'prozent' && art !== 'festbetrag') return;
    setzeLoesungen(art === 'festbetrag' && l.agZuschussFestMonat === 0 && zuschussMonat !== undefined
      ? { agZuschussArt: art, agZuschussFestMonat: Math.round(zuschussMonat) }
      : { agZuschussArt: art });
  };
  return (
    <ZahlFeld
      label="Arbeitgeberzuschuss zur Betriebsrente"
      wert={festbetrag ? l.agZuschussFestMonat : Math.round(l.agZuschussQuote * 1000) / 10}
      onChange={(n) => setzeLoesungen(festbetrag
        ? { agZuschussFestMonat: n }
        : { agZuschussQuote: Math.max(0.15, n / 100) })}
      min={festbetrag ? 0 : 15}
      max={festbetrag ? 5_000 : 100}
      einheitWahl={{ optionen: ZUSCHUSS_EINHEITEN, aktiv: l.agZuschussArt, onWechsel: wechseln }}
      hilfe={festbetrag
        ? 'Fester Betrag im Monat. Mindestens gilt der gesetzliche Zuschuss: 15 % der Umwandlung, '
          + 'soweit der Arbeitgeber Abgaben spart.'
        : 'Mindestens die gesetzlichen 15 %. Bei einem Zuschussmodell etwa 50 %.'}
    />
  );
}

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

/** Ein Vorschlag ohne Bausteine — solange von Hand noch nichts eingetragen ist. */
const LEERER_MIX: Loesungsmix = {
  teile: [], nettoMonat: 0, vertragMonat: 0, zulageMonat: 0, agZuschussMonat: 0, steuerErsparnisMonat: 0,
  svErsparnisMonat: 0, dazuMonat: 0, verfuegbarQuote: 0, verfuegbarMonat: 0, ueberlaufMonat: 0, uebrigMonat: 0,
  ausgelassen: [], kapitalRegel: false, einVertrag: false, bavAnGrenze: false,
};

function Mix({ mix: vorschlag, wuensche, eigen, nettoHeute, onUebernehmen, bearbeiten, onBearbeiten, eingabe }: {
  /** Der Vorschlag — null oder ohne Bausteine, solange von Hand noch nichts eingetragen ist: Dann steht nur die Eingabe da */
  mix: Loesungsmix | null;
  /** Die Antworten — bei einer Verteilung von Hand koennen sie fehlen */
  wuensche: MixWuensche | null;
  /** Die von Hand eingetragenen Zeilen — null: der Vorschlag aus den Antworten */
  eigen: readonly EigenTeil[] | null;
  nettoHeute: number;
  onUebernehmen: () => void;
  /** Die Eingabe der Verteilung ist offen — sie steht dann an der Stelle der Bausteine */
  bearbeiten: boolean;
  onBearbeiten: () => void;
  eingabe: ReactNode;
}) {
  const t = useAnsprache();
  const leer = !vorschlag || vorschlag.teile.length === 0;
  /*
    Solange nichts eingetragen ist, steht nur die Eingabe da. Alles Weitere
    rechnet dann mit einem leeren Vorschlag und bleibt ausgeblendet — in
    derselben Reihenfolge der Bauteile, damit die Eingabe ihren Platz behaelt.
  */
  const mix = vorschlag ?? LEERER_MIX;
  const dazu = mixDazu(mix);
  const anteil = anteilAmNetto(mix.nettoMonat, nettoHeute);
  const vertraege = mix.teile.length === 1 ? `${t.dein('em')} Vertrag` : `${t.dein('en')} Verträgen`;
  // „Frei verfügbar und ohne Bindung“ stimmt nur, wenn alles in der privaten Vorsorge liegt.
  const nurPrivat = mix.teile.every((x) => x.id === 'privat');
  return (
    <div className="space-y-5">
      {!leer && (
        <Kernsatz etikett={`${t.Dein()} Vorschlag`}>
          {mix.dazuMonat >= 0.5
            ? <>Aus <Hervor>{euro(mix.nettoMonat)}</Hervor> im Monat werden <Hervor>{euro(mix.vertragMonat)}</Hervor> in {vertraege}.</>
            : nurPrivat
              ? <><Hervor>{euro(mix.nettoMonat)}</Hervor> im Monat, frei verfügbar und ohne Bindung.</>
              : <><Hervor>{euro(mix.nettoMonat)}</Hervor> im Monat in {vertraege}.</>}
        </Kernsatz>
      )}

      <div className="ui-karte p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-medium text-ui-tinte">
              {leer ? 'Verteilung selbst eintragen' : `So verteilt sich ${t.dein()} Beitrag`}
            </h3>
            {eigen && !leer && <p className="mt-0.5 text-xs text-ui-schiefer">Von Hand angepasst</p>}
          </div>
          {!bearbeiten && !leer && (
            <button type="button" onClick={onBearbeiten} className={`print:hidden ${KNOPF_KLEIN}`}>
              <Pencil className="h-3.5 w-3.5" aria-hidden /> Anpassen
            </button>
          )}
        </div>
        {/* Ein Ganzes und seine Teile: der Balken, einfarbig abgestuft — die Betraege stehen bei den Bausteinen. */}
        {!leer && (
          <div className="mt-3 flex h-3 gap-0.5 overflow-hidden rounded-full" aria-hidden>
            {mix.teile.map((x) => (
              <div key={x.id} className={MIX_FARBE[x.id]} style={{ width: `${x.anteil * 100}%` }} />
            ))}
          </div>
        )}

        {/* Ohne Bausteine gibt es nichts zu zeigen ausser der Eingabe — auch wenn sie nicht eigens geoeffnet wurde. */}
        {bearbeiten || leer ? eingabe : (
          <ul className="mt-2 divide-y divide-ui-linie">
            {mix.teile.map((x) => (
              <Baustein
                key={x.id}
                teil={x}
                grund={eigen || !wuensche ? mixGrundEigen(x) : mixGrund(x, mix, wuensche, t)}
                name={eigen?.find((z) => z.loesung === x.id)?.name.trim() ?? ''}
              />
            ))}
          </ul>
        )}

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

        {!leer && (
          <div className="mt-5 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
            <p className="text-xs leading-relaxed text-ui-schiefer">
              Legt je Baustein ein Angebot an. Dort {t.w('trägst du', 'tragt ihr', 'tragen Sie')} die Rente ein, die der Anbieter nennt.
            </p>
            <button type="button" onClick={onUebernehmen} className={`shrink-0 ${KNOPF}`}>
              Vorschlag übernehmen <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        )}
      </div>

      {leer ? null : eigen ? (
        /* Von Hand gelten die Regeln nicht — das steht da, wo sonst die Regeln stehen. */
        <p className="px-1 text-xs leading-relaxed text-ui-schiefer">
          Die Verteilung ist von Hand eingetragen — sie folgt nicht den Regeln des Vorschlags. Gerechnet ist die
          Einzahlseite; was im Alter davon netto ankommt, rechnet der nächste Schritt je Angebot.
        </p>
      ) : (
        <>
          {wuensche && mix.ausgelassen.length > 0 && (
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
              nennt, und an Steuer und Krankenversicherung. Das rechnet der nächste Schritt je Angebot. Ein Vorschlag aus
              {' '}{t.dein('en')} Antworten, keine Empfehlung für ein Produkt oder einen Anbieter.
            </p>
          </Aufklapper>
        </>
      )}
    </div>
  );
}

/** Ein Baustein des Vorschlags: was er kostet, was daraus wird — und warum er dabei ist. */
function Baustein({ teil, grund, name }: {
  teil: MixTeil;
  /** Warum er dabei ist bzw., von Hand, was er bringt */
  grund: string;
  /** Anbieter und Tarif, wenn von Hand eingetragen */
  name: string;
}) {
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
          <p className="mt-0.5 pl-[18px] text-xs text-ui-schiefer">{name ? `${name} · ${MIX_ROLLE[teil.id]}` : MIX_ROLLE[teil.id]}</p>
        </div>
        <p className="shrink-0 text-right">
          <span className="block text-base font-medium tabular-nums text-ui-tinte">{euro(l.nettoMonat)}</span>
          <span className="block text-xs tabular-nums text-ui-schiefer">{anteilText(teil.anteil)} {t.dein('es')} Beitrags</span>
        </p>
      </div>
      <p className="mt-2 pl-[18px] text-sm leading-relaxed text-ui-tinte">{grund}</p>
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

/* ----------------------------------------------------------------------
 * DIE VERTEILUNG VON HAND
 * -------------------------------------------------------------------- */

/** Wie der Beitrag je Loesung heisst — wie bei den Angeboten. */
const BEITRAG_NAME: Record<LoesungId, string> = {
  avd: 'Eigenbeitrag', bav: 'Umwandlung brutto', basis: 'Beitrag', privat: 'Beitrag',
};

/**
 * Die Eingabe der Verteilung: je Loesung eine Zeile mit dem Netto-Aufwand und
 * dem Beitrag — man traegt ein, was man kennt, das andere rechnet mit. Leer
 * heisst: nicht dabei.
 *
 * AUSGANGSPUNKT IST DER VORSCHLAG AUS DEN ANTWORTEN. Erst die erste Aenderung
 * macht die Verteilung zur eigenen (`eigen.aktiv`); bis dahin ist nur die
 * Eingabe offen, und der Vorschlag gilt weiter. So springt beim ersten
 * Aendern nichts: Die uebrigen Zeilen bleiben, wie sie vorgeschlagen waren.
 */
function Verteilung({ l, stand, onFertig, onZuruecksetzen }: {
  l: Loesungen;
  stand: VorschlagStand;
  onFertig: () => void;
  onZuruecksetzen: () => void;
}) {
  const setzeLoesungen = useSzenario((x) => x.setzeLoesungen);
  const zeilen = l.eigen.aktiv ? l.eigen.teile : eigenAusMix(stand.mix);
  // Ohne einen Baustein gibt es nichts, wohin „Fertig“ fuehrte — dann schliesst nur „Zurück …“ bzw. „Abbrechen“.
  const leer = !stand.mix || stand.mix.teile.length === 0;
  const setze = (id: LoesungId, p: Partial<Omit<EigenTeil, 'loesung'>>) =>
    setzeLoesungen({ eigen: { aktiv: true, teile: eigenSetzen(zeilen, id, p) } });
  return (
    <div className="mb-4 mt-3">
      <p className="text-xs leading-relaxed text-ui-schiefer">
        Je Lösung den Netto-Aufwand oder den Beitrag eintragen — das andere Feld rechnet mit. Leer heißt: nicht dabei.
      </p>
      <ul className="mt-1 divide-y divide-ui-linie">
        {LOESUNG_REIHENFOLGE.map((id) => (
          <VerteilungZeile
            key={id}
            id={id}
            zeile={zeilen.find((x) => x.loesung === id)}
            stand={stand}
            l={l}
            setze={(p) => setze(id, p)}
          />
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-ui-linie pt-3 print:hidden">
        {l.eigen.aktiv ? (
          <button type="button" onClick={onZuruecksetzen} className={`text-left ${LINK} text-xs`}>
            Zurück zum Vorschlag aus den Antworten
          </button>
        ) : <span />}
        {leer
          ? !l.eigen.aktiv && <button type="button" onClick={onFertig} className={KNOPF_KLEIN}>Abbrechen</button>
          : <button type="button" onClick={onFertig} className={KNOPF_KLEIN_HAUPT}>Fertig</button>}
      </div>
    </div>
  );
}

function VerteilungZeile({ id, zeile, stand, l, setze }: {
  id: LoesungId;
  zeile: EigenTeil | undefined;
  stand: VorschlagStand;
  l: Loesungen;
  setze: (p: Partial<Omit<EigenTeil, 'loesung'>>) => void;
}) {
  const titel = useId();
  const teil = stand.mix?.teile.find((x) => x.id === id);
  const sperre = stand.gesperrt.find((a) => a.id === id);
  const b = teil?.loesung;
  const alsBeitrag = zeile?.vorgabe === 'brutto';
  const eingetragen = zeile?.betragMonat ?? 0;
  // Das Feld, das eingetragen wurde, zeigt die Eingabe — das andere, was daraus gerechnet ist.
  const netto = alsBeitrag ? auf2(b?.nettoMonat ?? 0) : eingetragen;
  const beitrag = alsBeitrag ? eingetragen : auf2(b?.eigenbeitragMonat ?? 0);
  const dabei: string[] = [
    ...(b && b.zulageMonat >= 0.5 ? [`${euro(b.zulageMonat)} Zulagen`] : []),
    ...(b && b.agZuschussMonat >= 0.5 ? [`${euro(b.agZuschussMonat)} vom Arbeitgeber`] : []),
  ];
  return (
    <li className="py-3">
      <div role="group" aria-labelledby={titel}>
        <p id={titel} className="flex flex-wrap items-center gap-x-2 text-sm font-medium text-ui-tinte">
          <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${MIX_FARBE[id]}`} />
          {MIX_NAME[id]}
          <span className="font-normal text-ui-schiefer">· {MIX_ROLLE[id]}</span>
        </p>
        {sperre ? (
          /* Fuer diesen Haushalt nicht zu haben — die Zeile nennt den Grund statt eines Felds, das nichts bewirkt. */
          <p className="mt-1 pl-[18px] text-xs leading-relaxed text-ui-schiefer">{mixAusgelassenText(sperre, null)}</p>
        ) : (
          <>
            <div className={`mt-2 grid grid-cols-2 gap-2 ${id === 'privat'
              ? 'sm:grid-cols-[7.5rem_minmax(0,1fr)]' : 'sm:grid-cols-[7.5rem_7.5rem_minmax(0,1fr)]'}`}
            >
              {id !== 'privat' && (
                <ZahlFeld
                  label="Netto-Aufwand"
                  wert={netto}
                  onChange={(n) => setze({ betragMonat: n, vorgabe: 'netto' })}
                  einheit="€"
                  max={100_000}
                  leerBeiNull
                />
              )}
              <ZahlFeld
                label={BEITRAG_NAME[id]}
                wert={id === 'privat' ? eingetragen : beitrag}
                // Privat sind Netto-Aufwand und Beitrag dasselbe.
                onChange={(n) => setze({ betragMonat: n, vorgabe: id === 'privat' ? 'netto' : 'brutto' })}
                einheit="€"
                max={100_000}
                leerBeiNull
              />
              <div className={id === 'privat' ? '' : 'col-span-2 sm:col-span-1'}>
                <TextFeld
                  label="Anbieter / Tarif"
                  wert={zeile?.name ?? ''}
                  onChange={(v) => setze({ name: v })}
                  platzhalter="optional"
                  maxLaenge={120}
                />
              </div>
            </div>
            {b && (
              <p className="mt-1.5 text-xs leading-relaxed text-ui-schiefer">
                Im Vertrag <span className="font-medium tabular-nums text-ui-tinte">{euro(b.vertragMonat)}</span> im Monat
                {dabei.length > 0 ? ` — darin ${dabei.join(' und ')}` : ''}.
              </p>
            )}
            {/* Ueber dem Foerderrahmen: Gerechnet ist weniger, als eingetragen wurde — das muss dastehen. */}
            {b?.begrenzt && (
              <p className="mt-1 text-xs leading-relaxed text-ui-tinte">
                Gerechnet {alsBeitrag ? `mit ${cent(b.eigenbeitragMonat)} Beitrag` : `mit ${cent(b.nettoMonat)} netto`} —
                mehr passt nicht in den geförderten Rahmen.
              </p>
            )}
            {b && (b.begrenzt || id === 'bav') && b.hinweise.map((h) => (
              <p key={h} className="mt-1 text-xs leading-relaxed text-ui-schiefer">{h}</p>
            ))}
            {id === 'bav' && eingetragen > 0 && (
              <div className="mt-2 max-w-[20rem]">
                <ZuschussFeld l={l} zuschussMonat={b?.agZuschussMonat} />
              </div>
            )}
          </>
        )}
      </div>
    </li>
  );
}
