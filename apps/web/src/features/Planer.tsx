import { Wallet } from 'lucide-react';
import type { PlanerErgebnis } from '@renten/engine';
import { useSzenario } from '../store/szenario';
import { ZahlFeld, ProzentFeld, Schalter, euro } from '../components/Feld';

/**
 * Auszahlungs-Planer: Ein Kapitalstock wird ueber eine feste Zahl von Jahren
 * dynamisch entnommen. Verträge mit der Strategie "Kapital in den
 * Entnahmeplaner" fliessen zusaetzlich hier ein.
 */
export function Planer({ ergebnis }: { ergebnis: PlanerErgebnis | null }) {
  const planer = useSzenario((x) => x.szenario.planer);
  const setzePlaner = useSzenario((x) => x.setzePlaner);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-indigo-200 bg-white p-3 shadow-sm">
        <h3 className="mb-3 flex items-center gap-2 border-b border-indigo-50 pb-2 text-xs font-bold text-indigo-900 sm:text-sm">
          <Wallet className="h-4 w-4" aria-hidden />
          Dynamische Verrentung
        </h3>

        <div className="grid gap-3 sm:grid-cols-2">
          <ZahlFeld
            label="Startkapital"
            wert={planer.startkapital}
            onChange={(n) => setzePlaner({ startkapital: n })}
            einheit="€"
          />
          <ZahlFeld
            label="Entnahmedauer"
            wert={planer.dauerJahre}
            onChange={(n) => setzePlaner({ dauerJahre: n })}
            min={1}
            max={60}
            einheit="Jahre"
          />
          <ProzentFeld
            label="Rendite p. a."
            wert={planer.rendite}
            onChange={(n) => setzePlaner({ rendite: n })}
            max={15}
          />
          <ProzentFeld
            label="Dynamik p. a."
            wert={planer.dynamik}
            onChange={(n) => setzePlaner({ dynamik: n })}
            max={10}
            hilfe="Jährliche Steigerung der Entnahme."
          />
        </div>

        <div className="mt-3">
          <Schalter
            label="Entnahme ins Haushaltsnetto einrechnen"
            wert={planer.insNettoEinrechnen}
            onChange={(b) => setzePlaner({ insNettoEinrechnen: b })}
          />
        </div>
      </div>

      {ergebnis ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <dl className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Wirksames Kapital
              </dt>
              <dd className="text-sm font-black text-indigo-900 tabular-nums">
                {euro(ergebnis.gesamtkapital)}
              </dd>
              {ergebnis.uebertragen > 0 && (
                <p className="mt-0.5 text-[10px] font-medium text-indigo-600">
                  inkl. {euro(ergebnis.uebertragen)} aus Verträgen
                </p>
              )}
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Entnahme netto
              </dt>
              <dd className="text-sm font-black text-emerald-700 tabular-nums">
                {euro(ergebnis.nettoMonat)} <span className="text-xs font-normal">/ Monat</span>
              </dd>
              <p className="mt-0.5 text-[10px] text-slate-500">
                brutto {euro(ergebnis.bruttoMonat)}
              </p>
            </div>
          </dl>

          {!ergebnis.imNettoEnthalten && (
            <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Diese Entnahme ist derzeit <strong>nicht</strong> im Haushaltsnetto enthalten.
              Setzen Sie den Schalter oben, um sie einzurechnen.
            </p>
          )}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
          Noch kein Kapital erfasst. Tragen Sie ein Startkapital ein oder stellen Sie einen
          Vertrag auf „Kapital in den Entnahmeplaner“ um.
        </p>
      )}
    </div>
  );
}
