import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Save } from 'lucide-react';
import type { BeratungDaten } from '@renten/schema';
import { beratungLaden, beratungSpeichern, firmaLaden, type Beratung, type Firma } from '../lib/bav-beratung';
import { FirmenZeichen, KNOPF, KNOPF_ZWEIT, useBeraterAuftritt, useFirmenlogo } from './bausteine';
import { beitragsRechnung, leistungsRechnung } from './rechnung';
import {
  SchrittAngaben, SchrittAngebot, SchrittEntscheidung, SchrittLeistung, SchrittRechnung, SchrittUnterlagen,
} from './schritte';
import type { Ort } from './ort';

export const SCHRITTE = ['Angebot', 'Ihre Angaben', 'Ihre Rechnung', 'Leistung im Alter', 'Entscheidung', 'Unterlagen'] as const;

/**
 * Eine Beratung: sechs Schritte fuer den geteilten Bildschirm.
 *
 * Gerechnet wird bei jeder Eingabe neu (`rechnung.ts`), gespeichert beim
 * Wechsel des Schritts, mit „Speichern“ und beim Verlassen der Beratung —
 * nur die Eingaben. Vor dem Schliessen des Tabs mit Ungespeichertem fragt
 * der Browser nach. Die Leistung
 * im Alter braucht mehrere Projektionen; sie rechnet mit einem
 * aufgeschobenen Stand, damit das Tippen fluessig bleibt.
 */
