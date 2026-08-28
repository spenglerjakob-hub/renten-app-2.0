import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import type { ProjektionsErgebnis } from '@renten/engine';
import { BASISJAHR } from '@renten/engine';
import { useSzenario } from '../store/szenario';
import { ProzentFeld, prozent } from '../components/Feld';

/**
 * Erlaeuterung des verwendeten Rechtsstands und der Fortschreibungsannahme.
 *
 * Kurzfassung im Bildschirm, ausfuehrliche Fassung im Druck — damit im PDF
 * nachvollziehbar ist, worauf die Zahlen beruhen.
 */
export function Rechtsstand({
  ergebnis, tarifIndex, rentendynamik, inflation,
}: {
  ergebnis: ProjektionsErgebnis;
  tarifIndex: number;
  rentendynamik: number;
  inflation: number;
}) {
  const setzeAnnahmen = useSzenario((s) => s.setzeAnnahmen);
  const [reglerOffen, setReglerOffen] = useState(false);

  const r = ergebnis.rechtsstand;
  const ohneIndexierung = tarifIndex === 0;
  const vollIndexiert = Math.abs(tarifIndex - rentendynamik) < 0.0005;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm druckbereich">
      <h2 className="mb-2 text-sm font-bold text-slate-700">Rechtsstand und Annahmen</h2>

      <p className="text-slate-600">
        Berechnet nach <strong>Rechtsstand {r.basisjahr}</strong>
        {r.fortgeschriebenAb && (
          <> ; ab {r.fortgeschriebenAb} mit <strong>{prozent(tarifIndex)} p. a.</strong> fortgeschrieben.</>
        )}
      </p>

      {/* Ausfuehrliche Fassung nur im Druck */}
      <div className="mt-3 hidden space-y-3 text-[13px] leading-relaxed text-slate-700 print:block">
        <h3 className="font-bold text-slate-800">Wie die Zahlen zustande kommen</h3>

        <p>
          Steuer- und Sozialversicherungsrecht sind bis einschliesslich {BASISJAHR.jahr} als
          amtlicher Rechtsstand hinterlegt: Tarifeckwerte des § 32a EStG,
          Beitragsbemessungsgrenzen, Beitragssaetze, Bezugsgroesse, Rentenwert und
          Pauschbetraege. Fuer diese Jahre wird ohne Annahme gerechnet.
        </p>

        <p>
          Fuer die Jahre danach existiert noch kein Gesetz. Die Berechnung unterstellt,
          dass der Gesetzgeber die Eckwerte weiter an die Lohnentwicklung anpasst — wie
          er es in der Vergangenheit regelmaessig getan hat. Konkret werden{' '}
          <strong>alle Euro-Betraege mit {prozent(tarifIndex)} pro Jahr fortgeschrieben</strong>,
          waehrend alle Prozentsaetze unveraendert bleiben. Das betrifft den
          Grundfreibetrag und die Zonengrenzen des Steuertarifs, die
          Beitragsbemessungsgrenzen, die Bezugsgroesse und die Pauschbetraege.
        </p>

        <h3 className="font-bold text-slate-800">Warum diese Annahme so viel ausmacht</h3>

        <p>
          Renten- und Versorgungsfreibetrag werden im Jahr des Versorgungsbeginns
          einmal ermittelt und dann als fester Euro-Betrag auf Lebenszeit
          eingefroren. Die Bezuege steigen danach weiter, der Freibetrag nicht.
          Der steuerpflichtige Anteil waechst also Jahr fuer Jahr — das Netto steigt
          langsamer als das Brutto.
        </p>

        <p>
          Wie stark sich das auswirkt, haengt davon ab, ob der Steuertarif
          mitwaechst:
        </p>

        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong>Tarif waechst wie die Renten</strong> ({prozent(rentendynamik)}): Die
            steigenden Bezuege treffen auf entsprechend verschobene Tarifzonen. Die
            Belastung bleibt real weitgehend konstant; es wirkt nur noch der
            eingefrorene Freibetrag.
          </li>
          <li>
            <strong>Tarif waechst langsamer</strong> als die Renten: Zusaetzlich zur
            Freibetragswirkung greift die kalte Progression. Die Steuerquote steigt
            spuerbar an.
          </li>
          <li>
            <strong>Tarif bleibt nominal unveraendert</strong> (0 %): Der ungünstigste
            Fall. Ueber einen 25-jaehrigen Rentenbezug kann die Steuerquote sich
            annaehernd verdoppeln.
          </li>
        </ul>

        <p className="rounded-lg bg-slate-50 p-3">
          <strong>In dieser Auswertung gewaehlt:</strong>{' '}
          {ohneIndexierung
            ? 'keine Indexierung des Steuertarifs (0 %). Das ist die vorsichtigste Annahme — die ausgewiesene Steuerbelastung ist eher zu hoch als zu niedrig.'
            : vollIndexiert
              ? `vollstaendige Indexierung (${prozent(tarifIndex)}, entspricht der Rentendynamik). Das ist die guenstigste realistische Annahme; sie unterstellt, dass der Gesetzgeber die kalte Progression vollstaendig ausgleicht.`
              : `Indexierung mit ${prozent(tarifIndex)} p. a. bei einer Rentendynamik von ${prozent(rentendynamik)}. Der Tarif waechst damit langsamer als die Bezuege — die Steuerquote steigt im Zeitverlauf an.`}
        </p>

        <h3 className="font-bold text-slate-800">Kaufkraft</h3>
        <p>
          Alle Betraege sind nominal ausgewiesen, also in den Euro des jeweiligen
          Jahres. Zur Einordnung wird mit einer Inflation von{' '}
          <strong>{prozent(inflation)} p. a.</strong> gerechnet; die Umschaltung
          &bdquo;Kaufkraft heute&ldquo; zinst die Betraege damit auf das heutige
          Preisniveau ab.
        </p>

        <h3 className="font-bold text-slate-800">Grenzen der Berechnung</h3>
        <p>
          Die Auswertung bildet den Regelfall ab. Nicht beruecksichtigt sind unter
          anderem: Hinterbliebenenversorgung, Erwerbsminderung, Versorgungsausgleich
          nach Scheidung, auslaendische Einkuenfte sowie individuelle
          Werbungskosten und aussergewoehnliche Belastungen. Bei Beamten beruhen
          Besoldungswerte teilweise auf Naeherungen; solche Stellen sind im Bericht
          gekennzeichnet.
        </p>

        <p className="border-t border-slate-200 pt-2 text-xs text-slate-500">
          Diese Auswertung ist eine Modellrechnung und ersetzt keine Steuer-,
          Renten- oder Anlageberatung. Massgeblich sind allein die Bescheide der
          Finanzverwaltung und der Versorgungstraeger.
        </p>
      </div>

      {/*
        Regler fuer die Steuertarif-Indexierung.

        Normalerweise folgt sie der Rentendynamik — das entspricht dem vollen
        Ausgleich der kalten Progression und ist die guenstigste Annahme. Wer
        den realistischeren Fall sehen will (Tarif waechst langsamer als die
        Bezuege, die Steuerquote steigt), setzt sie hier abweichend.
      */}
      <div className="mt-3 border-t border-slate-100 pt-3 print:hidden">
        <button
          type="button"
          onClick={() => setReglerOffen((v) => !v)}
          aria-expanded={reglerOffen}
          className="flex items-center gap-1.5 text-xs font-medium text-indigo-700 hover:underline"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
          {reglerOffen ? 'Steuertarif-Indexierung schließen' : 'Kalte Progression durchrechnen'}
        </button>

        {reglerOffen && (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <ProzentFeld
              label="Steuertarif-Indexierung p. a."
              wert={tarifIndex}
              onChange={(n) => setzeAnnahmen({ tarifIndex: n })}
              max={10}
              hilfe="0 % = keinerlei Ausgleich der kalten Progression. Gleich der Rentendynamik = voller Ausgleich."
            />
            <p className="mt-2 text-xs text-slate-600">
              Die Rentendynamik liegt bei <strong>{prozent(rentendynamik)}</strong>.{' '}
              {vollIndexiert
                ? 'Der Tarif wächst genauso schnell — die Steuerquote bleibt über die Jahre stabil.'
                : 'Der Tarif wächst langsamer — die Steuerquote steigt im Zeitverlauf.'}
            </p>
            {!vollIndexiert && (
              <button
                type="button"
                onClick={() => setzeAnnahmen({ rentendynamik })}
                className="mt-2 text-xs font-medium text-indigo-700 hover:underline"
              >
                Wieder an die Rentendynamik koppeln
              </button>
            )}
          </div>
        )}
      </div>

      {ergebnis.hinweise.length > 0 && (
        <ul className="mt-3 space-y-1">
          {ergebnis.hinweise.map((h, i) => (
            <li key={i} className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">{h}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
