import { useId, useState } from 'react';
import type { AvdJahr } from '@renten/engine';
import { euro } from '../components/Feld';

/**
 * Diagramme der Altersvorsorgedepot-Seite.
 *
 * Von Hand als SVG gezeichnet — wie schon der Einkommensverlauf im Rechner.
 * Eine Diagrammbibliothek waere hier das Doppelte des gesamten uebrigen
 * Seiten-Bundles, fuer zwei Diagramme.
 *
 * Die Farben sind geprueft, nicht geschaetzt: Helligkeit, Saettigung,
 * Farbfehlsichtigkeit (schlechtestes Paar dE 13,8 bei Protanopie),
 * Normalsicht und Kontrast gegen die weisse Karte. Damit Identitaet nie
 * allein an der Farbe haengt, tragen alle Serien zusaetzlich eine Legende
 * und eine Beschriftung am Ende, und es gibt eine Tabellenansicht.
 */
const FARBE = {
  eigen: '#4f46e5',
  zulagen: '#0d9488',
  gewinn: '#ea580c',
} as const;

const ACHSE = '#94a3b8';
const RASTER = '#e2e8f0';
const BESCHRIFTUNG = '#64748b';

function kurz(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',')} Mio.`;
  if (v >= 1000) return `${Math.round(v / 1000)}k`;
  return String(Math.round(v));
}

/* ------------------------------------------------------------------ */

/**
 * Kapitalaufbau als gestapelte Flaeche: Eigenbeitraege, Zulagen, Kursgewinne.
 *
 * Der Punkt des Diagramms ist der oberste Streifen. Er zeigt, dass auch die
 * Zulagen Rendite erwirtschaften — der Staat legt nicht nur Geld dazu, das
 * Geld arbeitet ueber Jahrzehnte mit.
 */
export function KapitalaufbauDiagramm({
  verlauf, steuerersparnisKumuliert = [],
}: {
  verlauf: readonly AvdJahr[];
  /**
   * Aufgelaufene Steuerersparnis, PARALLEL zum Verlauf (gleiche Laenge,
   * gleiche Reihenfolge). Sie ist bewusst KEINE vierte Flaeche: sie liegt
   * nicht im Depot, sondern in der Tasche des Sparers. Im Tooltip steht sie
   * deshalb eingerueckt unter den Eigenbeitraegen — als Teil davon, der ueber
   * die Steuer zurueckkommt.
   */
  steuerersparnisKumuliert?: readonly number[];
}) {
  const [alsTabelle, setAlsTabelle] = useState(false);
  const [aktiv, setAktiv] = useState<number | null>(null);
  const titelId = useId();

  if (verlauf.length < 2) return null;

  const letzte = verlauf[verlauf.length - 1]!;
  const max = Math.max(...verlauf.map((d) => d.kapital), 1) * 1.08;

  const B = 780, H = 300, L = 54, R = 152, T = 14, U = 34;
  const plotB = B - L - R, plotH = H - T - U;
  const x = (i: number) => L + (i / (verlauf.length - 1)) * plotB;
  const y = (v: number) => T + plotH - (v / max) * plotH;

  // Gestapelt von unten: Eigenbeitraege, darauf Zulagen, darauf Gewinne.
  const eben = [
    { schluessel: 'eigen' as const, text: 'Eigenbeiträge', farbe: FARBE.eigen,
      wert: (d: AvdJahr) => d.eigenbeitraegeKumuliert },
    { schluessel: 'zulagen' as const, text: 'Zulagen', farbe: FARBE.zulagen,
      wert: (d: AvdJahr) => d.eigenbeitraegeKumuliert + d.zulagenKumuliert },
    { schluessel: 'gewinn' as const, text: 'Kursgewinne', farbe: FARBE.gewinn,
      wert: (d: AvdJahr) => d.kapital },
  ];

  const flaeche = (oben: (d: AvdJahr) => number, unten: (d: AvdJahr) => number) => {
    const hin = verlauf.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(oben(d)).toFixed(1)}`);
    const zurueck = [...verlauf].reverse().map((d, k) => {
      const i = verlauf.length - 1 - k;
      return `L ${x(i).toFixed(1)} ${y(unten(d)).toFixed(1)}`;
    });
    return `${hin.join(' ')} ${zurueck.join(' ')} Z`;
  };

  const zusammenfassung =
    `Kapitalaufbau über ${verlauf.length} Jahre. Am Ende ${euro(letzte.kapital)}: ` +
    `${euro(letzte.eigenbeitraegeKumuliert)} eigene Beiträge, ${euro(letzte.zulagenKumuliert)} Zulagen ` +
    `und ${euro(letzte.gewinnKumuliert)} Kursgewinne.`;

  const d = aktiv !== null ? verlauf[aktiv] : undefined;
  const ersparnisHier = aktiv !== null ? (steuerersparnisKumuliert[aktiv] ?? 0) : 0;

  return (
    <figure className="m-0">
      <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          So wächst Ihr Kapital
        </h3>
        <button
          type="button"
          onClick={() => setAlsTabelle((v) => !v)}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          {alsTabelle ? 'Als Diagramm' : 'Als Tabelle'}
        </button>
      </figcaption>

      <div className="mb-3 flex flex-wrap gap-4 text-xs text-slate-600">
        {eben.map((e) => (
          <span key={e.schluessel} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: e.farbe }} aria-hidden />
            {e.text}
          </span>
        ))}
      </div>

      {alsTabelle ? (
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{zusammenfassung}</caption>
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <th scope="col" className="py-2">Jahr</th>
                <th scope="col">Alter</th>
                <th scope="col" className="text-right">Eigenbeiträge</th>
                <th scope="col" className="text-right">Zulagen</th>
                <th scope="col" className="text-right">Kursgewinne</th>
                <th scope="col" className="text-right">Kapital</th>
              </tr>
            </thead>
            <tbody>
              {verlauf.map((r) => (
                <tr key={r.jahr} className="border-b border-slate-50">
                  <td className="py-1.5 tabular-nums">{r.jahr}</td>
                  <td className="tabular-nums">{r.alter}</td>
                  <td className="text-right tabular-nums">{euro(r.eigenbeitraegeKumuliert)}</td>
                  <td className="text-right tabular-nums">{euro(r.zulagenKumuliert)}</td>
                  <td className="text-right tabular-nums">{euro(r.gewinnKumuliert)}</td>
                  <td className="text-right font-bold tabular-nums">{euro(r.kapital)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative overflow-x-auto">
          <svg
            viewBox={`0 0 ${B} ${H}`}
            className="h-auto w-full min-w-[560px]"
            role="img"
            aria-labelledby={titelId}
            onMouseLeave={() => setAktiv(null)}
          >
            <title id={titelId}>{zusammenfassung}</title>

            {[0, 0.25, 0.5, 0.75, 1].map((q) => (
              <g key={q}>
                <line x1={L} y1={y(max * q)} x2={B - R} y2={y(max * q)} stroke={RASTER} strokeWidth="1" />
                <text x={L - 8} y={y(max * q) + 4} textAnchor="end" fontSize="13" fill={BESCHRIFTUNG}>
                  {kurz(max * q)}
                </text>
              </g>
            ))}

            {/* Von oben nach unten zeichnen, damit die 2px-Trennlinie in der
                Flaechenfarbe darunter sichtbar bleibt. */}
            {[...eben].reverse().map((e, k) => {
              const idx = eben.length - 1 - k;
              const unten = idx === 0 ? () => 0 : eben[idx - 1]!.wert;
              return (
                <g key={e.schluessel}>
                  <path d={flaeche(e.wert, unten)} fill={e.farbe} />
                  {idx > 0 && (
                    <path
                      d={verlauf.map((r, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(unten(r)).toFixed(1)}`).join(' ')}
                      fill="none" stroke="#ffffff" strokeWidth="2"
                    />
                  )}
                </g>
              );
            })}

            {/* Beschriftung je Serie am rechten Rand */}
            {eben.map((e, idx) => {
              const oben = e.wert(letzte);
              const unten = idx === 0 ? 0 : eben[idx - 1]!.wert(letzte);
              const mitte = (oben + unten) / 2;
              const anteil = oben - unten;
              if (anteil / max < 0.06) return null;
              return (
                <text key={e.schluessel} x={B - R + 8} y={y(mitte) + 4} fontSize="13" fill={BESCHRIFTUNG}>
                  {kurz(anteil)} {e.text}
                </text>
              );
            })}

            <line x1={L} y1={T + plotH} x2={B - R} y2={T + plotH} stroke={ACHSE} strokeWidth="1.5" />
            {verlauf.map((r, i) =>
              r.alter % 5 === 0 ? (
                <text key={r.jahr} x={x(i)} y={H - 12} textAnchor="middle" fontSize="13" fill={BESCHRIFTUNG}>
                  {r.alter}
                </text>
              ) : null,
            )}
            <text x={B - 4} y={H - 12} textAnchor="end" fontSize="12" fill={ACHSE}>Alter</text>

            {aktiv !== null && (
              <line x1={x(aktiv)} y1={T} x2={x(aktiv)} y2={T + plotH}
                stroke="#334155" strokeWidth="1" strokeDasharray="3 3" />
            )}

            {/* Unsichtbare, breite Trefferflaechen — das Diagramm selbst hat
                keine Punkte, auf die man zielen koennte. */}
            {verlauf.map((r, i) => (
              <rect
                key={r.jahr}
                x={x(i) - plotB / verlauf.length / 2}
                y={T}
                width={plotB / verlauf.length}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setAktiv(i)}
              />
            ))}
          </svg>

          {d && (
            <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
              <div className="font-bold text-slate-800">{d.jahr} · Alter {d.alter}</div>
              <dl className="mt-1 space-y-0.5">
                <Wert farbe={FARBE.eigen} text="Eigenbeiträge" wert={euro(d.eigenbeitraegeKumuliert)} />
                {/* Eingerueckt und in Rot: gehoert zu den Eigenbeitraegen
                    darueber, zaehlt aber NICHT zum Kapital — es ist der Teil,
                    den die Steuer zurueckgibt. Nur die schwarzen Werte
                    summieren sich unten zum Kapital. */}
                {ersparnisHier > 0 && (
                  <div className="flex items-center justify-between gap-4 pl-3.5">
                    <dt className="text-rose-600">davon Steuerersparnis</dt>
                    <dd className="tabular-nums text-rose-600">{euro(ersparnisHier)}</dd>
                  </div>
                )}
                <Wert farbe={FARBE.zulagen} text="Zulagen" wert={euro(d.zulagenKumuliert)} />
                <Wert farbe={FARBE.gewinn} text="Kursgewinne" wert={euro(d.gewinnKumuliert)} />
              </dl>
              {/* Die Summe steht in derselben Flucht wie die Posten darueber:
                  linksbuendig unter einer Trennlinie musste man die Augen
                  bewegen, um sie mit den Einzelbetraegen zu vergleichen. */}
              <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-slate-100 pt-1">
                <span className="font-bold text-slate-800">Kapital gesamt</span>
                <span className="font-bold tabular-nums text-slate-800">{euro(d.kapital)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      <p className="mt-2 text-xs leading-relaxed text-slate-500">{zusammenfassung}</p>
    </figure>
  );
}

function Wert({ farbe, text, wert }: { farbe: string; text: string; wert: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="flex items-center gap-1.5 text-slate-600">
        <span className="h-2 w-2 rounded-sm" style={{ background: farbe }} aria-hidden />
        {text}
      </dt>
      <dd className="tabular-nums text-slate-800">{wert}</dd>
    </div>
  );
}