export function BeratungAnsicht({ firmaId, beratungId, gehe }: { firmaId: string; beratungId: string; gehe: (o: Ort) => void }) {
  const [firma, setFirma] = useState<Firma | null | 'laedt' | 'fehler'>('laedt');
  const [beratung, setBeratung] = useState<Beratung | null | 'laedt' | 'fehler'>('laedt');
  const [daten, setDaten] = useState<BeratungDaten | null>(null);
  const [gespeichert, setGespeichert] = useState('');
  const [speichern, setSpeichern] = useState<'bereit' | 'speichert' | 'fehler'>('bereit');
  // Fuer das Speichern beim Verlassen: der neueste Stand, ohne auf das naechste Rendern zu warten.
  const datenRef = useRef<BeratungDaten | null>(null);
  const gespeichertRef = useRef('');
  datenRef.current = daten;
  const logo = useFirmenlogo(firma && typeof firma === 'object' ? firma.logoPfad : null);
  const auftritt = useBeraterAuftritt();

  useEffect(() => {
    let aktiv = true;
    void Promise.all([firmaLaden(firmaId), beratungLaden(beratungId)]).then(([f, b]) => {
      if (!aktiv) return;
      setFirma(f);
      // Eine Beratung gehoert zu genau einer Firma — eine fremde Kombination in der Adresse gilt nicht.
      const passt = b && typeof b === 'object' && b.firma === firmaId ? b : b === 'fehler' ? 'fehler' : null;
      setBeratung(passt);
      if (passt && typeof passt === 'object') {
        setDaten(passt.daten);
        gespeichertRef.current = JSON.stringify(passt.daten);
        setGespeichert(gespeichertRef.current);
      }
    });
    return () => { aktiv = false; };
  }, [firmaId, beratungId]);

  // Wer die Beratung verlaesst — mit „Zurueck“ im Browser oder einem Link —, verliert nichts.
  useEffect(() => () => {
    const d = datenRef.current;
    if (d && JSON.stringify(d) !== gespeichertRef.current) void beratungSpeichern(beratungId, d);
  }, [beratungId]);

  const geaendert = daten !== null && JSON.stringify(daten) !== gespeichert;
  useEffect(() => {
    if (!geaendert) return;
    const warnen = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warnen);
    return () => window.removeEventListener('beforeunload', warnen);
  }, [geaendert]);

  const aufgeschoben = useDeferredValue(daten);
  const f = firma && typeof firma === 'object' ? firma : null;
  const r = useMemo(() => (f && daten ? beitragsRechnung(f.angebot, daten) : null), [f, daten]);
  const schritt = daten?.schritt ?? 0;
  const leistung = useMemo(() => {
    if (!f || !aufgeschoben || schritt < 3) return null;
    return leistungsRechnung(f.angebot, aufgeschoben, beitragsRechnung(f.angebot, aufgeschoben));
  }, [f, aufgeschoben, schritt]);

  const zurFirma = () => gehe({ firma: firmaId, beratung: null, reiter: 'mitarbeiter' });
  const zurueck = (onClick: () => void) => (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 text-sm font-bold text-indigo-700 hover:underline">
      <ArrowLeft className="h-4 w-4" aria-hidden /> {f ? f.name : 'Zur Firma'}
    </button>
  );

  if (firma === 'laedt' || beratung === 'laedt') return <p className="text-sm text-slate-500">Die Beratung wird geladen …</p>;
  if (!f || !daten || !r || beratung === null || beratung === 'fehler') {
    return (
      <div className="space-y-3">
        {zurueck(zurFirma)}
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900">
          {beratung === null || firma === null
            ? 'Diese Beratung gibt es nicht (mehr) in Ihrem Konto.'
            : 'Die Beratung konnte nicht geladen werden. Bitte laden Sie die Seite neu.'}
        </p>
      </div>
    );
  }

  const sichern = async (d: BeratungDaten) => {
    setSpeichern('speichert');
    const ok = await beratungSpeichern(beratungId, d);
    if (ok) {
      gespeichertRef.current = JSON.stringify(d);
      setGespeichert(gespeichertRef.current);
    }
    setSpeichern(ok ? 'bereit' : 'fehler');
    return ok;
  };
  // Erst gespeichert, dann zur Liste. Klappt das Speichern nicht, bleibt man hier — die Meldung steht oben.
  const fertig = () => (geaendert ? void sichern(daten).then((ok) => { if (ok) zurFirma(); }) : zurFirma());
  const setze = (fn: (d: BeratungDaten) => BeratungDaten) => setDaten((d) => (d ? fn(d) : d));
  const geheZu = (i: number) => {
    const d = { ...daten, schritt: Math.max(0, Math.min(SCHRITTE.length - 1, i)) };
    setDaten(d);
    void sichern(d);
    window.scrollTo({ top: 0 });
  };

  const props = { firma: f, logo, daten, setze, r, leistung, geheZu };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {zurueck(fertig)}
        <div className="flex items-center gap-3">
          <span role="status" className="text-xs text-slate-500">
            {speichern === 'speichert' ? 'Wird gespeichert …' : speichern === 'fehler' ? 'Nicht gespeichert — bitte erneut versuchen.' : geaendert ? 'Nicht gespeichert' : 'Gespeichert'}
          </span>
          <button type="button" onClick={() => void sichern(daten)} disabled={!geaendert || speichern === 'speichert'} className={KNOPF_ZWEIT}>
            <Save className="h-4 w-4" aria-hidden /> Speichern
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FirmenZeichen name={f.name} logo={logo} />
        <p className="text-sm font-bold text-slate-700">{daten.angaben.name || 'Neue Beratung'}</p>
      </div>

      <nav aria-label="Schritte der Beratung">
        <ol className="grid grid-cols-6 gap-1">
          {SCHRITTE.map((t, i) => (
            <li key={t}>
              <button
                type="button"
                onClick={() => geheZu(i)}
                aria-current={i === schritt ? 'step' : undefined}
                aria-label={`Schritt ${i + 1}: ${t}`}
                className="group flex w-full flex-col items-center gap-1"
              >
                <span className={`h-1.5 w-full rounded-full ${i === schritt ? 'bg-indigo-600' : i < schritt ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                <span className={`hidden text-xs font-semibold leading-tight sm:block ${i === schritt ? 'text-indigo-700' : 'text-slate-500 group-hover:text-slate-700'}`}>
                  {t}
                </span>
              </button>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-xs font-semibold text-slate-500 sm:hidden">Schritt {schritt + 1} von {SCHRITTE.length}: {SCHRITTE[schritt]}</p>
      </nav>

      {schritt === 0 && <SchrittAngebot {...props} />}
      {schritt === 1 && <SchrittAngaben {...props} />}
      {schritt === 2 && <SchrittRechnung {...props} />}
      {schritt === 3 && <SchrittLeistung {...props} aktuell={aufgeschoben === daten} />}
      {schritt === 4 && <SchrittEntscheidung {...props} />}
      {schritt === 5 && <SchrittUnterlagen {...props} auftritt={auftritt} sichern={sichern} />}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
        <button type="button" onClick={() => geheZu(schritt - 1)} disabled={schritt === 0} className={KNOPF_ZWEIT}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> Zurück
        </button>
        {schritt < SCHRITTE.length - 1 ? (
          <button type="button" onClick={() => geheZu(schritt + 1)} className={KNOPF}>
            Weiter: {SCHRITTE[schritt + 1]} <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        ) : (
          <button type="button" onClick={fertig} className={KNOPF}>
            Fertig — zur Mitarbeiterliste
          </button>
        )}
      </div>
    </div>
  );
}
