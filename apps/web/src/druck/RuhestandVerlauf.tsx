import type { Jahreszeile } from '@renten/engine';
import { euro } from '../components/Feld';
import { Seite, Tabelle, Zeile, Text } from './Bausteine';

const B = 720, H = 230, L = 56, R = 10, T = 10, U = 26;

/**
 * Der Verlauf im Ruhestand.
 *
 * Zwei Unterschiede zum Bildschirm, beide notwendig fuer Papier:
 *
 *  1. Nur die Ruhestandsjahre (siehe ruhestandsfenster im Rechenkern). Der
 *     Bildschirm zeichnet bis zum 100. Lebensjahr; bei rund 60 Balken faellt
 *     die Balkenbreite auf ihren Mindestwert und ergibt Haarstriche.
 *  2. KEIN Scrollrahmen. Die Bildschirmfassung steckt in `overflow-x-auto`
 *     mit `min-w-[600px]` — auf Papier wird so nicht skaliert, sondern
 *     abgeschnitten.
 */
export function RuhestandVerlauf({ zeilen }: { zeilen: readonly Jahreszeile[] }) {
  if (zeilen.length === 0) {
    return (
      <Seite titel="Ihre Einkünfte im Ruhestand">
        <Text>Für den Ruhestand liegen keine Jahre vor — bitte Geburtsdatum und Rentenbeginn prüfen.</Text>
      </Seite>
    );
  }

  const plotB = B - L - R;
  const plotH = H - T - U;
  const roh = Math.max(...zeilen.map((z) => Math.max(z.nettoMonat, z.zielNettoMonat))) * 1.1 || 1;
  // Auf einen glatten Schritt aufrunden: "10.500" liest sich, "10300" nicht.
  const schritt = Math.pow(10, Math.floor(Math.log10(roh / 4))) * 5;
  const max = Math.ceil(roh / schritt) * schritt;
  const x = (i: number) => L + (plotB / zeilen.length) * (i + 0.5);
  const y = (w: number) => T + plotH - (w / max) * plotH;
  const breite = Math.max(3, (plotB / zeilen.length) * 0.7);

  const bedarf = zeilen
    .map((z, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(z.zielNettoMonat).toFixed(1)}`)
    .join(' ');

  // Jedes fuenfte Jahr in der Tabelle: eine Zeile je Jahr waeren bis zu 31
  // Zeilen und damit eine Zahlenwand, die niemand liest.
  const tabelle = zeilen.filter((z, i) => z.alterA % 5 === 0 || i === zeilen.length - 1);

  return (
    <Seite
      titel="Ihre Einkünfte im Ruhestand"
      nummer={`Alter ${zeilen[0]!.alterA} bis ${zeilen[zeilen.length - 1]!.alterA} · Beträge des jeweiligen Jahres`}
    >
      <svg viewBox={`0 0 ${B} ${H}`} className="h-auto w-full" role="img" aria-label="Netto und Bedarf im Ruhestand">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={L} y1={y(max * t)} x2={B - R} y2={y(max * t)} stroke="#e2e8f0" strokeWidth="1" />
            <text x={L - 6} y={y(max * t) + 3} textAnchor="end" fontSize="9" fill="#64748b">
              {Math.round(max * t).toLocaleString('de-DE')}
            </text>
          </g>
        ))}

        {zeilen.map((z, i) => (
          <rect
            key={z.jahr}
            x={x(i) - breite / 2}
            y={y(z.nettoMonat)}
            width={breite}
            height={Math.max(0, T + plotH - y(z.nettoMonat))}
            fill={z.vollstaendigImRuhestand ? '#6366f1' : '#fbbf24'}
          />
        ))}

        <path d={bedarf} fill="none" stroke="#f43f5e" strokeWidth="1.5" strokeDasharray="4 3" />

        <line x1={L} y1={T + plotH} x2={B - R} y2={T + plotH} stroke="#94a3b8" strokeWidth="1" />
        {zeilen.map((z, i) =>
          z.alterA % 5 === 0 ? (
            <text key={z.jahr} x={x(i)} y={H - 10} textAnchor="middle" fontSize="9" fill="#64748b">
              {z.alterA}
            </text>
          ) : null,
        )}
        <text x={L - 6} y={H - 10} textAnchor="end" fontSize="8" fill="#94a3b8">Alter</text>
      </svg>

      <div className="mt-1 flex gap-4 text-[10px] text-slate-600">
        <span className="flex items-center gap-1">
          <span className="h-2 w-3 rounded-sm" style={{ background: '#6366f1' }} /> Netto im Monat
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-3 rounded-sm" style={{ background: '#fbbf24' }} /> Übergangsjahr
        </span>
        <span className="flex items-center gap-1">
          <span className="h-0.5 w-3" style={{ background: '#f43f5e' }} /> gewünschtes Netto
        </span>
      </div>

      <div className="mt-4">
        <Tabelle kopf={['Jahr / Alter', 'Brutto', 'KV/PV', 'Steuer', 'Netto im Monat', 'Bedarf']}>
          {tabelle.map((z) => (
            <Zeile
              key={z.jahr}
              zellen={[
                `${z.jahr} · ${z.alterA} J.`,
                euro(z.bruttoGesamt / 12),
                euro(z.kvPvGesamt / 12),
                euro(z.steuerGesamt / 12),
                euro(z.nettoMonat),
                euro(z.zielNettoMonat),
              ]}
            />
          ))}
        </Tabelle>
      </div>

      <Text>
        Alle Beträge in dieser Übersicht sind Beträge des jeweiligen Jahres — das, was später auf
        dem Kontoauszug steht. Was sie in heutigem Geld wert sind, zeigt die nächste Seite.
      </Text>
    </Seite>
  );
}
