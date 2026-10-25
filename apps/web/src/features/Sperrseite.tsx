import { useEffect, useState } from 'react';
import { Download, LineChart, LogOut, Users } from 'lucide-react';
import {
  FRUEHSTART_MONATE, FRUEHSTART_RABATT_PROZENT, paketVon, preisJeNutzer, type Bereich,
} from '@renten/schema/preise';
import { RechtsLinks } from '../components/RechtsLinks';
import { SeitenKopf } from '../components/SeitenKopf';
import {
  AKZENT, EINLEITUNG, ETIKETT, FEHLER, Hervor, KNOPF, KNOPF_ZWEIT, Karte, Titel,
} from '../components/stil';
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
    <div className="flex min-h-screen flex-col bg-ui-flaeche text-ui-tinte">
      <Kopf mitBuero={zugang.buero !== null} />
      {/* Wie eine Ansicht der Mitarbeiterberatung: Titel und Einleitung ueber den Karten. */}
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-4 py-6 sm:px-6 sm:py-10">
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
  const knopf = 'flex shrink-0 items-center gap-1.5 rounded-full border border-ui-zweit-rand bg-ui-karte px-3 py-1.5 text-xs font-medium text-ui-tinte hover:bg-ui-innen';
  return (
    <SeitenKopf breite="max-w-3xl" rechts={(
      <>
        {mitBuero && (
          <button type="button" onClick={oeffneFenster} aria-label="Abo & Team" title="Abo & Team" className={knopf}>
            <Users className="h-3.5 w-3.5" aria-hidden /> <span className="hidden sm:inline">Abo &amp; Team</span>
          </button>
        )}
        {/* Mit zwei Knoepfen wird es am Telefon eng: dann nur das Zeichen. */}
        <button type="button" onClick={() => void abmelden()} aria-label="Abmelden" title="Abmelden" className={knopf}>
          <LogOut className="h-3.5 w-3.5" aria-hidden /> <span className={mitBuero ? 'hidden sm:inline' : ''}>Abmelden</span>
        </button>
      </>
    )} />
  );
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
    <section className="space-y-6">
      <div>
        <Titel gross>{titel}</Titel>
        <p className={`mt-3 ${EINLEITUNG}`}>{text}</p>
      </div>
      <Karte titel="Paket wählen">
        <PaketBuchung
          bereit={z.zahlungBereit && !vorschau}
          gesperrtText={vorschau ? 'In der Vorschau wird nichts gebucht.' : undefined}
          vorauswahl={z.abo?.paket ?? 'alles'}
          nutzerVorschlag={z.abo?.belegt ?? 1}
          laedt={laedt}
          fehler={fehler}
          onBuchen={(paket, intervall, nutzer) => void los(() => zurKasse(paket, intervall, nutzer))}
        />
      </Karte>
    </section>
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
    <section className="space-y-6">
      <div>
        <Titel gross>
          {aboLaeuft ? 'Für Sie ist gerade kein Platz frei' : 'Das Abo Ihres Büros ist beendet'}
        </Titel>
        <p className={`mt-3 ${EINLEITUNG}`}>
          Sie gehören {buero}.{' '}
          {aboLaeuft && z.abo
            ? <>Das Abo umfasst {z.abo.plaetze} {z.abo.plaetze === 1 ? 'Platz' : 'Plätze'}, eingetragen sind {z.abo.belegt} Personen — für Sie bleibt gerade keiner. Bitten Sie {wer}, einen Platz dazuzubuchen.</>
            : <>Bitten Sie {wer}, das Abo zu verlängern.</>}
        </p>
      </div>
      <Karte>
        <p className="text-sm leading-relaxed text-ui-tinte">
          Sie möchten lieber selbst buchen? Dann treten Sie aus dem Büro aus — Ihre gespeicherten Szenarien
          behalten Sie.
        </p>
        {!frage ? (
          <button type="button" onClick={() => setFrage(true)} disabled={vorschau} className={`mt-5 ${KNOPF_ZWEIT}`}>
            Büro verlassen …
          </button>
        ) : (
          <div className="ui-innen mt-5 flex flex-wrap items-center gap-3 p-4 text-sm">
            <span className="font-medium text-ui-tinte">Wirklich austreten?</span>
            <button type="button" onClick={() => void verlassen()} disabled={laeuft} className={KNOPF}>
              Ja, Büro verlassen
            </button>
            <button type="button" onClick={() => setFrage(false)} className={KNOPF_ZWEIT}>
              Abbrechen
            </button>
          </div>
        )}
        {fehler && <p role="alert" className={`mt-3 ${FEHLER}`}>{fehler}</p>}
      </Karte>
    </section>
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
    <section className="space-y-6">
      <div>
        <p className={ETIKETT}>Ihr Paket: {paket.name}</p>
        <Titel gross klasse="mt-1">
          {bereich === 'rente' ? 'Die Rentenplanung gehört nicht zu Ihrem Paket' : 'Die Arbeitgeber-Vorsorgemodelle gehören nicht zu Ihrem Paket'}
        </Titel>
      </div>

      <Karte titel="Enthalten sind diese Seiten">
        <ul className="grid gap-3 sm:grid-cols-2">
          {seiten.map((s) => (
            <li key={s.href}>
              <a href={s.href}
                className="flex h-full items-start gap-3 rounded-lg border border-ui-linie p-4 hover:border-ui-feld-rand hover:bg-ui-innen">
                <span className="mt-0.5 text-ui-schiefer">{s.symbol}</span>
                <span>
                  <span className="block text-base font-medium text-ui-tinte">{s.titel}</span>
                  <span className="mt-0.5 block text-sm text-ui-schiefer">{s.text}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </Karte>

      {/* Die eine Akzentkarte: was „All inklusive“ kostet, der Preis hervorgehoben. */}
      <div className={`${AKZENT} p-6 sm:p-8`}>
        <p className="text-sm">Beides nutzen?</p>
        <p className="ui-titel mt-2 text-balance text-[22px] font-normal leading-snug sm:text-[26px]">
          Mit „All inklusive“ für <Hervor>{preisText(preisJeNutzer('alles', intervall, plaetze))}</Hervor> statt{' '}
          {preisText(preisJeNutzer(paket.id, intervall, plaetze))} je Nutzer und {zeitraum}, {' '}
          {plaetze === 1 ? 'bei einem Nutzer' : `bei ${plaetze} Nutzern`}.
        </p>
        {inhaber ? (
          <>
            <button type="button" onClick={() => void los(zumPortal)}
              disabled={!z.zahlungBereit || vorschau || laedt} className={`mt-6 ${KNOPF} disabled:cursor-not-allowed`}>
              {laedt ? 'Einen Moment …' : 'Paket wechseln'}
            </button>
            {!z.zahlungBereit && !vorschau && (
              <p className="mt-2 text-xs text-ui-schiefer">Der Wechsel wird gerade eingerichtet und startet in Kürze.</p>
            )}
            {fehler && <p role="alert" className={`mt-3 ${FEHLER}`}>{fehler}</p>}
          </>
        ) : (
          <p className="mt-4 text-sm text-ui-schiefer">Bitten Sie die Person, die das Abo verwaltet, das Paket zu wechseln.</p>
        )}
      </div>
    </section>
  );
}

/** Abmelden steht im Kopf; hier: Daten sichern und Konto loeschen. */
function KontoKasten() {
  const email = useAuth((s) => s.email);
  return (
    <Karte titel="Ihr Konto">
      <p className="text-sm leading-relaxed text-ui-schiefer">
        Angemeldet als <strong className="font-medium text-ui-tinte">{email}</strong>. Ihre gespeicherten Szenarien bleiben
        erhalten — mit einem Paket geht es genau dort weiter, wo Sie aufgehört haben.
      </p>
      <SzenarienSichern />
      <div className="mt-6 border-t border-ui-linie pt-4">
        <KontoLoeschen sicherung="Sichern Sie Ihre Szenarien vorher mit „Szenarien herunterladen“." />
      </div>
    </Karte>
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
      <button type="button" onClick={() => void herunterladen()} disabled={stand === 'laedt'} className={KNOPF_ZWEIT}>
        <Download className="h-4 w-4" aria-hidden /> Szenarien herunterladen
      </button>
      <span role="status" className="text-xs text-ui-schiefer">
        {stand === 'leer' && 'Es sind keine Szenarien gespeichert.'}
        {stand === 'fehler' && 'Das hat nicht geklappt. Bitte versuchen Sie es noch einmal.'}
        {stand === 'fertig' && 'Die Datei liegt in Ihrem Download-Ordner.'}
      </span>
    </div>
  );
}
