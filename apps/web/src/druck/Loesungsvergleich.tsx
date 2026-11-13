import { Fragment } from 'react';
import type { Loesung, LoesungId, LoesungsVorgabe } from '@renten/engine';
import { euro, euroGenau, prozent } from '../components/Feld';
import {
  auszeichnungen, besteAngebote, besteAngeboteText, ohneEigenaufwand, LOESUNG_KURZ, ohneEigenaufwandText,
  type AngebotPosition,
} from '../features/tuev-berechnung';
import { Seite, Tabelle, Zeile, Gruppenzeile, Untertitel, Text, Abzeichen, Ergebnis } from './Bausteine';
import { anteilAmNetto, anteilAnLuecke } from '../features/bezug';
import { useAnsprache } from '../components/Ansprache';
import { mitTrennstellen } from '../lib/trennstellen';

/**
 * „Lösungen im Vergleich" — die vierte Etappe der Beratung auf Papier.
 *
 * Oben die Einzahlseite je Loesung, unten die erfassten Angebote mit Rente
 * netto und Rendite. Dieselben Rechnungen wie am Bildschirm
 * (`loesungsvergleich`, `angebotPositionen`); hier wird nichts neu gerechnet.
 *
 * DAS ERGEBNIS STEHT VORN: ein Satz mit der Marke „Ergebnis“ ueber der
 * Tabelle und die Marke „★ Meiste“ ueber der Spalte darin — dieselbe
 * Auszeichnung wie am Bildschirm (`auszeichnungen`), damit man es nicht aus
 * den Zahlen herauslesen muss.
 */

const zahl = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cent = (n: number) => euroGenau(Math.round(n * 100) / 100);
/** Ein Posten, den es bei dieser Loesung nicht gibt, als Strich statt „0 €". */
const posten = (n: number) => (n < 0.005 ? '—' : cent(n));

/** Fuer den Ergebnissatz — mit Artikel, damit er sich liest. */
const MIT_ARTIKEL: Record<LoesungId, string> = {
  avd: 'das Altersvorsorgedepot',
  bav: 'die Betriebsrente (Entgeltumwandlung)',
  basis: 'die Basisrente (Rürup)',
  privat: 'die private Rente bzw. das Depot',
};
const namen = (liste: Loesung[]) => liste.map((l) => MIT_ARTIKEL[l.id]).join(' und ');

/**
 * Spaltenkopf mit weichen Trennstellen: "Altersvorsorgedepot" und
 * "(Entgeltumwandlung)" sind laenger als eine Spalte breit und liefen sonst
 * in die Nachbarspalte.
 */
const kopfVon = mitTrennstellen;

/** Hoechstens vier Angebote nebeneinander — mehr Spalten passen nicht auf A4 hochkant. */
const JE_TABELLE = 4;

