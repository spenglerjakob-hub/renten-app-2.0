import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { versorgungsluecke, type Jahreszeile, type ProjektionsErgebnis } from '@renten/engine';
import { useAnsprache } from '../components/Ansprache';
import { euro } from '../components/Feld';
import { KaufkraftSchalter } from '../components/KaufkraftSchalter';
import { EINLEITUNG, Hervor, KNOPF_ZWEIT, LINK, Posten, Titel } from '../components/stil';
import { ErgebnisRing } from './ErgebnisKern';
import { Kassenbon, NEU_TEXT } from './Kassenbon';
import {
  ohneEigenaufwand, LOESUNG_KURZ, type AngebotPosition, type MitAngenommenen,
} from './tuev-berechnung';

/**
 * ABSCHLUSS — die fuenfte Etappe: das Ergebnis noch einmal, jetzt MIT den
 * angenommenen Loesungen.
 *
 * Gerechnet ist es in `mitAngenommenen`: alle angenommenen Angebote
 * gemeinsam zu den bestehenden Vertraegen, nicht jedes fuer sich wie im
 * Vergleich. Gezeigt wie die Etappe „Ergebnis“ — der Ring links, der
 * Kassenbon rechts —, dazu vorher und nachher und die gewaehlten Loesungen.
 * Was neu dazugekommen ist, traegt die Marke „Neu – bisher nicht enthalten“.
 */

const zeileIm = (e: ProjektionsErgebnis, jahr: number) =>
  e.zeilen.find((z) => z.jahr === jahr) ?? e.zeilen.find((z) => z.jahr === e.ruhestandsjahr) ?? null;

/** Wie viel des Ziels das Netto deckt, hoechstens 100 % — mehr als gedeckt ist gedeckt. */
const deckung = (z: Jahreszeile) => (z.zielNettoMonat > 0 ? Math.min(100, Math.round((z.nettoMonat / z.zielNettoMonat) * 100)) : 0);

