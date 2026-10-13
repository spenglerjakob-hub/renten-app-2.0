import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { Bereich } from '@renten/schema/preise';
import { useAuth } from './store/auth';
import { deckt, useZugang, wirksam } from './store/zugang';
import { supabase, supabaseKonfiguriert } from './lib/supabase';
import { NUTZUNGSBEDINGUNGEN_FASSUNG } from './lib/nutzungsbedingungen';
import { einladungAusAdresse, fruehstartAusAdresse, offeneEinladung, offenerFruehstart } from './lib/einladung';
import { Anmeldung } from './features/Anmeldung';
import { Zustimmung } from './features/Zustimmung';
import { EinladungsBand, FruehstartBand, VorschauBand, ZugangsBand } from './features/ZugangsBand';
import { Dialog } from './components/Dialog';

// Selten gebraucht — erst laden, wenn es so weit ist.
const Sperrseite = lazy(() => import('./features/Sperrseite').then((m) => ({ default: m.Sperrseite })));
const AboTeam = lazy(() => import('./features/AboTeam').then((m) => ({ default: m.AboTeam })));
const Rueckmeldung = lazy(() => import('./features/Rueckmeldung').then((m) => ({ default: m.Rueckmeldung })));

/**
 * Laesst den Rechner nur angemeldeten Nutzern durch.
 *
 * WICHTIG, damit das spaeter niemand fuer mehr haelt, als es ist: Das ist
 * ZUGANGSSTEUERUNG, KEINE GEHEIMHALTUNG. Der Rechner laeuft vollstaendig im
 * Browser — wer das JavaScript herunterlaedt, kann die Rechenlogik auch ohne
 * Konto ausfuehren. Wirklich geschuetzt sind die gespeicherten Szenarien:
 * dort greifen die Row-Level-Security-Regeln der Datenbank.
 *
 * Sie steht vor dem Rechner und vor allen eigenen Seiten (Arbeitgeber-Seiten,
 * bKV, Vorsorge-Check ohne Link). Ohne Konto erreichbar sind nur:
 *   - /altersvorsorgedepot — Ziel des QR-Codes aus dem Kundenbrief; wer ihn
 *     scannt, hat naturgemaess noch kein Konto,
 *   - /vorsorge-check?a=<Code> — der persoenliche Link des Beraters,
 *   - Impressum und Datenschutz, die jederzeit erreichbar sein muessen.
 *
 * Nach Anmeldung und Zustimmung kommt das PAKET: Deckt es den `bereich` der
 * Seite nicht ab (Testphase vorbei, Abo beendet, nur das andere Paket),
 * erscheint statt der Seite die Sperrseite. Was gilt, entscheidet der
 * Server (`store/zugang.ts`).
 */
export function Zugangsschranke({ children, bereich }: { children: ReactNode; bereich: Bereich }) {
  const status = useAuth((s) => s.status);
  const initialisieren = useAuth((s) => s.initialisieren);
  const zuruecksetzen = useZugang((s) => s.zuruecksetzen);

  useEffect(() => { void initialisieren(); }, [initialisieren]);

  // Persoenliche Links — Einladung ins Buero, Early Adopter: merken,
  // eingeloest wird nach der Anmeldung.
  const [links] = useState(() => {
    if (typeof window !== 'undefined') {
      einladungAusAdresse();
      fruehstartAusAdresse();
    }
    return { einladung: offeneEinladung() !== null, fruehstart: offenerFruehstart() !== null };
  });

  // Abgemeldet: Der Zugang des vorigen Kontos gilt nicht mehr.
  useEffect(() => { if (status === 'abgemeldet') zuruecksetzen(); }, [status, zuruecksetzen]);

  // Hat das Konto der aktuellen Fassung der Nutzungsbedingungen zugestimmt?
  // null: noch nicht geprueft. Die Sitzung liegt lokal vor, das kostet keine
  // Anfrage an den Server.
  const [zugestimmt, setZugestimmt] = useState<boolean | null>(null);
  useEffect(() => {
    if (status !== 'angemeldet' || !supabase) { setZugestimmt(null); return; }
    let aktiv = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (aktiv) setZugestimmt(data.session?.user.user_metadata?.nutzungsbedingungen === NUTZUNGSBEDINGUNGEN_FASSUNG);
    });
    return () => { aktiv = false; };
  }, [status]);

  // Ohne Supabase-Konfiguration wird durchgelassen — mit deutlichem Band.
  // Andernfalls legte eine vergessene Umgebungsvariable die ganze Seite lahm,
  // und das waere ein schlechterer Ausgang als ein offener Rechner. Der
  // Deploy-Lauf bricht deshalb ab, wenn die Konfiguration im Bundle fehlt.
  if (!supabaseKonfiguriert) {
    return (
      <>
        <div className="flex items-start gap-2 bg-amber-100 px-4 py-2 text-xs leading-relaxed text-amber-900 print:hidden">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            <strong>Anmeldung nicht eingerichtet.</strong> Diese Fassung läuft ohne Zugangsschutz,
            weil die Verbindung zum Konto-Dienst fehlt. Gespeicherte Szenarien stehen nicht zur
            Verfügung.
          </span>
        </div>
        {children}
      </>
    );
  }

  // Die Sitzung liegt im lokalen Speicher, wird aber asynchron gelesen. Ohne
  // diesen Zwischenschritt blitzte bei jedem Neuladen kurz die Anmeldemaske
  // auf, obwohl man angemeldet ist.
  if (status === 'prueft') return <Moment />;

  if (status !== 'angemeldet') return <Anmeldung einladung={links.einladung} fruehstart={links.fruehstart} />;

  if (zugestimmt === null) return <Moment />;
  if (!zugestimmt) return <Zustimmung onFertig={() => setZugestimmt(true)} />;

  return <PaketPruefung bereich={bereich}>{children}</PaketPruefung>;
}

