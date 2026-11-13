import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { CheckCircle2, Eraser, FileCheck2, Link2, Lock, Mail, PenLine, Printer, RefreshCw } from 'lucide-react';
import type { BeratungStatus } from '@renten/schema';
import { Dialog } from '../components/Dialog';
import { TextFeld } from '../components/Feld';
import { LinkFeld } from '../components/LinkFeld';
import {
  linkLaden, linkZurueckziehen, unterlageHtmlLaden, unterschriftenAufheben, type LinkStand, type NeuerLink, type UnterlagenArt,
  type Unterlagen, type Unterschrift, type UnterschriftPerson,
} from '../lib/bav-beratung';
import { LINK_TAGE, LINK_VERSUCHE, unterschriftLink } from '../lib/unterschrift-link';
import { emailGueltig, mailEmpfaenger } from '../lib/email';
import { ETIKETT, KNOPF, KNOPF_GEFAHR, KNOPF_KLEIN, KNOPF_ZWEIT, Karte, LINK } from '../components/stil';
import { useDrucken } from './bausteine';
import { UnterschriebeneUnterlage, mitUnterschriften, pruefsummeVon } from './festschreiben';
import { FELD_HOEHE, UnterschriftBild, UnterschriftFeld } from './UnterschriftFeld';
import {
  ZUG_BREITE, codeText, dokumenteFuer, dokumenteText, nachweisZeilen, tinteGenug, zeitpunktText, zugAusStrichen, zugGueltig,
  type Strich,
} from './unterschrift-daten';

/*
 * UNTERSCHRIFT — einfache elektronische Signatur. Der Mitarbeiter
 * unterschreibt einmal fuer Protokoll und Vereinbarung bzw. Verzicht, der
 * Berater fuer das Protokoll; der Arbeitgeber auf Papier.
 *
 * Am Bildschirm des Beraters — oder der Mitarbeiter per Link auf dem eigenen
 * Geraet: Der Berater schickt ihm den Link und nennt den Code getrennt davon
 * (lib/unterschrift-link.ts, Seite /unterschrift).
 *
 * Mit der ersten Unterschrift — oder dem ersten Link — sind die Unterlagen
 * festgeschrieben und die Beratung gesperrt, bis sie aufgehoben werden.
 */

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

const SYMBOL_KNOPF = 'shrink-0 rounded-full p-2 text-ui-schiefer transition-colors hover:bg-ui-innen hover:text-ui-tinte';

/** Wie der Mitarbeiter zu erreichen ist — aus den Angaben der Beratung. */
export interface Kontakt { email: string; telefon: string }
const KEIN_KONTAKT: Kontakt = { email: '', telefon: '' };

const DATUM = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' });
const datum = (iso: string) => DATUM.format(new Date(iso));

/**
 * Link fuer den Mitarbeiter: erst erklaeren (und festschreiben), dann Link
 * und Code zeigen. Den Token gibt es nur in diesem Moment — die Datenbank
 * kennt nur seine Pruefsumme.
 */
