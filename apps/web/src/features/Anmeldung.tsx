import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LogIn, UserPlus, KeyRound, ArrowLeft, ShieldCheck, MailCheck, Send } from 'lucide-react';
import { Logo } from '../components/Logo';
import { useAuth, type MailLink } from '../store/auth';

type Maske = 'anmelden' | 'registrieren' | 'vergessen';

/**
 * Anmeldemaske vor dem Rechner.
 *
 * Vier Zustaende: anmelden, registrieren, Passwort vergessen und — wenn der
 * Nutzer ueber einen Zuruecksetzen-Link kommt — ein neues Passwort vergeben.
 * Letzteres steuert der Auth-Store ueber `status === 'passwortNeu'`; diese
 * Maske entscheidet das nicht selbst. Dazu die Seite hinter einem Link aus
 * einer Mail (`status === 'linkEinloesen'`), siehe `LinkEinloesen`.
 */
export function Anmeldung() {
  const {
    status, laedt, meldung, link, unbestaetigt,
    registrieren, anmelden, passwortVergessen, passwortSetzen, meldungLoeschen,
    linkBestaetigen, bestaetigungErneutSenden,
  } = useAuth();

  const [maske, setMaske] = useState<Maske>('anmelden');
  const [email, setEmail] = useState('');
  const [passwort, setPasswort] = useState('');
  const [passwort2, setPasswort2] = useState('');

  // Beim Wechsel der Maske stehen gebliebene Meldungen loeschen — sonst
  // erscheint "E-Mail oder Passwort stimmen nicht" ueber dem Registrierformular.
  // Nicht beim ersten Anzeigen: Dann steht dort, WARUM die Maske kommt
  // (abgelaufener Link, Abmeldung nach Pause).
  const ersteMaske = useRef(maske);
  useEffect(() => {
    if (maske === ersteMaske.current) return;
    ersteMaske.current = maske;
    meldungLoeschen();
  }, [maske, meldungLoeschen]);

  const passwortNeu = status === 'passwortNeu';
  const zuKurz = passwort.length > 0 && passwort.length < 8;
  const ungleich = passwort2.length > 0 && passwort !== passwort2;

  const absenden = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwortNeu) {
      if (passwort.length >= 8 && passwort === passwort2) void passwortSetzen(passwort);
      return;
    }
    if (maske === 'anmelden') void anmelden(email.trim(), passwort);
    else if (maske === 'registrieren') {
      if (passwort.length >= 8 && passwort === passwort2) void registrieren(email.trim(), passwort);
    } else void passwortVergessen(email.trim());
  };

  if (status === 'linkEinloesen' && link) {
    return (
      <Rahmen>
        <LinkEinloesen link={link} laedt={laedt} onBestaetigen={() => void linkBestaetigen()} />
      </Rahmen>
    );
  }

  const titel = passwortNeu
    ? 'Neues Passwort vergeben'
    : maske === 'anmelden' ? 'Anmelden'
    : maske === 'registrieren' ? 'Konto anlegen'
    : 'Passwort zurücksetzen';

  return (
    <Rahmen>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-black tracking-tight text-slate-900">{titel}</h1>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          {passwortNeu
            ? 'Wählen Sie ein neues Passwort für Ihr Konto.'
            : maske === 'anmelden'
              ? 'Der Rentenplaner steht angemeldeten Nutzern offen.'
              : maske === 'registrieren'
                ? 'Mit E-Mail-Adresse und Passwort — mehr brauchen wir nicht.'
                : 'Wir schicken Ihnen einen Link, mit dem Sie ein neues Passwort vergeben können.'}
        </p>

        {meldung && (
          <div
            role="status"
            className={`mt-4 rounded-lg px-3 py-2 text-sm leading-relaxed ${
              meldung.art === 'ok' ? 'bg-emerald-50 text-emerald-900' : 'bg-rose-50 text-rose-900'
            }`}
          >
            {meldung.text}
            {unbestaetigt && maske === 'anmelden' && (
              <button
                type="button"
                onClick={() => void bestaetigungErneutSenden()}
                disabled={laedt}
                className="mt-2 flex items-center gap-1.5 rounded-md border border-rose-300 bg-white px-2.5 py-1.5 text-xs font-bold text-rose-900 hover:bg-rose-100 disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" aria-hidden /> Bestätigungsmail erneut senden
              </button>
            )}
          </div>
        )}

        <form onSubmit={absenden} className="mt-4 space-y-3">
          {!passwortNeu && (
            <Feld label="E-Mail-Adresse" id="anm-email">
              <input
                id="anm-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ihre@adresse.de"
                className="w-full rounded-lg border border-slate-300 p-2.5 text-sm"
              />
            </Feld>
          )}

          {maske !== 'vergessen' && (
            <Feld label={passwortNeu ? 'Neues Passwort' : 'Passwort'} id="anm-pw">
              <input
                id="anm-pw"
                type="password"
                required
                autoComplete={maske === 'anmelden' && !passwortNeu ? 'current-password' : 'new-password'}
                value={passwort}
                onChange={(e) => setPasswort(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2.5 text-sm"
              />
              {(maske === 'registrieren' || passwortNeu) && (
                <p className={`mt-1 text-xs ${zuKurz ? 'text-rose-600' : 'text-slate-500'}`}>
                  Mindestens 8 Zeichen.
                </p>
              )}
            </Feld>
          )}

          {(maske === 'registrieren' || passwortNeu) && (
            <Feld label="Passwort wiederholen" id="anm-pw2">
              <input
                id="anm-pw2"
                type="password"
                required
                autoComplete="new-password"
                value={passwort2}
                onChange={(e) => setPasswort2(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2.5 text-sm"
              />
              {ungleich && (
                <p className="mt-1 text-xs text-rose-600">Die beiden Passwörter stimmen nicht überein.</p>
              )}
            </Feld>
          )}

          <button
            type="submit"
            disabled={laedt}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {passwortNeu ? <><KeyRound className="h-4 w-4" aria-hidden /> Passwort speichern</>
              : maske === 'anmelden' ? <><LogIn className="h-4 w-4" aria-hidden /> Anmelden</>
              : maske === 'registrieren' ? <><UserPlus className="h-4 w-4" aria-hidden /> Konto anlegen</>
              : <><KeyRound className="h-4 w-4" aria-hidden /> Link anfordern</>}
          </button>
        </form>

        {!passwortNeu && (
          <div className="mt-4 border-t border-slate-100 pt-4 text-sm">
            {maske === 'anmelden' ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button type="button" onClick={() => setMaske('registrieren')}
                  className="font-medium text-indigo-700 hover:underline">
                  Noch kein Konto? Jetzt anlegen
                </button>
                <button type="button" onClick={() => setMaske('vergessen')}
                  className="text-slate-500 hover:underline">
                  Passwort vergessen
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setMaske('anmelden')}
                className="flex items-center gap-1.5 font-medium text-indigo-700 hover:underline">
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Zurück zur Anmeldung
              </button>
            )}
          </div>
        )}
      </div>

      <p className="mt-4 flex gap-2 px-2 text-xs leading-relaxed text-slate-500">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          Ihre Eingaben im Rechner bleiben auf Ihrem Gerät. Nur was Sie ausdrücklich speichern,
          wird Ihrem Konto zugeordnet — und ist dann ausschließlich für Sie sichtbar.
        </span>
      </p>

      <a
        href="/vorsorge-check"
        className="mt-4 block rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-center text-xs text-emerald-900 hover:bg-emerald-100"
      >
        <strong>Neu hier?</strong> Mit dem Vorsorge-Check erfassen Sie Ihre Angaben Schritt für
        Schritt — ohne Anmeldung. Das Konto brauchen Sie erst für das Ergebnis.
      </a>

      <p className="mt-3 px-2 text-center text-xs text-slate-500">
        Informationen zum{' '}
        <a href="/altersvorsorgedepot" className="font-medium text-indigo-700 hover:underline">
          Altersvorsorgedepot ab 2027
        </a>{' '}
        gibt es ohne Anmeldung.
      </p>
    </Rahmen>
  );
}

