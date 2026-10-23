import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Lock, Plus, Trash2 } from 'lucide-react';
import { beratungDatenSchema } from '@renten/schema';
import {
  beratungAnlegen, beratungLoeschen, beratungenLaden, firmaLaden, unterschriebeneLaden, type Beratung, type Firma, type UnterschriftPerson,
} from '../lib/bav-beratung';
import { Dialog } from '../components/Dialog';
import { ETIKETT, KNOPF, KNOPF_GEFAHR, KNOPF_ZWEIT, Karte, LINK, Pillen } from '../components/stil';
import { FirmenZeichen, StatusChip, useFirmenlogo } from './bausteine';
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
  // Welche Beratungen am Bildschirm unterschrieben sind — fehlt der Stand, entfaellt nur der Hinweis.
  const [unterschrieben, setUnterschrieben] = useState<Record<string, UnterschriftPerson[]>>({});
  const logo = useFirmenlogo(firma && typeof firma === 'object' ? firma.logoPfad : null);

  useEffect(() => {
    let aktiv = true;
    void Promise.all([firmaLaden(firmaId), beratungenLaden(firmaId), unterschriebeneLaden(firmaId)]).then(([f, b, u]) => {
      if (!aktiv) return;
      setFirma(f);
      setBeratungen(b);
      setUnterschrieben(u === 'fehler' ? {} : u);
    });
    return () => { aktiv = false; };
  }, [firmaId]);

  const zurueck = (
    <button type="button" onClick={() => gehe(FIRMEN)} className={LINK}>
      <ArrowLeft className="h-4 w-4" aria-hidden /> Alle Firmen
    </button>
  );
  if (firma === 'laedt') return <p className="text-sm text-ui-schiefer">Die Firma wird geladen …</p>;
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
    <div className="space-y-8">
      {zurueck}
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <FirmenZeichen name={firma.name} logo={logo} gross />
        <p className="max-w-md text-sm leading-relaxed text-ui-schiefer">
          <span className={`block ${ETIKETT}`}>{MODELL_NAME[firma.angebot.modell.art]}</span>
          <span className="text-ui-tinte">{regelText(firma.angebot.modell)}</span>
        </p>
      </div>

      <Pillen
        beschriftung="Bereiche der Firma"
        aktiv={reiter}
        onWechsel={(id) => gehe({ firma: firma.id, beratung: null, reiter: id })}
        kennung={(id) => ({ reiter: `reiter-${id}`, bereich: `bereich-${id}` })}
        reiter={REITER.map((r) => ({
          id: r.id,
          inhalt: <>
            <span className="sm:hidden">{r.kurz}</span><span className="hidden sm:inline">{r.text}</span>
            {r.id === 'mitarbeiter' && liste.length > 0 ? ` (${liste.length})` : ''}
          </>,
        }))}
      />

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
            {beratungen === 'laedt' && <p className="text-sm text-ui-schiefer">Beratungen werden geladen …</p>}
            {beratungen === 'fehler' && <p role="alert" className="text-sm text-rose-800">Die Beratungen konnten nicht geladen werden.</p>}
            {Array.isArray(beratungen) && liste.length === 0 && (
              <p className="text-sm text-ui-schiefer">
                Noch keine Beratung. Mit „Neue Beratung“ beginnt das Gespräch mit dem ersten Mitarbeiter.
              </p>
            )}
            {liste.length > 0 && (
              <ul className="divide-y divide-ui-linie" aria-label="Beratungen">
                {liste.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                    <button type="button" onClick={() => gehe({ firma: firma.id, beratung: b.id, reiter: 'mitarbeiter' })}
                      className="group flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-left">
                      <span className="min-w-0 break-words text-base font-medium text-ui-tinte">{b.mitarbeiter || 'Ohne Namen'}</span>
                      <StatusChip status={b.status} betrag={b.daten.umwandlungMonat} />
                      {unterschrieben[b.id] && (
                        <span className="inline-flex items-center gap-1 whitespace-nowrap text-sm text-ui-tinte">
                          <Lock className="h-3.5 w-3.5" aria-hidden /> unterschrieben
                        </span>
                      )}
                      {b.beratenAm && <span className="text-sm text-ui-schiefer">{datumText(b.beratenAm)}</span>}
                      <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-ui-tinte transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </button>
                    <button type="button" onClick={() => setLoeschen(b)} aria-label={`Beratung ${b.mitarbeiter || 'ohne Namen'} löschen`}
                      className="rounded-full p-2 text-ui-schiefer hover:bg-rose-50 hover:text-rose-700">
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
        <p className="text-sm leading-relaxed text-ui-tinte">
          Die Beratung von „{loeschen?.mitarbeiter || 'ohne Namen'}“ wird gelöscht
          {loeschen && unterschrieben[loeschen.id] ? ', mit den unterschriebenen Unterlagen' : ''}. Ausgedruckte Unterlagen bleiben
          davon unberührt.
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
