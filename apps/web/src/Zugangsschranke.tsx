import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from './store/auth';
import { supabase, supabaseKonfiguriert } from './lib/supabase';
import { NUTZUNGSBEDINGUNGEN_FASSUNG } from './lib/nutzungsbedingungen';
import { Anmeldung } from './features/Anmeldung';
import { Zustimmung } from './features/Zustimmung';

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
 */
export function Zugangsschranke({ children }: { children: ReactNode }) {
  const status = useAuth((s) => s.status);
  const initialisieren = useAuth((s) => s.initialisieren);

  useEffect(() => { void initialisieren(); }, [initialisieren]);

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
  if (status === 'prueft') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-sm text-slate-500">Einen Moment …</p>
      </div>
    );
  }

  if (status !== 'angemeldet') return <Anmeldung />;

  if (zugestimmt === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-sm text-slate-500">Einen Moment …</p>
      </div>
    );
  }
  if (!zugestimmt) return <Zustimmung onFertig={() => setZugestimmt(true)} />;

  return <>{children}</>;
}