function Feld({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-bold text-slate-700">{label}</label>
      {children}
    </div>
  );
}

/** Kopf und Rahmen der Maske — gemeinsam fuer Anmeldung und Link-Seite. */
function Rahmen({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-100">
      <header className="bg-slate-900 text-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 sm:px-6">
          <Logo klasse="h-9 w-9" />
          <div>
            <span className="text-sm font-black tracking-tight">JS-Rentenplaner</span>
            <p className="text-[11px] text-slate-400">Ihre Zukunft. Smart geplant.</p>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
        {children}
      </main>
    </div>
  );
}

/**
 * Seite hinter dem Link aus einer Mail. Sie loest NICHTS von selbst aus —
 * Mailfilter rufen Links vorab auf; erst der Klick eines Menschen zaehlt.
 * Siehe `linkAusAdresse` im Auth-Store.
 */
function LinkEinloesen({ link, laedt, onBestaetigen }: { link: MailLink; laedt: boolean; onBestaetigen: () => void }) {
  const text = link.typ === 'recovery'
    ? { titel: 'Passwort zurücksetzen', info: 'Bitte bestätigen Sie, dass Sie ein neues Passwort vergeben möchten.', knopf: 'Weiter zum neuen Passwort' }
    : link.typ === 'email_change'
      ? { titel: 'Neue E-Mail-Adresse bestätigen', info: 'Ein Klick genügt, dann gilt die neue Adresse für Ihr Konto.', knopf: 'Neue Adresse bestätigen' }
      : { titel: 'E-Mail-Adresse bestätigen', info: 'Ein Klick genügt, dann ist Ihr Konto freigeschaltet und Sie sind angemeldet.', knopf: 'E-Mail-Adresse bestätigen' };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-lg font-black tracking-tight text-slate-900">{text.titel}</h1>
      <p className="mt-1 text-sm leading-relaxed text-slate-600">{text.info}</p>
      <button
        type="button"
        onClick={onBestaetigen}
        disabled={laedt}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        {link.typ === 'recovery' ? <KeyRound className="h-4 w-4" aria-hidden /> : <MailCheck className="h-4 w-4" aria-hidden />}
        {laedt ? 'Einen Moment …' : text.knopf}
      </button>
      <a href="/" className="mt-4 block border-t border-slate-100 pt-4 text-sm text-slate-500 hover:underline">
        Abbrechen und zur Anmeldung
      </a>
    </div>
  );
}
