import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Link2, Mail } from 'lucide-react';
import { FRUEHSTART_MONATE } from '@renten/schema/preise';
import { LinkFeld } from '../components/LinkFeld';
import { Sicher } from '../components/Sicher';
import { FEHLER, FELD, Hinweis, KNOPF, KNOPF_KLEIN, KNOPF_KLEIN_HAUPT, Marke, Vermerk } from '../components/stil';
import { fruehstartLink } from '../lib/einladung';
import {
  fruehstartAnfrageAbsagen, fruehstartAnfrageZusagen, fruehstartAnfragenLaden,
  fruehstartLinkErstellen, fruehstartLinkZurueckziehen, fruehstartLinksLaden, fruehstartTeilnehmerLaden,
  rueckmeldungenLaden, type FruehstartAnfrage, type FruehstartLink, type FruehstartTeilnehmer, type Rueckmeldung,
} from '../lib/fruehstart';
import { absageMail, anfrageLink, zusageMail } from './fruehstart-mail';
import { datum } from '../store/zugang';

/**
 * Nur fuer den Betreiber, im Fenster "Abo & Team": Anfragen von der
 * Preisseite zu- oder absagen, Early-Adopter-Links erstellen und verwalten,
 * die Teilnehmer im Blick behalten (wer schweigt?) und alle Rueckmeldungen
 * lesen.
 *
 * Beide Bereiche laden erst beim Aufklappen — und bei jedem Aufklappen neu.
 * Was angezeigt wird, entscheidet der Server: Fuer andere Konten liefern die
 * Funktionen nichts.
 */
export function BetreiberFruehstart() {
  return (
    <div className="mt-5 space-y-2">
      <Klappe titel="Early Adopter: Anfragen"><Anfragen /></Klappe>
      <Klappe titel="Early Adopter: Links und Teilnehmer"><EarlyAdopter /></Klappe>
      <Klappe titel="Rückmeldungen"><Rueckmeldungen /></Klappe>
    </div>
  );
}

function Klappe({ titel, children }: { titel: string; children: ReactNode }) {
  const [offen, setOffen] = useState(false);
  return (
    <details className="group rounded-[10px] border border-ui-linie bg-ui-karte" onToggle={(e) => setOffen(e.currentTarget.open)}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-[10px] px-4 py-3 text-sm font-medium text-ui-tinte hover:bg-ui-hover [&::-webkit-details-marker]:hidden">
        {titel}
        <ChevronDown className="h-4 w-4 shrink-0 text-ui-schiefer transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      {offen && <div className="border-t border-ui-linie p-4">{children}</div>}
    </details>
  );
}

const TAG = 86_400_000;
/** Wie die Erinnerung in der Oberflaeche (`rueckmeldungFaellig`): alle vier Wochen. */
const UEBERFAELLIG_NACH = 28 * TAG;
const fehlgeschlagen = 'Das hat nicht geklappt. Bitte versuchen Sie es noch einmal.';
const anzahl = (n: number, eins: string, mehr: string) => `${n} ${n === 1 ? eins : mehr}`;
/** Ueberschrift einer Liste in der Klappe — ruhig, ohne Versalien. */
const LISTE_TITEL = 'text-sm font-medium text-ui-tinte';
/** Eine Liste mit Haarlinien wie die Liste der Beratungen, statt eines Kastens je Eintrag. */
const LISTE = 'mt-1 divide-y divide-ui-linie border-y border-ui-linie';
const LINK_KLEIN = 'inline-flex items-center gap-1 text-xs font-medium text-ui-tinte underline-offset-2 hover:underline';

/**
 * Anfragen von der Preisseite. „Zusagen“ legt den persoenlichen Link an und
 * bereitet eine E-Mail vor — abgeschickt wird sie aus dem eigenen
 * Mailprogramm; das System schreibt Interessenten nicht an.
 */
