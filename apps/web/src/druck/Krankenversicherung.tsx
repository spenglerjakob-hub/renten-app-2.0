import { ZUSCHLAG_BIS_ALTER, DAEMPFUNG_AB_ALTER } from '@renten/engine';
import { euro, prozent } from '../components/Feld';
import type { PkvErgebnis } from '../features/pkv-berechnung';
import { LEBENSERWARTUNG } from '../features/pkv-berechnung';
import { Seite, Untertitel, Tabelle, Zeile, GrosseZahl, Text } from './Bausteine';

/**
 * "Ihre Krankenversicherung im Alter" — nur bei privat Versicherten.
 *
 * Sie beantwortet die Frage, die ein PKV-Versicherter zuerst stellt und auf
 * die das Gutachten bisher keine Antwort hatte: was kostet mich die
 * Versicherung dann? Der Rechner nahm die heutige Praemie als feste Groesse
 * durch alle Jahrzehnte.
 */
export function Krankenversicherung({
  ergebnis, steigerung, inflation, zielNettoMonat,
}: {
  ergebnis: PkvErgebnis;
  steigerung: number;
  /** Zum Abzinsen der Spalte "in heutigem Geld" */
  inflation: number;
  zielNettoMonat: number;
}) {
  const r = ergebnis;
  const jetzt = new Date().getFullYear();
  // Abgezinst wird mit der INFLATION, nicht mit der Beitragssteigerung: die
  // Frage ist, was der Beitrag dann in heutigem Geld wiegt.
  const heutigesGeld = (betrag: number, jahr: number) =>
    betrag / Math.pow(1 + inflation, jahr - jetzt);

  /* Jede zehnte Zeile: eine Tabelle ueber vierzig Jahre passt sonst nicht
     auf die Seite, und die Aussage steckt in den Stuetzstellen. Die Jahre um
     die Stufe herum kommen ausdruecklich dazu — sonst versteckte die Auswahl
     genau das, was die Seite erklaert. */
  const stuetzstellen = r.verlauf.filter(
    (x) => x.alter % 10 === 0
      || x.alter === ZUSCHLAG_BIS_ALTER
      || x.alter === ZUSCHLAG_BIS_ALTER + 1
      || x.alter === r.alterBeiRentenbeginn,
  );

  return (
    <Seite
      titel={`Die Krankenversicherung von ${ergebnis.person} im Alter`}
      nummer={`Privat versichert · ${prozent(steigerung)} angenommene Steigerung`}
    >
      <div className="grid grid-cols-3 gap-3">
        <GrosseZahl
          titel="Heute"
          wert={euro(r.heute.gesamtMonat)}
          hinweis={r.zuschussHeute > 0
            ? `im Monat · davon ${euro(r.zuschussHeute)} vom Arbeitgeber`
            : 'im Monat'}
        />
        <GrosseZahl
          titel={`Bei Rentenbeginn ${r.rentenjahr}`}
          wert={euro(r.beiRente.praemieMonat)}
          ton="schlecht"
          hinweis={`in heutigem Geld ${euro(r.beiRenteHeutigesGeld)}`}
        />
        {r.mitAchtzig && (
          <GrosseZahl
            titel="Mit 80"
            wert={euro(r.mitAchtzig.praemieMonat)}
            hinweis={`in heutigem Geld ${euro(r.mitAchtzigHeutigesGeld)}`}
          />
        )}
      </div>

      <Text>
        <strong>Warum diese Seite überhaupt steht.</strong> Ihr Beitrag wächst, Ihre Rente wächst,
        und beide tun es nicht im gleichen Tempo. Ein Beitrag von{' '}
        {euro(r.heute.gesamtMonat)} heute ist bei {prozent(steigerung)} Steigerung im Jahr{' '}
        {r.rentenjahr} bei {euro(r.beiRente.praemieMonat)} — das sind{' '}
        <strong>{prozent(r.anteilAmZiel, 0)}</strong> Ihres dann gewünschten Nettos von{' '}
        {euro(zielNettoMonat)}. Diese Zahl steckt bereits in der Versorgungslücke dieses
        Gutachtens.
      </Text>

      <Untertitel>Wie sich der Beitrag entwickelt</Untertitel>
      <Tabelle
        kopf={['Alter', 'Jahr', 'Beitrag im Monat', 'In heutigem Geld']}
        spalten={[16, 20, 32, 32]}
      >
        {stuetzstellen.map((x) => (
          <Zeile
            key={x.jahr}
            fett={x.alter === r.alterBeiRentenbeginn}
            zellen={[
              String(x.alter),
              String(x.jahr),
              euro(x.praemieMonat),
              euro(heutigesGeld(x.praemieMonat, x.jahr)),
            ]}
          />
        ))}
      </Tabelle>

      <Untertitel>Was das Gesetz vorgibt und was angenommen ist</Untertitel>
      <Text>
        <strong>Der Zuschlag entfällt mit {ZUSCHLAG_BIS_ALTER + 1}, nicht mit 65.</strong> Der
        gesetzliche Zuschlag von 10 % wird bis zum Kalenderjahr Ihres {ZUSCHLAG_BIS_ALTER}.
        Geburtstags erhoben (§ 149 VAG); danach fällt er weg, der Beitrag sinkt einmalig um gut
        9 %. Der verbreitete Satz „mit 65 fallen 10 % weg" verwechselt zwei Vorschriften.
      </Text>
      <Text>
        <strong>Ab {DAEMPFUNG_AB_ALTER} sinkt der Beitrag nicht.</strong> Die aus dem Zuschlag
        angesammelten Mittel werden ab dann verwendet, um <em>Erhöhungen zu finanzieren</em>
        {' '}(§ 150 Abs. 3 VAG) — der Beitrag steigt also langsamer weiter, er fällt nicht. Erst
        ab 80 mindern nicht verbrauchte Mittel den Beitrag selbst. Diese letzte Stufe ist hier{' '}
        <strong>nicht</strong> gerechnet: das Gesetz schreibt den Mechanismus vor, nicht den
        Betrag. Die Rechnung fällt insoweit eher zu vorsichtig aus.
      </Text>
      <Text>
        <strong>Die beiden Steigerungssätze sind Annahmen</strong>, keine Rechtsgrößen — sie
        stehen in Ihren Angaben und lassen sich ändern. Historisch lagen die Beiträge der privaten
        Krankenversicherung über der allgemeinen Inflation, mit starken Sprüngen statt gleichmäßiger
        Schritte.
      </Text>

      {r.bet && r.betNetto && (() => {
        const bet = r.bet;
        const n = r.betNetto;
        const alter = (x: number | null) =>
          x !== null ? `${x.toLocaleString('de-DE', { maximumFractionDigits: 0 })} Jahren` : 'nie';
        return (
          <>
            <Untertitel>Ihr Beitragsentlastungstarif</Untertitel>
            {/* Brutto aus dem Vertrag, netto nach Arbeitgeberzuschuss und
                Steuer — dieselbe Rechnung wie am Bildschirm. */}
            <Tabelle kopf={['', 'Brutto', 'Netto']} spalten={[52, 24, 24]}>
              <Zeile zellen={['Beitrag heute im Monat', euro(n.beitragMonat), euro(n.aufwandMonat)]} />
              <Zeile zellen={[
                `Ab ${r.betAbAlter} im Monat gespart`,
                euro(n.entlastungMonat - n.restbeitragMonat), euro(n.ersparnisMonat),
              ]} />
              <Zeile zellen={[`Eingezahlt über ${bet.jahreEinzahlung} Jahre`, euro(bet.eingezahlt), euro(n.eingezahlt)]} />
              <Zeile zellen={[
                `Erspart bis Alter ${LEBENSERWARTUNG}`, euro(bet.erspart - bet.restbeitrag), euro(n.erspart),
              ]} />
              <Zeile fett zellen={['Getragen hat er sich mit', alter(bet.breakEvenAlter), alter(n.breakEvenAlter)]} />
            </Tabelle>
            {/* Knapp: Die Seite ist ohne diesen Block schon fast voll, und
                die Herleitung steht ausfuehrlich am Bildschirm. */}
            <Text>
              <strong>Netto</strong> nach{n.agMonat >= 0.5 ? ` ${euro(n.agMonat)} AG-Zuschuss,` : ''} Steuer
              ({prozent(n.steuersatzHeute, 0)} heute, {prozent(n.steuersatzRuhestand, 0)} im Ruhestand)
              und {euro(n.restbeitragMonat)} Restbeitrag ab {r.betAbAlter}; nominal addiert.
            </Text>
          </>
        );
      })()}

      <Text>
        In der privaten Krankenversicherung fallen auf <strong>keine</strong> Ihrer übrigen
        Alterseinkünfte Kranken- und Pflegebeiträge an — nicht auf eine Basisrente, nicht auf eine
        private Rente, nicht auf Entnahmen aus einem Depot. Das ist der Gegenposten zu diesem
        Beitrag und in den Zahlen dieses Gutachtens bereits berücksichtigt.
      </Text>
    </Seite>
  );
}
