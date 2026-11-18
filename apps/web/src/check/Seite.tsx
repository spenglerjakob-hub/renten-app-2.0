import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  ArrowLeft, ArrowRight, Calculator, Camera, Check, CheckCircle2, ChevronDown, CircleDashed, ExternalLink, FileStack,
  HeartPulse, HelpCircle, Landmark, ListChecks, Minus, Plus, Send, Target, Trash2, UserRound, Wallet, type LucideIcon,
} from 'lucide-react';
import {
  BUNDESLAENDER, BESOLDUNGSGRUPPEN, parameterFuer, parseDatum, alterExakt, heute,
  schaetzeEntgeltpunkte, erwerbsBasisHeute, type VertragsTyp,
} from '@renten/engine';
import { exportiere } from '@renten/schema';
import {
  CHECK_CODE, codePruefen, einreichen, type CodeStatus, type DokumentArt, type DokumentEintrag,
} from '../lib/check';
import { supabaseKonfiguriert } from '../lib/supabase';
import { mitName, namensTeile } from '../lib/namen';
import { DokumentHochladen } from './Dokumente';
import { SeitenKopf } from '../components/SeitenKopf';
import { RechtsLinks } from '../components/RechtsLinks';
import {
  ZahlFeld, ProzentFeld, DatumFeld, NamenFelder, AuswahlFeld, euro,
} from '../components/Feld';
import { KinderZeilen, KinderHinweis } from '../components/KinderFelder';
import {
  EINLEITUNG, Etappen, FEHLER, FELD_LABEL, Hervor, KNOPF, KNOPF_KLEIN, KNOPF_ZWEIT, LINK, Titel,
} from '../components/stil';
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
 * Fuer Endkunden, meist am Telefon ueber den Link des Beraters. Deshalb
 * steht in jedem Schritt ZUERST die Frage und darunter gleich die Felder —
 * nur die, die der Rechner tatsaechlich verwendet. Was beim Ausfuellen hilft,
 * klappt darunter auf: wo die Zahl steht („Wo finde ich das?“) und, mit Link
 * des Beraters, das Hochladen eines Fotos statt des Abtippens. Titel,
 * Einleitung und Hinweis des Beraters stehen nur ueber dem ersten Schritt;
 * „Weiter“ haftet am Telefon am unteren Rand. Gerechnet wird hier nicht —
 * am Ende wandert alles als Szenario in den Rentenplaner.
 *
 * Eigener Einstieg. Ohne Konto nur mit dem persoenlichen Link des Beraters
 * (?a=<Code>, siehe main.tsx); ohne Link gilt die Zugangsschranke.
 * Die Antworten liegen bis zum Schluss nur in `sessionStorage`: Ein Neuladen
 * verliert nichts, und nach dem Schliessen des Tabs bleibt nichts zurueck.
 */

const SPEICHER_CHECK = 'rentenplaner.check.v1';
/** Online-Dienste der Deutschen Rentenversicherung — dort laesst sich die Rentenauskunft anfordern. */
const DRV_ESERVICE = 'https://www.eservice-drv.de/SelfServiceWeb/';
const SPEICHER_SZENARIO = 'rentenplaner.szenario.v1';
const JETZT = new Date().getFullYear();

const SCHRITTE = [
  'Sie & Ihr Haushalt',
  'Einkommen',
  'Krankenversicherung',
  'Gesetzliche Rente',
  'Verträge',
  'Ihr Ziel',
  'Übersicht',
] as const;

/**
 * Die Frage ueber jedem Schritt, ein Satz dazu und ein Zeichen, an dem man
 * den Schritt wiedererkennt. Die kurzen Namen oben (`SCHRITTE`) bleiben fuer
 * die Schrittleiste und die Uebersicht.
 */
const FRAGEN: readonly { symbol: LucideIcon; titel: string; unter: string }[] = [
  { symbol: UserRound, titel: 'Zuerst zu Ihnen', unter: 'Aus dem Geburtsdatum ergibt sich Ihr Rentenbeginn; die Familie zählt für Steuer und Zulagen.' },
  { symbol: Wallet, titel: 'Was verdienen Sie?', unter: 'Ein normaler Monat, ohne Weihnachts- oder Urlaubsgeld.' },
  { symbol: HeartPulse, titel: 'Wie sind Sie krankenversichert?', unter: 'Gesetzlich genügt der Name der Kasse; privat der Monatsbeitrag.' },
  { symbol: Landmark, titel: 'Was bekommen Sie später an Rente?', unter: 'Der Betrag steht auf Ihrer Renteninformation. Nicht zur Hand? Dann schätzen wir.' },
  { symbol: FileStack, titel: 'Welche Vorsorge haben Sie schon?', unter: 'Betriebsrente, Riester, private Rente, Depot — je Vertrag ein Eintrag. Keinen zu haben ist auch eine Angabe.' },
  { symbol: Target, titel: 'Wie viel möchten Sie im Ruhestand haben?', unter: 'Im Monat, in heutigem Geld — die Preissteigerung bis dahin rechnen wir selbst hinzu.' },
  { symbol: ListChecks, titel: 'Alles auf einen Blick', unter: 'Prüfen Sie Ihre Angaben. Was offen ist, können Sie ergänzen — oder so lassen.' },
];

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
      // Neue Felder spaeterer Fassungen mit Vorgaben auffuellen; Felder
      // frueherer Fassungen (etwa die Haekchen der Checkliste) fallen weg.
      return { schritt: s.schritt ?? 0, antworten: { ...leereAntworten(), ...s.antworten } };
    }
  } catch { /* Speicher gesperrt oder kaputt — neu beginnen */ }
  return { antworten: leereAntworten(), schritt: 0 };
}

