import type { LoesungId, Loesungsmix, MixWuensche } from '@renten/engine';
import { euro, euroGenau, prozent } from '../components/Feld';
import {
  laufzeitText, ohneEigenaufwand, LOESUNG_KURZ, ohneEigenaufwandText, type AngebotPosition,
} from '../features/tuev-berechnung';
import {
  MIX_NAME, WUNSCH_FRAGEN, mixAusgelassenText, mixGrund, mixGrundEigen, wunschAntwort,
} from '../features/vorschlag-texte';
import type { EigenTeil } from '../features/vorschlag-berechnung';
import {
  Seite, Tabelle, Zeile, Untertitel, Text, Ergebnis, Angabe, Zweispaltig, GrosseZahl, KASTEN, KASTEN_TITEL,
} from './Bausteine';
import { anteilAmNetto, anteilAnLuecke } from '../features/bezug';
import { useAnsprache } from '../components/Ansprache';
import { mitTrennstellen } from '../lib/trennstellen';

/**
 * „Dein Vorschlag" und die Angebote — die vierte Etappe der Beratung auf Papier.
 *
 * Vorn der Vorschlag: was dem Kunden wichtig ist, wie sich sein Beitrag
 * danach auf die Loesungen verteilt und warum. Dahinter die erfassten
 * Angebote, JEDES FUER SICH mit seinen Kennzahlen — wie am Bildschirm und wie
 * ein Vertrag im Vertrags-TUEV (`TuevBogen`). Bis November 2026 standen sie
 * in einer Tabelle nebeneinander, das mit der hoechsten Rendite ausgezeichnet;
 * die Loesungen eines Vorschlags ergaenzen einander aber und treten nicht
 * gegeneinander an.
 *
 * Dieselben Rechnungen und dieselben Saetze wie am Bildschirm
 * (`vorschlagStand`, `vorschlag-texte`, `angebotPositionen`); hier wird
 * nichts neu gerechnet.
 *
 * Die Antworten stehen mit auf dem Blatt: Der Vorschlag ist nur
 * nachvollziehbar, wenn man sieht, worauf er antwortet.
 */

/** Der Vorschlag, wie ihn `vorschlagStand` liefert — mit allen Antworten oder von Hand eingetragen. */
export interface GedruckterVorschlag {
  mix: Loesungsmix;
  /** Die Antworten — bei einer Verteilung von Hand koennen sie fehlen; dann steht die Tabelle nicht da */
  wuensche: MixWuensche | null;
  /** Wurde nach dem Arbeitgeber gefragt? Sonst steht die Frage nicht auf dem Blatt. */
  mitArbeitgeber: boolean;
  /** Die von Hand eingetragenen Zeilen (`loesungen.eigen`) — null: der Vorschlag aus den Antworten */
  eigen: readonly EigenTeil[] | null;
}

const zahl = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cent = (n: number) => euroGenau(Math.round(n * 100) / 100);
/** Ein Posten, den es bei dieser Loesung nicht gibt, als Strich statt „0 €". */
const posten = (n: number) => (n < 0.005 ? '—' : cent(n));
const jahre = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 });

/**
 * Spaltenkopf mit weichen Trennstellen: "Altersvorsorgedepot" und
 * "(Entgeltumwandlung)" sind laenger als eine Spalte breit und liefen sonst
 * in die Nachbarspalte.
 */
const kopfVon = mitTrennstellen;

