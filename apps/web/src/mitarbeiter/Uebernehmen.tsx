import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { firmenAngebotSchema, firmenModellSchema, type FirmenModellDaten } from '@renten/schema';
import { firmaAnlegen, firmaSpeichern, firmenLaden, type Firma } from '../lib/bav-beratung';
import { Dialog } from '../components/Dialog';
import { TextFeld } from '../components/Feld';
/*
 * Das Fenster erscheint auf den Arbeitgeber-Seiten, nicht in der
 * Mitarbeiterberatung — deshalb im Stil der App, nicht im Stil dieser Seite.
 */
const KNOPF = 'inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-50';
const KNOPF_ZWEIT = 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50';
import { MODELL_NAME, regelText } from './texte';
import { ortSuche } from './ort';

const NEU = 'neu';

/**
 * „Für die Mitarbeiter-Beratung übernehmen“ — das Fenster dazu, auf den drei
 * Arbeitgeber-Seiten. Was dort eingestellt ist (Modell und Bundesland), wird
 * das Angebot einer Firma: einer neuen oder einer bestehenden. Bei einer
 * bestehenden bleibt alles andere (Logo, Texte, Versicherer) stehen.
 *
 * Wird erst beim ersten Klick geladen (`UebernehmenKnopf`).
 */
export function UebernehmenDialog({ offen, onSchliessen, modell, bundesland }: {
  offen: boolean; onSchliessen: () => void; modell: FirmenModellDaten; bundesland: string;
}) {
  const [firmen, setFirmen] = useState<Firma[] | 'laedt' | 'fehler'>('laedt');
  const [wahl, setWahl] = useState(NEU);
  const [name, setName] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fertig, setFertig] = useState<Firma | null>(null);

  useEffect(() => {
    if (!offen) return;
    let aktiv = true;
    setFertig(null);
    setMeldung(null);
    setFirmen('laedt');
    void firmenLaden().then((f) => { if (aktiv) setFirmen(f); });
    return () => { aktiv = false; };
  }, [offen]);

  const geprueft = firmenModellSchema.safeParse(modell);
  const liste = Array.isArray(firmen) ? firmen : [];
  const ziel = liste.find((f) => f.id === wahl) ?? null;

  const uebernehmen = async (e: FormEvent) => {
    e.preventDefault();
    if (laeuft || !geprueft.success) return;
    if (!ziel && name.trim() === '') { setMeldung('Bitte geben Sie den Namen der Firma ein.'); return; }
    setLaeuft(true);
    setMeldung(null);
    if (ziel) {
      const angebot = { ...ziel.angebot, modell: geprueft.data, bundesland };
      const ok = await firmaSpeichern({ ...ziel, angebot });
      setLaeuft(false);
      if (ok) setFertig({ ...ziel, angebot });
      else setMeldung('Das hat nicht geklappt. Bitte versuchen Sie es noch einmal.');
      return;
    }
    const r = await firmaAnlegen(name, firmenAngebotSchema.parse({ modell: geprueft.data, bundesland }));
    setLaeuft(false);
    if (r === 'grenze') setMeldung('Es sind höchstens 200 Firmen je Konto möglich.');
    else if (r === 'fehler') setMeldung('Die Firma konnte nicht angelegt werden. Bitte versuchen Sie es noch einmal.');
    else setFertig(r);
  };

  return (
    <Dialog offen={offen} titel="Für die Mitarbeiter-Beratung übernehmen" onSchliessen={onSchliessen}>
      {fertig ? (
        <div className="space-y-4">
          <p className="flex items-start gap-2 text-sm leading-relaxed text-slate-700">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
            <span>
              Das {MODELL_NAME[fertig.angebot.modell.art]} gilt jetzt für <strong>{fertig.name}</strong>. Ergänzen Sie
              dort Logo, Begrüßung und Versicherer — dann kann die erste Beratung beginnen.
            </span>
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onSchliessen} className={KNOPF_ZWEIT}>Schließen</button>
            <a href={`/mitarbeiterberatung${ortSuche({ firma: fertig.id, beratung: null, reiter: 'angebot' })}`}
              target="_blank" rel="noopener" className={KNOPF}>
              Zur Mitarbeiter-Beratung <ArrowRight className="h-4 w-4" aria-hidden />
            </a>
          </div>
        </div>
      ) : (
        <form onSubmit={(e) => void uebernehmen(e)} className="space-y-4">
          <div className="rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">
            <strong className="text-slate-900">{MODELL_NAME[modell.art]}:</strong> {regelText(modell)}
            <span className="block text-xs text-slate-500">Sitz der Firma: {bundesland}</span>
          </div>
          {!geprueft.success && (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900">
              Die Werte des Modells liegen außerhalb dessen, was die Mitarbeiter-Beratung annimmt. Bitte prüfen Sie die Eingaben.
            </p>
          )}

          <fieldset>
            <legend className="mb-1 text-xs font-bold text-slate-700">Für welche Firma?</legend>
            {firmen === 'laedt' && <p className="text-sm text-slate-500">Ihre Firmen werden geladen …</p>}
            {firmen === 'fehler' && <p className="text-sm text-rose-800">Ihre Firmen konnten nicht geladen werden — eine neue geht trotzdem.</p>}
            <div className="max-h-64 space-y-1 overflow-y-auto">
              <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                <input type="radio" name="firma" checked={wahl === NEU} onChange={() => setWahl(NEU)} />
                <span className="font-bold text-slate-900">Neue Firma</span>
              </label>
              {liste.map((f) => (
                <label key={f.id} className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                  <input type="radio" name="firma" className="mt-1" checked={wahl === f.id} onChange={() => setWahl(f.id)} />
                  <span className="min-w-0">
                    <span className="block break-words font-bold text-slate-900">{f.name}</span>
                    <span className="block text-xs text-slate-500">bisher: {MODELL_NAME[f.angebot.modell.art]}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {ziel ? (
            <p className="text-xs leading-relaxed text-slate-600">
              Modell und Bundesland von „{ziel.name}“ werden ersetzt; Logo, Texte und Versicherer bleiben. Bereits geführte
              Beratungen rechnen danach mit dem neuen Modell.
            </p>
          ) : (
            <TextFeld label="Name der Firma" wert={name} onChange={setName} maxLaenge={120} platzhalter="z. B. Muster GmbH" />
          )}

          {meldung && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900">{meldung}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onSchliessen} className={KNOPF_ZWEIT}>Abbrechen</button>
            <button type="submit" disabled={laeuft || !geprueft.success} className={KNOPF}>
              {laeuft ? 'Wird übernommen …' : 'Übernehmen'}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
