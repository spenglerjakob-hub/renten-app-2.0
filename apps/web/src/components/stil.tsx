import { useId, type ReactNode } from 'react';
import { Info, type LucideIcon } from 'lucide-react';

/*
 * DIE BAUSTEINE DES STILS „Seline“ — fuer alle Seiten. Sie sprechen nur
 * Rollen an (index.css :root, tailwind.config.js ui-*): Knoepfe als Pillen,
 * gefuellt fuer die Hauptaktion, mit Kontur fuer die zweite, ein Textlink
 * fuer die leiseste; Karten weiss mit Haarlinie; eine Akzentkarte je
 * Ansicht, deren Akzent im hervorgehobenen Wort sitzt.
 */
export const KNOPF = 'inline-flex items-center justify-center gap-1.5 rounded-full border border-ui-knopf-rand bg-ui-knopf px-5 py-2.5 text-sm font-medium text-ui-knopf-schrift hover:bg-ui-knopf-hover disabled:opacity-40';
export const KNOPF_ZWEIT = 'inline-flex items-center justify-center gap-1.5 rounded-full border border-ui-zweit-rand bg-transparent px-5 py-2.5 text-sm font-medium text-ui-tinte hover:bg-ui-hover disabled:border-ui-linie disabled:opacity-40';
/* Loeschen bleibt rot: Wer etwas unwiderruflich entfernt, soll es nicht mit einem gewoehnlichen Knopf verwechseln. */
export const KNOPF_GEFAHR = 'inline-flex items-center justify-center gap-1.5 rounded-full border border-rose-200 bg-white px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-40';
/** Textlink mit Pfeil — die leiseste Aktion; unterstrichen erst beim Darueberfahren. */
export const LINK = 'inline-flex items-center gap-1 text-sm font-medium text-ui-tinte underline-offset-4 hover:underline';
/** Die eine Akzentkarte je Ansicht. */
export const AKZENT = 'ui-akzentkarte';
/** Ein schwebendes Stueck Produkt (Gehaltszettel, Luecken-Ring) — das Einzige mit grossem Schatten. */
export const SCHWEBEND = 'ui-schwebend';
/** Etikett ueber Kennzahlen — leise, ohne Grossbuchstaben-Geschrei. */
export const ETIKETT = 'text-sm text-ui-schiefer';
/** Beschriftung ueber einem Eingabefeld. */
export const FELD_LABEL = 'mb-1 block text-xs font-medium text-ui-tinte/80';
/** Eingabefeld (input, select): Rand, Rundung und Flaeche des Stils (index.css: .ui-feld). */
export const FELD = 'ui-feld w-full p-2 text-sm';
/** Fehlermeldung unter einer Aktion — Rot bleibt fuer Fehler. */
export const FEHLER = 'rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900';

/** Ueberschrift, Gewicht 400, in Inter Tight — die Handschrift der Seite. */
export function Titel({ children, gross = false, als: Tag = 'h1', klasse = '' }: {
  children: ReactNode; gross?: boolean; als?: 'h1' | 'h2'; klasse?: string;
}) {
  return (
    <Tag className={`ui-titel text-balance font-normal text-ui-tinte ${
      gross ? 'text-[34px] leading-[1.15] sm:text-[44px]' : 'text-[26px] leading-[1.2] sm:text-[30px]'
    } ${klasse}`}>
      {children}
    </Tag>
  );
}

/** Das eine hervorgehobene Wort einer Ueberschrift — Cyan auf hellem Blau, hoechstens eins je Ueberschrift. */
export function Hervor({ children }: { children: ReactNode }) {
  return <span className="ui-hervor">{children}</span>;
}

export function Karte({ titel, children, rechts, klasse = '' }: {
  titel?: ReactNode; children: ReactNode; rechts?: ReactNode; klasse?: string;
}) {
  return (
    <section className={`ui-karte p-5 sm:p-7 ${klasse}`}>
      {(titel || rechts) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {titel && <h2 className="text-lg font-medium tracking-[-0.01em] text-ui-tinte sm:text-xl">{titel}</h2>}
          {rechts}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * Ein Hinweis in neutraler Innenflaeche, mit Symbol davor — statt gelber
 * oder gruener Kaesten: Der Stil kennt keine Ampelfarben, und der Hinweis
 * soll gelesen werden, nicht erschrecken.
 */
export function Hinweis({ children, symbol: Zeichen = Info, klasse = '' }: {
  children: ReactNode; symbol?: LucideIcon; klasse?: string;
}) {
  return (
    <div role="note" className={`ui-innen flex gap-2.5 px-4 py-3 text-sm leading-relaxed text-ui-tinte ${klasse}`}>
      <Zeichen className="mt-0.5 h-4 w-4 shrink-0 text-ui-schiefer" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Ein leiser Vermerk wie „geschätzt“ — Kontur statt Farbe. */
export function Vermerk({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full border border-ui-linie bg-ui-karte px-2.5 py-0.5 text-xs text-ui-schiefer">
      {children}
    </span>
  );
}

/** Mehrzeiliges Textfeld — wie `TextFeld`, mit Zeichengrenze. */
export function TextBereich({ label, wert, onChange, maxLaenge, zeilen = 3, hilfe, platzhalter }: {
  label: string; wert: string; onChange: (s: string) => void; maxLaenge: number;
  zeilen?: number; hilfe?: string; platzhalter?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={FELD_LABEL}>{label}</label>
      <textarea
        id={id}
        value={wert}
        rows={zeilen}
        maxLength={maxLaenge}
        placeholder={platzhalter}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={hilfe ? `${id}-hilfe` : undefined}
        className="ui-feld w-full p-3 text-sm leading-relaxed"
      />
      <div className="mt-1 flex justify-between gap-2 text-xs text-ui-schiefer">
        <span id={`${id}-hilfe`}>{hilfe}</span>
        <span className="tabular-nums">{wert.length}/{maxLaenge}</span>
      </div>
    </div>
  );
}
