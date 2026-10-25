import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Download, FolderOpen, Info,
  List, Printer, RotateCcw, Settings, TrendingUp, User, Wallet, Inbox,
  PanelLeft, Target, BarChart3, SearchCheck, CreditCard, MessageSquare, Check, Palette,
} from 'lucide-react';
import {
  versorgungsluecke, parseDatum, nurPerson,
  type Jahreszeile, type PersonId,
} from '@renten/engine';
import { useSzenario, type SzenarioParsed } from './store/szenario';
import { eintragVon, offeneBeispiele, offenePfade } from './features/vorbelegung';
import { useProjektion } from './worker/useProjektion';
import { Basisdaten } from './features/Basisdaten';
import {
  Assistent, assistentSchrittFuer, ladeAssistentSchritt, merkeAssistentSchritt,
} from './features/Assistent';
import { datenErledigt, fallFortschritt, type FallSchrittId } from './features/fortschritt';
import { FallFortschritt } from './components/FallFortschritt';
import { Vertraege } from './features/Vertraege';
import { Planer } from './features/Planer';
import { Sparrechner } from './features/Sparrechner';
import { PkvRechner } from './features/PkvRechner';
import { Kassenbon } from './features/Kassenbon';
import { LueckeBedeutung } from './features/LueckeBedeutung';
import { KaufkraftKarte } from './features/KaufkraftKarte';
import { ErgebnisKopf, ErgebnisRing } from './features/ErgebnisKern';
import { nettoHeuteMonat } from './features/bezug';
import { musterfallVerwerfen, offenerMusterfall, type Musterfall } from './lib/musterfall';
import { auftrittLokalVerwerfen, offenerAuftrittLokal, type AuftrittEntwurf } from './lib/auftritt-lokal';
import { dataUrlZuBlob } from './lib/bild';
import { AUFTRITT_LEER } from './features/auftritt';
import { useAuftritt } from './store/auftritt';
import { AuftrittFenster } from './features/AuftrittDialog';
import { STANDARD_OFFEN } from './store/standard';
import { Verlauf } from './features/Verlauf';
import { Rechtsstand } from './features/Rechtsstand';
import { SteuerEngine } from './features/SteuerEngine';
import { Konto } from './features/Konto';
import { CheckAnfragen } from './features/CheckAnfragen';
import { useCheckAnfragen } from './store/check-anfragen';
import { useAuth } from './store/auth';
import { aboSichtbar, aboZusatz, rueckmeldungFaellig, useZugang, wirksam } from './store/zugang';
import { supabaseKonfiguriert } from './lib/supabase';
import { VertragsTuev } from './features/VertragsTuev';
import { Loesungen } from './features/Loesungen';
import { Gutachten } from './druck/Gutachten';
import { EhepartnerDialog } from './features/EhepartnerDialog';
import { Logo } from './components/Logo';
import { KaufkraftSchalter } from './components/KaufkraftSchalter';
import { Reiterleiste } from './components/Reiterleiste';
import { Seitenleiste, type Abschnitt, type Werkzeug } from './components/Seitenleiste';
import { Dialog } from './components/Dialog';
import { JourneyLeiste, JourneyWeiter, type Etappe } from './components/JourneyLeiste';
import { RechtsLinks } from './components/RechtsLinks';
import { personName, personNameAus } from './features/personen';
import { AkkordeonKarte, euro } from './components/Feld';
import { EINLEITUNG, ETIKETT, FEHLER, Hervor, KNOPF_ZWEIT, Karte, LINK, Pillen, Titel } from './components/stil';

type Reiter = 's1' | 's2' | 's3' | 'planer';
type Ansicht = 'kassenbon' | 'verlauf';

const REITER: { id: Reiter; text: string }[] = [
  { id: 's1', text: 'Schicht 1' },
  { id: 's2', text: 'Schicht 2' },
  { id: 's3', text: 'Schicht 3' },
  { id: 'planer', text: 'Planer' },
];

const QUOTEN = [0, 0.01, 0.015, 0.02, 0.025];

/** Die vier Etappen der Beratung — siehe `JourneyLeiste`. */
type Schritt = 'daten' | 'ergebnis' | 'sparen' | 'loesungen';
const ETAPPEN: readonly Etappe<Schritt>[] = [
  { id: 'daten', text: 'Daten & Ziel', kurz: 'Daten & Ziel' },
  { id: 'ergebnis', text: 'Ergebnis', kurz: 'Ergebnis' },
  { id: 'sparen', text: 'Sparrechner', kurz: 'Sparen' },
  { id: 'loesungen', text: 'Vertrags-TÜV & Lösungen', kurz: 'TÜV & Lösungen' },
];

/*
  Die zuletzt offene Etappe — eine Bequemlichkeit je Geraet, nichts, was
  gerechnet wird. Fehlt der Speicher, beginnt die Beratung vorn.
*/
const SPEICHER_ETAPPE = 'rentenplaner.etappe.v1';
const SPEICHER_EINGABE = 'rentenplaner.eingabeart.v1';
function ladeEtappe(): Schritt {
  try {
    const s = localStorage.getItem(SPEICHER_ETAPPE);
    if (ETAPPEN.some((e) => e.id === s)) return s as Schritt;
  } catch { /* Speicher gesperrt */ }
  return 'daten';
}

/** Eine Knopf-Karte am Anfang der ersten Etappe — oeffnet ein Fenster. */
function StartKarte({ symbol, titel, text, marke, onClick }: {
  symbol: React.ReactNode; titel: string; text: string; marke?: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ui-karte flex w-full items-center gap-4 p-4 text-left transition-colors hover:border-ui-feld-rand sm:px-5"
    >
      <span className="ui-innen flex h-10 w-10 shrink-0 items-center justify-center text-ui-tinte">{symbol}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ui-tinte">{titel}</span>
        <span className="block text-xs leading-snug text-ui-schiefer">{text}</span>
        {/* Auf dem Telefon unter dem Text — rechts daneben bliebe dem Titel zu wenig Breite. */}
        {marke && (
          <span className="ui-marke mt-1.5 inline-block px-2 py-0.5 text-xs font-medium sm:hidden">{marke}</span>
        )}
      </span>
      {marke && (
        <span className="ui-marke hidden shrink-0 px-2 py-0.5 text-xs font-medium sm:inline-block">{marke}</span>
      )}
      <ChevronRight className="h-4 w-4 shrink-0 text-ui-schiefer" aria-hidden />
    </button>
  );
}

/**
 * Der Einstieg einer Etappe wie eine Seite der Beratung: der Titel gross, in
 * Inter Tight, darunter ein Satz, worum es geht. Die Nummer steht in der
 * Etappenleiste darueber, nicht mehr im Titel.
 */
function EtappenKopf({ titel, text }: { titel: React.ReactNode; text: string }) {
  return (
    <div>
      <Titel gross als="h2">{titel}</Titel>
      <p className={`mt-3 ${EINLEITUNG}`}>{text}</p>
    </div>
  );
}

/**
 * Ein Band ueber der Etappe: eine Frage oder Meldung, darunter zwei
 * gleichwertige Knoepfe — in der neutralen Innenflaeche wie ein Hinweis,
 * nicht in einer Signalfarbe.
 */
function Band({ children, knoepfe }: { children: React.ReactNode; knoepfe: React.ReactNode }) {
  return (
    <div role="status" className="ui-innen px-4 py-3 text-sm leading-relaxed text-ui-tinte [&_strong]:font-medium">
      {children}
      <div className="mt-3 flex flex-wrap gap-2">{knoepfe}</div>
    </div>
  );
}

/** Eine Zahl der Fussleiste: leises Etikett, darunter der Betrag — `dunkel` fuer die Luecke. */
function LeistenZahl({ etikett, wert, dunkel = false }: { etikett: React.ReactNode; wert: string; dunkel?: boolean }) {
  return (
    <div className={`min-w-0 flex-1 sm:flex-none ${dunkel ? 'rounded-[10px] bg-ui-dunkel px-3 py-1.5 text-white sm:px-4' : 'text-ui-tinte'}`}>
      <div className={`whitespace-nowrap text-xs ${dunkel ? 'text-white/70' : 'text-ui-schiefer'}`}>{etikett}</div>
      {/* Nie abgeschnitten: Ein Betrag mit Auslassungspunkten waere ein falscher Betrag. */}
      <div className="whitespace-nowrap text-base font-medium tabular-nums sm:text-xl">{wert}</div>
    </div>
  );
}

/** Ein Symbolknopf im Kopf: eine Pille mit Kontur, wie der zweite Knopf des Stils. */
const KOPF_KNOPF = 'relative inline-flex shrink-0 items-center gap-1.5 rounded-full border border-ui-zweit-rand bg-ui-karte p-2 text-xs font-medium text-ui-tinte transition-colors hover:bg-ui-hover';
/** Ein Textknopf in der ausgeklappten Kopfzeile — die leiseste Aktion. */
const KOPF_TEXT = 'inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-ui-tinte transition-colors hover:bg-ui-innen';

/**
 * Rueckfallebene, wenn der Rechenkern keine Zeitachse liefern kann — etwa
 * weil ein Geburtsdatum unvollstaendig ist.
 *
 * Frueher hing die gesamte rechte Spalte an `ergebnis && zeile`. Fehlte die
 * Zeile, verschwanden Kennzahlen, Kassenbon und Fussleiste schlagartig, und es
 * stand nur noch "Berechnung laeuft ..." da. Mit dieser Zeile bleibt das
 * Geruest stehen und zeigt Nullwerte; der Grund steht als Hinweis darueber.
 */
