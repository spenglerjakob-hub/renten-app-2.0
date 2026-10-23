import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { BeratungStatus } from '@renten/schema';
import { firmenlogoLaden } from '../lib/bav-beratung';
import type { Auftritt } from '../features/auftritt';
import { useAuftritt } from '../store/auftritt';
import { euroText } from './texte';

/*
 * Bausteine der Mitarbeiterberatung: Status, Firmenlogo, Briefkopf, Druck,
 * Luecken-Ring. Die Bausteine des Stils (Knoepfe, Karten, Titel, Felder)
 * liegen in components/stil.tsx — sie gelten fuer alle Seiten.
 */

const STATUS_TEXT: Record<BeratungStatus, string> = { offen: 'offen', teilnahme: 'Teilnahme', verzicht: 'Verzicht' };
/*
 * Status ohne Ampelfarben: ein Punkt und das Wort. Teilnahme in Tinte mit
 * vollem Punkt, Verzicht leise mit leerem Ring, offen dazwischen — lesbar
 * auch ohne Farbe.
 */
export const STATUS_PUNKT: Record<BeratungStatus, string> = {
  teilnahme: 'bg-ui-tinte',
  offen: 'bg-ui-asche',
  verzicht: 'border border-ui-asche bg-ui-karte',
};
const STATUS_SCHRIFT: Record<BeratungStatus, string> = {
  teilnahme: 'text-ui-tinte',
  offen: 'text-ui-schiefer',
  verzicht: 'text-ui-schiefer',
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
      <span className={`min-w-0 break-words text-ui-tinte ${gross
        ? 'ui-titel text-balance text-[34px] font-normal leading-[1.15] sm:text-[44px]'
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
 * Der Ring der Versorgungsluecke: Tinte die Netto-Rente, die Rolle
 * „Luecke“ (Steingrau) die Luecke — zusammen der Nettolohn heute, der in
 * der Mitte steht. Die Zahlen stehen zusaetzlich als Text daneben; der Ring
 * ist die Anschauung.
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
      <circle cx="60" cy="60" r={r} fill="none" style={{ stroke: 'rgb(var(--ui-luecke))' }} strokeWidth="12" />
      <circle cx="60" cy="60" r={r} fill="none" style={{ stroke: 'rgb(var(--ui-tinte))' }} strokeWidth="12"
        strokeDasharray={`${anteil * umfang} ${umfang}`} transform="rotate(-90 60 60)" />
      <text x="60" y="60" textAnchor="middle" fontSize="13" fontWeight="500" style={{ fill: 'rgb(var(--ui-tinte))' }}>{ganz(nettolohn)}</text>
      <text x="60" y="72" textAnchor="middle" fontSize="7" style={{ fill: 'rgb(var(--ui-schiefer))' }}>Ihr Nettolohn</text>
    </svg>
  );
}