function LinkDialog({ offen, mitarbeiter, kontakt, berater, festgeschrieben, ersetzt, beraterFehlt, onErstellen, onSchliessen }: {
  offen: boolean;
  mitarbeiter: string;
  /** Aus den Angaben: die E-Mail fuer den Empfaenger, das Telefon fuer den Code */
  kontakt: Kontakt;
  /** Fuer den Gruss in der E-Mail */
  berater: string;
  /** Die Unterlagen sind schon festgeschrieben */
  festgeschrieben: boolean;
  /** Ein offener Link wird ersetzt */
  ersetzt: boolean;
  /** Der Berater hat noch nicht unterschrieben */
  beraterFehlt: boolean;
  onErstellen: () => Promise<NeuerLink | string>;
  onSchliessen: () => void;
}) {
  const [neu, setNeu] = useState<NeuerLink | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  useEffect(() => {
    if (!offen) return;
    setNeu(null);
    setFehler(null);
  }, [offen]);

  const erstellen = async () => {
    setLaeuft(true);
    setFehler(null);
    const x = await onErstellen();
    setLaeuft(false);
    if (typeof x === 'string') setFehler(x);
    else setNeu(x);
  };

  const link = neu ? unterschriftLink(neu.token, window.location.origin) : '';
  const mail = () => {
    const text = `Guten Tag ${mitarbeiter},\n\n`
      + 'unter diesem Link finden Sie die Unterlagen aus unserem Gespräch zur betrieblichen Altersversorgung. '
      + 'Sie können sie dort lesen, als PDF speichern und unterschreiben — ein Konto ist nicht nötig.\n\n'
      + `${link}\n\n`
      + `Den Code zum Öffnen nenne ich Ihnen getrennt. Der Link ist bis zum ${neu ? datum(neu.gueltigBis) : ''} gültig.\n\n`
      + `Viele Grüße${berater ? `\n${berater}` : ''}`;
    return `mailto:${mailEmpfaenger(kontakt.email)}?subject=${encodeURIComponent('Ihre Unterlagen zur betrieblichen Altersversorgung')}&body=${encodeURIComponent(text)}`;
  };
  const telefon = kontakt.telefon.trim();

  return (
    <Dialog offen={offen} titel={`Unterschrift per Link · ${mitarbeiter}`} onSchliessen={() => { if (!laeuft) onSchliessen(); }}>
      {!neu ? (
        <div className="space-y-4 text-sm leading-relaxed text-ui-tinte">
          <p>
            {mitarbeiter} bekommt einen Link und unterschreibt auf dem eigenen Telefon oder Computer — ohne Konto. Den Link
            schicken Sie selbst; den Code zum Öffnen nennen Sie getrennt davon, am Telefon oder per SMS.
          </p>
          <ul className="space-y-1 text-ui-schiefer">
            {!festgeschrieben && <li>— Mit dem Link werden die Unterlagen festgeschrieben; die Beratung ist dann gesperrt.</li>}
            {ersetzt && <li>— Der neue Link ersetzt den bisherigen; der alte öffnet dann nichts mehr.</li>}
            <li>— Der Link gilt {LINK_TAGE} Tage. Nach {LINK_VERSUCHE} falschen Codes ist er gesperrt.</li>
          </ul>
          {beraterFehlt && (
            <p className="ui-innen p-3">
              Unterschreiben Sie vorher selbst, dann trägt die Kopie des Mitarbeiters beide Unterschriften.
            </p>
          )}
          {fehler && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-rose-900">{fehler}</p>}
          <div className="flex flex-wrap justify-end gap-2 border-t border-ui-linie pt-4">
            <button type="button" onClick={onSchliessen} disabled={laeuft} className={KNOPF_ZWEIT}>Abbrechen</button>
            <button type="button" onClick={() => void erstellen()} disabled={laeuft} className={KNOPF}>
              <Link2 className="h-4 w-4" aria-hidden /> {laeuft ? 'Wird erstellt …' : 'Link erstellen'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4 text-sm leading-relaxed text-ui-tinte">
          <div>
            <p className="font-medium">Link für {mitarbeiter} — gültig bis {datum(neu.gueltigBis)}:</p>
            <div className="mt-2"><LinkFeld link={link} neu beschriftung={`Link für ${mitarbeiter}`} /></div>
            {/* Eine lange Adresse bricht im Knopf um, statt ueber den Rand des Fensters zu ragen. */}
            <a href={mail()} className={`mt-2 max-w-full ${KNOPF_KLEIN}`}>
              <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="min-w-0 break-all">{emailGueltig(kontakt.email) ? `Per E-Mail an ${kontakt.email.trim()}` : 'Per E-Mail senden'}</span>
            </a>
          </div>
          <div className="ui-innen p-4">
            <p className={ETIKETT}>Code zum Öffnen</p>
            <p className="mt-1 font-mono text-3xl font-medium tracking-wider tabular-nums">{codeText(neu.code)}</p>
            <p className="mt-2 text-ui-schiefer">
              Nennen Sie den Code getrennt vom Link — am Telefon oder per SMS{telefon ? <> an <span className="whitespace-nowrap">{telefon}</span></> : ''}.
              Sie finden ihn auch später in der Karte.
            </p>
          </div>
          <p className="text-xs text-ui-schiefer">
            Den Link selbst sehen Sie nur jetzt. Geht er verloren, erstellen Sie einen neuen.
          </p>
          <div className="flex justify-end border-t border-ui-linie pt-4">
            <button type="button" onClick={onSchliessen} className={KNOPF}>Fertig</button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

/** Der Nachweis einer Unterschrift per Link — als Seite fuer den Druck. */
function NachweisDruck({ u, axa }: { u: Unterschrift; axa: boolean }) {
  return (
    <article className="text-[10pt] leading-snug text-ui-tinte">
      <h1 className="text-[14pt] font-medium">Nachweis der Unterschrift per Link</h1>
      <p className="mt-1 text-ui-schiefer">
        {u.name} · {dokumenteText(u.dokumente, axa)} · elektronisch per Link unterschrieben am {zeitpunktText(u.unterschriebenAm)}
      </p>
      <dl className="mt-4 grid grid-cols-[minmax(0,14rem)_minmax(0,1fr)] gap-x-4 gap-y-1">
        {u.nachweis && nachweisZeilen(u.nachweis, u.unterschriebenAm, axa).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-ui-schiefer">{k}</dt>
            <dd className="break-all">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-[8.5pt] text-ui-schiefer">
        Einfache elektronische Signatur. Den Link hat der Berater an den Mitarbeiter geschickt, den Code getrennt davon
        genannt. Die Zeitpunkte setzt die Datenbank; die Prüfsummen binden die Unterschrift an die festgeschriebene Fassung.
      </p>
    </article>
  );
}

function NachweisDialog({ u, axa, onSchliessen }: { u: Unterschrift; axa: boolean; onSchliessen: () => void }) {
  const drucken = useDrucken();
  return (
    <Dialog offen titel={`Nachweis · ${u.name}`} onSchliessen={onSchliessen}>
      <div className="space-y-4 text-sm text-ui-tinte">
        <p className="leading-relaxed">
          Per Link unterschrieben am {zeitpunktText(u.unterschriebenAm)} — für {dokumenteText(u.dokumente, axa)}.
        </p>
        <dl className="space-y-2">
          {u.nachweis && nachweisZeilen(u.nachweis, u.unterschriebenAm, axa).map(([k, v]) => (
            <div key={k}>
              <dt className={ETIKETT}>{k}</dt>
              <dd className="break-all">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap justify-end gap-2 border-t border-ui-linie pt-4">
          <button type="button" onClick={() => drucken(<NachweisDruck u={u} axa={axa} />)} className={KNOPF_ZWEIT}>
            <Printer className="h-4 w-4" aria-hidden /> Drucken
          </button>
          <button type="button" onClick={onSchliessen} className={KNOPF}>Fertig</button>
        </div>
      </div>
    </Dialog>
  );
}

/** Der Stand eines offenen Links — in der Zeile des Mitarbeiters. */
function LinkZeile({ link }: { link: LinkStand }) {
  const abgelaufen = new Date(link.gueltigBis).getTime() <= Date.now();
  const gesperrt = link.fehlversuche >= LINK_VERSUCHE;
  const stand = gesperrt
    ? `gesperrt nach ${LINK_VERSUCHE} falschen Codes — bitte einen neuen Link erstellen`
    : abgelaufen
      ? 'abgelaufen — bitte einen neuen Link erstellen'
      : [
        link.geoeffnetAm ? `geöffnet am ${zeitpunktText(link.geoeffnetAm)}` : 'noch nicht geöffnet',
        link.fehlversuche > 0 ? `${link.fehlversuche} falsche${link.fehlversuche === 1 ? 'r' : ''} Code${link.fehlversuche === 1 ? '' : 's'}` : '',
      ].filter(Boolean).join(' · ');
  return (
    <p className={`mt-1 text-sm ${gesperrt || abgelaufen ? 'text-rose-700' : 'text-ui-schiefer'}`}>
      <Link2 className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
      Link gültig bis {datum(link.gueltigBis)} · Code <span className="font-mono text-ui-tinte">{codeText(link.code)}</span> · {stand}
    </p>
  );
}

/** Was vor der ersten Unterschrift noch fehlt — mit dem Schritt, in dem es nachzutragen ist. */
/** Was vor dem Unterschreiben fehlt — mit dem Schritt und, wenn genannt, dem Stueck, in dem das Feld steht. */
export interface Luecke { text: string; schritt: number; stueck?: string }

/**
 * Die Karte in Schritt 7: Mitarbeiter und Berater unterschreiben, ihr Stand,
 * der Link fuer den Mitarbeiter und das Aufheben. `onUnterschreiben` und
 * `onLinkErstellen` schreiben die Unterlagen fest, wenn das noch nicht
 * geschehen ist (schritte.tsx kennt die Daten dafuer).
 */
export function UnterschriftenKarte({
  status, unterlagen, unterzeichner, luecken, bereit, geheZu, onUnterschreiben, onLinkErstellen, onAufgehoben, beratungId, axa = false,
  kontakt = KEIN_KONTAKT,
}: {
  status: BeratungStatus;
  /** E-Mail und Telefon des Mitarbeiters aus den Angaben — fuer den Link per E-Mail */
  kontakt?: Kontakt;
  /** An Stelle der Vereinbarung steht der AXA-Antrag — der Berater unterschreibt dort mit. */
  axa?: boolean;
  unterlagen: Unterlagen | null | 'fehler';
  unterzeichner: readonly Unterzeichner[];
  /** Nur vor der ersten Unterschrift von Belang */
  luecken: readonly Luecke[];
  /** Die Rechnung ist auf dem neuesten Stand */
  bereit: boolean;
  geheZu: (i: number, stueck?: string) => void;
  onUnterschreiben: (person: UnterschriftPerson, name: string, zug: string) => Promise<true | string>;
  onLinkErstellen: () => Promise<NeuerLink | string>;
  /** Nach dem Aufheben — und zum Nachladen, ob per Link unterschrieben wurde */
  onAufgehoben: () => Promise<void>;
  beratungId: string;
}) {
  const [dialog, setDialog] = useState<Unterzeichner | null>(null);
  const [linkDialog, setLinkDialog] = useState(false);
  const [nachweis, setNachweis] = useState<Unterschrift | null>(null);
  const [aufheben, setAufheben] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [link, setLink] = useState<LinkStand | null>(null);
  const [laedt, setLaedt] = useState(false);
  const fest = unterlagen && typeof unterlagen === 'object' ? unterlagen : null;
  const mitarbeiterFertig = fest?.unterschriften.some((u) => u.person === 'mitarbeiter') ?? false;

  // Der offene Link — nur, solange der Mitarbeiter noch nicht unterschrieben hat.
  const linkNachladen = useCallback(async () => {
    if (!fest || mitarbeiterFertig) { setLink(null); return; }
    const l = await linkLaden(beratungId);
    setLink(l === 'fehler' ? null : l);
  }, [beratungId, fest, mitarbeiterFertig]);
  useEffect(() => { void linkNachladen(); }, [linkNachladen]);

  const aktualisieren = async () => {
    setLaedt(true);
    await onAufgehoben();
    await linkNachladen();
    setLaedt(false);
  };

  if (status === 'offen') {
    return (
      <Karte titel="Unterschrift">
        <p className="text-sm leading-relaxed text-ui-schiefer">
          Unterschrieben wird nach der Entscheidung. Solange sie offen ist, gibt es die Gesprächsunterlagen zum Mitnehmen.
        </p>
      </Karte>
    );
  }

  const offeneLuecken = fest ? [] : luecken;
  const gesperrt = offeneLuecken.length > 0 || !bereit || unterlagen === 'fehler';
  const mitarbeiter = unterzeichner.find((w) => w.person === 'mitarbeiter');
  const berater = unterzeichner.find((w) => w.person === 'berater');
  const beraterFertig = fest?.unterschriften.some((u) => u.person === 'berater') ?? false;
  const hatUnterschriften = (fest?.unterschriften.length ?? 0) > 0;

  const zeile = (wer: Unterzeichner): ReactNode => {
    const u: Unterschrift | undefined = fest?.unterschriften.find((x) => x.person === wer.person);
    const perLink = wer.person === 'mitarbeiter';
    return (
      <li key={wer.person} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-4">
        <div className="min-w-0">
          <p className="text-base font-medium text-ui-tinte">{wer.rolle}{u ? ` · ${u.name}` : wer.name ? ` · ${wer.name}` : ''}</p>
          <p className={ETIKETT}>für {dokumenteText(dokumenteFuer(status, wer.person, axa), axa)}</p>
          {perLink && !u && link && <LinkZeile link={link} />}
        </div>
        {u ? (
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <UnterschriftBild zug={u.zug} name={u.name} klasse="h-10 max-w-[10rem]" />
            <p className="flex items-center gap-1.5 text-sm text-ui-tinte">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
              {u.kanal === 'link' ? 'per Link unterschrieben' : 'unterschrieben'} am {zeitpunktText(u.unterschriebenAm)}
            </p>
            {u.kanal === 'link' && u.nachweis && (
              <button type="button" onClick={() => setNachweis(u)} className={KNOPF_KLEIN}>
                <FileCheck2 className="h-3.5 w-3.5" aria-hidden /> Nachweis
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {perLink && link && (
              <button type="button" onClick={() => void aktualisieren()} aria-label="Stand aktualisieren" className={SYMBOL_KNOPF}>
                <RefreshCw className={`h-4 w-4 ${laedt ? 'animate-spin' : ''}`} aria-hidden />
              </button>
            )}
            {perLink && link && (
              <button type="button" className={KNOPF_ZWEIT}
                onClick={() => { setMeldung(null); void linkZurueckziehen(beratungId).then((ok) => {
                  if (!ok) setMeldung('Der Link konnte nicht zurückgezogen werden. Bitte versuchen Sie es noch einmal.');
                  void linkNachladen();
                }); }}>
                Zurückziehen
              </button>
            )}
            {perLink && (
              <button type="button" className={KNOPF_ZWEIT} disabled={gesperrt} onClick={() => { setMeldung(null); setLinkDialog(true); }}>
                <Link2 className="h-4 w-4" aria-hidden /> {link ? 'Neuer Link' : 'Per Link'}
              </button>
            )}
            <button type="button" className={KNOPF} disabled={gesperrt} onClick={() => { setMeldung(null); setDialog(wer); }}>
              <PenLine className="h-4 w-4" aria-hidden /> Unterschreiben
            </button>
          </div>
        )}
      </li>
    );
  };

  return (
    <Karte titel="Unterschrift">
      <p className="text-sm leading-relaxed text-ui-schiefer">
        Mitarbeiter und Berater unterschreiben hier mit Finger, Stift oder Maus — der Mitarbeiter auf Wunsch per Link auf
        dem eigenen Gerät. Die Unterschriften stehen dann in den Unterlagen; der Arbeitgeber unterschreibt auf Papier.
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
                — {l.text} <button type="button" onClick={() => geheZu(l.schritt, l.stueck)} className={`${LINK} text-sm`}>zu Schritt {l.schritt + 1} →</button>
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
              etwas geändert werden, {hatUnterschriften
                ? 'heben Sie die Unterschriften auf und lassen neu unterschreiben'
                : 'heben Sie die Festschreibung auf'}{link ? ' — der offene Link öffnet dann nichts mehr' : ''}.
            </span>
          </p>
          <button type="button" onClick={() => setAufheben(true)} className={KNOPF_GEFAHR}>
            {hatUnterschriften ? 'Unterschriften aufheben' : 'Festschreibung aufheben'}
          </button>
        </div>
      )}
      {meldung && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900">{meldung}</p>}

      <p className="mt-5 text-xs leading-relaxed text-ui-schiefer">
        Einfache elektronische Signatur, am Bildschirm wie per Link: geeignet für Protokoll und Erklärungen ohne gesetzliche
        Schriftform. Ob Versicherer oder Unterstützungskasse sie für die Vereinbarung annehmen, klären Sie bitte vorab.
      </p>

      {dialog && (
        <UnterschriftDialog offen wer={dialog} status={status} axa={axa} onSchliessen={() => setDialog(null)}
          onUnterschreiben={async (name, zug) => {
            const x = await onUnterschreiben(dialog.person, name, zug);
            // Unterschreibt der Mitarbeiter doch am Bildschirm, braucht es den Link nicht mehr.
            if (x === true && dialog.person === 'mitarbeiter' && link) {
              await linkZurueckziehen(beratungId);
              setLink(null);
            }
            return x;
          }} />
      )}

      {mitarbeiter && (
        <LinkDialog offen={linkDialog} mitarbeiter={mitarbeiter.name} kontakt={kontakt} berater={berater?.name ?? ''} festgeschrieben={fest !== null}
          ersetzt={link !== null} beraterFehlt={!beraterFertig}
          onErstellen={onLinkErstellen}
          onSchliessen={() => { setLinkDialog(false); void linkNachladen(); }} />
      )}

      {nachweis && <NachweisDialog u={nachweis} axa={axa} onSchliessen={() => setNachweis(null)} />}

      <Dialog offen={aufheben} titel={hatUnterschriften ? 'Unterschriften aufheben?' : 'Festschreibung aufheben?'}
        onSchliessen={() => setAufheben(false)}>
        <p className="text-sm leading-relaxed text-ui-tinte">
          {hatUnterschriften
            ? 'Die Unterschriften und die festgeschriebenen Unterlagen werden gelöscht. Ausgedruckte oder gespeicherte Exemplare '
              + 'bleiben davon unberührt. Danach lässt sich die Beratung wieder ändern; unterschrieben wird neu.'
            : 'Die festgeschriebenen Unterlagen werden gelöscht. Danach lässt sich die Beratung wieder ändern.'}
          {link ? ' Der offene Link öffnet dann nichts mehr.' : ''}
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
