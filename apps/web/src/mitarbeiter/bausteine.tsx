import { createContext, useContext, useEffect, useId, useState, type ReactNode } from 'react';
import type { BeratungStatus } from '@renten/schema';
import { firmenlogoLaden } from '../lib/bav-beratung';
import type { Auftritt } from '../features/auftritt';
import { useAuftritt } from '../store/auftritt';
import { euroText } from './texte';

/** Knopf-Klassen der Seite — dieselben wie im Rechner. */
export const KNOPF = 'inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-50';
export const KNOPF_ZWEIT = 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50';
export const KNOPF_GEFAHR = 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50';

export function Karte({ titel, children, rechts, klasse = '' }: {
  titel?: ReactNode; children: ReactNode; rechts?: ReactNode; klasse?: string;
}) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${klasse}`}>
      {(titel || rechts) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {titel && <h2 className="text-base font-black text-slate-900">{titel}</h2>}
          {rechts}
        </div>
      )}
      {children}
    </section>
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
      <label htmlFor={id} className="mb-1 block text-xs font-bold text-slate-700">{label}</label>
      <textarea
        id={id}
        value={wert}
        rows={zeilen}
        maxLength={maxLaenge}
        placeholder={platzhalter}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={hilfe ? `${id}-hilfe` : undefined}
        className="w-full rounded-lg border border-slate-300 bg-white p-2 text-sm leading-relaxed"
      />
      <div className="mt-0.5 flex justify-between gap-2 text-[11px] text-slate-500">
        <span id={`${id}-hilfe`}>{hilfe}</span>
        <span className="tabular-nums">{wert.length}/{maxLaenge}</span>
      </div>
    </div>
  );
}

const STATUS_TEXT: Record<BeratungStatus, string> = { offen: 'offen', teilnahme: 'Teilnahme', verzicht: 'Verzicht' };
export const STATUS_FARBE: Record<BeratungStatus, string> = {
  offen: 'bg-slate-100 text-slate-700',
  teilnahme: 'bg-emerald-100 text-emerald-800',
  verzicht: 'bg-amber-100 text-amber-900',
};

/** „Teilnahme 150 €“, „Verzicht“, „offen“. */
export function StatusChip({ status, betrag }: { status: BeratungStatus; betrag?: number }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_FARBE[status]}`}>
      {STATUS_TEXT[status]}{status === 'teilnahme' && betrag !== undefined && betrag > 0 ? ` ${euroText(betrag)}` : ''}
    </span>
  );
}

/** Das Logo einer Firma als Object-URL — geladen mit der eigenen Anmeldung, beim Wechsel freigegeben. */
export function useFirmenlogo(pfad: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let aktiv = true;
    let geladen: string | null = null;
    setUrl(null);
    if (pfad) {
      void firmenlogoLaden(pfad).then((u) => {
        if (aktiv) { geladen = u; setUrl(u); } else if (u) URL.revokeObjectURL(u);
      });
    }
    return () => {
      aktiv = false;
      if (geladen) URL.revokeObjectURL(geladen);
    };
  }, [pfad]);
  return url;
}

/** Der Auftritt des Beraters fuer den Briefkopf seiner Unterlagen — geladen, falls es noch niemand getan hat. */
export function useBeraterAuftritt(): Auftritt | null {
  const auftritt = useAuftritt((s) => s.auftritt);
  const status = useAuftritt((s) => s.status);
  const laden = useAuftritt((s) => s.laden);
  useEffect(() => { if (status === 'aus') void laden(); }, [status, laden]);
  return auftritt;
}

/** Logo und Name einer Firma — in Kopfzeilen und auf dem Bildschirm fuer den Mitarbeiter. */
export function FirmenZeichen({ name, logo, gross = false }: { name: string; logo: string | null; gross?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {logo && (
        <img src={logo} alt={`Logo ${name}`} className={`${gross ? 'h-14 max-w-[10rem]' : 'h-9 max-w-[7rem]'} shrink-0 object-contain`} />
      )}
      <span className={`min-w-0 break-words font-black text-slate-900 ${gross ? 'text-2xl sm:text-3xl' : 'text-lg'}`}>{name}</span>
    </div>
  );
}

