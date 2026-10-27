/** Ein Teil des Rings: sein Wert und seine Farbrolle (index.css :root), etwa 'tinte' oder 'knopf'. */
export interface RingTeil {
  wert: number;
  rolle: string;
}

const R = 42;
const UMFANG = 2 * Math.PI * R;

/** Die Boegen der Teile auf dem Umfang: Laenge und Beginn, in der Reihenfolge der Teile. */
export function ringBoegen(werte: readonly number[], umfang = UMFANG): { laenge: number; beginn: number }[] {
  const summe = werte.reduce((s, w) => s + Math.max(0, w), 0);
  let beginn = 0;
  return werte.map((w) => {
    const laenge = summe > 0 ? (Math.max(0, w) / summe) * umfang : 0;
    const bogen = { laenge, beginn };
    beginn += laenge;
    return bogen;
  });
}

/**
 * Ein Ganzes und seine Teile als Ring — wie der Ring der Versorgungsluecke
 * (LueckenRing.tsx), mit beliebig vielen Teilen ab 12 Uhr im Uhrzeigersinn.
 * In der Mitte eine Zahl, darunter ein, zwei kurze Zeilen. Die Werte stehen
 * zusaetzlich als Text daneben; der Ring ist die Anschauung.
 */
export function AnteilsRing({ teile, mitte, zeilen, beschreibung, klasse = '' }: {
  teile: readonly RingTeil[];
  mitte: string;
  zeilen: readonly string[];
  /** Der Vorlesetext: das Ganze und jedes Teil in Worten */
  beschreibung: string;
  klasse?: string;
}) {
  const boegen = ringBoegen(teile.map((t) => t.wert));
  // Zahl und Zeilen zusammen um die Mitte gesetzt
  const oben = 60 - zeilen.length * 4.25 + 3;
  return (
    <svg viewBox="0 0 120 120" className={`h-44 w-44 shrink-0 sm:h-52 sm:w-52 ${klasse}`} role="img" aria-label={beschreibung}>
      <circle cx="60" cy="60" r={R} fill="none" style={{ stroke: 'rgb(var(--ui-linie))' }} strokeWidth="12" />
      {teile.map((t, i) => {
        const b = boegen[i];
        return b && b.laenge > 0 ? (
          <circle key={i} cx="60" cy="60" r={R} fill="none" style={{ stroke: `rgb(var(--ui-${t.rolle}))` }} strokeWidth="12"
            strokeDasharray={`${b.laenge} ${UMFANG}`} strokeDashoffset={-b.beginn} transform="rotate(-90 60 60)" />
        ) : null;
      })}
      <text x="60" y={oben} textAnchor="middle" fontSize="15" fontWeight="500" style={{ fill: 'rgb(var(--ui-tinte))' }}>{mitte}</text>
      {zeilen.map((z, i) => (
        <text key={z} x="60" y={oben + 11 + i * 8.5} textAnchor="middle" fontSize="7" style={{ fill: 'rgb(var(--ui-schiefer))' }}>{z}</text>
      ))}
    </svg>
  );
}
