import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Ein Bereich, der seitlich scrollt, wenn sein Inhalt zu breit ist — breite
 * Tabellen am Telefon.
 *
 * Mit Maus oder Finger schiebt man ihn einfach. Mit der Tastatur geht das
 * nur, wenn der Bereich den Fokus bekommen kann; sonst bleiben die
 * abgeschnittenen Spalten unerreichbar. Deshalb wird er zum Tab-Stopp mit
 * Namen — aber nur, solange wirklich etwas uebersteht: Am breiten Bildschirm
 * waere er ein Halt ohne Zweck.
 */
export function ScrollBereich({ name, klasse = '', children }: {
  /** Wie der Bereich vorgelesen wird, etwa „Tabelle: Mengenrabatt“ */
  name: string;
  klasse?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [stehtUeber, setStehtUeber] = useState(false);

  const messen = () => {
    const el = ref.current;
    if (el) setStehtUeber(el.scrollWidth > el.clientWidth + 1);
  };
  // Nach jedem Rendern: Der Inhalt waechst mit den Zahlen, ohne dass sich der Bereich aendert.
  useEffect(messen);
  // Und wenn sich die Breite aendert (Fenster, Drehen des Telefons).
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const beobachter = new ResizeObserver(messen);
    beobachter.observe(el);
    return () => beobachter.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`overflow-x-auto ${klasse}`}
      {...(stehtUeber ? { tabIndex: 0, role: 'region', 'aria-label': name } : {})}
    >
      {children}
    </div>
  );
}
