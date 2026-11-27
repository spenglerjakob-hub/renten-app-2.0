import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { CheckCircle2, Eraser, Lock, Mail, Maximize2, Minimize2, PenLine, Phone, Printer } from 'lucide-react';
import { SeitenKopf } from '../components/SeitenKopf';
import { RechtsLinks } from '../components/RechtsLinks';
import { DruckBereich, useDrucken } from '../components/Druck';
import { EINLEITUNG, FEHLER, KNOPF, KNOPF_KLEIN, KNOPF_ZWEIT, Karte, LINK, Titel } from '../components/stil';
import type { UnterlagenArt, Unterschrift } from '../lib/bav-beratung';
import {
  LINK_CODE, codeEingabe, linkOeffnen, linkUnterschreiben, spracheAusAdresse, tokenAusAdresse, type LinkInhalt, type LinkSperre,
} from '../lib/unterschrift-link';
import { SPRACHEN, SpracheKontext, useSprache, useW, type Sprache } from '../lib/sprache';
import { UnterschriebeneUnterlage, mitUnterschriften, pruefsummeVon } from '../mitarbeiter/festschreiben';
import { FELD_HOEHE, UnterschriftFeld } from '../mitarbeiter/UnterschriftFeld';
import {
  ZUG_BREITE, dokumenteFuer, dokumenteText, tinteGenug, zeitpunktText, zugAusStrichen, zugGueltig, type Strich,
} from '../mitarbeiter/unterschrift-daten';
import { Blatt } from './Blatt';

/*
 * UNTERSCHRIFT PER LINK — die Seite fuer den Mitarbeiter.
 *
 * Er kommt ueber den Link seines Beraters (Token im Fragment) und gibt den
 * Code ein, den der Berater ihm getrennt genannt hat. Dann liest er die
 * festgeschriebenen Unterlagen — genau so, wie sie gedruckt werden — und
 * unterschreibt sie mit Finger, Stift oder Maus. Danach speichert er seine
 * Kopie als PDF; der Link oeffnet sie nicht mehr.
 *
 * Die Pruefsummen rechnet die Seite aus dem HTML nach, das sie zeigt. Nur
 * wenn sie zur festgeschriebenen Fassung passen, laesst sie unterschreiben —
 * und schickt sie mit, damit die Datenbank die Unterschrift an genau diese
 * Fassung bindet.
 *
 * DEUTSCH ODER ENGLISCH: Lief die Beratung auf Englisch, traegt der Link
 * `?lang=en` (`unterschriftLink`) und die Seite spricht Englisch; oben laesst
 * sich die Sprache auch wechseln. Die Unterlagen selbst sind deutsch — das
 * sagt die Seite, bevor jemand unterschreibt.
 */

type Zustand =
  | { art: 'code'; meldung: string | null; laeuft: boolean }
  | { art: 'sperre'; grund: LinkSperre | 'ohne_link' }
  | { art: 'lesen'; inhalt: LinkInhalt; code: string }
  | { art: 'fertig'; inhalt: LinkInhalt; neu: Unterschrift };

const SPERRE_TEXT_EN: Record<LinkSperre | 'ohne_link', { titel: string; text: string }> = {
  ohne_link: {
    titel: 'The link is incomplete',
    text: 'Please open it exactly as you received it — ideally straight from the message.',
  },
  ungueltig: {
    titel: 'This link is not valid',
    text: 'It may be incomplete, or your adviser has sent you a new one in the meantime. Please contact your adviser.',
  },
  abgelaufen: {
    titel: 'This link has expired',
    text: 'A link is valid for 14 days. Your adviser will be happy to send you a new one.',
  },
  gesperrt: {
    titel: 'The link is locked',
    text: 'The code was entered incorrectly five times. For your protection the link no longer opens anything; your adviser will send you a new one.',
  },
  unterschrieben: {
    titel: 'Already signed',
    text: 'These documents have already been signed. Your adviser will give you a copy.',
  },
  fehler: {
    titel: 'That did not work',
    text: 'The connection to the server is currently disrupted. Please try again in a moment.',
  },
};

