import { useId, useState, type FormEvent } from 'react';
import { Send } from 'lucide-react';
import { FRUEHSTART_MONATE, FRUEHSTART_RABATT_PROZENT } from '@renten/schema/preise';
import {
  anfragePruefen, fruehstartAnfrageSenden,
  type AnfrageAngaben, type AnfrageErgebnis, type AnfrageFehler, type AnfrageFeld,
} from '../lib/fruehstart-anfrage';
import {
  EINLEITUNG, ETIKETT, FEHLER, FELD_LABEL, Hervor, Hinweise, KNOPF, Karte, Titel,
} from '../components/stil';

const LEER: AnfrageAngaben = { name: '', email: '', buero: '', berater: '' };

const MELDUNG: Record<Exclude<AnfrageErgebnis, 'ok'>, string> = {
  ungueltig: 'Bitte prüfen Sie Name und E-Mail-Adresse.',
  viele: 'Gerade gehen sehr viele Anfragen ein. Bitte versuchen Sie es in einer Stunde noch einmal.',
  fehler: 'Das hat nicht geklappt. Bitte versuchen Sie es später noch einmal — die Kontaktdaten stehen auch im Impressum.',
};

/**
 * Early Adopter auf der Preisseite — AUF ANFRAGE.
 *
 * Teilnehmen kann man hier nicht direkt: Man schickt eine Anfrage, der
 * Betreiber entscheidet und schickt bei einer Zusage den persoenlichen
 * Early-Adopter-Link (wie bisher). Das steht offen da; kein Countdown, keine
 * erfundene Verknappung.
 *
 * Eine automatische Bestaetigung an die eingetragene Adresse gibt es
 * bewusst nicht — sonst liesse sich das Formular nutzen, um Fremden Mails zu
 * schicken. Die Seite sagt das, damit niemand auf eine Mail wartet.
 */
