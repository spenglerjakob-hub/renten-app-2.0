import { useEffect, useState } from 'react';
import { ArrowLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { beratungDatenSchema } from '@renten/schema';
import {
  beratungAnlegen, beratungLoeschen, beratungenLaden, firmaLaden, type Beratung, type Firma,
} from '../lib/bav-beratung';
import { Dialog } from '../components/Dialog';
import { FirmenZeichen, KNOPF, KNOPF_GEFAHR, KNOPF_ZWEIT, Karte, StatusChip, useFirmenlogo } from './bausteine';
import { AngebotFormular } from './AngebotFormular';
import { Uebersicht } from './Uebersicht';
import { MODELL_NAME, regelText } from './texte';
import { FIRMEN, type Ort, type Reiter } from './ort';

/** `kurz`: auf dem Telefon — so passen die drei Reiter in eine Zeile. */
const REITER: { id: Reiter; text: string; kurz: string }[] = [
  { id: 'mitarbeiter', text: 'Mitarbeiter', kurz: 'Mitarbeiter' },
  { id: 'angebot', text: 'Angebot der Firma', kurz: 'Angebot' },
  { id: 'uebersicht', text: 'Übersicht für den Arbeitgeber', kurz: 'Übersicht' },
];

const datumText = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('de-DE') : '');