export function Loesungsvergleich({ loesungen, vorgabe, betragMonat, angebote, nettoHeute = 0, mitRenteneinkuenften = true }: {
  loesungen: Loesung[];
  /** Wie am Bildschirm: Netto-Aufwand oder Beitrag vorgegeben */
  vorgabe: LoesungsVorgabe;
  betragMonat: number;
  angebote: AngebotPosition[];
  /** Das heutige Haushaltsnetto im Monat — die Bezugsgroesse fuer den Aufwand */
  nettoHeute?: number;
  /** Steht die Seite zu den Renteneinkünften im selben Ausdruck? Nur dann der Verweis darauf. */
  mitRenteneinkuenften?: boolean;
}) {
  const an = useAnsprache();
  const brutto = vorgabe === 'brutto';
  const sichtbar = loesungen.filter((l) => l.verfuegbar);
  const auszeichnung = auszeichnungen(loesungen, brutto);
  const meiste = sichtbar.filter((l) => auszeichnung.meiste.includes(l.id));
  const guenstigste = sichtbar.filter((l) => auszeichnung.guenstigste.includes(l.id));
  const markiert = sichtbar.flatMap((l, i) => (meiste.includes(l) || guenstigste.includes(l) ? [i + 1] : []));
  const dieselben = meiste.length === guenstigste.length && meiste.every((l) => guenstigste.includes(l));
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

  const breite = sichtbar.length > 0 ? 64 / sichtbar.length : 64;
  return (
    <>
      <Seite
        titel="Lösungen im Vergleich"
        nummer={brutto ? `Was ${euro(betragMonat)} Beitrag im Monat netto kosten` : `Was aus ${euro(betragMonat)} netto im Monat wird`}
      >
        <Text>
          {brutto
            ? <>Je Lösung derselbe Beitrag von {euro(betragMonat)} im Monat, was er {an.dich} nach Steuer- und
              Abgabenersparnis wirklich kostet und was damit im Vertrag landet</>
            : <>Je Lösung der Beitrag, der {an.dich} nach Steuer- und Abgabenersparnis {euro(betragMonat)} im Monat
              kostet, und was damit im Vertrag landet</>}
          {' '}— mit {an.dein('em')} persönlichen Steuersatz, den Zulagen und dem Arbeitgeberzuschuss. Gerechnet zusätzlich
          zu dem, was {an.du} heute schon {an.w('einzahlst', 'einzahlt', 'einzahlen')}.
        </Text>

        {!brutto && meiste[0] && (
          <Ergebnis>
            Am meisten aus {an.dein('em')} Netto-Aufwand {meiste.length > 1 ? 'machen' : 'macht'} <strong>{namen(meiste)}</strong>:
            {' '}aus {cent(meiste[0].nettoMonat)} netto im Monat werden <strong>{cent(meiste[0].vertragMonat)}</strong> im
            Vertrag — <strong>{zahl(meiste[0].hebel)}-mal</strong> so viel.
          </Ergebnis>
        )}
        {brutto && (guenstigste[0] || meiste[0]) && (
          <Ergebnis>
            {guenstigste[0] && (
              <>
                Am günstigsten {guenstigste.length > 1 ? 'sind' : 'ist'} <strong>{namen(guenstigste)}</strong>:
                {' '}{euro(betragMonat)} Beitrag kosten {an.dich} netto nur <strong>{cent(guenstigste[0].nettoMonat)}</strong> im Monat.
              </>
            )}
            {meiste[0] && (guenstigste[0] && dieselben
              ? <> Dort landet auch je Netto-Euro am meisten im Vertrag: <strong>{zahl(meiste[0].hebel)}-mal</strong> {an.dein()} Netto-Aufwand.</>
              : <>
                  {guenstigste[0] ? ' ' : ''}Am meisten je Netto-Euro {meiste.length > 1 ? 'bringen' : 'bringt'}{' '}
                  <strong>{namen(meiste)}</strong>: {cent(meiste[0].vertragMonat)} im Vertrag,{' '}
                  <strong>{zahl(meiste[0].hebel)}-mal</strong> {an.dein()} Netto-Aufwand.
                </>)}
          </Ergebnis>
        )}

        <div className="mt-3">
          <Tabelle
            kopf={['', ...sichtbar.map((l) => (
              <>
                {kopfVon(l.titel)}
                {meiste.includes(l) && <Abzeichen>★ Meiste</Abzeichen>}
                {guenstigste.includes(l) && <Abzeichen>Günstigste</Abzeichen>}
              </>
            ))]}
            spalten={[36, ...sichtbar.map(() => breite)]}
            markiert={markiert}
          >
            {brutto ? (
              <>
                <Zeile fett zellen={[`${an.Dein()} Beitrag (bAV: Bruttoumwandlung)`, ...sichtbar.map((l) => cent(l.eigenbeitragMonat))]} />
                <Zeile zellen={['− Steuerersparnis', ...sichtbar.map((l) => posten(l.steuerErsparnisMonat))]} />
                <Zeile zellen={['− Sozialabgaben gespart', ...sichtbar.map((l) => posten(l.svErsparnisMonat))]} />
                <Zeile fett zellen={[`= Kostet ${an.dich} netto`, ...sichtbar.map((l) => cent(l.nettoMonat))]} />
                <Gruppenzeile text="Im Vertrag" spalten={sichtbar.length + 1} />
                <Zeile zellen={[`${an.Dein()} Beitrag`, ...sichtbar.map((l) => cent(l.eigenbeitragMonat))]} />
              </>
            ) : (
              <>
                <Zeile zellen={[`${an.Dein()} Netto-Aufwand`, ...sichtbar.map((l) => cent(l.nettoMonat))]} />
                <Zeile zellen={['+ Steuerersparnis', ...sichtbar.map((l) => posten(l.steuerErsparnisMonat))]} />
                <Zeile zellen={['+ Sozialabgaben gespart', ...sichtbar.map((l) => posten(l.svErsparnisMonat))]} />
                <Zeile fett zellen={[`= ${an.Dein()} Beitrag (bAV: Bruttoumwandlung)`, ...sichtbar.map((l) => cent(l.eigenbeitragMonat))]} />
              </>
            )}
            <Zeile zellen={['+ Zulagen', ...sichtbar.map((l) => posten(l.zulageMonat))]} />
            <Zeile zellen={['+ Arbeitgeberzuschuss', ...sichtbar.map((l) => posten(l.agZuschussMonat))]} />
            <Zeile fett zellen={['= Im Vertrag', ...sichtbar.map((l) => cent(l.vertragMonat))]} />
            <Zeile zellen={['Je Euro Netto-Aufwand', ...sichtbar.map((l) => `${zahl(l.hebel)} ×`)]} />
          </Tabelle>
        </div>
        {sichtbar.some((l) => l.begrenzt) && (
          <Text>
            {sichtbar.filter((l) => l.begrenzt).map((l) => `${l.titel}: ${l.hinweise.join(' ')}`).join(' ')}
          </Text>
        )}

        <Untertitel>Im Alter</Untertitel>
        <ul className="space-y-0.5 text-[11px] leading-relaxed text-ui-schiefer">
          {sichtbar.map((l) => (
            <li key={l.id}><strong className="text-ui-tinte">{l.titel}:</strong> {l.besteuerung}</li>
          ))}
        </ul>
        {loesungen.filter((l) => !l.verfuegbar).map((l) => (
          <Text key={l.id}>{l.titel}: {l.hinweise[0]}</Text>
        ))}

        <Text>
          Eine Modellrechnung, keine Empfehlung für ein Produkt oder einen Anbieter.
        </Text>
      </Seite>

      {/*
        DIE ANGEBOTE AUF EIGENEM BLATT. Mit Rente UND Kapital braucht jedes
        Angebot rund siebzehn Zeilen; zusammen mit der Einzahlseite lief die
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
