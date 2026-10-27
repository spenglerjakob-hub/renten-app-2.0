import { useState } from 'react';
import { CheckCircle2, Send, Star } from 'lucide-react';
import { rueckmeldungSenden } from '../lib/fruehstart';
import { useZugang } from '../store/zugang';
import { FEHLER, KNOPF, KNOPF_ZWEIT } from '../components/stil';

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
        <CheckCircle2 className="mx-auto h-10 w-10 text-ui-tinte" aria-hidden />
        <p className="ui-titel text-xl font-normal text-ui-tinte">Vielen Dank!</p>
        <p className="text-sm leading-relaxed text-ui-schiefer">
          Ihre Rückmeldung ist angekommen. Wir lesen jede einzelne und melden uns, wenn wir nachfragen dürfen.
        </p>
        <button type="button" onClick={schliessen} className={KNOPF_ZWEIT}>
          Schließen
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void senden(e)} className="space-y-4">
      <fieldset>
        <legend className="text-sm font-medium text-ui-tinte">Wie gefällt Ihnen der JS-Rentenplaner?</legend>
        <div role="radiogroup" aria-label="Bewertung" className="mt-1.5 flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={bewertung === n}
              aria-label={`${n} ${n === 1 ? 'Stern' : 'Sterne'}`}
              onClick={() => setBewertung(bewertung === n ? null : n)}
              className="rounded-full p-1 hover:bg-ui-innen"
            >
              <Star
                className={`h-7 w-7 ${bewertung !== null && n <= bewertung ? 'fill-ui-tinte text-ui-tinte' : 'text-ui-schiefer'}`}
                aria-hidden
              />
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="rueckmeldung-text" className="text-sm font-medium text-ui-tinte">Was hilft, was fehlt, was stört?</label>
        <textarea
          id="rueckmeldung-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={4000}
          rows={5}
          placeholder="Zum Beispiel: Diese Rechnung brauche ich im Kundengespräch oft …"
          className="ui-feld mt-1 w-full p-2.5 text-sm leading-relaxed"
        />
      </div>

      <label className="flex items-start gap-2 text-sm leading-relaxed text-ui-tinte">
        <input type="checkbox" checked={kontaktOk} onChange={(e) => setKontaktOk(e.target.checked)}
          className="mt-1 h-4 w-4 shrink-0" />
        <span>Sie dürfen mich für Rückfragen per E-Mail kontaktieren.</span>
      </label>

      {fehler && <p role="alert" className={FEHLER}>{fehler}</p>}

      <button type="submit" disabled={leer || laeuft} className={`w-full ${KNOPF} disabled:cursor-not-allowed`}>
        <Send className="h-4 w-4" aria-hidden /> {laeuft ? 'Wird gesendet …' : 'Rückmeldung senden'}
      </button>
      <p className="text-xs leading-relaxed text-ui-schiefer">
        Gespeichert werden Ihre Bewertung, Ihr Text, die Seite, auf der Sie gerade sind, und Ihr Konto; wir erhalten
        die Rückmeldung zusätzlich per E-Mail. Bitte schreiben Sie keine Angaben über Ihre Kunden hinein.
      </p>
    </form>
  );
}
