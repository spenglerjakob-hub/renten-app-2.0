import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { CheckCircle2, FileUp, Loader2, Trash2 } from 'lucide-react';
import { BEZUGSRECHTE, bezugsrechtText, ibanGueltig, type AntragEingang, type AntragFeld } from '@renten/schema';
import { SeitenKopf } from '../components/SeitenKopf';
import { RechtsLinks } from '../components/RechtsLinks';
import { AuswahlFeld, TextFeld } from '../components/Feld';
import { EINLEITUNG, FEHLER, KNOPF, KNOPF_KLEIN, Titel } from '../components/stil';
import { ausweisVorbereiten } from '../lib/bild';
import {
  antragEinreichen, antragLinkPruefen, ausweisHochladen, codeAusAdresse, kundeAusweisEntfernen,
  AUSWEIS_HOECHSTENS, SEITE_TEXT, type AusweisSeite, type LinkLoesung,
} from '../lib/antraege';

/*
 * ANGABEN FÜR DEN ANTRAG — die Seite für den Kunden.
 *
 * Er kommt über den Link seines Beraters (Code im Fragment) und ergänzt,
 * was für den Antrag noch fehlt: Bezugsrecht im Todesfall, Bankverbindung,
 * eine Kopie seines Personalausweises — nur das, wonach gefragt ist. Er
 * sieht keine Angaben seines Beraters und keine Beträge, nur die Art der
 * Lösung und den Anbieter.
 *
 * Nichts davon bleibt im Browser: kein Speicher, kein Zwischenstand. Die
 * Ausweiskopie geht sofort beim Hochladen in den geschützten Speicher —
 * mit dem Wasserzeichen „KOPIE“, das schon der Browser daraufsetzt.
 */

/** Nur die vier Namen — die Rechnung des Rechners (`tuev-berechnung`) braucht diese Seite nicht. */
const ART_TEXT: Record<LinkLoesung['art'], string> = {
  bav: 'Betriebsrente', avd: 'Altersvorsorgedepot', basis: 'Basisrente', privat: 'Private Rente',
};
const loesungName = (l: LinkLoesung) => (l.anbieter ? `${ART_TEXT[l.art]} (${l.anbieter})` : ART_TEXT[l.art]);

type Sperre = 'ohne_link' | 'ungueltig' | 'abgelaufen' | 'eingereicht' | 'fehler';

const SPERRE_TEXT: Record<Sperre, { titel: string; text: string }> = {
  ohne_link: {
    titel: 'Der Link ist unvollständig',
    text: 'Bitte öffnen Sie ihn genau so, wie Sie ihn bekommen haben — am besten direkt aus der Nachricht heraus.',
  },
  ungueltig: {
    titel: 'Dieser Link gilt nicht',
    text: 'Vielleicht ist er unvollständig, oder Ihr Berater hat ihn zurückgezogen. Bitte wenden Sie sich an ihn.',
  },
  abgelaufen: {
    titel: 'Dieser Link ist abgelaufen',
    text: 'Ein Link gilt 30 Tage. Ihr Berater schickt Ihnen gern einen neuen.',
  },
  eingereicht: {
    titel: 'Schon abgesendet',
    text: 'Ihre Angaben sind bereits bei Ihrem Berater. Ändern können Sie sie über ihn.',
  },
  fehler: {
    titel: 'Das hat nicht geklappt',
    text: 'Die Verbindung zum Server ist gerade gestört. Bitte versuchen Sie es gleich noch einmal.',
  },
};

type Zustand =
  | { art: 'pruefen' }
  | { art: 'sperre'; grund: Sperre }
  | { art: 'formular'; offen: AntragFeld[]; bis: string; loesungen: LinkLoesung[] }
  | { art: 'fertig' };

export function Seite() {
  return (
    <div className="min-h-screen bg-ui-flaeche">
      <SeitenKopf breite="max-w-3xl" />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <Inhalt />
        <p className="mt-10 text-center text-xs leading-relaxed text-ui-schiefer">
          Ihre Angaben gehen verschlüsselt und nur an Ihren Berater. Mehr dazu in der{' '}
          <a href="/datenschutz" className="underline underline-offset-2">Datenschutzerklärung</a>.
        </p>
        <RechtsLinks klasse="mt-4 justify-center" />
      </main>
    </div>
  );
}

