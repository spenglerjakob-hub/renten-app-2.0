import { useEffect, useState, type ReactNode } from 'react';
import { Download, LineChart, LogOut, Users } from 'lucide-react';
import {
  FRUEHSTART_MONATE, FRUEHSTART_RABATT_PROZENT, paketVon, preisJeNutzer, type Bereich,
} from '@renten/schema/preise';
import { Logo } from '../components/Logo';
import { RechtsLinks } from '../components/RechtsLinks';
import { ARBEITGEBER, KUNDEN, type Seite } from '../components/Seitenleiste';
import { PaketBuchung, preisText } from '../components/PaketWahl';
import { supabase } from '../lib/supabase';
import { zumPortal, zurKasse, useWeiterleitung } from '../lib/abo';
import { bueroVerlassen, mitgliederLaden } from '../lib/team';
import { useAuth } from '../store/auth';
import { aboAktiv, datum, fruehstartVorbei, useZugang, type Zugang } from '../store/zugang';
import { KontoLoeschen } from './KontoLoeschen';

/**
 * Statt der Seite, wenn das Paket diesen Teil nicht abdeckt.
 *
 * DREI FAELLE:
 *  - Kein Paket (Testphase oder Early-Adopter-Zeit vorbei, Abo beendet):
 *    Paket waehlen und buchen — Early Adopter mit Dank und Rabatt.
 *  - Mitglied eines Bueros ohne Platz oder ohne laufendes Abo: an den
 *    Inhaber wenden — oder austreten und selbst buchen.
 *  - Ein Paket fuer den anderen Teil (nur Rente oder nur AG): die
 *    enthaltenen Seiten verlinken und den Wechsel zu "All inklusive" anbieten.
 *
 * IMMER DABEI: Abmelden, die gespeicherten Szenarien als Datei (Art. 20
 * DSGVO) und Konto loeschen (Art. 17). Ohne Paket gehen keine Daten
 * verloren — es entsteht nur nichts Neues.
 */
export function Sperrseite({ bereich, zugang }: { bereich: Bereich; zugang: Zugang }) {
  const vorschau = useZugang((s) => s.vorschau !== null && s.zugang?.betreiber === true);
  const inhalt = zugang.paket
    ? <AnderesPaket z={zugang} bereich={bereich} vorschau={vorschau} />
    : zugang.rolle === 'mitglied'
      ? <OhnePlatz z={zugang} vorschau={vorschau} />
      : <PaketWaehlen z={zugang} vorschau={vorschau} />;

  return (
    <div className="flex min-h-screen flex-col bg-slate-100 text-slate-800">
      <Kopf mitBuero={zugang.buero !== null} />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-8 sm:px-6 sm:py-10">
        {inhalt}
        <KontoKasten />
      </main>
      <footer className="mx-auto w-full max-w-3xl px-4 pb-8 sm:px-6">
        <RechtsLinks />
      </footer>
    </div>
  );
}

function Kopf({ mitBuero }: { mitBuero: boolean }) {
  const abmelden = useAuth((s) => s.abmelden);
  const oeffneFenster = useZugang((s) => s.oeffneFenster);
  return (
    <header className="bg-slate-900 text-white">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4 sm:px-6">
        <Logo klasse="h-9 w-9 shrink-0" />
        <div className="min-w-0 flex-1">
          <span className="block truncate text-sm font-black tracking-tight">JS-Rentenplaner</span>
          <p className="hidden text-xs text-slate-400 sm:block">Ihre Zukunft. Smart geplant.</p>
        </div>
        {mitBuero && (
          <button type="button" onClick={oeffneFenster} aria-label="Abo & Team" title="Abo & Team"
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-800">
            <Users className="h-3.5 w-3.5" aria-hidden /> <span className="hidden sm:inline">Abo &amp; Team</span>
          </button>
        )}
        {/* Mit zwei Knoepfen wird es am Telefon eng: dann nur das Zeichen. */}
        <button type="button" onClick={() => void abmelden()} aria-label="Abmelden" title="Abmelden"
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-800">
          <LogOut className="h-3.5 w-3.5" aria-hidden /> <span className={mitBuero ? 'hidden sm:inline' : ''}>Abmelden</span>
        </button>
      </div>
    </header>
  );
}

