import { useId, type CSSProperties, type ReactNode } from 'react';
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
/*
 * Die kleinen Knoepfe fuer Zeilen und Listen (Kopieren, Ansehen,
 * Zurueckziehen) — dieselben drei Arten, eine Stufe kleiner, damit eine
 * Liste mit vielen Aktionen ruhig bleibt.
 */
export const KNOPF_KLEIN = 'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-ui-zweit-rand bg-ui-karte px-3 py-1.5 text-xs font-medium text-ui-tinte transition-colors hover:bg-ui-hover disabled:opacity-40';
export const KNOPF_KLEIN_HAUPT = 'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-ui-knopf-rand bg-ui-knopf px-3 py-1.5 text-xs font-medium text-ui-knopf-schrift transition-colors hover:bg-ui-knopf-hover disabled:opacity-40';
export const KNOPF_KLEIN_GEFAHR = 'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-40';
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
export function Titel({ children, gross = false, als: Tag = 'h1', klasse = '', id }: {
  children: ReactNode; gross?: boolean; als?: 'h1' | 'h2'; klasse?: string; id?: string;
}) {
  return (
    <Tag id={id} className={`ui-titel text-balance font-normal text-ui-tinte ${
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

/** Eine Marke, die etwas verlangt („Feedback überfällig“) — Sky Wash wie das hervorgehobene Wort, sparsam. */
export function Marke({ children }: { children: ReactNode }) {
  return <span className="ui-marke inline-flex items-center gap-1 whitespace-nowrap px-2 py-0.5 text-xs font-medium">{children}</span>;
}

/**
 * Ein Stand als Punkt und Wort, wie der Status der Beratungen: erledigt in
 * Tinte mit vollem Punkt, offen leise, vorbei mit leerem Ring — lesbar auch
 * ohne Farbe, ohne Ampel.
 */
export function Stand({ art, children }: { art: 'erledigt' | 'offen' | 'vorbei'; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-sm ${art === 'erledigt' ? 'text-ui-tinte' : 'text-ui-schiefer'}`}>
      <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${
        art === 'erledigt' ? 'bg-ui-tinte' : art === 'offen' ? 'bg-ui-asche' : 'border border-ui-asche bg-ui-karte'
      }`} />
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

/* --------------------------------------------------------------------------
 * DIE BAUSTEINE DER SEITEN — aus der Mitarbeiterberatung, fuer alle Seiten:
 * Einleitung, Kennzahlen, Aufstellungen, der Kernsatz in der Akzentkarte,
 * Anteile, Reiter als Pillen und Schritte als duenne Linien.
 * ------------------------------------------------------------------------ */

/** Die Einleitung unter dem Titel einer Seite oder Ansicht — leise, in Lesebreite. */
export const EINLEITUNG = 'max-w-3xl text-base leading-relaxed text-ui-schiefer';

/** Ein Absatz mit Hinweisen: Ueberschrift, darunter Punkte mit Gedankenstrich. */
export function Hinweise({ titel, punkte }: { titel?: string; punkte: readonly ReactNode[] }) {
  if (punkte.length === 0) return null;
  return (
    <div>
      {titel && <h3 className="text-base font-medium text-ui-tinte">{titel}</h3>}
      <ul className={`${titel ? 'mt-2 ' : ''}space-y-2 text-sm leading-relaxed text-ui-tinte`}>
        {punkte.map((p, i) => (
          <li key={i} className="flex gap-3"><span aria-hidden className="text-ui-asche">—</span><span>{p}</span></li>
        ))}
      </ul>
    </div>
  );
}

/** Eine Zahl mit Etikett — flach auf weisser Karte, oder als die eine Akzentkarte. */
export function WertKarte({ titel, wert, unten, akzent = false }: { titel: string; wert: string; unten: string; akzent?: boolean }) {
  return (
    <div className={`p-5 sm:p-6 ${akzent ? AKZENT : 'ui-karte text-ui-tinte'}`}>
      <p className={`text-sm ${akzent ? '' : 'text-ui-schiefer'}`}>{titel}</p>
      <p className={`mt-1 tabular-nums ${akzent ? 'ui-titel text-[40px] leading-none' : 'text-[28px] font-medium leading-tight'}`}>
        {akzent ? <Hervor>{wert}</Hervor> : wert}
      </p>
      <p className={`mt-2 text-xs ${akzent ? '' : 'text-ui-schiefer'}`}>{unten}</p>
    </div>
  );
}

/** Eine Zeile einer kleinen Aufstellung (in einem dl) — die Summe unter einer Linie in Tinte. */
export function Posten({ text, wert, summe = false }: { text: ReactNode; wert: ReactNode; summe?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 py-1 ${summe ? 'mt-1 border-t border-ui-tinte pt-2 font-medium text-ui-tinte' : 'text-ui-schiefer'}`}>
      <dt>{text}</dt>
      <dd className={`text-right tabular-nums ${summe ? '' : 'text-ui-tinte'}`}>{wert}</dd>
    </div>
  );
}