const SPERRE_TEXT: Record<LinkSperre | 'ohne_link', { titel: string; text: string }> = {
  ohne_link: {
    titel: 'Der Link ist unvollständig',
    text: 'Bitte öffnen Sie ihn genau so, wie Sie ihn bekommen haben — am besten direkt aus der Nachricht heraus.',
  },
  ungueltig: {
    titel: 'Dieser Link gilt nicht',
    text: 'Vielleicht ist er unvollständig, oder Ihr Berater hat Ihnen inzwischen einen neuen geschickt. Bitte wenden Sie sich an ihn.',
  },
  abgelaufen: {
    titel: 'Dieser Link ist abgelaufen',
    text: 'Ein Link gilt 14 Tage. Ihr Berater schickt Ihnen gern einen neuen.',
  },
  gesperrt: {
    titel: 'Der Link ist gesperrt',
    text: 'Der Code wurde fünfmal falsch eingegeben. Zu Ihrem Schutz öffnet der Link nichts mehr; Ihr Berater schickt Ihnen einen neuen.',
  },
  unterschrieben: {
    titel: 'Schon unterschrieben',
    text: 'Diese Unterlagen sind bereits unterschrieben. Eine Kopie bekommen Sie von Ihrem Berater.',
  },
  fehler: {
    titel: 'Das hat nicht geklappt',
    text: 'Die Verbindung zum Server ist gerade gestört. Bitte versuchen Sie es gleich noch einmal.',
  },
};

const DATUM = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' });

/** Die Unterlagen in der Reihenfolge des Drucks. */
function arten(inhalt: LinkInhalt): UnterlagenArt[] {
  return (['protokoll', 'vereinbarung', 'verzicht'] as const).filter((a) => inhalt.unterlagen[a] !== undefined);
}

export function Seite() {
  const [sprache, setSprache] = useState<Sprache>(() => spracheAusAdresse(window.location.search));
  const en = sprache === 'en';
  return (
    <SpracheKontext.Provider value={sprache}>
      <DruckBereich>
        <div className="min-h-screen bg-ui-flaeche">
          <SeitenKopf breite="max-w-3xl" />
          <main lang={sprache} className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
            {/* Die Sprache wechseln — fuer alle, die den Link ohne `?lang=en` bekommen haben. Jede Sprache in ihrer eigenen. */}
            <div role="group" aria-label={en ? 'Language' : 'Sprache'} className="mb-4 flex justify-end gap-1 text-sm">
              {SPRACHEN.map((x) => (
                <button key={x.id} type="button" lang={x.id} aria-pressed={sprache === x.id} onClick={() => setSprache(x.id)}
                  className={`rounded-full px-3 py-1.5 font-medium transition-colors ${
                    sprache === x.id ? 'bg-ui-dunkel text-white' : 'text-ui-schiefer hover:text-ui-tinte'
                  }`}>
                  {x.name}
                </button>
              ))}
            </div>
            <Inhalt />
            <p className="mt-10 text-center text-xs leading-relaxed text-ui-schiefer">
              {en ? (
                <>
                  Your documents are transmitted encrypted and only open with your adviser’s code. More in the{' '}
                  <a href="/datenschutz" className="underline underline-offset-2">privacy policy</a> (in German).
                </>
              ) : (
                <>
                  Ihre Unterlagen kommen verschlüsselt und nur mit dem Code Ihres Beraters. Mehr dazu in der{' '}
                  <a href="/datenschutz" className="underline underline-offset-2">Datenschutzerklärung</a>.
                </>
              )}
            </p>
            <RechtsLinks klasse="mt-4 justify-center" />
          </main>
        </div>
      </DruckBereich>
    </SpracheKontext.Provider>
  );
}

