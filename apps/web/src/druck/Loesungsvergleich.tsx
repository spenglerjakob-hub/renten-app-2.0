import { Fragment } from 'react';
import type { LoesungId, Loesungsmix, MixWuensche } from '@renten/engine';
import { euro, euroGenau, prozent } from '../components/Feld';
import {
  besteAngebote, besteAngeboteText, ohneEigenaufwand, LOESUNG_KURZ, ohneEigenaufwandText,
  type AngebotPosition,
} from '../features/tuev-berechnung';
import {
  MIX_NAME, WUNSCH_FRAGEN, mixAusgelassenText, mixGrund, wunschAntwort,
} from '../features/vorschlag-texte';
import { Seite, Tabelle, Zeile, Gruppenzeile, Untertitel, Text, Abzeichen, Ergebnis } from './Bausteine';
import { anteilAmNetto, anteilAnLuecke } from '../features/bezug';
import { useAnsprache } from '../components/Ansprache';
import { mitTrennstellen } from '../lib/trennstellen';

/**
 * „Dein Vorschlag" und die Angebote — die vierte Etappe der Beratung auf Papier.
 *
 * Vorn der Vorschlag: was dem Kunden wichtig ist, wie sich sein Beitrag
 * danach auf die Loesungen verteilt und warum. Dahinter die erfassten
 * Angebote mit Rente netto und Rendite. Dieselben Rechnungen und dieselben
 * Saetze wie am Bildschirm (`vorschlagStand`, `vorschlag-texte`,
 * `angebotPositionen`); hier wird nichts neu gerechnet.
 *
 * Die Antworten stehen mit auf dem Blatt: Der Vorschlag ist nur
 * nachvollziehbar, wenn man sieht, worauf er antwortet.
 */

/** Der Vorschlag, wie ihn `vorschlagStand` liefert — nur mit allen Antworten. */
export interface GedruckterVorschlag {
  mix: Loesungsmix;
  wuensche: MixWuensche;
  /** Wurde nach dem Arbeitgeber gefragt? Sonst steht die Frage nicht auf dem Blatt. */
  mitArbeitgeber: boolean;
}

const zahl = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cent = (n: number) => euroGenau(Math.round(n * 100) / 100);
/** Ein Posten, den es bei dieser Loesung nicht gibt, als Strich statt „0 €". */
const posten = (n: number) => (n < 0.005 ? '—' : cent(n));

/**
 * Spaltenkopf mit weichen Trennstellen: "Altersvorsorgedepot" und
 * "(Entgeltumwandlung)" sind laenger als eine Spalte breit und liefen sonst
 * in die Nachbarspalte.
 */
const kopfVon = mitTrennstellen;

