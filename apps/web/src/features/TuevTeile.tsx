import type { TuevErgebnis } from '@renten/engine';
import { GegenueberZeile, euro } from '../components/Feld';
import type { AnspracheWoerter } from '../lib/ansprache';
import { laufendeZulageJahr } from './tuev-berechnung';

/**
 * DIE BAUSTEINE EINER PRUEFKARTE — fuer den Vertrags-TUEV (`VertragsTuev.tsx`)
 * und die Angebote (`Loesungen.tsx`).
 *
 * Beide zeigen je Vertrag bzw. Angebot dieselbe Karte: links die Annahmen, in
 * der Mitte Einzahlung gegen Auszahlung, rechts Kennzahlen und Fazit. Die
 * Kaesten darin stehen hier einmal, damit beide Stellen gleich aussehen und
 * gleich bleiben.
 */

/** Ein Block in der Innenflaeche mit leisem Titel — Belastung, Ertrag, Laufzeit, Kennzahlen. */
export const BLOCK = 'ui-innen p-4';
export const BLOCK_TITEL = 'mb-2 text-xs font-medium text-ui-schiefer';
/** Die Summe eines Blocks unter einer Linie in Tinte, wie die Aufstellungen der Beratung. */
export const SUMME = 'mt-2 flex items-baseline justify-between gap-3 border-t border-ui-tinte pt-2';

/** Eine Zeile im Vergleich der beiden Auszahlungswege. */
export function WegZeile({ text, rente, kapital, hervor }: {
  text: string; rente: string; kapital: string; hervor?: 'rente' | 'kapital';
}) {
  // Der bessere Weg in Tinte und mittlerem Gewicht, der andere leiser — ohne Ampel.
  const stark = 'font-medium text-ui-tinte';
  return (
    <tr className="border-b border-ui-linie last:border-0">
      <td className="px-3 py-1.5 text-ui-schiefer">{text}</td>
      <td className={`px-2 py-1.5 text-right ${hervor === 'rente' ? stark : 'text-ui-tinte/80'}`}>{rente}</td>
      <td className={`px-3 py-1.5 text-right ${hervor === 'kapital' ? stark : 'text-ui-tinte/80'}`}>{kapital}</td>
    </tr>
  );
}

/**
 * Dieser Kasten schluesselt die Zulagenzeile der Treppe auf: woraus sie sich
 * zusammensetzt und was sie im JAHR ausmacht.
 *
 * Die Zulagen mindern den Eigenaufwand weiterhin NICHT. Sie kommen nicht vom
 * Sparer, sondern vom Staat, und stehen bereits als hoeheres Kapital auf der
 * Habenseite (avdSteuervorteil.eigenaufwandNetto rechnet genau so). In der
 * Treppe heben sie die oberste Zeile an und gehen in der naechsten wieder ab
 * — unten steht unveraendert derselbe Betrag. Als blosser Minusposten gebucht
 * zaehlten sie doppelt, und "Kostet dich wirklich" ginge nicht mehr auf.
 */
export function ZulagenBlock({ r, e }: {
  r: TuevErgebnis;
  /** Die Ansprache der Person, der der Vertrag gehoert */
  e: AnspracheWoerter;
}) {
  if (r.zulageMonat <= 0) return null;
  return (
    <div className={BLOCK}>
      <div className={BLOCK_TITEL}>
        Was der Staat dazugibt — monatlich, 1. Jahr
      </div>
      <div className="space-y-1.5">
        {r.zulageDetail ? (
          <>
            <GegenueberZeile
              text="Grundzulage"
              wert={euro(r.zulageDetail.grundzulageMonat)}
            />
            <GegenueberZeile
              text={r.zulageDetail.kinderMitAnspruch > 0
                ? `Kinderzulage — für ${r.zulageDetail.kinderMitAnspruch} Kind${r.zulageDetail.kinderMitAnspruch > 1 ? 'er' : ''}`
                : 'Kinderzulage — kein Kind im Kindergeldalter'}
              wert={euro(r.zulageDetail.kinderzulageMonat)}
            />
            {/*
              MAL ZWOELF. Die Zeilen darueber sind Monatswerte; hier stand
              ihre blosse Summe unter der Ueberschrift "Jedes Jahr". Aus
              540 EUR Foerderung wurden so 45.
            */}
            <div className={SUMME}>
              <span className="text-xs font-medium text-ui-tinte">Jedes Jahr</span>
              <span className="text-base font-medium tabular-nums text-ui-tinte">
                {euro(laufendeZulageJahr(r))}
              </span>
            </div>
            {/*
              Der Bonus faellt EINMAL an. Neben die laufenden Zulagen
              gestellt verspraeche er eine Foerderung fuer die ganze
              Laufzeit, die es nur im ersten Jahr gibt.
            */}
            {r.zulageDetail.bonusEinmalig > 0 && (
              <p className="mt-1 text-xs leading-relaxed text-ui-schiefer">
                Dazu <strong className="font-medium text-ui-tinte">einmalig im ersten Jahr</strong>: Berufseinsteigerbonus{' '}
                {euro(r.zulageDetail.bonusEinmalig)}.
              </p>
            )}
          </>
        ) : (
          <GegenueberZeile text="Zulage" wert={euro(r.zulageMonat)} />
        )}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ui-schiefer">
        Die Zulagen sind der Anteil des Staates am Gesamtbeitrag oben — sie
        fließen zusätzlich in den Vertrag und senken {e.dein('en')} eigenen Beitrag
        nicht. Deshalb stehen sie dort als Abzug vom Zufluss und nicht als
        Abzug von {e.dein('en')} Kosten.
      </p>
    </div>
  );
}
