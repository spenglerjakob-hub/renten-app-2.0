import { useMemo, useState } from 'react';
import { ChevronDown, Target } from 'lucide-react';
import type { Jahreszeile } from '@renten/engine';
import { useSzenario } from '../store/szenario';
import { ZahlFeld, ProzentFeld, euro, prozent } from '../components/Feld';
import {
  sparzielRechnen, SPARZIEL_VORGABE, type SparzielEingaben,
} from './sparziel-berechnung';

/**
 * Der Sparrechner: die Versorgungsluecke rueckwaerts.
 *
 * Der Rechner sagt bis hierher nur, DASS eine Luecke besteht. Die Frage, die
 * jeder Kunde danach stellt, ist eine andere: was muss ich monatlich
 * zuruecklegen, damit sie sich schliesst? Genau das steht hier — mit
 * Beitragsdynamik, weil ein Vertrag mit 3 % Steigerung heute deutlich
 * weniger kostet als einer ohne.
 */
export function Sparrechner({ zeile }: { zeile: Jahreszeile }) {
  const szenario = useSzenario((x) => x.szenario);
  const [offen, setOffen] = useState(false);
  const [eingaben, setEingaben] = useState<SparzielEingaben>(SPARZIEL_VORGABE);

  const r = useMemo(
    () => sparzielRechnen(szenario, zeile, eingaben),
    [szenario, zeile, eingaben],
  );

  const setze = (teil: Partial<SparzielEingaben>) =>
    setEingaben((x) => ({ ...x, ...teil }));

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm print:hidden">
      <button
        type="button"
        onClick={() => setOffen((x) => !x)}
        aria-expanded={offen}
        className="flex w-full items-center justify-between gap-3 p-3 text-left sm:p-4"
      >
        <span className="flex items-center gap-2">
          <Target className="h-4 w-4 shrink-0 text-indigo-600" aria-hidden />
          <span>
            <span className="block text-xs font-bold text-slate-800 sm:text-sm">
              Sparrechner
            </span>
            <span className="block text-[10px] text-slate-500 sm:text-xs">
              Was kostet es, die Versorgungslücke zu schließen?
            </span>
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${offen ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      <div className={`border-t border-slate-100 p-3 sm:p-4 ${offen ? 'block' : 'hidden'}`}>
        {r === null ? (
          <p className="text-xs text-slate-500">
            Für das Jahr {zeile.jahr} besteht keine Lücke — es gibt nichts zu schließen.
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <ProzentFeld
                label="Rendite p. a. (nach Kosten)"
                wert={eingaben.rendite}
                onChange={(n) => setze({ rendite: n })}
                max={15}
              />
              <ProzentFeld
                label="Beitragsdynamik p. a."
                wert={eingaben.dynamik}
                onChange={(n) => setze({ dynamik: n })}
                max={15}
                hilfe="Um wie viel der Beitrag jedes Jahr steigt."
              />
              <ZahlFeld
                label="Auszahldauer"
                wert={eingaben.auszahldauer}
                onChange={(n) => setze({ auszahldauer: n })}
                min={1} max={60} einheit="Jahre"
                hilfe="Über wie viele Jahre das Kapital reichen soll."
              />
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Kachel
                titel={`Lücke im Jahr ${zeile.jahr}`}
                wert={euro(r.luecke)}
                hinweis={`in heutigem Geld ${euro(r.lueckeHeute)}`}
              />
              <Kachel
                titel="Dafür nötiges Kapital"
                wert={euro(r.zielkapital)}
                hinweis={`bei Rentenbeginn, für ${eingaben.auszahldauer} Jahre`}
              />
              <Kachel
                titel="Ihr Startbeitrag"
                wert={euro(r.gewaehlt.startbeitrag)}
                hinweis={`im Monat, ${r.jahreBisRente} Jahre lang`}
                akzent
              />
            </div>

            {/*
              Die Dynamik ist der eigentliche Punkt: sie senkt den Einstieg
              und hebt das Ende. Eine Tabelle zeigt das in einem Blick, ein
              einzelner Wert nicht.
            */}
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wider text-slate-500">
                    <th className="py-1.5 pr-3 font-bold">Beitragsdynamik</th>
                    <th className="py-1.5 pr-3 text-right font-bold">Start heute</th>
                    <th className="py-1.5 pr-3 text-right font-bold">Im letzten Jahr</th>
                    <th className="py-1.5 text-right font-bold">Summe aller Beiträge</th>
                  </tr>
                </thead>
                <tbody>
                  {r.varianten.map((v) => (
                    <tr
                      key={v.dynamik}
                      className={`border-b border-slate-100 ${
                        Math.abs(v.dynamik - eingaben.dynamik) < 1e-9 ? 'bg-indigo-50/60 font-bold' : ''
                      }`}
                    >
                      <td className="py-1.5 pr-3 text-slate-700">{prozent(v.dynamik)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-slate-900">
                        {euro(v.startbeitrag)}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-slate-600">
                        {euro(v.endbeitrag)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-slate-600">
                        {euro(v.summeBeitraege)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
              Bei <strong>{prozent(eingaben.rendite)}</strong> Rendite nach Kosten und{' '}
              <strong>{prozent(eingaben.dynamik)}</strong> Beitragsdynamik beginnen Sie mit{' '}
              <strong>{euro(r.gewaehlt.startbeitrag)}</strong> und zahlen im letzten Sparjahr{' '}
              <strong>{euro(r.gewaehlt.endbeitrag)}</strong>. Die Rechnung unterstellt, dass die
              Entnahme später mit {prozent(szenario.annahmen.inflation)} Inflation mitwächst, und
              zieht die Abgeltungsteuer auf den Ertragsanteil bereits ab. Sie nennt eine
              Größenordnung, kein Produkt.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Kachel({ titel, wert, hinweis, akzent }: {
  titel: string; wert: string; hinweis: string; akzent?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-3 ${akzent ? 'border-indigo-300 bg-indigo-50/60' : 'border-slate-200 bg-slate-50'}`}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{titel}</div>
      <div className={`mt-0.5 text-lg font-black tabular-nums ${akzent ? 'text-indigo-900' : 'text-slate-900'}`}>
        {wert}
      </div>
      <div className="mt-0.5 text-[10px] leading-tight text-slate-500">{hinweis}</div>
    </div>
  );
}
