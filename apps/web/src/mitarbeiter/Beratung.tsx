import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Lock, Save } from 'lucide-react';
import type { BeratungDaten } from '@renten/schema';
import {
  beratungLaden, beratungSpeichern, firmaLaden, unterlagenLaden, type Beratung, type Firma, type Unterlagen,
} from '../lib/bav-beratung';
import { AblaufGeber, EtappenAblauf, type AblaufEtappe } from '../components/Ablauf';
import type { StueckeStand } from '../components/ablauf-logik';
import { KNOPF_ZWEIT, LINK, TIPPFLAECHE } from '../components/stil';
import { FirmenZeichen, useBeraterAuftritt, useFirmenlogo } from './bausteine';
import { zeitpunktText } from './unterschrift-daten';
import {
  automatischerBeginn, beitragsRechnung, kennzahlenRechnung, leistungsRechnung, versorgungslueckeRechnung,
} from './rechnung';
import {
  SchrittAngaben, SchrittAngebot, SchrittEntscheidung, SchrittLeistung, SchrittLuecke, SchrittRechnung, SchrittUnterlagen,
} from './schritte';
import {
  angabenZeile, angebotSatz, entscheidungZeile, leistungZeile, lueckeZeile, rechnungZeile, unterlagenZeile,
} from './zeilen';
import type { Ort } from './ort';

export const SCHRITTE = [
  'Angebot', 'Ihre Angaben', 'Versorgungslücke', 'Ihre Rechnung', 'Leistung im Alter', 'Entscheidung', 'Unterlagen',
] as const;

/** Unter diesem Namen merkt sich der Ablauf, wo die Stuecke eines Schritts stehen (`Stuecke` in `schritte.tsx`). */
export const KENNUNGEN = ['angebot', 'angaben', 'luecke', 'rechnung', 'leistung', 'entscheidung', 'unterlagen'] as const;

