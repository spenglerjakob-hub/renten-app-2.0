import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { CheckCircle2, Eraser, Lock, Mail, Maximize2, Minimize2, PenLine, Phone, Printer } from 'lucide-react';
import { SeitenKopf } from '../components/SeitenKopf';
import { RechtsLinks } from '../components/RechtsLinks';
import { DruckBereich, useDrucken } from '../components/Druck';
import { EINLEITUNG, FEHLER, KNOPF, KNOPF_KLEIN, KNOPF_ZWEIT, Karte, LINK, Titel } from '../components/stil';
import type { UnterlagenArt, Unterschrift } from '../lib/bav-beratung';
import {
  LINK_CODE, codeEingabe, linkOeffnen, linkUnterschreiben, tokenAusAdresse, type LinkInhalt, type LinkSperre,
} from '../lib/unterschrift-link';
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
 */

type Zustand =
  | { art: 'code'; meldung: string | null; laeuft: boolean }
  | { art: 'sperre'; grund: LinkSperre | 'ohne_link' }
  | { art: 'lesen'; inhalt: LinkInhalt; code: string }
  | { art: 'fertig'; inhalt: LinkInhalt; neu: Unterschrift };

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
  return (
    <DruckBereich>
      <div className="min-h-screen bg-ui-flaeche">
        <SeitenKopf breite="max-w-3xl" />
        <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
          <Inhalt />
          <p className="mt-10 text-center text-xs leading-relaxed text-ui-schiefer">
            Ihre Unterlagen kommen verschlüsselt und nur mit dem Code Ihres Beraters. Mehr dazu in der{' '}
            <a href="/datenschutz" className="underline underline-offset-2">Datenschutzerklärung</a>.
          </p>
          <RechtsLinks klasse="mt-4 justify-center" />
        </main>
      </div>
    </DruckBereich>
  );
}

function Inhalt() {
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
        meldung: `Der Code stimmt nicht. Noch ${v.rest} ${v.rest === 1 ? 'Versuch' : 'Versuche'} — danach ist der Link gesperrt.`,
      });
    } else if (v.status === 'fehler') setZustand({ art: 'code', laeuft: false, meldung: SPERRE_TEXT.fehler.text });
    else setZustand({ art: 'sperre', grund: v.status });
  };

  switch (zustand.art) {
    case 'code':
      return <CodeEingabe meldung={zustand.meldung} laeuft={zustand.laeuft} onCode={(c) => void oeffnen(c)} />;
    case 'sperre':
      return (
        <>
          <Titel>{SPERRE_TEXT[zustand.grund].titel}</Titel>
          <p className={`mt-3 ${EINLEITUNG}`}>{SPERRE_TEXT[zustand.grund].text}</p>
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
  const [code, setCode] = useState('');
  const bereit = LINK_CODE.test(code) && !laeuft;
  const absenden = (e: FormEvent) => {
    e.preventDefault();
    if (bereit) onCode(code);
  };
  return (
    <>
      <Titel>Ihre Unterlagen zur betrieblichen Altersversorgung</Titel>
      <p className={`mt-3 ${EINLEITUNG}`}>
        Ihr Berater hat Ihnen diesen Link geschickt und nennt Ihnen den Code dazu getrennt — am Telefon oder per SMS. Mit
        dem Code öffnen Sie Ihre Unterlagen, lesen sie und unterschreiben auf diesem Gerät.
      </p>
      <form onSubmit={absenden} className="ui-karte mt-6 max-w-md p-5 sm:p-7">
        <label htmlFor="link-code" className="text-sm font-medium text-ui-tinte">Code <span className="font-normal text-ui-schiefer">(6 Ziffern)</span></label>
        <input
          id="link-code" value={code} onChange={(e) => setCode(codeEingabe(e.target.value))}
          inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={7}
          aria-describedby={meldung ? 'link-code-meldung' : undefined}
          className="ui-feld mt-2 w-full p-3 font-mono text-2xl tracking-[0.3em]"
        />
        {meldung && <p id="link-code-meldung" role="alert" className={`mt-3 ${FEHLER}`}>{meldung}</p>}
        <button type="submit" disabled={!bereit} className={`mt-4 w-full ${KNOPF}`}>
          <Lock className="h-4 w-4" aria-hidden /> {laeuft ? 'Wird geöffnet …' : 'Unterlagen öffnen'}
        </button>
      </form>
    </>
  );
}

/** Ein Dokument: Titel, drucken, vergroessern — darunter das Blatt. */
function Dokument({ titel, html, drucken }: { titel: string; html: string; drucken: () => void }) {
  const [gross, setGross] = useState(false);
  return (
    <Karte titel={titel} rechts={
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setGross((g) => !g)} className={KNOPF_KLEIN} aria-pressed={gross}>
          {gross ? <Minimize2 className="h-3.5 w-3.5" aria-hidden /> : <Maximize2 className="h-3.5 w-3.5" aria-hidden />}
          {gross ? 'Ganze Seite' : 'Lesegröße'}
        </button>
        <button type="button" onClick={drucken} className={KNOPF_KLEIN}>
          <Printer className="h-3.5 w-3.5" aria-hidden /> Drucken oder PDF
        </button>
      </div>
    }>
      <Blatt html={html} gross={gross} />
    </Karte>
  );
}