function Anfragen() {
  const [liste, setListe] = useState<FruehstartAnfrage[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  // Gerade zugesagt: dort steht der Knopf fuer die E-Mail vorn.
  const [frisch, setFrisch] = useState<string | null>(null);

  const laden = useCallback(async () => {
    const l = await fruehstartAnfragenLaden();
    if (l === null) setFehler('Die Anfragen konnten nicht geladen werden.');
    setListe(l ?? []);
  }, []);
  useEffect(() => { void laden(); }, [laden]);

  const zusagen = async (a: FruehstartAnfrage) => {
    setFehler(null);
    const r = await fruehstartAnfrageZusagen(a.id);
    if ('fehler' in r) { setFehler(r.fehler); return; }
    setFrisch(a.id);
    await laden();
  };
  const absagen = async (a: FruehstartAnfrage) => {
    setFehler(null);
    if (!(await fruehstartAnfrageAbsagen(a.id))) setFehler(fehlgeschlagen);
    await laden();
  };

  if (liste === null) return <p className="text-sm text-ui-schiefer">Wird geladen …</p>;
  const offen = liste.filter((a) => a.status === 'offen');
  const entschieden = liste.filter((a) => a.status !== 'offen');

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-ui-schiefer">
        Anfragen von der Preisseite. „Zusagen“ erstellt den persönlichen Link und bereitet eine E-Mail an den
        Interessenten vor; abschicken tun Sie sie aus Ihrem Mailprogramm. Der Link darin führt immer auf
        js-rentenplaner.de. Anfragen werden nach 180 Tagen gelöscht.
      </p>
      {fehler && <p role="alert" className={FEHLER}>{fehler}</p>}

      <div>
        <h4 className={LISTE_TITEL}>
          Offen{offen.length > 0 ? ` (${offen.length})` : ''}
        </h4>
        {offen.length === 0 ? (
          <p className="mt-1 text-sm text-ui-schiefer">Keine offenen Anfragen.</p>
        ) : (
          <ul className={LISTE}>
            {offen.map((a) => (
              <li key={a.id} className="py-3">
                <AnfrageKopf a={a} />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => void zusagen(a)} className={KNOPF_KLEIN_HAUPT}>
                    <Check className="h-3.5 w-3.5" aria-hidden /> Zusagen
                  </button>
                  <Sicher text="Absagen" frage="Absagen?" ja="Ja" onJa={() => absagen(a)} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {entschieden.length > 0 && (
        <div>
          <h4 className={LISTE_TITEL}>Entschieden</h4>
          <ul className={LISTE}>
            {entschieden.map((a) => (
              <li key={a.id} className="py-3">
                <AnfrageKopf a={a} />
                <Entscheidung a={a} frisch={a.id === frisch} onNeuerLink={() => zusagen(a)} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function AnfrageKopf({ a }: { a: FruehstartAnfrage }) {
  const zusatz = [a.buero, a.berater ? anzahl(a.berater, 'Berater', 'Berater') : ''].filter(Boolean).join(' · ');
  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
        <span className="font-medium text-ui-tinte">{a.name}</span>
        <span className="min-w-0 break-all text-ui-schiefer">{a.email}</span>
        <span className="ml-auto text-xs text-ui-schiefer">{zeitpunkt(a.erstelltAm)}</span>
      </div>
      {zusatz && <p className="mt-0.5 text-xs text-ui-schiefer">{zusatz}</p>}
    </>
  );
}

function Entscheidung({ a, frisch, onNeuerLink }: {
  a: FruehstartAnfrage; frisch: boolean; onNeuerLink: () => Promise<void>;
}) {
  if (a.status === 'abgesagt') {
    return (
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ui-schiefer">
        <span>Abgesagt am {datum(a.entschiedenAm)}</span>
        <a href={absageMail(a)} className={LINK_KLEIN}>
          <Mail className="h-3.5 w-3.5" aria-hidden /> Absage-Mail vorbereiten
        </a>
      </div>
    );
  }
  const jetzt = Date.now();
  const eingeloest = a.eingeloestAm !== null;
  const gueltig = !eingeloest && a.link !== null && a.linkGueltigBis !== null && Date.parse(a.linkGueltigBis) > jetzt;
  return (
    <div className="mt-1.5 space-y-2">
      <p className="text-xs text-ui-schiefer">
        Zugesagt am {datum(a.entschiedenAm)} ·{' '}
        {eingeloest
          ? <span className="font-medium text-ui-tinte">Link eingelöst am {datum(a.eingeloestAm)}</span>
          : gueltig ? <>Link gültig bis {datum(a.linkGueltigBis)}</> : <>Link abgelaufen</>}
      </p>
      {/* Gerade zugesagt: Der naechste Schritt steht in Tinte; der neue Link traegt den Rand in Cyan. */}
      {frisch && gueltig && (
        <p role="status" className="text-xs font-medium text-ui-tinte">
          Zugesagt. Jetzt die E-Mail vorbereiten und aus Ihrem Mailprogramm abschicken:
        </p>
      )}
      {gueltig && a.link && (
        <>
          <a href={zusageMail(a, a.link)} className={`${frisch ? KNOPF_KLEIN_HAUPT : KNOPF_KLEIN} w-fit`}>
            <Mail className="h-3.5 w-3.5" aria-hidden /> E-Mail vorbereiten
          </a>
          <LinkFeld link={anfrageLink(a.link)} neu={frisch} beschriftung={`Early-Adopter-Link für ${a.name}`} />
        </>
      )}
      {!eingeloest && !gueltig && (
        <button type="button" onClick={() => void onNeuerLink()} className={KNOPF_KLEIN}>
          <Link2 className="h-3.5 w-3.5" aria-hidden /> Neuen Link erstellen
        </button>
      )}
    </div>
  );
}

function EarlyAdopter() {
  const [links, setLinks] = useState<FruehstartLink[] | null>(null);
  const [teilnehmer, setTeilnehmer] = useState<FruehstartTeilnehmer[] | null>(null);
  const [notiz, setNotiz] = useState('');
  const [neu, setNeu] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const laden = useCallback(async () => {
    const [l, t] = await Promise.all([fruehstartLinksLaden(), fruehstartTeilnehmerLaden()]);
    if (l === null || t === null) setFehler('Die Liste konnte nicht geladen werden.');
    setLinks(l ?? []);
    setTeilnehmer(t ?? []);
  }, []);
  useEffect(() => { void laden(); }, [laden]);

  const erstellen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (laeuft) return;
    setLaeuft(true);
    setFehler(null);
    const r = await fruehstartLinkErstellen(notiz.trim());
    setLaeuft(false);
    if ('fehler' in r) { setFehler(r.fehler); return; }
    setNeu(r.token);
    setNotiz('');
    await laden();
  };

  const zurueckziehen = async (token: string) => {
    setFehler(null);
    if (!(await fruehstartLinkZurueckziehen(token))) setFehler(fehlgeschlagen);
    await laden();
  };

  const jetzt = Date.now();
  const offen = (links ?? []).filter((l) => l.eingeloestAm === null && Date.parse(l.gueltigBis) > jetzt);

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-ui-schiefer">
        Jeder Link gilt 30 Tage für eine Person. Wer ihn einlöst, nutzt alle Funktionen {FRUEHSTART_MONATE} Monate
        kostenlos — gezählt ab dem Start des Abos — und wird alle vier Wochen um Feedback gebeten.
      </p>
      {import.meta.env.VITE_UMGEBUNG === 'test' && (
        <Hinweis>
          Sie sind auf der Testseite: Links von hier führen auf die Testseite. Echte Einladungen erstellen Sie am
          besten auf js-rentenplaner.de, sobald diese Funktion dort live ist.
        </Hinweis>
      )}

      <form onSubmit={(e) => void erstellen(e)} className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-[1_1_12rem] text-xs font-medium text-ui-tinte/80">
          Für wen? <span className="font-normal text-ui-schiefer">(nur für Sie sichtbar)</span>
          <input
            value={notiz}
            onChange={(e) => setNotiz(e.target.value)}
            maxLength={200}
            placeholder="z. B. Max Muster, Agentur Muster"
            className={`mt-1 ${FELD} font-normal`}
          />
        </label>
        <button type="submit" disabled={laeuft} className={KNOPF}>
          <Link2 className="h-4 w-4" aria-hidden /> Link erstellen
        </button>
      </form>
      {fehler && <p role="alert" className={FEHLER}>{fehler}</p>}

      <div>
        <h4 className={LISTE_TITEL}>Offene Links</h4>
        {links === null ? (
          <p className="mt-1 text-sm text-ui-schiefer">Wird geladen …</p>
        ) : offen.length === 0 ? (
          <p className="mt-1 text-sm text-ui-schiefer">Keine offenen Links.</p>
        ) : (
          <ul className={LISTE}>
            {offen.map((l) => (
              <li key={l.token} className="py-3">
                <p className="mb-1.5 truncate text-xs font-medium text-ui-tinte">{l.notiz || 'Ohne Notiz'}</p>
                <LinkFeld link={fruehstartLink(l.token)} neu={l.token === neu}
                  beschriftung={`Early-Adopter-Link${l.notiz ? ` für ${l.notiz}` : ''}`} />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-ui-schiefer">Gültig bis {datum(l.gueltigBis)}</span>
                  <Sicher text="Zurückziehen" frage="Zurückziehen?" ja="Ja" onJa={() => zurueckziehen(l.token)} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h4 className={LISTE_TITEL}>
          Teilnehmer{teilnehmer && teilnehmer.length > 0 ? ` (${teilnehmer.length})` : ''}
        </h4>
        {teilnehmer === null ? (
          <p className="mt-1 text-sm text-ui-schiefer">Wird geladen …</p>
        ) : teilnehmer.length === 0 ? (
          <p className="mt-1 text-sm text-ui-schiefer">Noch niemand dabei.</p>
        ) : (
          <ul className={LISTE}>
            {teilnehmer.map((t) => <TeilnehmerZeile key={t.email} t={t} jetzt={jetzt} />)}
          </ul>
        )}
      </div>
    </div>
  );
}

function TeilnehmerZeile({ t, jetzt }: { t: FruehstartTeilnehmer; jetzt: number }) {
  const laeuft = t.bis === null || Date.parse(t.bis) > jetzt;
  const ueberfaellig = laeuft && jetzt - Date.parse(t.letzteRueckmeldung ?? t.seit) > UEBERFAELLIG_NACH;
  const betreff = encodeURIComponent('Ihre Rückmeldung zum JS-Rentenplaner');
  return (
    <li className="py-2.5">
      {/* Was etwas verlangt, traegt die Marke; was nur ein Stand ist, den Vermerk. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="min-w-0 flex-1 truncate font-medium text-ui-tinte">{t.email}</span>
        {ueberfaellig && <Marke>Feedback überfällig</Marke>}
        {!laeuft && <Vermerk>Zeit vorbei</Vermerk>}
      </div>
      <p className="mt-0.5 text-xs text-ui-schiefer">
        {t.notiz && <>{t.notiz} · </>}dabei seit {datum(t.seit)} ·{' '}
        {t.bis ? `kostenlos bis ${datum(t.bis)}` : `${FRUEHSTART_MONATE} Monate ab Start`}
      </p>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-ui-schiefer">
        <span>
          {t.rueckmeldungen === 0
            ? 'Noch keine Rückmeldung'
            : `${anzahl(t.rueckmeldungen, 'Rückmeldung', 'Rückmeldungen')}, zuletzt am ${datum(t.letzteRueckmeldung)}`}
        </span>
        {ueberfaellig && (
          <a href={`mailto:${t.email}?subject=${betreff}`} className={LINK_KLEIN}>
            <Mail className="h-3.5 w-3.5" aria-hidden /> Erinnern
          </a>
        )}
      </p>
    </li>
  );
}

const zeitpunkt = (iso: string) =>
  new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });

function Sterne({ n }: { n: number | null }) {
  if (n === null) return <span className="text-ui-schiefer">ohne Bewertung</span>;
  /* Wie die Sterne im Feedback-Fenster: gefuellt in Tinte, leer in Warm Gray — ohne Gelb. */
  return (
    <span role="img" aria-label={`${n} von 5 Sternen`} className="text-ui-tinte">
      {'★'.repeat(n)}<span className="text-ui-schiefer">{'☆'.repeat(5 - n)}</span>
    </span>
  );
}

const ZUERST = 10;

function Rueckmeldungen() {
  const [liste, setListe] = useState<Rueckmeldung[] | null>(null);
  const [fehler, setFehler] = useState(false);
  const [alle, setAlle] = useState(false);

  useEffect(() => {
    let lebt = true;
    void rueckmeldungenLaden().then((r) => {
      if (!lebt) return;
      setListe(r ?? []);
      setFehler(r === null);
    });
    return () => { lebt = false; };
  }, []);

  if (liste === null) return <p className="text-sm text-ui-schiefer">Wird geladen …</p>;
  if (fehler) return <p role="alert" className={FEHLER}>Die Rückmeldungen konnten nicht geladen werden.</p>;
  if (liste.length === 0) return <p className="text-sm text-ui-schiefer">Noch keine Rückmeldungen.</p>;

  const bewertet = liste.filter((r) => r.bewertung !== null);
  const schnitt = bewertet.reduce((s, r) => s + (r.bewertung ?? 0), 0) / Math.max(1, bewertet.length);
  const gezeigt = alle ? liste : liste.slice(0, ZUERST);
  return (
    <div>
      <p className="text-xs text-ui-schiefer">
        {anzahl(liste.length, 'Rückmeldung', 'Rückmeldungen')}
        {bewertet.length > 0 && <> · im Schnitt {schnitt.toLocaleString('de-DE', { maximumFractionDigits: 1 })} von 5 Sternen</>}
      </p>
      <ul className={`${LISTE} mt-2`}>
        {gezeigt.map((r) => (
          <li key={r.id} className="py-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <Sterne n={r.bewertung} />
              <span className="min-w-0 truncate font-medium text-ui-tinte">{r.email}</span>
              {r.fruehstarter && <Vermerk>Early Adopter</Vermerk>}
              <span className="ml-auto text-ui-schiefer">{zeitpunkt(r.erstelltAm)}</span>
            </div>
            {r.text && <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-ui-tinte">{r.text}</p>}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ui-schiefer">
              {r.seite && <span className="min-w-0 break-words">Seite: {r.seite}</span>}
              {r.kontaktOk && (
                <a href={`mailto:${r.email}?subject=${encodeURIComponent('Ihre Rückmeldung zum JS-Rentenplaner')}`}
                  className={LINK_KLEIN}>
                  <Mail className="h-3.5 w-3.5" aria-hidden /> Antworten
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
      {!alle && liste.length > ZUERST && (
        <button type="button" onClick={() => setAlle(true)} className={`mt-3 ${KNOPF_KLEIN}`}>
          Alle {liste.length} anzeigen
        </button>
      )}
    </div>
  );
}
