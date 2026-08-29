import { useState } from 'react';
import { Users, Scale, Check } from 'lucide-react';
import { Dialog } from '../components/Dialog';
import { useSzenario } from '../store/szenario';
import { EinkommenFelder } from './EinkommenFelder';

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
          <button
            type="button"
            onClick={() => setWahl('genau')}
            className="flex w-full items-start gap-3 rounded-xl border-2 border-indigo-200 bg-indigo-50/50 p-4 text-left transition-colors hover:border-indigo-400"
          >
            <Users className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" aria-hidden />
            <span>
              <span className="block text-sm font-bold text-indigo-900">
                Einkommen getrennt erfassen <span className="font-normal text-indigo-600">— genauer</span>
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-slate-600">
                Je Partner Art und Betrag. Deckt auch ab, dass eine Person verbeamtet und die
                andere angestellt ist. Und wenn ein Partner früher in Rente geht, fällt genau
                dessen Einkommen weg statt pauschal der Hälfte.
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => uebernehmen(false)}
            className="flex w-full items-start gap-3 rounded-xl border-2 border-slate-200 p-4 text-left transition-colors hover:border-slate-400"
          >
            <Scale className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" aria-hidden />
            <span>
              <span className="block text-sm font-bold text-slate-800">Pauschal weiterrechnen</span>
              <span className="mt-1 block text-xs leading-relaxed text-slate-600">
                Ein Haushaltsbetrag wie bisher, für die Sozialabgaben hälftig auf beide verteilt.
                Weniger Eingaben, für ähnlich verdienende Paare völlig ausreichend.
              </span>
            </span>
          </button>

          <p className="pt-1 text-xs text-slate-500">
            Beides lässt sich später in den Basisdaten umstellen.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
              Einkommen des Partners
            </h3>
            <EinkommenFelder wert={partner} onChange={setzeEinkommenPartner} spalten={2} />
          </div>

          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
            Das Einkommen der ersten Person steht in den Basisdaten unter „Heutiges Einkommen".
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => uebernehmen(true)}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500"
            >
              <Check className="h-4 w-4" aria-hidden /> Übernehmen
            </button>
            <button
              type="button"
              onClick={() => setWahl('keine')}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Zurück
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
