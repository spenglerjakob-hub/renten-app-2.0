import type { Jahreszeile } from '@renten/engine';
import { euro, prozent } from '../components/Feld';
import { Seite, Text, GrosseZahl } from './Bausteine';

const B = 720, H = 250, L = 58, R = 12, T = 12, U = 30;

/**
 * Dieselben Jahre in heutiger Kaufkraft — als EIN Bild.
 *
 * VORHER stand hier eine Tabelle mit vier Zahlenspalten ueber sieben Zeilen:
 * Netto nominal, Netto heute, Bedarf nominal, Bedarf heute. Wer nicht taeglich
 * mit zwei Massstaeben umgeht, kann daraus nichts ablesen — und die Sprunge in
 * der Nettospalte (Uebergangsjahre, auslaufende Auszahlplaene) standen
 * unkommentiert daneben.
 *
 * Jetzt: eine fallende Kurve gegen eine waagerechte Linie. Der Schnittpunkt
 * IST die Aussage. Gerechnet wird nichts Neues; `kaufkraftfaktor` steht in
 * jeder Zeile.
 */
export function Kaufkraft({
  zeilen, inflation,
}: {
  zeilen: readonly Jahreszeile[];
  inflation: number;
}) {
  if (zeilen.length === 0) return null;

  const erste = zeilen[0]!;
  const letzte = zeilen[zeilen.length - 1]!;
  const heute = (z: Jahreszeile, n: number) => n / z.kaufkraftfaktor;

  /**
   * Ab welchem Jahr das Netto den Bedarf nicht mehr deckt.
   *
   * Der Vergleich ist masstabsunabhaengig: dividiert man Netto und Bedarf
   * durch denselben Kaufkraftfaktor, kippt er im selben Jahr.
   */
  const kippt = zeilen.find((z) => z.nettoMonat < z.zielNettoMonat);
  const anfangsGedeckt = erste.nettoMonat >= erste.zielNettoMonat;

  const plotB = B - L - R;
  const plotH = H - T - U;
  const werte = zeilen.map((z) => heute(z, z.nettoMonat));
  const bedarf = heute(erste, erste.zielNettoMonat);
  const roh = Math.max(...werte, bedarf) * 1.15 || 1;
  const schritt = Math.pow(10, Math.floor(Math.log10(roh / 4))) * 5;
  const max = Math.ceil(roh / schritt) * schritt;

  const x = (i: number) => L + (plotB / Math.max(1, zeilen.length - 1)) * i;
  const y = (w: number) => T + plotH - (w / max) * plotH;

  const kurve = werte
    .map((w, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(w).toFixed(1)}`)
    .join(' ');
  // Flaeche unter der Kurve, damit das Abschmelzen sichtbar wird.
  const flaeche = `${kurve} L ${x(zeilen.length - 1).toFixed(1)} ${(T + plotH).toFixed(1)} L ${L} ${(T + plotH).toFixed(1)} Z`;

  return (
    <Seite
      titel="Was Ihr Geld dann noch wert ist"
      nummer={`Bei ${prozent(inflation)} Inflation pro Jahr`}
    >
      <div className="grid grid-cols-3 gap-3">
        <GrosseZahl
          titel={`Mit ${erste.alterA} · ${erste.jahr}`}
          wert={euro(heute(erste, erste.nettoMonat))}
          hinweis={`in heutigem Geld · nominal ${euro(erste.nettoMonat)}`}
        />
        <GrosseZahl
          titel={`Mit ${letzte.alterA} · ${letzte.jahr}`}
          wert={euro(heute(letzte, letzte.nettoMonat))}
          hinweis={`in heutigem Geld · nominal ${euro(letzte.nettoMonat)}`}
        />
        <GrosseZahl
          titel={`Ein Euro ist ${letzte.jahr} noch wert`}
          wert={`${(100 / letzte.kaufkraftfaktor).toFixed(0)} Cent`}
          hinweis="gemessen an heute"
        />
      </div>

      <div className="mt-4">
        <svg viewBox={`0 0 ${B} ${H}`} className="h-auto w-full" role="img"
          aria-label="Netto in heutiger Kaufkraft gegen den gleichbleibenden Bedarf">
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <g key={t}>
              <line x1={L} y1={y(max * t)} x2={B - R} y2={y(max * t)} stroke="#e2e8f0" strokeWidth="1" />
              <text x={L - 6} y={y(max * t) + 3} textAnchor="end" fontSize="9" fill="#64748b">
                {Math.round(max * t).toLocaleString('de-DE')}
              </text>
            </g>
          ))}

          <path d={flaeche} fill="#3b82f6" fillOpacity="0.12" />
          <path d={kurve} fill="none" stroke="#3b82f6" strokeWidth="2" />

          {/* Der Bedarf bleibt in heutiger Kaufkraft konstant — eine Waagerechte. */}
          <line
            x1={L} y1={y(bedarf)} x2={B - R} y2={y(bedarf)}
            stroke="#f43f5e" strokeWidth="1.5" strokeDasharray="5 3"
          />

          {/* Uebergangsjahre markieren: sie erklaeren den Sprung am Anfang. */}
          {zeilen.map((z, i) =>
            z.vollstaendigImRuhestand ? null : (
              <circle key={z.jahr} cx={x(i)} cy={y(werte[i]!)} r="3" fill="#fbbf24" stroke="#fff" strokeWidth="1" />
            ),
          )}

          <line x1={L} y1={T + plotH} x2={B - R} y2={T + plotH} stroke="#94a3b8" strokeWidth="1" />
          {zeilen.map((z, i) =>
            z.alterA % 5 === 0 ? (
              <text key={z.jahr} x={x(i)} y={H - 12} textAnchor="middle" fontSize="9" fill="#64748b">
                {z.alterA}
              </text>
            ) : null,
          )}
          <text x={L - 6} y={H - 12} textAnchor="end" fontSize="8" fill="#94a3b8">Alter</text>
        </svg>

        <div className="mt-1 flex flex-wrap gap-4 text-[9px] text-slate-600">
          <span className="flex items-center gap-1">
            <span className="h-0.5 w-4" style={{ background: '#3b82f6' }} /> Ihr Netto in heutigem Geld
          </span>
          <span className="flex items-center gap-1">
            <span className="h-0.5 w-4" style={{ background: '#f43f5e' }} /> Ihr Bedarf ({euro(bedarf)})
          </span>
          {zeilen.some((z) => !z.vollstaendigImRuhestand) && (
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ background: '#fbbf24' }} /> Übergangsjahr,
              noch mit Erwerbseinkommen
            </span>
          )}
        </div>
      </div>

      <div
        className={`mt-4 break-inside-avoid rounded-lg border p-3 ${
          kippt ? (anfangsGedeckt ? 'border-amber-300 bg-amber-50' : 'border-rose-300 bg-rose-50')
            : 'border-emerald-300 bg-emerald-50'
        }`}
      >
        <div className="text-[9px] font-bold uppercase tracking-wider text-slate-600">
          Das Wichtigste dieser Seite
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-800">
          {!kippt ? (
            <>
              Ihre Kurve bleibt über den ganzen Ruhestand oberhalb der Bedarfslinie — auch dann
              noch, wenn die Preise bis {letzte.jahr} weiter steigen.
            </>
          ) : anfangsGedeckt ? (
            <>
              Zu Beginn liegt Ihre Kurve über der Bedarfslinie. Im Jahr <strong>{kippt.jahr}</strong>{' '}
              — Sie sind dann <strong>{kippt.alterA}</strong> — schneidet sie die Linie: Ab da
              reicht das Netto nicht mehr. Nicht weil die Rente sinkt, sondern weil die Preise
              schneller steigen als Ihre Bezüge.
            </>
          ) : (
            <>
              Ihre Kurve liegt von Beginn an unter der Bedarfslinie, und der Abstand wächst mit
              jedem Jahr: aus {euro(Math.max(0, bedarf - heute(erste, erste.nettoMonat)))} im Monat
              mit {erste.alterA} werden{' '}
              {euro(Math.max(0, heute(letzte, letzte.zielNettoMonat) - heute(letzte, letzte.nettoMonat)))}{' '}
              mit {letzte.alterA}.
            </>
          )}
        </p>
      </div>

      <Text>
        <strong>Warum die Linie waagerecht ist.</strong> Ihr Bedarf steigt in Euro betrachtet
        Jahr für Jahr — dieselbe Lebenshaltung kostet ja immer mehr. In heutiger Kaufkraft
        gerechnet bleibt er dagegen konstant: Sie wollen sich später schlicht dasselbe leisten
        können wie heute. Die blaue Kurve zeigt, was Ihre Bezüge davon abdecken.
      </Text>
    </Seite>
  );
}
