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

/**
 * Der Ring der Versorgungsluecke: Tinte der gedeckte Teil, die Rolle
 * „Luecke“ (Steingrau) die Luecke — zusammen das Ganze, das in der Mitte
 * steht. In der Mitarbeiterberatung Nettolohn und Netto-Altersrente, in der
 * Schnellrechnung und im Ergebnis des Rechners Ziel und Netto im Ruhestand.
 * Die Zahlen stehen zusaetzlich als Text daneben; der Ring ist die Anschauung.
 */
export function LueckenRing({ ganz, gedeckt, luecke, gedecktProzent, lueckeProzent, texte = NETTOLOHN }: {
  ganz: number; gedeckt: number; luecke: number; gedecktProzent: number; lueckeProzent: number; texte?: RingTexte;
}) {
  const r = 42;
  const umfang = 2 * Math.PI * r;
  const anteil = ganz > 0 ? Math.min(1, Math.max(0, gedeckt / ganz)) : 0;
  const ganzzahl = (x: number) => euro(Math.round(x));
  return (
    <svg viewBox="0 0 120 120" className="h-44 w-44 shrink-0 sm:h-52 sm:w-52" role="img"
      aria-label={`${texte.ganz} ${ganzzahl(ganz)}: davon ${ganzzahl(gedeckt)} ${texte.gedeckt} (${gedecktProzent} %) und ${ganzzahl(luecke)} Versorgungslücke (${lueckeProzent} %)`}>
      <circle cx="60" cy="60" r={r} fill="none" style={{ stroke: 'rgb(var(--ui-luecke))' }} strokeWidth="12" />
      <circle cx="60" cy="60" r={r} fill="none" style={{ stroke: 'rgb(var(--ui-tinte))' }} strokeWidth="12"
        strokeDasharray={`${anteil * umfang} ${umfang}`} transform="rotate(-90 60 60)" />
      <text x="60" y="60" textAnchor="middle" fontSize="13" fontWeight="500" style={{ fill: 'rgb(var(--ui-tinte))' }}>{ganzzahl(ganz)}</text>
      <text x="60" y="72" textAnchor="middle" fontSize="7" style={{ fill: 'rgb(var(--ui-schiefer))' }}>{texte.mitte}</text>
    </svg>
  );
}