/* --------------------------------------------------------------------------
 * DRUCKEN. Die Seite hat einen Druckbereich, der nur im Druck erscheint;
 * alles andere ist dann ausgeblendet. `drucken(inhalt)` setzt den Inhalt,
 * wartet, bis seine Bilder (Logos) dekodiert sind — hoechstens 1,5 s —, und
 * oeffnet dann den Druckdialog. Wie beim Gutachten im Rechner.
 * ------------------------------------------------------------------------ */

const DruckKontext = createContext<(inhalt: ReactNode) => void>(() => {});
export const useDrucken = () => useContext(DruckKontext);

export function DruckBereich({ children }: { children: ReactNode }) {
  const [inhalt, setInhalt] = useState<ReactNode>(null);
  const [runde, setRunde] = useState(0);

  useEffect(() => {
    if (inhalt === null) return;
    let aktiv = true;
    const bilder = Array.from(document.querySelectorAll<HTMLImageElement>('#druckbereich img'));
    const fertig = Promise.all(bilder.map((b) => b.decode().catch(() => undefined)));
    const frist = new Promise((weiter) => setTimeout(weiter, 1500));
    void Promise.race([fertig, frist]).then(() => { if (aktiv) window.print(); });
    return () => { aktiv = false; };
  }, [inhalt, runde]);

  useEffect(() => {
    const danach = () => setInhalt(null);
    window.addEventListener('afterprint', danach);
    return () => window.removeEventListener('afterprint', danach);
  }, []);

  const drucken = (x: ReactNode) => { setInhalt(x); setRunde((r) => r + 1); };

  return (
    <DruckKontext.Provider value={drucken}>
      <div className="print:hidden">{children}</div>
      <div id="druckbereich" className="hidden print:block">{inhalt}</div>
    </DruckKontext.Provider>
  );
}

/**
 * Der Ring der Versorgungsluecke: gruen die Netto-Rente, rot die Luecke —
 * zusammen der Nettolohn heute, der in der Mitte steht. Die Zahlen stehen
 * zusaetzlich als Text daneben; der Ring ist die Anschauung.
 */
export function LueckenRing({ nettolohn, rente, luecke, renteProzent, lueckeProzent }: {
  nettolohn: number; rente: number; luecke: number; renteProzent: number; lueckeProzent: number;
}) {
  const r = 42;
  const umfang = 2 * Math.PI * r;
  const anteil = nettolohn > 0 ? Math.min(1, Math.max(0, rente / nettolohn)) : 0;
  const ganz = (x: number) => euroText(Math.round(x));
  return (
    <svg viewBox="0 0 120 120" className="h-44 w-44 shrink-0 sm:h-52 sm:w-52" role="img"
      aria-label={`Nettolohn ${ganz(nettolohn)}: davon ${ganz(rente)} Netto-Altersrente (${renteProzent} %) und ${ganz(luecke)} Versorgungslücke (${lueckeProzent} %)`}>
      <circle cx="60" cy="60" r={r} fill="none" stroke="#f43f5e" strokeWidth="14" />
      <circle cx="60" cy="60" r={r} fill="none" stroke="#10b981" strokeWidth="14"
        strokeDasharray={`${anteil * umfang} ${umfang}`} transform="rotate(-90 60 60)" />
      <circle cx="60" cy="60" r="33" fill="#f1f5f9" />
      <text x="60" y="59" textAnchor="middle" fontSize="12.5" fontWeight="800" fill="#334155">{ganz(nettolohn)}</text>
      <text x="60" y="72" textAnchor="middle" fontSize="7.5" fill="#64748b">Ihr Nettolohn</text>
    </svg>
  );
}