function Kontakt({ berater }: { berater: LinkInhalt['berater'] }) {
  if (!berater.name && !berater.telefon && !berater.email) return null;
  return (
    <div className="ui-innen mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-3 text-sm text-ui-tinte">
      <span>Fragen? {berater.name ? <strong className="font-medium">{berater.name}</strong> : 'Ihr Berater'}</span>
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
  const fuer = dokumenteText(dokumenteFuer(inhalt.entscheidung, 'mitarbeiter', inhalt.axa), inhalt.axa);

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
    } else if (v.status === 'zug_ungueltig') setFehler('Die Unterschrift ließ sich nicht lesen. Bitte unterschreiben Sie noch einmal.');
    else if (v.status === 'veraendert') setFehler('Die Unterlagen passen nicht mehr zur festgeschriebenen Fassung. Bitte wenden Sie sich an Ihren Berater.');
    else if (v.status === 'fehler' || v.status === 'code_falsch') setFehler('Die Unterschrift konnte nicht gespeichert werden. Bitte versuchen Sie es noch einmal.');
    else onSperre(v.status);
  };

  return (
    <>
      <Titel>Ihre Unterlagen zur betrieblichen Altersversorgung</Titel>
      <p className={`mt-3 ${EINLEITUNG}`}>
        {inhalt.firma} · für {inhalt.mitarbeiter}. Bitte lesen Sie die Unterlagen in Ruhe; unten unterschreiben Sie mit
        Finger, Stift oder Maus. Der Link gilt bis {DATUM.format(new Date(inhalt.gueltigBis))}.
      </p>
      <Kontakt berater={inhalt.berater} />

      <div className="mt-6 space-y-6">
        {liste.map((a) => {
          const html = mitUnterschriften(inhalt.unterlagen[a] ?? '', inhalt.unterschriften, a);
          return (
            <Dokument key={a} titel={dokumenteText([a], inhalt.axa)} html={html}
              drucken={() => drucken(
                <UnterschriebeneUnterlage html={html} erstelltAm={inhalt.festgeschriebenAm}
                  pruefsumme={inhalt.pruefsummen[a] ?? ''} stimmt={berechnet !== 'abweichend'} />,
              )} />
          );
        })}

        <Karte titel="Unterschreiben">
          <p className="text-sm leading-relaxed text-ui-tinte">
            Ihre Unterschrift gilt für: <strong className="font-medium">{fuer}</strong>.
          </p>
          {berechnet === 'abweichend' && (
            <p role="alert" className={`mt-4 ${FEHLER}`}>
              Die Unterlagen passen nicht zur festgeschriebenen Fassung. Bitte unterschreiben Sie nicht und wenden Sie sich an
              Ihren Berater.
            </p>
          )}
          <label className="mt-4 flex items-start gap-3 text-sm leading-relaxed text-ui-tinte">
            <input type="checkbox" checked={gelesen} onChange={(e) => setGelesen(e.target.checked)} className="mt-1 h-4 w-4 shrink-0" />
            <span>Ich habe die Unterlagen gelesen und unterschreibe sie in dieser Fassung.</span>
          </label>
          <p className="mt-4 text-sm text-ui-tinte"><span className="text-ui-schiefer">Name:</span> <strong className="font-medium">{inhalt.mitarbeiter}</strong></p>
          <div className="mt-2">
            <UnterschriftFeld striche={striche} setStriche={setStriche}
              beschriftung={`Unterschriftsfeld für ${inhalt.mitarbeiter}: mit Finger, Stift oder Maus unterschreiben`} />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-ui-schiefer">Mit Finger, Stift oder Maus im Feld unterschreiben.</p>
            <button type="button" onClick={() => setStriche([])} disabled={striche.length === 0 || laeuft} className={KNOPF_ZWEIT}>
              <Eraser className="h-4 w-4" aria-hidden /> Neu
            </button>
          </div>
          {fehler && <p role="alert" className={`mt-3 ${FEHLER}`}>{fehler}</p>}
          <button type="button" onClick={() => void unterschreiben()} disabled={!bereit} className={`mt-5 w-full sm:w-auto ${KNOPF}`}>
            <PenLine className="h-4 w-4" aria-hidden /> {laeuft ? 'Wird unterschrieben …' : 'Unterschreiben'}
          </button>
          <p className="mt-5 text-xs leading-relaxed text-ui-schiefer">
            Einfache elektronische Signatur. Gespeichert werden Ihre Unterschrift als Linienzug und der Zeitpunkt, als
            Nachweis dazu IP-Adresse und Browser. Ihr Berater bekommt die unterschriebenen Unterlagen.
          </p>
        </Karte>
      </div>
    </>
  );
}

