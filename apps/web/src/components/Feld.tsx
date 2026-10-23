import {
  useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { parseDatum, toDe } from '@renten/engine';
import { FELD_LABEL } from './stil';

/**
 * VORBELEGT — der Wert im Feld stammt nicht vom Berater, sondern aus der
 * Vorbelegung eines neuen Falls (siehe `features/vorbelegung.ts`).
 *
 * Die Marke steht UNTER dem Feld, nicht neben der Beschriftung: Dort braeche
 * sie lange Beschriftungen um, und die Felder einer Zeile staenden nicht
 * mehr auf einer Hoehe.
 */
export interface Vorbelegt {
  art: 'beispiel' | 'standard';
  /** Woher der Standardwert kommt — steht im Tooltip */
  hinweis?: string;
  /** „Stimmt so“: bestaetigt einen Beispielwert, ohne ihn zu aendern */
  onPruefen?: () => void;
}

const VORBELEGT_TEXT = {
  standard: 'Vorbelegt mit einem üblichen Wert. Ändern Sie ihn, wenn er für Ihren Mandanten nicht passt.',
  beispiel: 'Ein Beispiel, keine Angabe Ihres Mandanten. Im Gutachten steht es als Beispielwert, bis Sie es ersetzen oder bestätigen.',
} as const;

export function VorbelegtMarke({ v, id, klasse = 'mt-1' }: { v: Vorbelegt; id?: string; klasse?: string }) {
  const titel = v.hinweis ? `${v.hinweis} ${VORBELEGT_TEXT[v.art]}` : VORBELEGT_TEXT[v.art];
  /*
    Standardwerte leise: ein Wort, kein Kaestchen. Dass ein Eingabefeld
    anpassbar ist, sieht man ihm an; unter jedem zweiten Feld ein grauer
    Kasten machte das Formular unruhig, ohne mehr zu sagen. Woher der Wert
    stammt, traegt weiter der Tooltip (gepunktete Linie).
  */
  if (v.art === 'standard') {
    return (
      <span id={id} title={titel}
        className={`inline-flex cursor-help items-center text-xs text-ui-schiefer underline decoration-ui-asche decoration-dotted underline-offset-2 print:hidden ${klasse}`}>
        Standardwert
      </span>
    );
  }
  /*
    Kurz, weil die Marke auch in schmalen Spalten (drei Felder je Zeile)
    in eine Zeile passen soll. Dass zu pruefen ist, sagen der Rahmen des
    Felds, der Knopf daneben und der Tooltip. Gestrichelt wie der Rahmen
    des Felds — vorlaeufig, ohne Ampelfarbe.
  */
  return (
    <span id={id} title={titel}
      className={`inline-flex flex-wrap items-center gap-x-1.5 rounded-full border border-dashed border-ui-schiefer/60 bg-ui-karte px-2 py-0.5 text-xs font-medium text-ui-tinte print:hidden ${klasse}`}>
      Beispielwert
      {v.onPruefen && (
        <button type="button" onClick={v.onPruefen}
          className="rounded-full px-1 text-ui-tinte underline decoration-ui-asche underline-offset-2 hover:decoration-ui-tinte">
          Stimmt so
        </button>
      )}
    </span>
  );
}

/**
 * Rahmen eines Felds mit Beispielwert — sichtbar am Feld selbst, ohne dass es
 * die Hoehe aendert. Nur der Rahmen, gestrichelt, keine Farbflaeche: Stehen
 * alle Felder einer Spalte auf Beispielwerten, sah die ganze Spalte sonst wie
 * ein Fehlerzustand aus. Rand und Flaeche sonst aus `.ui-feld`.
 */
const beispielRahmen = (v?: Vorbelegt) => (v?.art === 'beispiel' ? 'border-dashed border-ui-schiefer' : '');
/** Fehlerzustand eines Felds — Rot bleibt fuer Fehler. */
const FEHLER_RAHMEN = 'border-rose-400 bg-rose-50';

/**
 * Zahleneingabe mit deutscher Notation.
 *
 * Der Prototyp nutzte <input type="number">; `Number("2,5")` ergibt NaN, und
 * ein NaN lief ungebremst durch die gesamte Rechnung (Befund D3). Hier wird
 * das Komma akzeptiert, der Wert begrenzt und bei ungueltiger Eingabe der
 * letzte gueltige Zustand gehalten.
 */
export function ZahlFeld(props: {
  label: string;
  wert: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  schritt?: number;
  einheit?: string;
  hilfe?: string;
  id?: string;
  /** Groesseres Feld fuer die eine Zahl, an der alles Weitere haengt. */
  gross?: boolean;
  /**
   * Zwei Knoepfe zum Hoch- und Runterzaehlen um `schritt` — fuer Werte, die
   * man eher ausprobiert als eintippt (Lebenserwartung).
   *
   * WARUM NICHT `type="number"`: Das verschluckt das deutsche Komma (Befund
   * D3 oben), und seine Pfeile zeigt Chrome erst beim Darueberfahren — auf dem
   * Handy gar nicht. Diese Knoepfe sind immer da und lassen sich tippen.
   */
  stufen?: boolean;
  /**
   * Zwei Einheiten zum Umschalten statt einer festen — etwa „%" oder „€"
   * beim Arbeitgeberzuschuss. Der Schalter sitzt im Feld; so bleibt die
   * Zeile so hoch wie die Nachbarfelder. Umgerechnet wird nichts: Den Wert
   * zur gewaehlten Einheit liefert der Aufrufer.
   */
  einheitWahl?: {
    optionen: readonly { id: string; text: string; titel: string }[];
    aktiv: string;
    onWechsel: (id: string) => void;
  };
  /** Der Wert ist noch die Vorbelegung — Marke unter dem Feld */
  vorbelegt?: Vorbelegt;
}) {
  const {
    label, wert, onChange, min = 0, max = Number.MAX_SAFE_INTEGER, einheit, hilfe, gross, stufen, einheitWahl, vorbelegt,
  } = props;
  const schritt = props.schritt ?? 1;
  /*
    Die Kennung kam frueher aus der BESCHRIFTUNG. Steht dieselbe Beschriftung
    zweimal auf der Seite — zwei Vertragskarten, Person A und Person B —,
    tragen zwei Bedienelemente dieselbe id; `label for` zeigt dann auf das
    erste, und ein Klick auf die zweite Beschriftung springt in das falsche
    Feld. `useId` gibt jeder Einbindung ihre eigene.
  */
  const eigen = useId();
  const id = props.id ?? `f${eigen}`;
  const [text, setText] = useState(String(wert).replace('.', ','));
  const [fehler, setFehler] = useState<string | null>(null);

  // Kommt ein neuer Wert von aussen (auch nach einem Wechsel der Einheit),
  // gilt eine alte Fehlermeldung nicht mehr.
  useEffect(() => { setText(String(wert).replace('.', ',')); setFehler(null); }, [wert]);

  const uebernehmen = (roh: string) => {
    setText(roh);
    if (roh.trim() === '') { setFehler(null); onChange(min > 0 ? min : 0); return; }
    const n = Number(roh.replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(n)) { setFehler('Bitte eine Zahl eingeben'); return; }
    if (n < min) { setFehler(`Mindestens ${min}`); return; }
    if (n > max) { setFehler(`Hoechstens ${max}`); return; }
    setFehler(null);
    onChange(n);
  };

  /*
    Ein Schritt rauf oder runter — ueber denselben `onChange` wie eine
    Tastatureingabe, also kein zweiter Weg in den Speicher. Auf die Grenzen
    geklemmt statt mit Fehlermeldung: Wer an der Grenze weiterklickt, hat
    nichts falsch gemacht. Gerundet auf die Nachkommastellen des Schritts,
    damit 0,1 + 0,2 nicht als 0,30000000000000004 im Feld steht.
  */
  const stelle = (String(schritt).split('.')[1] ?? '').length;
  const stufe = (richtung: 1 | -1) => {
    const roh = Math.min(max, Math.max(min, wert + richtung * schritt));
    const n = Number(roh.toFixed(stelle));
    setFehler(null);
    setText(String(n).replace('.', ','));
    onChange(n);
  };

  return (
    <div>
      <label htmlFor={id} className={FELD_LABEL}>{label}</label>
      <div className="relative">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={text}
          onChange={(e) => uebernehmen(e.target.value)}
          // Pfeiltasten wie beim nativen Zahlenfeld — nur mit Stufenknoepfen,
          // sonst bleibt das Feld, wie es war.
          onKeyDown={stufen ? (e) => {
            if (e.key === 'ArrowUp') { e.preventDefault(); stufe(1); }
            if (e.key === 'ArrowDown') { e.preventDefault(); stufe(-1); }
          } : undefined}
          aria-invalid={fehler ? true : undefined}
          aria-describedby={[
            vorbelegt ? `${id}-vorbelegt` : '',
            fehler ? `${id}-fehler` : hilfe ? `${id}-hilfe` : '',
          ].filter(Boolean).join(' ') || undefined}
          className={`ui-feld w-full font-medium tabular-nums ${
            gross ? 'p-3 text-xl' : 'p-2 text-sm'
          } ${
            fehler ? FEHLER_RAHMEN : beispielRahmen(vorbelegt)
          } ${einheitWahl ? 'pr-20' : stufen
            ? (einheit ? 'pr-14' : 'pr-8')
            : einheit ? (gross ? 'pr-12' : 'pr-10') : ''}`}
        />
        {einheitWahl && (
          <span role="radiogroup" aria-label={`${label}: Einheit`}
            className="absolute inset-y-1 right-1 flex gap-0.5 rounded bg-ui-linie/70 p-0.5">
            {einheitWahl.optionen.map((o) => (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={einheitWahl.aktiv === o.id}
                aria-label={o.titel}
                title={o.titel}
                onClick={() => einheitWahl.onWechsel(o.id)}
                className={`min-w-7 rounded px-1.5 text-xs font-medium ${
                  einheitWahl.aktiv === o.id ? 'bg-white text-ui-tinte shadow-sm' : 'text-ui-tinte/70 hover:text-ui-tinte'
                }`}
              >
                {o.text}
              </button>
            ))}
          </span>
        )}
        {einheit && !einheitWahl && (
          <span className={`pointer-events-none absolute text-ui-schiefer ${
            gross ? 'right-4 top-3.5 text-lg' : stufen ? 'right-7 top-2 text-sm' : 'right-3 top-2 text-sm'
          } ${stufen ? 'print:right-3' : ''}`}>
            {einheit}
          </span>
        )}
        {stufen && (
          /*
            Zwei Knoepfe uebereinander am rechten Rand, wie die Pfeile eines
            Zahlenfelds — nur immer sichtbar. `tabIndex={-1}`: Die Tastatur hat
            dafuer die Pfeiltasten im Feld; zwei zusaetzliche Tab-Stopps pro
            Feld waeren nur Weg.
          */
          <span className="absolute inset-y-px right-px flex w-6 flex-col overflow-hidden rounded-r-[5px] border-l border-ui-linie print:hidden">
            <button
              type="button"
              tabIndex={-1}
              aria-label={`${label} um ${String(schritt).replace('.', ',')} erhöhen`}
              disabled={wert >= max}
              onClick={() => stufe(1)}
              className="flex flex-1 items-center justify-center bg-ui-innen text-ui-schiefer hover:bg-ui-linie/60 hover:text-ui-tinte disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronUp className="h-3 w-3" aria-hidden />
            </button>
            <button
              type="button"
              tabIndex={-1}
              aria-label={`${label} um ${String(schritt).replace('.', ',')} verringern`}
              disabled={wert <= min}
              onClick={() => stufe(-1)}
              className="flex flex-1 items-center justify-center border-t border-ui-linie bg-ui-innen text-ui-schiefer hover:bg-ui-linie/60 hover:text-ui-tinte disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronDown className="h-3 w-3" aria-hidden />
            </button>
          </span>
        )}
      </div>
      {vorbelegt && <VorbelegtMarke v={vorbelegt} id={`${id}-vorbelegt`} />}
      {fehler && <p id={`${id}-fehler`} className="mt-1 text-xs text-rose-700">{fehler}</p>}
      {!fehler && hilfe && <p id={`${id}-hilfe`} className="mt-1 text-xs text-ui-schiefer">{hilfe}</p>}
    </div>
  );
}

/** Prozenteingabe: zeigt Prozent, speichert Dezimalwerte. */
export function ProzentFeld(props: {
  label: string; wert: number; onChange: (n: number) => void;
  min?: number; max?: number; hilfe?: string;
  vorbelegt?: Vorbelegt;
  /**
   * Nachkommastellen der ANZEIGE.
   *
   * Eine reicht fuer Inflation und Rendite — dort ist die zweite Stelle
   * Scheingenauigkeit. Der Zusatzbeitrag der Krankenkasse ist der Gegenfall:
   * Die Kassen weisen ihn auf zwei Stellen aus (2,29 %, nicht 2,3 %), und
   * gerundet stuende im Rechner ein Satz, den es so nicht gibt.
   */
  stellen?: number;
}) {
  const stellen = props.stellen ?? 1;
  const faktor = Math.pow(10, stellen);
  return (
    <ZahlFeld
      label={props.label}
      wert={Math.round(props.wert * 100 * faktor) / faktor}
      onChange={(n) => props.onChange(n / 100)}
      min={props.min ?? 0}
      max={props.max ?? 20}
      einheit="%"
      hilfe={props.hilfe}
      vorbelegt={props.vorbelegt}
    />
  );
}

export function TextFeld(props: {
  label: string; wert: string; onChange: (s: string) => void;
  platzhalter?: string; fehler?: string | null;
  /** Fuer Telefon und E-Mail die passende Tastatur am Telefon */
  typ?: 'text' | 'tel' | 'email';
  maxLaenge?: number;
  autoComplete?: string;
}) {
  const id = `t${useId()}`;
  return (
    <div>
      <label htmlFor={id} className={FELD_LABEL}>{props.label}</label>
      <input
        id={id}
        type={props.typ ?? 'text'}
        value={props.wert}
        placeholder={props.platzhalter}
        maxLength={props.maxLaenge}
        autoComplete={props.autoComplete}
        onChange={(e) => props.onChange(e.target.value)}
        aria-invalid={props.fehler ? true : undefined}
        className={`ui-feld w-full p-2 text-sm ${props.fehler ? FEHLER_RAHMEN : ''}`}
      />
      {props.fehler && <p className="mt-1 text-xs text-rose-700">{props.fehler}</p>}
    </div>
  );
}

/**
 * Datumseingabe mit Ziffernmaske.
 *
 * Zwei Dinge macht dieses Feld anders als das vorherige TextFeld:
 *
 * 1. MASKE: Es genuegt, die acht Ziffern zu tippen — die Punkte setzt das Feld.
 *    Alles ausser Ziffern wird verworfen, deshalb funktionieren auch
 *    12/05/1980 und 12-05-1980 beim Einfuegen aus der Zwischenablage.
 *
 * 2. NUR GUELTIGES WANDERT WEITER: Das TextFeld reichte jeden Tastenanschlag
 *    sofort an den Speicher. Nach dem ersten Zeichen stand dort
 *    geburtsdatum: "1", der Rechenkern konnte das nicht parsen und lieferte
 *    eine LEERE Zeitachse — die gesamte rechte Spalte verschwand beim Tippen.
 *    Hier bleibt der zuletzt gueltige Wert stehen, bis die Eingabe vollstaendig
 *    und kalendarisch moeglich ist.
 */
export function DatumFeld(props: {
  label: string;
  wert: string;
  onChange: (s: string) => void;
  hilfe?: ReactNode;
  zusatz?: ReactNode;
  /**
   * Knoepfe wie am `ZahlFeld`, hier um ein JAHR: Tag und Monat bleiben
   * stehen, nur ein 29.02. wird im Gemeinjahr zum 28.02.
   */
  stufen?: boolean;
  vorbelegt?: Vorbelegt;
}) {
  const id = `d${useId()}`;
  const { stufen, vorbelegt } = props;

  const anzeige = (roh: string) => {
    const d = parseDatum(roh);
    return d ? toDe(d) : roh;
  };

  const [text, setText] = useState(() => anzeige(props.wert));
  const [fehler, setFehler] = useState<string | null>(null);

  // Aendert sich der Wert von aussen (Laden, Zuruecksetzen, Automatik),
  // uebernimmt das Feld ihn — aber nicht, waehrend gerade getippt wird und
  // die Eingabe noch unfertig ist.
  useEffect(() => {
    const formatiert = anzeige(props.wert);
    setText((bisher) => (parseDatum(bisher) && toDe(parseDatum(bisher)!) === formatiert ? bisher : formatiert));
    setFehler(null);
  }, [props.wert]);

  const maskieren = (roh: string) => {
    const z = roh.replace(/\D/g, '').slice(0, 8);
    if (z.length <= 2) return z;
    if (z.length <= 4) return `${z.slice(0, 2)}.${z.slice(2)}`;
    return `${z.slice(0, 2)}.${z.slice(2, 4)}.${z.slice(4)}`;
  };

  const uebernehmen = (roh: string) => {
    const maskiert = maskieren(roh);
    setText(maskiert);

    const ziffern = maskiert.replace(/\D/g, '');
    if (ziffern.length < 8) {
      // Noch im Tippen — kein Fehler anzeigen, nichts weitergeben.
      setFehler(null);
      return;
    }

    const d = parseDatum(maskiert);
    if (!d) {
      setFehler('Dieses Datum gibt es nicht');
      return;
    }
    setFehler(null);
    props.onChange(toDe(d));
  };

  // Vom gespeicherten Wert aus, nicht vom halb getippten Text.
  const basis = parseDatum(props.wert);
  const stufe = (richtung: 1 | -1) => {
    if (!basis) return;
    const jahr = Math.min(2200, Math.max(1900, basis.jahr + richtung));
    const tageImMonat = new Date(Date.UTC(jahr, basis.monat, 0)).getUTCDate();
    const neu = toDe({ jahr, monat: basis.monat, tag: Math.min(basis.tag, tageImMonat) });
    setFehler(null);
    setText(neu);
    props.onChange(neu);
  };

  return (
    <div>
      <label htmlFor={id} className={FELD_LABEL}>{props.label}</label>
      <div className="relative">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="TT.MM.JJJJ"
          value={text}
          onChange={(e) => uebernehmen(e.target.value)}
          onKeyDown={stufen ? (e) => {
            if (e.key === 'ArrowUp') { e.preventDefault(); stufe(1); }
            if (e.key === 'ArrowDown') { e.preventDefault(); stufe(-1); }
          } : undefined}
          aria-invalid={fehler ? true : undefined}
          aria-describedby={[vorbelegt ? `${id}-vorbelegt` : '', fehler ? `${id}-fehler` : '']
            .filter(Boolean).join(' ') || undefined}
          className={`ui-feld w-full p-2 text-sm tabular-nums ${
            fehler ? FEHLER_RAHMEN : beispielRahmen(vorbelegt)
          } ${stufen ? 'pr-8' : ''}`}
        />
        {stufen && (
          <span className="absolute inset-y-px right-px flex w-6 flex-col overflow-hidden rounded-r-[5px] border-l border-ui-linie print:hidden">
            <button
              type="button"
              tabIndex={-1}
              aria-label={`${props.label} um ein Jahr später`}
              disabled={!basis || basis.jahr >= 2200}
              onClick={() => stufe(1)}
              className="flex flex-1 items-center justify-center bg-ui-innen text-ui-schiefer hover:bg-ui-linie/60 hover:text-ui-tinte disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronUp className="h-3 w-3" aria-hidden />
            </button>
            <button
              type="button"
              tabIndex={-1}
              aria-label={`${props.label} um ein Jahr früher`}
              disabled={!basis || basis.jahr <= 1900}
              onClick={() => stufe(-1)}
              className="flex flex-1 items-center justify-center border-t border-ui-linie bg-ui-innen text-ui-schiefer hover:bg-ui-linie/60 hover:text-ui-tinte disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronDown className="h-3 w-3" aria-hidden />
            </button>
          </span>
        )}
      </div>
      {vorbelegt && <VorbelegtMarke v={vorbelegt} id={`${id}-vorbelegt`} />}
      {fehler
        ? <p id={`${id}-fehler`} className="mt-1 text-xs text-rose-700">{fehler}</p>
        : props.hilfe && <p className="mt-1 text-xs text-ui-schiefer">{props.hilfe}</p>}
      {props.zusatz}
    </div>
  );
}

export function AuswahlFeld<T extends string>(props: {
  label: string; wert: T; onChange: (v: T) => void;
  optionen: readonly { wert: T; text: string }[];
  hilfe?: string;
  vorbelegt?: Vorbelegt;
}) {
  const id = `s${useId()}`;
  const { vorbelegt } = props;
  return (
    <div>
      <label htmlFor={id} className={FELD_LABEL}>{props.label}</label>
      <select
        id={id}
        value={props.wert}
        onChange={(e) => props.onChange(e.target.value as T)}
        aria-describedby={[vorbelegt ? `${id}-vorbelegt` : '', props.hilfe ? `${id}-hilfe` : '']
          .filter(Boolean).join(' ') || undefined}
        className={`ui-feld w-full p-2 text-sm ${beispielRahmen(vorbelegt)}`}
      >
        {props.optionen.map((o) => <option key={o.wert} value={o.wert}>{o.text}</option>)}
      </select>
      {vorbelegt && <VorbelegtMarke v={vorbelegt} id={`${id}-vorbelegt`} />}
      {props.hilfe && <p id={`${id}-hilfe`} className="mt-1 text-xs text-ui-schiefer">{props.hilfe}</p>}
    </div>
  );
}

export function Schalter(props: { label: string; wert: boolean; onChange: (b: boolean) => void; vorbelegt?: Vorbelegt }) {
  const id = `c${useId()}`;
  const schalter = (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-sm text-ui-tinte">
      <input
        id={id} type="checkbox" checked={props.wert}
        onChange={(e) => props.onChange(e.target.checked)}
        aria-describedby={props.vorbelegt ? `${id}-vorbelegt` : undefined}
        className="h-4 w-4 shrink-0"
      />
      {props.label}
    </label>
  );
  if (!props.vorbelegt) return schalter;
  // Die Marke NEBEN dem Label: Ein Knopf darin schaltete sonst den Haken um.
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {schalter}
      <VorbelegtMarke v={props.vorbelegt} id={`${id}-vorbelegt`} klasse="" />
    </span>
  );
}

