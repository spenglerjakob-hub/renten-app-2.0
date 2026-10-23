import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, Plus } from 'lucide-react';
import { firmenAngebotSchema } from '@renten/schema';
import { firmaAnlegen, firmenLaden, staendeLaden, type Firma, type Stand } from '../lib/bav-beratung';
import { TextFeld } from '../components/Feld';
import { ETIKETT, KNOPF, Karte, STATUS_PUNKT, Titel } from './bausteine';
import { MODELL_NAME, regelText } from './texte';
import { anzahlText } from './uebersicht-daten';
import type { Ort } from './ort';

/** Die Firmen des Beraters — Einstieg der Seite. */
export function FirmenListe({ gehe }: { gehe: (o: Ort) => void }) {
  const [firmen, setFirmen] = useState<Firma[] | 'laedt' | 'fehler'>('laedt');
  const [staende, setStaende] = useState<Record<string, Stand>>({});
  const [name, setName] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);

  useEffect(() => {
    let aktiv = true;
    void Promise.all([firmenLaden(), staendeLaden()]).then(([f, s]) => {
      if (!aktiv) return;
      setFirmen(f);
      if (s !== 'fehler') setStaende(s);
    });
    return () => { aktiv = false; };
  }, []);

  const anlegen = async (e: FormEvent) => {
    e.preventDefault();
    if (laeuft || name.trim() === '') return;
    setLaeuft(true);
    setMeldung(null);
    const r = await firmaAnlegen(name, firmenAngebotSchema.parse({}));
    setLaeuft(false);
    if (r === 'grenze') setMeldung('Es sind höchstens 200 Firmen je Konto möglich.');
    else if (r === 'fehler') setMeldung('Die Firma konnte nicht angelegt werden. Bitte versuchen Sie es noch einmal.');
    else gehe({ firma: r.id, beratung: null, reiter: 'angebot' });
  };

  return (
    <div className="space-y-10">
      <div>
        <Titel gross>bAV-Mitarbeiterberatung</Titel>
        <p className="mt-3 max-w-3xl text-base leading-relaxed text-mb-schiefer">
          Hat sich eine Firma für ein Modell entschieden, stellen Sie hier ihr Angebot ein — Modell, Versicherer, Logo —
          und führen dann jeden Mitarbeiter im Gespräch durch sieben Schritte. Am Ende stehen das Beratungsprotokoll,
          die Entgeltumwandlungsvereinbarung oder die Verzichtserklärung und eine Übersicht für den Arbeitgeber.
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-mb-schiefer">
          Das Modell übernehmen Sie am schnellsten von der Arbeitgeber-Seite:{' '}
          <a href="/zuschussmodell" className="font-medium text-mb-tinte underline underline-offset-4">Zuschussmodell</a>,{' '}
          <a href="/festbetrag" className="font-medium text-mb-tinte underline underline-offset-4">Festbetrag-Modell</a> oder{' '}
          <a href="/arbeitgeber" className="font-medium text-mb-tinte underline underline-offset-4">Matching-Modell</a> —
          dort „Für die Mitarbeiter-Beratung übernehmen“.
        </p>
      </div>

      <Karte titel="Neue Firma">
        <form onSubmit={(e) => void anlegen(e)} className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 basis-64">
            <TextFeld label="Name der Firma" wert={name} onChange={setName} maxLaenge={120} autoComplete="organization" />
          </div>
          <button type="submit" disabled={laeuft || name.trim() === ''} className={KNOPF}>
            <Plus className="h-4 w-4" aria-hidden /> {laeuft ? 'Wird angelegt …' : 'Anlegen'}
          </button>
        </form>
        {meldung && <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900">{meldung}</p>}
      </Karte>

      {firmen === 'laedt' && <p className="text-sm text-mb-schiefer">Firmen werden geladen …</p>}
      {firmen === 'fehler' && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900">
          Die Firmen konnten nicht geladen werden. Bitte laden Sie die Seite neu.
        </p>
      )}
      {Array.isArray(firmen) && (firmen.length === 0 ? (
        <p className="text-sm text-mb-schiefer">Noch keine Firma angelegt.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2" aria-label="Firmen">
          {firmen.map((f) => {
            const s = staende[f.id] ?? { offen: 0, teilnahme: 0, verzicht: 0 };
            return (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => gehe({ firma: f.id, beratung: null, reiter: 'mitarbeiter' })}
                  className="group flex h-full w-full items-start gap-3 rounded-3xl bg-mb-nebel p-6 text-left transition-colors hover:bg-[#ebebed]"
                >
                  <span className="min-w-0 flex-1">
                    <span className={`block ${ETIKETT}`}>{MODELL_NAME[f.angebot.modell.art]}</span>
                    <span className="mt-1 block break-words text-xl font-medium tracking-[-0.01em] text-mb-tinte">{f.name}</span>
                    <span className="mt-2 block text-sm leading-relaxed text-mb-schiefer">{regelText(f.angebot.modell)}</span>
                    <span className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      {(['teilnahme', 'verzicht', 'offen'] as const).filter((k) => s[k] > 0).map((k) => (
                        <span key={k} className="inline-flex items-center gap-1.5 text-mb-tinte">
                          <span aria-hidden className={`h-2 w-2 rounded-full ${STATUS_PUNKT[k]}`} />{anzahlText(k, s[k])}
                        </span>
                      ))}
                      {s.teilnahme + s.verzicht + s.offen === 0 && <span className="text-mb-schiefer">Noch keine Beratung</span>}
                    </span>
                  </span>
                  <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-mb-tinte transition-transform group-hover:translate-x-0.5" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      ))}
    </div>
  );
}
