import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ProjektionsErgebnis, Jahreszeile } from '@renten/engine';
import { euro, prozent } from '../components/Feld';

/** Farbgebung der drei Schichten, wie im urspruenglichen Entwurf. */
const SCHICHT = {
  1: { titel: 'Schicht 1 (Basis / Pension)', rahmen: 'border-blue-100', text: 'text-blue-900', balken: 'bg-blue-500', punkt: 'bg-blue-500' },
  2: { titel: 'Schicht 2 (Zusatz)', rahmen: 'border-purple-100', text: 'text-purple-900', balken: 'bg-purple-500', punkt: 'bg-purple-500' },
  3: { titel: 'Schicht 3 (Privat)', rahmen: 'border-emerald-100', text: 'text-emerald-900', balken: 'bg-emerald-500', punkt: 'bg-emerald-500' },
} as const;

function SchichtBlock({
  schicht, netto, kinder, w,
}: {
  schicht: 1 | 2 | 3;
  netto: number;
  kinder: Jahreszeile['posten'];
  w: (n: number) => string;
}) {
  const [offen, setOffen] = useState(true);
  const f = SCHICHT[schicht];

  return (
    <div className={`overflow-hidden rounded-lg border ${f.rahmen} print:border-slate-300`}>
      <button
        type="button"
        onClick={() => setOffen((v) => !v)}
        aria-expanded={offen}
        className="druck-kopf flex w-full items-center justify-between gap-3 border-b border-slate-50 bg-white p-2.5 text-left sm:p-4"
      >
        <span className={`text-[11px] font-bold sm:text-base ${f.text}`}>{f.titel}</span>
        <span className="flex items-center gap-2">
          <span className="text-[11px] font-bold tabular-nums sm:text-base">{w(netto)}</span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-slate-400 transition-transform print:hidden ${offen ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </span>
      </button>

      <div className={`space-y-2 bg-white p-2.5 text-xs sm:p-3 ${offen ? 'block' : 'hidden'} druck-inhalt`}>
        {kinder.map((p) => (
          <div key={p.id} className="rounded-lg border border-slate-100 bg-slate-50 p-2.5 sm:p-3">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className={`truncate text-[11px] font-semibold sm:text-sm ${f.text}`}>
                {p.bezeichnung}
              </span>
              <span className="whitespace-nowrap text-[11px] font-bold tabular-nums text-slate-800 sm:text-base">
                {w(p.nettoJahr)}
              </span>
            </div>
            <div className="flex flex-col gap-1 text-[9px] text-slate-500 sm:flex-row sm:items-end sm:justify-between sm:gap-0 sm:text-[10px]">
              <span>Brutto: {w(p.bruttoJahr)}</span>
              <span className="leading-tight text-rose-500 sm:text-right">
                KV/PV: {w(p.kvPvJahr)} | Steuer: {w(p.steuerJahr)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Die Zeile kommt von aussen, damit Kassenbon, Steuer-Engine und Fussleiste
 * garantiert dieselbe zeigen — und damit bei fehlender Zeitachse dieselbe
 * Nullzeile greift, statt dass hier eine abweichende Ersatzkarte erscheint.
 */
export function Kassenbon({
  ergebnis, zeile, kaufkraftHeute,
}: { ergebnis: ProjektionsErgebnis; zeile: Jahreszeile; kaufkraftHeute: boolean }) {
  const f = kaufkraftHeute ? 1 / zeile.kaufkraftfaktor : 1;
  const w = (n: number) => euro((n / 12) * f);

  const nachSchicht = ([1, 2, 3] as const).map((sch) => ({
    schicht: sch,
    posten: zeile.posten.filter((p) => p.schicht === sch && p.nettoJahr !== 0),
    netto: zeile.posten.filter((p) => p.schicht === sch).reduce((s, p) => s + p.nettoJahr, 0),
  }));

  const luecke = Math.max(0, zeile.zielNettoMonat - zeile.nettoMonat);
  const skala = Math.max(zeile.zielNettoMonat, zeile.nettoMonat, 1);
  const anteil = (n: number) => `${Math.max(0, (n / 12 / skala) * 100)}%`;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm druckbereich sm:p-6">
      <h2 className="mb-3 text-xs font-bold sm:mb-4 sm:text-sm">
        Ihr Haushalts-Netto im Jahr {zeile.jahr}
        <span className="ml-2 font-normal text-slate-500">
          {kaufkraftHeute ? '(Kaufkraft heute)' : '(nominal)'}
        </span>
      </h2>

      {/* Gestapelter Fortschrittsbalken */}
      <div className="mb-5 sm:mb-6">
        <div className="mb-1 flex justify-between text-[9px] font-bold uppercase text-slate-500 sm:text-[10px]">
          <span>Ziel-Erreichung</span>
          <span>
            {luecke > 0
              ? `${prozent(zeile.nettoMonat / Math.max(1, zeile.zielNettoMonat), 1)} erreicht`
              : 'Ziel erreicht / übertroffen'}
          </span>
        </div>
        <div className="flex h-3 w-full overflow-hidden rounded-full border border-slate-200 bg-slate-100 shadow-inner sm:h-4">
          {nachSchicht.map(({ schicht, netto }) =>
            netto <= 0 ? null : (
              <div
                key={schicht}
                style={{ width: anteil(netto) }}
                className={`${SCHICHT[schicht].balken} transition-all duration-500`}
              />
            ),
          )}
          {luecke > 0 && (
            <div style={{ width: `${(luecke / skala) * 100}%` }} className="bg-white transition-all duration-500" />
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-2 text-[8px] font-semibold text-slate-500 sm:mt-2 sm:gap-3 sm:text-[9px]">
          {nachSchicht.map(({ schicht }) => (
            <span key={schicht} className="flex items-center gap-1">
              <span className={`h-1.5 w-1.5 rounded-full sm:h-2 sm:w-2 ${SCHICHT[schicht].punkt}`} />
              Schicht {schicht}
            </span>
          ))}
          {luecke > 0 && (
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full border border-slate-300 bg-white sm:h-2 sm:w-2" />
              Lücke
            </span>
          )}
        </div>
      </div>

      <div className="space-y-2 sm:space-y-3">
        {nachSchicht.map(({ schicht, posten, netto }) =>
          posten.length === 0 ? null : (
            <SchichtBlock key={schicht} schicht={schicht} netto={netto} kinder={posten} w={w} />
          ),
        )}

        <div className="flex items-baseline justify-between rounded-lg bg-slate-900 px-4 py-3 text-white">
          <span className="font-bold">Gesamt-Netto</span>
          <span className="text-xl font-bold tabular-nums">{w(zeile.nettoGesamt)}</span>
        </div>
      </div>
    </div>
  );
}