function Moment() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100">
      <p className="text-sm text-slate-500">Einen Moment …</p>
    </div>
  );
}

/**
 * Deckt das Paket diese Seite ab? Sonst die Sperrseite.
 *
 * Gesperrt wird nur auf die FRISCHE Antwort des Servers hin; der
 * Zwischenspeicher darf nur durchlassen. Kommt keine brauchbare Antwort,
 * bleibt die Seite offen (siehe `store/zugang.ts`).
 */
function PaketPruefung({ bereich, children }: { bereich: Bereich; children: ReactNode }) {
  const konto = useAuth((s) => s.email) ?? '';
  const laden = useZugang((s) => s.laden);
  const linksEinloesen = useZugang((s) => s.linksEinloesen);
  const oeffneFenster = useZugang((s) => s.oeffneFenster);
  const z = useZugang((s) => (s.fuer === konto ? wirksam(s) : null));
  const frisch = useZugang((s) => s.fuer === konto && (s.stand === 'da' || s.stand === 'fehler'));
  const loestEin = useZugang((s) => s.loestEin);

  useEffect(() => {
    void laden(konto);
    void linksEinloesen();
  }, [konto, laden, linksEinloesen]);

  // `/?abo` oeffnet das Fenster "Abo & Team" — etwa aus einer Mail oder nach der Kasse.
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      if (!u.searchParams.has('abo')) return;
      u.searchParams.delete('abo');
      window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash);
      oeffneFenster();
    } catch { /* nur Komfort */ }
  }, [oeffneFenster]);

  if (loestEin || (!frisch && (!z || !deckt(z, bereich)))) return <Moment />;

  const offen = !z || deckt(z, bereich);
  return (
    <>
      <VorschauBand />
      <EinladungsBand />
      <FruehstartBand />
      {offen ? (
        <>
          <ZugangsBand />
          {children}
        </>
      ) : (
        <Suspense fallback={<Moment />}>
          <Sperrseite bereich={bereich} zugang={z} />
        </Suspense>
      )}
      <AboFenster />
      <RueckmeldungsFenster />
    </>
  );
}

function RueckmeldungsFenster() {
  const offen = useZugang((s) => s.rueckmeldungOffen);
  const schliessen = useZugang((s) => s.schliesseRueckmeldung);
  return (
    <Dialog offen={offen} titel="Feedback geben" beschreibung="Was hilft Ihnen, was fehlt, was stört? Jede Rückmeldung lesen wir selbst." onSchliessen={schliessen}>
      <Suspense fallback={<p className="text-sm text-slate-500">Einen Moment …</p>}>
        <Rueckmeldung />
      </Suspense>
    </Dialog>
  );
}

function AboFenster() {
  const offen = useZugang((s) => s.fensterOffen);
  const schliessen = useZugang((s) => s.schliesseFenster);
  return (
    <Dialog offen={offen} titel="Abo & Team" beschreibung="Ihr Paket, Ihr Büro und Ihre Kollegen." onSchliessen={schliessen}>
      <Suspense fallback={<p className="text-sm text-slate-500">Einen Moment …</p>}>
        <AboTeam />
      </Suspense>
    </Dialog>
  );
}
