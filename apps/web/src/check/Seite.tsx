import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowLeft, ArrowRight, Calculator, CheckCircle2, CircleDashed, ClipboardList, ExternalLink, FileText,
  Plus, Printer, Send, SkipForward, Trash2,
} from 'lucide-react';
import {
  BUNDESLAENDER, BESOLDUNGSGRUPPEN, parameterFuer, parseDatum, alterExakt, heute,
  schaetzeEntgeltpunkte, erwerbsBasisHeute, type VertragsTyp,
} from '@renten/engine';
import { exportiere } from '@renten/schema';
import { CHECK_CODE, codePruefen, einreichen, type CodeStatus } from '../lib/check';
import { Logo } from '../components/Logo';
import {
  ZahlFeld, ProzentFeld, DatumFeld, TextFeld, AuswahlFeld, Schalter, euro,
} from '../components/Feld';
import { KinderZeilen, KinderHinweis } from '../components/KinderFelder';
import { Dialog } from '../components/Dialog';
import { EinkommenFelder } from '../features/EinkommenFelder';
import { PkvFelder } from '../features/PkvFelder';
import { KRANKENKASSEN, KASSEN_STAND } from '../features/krankenkassen';
import {
  leereAntworten, regelRentenbeginn, szenarioAusCheck,
  type Antworten, type PersonAntwort, type VertragAntwort,
} from './uebernahme';

/**
 * VORSORGE-CHECK — Schritt fuer Schritt alle Angaben, die der Rechner braucht.
 *
 * Fuer Endkunden: Jeder Schritt sagt zuerst, welche Unterlage man dafuer zur
 * Hand haben sollte und wo darauf die Zahl steht; danach kommen nur die
 * Felder, die der Rechner tatsaechlich verwendet. Gerechnet wird hier nicht —
 * am Ende wandert alles als Szenario in den Rentenplaner.
 *
 * Wie die Seite zum Altersvorsorgedepot ein eigener Einstieg ohne Anmeldung.
 * Die Antworten liegen bis zum Schluss nur in `sessionStorage`: Ein Neuladen
 * verliert nichts, und nach dem Schliessen des Tabs bleibt nichts zurueck.
 */

const SPEICHER_CHECK = 'rentenplaner.check.v1';
/** Online-Dienste der Deutschen Rentenversicherung — dort laesst sich die Rentenauskunft anfordern. */
const DRV_ESERVICE = 'https://www.eservice-drv.de/SelfServiceWeb/';
const SPEICHER_SZENARIO = 'rentenplaner.szenario.v1';
const JETZT = new Date().getFullYear();

/** Die Unterlagen, die man vorher bereitlegt — die Checkliste oben. */
const UNTERLAGEN: { id: string; titel: string; text: string; link?: { href: string; text: string } }[] = [
  { id: 'ausweis', titel: 'Personalausweis', text: 'Ihr Geburtsdatum, bei Kindern die Geburtsjahre.' },
  { id: 'gehalt', titel: 'Letzte Gehaltsabrechnung', text: 'Beamte: Bezügemitteilung. Selbstständige: letzter Steuerbescheid.' },
  { id: 'kv', titel: 'Krankenversicherung', text: 'Name Ihrer Krankenkasse — oder die Beitragsrechnung Ihrer privaten Versicherung.' },
  {
    id: 'rente', titel: 'Renteninformation',
    text: 'Von der Deutschen Rentenversicherung, kommt jährlich per Post. Beamte: Versorgungsauskunft. Nicht zur Hand? Online anfordern:',
    // Die Adresse steht als Linktext, damit sie auch auf der gedruckten Liste lesbar ist.
    link: { href: DRV_ESERVICE, text: 'www.eservice-drv.de/SelfServiceWeb' },
  },
  { id: 'vertraege', titel: 'Standmitteilungen', text: 'Jährliches Schreiben jedes Vorsorgevertrags: Betriebsrente, Riester, Rürup, private Rente.' },
  { id: 'depot', titel: 'Depotauszug', text: 'Aktueller Wert und Sparrate Ihrer Wertpapierdepots.' },
];

const SCHRITTE = [
  'Sie & Ihr Haushalt',
  'Einkommen',
  'Krankenversicherung',
  'Gesetzliche Rente',
  'Verträge',
  'Ihr Ziel',
  'Übersicht',
] as const;

/** Vertragsarten in Alltagssprache — die Fachbegriffe stehen in Klammern. */
const VERTRAGSARTEN: { wert: VertragsTyp; text: string }[] = [
  { wert: 'bav', text: 'Betriebsrente (Direktversicherung / Pensionskasse)' },
  { wert: 'bavUkasse', text: 'Betriebsrente (Unterstützungskasse / Direktzusage)' },
  { wert: 'riester', text: 'Riester-Rente' },
  { wert: 'basis', text: 'Rürup- / Basisrente' },
  { wert: 'prvRente', text: 'Private Rentenversicherung' },
  { wert: 'avd', text: 'Altersvorsorgedepot (ab 2027)' },
  { wert: 'etf', text: 'Wertpapierdepot / ETF-Sparplan' },
  { wert: 'immobilie', text: 'Vermietete Immobilie' },
];

interface Stand {
  antworten: Antworten;
  schritt: number;
  abgehakt: string[];
}

/**
 * Der Code aus dem Link des Beraters — oder null, wenn die Seite ohne Link
 * aufgerufen wurde (dann fuehrt sie wie bisher in den eigenen Rechner).
 */
const ANFRAGE: string | null = (() => {
  const a = new URLSearchParams(window.location.search).get('a');
  return a && CHECK_CODE.test(a) ? a.toLowerCase() : null;
})();

