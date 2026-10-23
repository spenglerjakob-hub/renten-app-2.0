import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Lock, Save } from 'lucide-react';
import type { BeratungDaten } from '@renten/schema';
import {
  beratungLaden, beratungSpeichern, firmaLaden, unterlagenLaden, type Beratung, type Firma, type Unterlagen,
} from '../lib/bav-beratung';
import { KNOPF, KNOPF_ZWEIT, LINK } from '../components/stil';
import { FirmenZeichen, useBeraterAuftritt, useFirmenlogo } from './bausteine';
import { zeitpunktText } from './unterschrift-daten';
import { beitragsRechnung, kennzahlenRechnung, leistungsRechnung, versorgungslueckeRechnung } from './rechnung';
import {
  SchrittAngaben, SchrittAngebot, SchrittEntscheidung, SchrittLeistung, SchrittLuecke, SchrittRechnung, SchrittUnterlagen,
} from './schritte';
import type { Ort } from './ort';

export const SCHRITTE = [
  'Angebot', 'Ihre Angaben', 'Versorgungslücke', 'Ihre Rechnung', 'Leistung im Alter', 'Entscheidung', 'Unterlagen',
] as const;

/**
 * Eine Beratung: sieben Schritte fuer den geteilten Bildschirm. „Versorgungsluecke“
 * kam als dritter dazu (Datenversion 2; `beratungLesen` hebt aeltere Daten an).
 *
 * Gerechnet wird bei jeder Eingabe neu (`rechnung.ts`), gespeichert beim
 * Wechsel des Schritts, mit „Speichern“ und beim Verlassen der Beratung —
 * nur die Eingaben. Vor dem Schliessen des Tabs mit Ungespeichertem fragt
 * der Browser nach. Die Leistung
 * im Alter braucht mehrere Projektionen; sie rechnet mit einem
 * aufgeschobenen Stand, damit das Tippen fluessig bleibt.
 *
 * UNTERSCHRIEBEN (Unterschrift.tsx): Mit der ersten Unterschrift sind die
 * Unterlagen festgeschrieben und die Beratung ist gesperrt — die Schritte 1
 * bis 6 nur noch zum Ansehen, gespeichert wird nichts mehr (die Datenbank
 * wiese es ab). Wer die Unterschriften aufhebt, kann wieder aendern.
 */
