import {
  createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode,
} from 'react';
import { ArrowRight, Check, ChevronDown, Plus } from 'lucide-react';
import { KNOPF } from './stil';
import {
  nachOeffnen, stueckeLage, STUECKE_ANFANG, type StueckKern, type StueckeStand,
} from './ablauf-logik';

/**
 * DER ABLAUF VON OBEN NACH UNTEN — eine Beratung, die sich Stueck fuer Stueck
 * aufbaut, statt je Etappe eine volle Seite zu zeigen.
 *
 * ZWEI EBENEN, DIESELBE REGEL: Es ist immer genau eines offen. Was man hinter
 * sich hat, steht darueber als schmale ZEILE mit seinem Ergebnis in einem
 * Satz und oeffnet sich mit einem Klick wieder.
 *
 *  - Etappen (`EtappenZeile`, `EtappenZaehler`): Daten & Ziel, Ergebnis, … Die
 *    Seite setzt sie selbst zusammen.
 *  - Stuecke einer Etappe (`Stuecke`): „Weiter“ zeigt das naechste, das vorige
 *    wird zur Zeile. Am Ende des Wegs fuehrt „Weiter“ zur naechsten Etappe;
 *    darunter stehen die Vertiefungen als Zeilen, die niemand oeffnen muss.
 *
 * WARUM: Auf einer vollen Seite stand alles gleichzeitig da — Ring, Kassenbon,
 * Kaufkraft, Steuer, Rechtsstand. Im Gespraech erklaert der Berater aber eins
 * nach dem anderen; was noch nicht dran ist, lenkt nur ab.
 *
 * Bewegung: Das neue Stueck blendet weich ein (wie `avd/Schritt`). Die Seite
 * springt dabei OHNE Animation an seine Stelle — das vorige ist gerade zu
 * einer Zeile geschrumpft, ein sanftes Scrollen fuehre erst durch Inhalt, der
 * sich in dem Moment verschiebt. Die Zeile von eben bleibt darueber sichtbar.
 * Der Fokus geht mit, denn der Knopf „Weiter“ ist danach nicht mehr da.
 */

/**
 * Die Spalte des Ablaufs: Zeilen, Koepfe und schmale Stuecke. Sie steht
 * LINKS, nicht mittig: Breite Stuecke (Tabellen, Vergleiche) duerfen nach
 * rechts hinaus, und alles beginnt trotzdem an derselben Kante wie das Logo.
 */
export const SPALTE = 'w-full max-w-4xl';

export interface AblaufWeiter {
  text: ReactNode;
  onClick: () => void;
}

interface AblaufWert {
  stand: Readonly<Record<string, StueckeStand>>;
  setze: (kennung: string, stand: StueckeStand) => void;
  /** Wohin „Weiter“ am Ende des Wegs fuehrt — in der Regel zur naechsten Etappe */
  weiter?: AblaufWeiter;
  /** Die offene Etappe liegt schon hinter einem — ihr ganzer Weg gilt als erreicht */
  durch: boolean;
}

const AblaufKontext = createContext<AblaufWert | null>(null);

/**
 * Haelt fest, wo die Stuecke jeder Etappe stehen — ueber den Etappenwechsel
 * hinweg: Wer vom Sparrechner noch einmal ins Ergebnis schaut, findet es so,
 * wie er es verlassen hat. Nur im Arbeitsspeicher; nach dem Neuladen beginnt
 * jede Etappe vorn.
 */
export function AblaufGeber({ stand, onStand, weiter, durch = false, children }: {
  stand: Readonly<Record<string, StueckeStand>>;
  onStand: (kennung: string, stand: StueckeStand) => void;
  weiter?: AblaufWeiter;
  durch?: boolean;
  children: ReactNode;
}) {
  return (
    <AblaufKontext.Provider value={{ stand, setze: onStand, weiter, durch }}>
      {children}
    </AblaufKontext.Provider>
  );
}

/* ---------- Bewegung ---------- */

/** Hoehe einer oben klebenden Kopfleiste — darunter beginnt der sichtbare Bereich. */
function kopfHoehe(): number {
  const kopf = document.querySelector('header');
  return kopf && getComputedStyle(kopf).position === 'sticky' ? kopf.getBoundingClientRect().height : 0;
}

