import { useEffect, useRef, type PointerEvent as ZeigerEreignis } from 'react';
import { ZUG_BREITE, zugGueltig, zugRahmen, type Strich } from './unterschrift-daten';

/*
 * Das Unterschriftsfeld und die Unterschrift als Bild — am Bildschirm des
 * Beraters (Unterschrift.tsx) wie auf der Seite fuer die Unterschrift per
 * Link (unterschrift/Seite.tsx). Eigene Datei, damit die oeffentliche Seite
 * nicht die ganze Beratung laedt.
 */

/** Breite zu Hoehe des Feldes. Die Striche stehen in Einheiten der Breite 1000 — so passen sie zu jeder Groesse. */
const FELD_VERHAELTNIS = 2.5;
export const FELD_HOEHE = ZUG_BREITE / FELD_VERHAELTNIS;
const TINTE = '#17191c';

/** Zeichnet die Striche — geglaettet wie der gespeicherte Zug. Farbe und Staerke stellt `neu` ein. */
function zeichne(ctx: CanvasRenderingContext2D, striche: readonly Strich[], massstab: number) {
  for (const s of striche) {
    const [erster, ...innen] = s;
    if (!erster) continue;
    const letzter = innen.pop();
    ctx.beginPath();
    ctx.moveTo(erster[0] * massstab, erster[1] * massstab);
    if (!letzter) ctx.lineTo(erster[0] * massstab + 0.5, erster[1] * massstab);
    else {
      innen.forEach((p, i) => {
        const n = innen[i + 1] ?? letzter;
        ctx.quadraticCurveTo(p[0] * massstab, p[1] * massstab, ((p[0] + n[0]) / 2) * massstab, ((p[1] + n[1]) / 2) * massstab);
      });
      ctx.lineTo(letzter[0] * massstab, letzter[1] * massstab);
    }
    ctx.stroke();
  }
}

/**
 * Das Feld: Finger, Stift oder Maus (Pointer Events). `touch-action: none`
 * haelt die Seite still, solange gezeichnet wird; gezeichnet wird in der
 * Schaerfe des Bildschirms.
 */
export function UnterschriftFeld({ striche, setStriche, beschriftung }: {
  striche: Strich[]; setStriche: (s: Strich[]) => void; beschriftung: string;
}) {
  const leinwand = useRef<HTMLCanvasElement>(null);
  const strich = useRef<[number, number][] | null>(null);
  const stricheRef = useRef(striche);
  stricheRef.current = striche;

  // Groesse und Schaerfe folgen dem Feld; danach alles neu zeichnen.
  useEffect(() => {
    const c = leinwand.current;
    if (!c) return;
    const neu = () => {
      const r = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.max(1, Math.round(r.width * dpr));
      c.height = Math.max(1, Math.round(r.height * dpr));
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, c.width, c.height);
      // Eine neue Groesse setzt den Zustand des Canvas zurueck — darum hier, nicht einmal beim Start.
      ctx.strokeStyle = TINTE;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2.6 * dpr;
      zeichne(ctx, stricheRef.current, c.width / ZUG_BREITE);
    };
    neu();
    const beobachter = new ResizeObserver(neu);
    beobachter.observe(c);
    return () => beobachter.disconnect();
  }, []);

  // „Neu“ leert die Striche von aussen — dann auch das Bild.
  useEffect(() => {
    const c = leinwand.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    zeichne(ctx, striche, c.width / ZUG_BREITE);
  }, [striche]);

  const punkt = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = leinwand.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * ZUG_BREITE, ((e.clientY - r.top) / r.width) * ZUG_BREITE];
  };

  const runter = (e: ZeigerEreignis<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    strich.current = [punkt(e)];
  };
  const weiter = (e: ZeigerEreignis<HTMLCanvasElement>) => {
    const s = strich.current;
    const c = leinwand.current;
    const ctx = c?.getContext('2d');
    if (!s || !c || !ctx) return;
    const massstab = c.width / ZUG_BREITE;
    const ereignisse = e.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const ev of ereignisse.length > 0 ? ereignisse : [e.nativeEvent]) {
      const p = punkt(ev);
      const letzter = s[s.length - 1];
      if (letzter) {
        ctx.beginPath();
        ctx.moveTo(letzter[0] * massstab, letzter[1] * massstab);
        ctx.lineTo(p[0] * massstab, p[1] * massstab);
        ctx.stroke();
      }
      s.push(p);
    }
  };
  const fertig = () => {
    const s = strich.current;
    strich.current = null;
    if (s) setStriche([...stricheRef.current, s]);
  };

  return (
    <div className="relative">
      <canvas
        ref={leinwand}
        role="img"
        aria-label={beschriftung}
        onPointerDown={runter}
        onPointerMove={weiter}
        onPointerUp={fertig}
        onPointerCancel={fertig}
        className="block w-full cursor-crosshair touch-none rounded-2xl border border-ui-linie bg-white"
        style={{ aspectRatio: `${FELD_VERHAELTNIS}` }}
      />
      {/* Die Linie zum Unterschreiben — nur zur Orientierung, nicht Teil der Unterschrift. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-6 bottom-[22%] flex items-end gap-2 border-b border-ui-asche/60 pb-1 text-ui-asche">
        <span className="text-lg leading-none">×</span>
      </div>
    </div>
  );
}

/** Die Unterschrift als kleines Bild — am Bildschirm, wie sie in den Unterlagen steht. */
export function UnterschriftBild({ zug, name, klasse = 'h-12' }: { zug: string; name: string; klasse?: string }) {
  const rahmen = zugGueltig(zug) ? zugRahmen(zug) : null;
  if (!rahmen) return null;
  return (
    <svg viewBox={`${rahmen.x} ${rahmen.y} ${rahmen.breite} ${rahmen.hoehe}`} className={`${klasse} w-auto max-w-full`}
      role="img" aria-label={`Unterschrift ${name}`} preserveAspectRatio="xMinYMid meet">
      <path d={zug} fill="none" stroke={TINTE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
