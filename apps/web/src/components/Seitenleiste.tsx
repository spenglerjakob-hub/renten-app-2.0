import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Building2, Check, ClipboardList, Copy, ExternalLink, HandCoins, LineChart, X,
} from 'lucide-react';
import { RechtsLinks } from './RechtsLinks';

/**
 * Seitenleiste des Rechners: Sprungmarken auf der langen Rechnerseite und
 * die eigenstaendigen Seiten fuer Kunden und Arbeitgeber.
 *
 * WARUM AUSKLAPPBAR und nicht als feste Spalte: Die Hauptseite ist ein
 * zentriertes Raster aus Eingaben und Ergebnis. Eine dauerhafte Spalte
 * haette beides gestaucht — gerade auf dem Laptop, auf dem Berater im
 * Gespraech arbeiten.
 *
 * Die anderen Seiten oeffnen in einem neuen Tab, damit der Rechner mit allen
 * Eingaben offen bleibt. „Link kopieren" daneben, weil der Berater sie in
 * der Regel an Kunden oder Arbeitgeber weiterschickt.
 */

export interface Abschnitt {
  id: string;
  text: string;
  symbol: ReactNode;
  /** Vor dem Scrollen ausfuehren, etwa um eine eingeklappte Karte zu oeffnen */
  beiSprung?: () => void;
}

interface Seite {
  href: string;
  titel: string;
  text: string;
  symbol: ReactNode;
}

const KUNDEN: Seite[] = [
  {
    href: '/vorsorge-check', titel: 'Vorsorge-Check', text: 'Angaben Schritt für Schritt erfassen',
    symbol: <ClipboardList className="h-4 w-4" aria-hidden />,
  },
  {
    href: '/altersvorsorgedepot', titel: 'Altersvorsorgedepot', text: 'Zulagen und Kapital ab 2027',
    symbol: <LineChart className="h-4 w-4" aria-hidden />,
  },
];

const ARBEITGEBER: Seite[] = [
  {
    href: '/zuschussmodell', titel: 'Zuschussmodell', text: '50 % Zuschuss, ein Vertrag',
    symbol: <HandCoins className="h-4 w-4" aria-hidden />,
  },
  {
    href: '/arbeitgeber', titel: 'Matching-Modell', text: 'Entgeltumwandlung + Unterstützungskasse',
    symbol: <Building2 className="h-4 w-4" aria-hidden />,
  },
];

export function Seitenleiste(props: {
  offen: boolean;
  onSchliessen: () => void;
  abschnitte: Abschnitt[];
}) {
  const { offen, onSchliessen } = props;
  const schliessenRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!offen) return;
    schliessenRef.current?.focus();
    const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') onSchliessen(); };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [offen, onSchliessen]);

  const springe = (a: Abschnitt) => {
    a.beiSprung?.();
    onSchliessen();
    // Einen Takt warten: Eine gerade aufgeklappte Karte muss erst stehen,
    // sonst landet der Sprung an der alten Hoehe.
    requestAnimationFrame(() => {
      document.getElementById(a.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  return (
    <div className={`print:hidden ${offen ? '' : 'pointer-events-none'}`}>
      <div
        aria-hidden
        onClick={onSchliessen}
        className={`fixed inset-0 z-[60] bg-slate-950/50 transition-opacity ${offen ? 'opacity-100' : 'opacity-0'}`}
      />
      <nav
        role="dialog"
        aria-modal="true"
        aria-label="Übersicht"
        aria-hidden={!offen}
        className={`fixed inset-y-0 left-0 z-[61] flex w-80 max-w-[85vw] flex-col overflow-y-auto bg-slate-900 text-slate-200 shadow-2xl transition-transform ${
          offen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <span className="text-sm font-black tracking-tight text-white">Übersicht</span>
          <button
            ref={schliessenRef}
            type="button"
            onClick={onSchliessen}
            aria-label="Übersicht schließen"
            tabIndex={offen ? 0 : -1}
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <Gruppe titel="Auf dieser Seite">
          {props.abschnitte.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => springe(a)}
                tabIndex={offen ? 0 : -1}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                <span className="text-indigo-400">{a.symbol}</span>
                {a.text}
              </button>
            </li>
          ))}
        </Gruppe>

        <Gruppe titel="Für Kunden">
          {KUNDEN.map((s) => <SeitenLink key={s.href} seite={s} fokussierbar={offen} />)}
        </Gruppe>

        <Gruppe titel="Für Arbeitgeber">
          {ARBEITGEBER.map((s) => <SeitenLink key={s.href} seite={s} fokussierbar={offen} />)}
        </Gruppe>

        <p className="mt-auto px-4 pb-2 pt-6 text-[11px] leading-relaxed text-slate-500">
          Diese Seiten brauchen keine Anmeldung und öffnen in einem neuen Tab — der Rechner bleibt mit
          allen Eingaben offen.
        </p>
        <RechtsLinks hell klasse="px-4 pb-4" />
      </nav>
    </div>
  );
}

function Gruppe({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <div className="px-2 pt-4">
      <h2 className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">{titel}</h2>
      <ul className="space-y-0.5">{children}</ul>
    </div>
  );
}

function SeitenLink({ seite, fokussierbar }: { seite: Seite; fokussierbar: boolean }) {
  const [kopiert, setKopiert] = useState(false);
  const kopieren = async () => {
    try {
      await navigator.clipboard.writeText(new URL(seite.href, window.location.origin).toString());
      setKopiert(true);
      setTimeout(() => setKopiert(false), 2000);
    } catch { /* Zwischenablage gesperrt — der Link steht ja da */ }
  };
  return (
    <li className="flex items-stretch gap-1">
      <a
        href={seite.href}
        target="_blank"
        rel="noopener"
        tabIndex={fokussierbar ? 0 : -1}
        className="flex min-w-0 flex-1 items-start gap-2.5 rounded-lg px-3 py-2 hover:bg-slate-800"
      >
        <span className="mt-0.5 text-emerald-400">{seite.symbol}</span>
        <span className="min-w-0">
          <span className="flex items-center gap-1 text-sm font-bold text-white">
            {seite.titel} <ExternalLink className="h-3 w-3 text-slate-500" aria-hidden />
          </span>
          <span className="block text-[11px] leading-snug text-slate-400">{seite.text}</span>
        </span>
      </a>
      <button
        type="button"
        onClick={() => void kopieren()}
        tabIndex={fokussierbar ? 0 : -1}
        aria-label={`Link zu ${seite.titel} kopieren`}
        title={kopiert ? 'Kopiert' : 'Link kopieren'}
        className="shrink-0 rounded-lg px-2 text-slate-500 hover:bg-slate-800 hover:text-white"
      >
        {kopiert ? <Check className="h-4 w-4 text-emerald-400" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
      </button>
    </li>
  );
}
