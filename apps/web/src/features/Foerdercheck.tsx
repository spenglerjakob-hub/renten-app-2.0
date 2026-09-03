import { useMemo } from 'react';
import { Gift } from 'lucide-react';
import { foerdercheck, type Jahreszeile } from '@renten/engine';
import { useSzenario } from '../store/szenario';
import { euro } from '../components/Feld';
import { foerderBasis } from './tuev-berechnung';

/**
 * FÖRDERCHECK — was an Förderung liegen bleibt.
 *
 * Der Vertrags-TÜV prüft, was da ist. Diese Ansicht prüft, was FEHLT: den
 * ungenutzten Rahmen der Entgeltumwandlung und den freien Höchstbetrag für
 * eine Basisrente. Beides steht im Gesetz und in den Angaben — es wurde nur
 * nie gegenübergestellt.
 *
 * Ohne Befund rendert der Block nichts. Ein Kasten, der „alles in Ordnung"
 * meldet, kostet Platz und sagt nichts.
 */
export function Foerdercheck({ zeile }: { zeile: Jahreszeile | null }) {
  const szenario = useSzenario((s) => s.szenario);

  const { befunde, ohneBeitrag } = useMemo(() => {
    const b = foerderBasis(szenario, zeile);
    return { befunde: foerdercheck(b.kontext, b.steuerOpt, b.p), ohneBeitrag: b.ohneBeitrag };
  }, [szenario, zeile]);

  if (befunde.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-sm print:hidden">
      <div className="flex items-center gap-2 border-b border-emerald-100 bg-emerald-50/70 px-3 py-2 sm:px-4">
        <Gift className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
        <span>
          <span className="block text-xs font-bold text-slate-800 sm:text-sm">
            Fördercheck
          </span>
          <span className="block text-[10px] text-slate-500 sm:text-xs">
            Förderung, die Sie heute nicht ausschöpfen
          </span>
        </span>
      </div>

      <div className="divide-y divide-slate-100">
        {befunde.map((b) => (
          <div key={b.id} className="p-3 sm:p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h4 className="text-xs font-bold text-slate-800 sm:text-sm">{b.titel}</h4>
              <span className="text-xs font-black tabular-nums text-emerald-700 sm:text-sm">
                {euro(b.rahmenMonat)} / Monat frei
              </span>
            </div>

            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600 sm:text-xs">
              {b.text}
            </p>

            {/*
              Die eine Zeile, auf die es ankommt. Der Rahmen sagt, was ginge;
              erst der Netto-Aufwand sagt, was es kostet — und das ist die
              Zahl, nach der jemand entscheidet.
            */}
            <p className="mt-2 rounded-lg bg-emerald-50 px-2.5 py-2 text-[11px] leading-relaxed text-emerald-900 sm:text-xs">
              <strong>{euro(b.probeMonat)}</strong> im Monat kosten Sie nach Förderung nur{' '}
              <strong>{euro(b.nettoAufwandMonat)}</strong> — der Staat trägt{' '}
              {Math.round(b.foerderquote * 100)} % ({euro(b.ersparnisJahr / 12)} im Monat).
            </p>

            <p className="mt-1 text-[10px] text-slate-400">{b.paragraf}</p>
          </div>
        ))}
      </div>

      {ohneBeitrag > 0 && (
        /*
          Ehrlichkeitsvorbehalt: Ein laufender Vertrag ohne erfassten Beitrag
          verbraucht Foerderrahmen, den der Check nicht sehen kann. Ohne
          diesen Satz waere der ausgewiesene freie Rahmen zu gross.
        */
        <p className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-[10px] leading-relaxed text-slate-500 sm:px-4">
          Zu {ohneBeitrag === 1 ? 'einem geförderten Vertrag' : `${ohneBeitrag} geförderten Verträgen`}{' '}
          ist kein laufender Beitrag erfasst. Tragen Sie ihn im Vertrags-TÜV ein — sonst
          erscheint hier mehr freier Rahmen, als Sie tatsächlich haben.
        </p>
      )}
    </div>
  );
}
