import { useCallback, useEffect, useState } from 'react';
import { SeitenKopf } from '../components/SeitenKopf';
import { RechtsLinks } from '../components/RechtsLinks';
import { DruckBereich } from './bausteine';
import { ortAus, ortSuche, type Ort } from './ort';
import { FirmenListe } from './FirmenListe';
import { FirmaAnsicht } from './FirmaAnsicht';
import { AgenturAnsicht } from './AgenturAnsicht';
import { useZugang } from '../store/zugang';
import { useAuftritt } from '../store/auftritt';
import { BeratungAnsicht } from './Beratung';
import { BeraterAngabenPflicht } from './BeraterAngaben';
import { beraterAngabenVollstaendig } from './berater-angaben';

/**
 * Die bAV-Mitarbeiterberatung (/mitarbeiterberatung).
 *
 * Hat sich eine Firma fuer ein Modell entschieden, fuehrt der Berater jeden
 * Mitarbeiter im Gespraech durch sieben Schritte — vor Ort oder per Video mit
 * geteiltem Bildschirm. Drei Ebenen: Firmen → Firma (Angebot, Mitarbeiter,
 * Uebersicht fuer den Arbeitgeber) → Beratung. Wo man steht, steht in der
 * Adresse (`ort.ts`).
 *
 * Fuer die bAV-Verwaltung liegt darueber eine vierte: Agenturen → Agentur
 * (Firmenkunden, Angaben und Auftritt, Zugaenge). Die Ansicht einer Agentur
 * gibt es fuer sie — und fuer die Admins der Agentur, fuer die eigene. Alle
 * anderen landen mit einer solchen Adresse bei ihren Firmen.
 *
 * EIN ZUGANG EINER AGENTUR traegt zuerst ein, wer er ist
 * (`BeraterAngabenPflicht`): Erst danach gibt es Firmen und Beratungen. So
 * steht auf jeder Unterlage von Anfang an, wer beraten hat. Ist der Auftritt
 * gerade nicht zu laden, bleibt die Seite offen — eine Stoerung soll niemanden
 * aussperren.
 *
 * Nur mit Konto und Paket „Arbeitgeber-Vorsorgemodelle“ (Zugangsschranke in
 * main.tsx). Gespeichert wird im Konto des Beraters; Mitarbeiter und
 * Arbeitgeber sehen nur, was er zeigt oder druckt.
 */
export function Seite() {
  const [ort, setOrt] = useState<Ort>(() => ortAus(window.location.search));
  const verwaltet = useZugang((s) => s.zugang?.verwalter === true);
  const agentur = useZugang((s) => s.zugang?.agentur ?? null);
  const agenturName = useZugang((s) => s.zugang?.agenturName ?? null);
  const admin = useZugang((s) => s.zugang?.agenturRolle === 'admin');
  const auftritt = useAuftritt((s) => s.auftritt);
  const auftrittStand = useAuftritt((s) => s.status);
  const auftrittLaden = useAuftritt((s) => s.laden);
  useEffect(() => { if (agentur && auftrittStand === 'aus') void auftrittLaden(); }, [agentur, auftrittStand, auftrittLaden]);
  const angabenOffen = agentur !== null && (auftrittStand === 'aus' || auftrittStand === 'laedt');
  const angabenFehlen = agentur !== null && auftrittStand === 'bereit' && !beraterAngabenVollstaendig(auftritt);

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
          {angabenOffen ? (
            <p className="text-sm text-ui-schiefer">Einen Moment …</p>
          ) : angabenFehlen ? (
            <BeraterAngabenPflicht agenturName={agenturName} />
          ) : ort.firma === null ? (
            ort.agentur && (verwaltet || (admin && ort.agentur === agentur))
              ? <AgenturAnsicht key={ort.agentur} agenturId={ort.agentur} rolle={verwaltet ? 'verwaltung' : 'admin'} gehe={gehe} />
              : <FirmenListe gehe={gehe} />
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