function Kasten({ children }: { children: ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">{children}</section>;
}

/** Kein Paket: Testphase oder Early-Adopter-Zeit vorbei, Abo beendet. */
function PaketWaehlen({ z, vorschau }: { z: Zugang; vorschau: boolean }) {
  const { laedt, fehler, los } = useWeiterleitung();
  const aboBeendet = z.rolle === 'inhaber' && z.abo !== null;
  const fruehstarter = !aboBeendet && fruehstartVorbei(z);
  const titel = aboBeendet ? 'Ihr Abo ist beendet'
    : fruehstarter ? 'Ihre Early-Adopter-Zeit ist vorbei — danke!'
    : z.testBis ? 'Ihre Testphase ist abgelaufen'
    : 'Für Ihr Konto ist kein Paket aktiv';
  const text = aboBeendet
    ? 'Wählen Sie ein Paket, um weiterzuarbeiten. Ihre gespeicherten Szenarien und Ihr Team sind noch da.'
    : fruehstarter
      ? `Danke, dass Sie den JS-Rentenplaner von Anfang an begleitet haben! Ihre ${FRUEHSTART_MONATE} kostenlosen `
        + `Monate endeten am ${datum(z.fruehstartBis)}. Als Dankeschön erhalten Sie ${FRUEHSTART_RABATT_PROZENT} % `
        + 'Rabatt auf das erste Jahr, wenn Sie jetzt ein Paket wählen — Ihre gespeicherten Szenarien sind noch da.'
    : `${z.testBis ? `Ihre kostenlose Testphase endete am ${datum(z.testBis)}. ` : ''}`
      + 'Wählen Sie ein Paket, um weiterzuarbeiten — Ihre gespeicherten Szenarien sind noch da.';
  return (
    <Kasten>
      <h1 className="text-xl font-black tracking-tight text-slate-900">{titel}</h1>
      <p className="mt-1 text-sm leading-relaxed text-slate-600">{text}</p>
      <div className="mt-5">
        <PaketBuchung
          bereit={z.zahlungBereit && !vorschau}
          gesperrtText={vorschau ? 'In der Vorschau wird nichts gebucht.' : undefined}
          vorauswahl={z.abo?.paket ?? 'alles'}
          nutzerVorschlag={z.abo?.belegt ?? 1}
          laedt={laedt}
          fehler={fehler}
          onBuchen={(paket, intervall, nutzer) => void los(() => zurKasse(paket, intervall, nutzer))}
        />
      </div>
    </Kasten>
  );
}

/** Die E-Mail des Inhabers — damit "wenden Sie sich an …" einen Namen hat. */
function useInhaber(aktiv: boolean): string | null {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    if (!aktiv) return;
    let lebt = true;
    void mitgliederLaden().then((liste) => {
      if (lebt) setEmail(liste?.find((m) => m.rolle === 'inhaber')?.email ?? null);
    });
    return () => { lebt = false; };
  }, [aktiv]);
  return email;
}