/**
 * Eingabe oder Ergebnis — die Grundfarbe einer Karte.
 *
 * Die Ergebnisse stehen auf weissen Karten mit Haarlinie und weichem
 * Schatten (`.ui-karte`), die Eingaben auf vertieftem Stein ohne Schatten
 * (`.ui-eingabe`, index.css) — darauf heben sich die weissen Felder ab. Ohne
 * Farbton: Der Stil trennt ueber Flaeche und Tiefe, nicht ueber Farbe.
 *
 * Bewusst eine VARIANTE und keine ueber `klasse` nachgeschobene Klasse:
 * `.ui-karte` und `.ui-eingabe` haben dieselbe Spezifitaet, und welche
 * von beiden gewinnt, entscheidet dann die Reihenfolge im erzeugten
 * Stylesheet — nicht die Reihenfolge im Klassenstring. Das waere eine
 * Wette, keine Regel.
 */
export type Ton = 'ergebnis' | 'eingabe';

/**
 * Exportiert, weil zwei Flaechen den Eingabeton tragen, die keine Karte
 * sind: die Vertragskarte mit der Reiterleiste (`App.tsx`) und der Block
 * „1. Ihre Annahmen" im Vertrags-TUEV. Dieselbe Farbe an drei Stellen
 * abzuschreiben hiesse, dass sie beim naechsten Mal an zweien geaendert
 * wird.
 */
