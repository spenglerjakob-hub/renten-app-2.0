import { useEffect, useState, type ReactNode } from 'react';
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
}) {
  const { label, wert, onChange, min = 0, max = Number.MAX_SAFE_INTEGER, einheit, hilfe } = props;
  const id = props.id ?? `f-${label.replace(/\W+/g, '-').toLowerCase()}`;
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
          className={`w-full rounded-md border p-2 text-sm font-medium tabular-nums ${
            fehler ? 'border-rose-400 bg-rose-50' : 'border-slate-300 bg-white'
          } ${einheit ? 'pr-10' : ''}`}
        />
        {einheit && (
          <span className="pointer-events-none absolute right-3 top-2 text-sm text-slate-400">{einheit}</span>
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
}) {
  return (
    <ZahlFeld
      label={props.label}
      wert={Math.round(props.wert * 1000) / 10}
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
  const id = `t-${props.label.replace(/\W+/g, '-').toLowerCase()}`;
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
  const id = `d-${props.label.replace(/\W+/g, '-').toLowerCase()}`;

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
}) {
  const id = `s-${props.label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-slate-600 mb-1">{props.label}</label>
      <select
        id={id}
        value={props.wert}
        onChange={(e) => props.onChange(e.target.value as T)}
        className="w-full rounded-md border border-slate-300 bg-white p-2 text-sm"
      >
        {props.optionen.map((o) => <option key={o.wert} value={o.wert}>{o.text}</option>)}
      </select>
    </div>
  );
}

export function Schalter(props: { label: string; wert: boolean; onChange: (b: boolean) => void }) {
  const id = `c-${props.label.replace(/\W+/g, '-').toLowerCase()}`;
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

export function Karte(props: { titel: string; kopfzeile?: ReactNode; children: ReactNode; klasse?: string }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-sm druckbereich ${props.klasse ?? ''}`}>
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
export function Abschnitt(props: { titel: string; children: ReactNode }) {
  return (
    <section className="druckbereich">
      <h3 className="mb-2 border-b border-slate-100 pb-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
        {props.titel}
      </h3>
      {props.children}
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
}) {
  return (
    <section className={`overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm druckbereich ${props.klasse ?? ''}`}>
      <button
        type="button"
        onClick={props.onUmschalten}
        aria-expanded={props.offen}
        className="druck-kopf flex w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50"
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

export const euro = (n: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(
    Number.isFinite(n) ? n : 0,
  );

export const prozent = (n: number, stellen = 1) =>
  `${(Number.isFinite(n) ? n * 100 : 0).toLocaleString('de-DE', { maximumFractionDigits: stellen, minimumFractionDigits: stellen })} %`;
