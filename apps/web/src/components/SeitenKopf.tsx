import type { ReactNode } from 'react';
import { Logo } from './Logo';

/**
 * Die Kopfzeile der Unterseiten (Schnellrechnung, Preise, Arbeitgeber-
 * Seiten, Vorsorge-Check, Rechtstexte, Anmeldung).
 *
 * EINE Fassung fuer alle: Vorher trugen manche Seiten den Spruch unter dem
 * Namen, andere nicht, und der Name war mal Link, mal nicht. Die Breite
 * folgt dem Inhalt der Seite, damit Logo und Ueberschrift buendig stehen.
 */
export function SeitenKopf({ breite = 'max-w-6xl', verlinkt = false, rechts, klasse = '', innen = '', hell = false }: {
  /** Tailwind-Klasse der Inhaltsbreite, gleich der von <main> */
  breite?: string;
  /**
   * Name als Link zur Startseite. Nicht auf dem Vorsorge-Check: Der Kunde
   * des Beraters soll nicht in dessen Rechner geraten.
   */
  verlinkt?: boolean;
  /** Bedienelemente rechts (Anmelden, Abmelden …) */
  rechts?: ReactNode;
  /** Zusaetzliche Klassen am <header>, etwa fuer den Druck */
  klasse?: string;
  /** Zusaetzliche Klassen an der inneren Zeile */
  innen?: string;
  /**
   * Hell, ohne eigene Flaeche und Rand — fuer die Mitarbeiterberatung, deren
   * Stile („Steep“, „Seline“) keine dunkle Kopfleiste kennen. Farben aus den
   * Rollen der Seite (mb-*).
   */
  hell?: boolean;
}) {
  const name = <span className="text-sm font-black tracking-tight">JS-Rentenplaner</span>;
  return (
    <header className={`${hell ? 'bg-transparent text-mb-tinte' : 'bg-slate-900 text-white'} ${klasse}`}>
      <div className={`mx-auto flex ${breite} items-center gap-3 px-4 py-4 sm:px-6 ${innen}`}>
        <Logo klasse="h-9 w-9 print:h-6 print:w-6" />
        <div className="min-w-0 flex-1">
          {verlinkt ? <a href="/" className="hover:underline">{name}</a> : name}
          <p className={`text-xs print:hidden ${hell ? 'text-mb-schiefer' : 'text-slate-400'}`}>Ihre Zukunft. Smart geplant.</p>
        </div>
        {rechts}
      </div>
    </header>
  );
}
