import { euro } from './Feld';

/** Was die Teile des Rings heissen — in der Mitte und im Vorlesetext. */
export interface RingTexte {
  /** Das Ganze im Vorlesetext, etwa „Nettolohn“ */
  ganz: string;
  /** Die Zeile unter dem Betrag in der Mitte, etwa „Ihr Nettolohn“ */
  mitte: string;
  /** Der gedeckte Teil, etwa „Netto-Altersrente“ */
  gedeckt: string;
}

const NETTOLOHN: RingTexte = { ganz: 'Nettolohn', mitte: 'Ihr Nettolohn', gedeckt: 'Netto-Altersrente' };
/** Gemessen am Ziel statt am Nettolohn — Schnellrechnung und Ergebnis des Rechners. */
export const ZIEL_RING: RingTexte = { ganz: 'Ziel', mitte: 'Ihr Ziel', gedeckt: 'Netto im Ruhestand' };

const R = 42;
const UMFANG = 2 * Math.PI * R;

/**
 * Die Boegen des gedeckten Teils: `alt` in Tinte ab 12 Uhr, danach `neu` —
 * was die gewaehlten Loesungen dazubringen. Der neue Teil liegt im gedeckten,
 * nie darueber hinaus; ohne ihn ist `alt` genau der Bogen von frueher.
 */
export function lueckenBoegen(ganz: number, gedeckt: number, neu = 0, umfang = UMFANG): { alt: number; neu: number } {
  const anteil = ganz > 0 ? Math.min(1, Math.max(0, gedeckt / ganz)) : 0;
  const neuAnteil = ganz > 0 ? Math.min(anteil, Math.max(0, neu / ganz)) : 0;
  return { alt: (anteil - neuAnteil) * umfang, neu: neuAnteil * umfang };
}

/**
 * Der Ring der Versorgungsluecke: Tinte der gedeckte Teil, die Rolle
 * „Luecke“ (Steingrau) die Luecke — zusammen das Ganze, das in der Mitte
 * steht. In der Mitarbeiterberatung Nettolohn und Netto-Altersrente, in der
 * Schnellrechnung und im Ergebnis des Rechners Ziel und Netto im Ruhestand.
 * Die Zahlen stehen zusaetzlich als Text daneben; der Ring ist die Anschauung.
 *
 * Mit `neu` (Etappe „Abschluss“) traegt der gedeckte Teil am Ende einen
 * blauen Bogen: was die gewaehlten Loesungen dazubringen. Ohne `neu` bleibt
 * das Markup Zeichen fuer Zeichen das alte — die unterschriebenen Fassungen
 * der Mitarbeiterberatung und ihre Klassen (fassung-klassen.txt) beruehrt das nicht.
 */
export function LueckenRing({ ganz, gedeckt, luecke, gedecktProzent, lueckeProzent, texte = NETTOLOHN, neu }: {
  ganz: number; gedeckt: number; luecke: number; gedecktProzent: number; lueckeProzent: number; texte?: RingTexte;
  /** Der Teil des Gedeckten, der neu dazukommt — Betrag im Ring und sein Anteil am Ganzen */
  neu?: { wert: number; prozent: number };
}) {
  const boegen = lueckenBoegen(ganz, gedeckt, neu?.wert);
  const ganzzahl = (x: number) => euro(Math.round(x));
  const darin = neu && boegen.neu > 0
    ? `, darin ${ganzzahl(neu.wert)} neu durch die gewählten Lösungen (${neu.prozent} %),` : '';
  return (
    <svg viewBox="0 0 120 120" className="h-44 w-44 shrink-0 sm:h-52 sm:w-52" role="img"
      aria-label={`${texte.ganz} ${ganzzahl(ganz)}: davon ${ganzzahl(gedeckt)} ${texte.gedeckt} (${gedecktProzent} %)${darin} und ${ganzzahl(luecke)} Versorgungslücke (${lueckeProzent} %)`}>
      <circle cx="60" cy="60" r={R} fill="none" style={{ stroke: 'rgb(var(--ui-luecke))' }} strokeWidth="12" />
      <circle cx="60" cy="60" r={R} fill="none" style={{ stroke: 'rgb(var(--ui-tinte))' }} strokeWidth="12"
        strokeDasharray={`${boegen.alt} ${UMFANG}`} transform="rotate(-90 60 60)" />
      {boegen.neu > 0 && (
        <circle cx="60" cy="60" r={R} fill="none" style={{ stroke: 'rgb(var(--ui-neu))' }} strokeWidth="12"
          strokeDasharray={`${boegen.neu} ${UMFANG}`} strokeDashoffset={-boegen.alt} transform="rotate(-90 60 60)" />
      )}
      <text x="60" y="60" textAnchor="middle" fontSize="13" fontWeight="500" style={{ fill: 'rgb(var(--ui-tinte))' }}>{ganzzahl(ganz)}</text>
      <text x="60" y="72" textAnchor="middle" fontSize="7" style={{ fill: 'rgb(var(--ui-schiefer))' }}>{texte.mitte}</text>
    </svg>
  );
}