function Fertig({ inhalt, neu }: { inhalt: LinkInhalt; neu: Unterschrift }) {
  const drucken = useDrucken();
  const unterschriften = [...inhalt.unterschriften.filter((u) => u.person !== 'mitarbeiter'), neu];
  const knoepfe: ReactNode[] = arten(inhalt).map((a) => {
    const html = mitUnterschriften(inhalt.unterlagen[a] ?? '', unterschriften, a);
    return (
      <button key={a} type="button" className={`${KNOPF} max-w-full text-left`}
        onClick={() => drucken(
          <UnterschriebeneUnterlage html={html} erstelltAm={inhalt.festgeschriebenAm} pruefsumme={inhalt.pruefsummen[a] ?? ''} stimmt />,
        )}>
        <Printer className="h-4 w-4 shrink-0" aria-hidden /> {dokumenteText([a], inhalt.axa)}
      </button>
    );
  });
  return (
    <>
      <Titel>Vielen Dank, {neu.name}</Titel>
      <p className={`mt-3 flex items-start gap-2 ${EINLEITUNG}`}>
        <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-ui-tinte" aria-hidden />
        <span>Sie haben am {zeitpunktText(neu.unterschriebenAm)} unterschrieben. Ihr Berater bekommt die Unterlagen.</span>
      </p>
      <Karte titel="Ihre Kopie" klasse="mt-6">
        <p className="text-sm leading-relaxed text-ui-tinte">
          Speichern Sie die Unterlagen jetzt als PDF oder drucken Sie sie aus — im Druckfenster „Als PDF speichern“ wählen.
          Danach öffnet der Link sie nicht mehr.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">{knoepfe}</div>
      </Karte>
      <Kontakt berater={inhalt.berater} />
      <div className="mt-6 space-y-6">
        {arten(inhalt).map((a) => (
          <Dokument key={a} titel={dokumenteText([a], inhalt.axa)} html={mitUnterschriften(inhalt.unterlagen[a] ?? '', unterschriften, a)}
            drucken={() => drucken(
              <UnterschriebeneUnterlage html={mitUnterschriften(inhalt.unterlagen[a] ?? '', unterschriften, a)}
                erstelltAm={inhalt.festgeschriebenAm} pruefsumme={inhalt.pruefsummen[a] ?? ''} stimmt />,
            )} />
        ))}
      </div>
    </>
  );
}
