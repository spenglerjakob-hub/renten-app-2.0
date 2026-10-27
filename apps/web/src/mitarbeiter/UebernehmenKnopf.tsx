import { Suspense, lazy, useState } from 'react';
import { Users } from 'lucide-react';
import type { FirmenModellDaten } from '@renten/schema';
import { KNOPF_ZWEIT } from '../components/stil';

const UebernehmenDialog = lazy(() => import('./Uebernehmen').then((m) => ({ default: m.UebernehmenDialog })));

/**
 * Der Knopf auf den Arbeitgeber-Seiten: Das eingestellte Modell wird das
 * Angebot einer Firma in der Mitarbeiter-Beratung. Das Fenster (und was es
 * zum Speichern braucht) laedt erst beim ersten Klick — die Seiten bleiben
 * so schlank wie bisher.
 */
export function UebernehmenKnopf({ modell, bundesland }: { modell: FirmenModellDaten; bundesland: string }) {
  const [offen, setOffen] = useState(false);
  const [geladen, setGeladen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => { setGeladen(true); setOffen(true); }}
        className={`${KNOPF_ZWEIT} print:hidden`}
      >
        <Users className="h-4 w-4" aria-hidden /> Für die Mitarbeiter-Beratung übernehmen
      </button>
      {geladen && (
        <Suspense fallback={null}>
          <UebernehmenDialog offen={offen} onSchliessen={() => setOffen(false)} modell={modell} bundesland={bundesland} />
        </Suspense>
      )}
    </>
  );
}