function Inhalt() {
  const w = useW();
  const sperre = w(SPERRE_TEXT, SPERRE_TEXT_EN);
  const token = useMemo(() => tokenAusAdresse(window.location.hash), []);
  const [zustand, setZustand] = useState<Zustand>(
    token ? { art: 'code', meldung: null, laeuft: false } : { art: 'sperre', grund: 'ohne_link' },
  );

  const oeffnen = async (code: string) => {
    if (!token) return;
    setZustand({ art: 'code', meldung: null, laeuft: true });
    const v = await linkOeffnen(token, code);
    if (v.status === 'ok') setZustand({ art: 'lesen', inhalt: v, code });
    else if (v.status === 'code_falsch') {
      setZustand({
        art: 'code', laeuft: false,
        meldung: w(`Der Code stimmt nicht. Noch ${v.rest} ${v.rest === 1 ? 'Versuch' : 'Versuche'} — danach ist der Link gesperrt.`,
          `The code is not correct. ${v.rest} ${v.rest === 1 ? 'attempt' : 'attempts'} left — after that the link is locked.`),
      });
    } else if (v.status === 'fehler') setZustand({ art: 'code', laeuft: false, meldung: sperre.fehler.text });
    else setZustand({ art: 'sperre', grund: v.status });
  };

  switch (zustand.art) {
    case 'code':
      return <CodeEingabe meldung={zustand.meldung} laeuft={zustand.laeuft} onCode={(c) => void oeffnen(c)} />;
    case 'sperre':
      return (
        <>
          <Titel>{sperre[zustand.grund].titel}</Titel>
          <p className={`mt-3 ${EINLEITUNG}`}>{sperre[zustand.grund].text}</p>
        </>
      );
    case 'lesen':
      return (
        <Lesen inhalt={zustand.inhalt} token={token ?? ''} code={zustand.code}
          onSperre={(grund) => setZustand({ art: 'sperre', grund })}
          onFertig={(neu) => setZustand({ art: 'fertig', inhalt: zustand.inhalt, neu })} />
      );
    case 'fertig':
      return <Fertig inhalt={zustand.inhalt} neu={zustand.neu} />;
  }
}

function CodeEingabe({ meldung, laeuft, onCode }: { meldung: string | null; laeuft: boolean; onCode: (code: string) => void }) {
  const w = useW();
  const [code, setCode] = useState('');
  const bereit = LINK_CODE.test(code) && !laeuft;
  const absenden = (e: FormEvent) => {
    e.preventDefault();
    if (bereit) onCode(code);
  };
  return (
    <>
      <Titel>{w('Ihre Unterlagen zur betrieblichen Altersversorgung', 'Your company pension documents')}</Titel>
      <p className={`mt-3 ${EINLEITUNG}`}>
        {w('Ihr Berater hat Ihnen diesen Link geschickt und nennt Ihnen den Code dazu getrennt — am Telefon oder per SMS. Mit '
          + 'dem Code öffnen Sie Ihre Unterlagen, lesen sie und unterschreiben auf diesem Gerät.',
          'Your adviser has sent you this link and will give you the code separately — by phone or text message. With the '
          + 'code you open your documents, read them and sign on this device.')}
      </p>
      <form onSubmit={absenden} className="ui-karte mt-6 max-w-md p-5 sm:p-7">
        <label htmlFor="link-code" className="text-sm font-medium text-ui-tinte">Code <span className="font-normal text-ui-schiefer">{w('(6 Ziffern)', '(6 digits)')}</span></label>
        <input
          id="link-code" value={code} onChange={(e) => setCode(codeEingabe(e.target.value))}
          inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={7}
          aria-describedby={meldung ? 'link-code-meldung' : undefined}
          className="ui-feld mt-2 w-full p-3 font-mono text-2xl tracking-[0.3em]"
        />
        {meldung && <p id="link-code-meldung" role="alert" className={`mt-3 ${FEHLER}`}>{meldung}</p>}
        <button type="submit" disabled={!bereit} className={`mt-4 w-full ${KNOPF}`}>
          <Lock className="h-4 w-4" aria-hidden /> {laeuft ? w('Wird geöffnet …', 'Opening …') : w('Unterlagen öffnen', 'Open documents')}
        </button>
      </form>
    </>
  );
}