/** Hoechstens vier Angebote nebeneinander — mehr Spalten passen nicht auf A4 hochkant. */
const JE_TABELLE = 4;

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
  const gruppen: AngebotPosition[][] = [];
  for (let i = 0; i < gerechnet.length; i += JE_TABELLE) gruppen.push(gerechnet.slice(i, i + JE_TABELLE));
  /** Rein arbeitgeberfinanziert: ohne eigenen Aufwand gibt es weder Hebel noch Rendite. */
  const ohneAufwand = (a: AngebotPosition) => ohneEigenaufwand((a.rente ?? a.kapital)!);
  // Die hoechste Nettorendite der Rente — das Kapital steht ausser Wertung, wie am Bildschirm (`besteAngebote`).
  const beste = besteAngebote(gerechnet);
  const besteListe = gerechnet.filter((a) => beste.ids.includes(a.angebot.id));
  /** Der Stern steht an der Rendite, die gewertet wurde — in der Zeile der Rente (oder, ohne jede Rente, des Kapitals). */
  const stern = (a: AngebotPosition, weg: 'rente' | 'kapital') => (beste.weg === weg && besteListe.includes(a) ? ' ★' : '');
  /** Hebel, Rendite und Amortisation: ohne eigenen Aufwand ein Strich, kein „0,00“. */
  const mitAufwand = (a: AngebotPosition, w: string) => (ohneAufwand(a) ? '—' : w);
  const angebotName = (a: AngebotPosition) =>
    `${gerechnet.indexOf(a) + 1}. ${a.angebot.name || LOESUNG_KURZ[a.angebot.loesung]}`;
  const jahre = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 });

  return (
    <>
      {vorschlag && <VorschlagSeite {...vorschlag} nettoHeute={nettoHeute} />}

      {/*
        DIE ANGEBOTE AUF EIGENEM BLATT. Mit Rente UND Kapital braucht jedes
        Angebot rund siebzehn Zeilen; zusammen mit dem Vorschlag liefe die
        Seite schon bei vier Angeboten ueber.
      */}
      {gruppen.length > 0 && (
        <Seite titel={`${an.Dein('e')} Angebote im Vergleich`} nummer="Rente und Kapital netto">
          <Text>
            Die Rente laut Angebot, nach Steuer und Kranken- und Pflegeversicherung im ersten
            Rentenjahr, gegen den Netto-Aufwand in der Ansparphase — und, wo das Angebot sie nennt, die
            Kapitalabfindung nach Steuer im Zuflussjahr und Krankenversicherung. Die Nettorendite ist der
            interne Zinsfuß aller Netto-Zahlungen bis zur angenommenen Lebenserwartung.
          </Text>
          {beste.weg !== null && (
            <Ergebnis>
              Die höchste Nettorendite {beste.weg === 'rente' ? 'der Rente' : 'des Kapitals'} {besteListe.length > 1 ? 'haben' : 'hat'}{' '}
              {besteListe.map((a, i) => (
                <Fragment key={a.angebot.id}>
                  {i > 0 && ' und '}<strong>{angebotName(a)}</strong>
                </Fragment>
              ))}
              {' '}mit <strong>{prozent(beste.rendite, 2)} p. a.</strong>
            </Ergebnis>
          )}
          {gruppen.map((g, gi) => (
            <Fragment key={gi}>
              <div className="mt-3">
                <Tabelle
                  kopf={['', ...g.map((a) => (
                    <>
                      {angebotName(a)}
                      {ohneAufwand(a) && <span className="block text-[9px] font-normal text-ui-schiefer">rein arbeitgeberfinanziert</span>}
                      {besteListe.includes(a) && <Abzeichen>★ Höchste Rendite</Abzeichen>}
                    </>
                  ))]}
                  spalten={[36, ...g.map(() => 64 / g.length)]}
                  markiert={g.flatMap((a, i) => (besteListe.includes(a) ? [i + 1] : []))}
                >
                  {(() => {
                    const r = (f: (x: NonNullable<AngebotPosition['rente']>, a: AngebotPosition) => string) =>
                      g.map((a) => (a.rente ? f(a.rente, a) : '—'));
                    const k = (f: (x: NonNullable<AngebotPosition['kapital']>, a: AngebotPosition) => string) =>
                      g.map((a) => (a.kapital ? f(a.kapital, a) : '—'));
                    const e = (a: AngebotPosition) => (a.rente ?? a.kapital)!;
                    const mitRente = g.some((a) => a.rente);
                    const mitKapital = g.some((a) => a.kapital);
                    const mitVergleich = g.some((a) => a.breakEven);
                    const spalten = g.length + 1;
                    return (
                      <>
                        <Zeile zellen={[`Kostet ${an.dich} netto im Monat`, ...g.map((a) => euro(e(a).echterAufwandMonat))]} />
                        {nettoHeute > 0 && (
                          <Zeile zellen={[`In % ${an.dein('es')} heutigen Nettos`, ...g.map((a) => anteilAmNetto(e(a).echterAufwandMonat, nettoHeute) ?? '—')]} />
                        )}
                        <Zeile zellen={['Fließt in den Vertrag', ...g.map((a) => euro(e(a).beitragMonat + e(a).zulageMonat))]} />
                        {mitRente && (
                          <>
                            <Gruppenzeile text="Als Rente" spalten={spalten} />
                            <Zeile zellen={['Rente brutto', ...r((x) => euro(x.bruttoRenteMonat))]} />
                            <Zeile fett zellen={['Rente netto', ...r((x) => euro(x.nettoRenteMonat))]} />
                            {g.some((a) => a.lueckeAnteil) && (
                              <Zeile zellen={['Schließt von der Lücke', ...g.map((a) => (a.lueckeAnteil ? anteilAnLuecke(a.lueckeAnteil.anteil) : '—'))]} />
                            )}
                            <Zeile zellen={['Netto-Rente je 100 € Aufwand', ...r((x) => (x.echterAufwandMonat > 0
                              ? cent(x.nettoRenteMonat / x.echterAufwandMonat * 100) : '—'))]} />
                            <Zeile zellen={['Netto-Hebel', ...r((x, a) => mitAufwand(a, `${zahl(x.nettoHebel)} ×`))]} />
                            <Zeile fett zellen={['Nettorendite p. a.', ...r((x, a) => mitAufwand(a,
                              `${prozent(x.rendite, 2)}${stern(a, 'rente')}`))]} />
                            <Zeile zellen={['Amortisation ab Rentenbeginn', ...r((x, a) => mitAufwand(a,
                              `${jahre(x.amortisationsJahre)} Jahre`))]} />
                          </>
                        )}
                        {mitKapital && (
                          <>
                            <Gruppenzeile text="Als Kapital" spalten={spalten} />
                            <Zeile zellen={['Kapital brutto', ...k((x) => euro(x.bruttoKapital))]} />
                            <Zeile zellen={['− Steuer im Zuflussjahr', ...k((x) => euro(x.steuerKapital))]} />
                            <Zeile zellen={['− Kranken- und Pflegeversicherung', ...k((x) => euro(x.kvPvKapital))]} />
                            <Zeile fett zellen={['Kapital netto', ...k((x) => euro(x.nettoKapital))]} />
                            <Zeile fett zellen={['Nettorendite p. a.', ...k((x, a) => mitAufwand(a,
                              `${prozent(x.rendite, 2)}${stern(a, 'kapital')}`))]} />
                          </>
                        )}
                        {mitVergleich && (
                          <Zeile zellen={['Rente holt das Kapital ein mit', ...g.map((a) => (a.breakEven
                            ? `${jahre(a.breakEven.breakEvenOhneZins)} Jahren` : '—'))]} />
                        )}
                      </>
                    );
                  })()}
                </Tabelle>
              </div>
            </Fragment>
          ))}
          {beste.weg !== null && <Text>★ {besteAngeboteText(beste.weg)}</Text>}
          {gerechnet.some(ohneAufwand) && <Text>{ohneEigenaufwandText(an)}</Text>}
          <Text>
            Die Steuer im Alter ist anteilig an der Steuer des Haushalts gerechnet
            {mitRenteneinkuenften ? ', wie auf der Seite zu den Renteneinkünften. ' : '. '}Eine Kapitalabfindung ist im Jahr des Zuflusses voll zu versteuern (bAV) bzw.
            mit ihrem Ertrag (private Rentenversicherung). Eine Modellrechnung, keine Empfehlung für ein
            Produkt oder einen Anbieter.
          </Text>
        </Seite>
      )}
    </>
  );
}