/** Eine Firma: ihre Mitarbeiter, ihr Angebot und die Uebersicht fuer den Arbeitgeber. */
export function FirmaAnsicht({ firmaId, reiter, gehe }: { firmaId: string; reiter: Reiter; gehe: (o: Ort) => void }) {
  const [firma, setFirma] = useState<Firma | null | 'laedt' | 'fehler'>('laedt');
  const [beratungen, setBeratungen] = useState<Beratung[] | 'laedt' | 'fehler'>('laedt');
  const [meldung, setMeldung] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [loeschen, setLoeschen] = useState<Beratung | null>(null);
  const logo = useFirmenlogo(firma && typeof firma === 'object' ? firma.logoPfad : null);

  useEffect(() => {
    let aktiv = true;
    void Promise.all([firmaLaden(firmaId), beratungenLaden(firmaId)]).then(([f, b]) => {
      if (!aktiv) return;
      setFirma(f);
      setBeratungen(b);
    });
    return () => { aktiv = false; };
  }, [firmaId]);

  const zurueck = (
    <button type="button" onClick={() => gehe(FIRMEN)} className="inline-flex items-center gap-1 text-sm font-bold text-indigo-700 hover:underline">
      <ArrowLeft className="h-4 w-4" aria-hidden /> Alle Firmen
    </button>
  );
  if (firma === 'laedt') return <p className="text-sm text-slate-500">Die Firma wird geladen …</p>;
  if (firma === 'fehler' || firma === null) {
    return (
      <div className="space-y-3">
        {zurueck}
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900">
          {firma === null ? 'Diese Firma gibt es nicht (mehr) in Ihrem Konto.' : 'Die Firma konnte nicht geladen werden. Bitte laden Sie die Seite neu.'}
        </p>
      </div>
    );
  }

  const liste = Array.isArray(beratungen) ? beratungen : [];

  const neueBeratung = async () => {
    if (laeuft) return;
    setLaeuft(true);
    setMeldung(null);
    const daten = beratungDatenSchema.parse({ entscheidung: { beginn: firma.angebot.beginn } });
    const b = await beratungAnlegen(firma.id, daten);
    setLaeuft(false);
    if (b === 'fehler') setMeldung('Die Beratung konnte nicht angelegt werden. Bitte versuchen Sie es noch einmal.');
    else gehe({ firma: firma.id, beratung: b.id, reiter: 'mitarbeiter' });
  };

  return (
    <div className="space-y-5">
      {zurueck}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <FirmenZeichen name={firma.name} logo={logo} gross />
        <p className="max-w-xl text-sm text-slate-600">
          <strong className="text-slate-800">{MODELL_NAME[firma.angebot.modell.art]}:</strong> {regelText(firma.angebot.modell)}
        </p>
      </div>

      <div role="tablist" aria-label="Bereiche der Firma" className="flex flex-wrap gap-1 border-b border-slate-300">
        {REITER.map((r) => (
          <button
            key={r.id}
            type="button"
            role="tab"
            id={`reiter-${r.id}`}
            aria-selected={reiter === r.id}
            aria-controls={`bereich-${r.id}`}
            onClick={() => gehe({ firma: firma.id, beratung: null, reiter: r.id })}
            className={`-mb-px rounded-t-lg border px-2 py-2 text-sm font-bold sm:px-3 ${
              reiter === r.id ? 'border-slate-300 border-b-slate-100 bg-slate-100 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span className="sm:hidden">{r.kurz}</span><span className="hidden sm:inline">{r.text}</span>
            {r.id === 'mitarbeiter' && liste.length > 0 ? ` (${liste.length})` : ''}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`bereich-${reiter}`} aria-labelledby={`reiter-${reiter}`}>
        {reiter === 'mitarbeiter' && (
          <Karte
            titel="Beratungen"
            rechts={(
              <button type="button" onClick={() => void neueBeratung()} disabled={laeuft} className={KNOPF}>
                <Plus className="h-4 w-4" aria-hidden /> Neue Beratung
              </button>
            )}
          >
            {beratungen === 'laedt' && <p className="text-sm text-slate-500">Beratungen werden geladen …</p>}
            {beratungen === 'fehler' && <p role="alert" className="text-sm text-rose-800">Die Beratungen konnten nicht geladen werden.</p>}
            {Array.isArray(beratungen) && liste.length === 0 && (
              <p className="text-sm text-slate-500">
                Noch keine Beratung. Mit „Neue Beratung“ beginnt das Gespräch mit dem ersten Mitarbeiter.
              </p>
            )}
            {liste.length > 0 && (
              <ul className="divide-y divide-slate-100" aria-label="Beratungen">
                {liste.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                    <button type="button" onClick={() => gehe({ firma: firma.id, beratung: b.id, reiter: 'mitarbeiter' })}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left">
                      <span className="min-w-0 break-words font-bold text-slate-900">{b.mitarbeiter || 'Ohne Namen'}</span>
                      <StatusChip status={b.status} betrag={b.daten.umwandlungMonat} />
                      {b.beratenAm && <span className="text-xs text-slate-500">{datumText(b.beratenAm)}</span>}
                      <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                    </button>
                    <button type="button" onClick={() => setLoeschen(b)} aria-label={`Beratung ${b.mitarbeiter || 'ohne Namen'} löschen`}
                      className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-700">
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {meldung && <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900">{meldung}</p>}
          </Karte>
        )}

        {reiter === 'angebot' && (
          <AngebotFormular
            firma={firma}
            logo={logo}
            beratungen={liste.length}
            onGespeichert={setFirma}
            onGeloescht={() => gehe(FIRMEN)}
          />
        )}

        {reiter === 'uebersicht' && <Uebersicht firma={firma} logo={logo} beratungen={liste} />}
      </div>

      <Dialog offen={loeschen !== null} titel="Beratung löschen?" onSchliessen={() => setLoeschen(null)}>
        <p className="text-sm leading-relaxed text-slate-700">
          Die Beratung von „{loeschen?.mitarbeiter || 'ohne Namen'}“ wird gelöscht. Ausgedruckte Unterlagen bleiben davon unberührt.
        </p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => setLoeschen(null)} className={KNOPF_ZWEIT}>Abbrechen</button>
          <button type="button" className={KNOPF_GEFAHR}
            onClick={() => {
              const b = loeschen;
              setLoeschen(null);
              if (!b) return;
              void beratungLoeschen(b.id).then((ok) => {
                if (ok) setBeratungen(liste.filter((x) => x.id !== b.id));
                else setMeldung('Die Beratung konnte nicht gelöscht werden.');
              });
            }}>
            Löschen
          </button>
        </div>
      </Dialog>
    </div>
  );
}
