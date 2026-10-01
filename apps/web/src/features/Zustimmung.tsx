import { useState } from 'react';
import { FileCheck, LogOut } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { zustimmungDaten } from '../lib/nutzungsbedingungen';
import { useAuth } from '../store/auth';
import { Rahmen } from './Anmeldung';
import { RechtsLinks } from '../components/RechtsLinks';

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
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-black tracking-tight text-slate-900">Nutzungsbedingungen</h1>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          Für den JS-Rentenplaner gelten Nutzungsbedingungen. Bitte lesen Sie sie und stimmen Sie einmalig zu —
          danach geht es direkt weiter.
        </p>
        <a
          href="/nutzungsbedingungen" target="_blank" rel="noopener"
          className="mt-3 inline-block text-sm font-bold text-indigo-700 underline"
        >
          Nutzungsbedingungen lesen
        </a>
        <label className="mt-4 flex items-start gap-2 text-sm leading-relaxed text-slate-700">
          <input
            type="checkbox" checked={haken} onChange={(e) => setHaken(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300"
          />
          <span>Ich akzeptiere die Nutzungsbedingungen.</span>
        </label>
        {fehler && <p role="status" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900">{fehler}</p>}
        <button
          type="button" onClick={() => void zustimmen()} disabled={!haken || laedt}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          <FileCheck className="h-4 w-4" aria-hidden /> Zustimmen und weiter
        </button>
        <button
          type="button" onClick={() => void abmelden()}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
        >
          <LogOut className="h-4 w-4" aria-hidden /> Abmelden
        </button>
      </div>
      <RechtsLinks klasse="mt-4 justify-center" />
    </Rahmen>
  );
}
