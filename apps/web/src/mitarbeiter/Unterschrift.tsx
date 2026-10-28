import { useEffect, useRef, useState, type PointerEvent as ZeigerEreignis, type ReactNode } from 'react';
import { CheckCircle2, Eraser, Lock, PenLine } from 'lucide-react';
import type { BeratungStatus } from '@renten/schema';
import { Dialog } from '../components/Dialog';
import { TextFeld } from '../components/Feld';
import {
  unterlageHtmlLaden, unterschriftenAufheben, type UnterlagenArt, type Unterlagen, type Unterschrift, type UnterschriftPerson,
} from '../lib/bav-beratung';
import { ETIKETT, KNOPF, KNOPF_GEFAHR, KNOPF_ZWEIT, Karte, LINK } from '../components/stil';
import { UnterschriebeneUnterlage, mitUnterschriften, pruefsummeVon } from './festschreiben';
import {
  ZUG_BREITE, dokumenteFuer, dokumenteText, tinteGenug, zeitpunktText, zugAusStrichen, zugGueltig, zugRahmen, type Strich,
} from './unterschrift-daten';

/*
 * UNTERSCHRIFT AM BILDSCHIRM — einfache elektronische Signatur. Der
 * Mitarbeiter unterschreibt einmal fuer Protokoll und Vereinbarung bzw.
 * Verzicht, der Berater fuer das Protokoll; der Arbeitgeber auf Papier.
 * Mit der ersten Unterschrift sind die Unterlagen festgeschrieben und die
 * Beratung gesperrt — bis die Unterschriften aufgehoben werden.
 */

/** Breite zu Hoehe des Feldes. Die Striche stehen in Einheiten der Breite 1000 — so passen sie zu jeder Groesse. */
const FELD_VERHAELTNIS = 2.5;
const FELD_HOEHE = ZUG_BREITE / FELD_VERHAELTNIS;
const TINTE = '#17191c';

/** Zeichnet die Striche — geglaettet wie der gespeicherte Zug. Farbe und Staerke stellt `neu` ein. */
function zeichne(ctx: CanvasRenderingContext2D, striche: readonly Strich[], massstab: number) {
  for (const s of striche) {
    const [erster, ...innen] = s;
    if (!erster) continue;
    const letzter = innen.pop();
    ctx.beginPath();
    ctx.moveTo(erster[0] * massstab, erster[1] * massstab);
    if (!letzter) ctx.lineTo(erster[0] * massstab + 0.5, erster[1] * massstab);
    else {
      innen.forEach((p, i) => {
        const n = innen[i + 1] ?? letzter;
        ctx.quadraticCurveTo(p[0] * massstab, p[1] * massstab, ((p[0] + n[0]) / 2) * massstab, ((p[1] + n[1]) / 2) * massstab);
      });
      ctx.lineTo(letzter[0] * massstab, letzter[1] * massstab);
    }
    ctx.stroke();
  }
}

/**
 * Das Feld: Finger, Stift oder Maus (Pointer Events). `touch-action: none`
 * haelt die Seite still, solange gezeichnet wird; gezeichnet wird in der
 * Schaerfe des Bildschirms.
 */
