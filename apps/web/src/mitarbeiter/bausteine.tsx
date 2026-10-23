import { createContext, useContext, useEffect, useId, useState, type ReactNode } from 'react';
import type { BeratungStatus } from '@renten/schema';
import { firmenlogoLaden } from '../lib/bav-beratung';
import type { Auftritt } from '../features/auftritt';
import { useAuftritt } from '../store/auftritt';
import { euroText } from './texte';

/*
 * DER STIL DIESER SEITE — nach der Referenz „Steep“ (serif analytics on warm
 * paper). Knoepfe sind Pillen in Tinte: gefuellt fuer die Hauptaktion, mit
 * Kontur fuer die zweite. Karten sind flach und nebelgrau, 24 px rund, ohne
 * Rahmen und Schatten. Pfirsich mit Siena-Schrift steht hoechstens einmal je
 * Ansicht — fuer die eine Aussage, die bleiben soll.
 */
export const KNOPF = 'inline-flex items-center justify-center gap-1.5 rounded-full bg-mb-tinte px-5 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-40';
export const KNOPF_ZWEIT = 'inline-flex items-center justify-center gap-1.5 rounded-full border border-mb-tinte bg-transparent px-5 py-2.5 text-sm font-medium text-mb-tinte hover:bg-mb-nebel disabled:border-mb-linie disabled:opacity-40';
/* Loeschen bleibt rot: Wer etwas unwiderruflich entfernt, soll es nicht mit einem gewoehnlichen Knopf verwechseln. */
export const KNOPF_GEFAHR = 'inline-flex items-center justify-center gap-1.5 rounded-full border border-rose-200 bg-white px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-40';
/** Textlink mit Pfeil — die leiseste Aktion; unterstrichen erst beim Darueberfahren. */
export const LINK = 'inline-flex items-center gap-1 text-sm font-medium text-mb-tinte underline-offset-4 hover:underline';
/** Die eine Akzentkarte je Ansicht. */
export const PFIRSICH = 'rounded-3xl bg-mb-pfirsich text-mb-siena';
/** Ein schwebendes Stueck Produkt (Gehaltszettel, Luecken-Ring) — das Einzige mit Schatten. */
export const SCHWEBEND = 'rounded-[20px] bg-white shadow-schwebend';
/** Etikett ueber Kennzahlen — leise, ohne Grossbuchstaben-Geschrei. */
export const ETIKETT = 'text-sm text-mb-schiefer';

/** Ueberschrift in Serifen, Gewicht 400 — die Handschrift der Seite. */
export function Titel({ children, gross = false, als: Tag = 'h1', klasse = '' }: {
  children: ReactNode; gross?: boolean; als?: 'h1' | 'h2'; klasse?: string;
}) {
  return (
    <Tag className={`text-balance font-titel font-normal text-mb-tinte ${
      gross ? 'text-[34px] leading-[1.15] tracking-[-0.015em] sm:text-[44px]' : 'text-[26px] leading-[1.2] tracking-[-0.01em] sm:text-[30px]'
    } ${klasse}`}>
      {children}
    </Tag>
  );
}

export function Karte({ titel, children, rechts, klasse = '' }: {
  titel?: ReactNode; children: ReactNode; rechts?: ReactNode; klasse?: string;
}) {
  return (
    <section className={`rounded-3xl bg-mb-nebel p-5 sm:p-7 ${klasse}`}>
      {(titel || rechts) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {titel && <h2 className="text-lg font-medium tracking-[-0.01em] text-mb-tinte sm:text-xl">{titel}</h2>}
          {rechts}
        </div>
      )}
      {children}
    </section>
  );
}

/** Ein leiser Vermerk wie „geschätzt“ — Kontur statt Farbe. */
export function Vermerk({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full border border-mb-linie bg-white px-2.5 py-0.5 text-xs text-mb-schiefer">
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
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-slate-600">{label}</label>
      <textarea
        id={id}
        value={wert}
        rows={zeilen}
        maxLength={maxLaenge}
        placeholder={platzhalter}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={hilfe ? `${id}-hilfe` : undefined}
        className="w-full rounded-2xl border border-mb-linie bg-white p-3 text-sm leading-relaxed"
      />
      <div className="mt-1 flex justify-between gap-2 text-xs text-mb-schiefer">
        <span id={`${id}-hilfe`}>{hilfe}</span>
        <span className="tabular-nums">{wert.length}/{maxLaenge}</span>
      </div>
    </div>
  );
}

const STATUS_TEXT: Record<BeratungStatus, string> = { offen: 'offen', teilnahme: 'Teilnahme', verzicht: 'Verzicht' };
/*
 * Status ohne Ampelfarben: ein Punkt und das Wort. Teilnahme in Tinte mit
 * vollem Punkt, Verzicht leise mit leerem Ring, offen dazwischen — lesbar
 * auch ohne Farbe.
 */
export const STATUS_PUNKT: Record<BeratungStatus, string> = {
  teilnahme: 'bg-mb-tinte',
  offen: 'bg-mb-asche',
  verzicht: 'border border-mb-asche bg-white',
};
const STATUS_SCHRIFT: Record<BeratungStatus, string> = {
  teilnahme: 'text-mb-tinte',
  offen: 'text-mb-schiefer',
  verzicht: 'text-mb-schiefer',
};

/** „Teilnahme 150 €“, „Verzicht“, „offen“. */
export function StatusChip({ status, betrag }: { status: BeratungStatus; betrag?: number }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-sm ${STATUS_SCHRIFT[status]}`}>
      <span aria-hidden className={`h-2 w-2 rounded-full ${STATUS_PUNKT[status]}`} />
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
      <span className={`min-w-0 break-words text-mb-tinte ${gross
        ? 'text-balance font-titel text-[34px] font-normal leading-[1.15] tracking-[-0.015em] sm:text-[44px]'
        : 'text-lg font-medium'}`}>{name}</span>
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
 * Der Ring der Versorgungsluecke: Tinte die Netto-Rente, Pfirsich mit
 * Siena-Kante die Luecke — zusammen der Nettolohn heute, der in der Mitte
 * steht. Die Zahlen stehen zusaetzlich als Text daneben; der Ring ist die
 * Anschauung.
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
      <circle cx="60" cy="60" r={r} fill="none" stroke="#fbe1d1" strokeWidth="12" />
      <circle cx="60" cy="60" r={r + 6} fill="none" stroke="#5d2a1a" strokeWidth="0.6" strokeOpacity="0.35" />
      <circle cx="60" cy="60" r={r} fill="none" stroke="#17191c" strokeWidth="12"
        strokeDasharray={`${anteil * umfang} ${umfang}`} transform="rotate(-90 60 60)" />
      <text x="60" y="60" textAnchor="middle" fontSize="13" fontWeight="500" fill="#17191c">{ganz(nettolohn)}</text>
      <text x="60" y="72" textAnchor="middle" fontSize="7" fill="#6e727c">Ihr Nettolohn</text>
    </svg>
  );
}
