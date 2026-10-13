import { useState } from 'react';
import { CheckCircle2, Send, Star } from 'lucide-react';
import { rueckmeldungSenden } from '../lib/fruehstart';
import { useZugang } from '../store/zugang';

/**
 * "Feedback geben" — fuer jedes angemeldete Konto; von Early Adoptern alle
 * vier Wochen erbeten. Geht an den Betreiber: als Mail und in die Liste unter
 * "Abo & Team". Die Seite, auf der man gerade ist, geht mit — so laesst sich
 * ein Hinweis zuordnen.
 */

/** Wo man gerade ist, ohne Zusaetze: "Zuschussmodell (/zuschussmodell)". */
function seiteJetzt(): string {
  const titel = document.title.replace(/^\[Test\] /, '').replace(/ \| JS-Rentenplaner$/, '');
  return `${titel} (${window.location.pathname})`.slice(0, 200);
}

export function Rueckmeldung() {
  const [bewertung, setBewertung] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [kontaktOk, setKontaktOk] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [fertig, setFertig] = useState(false);
  const schliessen = useZugang((s) => s.schliesseRueckmeldung);
  const leer = bewertung === null && text.trim() === '';

  const senden = async (e: React.FormEvent) => {
    e.preventDefault();
    if (leer || laeuft) return;
    setLaeuft(true);
    setFehler(null);
    const r = await rueckmeldungSenden({ bewertung, text: text.trim(), kontaktOk, seite: seiteJetzt() });
    setLaeuft(false);
    if (r !== true) { setFehler(r.fehler); return; }
    setFertig(true);
    // Die Erinnerung an Early Adopter richtet sich nach der letzten Rueckmeldung.
    const { fuer, laden } = useZugang.getState();
    if (fuer !== null) void laden(fuer, true);
  };

  if (fertig) {
    return (
      <div className="space-y-3 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" aria-hidden />
        <p className="text-base font-bold text-slate-900">Vielen Dank!</p>
        <p className="text-sm leading-relaxed text-slate-600">
          Ihre Rückmeldung ist angekommen. Wir lesen jede einzelne und melden uns, wenn wir nachfragen dürfen.
        </p>
        <button type="button" onClick={schliessen}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
          Schließen
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void senden(e)} className="space-y-4">
      <fieldset>
        <legend className="text-sm font-bold text-slate-800">Wie gefällt Ihnen der JS-Rentenplaner?</legend>
        <div role="radiogroup" aria-label="Bewertung" className="mt-1.5 flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={bewertung === n}
              aria-label={`${n} ${n === 1 ? 'Stern' : 'Sterne'}`}
              onClick={() => setBewertung(bewertung === n ? null : n)}
              className="rounded-md p-1 hover:bg-amber-50"
            >
              <Star
                className={`h-7 w-7 ${bewertung !== null && n <= bewertung ? 'fill-amber-400 text-amber-500' : 'text-slate-300'}`}
                aria-hidden
              />
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="rueckmeldung-text" className="text-sm font-bold text-slate-800">Was hilft, was fehlt, was stört?</label>
        <textarea
          id="rueckmeldung-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={4000}
          rows={5}
          placeholder="Zum Beispiel: Diese Rechnung brauche ich im Kundengespräch oft …"
          className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm leading-relaxed"
        />
      </div>

      <label className="flex items-start gap-2 text-sm leading-relaxed text-slate-700">
        <input type="checkbox" checked={kontaktOk} onChange={(e) => setKontaktOk(e.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300" />
        <span>Sie dürfen mich für Rückfragen per E-Mail kontaktieren.</span>
      </label>

      {fehler && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900">{fehler}</p>}

      <button type="submit" disabled={leer || laeuft}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50">
        <Send className="h-4 w-4" aria-hidden /> {laeuft ? 'Wird gesendet …' : 'Rückmeldung senden'}
      </button>
      <p className="text-xs leading-relaxed text-slate-500">
        Gespeichert werden Ihre Bewertung, Ihr Text, die Seite, auf der Sie gerade sind, und Ihr Konto; wir erhalten
        die Rückmeldung zusätzlich per E-Mail. Bitte schreiben Sie keine Angaben über Ihre Kunden hinein.
      </p>
    </form>
  );
}