/**
 * Holt ein gerade geoeffnetes Listenelement ins Bild: an den oberen Rand,
 * mit der Zeile davor darueber. Steht es schon gut im Bild — etwa weil eine
 * Zeile an Ort und Stelle aufgeklappt ist —, bewegt sich nichts.
 */
export function insBild(el: HTMLElement) {
  const davor = el.previousElementSibling;
  const ziel = davor instanceof HTMLElement ? davor : el;
  const platz = kopfHoehe() + 12;
  const oben = ziel.getBoundingClientRect().top;
  const eigen = el.getBoundingClientRect().top;
  if (oben < platz || eigen > window.innerHeight * 0.5) {
    window.scrollBy({ top: oben - platz, behavior: 'instant' });
  }
}

/**
 * Weiches Einblenden mit leichtem Hochgleiten. Nach dem Uebergang steht der
 * Inhalt OHNE transform da: Ein transform — auch ein leeres — machte die
 * Huelle zum Bezugsrahmen fuer alles, was darin `position: fixed` ist.
 */
function Einblenden({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<'vor' | 'laeuft' | 'fertig'>('vor');
  useEffect(() => {
    // Zwei Takte: Erst steht der Block unsichtbar im Dokument, dann laeuft der Uebergang.
    let zweiter = 0;
    const erster = requestAnimationFrame(() => { zweiter = requestAnimationFrame(() => setPhase('laeuft')); });
    const ende = window.setTimeout(() => setPhase('fertig'), 700);
    return () => { cancelAnimationFrame(erster); cancelAnimationFrame(zweiter); window.clearTimeout(ende); };
  }, []);
  const klasse = phase === 'fertig'
    ? ''
    : `transition-[opacity,transform] duration-500 ease-out motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none ${
      phase === 'vor' ? 'translate-y-3 opacity-0' : 'translate-y-0 opacity-100'
    }`;
  return <div className={klasse}>{children}</div>;
}

/* ---------- Die Zeile ---------- */

type Zeichen = 'erledigt' | 'fehlt' | 'nummer' | 'mehr';

const KREIS = 'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums';

/** Der Kreis vorn: Haken nur fuer wirklich Erledigtes, gestrichelt leer wo etwas fehlt — ohne Ampelfarben. */
function Kreis({ art, nr }: { art: Zeichen; nr?: number }) {
  if (art === 'erledigt') {
    return <span className={`${KREIS} border border-ui-linie bg-ui-innen text-ui-tinte`}><Check className="h-3.5 w-3.5" aria-hidden /></span>;
  }
  if (art === 'fehlt') return <span aria-hidden className={`${KREIS} border border-dashed border-ui-schiefer/70`} />;
  if (art === 'mehr') {
    return <span className={`${KREIS} border border-ui-linie text-ui-schiefer`}><Plus className="h-3.5 w-3.5" aria-hidden /></span>;
  }
  return <span aria-hidden className={`${KREIS} border border-ui-linie bg-ui-innen text-ui-tinte`}>{nr}</span>;
}

/**
 * Was man hinter sich hat, als eine Zeile: Name, Ergebnis in einem Satz,
 * „Öffnen“. Am Telefon steht das Ergebnis unter dem Namen.
 */
function Zeile({ zeichen, nr, vorlese, titel, ergebnis, fehlt, gross = false, onClick }: {
  zeichen: Zeichen;
  nr?: number;
  /** Nur fuer Screenreader, vor dem Namen: „Abschnitt 2: “ */
  vorlese?: string;
  titel: string;
  ergebnis?: ReactNode;
  /** Was noch fehlt — steht hinter dem Ergebnis */
  fehlt?: string;
  gross?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={false}
      className={`ui-karte group flex w-full items-center gap-3 text-left transition-colors hover:border-ui-feld-rand ${
        gross ? 'px-4 py-3.5 sm:px-5' : 'px-4 py-3'
      }`}
    >
      <Kreis art={zeichen} nr={nr} />
      <span className="min-w-0 flex-1 sm:flex sm:items-baseline sm:gap-x-3">
        <span className={`block shrink-0 font-medium text-ui-tinte ${gross ? 'text-base' : 'text-sm'}`}>
          {vorlese && <span className="sr-only">{vorlese}</span>}
          {titel}
        </span>
        {(ergebnis || fehlt) && (
          <span className="mt-0.5 block min-w-0 text-sm text-ui-schiefer sm:mt-0 sm:truncate">
            {ergebnis}
            {ergebnis && fehlt ? ' · ' : ''}
            {fehlt}
          </span>
        )}
      </span>
      <span className="hidden shrink-0 text-xs font-medium text-ui-schiefer group-hover:text-ui-tinte sm:inline">Öffnen</span>
      <ChevronDown className="h-4 w-4 shrink-0 text-ui-schiefer group-hover:text-ui-tinte" aria-hidden />
    </button>
  );
}

/* ---------- Etappen ---------- */

/** Eine Etappe, die gerade nicht offen ist — als Zeile mit ihrem Ergebnis. */
export function EtappenZeile({ nr, name, ergebnis, erledigt, fehlt, onOeffnen }: {
  nr: number;
  name: string;
  ergebnis?: ReactNode;
  /** WIRKLICH erledigt — nur dann steht ein Haken, sonst die Nummer */
  erledigt: boolean;
  /** Was noch fehlt („2 Beispielwerte offen“) — dann ein leerer Kreis */
  fehlt?: string;
  onOeffnen: () => void;
}) {
  return (
    <Zeile
      gross
      zeichen={fehlt ? 'fehlt' : erledigt ? 'erledigt' : 'nummer'}
      nr={nr}
      vorlese={`Abschnitt ${nr}: `}
      titel={name}
      ergebnis={ergebnis}
      fehlt={fehlt}
      onClick={onOeffnen}
    />
  );
}

/** Ueber dem Titel der offenen Etappe: welcher Abschnitt das ist und wie viele es gibt. */
export function EtappenZaehler({ nr, von, name }: { nr: number; von: number; name: string }) {
  return (
    <p className="flex items-center gap-2.5 text-sm text-ui-schiefer">
      <span aria-hidden className={`${KREIS} bg-ui-tinte text-white`}>{nr}</span>
      <span>
        <span className="font-medium text-ui-tinte">{name}</span>
        <span className="mx-1.5" aria-hidden>·</span>
        Abschnitt {nr} von {von}
      </span>
    </p>
  );
}

/* ---------- Stuecke ---------- */

export interface Stueck extends StueckKern {
  /** Der Name in der Zeile — und fuer Screenreader der Name des offenen Stuecks */
  titel: string;
  /** Das Ergebnis in einem Satz — steht in der Zeile, sobald das Stueck zu ist */
  ergebnis?: ReactNode;
  /** Was noch fehlt („Beispielwerte offen“): dann ein leerer Kreis statt des Hakens */
  fehlt?: string;
  inhalt: ReactNode;
  /** Tabellen und Vergleiche duerfen ueber die Spalte hinaus */
  breit?: boolean;
  /** Das Stueck fuehrt mit einem eigenen Knopf weiter — darunter steht dann kein „Weiter“ */
  ohneWeiter?: boolean;
}

/** Das offene Stueck: Inhalt, darunter „Weiter“. Beim Erscheinen kommt es ins Bild und bekommt den Fokus. */
function Offenes({ stueck, knopf, holen }: { stueck: Stueck; knopf: ReactNode; holen: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  // Nur beim Erscheinen — nicht bei jedem spaeteren Zeichnen desselben Stuecks.
  const beimErscheinen = useRef(holen);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !beimErscheinen.current) return;
    insBild(el.parentElement ?? el);
    el.focus({ preventScroll: true });
  }, []);
  /*
    Eine Gruppe mit Namen, kein Abschnitt: Der Inhalt bringt oft selbst einen
    benannten Abschnitt mit („Angaben für den Antrag“) — zwei gleichnamige
    Bereiche auf einer Seite waeren fuer Screenreader nicht zu unterscheiden.
  */
  return (
    <div ref={ref} role="group" tabIndex={-1} aria-label={stueck.titel} className="py-1 focus:outline-none sm:py-2">
      <Einblenden>
        {stueck.inhalt}
        {knopf && <div className="mt-5 flex justify-end sm:mt-6">{knopf}</div>}
      </Einblenden>
    </div>
  );
}