/** Ein Dokument: Titel, drucken, vergroessern — darunter das Blatt. */
function Dokument({ titel, html, drucken }: { titel: string; html: string; drucken: () => void }) {
  const [gross, setGross] = useState(false);
  const w = useW();
  return (
    <Karte titel={titel} rechts={
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setGross((g) => !g)} className={KNOPF_KLEIN} aria-pressed={gross}>
          {gross ? <Minimize2 className="h-3.5 w-3.5" aria-hidden /> : <Maximize2 className="h-3.5 w-3.5" aria-hidden />}
          {gross ? w('Ganze Seite', 'Whole page') : w('Lesegröße', 'Reading size')}
        </button>
        <button type="button" onClick={drucken} className={KNOPF_KLEIN}>
          <Printer className="h-3.5 w-3.5" aria-hidden /> {w('Drucken oder PDF', 'Print or PDF')}
        </button>
      </div>
    }>
      <Blatt html={html} gross={gross} />
    </Karte>
  );
}

function Kontakt({ berater }: { berater: LinkInhalt['berater'] }) {
  const w = useW();
  if (!berater.name && !berater.telefon && !berater.email) return null;
  return (
    <div className="ui-innen mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-3 text-sm text-ui-tinte">
      <span>{w('Fragen?', 'Questions?')} {berater.name ? <strong className="font-medium">{berater.name}</strong> : w('Ihr Berater', 'Your adviser')}</span>
      {berater.telefon && (
        <a href={`tel:${berater.telefon.replace(/[^\d+]/g, '')}`} className={LINK}>
          <Phone className="h-3.5 w-3.5" aria-hidden /> {berater.telefon}
        </a>
      )}
      {berater.email && (
        <a href={`mailto:${berater.email}`} className={LINK}>
          <Mail className="h-3.5 w-3.5" aria-hidden /> {berater.email}
        </a>
      )}
    </div>
  );
}