const LEERE_ZEILE: Jahreszeile = {
  jahr: new Date().getFullYear(),
  alterA: 0, alterB: null,
  vollstaendigImRuhestand: false, gemischtePhase: false,
  bruttoGesamt: 0, kvPvGesamt: 0, steuerGesamt: 0, nettoGesamt: 0, nettoMonat: 0,
  zielNettoMonat: 0, kaufkraftfaktor: 1,
  zve: 0, durchschnittssatz: 0, grenzsatz: 0,
  posten: [], parameterFortgeschrieben: false,
};

/**
 * Kleine Auswahl in der Kopfleiste.
 *
 * `standard`: Der Wert ist noch die Vorbelegung — dann steht „Standard“
 * dabei, mit der Begruendung im Tooltip (siehe `features/vorbelegung.ts`).
 */
/*
  Die Annahmen im Kopf sind Einstellungen, keine Ergebnisse — deshalb
  neutral: ein Feld wie jedes andere, ohne Farbflaeche, die den Blick
  staerker anzoege als die Versorgungsluecke selbst.
*/
function KopfAuswahl({
  titel, wert, onChange, standard,
}: { titel: string; wert: number; onChange: (n: number) => void; standard?: string }) {
  return (
    <span title={standard} className="flex items-center gap-2 text-xs text-ui-schiefer">
      <span>{titel}</span>
      <select
        value={wert}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`${titel} pro Jahr${standard ? ' (Standardwert, anpassbar)' : ''}`}
        className="ui-feld cursor-pointer py-1 pl-2 pr-7 text-xs font-medium tabular-nums"
      >
        {QUOTEN.map((q) => (
          <option key={q} value={q}>
            {(q * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %
          </option>
        ))}
      </select>
      {/* Zwischen md und xl steht die Kopfleiste einzeilig und knapp — dort traegt nur der Tooltip die Marke. */}
      {standard && <span aria-hidden className="md:hidden xl:inline">Standard</span>}
    </span>
  );
}

/**
 * EIN Druckknopf mit Auswahl statt zweier roter Knoepfe — die waren das
 * Lauteste im ganzen Kopf. Mit Kontur, nicht gefuellt: Die Hauptaktion
 * jeder Etappe ist „Weiter“, nicht das Drucken.
 */
function DruckMenue({ onDrucke, kompakt = false }: {
  onDrucke: (umfang: 'kurz' | 'ausfuehrlich') => void;
  /** Nur das Symbol — fuer die eingeklappte Kopfleiste */
  kompakt?: boolean;
}) {
  const [offen, setOffen] = useState(false);
  const huelle = useRef<HTMLDivElement>(null);
  const menueId = useId();

  useEffect(() => {
    if (!offen) return;
    const weg = (e: MouseEvent) => { if (!huelle.current?.contains(e.target as Node)) setOffen(false); };
    const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') setOffen(false); };
    document.addEventListener('mousedown', weg);
    document.addEventListener('keydown', taste);
    return () => {
      document.removeEventListener('mousedown', weg);
      document.removeEventListener('keydown', taste);
    };
  }, [offen]);

  const wahl = (umfang: 'kurz' | 'ausfuehrlich') => { setOffen(false); onDrucke(umfang); };
  const eintrag = 'block w-full rounded-md px-3 py-2 text-left hover:bg-ui-innen focus-visible:bg-ui-innen';

  return (
    <div ref={huelle} className={`relative flex ${kompakt ? '' : 'flex-1 sm:flex-none'}`}>
      {kompakt ? (
        <button
          type="button"
          onClick={() => setOffen((v) => !v)}
          aria-expanded={offen}
          aria-controls={menueId}
          aria-label="Gutachten drucken"
          title="Gutachten drucken"
          className={KOPF_KNOPF}
        >
          <Printer className="h-4 w-4" aria-hidden />
        </button>
      ) : (
      <button
        type="button"
        onClick={() => setOffen((v) => !v)}
        aria-expanded={offen}
        aria-controls={menueId}
        className="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-ui-zweit-rand bg-ui-karte px-3 py-1.5 text-xs font-medium text-ui-tinte transition-colors hover:bg-ui-hover sm:flex-none"
      >
        <Printer className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="sm:hidden">Drucken</span><span className="hidden sm:inline">Gutachten drucken</span>
        <ChevronDown className="h-3 w-3 shrink-0" aria-hidden />
      </button>
      )}
      {offen && (
        <div
          id={menueId}
          className="ui-karte absolute right-0 top-full z-50 mt-2 w-64 p-1 text-sm text-ui-tinte shadow-lg"
        >
          {/*
            Zwei Umfaenge: die Kurzfassung fuer das Gespraech (Deckblatt,
            Angaben, Renteneinkuenfte, Vorbehalt), die ausfuehrliche zum
            Mitgeben. Ein Dokument mit Namen darauf fuehrt den Vorbehalt
            in beiden Faellen mit.
          */}
          <button type="button" className={eintrag} onClick={() => wahl('kurz')}>
            <span className="block font-medium">Kurzfassung</span>
            <span className="block text-xs text-ui-schiefer">Für das Gespräch: Angaben und Renteneinkünfte</span>
          </button>
          <button type="button" className={eintrag} onClick={() => wahl('ausfuehrlich')}>
            <span className="block font-medium">Ausführlich</span>
            <span className="block text-xs text-ui-schiefer">Zum Mitgeben: alle Abschnitte des Gutachtens</span>
          </button>
        </div>
      )}
    </div>
  );
}

/** Der Tooltip zur Kopfauswahl, solange der Wert noch der Standard ist. */
function standardHinweis(s: SzenarioParsed, pfad: string): string | undefined {
  if (!offenePfade(s).includes(pfad)) return undefined;
  const e = eintragVon(pfad);
  return e ? `Standardwert, anpassbar. ${e.hinweis ?? ''}`.trim() : undefined;
}

/** Was ein Entwurf aus der Schnellrechnung mitbringt: „Logo“, „Firmenname“, „Akzentfarbe“. */
function entwurfTeile(e: AuftrittEntwurf): string[] {
  return [e.logo ? 'Logo' : '', e.firma.trim() ? 'Firmenname' : '', e.farbe ? 'Akzentfarbe' : ''].filter(Boolean);
}

/** „A“, „A und B“, „A, B und C“ */
function aufzaehlen(teile: string[]): string {
  return teile.length <= 1 ? (teile[0] ?? '') : `${teile.slice(0, -1).join(', ')} und ${teile[teile.length - 1]}`;
}

export default function App() {
  const szenario = useSzenario((s) => s.szenario);
  const importMeldung = useSzenario((s) => s.importMeldung);
  const alsJsonExportieren = useSzenario((s) => s.alsJsonExportieren);
  const ausJsonImportieren = useSzenario((s) => s.ausJsonImportieren);
  const zuruecksetzen = useSzenario((s) => s.zuruecksetzen);
  const setzeAnnahmen = useSzenario((s) => s.setzeAnnahmen);

  const [reiter, setReiter] = useState<Reiter>('s1');
  const [ansicht, setAnsicht] = useState<Ansicht>('kassenbon');
  const [kaufkraftHeute, setKaufkraftHeute] = useState(false);
  /*
    Die Kopfleiste startet EINGEKLAPPT: Annahmen und Laden/Speichern braucht
    man selten, und eingeklappt bleibt mehr Platz fuer den Fall. Konto und
    Drucken stehen auch eingeklappt rechts als Symbole; „Kaufkraft heute“
    sitzt im Kassenbon und in der Fussleiste.
  */
  const [kopfEingeklappt, setKopfEingeklappt] = useState(true);
  const [menueOffen, setMenueOffen] = useState(false);
  const [basisOffen, setBasisOffen] = useState(true);
  const [kontoOffen, setKontoOffen] = useState(false);
  const [checkOffen, setCheckOffen] = useState(false);
  const [leisteOffen, setLeisteOffen] = useState(false);
  const [schritt, setSchritt] = useState<Schritt>(ladeEtappe);
  const geheZu = useCallback((s: Schritt) => {
    setSchritt(s);
    try { localStorage.setItem(SPEICHER_ETAPPE, s); } catch { /* Speicher gesperrt */ }
    window.scrollTo({ top: 0 });
  }, []);
  const [tuevReiter, setTuevReiter] = useState<'loesungen' | 'tuev'>('loesungen');
  const [eingabeArt, setEingabeArtRoh] = useState<'assistent' | 'formular'>(() => {
    try { return localStorage.getItem(SPEICHER_EINGABE) === 'formular' ? 'formular' : 'assistent'; } catch { return 'assistent'; }
  });
  const setEingabeArt = (a: 'assistent' | 'formular') => {
    setEingabeArtRoh(a);
    try { localStorage.setItem(SPEICHER_EINGABE, a); } catch { /* Speicher gesperrt */ }
  };
  // Der Schritt des Assistenten liegt hier, damit die Fortschrittsleiste ihn setzen kann.
  const [assistentSchritt, setAssistentSchritt] = useState(ladeAssistentSchritt);
  const assistentZu = useCallback((n: number) => setAssistentSchritt(merkeAssistentSchritt(n)), []);
  const pruefen = useSzenario((s) => s.pruefen);
  const ausgewertet = useSzenario((s) => s.ausgewertet);
  const uebernehmen = useSzenario((s) => s.uebernehmen);

  /*
    DER MUSTERFALL aus der Schnellrechnung (`lib/musterfall.ts`). Ist der
    Fall in diesem Browser noch unberuehrt — alle Beispielwerte offen —, wird
    er still geladen; sonst fragt ein Band, mit zwei gleichwertigen Knoepfen.
    Ein eingetragener Fall wird nie ungefragt ersetzt.
  */
  const [musterfall, setMusterfall] = useState<Musterfall | null>(() => offenerMusterfall());
  const musterfallLaden = useCallback((m: Musterfall) => {
    uebernehmen(m.szenario, 'Ihr Musterfall aus der Schnellrechnung ist geladen.');
    musterfallVerwerfen();
    setMusterfall(null);
    geheZu('ergebnis');
  }, [uebernehmen, geheZu]);
  useEffect(() => {
    if (!musterfall) return;
    const offen = offenePfade(useSzenario.getState().szenario);
    const unberuehrt = STANDARD_OFFEN
      .filter((p) => eintragVon(p)?.art === 'beispiel')
      .every((p) => offen.includes(p));
    if (unberuehrt) musterfallLaden(musterfall);
  }, [musterfall, musterfallLaden]);
  /** Der noetige Startbeitrag aus dem Sparrechner — die Loesungen koennen ihn uebernehmen. */
  const [sparrate, setSparrate] = useState<number | null>(null);

  /*
    Angeforderte Vorsorge-Checks laden, sobald jemand angemeldet ist — auch
    bei geschlossener Karte, damit ihr Kopf zeigen kann, dass ein Kunde
    geantwortet hat.
  */
  const angemeldet = useAuth((s) => s.email);
  const checkListe = useCheckAnfragen((s) => s.liste);
  const checkLaden = useCheckAnfragen((s) => s.laden);
  useEffect(() => {
    if (supabaseKonfiguriert && angemeldet) void checkLaden();
  }, [angemeldet, checkLaden]);

  /*
    „IHR AUFTRITT IM GUTACHTEN“ (`store/auftritt.ts`): geladen, sobald jemand
    angemeldet ist, damit das Logo beim Drucken schon bereitsteht.
  */
  const auftritt = useAuftritt((s) => s.auftritt);
  const auftrittStatus = useAuftritt((s) => s.status);
  const auftrittLaden = useAuftritt((s) => s.laden);
  const auftrittLeeren = useAuftritt((s) => s.zuruecksetzen);
  const [auftrittOffen, setAuftrittOffen] = useState(false);
  const schliesseAuftritt = useCallback(() => setAuftrittOffen(false), []);
  useEffect(() => {
    if (!supabaseKonfiguriert) return;
    if (angemeldet) void auftrittLaden();
    else auftrittLeeren();
  }, [angemeldet, auftrittLaden, auftrittLeeren]);

  /*
    DER AUFTRITT AUS DER SCHNELLRECHNUNG (`lib/auftritt-lokal.ts`). Ist im
    Konto noch keiner eingerichtet, wird er still uebernommen — angekuendigt
    war das dort. Sonst fragt ein Band, mit zwei gleichwertigen Knoepfen.
    Ersetzt wird nur, was in der Schnellrechnung eingetragen wurde (Logo,
    Firma, Farbe); Name und Kontakt bleiben.
  */
  const [auftrittLokal, setAuftrittLokal] = useState<AuftrittEntwurf | null>(() => offenerAuftrittLokal());
  const [auftrittBand, setAuftrittBand] = useState<'frage' | 'uebernommen' | 'fehler' | null>(null);
  // Was uebernommen wurde — das Band nennt genau das, nicht pauschal „Logo und Firmenname“.
  const [auftrittWas, setAuftrittWas] = useState<string[]>([]);
  const auftrittUebernahme = useRef(false);
  const auftrittUebernehmen = useCallback(async (e: AuftrittEntwurf): Promise<boolean> => {
    const basis = useAuftritt.getState().auftritt ?? AUFTRITT_LEER;
    const logo = e.logo ? dataUrlZuBlob(e.logo) : null;
    const r = await useAuftritt.getState().speichern({
      firma: e.firma.trim() || basis.firma,
      berater: basis.berater, telefon: basis.telefon, email: basis.email, web: basis.web, zusatz: basis.zusatz,
      farbe: e.farbe ?? basis.farbe,
    }, logo ?? undefined);
    if (r !== 'ok') return false;
    setAuftrittWas(entwurfTeile(e));
    auftrittLokalVerwerfen();
    setAuftrittLokal(null);
    return true;
  }, []);
  useEffect(() => {
    if (!auftrittLokal || auftrittStatus !== 'bereit' || auftrittBand || auftrittUebernahme.current) return;
    if (useAuftritt.getState().auftritt) { setAuftrittBand('frage'); return; }
    auftrittUebernahme.current = true;
    void auftrittUebernehmen(auftrittLokal).then((ok) => {
      auftrittUebernahme.current = false;
      setAuftrittBand(ok ? 'uebernommen' : 'fehler');
    });
  }, [auftrittLokal, auftrittStatus, auftrittBand, auftrittUebernehmen]);
  const neueEingaenge = checkListe.filter((a) => a.eingang).length;
  /*
    KONTO UND VORSORGE-CHECK als Fenster: Beide werden in jeder Etappe
    gebraucht — gespeichert wird oft erst nach den Angeboten am Ende, ein
    Kunden-Link geht jederzeit raus. Erreichbar aus der ersten Etappe und aus
    der Seitenleiste.
  */
  const checkMoeglich = supabaseKonfiguriert && Boolean(angemeldet);
  // "Abo & Team" und "Feedback geben" — beide Fenster gehoeren der Zugangsschranke (fuer alle Seiten).
  const zugang = useZugang(wirksam);
  const oeffneAbo = useZugang((s) => s.oeffneFenster);
  const oeffneRueckmeldung = useZugang((s) => s.oeffneRueckmeldung);
  const eingangMarke = neueEingaenge > 0 ? `${neueEingaenge} eingegangen` : undefined;
  const schliesseKonto = useCallback(() => setKontoOffen(false), []);
  const schliesseCheck = useCallback(() => setCheckOffen(false), []);
  const [ehepartnerDialog, setEhepartnerDialog] = useState(false);
  const dateiRef = useRef<HTMLInputElement>(null);

  /*
    GESAMT ODER EINZELN.

    Die ganze rechte Spalte haengt an EINEM Aufruf. Wird dort ein anderes
    Szenario uebergeben, folgen Titel, Ring, Kassenbon, Verlauf, Steuer-Engine,
    Sparrechner, Foerdercheck und Vertrags-Pruefung von selbst — genau das ist
    gewollt: wirklich nur die Vertraege und Einkuenfte einer Person.

    Die EINGABEspalte behaelt dagegen den Wert aus dem Speicher. Bekaeme sie
    das zusammengestrichene Szenario, bearbeitete man ein Phantom, dessen
    Aenderungen beim naechsten Umschalten verschwaenden.

    Beides ist Zustand der ANSICHT und wandert nicht ins Szenario: Zod
    entfernt unbekannte Schluessel still, ein dort abgelegter Schalter ginge
    beim naechsten Laden verloren.
  */
  const [betrachtung, setBetrachtung] = useState<'haushalt' | 'einzeln'>('haushalt');
  const [wer, setWer] = useState<PersonId>('A');
  const paar = szenario.haushalt.verheiratet && szenario.personen.length > 1;
  const einzeln = paar && betrachtung === 'einzeln';
  /*
    `useMemo` ist hier Pflicht, nicht Kosmetik: `useProjektion` hat das
    Szenario in seiner Abhaengigkeitsliste. Ein bei jedem Rendern neu gebautes
    Objekt loeste dort eine Endlosschleife von Worker-Laeufen aus.
  */
  const ansichtSzenario = useMemo(
    () => (einzeln ? nurPerson(szenario, wer) : szenario),
    [szenario, einzeln, wer],
  );

  const { ergebnis, rechnet, fehler } = useProjektion(ansichtSzenario);

  /*
    DER FORTSCHRITT DES FALLS — aus echten Schritten (`features/fortschritt.ts`).
    Am ganzen Fall, nicht an der Einzelbetrachtung: Er beschreibt, was
    erfasst ist, nicht was gerade angezeigt wird. Ausgewertet ist der Fall,
    sobald das Ergebnis einmal mit Zahlen zu sehen war.
  */
  const nameVon = useCallback((id: PersonId) => personNameAus(szenario.personen, id), [szenario.personen]);
  const fallSchritte = useMemo(
    () => fallFortschritt(szenario, { konto: Boolean(angemeldet), nameVon }),
    [szenario, angemeldet, nameVon],
  );
  useEffect(() => {
    if (schritt === 'ergebnis' && ergebnis) ausgewertet();
  }, [schritt, ergebnis, ausgewertet]);
  const etappeErledigt = (id: Schritt) => (id === 'daten'
    ? datenErledigt(fallSchritte)
    : id === 'ergebnis' && fallSchritte.some((x) => x.id === 'auswertung' && x.erledigt));
  /** Ein offener Schritt der Leiste fuehrt an die Stelle, an der etwas fehlt. */
  const springeZu = (id: FallSchrittId) => {
    if (id === 'auswertung') { geheZu('ergebnis'); return; }
    if (id === 'konto') { setKontoOffen(true); return; }
    setBasisOffen(true);
    geheZu('daten');
    if (eingabeArt === 'assistent') {
      const n = assistentSchrittFuer(id, offenePfade(szenario));
      if (n !== null && n >= 0) assistentZu(n);
    } else {
      // Nach dem Zeichnen: `geheZu` springt erst nach oben.
      window.setTimeout(() => document.getElementById(id === 'vertraege' ? 'vertraege' : 'eingaben')
        ?.scrollIntoView({ block: 'start' }), 0);
    }
  };

  const exportieren = () => {
    const blob = new Blob([alsJsonExportieren()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rentenplaner-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importieren = (e: React.ChangeEvent<HTMLInputElement>) => {
    const datei = e.target.files?.[0];
    if (!datei) return;
    datei.text().then(ausJsonImportieren);
    e.target.value = '';
  };

  /*
    DAS JAHR DER UEBERSICHT.

    Vorbelegt auf den Rentenbeginn des Partners, der ZUERST geht — bei Paaren
    mit unterschiedlichem Rentenbeginn war genau die Phase unsichtbar, in der
    einer noch arbeitet und einer schon Rente bezieht. `ruhestandsjahr` ist
    das Jahr, in dem BEIDE im Ruhestand sind.
  */
  const ersterRuhestand = useMemo(() => {
    // Aus dem ANSICHTSszenario: In der Einzelbetrachtung zaehlt allein der
    // Rentenbeginn der gewaehlten Person. Naehme man hier weiter beide, boete
    // der Regler Jahre an, in denen die Zeitachse noch gar nichts zeigt.
    const jahre = ansichtSzenario.personen
      .map((x) => parseDatum(x.rentenbeginn)?.jahr)
      .filter((j): j is number => j !== undefined);
    return jahre.length > 0 ? Math.min(...jahre) : null;
  }, [ansichtSzenario.personen]);

  const [jahrWahl, setJahrWahl] = useState<number | null>(null);
  /*
    Die Wahl faellt zurueck, sobald sie ins Leere zeigt — nach einem Import
    oder einer Datumsaenderung kann das gewaehlte Jahr ausserhalb der neuen
    Zeitachse liegen.
  */
  const zeilenAbRuhestand = ergebnis?.zeilen.filter(
    (z) => ersterRuhestand !== null && z.jahr >= ersterRuhestand,
  ) ?? [];
  const gezeigtesJahr = jahrWahl !== null && zeilenAbRuhestand.some((z) => z.jahr === jahrWahl)
    ? jahrWahl
    : ersterRuhestand;

  const echteZeile =
    ergebnis?.zeilen.find((z) => z.jahr === gezeigtesJahr) ??
    ergebnis?.zeilen.find((z) => z.jahr === ergebnis.ruhestandsjahr) ??
    ergebnis?.zeilen.find((z) => z.vollstaendigImRuhestand);
  const zeile = echteZeile ?? LEERE_ZEILE;

  /*
    DER DRUCKUMFANG. Gedruckt wird erst, wenn React die neue Seitenfolge
    gezeichnet hat — `window.print()` unmittelbar im Klick druckte noch die
    alte. Deshalb der Umweg ueber einen Effekt.
  */
  const [druckUmfang, setDruckUmfang] = useState<'kurz' | 'ausfuehrlich'>('ausfuehrlich');
  const [druckAngefordert, setDruckAngefordert] = useState(false);
  useEffect(() => {
    if (!druckAngefordert) return;
    setDruckAngefordert(false);
    /*
      Mit Logo wird erst gedruckt, wenn es dekodiert ist — sonst fehlte es
      beim ersten Druck. Hoechstens 1,5 s; ohne Bild sofort wie bisher.
    */
    const bilder = [...document.querySelectorAll<HTMLImageElement>('#gutachten img')];
    if (bilder.length === 0) { window.print(); return; }
    void Promise.race([
      Promise.all(bilder.map((b) => b.decode().catch(() => undefined))),
      new Promise((fertig) => window.setTimeout(fertig, 1500)),
    ]).then(() => window.print());
  }, [druckAngefordert, druckUmfang]);
  const druckeJetzt = (umfang: 'kurz' | 'ausfuehrlich') => {
    setDruckUmfang(umfang);
    setDruckAngefordert(true);
  };
  /*
    NOCH BEISPIELWERTE IM FALL? Dann eine Rueckfrage vor dem Druck — ein
    Gutachten geht an den Kunden, und danach ist es zu spaet. Beide Knoepfe
    sind gleichwertig; gedruckt werden darf trotzdem, die Werte stehen im
    Gutachten dann als Beispielwert gekennzeichnet.
  */
  const [druckFrage, setDruckFrage] = useState<'kurz' | 'ausfuehrlich' | null>(null);
  const offeneBeispielTexte = offeneBeispiele(ansichtSzenario, (id) => personNameAus(szenario.personen, id));
  const drucke = (umfang: 'kurz' | 'ausfuehrlich') => {
    if (offeneBeispielTexte.length > 0) setDruckFrage(umfang);
    else druckeJetzt(umfang);
  };
  const schliesseDruckFrage = useCallback(() => setDruckFrage(null), []);

  /*
    Solange Beispielwerte im Fall stehen, sagt es jede rechnende Etappe —
    sonst wirkte ein Ergebnis aus dem Beispiel wie eines aus dem Mandanten.
    Gestrichelt wie die Marke „Beispielwert“ am Feld: vorlaeufig, aber
    kein Fehler — ohne Ampelfarbe.
  */
  const beispielHinweis = offeneBeispielTexte.length > 0 && (
    <div role="status" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-[8px] border border-dashed border-ui-schiefer/60 bg-ui-karte px-4 py-2.5 text-sm text-ui-tinte print:hidden">
      <span>
        Das Ergebnis rechnet noch mit {offeneBeispielTexte.length === 1 ? 'einem Beispielwert' : `${offeneBeispielTexte.length} Beispielwerten`}:{' '}
        {offeneBeispielTexte.join(', ')}.
      </span>
      <button type="button" onClick={() => { setBasisOffen(true); geheZu('daten'); }} className={LINK}>
        Zu den Angaben <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
  const faktor = kaufkraftHeute ? 1 / zeile.kaufkraftfaktor : 1;
  const luecke = versorgungsluecke(zeile);
  // Das heutige Haushaltsnetto — die Bezugsgroesse fuer Sparrate und Beitraege.
  const nettoHeute = nettoHeuteMonat(ergebnis);
  // Hinweise des Rechenkerns lagen bisher ungenutzt im Ergebnis.
  const hinweise = ergebnis && !echteZeile ? ergebnis.hinweise : [];

  const schliesseLeiste = useCallback(() => setLeisteOffen(false), []);
  const abschnitte: Abschnitt[] = [
    { id: 'journey', text: '1. Daten & Ziel', symbol: <User className="h-4 w-4" aria-hidden />, beiSprung: () => { setBasisOffen(true); geheZu('daten'); } },
    { id: 'journey', text: '2. Ergebnis', symbol: <BarChart3 className="h-4 w-4" aria-hidden />, beiSprung: () => geheZu('ergebnis') },
    { id: 'journey', text: '3. Sparrechner', symbol: <Target className="h-4 w-4" aria-hidden />, beiSprung: () => geheZu('sparen') },
    { id: 'journey', text: '4. Vertrags-TÜV & Lösungen', symbol: <SearchCheck className="h-4 w-4" aria-hidden />, beiSprung: () => geheZu('loesungen') },
  ];
  const werkzeuge: Werkzeug[] = [
    {
      text: 'Konto',
      zusatz: angemeldet ? `Angemeldet als ${angemeldet}` : 'Pläne speichern und laden',
      symbol: <Wallet className="h-4 w-4" aria-hidden />,
      onOeffnen: () => setKontoOffen(true),
    },
    ...(checkMoeglich ? [{
      text: 'Ihr Auftritt im Gutachten',
      zusatz: auftritt?.firma.trim() || 'Logo, Name und Kontakt',
      symbol: <Palette className="h-4 w-4" aria-hidden />,
      onOeffnen: () => setAuftrittOffen(true),
    }] : []),
    ...(checkMoeglich ? [{
      text: 'Vorsorge-Check an Kunden senden',
      zusatz: 'Persönlicher Link für die Angaben vorab',
      symbol: <Inbox className="h-4 w-4" aria-hidden />,
      marke: eingangMarke,
      onOeffnen: () => setCheckOffen(true),
    }] : []),
    ...(zugang && aboSichtbar(zugang) ? [{
      text: 'Abo & Team',
      zusatz: aboZusatz(zugang),
      symbol: <CreditCard className="h-4 w-4" aria-hidden />,
      onOeffnen: oeffneAbo,
    }] : []),
    ...(checkMoeglich ? [{
      text: 'Feedback geben',
      zusatz: zugang?.fruehstart ? 'Als Early Adopter: Ihre Meinung zählt' : 'Was hilft, was fehlt, was stört?',
      symbol: <MessageSquare className="h-4 w-4" aria-hidden />,
      marke: zugang && rueckmeldungFaellig(zugang) ? 'fällig' : undefined,
      onOeffnen: oeffneRueckmeldung,
    }] : []),
  ];

  /*
    GESAMT ODER EINZELN — der Umschalter steht oben in jeder Etappe, die
    rechnet, weil er alles darunter betrifft: Titel, Ring, Kassenbon, Verlauf,
    Steuer, Sparrechner, Vertrags-Pruefung und den Ausdruck. Gerechnet wird
    dafuer nicht anders, sondern ein anderes Szenario.
  */
  /* Als Pillen wie die Reiter der Beratung; die Person waehlt eine zweite Reihe daneben. */
  const paarUmschalter = paar && (
    <section aria-label="Betrachtung" className="ui-karte p-5 print:hidden sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Pillen
          reiter={[
            { id: 'haushalt' as const, inhalt: 'Gesamt' },
            { id: 'einzeln' as const, inhalt: 'Einzeln' },
          ]}
          aktiv={betrachtung}
          onWechsel={setBetrachtung}
          beschriftung="Haushalt oder einzelne Person"
        />
        {betrachtung === 'einzeln' && (
          <Pillen
            reiter={szenario.personen
              .filter((p) => p.id === 'A' || szenario.haushalt.verheiratet)
              .map((p) => ({ id: p.id, inhalt: personName(p) }))}
            aktiv={wer}
            onWechsel={setWer}
            beschriftung="Welche Person"
          />
        )}
      </div>
      <p className="mt-3 text-sm leading-relaxed text-ui-schiefer">
        {betrachtung === 'einzeln'
          ? `Nur die Verträge und Einkünfte von ${personNameAus(szenario.personen, wer)} — allein veranlagt, mit Grundtarif statt Splitting.`
          : 'Beide Partner zusammen, wie bisher: eine Veranlagung mit Splittingtarif.'}
      </p>
    </section>
  );

  /*
    DAS JAHR DER UEBERSICHT, verstellbar — aber nur bei Paaren. Bei einer
    Person faellt der erste mit dem einzigen Rentenbeginn zusammen; ein Regler
    haette dort nichts zu zeigen ausser spaeteren Jahren derselben Rente.
  */
  const letztesJahr = zeilenAbRuhestand[zeilenAbRuhestand.length - 1]?.jahr ?? 0;
  const jahrKnopf = 'rounded-full border border-ui-zweit-rand bg-ui-karte p-1.5 text-ui-tinte transition-colors hover:bg-ui-hover disabled:opacity-40';
  const jahrRegler = paar && !einzeln && ersterRuhestand !== null && zeilenAbRuhestand.length > 1 && (
    <section aria-label="Angezeigtes Jahr" className="ui-karte p-5 print:hidden sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <span className={ETIKETT}>Angezeigtes Jahr</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setJahrWahl(Math.max(ersterRuhestand, (gezeigtesJahr ?? ersterRuhestand) - 1))}
            aria-label="Ein Jahr zurück"
            className={jahrKnopf}
            disabled={(gezeigtesJahr ?? ersterRuhestand) <= ersterRuhestand}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <span className="min-w-[3.5rem] text-center text-lg font-medium tabular-nums text-ui-tinte">
            {zeile.jahr}
          </span>
          <button
            type="button"
            onClick={() => setJahrWahl(Math.min(letztesJahr, (gezeigtesJahr ?? ersterRuhestand) + 1))}
            aria-label="Ein Jahr vor"
            className={jahrKnopf}
            disabled={(gezeigtesJahr ?? ersterRuhestand) >= letztesJahr}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
      {/* Der Regler des Stils (index.css: .ui-regler), gefuellt bis zum gezeigten Jahr. */}
      <input
        type="range"
        min={ersterRuhestand}
        max={letztesJahr}
        step={1}
        value={gezeigtesJahr ?? ersterRuhestand}
        onChange={(e) => setJahrWahl(Number(e.target.value))}
        aria-label="Jahr der Übersicht"
        className="ui-regler mt-4 w-full"
        style={{ '--anteil': `${(((gezeigtesJahr ?? ersterRuhestand) - ersterRuhestand) / Math.max(1, letztesJahr - ersterRuhestand)) * 100}%` } as React.CSSProperties}
      />
      {/* Ohne diesen Satz wirkt das hohe Netto einer gemischten Phase wie
          ein Rechenfehler: Da laeuft noch ein Gehalt. */}
      <p className="mt-3 text-sm leading-relaxed text-ui-schiefer">
        {zeile.gemischtePhase
          ? 'Ein Partner arbeitet noch — im Netto steckt daher weiter ein Gehalt.'
          : 'Beide im Ruhestand.'}
      </p>
    </section>
  );

  /*
    DIE VERSORGUNGSSCHICHTEN: Reiter als Pillen wie in der Beratung, darunter
    die Vertraege der Schicht. Ohne eigenen Kasten — der Assistent und das
    Formular stellen sie in ihre Karte; ein Kasten darin waere einer zu viel.
  */
  const schichten = (
    <div id="vertraege" className="scroll-mt-28 space-y-5">
      <Pillen
        reiter={REITER.map((r) => ({ id: r.id, inhalt: r.text }))}
        aktiv={reiter}
        onWechsel={setReiter}
        beschriftung="Versorgungsschichten"
        kennung={(id) => ({ reiter: `schicht-reiter-${id}`, bereich: 'schicht-bereich' })}
      />
      <div role="tabpanel" id="schicht-bereich" aria-labelledby={`schicht-reiter-${reiter}`}>
        {reiter === 's1' && <Vertraege schicht={1} depots={ergebnis?.depots ?? []} auszahlungen={ergebnis?.kapitalauszahlungen ?? []} avdLaeufe={ergebnis?.avd ?? []} verrentungen={ergebnis?.verrentungen ?? []} />}
        {reiter === 's2' && <Vertraege schicht={2} depots={ergebnis?.depots ?? []} auszahlungen={ergebnis?.kapitalauszahlungen ?? []} avdLaeufe={ergebnis?.avd ?? []} verrentungen={ergebnis?.verrentungen ?? []} />}
        {reiter === 's3' && <Vertraege schicht={3} depots={ergebnis?.depots ?? []} auszahlungen={ergebnis?.kapitalauszahlungen ?? []} avdLaeufe={ergebnis?.avd ?? []} verrentungen={ergebnis?.verrentungen ?? []} />}
        {reiter === 'planer' && <Planer ergebnis={ergebnis?.planer ?? null} />}
      </div>
    </div>
  );

  const rechnetText = (
    <p className="ui-karte px-4 py-8 text-center text-sm text-ui-schiefer">
      Berechnung läuft …
    </p>
  );

  return (
    /*
      Der Seitengrund aller Seiten: warmer Stein, darauf weisse Karten mit
      Haarlinie. Eingaben und Ergebnisse trennt nicht mehr ein Farbton,
      sondern die Etappe — wie in der Mitarbeiterberatung.
    */
    <div className="min-h-screen bg-ui-flaeche pb-28 text-ui-tinte sm:pb-32 print:pb-0">
      {/*
        KOPFZEILE — hell wie der Kopf der anderen Seiten (`SeitenKopf`), aber
        mitlaufend: Seiten, Konto und Drucken braucht man in jeder Etappe.
        Eine Haarlinie trennt sie vom Inhalt, der darunter durchlaeuft.
      */}
      <header
        className={`sticky top-0 z-50 border-b border-ui-linie bg-ui-flaeche text-ui-tinte print:hidden ${
          kopfEingeklappt ? 'py-2 sm:py-3' : 'py-2 sm:py-4'
        }`}
      >
        <div
          className={`relative mx-auto flex min-h-[40px] max-w-6xl px-4 sm:px-6 ${
            kopfEingeklappt ? 'items-center' : 'flex-col justify-between md:flex-row md:items-center'
          }`}
        >
          {/*
            md:shrink-0 ist noetig: sonst staucht die breite Bedienleiste
            diesen Block, das Logo haelt als shrink-0 dagegen und der
            Einklapp-Knopf rutscht unter die Leiste — er waere sichtbar,
            aber nicht mehr anklickbar.
          */}
          {/* Eingeklappt links buendig statt mittig: rechts stehen jetzt Konto,
              Drucken und der Pfeil — mittig lag der Name am Telefon darunter. */}
          <div className={`flex items-center md:shrink-0 ${kopfEingeklappt ? 'w-full justify-between gap-2' : 'w-full justify-between gap-2 md:w-auto md:gap-3'}`}>
            {/* min-w-0: Der Name darf am Telefon umbrechen, statt die Knoepfe rechts aus dem Bild zu schieben. */}
            <div className="flex min-w-0 items-center gap-3">
              {/* Uebersicht ueber alle Seiten — auch bei eingeklappter Kopfleiste da. */}
              <button
                type="button"
                onClick={() => setLeisteOffen(true)}
                aria-expanded={leisteOffen}
                aria-label={neueEingaenge > 0
                  ? `Übersicht aller Seiten öffnen — ${neueEingaenge} Vorsorge-Check${neueEingaenge > 1 ? 's' : ''} eingegangen`
                  : 'Übersicht aller Seiten öffnen'}
                className={`${KOPF_KNOPF} sm:px-3`}
              >
                <PanelLeft className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Seiten</span>
                {/* Ein Kunde hat geantwortet — sichtbar auch bei eingeklappter Kopfzeile. */}
                {neueEingaenge > 0 && (
                  <span
                    aria-hidden
                    className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-ui-dunkel px-1 text-[10px] font-medium leading-none text-white ring-2 ring-ui-flaeche"
                  >
                    {neueEingaenge}
                  </span>
                )}
              </button>
              <Logo klasse="h-9 w-9" />
              <div className="min-w-0 text-left">
                <h1 className="text-sm font-medium tracking-tight">JS-Rentenplaner</h1>
                {/* Am Telefon nur der Name — der Spruch braeche dort in zwei Zeilen und machte den Kopf hoch. */}
                <p className="hidden text-xs text-ui-schiefer sm:block">Ihre Zukunft. Smart geplant.</p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setKontoOffen(true)}
                aria-label={angemeldet ? `Konto — angemeldet als ${angemeldet}` : 'Konto — Pläne speichern und laden'}
                title={angemeldet ? `Angemeldet als ${angemeldet}` : 'Konto'}
                className={`${KOPF_KNOPF} ${kopfEingeklappt ? '' : 'md:hidden'}`}
              >
                <Wallet className="h-4 w-4" aria-hidden />
                {angemeldet && <span aria-hidden className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-ui-tinte ring-2 ring-ui-flaeche" />}
              </button>
              {kopfEingeklappt && <DruckMenue onDrucke={drucke} kompakt />}
              {!kopfEingeklappt && (
                <button
                  type="button"
                  onClick={() => setMenueOffen((v) => !v)}
                  aria-expanded={menueOffen}
                  aria-label="Menü"
                  className={`${KOPF_KNOPF} sm:px-3 md:hidden`}
                >
                  <Settings className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Menü</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setKopfEingeklappt((v) => !v)}
                aria-expanded={!kopfEingeklappt}
                title={kopfEingeklappt ? 'Kopfzeile ausklappen' : 'Kopfzeile einklappen'}
                className={KOPF_KNOPF}
              >
                {kopfEingeklappt
                  ? <ChevronDown className="h-4 w-4" aria-hidden />
                  : <ChevronUp className="h-4 w-4" aria-hidden />}
              </button>
            </div>
          </div>

          {!kopfEingeklappt && (
            <div className={`${menueOffen ? 'flex' : 'hidden'} mt-3 w-full flex-col items-stretch gap-2 md:mt-0 md:flex md:w-auto md:flex-row md:items-center`}>
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-[10px] border border-ui-linie bg-ui-karte px-3 py-2">
                <KopfAuswahl
                  titel="Inflation"
                  wert={szenario.annahmen.inflation}
                  onChange={(n) => setzeAnnahmen({ inflation: n })}
                  standard={standardHinweis(szenario, 'annahmen.inflation')}
                />
                <KopfAuswahl
                  titel="Rente"
                  wert={szenario.annahmen.rentendynamik}
                  onChange={(n) => setzeAnnahmen({ rentendynamik: n })}
                  standard={standardHinweis(szenario, 'annahmen.rentendynamik')}
                />
                {/*
                  Single/Verheiratet stand hier doppelt — es ist eine Angabe
                  zum Fall und steht in den Basisdaten (Schritt 1), mit
                  demselben Ehepartner-Dialog.
                */}
              </div>

              {/* Die Aktionen ohne Kasten: Textknoepfe, das Drucken mit Kontur. */}
              <div className="flex flex-wrap items-center justify-center gap-1">
                <input ref={dateiRef} type="file" accept=".json" onChange={importieren} className="hidden" />
                <button
                  type="button"
                  onClick={() => setKontoOffen(true)}
                  title={angemeldet ? `Angemeldet als ${angemeldet}` : 'Pläne speichern und laden'}
                  className={`${KOPF_TEXT} hidden md:inline-flex`}
                >
                  <Wallet className="h-3.5 w-3.5 shrink-0" aria-hidden /> Konto
                  {angemeldet && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ui-tinte" />}
                </button>
                <button type="button" onClick={() => dateiRef.current?.click()} className={`${KOPF_TEXT} flex-1 sm:flex-none`}>
                  <FolderOpen className="h-3.5 w-3.5 shrink-0" aria-hidden /> Laden
                </button>
                <button type="button" onClick={exportieren} className={`${KOPF_TEXT} flex-1 sm:flex-none`}>
                  <Download className="h-3.5 w-3.5 shrink-0" aria-hidden /> Speichern
                </button>
                <DruckMenue onDrucke={drucke} />
                <button
                  type="button"
                  onClick={zuruecksetzen}
                  aria-label="Alle Eingaben zurücksetzen"
                  title="Alle Eingaben zurücksetzen"
                  className="rounded-full p-2 text-ui-schiefer transition-colors hover:bg-ui-innen hover:text-ui-tinte"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/*
        DAS GEDRUCKTE GUTACHTEN.
        Eigenes Dokument statt Druck-CSS auf der Bedienoberflaeche: die
        besteht aus Formularfeldern, Reitern und Scrollbereichen und ergibt
        auf Papier leere Eingabekaesten, fehlende Vertraege und
        abgeschnittene Tabellen. Alles darunter ist deshalb print:hidden.
      */}
      <Gutachten
        szenario={ansichtSzenario}
        ergebnis={ergebnis ?? null}
        zeile={zeile}
        umfang={druckUmfang}
        einzelperson={einzeln ? personNameAus(szenario.personen, wer) : undefined}
        auftritt={auftritt}
      />

      {importMeldung && (
        <div className="mx-auto mt-4 max-w-6xl px-4 print:hidden sm:px-6">
          <div
            role="status"
            className={`px-4 py-3 text-sm ${importMeldung.art === 'ok' ? 'ui-innen text-ui-tinte' : 'rounded-lg bg-rose-50 text-rose-900'}`}
          >
            <strong className="font-medium">{importMeldung.art === 'ok' ? 'Geladen.' : 'Datei konnte nicht geladen werden.'}</strong>
            <ul className="mt-1 list-inside list-disc">
              {importMeldung.texte.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          </div>
        </div>
      )}

      {/* Rand und Abstaende wie die Mitarbeiterberatung: 16 px am Telefon, Bloecke mit Luft dazwischen. */}
      <main id="journey" className="mx-auto max-w-6xl scroll-mt-28 space-y-6 px-4 py-6 sm:space-y-8 sm:px-6 sm:py-8 print:hidden">
        {musterfall && (
          <Band knoepfe={(
            <>
              <button type="button" onClick={() => musterfallLaden(musterfall)} className={KNOPF_ZWEIT}>Übernehmen</button>
              <button type="button" onClick={() => { musterfallVerwerfen(); setMusterfall(null); }} className={KNOPF_ZWEIT}>
                Verwerfen
              </button>
            </>
          )}>
            <p>
              <strong>Musterfall aus der Schnellrechnung übernehmen?</strong>{' '}
              {musterfall.kurz && <>({musterfall.kurz}) </>}
              Ihr aktueller Fall in diesem Browser wird dabei ersetzt — sichern Sie ihn vorher im Konto, wenn Sie
              ihn behalten möchten.
            </p>
          </Band>
        )}
        {auftrittBand && (auftrittBand === 'uebernommen' || auftrittLokal) && (
          <Band knoepfe={auftrittBand === 'uebernommen' ? (
            <>
              <button type="button" onClick={() => { setAuftrittBand(null); setAuftrittOffen(true); }} className={KNOPF_ZWEIT}>
                Auftritt ansehen
              </button>
              <button type="button" onClick={() => setAuftrittBand(null)} className={KNOPF_ZWEIT}>Schließen</button>
            </>
          ) : (
            <>
              <button type="button"
                onClick={() => { if (auftrittLokal) void auftrittUebernehmen(auftrittLokal).then((ok) => setAuftrittBand(ok ? 'uebernommen' : 'fehler')); }}
                className={KNOPF_ZWEIT}>
                Übernehmen
              </button>
              <button type="button" onClick={() => { auftrittLokalVerwerfen(); setAuftrittLokal(null); setAuftrittBand(null); }}
                className={KNOPF_ZWEIT}>
                Verwerfen
              </button>
            </>
          )}>
            {auftrittBand === 'uebernommen' ? (
              <p>
                <strong>
                  {aufzaehlen(auftrittWas.map((t) => `Ihr${t === 'Akzentfarbe' ? 'e' : ''} ${t}`))} aus der Schnellrechnung{' '}
                  {auftrittWas.length > 1 ? 'sind' : 'ist'} jetzt in Ihrem Konto.
                </strong>{' '}
                Name und Kontakt ergänzen Sie unter „Ihr Auftritt im Gutachten“.
              </p>
            ) : (
              <p>
                <strong>{aufzaehlen(auftrittLokal ? entwurfTeile(auftrittLokal) : [])} aus der Schnellrechnung übernehmen?</strong>{' '}
                {auftrittBand === 'fehler'
                  ? 'Das Speichern hat gerade nicht geklappt — versuchen Sie es noch einmal.'
                  : 'Was Sie dort eingetragen haben, ersetzt das Gespeicherte; Name und Kontakt bleiben.'}
              </p>
            )}
          </Band>
        )}
        {/* Etappenleiste und Fortschritt dicht beieinander — beide sagen, wo der Fall steht. */}
        <div className="space-y-3">
          <JourneyLeiste etappen={ETAPPEN} aktiv={schritt} onWechsel={geheZu} erledigt={etappeErledigt} />
          <FallFortschritt schritte={fallSchritte} onSprung={springeZu} />
        </div>

        {fehler && (
          <div role="alert" className={`px-4 py-3 ${FEHLER}`}>
            Die Berechnung ist fehlgeschlagen: {fehler}
          </div>
        )}

        {hinweise.length > 0 && schritt !== 'daten' && (
          <div role="status" className="ui-innen flex gap-2.5 px-4 py-3 text-sm leading-relaxed text-ui-tinte">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-ui-schiefer" aria-hidden />
            <ul className="space-y-1">
              {hinweise.map((h, i) => <li key={i}>{h}</li>)}
            </ul>
          </div>
        )}

        {/* ---------- 1. DATEN & ZIEL ---------- */}
        {schritt === 'daten' && (
          <>
            <EtappenKopf
              titel={<>Ihre Daten und <Hervor>Ihr Ziel</Hervor></>}
              text="Wer Sie sind, was Sie verdienen, was schon an Vorsorge da ist — und mit wie viel Geld im Monat Sie im Ruhestand leben möchten."
            />
            {/*
              LINKS die Angaben zur Person, RECHTS die Vertraege — auf weissen
              Karten wie die Angaben der Mitarbeiterberatung.
            */}
            {/*
              VORSORGE-CHECK am Anfang der Angaben — von dort kommen Faelle
              oft: die Angaben, die ein Kunde ueber seinen Link geschickt hat.
              In beiden Eingabearten. Das Konto steht im Kopf (oben rechts,
              wo man es sucht) — als Karte hier war es eine Ebene mehr vor
              dem ersten Eingabefeld.
            */}
            {checkMoeglich && (
              <div className="grid gap-3 sm:grid-cols-2 print:hidden">
                <StartKarte
                  symbol={<Inbox className="h-5 w-5" aria-hidden />}
                  titel="Vorsorge-Check an Kunden senden"
                  text="Persönlicher Link — die Angaben landen bei Ihnen"
                  marke={eingangMarke}
                  onClick={() => setCheckOffen(true)}
                />
              </div>
            )}

            {/*
              ZWEI WEGE ZU DENSELBEN ANGABEN: der Assistent fragt einzeln und
              nennt die Unterlage, das Formular zeigt alles auf einen Blick.
              Beide schreiben in denselben Speicher — umschalten verliert nichts.
              Als Pillen wie der Kaufkraft-Schalter; am Telefon kuerzer, sonst
              passen beide nicht nebeneinander.
            */}
            <div role="group" aria-label="Art der Eingabe"
              className="inline-flex max-w-full gap-1 rounded-full border border-ui-linie bg-ui-karte p-1 text-sm font-medium print:hidden">
              {([['assistent', 'Schritt für Schritt', 'Schritt für Schritt'], ['formular', 'Alle Angaben auf einen Blick', 'Auf einen Blick']] as const).map(([id, text, kurz]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setEingabeArt(id)}
                  aria-pressed={eingabeArt === id}
                  // Derselbe Name auf jedem Geraet; die Kurzform am Telefon ist ein Teil davon.
                  aria-label={text}
                  className={`rounded-full px-3 py-1.5 transition-colors sm:px-4 ${
                    eingabeArt === id ? 'bg-ui-dunkel text-white' : 'text-ui-schiefer hover:text-ui-tinte'
                  }`}
                >
                  <span className="sm:hidden">{kurz}</span><span className="hidden sm:inline">{text}</span>
                </button>
              ))}
            </div>

            {eingabeArt === 'assistent' ? (
              <Assistent
                ergebnis={ergebnis ?? null}
                onEhepartnerDialog={() => setEhepartnerDialog(true)}
                vertraege={schichten}
                onFertig={() => geheZu('ergebnis')}
                schritt={assistentSchritt}
                onSchritt={assistentZu}
              />
            ) : (
            <div className="grid grid-cols-1 gap-5 sm:gap-6 lg:grid-cols-12">
              <div id="eingaben" className="scroll-mt-28 lg:col-span-6">
                <AkkordeonKarte
                  titel="Allgemeine Daten & Ziel"
                  offen={basisOffen}
                  onUmschalten={() => setBasisOffen((v) => !v)}
                  symbol={<User className="h-4 w-4 text-ui-schiefer" aria-hidden />}
                >
                  <Basisdaten
                    ergebnis={ergebnis ?? null}
                    onEhepartnerDialog={() => setEhepartnerDialog(true)}
                    onAssistent={() => setEingabeArt('assistent')}
                  />
                </AkkordeonKarte>
              </div>

              <div className="lg:col-span-6">
                <Karte titel="Bestehende Vorsorge">
                  {/* Wie im Assistenten: „keine Vertraege“ ist eine Antwort, die man geben muss. */}
                  {szenario.vertraege.length === 0 && offenePfade(szenario).includes('vertraege') && (
                    <button type="button" onClick={() => pruefen('vertraege')} className={`mb-5 ${KNOPF_ZWEIT}`}>
                      <Check className="h-4 w-4" aria-hidden /> Keine bestehenden Verträge
                    </button>
                  )}
                  {schichten}
                </Karte>
              </div>
            </div>
            )}
            {/* Im Assistenten fuehrt dessen eigener letzter Knopf weiter. */}
            {eingabeArt === 'formular' && (
              <JourneyWeiter etappen={ETAPPEN} aktiv={schritt} onWechsel={geheZu} weiterText="Zum Ergebnis" />
            )}
          </>
        )}

        {/* ---------- 2. ERGEBNIS ---------- */}
        {schritt === 'ergebnis' && (
          <>
            {/*
              DER EINSTIEG WIE IN SCHRITT 3 DER BERATUNG: die Luecke als
              Aussage im Titel, daneben der Schalter fuer das Geld, in dem
              gerechnet wird. Ohne Ergebnis der ruhige Titel.
            */}
            {ergebnis
              ? <ErgebnisKopf zeile={zeile} kaufkraftHeute={kaufkraftHeute} onKaufkraftHeute={setKaufkraftHeute} />
              : (
                <EtappenKopf
                  titel="Ihr Ergebnis"
                  text="Was Ihnen im Ruhestand netto bleibt — nach Steuern und Krankenversicherung — und wie groß die Lücke zu Ihrem Ziel ist."
                />
              )}
            {/* Was die Zahlen darunter bestimmt — wessen Fall, welches Jahr — steht vor ihnen. */}
            {(paarUmschalter || jahrRegler) && (
              <div className="grid gap-5 sm:gap-6 lg:grid-cols-2">
                {paarUmschalter}
                {jahrRegler}
              </div>
            )}
            {beispielHinweis}
            {ergebnis ? (
              <div className="grid grid-cols-1 gap-5 sm:gap-6 lg:grid-cols-12">
                {/* flex + gap statt space-y: Ein ausgeblendetes Kind bekaeme
                    sonst trotzdem seinen Abstand, und die Spalten begannen
                    nicht auf einer Hoehe. */}
                <div className="flex flex-col gap-5 sm:gap-6 lg:col-span-5">
                  {/* Das eine schwebende Stueck der Etappe: Ring, Netto, Luecke und der Kernsatz. */}
                  <ErgebnisRing zeile={zeile} kaufkraftHeute={kaufkraftHeute} />
                  {/*
                    DIE ZAHLEN FUER DAS GESPRAECH: links unter dem Ring, was die
                    Luecke bedeutet; rechts die Aufstellung (Kassenbon oder
                    Verlauf) und darunter Luecke und Kaufkraftverlust in Euro
                    — so stehen beide Spalten ungefaehr gleich hoch. Nicht
                    mitlaufend (sticky): Die Karten sind hoeher als der
                    Bildschirm.
                  */}
                  <LueckeBedeutung
                    zeile={zeile}
                    kaufkraftHeute={kaufkraftHeute}
                    onSparen={() => geheZu('sparen')}
                    nettoHeute={nettoHeute}
                  />
                  <SteuerEngine ergebnis={ergebnis} zeile={zeile} faktor={faktor} />
                  {/*
                    Die Praemie im Ruhestand ist fuer einen privat Versicherten
                    oft der groesste einzelne Posten der Luecke. Bei gesetzlich
                    Versicherten faellt der Block stillschweigend weg.
                  */}
                  <PkvRechner zeile={zeile} />
                </div>
                <div className="flex flex-col gap-5 sm:gap-6 lg:col-span-7">
                  {/* Zwei Ansichten derselben Zahlen — als Pillen wie die Reiter der Beratung.
                      Die Huelle haelt sie so breit wie ihr Inhalt; die Spalte zoege sie sonst auf volle Breite. */}
                  <div>
                  <Pillen
                    reiter={[
                      { id: 'kassenbon' as const, inhalt: <span className="inline-flex items-center gap-1.5"><List className="h-4 w-4" aria-hidden /> Kassenbon</span> },
                      { id: 'verlauf' as const, inhalt: <span className="inline-flex items-center gap-1.5"><TrendingUp className="h-4 w-4" aria-hidden /> Verlauf</span> },
                    ]}
                    aktiv={ansicht}
                    onWechsel={setAnsicht}
                    beschriftung="Aufstellung oder Verlauf"
                    kennung={(id) => ({ reiter: `ansicht-reiter-${id}`, bereich: `ansicht-${id}` })}
                  />
                  </div>

                  {/*
                    Der Schalter „Nominal | Kaufkraft heute“ steht im Titel und
                    in der Fussleiste; der Kassenbon nennt nur, in welchem Geld
                    er rechnet — ein dritter Schalter waere einer zu viel.
                  */}
                  <div id="ansicht-kassenbon" role="tabpanel" aria-labelledby="ansicht-reiter-kassenbon"
                    className={ansicht === 'kassenbon' ? 'block' : 'hidden'}>
                    <Kassenbon
                      ergebnis={ergebnis}
                      zeile={zeile}
                      szenario={ansichtSzenario}
                      kaufkraftHeute={kaufkraftHeute}
                      person={einzeln ? personNameAus(szenario.personen, wer) : undefined}
                    />
                  </div>
                  <div id="ansicht-verlauf" role="tabpanel" aria-labelledby="ansicht-reiter-verlauf"
                    className={ansicht === 'verlauf' ? 'block' : 'hidden'}>
                    <Verlauf ergebnis={ergebnis} kaufkraftHeute={kaufkraftHeute} />
                  </div>

                  <KaufkraftKarte
                    zeile={zeile}
                    inflation={szenario.annahmen.inflation}
                    standard={offenePfade(szenario).includes('annahmen.inflation')}
                  />
                  <Rechtsstand
                    ergebnis={ergebnis}
                    tarifIndex={szenario.annahmen.tarifIndex}
                    rentendynamik={szenario.annahmen.rentendynamik}
                    inflation={szenario.annahmen.inflation}
                  />
                </div>
              </div>
            ) : rechnetText}
            <JourneyWeiter
              etappen={ETAPPEN} aktiv={schritt} onWechsel={geheZu}
              weiterText={luecke > 0 ? 'Was kostet es, die Lücke zu schließen?' : undefined}
            />
          </>
        )}

        {/* ---------- 3. SPARRECHNER ---------- */}
        {schritt === 'sparen' && (
          <>
            {/*
              Der Titel sagt, was der Sparrechner darunter ausrechnet: den
              Beitrag ab heute — er folgt seinen Annahmen. Ohne Luecke oder
              Ergebnis der ruhige Titel.
            */}
            <EtappenKopf
              titel={ergebnis && luecke > 0 && sparrate !== null
                ? <>Mit <span className="whitespace-nowrap tabular-nums"><Hervor>{euro(sparrate)}</Hervor></span> im Monat schließen Sie die Lücke</>
                : 'Die Lücke schließen'}
              text="Wie viel Sie ab heute monatlich zurücklegen müssten, damit die Versorgungslücke geschlossen ist — und was es kostet, damit zu warten."
            />
            {paarUmschalter}
            {beispielHinweis}
            {ergebnis
              ? <Sparrechner zeile={zeile} onStartbeitrag={setSparrate} nettoHeute={nettoHeute} />
              : rechnetText}
            <JourneyWeiter etappen={ETAPPEN} aktiv={schritt} onWechsel={geheZu} weiterText="Womit? Lösungen vergleichen" />
          </>
        )}

        {/* ---------- 4. VERTRAGS-TUEV & LOESUNGEN ---------- */}
        {schritt === 'loesungen' && (
          <>
            <EtappenKopf
              titel="Vertrags-TÜV & Lösungen"
              text="Was bestehende Verträge wirklich leisten — und was aus jedem Euro wird, den Sie neu in die Altersvorsorge stecken."
            />
            {paarUmschalter}
            {beispielHinweis}
            {/*
              ZWEI FRAGEN in dieser Etappe: Womit schliesse ich die Luecke
              (neue Loesungen und Angebote) — und taugt, was ich schon habe
              (bestehende Vertraege)? Die erste ist die der Beratung, die
              zweite die Pruefung auf Wunsch.
            */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <Reiterleiste
                reiter={[
                  { id: 'loesungen' as const, text: 'Lösungen & Angebote' },
                  { id: 'tuev' as const, text: 'Bestehende Verträge prüfen' },
                ]}
                aktiv={tuevReiter}
                onWechsel={setTuevReiter}
                beschriftung="Lösungen oder bestehende Verträge"
              />
            </div>
            {tuevReiter === 'loesungen' ? (
              <Loesungen zeile={ergebnis ? zeile : null} szenario={ansichtSzenario} sparrate={sparrate} nettoHeute={nettoHeute} />
            ) : (
              <div className="-mx-4 sm:-mx-6">
                <VertragsTuev ergebnis={ergebnis ?? null} szenario={ansichtSzenario} />
              </div>
            )}
            <JourneyWeiter etappen={ETAPPEN} aktiv={schritt} onWechsel={geheZu} />
          </>
        )}

        {/* Nur waehrend gerechnet wird. „berechnet in 6 ms“ war ein Hinweis
            fuer Entwickler — fuer Berater Rauschen unter jeder Seite. */}
        <p className="min-h-[1rem] text-right text-xs text-ui-schiefer print:hidden" aria-live="polite">
          {rechnet ? 'rechnet …' : ''}
        </p>
      </main>

      <EhepartnerDialog offen={ehepartnerDialog} onSchliessen={() => setEhepartnerDialog(false)} />

      <Dialog
        offen={kontoOffen}
        titel="Ihr Konto"
        beschreibung="Pläne speichern und laden — mit allen Etappen, auch den Angeboten."
        onSchliessen={schliesseKonto}
      >
        <Konto />
      </Dialog>

      {checkMoeglich && (
        <Dialog
          offen={auftrittOffen}
          titel="Ihr Auftritt im Gutachten"
          beschreibung="Logo, Name und Kontakt auf dem Deckblatt und in der Fußzeile jeder Seite."
          onSchliessen={schliesseAuftritt}
        >
          <AuftrittFenster anmeldeAdresse={angemeldet} />
        </Dialog>
      )}

      <Dialog offen={druckFrage !== null} titel="Noch Beispielwerte im Fall" onSchliessen={schliesseDruckFrage}>
        <p className="text-sm leading-relaxed text-ui-tinte/80">
          Diese Angaben sind noch Beispielwerte: <strong className="font-medium text-ui-tinte">{offeneBeispielTexte.join(', ')}</strong>. Im
          Gutachten stehen sie gekennzeichnet.
        </p>
        {/* Zwei gleichwertige Knoepfe: Drucken darf man trotzdem. */}
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => { setDruckFrage(null); setBasisOffen(true); geheZu('daten'); }}
            className={KNOPF_ZWEIT}
          >
            Angaben prüfen
          </button>
          <button
            type="button"
            onClick={() => { const u = druckFrage; setDruckFrage(null); if (u) druckeJetzt(u); }}
            className={KNOPF_ZWEIT}
          >
            Trotzdem drucken
          </button>
        </div>
      </Dialog>

      {checkMoeglich && (
        <Dialog offen={checkOffen} titel="Vorsorge-Check an Kunden senden" onSchliessen={schliesseCheck}>
          <CheckAnfragen
            /* Die uebernommenen Angaben stehen in der ersten Etappe — dorthin. */
            onUebernommen={() => geheZu('daten')}
            onKonto={() => { setCheckOffen(false); setKontoOffen(true); }}
          />
        </Dialog>
      )}

      <Seitenleiste offen={leisteOffen} onSchliessen={schliesseLeiste} abschnitte={abschnitte} werkzeuge={werkzeuge} />

      <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs text-ui-schiefer print:hidden sm:px-6">
        <p>
          Modellrechnung ohne Gewähr. Keine Steuer-, Renten- oder Anlageberatung. Die Berechnung läuft
          vollständig in Ihrem Browser — ohne Anmeldung verlassen Ihre Eingaben dieses Gerät nicht.
        </p>
        <RechtsLinks klasse="mt-2" />
      </footer>

      {/*
        FESTE FUSSLEISTE — in Schritt 1 erst, wenn keine Beispielwerte mehr
        offen sind. Vorher rechnete sie mit dem Musterfall und zeigte schon
        beim ersten Feld eine rote Luecke, die mit dem Mandanten nichts zu
        tun hat; am Telefon lag sie dazu ueber den Feldern. In den
        rechnenden Etappen bleibt sie, dort sagt `beispielHinweis`, womit
        gerechnet wird.
      */}
      {zeile && !(schritt === 'daten' && offeneBeispielTexte.length > 0) && (
        /*
          Hell wie die Karten, mit Haarlinie und einem leichten Schatten nach
          oben. Die Luecke steht als einzige Kachel dunkel — hervorgehoben
          durch Tinte, nicht durch Rot oder Gruen; „Gedeckt“ steht in
          derselben Kachel.
        */
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-ui-linie bg-ui-karte shadow-[0_-4px_16px_rgba(0,0,0,0.05)] print:hidden">
          {/*
            Die Rechenzeichen "−" und "=" entfallen auf dem Telefon. Sie
            erklaeren einen Zusammenhang, den die drei Zahlen von links nach
            rechts ohnehin erzaehlen, und kosten dort Breite, die den
            Beschriftungen fehlt.
          */}
          {/* Ab der kleinen Breite stehen die Zahlen dicht als Rechnung beieinander, der Schalter rechts. */}
          <div className="mx-auto max-w-6xl px-4 py-2 sm:px-6 sm:py-3">
            <div className="flex items-center gap-2 sm:gap-4 lg:gap-6">
              <LeistenZahl etikett="Zielbedarf" wert={euro(zeile.zielNettoMonat * faktor)} />
              <span aria-hidden className="hidden text-lg text-ui-asche sm:block">−</span>
              <LeistenZahl
                // Bis zur mittleren Breite kurz, sonst bricht die Beschriftung um und die Leiste wird hoeher.
                etikett={<><span className="md:hidden">Netto</span><span className="hidden md:inline">Gesamt-Netto</span></>}
                wert={euro(zeile.nettoMonat * faktor)}
              />
              <span aria-hidden className="hidden text-lg text-ui-asche sm:block">=</span>
              <LeistenZahl
                dunkel
                etikett={<><span className="md:hidden">Lücke</span><span className="hidden md:inline">Versorgungslücke</span></>}
                wert={luecke > 0 ? euro(luecke * faktor) : 'Gedeckt'}
              />

              {/* In derselben Zeile wie die Zahlen, damit die Leiste nicht
                  hoeher wird: breit mit Worten, sonst nur das Symbol. */}
              <KaufkraftSchalter wert={kaufkraftHeute} onChange={setKaufkraftHeute} kompakt klasse="md:hidden sm:ml-auto" />
              <KaufkraftSchalter wert={kaufkraftHeute} onChange={setKaufkraftHeute} klasse="hidden md:ml-auto md:inline-flex" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
