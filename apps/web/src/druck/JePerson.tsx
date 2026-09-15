import { jePerson, type Jahreszeile, type Szenario } from '@renten/engine';
import { euro } from '../components/Feld';
import { Seite, Untertitel, Tabelle, Zeile, Gruppenzeile, Text } from './Bausteine';
import { personNameAus } from '../features/personen';

/**
 * "Die Versorgung beider Partner" — dieselbe Jahreszeile, nach Inhaber
 * aufgeteilt statt nach Schicht.
 *
 * WARUM EINE EIGENE SEITE UND KEIN KASTEN UNTER DER TABELLE: Genau so war es
 * zuerst gebaut. Nachgemessen hatte die Seite "Ihre Renteneinkuenfte" bei
 * einem Paar mit fuenf Vertraegen aber nur noch 84 von 979 Punkten frei, und
 * der Block brauchte selbst in der schlanksten Fassung rund 150. Er brach die
 * Seite auf 1 042 Punkte um. Eine eigene Seite kostet Papier, eine
 * umbrechende Tabelle kostet Vertrauen.
 *
 * Gerechnet wird hier nichts: `jePerson` gruppiert, was die Zeitachse ohnehin
 * je Posten ausweist.
 */
export function JePersonSeite({
  zeile, szenario,
}: {
  zeile: Jahreszeile;
  szenario: Szenario;
}) {
  const bloecke = jePerson(zeile);
  const monat = (n: number) => euro(n / 12);
  const name = (p: string | null) =>
    p === null ? 'Haushalt' : personNameAus(szenario.personen, p);

  return (
    <Seite
      titel={`Die Versorgung beider Partner im Jahr ${zeile.jahr}`}
      nummer="Dieselben Zahlen, nach Inhaber statt nach Schicht"
    >
      <Tabelle
        kopf={['Einkunft', 'Brutto', 'KV/PV', 'Steuer', 'Netto']}
        spalten={[40, 15, 15, 15, 15]}
      >
        {bloecke.flatMap((b) => [
          <Gruppenzeile key={`g${b.person ?? 'h'}`} text={name(b.person)} spalten={5} />,
          ...b.posten.map((x) => (
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
          <Zeile
            key={`s${b.person ?? 'h'}`}
            fett
            zellen={[
              `Summe ${name(b.person)}`,
              monat(b.bruttoJahr),
              `− ${monat(b.kvPvJahr)}`,
              `− ${monat(b.steuerJahr)}`,
              monat(b.nettoJahr),
            ]}
          />,
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

      <Untertitel>Was diese Aufteilung sagt — und was nicht</Untertitel>
      <Text>
        <strong>Die Steuer je Person ist ein Anteil, keine eigene Rechnung.</strong> Verheiratete
        werden zusammen veranlagt (§ 26b EStG, Splittingtarif); die gemeinsame Steuer ist hier
        nach dem Beitrag zum zu versteuernden Einkommen aufgeteilt. Allein veranlagt zahlte jeder
        von beiden mehr — der Splittingvorteil entsteht nur gemeinsam und gehört beiden. Die
        Zeilen beantworten also die Frage „woher kommt welcher Euro", nicht die Frage „was bliebe
        mir allein".
      </Text>
      <Text>
        <strong>Die Beiträge dagegen sind echte Einzelrechnungen.</strong>{' '}
        Beitragsbemessungsgrenze, Versorgungsfreibetrag und Mindestbemessung stehen jedem
        Mitglied einmal zu und sind je Person gerechnet. Wer keine oder nur geringe eigene
        Einkünfte hat, ist als Ehegatte beitragsfrei mitversichert (§ 10 SGB V) — dort steht
        deshalb null und kein Mindestbeitrag.
      </Text>
      {bloecke.some((b) => b.person === null) && (
        <Text>
          Unter <strong>Haushalt</strong> steht, was sich keiner Person zuordnen lässt — der
          Entnahmeplan etwa gehört beiden gemeinsam.
        </Text>
      )}
      <Text>
        Das Versorgungsziel bleibt aus demselben Grund eine Größe des Haushalts: Miete, Strom und
        Lebensmittel fallen einmal an, nicht zweimal. Die Versorgungslücke auf der vorigen Seite
        gilt deshalb für Sie beide zusammen.
      </Text>
    </Seite>
  );
}
