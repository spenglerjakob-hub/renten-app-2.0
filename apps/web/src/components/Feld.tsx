import {
  useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { parseDatum, toDe } from '@renten/engine';

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
}) {
  const { label, wert, onChange, min = 0, max = Number.MAX_SAFE_INTEGER, einheit, hilfe, gross } = props;
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

  useEffect(() => { setText(String(wert).replace('.', ',')); }, [wert]);

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

  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      <div className="relative">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={text}
          onChange={(e) => uebernehmen(e.target.value)}
          aria-invalid={fehler ? true : undefined}
          aria-describedby={fehler ? `${id}-fehler` : hilfe ? `${id}-hilfe` : undefined}
          className={`w-full rounded-md border font-medium tabular-nums ${
            gross ? 'p-3 text-xl font-bold' : 'p-2 text-sm'
          } ${
            fehler ? 'border-rose-400 bg-rose-50' : 'border-slate-300 bg-white'
          } ${einheit ? (gross ? 'pr-12' : 'pr-10') : ''}`}
        />
        {einheit && (
          <span className={`pointer-events-none absolute text-slate-400 ${
            gross ? 'right-4 top-3.5 text-lg' : 'right-3 top-2 text-sm'
          }`}>
            {einheit}
          </span>
        )}
      </div>
      {fehler && <p id={`${id}-fehler`} className="mt-1 text-xs text-rose-600">{fehler}</p>}
      {!fehler && hilfe && <p id={`${id}-hilfe`} className="mt-1 text-xs text-slate-500">{hilfe}</p>}
    </div>
  );
}

/** Prozenteingabe: zeigt Prozent, speichert Dezimalwerte. */
export function ProzentFeld(props: {
  label: string; wert: number; onChange: (n: number) => void;
  min?: number; max?: number; hilfe?: string;
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
    />
  );
}

export function TextFeld(props: {
  label: string; wert: string; onChange: (s: string) => void;
  platzhalter?: string; fehler?: string | null;
}) {
  const id = `t${useId()}`;
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-slate-600 mb-1">{props.label}</label>
      <input
        id={id}
        type="text"
        value={props.wert}
        placeholder={props.platzhalter}
        onChange={(e) => props.onChange(e.target.value)}
        aria-invalid={props.fehler ? true : undefined}
        className={`w-full rounded-md border p-2 text-sm ${
          props.fehler ? 'border-rose-400 bg-rose-50' : 'border-slate-300 bg-white'
        }`}
      />
      {props.fehler && <p className="mt-1 text-xs text-rose-600">{props.fehler}</p>}
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
}) {
  const id = `d${useId()}`;

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

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-slate-600">{props.label}</label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="TT.MM.JJJJ"
        value={text}
        onChange={(e) => uebernehmen(e.target.value)}
        aria-invalid={fehler ? true : undefined}
        aria-describedby={fehler ? `${id}-fehler` : undefined}
        className={`w-full rounded-md border p-2 text-sm tabular-nums ${
          fehler ? 'border-rose-400 bg-rose-50' : 'border-slate-300 bg-white'
        }`}
      />
      {fehler
        ? <p id={`${id}-fehler`} className="mt-1 text-xs text-rose-600">{fehler}</p>
        : props.hilfe && <p className="mt-1 text-xs text-slate-500">{props.hilfe}</p>}
      {props.zusatz}
    </div>
  );
}

export function AuswahlFeld<T extends string>(props: {
  label: string; wert: T; onChange: (v: T) => void;
  optionen: readonly { wert: T; text: string }[];
  hilfe?: string;
}) {
  const id = `s${useId()}`;
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-slate-600 mb-1">{props.label}</label>
      <select
        id={id}
        value={props.wert}
        onChange={(e) => props.onChange(e.target.value as T)}
        aria-describedby={props.hilfe ? `${id}-hilfe` : undefined}
        className="w-full rounded-md border border-slate-300 bg-white p-2 text-sm"
      >
        {props.optionen.map((o) => <option key={o.wert} value={o.wert}>{o.text}</option>)}
      </select>
      {props.hilfe && <p id={`${id}-hilfe`} className="mt-1 text-xs text-slate-500">{props.hilfe}</p>}
    </div>
  );
}