export function Loesungsvergleich({ vorschlag, angebote, nettoHeute = 0, mitRenteneinkuenften = true }: {
  /** Der Vorschlag — null, solange Antworten fehlen: Dann stehen nur die Angebote da */
  vorschlag: GedruckterVorschlag | null;
  angebote: AngebotPosition[];
  /** Das heutige Haushaltsnetto im Monat — die Bezugsgroesse fuer den Aufwand */
  nettoHeute?: number;
  /** Steht die Seite zu den Renteneinkünften im selben Ausdruck? Nur dann der Verweis darauf. */
  mitRenteneinkuenften?: boolean;
}) {
  const an = useAnsprache();
  const gerechnet = angebote.filter((a) => a.rente || a.kapital);
  /** Rein arbeitgeberfinanziert: ohne eigenen Aufwand gibt es weder Hebel noch Rendite. */
  const ohneAufwand = (a: AngebotPosition) => ohneEigenaufwand((a.rente ?? a.kapital)!);

  return (
    <>
      {vorschlag && <VorschlagSeite {...vorschlag} nettoHeute={nettoHeute} />}

      {/*
        DIE ANGEBOTE AUF EIGENEM BLATT, eines unter dem anderen. Ein Block
        bleibt beisammen (`break-inside-avoid`); passen nicht alle auf eine
        Seite, beginnt der naechste auf der folgenden.
      */}
      {gerechnet.length > 0 && (
        <Seite titel={`${an.Dein('e')} Angebote`} nummer="Jedes für sich gerechnet">
          <Text>
            Die Rente laut Angebot, nach Steuer und Kranken- und Pflegeversicherung im ersten
            Rentenjahr, gegen den Netto-Aufwand in der Ansparphase — und, wo das Angebot sie nennt, die
            Kapitalabfindung nach Steuer im Zuflussjahr und Krankenversicherung. Die Nettorendite ist der
            interne Zinsfuß aller Netto-Zahlungen bis zur angenommenen Lebenserwartung.
          </Text>
          {gerechnet.map((a, i) => (
            <AngebotBlock key={a.angebot.id} position={a} nummer={i + 1} nettoHeute={nettoHeute} />
          ))}
          {gerechnet.some(ohneAufwand) && <Text>{ohneEigenaufwandText(an)}</Text>}
          <Text>
            Jedes Angebot ist für sich gerechnet, zusätzlich zu den bestehenden Verträgen. Die Steuer im Alter
            ist anteilig an der Steuer des Haushalts gerechnet
            {mitRenteneinkuenften ? ', wie auf der Seite zu den Renteneinkünften. ' : '. '}Eine Kapitalabfindung ist im Jahr des Zuflusses voll zu versteuern (bAV) bzw.
            mit ihrem Ertrag (private Rentenversicherung). Eine Modellrechnung, keine Empfehlung für ein
            Produkt oder einen Anbieter.
          </Text>
        </Seite>
      )}
    </>
  );
}

/**
 * Ein Angebot auf dem Blatt: oben die drei Zahlen, auf die es ankommt — was
 * es kostet, was ankommt, was aus einem Euro wird —, darunter seine uebrigen
 * Kennzahlen. Nennt es neben der Rente ein Kapital, steht dieser Weg in einem
 * eigenen Kasten darunter.
 */