function Lesen({ inhalt, token, code, onSperre, onFertig }: {
  inhalt: LinkInhalt; token: string; code: string;
  onSperre: (grund: LinkSperre) => void;
  onFertig: (neu: Unterschrift) => void;
}) {
  const drucken = useDrucken();
  const w = useW();
  const sprache = useSprache();
  const liste = arten(inhalt);
  // Die Pruefsummen aus dem HTML, das hier steht — null: noch nicht gerechnet.
  const [berechnet, setBerechnet] = useState<Partial<Record<UnterlagenArt, string>> | 'abweichend' | null>(null);
  useEffect(() => {
    let aktiv = true;
    void Promise.all(liste.map(async (a) => [a, await pruefsummeVon(inhalt.unterlagen[a] ?? '')] as const)).then((paare) => {
      if (!aktiv) return;
      const passt = paare.every(([a, summe]) => summe !== null && summe === inhalt.pruefsummen[a]);
      setBerechnet(passt ? Object.fromEntries(paare) : 'abweichend');
    });
    return () => { aktiv = false; };
  }, [inhalt]); // eslint-disable-line react-hooks/exhaustive-deps

  const [gelesen, setGelesen] = useState(false);
  const [striche, setStriche] = useState<Strich[]>([]);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const zug = zugAusStrichen(striche, ZUG_BREITE, FELD_HOEHE);
  const bereit = gelesen && typeof berechnet === 'object' && berechnet !== null
    && tinteGenug(striche, ZUG_BREITE) && zugGueltig(zug) && !laeuft;
  const fuer = dokumenteText(dokumenteFuer(inhalt.entscheidung, 'mitarbeiter', inhalt.axa), inhalt.axa, sprache);

  const unterschreiben = async () => {
    if (!bereit || typeof berechnet !== 'object' || berechnet === null) return;
    setLaeuft(true);
    setFehler(null);
    const v = await linkUnterschreiben(token, code, zug, berechnet);
    setLaeuft(false);
    if (v.status === 'ok') {
      onFertig({
        person: 'mitarbeiter', name: v.name, zug, dokumente: v.dokumente, unterschriebenAm: v.unterschriebenAm,
        kanal: 'link', nachweis: null,
      });
    } else if (v.status === 'zug_ungueltig') {
      setFehler(w('Die Unterschrift ließ sich nicht lesen. Bitte unterschreiben Sie noch einmal.', 'The signature could not be read. Please sign again.'));
    } else if (v.status === 'veraendert') {
      setFehler(w('Die Unterlagen passen nicht mehr zur festgeschriebenen Fassung. Bitte wenden Sie sich an Ihren Berater.',
        'The documents no longer match the fixed version. Please contact your adviser.'));
    } else if (v.status === 'fehler' || v.status === 'code_falsch') {
      setFehler(w('Die Unterschrift konnte nicht gespeichert werden. Bitte versuchen Sie es noch einmal.', 'The signature could not be saved. Please try again.'));
    }
    else onSperre(v.status);
  };

  return (
    <>
      <Titel>{w('Ihre Unterlagen zur betrieblichen Altersversorgung', 'Your company pension documents')}</Titel>
      <p className={`mt-3 ${EINLEITUNG}`}>
        {w(`${inhalt.firma} · für ${inhalt.mitarbeiter}. Bitte lesen Sie die Unterlagen in Ruhe; unten unterschreiben Sie mit `
          + `Finger, Stift oder Maus. Der Link gilt bis ${DATUM.format(new Date(inhalt.gueltigBis))}.`,
          `${inhalt.firma} · for ${inhalt.mitarbeiter}. Please take your time to read the documents; below you sign with your `
          + `finger, a pen or the mouse. The link is valid until ${DATUM.format(new Date(inhalt.gueltigBis))}.`)}
      </p>
      {sprache === 'en' && (
        <p className="ui-innen mt-4 px-4 py-3 text-sm leading-relaxed text-ui-tinte">
          <strong className="font-medium">The documents are in German.</strong> They are the binding version of what you
          discussed with your adviser. If anything is unclear, please ask your adviser before you sign.
        </p>
      )}
      <Kontakt berater={inhalt.berater} />

      <div className="mt-6 space-y-6">
        {liste.map((a) => {
          const html = mitUnterschriften(inhalt.unterlagen[a] ?? '', inhalt.unterschriften, a);
          return (
            <Dokument key={a} titel={dokumenteText([a], inhalt.axa, sprache)} html={html}
              drucken={() => drucken(
                <UnterschriebeneUnterlage html={html} erstelltAm={inhalt.festgeschriebenAm}
                  pruefsumme={inhalt.pruefsummen[a] ?? ''} stimmt={berechnet !== 'abweichend'} />,
              )} />
          );
        })}

        <Karte titel={w('Unterschreiben', 'Sign')}>
          <p className="text-sm leading-relaxed text-ui-tinte">
            {w('Ihre Unterschrift gilt für:', 'Your signature applies to:')} <strong className="font-medium">{fuer}</strong>.
          </p>
          {berechnet === 'abweichend' && (
            <p role="alert" className={`mt-4 ${FEHLER}`}>
              {w('Die Unterlagen passen nicht zur festgeschriebenen Fassung. Bitte unterschreiben Sie nicht und wenden Sie sich an '
                + 'Ihren Berater.',
                'The documents do not match the fixed version. Please do not sign and contact your adviser.')}
            </p>
          )}
          <label className="mt-4 flex items-start gap-3 text-sm leading-relaxed text-ui-tinte">
            <input type="checkbox" checked={gelesen} onChange={(e) => setGelesen(e.target.checked)} className="mt-1 h-4 w-4 shrink-0" />
            <span>{w('Ich habe die Unterlagen gelesen und unterschreibe sie in dieser Fassung.', 'I have read the documents and sign them in this version.')}</span>
          </label>
          <p className="mt-4 text-sm text-ui-tinte"><span className="text-ui-schiefer">Name:</span> <strong className="font-medium">{inhalt.mitarbeiter}</strong></p>
          <div className="mt-2">
            <UnterschriftFeld striche={striche} setStriche={setStriche}
              beschriftung={w(`Unterschriftsfeld für ${inhalt.mitarbeiter}: mit Finger, Stift oder Maus unterschreiben`,
                `Signature field for ${inhalt.mitarbeiter}: sign with your finger, a pen or the mouse`)} />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-ui-schiefer">{w('Mit Finger, Stift oder Maus im Feld unterschreiben.', 'Sign in the field with your finger, a pen or the mouse.')}</p>
            <button type="button" onClick={() => setStriche([])} disabled={striche.length === 0 || laeuft} className={KNOPF_ZWEIT}>
              <Eraser className="h-4 w-4" aria-hidden /> {w('Neu', 'Clear')}
            </button>
          </div>
          {fehler && <p role="alert" className={`mt-3 ${FEHLER}`}>{fehler}</p>}
          <button type="button" onClick={() => void unterschreiben()} disabled={!bereit} className={`mt-5 w-full sm:w-auto ${KNOPF}`}>
            <PenLine className="h-4 w-4" aria-hidden /> {laeuft ? w('Wird unterschrieben …', 'Signing …') : w('Unterschreiben', 'Sign')}
          </button>
          <p className="mt-5 text-xs leading-relaxed text-ui-schiefer">
            {w('Einfache elektronische Signatur. Gespeichert werden Ihre Unterschrift als Linienzug und der Zeitpunkt, als '
              + 'Nachweis dazu IP-Adresse und Browser. Ihr Berater bekommt die unterschriebenen Unterlagen.',
              'Simple electronic signature. Your signature is stored as a line drawing together with the time and, as evidence, '
              + 'your IP address and browser. Your adviser receives the signed documents.')}
          </p>
        </Karte>
      </div>
    </>
  );
}