/** Die Unterlage in der zugeklappten Zeile „Foto statt abtippen“. */
const UNTERLAGE_KURZ: Record<DokumentArt, string> = {
  einkommen: 'Gehaltsabrechnung',
  kv: 'Beitragsrechnung oder Versichertenkarte',
  rente: 'Renteninformation',
  vertraege: 'Standmitteilungen',
  sonstiges: 'Versicherungsschein, Bescheid oder Angebot',
};

/**
 * Welche Unterlage zu welchem Schritt gehoert. Ist dort eine hochgeladen, gilt
 * der Schritt als erledigt: Der Berater liest die Zahlen selbst ab.
 */
const ART_JE_SCHRITT: Partial<Record<number, DokumentArt>> = { 1: 'einkommen', 2: 'kv', 3: 'rente', 4: 'vertraege' };

const unterlagenZu = (i: number, x: Antworten) =>
  x.dokumente.filter((d) => d.art === ART_JE_SCHRITT[i]).length;

/** Ist ein Schritt vollstaendig? Die Uebersicht nennt, was noch offen ist. */
function vollstaendig(i: number, x: Antworten): boolean {
  return felderVollstaendig(i, x) || unterlagenZu(i, x) > 0;
}

/** Sind die FELDER eines Schritts ausgefuellt — ohne Blick auf Unterlagen? */
function felderVollstaendig(i: number, x: Antworten): boolean {
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
  /** „Senden“ ohne Haken getippt: zum Haken fuehren, statt den Knopf stumm zu sperren. */
  const [erinnern, setErinnern] = useState(false);
  const haken = useRef<HTMLInputElement>(null);
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
    if (!einwilligung) {
      setErinnern(true);
      haken.current?.focus({ preventScroll: true });
      haken.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
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

  /*
    UNTERLAGEN — nur mit Link des Beraters und solange er gilt. Die Liste
    wird mit FUNKTIONALEN Updates gefuehrt: Mehrere Dateien laden
    nacheinander, und jede meldet sich erst, wenn die naechste schon laeuft.
  */
  const darfHochladen = ANFRAGE !== null && supabaseKonfiguriert && codeStatus !== 'ungueltig' && senden !== 'fertig';
  const dokumentHinzu = (d: DokumentEintrag) =>
    setStand((s) => ({ ...s, antworten: { ...s.antworten, dokumente: [...s.antworten.dokumente, d] } }));
  const dokumentWeg = (pfad: string) =>
    setStand((s) => ({
      ...s, antworten: { ...s.antworten, dokumente: s.antworten.dokumente.filter((d) => d.pfad !== pfad) },
    }));
  /** Zugeklappt unter den Feldern; mit schon hochgeladenen Unterlagen offen. */
  const upload = (art: DokumentArt, titel: string, text?: string) => {
    if (!darfHochladen || !ANFRAGE) return undefined;
    const n = x.dokumente.filter((d) => d.art === art).length;
    return (
      <Aufklapper
        symbol={Camera}
        titel={art === 'sonstiges' ? 'Weitere Unterlagen hochladen' : 'Foto statt abtippen'}
        zusatz={n > 0
          ? `${n} ${n === 1 ? 'Unterlage' : 'Unterlagen'} hochgeladen`
          : `${UNTERLAGE_KURZ[art]} hochladen — Ihr Berater liest die Zahlen ab.`}
        offenAnfangs={n > 0}
      >
        <DokumentHochladen
          eingebettet
          code={ANFRAGE}
          art={art}
          titel={titel}
          text={text}
          alle={x.dokumente}
          einwilligung={x.dokumenteEinwilligung}
          onEinwilligung={(b) => setze({ dokumenteEinwilligung: b })}
          onHinzu={dokumentHinzu}
          onEntfernt={dokumentWeg}
        />
      </Aufklapper>
    );
  };
  const setzePerson = (id: 'a' | 'b', p: Partial<PersonAntwort>) =>
    setStand((s) => ({ ...s, antworten: { ...s.antworten, [id]: { ...s.antworten[id], ...p } } }));
  const geheZu = (i: number) => {
    setStand((s) => ({ ...s, schritt: Math.max(0, Math.min(SCHRITTE.length - 1, i)) }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

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

  const erster = schritt === 0;
  const fertig = senden === 'fertig';
  const personen: ['a' | 'b', string][] = x.verheiratet
    ? [['a', x.a.name.trim() || 'Sie'], ['b', x.b.name.trim() || 'Partner/in']]
    : [['a', 'Sie']];

  return (
    <div className="check-seite min-h-screen bg-ui-flaeche text-ui-tinte print:min-h-0 print:bg-white">
      <SeitenKopf breite="max-w-4xl" />

      {/* Am Telefon bleibt unten Platz fuer die haftende Leiste mit „Weiter“. */}
      <main className="mx-auto max-w-4xl px-4 pb-32 pt-4 sm:px-6 sm:pb-10 sm:pt-10">
        {/* Titel und Einleitung nur ueber dem ersten Schritt: Danach zaehlt die Frage, nicht die Begruessung. */}
        {erster && !fertig && (
          <>
            <Titel gross>
              Ihre Vorsorge in <Hervor>7 Schritten</Hervor>
            </Titel>
            {/*
              MIT LINK DES BERATERS. Der Name des Beraters steht hier bewusst
              NICHT: Konten kann jeder anlegen, ein angezeigter Name bewiese
              also nichts. Wahr ist allein, dass die Angaben dorthin gehen,
              woher der Link kam — und genau das steht da.
            */}
            <p className={`mt-3 ${EINLEITUNG}`}>
              {ANFRAGE
                ? 'Ihr Berater hat Sie um diese Angaben gebeten. Am Ende senden Sie sie mit einem Klick an ihn — ohne Konto.'
                : 'Sieben kurze Schritte, dann rechnet der Rentenplaner Ihre Versorgung im Ruhestand durch.'}
            </p>
            <ul className="mt-4 space-y-1.5 text-sm leading-relaxed text-ui-tinte">
              {[
                'Was Sie nicht wissen oder nicht zur Hand haben, lassen Sie frei.',
                ...(darfHochladen ? ['Unterlagen können Sie fotografieren, statt abzutippen.'] : []),
                ...(ANFRAGE ? ['Ihr Zwischenstand bleibt auf diesem Gerät gespeichert.'] : []),
              ].map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-ui-schiefer" aria-hidden /> {t}
                </li>
              ))}
            </ul>
          </>
        )}

        {/* Stimmt mit dem Link etwas nicht, steht es ueber jedem Schritt: abgelaufen in Rot, sonst ruhig. */}
        {ANFRAGE && !fertig && (codeStatus === 'ungueltig' || codeStatus === 'fehler') && (
          <div role="status" className={`rounded-[10px] px-4 py-3 text-sm leading-relaxed [&_strong]:font-medium ${
            erster ? 'mt-5' : 'mb-4'} ${
            codeStatus === 'ungueltig' ? 'border border-rose-200 bg-rose-50 text-rose-900' : 'ui-innen text-ui-tinte'
          }`}>
            {codeStatus === 'ungueltig'
              ? <><strong>Dieser Link ist abgelaufen oder wurde schon genutzt.</strong> Bitte fragen Sie
                  Ihren Berater nach einem neuen Link. Ihre Eingaben bleiben auf diesem Gerät erhalten.</>
              : <>Die Verbindung zum Server ließ sich gerade nicht prüfen. Sie können trotzdem
                  ausfüllen — beim Absenden wird es erneut versucht.</>}
          </div>
        )}

        {fertig ? (
          <section className="ui-karte mt-4 p-6 text-center sm:p-10">
            <CheckCircle2 className="mx-auto h-12 w-12 text-ui-tinte" aria-hidden />
            <Titel klasse="mt-4">Vielen Dank!</Titel>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ui-schiefer">
              Ihre Angaben sind bei Ihrem Berater angekommen. Er rechnet Ihre Vorsorge damit durch
              und bespricht das Ergebnis mit Ihnen. Auf diesem Gerät ist nichts mehr gespeichert.
            </p>
          </section>
        ) : (<>

        {/*
          FORTSCHRITT als duenne Linien wie die Schrittleiste der Beratung:
          aktuell volle Tinte, erledigt halbe, offen Haarlinie — statt Blau
          und Gruen. Erledigt heisst vollstaendig, nicht nur besucht.
        */}
        <div className={`${erster ? 'mt-8' : ''} print:hidden`}>
          <Etappen
            schritte={SCHRITTE}
            aktiv={schritt}
            onWechsel={geheZu}
            beschriftung="Schritte"
            erledigt={(i) => i < SCHRITTE.length - 1 && vollstaendig(i, x)}
          />
        </div>

        {/*
          Der aktuelle Schritt: eine weisse Karte. Oben die Frage, darunter
          gleich die Felder; Hilfe und Hochladen klappen darunter auf. Ab dem
          zweiten Schritt ist die Frage die Hauptueberschrift der Seite.
        */}
        <section className="ui-karte mt-4 p-5 sm:p-7 print:hidden">
          <FrageKopf frage={FRAGEN[schritt]!} als={erster ? 'h2' : 'h1'} />

          {schritt === 0 && <SchrittHaushalt x={x} setze={setze} setzePerson={setzePerson} />}
          {schritt === 1 && (
            <SchrittEinkommen x={x} personen={personen} setzePerson={setzePerson}
              upload={upload('einkommen', 'Statt abtippen: Gehaltsabrechnung hochladen',
                'Foto oder PDF der letzten Abrechnung (bei Beamten der Bezügemitteilung), bis 10 MB je Datei.')} />
          )}
          {schritt === 2 && (
            <SchrittKv x={x} setze={setze} personen={personen}
              upload={upload('kv', 'Statt abtippen: Beitragsrechnung hochladen',
                'Privat versichert: die Beitragsrechnung; gesetzlich: ein Foto der Versichertenkarte genügt.')} />
          )}
          {schritt === 3 && (
            <SchrittRente x={x} personen={personen} setzePerson={setzePerson}
              upload={upload('rente', 'Statt abtippen: Renteninformation hochladen',
                'Die Seite mit „Höhe Ihrer künftigen Regelaltersrente“ — oder die Versorgungsauskunft.')} />
          )}
          {schritt === 4 && (
            <SchrittVertraege x={x} setze={setze}
              upload={upload('vertraege', 'Statt abtippen: Standmitteilungen hochladen',
                'Je Vertrag die letzte Standmitteilung oder den Depotauszug, bis 10 MB je Datei.')} />
          )}
          {schritt === 5 && <SchrittZiel x={x} setze={setze} />}
          {schritt === 6 && (
            <SchrittUebersicht
              x={x}
              geheZu={geheZu}
              anfrage={ANFRAGE !== null}
              einwilligung={einwilligung}
              setEinwilligung={(b) => { setEinwilligung(b); if (b) setErinnern(false); }}
              haken={haken}
              erinnern={erinnern}
              upload={upload('sonstiges', 'Weitere Unterlagen hochladen',
                'Was sonst noch hilft — Versicherungsschein, Bescheid, Angebot. Foto oder PDF, bis 10 MB.')}
            />
          )}
          {schritt === 6 && senden === 'fehler' && (
            <p role="alert" className={`mt-4 ${FEHLER}`}>
              Das Senden hat nicht geklappt — bitte prüfen Sie Ihre Internetverbindung und versuchen
              Sie es noch einmal. Ihre Angaben sind nicht verloren.
            </p>
          )}
          {/* Statt eines zweiten Knopfs „Habe ich gerade nicht zur Hand“: „Weiter“ geht immer. */}
          {schritt < SCHRITTE.length - 1 && !vollstaendig(schritt, x) && (
            <p className="mt-6 text-sm leading-relaxed text-ui-schiefer">
              Nicht alles zur Hand? Gehen Sie einfach weiter — Sie können es später ergänzen.
            </p>
          )}
        </section>

        {/*
          NAVIGATION. Am Telefon haftet sie am unteren Rand: „Weiter“ liegt
          immer unter dem Daumen, gleich wie lang der Schritt ist. Ab der
          Breite eines Tablets steht sie unter der Karte, Weiter rechts.
        */}
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-ui-linie bg-ui-karte px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:static sm:z-auto sm:mt-6 sm:border-0 sm:bg-transparent sm:p-0 print:hidden">
          <div className="mx-auto flex max-w-4xl items-center gap-2">
            {schritt > 0 && (
              <button type="button" onClick={() => geheZu(schritt - 1)} className={`${KNOPF_ZWEIT} min-h-[3rem] sm:min-h-0`}>
                <ArrowLeft className="h-4 w-4" aria-hidden /> Zurück
              </button>
            )}
            <span className="hidden flex-1 sm:block" />
            {schritt < SCHRITTE.length - 1 ? (
              <button type="button" onClick={() => geheZu(schritt + 1)} className={`${KNOPF} min-h-[3rem] flex-1 sm:min-h-0 sm:flex-none`}>
                Weiter <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            ) : ANFRAGE ? (
              <button
                type="button"
                onClick={() => void absenden()}
                disabled={codeStatus === 'ungueltig' || senden === 'laeuft'}
                className={`${KNOPF} min-h-[3rem] flex-1 disabled:cursor-not-allowed sm:min-h-0 sm:flex-none`}
              >
                <Send className="h-4 w-4" aria-hidden />
                {senden === 'laeuft' ? 'Wird gesendet …' : 'An meinen Berater senden'}
              </button>
            ) : (
              <button type="button" onClick={berechnen} className={`${KNOPF} min-h-[3rem] flex-1 sm:min-h-0 sm:flex-none`}>
                <Calculator className="h-4 w-4" aria-hidden /> Ergebnis berechnen
              </button>
            )}
          </div>
        </div>

        </>)}

        <p className="mt-8 text-center text-xs leading-relaxed text-ui-schiefer">
          {ANFRAGE
            ? `Ihre Angaben bleiben in Ihrem Browser, bis Sie sie absenden. Übermittelt werden sie verschlüsselt und nur an Ihren Berater.${
              x.dokumente.length > 0 ? ' Hochgeladene Unterlagen liegen bis dahin geschützt auf dem Server; Ihr Berater sieht sie erst nach dem Absenden.' : ''}`
            : 'Ihre Angaben bleiben in Ihrem Browser, bis Sie „Ergebnis berechnen“ wählen.'}{' '}
          Modellrechnung ohne Gewähr; keine Steuer-, Renten- oder Anlageberatung.
        </p>
        <RechtsLinks klasse="mt-4" />
      </main>

      <Dialog
        offen={ersetzenOffen}
        titel="Vorhandene Angaben ersetzen?"
        beschreibung="In diesem Browser ist schon eine Berechnung gespeichert. Ihre Angaben aus dem Vorsorge-Check treten an ihre Stelle."
        onSchliessen={() => setErsetzenOffen(false)}
      >
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => setErsetzenOffen(false)} className={KNOPF_ZWEIT}>
            Abbrechen
          </button>
          <button type="button" onClick={uebernehmen} className={KNOPF}>
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

/** Zeichen, Frage und ein Satz dazu — der Kopf jedes Schritts. */
function FrageKopf({ frage, als }: { frage: (typeof FRAGEN)[number]; als: 'h1' | 'h2' }) {
  const Zeichen = frage.symbol;
  return (
    <>
      <span aria-hidden className="ui-innen mb-3 flex h-11 w-11 items-center justify-center rounded-full">
        <Zeichen className="h-5 w-5 text-ui-tinte" />
      </span>
      <Titel als={als}>{frage.titel}</Titel>
      <p className="mt-2 text-sm leading-relaxed text-ui-schiefer">{frage.unter}</p>
    </>
  );
}

/**
 * Eine Zeile zum Aufklappen unter den Feldern — so hoch, dass der Daumen sie
 * trifft. Zu: Symbol, Titel und ein Satz, was sich dahinter verbirgt.
 */
function Aufklapper({ symbol: Zeichen, titel, zusatz, offenAnfangs = false, children }: {
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
function Hilfe({ unterlage, children }: { unterlage: string; children: ReactNode }) {
  return (
    <Aufklapper symbol={HelpCircle} titel="Wo finde ich das?" zusatz={unterlage}>
      <div className="text-sm leading-relaxed text-ui-tinte [&_strong]:font-medium">{children}</div>
    </Aufklapper>
  );
}

/** Was beim Ausfuellen hilft — unter den Feldern eines Schritts: Hilfe und Hochladen. */
function Hilfen({ children }: { children: ReactNode }) {
  return <div className="mt-6 space-y-2">{children}</div>;
}

/** Ein Abschnitt der Karte; ab dem zweiten durch eine Haarlinie getrennt. Die Ueberschrift nennt die Person, wenn es zwei gibt. */
function Block({ titel, erster = false, children }: { titel?: string; erster?: boolean; children: ReactNode }) {
  return (
    <div className={erster ? 'mt-5' : 'mt-6 border-t border-ui-linie pt-6'}>
      {titel && <h3 className="mb-4 text-base font-medium text-ui-tinte">{titel}</h3>}
      {children}
    </div>
  );
}

/** Eine Wahl aus zwei, drei Antworten als grosse Knoepfe — am Telefon leichter zu treffen als ein Haken. */
function Wahl<T extends string>({ label, wert, optionen, onChange }: {
  label: string; wert: T; optionen: readonly { wert: T; text: string }[]; onChange: (v: T) => void;
}) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id}>
      <span id={id} className={FELD_LABEL}>{label}</span>
      <div className="grid grid-cols-2 gap-2">
        {optionen.map((o) => (
          <button
            key={o.wert}
            type="button"
            onClick={() => onChange(o.wert)}
            aria-pressed={wert === o.wert}
            // Gewaehlt wie ein Reiter: gefuellt in Soot.
            className={`min-h-[3rem] rounded-[8px] border px-3 py-2.5 text-left text-sm font-medium leading-snug transition-colors ${
              wert === o.wert
                ? 'border-ui-dunkel bg-ui-dunkel text-white'
                : 'border-ui-zweit-rand bg-ui-karte text-ui-tinte hover:bg-ui-hover'
            }`}
          >
            {o.text}
          </button>
        ))}
      </div>
    </div>
  );
}

const JA_NEIN = [{ wert: 'ja', text: 'Ja' }, { wert: 'nein', text: 'Nein' }] as const;

/** Eine kleine Anzahl mit Minus und Plus — statt eines Zahlenfelds mit winzigen Pfeilen. */
function Zaehler({ label, wert, max, onChange, weniger, mehr }: {
  label: string; wert: number; max: number; onChange: (n: number) => void; weniger: string; mehr: string;
}) {
  const id = useId();
  const knopf = 'flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-ui-zweit-rand bg-ui-karte text-ui-tinte hover:bg-ui-hover disabled:opacity-40';
  return (
    <div role="group" aria-labelledby={id}>
      <span id={id} className={FELD_LABEL}>{label}</span>
      <div className="flex items-center gap-4">
        <button type="button" onClick={() => onChange(Math.max(0, wert - 1))} disabled={wert <= 0} aria-label={weniger} className={knopf}>
          <Minus className="h-5 w-5" aria-hidden />
        </button>
        <output aria-live="polite" className="min-w-[2ch] text-center text-2xl font-medium tabular-nums text-ui-tinte">{wert}</output>
        <button type="button" onClick={() => onChange(Math.min(max, wert + 1))} disabled={wert >= max} aria-label={mehr} className={knopf}>
          <Plus className="h-5 w-5" aria-hidden />
        </button>
      </div>
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
      <Block erster>
        <div className="grid gap-4 sm:grid-cols-2">
          <NamenFelder {...namensTeile(x.a.name, x.a.vorname, x.a.nachname)} beschriftung={['Ihr Vorname', 'Ihr Nachname']}
            onChange={(teile) => setzePerson('a', mitName(teile))} eigener />
          <DatumFeld label="Ihr Geburtsdatum" wert={x.a.geburtsdatum}
            onChange={(s) => setzePerson('a', { geburtsdatum: s })} />
        </div>
      </Block>

      <Block>
        <Wahl
          label="Verheiratet oder in eingetragener Lebenspartnerschaft?"
          wert={x.verheiratet ? 'ja' : 'nein'}
          optionen={JA_NEIN}
          onChange={(v) => setze({ verheiratet: v === 'ja' })}
        />
        {x.verheiratet && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <NamenFelder {...namensTeile(x.b.name, x.b.vorname, x.b.nachname)}
              beschriftung={['Vorname Partner/in', 'Nachname Partner/in']} onChange={(teile) => setzePerson('b', mitName(teile))} />
            <DatumFeld label="Geburtsdatum Partner/in" wert={x.b.geburtsdatum}
              onChange={(s) => setzePerson('b', { geburtsdatum: s })} />
          </div>
        )}
        <div className="mt-5">
          <Zaehler
            label="Kinder"
            wert={x.kinder.length}
            max={15}
            weniger="Ein Kind weniger"
            mehr="Ein Kind mehr"
            onChange={(n) => setze({
              kinder: Array.from({ length: n }, (_, i) => x.kinder[i] ?? { geburtsjahr: JETZT - 5 }),
            })}
          />
          {x.kinder.length > 0 && (
            <div className="ui-innen mt-3 p-3">
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

      <Block>
        <div className="grid gap-4 sm:grid-cols-2">
          <AuswahlFeld label="Bundesland" wert={x.bundesland} onChange={(v) => setze({ bundesland: v })}
            optionen={BUNDESLAENDER.map((l) => ({ wert: l as string, text: l }))} />
          <Wahl
            label="Zahlen Sie Kirchensteuer?"
            wert={x.kirchensteuer ? 'ja' : 'nein'}
            optionen={JA_NEIN}
            onChange={(v) => setze({ kirchensteuer: v === 'ja' })}
          />
        </div>
      </Block>
    </>
  );
}

/* --- 2. Einkommen --------------------------------------------------------- */

function SchrittEinkommen({ x, personen, setzePerson, upload }: {
  x: Antworten; personen: ['a' | 'b', string][]; setzePerson: SetzePerson;
  /** „Statt abtippen: hochladen" — nur mit Link des Beraters */
  upload?: ReactNode;
}) {
  return (
    <>
      {personen.map(([id, name], i) => (
        <Block key={id} erster={i === 0} titel={personen.length > 1 ? name : undefined}>
          <EinkommenFelder
            wert={x[id].einkommen}
            onChange={(p) => setzePerson(id, { einkommen: { ...x[id].einkommen, ...p } })}
            spalten={2}
          />
        </Block>
      ))}
      <Hilfen>
        <Hilfe unterlage="Auf der Gehaltsabrechnung">
          Ihre letzte <strong>Gehaltsabrechnung</strong>: das Gesamtbrutto eines normalen Monats, ohne
          Sonderzahlungen — Weihnachts- und Urlaubsgeld stecken in der Anzahl der Gehälter.
          Beamte: die <strong>Bezügemitteilung</strong> (Besoldungsgruppe, Stufe).
          Selbstständige: der Gewinn aus dem letzten <strong>Steuerbescheid</strong>, geteilt durch 12.
        </Hilfe>
        {upload}
      </Hilfen>
    </>
  );
}

/* --- 3. Krankenversicherung ----------------------------------------------- */

const KASSEN = [
  // Kurz: In der halben Spalte wuerde ein laengerer Text abgeschnitten. Was gilt, wenn die Kasse fehlt, steht am Zusatzbeitrag.
  { wert: '', text: 'Bitte wählen' },
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

function SchrittKv({ x, setze, personen, upload }: {
  x: Antworten; setze: Setze; personen: ['a' | 'b', string][]; upload?: ReactNode;
}) {
  const kB = x.kvB;
  const setzeB = (p: Partial<Antworten['kvB']>) => setze({ kvB: { ...kB, ...p } });
  return (
    <>
      <Block erster titel={personen.length > 1 ? personen[0]![1] : undefined}>
        <div className="grid grid-cols-2 gap-2">
          {(['gesetzlich', 'privat'] as const).map((art) => (
            <button
              key={art}
              type="button"
              onClick={() => setze({ kv: art })}
              aria-pressed={x.kv === art}
              // Gewaehlt wie ein Reiter: gefuellt in Soot.
              className={`min-h-[3rem] rounded-[8px] border px-3 py-2.5 text-left text-sm font-medium leading-snug transition-colors ${
                x.kv === art
                  ? 'border-ui-dunkel bg-ui-dunkel text-white'
                  : 'border-ui-zweit-rand bg-ui-karte text-ui-tinte hover:bg-ui-hover'
              }`}
            >
              {art === 'gesetzlich' ? 'Gesetzlich versichert' : 'Privat versichert'}
            </button>
          ))}
        </div>

        {x.kv === 'gesetzlich' ? (
          <GesetzlichFelder kasse={x.krankenkasse} satz={x.zusatzbeitrag} setze={setze} />
        ) : (
          <PkvFelder wert={x.pkv} onChange={(p) => setze({ pkv: p })} einfach />
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
            <PkvFelder wert={kB.pkv} onChange={(p) => setzeB({ pkv: p })} titel="Private Krankenversicherung Partner/in" einfach />
          )}
        </Block>
      )}
      <Hilfen>
        <Hilfe unterlage="Krankenkasse oder Beitragsrechnung">
          Gesetzlich versichert: nur der <strong>Name Ihrer Krankenkasse</strong> — den Zusatzbeitrag
          kennen wir. Privat versichert: Ihre <strong>Beitragsrechnung</strong> oder das letzte
          Schreiben zur Beitragsanpassung (Monatsbeitrag gesamt, ggf. Beitragsentlastungstarif).
        </Hilfe>
        {upload}
      </Hilfen>
    </>
  );
}

/* --- 4. Gesetzliche Rente / Pension --------------------------------------- */

function SchrittRente({ x, personen, setzePerson, upload }: {
  x: Antworten; personen: ['a' | 'b', string][]; setzePerson: SetzePerson; upload?: ReactNode;
}) {
  return (
    <>
      {personen.map(([id, name], i) => (
        <RenteJePerson key={id} p={x[id]} name={personen.length > 1 ? name : undefined} erster={i === 0}
          setze={(p) => setzePerson(id, p)} />
      ))}
      <Hilfen>
        <Hilfe unterlage="Auf der Renteninformation">
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
            className={`${LINK} mt-2 underline`}
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Renteninformation / Rentenauskunft online anfordern (Deutsche Rentenversicherung)
          </a>
        </Hilfe>
        {upload}
      </Hilfen>
    </>
  );
}

function RenteJePerson({ p, name, erster, setze }: {
  p: PersonAntwort; name?: string; erster: boolean; setze: (p: Partial<PersonAntwort>) => void;
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
    <Block erster={erster} titel={name}>
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
            <p className="mb-3 text-xs leading-relaxed text-ui-schiefer">
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
                className={`${KNOPF_ZWEIT} min-h-[3rem] w-full disabled:cursor-not-allowed sm:mb-6 sm:min-h-0 sm:w-auto`}
              >
                <Calculator className="h-4 w-4" aria-hidden /> Keine Renteninformation? Schätzen
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

function SchrittVertraege({ x, setze, upload }: { x: Antworten; setze: Setze; upload?: ReactNode }) {
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
      {x.vertraege.length === 0 && (
        <p className="mt-5 rounded-[10px] border border-dashed border-ui-feld-rand px-4 py-5 text-center text-sm text-ui-schiefer">
          {x.dokumente.some((d) => d.art === 'vertraege')
            ? 'Ihre Standmitteilungen sind hochgeladen — Ihr Berater übernimmt die Verträge daraus.'
            : 'Noch keine Verträge. Keine zu haben ist auch eine Angabe — dann einfach weiter.'}
        </p>
      )}

      {x.vertraege.map((v, i) => {
        const depot = v.typ === 'etf';
        const avd = v.typ === 'avd';
        const immobilie = v.typ === 'immobilie';
        return (
          <Block key={v.id} erster={i === 0}>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-base font-medium text-ui-tinte">Vertrag {i + 1}</span>
              <button
                type="button"
                onClick={() => setze({ vertraege: x.vertraege.filter((w) => w.id !== v.id) })}
                aria-label={`Vertrag ${i + 1} entfernen`}
                className="rounded-full p-2 text-ui-schiefer hover:bg-rose-50 hover:text-rose-700"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
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

      <button type="button" onClick={neu} className={`mt-5 min-h-[3rem] w-full sm:min-h-0 sm:w-auto ${KNOPF_ZWEIT}`}>
        <Plus className="h-4 w-4" aria-hidden /> Vertrag hinzufügen
      </button>
      <Hilfen>
        <Hilfe unterlage="Auf der Standmitteilung">
          Die jährliche <strong>Standmitteilung</strong> jedes Vertrags: die garantierte bzw.
          prognostizierte Monatsrente, der aktuelle Beitrag und das Beginnjahr. Bei Betriebsrenten
          den Anteil Ihres Arbeitgebers (Gehaltsabrechnung). Für Depots den aktuellen{' '}
          <strong>Depotauszug</strong>. Die gesetzliche Rente gehört nicht hierher — die kam in Schritt 4.
        </Hilfe>
        {upload}
      </Hilfen>
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
      <Block erster>
        <div className="grid items-end gap-4 sm:grid-cols-2">
          <ZahlFeld label="Gewünschtes Netto im Monat (heutiges Geld)" wert={x.zielNettoHeute}
            onChange={(n) => setze({ zielNettoHeute: n })} einheit="€" />
          {vorschlag > 0 && (
            <button
              type="button"
              onClick={() => setze({ zielNettoHeute: vorschlag })}
              className="mb-0.5 min-h-[3rem] rounded-[8px] border border-ui-zweit-rand bg-ui-karte px-3 py-2 text-left text-sm text-ui-tinte transition-colors hover:bg-ui-hover"
            >
              Vorschlag übernehmen: <span className="font-medium">{euro(vorschlag)}</span>
              <span className="block text-xs text-ui-schiefer">
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

function SchrittUebersicht({ x, geheZu, anfrage, einwilligung, setEinwilligung, haken, erinnern, upload }: {
  x: Antworten;
  geheZu: (i: number) => void;
  /** Mit Link des Beraters: senden statt selbst berechnen */
  anfrage: boolean;
  einwilligung: boolean;
  setEinwilligung: (b: boolean) => void;
  /** Der Haken der Einwilligung — „Senden“ ohne ihn fuehrt hierher */
  haken: RefObject<HTMLInputElement>;
  erinnern: boolean;
  /** „Weitere Unterlagen" — nur mit Link */
  upload?: ReactNode;
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
      {/* Zeilen mit Haarlinien wie die Liste der Beratungen; offen ein leerer Kreis, erledigt ein Haken — in Tinte. */}
      <ul className="mt-5 divide-y divide-ui-linie border-y border-ui-linie">
        {SCHRITTE.slice(0, 6).map((t, i) => {
          const ok = vollstaendig(i, x);
          const unterlagen = unterlagenZu(i, x);
          const nurUnterlagen = unterlagen > 0 && !felderVollstaendig(i, x);
          return (
            <li key={t} className="flex items-center gap-3 py-3">
              {ok
                ? <CheckCircle2 className="h-5 w-5 shrink-0 text-ui-tinte" aria-label="vollständig" />
                : <CircleDashed className="h-5 w-5 shrink-0 text-ui-schiefer" aria-label="offen" />}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-ui-tinte">{t}</div>
                <div className="truncate text-xs text-ui-schiefer">
                  {nurUnterlagen
                    ? `${unterlagen} Unterlage${unterlagen > 1 ? 'n' : ''} hochgeladen — Ihr Berater liest die Zahlen ab`
                    : ok
                      ? `${zusammenfassung[i]}${unterlagen > 0 ? ` · ${unterlagen} Unterlage${unterlagen > 1 ? 'n' : ''}` : ''}`
                      : anfrage ? 'Noch offen' : 'Noch offen — der Rechner nimmt einen Standardwert.'}
                </div>
              </div>
              <button type="button" onClick={() => geheZu(i)} className={KNOPF_KLEIN}>
                {ok ? 'Ändern' : 'Ergänzen'}
              </button>
            </li>
          );
        })}
      </ul>

      {upload && <Hilfen>{upload}</Hilfen>}

      {anfrage ? (
        <div className="ui-innen mt-5 p-4 text-sm leading-relaxed text-ui-tinte [&_strong]:font-medium">
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

            AUSDRUECKLICH nach Art. 9 Abs. 2 lit. a DSGVO: Kirchensteuer
            (Religion) und ein PKV-Zuschlag (Gesundheit) sind besondere
            Kategorien. Eine pauschale Einwilligung deckt sie nicht — sie
            muessen beim Namen genannt sein. Die Loeschfrist steht hier, weil
            der Kunde sonst nicht weiss, wie lange er einwilligt.
          */}
          <label className={`mt-3 flex cursor-pointer items-start gap-2.5 rounded-[8px] border border-ui-linie bg-ui-karte p-3 text-xs leading-relaxed text-ui-tinte ${
            erinnern ? 'ring-2 ring-ui-knopf' : ''}`}>
            <input
              ref={haken}
              type="checkbox"
              checked={einwilligung}
              onChange={(e) => setEinwilligung(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0"
            />
            <span>
              Ich willige ein, dass meine Angaben{x.dokumente.length > 0 && ' und die hochgeladenen Unterlagen'} an
              meinen Berater übermittelt und für die Beratung gespeichert werden — bis er sie gelöscht hat,{' '}
              <strong>höchstens 90 Tage</strong>. Das
              schließt ausdrücklich Angaben ein, die Rückschlüsse auf meine Religionszugehörigkeit
              (Kirchensteuer) oder meine Gesundheit (Zuschlag der privaten Krankenversicherung) zulassen
              (Art. 9 Abs. 2 lit. a DSGVO). Die Einwilligung ist freiwillig und kann jederzeit mit Wirkung
              für die Zukunft bei meinem Berater widerrufen werden. Mehr in der{' '}
              <a href="/datenschutz" target="_blank" rel="noopener" className="font-medium text-ui-tinte underline underline-offset-2">
                Datenschutzerklärung
              </a>.
            </span>
          </label>
          {erinnern && (
            <p role="alert" className="mt-1.5 text-xs font-medium text-rose-700">
              Bitte setzen Sie zuerst den Haken — dann können Sie Ihre Angaben senden.
            </p>
          )}
        </div>
      ) : (
      <div className="ui-innen mt-5 p-4 text-sm leading-relaxed text-ui-tinte [&_strong]:font-medium">
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
