import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ruhig } from '../lib/bewegung';

export { ruhig };

/**
 * EIN SCHRITT DER GEFUEHRTEN EINGABE — er blendet weich ein, statt hart zu
 * erscheinen.
 *
 * Die Seite fragt Stueck fuer Stueck: Geburtsdatum, Kinder, Gehalt, Beitrag.
 * Jeder neue Block erscheint mit kurzem Einblenden und leichtem Hochgleiten
 * (0,5 s). Liegt er unterhalb des sichtbaren Bereichs, scrollt die Seite
 * sanft so weit, dass er im oberen Drittel steht — die Antwort davor bleibt
 * dabei sichtbar. Steht er schon im Bild, bewegt sich nichts.
 *
 * Der Fokus wandert BEWUSST nicht mit: Der naechste Schritt erscheint, waehrend
 * noch getippt wird (etwa das Gehalt) — ein Sprung des Cursors risse die
 * Eingabe ab.
 *
 * Mit „Bewegung reduzieren“ im Betriebssystem steht der Block sofort da, und
 * gescrollt wird ohne Animation.
 */
export function Schritt({ children, klasse = '', scrollen = true, beschriftung }: {
  children: ReactNode;
  klasse?: string;
  /** Beim Erscheinen in den sichtbaren Bereich holen */
  scrollen?: boolean;
  /** Fuer Screenreader: der Abschnitt als Region mit Namen */
  beschriftung?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const [da, setDa] = useState(false);

  useEffect(() => {
    // Zwei Takte: Erst steht der Block unsichtbar im Dokument, dann laeuft
    // der Uebergang. Mit nur einem Takt fasst der Browser beides zusammen.
    let zweiter = 0;
    const erster = requestAnimationFrame(() => { zweiter = requestAnimationFrame(() => setDa(true)); });
    return () => { cancelAnimationFrame(erster); cancelAnimationFrame(zweiter); };
  }, []);

  useEffect(() => {
    if (!scrollen) return;
    const t = window.setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const oben = el.getBoundingClientRect().top;
      // Nur, wenn der Block unten aus dem Bild ragt.
      if (oben > window.innerHeight * 0.7) {
        window.scrollBy({ top: oben - window.innerHeight * 0.25, behavior: ruhig() ? 'auto' : 'smooth' });
      }
    }, 150);
    return () => window.clearTimeout(t);
  }, [scrollen]);

  return (
    <section
      ref={ref}
      aria-label={beschriftung}
      className={`transition-[opacity,transform] duration-500 ease-out motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none print:translate-y-0 print:opacity-100 ${
        da ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
      } ${klasse}`}
    >
      {children}
    </section>
  );
}