/** Eine Kennzahl in einer Liste (dl): leises Etikett, wenn noetig mit dem Punkt der Legende, darunter die Zahl gross. */
export function Zahl({ etikett, wert, zusatz, punkt }: {
  etikett: ReactNode; wert: ReactNode;
  /** Klein hinter der Zahl, etwa der Anteil („· 48 %“) */
  zusatz?: ReactNode;
  /** Farbe des Punkts vor dem Etikett — wie im Ring oder Balken daneben */
  punkt?: string;
}) {
  return (
    <div>
      <dt className="flex items-center gap-2 text-sm text-ui-schiefer">
        {punkt && <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${punkt}`} />}{etikett}
      </dt>
      <dd className="mt-0.5 text-[28px] font-medium leading-tight tabular-nums text-ui-tinte">
        {wert}{zusatz !== undefined && <> <span className="whitespace-nowrap text-base text-ui-schiefer">· {zusatz}</span></>}
      </dd>
    </div>
  );
}

/**
 * Der Kernsatz einer Ansicht in der Akzentkarte: die Aussage, um die es
 * geht, in Inter Tight, die Zahl darin hervorgehoben. Hoechstens einer je
 * Ansicht — wie in der Mitarbeiterberatung die Regel der Firma, die Luecke
 * und das Fazit.
 *
 * Am Telefon mindestens 24 px: erst ab da gilt der Satz als grosse Schrift,
 * und das hervorgehobene Wort (4,18:1) erfuellt die 3:1. Bei 22 px galten 4,5:1.
 */
export function Kernsatz({ etikett, children, gross = false, klasse = '' }: {
  etikett?: ReactNode; children: ReactNode; gross?: boolean; klasse?: string;
}) {
  return (
    <div className={`${AKZENT} ${gross ? 'p-6 sm:p-10' : 'px-5 py-4 sm:px-6 sm:py-5'} ${klasse}`}>
      {etikett && <p className="text-sm">{etikett}</p>}
      <p className={`ui-titel text-balance font-normal ${etikett ? 'mt-2 ' : ''}${
        gross ? 'text-[26px] leading-[1.25] sm:text-[34px]' : 'text-[24px] leading-snug sm:text-[26px]'
      }`}>
        {children}
      </p>
    </div>
  );
}

/** Ein Ganzes und seine Teile: ein Balken, darunter die Legende mit Betraegen — einfarbig abgestuft. */
export function Anteile({ teile, format }: {
  teile: readonly { text: string; wert: number; farbe: string }[];
  format: (n: number) => string;
}) {
  const summe = teile.reduce((x, t) => x + Math.max(0, t.wert), 0);
  return (
    <>
      <div className="mt-2 flex h-3 gap-0.5 overflow-hidden rounded-full" aria-hidden>
        {teile.map((t) => (
          <div key={t.text} className={t.farbe} style={{ width: `${summe > 0 ? (Math.max(0, t.wert) / summe) * 100 : 0}%` }} />
        ))}
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {teile.map((t) => (
          <div key={t.text} className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-2 text-ui-schiefer"><span className={`h-2.5 w-2.5 rounded-full ${t.farbe}`} aria-hidden />{t.text}</dt>
            <dd className="tabular-nums text-ui-tinte">{format(t.wert)}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

/**
 * Der Regler des Stils (index.css: .ui-regler), gefuellt bis zum Wert — fuer
 * Betraege in festen Schritten. Die Pfeiltasten gehen je einen Schritt. Liegt
 * der Wert ausserhalb der Spanne, steht der Regler am Rand; die Zahl daneben
 * nennt den echten Wert.
 */
export function Regler({ wert, min = 0, max, schritt, onChange, beschriftung, wertText, klasse = '' }: {
  wert: number; min?: number; max: number; schritt: number; onChange: (n: number) => void;
  /** Wofuer der Regler steht — fuer Screenreader, die Beschriftung steht sichtbar daneben */
  beschriftung: string;
  /** Der Wert in Worten, etwa „100 Euro im Monat“ */
  wertText: string;
  klasse?: string;
}) {
  const w = Math.min(max, Math.max(min, wert));
  return (
    <input
      type="range" min={min} max={max} step={schritt} value={w}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label={beschriftung} aria-valuetext={wertText}
      style={{ '--anteil': `${((w - min) / Math.max(1, max - min)) * 100}%` } as CSSProperties}
      className={`ui-regler block w-full ${klasse}`}
    />
  );
}

/** Reiter als Pillen: der aktive gefuellt in Soot, die anderen nur Text. */
export function Pillen<T extends string>({ reiter, aktiv, onWechsel, beschriftung, kennung }: {
  reiter: readonly { id: T; inhalt: ReactNode }[];
  aktiv: T;
  onWechsel: (id: T) => void;
  beschriftung: string;
  /** Kennungen von Reiter und Bereich (aria-controls), wenn die Pillen einen Bereich umschalten */
  kennung?: (id: T) => { reiter: string; bereich: string };
}) {
  return (
    <div role="tablist" aria-label={beschriftung} className="inline-flex max-w-full flex-wrap gap-1 rounded-full border border-ui-linie bg-ui-karte p-1">
      {reiter.map((r) => (
        <button
          key={r.id}
          type="button"
          role="tab"
          id={kennung?.(r.id).reiter}
          aria-selected={aktiv === r.id}
          aria-controls={kennung?.(r.id).bereich}
          onClick={() => onWechsel(r.id)}
          className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors sm:px-4 ${
            aktiv === r.id ? 'bg-ui-dunkel text-white' : 'text-ui-schiefer hover:text-ui-tinte'
          }`}
        >
          {r.inhalt}
        </button>
      ))}
    </div>
  );
}

