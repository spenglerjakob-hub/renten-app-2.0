import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Download, FolderOpen,
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
import { AkkordeonKarte, euro, TON } from './components/Feld';

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
      className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50/40 sm:px-4 sm:py-3"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">{symbol}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-slate-900">{titel}</span>
        <span className="block text-xs leading-snug text-slate-500">{text}</span>
        {/* Auf dem Telefon unter dem Text — rechts daneben bliebe dem Titel zu wenig Breite. */}
        {marke && (
          <span className="mt-1 inline-block rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white sm:hidden">{marke}</span>
        )}
      </span>
      {marke && (
        <span className="hidden shrink-0 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white sm:inline-block">{marke}</span>
      )}
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
    </button>
  );
}

/** Ueberschrift einer Etappe: Nummer, Titel, ein Satz, worum es geht. */
function EtappenKopf({ nr, titel, text }: { nr: number; titel: string; text: string }) {
  return (
    <div className="px-1">
      <h2 className="text-lg font-black tracking-tight text-slate-900 sm:text-2xl">
        <span className="text-indigo-600">{nr}.</span> {titel}
      </h2>
      <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-600 sm:text-sm">{text}</p>
    </div>
  );
}

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
 * Kleine Auswahl in der dunklen Kopfleiste.
 *
 * `standard`: Der Wert ist noch die Vorbelegung — dann steht „Standard“
 * dabei, mit der Begruendung im Tooltip (siehe `features/vorbelegung.ts`).
 */
