import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { UserPlus } from 'lucide-react';
import { Sicher } from '../components/Sicher';
import { FEHLER, FELD, KNOPF, Vermerk } from '../components/stil';
import { verwalterBenennen, verwalterEntfernen, verwalterLaden, type Verwalter } from '../lib/bav-agenturen';
import { datum } from '../store/zugang';

const MELDUNG = {
  kein_betreiber: 'Das darf nur der Betreiber.',
  unbekannt: 'Zu dieser E-Mail-Adresse gibt es kein Konto. Der Mitarbeiter legt zuerst ein Konto an — dann fügen Sie ihn hier hinzu.',
  agentur: 'Dieses Konto gehört zu einer Agentur und kann deshalb nicht zur bAV-Verwaltung gehören.',
  fehler: 'Das hat nicht geklappt. Bitte versuchen Sie es noch einmal.',
} as const;

/**
 * Nur fuer den Betreiber, im Fenster „Abo & Team“: die Konten der
 * bAV-Verwaltung benennen. Sie sehen und bearbeiten in der Mitarbeiterberatung
 * alle Agenturen mit ihren Firmenkunden und Beratungen. Der Betreiber gehoert
 * immer dazu. Was angezeigt und angenommen wird, entscheidet der Server.
 */
export function BetreiberVerwaltung() {
  const [liste, setListe] = useState<Verwalter[] | null>(null);
  const [email, setEmail] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [gut, setGut] = useState<string | null>(null);

  const laden = useCallback(async () => {
    const l = await verwalterLaden();
    if (l === 'fehler') setFehler('Die Liste konnte nicht geladen werden. Ist die Migration für die Agenturen schon eingespielt?');
    setListe(l === 'fehler' ? [] : l);
  }, []);
  useEffect(() => { void laden(); }, [laden]);

  const benennen = async (e: FormEvent) => {
    e.preventDefault();
    if (laeuft || email.trim() === '') return;
    setLaeuft(true);
    setFehler(null);
    setGut(null);
    const r = await verwalterBenennen(email);
    setLaeuft(false);
    if (r !== 'ok') { setFehler(MELDUNG[r]); return; }
    setGut(`${email.trim()} gehört jetzt zur bAV-Verwaltung.`);
    setEmail('');
    await laden();
  };

  const entfernen = async (nutzer: string) => {
    setFehler(null);
    setGut(null);
    if (!(await verwalterEntfernen(nutzer))) setFehler(MELDUNG.fehler);
    await laden();
  };

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-ui-schiefer">
        Konten der bAV-Verwaltung legen in der Mitarbeiterberatung Agenturen an, laden sie per Link ein und sehen und
        bearbeiten alle ihre Firmenkunden mit den Beratungen — auch Gehalt, Steuer- und Gesundheitsangaben der
        Mitarbeiter. Sie selbst gehören als Betreiber immer dazu.
      </p>

      <form onSubmit={(e) => void benennen(e)} className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-[1_1_12rem] text-xs font-medium text-ui-tinte/80">
          E-Mail-Adresse des Kontos
          <input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} autoComplete="off"
            placeholder="name@beispiel.de" className={`mt-1 ${FELD} font-normal`}
          />
        </label>
        <button type="submit" disabled={laeuft || email.trim() === ''} className={KNOPF}>
          <UserPlus className="h-4 w-4" aria-hidden /> {laeuft ? 'Einen Moment …' : 'Hinzufügen'}
        </button>
      </form>
      {fehler && <p role="alert" className={FEHLER}>{fehler}</p>}
      {gut && <p role="status" className="text-sm text-ui-tinte">{gut}</p>}

      <div>
        <h4 className="text-sm font-medium text-ui-tinte">Konten der bAV-Verwaltung{liste && liste.length > 0 ? ` (${liste.length})` : ''}</h4>
        {liste === null ? (
          <p className="mt-1 text-sm text-ui-schiefer">Wird geladen …</p>
        ) : liste.length === 0 ? (
          <p className="mt-1 text-sm text-ui-schiefer">Noch kein Konto benannt — bisher verwalten nur Sie.</p>
        ) : (
          <ul className="mt-1 divide-y divide-ui-linie border-y border-ui-linie" aria-label="Konten der bAV-Verwaltung">
            {liste.map((v) => (
              <li key={v.nutzer} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 text-sm">
                <span className="min-w-0 flex-1 basis-48">
                  <span className="block break-all text-ui-tinte">{v.email || 'Ohne E-Mail-Adresse'}</span>
                  <span className="block text-xs text-ui-schiefer">seit {datum(v.seit)}</span>
                </span>
                <Vermerk>bAV-Verwaltung</Vermerk>
                <Sicher text="Entfernen" frage="Aus der Verwaltung entfernen?" ja="Ja" onJa={() => entfernen(v.nutzer)} />
              </li>
            ))}
          </ul>
        )}
        {liste !== null && liste.length > 0 && (
          <p className="mt-2 text-xs leading-relaxed text-ui-schiefer">
            Entfernen Sie ein Konto, gehen die Firmen, die es in Agenturen angelegt hat, mit ihren Beratungen an Sie über.
          </p>
        )}
      </div>
    </div>
  );
}
