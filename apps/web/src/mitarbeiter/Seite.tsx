import { useCallback, useEffect, useState } from 'react';
import { SeitenKopf } from '../components/SeitenKopf';
import { RechtsLinks } from '../components/RechtsLinks';
import { DruckBereich } from './bausteine';
import { ortAus, ortSuche, type Ort } from './ort';
import { FirmenListe } from './FirmenListe';
import { FirmaAnsicht } from './FirmaAnsicht';
import { BeratungAnsicht } from './Beratung';
import { STILE, stilLaden, stilMerken, type Stil } from './stil';

/** Der Umschalter zum Vergleichen der Stile — nur auf der Testseite und lokal, nicht live. */
const STILWAHL_SICHTBAR = import.meta.env.DEV || import.meta.env.VITE_UMGEBUNG === 'test';

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
  const [stil, setStil] = useState<Stil>(() => stilLaden(window.location.search));
  const waehleStil = (s: Stil) => { stilMerken(s); setStil(s); };

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
      {/*
        Eigener Stil dieser Seite, nach einer von zwei Referenzen (stil.ts):
        Steep — weisses Papier, Serifen, Tinte, ein Pfirsich-Akzent je
        Ansicht; Seline — warmer Stein, weisse Karten mit Haarlinie, ein
        Cyan fuer Hauptaktion und hervorgehobenes Wort. Rollen in
        tailwind.config.js (mb-*), Werte und gemeinsame Felder in index.css.
      */}
      <div className={`mb-thema mb-${stil} min-h-screen bg-mb-flaeche text-mb-tinte`}>
        <SeitenKopf verlinkt hell />
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
          {STILWAHL_SICHTBAR && (
            <div role="group" aria-label="Stil der Seite (Vergleich)" className="flex items-center gap-2 text-xs text-mb-schiefer">
              Stil zum Vergleich:
              <span className="inline-flex gap-0.5 rounded-full border border-mb-linie bg-mb-karte p-0.5">
                {STILE.map((x) => (
                  <button key={x.id} type="button" aria-pressed={stil === x.id} onClick={() => waehleStil(x.id)}
                    className={`rounded-full px-3 py-1 ${stil === x.id ? 'bg-mb-dunkel text-white' : 'text-mb-tinte hover:bg-mb-hover'}`}>
                    {x.text}
                  </button>
                ))}
              </span>
            </div>
          )}
        </footer>
      </div>
    </DruckBereich>
  );
}
