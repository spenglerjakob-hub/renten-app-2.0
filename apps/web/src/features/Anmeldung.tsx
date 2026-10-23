import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LogIn, UserPlus, KeyRound, ArrowLeft, ShieldCheck, MailCheck, Send, Sparkles, Users, Calculator, Save } from 'lucide-react';
import { FRUEHSTART_MONATE } from '@renten/schema/preise';
import { SeitenKopf } from '../components/SeitenKopf';
import { RechtsLinks } from '../components/RechtsLinks';
import { FELD, FELD_LABEL, Hinweis, KNOPF, LINK, Titel } from '../components/stil';
import { useAuth, type MailLink } from '../store/auth';
import { offenerMusterfall } from '../lib/musterfall';
import { offenerAuftrittLokal } from '../lib/auftritt-lokal';

type Maske = 'anmelden' | 'registrieren' | 'vergessen';

/**
 * Anmeldemaske vor dem Rechner.
 *
 * Vier Zustaende: anmelden, registrieren, Passwort vergessen und — wenn der
 * Nutzer ueber einen Zuruecksetzen-Link kommt — ein neues Passwort vergeben.
 * Letzteres steuert der Auth-Store ueber `status === 'passwortNeu'`; diese
 * Maske entscheidet das nicht selbst. Dazu die Seite hinter einem Link aus
 * einer Mail (`status === 'linkEinloesen'`), siehe `LinkEinloesen`.
 *
 * `einladung` / `fruehstart`: Der Nutzer kam ueber den Einladungslink eines
 * Bueros bzw. einen Early-Adopter-Link. Dann steht das oben, und die Maske
 * beginnt mit der Registrierung — die meisten haben noch kein Konto.
 */