function Inhalt() {
  const code = useMemo(() => codeAusAdresse(window.location.hash), []);
  const [zustand, setZustand] = useState<Zustand>(code ? { art: 'pruefen' } : { art: 'sperre', grund: 'ohne_link' });

  useEffect(() => {
    if (!code) return;
    void antragLinkPruefen(code).then((p) => {
      if (p.status === 'offen') setZustand({ art: 'formular', offen: p.offen, bis: p.bis, loesungen: p.loesungen });
      else setZustand({ art: 'sperre', grund: p.status });
    });
  }, [code]);

  switch (zustand.art) {
    case 'pruefen':
      return <p className="ui-karte px-4 py-8 text-center text-sm text-ui-schiefer">Der Link wird geprüft …</p>;
    case 'sperre':
      return (
        <>
          <Titel>{SPERRE_TEXT[zustand.grund].titel}</Titel>
          <p className={`mt-3 ${EINLEITUNG}`}>{SPERRE_TEXT[zustand.grund].text}</p>
        </>
      );
    case 'formular':
      return (
        <Formular
          code={code ?? ''} offen={zustand.offen} bis={zustand.bis} loesungen={zustand.loesungen}
          onSperre={(grund) => setZustand({ art: 'sperre', grund })}
          onFertig={() => setZustand({ art: 'fertig' })}
        />
      );
    case 'fertig':
      return (
        <div className="ui-karte p-6 text-center sm:p-10">
          <CheckCircle2 className="mx-auto h-10 w-10 text-ui-tinte" aria-hidden />
          <Titel klasse="mt-4">Vielen Dank</Titel>
          <p className={`mx-auto mt-3 ${EINLEITUNG}`}>
            Ihre Angaben sind bei Ihrem Berater angekommen. In diesem Browser ist nichts davon gespeichert —
            Sie können die Seite schließen.
          </p>
        </div>
      );
  }
}

const datum = (iso: string) => (iso ? new Date(iso).toLocaleDateString('de-DE') : '');

interface Kopie { pfad: string; seite: AusweisSeite }