/*
  WO DER ZWISCHENSTAND LIEGT. Mit Link des Beraters im localStorage, je Code:
  Der Kunde fuellt zu Hause aus, holt vielleicht erst morgen die
  Renteninformation — und soll dann nicht von vorn beginnen. Nach dem
  Absenden wird der Stand geloescht. Ohne Link bleibt es beim sessionStorage.
*/
function speicher(): Storage | null {
  try { return ANFRAGE ? localStorage : sessionStorage; } catch { return null; }
}
const SPEICHER_STAND = ANFRAGE ? `${SPEICHER_CHECK}.${ANFRAGE}` : SPEICHER_CHECK;

function ladeStand(): Stand {
  try {
    const roh = speicher()?.getItem(SPEICHER_STAND);
    if (roh) {
      const s = JSON.parse(roh) as Stand;
      // Neue Felder spaeterer Fassungen mit Vorgaben auffuellen.
      return { ...s, antworten: { ...leereAntworten(), ...s.antworten } };
    }
  } catch { /* Speicher gesperrt oder kaputt — neu beginnen */ }
  return { antworten: leereAntworten(), schritt: 0, abgehakt: [] };
}

/** Ist ein Schritt vollstaendig? Die Uebersicht nennt, was noch offen ist. */
function vollstaendig(i: number, x: Antworten): boolean {
  const personen = x.verheiratet ? [x.a, x.b] : [x.a];
  switch (i) {
    case 0: return personen.every((p) => parseDatum(p.geburtsdatum) !== null);
    case 1: return personen.every((p) => p.einkommen.modus === 'besoldung' || p.einkommen.betrag > 0);
    case 2: return (x.kv === 'gesetzlich' ? x.zusatzbeitrag > 0 : x.pkv.praemieMonat > 0)
      && (!x.verheiratet || x.kvB.art !== 'privat' || x.kvB.pkv.praemieMonat > 0);
    case 3: return personen.every((p) =>
      p.einkommen.modus === 'besoldung'
        ? p.ruhegehaltssatz > 0
        : p.grvRente > 0 || (p.einkommen.modus === 'selbststaendig' && !p.einkommen.grvPflicht));
    case 4: return true;
    case 5: return x.zielNettoHeute > 0;
    default: return true;
  }
}

