import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { DeckblattHeute, DeckblattKopf, DeckblattTitel, PAPIER } from '../druck/DeckblattKopf';
import { akzentVariablen, type Auftritt } from './auftritt';

/** Satzspiegel des Gutachtens: A4 (210 mm) minus 2 × 16 mm Rand = 178 mm, in CSS-Pixeln. */
const SATZ_BREITE = 673;
const RAND = 24;

/**
 * Die obere Haelfte des Deckblatts, verkleinert — mit denselben Komponenten
 * wie das Gutachten (`druck/DeckblattKopf.tsx`). Was hier steht, steht so
 * auch auf dem Papier; nichts wird fuer die Vorschau schoener gemacht.
 *
 * Verkleinert wird mit `zoom` statt `transform`: Dann folgt auch die Hoehe,
 * und unter der Vorschau bleibt kein leerer Raum. Der Behaelter muss dafuer
 * schmaler werden duerfen als der Satzspiegel (`min-w-0`, im Raster
 * `grid-cols-1`) — sonst schoebe die Vorschau ihre Spalte selbst auf.
 */
export function DeckblattVorschau({ auftritt, fuer = 'Ihren Mandanten', zahlen = null }: {
  auftritt: Auftritt | null;
  fuer?: string;
  /** Bedarf und Netto in heutiger Kaufkraft — ohne entfallen die Kacheln */
  zahlen?: { bedarf: number; netto: number } | null;
}) {
  const rahmen = useRef<HTMLDivElement>(null);
  const [faktor, setFaktor] = useState(0.5);
  useEffect(() => {
    const el = rahmen.current;
    if (!el) return;
    const messen = () => setFaktor(Math.min(1, el.clientWidth / (SATZ_BREITE + 2 * RAND)));
    messen();
    const beobachter = new ResizeObserver(messen);
    beobachter.observe(el);
    return () => beobachter.disconnect();
  }, []);

  return (
    <figure className="m-0 min-w-0">
      <div ref={rahmen} className="ui-karte overflow-hidden">
        <div
          aria-hidden="true"
          data-vorschau="deckblatt"
          className={PAPIER}
          style={{
            ...(akzentVariablen(auftritt) as CSSProperties),
            width: SATZ_BREITE + 2 * RAND,
            padding: RAND,
            zoom: faktor,
          }}
        >
          <DeckblattKopf auftritt={auftritt} />
          <DeckblattTitel titel="Altersvorsorge-Analyse" fuer={fuer} />
          {zahlen && <DeckblattHeute bedarf={zahlen.bedarf} netto={zahlen.netto} />}
        </div>
      </div>
      <figcaption className="mt-1.5 text-xs text-ui-schiefer">
        Vorschau des Deckblatts — so steht es im Gutachten.
      </figcaption>
    </figure>
  );
}
