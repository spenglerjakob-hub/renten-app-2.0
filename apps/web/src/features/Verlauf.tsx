import { useMemo, useState, useId } from 'react';
import type { ProjektionsErgebnis } from '@renten/engine';
import { Karte, euro } from '../components/Feld';

/**
 * Einkommensverlauf.
 *
 * Gegenueber dem Prototyp ergaenzt: eine Textalternative fuer Screenreader
 * und Tastaturnutzer (Befund D5) sowie die getrennte Darstellung der
 * gemischten Phase, in der ein Partner bereits Rente bezieht.
 */
export function Verlauf({
  ergebnis, kaufkraftHeute,
}: { ergebnis: ProjektionsErgebnis; kaufkraftHeute: boolean }) {
  const [alsTabelle, setAlsTabelle] = useState(false);
  const titelId = useId();

  const daten = useMemo(
    () =>
      ergebnis.zeilen.map((z) => {
        const f = kaufkraftHeute ? 1 / z.kaufkraftfaktor : 1;
        return {
          jahr: z.jahr,
          alter: z.alterA,
          netto: (z.nettoGesamt / 12) * f,
          ziel: z.zielNettoMonat * f,
          ruhestand: z.vollstaendigImRuhestand,
          gemischt: z.gemischtePhase,
        };
      }),
    [ergebnis, kaufkraftHeute],
  );

  if (daten.length === 0) return null;

  const maxWert = Math.max(...daten.map((d) => Math.max(d.netto, d.ziel)), 1) * 1.15;
  const B = 860, H = 300, L = 62, R = 12, T = 12, U = 34;
  const plotB = B - L - R, plotH = H - T - U;
  const x = (i: number) => L + (i / Math.max(1, daten.length - 1)) * plotB;
  const y = (v: number) => T + plotH - (v / maxWert) * plotH;
  const balkenBreite = Math.max(2, (plotB / daten.length) * 0.72);

  const zielPfad = daten.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(d.ziel).toFixed(1)}`).join(' ');
  const ersterRuhestand = daten.findIndex((d) => d.ruhestand);

  const zusammenfassung = (() => {
    const start = daten.find((d) => d.ruhestand);
    const ende = [...daten].reverse().find((d) => d.ruhestand);
    if (!start || !ende) return 'Noch keine Ruhestandsphase im Zeitraum.';
    return (
      `Verlauf von Alter ${daten[0]!.alter} bis ${daten[daten.length - 1]!.alter}. ` +
      `Zu Rentenbeginn (Alter ${start.alter}) betraegt das Haushaltsnetto ${euro(start.netto)} pro Monat ` +
      `bei einem Bedarf von ${euro(start.ziel)}. Am Ende des Zeitraums ${euro(ende.netto)} gegenueber ${euro(ende.ziel)} Bedarf.`
    );
  })();

  return (
    <Karte
      titel="Einkommensverlauf"
      kopfzeile={
        <button
          type="button"
          onClick={() => setAlsTabelle((v) => !v)}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 print:hidden"
        >
          {alsTabelle ? 'Als Diagramm' : 'Als Tabelle'}
        </button>
      }
    >
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-slate-400" aria-hidden /> Erwerbsphase</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-amber-400" aria-hidden /> gemischt</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-indigo-500" aria-hidden /> Ruhestand</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-rose-500" aria-hidden /> Bedarf</span>
      </div>

      {alsTabelle ? (
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Haushaltsnetto und Bedarf je Kalenderjahr</caption>
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <th scope="col" className="py-2">Jahr</th>
                <th scope="col">Alter</th>
                <th scope="col">Phase</th>
                <th scope="col" className="text-right">Netto/Monat</th>
                <th scope="col" className="text-right">Bedarf</th>
              </tr>
            </thead>
            <tbody>
              {daten.map((d) => (
                <tr key={d.jahr} className="border-b border-slate-50">
                  <td className="py-1.5 tabular-nums">{d.jahr}</td>
                  <td className="tabular-nums">{d.alter}</td>
                  <td className="text-xs text-slate-500">{d.ruhestand ? 'Ruhestand' : d.gemischt ? 'gemischt' : 'Erwerb'}</td>
                  <td className="text-right tabular-nums">{euro(d.netto)}</td>
                  <td className="text-right tabular-nums text-slate-500">{euro(d.ziel)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${B} ${H}`} className="h-auto w-full min-w-[600px]" role="img" aria-labelledby={titelId}>
            <title id={titelId}>{zusammenfassung}</title>
            {[0, 0.25, 0.5, 0.75, 1].map((q) => {
              const v = maxWert * q;
              return (
                <g key={q}>
                  <line x1={L} y1={y(v)} x2={B - R} y2={y(v)} stroke="#e2e8f0" strokeWidth="1" />
                  <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#64748b">
                    {v >= 1000 ? `${Math.round(v / 1000)}k` : Math.round(v)}
                  </text>
                </g>
              );
            })}
            {daten.map((d, i) => {
              const h = Math.max(0, plotH - (y(d.netto) - T));
              const farbe = d.ruhestand ? '#6366f1' : d.gemischt ? '#fbbf24' : '#94a3b8';
              return (
                <rect key={d.jahr} x={x(i) - balkenBreite / 2} y={y(d.netto)}
                  width={balkenBreite} height={h} fill={farbe} rx="1.5" />
              );
            })}
            {ersterRuhestand > 0 && (
              <line x1={x(ersterRuhestand)} y1={T} x2={x(ersterRuhestand)} y2={T + plotH}
                stroke="#475569" strokeWidth="1" strokeDasharray="3 3" />
            )}
            <path d={zielPfad} fill="none" stroke="#f43f5e" strokeWidth="2" />
            <line x1={L} y1={T + plotH} x2={B - R} y2={T + plotH} stroke="#94a3b8" strokeWidth="1.5" />
            {daten.map((d, i) =>
              d.alter % 5 === 0 ? (
                <text key={d.jahr} x={x(i)} y={H - 12} textAnchor="middle" fontSize="11" fill="#64748b">
                  {d.alter}
                </text>
              ) : null,
            )}
            <text x={L} y={H - 1} fontSize="10" fill="#94a3b8">Alter</text>
          </svg>
        </div>
      )}

      <p className="mt-2 text-xs text-slate-500">{zusammenfassung}</p>
    </Karte>
  );
}