export function Seite() {
  const [stand, setStand] = useState<Stand>(ladeStand);
  const [ersetzenOffen, setErsetzenOffen] = useState(false);
  const { antworten: x, schritt } = stand;

  /* --- Anfrage des Beraters --- */
  const [codeStatus, setCodeStatus] = useState<CodeStatus | 'pruefe'>(ANFRAGE ? 'pruefe' : 'gueltig');
  const [einwilligung, setEinwilligung] = useState(false);
  const [senden, setSenden] = useState<'bereit' | 'laeuft' | 'fertig' | 'fehler'>('bereit');
  useEffect(() => {
    if (ANFRAGE) void codePruefen(ANFRAGE).then(setCodeStatus);
  }, []);

  useEffect(() => {
    if (senden === 'fertig') return;
    try { speicher()?.setItem(SPEICHER_STAND, JSON.stringify(stand)); } catch { /* egal */ }
  }, [stand, senden]);

  /** An den Berater, der den Link geschickt hat. */
  const absenden = async () => {
    if (!ANFRAGE) return;
    setSenden('laeuft');
    const r = await einreichen(ANFRAGE, JSON.parse(exportiere(szenarioAusCheck(x))) as unknown);
    if (r === 'ok') {
      try { speicher()?.removeItem(SPEICHER_STAND); } catch { /* egal */ }
      setSenden('fertig');
      window.scrollTo({ top: 0 });
    } else if (r === 'ungueltig') {
      setCodeStatus('ungueltig');
      setSenden('bereit');
    } else {
      setSenden('fehler');
    }
  };

  const setze = (p: Partial<Antworten>) =>
    setStand((s) => ({ ...s, antworten: { ...s.antworten, ...p } }));
  const setzePerson = (id: 'a' | 'b', p: Partial<PersonAntwort>) =>
    setStand((s) => ({ ...s, antworten: { ...s.antworten, [id]: { ...s.antworten[id], ...p } } }));
  const geheZu = (i: number) => {
    setStand((s) => ({ ...s, schritt: Math.max(0, Math.min(SCHRITTE.length - 1, i)) }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const abhaken = (id: string) => setStand((s) => ({
    ...s,
    abgehakt: s.abgehakt.includes(id) ? s.abgehakt.filter((a) => a !== id) : [...s.abgehakt, id],
  }));

  /** Ins Szenario des Rechners schreiben und dorthin wechseln. */
  const uebernehmen = () => {
    try {
      localStorage.setItem(SPEICHER_SZENARIO, exportiere(szenarioAusCheck(x)));
      speicher()?.removeItem(SPEICHER_STAND);
    } catch { /* ohne Speicher gibt es keinen Weg in den Rechner */ }
    window.location.href = '/';
  };
  const berechnen = () => {
    let vorhanden = false;
    try { vorhanden = localStorage.getItem(SPEICHER_SZENARIO) !== null; } catch { /* egal */ }
    if (vorhanden) setErsetzenOffen(true);
    else uebernehmen();
  };

  const personen: ['a' | 'b', string][] = x.verheiratet
    ? [['a', x.a.name.trim() || 'Sie'], ['b', x.b.name.trim() || 'Partner/in']]
    : [['a', 'Sie']];

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 print:min-h-0 print:bg-white">
      <header className="bg-slate-900 text-white">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-4 sm:px-6">
          <Logo klasse="h-9 w-9" />
          <div>
            <span className="text-sm font-black tracking-tight">JS-Rentenplaner</span>
            <p className="text-[11px] text-slate-400">Ihre Zukunft. Smart geplant.</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
        <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
          Ihre Vorsorge in 7 Schritten
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          Wir fragen nur, was für die Berechnung wirklich zählt — und sagen bei jedem Schritt,
          welche Unterlage Sie dafür brauchen. Was Sie gerade nicht zur Hand haben, überspringen
          Sie einfach; es lässt sich später ergänzen.
        </p>

        {/*
          MIT LINK DES BERATERS. Der Name des Beraters steht hier bewusst
          NICHT: Konten kann jeder anlegen, ein angezeigter Name bewiese also
          nichts. Wahr ist allein, dass die Angaben dorthin gehen, woher der
          Link kam — und genau das steht da.
        */}
        {ANFRAGE && senden !== 'fertig' && (
          <div role="status" className={`mt-4 rounded-lg border px-3 py-2.5 text-sm leading-relaxed ${
            codeStatus === 'ungueltig' ? 'border-rose-200 bg-rose-50 text-rose-900'
              : codeStatus === 'fehler' ? 'border-amber-200 bg-amber-50 text-amber-900'
                : 'border-indigo-200 bg-indigo-50 text-indigo-900'
          }`}>
            {codeStatus === 'ungueltig'
              ? <><strong>Dieser Link ist abgelaufen oder wurde schon genutzt.</strong> Bitte fragen Sie
                  Ihren Berater nach einem neuen Link. Ihre Eingaben bleiben auf diesem Gerät erhalten.</>
              : codeStatus === 'fehler'
                ? <>Die Verbindung zum Server ließ sich gerade nicht prüfen. Sie können trotzdem
                    ausfüllen — beim Absenden wird es erneut versucht.</>
                : <><strong>Ihr Berater hat Sie um diese Angaben gebeten.</strong> Wenn Sie fertig sind,
                    senden Sie sie mit einem Klick an ihn — ein Konto brauchen Sie nicht. Ihr
                    Zwischenstand bleibt auf diesem Gerät gespeichert, bis Sie absenden.</>}
          </div>
        )}

        {senden === 'fertig' ? (
          <section className="mt-6 rounded-2xl border-2 border-emerald-300 bg-white p-6 text-center shadow-sm">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" aria-hidden />
            <h2 className="mt-3 text-xl font-black text-slate-900">Vielen Dank!</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-600">
              Ihre Angaben sind bei Ihrem Berater angekommen. Er rechnet Ihre Vorsorge damit durch
              und bespricht das Ergebnis mit Ihnen. Auf diesem Gerät ist nichts mehr gespeichert.
            </p>
          </section>
        ) : (<>

        {/* --- Checkliste --- */}
        <section className="mt-5 rounded-2xl border-2 border-emerald-200 bg-white p-4 shadow-sm sm:p-5 print:border-slate-300 print:shadow-none">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <ClipboardList className="h-4 w-4 text-emerald-600" aria-hidden />
              Das sollten Sie bereitlegen
            </h2>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              <Printer className="h-3.5 w-3.5" aria-hidden /> Checkliste drucken
            </button>
          </div>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {UNTERLAGEN.map((u) => {
              const erledigt = stand.abgehakt.includes(u.id);
              return (
                <li key={u.id}>
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 p-2.5 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={erledigt}
                      onChange={() => abhaken(u.id)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-emerald-600"
                    />
                    <span>
                      <span className={`block text-sm font-semibold ${erledigt ? 'text-emerald-700' : 'text-slate-800'}`}>
                        {u.titel}
                      </span>
                      <span className="block text-xs leading-relaxed text-slate-500">
                        {u.text}
                        {u.link && (
                          <>
                            {' '}
                            <a href={u.link.href} target="_blank" rel="noopener noreferrer"
                              className="font-semibold text-indigo-700 underline hover:text-indigo-900">
                              {u.link.text}
                            </a>
                          </>
                        )}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[11px] text-slate-500">
            {stand.abgehakt.length} von {UNTERLAGEN.length} bereit.
          </p>
        </section>

        {/* --- Fortschritt --- */}
        <nav aria-label="Schritte" className="mt-6 print:hidden">
          <ol className="grid grid-cols-7 gap-1">
            {SCHRITTE.map((t, i) => {
              const aktiv = i === schritt;
              const fertig = i < SCHRITTE.length - 1 && vollstaendig(i, x);
              return (
                <li key={t}>
                  <button
                    type="button"
                    onClick={() => geheZu(i)}
                    aria-current={aktiv ? 'step' : undefined}
                    aria-label={`Schritt ${i + 1}: ${t}`}
                    className="group flex w-full flex-col items-center gap-1"
                  >
                    <span className={`h-1.5 w-full rounded-full ${
                      aktiv ? 'bg-indigo-600' : fertig ? 'bg-emerald-500' : 'bg-slate-300'
                    }`} />
                    <span className={`hidden text-[10px] font-semibold leading-tight sm:block ${
                      aktiv ? 'text-indigo-700' : 'text-slate-500 group-hover:text-slate-700'
                    }`}>
                      {t}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="mt-2 text-xs font-semibold text-slate-500 sm:hidden">
            Schritt {schritt + 1} von {SCHRITTE.length}: {SCHRITTE[schritt]}
          </p>
        </nav>

        {/* --- Der aktuelle Schritt --- */}
        <section className="mt-4 rounded-2xl border-2 border-indigo-200 bg-indigo-50/50 p-4 shadow-sm sm:p-6 print:hidden">
          <h2 className="text-lg font-black text-slate-900">
            <span className="text-indigo-600">{schritt + 1}.</span> {SCHRITTE[schritt]}
          </h2>

          {schritt === 0 && <SchrittHaushalt x={x} setze={setze} setzePerson={setzePerson} />}
          {schritt === 1 && <SchrittEinkommen x={x} personen={personen} setzePerson={setzePerson} />}
          {schritt === 2 && <SchrittKv x={x} setze={setze} personen={personen} />}
          {schritt === 3 && <SchrittRente x={x} personen={personen} setzePerson={setzePerson} />}
          {schritt === 4 && <SchrittVertraege x={x} setze={setze} />}
          {schritt === 5 && <SchrittZiel x={x} setze={setze} />}
          {schritt === 6 && (
            <SchrittUebersicht
              x={x}
              geheZu={geheZu}
              anfrage={ANFRAGE !== null}
              einwilligung={einwilligung}
              setEinwilligung={setEinwilligung}
            />
          )}
          {schritt === 6 && senden === 'fehler' && (
            <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900">
              Das Senden hat nicht geklappt — bitte prüfen Sie Ihre Internetverbindung und versuchen
              Sie es noch einmal. Ihre Angaben sind nicht verloren.
            </p>
          )}

          {/* Navigation */}
          <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-indigo-100 pt-4">
            {schritt > 0 && (
              <button
                type="button"
                onClick={() => geheZu(schritt - 1)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden /> Zurück
              </button>
            )}
            <span className="flex-1" />
            {schritt < SCHRITTE.length - 1 ? (
              <>
                {!vollstaendig(schritt, x) && (
                  <button
                    type="button"
                    onClick={() => geheZu(schritt + 1)}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-500 hover:bg-white"
                  >
                    <SkipForward className="h-3.5 w-3.5" aria-hidden /> Habe ich gerade nicht zur Hand
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => geheZu(schritt + 1)}
                  className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500"
                >
                  Weiter <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
              </>
            ) : ANFRAGE ? (
              <button
                type="button"
                onClick={() => void absenden()}
                disabled={!einwilligung || codeStatus === 'ungueltig' || senden === 'laeuft'}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send className="h-4 w-4" aria-hidden />
                {senden === 'laeuft' ? 'Wird gesendet …' : 'An meinen Berater senden'}
              </button>
            ) : (
              <button
                type="button"
                onClick={berechnen}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-500"
              >
                <Calculator className="h-4 w-4" aria-hidden /> Ergebnis berechnen
              </button>
            )}
          </div>
        </section>

        </>)}

        <p className="mt-6 text-center text-xs leading-relaxed text-slate-500">
          {ANFRAGE
            ? 'Ihre Angaben bleiben in Ihrem Browser, bis Sie sie absenden. Übermittelt werden sie verschlüsselt und nur an Ihren Berater.'
            : 'Ihre Angaben bleiben in Ihrem Browser, bis Sie „Ergebnis berechnen“ wählen.'}{' '}
          Modellrechnung ohne Gewähr; keine Steuer-, Renten- oder Anlageberatung.
        </p>
      </main>

      <Dialog
        offen={ersetzenOffen}
        titel="Vorhandene Angaben ersetzen?"
        beschreibung="In diesem Browser ist schon eine Berechnung gespeichert. Ihre Angaben aus dem Vorsorge-Check treten an ihre Stelle."
        onSchliessen={() => setErsetzenOffen(false)}
      >
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => setErsetzenOffen(false)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={uebernehmen}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-500"
          >
            Ersetzen und berechnen
          </button>
        </div>
      </Dialog>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Bausteine
   -------------------------------------------------------------------------- */

/** „Das brauchen Sie" — die Unterlage zu diesem Schritt und wo die Zahl steht. */
function Unterlage({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
      <div className="text-xs leading-relaxed text-amber-900">
        <span className="font-bold">Das brauchen Sie: </span>{children}
      </div>
    </div>
  );
}

function Block({ titel, children }: { titel?: string; children: ReactNode }) {
  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3 sm:p-4">
      {titel && (
        <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">{titel}</h3>
      )}
      {children}
    </div>
  );
}

type SetzePerson = (id: 'a' | 'b', p: Partial<PersonAntwort>) => void;
type Setze = (p: Partial<Antworten>) => void;

/* --- 1. Haushalt --------------------------------------------------------- */

function SchrittHaushalt({ x, setze, setzePerson }: { x: Antworten; setze: Setze; setzePerson: SetzePerson }) {
  const avd = parameterFuer(Math.max(JETZT, 2027), { indexRate: 0 }).avd;
  return (
    <>
      <Unterlage>
        Ihr Personalausweis für das Geburtsdatum — daraus ergibt sich Ihr Rentenbeginn. Bei Kindern
        genügt das Geburtsjahr; es entscheidet über Kinderfreibetrag und Zulagen.
      </Unterlage>

      <Block>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextFeld label="Ihr Vorname" wert={x.a.name} onChange={(s) => setzePerson('a', { name: s })} />
          <DatumFeld label="Ihr Geburtsdatum" wert={x.a.geburtsdatum}
            onChange={(s) => setzePerson('a', { geburtsdatum: s })} />
        </div>
        <div className="mt-3">
          <Schalter label="Verheiratet oder eingetragene Lebenspartnerschaft" wert={x.verheiratet}
            onChange={(b) => setze({ verheiratet: b })} />
        </div>
        {x.verheiratet && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <TextFeld label="Vorname Partner/in" wert={x.b.name} onChange={(s) => setzePerson('b', { name: s })} />
            <DatumFeld label="Geburtsdatum Partner/in" wert={x.b.geburtsdatum}
              onChange={(s) => setzePerson('b', { geburtsdatum: s })} />
          </div>
        )}
      </Block>

      <Block>
        <div className="grid gap-3 sm:grid-cols-2">
          <AuswahlFeld label="Bundesland" wert={x.bundesland} onChange={(v) => setze({ bundesland: v })}
            optionen={BUNDESLAENDER.map((l) => ({ wert: l as string, text: l }))} />
          <div className="sm:pt-6">
            <Schalter label="Kirchensteuerpflichtig" wert={x.kirchensteuer}
              onChange={(b) => setze({ kirchensteuer: b })} />
          </div>
        </div>
        <div className="mt-3">
          <ZahlFeld
            label="Kinder"
            wert={x.kinder.length}
            onChange={(n) => setze({
              kinder: Array.from({ length: Math.max(0, Math.min(15, Math.round(n))) },
                (_, i) => x.kinder[i] ?? { geburtsjahr: JETZT - 5 }),
            })}
            max={15}
            stufen
          />
          {x.kinder.length > 0 && (
            <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2">
              <KinderZeilen
                kinder={x.kinder}
                onKind={(index, p) => setze({
                  kinder: x.kinder.map((k, i) => (i === index ? { ...k, ...p } : k)),
                })}
                a={avd}
                jetzt={JETZT}
              />
              <KinderHinweis a={avd} />
            </div>
          )}
        </div>
      </Block>
    </>
  );
}

/* --- 2. Einkommen --------------------------------------------------------- */

function SchrittEinkommen({ x, personen, setzePerson }: {
  x: Antworten; personen: ['a' | 'b', string][]; setzePerson: SetzePerson;
}) {
  return (
    <>
      <Unterlage>
        Ihre letzte <strong>Gehaltsabrechnung</strong>: das Gesamtbrutto eines normalen Monats, ohne
        Sonderzahlungen — Weihnachts- und Urlaubsgeld stecken in der Anzahl der Gehälter.
        Beamte: die <strong>Bezügemitteilung</strong> (Besoldungsgruppe, Stufe).
        Selbstständige: der Gewinn aus dem letzten <strong>Steuerbescheid</strong>, geteilt durch 12.
      </Unterlage>
      {personen.map(([id, name]) => (
        <Block key={id} titel={personen.length > 1 ? name : undefined}>
          <EinkommenFelder
            wert={x[id].einkommen}
            onChange={(p) => setzePerson(id, { einkommen: { ...x[id].einkommen, ...p } })}
            spalten={2}
          />
        </Block>
      ))}
    </>
  );
}

/* --- 3. Krankenversicherung ----------------------------------------------- */

const KASSEN = [
  { wert: '', text: 'Bitte wählen — oder Satz eintragen' },
  ...KRANKENKASSEN.map((k) => ({ wert: k.name, text: k.name })),
];

/** Kasse und Zusatzbeitrag — fuer A und, falls abweichend, fuer B. */
function GesetzlichFelder({ kasse, satz, setze }: {
  kasse: string; satz: number;
  setze: (p: { krankenkasse?: string; zusatzbeitrag?: number }) => void;
}) {
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <AuswahlFeld
        label="Krankenkasse"
        wert={kasse}
        onChange={(v) => {
          const k = KRANKENKASSEN.find((kk) => kk.name === v);
          setze({ krankenkasse: v, ...(k ? { zusatzbeitrag: k.zusatzbeitrag } : {}) });
        }}
        optionen={KASSEN}
        hilfe={KASSEN_STAND}
      />
      <ProzentFeld
        label="Zusatzbeitrag"
        wert={satz}
        onChange={(n) => setze({ zusatzbeitrag: n, krankenkasse: '' })}
        max={10}
        stellen={2}
        hilfe="Wird mit der Kasse gesetzt. Kasse nicht in der Liste? Dann den Satz hier eintragen."
      />
    </div>
  );
}

function SchrittKv({ x, setze, personen }: {
  x: Antworten; setze: Setze; personen: ['a' | 'b', string][];
}) {
  const kB = x.kvB;
  const setzeB = (p: Partial<Antworten['kvB']>) => setze({ kvB: { ...kB, ...p } });
  return (
    <>
      <Unterlage>
        Gesetzlich versichert: nur der <strong>Name Ihrer Krankenkasse</strong> — den Zusatzbeitrag
        kennen wir. Privat versichert: Ihre <strong>Beitragsrechnung</strong> oder das letzte
        Schreiben zur Beitragsanpassung (Monatsbeitrag gesamt, ggf. Beitragsentlastungstarif).
      </Unterlage>
      <Block titel={personen.length > 1 ? personen[0]![1] : undefined}>
        <div className="grid gap-2 sm:grid-cols-2">
          {(['gesetzlich', 'privat'] as const).map((art) => (
            <button
              key={art}
              type="button"
              onClick={() => setze({ kv: art })}
              aria-pressed={x.kv === art}
              className={`rounded-lg border-2 px-3 py-2.5 text-left text-sm font-semibold ${
                x.kv === art
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {art === 'gesetzlich' ? 'Gesetzlich versichert' : 'Privat versichert'}
            </button>
          ))}
        </div>

        {x.kv === 'gesetzlich' ? (
          <GesetzlichFelder kasse={x.krankenkasse} satz={x.zusatzbeitrag} setze={setze} />
        ) : (
          <PkvFelder wert={x.pkv} onChange={(p) => setze({ pkv: p })} />
        )}
      </Block>

      {personen.length > 1 && (
        <Block titel={personen[1]![1]}>
          <AuswahlFeld
            label="Versichert"
            wert={kB.art}
            onChange={(v) => setzeB({ art: v })}
            optionen={[
              { wert: 'gleich', text: 'Genauso — gleiche Kasse bzw. gleicher Beitrag' },
              { wert: 'gesetzlich', text: 'Gesetzlich, bei einer anderen Kasse' },
              { wert: 'privat', text: 'Privat, mit eigenem Beitrag' },
            ]}
            hilfe="Etwa bei einem Paar aus Beamtem und Angestellter oft verschieden."
          />
          {kB.art === 'gesetzlich' && (
            <GesetzlichFelder kasse={kB.krankenkasse} satz={kB.zusatzbeitrag} setze={setzeB} />
          )}
          {kB.art === 'privat' && (
            <PkvFelder wert={kB.pkv} onChange={(p) => setzeB({ pkv: p })} titel="Private Krankenversicherung Partner/in" />
          )}
        </Block>
      )}
    </>
  );
}

/* --- 4. Gesetzliche Rente / Pension --------------------------------------- */

function SchrittRente({ x, personen, setzePerson }: {
  x: Antworten; personen: ['a' | 'b', string][]; setzePerson: SetzePerson;
}) {
  return (
    <>
      <Unterlage>
        Die <strong>Renteninformation</strong> der Deutschen Rentenversicherung (kommt jährlich ab
        27): der Betrag unter <em>„Höhe Ihrer künftigen Regelaltersrente“</em>. Beamte: die{' '}
        <strong>Versorgungsauskunft</strong> Ihres Dienstherrn mit dem Ruhegehaltssatz. Keine
        Renteninformation zur Hand? Dann schätzen wir aus Ihrem Einkommen — oder Sie fordern sie an.
        {/*
          Der Weg zur genauen Zahl. Die Schaetzung ist eine Notloesung; wer die
          Renteninformation nicht findet, soll sie mit einem Klick anfordern
          koennen, statt sie im Keller zu suchen.
        */}
        <a
          href={DRV_ESERVICE}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 flex w-fit items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 font-semibold text-amber-900 hover:bg-amber-100"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          Renteninformation / Rentenauskunft online anfordern (Deutsche Rentenversicherung)
        </a>
      </Unterlage>
      {personen.map(([id, name]) => (
        <RenteJePerson key={id} p={x[id]} name={personen.length > 1 ? name : undefined}
          setze={(p) => setzePerson(id, p)} />
      ))}
    </>
  );
}

function RenteJePerson({ p, name, setze }: {
  p: PersonAntwort; name?: string; setze: (p: Partial<PersonAntwort>) => void;
}) {
  const [geschaetzt, setGeschaetzt] = useState(false);
  const regel = regelRentenbeginn(p.geburtsdatum);
  const e = p.einkommen;
  const beamter = e.modus === 'besoldung';
  const selbstOhneGrv = e.modus === 'selbststaendig' && !e.grvPflicht;

  /*
    Derselbe Schaetzer wie im Rechner. Bei Selbststaendigen zaehlt nicht der
    Gewinn, sondern der Beitrag — zurueckgerechnet in das Entgelt, das ihn
    ausgeloest haette.
  */
  const schaetzen = () => {
    const pJetzt = parameterFuer(heute().jahr, { indexRate: 0.01 });
    const geburt = parseDatum(p.geburtsdatum);
    const beginn = parseDatum(p.rentenbeginn) ?? (regel ? parseDatum(regel) : null);
    if (!geburt || !beginn) return;
    const jahresentgelt = e.modus === 'selbststaendig'
      ? (e.grvBeitragMonat * 12) / pJetzt.rvSatzGesamt
      : e.betrag * e.auszahlungen;
    const s = schaetzeEntgeltpunkte(jahresentgelt, alterExakt(geburt, heute()), alterExakt(geburt, beginn), pJetzt);
    setze({ grvRente: Math.round(s.monatsrenteHeutigeKaufkraft) });
    setGeschaetzt(true);
  };

  return (
    <Block titel={name}>
      {beamter ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <AuswahlFeld label="Besoldungsgruppe am Ende" wert={p.endBesoldungsgruppe}
            onChange={(v) => setze({ endBesoldungsgruppe: v })}
            optionen={BESOLDUNGSGRUPPEN.map((g) => ({ wert: g as string, text: g }))} />
          <ZahlFeld label="Ruhegehaltssatz" wert={p.ruhegehaltssatz}
            onChange={(n) => setze({ ruhegehaltssatz: n })} max={71.75} einheit="%"
            hilfe="Höchstens 71,75 %." />
          <DatumFeld label="Dienstbeginn" wert={p.dienstbeginn}
            onChange={(s) => setze({ dienstbeginn: s })} />
        </div>
      ) : (
        <>
          {selbstOhneGrv && (
            <p className="mb-2 text-xs leading-relaxed text-slate-500">
              Sie zahlen nach Ihren Angaben nicht in die gesetzliche Rentenversicherung ein. Einen
              Anspruch aus früheren Jahren als Angestellte/r tragen Sie trotzdem hier ein — oder
              lassen das Feld leer.
            </p>
          )}
          <div className="grid items-end gap-3 sm:grid-cols-2">
            <ZahlFeld
              label="Künftige Regelaltersrente monatlich"
              wert={p.grvRente}
              onChange={(n) => { setze({ grvRente: n }); setGeschaetzt(false); }}
              einheit="€"
              hilfe={geschaetzt
                ? 'Geschätzt aus Ihrem Einkommen — mit der Renteninformation wird es genauer.'
                : 'Laut Renteninformation, ohne künftige Rentenanpassungen.'}
            />
            {!selbstOhneGrv && (
              <button
                type="button"
                onClick={schaetzen}
                disabled={!parseDatum(p.geburtsdatum) || (e.modus !== 'selbststaendig' && e.betrag <= 0)}
                className="mb-5 flex items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Calculator className="h-3.5 w-3.5" aria-hidden /> Keine Renteninformation? Schätzen
              </button>
            )}
          </div>
        </>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <DatumFeld
          label="Gewünschter Rentenbeginn"
          wert={p.rentenbeginn || regel || ''}
          onChange={(s) => setze({ rentenbeginn: s })}
          hilfe={regel ? `Regelaltersgrenze: ${regel}. Früher kostet Abschläge, später bringt Zuschläge.` : 'Erst das Geburtsdatum in Schritt 1 eintragen.'}
        />
      </div>
    </Block>
  );
}

/* --- 5. Vertraege ---------------------------------------------------------- */

function SchrittVertraege({ x, setze }: { x: Antworten; setze: Setze }) {
  const aendern = (id: string, p: Partial<VertragAntwort>) =>
    setze({ vertraege: x.vertraege.map((v) => (v.id === id ? { ...v, ...p } : v)) });
  const neu = () => setze({
    vertraege: [...x.vertraege, {
      id: `v-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      typ: 'bav', inhaber: 'A', rente: 0, kapital: 0, beitrag: 0, agZuschuss: 0, beginnJahr: JETZT,
    }],
  });

  return (
    <>
      <Unterlage>
        Die jährliche <strong>Standmitteilung</strong> jedes Vertrags: die garantierte bzw.
        prognostizierte Monatsrente, der aktuelle Beitrag und das Beginnjahr. Bei Betriebsrenten
        den Anteil Ihres Arbeitgebers (Gehaltsabrechnung). Für Depots den aktuellen{' '}
        <strong>Depotauszug</strong>. Die gesetzliche Rente gehört nicht hierher — die kam in Schritt 4.
      </Unterlage>

      {x.vertraege.length === 0 && (
        <p className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-5 text-center text-sm text-slate-500">
          Noch keine Verträge. Keine zu haben ist auch eine Angabe — dann einfach weiter.
        </p>
      )}

      {x.vertraege.map((v, i) => {
        const depot = v.typ === 'etf';
        const avd = v.typ === 'avd';
        const immobilie = v.typ === 'immobilie';
        return (
          <Block key={v.id}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Vertrag {i + 1}</span>
              <button
                type="button"
                onClick={() => setze({ vertraege: x.vertraege.filter((w) => w.id !== v.id) })}
                aria-label={`Vertrag ${i + 1} entfernen`}
                className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <AuswahlFeld label="Art" wert={v.typ} onChange={(t) => aendern(v.id, { typ: t })}
                optionen={VERTRAGSARTEN} />
              {x.verheiratet && (
                <AuswahlFeld label="Gehört" wert={v.inhaber}
                  onChange={(w) => aendern(v.id, { inhaber: w })}
                  optionen={[
                    { wert: 'A', text: x.a.name.trim() || 'Ihnen' },
                    { wert: 'B', text: x.b.name.trim() || 'Partner/in' },
                  ]} />
              )}
              {!depot && !avd && (
                <ZahlFeld
                  label={immobilie ? 'Kaltmiete monatlich' : 'Rente monatlich laut Standmitteilung'}
                  wert={v.rente} onChange={(n) => aendern(v.id, { rente: n })} einheit="€"
                  hilfe={immobilie ? undefined : 'Die prognostizierte Rente ab Rentenbeginn, brutto.'} />
              )}
              {(depot || avd) && (
                <ZahlFeld label={depot ? 'Depotwert heute' : 'Guthaben heute'} wert={v.kapital}
                  onChange={(n) => aendern(v.id, { kapital: n })} einheit="€" />
              )}
              {!immobilie && (
                <ZahlFeld label={depot ? 'Sparrate monatlich' : 'Beitrag monatlich'} wert={v.beitrag}
                  onChange={(n) => aendern(v.id, { beitrag: n })} einheit="€"
                  hilfe={v.typ.startsWith('bav') ? 'Gesamtbeitrag — Ihr Anteil und der des Arbeitgebers.' : undefined} />
              )}
              {v.typ.startsWith('bav') && (
                <ZahlFeld label="Davon zahlt der Arbeitgeber" wert={v.agZuschuss}
                  onChange={(n) => aendern(v.id, { agZuschuss: n })} einheit="€" />
              )}
              {!depot && !immobilie && (
                <ZahlFeld label="Beginnjahr" wert={v.beginnJahr}
                  onChange={(n) => aendern(v.id, { beginnJahr: n })} min={1950} max={2100} stufen />
              )}
            </div>
          </Block>
        );
      })}

      <button
        type="button"
        onClick={neu}
        className="mt-4 flex items-center gap-1.5 rounded-lg border-2 border-dashed border-indigo-300 bg-white px-3 py-2 text-sm font-bold text-indigo-700 hover:bg-indigo-50"
      >
        <Plus className="h-4 w-4" aria-hidden /> Vertrag hinzufügen
      </button>
    </>
  );
}

/* --- 6. Ziel ---------------------------------------------------------------- */

function SchrittZiel({ x, setze }: { x: Antworten; setze: Setze }) {
  /*
    Der Vorschlag kommt aus derselben Netto-Rechnung wie im Rechner: Das
    Szenario wird gebaut und sein heutiges Haushaltsnetto bestimmt. Drei
    Viertel davon sind die uebliche Faustregel fuer den Bedarf im Alter.
  */
  const nettoHeute = useMemo(() => {
    try {
      const s = szenarioAusCheck(x);
      const jahr = new Date().getFullYear();
      const p = parameterFuer(jahr, { indexRate: s.annahmen.tarifIndex });
      return erwerbsBasisHeute(s, p, jahr).haushalt.jahresnetto / 12;
    } catch { return 0; }
  }, [x]);
  const vorschlag = Math.round((nettoHeute * 0.75) / 50) * 50;

  return (
    <>
      <Unterlage>
        Keine Unterlage — nur eine Überlegung: Wie viel Geld im Monat brauchen Sie im Ruhestand,
        gerechnet in <strong>heutigem Geld</strong>? Die Preissteigerung bis dahin rechnen wir selbst hinzu.
      </Unterlage>
      <Block>
        <div className="grid items-end gap-3 sm:grid-cols-2">
          <ZahlFeld label="Gewünschtes Netto im Monat (heutiges Geld)" wert={x.zielNettoHeute}
            onChange={(n) => setze({ zielNettoHeute: n })} einheit="€" />
          {vorschlag > 0 && (
            <button
              type="button"
              onClick={() => setze({ zielNettoHeute: vorschlag })}
              className="mb-0.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-xs text-slate-600 hover:bg-slate-50"
            >
              Vorschlag übernehmen: <strong>{euro(vorschlag)}</strong>
              <span className="block text-[11px] text-slate-500">
                drei Viertel Ihres heutigen Nettos von rund {euro(nettoHeute)}
              </span>
            </button>
          )}
        </div>
      </Block>
    </>
  );
}

/* --- 7. Uebersicht ---------------------------------------------------------- */

function SchrittUebersicht({ x, geheZu, anfrage, einwilligung, setEinwilligung }: {
  x: Antworten;
  geheZu: (i: number) => void;
  /** Mit Link des Beraters: senden statt selbst berechnen */
  anfrage: boolean;
  einwilligung: boolean;
  setEinwilligung: (b: boolean) => void;
}) {
  const namen = x.verheiratet ? `${x.a.name || 'Sie'} und ${x.b.name || 'Partner/in'}` : (x.a.name || 'Sie');
  const zusammenfassung = [
    `${namen}${x.kinder.length > 0 ? `, ${x.kinder.length} Kind${x.kinder.length > 1 ? 'er' : ''}` : ''} · ${x.bundesland}`,
    (x.verheiratet ? [x.a, x.b] : [x.a]).map((p) =>
      p.einkommen.modus === 'besoldung' ? `Besoldung ${p.einkommen.besoldungsgruppe}`
        : `${euro(p.einkommen.betrag)} ${p.einkommen.modus === 'selbststaendig' ? 'Gewinn' : p.einkommen.modus === 'netto' ? 'netto' : 'brutto'} im Monat`,
    ).join(' · '),
    x.kv === 'gesetzlich'
      ? `Gesetzlich${x.krankenkasse ? ` · ${x.krankenkasse}` : ''}`
      : `Privat · ${euro(x.pkv.praemieMonat)} im Monat`,
    (x.verheiratet ? [x.a, x.b] : [x.a]).map((p) =>
      p.einkommen.modus === 'besoldung' ? `Pension, ${p.ruhegehaltssatz.toLocaleString('de-DE')} %` : `${euro(p.grvRente)} Rente`,
    ).join(' · '),
    x.vertraege.length === 0 ? 'keine' : `${x.vertraege.length} Vertr${x.vertraege.length > 1 ? 'äge' : 'ag'}`,
    x.zielNettoHeute > 0 ? `${euro(x.zielNettoHeute)} im Monat` : '—',
  ];
  const offen = SCHRITTE.slice(0, 6).filter((_, i) => !vollstaendig(i, x)).length;

  return (
    <>
      <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {SCHRITTE.slice(0, 6).map((t, i) => {
          const ok = vollstaendig(i, x);
          return (
            <li key={t} className="flex items-center gap-3 px-3 py-2.5">
              {ok
                ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-label="vollständig" />
                : <CircleDashed className="h-5 w-5 shrink-0 text-amber-500" aria-label="offen" />}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-800">{t}</div>
                <div className="truncate text-xs text-slate-500">
                  {ok ? zusammenfassung[i] : 'Noch offen — der Rechner nimmt dafür einen Standardwert.'}
                </div>
              </div>
              <button type="button" onClick={() => geheZu(i)}
                className="shrink-0 rounded px-2 py-1 text-xs font-bold text-indigo-700 hover:bg-indigo-50">
                {ok ? 'Ändern' : 'Ergänzen'}
              </button>
            </li>
          );
        })}
      </ul>

      {anfrage ? (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm leading-relaxed text-emerald-900">
          <strong>So geht es weiter:</strong> Mit „An meinen Berater senden“ gehen Ihre Angaben an
          den Berater, der Ihnen den Link geschickt hat. Er rechnet damit Ihre Versorgung im
          Ruhestand durch und bespricht das Ergebnis mit Ihnen.
          {offen > 0 && (
            <> {offen === 1 ? 'Ein Schritt ist' : `${offen} Schritte sind`} noch offen — das ist in
            Ordnung, Ihr Berater ergänzt es mit Ihnen im Gespräch.</>
          )}
          {/*
            EINWILLIGUNG. Die Angaben liegen bis zur Uebernahme auf dem Server.
            Ohne Haken bleibt der Knopf gesperrt.
          */}
          <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-md bg-white p-2.5 text-xs leading-relaxed text-slate-700">
            <input
              type="checkbox"
              checked={einwilligung}
              onChange={(e) => setEinwilligung(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-emerald-600"
            />
            <span>
              Ich bin einverstanden, dass meine Angaben an meinen Berater übermittelt und für die
              Beratung gespeichert werden, bis er sie übernommen oder gelöscht hat. Die
              Einwilligung kann ich jederzeit bei meinem Berater widerrufen.
            </span>
          </label>
        </div>
      ) : (
      <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm leading-relaxed text-emerald-900">
        <strong>So geht es weiter:</strong> Mit „Ergebnis berechnen“ übernimmt der Rentenplaner Ihre
        Angaben und rechnet Ihre Versorgung im Ruhestand durch — Einkünfte, Versorgungslücke,
        Prüfung Ihrer Verträge und ungenutzte Förderung. Beim ersten Mal legen Sie dort ein
        kostenloses Konto an; dann können Sie das Ergebnis auch speichern und als Gutachten drucken.
        {offen > 0 && (
          <> {offen === 1 ? 'Ein Schritt ist' : `${offen} Schritte sind`} noch offen — das Ergebnis
          wird dadurch ungenauer, lässt sich im Rechner aber jederzeit ergänzen.</>
        )}
      </div>
      )}
    </>
  );
}
