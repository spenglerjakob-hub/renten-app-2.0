import { useEffect, useId, useState } from 'react';
import { ClipboardCopy, Check } from 'lucide-react';
import type { Jahreszeile } from '@renten/engine';
import { euro, prozent } from '../components/Feld';
import { Posten } from '../components/stil';
import { gespraechssatz, kaufkraft } from './kaufkraft';

/** Ein Betrag, der nicht umbricht — sonst stuende „im Monat“ allein in der naechsten Zeile. */
const nowrap = (text: string) => <span className="whitespace-nowrap">{text}</span>;

/**
 * „Kaufkraft bis zum Rentenbeginn“ — die Luecke und der Kaufkraftverlust in
 * Euro, beides in beiden Massstaeben und mit der Annahme daneben.
 *
 * SACHLICH GESETZT: eine Aufstellung wie in der Mitarbeiterberatung, alles
 * in Tinte, auch die Luecke — sie ist eine Zahl, keine Warnung, und der
 * Kaufkraftverlust eine Umrechnung. Der Satz fuer das Gespraech steht gross
 * darunter. Kein Countdown, keine Wertung.
 */
export function KaufkraftKarte({ zeile, inflation, standard = false, klasse = '', wo = 'oben änderbar' }: {
  zeile: Jahreszeile;
  inflation: number;
  /** Die Inflation ist noch die Vorbelegung */
  standard?: boolean;
  klasse?: string;
  /** Wo sich die Annahme aendern laesst — in der Schnellrechnung gibt es dafuer kein Feld */
  wo?: string;
}) {
  // Eigene Kennung je Einbindung: Die Karte steht zweimal im Dokument (Telefon und PC).
  const titelId = useId();
  const [kopiert, setKopiert] = useState(false);
  useEffect(() => {
    if (!kopiert) return;
    const t = window.setTimeout(() => setKopiert(false), 2000);
    return () => window.clearTimeout(t);
  }, [kopiert]);

  const k = kaufkraft(zeile);
  if (!k) return null;
  const satz = gespraechssatz(k, inflation);
  const kopieren = async () => {
    try { await navigator.clipboard.writeText(satz); setKopiert(true); } catch { /* ohne Zwischenablage bleibt der Satz lesbar */ }
  };

  return (
    <section aria-labelledby={titelId} className={`ui-karte p-5 sm:p-7 ${klasse}`}>
      <h3 id={titelId} className="text-lg font-medium tracking-[-0.01em] text-ui-tinte sm:text-xl">
        Kaufkraft bis zum Rentenbeginn
      </h3>

      {/* Werte bleiben beisammen; umbrechen darf nur die Luecke mit ihren zwei Teilen. */}
      <dl className="mt-4 text-sm">
        <Posten text={`Ihr Ziel von ${euro(k.bedarfHeute)} entspricht ${k.jahr}`} wert={nowrap(`${euro(k.bedarfNominal)} im Monat`)} />
        <Posten text={`Gesamt-Netto ${k.jahr}`} wert={nowrap(euro(k.nettoNominal))} />
        <Posten text="… in heutiger Kaufkraft" wert={nowrap(euro(k.nettoHeute))} />
        <Posten text={`Kaufkraftverlust bis ${k.jahr}`} wert={nowrap(`${euro(k.verlustMonat)} im Monat (${prozent(k.verlustQuote, 0)})`)} />
        {k.lueckeNominal > 0 && (
          <Posten
            text="Versorgungslücke"
            wert={<>{nowrap(`${euro(k.lueckeNominal)} (${k.jahr})`)}{' · '}{nowrap(`${euro(k.lueckeHeute)} heute`)}</>}
          />
        )}
      </dl>
      <p className="mt-3 text-xs leading-relaxed text-ui-schiefer">
        Bei {prozent(inflation)} Inflation pro Jahr ({standard ? 'Standardwert' : 'Ihre Annahme'}, {wo}).
        Modellrechnung, keine Zusage.
      </p>

      <div className="ui-innen mt-5 p-4 sm:p-5">
        <p className="text-sm text-ui-schiefer">Für das Gespräch</p>
        <p className="ui-titel mt-1 text-[18px] leading-[1.45] text-ui-tinte sm:text-[20px]">{satz}</p>
        <button
          type="button"
          onClick={() => void kopieren()}
          className="mt-3 flex items-center gap-1.5 rounded-full border border-ui-zweit-rand bg-white px-3 py-1.5 text-xs font-medium text-ui-tinte hover:bg-ui-innen print:hidden"
        >
          {kopiert
            ? <><Check className="h-3.5 w-3.5" aria-hidden /> Kopiert</>
            : <><ClipboardCopy className="h-3.5 w-3.5" aria-hidden /> Satz kopieren</>}
        </button>
      </div>
    </section>
  );
}
