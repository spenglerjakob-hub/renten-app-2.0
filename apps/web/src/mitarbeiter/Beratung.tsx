import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ClipboardCheck, ClipboardList, Lock, Play, Save } from 'lucide-react';
import type { BeratungDaten } from '@renten/schema';
import { SPRACHEN, SpracheKontext, wahl, type Sprache } from '../lib/sprache';
import {
  beratungLaden, beratungSpeichern, firmaLaden, unterlagenLaden, type Beratung, type Firma, type Unterlagen,
} from '../lib/bav-beratung';
import { AblaufGeber, EtappenAblauf, type AblaufEtappe } from '../components/Ablauf';
import type { StueckeStand } from '../components/ablauf-logik';
import { KNOPF, KNOPF_ZWEIT, LINK, Marke, TIPPFLAECHE } from '../components/stil';
import { Dialog } from '../components/Dialog';
import { FirmenZeichen, useFirmenlogo } from './bausteine';
import { useUnterlagenAuftritt } from './agentur-hook';
import { zeitpunktText } from './unterschrift-daten';
import {
  automatischerBeginn, beitragsRechnung, kennzahlenRechnung, leistungsRechnung, versorgungslueckeRechnung,
} from './rechnung';
import {
  GespraechKontext, SchrittAngaben, SchrittAngebot, SchrittEntscheidung, SchrittLeistung, SchrittLuecke, SchrittRechnung,
  SchrittUnterlagen,
} from './schritte';
import { GespraechFenster } from './GespraechFenster';
import {
  KENNUNGEN, SCHRITTE, auswahlMerken, bereinigt, gezeigterSchritt, letzteAuswahl, schrittNamen, schrittSetzen, sichtbareSchritte,
  stueckAusgeblendet, stueckZeigen, weitSichtbar,
} from './gespraech';
import {
  angabenZeile, angebotSatz, entscheidungZeile, leistungZeile, lueckeZeile, rechnungZeile, unterlagenZeile, vorbereitungStand,
} from './zeilen';
import type { Ort } from './ort';