/*
  Die Annahmen im Kopf sind Einstellungen, keine Ergebnisse — deshalb
  neutral. Gruen und Indigo als Flaechen zogen den Blick staerker an als die
  Versorgungsluecke selbst.
*/
function KopfAuswahl({
  titel, wert, onChange, standard,
}: { titel: string; wert: number; onChange: (n: number) => void; standard?: string }) {
  return (
    <span
      title={standard}
      className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-slate-400"
    >
      <span>{titel}</span>
      <select
        value={wert}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`${titel} pro Jahr${standard ? ' (Standardwert, anpassbar)' : ''}`}
        className="cursor-pointer rounded bg-slate-700 px-1 font-bold text-white outline-none hover:bg-slate-600"
      >
        {QUOTEN.map((q) => (
          <option key={q} value={q} className="text-slate-900">
            {(q * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %
          </option>
        ))}
      </select>
      {/* Zwischen md und xl steht die Kopfleiste einzeilig und knapp — dort traegt nur der Tooltip die Marke. */}
      {standard && <span aria-hidden className="text-xs font-normal text-slate-500 md:hidden xl:inline">Standard</span>}
    </span>
  );
}

/**
 * EIN Druckknopf mit Auswahl statt zweier roter Knoepfe. Rot ist auf dieser
 * Seite der Versorgungsluecke vorbehalten; zwei rote Druckknoepfe waren das
 * Lauteste im ganzen Kopf.
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
  const eintrag = 'block w-full rounded-md px-3 py-2 text-left hover:bg-slate-100 focus-visible:bg-slate-100';

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
          className="rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-300 hover:bg-slate-700"
        >
          <Printer className="h-4 w-4" aria-hidden />
        </button>
      ) : (
      <button
        type="button"
        onClick={() => setOffen((v) => !v)}
        aria-expanded={offen}
        aria-controls={menueId}
        className="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-indigo-500 sm:flex-none"
      >
        <Printer className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="sm:hidden">Drucken</span><span className="hidden sm:inline">Gutachten drucken</span>
        <ChevronDown className="h-3 w-3 shrink-0" aria-hidden />
      </button>
      )}
      {offen && (
        <div
          id={menueId}
          className="absolute right-0 top-full z-50 mt-1.5 w-64 rounded-lg border border-slate-200 bg-white p-1 text-sm text-slate-800 shadow-lg"
        >
          {/*
            Zwei Umfaenge: die Kurzfassung fuer das Gespraech (Deckblatt,
            Angaben, Renteneinkuenfte, Vorbehalt), die ausfuehrliche zum
            Mitgeben. Ein Dokument mit Namen darauf fuehrt den Vorbehalt
            in beiden Faellen mit.
          */}
          <button type="button" className={eintrag} onClick={() => wahl('kurz')}>
            <span className="block font-semibold">Kurzfassung</span>
            <span className="block text-xs text-slate-500">Für das Gespräch: Angaben und Renteneinkünfte</span>
          </button>
          <button type="button" className={eintrag} onClick={() => wahl('ausfuehrlich')}>
            <span className="block font-semibold">Ausführlich</span>
            <span className="block text-xs text-slate-500">Zum Mitgeben: alle Abschnitte des Gutachtens</span>
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
    Szenario uebergeben, folgen Kopfzahlen, Kassenbon, Verlauf, Steuer-Engine,
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
  */
  const beispielHinweis = offeneBeispielTexte.length > 0 && (
    <div role="status" className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 print:hidden sm:text-sm">
      <span>
        Das Ergebnis rechnet noch mit {offeneBeispielTexte.length === 1 ? 'einem Beispielwert' : `${offeneBeispielTexte.length} Beispielwerten`}:{' '}
        {offeneBeispielTexte.join(', ')}.
      </span>
      <button type="button" onClick={() => { setBasisOffen(true); geheZu('daten'); }} className="font-bold underline">
        Zu den Angaben
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
    rechnet, weil er alles darunter betrifft: Kopfzahlen, Kassenbon, Verlauf,
    Steuer, Sparrechner, Vertrags-Pruefung und den Ausdruck. Gerechnet wird
    dafuer nicht anders, sondern ein anderes Szenario.
  */
  const paarUmschalter = paar && (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm print:hidden">
      <Reiterleiste
        reiter={[
          { id: 'haushalt' as const, text: 'Gesamt' },
          { id: 'einzeln' as const, text: 'Einzeln' },
        ]}
        aktiv={betrachtung}
        onWechsel={setBetrachtung}
        beschriftung="Haushalt oder einzelne Person"
      />
      {betrachtung === 'einzeln' && (
        <Reiterleiste
          reiter={szenario.personen
            .filter((p) => p.id === 'A' || szenario.haushalt.verheiratet)
            .map((p) => ({ id: p.id, text: personName(p) }))}
          aktiv={wer}
          onWechsel={setWer}
          beschriftung="Welche Person"
        />
      )}
      <p className="px-3 py-2 text-xs leading-relaxed text-slate-500">
        {betrachtung === 'einzeln'
          ? `Nur die Verträge und Einkünfte von ${personNameAus(szenario.personen, wer)} — allein veranlagt, mit Grundtarif statt Splitting.`
          : 'Beide Partner zusammen, wie bisher: eine Veranlagung mit Splittingtarif.'}
      </p>
    </div>
  );

  const kopfzahlen = (
    <div className="grid grid-cols-2 gap-3 sm:gap-4">
      <div className="flex flex-col justify-center rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-6">
        <h3 className="mb-0.5 text-xs font-semibold leading-tight text-slate-500 sm:mb-1 sm:text-sm">
          Bedarf im Jahr {zeile.jahr}
        </h3>
        <p className="text-lg font-bold tabular-nums sm:text-3xl">
          {euro(zeile.zielNettoMonat * faktor)}
        </p>
      </div>
      <div
        className={`flex flex-col justify-center rounded-xl border bg-white p-3 shadow-sm sm:p-6 ${
          luecke > 0 ? 'border-rose-200 text-rose-600' : 'border-emerald-200 text-emerald-600'
        }`}
      >
        <h3 className="mb-0.5 text-xs font-semibold leading-tight sm:mb-1 sm:text-sm">
          Versorgungslücke
        </h3>
        <p className="text-lg font-bold tabular-nums sm:text-3xl">
          {luecke > 0 ? euro(luecke * faktor) : 'Gedeckt'}
        </p>
      </div>
    </div>
  );

  /*
    DAS JAHR DER UEBERSICHT, verstellbar — aber nur bei Paaren. Bei einer
    Person faellt der erste mit dem einzigen Rentenbeginn zusammen; ein Regler
    haette dort nichts zu zeigen ausser spaeteren Jahren derselben Rente.
  */
  const jahrRegler = paar && !einzeln && ersterRuhestand !== null && zeilenAbRuhestand.length > 1 && (
    <div className="rounded-lg border border-slate-200 bg-white p-2.5 print:hidden sm:p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          Angezeigtes Jahr
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setJahrWahl(Math.max(ersterRuhestand, (gezeigtesJahr ?? ersterRuhestand) - 1))}
            aria-label="Ein Jahr zurück"
            className="rounded border border-slate-200 p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
            disabled={(gezeigtesJahr ?? ersterRuhestand) <= ersterRuhestand}
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          </button>
          <span className="min-w-[3.5rem] text-center text-sm font-black tabular-nums text-slate-900">
            {zeile.jahr}
          </span>
          <button
            type="button"
            onClick={() => setJahrWahl(Math.min(
              zeilenAbRuhestand[zeilenAbRuhestand.length - 1]!.jahr,
              (gezeigtesJahr ?? ersterRuhestand) + 1,
            ))}
            aria-label="Ein Jahr vor"
            className="rounded border border-slate-200 p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
            disabled={(gezeigtesJahr ?? ersterRuhestand)
              >= zeilenAbRuhestand[zeilenAbRuhestand.length - 1]!.jahr}
          >
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>
      <input
        type="range"
        min={ersterRuhestand}
        max={zeilenAbRuhestand[zeilenAbRuhestand.length - 1]!.jahr}
        step={1}
        value={gezeigtesJahr ?? ersterRuhestand}
        onChange={(e) => setJahrWahl(Number(e.target.value))}
        aria-label="Jahr der Übersicht"
        className="mt-2 w-full accent-indigo-600"
      />
      {/* Ohne diesen Satz wirkt das hohe Netto einer gemischten Phase wie
          ein Rechenfehler: Da laeuft noch ein Gehalt. */}
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        {zeile.gemischtePhase
          ? 'Ein Partner arbeitet noch — im Netto steckt daher weiter ein Gehalt.'
          : 'Beide im Ruhestand.'}
      </p>
    </div>
  );

  const schichten = (
    <section id="vertraege" className={`scroll-mt-28 overflow-hidden rounded-xl border shadow-sm ${TON.eingabe}`}>
      <Reiterleiste
        reiter={REITER}
        aktiv={reiter}
        onWechsel={setReiter}
        beschriftung="Versorgungsschichten"
      />
      {/* Kein eigener Grundton: die Flaeche traegt den der Karte, damit
          die weissen Vertragskarten darauf hervortreten. */}
      <div className="min-h-[300px] p-3 sm:min-h-[400px] sm:p-4">
        {reiter === 's1' && <Vertraege schicht={1} depots={ergebnis?.depots ?? []} auszahlungen={ergebnis?.kapitalauszahlungen ?? []} avdLaeufe={ergebnis?.avd ?? []} verrentungen={ergebnis?.verrentungen ?? []} />}
        {reiter === 's2' && <Vertraege schicht={2} depots={ergebnis?.depots ?? []} auszahlungen={ergebnis?.kapitalauszahlungen ?? []} avdLaeufe={ergebnis?.avd ?? []} verrentungen={ergebnis?.verrentungen ?? []} />}
        {reiter === 's3' && <Vertraege schicht={3} depots={ergebnis?.depots ?? []} auszahlungen={ergebnis?.kapitalauszahlungen ?? []} avdLaeufe={ergebnis?.avd ?? []} verrentungen={ergebnis?.verrentungen ?? []} />}
        {reiter === 'planer' && <Planer ergebnis={ergebnis?.planer ?? null} />}
      </div>
    </section>
  );

  const rechnetText = (
    <p className="rounded-lg bg-white px-4 py-8 text-center text-sm text-slate-500">
      Berechnung läuft …
    </p>
  );

  return (
    /*
      Grauer Seitengrund wie auf der Landingpage (`avd/Seite.tsx`), nicht
      fast-weiss. Er ist die Voraussetzung dafuer, dass die Farbtrennung
      ueberhaupt traegt: erst gegen ein graues Blatt heben sich die weissen
      Ergebniskarten rechts UND der getoente Eingabegrund links ab. Auf
      `slate-50` verschwammen beide mit der Seite.
    */
    <div className="min-h-screen bg-slate-100 pb-24 text-slate-800 sm:pb-36 print:pb-0">
      {/* KOPFZEILE */}
      <header
        className={`sticky top-0 z-50 bg-slate-900 text-white shadow-md transition-all print:hidden ${
          kopfEingeklappt ? 'py-2 sm:py-3' : 'p-2 sm:p-4'
        }`}
      >
        <div
          className={`relative mx-auto flex min-h-[40px] max-w-6xl px-1 sm:px-0 ${
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
          <div className={`flex items-center md:shrink-0 ${kopfEingeklappt ? 'w-full justify-between gap-2' : 'w-full justify-between md:w-auto md:gap-3'}`}>
            <div className="flex shrink-0 items-center gap-2 sm:gap-4">
              {/* Uebersicht ueber alle Seiten — auch bei eingeklappter Kopfleiste da. */}
              <button
                type="button"
                onClick={() => setLeisteOffen(true)}
                aria-expanded={leisteOffen}
                aria-label={neueEingaenge > 0
                  ? `Übersicht aller Seiten öffnen — ${neueEingaenge} Vorsorge-Check${neueEingaenge > 1 ? 's' : ''} eingegangen`
                  : 'Übersicht aller Seiten öffnen'}
                className="relative flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 p-2 text-xs font-bold text-slate-300 hover:bg-slate-700 hover:text-white"
              >
                <PanelLeft className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Seiten</span>
                {/* Ein Kunde hat geantwortet — sichtbar auch bei eingeklappter Kopfzeile. */}
                {neueEingaenge > 0 && (
                  <span
                    aria-hidden
                    className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-black leading-none text-white ring-2 ring-slate-900"
                  >
                    {neueEingaenge}
                  </span>
                )}
              </button>
              <Logo dunkel klasse={kopfEingeklappt ? 'h-8 w-8 sm:h-10 sm:w-10' : 'h-10 w-10 sm:h-14 sm:w-14'} />
              <div className="text-left">
                <h1 className={`font-extrabold leading-tight tracking-tight ${kopfEingeklappt ? 'text-base sm:text-xl' : 'text-lg sm:text-2xl'}`}>
                  JS-Rentenplaner
                </h1>
                <p className={`mt-0.5 font-medium text-slate-400 ${kopfEingeklappt ? 'hidden text-xs sm:block' : 'text-xs'}`}>
                  Ihre Zukunft. Smart geplant.
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setKontoOffen(true)}
                aria-label={angemeldet ? `Konto — angemeldet als ${angemeldet}` : 'Konto — Pläne speichern und laden'}
                title={angemeldet ? `Angemeldet als ${angemeldet}` : 'Konto'}
                className={`relative rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-300 hover:bg-slate-700 ${kopfEingeklappt ? '' : 'md:hidden'}`}
              >
                <Wallet className="h-4 w-4" aria-hidden />
                {angemeldet && <span aria-hidden className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-slate-900" />}
              </button>
              {kopfEingeklappt && <DruckMenue onDrucke={drucke} kompakt />}
              {!kopfEingeklappt && (
                <button
                  type="button"
                  onClick={() => setMenueOffen((v) => !v)}
                  aria-expanded={menueOffen}
                  className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 p-2 text-xs font-bold text-slate-300 hover:bg-slate-700 md:hidden"
                >
                  <Settings className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Menü</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setKopfEingeklappt((v) => !v)}
                aria-expanded={!kopfEingeklappt}
                title={kopfEingeklappt ? 'Kopfzeile ausklappen' : 'Kopfzeile einklappen'}
                className="rounded-full border border-slate-700 bg-slate-800 p-2 text-slate-300 shadow-sm hover:bg-slate-700 hover:text-white"
              >
                {kopfEingeklappt
                  ? <ChevronDown className="h-4 w-4" aria-hidden />
                  : <ChevronUp className="h-4 w-4" aria-hidden />}
              </button>
            </div>
          </div>

          {!kopfEingeklappt && (
            <div className={`${menueOffen ? 'flex' : 'hidden'} mt-3 w-full flex-col items-stretch gap-2 md:mt-0 md:flex md:w-auto md:flex-row md:items-center`}>
              <div className="flex flex-wrap justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 p-1.5">
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

              <div className="flex flex-wrap items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 p-1.5">
                <input ref={dateiRef} type="file" accept=".json" onChange={importieren} className="hidden" />
                <button
                  type="button"
                  onClick={() => setKontoOffen(true)}
                  title={angemeldet ? `Angemeldet als ${angemeldet}` : 'Pläne speichern und laden'}
                  className="hidden items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700 hover:text-white md:flex"
                >
                  <Wallet className="h-3.5 w-3.5 shrink-0" aria-hidden /> Konto
                  {angemeldet && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                </button>
                <button
                  type="button"
                  onClick={() => dateiRef.current?.click()}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-700 hover:text-white sm:flex-none"
                >
                  <FolderOpen className="h-3.5 w-3.5 shrink-0" aria-hidden /> Laden
                </button>
                <button
                  type="button"
                  onClick={exportieren}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-700 hover:text-white sm:flex-none"
                >
                  <Download className="h-3.5 w-3.5 shrink-0" aria-hidden /> Speichern
                </button>
                <DruckMenue onDrucke={drucke} />
                <button
                  type="button"
                  onClick={zuruecksetzen}
                  aria-label="Alle Eingaben zurücksetzen"
                  className="rounded-md p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white"
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
        <div
          role="status"
          className={`mx-auto mt-3 max-w-6xl rounded-lg px-4 py-3 text-sm print:hidden ${
            importMeldung.art === 'ok' ? 'bg-emerald-50 text-emerald-900' : 'bg-rose-50 text-rose-900'
          }`}
        >
          <strong>{importMeldung.art === 'ok' ? 'Geladen.' : 'Datei konnte nicht geladen werden.'}</strong>
          <ul className="mt-1 list-inside list-disc">
            {importMeldung.texte.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>
      )}

      <main id="journey" className="mx-auto max-w-6xl scroll-mt-28 space-y-4 p-2 sm:space-y-6 sm:p-6 print:hidden">
        {musterfall && (
          <div role="status" className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm leading-relaxed text-indigo-950">
            <p>
              <strong>Musterfall aus der Schnellrechnung übernehmen?</strong>{' '}
              {musterfall.kurz && <>({musterfall.kurz}) </>}
              Ihr aktueller Fall in diesem Browser wird dabei ersetzt — sichern Sie ihn vorher im Konto, wenn Sie
              ihn behalten möchten.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => musterfallLaden(musterfall)}
                className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-sm font-bold text-indigo-800 hover:bg-indigo-100">
                Übernehmen
              </button>
              <button type="button" onClick={() => { musterfallVerwerfen(); setMusterfall(null); }}
                className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-sm font-bold text-indigo-800 hover:bg-indigo-100">
                Verwerfen
              </button>
            </div>
          </div>
        )}
        {auftrittBand && (auftrittBand === 'uebernommen' || auftrittLokal) && (
          <div role="status" className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm leading-relaxed text-indigo-950">
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
            <div className="mt-2 flex flex-wrap gap-2">
              {auftrittBand === 'uebernommen' ? (
                <>
                  <button type="button" onClick={() => { setAuftrittBand(null); setAuftrittOffen(true); }}
                    className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-sm font-bold text-indigo-800 hover:bg-indigo-100">
                    Auftritt ansehen
                  </button>
                  <button type="button" onClick={() => setAuftrittBand(null)}
                    className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-sm font-bold text-indigo-800 hover:bg-indigo-100">
                    Schließen
                  </button>
                </>
              ) : (
                <>
                  <button type="button"
                    onClick={() => { if (auftrittLokal) void auftrittUebernehmen(auftrittLokal).then((ok) => setAuftrittBand(ok ? 'uebernommen' : 'fehler')); }}
                    className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-sm font-bold text-indigo-800 hover:bg-indigo-100">
                    Übernehmen
                  </button>
                  <button type="button" onClick={() => { auftrittLokalVerwerfen(); setAuftrittLokal(null); setAuftrittBand(null); }}
                    className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-sm font-bold text-indigo-800 hover:bg-indigo-100">
                    Verwerfen
                  </button>
                </>
              )}
            </div>
          </div>
        )}
        <JourneyLeiste etappen={ETAPPEN} aktiv={schritt} onWechsel={geheZu} erledigt={etappeErledigt} />
        <FallFortschritt schritte={fallSchritte} onSprung={springeZu} />

        {fehler && (
          <div role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-900">
            Die Berechnung ist fehlgeschlagen: {fehler}
          </div>
        )}

        {hinweise.length > 0 && schritt !== 'daten' && (
          <div role="status" className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <ul className="list-inside list-disc space-y-1">
              {hinweise.map((h, i) => <li key={i}>{h}</li>)}
            </ul>
          </div>
        )}

        {/* ---------- 1. DATEN & ZIEL ---------- */}
        {schritt === 'daten' && (
          <>
            <EtappenKopf
              nr={1}
              titel="Ihre Daten und Ihr Ziel"
              text="Wer Sie sind, was Sie verdienen, was schon an Vorsorge da ist — und mit wie viel Geld im Monat Sie im Ruhestand leben möchten."
            />
            {/*
              LINKS die Angaben zur Person, RECHTS die Vertraege. Getoenter
              Grund mit kraeftigem Rand, wie auf der Seite zum
              Altersvorsorgedepot: Hier traegt man ein; die Ergebnisse stehen
              in den folgenden Etappen auf weissen Karten.
            */}
            {/*
              VORSORGE-CHECK am Anfang der Angaben — von dort kommen Faelle
              oft: die Angaben, die ein Kunde ueber seinen Link geschickt hat.
              In beiden Eingabearten. Das Konto steht im Kopf (oben rechts,
              wo man es sucht) — als Karte hier war es eine Ebene mehr vor
              dem ersten Eingabefeld.
            */}
            {checkMoeglich && (
              <div className="grid gap-2 sm:grid-cols-2 sm:gap-3 print:hidden">
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
            */}
            <div className="flex rounded-lg border border-slate-200 bg-slate-200/50 p-1 print:hidden" role="group" aria-label="Art der Eingabe">
              {([['assistent', 'Schritt für Schritt'], ['formular', 'Alle Angaben auf einen Blick']] as const).map(([id, text]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setEingabeArt(id)}
                  aria-pressed={eingabeArt === id}
                  className={`flex-1 rounded-md py-1.5 text-xs font-bold sm:py-2 ${
                    eingabeArt === id ? 'bg-white text-indigo-700 shadow' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {text}
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
            <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-12">
              <div id="eingaben" className="scroll-mt-28 lg:col-span-6">
                <AkkordeonKarte
                  titel="Allgemeine Daten & Ziel"
                  offen={basisOffen}
                  onUmschalten={() => setBasisOffen((v) => !v)}
                  symbol={<User className="h-4 w-4 text-indigo-400" aria-hidden />}
                  ton="eingabe"
                >
                  <Basisdaten
                    ergebnis={ergebnis ?? null}
                    onEhepartnerDialog={() => setEhepartnerDialog(true)}
                    onAssistent={() => setEingabeArt('assistent')}
                  />
                </AkkordeonKarte>
              </div>

              <div className="space-y-4 sm:space-y-6 lg:col-span-6">
                {/* Wie im Assistenten: „keine Vertraege“ ist eine Antwort, die man geben muss. */}
                {szenario.vertraege.length === 0 && offenePfade(szenario).includes('vertraege') && (
                  <button
                    type="button"
                    onClick={() => pruefen('vertraege')}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 sm:text-sm"
                  >
                    <Check className="h-4 w-4" aria-hidden /> Keine bestehenden Verträge
                  </button>
                )}
                {schichten}
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
            <EtappenKopf
              nr={2}
              titel="Ihr Ergebnis"
              text="Was Ihnen im Ruhestand netto bleibt — nach Steuern und Krankenversicherung — und wie groß die Lücke zu Ihrem Ziel ist."
            />
            {paarUmschalter}
            {beispielHinweis}
            {ergebnis ? (
              <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-12">
                {/* flex + gap statt space-y: Ein ausgeblendetes Kind bekaeme
                    sonst trotzdem seinen Abstand, und die Spalten begannen
                    nicht auf einer Hoehe. */}
                <div className="flex flex-col gap-4 sm:gap-6 lg:col-span-5">
                  {/* Am Telefon zuerst, am PC oben rechts (siehe dort). */}
                  <div className="lg:hidden">{kopfzahlen}</div>
                  <SteuerEngine ergebnis={ergebnis} zeile={zeile} faktor={faktor} />
                  {/*
                    Die Praemie im Ruhestand ist fuer einen privat Versicherten
                    oft der groesste einzelne Posten der Luecke. Bei gesetzlich
                    Versicherten faellt der Block stillschweigend weg.
                  */}
                  <PkvRechner zeile={zeile} />
                  {jahrRegler}
                  {/*
                    DIE ZAHLEN FUER DAS GESPRAECH, links untereinander: was die
                    Luecke bedeutet, darunter Luecke und Kaufkraftverlust in
                    Euro. Rechts steht die Aufstellung (Kassenbon oder
                    Verlauf). Am Telefon kommen beide vor dem Kassenbon.
                    Nicht mehr mitlaufend (sticky): Zusammen sind beide Karten
                    hoeher als der Bildschirm.
                  */}
                  <LueckeBedeutung
                    zeile={zeile}
                    kaufkraftHeute={kaufkraftHeute}
                    onSparen={() => geheZu('sparen')}
                    nettoHeute={nettoHeute}
                  />
                  <KaufkraftKarte
                    zeile={zeile}
                    inflation={szenario.annahmen.inflation}
                    standard={offenePfade(szenario).includes('annahmen.inflation')}
                  />
                </div>
                <div className="flex flex-col gap-4 sm:gap-6 lg:col-span-7">
                  {/*
                    Die Kopfzahlen am PC oben RECHTS: Links stehen schon
                    Steuer-Engine, Luecke und Kaufkraft — mit den Kennzahlen
                    dort war die linke Spalte fast doppelt so hoch wie die
                    rechte.
                  */}
                  <div className="hidden lg:block">{kopfzahlen}</div>
                  <div className="flex rounded border border-slate-200 bg-slate-200/50 p-1 print:hidden">
                    <button
                      type="button"
                      onClick={() => setAnsicht('kassenbon')}
                      aria-pressed={ansicht === 'kassenbon'}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded py-1.5 text-xs font-bold sm:gap-2 sm:py-2 ${
                        ansicht === 'kassenbon' ? 'bg-white shadow' : 'text-slate-500'
                      }`}
                    >
                      <List className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden /> Kassenbon
                    </button>
                    <button
                      type="button"
                      onClick={() => setAnsicht('verlauf')}
                      aria-pressed={ansicht === 'verlauf'}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded py-1.5 text-xs font-bold sm:gap-2 sm:py-2 ${
                        ansicht === 'verlauf' ? 'bg-white shadow' : 'text-slate-500'
                      }`}
                    >
                      <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden /> Verlauf
                    </button>
                  </div>

                  <div className={ansicht === 'kassenbon' ? 'block' : 'hidden'}>
                    <Kassenbon
                      ergebnis={ergebnis}
                      zeile={zeile}
                      szenario={ansichtSzenario}
                      kaufkraftHeute={kaufkraftHeute}
                      onKaufkraftHeute={setKaufkraftHeute}
                      person={einzeln ? personNameAus(szenario.personen, wer) : undefined}
                    />
                  </div>
                  <div className={ansicht === 'verlauf' ? 'block' : 'hidden'}>
                    <Verlauf ergebnis={ergebnis} kaufkraftHeute={kaufkraftHeute} />
                  </div>

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
            <EtappenKopf
              nr={3}
              titel="Die Lücke schließen"
              text="Wie viel Sie ab heute monatlich zurücklegen müssten, damit die Versorgungslücke geschlossen ist — und was es kostet, damit zu warten."
            />
            {paarUmschalter}
            {beispielHinweis}
            {ergebnis ? (
              <div className="space-y-4 sm:space-y-6">
                {kopfzahlen}
                <Sparrechner zeile={zeile} immerOffen onStartbeitrag={setSparrate} nettoHeute={nettoHeute} />
              </div>
            ) : rechnetText}
            <JourneyWeiter etappen={ETAPPEN} aktiv={schritt} onWechsel={geheZu} weiterText="Womit? Lösungen vergleichen" />
          </>
        )}

        {/* ---------- 4. VERTRAGS-TUEV & LOESUNGEN ---------- */}
        {schritt === 'loesungen' && (
          <>
            <EtappenKopf
              nr={4}
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
              <div className="-mx-2 sm:-mx-6">
                <VertragsTuev ergebnis={ergebnis ?? null} szenario={ansichtSzenario} />
              </div>
            )}
            <JourneyWeiter etappen={ETAPPEN} aktiv={schritt} onWechsel={geheZu} />
          </>
        )}

        {/* Nur waehrend gerechnet wird. „berechnet in 6 ms“ war ein Hinweis
            fuer Entwickler — fuer Berater Rauschen unter jeder Seite. */}
        <p className="min-h-[1rem] text-right text-xs text-slate-400 print:hidden" aria-live="polite">
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
        <p className="text-sm leading-relaxed text-slate-700">
          Diese Angaben sind noch Beispielwerte: <strong>{offeneBeispielTexte.join(', ')}</strong>. Im
          Gutachten stehen sie gekennzeichnet.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => { setDruckFrage(null); setBasisOffen(true); geheZu('daten'); }}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50"
          >
            Angaben prüfen
          </button>
          <button
            type="button"
            onClick={() => { const u = druckFrage; setDruckFrage(null); if (u) druckeJetzt(u); }}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50"
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

      <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs text-slate-500 print:hidden">
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
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-800 bg-slate-900 shadow-[0_-10px_20px_-5px_rgba(0,0,0,0.3)] print:hidden">
          {/*
            Die Rechenzeichen "−" und "=" entfallen auf dem Telefon. Sie
            erklaeren einen Zusammenhang, den die drei Kacheln von links nach
            rechts ohnehin erzaehlen, und kosten dort Breite, die den
            Beschriftungen fehlt.
          */}
          <div className="mx-auto max-w-6xl px-2 py-1.5 sm:px-4 sm:py-3">
            <div className="flex items-center justify-between gap-1.5 sm:gap-4">
              <div className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-1.5 py-1 text-center sm:p-2.5">
                <div className="mb-0.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 sm:mb-1 sm:text-xs">
                  Zielbedarf
                </div>
                <div className="text-base font-bold tabular-nums text-white sm:text-xl">
                  {euro(zeile.zielNettoMonat * faktor)}
                </div>
              </div>

              <div className="hidden font-black text-slate-500 sm:block sm:text-sm">−</div>

              <div className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-1.5 py-1 text-center sm:p-2.5">
                <div className="mb-0.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 sm:mb-1 sm:text-xs">
                  {/* Am Telefon kurz, sonst bricht die Kachel um und die Leiste wird hoeher. */}
                  <span className="sm:hidden">Netto</span><span className="hidden sm:inline">Gesamt-Netto</span>
                </div>
                <div className="text-base font-bold tabular-nums text-indigo-400 sm:text-xl">
                  {euro(zeile.nettoMonat * faktor)}
                </div>
              </div>

              <div className="hidden font-black text-slate-500 sm:block sm:text-sm">=</div>

              <div
                className={`flex-1 rounded-lg border px-1.5 py-1 text-center shadow-inner sm:p-2.5 ${
                  luecke > 0
                    ? 'border-rose-700/50 bg-rose-900/30 text-rose-400'
                    : 'border-emerald-700/50 bg-emerald-900/30 text-emerald-400'
                }`}
              >
                <div className={`mb-0.5 text-[11px] font-bold uppercase tracking-wider sm:mb-1 sm:text-xs ${luecke > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                  {/* Am Telefon kuerzer: Neben dem Kaufkraft-Symbol passt
                      „Versorgungsluecke“ nicht mehr in eine Zeile. */}
                  <span className="sm:hidden">Lücke</span><span className="hidden sm:inline">Versorgungslücke</span>
                </div>
                <div className="text-base font-black tabular-nums sm:text-xl">
                  {luecke > 0 ? euro(luecke * faktor) : 'Gedeckt'}
                </div>
              </div>

              {/* In derselben Zeile wie die Kacheln, damit die Leiste nicht
                  hoeher wird: am PC mit Worten, am Telefon nur das Symbol. */}
              <KaufkraftSchalter wert={kaufkraftHeute} onChange={setKaufkraftHeute} kompakt klasse="sm:hidden" />
              <KaufkraftSchalter
                wert={kaufkraftHeute} onChange={setKaufkraftHeute} ton="dunkel"
                klasse="hidden sm:inline-flex sm:flex-col sm:items-stretch"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
