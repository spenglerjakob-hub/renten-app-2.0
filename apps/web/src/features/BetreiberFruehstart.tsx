import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, Link2, Mail } from 'lucide-react';
import { FRUEHSTART_MONATE } from '@renten/schema/preise';
import { LinkFeld } from '../components/LinkFeld';
import { Sicher } from '../components/Sicher';
import { fruehstartLink } from '../lib/einladung';
import {
  fruehstartLinkErstellen, fruehstartLinkZurueckziehen, fruehstartLinksLaden, fruehstartTeilnehmerLaden,
  rueckmeldungenLaden, type FruehstartLink, type FruehstartTeilnehmer, type Rueckmeldung,
} from '../lib/fruehstart';
import { datum } from '../store/zugang';

/**
 * Nur fuer den Betreiber, im Fenster "Abo & Team": Early-Adopter-Links
 * erstellen und verwalten, die Teilnehmer im Blick behalten (wer schweigt?)
 * und alle Rueckmeldungen lesen.
 *
 * Beide Bereiche laden erst beim Aufklappen — und bei jedem Aufklappen neu.
 * Was angezeigt wird, entscheidet der Server: Fuer andere Konten liefern die
 * Funktionen nichts.
 */
export function BetreiberFruehstart() {
  return (
    <div className="mt-4 space-y-2">
      <Klappe titel="Early Adopter: Links und Teilnehmer"><EarlyAdopter /></Klappe>
      <Klappe titel="Rückmeldungen"><Rueckmeldungen /></Klappe>
    </div>
  );
}

function Klappe({ titel, children }: { titel: string; children: ReactNode }) {
  const [offen, setOffen] = useState(false);
  return (
    <details className="group rounded-lg border border-fuchsia-200 bg-white" onToggle={(e) => setOffen(e.currentTarget.open)}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-bold text-fuchsia-950 hover:bg-fuchsia-50 [&::-webkit-details-marker]:hidden">
        {titel}
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      {offen && <div className="border-t border-fuchsia-100 p-3">{children}</div>}
    </details>
  );
}