export function FruehstartAnfrage() {
  const id = useId();
  const [werte, setWerte] = useState<AnfrageAngaben>(LEER);
  // Honigtopf: fuer Menschen unsichtbar; wer ihn fuellt, ist ein Programm.
  const [falle, setFalle] = useState('');
  const [fehler, setFehler] = useState<AnfrageFehler>({});
  const [meldung, setMeldung] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [gesendet, setGesendet] = useState<{ name: string; email: string } | null>(null);

  const setze = (feld: AnfrageFeld, wert: string) => {
    setWerte((w) => ({ ...w, [feld]: wert }));
    setFehler((f) => ({ ...f, [feld]: undefined }));
    setMeldung(null);
  };

  const absenden = async (e: FormEvent) => {
    e.preventDefault();
    if (laeuft) return;
    const f = anfragePruefen(werte);
    setFehler(f);
    if (Object.values(f).some(Boolean)) return;
    const fertig = { name: werte.name.trim(), email: werte.email.trim() };
    if (falle.trim() !== '') { setGesendet(fertig); return; }
    setLaeuft(true);
    const r = await fruehstartAnfrageSenden(werte);
    setLaeuft(false);
    if (r === 'ok') setGesendet(fertig);
    else setMeldung(MELDUNG[r]);
  };

  /*
    Aufgebaut wie das Angebot der Firma in der Mitarbeiterberatung:
    Ueberschrift und Einleitung ueber den Karten, links was dazugehoert,
    rechts die Anfrage.
  */
  return (
    <section id="early-adopter" aria-labelledby={`${id}-titel`} className="scroll-mt-6">
      <p className={ETIKETT}>Vor dem Start</p>
      <Titel als="h2" id={`${id}-titel`} klasse="mt-1"><Hervor>Early Adopter</Hervor> werden</Titel>
      <p className={`mt-3 ${EINLEITUNG}`}>
        Sie möchten den JS-Rentenplaner von Anfang an mitgestalten? Als Early Adopter arbeiten Sie mit dem
        Rechner, bevor das Abo startet — und sagen uns, was in der Beratung hilft und was fehlt.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <Karte titel="Was dazugehört" klasse="self-start">
          <Hinweise punkte={[
            <>Alle Funktionen <strong className="font-medium">{FRUEHSTART_MONATE} Monate kostenlos</strong> — gezählt ab dem Start des Abos</>,
            <>Danach <strong className="font-medium">{FRUEHSTART_RABATT_PROZENT} % Rabatt auf das erste Jahr</strong>, wenn Sie ein Paket buchen</>,
            'Im Gegenzug alle vier Wochen eine kurze Rückmeldung: was hilft, was fehlt, was stört',
          ]} />
          <p className="mt-5 text-sm leading-relaxed text-ui-schiefer">
            Direkt teilnehmen können Sie nicht: Schicken Sie uns eine Anfrage. Wir melden uns persönlich per
            E-Mail — passt es, mit Ihrem persönlichen Zugang.
          </p>
        </Karte>

        {gesendet ? (
          <Karte titel="Anfrage gesendet" klasse="self-start">
            <div role="status" className="text-sm leading-relaxed text-ui-tinte">
              <p className="font-medium">Danke, {gesendet.name}! Ihre Anfrage ist bei uns.</p>
              <p className="mt-1 text-ui-schiefer">
                Wir melden uns persönlich per E-Mail an <strong className="break-all font-medium text-ui-tinte">{gesendet.email}</strong>. Eine
                automatische Bestätigung verschicken wir bewusst nicht.
              </p>
            </div>
          </Karte>
        ) : (
          <Karte titel="Anfrage">
            <form onSubmit={(e) => void absenden(e)} noValidate className="relative space-y-4">
              <Eingabe id={`${id}-name`} label="Name" pflicht wert={werte.name} fehler={fehler.name}
                onChange={(v) => setze('name', v)} autoComplete="name" maxLength={120} />
              <Eingabe id={`${id}-email`} label="E-Mail" pflicht typ="email" wert={werte.email} fehler={fehler.email}
                onChange={(v) => setze('email', v)} autoComplete="email" maxLength={254} />
              {/* Unten buendig: Die Beschriftung rechts bricht in der schmalen Spalte um —
                  die Felder sollen trotzdem auf einer Hoehe stehen. */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_9rem] sm:items-end">
                <Eingabe id={`${id}-buero`} label="Büro / Firma" wert={werte.buero} fehler={fehler.buero}
                  onChange={(v) => setze('buero', v)} autoComplete="organization" maxLength={200} />
                <Eingabe id={`${id}-berater`} label="Zahl der Berater" wert={werte.berater} fehler={fehler.berater}
                  onChange={(v) => setze('berater', v.replace(/\D/g, ''))} inputMode="numeric" maxLength={3} />
              </div>

              <div aria-hidden="true" className="absolute -left-[9999px] top-0 h-px w-px overflow-hidden">
                <label>
                  Website
                  <input tabIndex={-1} autoComplete="off" value={falle} onChange={(e) => setFalle(e.target.value)} />
                </label>
              </div>

              {meldung && <p role="alert" className={FEHLER}>{meldung}</p>}

              <button
                type="submit"
                disabled={laeuft}
                className={`w-full ${KNOPF}`}
              >
                <Send className="h-4 w-4" aria-hidden /> {laeuft ? 'Wird gesendet …' : 'Anfrage senden'}
              </button>
              <p className="text-xs leading-relaxed text-ui-schiefer">
                Ihre Angaben nutzen wir nur für Ihre Anfrage und löschen sie nach sechs Monaten. Mehr in der{' '}
                <a href="/datenschutz" className="underline underline-offset-2 hover:text-ui-tinte">Datenschutzerklärung</a>.
              </p>
            </form>
          </Karte>
        )}
      </div>
    </section>
  );
}

function Eingabe({ id, label, wert, onChange, fehler, pflicht = false, typ = 'text', autoComplete, inputMode, maxLength }: {
  id: string; label: string; wert: string; onChange: (v: string) => void; fehler?: string; pflicht?: boolean;
  typ?: 'text' | 'email'; autoComplete?: string; inputMode?: 'numeric'; maxLength?: number;
}) {
  return (
    <div>
      <label htmlFor={id} className={FELD_LABEL}>
        {label}{pflicht ? <span className="text-ui-schiefer" aria-hidden> *</span> : <span className="font-normal text-ui-schiefer"> (optional)</span>}
      </label>
      <input
        id={id}
        type={typ}
        value={wert}
        onChange={(e) => onChange(e.target.value)}
        required={pflicht}
        aria-required={pflicht || undefined}
        aria-invalid={fehler ? true : undefined}
        aria-describedby={fehler ? `${id}-fehler` : undefined}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        className={`ui-feld w-full p-2 text-sm ${fehler ? 'border-rose-400 bg-rose-50' : ''}`}
      />
      {fehler && <p id={`${id}-fehler`} className="mt-1 text-xs text-rose-700">{fehler}</p>}
    </div>
  );
}
