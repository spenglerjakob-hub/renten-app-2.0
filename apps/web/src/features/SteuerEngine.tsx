import { useState } from 'react';
import { Calculator, ChevronDown, ChevronUp } from 'lucide-react';
import type { ProjektionsErgebnis, Jahreszeile } from '@renten/engine';
import { euro, prozent } from '../components/Feld';
import { useSzenario } from '../store/szenario';
import { personNameAus } from './personen';

/** Eine Kennzahl der Engine: leises Etikett, die Zahl, darunter was sie bedeutet — einfarbig. */
function Kachel({ titel, wert, erklaerung }: { titel: string; wert: string; erklaerung: string }) {
  return (
    <div>
      <dt className="text-xs text-ui-schiefer">{titel}</dt>
      <dd className="mt-0.5 text-lg font-medium tabular-nums text-ui-tinte">{wert}</dd>
      <dd className="mt-0.5 text-xs leading-snug text-ui-schiefer">{erklaerung}</dd>
    </div>
  );
}

/**
 * Die „Steuer- & Abgaben-Engine" des urspruenglichen Entwurfs: macht
 * sichtbar, wie aus dem Brutto das Netto wird. Frueher dunkel; jetzt eine
 * einklappbare Karte wie die anderen, die Zahlen einfarbig.
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
    <section className="ui-karte overflow-hidden print:hidden">
      <button
        type="button"
        onClick={() => setOffen((v) => !v)}
        aria-expanded={offen}
        className="flex w-full items-center justify-between gap-3 p-5 text-left transition-colors hover:bg-ui-innen sm:px-7 sm:py-6"
      >
        <span className="flex items-center gap-3">
          <span className="ui-innen flex h-10 w-10 shrink-0 items-center justify-center text-ui-tinte">
            <Calculator className="h-5 w-5" aria-hidden />
          </span>
          <span>
            <span className="block text-lg font-medium tracking-[-0.01em] text-ui-tinte sm:text-xl">
              Steuer- &amp; Abgaben-Engine
            </span>
            <span className="mt-0.5 block text-sm text-ui-schiefer">
              Transparente Ansicht der Progressions- und KV/PV-Berechnung
            </span>
          </span>
        </span>
        {offen
          ? <ChevronUp className="h-5 w-5 shrink-0 text-ui-schiefer" aria-hidden />
          : <ChevronDown className="h-5 w-5 shrink-0 text-ui-schiefer" aria-hidden />}
      </button>

      {offen && (
        <div className="space-y-5 px-5 pb-5 sm:px-7 sm:pb-7">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
            <Kachel
              titel="Steuer-Basis (zvE)"
              wert={euro(zeile.zve * faktor)}
              erklaerung="Jährl. zu versteuerndes Einkommen"
            />
            <Kachel
              titel="Steuerfreier Anteil"
              wert={euro(steuerfrei * faktor)}
              erklaerung="Dank Versorgungs-/Rentenfreibetrag"
            />
            <Kachel
              titel="Durchschnittssteuer"
              wert={prozent(zeile.durchschnittssatz)}
              erklaerung="Ihre reale prozentuale Belastung"
            />
            <Kachel
              titel="Grenzsteuersatz"
              wert={prozent(zeile.grenzsatz)}
              erklaerung="Belastung des nächsten Euro"
            />
          </dl>

          {/* Die Jahresbetraege unter einer Haarlinie — wie Posten einer Aufstellung. */}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-5 border-t border-ui-linie pt-5">
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
            />
          </dl>

          <p className="ui-innen px-4 py-3 text-xs leading-relaxed text-ui-tinte/80">
            Für die Frage, ob sich eine zusätzliche Einzahlung lohnt, ist allein der{' '}
            <strong className="font-medium text-ui-tinte">Grenzsteuersatz</strong> maßgeblich — er gilt für
            den nächsten verdienten Euro. Der Durchschnittssatz beschreibt nur die
            Gesamtbelastung.
          </p>

          {ergebnis.freibetraege.length > 0 && (
            <div className="space-y-2 border-t border-ui-linie pt-4">
              {ergebnis.freibetraege.map((fb) => (
                <p key={fb.personId} className="text-xs leading-relaxed text-ui-schiefer">
                  <strong className="font-medium text-ui-tinte">{personNameAus(personen, fb.personId)}:</strong>{' '}
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
    </section>
  );
}
