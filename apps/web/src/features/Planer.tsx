import { Wallet } from 'lucide-react';
import type { PlanerErgebnis } from '@renten/engine';
import { useSzenario } from '../store/szenario';
import { ZahlFeld, ProzentFeld, Schalter, euro } from '../components/Feld';

/**
 * Entnahmeplaner: Ein Kapitalstock wird ueber eine feste Zahl von Jahren
 * dynamisch entnommen. Verträge mit der Strategie "Kapital in den
 * Entnahmeplaner" fliessen zusaetzlich hier ein.
 *
 * Kein eigener Reiter mehr: Der Kasten steht unter den Vertraegen, sobald
 * einer sein Kapital hierher gibt (`features/Vertraege.tsx`).
 */
export function Planer({ ergebnis }: { ergebnis: PlanerErgebnis | null }) {
  const planer = useSzenario((x) => x.szenario.planer);
  const setzePlaner = useSzenario((x) => x.setzePlaner);

  return (
    <div className="space-y-4">
      <div className="rounded-[10px] border border-ui-linie bg-ui-karte p-4">
        <h3 className="mb-4 flex items-center gap-2 text-base font-medium text-ui-tinte">
          <Wallet className="h-4 w-4 text-ui-schiefer" aria-hidden />
          Entnahmeplaner
        </h3>
        <p className="-mt-2 mb-4 text-xs leading-relaxed text-ui-schiefer">
          Verteilt das Kapital der Verträge mit der Auszahlungsstrategie „Kapital in den Entnahmeplaner“ über feste Jahre.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <ZahlFeld
            label="Weiteres Kapital"
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
        <div className="ui-innen p-4">
          <dl className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-xs text-ui-schiefer">Wirksames Kapital</dt>
              <dd className="text-lg font-medium tabular-nums text-ui-tinte">
                {euro(ergebnis.gesamtkapital)}
              </dd>
              {ergebnis.uebertragen > 0 && (
                <p className="mt-0.5 text-xs text-ui-schiefer">
                  inkl. {euro(ergebnis.uebertragen)} aus Verträgen
                </p>
              )}
            </div>
            <div>
              <dt className="text-xs text-ui-schiefer">Entnahme netto</dt>
              <dd className="text-lg font-medium tabular-nums text-ui-tinte">
                {euro(ergebnis.nettoMonat)} <span className="text-xs font-normal text-ui-schiefer">/ Monat</span>
              </dd>
              <p className="mt-0.5 text-xs text-ui-schiefer">
                brutto {euro(ergebnis.bruttoMonat)}
              </p>
            </div>
          </dl>

          {!ergebnis.imNettoEnthalten && (
            <p className="mt-3 border-t border-ui-linie pt-3 text-xs leading-relaxed text-ui-tinte">
              Diese Entnahme ist derzeit <strong className="font-medium">nicht</strong> im Haushaltsnetto enthalten.
              Mit dem Schalter oben lässt sie sich einrechnen.
            </p>
          )}
        </div>
      ) : (
        <p className="rounded-[10px] border border-dashed border-ui-feld-rand px-4 py-6 text-center text-sm text-ui-schiefer">
          Noch kein Kapital im Entnahmeplaner — es erscheint hier, sobald das Ergebnis gerechnet ist.
        </p>
      )}
    </div>
  );
}
