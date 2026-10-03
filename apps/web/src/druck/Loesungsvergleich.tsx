import { Fragment } from 'react';
import type { Loesung } from '@renten/engine';
import { euro, euroGenau, prozent } from '../components/Feld';
import type { AngebotPosition } from '../features/tuev-berechnung';
import { Seite, Tabelle, Zeile, Untertitel, Text } from './Bausteine';

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

/** Hoechstens vier Angebote nebeneinander — mehr Spalten passen nicht auf A4 hochkant. */
const JE_TABELLE = 4;

export function Loesungsvergleich({ loesungen, nettoMonat, angebote }: {
  loesungen: Loesung[];
  nettoMonat: number;
  angebote: AngebotPosition[];
}) {
  const sichtbar = loesungen.filter((l) => l.verfuegbar);
  const gerechnet = angebote.filter((a) => a.ergebnis !== null);
  const gruppen: AngebotPosition[][] = [];
  for (let i = 0; i < gerechnet.length; i += JE_TABELLE) gruppen.push(gerechnet.slice(i, i + JE_TABELLE));
  const beste = gerechnet.reduce((m, a) => Math.max(m, a.ergebnis!.rendite), -Infinity);

  const breite = sichtbar.length > 0 ? 64 / sichtbar.length : 64;
  return (
    <Seite titel="Lösungen im Vergleich" nummer={`Was aus ${euro(nettoMonat)} netto im Monat wird`}>
      <Text>
        Je Lösung der Beitrag, der Sie nach Steuer- und Abgabenersparnis {euro(nettoMonat)} im Monat
        kostet, und was damit im Vertrag landet — mit Ihrem persönlichen Steuersatz, den Zulagen und dem
        Arbeitgeberzuschuss. Gerechnet zusätzlich zu dem, was Sie heute schon einzahlen.
      </Text>

      <div className="mt-3">
        <Tabelle kopf={['', ...sichtbar.map((l) => l.titel)]} spalten={[36, ...sichtbar.map(() => breite)]}>
          <Zeile zellen={['Ihr Netto-Aufwand', ...sichtbar.map((l) => cent(l.nettoMonat))]} />
          <Zeile zellen={['+ Steuerersparnis', ...sichtbar.map((l) => posten(l.steuerErsparnisMonat))]} />
          <Zeile zellen={['+ Sozialabgaben gespart', ...sichtbar.map((l) => posten(l.svErsparnisMonat))]} />
          <Zeile fett zellen={['= Ihr Beitrag (bAV: Bruttoumwandlung)', ...sichtbar.map((l) => cent(l.eigenbeitragMonat))]} />
          <Zeile zellen={['+ Zulagen', ...sichtbar.map((l) => posten(l.zulageMonat))]} />
          <Zeile zellen={['+ Arbeitgeberzuschuss', ...sichtbar.map((l) => posten(l.agZuschussMonat))]} />
          <Zeile fett zellen={['= Im Vertrag', ...sichtbar.map((l) => cent(l.vertragMonat))]} />
          <Zeile zellen={['Je Euro Netto-Aufwand', ...sichtbar.map((l) => `${zahl(l.hebel)} ×`)]} />
        </Tabelle>
      </div>

      <Untertitel>Im Alter</Untertitel>
      <ul className="space-y-0.5 text-[11px] leading-relaxed text-slate-600">
        {sichtbar.map((l) => (
          <li key={l.id}><strong className="text-slate-800">{l.titel}:</strong> {l.besteuerung}</li>
        ))}
      </ul>
      {loesungen.filter((l) => !l.verfuegbar).map((l) => (
        <Text key={l.id}>{l.titel}: {l.hinweise[0]}</Text>
      ))}

      {gruppen.length > 0 && (
        <>
          <Untertitel>Ihre Angebote</Untertitel>
          <Text>
            Die Rente laut Angebot, nach Steuer und Kranken- und Pflegeversicherung im ersten
            Rentenjahr, gegen den Netto-Aufwand in der Ansparphase. Die Nettorendite ist der interne
            Zinsfuß aller Netto-Zahlungen bis zur angenommenen Lebenserwartung.
          </Text>
          {gruppen.map((g, gi) => (
            <Fragment key={gi}>
              <div className="mt-3">
                <Tabelle
                  kopf={['', ...g.map((a, i) => `${gi * JE_TABELLE + i + 1}. ${a.angebot.name || LOESUNG_KURZ[a.angebot.loesung]}`)]}
                  spalten={[36, ...g.map(() => 64 / g.length)]}
                >
                  <Zeile zellen={['Kostet Sie netto im Monat', ...g.map((a) => euro(a.ergebnis!.echterAufwandMonat))]} />
                  <Zeile zellen={['Fließt in den Vertrag', ...g.map((a) => euro(a.ergebnis!.beitragMonat + a.ergebnis!.zulageMonat))]} />
                  <Zeile zellen={['Rente brutto', ...g.map((a) => euro(a.ergebnis!.bruttoRenteMonat))]} />
                  <Zeile fett zellen={['Rente netto', ...g.map((a) => euro(a.ergebnis!.nettoRenteMonat))]} />
                  <Zeile zellen={['Netto-Rente je 100 € Aufwand', ...g.map((a) => (a.ergebnis!.echterAufwandMonat > 0
                    ? cent(a.ergebnis!.nettoRenteMonat / a.ergebnis!.echterAufwandMonat * 100) : '—'))]} />
                  <Zeile zellen={['Netto-Hebel', ...g.map((a) => `${zahl(a.ergebnis!.nettoHebel)} ×`)]} />
                  <Zeile fett zellen={['Nettorendite p. a.', ...g.map((a) => `${prozent(a.ergebnis!.rendite, 2)}${
                    gerechnet.length > 1 && Math.abs(a.ergebnis!.rendite - beste) < 1e-9 ? ' ★' : ''}`)]} />
                  <Zeile zellen={['Amortisation ab Rentenbeginn', ...g.map((a) =>
                    `${a.ergebnis!.amortisationsJahre.toLocaleString('de-DE', { maximumFractionDigits: 1 })} Jahre`)]} />
                </Tabelle>
              </div>
            </Fragment>
          ))}
          {gerechnet.length > 1 && <Text>★ die höchste Nettorendite.</Text>}
        </>
      )}

      <Text>
        Die Steuer im Alter ist anteilig an der Steuer des Haushalts gerechnet, wie auf der Seite zu den
        Renteneinkünften. Eine Modellrechnung, keine Empfehlung für ein Produkt oder einen Anbieter.
      </Text>
    </Seite>
  );
}