function Formular({ code, offen, bis, loesungen, onSperre, onFertig }: {
  code: string; offen: AntragFeld[]; bis: string; loesungen: LinkLoesung[];
  onSperre: (grund: Sperre) => void; onFertig: () => void;
}) {
  const fragtBezug = offen.includes('bezugsrecht');
  const fragtBank = offen.includes('bank');
  const fragtAusweis = offen.includes('ausweis');

  const [bezug, setBezug] = useState<Record<string, number>>(() => Object.fromEntries(loesungen.map((l) => [l.id, 1])));
  const [inhaber, setInhaber] = useState('');
  const [iban, setIban] = useState('');
  const [kopien, setKopien] = useState<Kopie[]>([]);
  const [einwilligung, setEinwilligung] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const datei = useRef<HTMLInputElement>(null);
  const [seite, setSeite] = useState<AusweisSeite>('vorne');

  const ibanFehler = iban.trim() && !ibanGueltig(iban) ? 'Die Prüfziffer stimmt nicht — bitte vergleichen Sie die IBAN.' : null;
  const fehlt: string[] = [
    ...(fragtBank && inhaber.trim().length < 2 ? ['den Kontoinhaber'] : []),
    ...(fragtBank && !ibanGueltig(iban) ? ['eine gültige IBAN'] : []),
    ...(fragtAusweis && kopien.length === 0 ? ['die Kopie Ihres Ausweises'] : []),
  ];

  const hochladen = async (d: File) => {
    setLaeuft(true);
    setMeldung(null);
    try {
      const bild = await ausweisVorbereiten(d);
      if (bild === 'unlesbar') {
        setMeldung('Dieses Bild kann Ihr Browser nicht lesen — bitte wählen Sie ein Foto als JPEG oder PNG.');
        return;
      }
      const r = await ausweisHochladen(code, bild, seite);
      if (r === 'ungueltig') setMeldung(`Es sind höchstens ${AUSWEIS_HOECHSTENS} Bilder möglich — oder der Link gilt nicht mehr.`);
      else if (r === 'zu-gross') setMeldung('Das Bild ist zu groß.');
      else if (r === 'typ' || r === 'fehler') setMeldung('Das Hochladen hat nicht geklappt — bitte prüfen Sie die Internetverbindung.');
      else setKopien((k) => [...k, { pfad: r, seite }]);
    } finally {
      setLaeuft(false);
    }
  };

  const entfernen = async (k: Kopie) => {
    setLaeuft(true);
    const ok = await kundeAusweisEntfernen(code, k.pfad);
    setLaeuft(false);
    if (ok) setKopien((x) => x.filter((y) => y.pfad !== k.pfad));
    else setMeldung('Das Bild ließ sich nicht entfernen — bitte versuchen Sie es noch einmal.');
  };

  const absenden = async (e: FormEvent) => {
    e.preventDefault();
    if (!einwilligung || fehlt.length > 0) return;
    setLaeuft(true);
    setMeldung(null);
    const eingang: AntragEingang = {
      ...(fragtBezug ? { bezugsrecht: bezug } : {}),
      ...(fragtBank ? { bank: { inhaber: inhaber.trim(), iban } } : {}),
    };
    const r = await antragEinreichen(code, eingang);
    setLaeuft(false);
    if (r === 'ok') onFertig();
    else if (r === 'ungueltig' || r === 'abgelaufen' || r === 'eingereicht') onSperre(r);
    else if (r === 'ausweis') setMeldung('Bitte laden Sie zuerst die Kopie Ihres Ausweises hoch.');
    else if (r === 'angaben') setMeldung('Bitte prüfen Sie Ihre Angaben — etwas passt noch nicht.');
    else setMeldung(SPERRE_TEXT.fehler.text);
  };

  return (
    <form onSubmit={(e) => void absenden(e)} className="space-y-6">
      <div>
        <Titel>Angaben für Ihren Antrag</Titel>
        <p className={`mt-3 ${EINLEITUNG}`}>
          Ihr Berater bittet um diese Angaben für Ihren Antrag
          {loesungen.length > 0 && <>: <strong className="font-medium text-ui-tinte">{loesungen.map(loesungName).join(', ')}</strong></>}.
          {bis && <> Bitte senden Sie sie bis zum {datum(bis)} ab — einmal, dann gilt der Link nicht mehr.</>}
        </p>
      </div>

      {/* EINWILLIGUNG vor dem ersten Bild und vor dem Absenden. */}
      <label className="ui-innen flex cursor-pointer items-start gap-2.5 p-4 text-xs leading-relaxed text-ui-tinte [&_strong]:font-medium">
        <input type="checkbox" checked={einwilligung} onChange={(e) => setEinwilligung(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Ich willige ein, dass meine Angaben für den Antrag
          {fragtAusweis ? ' und die Kopie meines Personalausweises' : ''} geschützt gespeichert und meinem Berater
          übermittelt werden.{fragtAusweis ? ' Die Kopie versieht mein Browser vor dem Hochladen mit dem Wasserzeichen „KOPIE“.' : ''}{' '}
          Gelöscht wird alles, sobald mein Berater es löscht, <strong>spätestens 90 Tage</strong> nach dem
          Anlegen des Antrags. Widerruf jederzeit bei meinem Berater. Mehr in der{' '}
          <a href="/datenschutz" target="_blank" rel="noopener" className="font-medium underline underline-offset-2">Datenschutzerklärung</a>.
        </span>
      </label>

      {fragtBezug && (
        <section aria-labelledby="bezug-titel" className="ui-karte space-y-4 p-5 sm:p-7">
          <h2 id="bezug-titel" className="text-lg font-medium text-ui-tinte">Bezugsrecht im Todesfall</h2>
          <p className="text-sm leading-relaxed text-ui-schiefer">Wer die Leistung bekommt, wenn Sie vor Rentenbeginn sterben — je Lösung.</p>
          {loesungen.map((l) => (
            <div key={l.id}>
              <AuswahlFeld
                label={loesungName(l)}
                wert={String(bezug[l.id] ?? 1)}
                optionen={BEZUGSRECHTE.map((b) => ({ wert: String(b.wert), text: `${b.wert} – ${b.kurz}` }))}
                onChange={(v) => setBezug((x) => ({ ...x, [l.id]: Number(v) }))}
              />
              <p className="mt-1 text-xs leading-relaxed text-ui-schiefer">{bezugsrechtText(bezug[l.id] ?? 1)}</p>
            </div>
          ))}
        </section>
      )}

      {fragtBank && (
        <section aria-labelledby="bank-titel" className="ui-karte space-y-4 p-5 sm:p-7">
          <h2 id="bank-titel" className="text-lg font-medium text-ui-tinte">Bankverbindung</h2>
          <TextFeld label="Kontoinhaber" wert={inhaber} onChange={setInhaber} maxLaenge={120} autoComplete="name" />
          <div>
            <TextFeld label="IBAN" wert={iban} onChange={setIban} maxLaenge={42} fehler={ibanFehler} />
            {iban.trim() && !ibanFehler && <p className="mt-1 text-xs text-ui-schiefer">Prüfziffer stimmt.</p>}
          </div>
        </section>
      )}

      {fragtAusweis && (
        <section aria-labelledby="ausweis-titel" className="ui-karte p-5 sm:p-7">
          <h2 id="ausweis-titel" className="text-lg font-medium text-ui-tinte">Kopie Ihres Personalausweises</h2>
          <p className="mt-2 text-sm leading-relaxed text-ui-schiefer">
            Vorder- und Rückseite als Foto. Ihr Browser verkleinert jedes Bild und setzt das Wasserzeichen
            „KOPIE“ darauf, bevor es hochgeladen wird.
          </p>
          {kopien.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {kopien.map((k) => (
                <li key={k.pfad} className="flex items-center gap-2 text-sm text-ui-tinte">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-ui-schiefer" aria-hidden />
                  <span className="min-w-0 flex-1">{SEITE_TEXT[k.seite]} hochgeladen</span>
                  <button
                    type="button" onClick={() => void entfernen(k)} disabled={laeuft}
                    className="shrink-0 rounded-full p-2 text-ui-schiefer transition-colors hover:bg-rose-50 hover:text-rose-700"
                    aria-label={`${SEITE_TEXT[k.seite]} entfernen`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <input
            ref={datei} type="file" accept="image/*" className="hidden" aria-hidden tabIndex={-1}
            onChange={(e) => { const d = e.target.files?.[0]; e.target.value = ''; if (d) void hochladen(d); }}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {(['vorne', 'hinten'] as const).map((s) => (
              <button
                key={s} type="button" className={KNOPF_KLEIN}
                disabled={!einwilligung || laeuft || kopien.length >= AUSWEIS_HOECHSTENS}
                onClick={() => { setSeite(s); datei.current?.click(); }}
              >
                {laeuft && seite === s ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <FileUp className="h-3.5 w-3.5" aria-hidden />}
                {SEITE_TEXT[s]} hochladen
              </button>
            ))}
          </div>
          {!einwilligung && <p className="mt-2 text-xs text-ui-schiefer">Erst mit dem Haken oben lassen sich Bilder hochladen.</p>}
        </section>
      )}

      {meldung && <p role="alert" className={FEHLER}>{meldung}</p>}

      <div className="flex flex-col items-start gap-2">
        <button type="submit" className={KNOPF} disabled={laeuft || !einwilligung || fehlt.length > 0}>
          Angaben absenden
        </button>
        {einwilligung && fehlt.length > 0 && (
          <p className="text-xs text-ui-schiefer">Es fehlt noch {fehlt.join(' und ')}.</p>
        )}
      </div>
    </form>
  );
}