/** Die Namen der Bausteine als Aufzaehlung: „A, B und C". */
const aufgezaehlt = (namen: string[]) => (namen.length < 2
  ? namen.join('')
  : `${namen.slice(0, -1).join(', ')} und ${namen[namen.length - 1]}`);

/** Der Vorschlag auf einem Blatt: die Antworten, die Verteilung, die Gruende. */
function VorschlagSeite({ mix, wuensche, mitArbeitgeber, nettoHeute }: GedruckterVorschlag & { nettoHeute: number }) {
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
  return (
    <Seite titel={`${an.Dein()} Vorschlag`} nummer={`Wie sich ${euro(mix.nettoMonat)} im Monat verteilen`}>
      <Text>
        Der Vorschlag entsteht aus dem, was {an.dir} bei der Vorsorge wichtig ist, und aus {an.dein('em')} Beitrag
        {' '}— gerechnet mit {an.dein('em')} persönlichen Steuersatz, den Zulagen und dem Arbeitgeberzuschuss,
        zusätzlich zu dem, was {an.du} heute schon {an.w('einzahlst', 'einzahlt', 'einzahlen')}.
      </Text>

      <Untertitel>Was {an.dir} wichtig ist</Untertitel>
      <Tabelle kopf={['', 'Antwort']} spalten={[55, 45]} textSpalten={[1]}>
        {fragen.map((f) => (
          <Zeile key={f.id} textSpalten={[1]} zellen={[f.kurz, wunschAntwort(f.id, wuensche[f.id])]} />
        ))}
      </Tabelle>

      <div className="mt-3">
        <Ergebnis>
          {mix.dazuMonat >= 0.5 ? (
            <>
              Aus {cent(mix.nettoMonat)} netto im Monat werden <strong>{cent(mix.vertragMonat)}</strong>
              {' '}{teile.length > 1 ? 'in den Verträgen' : 'im Vertrag'}: {aufgezaehlt(teile.map((x) => MIX_NAME[x.id]))}.
            </>
          ) : (
            <>{cent(mix.nettoMonat)} im Monat, frei verfügbar und ohne Bindung: {aufgezaehlt(teile.map((x) => MIX_NAME[x.id]))}.</>
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

      <Untertitel>Warum diese Mischung</Untertitel>
      <ul className="space-y-0.5 text-[11px] leading-relaxed text-ui-schiefer">
        {teile.map((x) => (
          <li key={x.id}><strong className="text-ui-tinte">{MIX_NAME[x.id]}:</strong> {mixGrund(x, mix, wuensche, an)}</li>
        ))}
        {mix.ausgelassen.map((a) => (
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

      <Text>
        Der Vorschlag folgt festen Regeln: Was verfügbar bleiben soll, fließt in die private Vorsorge; der Rest
        dorthin, wo Zulagen, Arbeitgeberzuschuss oder Steuervorteile dazukommen, jeweils bis zum geförderten Rahmen.
        Was im Alter netto ankommt, hängt am Angebot. Eine Modellrechnung, keine Empfehlung für ein Produkt oder
        einen Anbieter.
      </Text>
    </Seite>
  );
}
