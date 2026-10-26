import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import type { ProjektionsErgebnis } from '@renten/engine';
import { BASISJAHR } from '@renten/engine';
import { useSzenario } from '../store/szenario';
import { ProzentFeld, prozent } from '../components/Feld';
import { LINK } from '../components/stil';

/**
 * Erlaeuterung des verwendeten Rechtsstands und der Fortschreibungsannahme.
 *
 * Kurzfassung im Bildschirm, ausfuehrliche Fassung im Druck — damit im PDF
 * nachvollziehbar ist, worauf die Zahlen beruhen.
 */
export function Rechtsstand({
  ergebnis, tarifIndex, rentendynamik, inflation, imGutachten = false,
}: {
  ergebnis: ProjektionsErgebnis;
  tarifIndex: number;
  rentendynamik: number;
  inflation: number;
  /** Im Gutachten: ohne Ueberschrift (sie steht schon im Seitenkopf) und im Rahmen des Drucks. */
  imGutachten?: boolean;
}) {
  const setzeAnnahmen = useSzenario((s) => s.setzeAnnahmen);
  const [reglerOffen, setReglerOffen] = useState(false);

  const r = ergebnis.rechtsstand;
  const ohneIndexierung = tarifIndex === 0;
  const vollIndexiert = Math.abs(tarifIndex - rentendynamik) < 0.0005;

  return (
    <section className={imGutachten
      ? 'rounded-[10px] border border-ui-linie bg-white p-4 text-sm druckbereich'
      : 'ui-karte p-5 text-sm druckbereich sm:p-7'}>
      {!imGutachten && (
        <h2 className="mb-3 text-lg font-medium tracking-[-0.01em] text-ui-tinte sm:text-xl">Rechtsstand und Annahmen</h2>
      )}

      <p className="text-ui-schiefer [&_strong]:font-medium [&_strong]:text-ui-tinte">
        Berechnet nach <strong>Rechtsstand {r.basisjahr}</strong>
        {r.fortgeschriebenAb && (
          <>; ab {r.fortgeschriebenAb} mit <strong>{prozent(tarifIndex)} p. a.</strong> fortgeschrieben.</>
        )}
      </p>

      {/* Ausfuehrliche Fassung nur im Druck — deshalb auch in der Schriftstufe
          des Gutachtens (12 px, siehe druck/Bausteine.tsx). */}
      <div className="mt-3 hidden space-y-2 text-[12px] leading-relaxed text-ui-schiefer print:block [&_h3]:font-medium [&_h3]:text-ui-tinte [&_strong]:font-medium [&_strong]:text-ui-tinte">
        <h3>Wie die Zahlen zustande kommen</h3>

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

        <h3>Warum diese Annahme so viel ausmacht</h3>

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

        <p className="rounded-[10px] border border-ui-linie bg-ui-innen p-3">
          <strong>In dieser Auswertung gewaehlt:</strong>{' '}
          {ohneIndexierung
            ? 'keine Indexierung des Steuertarifs (0 %). Das ist die vorsichtigste Annahme — die ausgewiesene Steuerbelastung ist eher zu hoch als zu niedrig.'
            : vollIndexiert
              ? `vollstaendige Indexierung (${prozent(tarifIndex)}, entspricht der Rentendynamik). Das ist die guenstigste realistische Annahme; sie unterstellt, dass der Gesetzgeber die kalte Progression vollstaendig ausgleicht.`
              : `Indexierung mit ${prozent(tarifIndex)} p. a. bei einer Rentendynamik von ${prozent(rentendynamik)}. Der Tarif waechst damit langsamer als die Bezuege — die Steuerquote steigt im Zeitverlauf an.`}
        </p>

        <h3>Kaufkraft</h3>
        <p>
          Alle Betraege sind nominal ausgewiesen, also in den Euro des jeweiligen
          Jahres. Zur Einordnung wird mit einer Inflation von{' '}
          <strong>{prozent(inflation)} p. a.</strong> gerechnet; die Umschaltung
          &bdquo;Kaufkraft heute&ldquo; zinst die Betraege damit auf das heutige
          Preisniveau ab.
        </p>

        <h3>Grenzen der Berechnung</h3>
        <p>
          Die Auswertung bildet den Regelfall ab. Nicht beruecksichtigt sind unter
          anderem: Hinterbliebenenversorgung, Erwerbsminderung, Versorgungsausgleich
          nach Scheidung, auslaendische Einkuenfte sowie individuelle
          Werbungskosten und aussergewoehnliche Belastungen. Bei Beamten beruhen
          Besoldungswerte teilweise auf Naeherungen; solche Stellen sind im Bericht
          gekennzeichnet.
        </p>

        <p className="border-t border-ui-linie pt-2 text-xs">
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
      <div className="mt-4 border-t border-ui-linie pt-4 print:hidden">
        <button
          type="button"
          onClick={() => setReglerOffen((v) => !v)}
          aria-expanded={reglerOffen}
          className={LINK}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          {reglerOffen ? 'Steuertarif-Indexierung schließen' : 'Kalte Progression durchrechnen'}
        </button>

        {reglerOffen && (
          <div className="ui-innen mt-4 p-4">
            <ProzentFeld
              label="Steuertarif-Indexierung p. a."
              wert={tarifIndex}
              onChange={(n) => setzeAnnahmen({ tarifIndex: n })}
              max={10}
              hilfe="0 % = keinerlei Ausgleich der kalten Progression. Gleich der Rentendynamik = voller Ausgleich."
            />
            <p className="mt-2 text-xs text-ui-schiefer">
              Die Rentendynamik liegt bei <strong className="font-medium text-ui-tinte">{prozent(rentendynamik)}</strong>.{' '}
              {vollIndexiert
                ? 'Der Tarif wächst genauso schnell — die Steuerquote bleibt über die Jahre stabil.'
                : 'Der Tarif wächst langsamer — die Steuerquote steigt im Zeitverlauf.'}
            </p>
            {!vollIndexiert && (
              <button
                type="button"
                onClick={() => setzeAnnahmen({ rentendynamik })}
                className="mt-2 text-xs font-medium text-ui-tinte underline-offset-4 hover:underline"
              >
                Wieder an die Rentendynamik koppeln
              </button>
            )}
          </div>
        )}
      </div>

      {/* Die Hinweise des Rechenkerns, am Bildschirm wie im Druck als Liste mit Gedankenstrich — lesen, nicht erschrecken. */}
      {ergebnis.hinweise.length > 0 && (
        <ul className="mt-4 space-y-1.5 text-xs leading-relaxed text-ui-tinte">
          {ergebnis.hinweise.map((h, i) => (
            <li key={i} className="flex gap-2"><span aria-hidden className="text-ui-asche">—</span><span>{h}</span></li>
          ))}
        </ul>
      )}
    </section>
  );
}