export function BeratungAnsicht({ firmaId, beratungId, gehe }: { firmaId: string; beratungId: string; gehe: (o: Ort) => void }) {
  const [firma, setFirma] = useState<Firma | null | 'laedt' | 'fehler'>('laedt');
  const [beratung, setBeratung] = useState<Beratung | null | 'laedt' | 'fehler'>('laedt');
  const [daten, setDaten] = useState<BeratungDaten | null>(null);
  const [gespeichert, setGespeichert] = useState('');
  const [speichern, setSpeichern] = useState<'bereit' | 'speichert' | 'fehler'>('bereit');
  const [unterlagen, setUnterlagen] = useState<Unterlagen | null | 'fehler'>(null);
  // Fuer das Speichern beim Verlassen: der neueste Stand, ohne auf das naechste Rendern zu warten.
  const datenRef = useRef<BeratungDaten | null>(null);
  const gespeichertRef = useRef('');
  datenRef.current = daten;
  const gesperrt = unterlagen !== null && unterlagen !== 'fehler';
  const gesperrtRef = useRef(gesperrt);
  gesperrtRef.current = gesperrt;
  const logo = useFirmenlogo(firma && typeof firma === 'object' ? firma.logoPfad : null);
  const auftritt = useBeraterAuftritt();

  useEffect(() => {
    let aktiv = true;
    void Promise.all([firmaLaden(firmaId), beratungLaden(beratungId), unterlagenLaden(beratungId)]).then(([f, b, u]) => {
      if (!aktiv) return;
      setFirma(f);
      setUnterlagen(u);
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
    if (d && !gesperrtRef.current && JSON.stringify(d) !== gespeichertRef.current) void beratungSpeichern(beratungId, d);
  }, [beratungId]);

  // Gesperrt aendert sich nur der Schritt — das ist nichts, was verloren ginge.
  const geaendert = !gesperrt && daten !== null && JSON.stringify(daten) !== gespeichert;
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
  // Die Projektionen nur dort, wo sie gebraucht werden — Entscheidung und Unterlagen (Schritt 6 und 7) drucken alles.
  const leistung = useMemo(() => {
    if (!f || !aufgeschoben || schritt < 4) return null;
    return leistungsRechnung(f.angebot, aufgeschoben, beitragsRechnung(f.angebot, aufgeschoben));
  }, [f, aufgeschoben, schritt]);
  const kennzahlen = useMemo(
    () => (f && aufgeschoben && leistung ? kennzahlenRechnung(f.angebot, aufgeschoben, leistung) : null),
    [f, aufgeschoben, leistung],
  );
  // Fuer den Schritt selbst und fuer die Unterlagen (Gespraechsunterlagen ab der Entscheidung)
  const luecke = useMemo(() => {
    if (!f || !aufgeschoben || (schritt !== 2 && schritt < 5)) return null;
    return versorgungslueckeRechnung(f.angebot, aufgeschoben);
  }, [f, aufgeschoben, schritt]);

  const zurFirma = () => gehe({ firma: firmaId, beratung: null, reiter: 'mitarbeiter' });
  const zurueck = (onClick: () => void) => (
    <button type="button" onClick={onClick} className={LINK}>
      <ArrowLeft className="h-4 w-4" aria-hidden /> {f ? f.name : 'Zur Firma'}
    </button>
  );

  if (firma === 'laedt' || beratung === 'laedt') return <p className="text-sm text-ui-schiefer">Die Beratung wird geladen …</p>;
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

  const aktualisieren = async () => { setUnterlagen(await unterlagenLaden(beratungId)); };
  const sichern = async (d: BeratungDaten) => {
    if (gesperrt) return true;
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
  const setze = (fn: (d: BeratungDaten) => BeratungDaten) => { if (!gesperrt) setDaten((d) => (d ? fn(d) : d)); };
  const geheZu = (i: number) => {
    const d = { ...daten, schritt: Math.max(0, Math.min(SCHRITTE.length - 1, i)) };
    setDaten(d);
    void sichern(d);
    window.scrollTo({ top: 0 });
  };

  const props = { firma: f, logo, daten, setze, r, leistung, geheZu };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {zurueck(fertig)}
        {gesperrt ? (
          <span role="status" className="inline-flex items-center gap-1.5 text-sm text-ui-tinte">
            <Lock className="h-4 w-4" aria-hidden /> Unterschrieben
          </span>
        ) : (
          <div className="flex items-center gap-3">
            <span role="status" className="text-xs text-ui-schiefer">
              {speichern === 'speichert' ? 'Wird gespeichert …' : speichern === 'fehler' ? 'Nicht gespeichert — bitte erneut versuchen.' : geaendert ? 'Nicht gespeichert' : 'Gespeichert'}
            </span>
            <button type="button" onClick={() => void sichern(daten)} disabled={!geaendert || speichern === 'speichert'} className={KNOPF_ZWEIT}>
              <Save className="h-4 w-4" aria-hidden /> Speichern
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FirmenZeichen name={f.name} logo={logo} />
        <p className="text-sm text-ui-schiefer">{daten.angaben.name || 'Neue Beratung'}</p>
      </div>

      <nav aria-label="Schritte der Beratung">
        <ol className="grid grid-cols-7 gap-1">
          {SCHRITTE.map((t, i) => (
            <li key={t}>
              <button
                type="button"
                onClick={() => geheZu(i)}
                aria-current={i === schritt ? 'step' : undefined}
                aria-label={`Schritt ${i + 1}: ${t}`}
                className="group flex w-full flex-col items-center gap-1"
              >
                {/* Ohne Ampel: erledigt halbe Tinte, aktuell volle Tinte, offen Haarlinie. */}
                <span className={`h-1 w-full rounded-full ${i === schritt ? 'bg-ui-tinte' : i < schritt ? 'bg-ui-tinte/30' : 'bg-ui-linie'}`} />
                <span className={`hidden text-xs leading-tight sm:block ${i === schritt ? 'font-medium text-ui-tinte' : 'text-ui-schiefer group-hover:text-ui-tinte'}`}>
                  {t}
                </span>
              </button>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-ui-schiefer sm:hidden">Schritt {schritt + 1} von {SCHRITTE.length}: {SCHRITTE[schritt]}</p>
      </nav>

      {gesperrt && schritt < 6 && (
        <div role="note" className="ui-innen flex flex-wrap items-center gap-3 p-4">
          <p className="flex min-w-0 flex-1 basis-64 items-start gap-2 text-sm leading-relaxed text-ui-tinte">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              Unterschrieben am {zeitpunktText(unterlagen.erstelltAm)} — die Angaben sind festgeschrieben. Zum Ändern heben
              Sie unter „Unterlagen“ die Unterschriften auf.
            </span>
          </p>
          <button type="button" onClick={() => geheZu(6)} className={KNOPF_ZWEIT}>Zu den Unterlagen</button>
        </div>
      )}

      {/* Gesperrt: alles nur zum Ansehen — ein deaktiviertes fieldset sperrt jedes Feld und jeden Knopf darin. */}
      {schritt < 6 ? (
        <fieldset disabled={gesperrt} className="min-w-0">
          {schritt === 0 && <SchrittAngebot {...props} />}
          {schritt === 1 && <SchrittAngaben {...props} />}
          {schritt === 2 && <SchrittLuecke {...props} luecke={luecke} aktuell={aufgeschoben === daten} />}
          {schritt === 3 && <SchrittRechnung {...props} />}
          {schritt === 4 && <SchrittLeistung {...props} kennzahlen={kennzahlen} aktuell={aufgeschoben === daten} />}
          {schritt === 5 && <SchrittEntscheidung {...props} auftritt={auftritt} sichern={sichern} luecke={luecke} kennzahlen={kennzahlen} />}
        </fieldset>
      ) : (
        <SchrittUnterlagen {...props} auftritt={auftritt} sichern={sichern} luecke={luecke} kennzahlen={kennzahlen}
          beratungId={beratungId} unterlagen={unterlagen} aktualisieren={aktualisieren} aktuell={aufgeschoben === daten} />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ui-linie pt-6">
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
