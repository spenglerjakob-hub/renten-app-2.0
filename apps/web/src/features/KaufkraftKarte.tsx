import { useEffect, useId, useState, type ReactNode } from 'react';
import { ClipboardCopy, Check, Coins } from 'lucide-react';
import type { Jahreszeile } from '@renten/engine';
import { euro, prozent } from '../components/Feld';
import { gespraechssatz, kaufkraft } from './kaufkraft';

/**
 * „Kaufkraft bis zum Rentenbeginn“ — die Luecke und der Kaufkraftverlust in
 * Euro, beides in beiden Massstaeben und mit der Annahme daneben.
 *
 * SACHLICH GESETZT: Rot traegt nur die Luecke selbst — ein Minus ist ein
 * Minus. Der Kaufkraftverlust ist keine Warnung, sondern eine Umrechnung.
 * Kein Countdown, keine Wertung.
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
    <section aria-labelledby={titelId} className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${klasse}`}>
      <h3 id={titelId} className="flex items-center gap-2 text-sm font-bold text-slate-800">
        <Coins className="h-4 w-4 shrink-0 text-slate-500" aria-hidden /> Kaufkraft bis zum Rentenbeginn
      </h3>

      <dl className="mt-3 space-y-2 text-sm">
        <Posten label={`Ihr Ziel von ${euro(k.bedarfHeute)} entspricht ${k.jahr}`} wert={`${euro(k.bedarfNominal)} im Monat`} />
        <Posten label={`Gesamt-Netto ${k.jahr}`} wert={euro(k.nettoNominal)} />
        <Posten label="… in heutiger Kaufkraft" wert={euro(k.nettoHeute)} />
        <Posten
          label={`Kaufkraftverlust bis ${k.jahr}`}
          wert={`${euro(k.verlustMonat)} im Monat (${prozent(k.verlustQuote, 0)})`}
          fett
        />
        {k.lueckeNominal > 0 && (
          <Posten
            label="Versorgungslücke"
            wert={<>
              <span className="whitespace-nowrap">{euro(k.lueckeNominal)} ({k.jahr})</span>{' · '}
              <span className="whitespace-nowrap">{euro(k.lueckeHeute)} heute</span>
            </>}
            ton="luecke"
            umbruch
          />
        )}
      </dl>
      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        Bei {prozent(inflation)} Inflation pro Jahr ({standard ? 'Standardwert' : 'Ihre Annahme'}, {wo}).
        Modellrechnung, keine Zusage.
      </p>

      <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">Für das Gespräch</p>
        <p className="mt-1 text-sm leading-relaxed text-indigo-950">{satz}</p>
        <button
          type="button"
          onClick={() => void kopieren()}
          className="mt-2 flex items-center gap-1.5 rounded-md border border-indigo-200 bg-white px-2.5 py-1 text-xs font-bold text-indigo-800 hover:bg-indigo-100 print:hidden"
        >
          {kopiert
            ? <><Check className="h-3.5 w-3.5" aria-hidden /> Kopiert</>
            : <><ClipboardCopy className="h-3.5 w-3.5" aria-hidden /> Satz kopieren</>}
        </button>
      </div>
    </section>
  );
}

function Posten({ label, wert, fett, ton, umbruch = false }: {
  label: string; wert: ReactNode; fett?: boolean; ton?: 'luecke';
  /**
   * Der Wert darf umbrechen — nur fuer die Luecke mit ihren zwei Teilen: Am
   * Telefon passt „1.706 € (2052) · 1.020 € heute“ nicht in eine Zeile.
   * Alle anderen Werte bleiben beisammen; dann bricht die Beschriftung um.
   */
  umbruch?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-slate-600">{label}</dt>
      <dd className={`${umbruch ? 'min-w-0' : 'shrink-0 whitespace-nowrap'} text-right tabular-nums ${fett ? 'font-bold' : 'font-semibold'} ${
        ton === 'luecke' ? 'text-rose-600' : 'text-slate-900'
      }`}>
        {wert}
      </dd>
    </div>
  );
}