function Fertig({ inhalt, neu }: { inhalt: LinkInhalt; neu: Unterschrift }) {
  const drucken = useDrucken();
  const w = useW();
  const sprache = useSprache();
  const unterschriften = [...inhalt.unterschriften.filter((u) => u.person !== 'mitarbeiter'), neu];
  const knoepfe: ReactNode[] = arten(inhalt).map((a) => {
    const html = mitUnterschriften(inhalt.unterlagen[a] ?? '', unterschriften, a);
    return (
      <button key={a} type="button" className={`${KNOPF} max-w-full text-left`}
        onClick={() => drucken(
          <UnterschriebeneUnterlage html={html} erstelltAm={inhalt.festgeschriebenAm} pruefsumme={inhalt.pruefsummen[a] ?? ''} stimmt />,
        )}>
        <Printer className="h-4 w-4 shrink-0" aria-hidden /> {dokumenteText([a], inhalt.axa, sprache)}
      </button>
    );
  });
  return (
    <>
      <Titel>{w(`Vielen Dank, ${neu.name}`, `Thank you, ${neu.name}`)}</Titel>
      <p className={`mt-3 flex items-start gap-2 ${EINLEITUNG}`}>
        <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-ui-tinte" aria-hidden />
        <span>
          {w(`Sie haben am ${zeitpunktText(neu.unterschriebenAm)} unterschrieben. Ihr Berater bekommt die Unterlagen.`,
            `You signed on ${zeitpunktText(neu.unterschriebenAm, 'en')}. Your adviser receives the documents.`)}
        </span>
      </p>
      <Karte titel={w('Ihre Kopie', 'Your copy')} klasse="mt-6">
        <p className="text-sm leading-relaxed text-ui-tinte">
          {w('Speichern Sie die Unterlagen jetzt als PDF oder drucken Sie sie aus — im Druckfenster „Als PDF speichern“ wählen. '
            + 'Danach öffnet der Link sie nicht mehr.',
            'Save the documents as a PDF now or print them — choose “Save as PDF” in the print dialog. '
            + 'After that the link will no longer open them.')}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">{knoepfe}</div>
      </Karte>
      <Kontakt berater={inhalt.berater} />
      <div className="mt-6 space-y-6">
        {arten(inhalt).map((a) => (
          <Dokument key={a} titel={dokumenteText([a], inhalt.axa, sprache)} html={mitUnterschriften(inhalt.unterlagen[a] ?? '', unterschriften, a)}
            drucken={() => drucken(
              <UnterschriebeneUnterlage html={mitUnterschriften(inhalt.unterlagen[a] ?? '', unterschriften, a)}
                erstelltAm={inhalt.festgeschriebenAm} pruefsumme={inhalt.pruefsummen[a] ?? ''} stimmt />,
            )} />
        ))}
      </div>
    </>
  );
}
