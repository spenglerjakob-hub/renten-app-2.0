import { useEffect, useState } from 'react';
import { LogOut, Save, FolderOpen, Trash2, RefreshCw, X } from 'lucide-react';
import { useFernSzenarien, supabaseKonfiguriert } from '../store/szenarien-fern';
import { useSzenario } from '../store/szenario';
import { useAuth } from '../store/auth';
import { KontoLoeschen } from './KontoLoeschen';
import { FEHLER, FELD, KNOPF, KNOPF_KLEIN } from '../components/stil';

/** Knoepfe nur mit Symbol, wie das Loeschen in der Liste der Beratungen; Loeschen faerbt sich erst beim Darueberfahren rot. */
const SYMBOL_KNOPF = 'shrink-0 rounded-full p-2 text-ui-schiefer transition-colors hover:bg-ui-innen hover:text-ui-tinte';
const SYMBOL_LOESCHEN = 'shrink-0 rounded-full p-2 text-ui-schiefer transition-colors hover:bg-rose-50 hover:text-rose-700';

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
      <p className="text-sm text-ui-schiefer">
        Die Anmeldung ist nicht eingerichtet. Ihre Eingaben bleiben auf diesem Gerät
        gespeichert und lassen sich als Datei sichern.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {angemeldetAls && (
        <div className="flex items-center justify-between gap-3 border-b border-ui-linie pb-4">
          {/* Umbrechen statt abschneiden: Die Adresse ist das, woran man das Konto erkennt. */}
          <span className="min-w-0 text-sm text-ui-schiefer [overflow-wrap:anywhere]">
            Angemeldet als <span className="font-medium text-ui-tinte">{angemeldetAls}</span>
          </span>
          <button type="button" onClick={() => void abmelden()} className={KNOPF_KLEIN}>
            <LogOut className="h-3.5 w-3.5" aria-hidden /> Abmelden
          </button>
        </div>
      )}

      {meldung && (
        <div role="status"
          className={`flex items-start justify-between gap-3 ${
            meldung.art === 'ok' ? 'ui-innen px-3 py-2 text-sm text-ui-tinte' : FEHLER
          }`}>
          <span>{meldung.text}</span>
          <button type="button" onClick={meldungLoeschen} aria-label="Meldung schließen"
            className="-m-0.5 shrink-0 rounded-full p-0.5 hover:bg-ui-tinte/5">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <div className="min-w-0 flex-[1_1_12rem]">
          <label htmlFor="szenario-name" className="sr-only">Name des Szenarios</label>
          <input
            id="szenario-name" type="text" value={name}
            onChange={(e) => setName(e.target.value)} maxLength={120}
            className={`${FELD} h-full`}
          />
        </div>
        <button type="button" disabled={laedt || !name.trim()}
          onClick={() => void speichern(name.trim(), szenario)}
          className={KNOPF}>
          <Save className="h-4 w-4" aria-hidden /> Als neues speichern
        </button>
      </div>

      <div>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-medium text-ui-tinte">
            Gespeichert <span className="font-normal text-ui-schiefer">({liste.length})</span>
          </h3>
          <button type="button" onClick={() => void listeLaden()} aria-label="Liste aktualisieren" className={SYMBOL_KNOPF}>
            <RefreshCw className={`h-4 w-4 ${laedt ? 'animate-spin' : ''}`} aria-hidden />
          </button>
        </div>

        {/* Zeilen mit Haarlinien wie die Liste der Beratungen — keine grauen Kaesten je Eintrag. */}
        {liste.length === 0 ? (
          <p className="mt-2 rounded-[10px] border border-dashed border-ui-feld-rand px-4 py-4 text-center text-sm text-ui-schiefer">
            Noch nichts gespeichert.
          </p>
        ) : (
          <ul className="mt-1 divide-y divide-ui-linie border-b border-ui-linie">
            {liste.map((s) => (
              <li key={s.id} className="flex items-center gap-1 py-2">
                <span className="min-w-0 flex-1 truncate text-sm text-ui-tinte">{s.name}</span>
                <time className="mr-1 shrink-0 text-xs tabular-nums text-ui-schiefer" dateTime={s.geaendertAm}>
                  {new Date(s.geaendertAm).toLocaleDateString('de-DE')}
                </time>
                <button type="button" title="Laden" aria-label={`${s.name} laden`}
                  onClick={async () => {
                    const geladen = await laden(s.id);
                    if (geladen) { setze(() => geladen); setName(s.name); }
                  }}
                  className={SYMBOL_KNOPF}>
                  <FolderOpen className="h-4 w-4" aria-hidden />
                </button>
                <button type="button" title="Überschreiben" aria-label={`${s.name} überschreiben`}
                  onClick={() => void aktualisieren(s.id, s.name, szenario)}
                  className={SYMBOL_KNOPF}>
                  <Save className="h-4 w-4" aria-hidden />
                </button>
                <button type="button" title="Löschen" aria-label={`${s.name} löschen`}
                  onClick={() => void loeschen(s.id)}
                  className={SYMBOL_LOESCHEN}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <KontoLoeschen sicherung="Sichern Sie Szenarien, die Sie behalten möchten, vorher über „Speichern“ in der Kopfzeile als Datei. Die Eingaben im Rechner auf diesem Gerät bleiben erhalten." />
      </div>
    </div>
  );
}