/**
 * Die Stuecke einer Etappe — eins offen, die davor als Zeilen.
 *
 * Der Stand (welches offen, bis wohin gekommen) liegt im `AblaufGeber`, damit
 * er den Etappenwechsel uebersteht; ohne Geber haelt ihn die Liste selbst.
 * Mit `offen`/`onOeffnen` fuehrt der Aufrufer das offene Stueck — so springt
 * die Fortschrittsleiste an einen Schritt des Assistenten.
 */
export function Stuecke({ kennung, stuecke, beschriftung, offen: gefuehrt, onOeffnen, weiter: eigenesWeiter }: {
  kennung: string;
  stuecke: readonly Stueck[];
  /** Name der Liste fuer Screenreader: „Schritte der Angaben“ */
  beschriftung: string;
  offen?: string;
  onOeffnen?: (id: string) => void;
  /** Ein eigenes „Weiter“ am Ende des Wegs; null: keines. Ohne Angabe das der Etappe. */
  weiter?: AblaufWeiter | null;
}) {
  const geber = useContext(AblaufKontext);
  const [lokal, setLokal] = useState<StueckeStand>(STUECKE_ANFANG);
  const gemerkt = geber?.stand[kennung] ?? lokal;
  const stand = gefuehrt !== undefined ? { ...gemerkt, offen: gefuehrt } : gemerkt;
  const durch = geber?.durch ?? false;
  const lage = stueckeLage(stuecke, stand, durch);
  const weiter = eigenesWeiter === undefined ? geber?.weiter : eigenesWeiter ?? undefined;

  const merke = (s: StueckeStand) => (geber ? geber.setze(kennung, s) : setLokal(s));
  const oeffne = (id: string) => {
    merke(nachOeffnen(stuecke, stand, id, durch));
    onOeffnen?.(id);
  };

  /*
    Was gerade gilt, wird auch gemerkt: ein von aussen geoeffnetes Stueck und
    der ganze Weg einer Etappe, die schon hinter einem liegt. Sonst gaelte
    beides nur, solange die Bedingung von aussen anhaelt.
  */
  const offenId = lage.offen?.id ?? null;
  const weitId = lage.weg[lage.weit]?.id ?? null;
  useEffect(() => {
    if (gemerkt.offen !== offenId || gemerkt.weit !== weitId) merke({ offen: offenId, weit: weitId });
  }, [offenId, weitId, gemerkt.offen, gemerkt.weit]);

  // Das erste Zeichnen holt nichts ins Bild — das tut die Etappe selbst, wenn sie aufgeht.
  const erstesMal = useRef(true);
  useEffect(() => { erstesMal.current = false; }, []);

  const knopfFuer = (x: Stueck): ReactNode => {
    if (x.ohneWeiter) return null;
    const n = x === lage.offen ? lage.naechstes : null;
    if (n) {
      return (
        <button type="button" onClick={() => oeffne(n.id)} className={KNOPF}>
          Weiter: {n.titel} <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
        </button>
      );
    }
    return weiter && (
      <button type="button" onClick={weiter.onClick} className={KNOPF}>
        {weiter.text} <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
      </button>
    );
  };

  const punkt = (x: Stueck) => {
    const istOffen = x === lage.offen;
    return (
      <li key={x.id} className={istOffen && x.breit ? undefined : SPALTE}>
        {istOffen
          ? <Offenes key={x.id} stueck={x} knopf={knopfFuer(x)} holen={!erstesMal.current} />
          : (
            <Zeile
              zeichen={x.vertiefung ? 'mehr' : x.fehlt ? 'fehlt' : 'erledigt'}
              titel={x.titel}
              ergebnis={x.ergebnis}
              fehlt={x.fehlt}
              onClick={() => oeffne(x.id)}
            />
          )}
      </li>
    );
  };

  return (
    <div className="space-y-3">
      <ol aria-label={beschriftung} className="space-y-3">
        {lage.weg.slice(0, lage.weit + 1).map(punkt)}
      </ol>
      {lage.amEnde && lage.tiefer.length > 0 && (
        <>
          <p className={`${SPALTE} pt-3 text-sm text-ui-schiefer`}>Zum Vertiefen</p>
          <ol aria-label={`${beschriftung} — zum Vertiefen`} className="space-y-3">
            {lage.tiefer.map(punkt)}
          </ol>
        </>
      )}
    </div>
  );
}