export function Schalter(props: { label: string; wert: boolean; onChange: (b: boolean) => void }) {
  const id = `c${useId()}`;
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
      <input
        id={id} type="checkbox" checked={props.wert}
        onChange={(e) => props.onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-indigo-600"
      />
      {props.label}
    </label>
  );
}

/**
 * Eingabe oder Ergebnis — die Grundfarbe einer Karte.
 *
 * Auf der Seite zum Altersvorsorgedepot steht die Eingabespalte seit jeher
 * auf getoentem Grund mit kraeftigem Rand, die Ergebnisse auf weissen
 * Karten. Der Rechner macht es jetzt genauso.
 *
 * Bewusst eine VARIANTE und keine ueber `klasse` nachgeschobene Klasse:
 * `bg-white` und `bg-indigo-50/50` haben dieselbe Spezifitaet, und welche
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
  ergebnis: 'border-slate-200 bg-white',
  eingabe: 'border-2 border-indigo-200 bg-indigo-50/50',
};

export function Karte(props: {
  titel: string; kopfzeile?: ReactNode; children: ReactNode; klasse?: string; ton?: Ton;
}) {
  return (
    <section className={`rounded-xl border shadow-sm druckbereich ${TON[props.ton ?? 'ergebnis']} ${props.klasse ?? ''}`}>
      <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-bold text-slate-700">{props.titel}</h2>
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
        <h3 className="mb-2 border-b border-slate-100 pb-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
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
        className="druck-kopf mb-2 flex w-full items-center justify-between gap-2 border-b border-slate-100 pb-1.5 text-left"
      >
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
          {props.titel}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform print:hidden ${offen ? 'rotate-180' : ''}`}
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
    <section className={`overflow-hidden rounded-xl border shadow-sm druckbereich ${TON[props.ton ?? 'ergebnis']} ${props.klasse ?? ''}`}>
      <button
        type="button"
        onClick={props.onUmschalten}
        aria-expanded={props.offen}
        className={`druck-kopf flex w-full items-center justify-between gap-3 border-b px-4 py-3 text-left ${
          eingabe ? 'border-indigo-100 hover:bg-indigo-100/40' : 'border-slate-100 hover:bg-slate-50'
        }`}
      >
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-700">
          {props.symbol}
          {props.titel}
        </h2>
        <span className="flex items-center gap-3">
          {props.kopfzeile}
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-slate-400 transition-transform print:hidden ${props.offen ? 'rotate-180' : ''}`}
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
      <div className="mb-0.5 flex items-center text-[10px] font-bold uppercase tracking-wider text-slate-500 sm:mb-1 sm:text-xs">
        {props.titel}
        {props.info && <InfoPunkt titel={props.titel}>{props.info}</InfoPunkt>}
      </div>
      <div className={`text-base font-black tabular-nums sm:text-lg ${props.farbe ?? 'text-slate-800'}`}>
        {props.wert}
      </div>
      {props.fussnote && <div className="mt-0.5 text-[10px] text-slate-500">{props.fussnote}</div>}
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
      <span className="text-slate-600">
        {props.text}
        {props.info && <InfoPunkt titel={props.text.replace(/^[−=]\s*/, '')}>{props.info}</InfoPunkt>}
      </span>
      <span className={`shrink-0 font-semibold tabular-nums ${props.farbe ?? 'text-slate-800'}`}>
        {props.wert}
      </span>
    </div>
  );
}

export const euro = (n: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(
    Number.isFinite(n) ? n : 0,
  );

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
        className="ml-1 inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full border border-slate-300 bg-white text-[9px] font-bold leading-none text-slate-500 hover:border-slate-400 hover:text-slate-700"
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
          className="pointer-events-none fixed z-50 w-60 rounded-lg border border-slate-300 bg-white p-2.5 text-left text-[11px] font-normal leading-relaxed text-slate-700 shadow-lg print:hidden sm:w-72"
        >
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
            {props.titel}
          </span>
          {props.children}
        </span>,
        document.body,
      )}
    </span>
  );
}