export function Anmeldung({ einladung = false, fruehstart = false }: { einladung?: boolean; fruehstart?: boolean }) {
  const {
    status, laedt, meldung, link, unbestaetigt,
    registrieren, anmelden, passwortVergessen, passwortSetzen, meldungLoeschen,
    linkBestaetigen, bestaetigungErneutSenden,
  } = useAuth();

  // `/?registrieren` (Knopf "Kostenlos testen" der Preisseite) oeffnet gleich die Registrierung.
  const [maske, setMaske] = useState<Maske>(() =>
    (einladung || fruehstart || new URLSearchParams(window.location.search).has('registrieren') ? 'registrieren' : 'anmelden'));
  const [email, setEmail] = useState('');
  const [passwort, setPasswort] = useState('');
  const [passwort2, setPasswort2] = useState('');
  const [zustimmung, setZustimmung] = useState(false);
  // Ein Fall aus der Schnellrechnung wartet auf das Konto (siehe `lib/musterfall.ts`).
  const [musterfall] = useState(() => offenerMusterfall());
  // Ebenso Logo, Firmenname und Farbe aus der Schnellrechnung (`lib/auftritt-lokal.ts`).
  const [auftrittEntwurf] = useState(() => offenerAuftrittLokal());
  const auftrittWas = !auftrittEntwurf ? null
    : auftrittEntwurf.logo ? 'Ihr Logo' : auftrittEntwurf.firma.trim() ? 'Ihr Firmenname' : 'Ihre Akzentfarbe';

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
      if (passwort.length >= 8 && passwort === passwort2 && zustimmung) void registrieren(email.trim(), passwort);
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
      <div className="ui-karte p-6 sm:p-7">
        <Titel>{titel}</Titel>
        <p className="mt-2 text-sm leading-relaxed text-ui-schiefer">
          {passwortNeu
            ? 'Wählen Sie ein neues Passwort für Ihr Konto.'
            : maske === 'anmelden'
              ? 'Der Rentenplaner steht angemeldeten Nutzern offen.'
              : maske === 'registrieren'
                ? 'Mit E-Mail-Adresse und Passwort — mehr brauchen wir nicht.'
                : 'Wir schicken Ihnen einen Link, mit dem Sie ein neues Passwort vergeben können.'}
        </p>

        {fruehstart && !passwortNeu && (
          <Hinweis symbol={Sparkles} klasse="mt-4">
            <span>
              <strong className="font-medium">Sie sind als Early Adopter eingeladen:</strong> {FRUEHSTART_MONATE} Monate alle Funktionen
              kostenlos — dafür freuen wir uns über Ihre Rückmeldungen. Legen Sie ein Konto an oder melden Sie sich
              mit Ihrem bestehenden an.
            </span>
          </Hinweis>
        )}

        {/*
          DER MUSTERFALL — was hier passiert, steht da: Er liegt in diesem
          Browser und kommt nach der Anmeldung in den Rechner. Kein Druck,
          keine Frist im Text.
        */}
        {musterfall && !passwortNeu && (
          <Hinweis symbol={Save} klasse="mt-4">
            <span>
              <strong className="font-medium">Ihr Musterfall ist vorgemerkt</strong>{musterfall.kurz ? <>: {musterfall.kurz}</> : null}. Nach der
              Anmeldung liegt er im Rechner.
              {auftrittWas && <> {auftrittWas} aus der Schnellrechnung kommt mit ins Konto.</>}
              {maske === 'registrieren' && (
                <> Bestätigen Sie die E-Mail-Adresse am besten in diesem Browser — hier liegt Ihr Musterfall.</>
              )}
            </span>
          </Hinweis>
        )}
        {!musterfall && auftrittWas && !passwortNeu && (
          <Hinweis symbol={Save} klasse="mt-4">
            <span>
              {auftrittWas} aus der Schnellrechnung kommt mit ins Konto.
              {maske === 'registrieren' && (
                <> Bestätigen Sie die E-Mail-Adresse am besten in diesem Browser — hier liegt der Entwurf.</>
              )}
            </span>
          </Hinweis>
        )}

        {einladung && !passwortNeu && (
          <Hinweis symbol={Users} klasse="mt-4">
            <span>
              <strong className="font-medium">Sie wurden in ein Büro eingeladen.</strong> Legen Sie ein Konto an oder melden Sie sich mit
              Ihrem bestehenden an — danach gehören Sie automatisch dazu.
            </span>
          </Hinweis>
        )}

        {meldung && (
          <div
            role="status"
            className={`mt-4 px-3 py-2 text-sm leading-relaxed ${
              meldung.art === 'ok' ? 'ui-innen text-ui-tinte' : 'rounded-lg bg-rose-50 text-rose-900'
            }`}
          >
            {meldung.text}
            {unbestaetigt && maske === 'anmelden' && (
              <button
                type="button"
                onClick={() => void bestaetigungErneutSenden()}
                disabled={laedt}
                className="mt-2 flex items-center gap-1.5 rounded-full border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-900 hover:bg-rose-100 disabled:opacity-50"
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
                className={`${FELD} p-2.5`}
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
                className={`${FELD} p-2.5`}
              />
              {(maske === 'registrieren' || passwortNeu) && (
                <p className={`mt-1 text-xs ${zuKurz ? 'text-rose-700' : 'text-ui-schiefer'}`}>
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
                className={`${FELD} p-2.5`}
              />
              {ungleich && (
                <p className="mt-1 text-xs text-rose-700">Die beiden Passwörter stimmen nicht überein.</p>
              )}
            </Feld>
          )}

          {maske === 'registrieren' && !passwortNeu && (
            <label className="flex items-start gap-2 text-xs leading-relaxed text-ui-schiefer">
              <input
                type="checkbox" required checked={zustimmung} onChange={(e) => setZustimmung(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span>
                Ich akzeptiere die{' '}
                <a href="/nutzungsbedingungen" target="_blank" rel="noopener" className="font-medium text-ui-tinte underline">
                  Nutzungsbedingungen
                </a>
                . Die{' '}
                <a href="/datenschutz" target="_blank" rel="noopener" className="font-medium text-ui-tinte underline">
                  Datenschutzerklärung
                </a>{' '}
                habe ich zur Kenntnis genommen.
              </span>
            </label>
          )}

          <button
            type="submit"
            disabled={laedt}
            className={`w-full ${KNOPF}`}
          >
            {passwortNeu ? <><KeyRound className="h-4 w-4" aria-hidden /> Passwort speichern</>
              : maske === 'anmelden' ? <><LogIn className="h-4 w-4" aria-hidden /> Anmelden</>
              : maske === 'registrieren' ? <><UserPlus className="h-4 w-4" aria-hidden /> {musterfall ? 'Konto anlegen und Fall speichern' : 'Konto anlegen'}</>
              : <><KeyRound className="h-4 w-4" aria-hidden /> Link anfordern</>}
          </button>
        </form>

        {!passwortNeu && (
          <div className="mt-4 border-t border-ui-linie pt-4 text-sm">
            {maske === 'anmelden' ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button type="button" onClick={() => setMaske('registrieren')} className={LINK}>
                  Noch kein Konto? Jetzt anlegen
                </button>
                <button type="button" onClick={() => setMaske('vergessen')}
                  className="text-ui-schiefer underline-offset-4 hover:text-ui-tinte hover:underline">
                  Passwort vergessen
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setMaske('anmelden')} className={LINK}>
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Zurück zur Anmeldung
              </button>
            )}
          </div>
        )}
      </div>

      <p className="mt-4 flex gap-2 px-2 text-xs leading-relaxed text-ui-schiefer">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          Ihre Eingaben im Rechner bleiben auf Ihrem Gerät. Nur was Sie ausdrücklich speichern,
          wird Ihrem Konto zugeordnet — und ist dann ausschließlich für Sie sichtbar.
        </span>
      </p>

      {/* Wert vor Registrierung: erst rechnen, dann entscheiden. */}
      {!musterfall && !passwortNeu && (
        <a href="/schnellrechnung"
          className="ui-karte mt-4 flex items-center gap-2 px-4 py-3 text-sm text-ui-schiefer hover:border-ui-feld-rand">
          <Calculator className="h-4 w-4 shrink-0 text-ui-schiefer" aria-hidden />
          <span>Noch kein Konto? <strong className="font-medium text-ui-tinte">Rechnen Sie zuerst einen Fall durch — ohne Anmeldung →</strong></span>
        </a>
      )}

      <p className="mt-3 px-2 text-center text-xs text-ui-schiefer">
        Informationen zum{' '}
        <a href="/altersvorsorgedepot" className="font-medium text-ui-tinte underline-offset-4 hover:underline">
          Altersvorsorgedepot ab 2027
        </a>{' '}
        gibt es ohne Anmeldung.
      </p>
      <RechtsLinks klasse="mt-4 justify-center" />
    </Rahmen>
  );
}

function Feld({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={FELD_LABEL}>{label}</label>
      {children}
    </div>
  );
}

/** Kopf und Rahmen der Maske — gemeinsam fuer Anmeldung und Link-Seite. */
export function Rahmen({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-ui-flaeche text-ui-tinte">
      <SeitenKopf />

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
    <div className="ui-karte p-6 sm:p-7">
      <Titel>{text.titel}</Titel>
      <p className="mt-2 text-sm leading-relaxed text-ui-schiefer">{text.info}</p>
      <button
        type="button"
        onClick={onBestaetigen}
        disabled={laedt}
        className={`mt-4 w-full ${KNOPF}`}
      >
        {link.typ === 'recovery' ? <KeyRound className="h-4 w-4" aria-hidden /> : <MailCheck className="h-4 w-4" aria-hidden />}
        {laedt ? 'Einen Moment …' : text.knopf}
      </button>
      <a href="/" className="mt-4 block border-t border-ui-linie pt-4 text-sm text-ui-schiefer underline-offset-4 hover:text-ui-tinte hover:underline">
        Abbrechen und zur Anmeldung
      </a>
    </div>
  );
}
