import type { ProjektionsErgebnis, Jahreszeile } from '@renten/engine';
import { euro, prozent } from '../components/Feld';
import { SCHICHT_TITEL } from '../features/vertragsarten';
import {
  Seite, Untertitel, Angabe, Zweispaltig, Tabelle, Zeile, Gruppenzeile,
  GrosseZahl, Text,
} from './Bausteine';

/**
 * "Ihre Renteneinkuenfte" — woraus sich das Netto zusammensetzt.
 *
 * WARUM EIGENS GEBAUT: An dieser Stelle stand der Kassenbon des Bildschirms.
 * Der besteht aus Klappknoepfen, Schatten, runden Karten und Schichtfarben —
 * auf Papier sieht die Seite dadurch aus wie die Anwendung und nicht wie der
 * Gutachtenbogen daneben. Gerechnet wird nichts Eigenes: alle Zahlen stammen
 * aus derselben Jahreszeile, die auch der Bildschirm zeigt.
 *
 * Drei Kartenstapel werden zu EINER Tabelle mit Zwischenueberschriften.
 * Getrennte Tabellen richten ihre Spalten unabhaengig voneinander aus, und
 * das steht auf dem Papier sichtbar schief.
 */
export function Renteneinkuenfte({
  ergebnis, zeile, zielNettoHeute, inflation,
}: {
  ergebnis: ProjektionsErgebnis;
  zeile: Jahreszeile;
  /** Das gewuenschte Netto in HEUTIGER Kaufkraft, so wie es erfasst wurde */
  zielNettoHeute: number;
  inflation: number;
}) {
  const luecke = zeile.zielNettoMonat - zeile.nettoMonat;
  const gedeckt = zeile.zielNettoMonat > 0
    ? (zeile.nettoMonat / zeile.zielNettoMonat) * 100
    : 100;

  // Der Kaufkraftfaktor der Zeile rechnet einen Betrag des Jahres auf heutiges
  // Preisniveau zurueck. Beide Richtungen stehen damit bereits fest.
  const heute = (n: number) => n / zeile.kaufkraftfaktor;

  const nachSchicht = ([1, 2, 3] as const)
    .map((schicht) => ({
      schicht,
      posten: zeile.posten.filter((x) => x.schicht === schicht && (x.bruttoJahr !== 0 || x.kvPvJahr !== 0)),
    }))
    .filter((x) => x.posten.length > 0);

  const summe = (posten: Jahreszeile['posten'], feld: keyof Jahreszeile['posten'][number]) =>
    posten.reduce((s, x) => s + (x[feld] as number), 0);

  const monat = (n: number) => euro(n / 12);

  return (
    <Seite
      titel={`Ihre Renteneinkünfte im Jahr ${zeile.jahr}`}
      nummer={`Alter ${zeile.alterA} · Beträge des jeweiligen Jahres`}
    >
      <div className="grid grid-cols-3 gap-3">
        <GrosseZahl
          titel="Brutto im Monat"
          wert={monat(zeile.bruttoGesamt)}
          hinweis={`abzüglich ${monat(zeile.kvPvGesamt)} KV/PV und ${monat(zeile.steuerGesamt)} Steuer`}
        />
        <GrosseZahl
          titel="Netto im Monat"
          wert={euro(zeile.nettoMonat)}
          hinweis={`${gedeckt.toFixed(0)} % des Versorgungsziels`}
        />
        <GrosseZahl
          titel={luecke > 0 ? 'Versorgungslücke' : 'Über dem Ziel'}
          wert={euro(Math.abs(luecke))}
          ton={luecke > 0 ? 'schlecht' : 'gut'}
          hinweis={`in heutiger Kaufkraft ${euro(Math.abs(heute(luecke)))}`}
        />
      </div>

      {/*
        Das Versorgungsziel in BEIDEN Massstaeben. Erfasst wird es in heutiger
        Kaufkraft — auf dem Papier stand bisher nur der hochgerechnete Betrag,
        und der wirkt ohne den Bezugspunkt willkuerlich hoch.
      */}
      <Untertitel>Ihr Versorgungsziel — monatlich, in zwei Maßstäben</Untertitel>
      <div className="break-inside-avoid rounded-lg border border-slate-300 bg-slate-50 p-3">
        <div className="mb-1 grid grid-cols-2 gap-x-8 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          <span>In heutiger Kaufkraft</span>
          <span>Beträge des Jahres {zeile.jahr}</span>
        </div>
        <Zweispaltig>
          <Angabe feld="Gewünschtes Netto" wert={euro(zielNettoHeute)} />
          <Angabe feld="Gewünschtes Netto" wert={euro(zeile.zielNettoMonat)} />
          <Angabe feld="Erwartetes Netto" wert={euro(heute(zeile.nettoMonat))} />
          <Angabe feld="Erwartetes Netto" wert={euro(zeile.nettoMonat)} />
          <Angabe
            feld={luecke > 0 ? 'Es fehlen' : 'Darüber hinaus'}
            wert={euro(Math.abs(heute(luecke)))}
          />
          <Angabe
            feld={luecke > 0 ? 'Es fehlen' : 'Darüber hinaus'}
            wert={euro(Math.abs(luecke))}
          />
        </Zweispaltig>
        <div className="mt-3 flex items-center gap-2">
          {/* Blau wie auf dem Deckblatt — zwei Farben fuer dieselbe Zahl
              waeren zwei Aussagen ueber denselben Sachverhalt. */}
          <div className="h-2.5 flex-1 overflow-hidden rounded-full border border-slate-300 bg-white">
            <div
              className="h-full bg-blue-500"
              style={{ width: `${Math.min(100, Math.max(0, gedeckt))}%` }}
            />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            {gedeckt.toFixed(0)} % erreicht
          </span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
          Bei <strong>{prozent(inflation)}</strong> Inflation im Jahr kostet das, was heute{' '}
          {euro(zielNettoHeute)} kostet, im Jahr {zeile.jahr} rund{' '}
          <strong>{euro(zeile.zielNettoMonat)}</strong>. Beide Spalten sagen dasselbe — die linke
          in Geld von heute, die rechte in Geld des Rentenjahres.
        </p>
      </div>

      <Untertitel>Woraus sich das Netto zusammensetzt</Untertitel>
      <Tabelle
        kopf={['Einkunft', 'Brutto', 'KV/PV', 'Steuer', 'Netto']}
        spalten={[40, 15, 15, 15, 15]}
      >
        {nachSchicht.flatMap(({ schicht, posten }) => [
          <Gruppenzeile key={`s${schicht}`} text={SCHICHT_TITEL[schicht]} spalten={5} />,
          ...posten.map((x) => (
            <Zeile
              key={x.id}
              zellen={[
                x.bezeichnung,
                monat(x.bruttoJahr),
                x.kvPvJahr > 0 ? `− ${monat(x.kvPvJahr)}` : '—',
                x.steuerJahr > 0 ? `− ${monat(x.steuerJahr)}` : '—',
                monat(x.nettoJahr),
              ]}
            />
          )),
          ...(posten.length > 1
            ? [
                <Zeile
                  key={`sum${schicht}`}
                  fett
                  zellen={[
                    `Summe Schicht ${schicht}`,
                    monat(summe(posten, 'bruttoJahr')),
                    `− ${monat(summe(posten, 'kvPvJahr'))}`,
                    `− ${monat(summe(posten, 'steuerJahr'))}`,
                    monat(summe(posten, 'nettoJahr')),
                  ]}
                />,
              ]
            : []),
        ])}
        <Zeile
          fett
          zellen={[
            'Haushalt gesamt',
            monat(zeile.bruttoGesamt),
            `− ${monat(zeile.kvPvGesamt)}`,
            `− ${monat(zeile.steuerGesamt)}`,
            euro(zeile.nettoMonat),
          ]}
        />
      </Tabelle>

      {/*
        Einmalzahlungen stehen BEWUSST ausserhalb der Monatsrechnung. Sie in
        das Monatsnetto zu mischen liesse die Zahl im Rentenjahr sinnlos nach
        oben springen.
      */}
      {ergebnis.kapitalauszahlungen.length > 0 && (
        <>
          <Untertitel>Einmalige Kapitalauszahlungen</Untertitel>
          <div className="break-inside-avoid rounded-lg border border-slate-300 bg-slate-50 p-3">
            {ergebnis.kapitalauszahlungen.map((a) => (
              <div key={a.vertragId} className="mb-2 last:mb-0">
                <div className="mb-1 text-[12px] font-bold text-slate-800">
                  {a.bezeichnung} <span className="font-normal text-slate-500">· Zufluss {a.jahr}</span>
                </div>
                <Zweispaltig>
                  <Angabe feld="Kapital brutto" wert={euro(a.bruttoKapital)} />
                  <Angabe feld="− Steuer im Zuflussjahr" wert={euro(a.steuer)} />
                  {a.kvPvGesamt > 0 && (
                    <Angabe feld="− Kranken- und Pflegeversicherung" wert={euro(a.kvPvGesamt)} />
                  )}
                  <Angabe feld="Bleibt Ihnen" wert={euro(a.nettoKapital)} />
                </Zweispaltig>
              </div>
            ))}
            <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
              Einmalbeträge. Im monatlichen Netto oben sind sie <strong>nicht</strong> enthalten.
              Steuer und Beiträge gehen beim Zufluss ab; dass § 229 SGB V die Beiträge über
              120 Monate bemisst, ist eine Rechengröße und kein Zahlungsweg.
            </p>
          </div>
        </>
      )}

      {ergebnis.verrentungen.length > 0 && (
        <Text>
          <strong>Zu den verrenteten Kapitalauszahlungen.</strong>{' '}
          {ergebnis.verrentungen.map((v) => {
            const name = zeile.posten.find((x) => x.id === v.vertragId)?.bezeichnung
              ?? 'Kapitalauszahlung';
            return (
              <span key={v.vertragId}>
                Bei „{name}“ werden {euro(v.bruttoKapital)} auf einmal fällig und im Zuflussjahr
                mit {euro(v.steuerEinmal)} versteuert; die verbleibenden{' '}
                {euro(v.nettoKapital)} ergeben über {v.dauerJahre} Jahre bei{' '}
                {prozent(v.rendite)} Rendite {euro(v.bruttoMonat)} im Monat.{' '}
              </span>
            );
          })}
          Nach Ablauf dieser Jahre entfällt der Betrag — anders als eine lebenslange Rente ist ein
          Auszahlplan endlich.
        </Text>
      )}

      <Text>
        Alle Beträge sind Monatsbeträge des Jahres {zeile.jahr}, also das, was später auf dem
        Kontoauszug steht. Was sie in heutigem Geld wert sind, zeigt die Seite „Dieselben Zahlen in
        heutiger Kaufkraft“.
      </Text>
    </Seite>
  );
}