function UnterschriftFeld({ striche, setStriche, beschriftung }: {
  striche: Strich[]; setStriche: (s: Strich[]) => void; beschriftung: string;
}) {
  const leinwand = useRef<HTMLCanvasElement>(null);
  const strich = useRef<[number, number][] | null>(null);
  const stricheRef = useRef(striche);
  stricheRef.current = striche;

  // Groesse und Schaerfe folgen dem Feld; danach alles neu zeichnen.
  useEffect(() => {
    const c = leinwand.current;
    if (!c) return;
    const neu = () => {
      const r = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.max(1, Math.round(r.width * dpr));
      c.height = Math.max(1, Math.round(r.height * dpr));
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, c.width, c.height);
      // Eine neue Groesse setzt den Zustand des Canvas zurueck — darum hier, nicht einmal beim Start.
      ctx.strokeStyle = TINTE;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2.6 * dpr;
      zeichne(ctx, stricheRef.current, c.width / ZUG_BREITE);
    };
    neu();
    const beobachter = new ResizeObserver(neu);
    beobachter.observe(c);
    return () => beobachter.disconnect();
  }, []);

  // „Neu“ leert die Striche von aussen — dann auch das Bild.
  useEffect(() => {
    const c = leinwand.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    zeichne(ctx, striche, c.width / ZUG_BREITE);
  }, [striche]);

  const punkt = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = leinwand.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * ZUG_BREITE, ((e.clientY - r.top) / r.width) * ZUG_BREITE];
  };

  const runter = (e: ZeigerEreignis<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    strich.current = [punkt(e)];
  };
  const weiter = (e: ZeigerEreignis<HTMLCanvasElement>) => {
    const s = strich.current;
    const c = leinwand.current;
    const ctx = c?.getContext('2d');
    if (!s || !c || !ctx) return;
    const massstab = c.width / ZUG_BREITE;
    const ereignisse = e.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const ev of ereignisse.length > 0 ? ereignisse : [e.nativeEvent]) {
      const p = punkt(ev);
      const letzter = s[s.length - 1];
      if (letzter) {
        ctx.beginPath();
        ctx.moveTo(letzter[0] * massstab, letzter[1] * massstab);
        ctx.lineTo(p[0] * massstab, p[1] * massstab);
        ctx.stroke();
      }
      s.push(p);
    }
  };
  const fertig = () => {
    const s = strich.current;
    strich.current = null;
    if (s) setStriche([...stricheRef.current, s]);
  };

  return (
    <div className="relative">
      <canvas
        ref={leinwand}
        role="img"
        aria-label={beschriftung}
        onPointerDown={runter}
        onPointerMove={weiter}
        onPointerUp={fertig}
        onPointerCancel={fertig}
        className="block w-full cursor-crosshair touch-none rounded-2xl border border-ui-linie bg-white"
        style={{ aspectRatio: `${FELD_VERHAELTNIS}` }}
      />
      {/* Die Linie zum Unterschreiben — nur zur Orientierung, nicht Teil der Unterschrift. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-6 bottom-[22%] flex items-end gap-2 border-b border-ui-asche/60 pb-1 text-ui-asche">
        <span className="text-lg leading-none">×</span>
      </div>
    </div>
  );
}

/** Die Unterschrift als kleines Bild — am Bildschirm, wie sie in den Unterlagen steht. */
export function UnterschriftBild({ zug, name, klasse = 'h-12' }: { zug: string; name: string; klasse?: string }) {
  const rahmen = zugGueltig(zug) ? zugRahmen(zug) : null;
  if (!rahmen) return null;
  return (
    <svg viewBox={`${rahmen.x} ${rahmen.y} ${rahmen.breite} ${rahmen.hoehe}`} className={`${klasse} w-auto max-w-full`}
      role="img" aria-label={`Unterschrift ${name}`} preserveAspectRatio="xMinYMid meet">
      <path d={zug} fill="none" stroke={TINTE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Wer unterschreibt — mit dem, was die Unterschrift abdeckt. */
export interface Unterzeichner {
  person: UnterschriftPerson;
  rolle: string;
  /** Vorgabe fuer den Namen */
  name: string;
  /** Beim Mitarbeiter steht der Name fest — er kommt aus den Angaben und steht so in den Unterlagen. */
  nameFest: boolean;
}

function UnterschriftDialog({ offen, wer, status, axa, onSchliessen, onUnterschreiben }: {
  offen: boolean; wer: Unterzeichner; status: BeratungStatus; axa: boolean;
  onSchliessen: () => void;
  /** true: geklappt; sonst die Meldung */
  onUnterschreiben: (name: string, zug: string) => Promise<true | string>;
}) {
  const [striche, setStriche] = useState<Strich[]>([]);
  const [name, setName] = useState(wer.name);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  useEffect(() => {
    if (!offen) return;
    setStriche([]);
    setName(wer.name);
    setFehler(null);
  }, [offen, wer.name]);

  const zug = zugAusStrichen(striche, ZUG_BREITE, FELD_HOEHE);
  const bereit = tinteGenug(striche, ZUG_BREITE) && zugGueltig(zug) && name.trim() !== '' && !laeuft;
  const fuer = dokumenteText(dokumenteFuer(status, wer.person, axa), axa);

  const abschicken = async () => {
    if (!bereit) return;
    setLaeuft(true);
    setFehler(null);
    const ergebnis = await onUnterschreiben(name.trim(), zug);
    setLaeuft(false);
    if (ergebnis === true) onSchliessen();
    else setFehler(ergebnis);
  };

  return (
    <Dialog offen={offen} titel={`Unterschrift ${wer.rolle}`} onSchliessen={() => { if (!laeuft) onSchliessen(); }}>
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-ui-tinte">
          Ihre Unterschrift gilt für: <strong>{fuer}</strong>. Mit „Unterschreiben“ bestätigen Sie diese Unterlagen in der
          Fassung, die Sie im Gespräch gesehen haben.
        </p>
        {wer.nameFest ? (
          <p className="text-sm text-ui-tinte"><span className="text-ui-schiefer">Name:</span> <strong>{name}</strong></p>
        ) : (
          <TextFeld label="Name" wert={name} onChange={setName} maxLaenge={120} autoComplete="name" />
        )}
        <UnterschriftFeld striche={striche} setStriche={setStriche}
          beschriftung={`Unterschriftsfeld für ${name || wer.rolle}: mit Finger, Stift oder Maus unterschreiben`} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-ui-schiefer">Mit Finger, Stift oder Maus im Feld unterschreiben.</p>
          <button type="button" onClick={() => setStriche([])} disabled={striche.length === 0 || laeuft} className={KNOPF_ZWEIT}>
            <Eraser className="h-4 w-4" aria-hidden /> Neu
          </button>
        </div>
        {fehler && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900">{fehler}</p>}
        <div className="flex flex-wrap justify-end gap-2 border-t border-ui-linie pt-4">
          <button type="button" onClick={onSchliessen} disabled={laeuft} className={KNOPF_ZWEIT}>Abbrechen</button>
          <button type="button" onClick={() => void abschicken()} disabled={!bereit} className={KNOPF}>
            <PenLine className="h-4 w-4" aria-hidden /> {laeuft ? 'Wird unterschrieben …' : 'Unterschreiben'}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

/** Was vor der ersten Unterschrift noch fehlt — mit dem Schritt, in dem es nachzutragen ist. */
export interface Luecke { text: string; schritt: number }

/**
 * Die Karte in Schritt 7: Mitarbeiter und Berater unterschreiben, ihr Stand,
 * und das Aufheben. `onUnterschreiben` schreibt bei der ersten Unterschrift
 * die Unterlagen fest (Beratung.tsx kennt die Daten dafuer).
 */
export function UnterschriftenKarte({ status, unterlagen, unterzeichner, luecken, bereit, geheZu, onUnterschreiben, onAufgehoben, beratungId, axa = false }: {
  status: BeratungStatus;
  /** An Stelle der Vereinbarung steht der AXA-Antrag — der Berater unterschreibt dort mit. */
  axa?: boolean;
  unterlagen: Unterlagen | null | 'fehler';
  unterzeichner: readonly Unterzeichner[];
  /** Nur vor der ersten Unterschrift von Belang */
  luecken: readonly Luecke[];
  /** Die Rechnung ist auf dem neuesten Stand */
  bereit: boolean;
  geheZu: (i: number) => void;
  onUnterschreiben: (person: UnterschriftPerson, name: string, zug: string) => Promise<true | string>;
  onAufgehoben: () => Promise<void>;
  beratungId: string;
}) {
  const [dialog, setDialog] = useState<Unterzeichner | null>(null);
  const [aufheben, setAufheben] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const fest = unterlagen && typeof unterlagen === 'object' ? unterlagen : null;

  if (status === 'offen') {
    return (
      <Karte titel="Unterschrift am Bildschirm">
        <p className="text-sm leading-relaxed text-ui-schiefer">
          Unterschrieben wird nach der Entscheidung. Solange sie offen ist, gibt es die Gesprächsunterlagen zum Mitnehmen.
        </p>
      </Karte>
    );
  }

  const offeneLuecken = fest ? [] : luecken;
  const zeile = (wer: Unterzeichner): ReactNode => {
    const u: Unterschrift | undefined = fest?.unterschriften.find((x) => x.person === wer.person);
    return (
      <li key={wer.person} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-4">
        <div className="min-w-0">
          <p className="text-base font-medium text-ui-tinte">{wer.rolle}{u ? ` · ${u.name}` : wer.name ? ` · ${wer.name}` : ''}</p>
          <p className={ETIKETT}>für {dokumenteText(dokumenteFuer(status, wer.person, axa), axa)}</p>
        </div>
        {u ? (
          <div className="flex min-w-0 items-center gap-3">
            <UnterschriftBild zug={u.zug} name={u.name} klasse="h-10 max-w-[10rem]" />
            <p className="flex items-center gap-1.5 text-sm text-ui-tinte">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden /> unterschrieben am {zeitpunktText(u.unterschriebenAm)}
            </p>
          </div>
        ) : (
          <button type="button" className={KNOPF} disabled={offeneLuecken.length > 0 || !bereit || unterlagen === 'fehler'}
            onClick={() => { setMeldung(null); setDialog(wer); }}>
            <PenLine className="h-4 w-4" aria-hidden /> Unterschreiben
          </button>
        )}
      </li>
    );
  };

  return (
    <Karte titel="Unterschrift am Bildschirm">
      <p className="text-sm leading-relaxed text-ui-schiefer">
        Mitarbeiter und Berater unterschreiben hier mit Finger, Stift oder Maus. Die Unterschriften stehen dann in den
        Unterlagen; der Arbeitgeber unterschreibt auf Papier.
      </p>

      {unterlagen === 'fehler' && (
        <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900">
          Der Stand der Unterschriften konnte nicht geladen werden. Bitte laden Sie die Seite neu.
        </p>
      )}
      {offeneLuecken.length > 0 && (
        <div className="ui-innen mt-4 p-4 text-sm text-ui-tinte">
          <p>Vor dem Unterschreiben fehlt noch:</p>
          <ul className="mt-1 space-y-1">
            {offeneLuecken.map((l) => (
              <li key={l.text}>
                — {l.text} <button type="button" onClick={() => geheZu(l.schritt)} className={`${LINK} text-sm`}>zu Schritt {l.schritt + 1} →</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="mt-2 divide-y divide-ui-linie" aria-label="Unterschriften">
        {unterzeichner.map(zeile)}
      </ul>

      {fest && (
        <div className="ui-innen mt-2 flex flex-wrap items-center gap-3 p-4">
          <p className="flex min-w-0 flex-1 basis-64 items-start gap-2 text-sm leading-relaxed text-ui-tinte">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              Die Unterlagen sind seit {zeitpunktText(fest.erstelltAm)} festgeschrieben, die Beratung ist gesperrt. Muss noch
              etwas geändert werden, heben Sie die Unterschriften auf und lassen neu unterschreiben.
            </span>
          </p>
          <button type="button" onClick={() => setAufheben(true)} className={KNOPF_GEFAHR}>Unterschriften aufheben</button>
        </div>
      )}
      {meldung && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900">{meldung}</p>}

      <p className="mt-5 text-xs leading-relaxed text-ui-schiefer">
        Einfache elektronische Signatur: geeignet für Protokoll und Erklärungen ohne gesetzliche Schriftform. Ob Versicherer
        oder Unterstützungskasse sie für die Vereinbarung annehmen, klären Sie bitte vorab.
      </p>

      {dialog && (
        <UnterschriftDialog offen wer={dialog} status={status} axa={axa} onSchliessen={() => setDialog(null)}
          onUnterschreiben={(name, zug) => onUnterschreiben(dialog.person, name, zug)} />
      )}

      <Dialog offen={aufheben} titel="Unterschriften aufheben?" onSchliessen={() => setAufheben(false)}>
        <p className="text-sm leading-relaxed text-ui-tinte">
          Die Unterschriften und die festgeschriebenen Unterlagen werden gelöscht. Ausgedruckte oder gespeicherte Exemplare
          bleiben davon unberührt. Danach lässt sich die Beratung wieder ändern; unterschrieben wird neu.
        </p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => setAufheben(false)} className={KNOPF_ZWEIT}>Abbrechen</button>
          <button type="button" className={KNOPF_GEFAHR}
            onClick={() => {
              setAufheben(false);
              void unterschriftenAufheben(beratungId).then(async (ok) => {
                if (!ok) setMeldung('Die Unterschriften konnten nicht aufgehoben werden. Bitte versuchen Sie es noch einmal.');
                await onAufgehoben();
              });
            }}>
            Aufheben
          </button>
        </div>
      </Dialog>
    </Karte>
  );
}

/**
 * Die unterschriebene Fassung drucken: das festgeschriebene HTML laden, die
 * Pruefsumme nachrechnen, die Unterschriften einsetzen. Liefert die Meldung,
 * wenn es nicht klappt.
 */
export async function festgeschriebenDrucken(
  beratung: string, unterlagen: Unterlagen, art: UnterlagenArt, drucken: (inhalt: ReactNode) => void,
): Promise<string | null> {
  const html = await unterlageHtmlLaden(beratung, art);
  if (typeof html !== 'string') return 'Die unterschriebene Fassung konnte nicht geladen werden. Bitte versuchen Sie es noch einmal.';
  const soll = unterlagen.pruefsummen[art] ?? '';
  const ist = await pruefsummeVon(html);
  drucken(
    <UnterschriebeneUnterlage html={mitUnterschriften(html, unterlagen.unterschriften, art)} erstelltAm={unterlagen.erstelltAm}
      pruefsumme={soll} stimmt={ist === null || ist === soll} />,
  );
  return null;
}