export const TON: Record<Ton, string> = {
  ergebnis: 'ui-karte',
  eingabe: 'ui-eingabe',
};

export function Karte(props: {
  titel: string; kopfzeile?: ReactNode; children: ReactNode; klasse?: string; ton?: Ton;
}) {
  return (
    <section className={`druckbereich ${TON[props.ton ?? 'ergebnis']} ${props.klasse ?? ''}`}>
      <header className="flex items-center justify-between border-b border-ui-linie px-4 py-3">
        <h2 className="text-base font-medium text-ui-tinte">{props.titel}</h2>
        {props.kopfzeile}
      </header>
      <div className="p-4">{props.children}</div>
    </section>
  );
}

/**
 * Schlichter Abschnitt ohne Kartenrahmen. Fuer Inhalte, die BEREITS in einer
 * Karte stecken — sonst entstuenden verschachtelte Kaesten.
 */
export function Abschnitt(props: {
  titel: string;
  children: ReactNode;
  /**
   * Macht den Abschnitt einklappbar. Ohne die Angabe bleibt er offen und
   * traegt wie bisher eine schlichte Ueberschrift — Bloecke aus zwei Feldern
   * einklappbar zu machen kostet nur einen Klick.
   */
  einklappbar?: boolean;
}) {
  const [offen, setOffen] = useState(true);
  if (!props.einklappbar) {
    return (
      <section className="druckbereich">
        <h3 className="mb-2 border-b border-ui-linie pb-1.5 text-sm font-medium text-ui-schiefer">
          {props.titel}
        </h3>
        {props.children}
      </section>
    );
  }

  /*
    `druck-kopf` am Knopf und `druck-inhalt` am Inhalt: Die Druckregeln in
    index.css blenden Bedienelemente aus und zeigen den Inhalt unabhaengig
    vom Zustand am Bildschirm — sonst fehlte ein zugeklappter Abschnitt im
    Ausdruck.
  */
  return (
    <section className="druckbereich">
      <button
        type="button"
        onClick={() => setOffen((v) => !v)}
        aria-expanded={offen}
        className="druck-kopf mb-2 flex w-full items-center justify-between gap-2 border-b border-ui-linie pb-1.5 text-left"
      >
        <span className="text-sm font-medium text-ui-schiefer">
          {props.titel}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-ui-schiefer transition-transform print:hidden ${offen ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      <div className={`druck-inhalt ${offen ? 'block' : 'hidden'}`}>{props.children}</div>
    </section>
  );
}

/**
 * Einklappbare Karte.
 *
 * Die Ueberschrift sitzt IM Knopf. Damit sie im Druck nicht verschwindet,
 * traegt der Knopf die Klasse `druck-kopf` — die Druckregeln in index.css
 * nehmen ihn davon aus, dass Bedienelemente ausgeblendet werden. Der Inhalt
 * ist im Druck immer sichtbar, unabhaengig vom Zustand am Bildschirm.
 */
export function AkkordeonKarte(props: {
  titel: string;
  offen: boolean;
  onUmschalten: () => void;
  symbol?: ReactNode;
  kopfzeile?: ReactNode;
  children: ReactNode;
  klasse?: string;
  ton?: Ton;
}) {
  const eingabe = props.ton === 'eingabe';
  return (
    <section className={`overflow-hidden druckbereich ${TON[props.ton ?? 'ergebnis']} ${props.klasse ?? ''}`}>
      <button
        type="button"
        onClick={props.onUmschalten}
        aria-expanded={props.offen}
        className={`druck-kopf flex w-full items-center justify-between gap-3 border-b border-ui-linie px-4 py-3 text-left ${
          eingabe ? 'hover:bg-ui-linie/40' : 'hover:bg-ui-innen'
        }`}
      >
        <h2 className="flex items-center gap-2 text-base font-medium text-ui-tinte">
          {props.symbol}
          {props.titel}
        </h2>
        <span className="flex items-center gap-3">
          {props.kopfzeile}
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-ui-schiefer transition-transform print:hidden ${props.offen ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </span>
      </button>
      <div className={`p-4 ${props.offen ? 'block' : 'hidden'} druck-inhalt`}>{props.children}</div>
    </section>
  );
}

/**
 * Kennzahlkachel: grosser Wert, kleine Ueberschrift, optionale Fussnote.
 *
 * Steht hier statt im Vertrags-TUEV, weil die Seite zum Altersvorsorgedepot
 * dieselben Kennzahlen zeigt. Zwei Fassungen wuerden mit der Zeit
 * unterschiedlich aussehen.
 */
export function Kennzahl(props: {
  titel: string; wert: string; farbe?: string; fussnote?: string;
  /** Herleitung der Zahl; erscheint als Fragezeichen hinter der Ueberschrift. */
  info?: ReactNode;
}) {
  return (
    <div>
      <div className="mb-0.5 flex items-center text-xs text-ui-schiefer sm:mb-1 sm:text-sm">
        {props.titel}
        {props.info && <InfoPunkt titel={props.titel}>{props.info}</InfoPunkt>}
      </div>
      <div className={`text-base font-medium tabular-nums sm:text-lg ${props.farbe ?? 'text-ui-tinte'}`}>
        {props.wert}
      </div>
      {props.fussnote && <div className="mt-0.5 text-xs text-ui-schiefer">{props.fussnote}</div>}
    </div>
  );
}

/** Eine Zeile einer Gegenueberstellung: Beschriftung links, Betrag rechts. */
export function GegenueberZeile(props: {
  text: string;
  wert: string;
  farbe?: string;
  /** Herleitung der Zahl; erscheint als Fragezeichen hinter der Beschriftung. */
  info?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-ui-tinte/80">
        {props.text}
        {props.info && <InfoPunkt titel={props.text.replace(/^[−=]\s*/, '')}>{props.info}</InfoPunkt>}
      </span>
      <span className={`shrink-0 font-medium tabular-nums ${props.farbe ?? 'text-ui-tinte'}`}>
        {props.wert}
      </span>
    </div>
  );
}

export const euro = (n: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(
    Number.isFinite(n) ? n : 0,
  );

/**
 * Euro mit Cent, wenn es Cent gibt. Fuer eingegebene Beitraege: „86,96 €"
 * auf „87 €" gerundet stimmte mit dem eigenen Gehaltszettel nicht mehr ueberein.
 */
export const euroGenau = (n: number) => {
  const w = Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  const cent = !Number.isInteger(w);
  return new Intl.NumberFormat('de-DE', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: cent ? 2 : 0, maximumFractionDigits: cent ? 2 : 0,
  }).format(w);
};

export const prozent = (n: number, stellen = 1) =>
  `${(Number.isFinite(n) ? n * 100 : 0).toLocaleString('de-DE', { maximumFractionDigits: stellen, minimumFractionDigits: stellen })} %`;

/**
 * Ein Fragezeichen neben einer Zahl, das ihre Herleitung zeigt.
 *
 * WARUM NICHT `title`: Das Attribut des Browsers erscheint erst nach einer
 * Sekunde Verharren, laesst sich nicht gestalten und ist auf einem Handy
 * ueberhaupt nicht erreichbar — dort gibt es kein Verharren.
 *
 * Deshalb ein echter Knopf: Er oeffnet bei Mauskontakt UND bei Tipp, und er
 * bleibt offen, bis man ihn schliesst. Auf dem Handy ist der Tipp der einzige
 * Weg; ohne ihn waere der Hinweis dort schlicht nicht vorhanden. Escape und
 * ein Klick daneben schliessen ihn wieder.
 *
 * DER TEXT SOLL DIE ECHTEN ZAHLEN TRAGEN, nicht die Regel im Allgemeinen.
 * „Der Grenzsteuersatz mindert den Beitrag" ist ein Lehrbuchsatz, den niemand
 * nachrechnen kann; „Ihr Beitrag von 150 EUR mindert Ihr zu versteuerndes
 * Einkommen von 35.216 EUR, der letzte Euro kostet dort 30 %" laesst sich
 * pruefen. Die Aufrufer setzen ihre Werte deshalb in den Text ein.
 *
 * Im Ausdruck entfaellt der Knopf: Auf Papier gibt es nichts aufzuklappen.
 */
export function InfoPunkt(props: {
  /** Worum es geht — steht fett ueber dem Text und im Vorlesetext des Knopfes. */
  titel: string;
  children: ReactNode;
}) {
  const [offen, setOffen] = useState(false);
  const eigen = useId();
  const id = `info${eigen}`;
  const knopfRef = useRef<HTMLButtonElement>(null);
  const blaseRef = useRef<HTMLSpanElement>(null);
  const [lage, setLage] = useState<{ top: number; left: number } | null>(null);

  /*
    Ein offener Hinweis schliesst bei Escape und bei einem Klick irgendwo
    sonst. Beide Zuhoerer haengen NUR solange dran, wie er offen ist — sonst
    laegen bei einem Dutzend Infopunkten auf der Seite ein Dutzend Zuhoerer
    auf dem Dokument, die alle nichts tun.
  */
  useEffect(() => {
    if (!offen) return;
    const zu = () => setOffen(false);
    const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') setOffen(false); };
    document.addEventListener('click', zu);
    document.addEventListener('keydown', taste);
    return () => {
      document.removeEventListener('click', zu);
      document.removeEventListener('keydown', taste);
    };
  }, [offen]);

  /*
    DIE LAGE WIRD GERECHNET, NICHT GESETZT.

    BEFUND: Die Blase war `absolute` und sass damit im Kasten ihrer Karte.
    Drei dieser Kaesten tragen `overflow-hidden` (damit der farbige Kopf die
    runden Ecken nicht ueberlaeuft) — und schnitten sie ab. Gemessen waren
    vom Hinweis an der Nettorendite noch 36 % zu sehen, von dem am
    Netto-Hebel 51 %; am Handy blieben bei der Foerderquote 64 %, weil die
    Blase seitlich ueber die Kartenkante lief.

    `useLayoutEffect` und nicht `useEffect`: Gerechnet werden muss, BEVOR der
    Browser zeichnet — sonst blitzt die Blase eine Bildfolge lang links oben
    auf und springt dann an ihren Platz.
  */
  useLayoutEffect(() => {
    if (!offen) return;

    const rechne = () => {
      const k = knopfRef.current?.getBoundingClientRect();
      const b = blaseRef.current?.getBoundingClientRect();
      if (!k || !b) return;

      const RAND = 8;   // Mindestabstand zum Bildschirmrand
      const LUFT = 6;   // Abstand zwischen Knopf und Blase

      // Waagerecht ueber dem Knopf gemittet, dann ins Sichtfenster geklemmt.
      const mitte = k.left + k.width / 2 - b.width / 2;
      const left = Math.min(Math.max(mitte, RAND), window.innerWidth - b.width - RAND);

      /*
        Senkrecht ueber den Knopf — und darunter, wenn oben nicht genug Platz
        ist. Ohne das Umklappen steht die Blase am oberen Bildschirmrand
        angeschlagen und verdeckt sich selbst.
      */
      const obenPasst = k.top - b.height - LUFT >= RAND;
      const top = obenPasst ? k.top - b.height - LUFT : k.bottom + LUFT;

      setLage({ top, left });
    };

    rechne();
    /*
      Beim Scrollen und bei Groessenaenderung neu rechnen: Eine `fixed`
      positionierte Blase bliebe sonst stehen, waehrend der Knopf unter ihr
      wegwandert. `capture: true`, damit auch Bildlaeufe INNERHALB eines
      Bereichs zaehlen — die steigen nicht bis zum Fenster auf.
    */
    window.addEventListener('scroll', rechne, true);
    window.addEventListener('resize', rechne);
    return () => {
      window.removeEventListener('scroll', rechne, true);
      window.removeEventListener('resize', rechne);
    };
  }, [offen]);

  // Beim Schliessen die Lage vergessen, damit die naechste Blase nicht kurz
  // an der Stelle der vorherigen erscheint.
  useEffect(() => { if (!offen) setLage(null); }, [offen]);

  return (
    <span className="inline-flex print:hidden">
      <button
        ref={knopfRef}
        type="button"
        aria-label={`Erklärung: ${props.titel}`}
        aria-expanded={offen}
        aria-controls={offen ? id : undefined}
        /*
          `stopPropagation`, weil der Zuhoerer oben JEDEN Klick im Dokument
          zum Schliessen nimmt — ohne ihn schloesse der eigene Klick den
          Hinweis im selben Moment wieder, in dem er aufgeht.

          UND ER OEFFNET, ER TOGGELT NICHT. Mit einem Toggle war der Hinweis
          nach jedem Klick ZU statt auf: Der Browser feuert vor dem Klick ein
          `mouseenter` — auch beim Tippen auf dem Handy —, das ihn bereits
          geoeffnet hat; der Klick kehrte das prompt wieder um. Geschlossen
          wird ueber Escape, einen Klick daneben oder das Verlassen mit der
          Maus; dafuer braucht es den Knopf nicht.
        */
        onClick={(e) => { e.stopPropagation(); setOffen(true); }}
        onMouseEnter={() => setOffen(true)}
        onMouseLeave={() => setOffen(false)}
        onFocus={() => setOffen(true)}
        onBlur={() => setOffen(false)}
        className="ml-1 inline-flex h-[18px] w-[18px] shrink-0 cursor-help items-center justify-center rounded-full border border-ui-feld-rand bg-white text-[10px] font-medium leading-none text-ui-schiefer hover:border-ui-schiefer hover:text-ui-tinte"
      >
        ?
      </button>
      {offen && createPortal(
        /*
          AM SEITENKOERPER, nicht in der Karte: Dort kann kein `overflow` sie
          mehr beschneiden. `fixed` allein reichte nicht — ein Vorfahre mit
          `transform`, `filter` oder `will-change` macht sich zum Bezugsrahmen,
          und dann klemmt es doch. Im Portal kann das nicht passieren.

          `pointer-events-none`, damit die Blase den Mauszeiger nicht abfaengt
          und `onMouseLeave` am Knopf zuverlaessig feuert. Bis die Lage
          gerechnet ist, bleibt sie unsichtbar — sie wird aber gerendert, denn
          ihre Hoehe ist es ja, die gemessen werden muss.
        */
        <span
          ref={blaseRef}
          id={id}
          role="tooltip"
          style={{ top: lage?.top ?? 0, left: lage?.left ?? 0, visibility: lage ? 'visible' : 'hidden' }}
          className="pointer-events-none fixed z-50 w-60 rounded-lg border border-ui-linie bg-white p-3 text-left text-xs font-normal leading-relaxed text-ui-tinte/80 shadow-lg print:hidden sm:w-72"
        >
          <span className="mb-1 block text-xs font-medium text-ui-tinte">
            {props.titel}
          </span>
          {props.children}
        </span>,
        document.body,
      )}
    </span>
  );
}
