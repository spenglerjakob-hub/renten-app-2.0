import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, HelpCircle, Minus, Plus, type LucideIcon } from 'lucide-react';
import { Titel } from './stil';
import { FeldTitel } from './Feld';

/*
 * FRAGE ZUERST — die Bausteine eines Schritts, der mit einer Frage beginnt und
 * darunter gleich die Felder zeigt. Entstanden im Vorsorge-Check (meist am
 * Telefon ausgefuellt), jetzt auch im Rentenplaner „Schritt für Schritt“:
 *
 * - `FrageKopf`: Zeichen, Frage und ein Satz dazu.
 * - `Wahl`: zwei, drei Antworten als grosse Knoepfe statt Haken oder Auswahlliste.
 * - `Zaehler`: eine kleine Anzahl mit Minus und Plus.
 * - `Aufklapper`/`Hilfe`: Was beim Ausfuellen hilft, klappt UNTER den Feldern auf.
 */

/** Zeichen, Frage und ein Satz dazu — der Kopf eines Schritts. */
export function FrageKopf({ symbol: Zeichen, titel, unter, als }: {
  symbol: LucideIcon; titel: string; unter: ReactNode; als: 'h1' | 'h2' | 'h3';
}) {
  return (
    <>
      <span aria-hidden className="ui-innen mb-3 flex h-11 w-11 items-center justify-center rounded-full">
        <Zeichen className="h-5 w-5 text-ui-tinte" />
      </span>
      <Titel als={als}>{titel}</Titel>
      <p className="mt-2 text-sm leading-relaxed text-ui-schiefer">{unter}</p>
    </>
  );
}

/**
 * Eine Zeile zum Aufklappen unter den Feldern — so hoch, dass der Daumen sie
 * trifft. Zu: Symbol, Titel und ein Satz, was sich dahinter verbirgt.
 */
export function Aufklapper({ symbol: Zeichen, titel, zusatz, offenAnfangs = false, children }: {
  symbol: LucideIcon; titel: string; zusatz?: string; offenAnfangs?: boolean; children: ReactNode;
}) {
  const [offen, setOffen] = useState(offenAnfangs);
  const id = useId();
  return (
    <div className="rounded-[10px] border border-ui-linie bg-ui-karte">
      <button
        type="button"
        aria-expanded={offen}
        aria-controls={id}
        onClick={() => setOffen((o) => !o)}
        className="flex min-h-[3.25rem] w-full items-center gap-3 rounded-[10px] px-4 py-2.5 text-left hover:bg-ui-hover"
      >
        <Zeichen className="h-5 w-5 shrink-0 text-ui-schiefer" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-ui-tinte">{titel}</span>
          {zusatz && <span className="block text-xs leading-snug text-ui-schiefer">{zusatz}</span>}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-ui-schiefer transition-transform ${offen ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {offen && <div id={id} className="border-t border-ui-linie px-4 py-4">{children}</div>}
    </div>
  );
}

/** „Wo finde ich das?“ — welche Unterlage hilft und wo darauf die Zahl steht. */
export function Hilfe({ unterlage, children }: { unterlage: string; children: ReactNode }) {
  return (
    <Aufklapper symbol={HelpCircle} titel="Wo finde ich das?" zusatz={unterlage}>
      <div className="text-sm leading-relaxed text-ui-tinte [&_strong]:font-medium">{children}</div>
    </Aufklapper>
  );
}

/** Was beim Ausfuellen hilft — unter den Feldern eines Schritts: Hilfe und Hochladen. */
export function Hilfen({ children }: { children: ReactNode }) {
  return <div className="mt-6 space-y-2">{children}</div>;
}

/**
 * Eine Wahl aus zwei, drei Antworten als grosse Knoepfe — am Telefon leichter
 * zu treffen als ein Haken, und beide Antworten stehen da, statt in einer
 * Auswahlliste zu stecken.
 */
export function Wahl<T extends string>({ label, wert, optionen, onChange, hilfe, info, reihe = false }: {
  label: string; wert: T; optionen: readonly { wert: T; text: string }[]; onChange: (v: T) => void;
  /** Ein Satz unter den Knoepfen */
  hilfe?: ReactNode;
  /** Die laengere Erklaerung: im Info-Kaestchen neben der Frage, bei Bedarf */
  info?: ReactNode;
  /** Vier Antworten: ab der Breite eines Tablets in einer Zeile statt in zwei */
  reihe?: boolean;
}) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id}>
      <FeldTitel text={label} info={info} id={id} />
      <div className={`grid grid-cols-2 gap-2 ${reihe ? 'sm:grid-cols-4' : ''}`}>
        {optionen.map((o) => (
          <button
            key={o.wert}
            type="button"
            onClick={() => onChange(o.wert)}
            aria-pressed={wert === o.wert}
            // Gewaehlt wie ein Reiter: gefuellt in Soot. Gesperrt (festgeschriebene Beratung) bleibt die Antwort lesbar, nur blasser.
            // Ein langes Wort trennt sich in einer schmalen Spalte, statt ueber den Knopf hinauszuragen.
            className={`min-h-[3rem] min-w-0 rounded-[8px] border px-3 py-2.5 text-left text-sm font-medium leading-snug transition-colors [hyphens:auto] [overflow-wrap:anywhere] disabled:cursor-not-allowed disabled:opacity-60 ${
              wert === o.wert
                ? 'border-ui-dunkel bg-ui-dunkel text-white'
                : 'border-ui-zweit-rand bg-ui-karte text-ui-tinte hover:bg-ui-hover'
            }`}
          >
            {o.text}
          </button>
        ))}
      </div>
      {hilfe && <p className="mt-1 text-xs leading-relaxed text-ui-schiefer">{hilfe}</p>}
    </div>
  );
}

export const JA_NEIN = [{ wert: 'ja', text: 'Ja' }, { wert: 'nein', text: 'Nein' }] as const;

/** Eine kleine Anzahl mit Minus und Plus — statt eines Zahlenfelds mit winzigen Pfeilen. */
export function Zaehler({ label, wert, max, onChange, weniger, mehr, hilfe, info }: {
  label: string; wert: number; max: number; onChange: (n: number) => void; weniger: string; mehr: string;
  hilfe?: ReactNode;
  /** Die laengere Erklaerung: im Info-Kaestchen neben der Beschriftung */
  info?: ReactNode;
}) {
  const id = useId();
  const knopf = 'flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-ui-zweit-rand bg-ui-karte text-ui-tinte hover:bg-ui-hover disabled:opacity-40';
  return (
    <div role="group" aria-labelledby={id}>
      <FeldTitel text={label} info={info} id={id} />
      <div className="flex items-center gap-4">
        <button type="button" onClick={() => onChange(Math.max(0, wert - 1))} disabled={wert <= 0} aria-label={weniger} className={knopf}>
          <Minus className="h-5 w-5" aria-hidden />
        </button>
        <output aria-live="polite" className="min-w-[2ch] text-center text-2xl font-medium tabular-nums text-ui-tinte">{wert}</output>
        <button type="button" onClick={() => onChange(Math.min(max, wert + 1))} disabled={wert >= max} aria-label={mehr} className={knopf}>
          <Plus className="h-5 w-5" aria-hidden />
        </button>
      </div>
      {hilfe && <p className="mt-1 text-xs leading-relaxed text-ui-schiefer">{hilfe}</p>}
    </div>
  );
}