/** Mitglied eines Bueros, aber kein Platz oder kein laufendes Abo. */
function OhnePlatz({ z, vorschau }: { z: Zugang; vorschau: boolean }) {
  const inhaber = useInhaber(!vorschau);
  const [frage, setFrage] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const aboLaeuft = z.abo !== null && aboAktiv(z.abo.status);
  const buero = z.bueroName ? `zum Büro „${z.bueroName}“` : 'zu einem Büro';
  const wer = `die Person, die das Abo verwaltet${inhaber ? ` (${inhaber})` : ''}`;

  const verlassen = async () => {
    setLaeuft(true);
    setFehler(null);
    if (!(await bueroVerlassen())) {
      setLaeuft(false);
      setFehler('Das hat nicht geklappt. Bitte versuchen Sie es noch einmal.');
      return;
    }
    const { fuer, laden } = useZugang.getState();
    if (fuer !== null) await laden(fuer, true);
  };

  return (
    <Kasten>
      <h1 className="text-xl font-black tracking-tight text-slate-900">
        {aboLaeuft ? 'Für Sie ist gerade kein Platz frei' : 'Das Abo Ihres Büros ist beendet'}
      </h1>
      <p className="mt-1 text-sm leading-relaxed text-slate-600">
        Sie gehören {buero}.{' '}
        {aboLaeuft && z.abo
          ? <>Das Abo umfasst {z.abo.plaetze} {z.abo.plaetze === 1 ? 'Platz' : 'Plätze'}, eingetragen sind {z.abo.belegt} Personen — für Sie bleibt gerade keiner. Bitten Sie {wer}, einen Platz dazuzubuchen.</>
          : <>Bitten Sie {wer}, das Abo zu verlängern.</>}
      </p>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        Sie möchten lieber selbst buchen? Dann treten Sie aus dem Büro aus — Ihre gespeicherten Szenarien
        behalten Sie.
      </p>
      {!frage ? (
        <button type="button" onClick={() => setFrage(true)} disabled={vorschau}
          className="mt-3 rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          Büro verlassen …
        </button>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm">
          <span className="font-bold text-slate-800">Wirklich austreten?</span>
          <button type="button" onClick={() => void verlassen()} disabled={laeuft}
            className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-50">
            Ja, Büro verlassen
          </button>
          <button type="button" onClick={() => setFrage(false)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
            Abbrechen
          </button>
        </div>
      )}
      {fehler && <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900">{fehler}</p>}
    </Kasten>
  );
}

const RENTE_SEITEN: Seite[] = [
  {
    href: '/', titel: 'Rentenplaner', text: 'Versorgungslücke, Lösungen und Gutachten',
    symbol: <LineChart className="h-4 w-4" aria-hidden />,
  },
  ...KUNDEN,
];

/** Ein Paket, aber fuer den anderen Teil der Anwendung. */
function AnderesPaket({ z, bereich, vorschau }: { z: Zugang; bereich: Bereich; vorschau: boolean }) {
  const { laedt, fehler, los } = useWeiterleitung();
  const paket = paketVon(z.paket!);
  const seiten = z.paket === 'ag' ? ARBEITGEBER : RENTE_SEITEN;
  const intervall = z.abo?.intervall ?? 'monat';
  const plaetze = Math.max(1, z.abo?.plaetze ?? 1);
  const zeitraum = intervall === 'jahr' ? 'Jahr' : 'Monat';
  const inhaber = z.rolle === 'inhaber';

  return (
    <Kasten>
      <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">Ihr Paket: {paket.name}</p>
      <h1 className="mt-1 text-xl font-black tracking-tight text-slate-900">
        {bereich === 'rente' ? 'Die Rentenplanung gehört nicht zu Ihrem Paket' : 'Die Arbeitgeber-Vorsorgemodelle gehören nicht zu Ihrem Paket'}
      </h1>
      <p className="mt-1 text-sm leading-relaxed text-slate-600">Enthalten sind diese Seiten:</p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {seiten.map((s) => (
          <li key={s.href}>
            <a href={s.href}
              className="flex h-full items-start gap-3 rounded-xl border border-slate-200 p-3 hover:border-indigo-300 hover:bg-indigo-50">
              <span className="mt-0.5 text-indigo-600">{s.symbol}</span>
              <span>
                <span className="block text-sm font-bold text-slate-900">{s.titel}</span>
                <span className="block text-xs text-slate-500">{s.text}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>

      <div className="mt-5 rounded-xl bg-indigo-50 p-4">
        <p className="text-sm font-bold text-indigo-950">Beides nutzen?</p>
        <p className="mt-0.5 text-sm leading-relaxed text-indigo-900">
          Mit „All inklusive“ für {preisText(preisJeNutzer('alles', intervall, plaetze))} statt{' '}
          {preisText(preisJeNutzer(paket.id, intervall, plaetze))} je Nutzer und {zeitraum}, {' '}
          {plaetze === 1 ? 'bei einem Nutzer' : `bei ${plaetze} Nutzern`}.
        </p>
        {inhaber ? (
          <>
            <button type="button" onClick={() => void los(zumPortal)}
              disabled={!z.zahlungBereit || vorschau || laedt}
              className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50">
              {laedt ? 'Einen Moment …' : 'Paket wechseln'}
            </button>
            {!z.zahlungBereit && !vorschau && (
              <p className="mt-2 text-xs text-indigo-900">Der Wechsel wird gerade eingerichtet und startet in Kürze.</p>
            )}
            {fehler && <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900">{fehler}</p>}
          </>
        ) : (
          <p className="mt-2 text-sm text-indigo-900">Bitten Sie die Person, die das Abo verwaltet, das Paket zu wechseln.</p>
        )}
      </div>
    </Kasten>
  );
}

/** Abmelden steht im Kopf; hier: Daten sichern und Konto loeschen. */
function KontoKasten() {
  const email = useAuth((s) => s.email);
  return (
    <Kasten>
      <h2 className="text-sm font-bold text-slate-900">Ihr Konto</h2>
      <p className="mt-1 text-sm leading-relaxed text-slate-600">
        Angemeldet als <strong className="text-slate-800">{email}</strong>. Ihre gespeicherten Szenarien bleiben
        erhalten — mit einem Paket geht es genau dort weiter, wo Sie aufgehört haben.
      </p>
      <SzenarienSichern />
      <div className="mt-4 border-t border-slate-100 pt-3">
        <KontoLoeschen sicherung="Sichern Sie Ihre Szenarien vorher mit „Szenarien herunterladen“." />
      </div>
    </Kasten>
  );
}

/** Alle gespeicherten Szenarien als eine JSON-Datei (Art. 20 DSGVO). */
function SzenarienSichern() {
  const [stand, setStand] = useState<'bereit' | 'laedt' | 'leer' | 'fehler' | 'fertig'>('bereit');
  const herunterladen = async () => {
    if (!supabase) return;
    setStand('laedt');
    const { data, error } = await supabase
      .from('szenarien')
      .select('name, daten, schema_version, erstellt_am, geaendert_am')
      .order('geaendert_am', { ascending: false });
    if (error) { setStand('fehler'); return; }
    if (!data?.length) { setStand('leer'); return; }
    const datei = { herkunft: 'JS-Rentenplaner', exportiertAm: new Date().toISOString(), szenarien: data };
    const url = URL.createObjectURL(new Blob([JSON.stringify(datei, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `rentenplaner-szenarien-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStand('fertig');
  };
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
      <button type="button" onClick={() => void herunterladen()} disabled={stand === 'laedt'}
        className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
        <Download className="h-4 w-4" aria-hidden /> Szenarien herunterladen
      </button>
      <span role="status" className="text-xs text-slate-500">
        {stand === 'leer' && 'Es sind keine Szenarien gespeichert.'}
        {stand === 'fehler' && 'Das hat nicht geklappt. Bitte versuchen Sie es noch einmal.'}
        {stand === 'fertig' && 'Die Datei liegt in Ihrem Download-Ordner.'}
      </span>
    </div>
  );
}
