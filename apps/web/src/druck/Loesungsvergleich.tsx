import { Fragment } from 'react';
import type { Loesung, LoesungsVorgabe } from '@renten/engine';
import { euro, euroGenau, prozent } from '../components/Feld';
import type { AngebotPosition } from '../features/tuev-berechnung';
import { Seite, Tabelle, Zeile, Gruppenzeile, Untertitel, Text } from './Bausteine';

/**
 * „Lösungen im Vergleich" — die letzte Etappe der Beratung auf Papier.
 *
 * Oben die Einzahlseite je Loesung, unten die erfassten Angebote mit Rente
 * netto und Rendite. Dieselben Rechnungen wie am Bildschirm
 * (`loesungsvergleich`, `angebotPositionen`); hier wird nichts neu gerechnet.
 */

const zahl = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cent = (n: number) => euroGenau(Math.round(n * 100) / 100);
/** Ein Posten, den es bei dieser Loesung nicht gibt, als Strich statt „0 €". */
const posten = (n: number) => (n < 0.005 ? '—' : cent(n));

const LOESUNG_KURZ: Record<AngebotPosition['angebot']['loesung'], string> = {
  avd: 'Altersvorsorgedepot', bav: 'Betriebsrente', basis: 'Basisrente', privat: 'Private Rente',
};

/**
 * Spaltenkopf mit weichen Trennstellen: "Altersvorsorgedepot" ist laenger als
 * eine Spalte breit und lief sonst in die Nachbarspalte.
 */
const kopfVon = (titel: string) => titel.replace('Altersvorsorgedepot', 'Alters\u00advorsorge\u00addepot');

/** Hoechstens vier Angebote nebeneinander — mehr Spalten passen nicht auf A4 hochkant. */
const JE_TABELLE = 4;

