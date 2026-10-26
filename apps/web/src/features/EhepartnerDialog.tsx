import { useState } from 'react';
import { Users, Scale, Check, ChevronRight } from 'lucide-react';
import { Dialog } from '../components/Dialog';
import { useSzenario } from '../store/szenario';
import { EinkommenFelder } from './EinkommenFelder';
import { KNOPF, KNOPF_ZWEIT, Marke } from '../components/stil';

/** Eine Wahl als Knopf-Karte, wie die Karten am Anfang der ersten Etappe (App.tsx: StartKarte). */
const WAHL = 'ui-karte flex w-full items-start gap-4 p-4 text-left transition-colors hover:border-ui-feld-rand sm:px-5';

/**
 * Erscheint beim Umschalten auf "Verheiratet".
 *
 * Hintergrund: Die Beitragsbemessungsgrenzen der Sozialversicherung gelten JE
 * PERSON. Ein Haushaltsbetrag als eine Person gerechnet ergibt deshalb zu
 * niedrige Abgaben — bei zwei Verdienern mit je 60 000 EUR rund 630 EUR im
 * Monat. Beide Wege hier verteilen das Einkommen auf zwei Personen; der
 * genaue Weg tut es mit den echten Betraegen statt haelftig.
 */
export function EhepartnerDialog({ offen, onSchliessen }: { offen: boolean; onSchliessen: () => void }) {
  const partner = useSzenario((s) => s.szenario.einkommenPartner);
  const setzeEinkommenPartner = useSzenario((s) => s.setzeEinkommenPartner);
  const setzeEinkommenGetrennt = useSzenario((s) => s.setzeEinkommenGetrennt);

  const [wahl, setWahl] = useState<'keine' | 'genau'>('keine');

  const uebernehmen = (getrennt: boolean) => {
    setzeEinkommenGetrennt(getrennt);
    setWahl('keine');
    onSchliessen();
  };

  return (
    <Dialog
      offen={offen}
      titel="Wie sollen die Einkommen gerechnet werden?"
      beschreibung="Die Beitragsbemessungsgrenzen der Sozialversicherung gelten je Person. Werden beide Einkommen einzeln erfasst, stimmen die Sozialabgaben genau."
      onSchliessen={onSchliessen}
    >
      {wahl === 'keine' ? (
        <div className="space-y-3">
          {/* Der genauere Weg traegt die Marke — statt einer eigenen Farbe fuer die ganze Karte. */}
          <button type="button" onClick={() => setWahl('genau')} className={WAHL}>
            <span className="ui-innen flex h-10 w-10 shrink-0 items-center justify-center text-ui-tinte">
              <Users className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-ui-tinte">
                Einkommen getrennt erfassen <Marke>genauer</Marke>
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-ui-schiefer">
                Je Partner Art und Betrag. Deckt auch ab, dass eine Person verbeamtet und die
                andere angestellt ist. Und wenn ein Partner früher in Rente geht, fällt genau
                dessen Einkommen weg statt pauschal der Hälfte.
              </span>
            </span>
            <ChevronRight className="mt-3 h-4 w-4 shrink-0 text-ui-schiefer" aria-hidden />
          </button>

          <button type="button" onClick={() => uebernehmen(false)} className={WAHL}>
            <span className="ui-innen flex h-10 w-10 shrink-0 items-center justify-center text-ui-tinte">
              <Scale className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-ui-tinte">Pauschal weiterrechnen</span>
              <span className="mt-1 block text-xs leading-relaxed text-ui-schiefer">
                Ein Haushaltsbetrag wie bisher, für die Sozialabgaben hälftig auf beide verteilt.
                Weniger Eingaben, für ähnlich verdienende Paare völlig ausreichend.
              </span>
            </span>
            <ChevronRight className="mt-3 h-4 w-4 shrink-0 text-ui-schiefer" aria-hidden />
          </button>

          <p className="pt-1 text-xs text-ui-schiefer">
            Beides lässt sich später in den Basisdaten umstellen.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <h3 className="mb-2 text-base font-medium text-ui-tinte">
              Einkommen des Partners
            </h3>
            <EinkommenFelder wert={partner} onChange={setzeEinkommenPartner} spalten={2} />
          </div>

          <p className="ui-innen px-3 py-2 text-xs leading-relaxed text-ui-schiefer">
            Das Einkommen der ersten Person steht in den Basisdaten unter „Heutiges Einkommen".
          </p>

          {/* Wie die Fenster der Beratung: unten rechts, Zurueck mit Kontur, die Hauptaktion gefuellt. */}
          <div className="flex flex-wrap justify-end gap-2 border-t border-ui-linie pt-4">
            <button type="button" onClick={() => setWahl('keine')} className={KNOPF_ZWEIT}>
              Zurück
            </button>
            <button type="button" onClick={() => uebernehmen(true)} className={KNOPF}>
              <Check className="h-4 w-4" aria-hidden /> Übernehmen
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
