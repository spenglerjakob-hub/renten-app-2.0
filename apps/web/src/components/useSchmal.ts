import { useEffect, useState } from 'react';

/**
 * Ist der Schirm schmal (Telefon)?
 *
 * Die Grenze ist dieselbe wie Tailwinds `sm` — was `sm:` in CSS macht,
 * macht dieser Hook in JavaScript. Beides auseinanderlaufen zu lassen
 * waere die sichere Art, sich spaeter zu wundern.
 *
 * Es geht nur um die Faelle, die CSS nicht loesen kann: wie viele
 * Achsenbeschriftungen ein Diagramm zeichnet, wie gross die Schrift IM SVG
 * ist (`fontSize` ist dort ein Attribut, keine Klasse) und wo ein Tooltip
 * steht.
 */
const SCHMAL = '(max-width: 639px)';

export function useSchmal(): boolean {
  const [schmal, setSchmal] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(SCHMAL).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(SCHMAL);
    const beiWechsel = (e: MediaQueryListEvent) => setSchmal(e.matches);
    setSchmal(mq.matches);
    mq.addEventListener('change', beiWechsel);
    return () => mq.removeEventListener('change', beiWechsel);
  }, []);

  return schmal;
}