// Die Namen der Schritte und ihre Kennungen stehen bei der Auswahl der Seiten (`gespraech.ts`).
export { KENNUNGEN, SCHRITTE };

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
 *
 * VORBEREITUNG UND GESPRAECH (`gespraech.ts`): Vorbereitet wird ohne den
 * Mitarbeiter, mit allen Seiten. „Gespräch starten“ waehlt, welche er zu
 * sehen bekommt; ausgeblendete Schritte stehen dann nicht im Ablauf, die
 * uebrigen zaehlen neu durch, und „Weiter“ ueberspringt, was fehlt. Der
 * Stand gehoert zur Beratung und wird mit ihr gespeichert — nach dem
 * Neuladen laeuft das Gespraech weiter.
 *
 * DEUTSCH ODER ENGLISCH (`lib/sprache.tsx`): Die Sprache gehoert zur Beratung
 * (`daten.sprache`) und gilt fuer das, was der Mitarbeiter liest — die
 * sieben Schritte mit ihren Zeilen und „Weiter“. Was der Berater bedient
 * (Kopf, Speichern, „Gespräch starten“, die Auswahl der Seiten), bleibt
 * deutsch; ebenso die Unterlagen. Unterschrieben laesst sie sich nicht mehr
 * wechseln — gespeichert wuerde es nicht.
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
  // Bei einer Firma einer Agentur stehen deren Angaben im Briefkopf und im AXA-Antrag (`agenturAuftritt`).
  const auftritt = useUnterlagenAuftritt(firma && typeof firma === 'object' ? firma : null);
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
  // Das Fenster „Gespräch starten“: null ist es zu, sonst die Auswahl, an der gerade gewaehlt wird.
  const [auswahl, setAuswahl] = useState<string[] | null>(null);

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
  /*
    IM GESPRAECH stehen nur die gewaehlten Seiten da. `ausgeblendet` ist null
    in der Vorbereitung — dann gilt jeder Schritt und jede Seite.
  */
  const imGespraech = daten?.gespraech.aktiv ?? false;
  const abgewaehlt = daten?.gespraech.ausgeblendet;
  const ausgeblendet = useMemo(() => (imGespraech ? new Set(bereinigt(abgewaehlt)) : null), [imGespraech, abgewaehlt]);
  const sichtbar = useMemo(() => (ausgeblendet ? sichtbareSchritte(ausgeblendet) : SCHRITTE.map((_, i) => i)), [ausgeblendet]);
  // Der gemerkte Schritt kann ausgeblendet sein (die Auswahl hat sich geaendert) — dann der naechste, der dasteht.
  const schritt = gezeigterSchritt(sichtbar, daten?.schritt ?? 0);
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
  // Das Fenster „Gespräch starten“ nennt je Schritt, was vorbereitet ist und was fehlt — dafuer braucht es beide.
  const mitLuecke = weit >= 2 || auswahl !== null;
  const mitLeistung = weit >= 4 || auswahl !== null;
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
  /**
   * @param stueck Das Stueck, das im Schritt offen sein soll — etwa das mit dem Feld, das noch fehlt
   *
   * Fuehrt ein Verweis im Gespraech auf eine ausgeblendete Seite („es fehlt
   * noch das Geburtsdatum“), wird sie wieder gezeigt: Wer dorthin will,
   * braucht sie. Die uebrige Auswahl bleibt.
   */
  const geheZu = (i: number, stueck?: string) => {
    const ziel = Math.max(0, Math.min(SCHRITTE.length - 1, i));
    const kennungZiel = KENNUNGEN[ziel]!;
    const seiteWeg = ausgeblendet !== null && stueck !== undefined && stueckAusgeblendet(ausgeblendet, kennungZiel, stueck);
    const schrittWeg = ausgeblendet !== null && !sichtbar.includes(ziel);
    const gespraech = ausgeblendet === null || (!seiteWeg && !schrittWeg) ? daten.gespraech : {
      ...daten.gespraech,
      ausgeblendet: seiteWeg && stueck !== undefined
        ? stueckZeigen([...ausgeblendet], kennungZiel, stueck)
        : schrittSetzen([...ausgeblendet], kennungZiel, true),
    };
    const d = { ...daten, gespraech, schritt: ziel };
    setDaten(d);
    void sichern(d);
    setBesucht((n) => Math.max(n, ziel));
    if (stueck) {
      const kennung = KENNUNGEN[ziel]!;
      setStueckeStand((alt) => ({ ...alt, [kennung]: { offen: stueck, weit: alt[kennung]?.weit ?? null } }));
    }
    setSprung((n) => n + 1);
  };

  /*
    DAS GESPRAECH STARTEN — oder, wenn es laeuft, die Auswahl aendern. Ein
    neues Gespraech beginnt vorn und baut sich Stueck fuer Stueck auf, wie der
    Mitarbeiter es sehen soll: Was in der Vorbereitung schon erreicht war,
    steht nicht als Zeile da. Die Auswahl gilt als Vorgabe fuer das naechste
    Gespraech (`auswahlMerken`).
  */
  const fensterOeffnen = () => setAuswahl(bereinigt(daten.gespraech.ausgeblendet ?? letzteAuswahl()));
  const starten = () => {
    if (auswahl === null) return;
    const neu = bereinigt(auswahl);
    const dann = sichtbareSchritte(new Set(neu));
    const ziel = imGespraech ? gezeigterSchritt(dann, daten.schritt) : dann[0] ?? 0;
    const d = { ...daten, gespraech: { aktiv: true, ausgeblendet: neu }, schritt: ziel };
    setDaten(d);
    void sichern(d);
    auswahlMerken(neu);
    if (!imGespraech) {
      setBesucht(ziel);
      setStueckeStand({});
    }
    setSprung((n) => n + 1);
    setAuswahl(null);
  };
  /** Zurueck in die Vorbereitung: Alle Seiten stehen wieder da; die Auswahl bleibt fuer das naechste Mal. */
  const vorbereiten = () => {
    const d = { ...daten, gespraech: { ...daten.gespraech, aktiv: false } };
    setDaten(d);
    void sichern(d);
  };

  const props = { firma: f, logo, daten, setze, r, leistung, geheZu, gesperrt };

  const sprache: Sprache = daten.sprache;
  const w = wahl(sprache);
  const namen = schrittNamen(sprache);
  const spracheSetzen = (neu: Sprache) => {
    if (gesperrt || neu === sprache) return;
    const d = { ...daten, sprache: neu };
    setDaten(d);
    void sichern(d);
  };

  // Jeder Schritt in einem Satz — fuer seine Zeile, sobald er nicht mehr offen ist.
  const heute = new Date();
  const vorbereitung = vorbereitungStand(daten, heute);
  const zeilenIn = (s: Sprache) => [
    { ergebnis: angebotSatz(f.angebot, s) },
    angabenZeile(daten.angaben, heute, s),
    lueckeZeile(luecke, s),
    rechnungZeile(r, s),
    leistungZeile(leistung, r, daten, s),
    entscheidungZeile(daten, r, automatischerBeginn(f.angebot), s),
    unterlagenZeile(unterlagen, s),
  ];
  // Im Ablauf in der Sprache der Beratung; das Fenster „Gespräch starten“ liest der Berater — deutsch.
  const zeilen = zeilenIn(sprache);
  const zeilenBerater = sprache === 'de' ? zeilen : zeilenIn('de');
  // Ein Haken nur fuer wirklich Erledigtes: „Noch offen“ und „Noch nicht unterschrieben“ tragen die Nummer.
  const erledigt = [
    true, true, luecke !== null, true, true, daten.entscheidung.status !== 'offen', gesperrt,
  ];
  const etappen: AblaufEtappe[] = namen.map((name, i) => ({
    name, ...zeilen[i], erledigt: erledigt[i]! && !zeilen[i]!.fehlt,
  }));
  // „Weiter“ am Ende des Wegs eines Schritts fuehrt zum naechsten, der dasteht — am Ende der Beratung zur Liste.
  const danach = sichtbar[sichtbar.indexOf(schritt) + 1];
  const weiter = danach !== undefined
    ? { text: <>{w('Weiter', 'Next')}: {namen[danach]}</>, onClick: () => geheZu(danach) }
    : { text: w('Fertig — zur Mitarbeiterliste', 'Done — back to the list of employees'), onClick: fertig };

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
            {/* Im Gespraech nur, was dasteht — nummeriert und benannt wie im Ablauf darunter. */}
            {sichtbar.map((i, n) => <option key={SCHRITTE[i]} value={i}>{n + 1} · {namen[i]}</option>)}
          </select>
          {/*
            Die Sprache des Gespraechs — neben „Springen zu“, weil beides der
            Berater bedient. Jede Sprache steht in ihrer eigenen da.
          */}
          <select
            aria-label="Sprache der Beratung"
            value={sprache}
            disabled={gesperrt}
            onChange={(e) => spracheSetzen(e.target.value === 'en' ? 'en' : 'de')}
            className="ui-feld max-w-full py-2 pl-2 pr-8 text-sm text-ui-tinte disabled:opacity-60"
          >
            {SPRACHEN.map((x) => <option key={x.id} value={x.id} lang={x.id}>{x.name}</option>)}
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

      {/*
        VORBEREITUNG ODER GESPRAECH. In der Vorbereitung steht der Knopf, mit
        dem das Gespraech beginnt, deutlich da — er ist der naechste Schritt.
        Im Gespraech bleibt nur eine leise Zeile: Der Mitarbeiter schaut mit.
        Unterschrieben gibt es nichts mehr zu starten; wer dann alles sehen
        will, kehrt in die Vorbereitung zurueck (nur die Ansicht, gespeichert
        wird nichts mehr).
      */}
      {imGespraech ? (
        <div role="note" aria-label="Stand des Gesprächs" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <Marke><Play className="h-3 w-3" aria-hidden /> Im Gespräch</Marke>
          {!gesperrt && <button type="button" onClick={fensterOeffnen} className={`${LINK} ${TIPPFLAECHE}`}>Seiten wählen</button>}
          <button type="button" onClick={vorbereiten} className={`${LINK} ${TIPPFLAECHE}`}>
            {gesperrt ? 'Alle Seiten zeigen' : 'Zur Vorbereitung'}
          </button>
        </div>
      ) : !gesperrt && (
        <div role="note" aria-label="Stand des Gesprächs" className="ui-innen flex flex-wrap items-center gap-3 p-4">
          {/* Derselbe Stand wie in der Mitarbeiterliste: „vorbereitet“, sobald nichts mehr fehlt (`vorbereitungStand`). */}
          <p className="flex min-w-0 flex-1 basis-64 items-start gap-2 text-sm leading-relaxed text-ui-tinte">
            {vorbereitung?.art === 'vorbereitet'
              ? <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              : <ClipboardList className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
            <span>
              {vorbereitung?.art === 'vorbereitet' ? (
                <><strong className="font-medium">Vorbereitet.</strong> Die Angaben für die Rechnung sind vollständig. </>
              ) : vorbereitung?.art === 'fehlt' ? (
                <><strong className="font-medium">Vorbereitung.</strong> Noch offen: {vorbereitung.text}. </>
              ) : (
                <><strong className="font-medium">Vorbereitung.</strong> Alle Seiten stehen da. </>
              )}
              Für das Gespräch wählen Sie, welche Seiten Sie zeigen.
            </span>
          </p>
          <button type="button" onClick={fensterOeffnen} className={KNOPF}>
            <Play className="h-4 w-4" aria-hidden /> Gespräch starten
          </button>
        </div>
      )}

      <Dialog
        offen={auswahl !== null}
        titel={imGespraech ? 'Seiten wählen' : 'Gespräch starten'}
        beschreibung="Welche Seiten zeigen Sie? Was Sie abwählen, wird im Gespräch übersprungen. Die Angaben bleiben, und die Unterlagen enthalten weiterhin alles."
        onSchliessen={() => setAuswahl(null)}
      >
        {auswahl !== null && (
          <GespraechFenster ausgeblendet={auswahl} onAuswahl={setAuswahl} zeilen={zeilenBerater} laeuft={imGespraech} onStart={starten} />
        )}
      </Dialog>

      {/* Ab hier liest der Mitarbeiter mit: `lang` sagt Vorleseprogrammen, in welcher Sprache. */}
      <SpracheKontext.Provider value={sprache}>
      <GespraechKontext.Provider value={ausgeblendet}>
      <div lang={sprache}>
      <AblaufGeber stand={stueckeStand} onStand={merkeStuecke} weiter={weiter} durch={schritt < weit}>
        <EtappenAblauf
          etappen={sichtbar.map((i) => etappen[i]!)} offen={sichtbar.indexOf(schritt)} weit={weitSichtbar(sichtbar, weit)}
          sprung={sprung} onOeffnen={(n) => geheZu(sichtbar[n] ?? 0)} wort={w('Schritt', 'Step')}
        >
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
      </GespraechKontext.Provider>
      </SpracheKontext.Provider>
    </div>
  );
}