export function Abschluss({
  mit, positionen, ergebnisMit, vorher, kaufkraftHeute, onKaufkraftHeute, person, inhaberName, vorspann, onZuLoesungen,
}: {
  /** Die angenommenen Loesungen der Ansicht (`ansichtMitAngenommenen`) — null, wenn dort nichts angenommen ist */
  mit: MitAngenommenen | null;
  /** Was jede davon netto kostet (`angenommenePositionen`) */
  positionen: AngebotPosition[];
  ergebnisMit: ProjektionsErgebnis | null;
  /** Die Zeile des Ergebnisses ohne die Loesungen — null, solange es noch rechnet */
  vorher: Jahreszeile | null;
  kaufkraftHeute: boolean;
  onKaufkraftHeute: (b: boolean) => void;
  /** In der Einzelbetrachtung der Name der Person */
  person?: string;
  /** Bei Paaren im Haushalt: wem ein Angebot gehoert */
  inhaberName?: (id: 'A' | 'B') => string;
  /** Umschalter und Beispielhinweis der Etappe — unter dem Titel */
  vorspann?: ReactNode;
  onZuLoesungen: () => void;
}) {
  const zeileMit = ergebnisMit && vorher ? zeileIm(ergebnisMit, vorher.jahr) : null;
  const f = zeileMit && kaufkraftHeute ? 1 / zeileMit.kaufkraftfaktor : 1;
  const lueckeMit = zeileMit ? versorgungsluecke(zeileMit) : 0;
  const t = useAnsprache();
  const angenommen = `die ${t.du} angenommen ${t.w('hast', 'habt')}`;

  if (!mit) {
    return (
      <>
        <div>
          <Titel gross als="h2">{t.Dein()} Ergebnis mit den gewählten Lösungen</Titel>
          <p className={`mt-3 ${EINLEITUNG}`}>
            Hier steht {t.dein()} Ergebnis noch einmal — mit den Lösungen, {angenommen}.
          </p>
        </div>
        {vorspann}
        <div className="rounded-[10px] border border-dashed border-ui-feld-rand px-4 py-8 text-center text-sm text-ui-schiefer">
          <p>
            {person ? `Für ${person} ist noch keine Lösung angenommen.` : 'Noch ist keine Lösung angenommen.'}{' '}
            Dazu in „Vertrags-TÜV & Lösungen“ bei den Angeboten das Häkchen „Annehmen“ setzen.
          </p>
          <button type="button" onClick={onZuLoesungen} className={`mt-4 ${KNOPF_ZWEIT}`}>
            Zu den Angeboten <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div>
        <Titel gross als="h2">
          {/* Der Kernsatz mit dem Vornamen vorn: „Max, mit den gewählten Lösungen fehlen dir noch …“ */}
          {!zeileMit
            ? `${t.Dein()} Ergebnis mit den gewählten Lösungen`
            : lueckeMit > 0
              ? <>{t.anrede('mit')} den gewählten Lösungen fehlen {t.dir} noch <span className="whitespace-nowrap tabular-nums"><Hervor>{euro(lueckeMit * f)}</Hervor></span> im Monat</>
              : <>{t.anrede('mit')} den gewählten Lösungen ist {t.dein()} Ziel <Hervor>gedeckt</Hervor></>}
        </Titel>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <p className={`${EINLEITUNG} min-w-0 flex-1 basis-72`}>
            {t.Dein()} Ergebnis noch einmal, jetzt mit den Lösungen, {angenommen} — gemeinsam
            gerechnet, mit der Steuer auf alle Renten zusammen. Was dazugekommen ist, trägt die Marke
            „{NEU_TEXT}“.
          </p>
          <KaufkraftSchalter wert={kaufkraftHeute} onChange={onKaufkraftHeute} />
        </div>
      </div>
      {vorspann}
      {zeileMit && vorher && ergebnisMit ? (
        <div className="grid grid-cols-1 gap-5 sm:gap-6 lg:grid-cols-12">
          <div className="flex flex-col gap-5 sm:gap-6 lg:col-span-5">
            {/* Blau im Ring: was die gewaehlten Loesungen dazubringen — gegen das Ergebnis ohne sie. */}
            <ErgebnisRing zeile={zeileMit} vorher={vorher} kaufkraftHeute={kaufkraftHeute} />
            <VorherNachher vorher={vorher} nachher={zeileMit} kaufkraftHeute={kaufkraftHeute} ergebnisMit={ergebnisMit} neu={mit.neu} />
          </div>
          {/* Rechts die Aufstellung und darunter, was gewaehlt ist — so stehen beide Spalten etwa gleich hoch. */}
          <div className="flex flex-col gap-5 sm:gap-6 lg:col-span-7">
            <Kassenbon
              ergebnis={ergebnisMit}
              zeile={zeileMit}
              szenario={mit.szenario}
              kaufkraftHeute={kaufkraftHeute}
              person={person}
              neu={mit.neu}
            />
            <GewaehlteLoesungen
              mit={mit}
              positionen={positionen}
              inhaberName={inhaberName}
              onZuLoesungen={onZuLoesungen}
            />
          </div>
        </div>
      ) : (
        <p className="ui-karte px-4 py-8 text-center text-sm text-ui-schiefer">Berechnung läuft …</p>
      )}
    </>
  );
}

/** Dieselben drei Zahlen ohne und mit den Loesungen — im selben Jahr, im selben Geld. */
function VorherNachher({ vorher, nachher, kaufkraftHeute, ergebnisMit, neu }: {
  vorher: Jahreszeile; nachher: Jahreszeile; kaufkraftHeute: boolean;
  ergebnisMit: ProjektionsErgebnis; neu: ReadonlySet<string>;
}) {
  // Dasselbe Jahr, dieselben Annahmen: Der Kaufkraftfaktor ist in beiden Zeilen derselbe.
  const f = kaufkraftHeute ? 1 / nachher.kaufkraftfaktor : 1;
  const zeilen: [string, string, string][] = [
    ['Netto im Monat', euro(vorher.nettoMonat * f), euro(nachher.nettoMonat * f)],
    ['Lücke im Monat', euro(versorgungsluecke(vorher) * f), euro(versorgungsluecke(nachher) * f)],
    ['Ziel erreicht', `${deckung(vorher)} %`, `${deckung(nachher)} %`],
  ];
  // Ein Kapital fliesst einmal und steht deshalb nicht im Monatsnetto — es gehoert trotzdem dazu.
  const einmal = ergebnisMit.kapitalauszahlungen.filter((k) => neu.has(k.vertragId));
  return (
    <section aria-labelledby="vorher-nachher" className="ui-karte p-5 sm:p-6">
      <h3 id="vorher-nachher" className="text-base font-medium text-ui-tinte">Vorher und nachher</h3>
      <p className="mt-1 text-xs leading-relaxed text-ui-schiefer">
        Im Jahr {nachher.jahr}, {kaufkraftHeute ? 'in heutiger Kaufkraft' : 'nominal'} — ohne und mit den gewählten Lösungen.
      </p>
      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="text-xs text-ui-schiefer">
            <th scope="col" className="pb-2 text-left font-normal"><span className="sr-only">Größe</span></th>
            <th scope="col" className="pb-2 text-right font-normal">Vorher</th>
            <th scope="col" className="pb-2 pl-3 text-right font-normal">Nachher</th>
          </tr>
        </thead>
        <tbody>
          {zeilen.map(([text, a, b]) => (
            <tr key={text} className="border-t border-ui-linie">
              <th scope="row" className="py-2 text-left font-normal text-ui-schiefer">{text}</th>
              <td className="py-2 text-right tabular-nums text-ui-schiefer">{a}</td>
              <td className="py-2 pl-3 text-right font-medium tabular-nums text-ui-tinte">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {einmal.length > 0 && (
        <p className="mt-3 text-xs leading-relaxed text-ui-schiefer">
          Dazu einmalig: {einmal.map((k) => `${euro(k.nettoKapital)} netto aus ${k.bezeichnung} (${k.jahr})`).join(', ')} — im
          Monatsnetto nicht enthalten.
        </p>
      )}
    </section>
  );
}

/** Was im Monat in den Vertrag geht — bei der bAV Umwandlung und Arbeitgeber getrennt. */
function beitragText(a: MitAngenommenen['loesungen'][number]['angebot']) {
  if (a.loesung === 'bav') {
    return a.beitragMonat > 0
      ? `Umwandlung ${euro(a.beitragMonat)} + Arbeitgeber ${euro(a.agZuschussMonat)} im Monat`
      : `Arbeitgeber ${euro(a.agZuschussMonat)} im Monat`;
  }
  return `${a.loesung === 'avd' ? 'Eigenbeitrag' : 'Beitrag'} ${euro(a.beitragMonat)} im Monat`;
}

/**
 * Die angenommenen Loesungen mit dem, was jede netto kostet. Der Aufwand
 * kommt aus dem Vergleich (`angebotPositionen`): je Angebot fuer sich
 * gerechnet — zusammen deshalb „rund“.
 */
function GewaehlteLoesungen({ mit, positionen, inhaberName, onZuLoesungen }: {
  mit: MitAngenommenen;
  positionen: AngebotPosition[];
  inhaberName?: (id: 'A' | 'B') => string;
  onZuLoesungen: () => void;
}) {
  const aufwand = (id: string) => {
    const p = positionen.find((x) => x.angebot.id === id);
    return p?.rente ?? p?.kapital ?? null;
  };
  const summe = mit.loesungen.reduce((s, x) => s + (aufwand(x.angebot.id)?.echterAufwandMonat ?? 0), 0);
  const t = useAnsprache();

  return (
    <section aria-labelledby="gewaehlte-loesungen" className="ui-karte p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="gewaehlte-loesungen" className="text-base font-medium text-ui-tinte">{t.Dein('e')} gewählten Lösungen</h3>
        <button type="button" onClick={onZuLoesungen} className={`${LINK} text-xs`}>Ändern</button>
      </div>
      <ul className="mt-2 divide-y divide-ui-linie">
        {mit.loesungen.map(({ angebot: a, vertrag }) => {
          const e = aufwand(a.id);
          return (
            <li key={a.id} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ui-tinte">{a.name || LOESUNG_KURZ[a.loesung]}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ui-schiefer">
                    {a.name ? `${LOESUNG_KURZ[a.loesung]} · ` : ''}
                    {inhaberName ? `für ${inhaberName(vertrag.inhaber)} · ` : ''}
                    {beitragText(a)}
                  </p>
                </div>
                <p className="shrink-0 text-right text-sm font-medium tabular-nums text-ui-tinte">
                  {a.renteMonat > 0 ? <>{euro(a.renteMonat)}<span className="block text-xs font-normal text-ui-schiefer">Rente brutto</span></>
                    : <>{euro(a.kapital)}<span className="block text-xs font-normal text-ui-schiefer">Kapital brutto</span></>}
                </p>
              </div>
              <p className="mt-1 text-xs text-ui-schiefer">
                {!e ? 'Kostet netto: —'
                  : ohneEigenaufwand(e) ? `Kostet ${t.dich} netto nichts — rein arbeitgeberfinanziert.`
                    : <>Kostet {t.dich} netto <strong className="font-medium text-ui-tinte">{euro(e.echterAufwandMonat)}</strong> im Monat.</>}
              </p>
            </li>
          );
        })}
      </ul>
      {mit.loesungen.length > 1 && (
        <dl className="text-sm">
          <Posten summe text="Zusammen rund, netto im Monat" wert={euro(summe)} />
        </dl>
      )}
      <p className="mt-3 text-xs leading-relaxed text-ui-schiefer">
        Rente und Kapital laut Angebot, zum Rentenbeginn. Was davon netto ankommt, steht im Kassenbon.
      </p>
    </section>
  );
}