function AngebotBlock({ position: a, nummer, nettoHeute }: {
  position: AngebotPosition; nummer: number; nettoHeute: number;
}) {
  const an = useAnsprache();
  // Ein Angebot gehoert einer Person — auch beim Paar „du“, wie im Vertrags-TUEV
  const e = an.einzeln;
  const { rente, kapital } = a;
  // Die Einzahlseite ist bei beiden Wegen dieselbe — sie kommt aus dem, der gerechnet ist.
  const r = (rente ?? kapital)!;
  const ohne = ohneEigenaufwand(r);
  const gut = r.nettoHebel >= 1;
  const anteilNetto = anteilAmNetto(r.echterAufwandMonat, nettoHeute);
  const name = a.angebot.name.trim();
  const art = LOESUNG_KURZ[a.angebot.loesung];

  const kapitalZeilen = kapital && (
    <>
      <Angabe feld="Kapital brutto" wert={euro(kapital.bruttoKapital)} />
      <Angabe feld="− Steuer im Zuflussjahr" wert={euro(kapital.steuerKapital)} />
      <Angabe feld="− Kranken- und Pflegeversicherung" wert={euro(kapital.kvPvKapital)} />
      {rente && <Angabe feld="Kapital netto" wert={euro(kapital.nettoKapital)} />}
      {rente && <Angabe feld="Nettorendite des Kapitals" wert={ohne ? '—' : `${prozent(kapital.rendite, 2)} p. a.`} />}
      {a.breakEven && (
        <Angabe feld="Rente holt das Kapital ein mit" wert={`${jahre(a.breakEven.breakEvenOhneZins)} Jahren`} />
      )}
    </>
  );

  return (
    // mt-5 am Rahmen: `Untertitel` traegt `first:mt-0` und verloere als erstes Kind sonst seinen Abstand nach oben.
    <div className="mt-5 break-inside-avoid">
      <Untertitel>{nummer}. {name || art}{name ? ` — ${art}` : ''}</Untertitel>
      <div className="grid grid-cols-3 gap-3">
        <GrosseZahl
          titel={`Kostet ${e.dich} im Monat`}
          wert={euro(r.echterAufwandMonat)}
          hinweis={ohne ? 'Rein arbeitgeberfinanziert' : anteilNetto ? `${anteilNetto} ${an.dein('es')} heutigen Nettos` : undefined}
        />
        <GrosseZahl
          titel={rente ? 'Netto-Rente im Monat' : 'Kapital netto'}
          wert={rente ? euro(rente.nettoRenteMonat) : euro(r.nettoKapital)}
          hinweis={rente ? `Laut Angebot ${euro(rente.bruttoRenteMonat)} brutto` : `Laut Angebot ${euro(r.bruttoKapital)} brutto`}
        />
        <GrosseZahl
          titel="Aus einem Euro Aufwand werden"
          wert={ohne ? '—' : `${zahl(r.nettoHebel)} €`}
          ton={ohne ? 'neutral' : gut ? 'gut' : 'schlecht'}
          hinweis={ohne ? 'Kein eigener Aufwand' : `Nettorendite ${prozent(r.rendite, 2)} p. a.`}
        />
      </div>
      <div className="mt-2">
        <Zweispaltig>
          <Angabe feld="Fließt in den Vertrag" wert={`${euro(r.beitragMonat + r.zulageMonat)} im Monat`} />
          <Angabe feld="Einzahlungsdauer" wert={laufzeitText(r.monateEinzahlung)} />
          {a.lueckeAnteil && <Angabe feld="Schließt von der Lücke" wert={anteilAnLuecke(a.lueckeAnteil.anteil)} />}
          {rente && rente.echterAufwandMonat > 0 && (
            <Angabe feld="Netto-Rente je 100 € Aufwand" wert={cent(rente.nettoRenteMonat / rente.echterAufwandMonat * 100)} />
          )}
          <Angabe feld="Überschuss über den Aufwand" wert={euro(r.echterGewinn)} />
          {/* Ohne eigenen Aufwand gibt es nichts, das zurueckfliessen koennte — das sagt schon die Zahl oben. */}
          {rente && !ohne && (
            <Angabe feld="Eingesetztes Geld zurück nach" wert={`${jahre(rente.amortisationsJahre)} Rentenjahren`} />
          )}
          {/* Nur ein Kapital genannt: Seine Posten sind die Rechnung des Angebots und stehen bei den uebrigen. */}
          {!rente && kapitalZeilen}
        </Zweispaltig>
      </div>
      {rente && kapital && (
        <div className={`mt-2 ${KASTEN}`}>
          <div className={KASTEN_TITEL}>Stattdessen als Kapital — einmalig zum Rentenbeginn</div>
          <Zweispaltig>{kapitalZeilen}</Zweispaltig>
        </div>
      )}
    </div>
  );
}

/** Die Namen der Bausteine als Aufzaehlung: „A, B und C". */
const aufgezaehlt = (namen: string[]) => (namen.length < 2
  ? namen.join('')
  : `${namen.slice(0, -1).join(', ')} und ${namen[namen.length - 1]}`);

/**
 * Der Vorschlag auf einem Blatt: die Antworten, die Verteilung, die Gruende.
 *
 * VON HAND EINGETRAGEN (`eigen`) steht dasselbe Blatt da, nur ohne die Regeln:
 * Zu jedem Baustein, was er bringt — nicht, auf welche Antwort er antwortet —,
 * mit Anbieter und Tarif, wo sie eingetragen sind. Die Antworten stehen
 * weiter mit auf dem Blatt, wenn sie gegeben wurden.
 */
