import { useCallback, useEffect, useState } from 'react';
import { SeitenKopf } from '../components/SeitenKopf';
import { RechtsLinks } from '../components/RechtsLinks';
import { DruckBereich } from './bausteine';
import { ortAus, ortSuche, type Ort } from './ort';
import { FirmenListe } from './FirmenListe';
import { FirmaAnsicht } from './FirmaAnsicht';
import { BeratungAnsicht } from './Beratung';

/**
 * Die bAV-Mitarbeiterberatung (/mitarbeiterberatung).
 *
 * Hat sich eine Firma fuer ein Modell entschieden, fuehrt der Berater jeden
 * Mitarbeiter im Gespraech durch sieben Schritte — vor Ort oder per Video mit
 * geteiltem Bildschirm. Drei Ebenen: Firmen → Firma (Angebot, Mitarbeiter,
 * Uebersicht fuer den Arbeitgeber) → Beratung. Wo man steht, steht in der
 * Adresse (`ort.ts`).
 *
 * Nur mit Konto und Paket „Arbeitgeber-Vorsorgemodelle“ (Zugangsschranke in
 * main.tsx). Gespeichert wird im Konto des Beraters; Mitarbeiter und
 * Arbeitgeber sehen nur, was er zeigt oder druckt.
 */
export function Seite() {
  const [ort, setOrt] = useState<Ort>(() => ortAus(window.location.search));

  useEffect(() => {
    const zurueck = () => setOrt(ortAus(window.location.search));
    window.addEventListener('popstate', zurueck);
    return () => window.removeEventListener('popstate', zurueck);
  }, []);

  const gehe = useCallback((o: Ort) => {
    const suche = ortSuche(o);
    if (suche !== window.location.search) window.history.pushState(null, '', `${window.location.pathname}${suche}`);
    setOrt(o);
    window.scrollTo({ top: 0 });
  }, []);

  return (
    <DruckBereich>
      <div className="min-h-screen bg-ui-flaeche text-ui-tinte">
        <SeitenKopf verlinkt />
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
          {ort.firma === null ? (
            <FirmenListe gehe={gehe} />
          ) : ort.beratung === null ? (
            <FirmaAnsicht key={ort.firma} firmaId={ort.firma} reiter={ort.reiter} gehe={gehe} />
          ) : (
            <BeratungAnsicht key={ort.beratung} firmaId={ort.firma} beratungId={ort.beratung} gehe={gehe} />
          )}
        </main>
        <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 pb-10 sm:px-6">
          <RechtsLinks />
        </footer>
      </div>
    </DruckBereich>
  );
}
