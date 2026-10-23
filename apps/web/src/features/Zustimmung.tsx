import { useState } from 'react';
import { FileCheck, LogOut } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { zustimmungDaten } from '../lib/nutzungsbedingungen';
import { useAuth } from '../store/auth';
import { Rahmen } from './Anmeldung';
import { RechtsLinks } from '../components/RechtsLinks';
import { FEHLER, KNOPF, LINK, Titel } from '../components/stil';

/**
 * Einmalige Zustimmung zu den Nutzungsbedingungen — fuer Konten, die vor
 * ihrer Einfuehrung angelegt wurden, und nach jeder neuen Fassung.
 * Neue Konten stimmen schon bei der Registrierung zu.
 */
export function Zustimmung({ onFertig }: { onFertig: () => void }) {
  const abmelden = useAuth((s) => s.abmelden);
  const [haken, setHaken] = useState(false);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const zustimmen = async () => {
    if (!supabase) return;
    setLaedt(true);
    setFehler(null);
    const { error } = await supabase.auth.updateUser({ data: zustimmungDaten() });
    setLaedt(false);
    if (error) setFehler('Das hat nicht geklappt. Bitte versuchen Sie es noch einmal.');
    else onFertig();
  };

  return (
    <Rahmen>
      <div className="ui-karte p-6 sm:p-7">
        <Titel>Nutzungsbedingungen</Titel>
        <p className="mt-2 text-sm leading-relaxed text-ui-schiefer">
          Für den JS-Rentenplaner gelten Nutzungsbedingungen. Bitte lesen Sie sie und stimmen Sie zu — danach
          geht es direkt weiter. Gibt es eine neue Fassung, fragen wir einmal erneut.
        </p>
        <a
          href="/nutzungsbedingungen" target="_blank" rel="noopener"
          className={`mt-3 ${LINK} underline`}
        >
          Nutzungsbedingungen lesen
        </a>
        <label className="mt-4 flex items-start gap-2 text-sm leading-relaxed text-ui-tinte">
          <input
            type="checkbox" checked={haken} onChange={(e) => setHaken(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0"
          />
          <span>Ich akzeptiere die Nutzungsbedingungen.</span>
        </label>
        {fehler && <p role="status" className={`mt-3 ${FEHLER}`}>{fehler}</p>}
        <button
          type="button" onClick={() => void zustimmen()} disabled={!haken || laedt}
          className={`mt-4 w-full ${KNOPF}`}
        >
          <FileCheck className="h-4 w-4" aria-hidden /> Zustimmen und weiter
        </button>
        <button
          type="button" onClick={() => void abmelden()}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-full px-4 py-2 text-sm text-ui-schiefer hover:bg-ui-innen hover:text-ui-tinte"
        >
          <LogOut className="h-4 w-4" aria-hidden /> Abmelden
        </button>
      </div>
      <RechtsLinks klasse="mt-4 justify-center" />
    </Rahmen>
  );
}
