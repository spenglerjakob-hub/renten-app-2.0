import { useEffect, useState } from 'react';
import { LogOut, Save, FolderOpen, Trash2, RefreshCw } from 'lucide-react';
import { useFernSzenarien, supabaseKonfiguriert } from '../store/szenarien-fern';
import { useSzenario } from '../store/szenario';
import { useAuth } from '../store/auth';

/**
 * Gespeicherte Szenarien des angemeldeten Kontos.
 *
 * Die Anmeldung selbst liegt seit der Zugangsschranke davor
 * (`Zugangsschranke.tsx`) — wer diesen Bereich sieht, ist bereits angemeldet.
 * Hier bleiben die Szenarienliste und der Weg hinaus.
 */
export function Konto() {
  const {
    liste, laedt, meldung,
    initialisieren, listeLaden,
    speichern, aktualisieren, laden, loeschen, meldungLoeschen,
  } = useFernSzenarien();

  const angemeldetAls = useAuth((s) => s.email);
  const abmelden = useAuth((s) => s.abmelden);

  const szenario = useSzenario((s) => s.szenario);
  const setze = useSzenario((s) => s.setze);

  const [name, setName] = useState('Mein Plan');

  useEffect(() => { void initialisieren(); }, [initialisieren]);

  if (!supabaseKonfiguriert) {
    return (
      <p className="text-sm text-slate-600">
        Die Anmeldung ist nicht eingerichtet. Ihre Eingaben bleiben auf diesem Gerät
        gespeichert und lassen sich als Datei sichern.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {angemeldetAls && (
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2">
          <span className="truncate text-xs text-slate-500">
            Angemeldet als <strong className="text-slate-700">{angemeldetAls}</strong>
          </span>
          <button
            type="button"
            onClick={() => void abmelden()}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden /> Abmelden
          </button>
        </div>
      )}

      {meldung && (
        <div role="status"
          className={`mb-3 flex items-start justify-between gap-3 rounded-md px-3 py-2 text-sm ${
            meldung.art === 'ok' ? 'bg-emerald-50 text-emerald-900' : 'bg-rose-50 text-rose-900'
          }`}>
          <span>{meldung.text}</span>
          <button type="button" onClick={meldungLoeschen} aria-label="Meldung schließen"
            className="shrink-0 text-xs opacity-60 hover:opacity-100">×</button>
        </div>
      )}

      <div className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1">
              <label htmlFor="szenario-name" className="sr-only">Name des Szenarios</label>
              <input
                id="szenario-name" type="text" value={name}
                onChange={(e) => setName(e.target.value)} maxLength={120}
                className="w-full rounded-md border border-slate-300 p-2 text-sm"
              />
            </div>
            <button type="button" disabled={laedt || !name.trim()}
              onClick={() => void speichern(name.trim(), szenario)}
              className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
              <Save className="h-4 w-4" aria-hidden /> Als neues speichern
            </button>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Gespeichert ({liste.length})
              </h3>
              <button type="button" onClick={() => void listeLaden()} aria-label="Liste aktualisieren"
                className="rounded p-1 text-slate-400 hover:text-slate-700">
                <RefreshCw className={`h-3.5 w-3.5 ${laedt ? 'animate-spin' : ''}`} aria-hidden />
              </button>
            </div>

            {liste.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 px-4 py-4 text-center text-sm text-slate-500">
                Noch nichts gespeichert.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {liste.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2">
                    <span className="flex-1 truncate text-sm">{s.name}</span>
                    <time className="shrink-0 text-xs text-slate-400"
                      dateTime={s.geaendertAm}>
                      {new Date(s.geaendertAm).toLocaleDateString('de-DE')}
                    </time>
                    <button type="button" title="Laden" aria-label={`${s.name} laden`}
                      onClick={async () => {
                        const geladen = await laden(s.id);
                        if (geladen) { setze(() => geladen); setName(s.name); }
                      }}
                      className="rounded p-1 text-slate-400 hover:bg-white hover:text-indigo-600">
                      <FolderOpen className="h-4 w-4" aria-hidden />
                    </button>
                    <button type="button" title="Überschreiben" aria-label={`${s.name} überschreiben`}
                      onClick={() => void aktualisieren(s.id, s.name, szenario)}
                      className="rounded p-1 text-slate-400 hover:bg-white hover:text-indigo-600">
                      <Save className="h-4 w-4" aria-hidden />
                    </button>
                    <button type="button" title="Löschen" aria-label={`${s.name} löschen`}
                      onClick={() => void loeschen(s.id)}
                      className="rounded p-1 text-slate-400 hover:bg-white hover:text-rose-600">
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
      </div>
    </div>
  );
}