function VorschlagSeite({ mix, wuensche, mitArbeitgeber, eigen, nettoHeute }: GedruckterVorschlag & { nettoHeute: number }) {
  const an = useAnsprache();
  const teile = mix.teile;
  const fragen = [
    WUNSCH_FRAGEN.verfuegbar, WUNSCH_FRAGEN.auszahlung, WUNSCH_FRAGEN.foerderung,
    ...(mitArbeitgeber ? [WUNSCH_FRAGEN.arbeitgeber] : []),
  ];
  const mitSumme = teile.length > 1;
  const breite = 64 / (teile.length + (mitSumme ? 1 : 0));
  const reihe = (f: (l: Loesungsmix['teile'][number]['loesung']) => number, summe: number, format: (n: number) => string) =>
    [...teile.map((x) => format(f(x.loesung))), ...(mitSumme ? [format(summe)] : [])];
  const anteil = anteilAmNetto(mix.nettoMonat, nettoHeute);
  const kopf = (id: LoesungId) => kopfVon(MIX_NAME[id]);
  /** Der Baustein mit Anbieter und Tarif, wo sie von Hand eingetragen sind. */
  const name = (id: LoesungId) => {
    const tarif = eigen?.find((x) => x.loesung === id)?.name.trim();
    return tarif ? `${MIX_NAME[id]} (${tarif})` : MIX_NAME[id];
  };
  const nurPrivat = teile.every((x) => x.id === 'privat');
  return (
    <Seite titel={`${an.Dein()} Vorschlag`} nummer={`Wie sich ${euro(mix.nettoMonat)} im Monat verteilen`}>
      <Text>
        {eigen
          ? <>Der Vorschlag ist im Gespräch zusammengestellt</>
          : <>Der Vorschlag entsteht aus dem, was {an.dir} bei der Vorsorge wichtig ist, und aus {an.dein('em')} Beitrag</>}
        {' '}— gerechnet mit {an.dein('em')} persönlichen Steuersatz, den Zulagen und dem Arbeitgeberzuschuss,
        zusätzlich zu dem, was {an.du} heute schon {an.w('einzahlst', 'einzahlt', 'einzahlen')}.
      </Text>

      {wuensche && (
        <>
          <Untertitel>Was {an.dir} wichtig ist</Untertitel>
          <Tabelle kopf={['', 'Antwort']} spalten={[55, 45]} textSpalten={[1]}>
            {fragen.map((f) => (
              <Zeile key={f.id} textSpalten={[1]} zellen={[f.kurz, wunschAntwort(f.id, wuensche[f.id])]} />
            ))}
          </Tabelle>
        </>
      )}

      <div className="mt-3">
        <Ergebnis>
          {mix.dazuMonat >= 0.5 ? (
            <>
              Aus {cent(mix.nettoMonat)} netto im Monat werden <strong>{cent(mix.vertragMonat)}</strong>
              {' '}{teile.length > 1 ? 'in den Verträgen' : 'im Vertrag'}: {aufgezaehlt(teile.map((x) => name(x.id)))}.
            </>
          ) : nurPrivat ? (
            <>{cent(mix.nettoMonat)} im Monat, frei verfügbar und ohne Bindung: {aufgezaehlt(teile.map((x) => name(x.id)))}.</>
          ) : (
            <>{cent(mix.nettoMonat)} im Monat: {aufgezaehlt(teile.map((x) => name(x.id)))}.</>
          )}
        </Ergebnis>
      </div>

      <div className="mt-3">
        <Tabelle
          kopf={['', ...teile.map((x) => kopf(x.id)), ...(mitSumme ? ['Zusammen'] : [])]}
          spalten={[36, ...teile.map(() => breite), ...(mitSumme ? [breite] : [])]}
          markiert={mitSumme ? [teile.length + 1] : []}
        >
          <Zeile zellen={[`${an.Dein()} Netto-Aufwand`, ...reihe((l) => l.nettoMonat, mix.nettoMonat, cent)]} />
          <Zeile zellen={['+ Steuerersparnis', ...reihe((l) => l.steuerErsparnisMonat, mix.steuerErsparnisMonat, posten)]} />
          <Zeile zellen={['+ Sozialabgaben gespart', ...reihe((l) => l.svErsparnisMonat, mix.svErsparnisMonat, posten)]} />
          <Zeile fett zellen={[`= ${an.Dein()} Beitrag (bAV: Bruttoumwandlung)`,
            ...reihe((l) => l.eigenbeitragMonat, teile.reduce((s, x) => s + x.loesung.eigenbeitragMonat, 0), cent)]} />
          <Zeile zellen={['+ Zulagen', ...reihe((l) => l.zulageMonat, mix.zulageMonat, posten)]} />
          <Zeile zellen={['+ Arbeitgeberzuschuss', ...reihe((l) => l.agZuschussMonat, mix.agZuschussMonat, posten)]} />
          <Zeile fett zellen={['= Im Vertrag', ...reihe((l) => l.vertragMonat, mix.vertragMonat, cent)]} />
          <Zeile zellen={[`Anteil an ${an.dein('em')} Beitrag`,
            ...teile.map((x) => `${Math.round(x.anteil * 100)} %`), ...(mitSumme ? ['100 %'] : [])]} />
        </Tabelle>
      </div>
      {anteil && (
        <Text>
          {an.Dein()} Netto-Aufwand von {euro(mix.nettoMonat)} im Monat entspricht {anteil} {an.dein('es')} heutigen Nettos.
        </Text>
      )}

      <Untertitel>{eigen || !wuensche ? 'Was die Bausteine bringen' : 'Warum diese Mischung'}</Untertitel>
      <ul className="space-y-0.5 text-[11px] leading-relaxed text-ui-schiefer">
        {teile.map((x) => (
          <li key={x.id}>
            <strong className="text-ui-tinte">{name(x.id)}:</strong>{' '}
            {eigen || !wuensche ? mixGrundEigen(x) : mixGrund(x, mix, wuensche, an)}
          </li>
        ))}
        {!eigen && wuensche && mix.ausgelassen.map((a) => (
          <li key={a.id}><strong className="text-ui-tinte">Nicht dabei — {MIX_NAME[a.id]}:</strong> {mixAusgelassenText(a, wuensche)}</li>
        ))}
      </ul>
      {mix.einVertrag && <Text>Für zwei Verträge ist der Beitrag zu klein — er fließt deshalb in einen.</Text>}
      {mix.kapitalRegel && (
        <Text>Kapital im Alter: Voll auszahlen lässt sich nur die private Vorsorge — deshalb bleibt mindestens ein Drittel dort.</Text>
      )}
      {mix.uebrigMonat > 0.5 && (
        <Text>
          {euro(mix.uebrigMonat)} sind nicht verplant: Die geförderten Verträge sind voll, und für einen weiteren ist der Rest zu klein.
        </Text>
      )}
      {teile.some((x) => x.loesung.hinweise.length > 0 && x.id !== 'privat') && (
        <Text>
          {teile.filter((x) => x.id !== 'privat' && x.loesung.hinweise.length > 0)
            .map((x) => `${MIX_NAME[x.id]}: ${x.loesung.hinweise.join(' ')}`).join(' ')}
        </Text>
      )}

      <Untertitel>Im Alter</Untertitel>
      <ul className="space-y-0.5 text-[11px] leading-relaxed text-ui-schiefer">
        {teile.map((x) => (
          <li key={x.id}><strong className="text-ui-tinte">{MIX_NAME[x.id]}:</strong> {x.loesung.besteuerung}</li>
        ))}
      </ul>

      {eigen ? (
        <Text>
          Die Auswahl der Lösungen und ihre Beträge stammen aus dem Beratungsgespräch, nicht aus den Regeln des
          Rechners. Gerechnet ist die Einzahlseite, jeweils bis zum geförderten Rahmen. Was im Alter netto ankommt,
          hängt am Angebot. Eine Modellrechnung.
        </Text>
      ) : (
        <Text>
          Der Vorschlag folgt festen Regeln: Was verfügbar bleiben soll, fließt in die private Vorsorge; der Rest
          dorthin, wo Zulagen, Arbeitgeberzuschuss oder Steuervorteile dazukommen, jeweils bis zum geförderten Rahmen.
          Was im Alter netto ankommt, hängt am Angebot. Eine Modellrechnung, keine Empfehlung für ein Produkt oder
          einen Anbieter.
        </Text>
      )}
    </Seite>
  );
}