export function Loesungsvergleich({ loesungen, vorgabe, betragMonat, angebote }: {
  loesungen: Loesung[];
  /** Wie am Bildschirm: Netto-Aufwand oder Beitrag vorgegeben */
  vorgabe: LoesungsVorgabe;
  betragMonat: number;
  angebote: AngebotPosition[];
}) {
  const brutto = vorgabe === 'brutto';
  const sichtbar = loesungen.filter((l) => l.verfuegbar);
  const gerechnet = angebote.filter((a) => a.rente || a.kapital);
  const gruppen: AngebotPosition[][] = [];
  for (let i = 0; i < gerechnet.length; i += JE_TABELLE) gruppen.push(gerechnet.slice(i, i + JE_TABELLE));
  /** Die hoechste Nettorendite eines Angebots ueber beide Wege — wie am Bildschirm. */
  const besteVon = (a: AngebotPosition) => Math.max(a.rente?.rendite ?? -Infinity, a.kapital?.rendite ?? -Infinity);
  const beste = gerechnet.reduce((m, a) => Math.max(m, besteVon(a)), -Infinity);
  const stern = (a: AngebotPosition, rendite: number) =>
    gerechnet.length > 1 && Math.abs(besteVon(a) - beste) < 1e-9 && Math.abs(rendite - beste) < 1e-9 ? ' ★' : '';
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
            ? <>Je Lösung derselbe Beitrag von {euro(betragMonat)} im Monat, was er Sie nach Steuer- und
              Abgabenersparnis wirklich kostet und was damit im Vertrag landet</>
            : <>Je Lösung der Beitrag, der Sie nach Steuer- und Abgabenersparnis {euro(betragMonat)} im Monat
              kostet, und was damit im Vertrag landet</>}
          {' '}— mit Ihrem persönlichen Steuersatz, den Zulagen und dem Arbeitgeberzuschuss. Gerechnet zusätzlich
          zu dem, was Sie heute schon einzahlen.
        </Text>

        <div className="mt-3">
          <Tabelle kopf={['', ...sichtbar.map((l) => kopfVon(l.titel))]} spalten={[36, ...sichtbar.map(() => breite)]}>
            {brutto ? (
              <>
                <Zeile fett zellen={['Ihr Beitrag (bAV: Bruttoumwandlung)', ...sichtbar.map((l) => cent(l.eigenbeitragMonat))]} />
                <Zeile zellen={['− Steuerersparnis', ...sichtbar.map((l) => posten(l.steuerErsparnisMonat))]} />
                <Zeile zellen={['− Sozialabgaben gespart', ...sichtbar.map((l) => posten(l.svErsparnisMonat))]} />
                <Zeile fett zellen={['= Kostet Sie netto', ...sichtbar.map((l) => cent(l.nettoMonat))]} />
                <Gruppenzeile text="Im Vertrag" spalten={sichtbar.length + 1} />
                <Zeile zellen={['Ihr Beitrag', ...sichtbar.map((l) => cent(l.eigenbeitragMonat))]} />
              </>
            ) : (
              <>
                <Zeile zellen={['Ihr Netto-Aufwand', ...sichtbar.map((l) => cent(l.nettoMonat))]} />
                <Zeile zellen={['+ Steuerersparnis', ...sichtbar.map((l) => posten(l.steuerErsparnisMonat))]} />
                <Zeile zellen={['+ Sozialabgaben gespart', ...sichtbar.map((l) => posten(l.svErsparnisMonat))]} />
                <Zeile fett zellen={['= Ihr Beitrag (bAV: Bruttoumwandlung)', ...sichtbar.map((l) => cent(l.eigenbeitragMonat))]} />
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
        <ul className="space-y-0.5 text-[11px] leading-relaxed text-slate-600">
          {sichtbar.map((l) => (
            <li key={l.id}><strong className="text-slate-800">{l.titel}:</strong> {l.besteuerung}</li>
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
        <Seite titel="Ihre Angebote im Vergleich" nummer="Rente und Kapital netto">
          <Text>
            Die Rente laut Angebot, nach Steuer und Kranken- und Pflegeversicherung im ersten
            Rentenjahr, gegen den Netto-Aufwand in der Ansparphase — und, wo das Angebot sie nennt, die
            Kapitalabfindung nach Steuer im Zuflussjahr und Krankenversicherung. Die Nettorendite ist der
            interne Zinsfuß aller Netto-Zahlungen bis zur angenommenen Lebenserwartung.
          </Text>
          {gruppen.map((g, gi) => (
            <Fragment key={gi}>
              <div className="mt-3">
                <Tabelle
                  kopf={['', ...g.map((a, i) => `${gi * JE_TABELLE + i + 1}. ${a.angebot.name || LOESUNG_KURZ[a.angebot.loesung]}`)]}
                  spalten={[36, ...g.map(() => 64 / g.length)]}
                >
                  {(() => {
                    const r = (f: (x: NonNullable<AngebotPosition['rente']>) => string) =>
                      g.map((a) => (a.rente ? f(a.rente) : '—'));
                    const k = (f: (x: NonNullable<AngebotPosition['kapital']>) => string) =>
                      g.map((a) => (a.kapital ? f(a.kapital) : '—'));
                    const e = (a: AngebotPosition) => (a.rente ?? a.kapital)!;
                    const mitRente = g.some((a) => a.rente);
                    const mitKapital = g.some((a) => a.kapital);
                    const mitVergleich = g.some((a) => a.breakEven);
                    const spalten = g.length + 1;
                    return (
                      <>
                        <Zeile zellen={['Kostet Sie netto im Monat', ...g.map((a) => euro(e(a).echterAufwandMonat))]} />
                        <Zeile zellen={['Fließt in den Vertrag', ...g.map((a) => euro(e(a).beitragMonat + e(a).zulageMonat))]} />
                        {mitRente && (
                          <>
                            <Gruppenzeile text="Als Rente" spalten={spalten} />
                            <Zeile zellen={['Rente brutto', ...r((x) => euro(x.bruttoRenteMonat))]} />
                            <Zeile fett zellen={['Rente netto', ...r((x) => euro(x.nettoRenteMonat))]} />
                            <Zeile zellen={['Netto-Rente je 100 € Aufwand', ...r((x) => (x.echterAufwandMonat > 0
                              ? cent(x.nettoRenteMonat / x.echterAufwandMonat * 100) : '—'))]} />
                            <Zeile zellen={['Netto-Hebel', ...r((x) => `${zahl(x.nettoHebel)} ×`)]} />
                            <Zeile fett zellen={['Nettorendite p. a.', ...g.map((a) => (a.rente
                              ? `${prozent(a.rente.rendite, 2)}${stern(a, a.rente.rendite)}` : '—'))]} />
                            <Zeile zellen={['Amortisation ab Rentenbeginn', ...r((x) => `${jahre(x.amortisationsJahre)} Jahre`)]} />
                          </>
                        )}
                        {mitKapital && (
                          <>
                            <Gruppenzeile text="Als Kapital" spalten={spalten} />
                            <Zeile zellen={['Kapital brutto', ...k((x) => euro(x.bruttoKapital))]} />
                            <Zeile zellen={['− Steuer im Zuflussjahr', ...k((x) => euro(x.steuerKapital))]} />
                            <Zeile zellen={['− Kranken- und Pflegeversicherung', ...k((x) => euro(x.kvPvKapital))]} />
                            <Zeile fett zellen={['Kapital netto', ...k((x) => euro(x.nettoKapital))]} />
                            <Zeile fett zellen={['Nettorendite p. a.', ...g.map((a) => (a.kapital
                              ? `${prozent(a.kapital.rendite, 2)}${stern(a, a.kapital.rendite)}` : '—'))]} />
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
          {gerechnet.length > 1 && <Text>★ die höchste Nettorendite.</Text>}
          <Text>
            Die Steuer im Alter ist anteilig an der Steuer des Haushalts gerechnet, wie auf der Seite zu den
            Renteneinkünften. Eine Kapitalabfindung ist im Jahr des Zuflusses voll zu versteuern (bAV) bzw.
            mit ihrem Ertrag (private Rentenversicherung). Eine Modellrechnung, keine Empfehlung für ein
            Produkt oder einen Anbieter.
          </Text>
        </Seite>
      )}
    </>
  );
}
