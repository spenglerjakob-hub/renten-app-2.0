import type { Jahreszeile } from '@renten/engine';
import { euro, prozent } from '../components/Feld';
import { Seite, Tabelle, Zeile, Text, GrosseZahl } from './Bausteine';

/**
 * Dieselben Jahre in heutiger Kaufkraft.
 *
 * Beide Zahlen stehen bereits in jeder Zeile: `nettoMonat` ist der Betrag des
 * jeweiligen Jahres, `kaufkraftfaktor` die Abzinsung darauf. Es wird nichts
 * neu gerechnet.
 *
 * Bewusst BEIDE Fassungen nebeneinander, statt dem Schalter "Kaufkraft heute"
 * aus der Kopfzeile zu folgen: sonst haengt der Inhalt eines Gutachtens
 * davon ab, wie ein Schalter beim Drucken zufaellig stand — und der Leser
 * kann nicht erkennen, welche der beiden Wahrheiten er vor sich hat.
 */
export function Kaufkraft({
  zeilen, inflation, bezugsjahr,
}: {
  zeilen: readonly Jahreszeile[];
  inflation: number;
  /** Das Jahr, das auf dem Deckblatt beurteilt wird — sonst nennt diese
   *  Seite eine andere Jahreszahl als die erste, und das verwirrt zu Recht. */
  bezugsjahr: number;
}) {
  if (zeilen.length === 0) return null;

  const erste = zeilen[0]!;
  const letzte = zeilen[zeilen.length - 1]!;
  const tabelle = zeilen.filter((z, i) => z.alterA % 5 === 0 || i === zeilen.length - 1);

  /**
   * Ab welchem Jahr das Netto den Bedarf nicht mehr deckt.
   *
   * Das Deckblatt beurteilt EIN Jahr — das Rentenjahr. Der Bedarf steigt aber
   * mit der Inflation, die Bezuege meist langsamer; eine Versorgung, die zu
   * Beginn reicht, kann zehn Jahre spaeter eine Luecke haben. Diese Zahl
   * auszurechnen ist der eigentliche Zweck dieser Seite.
   *
   * Der Vergleich steht bewusst in NOMINALEN Betraegen: die Deckungsfrage ist
   * masstabsunabhaengig — dividiert man Netto und Bedarf durch denselben
   * Kaufkraftfaktor, kippt sie im selben Jahr. Genau das steht auch im
   * Erklaertext unten.
   */
  const kippt = zeilen.find((z) => z.nettoMonat < z.zielNettoMonat);
  const anfangsGedeckt = erste.nettoMonat >= erste.zielNettoMonat;

  return (
    <Seite
      titel="Dieselben Zahlen in heutiger Kaufkraft"
      nummer={`Bei ${prozent(inflation)} Inflation pro Jahr`}
    >
      <div className="grid grid-cols-3 gap-3">
        <GrosseZahl
          titel={`Netto mit ${erste.alterA} · ${erste.jahr}`}
          wert={euro(erste.nettoMonat / erste.kaufkraftfaktor)}
          hinweis={`nominal ${euro(erste.nettoMonat)}`}
        />
        <GrosseZahl
          titel={`Netto mit ${letzte.alterA} · ${letzte.jahr}`}
          wert={euro(letzte.nettoMonat / letzte.kaufkraftfaktor)}
          hinweis={`nominal ${euro(letzte.nettoMonat)}`}
        />
        <GrosseZahl
          titel={`Ein Euro ist ${letzte.jahr} noch wert`}
          wert={`${(100 / letzte.kaufkraftfaktor).toFixed(0)} Cent`}
          hinweis="gemessen an heute"
        />
      </div>

      <div className="mt-4">
        <Tabelle
          kopf={[
            'Jahr / Alter',
            'Netto nominal',
            'Netto heutige Kaufkraft',
            'Bedarf nominal',
            'Bedarf heute',
          ]}
        >
          {tabelle.map((z) => (
            <Zeile
              key={z.jahr}
              zellen={[
                `${z.jahr} · ${z.alterA} J.`,
                euro(z.nettoMonat),
                euro(z.nettoMonat / z.kaufkraftfaktor),
                euro(z.zielNettoMonat),
                euro(z.zielNettoMonat / z.kaufkraftfaktor),
              ]}
            />
          ))}
        </Tabelle>
      </div>

      {kippt && (
        <div
          className={`mt-4 break-inside-avoid rounded-lg border p-3 ${
            anfangsGedeckt ? 'border-amber-300 bg-amber-50' : 'border-rose-300 bg-rose-50'
          }`}
        >
          <div className="text-[9px] font-bold uppercase tracking-wider text-slate-600">
            Das Wichtigste dieser Seite
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-800">
            {anfangsGedeckt ? (
              <>
                Zu Beginn des Ruhestands ist Ihr Bedarf gedeckt. Ab dem Jahr{' '}
                <strong>{kippt.jahr}</strong> — Sie sind dann <strong>{kippt.alterA}</strong> —
                reicht das Netto nicht mehr, weil der Bedarf mit der Inflation stärker steigt als
                Ihre Bezüge. Das Deckblatt beurteilt nur das Jahr {erste.jahr} — dass es später
                knapp wird, sieht man erst an dieser Tabelle.
              </>
            ) : (
              <>
                Die Lücke besteht von Beginn an und wächst mit den Jahren, weil Ihre Bezüge
                langsamer steigen als die Preise. In der linken Spalte wächst der fehlende Betrag
                Jahr für Jahr; in der rechten sieht man, was er in heutigem Geld bedeutet.
              </>
            )}
          </p>
        </div>
      )}

      <Text>
        <strong>Wie diese Spalten zu lesen sind.</strong> „Nominal“ ist der Betrag, der später
        tatsächlich überwiesen wird. „Heutige Kaufkraft“ rechnet ihn auf das Preisniveau von heute
        zurück — er sagt, wie viel man sich dafür kaufen könnte, wenn man es heute hätte. Der
        Bedarf ist in beiden Spalten mitgerechnet: er steigt nominal mit der Inflation, bleibt in
        heutiger Kaufkraft also konstant. Ob das Netto reicht, entscheidet sich in beiden Spalten
        im selben Jahr — die rechte lässt es nur leichter erkennen, weil der Maßstab dort mit
        {euro(erste.zielNettoMonat / erste.kaufkraftfaktor)} über alle Jahre derselbe bleibt.
      </Text>
    </Seite>
  );
}
