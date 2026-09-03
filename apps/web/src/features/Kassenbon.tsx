import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { versorgungsluecke, type ProjektionsErgebnis, type Jahreszeile } from '@renten/engine';
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
        {kinder.map((p) => {
          /*
            REINE ABZUGSZEILE. Ein Posten ohne Brutto, der nur Beitraege
            traegt, ist kein Einkommen — das sind die Beitraege auf eine
            Kapitalleistung (§ 229 SGB V), die zehn Jahre lang laufen, obwohl
            das Kapital laengst ausgezahlt ist. Als gewoehnliche Einkunftsart
            mit negativem Netto sah das nach einem Rechenfehler aus.
          */
          const nurAbzug = p.bruttoJahr <= 0 && p.kvPvJahr > 0;
          return (
            <div
              key={p.id}
              className={`rounded-lg border p-2.5 sm:p-3 ${
                nurAbzug ? 'border-rose-100 bg-rose-50/60' : 'border-slate-100 bg-slate-50'
              }`}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className={`truncate text-[11px] font-semibold sm:text-sm ${nurAbzug ? 'text-rose-900' : f.text}`}>
                  {p.bezeichnung}
                </span>
                <span className={`whitespace-nowrap text-[11px] font-bold tabular-nums sm:text-base ${
                  nurAbzug ? 'text-rose-700' : 'text-slate-800'
                }`}>
                  {w(p.nettoJahr)}
                </span>
              </div>
              {nurAbzug ? (
                <div className="text-[11px] leading-relaxed text-rose-900/80 sm:text-[10px]">
                  Kein Einkommen, sondern ein Abzug: Auf eine Kapitalleistung sind zehn Jahre
                  lang Beiträge zu zahlen (§ 229 SGB V). Das Kapital selbst steht unten bei den
                  Einmalzahlungen.
                </div>
              ) : (
                <div className="flex flex-col gap-1 text-[11px] text-slate-500 sm:flex-row sm:items-end sm:justify-between sm:gap-0 sm:text-[10px]">
                  <span>Brutto: {w(p.bruttoJahr)}</span>
                  <span className="leading-tight text-rose-500 sm:text-right">
                    KV/PV: {w(p.kvPvJahr)} | Steuer: {w(p.steuerJahr)}
                  </span>
                </div>
              )}
            </div>
          );
        })}
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
}: {
  ergebnis: ProjektionsErgebnis;
  zeile: Jahreszeile;
  kaufkraftHeute: boolean;
}) {
  const f = kaufkraftHeute ? 1 / zeile.kaufkraftfaktor : 1;
  const w = (n: number) => euro((n / 12) * f);

  /**
   * Abzinsung fuer ein BELIEBIGES Jahr.
   *
   * Die Einmalzahlungen fallen in ihrem eigenen Jahr an, nicht im
   * Ruhestandsjahr. Sie standen bisher immer nominal da — auch bei
   * eingeschaltetem Kaufkraft-Schalter, also nominale Betraege mitten
   * zwischen abgezinsten.
   */
  const kaufkraft = (jahr: number) => {
    if (!kaufkraftHeute) return 1;
    const z = ergebnis.zeilen.find((x) => x.jahr === jahr);
    return z ? 1 / z.kaufkraftfaktor : f;
  };

  const nachSchicht = ([1, 2, 3] as const).map((sch) => ({
    schicht: sch,
    posten: zeile.posten.filter((p) => p.schicht === sch && p.nettoJahr !== 0),
    netto: zeile.posten.filter((p) => p.schicht === sch).reduce((s, p) => s + p.nettoJahr, 0),
  }));

  const luecke = versorgungsluecke(zeile);
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
        <div className="mb-1 flex justify-between text-[11px] font-bold uppercase text-slate-500 sm:text-[10px]">
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
        <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] font-semibold text-slate-500 sm:mt-2 sm:gap-3 sm:text-[9px]">
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

      {/*
        Einmalzahlungen stehen BEWUSST ausserhalb der Monatsrechnung. Sie in
        das Monatsnetto zu mischen liesse die Zahl im Rentenjahr sinnlos nach
        oben springen.
      */}
      {ergebnis.kapitalauszahlungen.length > 0 && (
        <div className="mt-5 rounded-lg border border-indigo-100 bg-indigo-50/50 p-3 sm:mt-6 sm:p-4">
          <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-indigo-900 sm:text-xs">
            Einmalige Kapitalauszahlungen
          </h3>
          <div className="space-y-2">
            {ergebnis.kapitalauszahlungen.map((a) => (
              <div key={a.vertragId} className="rounded-md bg-white px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[11px] font-semibold text-indigo-900 sm:text-sm">
                    {a.bezeichnung} <span className="font-normal text-slate-500">({a.jahr})</span>
                  </span>
                  <span className="whitespace-nowrap text-[11px] font-bold tabular-nums text-slate-800 sm:text-base">
                    {euro(a.nettoKapital * kaufkraft(a.jahr))}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap justify-between gap-x-3 text-[11px] text-slate-500 sm:text-[10px]">
                  <span>Brutto: {euro(a.bruttoKapital * kaufkraft(a.jahr))}</span>
                  {/*
                    NICHT "Abgeltungsteuer": beim Depot stimmt das, bei einer
                    bAV-Kapitalleistung faellt die tarifliche Einkommensteuer
                    an (§ 22 Nr. 5 EStG), bei der privaten Kapitalwahl je nach
                    Laufzeit das eine oder das andere.
                  */}
                  <span className="text-rose-500">
                    Steuer: {euro(a.steuer * kaufkraft(a.jahr))}
                  </span>
                </div>
                {/*
                  Die Beitraege des § 229 SGB V laufen 120 Monate und stehen
                  deshalb OBEN in der Monatsrechnung. Hier werden sie nur
                  benannt — sonst fehlt die Bruecke zu der Zahl, die der
                  Vertrags-TUEV als „Netto-Kapital" ausweist.
                */}
                {a.kvPvGesamt > 0 && (
                  <div className="mt-1 border-t border-slate-100 pt-1 text-[11px] leading-relaxed text-slate-500 sm:text-[10px]">
                    Dazu {euro(a.kvPvGesamt * kaufkraft(a.jahr))} Kranken- und
                    Pflegeversicherung über 120 Monate — oben im Monatsnetto bereits abgezogen.
                    Nach allen Abzügen bleiben{' '}
                    <strong className="text-slate-700">
                      {euro(Math.max(0, a.nettoKapital - a.kvPvGesamt) * kaufkraft(a.jahr))}
                    </strong>.
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-600">
            Einmalbeträge — im monatlichen Netto oben sind sie <strong>nicht</strong> enthalten.
          </p>
        </div>
      )}
    </div>
  );
}
