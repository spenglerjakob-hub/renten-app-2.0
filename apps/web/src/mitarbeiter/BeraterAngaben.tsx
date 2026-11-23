import { useState, type FormEvent } from 'react';
import { ArrowRight, Building2, Save } from 'lucide-react';
import { useAuth } from '../store/auth';
import { useAuftritt } from '../store/auftritt';
import { GRENZEN } from '../features/auftritt';
import { TextFeld } from '../components/Feld';
import { ETIKETT, FEHLER, KNOPF, Karte, Titel } from '../components/stil';
import {
  beraterAngabenAus, beraterAngabenFehler, beraterAngabenSpeichern, type BeraterAngaben, type BeraterFeld,
} from './berater-angaben';

/**
 * „Wer berät?“ — die Angaben des Beraters fuer einen Zugang einer Agentur:
 * Vorname, Nachname, Telefon, E-Mail (`berater-angaben.ts`).
 *
 * Zweimal im Einsatz: als PFLICHT beim ersten Aufruf der Mitarbeiterberatung
 * (`BeraterAngabenPflicht`, vor allem anderen) und spaeter zum Aendern im
 * Fenster. Gespeichert wird in „Ihr Auftritt“ des Kontos.
 */
export function BeraterAngabenFormular({ onFertig, pflicht = false }: {
  /** Nach dem Speichern */
  onFertig?: () => void;
  /** Beim ersten Aufruf: „Speichern und weiter“ statt „Speichern“ */
  pflicht?: boolean;
}) {
  const gespeichert = useAuftritt((s) => s.auftritt);
  const speichern = useAuftritt((s) => s.speichern);
  const konto = useAuth((s) => s.email);
  const [b, setB] = useState<BeraterAngaben>(() => beraterAngabenAus(gespeichert, konto));
  const [versucht, setVersucht] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);

  const fehler = beraterAngabenFehler(b);
  const zeige = (k: BeraterFeld) => (versucht ? fehler[k] ?? null : null);
  const setze = (k: BeraterFeld) => (v: string) => { setB((x) => ({ ...x, [k]: v })); setMeldung(null); };

  const absenden = async (e: FormEvent) => {
    e.preventDefault();
    setVersucht(true);
    if (Object.keys(fehler).length > 0 || laeuft) return;
    setLaeuft(true);
    const r = await speichern(beraterAngabenSpeichern(gespeichert, b));
    setLaeuft(false);
    if (r !== 'ok') {
      setMeldung({ ok: false, text: 'Ihre Angaben konnten nicht gespeichert werden. Bitte versuchen Sie es noch einmal.' });
      return;
    }
    setMeldung({ ok: true, text: 'Gespeichert. Ihre Angaben stehen ab jetzt auf den Unterlagen.' });
    onFertig?.();
  };

  return (
    <form onSubmit={(e) => void absenden(e)} noValidate className="handy-eingaben space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextFeld label="Vorname" wert={b.vorname} onChange={setze('vorname')} maxLaenge={GRENZEN.vorname} autoComplete="given-name" fehler={zeige('vorname')} />
        <TextFeld label="Nachname" wert={b.nachname} onChange={setze('nachname')} maxLaenge={GRENZEN.nachname} autoComplete="family-name" fehler={zeige('nachname')} />
        <TextFeld label="Telefon" typ="tel" wert={b.telefon} onChange={setze('telefon')} maxLaenge={GRENZEN.telefon} autoComplete="tel"
          platzhalter="z. B. 0221 123456" fehler={zeige('telefon')} />
        <TextFeld label="E-Mail" typ="email" wert={b.email} onChange={setze('email')} maxLaenge={GRENZEN.email} autoComplete="email" fehler={zeige('email')} />
      </div>
      {versucht && Object.keys(fehler).length > 0 && (
        <p role="alert" className={FEHLER}>Bitte füllen Sie alle vier Felder aus.</p>
      )}
      {meldung && (
        <p role={meldung.ok ? 'status' : 'alert'} className={meldung.ok ? 'ui-innen px-3 py-2 text-sm text-ui-tinte' : FEHLER}>{meldung.text}</p>
      )}
      <div className="flex justify-end">
        <button type="submit" disabled={laeuft} className={`${KNOPF} min-h-[3rem] w-full sm:min-h-0 sm:w-auto`}>
          {pflicht
            ? <>{laeuft ? 'Wird gespeichert …' : 'Speichern und weiter'} <ArrowRight className="h-4 w-4" aria-hidden /></>
            : <><Save className="h-4 w-4" aria-hidden /> {laeuft ? 'Wird gespeichert …' : 'Speichern'}</>}
        </button>
      </div>
    </form>
  );
}

/**
 * Der erste Aufruf eines Zugangs einer Agentur: bevor es Firmen und
 * Beratungen zu sehen gibt, einmal die eigenen Angaben. Sobald sie gespeichert
 * sind, gibt die Seite den Weg frei (`Seite.tsx` liest den Auftritt).
 */
export function BeraterAngabenPflicht({ agenturName }: { agenturName: string | null }) {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        {agenturName && (
          <p className={`mb-2 flex items-center gap-1.5 ${ETIKETT}`}>
            <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden /> Agentur {agenturName}
          </p>
        )}
        <Titel gross>Zuerst zu Ihnen</Titel>
        <p className="mt-3 text-base leading-relaxed text-ui-schiefer">
          Tragen Sie einmal ein, wer Sie sind. Damit stehen Sie von der ersten Beratung an als Berater auf den
          Unterlagen — im Briefkopf, im Beratungsprotokoll und im AXA-Antrag —, ohne es je Beratung neu einzutragen.
        </p>
      </div>
      <Karte titel="Ihre Angaben als Berater">
        <BeraterAngabenFormular pflicht />
        <p className="mt-4 text-xs leading-relaxed text-ui-schiefer">
          Name, Logo und Farbe im Briefkopf kommen von Ihrer Agentur. Ihre Angaben können Sie später jederzeit ändern.
        </p>
      </Karte>
    </div>
  );
}
