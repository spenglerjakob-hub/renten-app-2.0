import { useState } from 'react';
import { Printer, RefreshCw, Trash2, UserCheck } from 'lucide-react';
import { eingangUebernehmen } from '@renten/schema';
import { LinkFeld } from '../components/LinkFeld';
import { FEHLER, KNOPF_KLEIN, Stand } from '../components/stil';
import { useAntraege, antragFehlertext } from '../store/antraege';
import { useSzenario } from '../store/szenario';
import {
  antragEingangUebernehmen, antragLaden, antragLink, antragStand, STAND_TEXT, type Antrag,
} from '../lib/antraege';
import { angabenBereinigt, angabenFuer } from './antrag-daten';
import { antragsbogenDrucken } from './antragsbogen';
import { LOESUNG_KURZ } from './tuev-berechnung';

const datum = (iso: string) => new Date(iso).toLocaleDateString('de-DE');

/**
 * „Anträge“ — das Fenster in der Seitenleiste: alle Anträge des Beraters mit
 * ihrem Stand. Was der Kunde eingereicht hat, lässt sich hier übernehmen,
 * der Antragsbogen drucken und ein Antrag löschen — auch ohne den Plan, zu
 * dem er gehört: Der Antrag trägt ein Abbild seiner Lösungen.
 */
export function Antraege({ berater }: { berater?: string }) {
  const { liste, laedt, meldung, laden, merken, loeschen, meldungSetzen } = useAntraege();
  const antragImPlan = useSzenario((s) => s.szenario.loesungen.antrag);
  const setzeLoesungen = useSzenario((s) => s.setzeLoesungen);
  const [arbeitet, setArbeitet] = useState<string | null>(null);
  const [fragt, setFragt] = useState<string | null>(null);

  const uebernehmen = async (a: Antrag) => {
    if (!a.eingang) return;
    setArbeitet(a.id);
    try {
      const neu = angabenBereinigt(angabenFuer(eingangUebernehmen(a.angaben, a.eingang), a.loesungen));
      await antragEingangUebernehmen(a.id, neu);
      const frisch = await antragLaden(a.id);
      if (frisch) merken(frisch);
      meldungSetzen({ art: 'ok', text: 'Die Angaben des Kunden sind übernommen.' });
    } catch (e) {
      meldungSetzen({ art: 'fehler', text: antragFehlertext(e) });
    } finally {
      setArbeitet(null);
    }
  };

  const drucken = (a: Antrag) => {
    void antragsbogenDrucken(a, berater).then((ok) => {
      if (!ok) meldungSetzen({ art: 'fehler', text: 'Der Antragsbogen ließ sich nicht öffnen — erlaubt der Browser neue Fenster?' });
    });
  };

  const entfernen = async (a: Antrag) => {
    setArbeitet(a.id);
    if (await loeschen(a.id) && antragImPlan === a.id) setzeLoesungen({ antrag: undefined });
    setFragt(null);
    setArbeitet(null);
  };

  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-ui-schiefer [&_strong]:font-medium [&_strong]:text-ui-tinte">
        Die Angaben für Anträge nach „Lösungen annehmen“ — mit dem Stand beim Kunden. Anträge und
        Ausweiskopien werden spätestens <strong>90 Tage</strong> nach dem Anlegen automatisch gelöscht.
      </p>

      {meldung && (
        <div role="status" className={`flex items-start justify-between gap-3 ${
          meldung.art === 'ok' ? 'ui-innen px-3 py-2 text-sm text-ui-tinte' : FEHLER
        }`}>
          <span>{meldung.text}</span>
          <button type="button" onClick={() => meldungSetzen(null)} className="text-xs font-medium underline underline-offset-2">OK</button>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-ui-tinte">{liste.length === 1 ? 'Ein Antrag' : `${liste.length} Anträge`}</span>
        <button type="button" onClick={() => void laden()} disabled={laedt} className={KNOPF_KLEIN}>
          <RefreshCw className={`h-3.5 w-3.5 ${laedt ? 'animate-spin' : ''}`} aria-hidden /> Aktualisieren
        </button>
      </div>

      {liste.length === 0 ? (
        <p className="rounded-[10px] border border-dashed border-ui-feld-rand px-4 py-6 text-center text-sm text-ui-schiefer">
          Noch kein Antrag. Er entsteht in der Etappe „Abschluss“, sobald Sie die Angaben dort speichern.
        </p>
      ) : (
        <ul className="divide-y divide-ui-linie">
          {liste.map((a) => {
            const stand = antragStand(a);
            return (
              <li key={a.id} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ui-tinte">
                      {a.kunde || 'Ohne Namen'}
                      {a.id === antragImPlan && <span className="ml-2 text-xs font-normal text-ui-schiefer">· dieser Plan</span>}
                    </p>
                    <p className="mt-0.5 text-xs text-ui-schiefer">
                      {a.loesungen.map((l) => l.anbieter || LOESUNG_KURZ[l.art]).join(', ') || 'Ohne Lösungen'}
                      {' · '}angelegt {datum(a.erstelltAm)}
                    </p>
                  </div>
                  <Stand art={stand === 'uebernommen' ? 'erledigt' : stand === 'abgelaufen' ? 'vorbei' : 'offen'}>
                    {stand === 'eingegangen' && a.eingegangenAm ? `Eingegangen am ${datum(a.eingegangenAm)}` : STAND_TEXT[stand]}
                  </Stand>
                </div>
                {stand === 'beim-kunden' && a.code && (
                  <div className="mt-2"><LinkFeld link={antragLink(a.code)} neu={false} beschriftung={`Link für ${a.kunde || 'den Kunden'}`} /></div>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {stand === 'eingegangen' && (
                    <button type="button" onClick={() => void uebernehmen(a)} disabled={arbeitet === a.id} className={KNOPF_KLEIN}>
                      <UserCheck className="h-3.5 w-3.5" aria-hidden /> Angaben übernehmen
                    </button>
                  )}
                  <button type="button" onClick={() => drucken(a)} className={KNOPF_KLEIN}>
                    <Printer className="h-3.5 w-3.5" aria-hidden /> Antragsbogen
                  </button>
                  {fragt === a.id ? (
                    <>
                      <button type="button" onClick={() => void entfernen(a)} disabled={arbeitet === a.id} className={KNOPF_KLEIN}>
                        Wirklich löschen
                      </button>
                      <button type="button" onClick={() => setFragt(null)} className={KNOPF_KLEIN}>Abbrechen</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setFragt(a.id)} className={KNOPF_KLEIN} aria-label={`Antrag ${a.kunde} löschen`}>
                      <Trash2 className="h-3.5 w-3.5" aria-hidden /> Löschen
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
