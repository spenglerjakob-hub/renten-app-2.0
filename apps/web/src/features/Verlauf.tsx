import { useMemo, useState, useId } from 'react';
import type { ProjektionsErgebnis } from '@renten/engine';
import { euro } from '../components/Feld';
import { Karte } from '../components/stil';
import { useSchmal } from '../components/useSchmal';

/*
 * Die Farben des Diagramms aus den Rollen des Stils: Daten einfarbig
 * abgestuft — Stein fuer die Erwerbsphase, Asche fuer die gemischte Phase,
 * Tinte fuer den Ruhestand —, der Bedarf als die eine Linie in Cyan. Das
 * Cyan ist die Kante (Cyan Edge): Die hellere Signalfarbe erreicht als
 * duenne Linie auf Weiss keine 3:1.
 */
const FARBE = {
  erwerb: 'rgb(var(--ui-luecke))',
  gemischt: 'rgb(var(--ui-daten-3))',
  ruhestand: 'rgb(var(--ui-tinte))',
  bedarf: 'rgb(var(--ui-knopf-rand))',
  gitter: 'rgb(var(--ui-linie))',
  achse: 'rgb(var(--ui-asche))',
  schrift: 'rgb(var(--ui-schiefer))',
} as const;

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
  const schmal = useSchmal();

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
  /*
    Schmalere viewBox auf dem Telefon statt erzwungener Mindestbreite: ein
    SVG skaliert seinen Inhalt mit, also schrumpfte die Achsenschrift von 11
    auf reale vier Punkte, sobald 860 Einheiten auf 330 Bildschirmpunkte
    fielen. Bei 360 Einheiten steht der Massstab wieder nahe 1:1.
  */
  const B = schmal ? 360 : 860;
  const H = schmal ? 250 : 300;
  const L = schmal ? 40 : 62;
  // Genug Rand, dass die letzte Altersmarke ("100") nicht am Rand abschneidet.
  const R = schmal ? 18 : 12;
  const T = 12, U = 34;
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
      `Zu Rentenbeginn (Alter ${start.alter}) beträgt das Haushaltsnetto ${euro(start.netto)} pro Monat ` +
      `bei einem Bedarf von ${euro(start.ziel)}. Am Ende des Zeitraums ${euro(ende.netto)} gegenüber ${euro(ende.ziel)} Bedarf.`
    );
  })();

  return (
    <Karte
      titel="Einkommensverlauf"
      klasse="druckbereich"
      rechts={
        <button
          type="button"
          onClick={() => setAlsTabelle((v) => !v)}
          className="rounded-full border border-ui-zweit-rand bg-ui-karte px-3 py-1.5 text-xs font-medium text-ui-tinte transition-colors hover:bg-ui-hover print:hidden"
        >
          {alsTabelle ? 'Als Diagramm' : 'Als Tabelle'}
        </button>
      }
    >
      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ui-schiefer">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ui-luecke" aria-hidden /> Erwerbsphase</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ui-daten-3" aria-hidden /> gemischt</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ui-tinte" aria-hidden /> Ruhestand</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-ui-knopf-rand" aria-hidden /> Bedarf</span>
      </div>

      {alsTabelle ? (
        <div className="max-h-96 overflow-auto">
          {/*
            Auf dem Telefon bleiben Jahr, Alter und die beiden Betraege. Die
            Phase faellt weg — sie ist die einzige Spalte, die das Diagramm
            schon ueber die Farbe erzaehlt, und sie kostete hier ein Fuenftel
            der Breite.
          */}
          <table className="w-full text-xs sm:text-sm">
            <caption className="sr-only">Haushaltsnetto und Bedarf je Kalenderjahr</caption>
            <thead className="sticky top-0 bg-ui-karte">
              <tr className="border-b border-ui-linie text-left text-xs font-medium text-ui-schiefer">
                <th scope="col" className="py-2 pr-2">Jahr</th>
                <th scope="col" className="pr-2">Alter</th>
                <th scope="col" className="hidden pr-2 sm:table-cell">Phase</th>
                <th scope="col" className="pr-2 text-right">Netto/Monat</th>
                <th scope="col" className="text-right">Bedarf</th>
              </tr>
            </thead>
            <tbody>
              {daten.map((d) => (
                <tr key={d.jahr} className="border-b border-ui-linie/60">
                  <td className="py-1.5 pr-2 tabular-nums">{d.jahr}</td>
                  <td className="pr-2 tabular-nums">{d.alter}</td>
                  <td className="hidden pr-2 text-xs text-ui-schiefer sm:table-cell">
                    {d.ruhestand ? 'Ruhestand' : d.gemischt ? 'gemischt' : 'Erwerb'}
                  </td>
                  <td className="pr-2 text-right tabular-nums">{euro(d.netto)}</td>
                  <td className="text-right tabular-nums text-ui-schiefer">{euro(d.ziel)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /*
          `overflow-x-auto` bleibt fuer breitere Schirme, wo die Mindestbreite
          noch gilt; auf dem Telefon gibt es nichts mehr zu schieben.
        */
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${B} ${H}`} className="h-auto w-full sm:min-w-[600px]" role="img" aria-labelledby={titelId}>
            <title id={titelId}>{zusammenfassung}</title>
            {[0, 0.25, 0.5, 0.75, 1].map((q) => {
              const v = maxWert * q;
              return (
                <g key={q}>
                  <line x1={L} y1={y(v)} x2={B - R} y2={y(v)} style={{ stroke: FARBE.gitter }} strokeWidth="1" />
                  <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize={schmal ? 12 : 11} style={{ fill: FARBE.schrift }}>
                    {v >= 1000 ? `${Math.round(v / 1000)}k` : Math.round(v)}
                  </text>
                </g>
              );
            })}
            {daten.map((d, i) => {
              const h = Math.max(0, plotH - (y(d.netto) - T));
              const farbe = d.ruhestand ? FARBE.ruhestand : d.gemischt ? FARBE.gemischt : FARBE.erwerb;
              return (
                <rect key={d.jahr} x={x(i) - balkenBreite / 2} y={y(d.netto)}
                  width={balkenBreite} height={h} style={{ fill: farbe }} rx="1.5" />
              );
            })}
            {ersterRuhestand > 0 && (
              <line x1={x(ersterRuhestand)} y1={T} x2={x(ersterRuhestand)} y2={T + plotH}
                style={{ stroke: FARBE.schrift }} strokeWidth="1" strokeDasharray="3 3" />
            )}
            <path d={zielPfad} fill="none" style={{ stroke: FARBE.bedarf }} strokeWidth="2" />
            <line x1={L} y1={T + plotH} x2={B - R} y2={T + plotH} style={{ stroke: FARBE.achse }} strokeWidth="1.5" />
            {daten.map((d, i) =>
              d.alter % (schmal ? 10 : 5) === 0 ? (
                <text key={d.jahr} x={x(i)} y={H - 12} textAnchor="middle" fontSize={schmal ? 12 : 11} style={{ fill: FARBE.schrift }}>
                  {d.alter}
                </text>
              ) : null,
            )}
            {/* Rechts statt links: auf dem Telefon stand die Achsen-
                bezeichnung sonst unmittelbar unter der ersten Altersmarke. */}
            <text
              x={schmal ? B - R : L}
              y={H - 1}
              textAnchor={schmal ? 'end' : 'start'}
              fontSize={schmal ? 11 : 10}
              style={{ fill: FARBE.schrift }}
            >
              Alter
            </text>
          </svg>
        </div>
      )}

      <p className="mt-3 text-xs leading-relaxed text-ui-schiefer">{zusammenfassung}</p>
    </Karte>
  );
}
