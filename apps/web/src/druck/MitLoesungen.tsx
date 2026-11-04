import { versorgungsluecke, type Jahreszeile, type ProjektionsErgebnis } from '@renten/engine';
import { euro } from '../components/Feld';
import { NEU_TEXT } from '../features/Kassenbon';
import {
  LOESUNG_KURZ, ohneEigenaufwand, type AngebotPosition, type MitAngenommenen,
} from '../features/tuev-berechnung';
import { Seite, GrosseZahl, Untertitel, Tabelle, Zeile, Text } from './Bausteine';
import { Zusammensetzung } from './Renteneinkuenfte';

/**
 * „Ihr Ergebnis mit den gewählten Lösungen“ — die Etappe „Abschluss“ auf
 * Papier, in beiden Umfaengen, sobald etwas angenommen ist.
 *
 * Gerechnet wird nichts Neues: Die Zahlen kommen aus dem Ergebnis mit den
 * angenommenen Loesungen (`mitAngenommenen`), im selben Jahr wie die Seite
 * „Ihre Renteneinkünfte“ davor. Die Zeilen der Loesungen tragen die Marke
 * „Neu – bisher nicht enthalten“.
 */

/** Wie viel des Ziels das Netto deckt, hoechstens 100 %. */
const deckung = (z: Jahreszeile) => (z.zielNettoMonat > 0 ? Math.min(100, Math.round((z.nettoMonat / z.zielNettoMonat) * 100)) : 100);

const beitrag = (a: MitAngenommenen['loesungen'][number]['angebot']) => (a.loesung === 'bav'
  ? (a.beitragMonat > 0 ? `${euro(a.beitragMonat)} + AG ${euro(a.agZuschussMonat)}` : `AG ${euro(a.agZuschussMonat)}`)
  : euro(a.beitragMonat));

export function MitLoesungen({ vorher, nachher, ergebnisMit, mit, positionen, einzelperson, inhaberName }: {
  vorher: Jahreszeile;
  nachher: Jahreszeile;
  ergebnisMit: ProjektionsErgebnis;
  mit: MitAngenommenen;
  positionen: AngebotPosition[];
  einzelperson?: string;
  /** Bei Paaren im Haushalt: wem eine Loesung gehoert */
  inhaberName?: (id: 'A' | 'B') => string;
}) {
  const lueckeVorher = versorgungsluecke(vorher);
  const lueckeNachher = versorgungsluecke(nachher);
  const aufwand = (id: string) => {
    const p = positionen.find((x) => x.angebot.id === id);
    return p?.rente ?? p?.kapital ?? null;
  };
  const einmal = ergebnisMit.kapitalauszahlungen.filter((k) => mit.neu.has(k.vertragId));
  const spalten = inhaberName ? [30, 14, 18, 20, 18] : [36, 22, 22, 20];

  return (
    <Seite titel="Ihr Ergebnis mit den gewählten Lösungen" nummer={`Im Jahr ${nachher.jahr} · Beträge des jeweiligen Jahres`}>
      <Text>
        Dieselbe Rechnung wie auf der Seite „Ihre Renteneinkünfte“ — jetzt mit den Lösungen, für die
        {einzelperson ? ` ${einzelperson} sich` : ' Sie sich'} entschieden {einzelperson ? 'hat' : 'haben'}, gemeinsam
        gerechnet. Zeilen mit der Marke „{NEU_TEXT}“ sind in den Seiten davor nicht enthalten.
      </Text>

      <div className="mt-3 grid grid-cols-3 gap-3">
        <GrosseZahl
          titel="Netto im Monat"
          wert={euro(nachher.nettoMonat)}
          hinweis={`vorher ${euro(vorher.nettoMonat)} · ${deckung(nachher)} % des Ziels`}
        />
        {/* Hervorgehoben wie auf dem Deckblatt: die Luecke, die bleibt — oder dass keine bleibt. */}
        <GrosseZahl
          titel="Versorgungslücke"
          wert={lueckeNachher > 0 ? euro(lueckeNachher) : 'Gedeckt'}
          ton={lueckeNachher > 0 ? 'schlecht' : 'gut'}
          hinweis={`vorher ${lueckeVorher > 0 ? euro(lueckeVorher) : 'gedeckt'} im Monat`}
        />
        <GrosseZahl
          titel="Ziel erreicht"
          wert={`${deckung(nachher)} %`}
          hinweis={`vorher ${deckung(vorher)} %`}
        />
      </div>

      <Untertitel>Die gewählten Lösungen</Untertitel>
      <Tabelle
        kopf={[
          'Lösung', ...(inhaberName ? ['Für'] : []), 'Beitrag im Monat', 'Laut Angebot (brutto)', 'Kostet netto im Monat',
        ]}
        spalten={spalten}
        textSpalten={inhaberName ? [1] : []}
      >
        {mit.loesungen.map(({ angebot: a, vertrag }) => {
          const e = aufwand(a.id);
          return (
            <Zeile
              key={a.id}
              textSpalten={inhaberName ? [1] : []}
              zellen={[
                a.name ? `${a.name} (${LOESUNG_KURZ[a.loesung]})` : LOESUNG_KURZ[a.loesung],
                ...(inhaberName ? [inhaberName(vertrag.inhaber)] : []),
                beitrag(a),
                a.renteMonat > 0 ? `${euro(a.renteMonat)} Rente` : `${euro(a.kapital)} Kapital`,
                !e ? '—' : ohneEigenaufwand(e) ? 'rein AG‑finanziert' : euro(e.echterAufwandMonat),
              ]}
            />
          );
        })}
      </Tabelle>

      <Untertitel>Woraus sich das Netto jetzt zusammensetzt</Untertitel>
      <Zusammensetzung zeile={nachher} einzelperson={einzelperson} neu={mit.neu} />

      {einmal.length > 0 && (
        <Text>
          <strong>Dazu einmalig:</strong>{' '}
          {einmal.map((k) => `${k.bezeichnung} ${euro(k.nettoKapital)} netto im Jahr ${k.jahr}`).join('; ')} — im
          monatlichen Netto nicht enthalten.
        </Text>
      )}

      <Text>
        Gemeinsam gerechnet: Mit jeder weiteren Rente steigt auch die Steuer auf die übrigen
        Einkünfte — der Zuwachs ist deshalb etwas kleiner als die Summe der einzelnen Angebote im
        Vergleich. Was eine Lösung netto kostet, ist je Angebot für sich gerechnet. Rente und Kapital
        laut Angebot zum Rentenbeginn; eine Modellrechnung, keine Zusage.
      </Text>
    </Seite>
  );
}
