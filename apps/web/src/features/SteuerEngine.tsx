import { useState } from 'react';
import { Calculator, ChevronDown, ChevronUp } from 'lucide-react';
import type { ProjektionsErgebnis, Jahreszeile } from '@renten/engine';
import { euro, prozent } from '../components/Feld';
import { useSzenario } from '../store/szenario';
import { personNameAus } from './personen';

function Kachel({
  titel, wert, erklaerung, akzent, farbe,
}: {
  titel: string; wert: string; erklaerung: string; akzent?: boolean; farbe?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded border border-slate-700 bg-slate-800 p-2.5 sm:p-3">
      {akzent && <div className="absolute right-0 top-0 h-full w-1 bg-emerald-500" />}
      <div className="mb-0.5 text-[9px] uppercase text-slate-400 sm:mb-1 sm:text-[10px]">{titel}</div>
      <div className={`text-sm font-bold tabular-nums sm:text-lg ${farbe ?? 'text-white'}`}>{wert}</div>
      <div className="mt-1 text-[8px] leading-tight text-slate-500 sm:text-[9px]">{erklaerung}</div>
    </div>
  );
}

/**
 * Die dunkle „Steuer- & Abgaben-Engine" des urspruenglichen Entwurfs: macht
 * sichtbar, wie aus dem Brutto das Netto wird.
 */
export function SteuerEngine({
  ergebnis, zeile, faktor,
}: {
  ergebnis: ProjektionsErgebnis;
  zeile: Jahreszeile;
  faktor: number;
}) {
  const [offen, setOffen] = useState(false);
  // Der Selektor darf NICHTS erzeugen: `personen` ist eine stabile Referenz,
  // ein neues Array bei jedem Aufruf hielte zustand fuer eine Aenderung und
  // rendert endlos (React-Fehler #185, siehe Vertraege.tsx).
  const personen = useSzenario((x) => x.szenario.personen);

  const steuerfrei = ergebnis.freibetraege.reduce((s, x) => s + x.wert.jahresbetrag, 0);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800 text-slate-200 shadow-sm print:hidden">
      <button
        type="button"
        onClick={() => setOffen((v) => !v)}
        aria-expanded={offen}
        className="flex w-full items-center justify-between p-3 transition-colors hover:bg-slate-700 sm:p-4"
      >
        <span className="flex items-center gap-2 sm:gap-3">
          <span className="rounded-lg bg-indigo-500/20 p-1.5 text-indigo-400 sm:p-2">
            <Calculator className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
          </span>
          <span className="text-left">
            <span className="block text-xs font-bold text-white sm:text-sm">
              Steuer- &amp; Abgaben-Engine
            </span>
            <span className="block text-[9px] text-slate-400 sm:text-[10px]">
              Transparente Ansicht der Progressions- und KV/PV-Berechnung
            </span>
          </span>
        </span>
        {offen
          ? <ChevronUp className="h-4 w-4 shrink-0 text-slate-400 sm:h-5 sm:w-5" aria-hidden />
          : <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 sm:h-5 sm:w-5" aria-hidden />}
      </button>

      {offen && (
        <div className="space-y-3 border-t border-slate-700 bg-slate-900 p-3 text-xs sm:space-y-4 sm:p-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-4">
            <Kachel
              titel="Steuer-Basis (zvE)"
              wert={euro(zeile.zve * faktor)}
              erklaerung="Jährl. zu versteuerndes Einkommen"
            />
            <Kachel
              titel="Steuerfreier Anteil"
              wert={euro(steuerfrei * faktor)}
              erklaerung="Dank Versorgungs-/Rentenfreibetrag"
              akzent
              farbe="text-emerald-400"
            />
            <Kachel
              titel="Durchschnittssteuer"
              wert={prozent(zeile.durchschnittssatz)}
              erklaerung="Ihre reale prozentuale Belastung"
              farbe="text-indigo-400"
            />
            <Kachel
              titel="Grenzsteuersatz"
              wert={prozent(zeile.grenzsatz)}
              erklaerung="Belastung des nächsten Euro"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-4">
            <Kachel
              titel="KV/PV Abzug (p. a.)"
              wert={euro(zeile.kvPvGesamt * faktor)}
              erklaerung="Mindert das zvE (Steuervorteil)"
            />
            <Kachel
              titel="Steuer gesamt (p. a.)"
              wert={euro(zeile.steuerGesamt * faktor)}
              erklaerung="ESt, Soli und Kirchensteuer"
            />
            <Kachel
              titel="Brutto (p. a.)"
              wert={euro(zeile.bruttoGesamt * faktor)}
              erklaerung="Alle Einkunftsarten zusammen"
            />
            <Kachel
              titel="Netto (p. a.)"
              wert={euro(zeile.nettoGesamt * faktor)}
              erklaerung="Was tatsächlich ankommt"
              farbe="text-emerald-400"
            />
          </div>

          <p className="text-[10px] leading-relaxed text-slate-400">
            Für die Frage, ob sich eine zusätzliche Einzahlung lohnt, ist allein der{' '}
            <strong className="text-slate-200">Grenzsteuersatz</strong> maßgeblich — er gilt für
            den nächsten verdienten Euro. Der Durchschnittssatz beschreibt nur die
            Gesamtbelastung.
          </p>

          {ergebnis.freibetraege.length > 0 && (
            <div className="space-y-2 border-t border-slate-700 pt-3">
              {ergebnis.freibetraege.map((fb) => (
                <p key={fb.personId} className="text-[10px] leading-relaxed text-slate-400">
                  <strong className="text-slate-200">{personNameAus(personen, fb.personId)}:</strong>{' '}
                  {fb.art === 'rente'
                    ? `Rentenfreibetrag ${euro(fb.wert.jahresbetrag)} pro Jahr (Besteuerungsanteil ${prozent(fb.wert.besteuerungsanteil ?? 0, 1)}, Kohorte ${fb.wert.kohortenjahr}).`
                    : `Versorgungsfreibetrag ${euro(fb.wert.jahresbetrag)} pro Jahr inkl. Zuschlag (Kohorte ${fb.wert.kohortenjahr}).`}{' '}
                  Dieser Betrag bleibt lebenslang unverändert, während die Bezüge steigen.
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