const TAG = 86_400_000;
/** Wie die Erinnerung in der Oberflaeche (`rueckmeldungFaellig`): alle vier Wochen. */
const UEBERFAELLIG_NACH = 28 * TAG;
const fehlgeschlagen = 'Das hat nicht geklappt. Bitte versuchen Sie es noch einmal.';
const anzahl = (n: number, eins: string, mehr: string) => `${n} ${n === 1 ? eins : mehr}`;

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
      <p className="text-xs leading-relaxed text-slate-600">
        Jeder Link gilt 30 Tage für eine Person. Wer ihn einlöst, nutzt alle Funktionen {FRUEHSTART_MONATE} Monate
        kostenlos — gezählt ab dem Start des Abos — und wird alle vier Wochen um Feedback gebeten.
      </p>
      {import.meta.env.VITE_UMGEBUNG === 'test' && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950">
          Sie sind auf der Testseite: Links von hier führen auf die Testseite. Echte Einladungen erstellen Sie am
          besten auf js-rentenplaner.de, sobald diese Funktion dort live ist.
        </p>
      )}

      <form onSubmit={(e) => void erstellen(e)} className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-[1_1_12rem] text-xs font-bold text-slate-700">
          Für wen? <span className="font-normal text-slate-500">(nur für Sie sichtbar)</span>
          <input
            value={notiz}
            onChange={(e) => setNotiz(e.target.value)}
            maxLength={200}
            placeholder="z. B. Max Muster, Agentur Muster"
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm font-normal text-slate-800"
          />
        </label>
        <button type="submit" disabled={laeuft}
          className="flex items-center gap-1.5 rounded-lg bg-fuchsia-700 px-3 py-2 text-sm font-bold text-white hover:bg-fuchsia-600 disabled:opacity-50">
          <Link2 className="h-4 w-4" aria-hidden /> Link erstellen
        </button>
      </form>
      {fehler && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900">{fehler}</p>}

      <div>
        <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">Offene Links</h4>
        {links === null ? (
          <p className="mt-1 text-sm text-slate-500">Wird geladen …</p>
        ) : offen.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500">Keine offenen Links.</p>
        ) : (
          <ul className="mt-1.5 space-y-2">
            {offen.map((l) => (
              <li key={l.token} className="rounded-lg border border-slate-200 p-2">
                <p className="mb-1 truncate text-xs font-bold text-slate-800">{l.notiz || 'Ohne Notiz'}</p>
                <LinkFeld link={fruehstartLink(l.token)} neu={l.token === neu}
                  beschriftung={`Early-Adopter-Link${l.notiz ? ` für ${l.notiz}` : ''}`} />
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-slate-500">Gültig bis {datum(l.gueltigBis)}</span>
                  <Sicher text="Zurückziehen" frage="Zurückziehen?" ja="Ja" onJa={() => zurueckziehen(l.token)} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Teilnehmer{teilnehmer && teilnehmer.length > 0 ? ` (${teilnehmer.length})` : ''}
        </h4>
        {teilnehmer === null ? (
          <p className="mt-1 text-sm text-slate-500">Wird geladen …</p>
        ) : teilnehmer.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500">Noch niemand dabei.</p>
        ) : (
          <ul className="mt-1.5 divide-y divide-slate-100 rounded-lg border border-slate-200">
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
    <li className="px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="min-w-0 flex-1 truncate font-bold text-slate-800">{t.email}</span>
        {ueberfaellig && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-900">Feedback überfällig</span>
        )}
        {!laeuft && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-600">Zeit vorbei</span>}
      </div>
      <p className="mt-0.5 text-xs text-slate-500">
        {t.notiz && <>{t.notiz} · </>}dabei seit {datum(t.seit)} ·{' '}
        {t.bis ? `kostenlos bis ${datum(t.bis)}` : `${FRUEHSTART_MONATE} Monate ab Start`}
      </p>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-slate-600">
        <span>
          {t.rueckmeldungen === 0
            ? 'Noch keine Rückmeldung'
            : `${anzahl(t.rueckmeldungen, 'Rückmeldung', 'Rückmeldungen')}, zuletzt am ${datum(t.letzteRueckmeldung)}`}
        </span>
        {ueberfaellig && (
          <a href={`mailto:${t.email}?subject=${betreff}`}
            className="flex items-center gap-1 font-bold text-indigo-700 hover:underline">
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
  if (n === null) return <span className="text-slate-500">ohne Bewertung</span>;
  return (
    <span role="img" aria-label={`${n} von 5 Sternen`} className="tracking-tight text-amber-500">
      {'★'.repeat(n)}<span className="text-slate-300">{'☆'.repeat(5 - n)}</span>
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

  if (liste === null) return <p className="text-sm text-slate-500">Wird geladen …</p>;
  if (fehler) return <p role="alert" className="text-sm text-rose-900">Die Rückmeldungen konnten nicht geladen werden.</p>;
  if (liste.length === 0) return <p className="text-sm text-slate-500">Noch keine Rückmeldungen.</p>;

  const bewertet = liste.filter((r) => r.bewertung !== null);
  const schnitt = bewertet.reduce((s, r) => s + (r.bewertung ?? 0), 0) / Math.max(1, bewertet.length);
  const gezeigt = alle ? liste : liste.slice(0, ZUERST);
  return (
    <div>
      <p className="text-xs text-slate-600">
        {anzahl(liste.length, 'Rückmeldung', 'Rückmeldungen')}
        {bewertet.length > 0 && <> · im Schnitt {schnitt.toLocaleString('de-DE', { maximumFractionDigits: 1 })} von 5 Sternen</>}
      </p>
      <ul className="mt-2 space-y-2">
        {gezeigt.map((r) => (
          <li key={r.id} className="rounded-lg border border-slate-200 p-2.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <Sterne n={r.bewertung} />
              <span className="min-w-0 truncate font-bold text-slate-800">{r.email}</span>
              {r.fruehstarter && (
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-bold text-emerald-800">Early Adopter</span>
              )}
              <span className="ml-auto text-slate-500">{zeitpunkt(r.erstelltAm)}</span>
            </div>
            {r.text && <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{r.text}</p>}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              {r.seite && <span className="min-w-0 break-words">Seite: {r.seite}</span>}
              {r.kontaktOk && (
                <a href={`mailto:${r.email}?subject=${encodeURIComponent('Ihre Rückmeldung zum JS-Rentenplaner')}`}
                  className="flex items-center gap-1 font-bold text-indigo-700 hover:underline">
                  <Mail className="h-3.5 w-3.5" aria-hidden /> Antworten
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
      {!alle && liste.length > ZUERST && (
        <button type="button" onClick={() => setAlle(true)}
          className="mt-2 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
          Alle {liste.length} anzeigen
        </button>
      )}
    </div>
  );
}