/**
 * Eine Beratung: sieben Schritte fuer den geteilten Bildschirm. „Versorgungsluecke“
 * kam als dritter dazu (Datenversion 2; `beratungLesen` hebt aeltere Daten an).
 *
 * VON OBEN NACH UNTEN (`components/Ablauf.tsx`), wie die Ruhestandsplanung:
 * Jeder erreichte Schritt steht als Zeile mit seinem Ergebnis da, der offene
 * an seiner Stelle dazwischen — darin geht es Stueck fuer Stueck weiter. Was
 * noch nicht dran war, steht nicht da; „Springen zu“ im Kopf fuehrt den
 * Berater trotzdem an jeden Schritt, etwa wenn er eine Beratung fortsetzt.
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
 * wiese es ab). Wer die Unterschriften aufhebt, kann wieder aendern. Gesperrt
 * ist der Inhalt der Stuecke; ihre Zeilen und „Weiter“ bleiben bedienbar.
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
  /*
    WIE WEIT DIE BERATUNG GEKOMMEN IST: Alle Schritte bis dorthin stehen als
    Zeilen da, auch wenn man einen frueheren wieder oeffnet. Nur im
    Arbeitsspeicher — beim Oeffnen gilt der gemerkte offene Schritt und, was
    die Beratung selbst hergibt (`weit` weiter unten).
  */
  const [besucht, setBesucht] = useState(0);
  // Zaehlt jeden Sprung — auch den auf den schon offenen Schritt: Dann kommt er wieder ins Bild.
  const [sprung, setSprung] = useState(0);
  // Wo die Stuecke jedes Schritts stehen — ueber den Wechsel des Schritts hinweg (`AblaufGeber`).
  const [stueckeStand, setStueckeStand] = useState<Record<string, StueckeStand>>({});
  const merkeStuecke = useCallback(
    (kennung: string, stand: StueckeStand) => setStueckeStand((alt) => ({ ...alt, [kennung]: stand })),
    [],
  );

  useEffect(() => {
    let aktiv = true;
    setStueckeStand({});
    void Promise.all([firmaLaden(firmaId), beratungLaden(beratungId), unterlagenLaden(beratungId)]).then(([f, b, u]) => {
      if (!aktiv) return;
      setFirma(f);
      setUnterlagen(u);
      // Eine Beratung gehoert zu genau einer Firma — eine fremde Kombination in der Adresse gilt nicht.
      const passt = b && typeof b === 'object' && b.firma === firmaId ? b : b === 'fehler' ? 'fehler' : null;
      setBeratung(passt);
      if (passt && typeof passt === 'object') {
        setDaten(passt.daten);
        setBesucht(passt.daten.schritt);
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
  /*
    Eine Beratung, die man wieder oeffnet, zeigt, wie weit sie ist: mit
    Unterschrift alle Schritte, mit einer Entscheidung bis dorthin. Sonst
    beginnt sie beim gemerkten Schritt.
  */
  const weit = Math.max(besucht, schritt, gesperrt ? 6 : daten && daten.entscheidung.status !== 'offen' ? 5 : 0);
  /*
    Die Projektionen erst, wenn die Beratung bei ihrem Schritt angekommen ist —
    dann aber dauerhaft: Die Zeile des Schritts nennt ihr Ergebnis, auch wenn
    ein frueherer offen ist. Entscheidung und Unterlagen (Schritt 6 und 7)
    drucken alles.
  */
  const mitLuecke = weit >= 2;
  const mitLeistung = weit >= 4;
  const leistung = useMemo(() => {
    if (!f || !aufgeschoben || !mitLeistung) return null;
    return leistungsRechnung(f.angebot, aufgeschoben, beitragsRechnung(f.angebot, aufgeschoben));
  }, [f, aufgeschoben, mitLeistung]);
  const kennzahlen = useMemo(
    () => (f && aufgeschoben && leistung ? kennzahlenRechnung(f.angebot, aufgeschoben, leistung) : null),
    [f, aufgeschoben, leistung],
  );
  // Fuer den Schritt selbst, fuer den Anteil, den die Betriebsrente schliesst (Leistung im Alter), und fuer die Unterlagen
  const luecke = useMemo(() => {
    if (!f || !aufgeschoben || !mitLuecke) return null;
    return versorgungslueckeRechnung(f.angebot, aufgeschoben);
  }, [f, aufgeschoben, mitLuecke]);

  const zurFirma = () => gehe({ firma: firmaId, beratung: null, reiter: 'mitarbeiter' });
  const zurueck = (onClick: () => void) => (
    <button type="button" onClick={onClick} className={`${LINK} ${TIPPFLAECHE}`}>
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
  /** @param stueck Das Stueck, das im Schritt offen sein soll — etwa das mit dem Feld, das noch fehlt */
  const geheZu = (i: number, stueck?: string) => {
    const ziel = Math.max(0, Math.min(SCHRITTE.length - 1, i));
    const d = { ...daten, schritt: ziel };
    setDaten(d);
    void sichern(d);
    setBesucht((n) => Math.max(n, ziel));
    if (stueck) {
      const kennung = KENNUNGEN[ziel]!;
      setStueckeStand((alt) => ({ ...alt, [kennung]: { offen: stueck, weit: alt[kennung]?.weit ?? null } }));
    }
    setSprung((n) => n + 1);
  };

  const props = { firma: f, logo, daten, setze, r, leistung, geheZu, gesperrt };

  // Jeder Schritt in einem Satz — fuer seine Zeile, sobald er nicht mehr offen ist.
  const heute = new Date();
  const zeilen = [
    { ergebnis: angebotSatz(f.angebot) },
    angabenZeile(daten.angaben, heute),
    lueckeZeile(luecke),
    rechnungZeile(r),
    leistungZeile(leistung, r, daten),
    entscheidungZeile(daten, r, automatischerBeginn(f.angebot)),
    unterlagenZeile(unterlagen),
  ];
  // Ein Haken nur fuer wirklich Erledigtes: „Noch offen“ und „Noch nicht unterschrieben“ tragen die Nummer.
  const erledigt = [
    true, true, luecke !== null, true, true, daten.entscheidung.status !== 'offen', gesperrt,
  ];
  const etappen: AblaufEtappe[] = SCHRITTE.map((name, i) => ({
    name, ...zeilen[i], erledigt: erledigt[i]! && !zeilen[i]!.fehlt,
  }));
  // „Weiter“ am Ende des Wegs eines Schritts fuehrt zum naechsten — am Ende der Beratung zur Liste.
  const weiter = schritt < SCHRITTE.length - 1
    ? { text: <>Weiter: {SCHRITTE[schritt + 1]}</>, onClick: () => geheZu(schritt + 1) }
    : { text: 'Fertig — zur Mitarbeiterliste', onClick: fertig };

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

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <FirmenZeichen name={f.name} logo={logo} als="h1" />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="text-sm text-ui-schiefer">{daten.angaben.name || 'Neue Beratung'}</p>
          {/*
            Fuer den Berater: an jeden Schritt, ohne den Weg dorthin zu gehen. Die
            Auswahl zeigt immer ihre Aufschrift — wo man steht, sagt der Ablauf darunter.
          */}
          <select
            aria-label="Zu einem Schritt springen"
            value=""
            onChange={(e) => { if (e.target.value !== '') geheZu(Number(e.target.value)); }}
            className="ui-feld max-w-full py-2 pl-2 pr-8 text-sm text-ui-tinte"
          >
            <option value="" disabled hidden>Springen zu …</option>
            {SCHRITTE.map((name, i) => <option key={name} value={i}>{i + 1} · {name}</option>)}
          </select>
        </div>
      </div>

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

      <AblaufGeber stand={stueckeStand} onStand={merkeStuecke} weiter={weiter} durch={schritt < weit}>
        <EtappenAblauf etappen={etappen} offen={schritt} weit={weit} sprung={sprung} onOeffnen={geheZu} wort="Schritt">
          {schritt === 0 && <SchrittAngebot {...props} />}
          {schritt === 1 && <SchrittAngaben {...props} />}
          {schritt === 2 && <SchrittLuecke {...props} luecke={luecke} aktuell={aufgeschoben === daten} />}
          {schritt === 3 && <SchrittRechnung {...props} />}
          {schritt === 4 && <SchrittLeistung {...props} kennzahlen={kennzahlen} luecke={luecke} aktuell={aufgeschoben === daten} />}
          {schritt === 5 && <SchrittEntscheidung {...props} auftritt={auftritt} sichern={sichern} luecke={luecke} kennzahlen={kennzahlen} />}
          {schritt === 6 && (
            <SchrittUnterlagen {...props} auftritt={auftritt} sichern={sichern} luecke={luecke} kennzahlen={kennzahlen}
              beratungId={beratungId} unterlagen={unterlagen} aktualisieren={aktualisieren} aktuell={aufgeschoben === daten} />
          )}
        </EtappenAblauf>
      </AblaufGeber>
    </div>
  );
}