/**
 * Schritte als duenne Linien, wie die Schrittleiste der Beratung: aktuell
 * volle Tinte, erledigt halbe, offen Haarlinie — ohne Ampel. Am Telefon
 * steht statt der Namen „Schritt 2 von 7: …“.
 *
 * `offen` markiert Schritte, in denen noch etwas fehlt, mit einem leeren
 * Kreis hinter dem Namen — derselbe wie bei offenen Schritten des Falls
 * (FallFortschritt). Ohne die Angabe bleibt die Leiste, wie sie in der
 * Beratung steht.
 */
export function Etappen({ schritte, aktiv, onWechsel, beschriftung, erledigt, offen, offenText = 'noch offen' }: {
  schritte: readonly string[];
  aktiv: number;
  onWechsel: (i: number) => void;
  beschriftung: string;
  /** Ist ein Schritt erledigt? Ohne Angabe: alle vor dem aktuellen. Mit Angabe sagt es auch der Vorlesetext. */
  erledigt?: (i: number) => boolean;
  offen?: (i: number) => boolean;
  /** Was der leere Kreis bedeutet — fuer den Vorlesetext und die Zeile am Telefon; je Schritt, wenn er dort anderes heisst */
  offenText?: string | ((i: number) => string);
}) {
  const fertig = erledigt ?? ((i: number) => i < aktiv);
  const offenWort = (i: number) => (typeof offenText === 'function' ? offenText(i) : offenText);
  const zusatz = (i: number) => (offen?.(i) ? ` — ${offenWort(i)}` : i !== aktiv && erledigt?.(i) ? ' — erledigt' : '');
  return (
    <nav aria-label={beschriftung}>
      <ol className="grid gap-1" style={{ gridTemplateColumns: `repeat(${schritte.length}, minmax(0, 1fr))` }}>
        {schritte.map((t, i) => (
          <li key={t}>
            <button
              type="button"
              onClick={() => onWechsel(i)}
              aria-current={i === aktiv ? 'step' : undefined}
              aria-label={`Schritt ${i + 1}: ${t}${zusatz(i)}`}
              className="group flex w-full flex-col items-center gap-1"
            >
              <span className={`h-1 w-full rounded-full ${i === aktiv ? 'bg-ui-tinte' : fertig(i) ? 'bg-ui-tinte/30' : 'bg-ui-linie'}`} />
              <span className={`hidden text-xs leading-tight sm:block ${i === aktiv ? 'font-medium text-ui-tinte' : 'text-ui-schiefer group-hover:text-ui-tinte'}`}>
                {t}
                {offen?.(i) && <span aria-hidden className="ml-1.5 inline-block h-2 w-2 rounded-full border border-ui-schiefer align-middle" />}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-ui-schiefer sm:hidden">
        Schritt {aktiv + 1} von {schritte.length}: {schritte[aktiv]}{offen?.(aktiv) && ` · ${offenWort(aktiv)}`}
      </p>
    </nav>
  );
}
