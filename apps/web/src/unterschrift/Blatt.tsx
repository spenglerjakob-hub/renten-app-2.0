import { useEffect, useRef, useState } from 'react';

/** A4 bei 96 dpi: 210 mm. */
const A4_PX = 793.7;

/**
 * Ein Dokument der festgeschriebenen Unterlagen am Bildschirm — wie gedruckt:
 * A4 breit, mit den Raendern des Drucks, verkleinert auf die verfuegbare
 * Breite (CSS `zoom`, damit auch die Hoehe mitgeht). `gross` zeigt es in
 * Originalgroesse zum Lesen auf dem Telefon, dann quer scrollbar.
 *
 * `html` ist bereinigt (festschreiben.tsx, mitUnterschriften).
 */
export function Blatt({ html, gross = false }: { html: string; gross?: boolean }) {
  const huelle = useRef<HTMLDivElement>(null);
  const [massstab, setMassstab] = useState(1);

  useEffect(() => {
    const el = huelle.current;
    if (!el) return;
    const neu = () => setMassstab(Math.min(1, el.clientWidth / A4_PX));
    neu();
    const beobachter = new ResizeObserver(neu);
    beobachter.observe(el);
    return () => beobachter.disconnect();
  }, []);

  return (
    <div ref={huelle} className={gross ? 'overflow-x-auto' : 'overflow-hidden'}>
      <div className="bg-white text-ui-tinte ring-1 ring-ui-linie"
        style={{ width: A4_PX, padding: '18mm 16mm 20mm', zoom: gross ? 1 : massstab }}>
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}
