import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { firmenAngebotSchema, firmenModellSchema, type FirmenModellDaten } from '@renten/schema';
import { firmaAnlegen, firmaSpeichern, firmenLaden, type Firma } from '../lib/bav-beratung';
import { Dialog } from '../components/Dialog';
import { TextFeld } from '../components/Feld';
import { FEHLER, FELD_LABEL, KNOPF, KNOPF_ZWEIT } from '../components/stil';
import { MODELL_NAME, regelText } from './texte';
import { ortSuche } from './ort';

const NEU = 'neu';

/**
 * „Für die Mitarbeiter-Beratung übernehmen“ — das Fenster dazu, auf den drei
 * Arbeitgeber-Seiten. Was dort eingestellt ist (Modell und Bundesland), wird
 * das Angebot einer Firma: einer neuen oder einer bestehenden. Bei einer
 * bestehenden bleibt alles andere (Logo, Texte, Versicherer) stehen. Zur Wahl
 * stehen nur eigene Firmen — das Angebot einer geteilten pflegt, wer sie
 * angelegt hat.
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
    void firmenLaden().then((f) => { if (aktiv) setFirmen(Array.isArray(f) ? f.filter((x) => x.eigene) : f); });
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
          <p className="flex items-start gap-2 text-sm leading-relaxed text-ui-tinte">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-ui-tinte" aria-hidden />
            <span>
              Das {MODELL_NAME[fertig.angebot.modell.art]} gilt jetzt für <span className="font-medium">{fertig.name}</span>. Ergänzen Sie
              dort Logo, Begrüßung und Versicherer — dann kann die erste Beratung beginnen.
            </span>
          </p>
          <div className="flex flex-wrap justify-end gap-2 border-t border-ui-linie pt-4">
            <button type="button" onClick={onSchliessen} className={KNOPF_ZWEIT}>Schließen</button>
            <a href={`/mitarbeiterberatung${ortSuche({ firma: fertig.id, beratung: null, reiter: 'angebot' })}`}
              target="_blank" rel="noopener" className={KNOPF}>
              Zur Mitarbeiter-Beratung <ArrowRight className="h-4 w-4" aria-hidden />
            </a>
          </div>
        </div>
      ) : (
        <form onSubmit={(e) => void uebernehmen(e)} className="space-y-4">
          <div className="ui-innen p-3 text-sm leading-relaxed text-ui-tinte">
            <span className="font-medium">{MODELL_NAME[modell.art]}:</span> {regelText(modell)}
            <span className="mt-0.5 block text-xs text-ui-schiefer">Sitz der Firma: {bundesland}</span>
          </div>
          {!geprueft.success && (
            <p role="alert" className={FEHLER}>
              Die Werte des Modells liegen außerhalb dessen, was die Mitarbeiter-Beratung annimmt. Bitte prüfen Sie die Eingaben.
            </p>
          )}

          <fieldset>
            <legend className={FELD_LABEL}>Für welche Firma?</legend>
            {firmen === 'laedt' && <p className="text-sm text-ui-schiefer">Ihre Firmen werden geladen …</p>}
            {firmen === 'fehler' && <p className="text-sm text-rose-800">Ihre Firmen konnten nicht geladen werden — eine neue geht trotzdem.</p>}
            <div className="max-h-64 space-y-1 overflow-y-auto">
              <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-ui-innen">
                <input type="radio" name="firma" checked={wahl === NEU} onChange={() => setWahl(NEU)} />
                <span className="font-medium text-ui-tinte">Neue Firma</span>
              </label>
              {liste.map((f) => (
                <label key={f.id} className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-ui-innen">
                  <input type="radio" name="firma" className="mt-1" checked={wahl === f.id} onChange={() => setWahl(f.id)} />
                  <span className="min-w-0">
                    <span className="block break-words font-medium text-ui-tinte">{f.name}</span>
                    <span className="block text-xs text-ui-schiefer">bisher: {MODELL_NAME[f.angebot.modell.art]}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {ziel ? (
            <p className="text-xs leading-relaxed text-ui-schiefer">
              Modell und Bundesland von „{ziel.name}“ werden ersetzt; Logo, Texte und Versicherer bleiben. Bereits geführte
              Beratungen rechnen danach mit dem neuen Modell.
            </p>
          ) : (
            <TextFeld label="Name der Firma" wert={name} onChange={setName} maxLaenge={120} platzhalter="z. B. Muster GmbH" />
          )}

          {meldung && <p role="alert" className={FEHLER}>{meldung}</p>}
          <div className="flex flex-wrap justify-end gap-2 border-t border-ui-linie pt-4">
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
