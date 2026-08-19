import { useEffect, useState, type ReactNode } from 'react';

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

export const euro = (n: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(
    Number.isFinite(n) ? n : 0,
  );

export const prozent = (n: number, stellen = 1) =>
  `${(Number.isFinite(n) ? n * 100 : 0).toLocaleString('de-DE', { maximumFractionDigits: stellen, minimumFractionDigits: stellen })} %`;
