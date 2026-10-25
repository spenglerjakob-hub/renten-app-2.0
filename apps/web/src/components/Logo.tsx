/**
 * Bildmarke des Rentenplaners: drei aufsteigende Balken mit einer
 * Trendlinie darueber — die Idee des urspruenglichen Entwurfs, neu gesetzt
 * im Stil „Seline“ wie ein Diagramm der App: die Balken einfarbig in Stein
 * (Daten bleiben einfarbig), die Linie in Tinte, nur ihr Endpunkt in Cyan —
 * die eine Hervorhebung. Die Linie laeuft ueber die Balken, nicht durch sie.
 *
 * Feste Farben statt Rollen: Die Marke soll gleich bleiben, auch wenn eine
 * Seite ihre Rollen anders belegt. public/favicon.svg traegt dieselbe Marke
 * (dunkle Fassung auf Soot).
 */
const HELL = { balken: ['#D6D3D1', '#A8A29E', '#78716C'], linie: '#0C0A09' };
/** Auf dunklem Grund: Tinte wird Papier, die Balken eine Stufe heller. */
const DUNKEL = { balken: ['#57534E', '#78716C', '#A8A29E'], linie: '#FAFAF9' };
const CYAN = '#3BA6F1';

export function Logo({ klasse = 'h-10 w-10', dunkel = false }: {
  klasse?: string;
  /** Fuer dunklen Grund wie im Favicon; die Kopfzeile des Rechners ist seit dem Umbau hell */
  dunkel?: boolean;
}) {
  const f = dunkel ? DUNKEL : HELL;
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${klasse}`}
      role="img"
      aria-label="JS-Rentenplaner"
    >
      <rect x="11" y="67" width="18" height="26" rx="4" fill={f.balken[0]} />
      <rect x="44" y="51" width="18" height="42" rx="4" fill={f.balken[1]} />
      <rect x="77" y="37" width="18" height="56" rx="4" fill={f.balken[2]} />
      <path
        d="M9 51 L37 35 L57 44 L85 16"
        stroke={f.linie}
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="85" cy="16" r="9" fill={CYAN} />
    </svg>
  );
}
