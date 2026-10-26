import { useRef, useState } from 'react';
import { Camera, FileText, Image as BildSymbol, Loader2, Trash2, Upload } from 'lucide-react';
import {
  dokumentHochladen, dokumentEntfernen, DOKUMENTE_HOECHSTENS, DOKUMENT_MAX_BYTES,
  type DokumentArt, type DokumentEintrag, type HochladenFehler,
} from '../lib/check';
import { bildVorbereiten } from '../lib/bild';
import { KNOPF, KNOPF_ZWEIT } from '../components/stil';

/**
 * „Statt abtippen: hochladen" — im Vorsorge-Check unter der Unterlage des
 * Schritts.
 *
 * Wer die Renteninformation vor sich hat, soll die eine Zahl daraus nicht
 * suchen muessen: Ein Foto genuegt, der Berater liest sie ab. Nur mit dem
 * Link des Beraters — ohne ihn gibt es niemanden, der die Unterlage bekaeme.
 *
 * Hochgeladen wird SOFORT, nicht erst beim Absenden: Ein Foto vom Telefon
 * soll nicht verloren gehen, wenn der Kunde den Check erst morgen abschickt.
 * Deshalb die Einwilligung VOR der ersten Datei, nicht erst am Ende. Lesen
 * kann der Berater die Dateien trotzdem erst nach dem Absenden — das regelt
 * die Datenbank.
 */

const groesse = (bytes: number) => (bytes >= 1024 * 1024
  ? `${(bytes / (1024 * 1024)).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`
  : `${Math.max(1, Math.round(bytes / 1024))} KB`);

const FEHLER: Record<HochladenFehler, (name: string) => string> = {
  'zu-gross': (n) => `„${n}“ ist größer als ${DOKUMENT_MAX_BYTES / (1024 * 1024)} MB.`,
  typ: (n) => `„${n}“ ist kein Foto und kein PDF.`,
  ungueltig: () => 'Der Link ist abgelaufen, schon abgesendet, oder es sind bereits '
    + `${DOKUMENTE_HOECHSTENS} Unterlagen hochgeladen.`,
  fehler: (n) => `„${n}“ ließ sich nicht hochladen — bitte prüfen Sie die Internetverbindung.`,
};

export function DokumentHochladen({
  code, art, titel, text, alle, einwilligung, onEinwilligung, onHinzu, onEntfernt,
}: {
  code: string;
  art: DokumentArt;
  titel: string;
  /** Ein Satz, welche Unterlage gemeint ist */
  text?: string;
  /** Alle Unterlagen dieses Checks — die Obergrenze gilt je Anfrage */
  alle: DokumentEintrag[];
  einwilligung: boolean;
  onEinwilligung: (b: boolean) => void;
  onHinzu: (d: DokumentEintrag) => void;
  onEntfernt: (pfad: string) => void;
}) {
  const eigene = alle.filter((d) => d.art === art);
  const frei = Math.max(0, DOKUMENTE_HOECHSTENS - alle.length);
  const [laeuft, setLaeuft] = useState<{ id: number; name: string }[]>([]);
  const [fehler, setFehler] = useState<string[]>([]);
  const [entfernt, setEntfernt] = useState<string | null>(null);
  const eingabe = useRef<HTMLInputElement>(null);
  const kamera = useRef<HTMLInputElement>(null);
  const haken = useRef<HTMLInputElement>(null);
  const zaehler = useRef(0);
  /** Ein Klick auf einen Knopf ohne Haken: Hinweis statt stummer Sperre. */
  const [erinnern, setErinnern] = useState(false);
  /*
    KAMERA-KNOPF nur auf Touch-Geraeten. Chrome auf Android 14/15 bietet im
    Dateidialog teils keine Kamera mehr an — `capture` oeffnet sie direkt.
    Am PC oeffnete `capture` ohnehin nur den Dateidialog.
  */
  const [touch] = useState(() => window.matchMedia?.('(pointer: coarse)').matches === true);

  const hochladen = async (dateien: FileList | null, feld: HTMLInputElement) => {
    if (!dateien || dateien.length === 0) return;
    const liste = Array.from(dateien);
    const moeglich = liste.slice(0, frei);
    const meldungen: string[] = liste.length > moeglich.length
      ? [`Höchstens ${DOKUMENTE_HOECHSTENS} Unterlagen je Check — ${liste.length - moeglich.length} `
        + `Datei${liste.length - moeglich.length > 1 ? 'en wurden' : ' wurde'} nicht hochgeladen.`]
      : [];
    setFehler(meldungen);
    // Nacheinander: Die Obergrenze zaehlt die Datenbank, und die Reihenfolge bleibt erhalten.
    for (const datei of moeglich) {
      const id = (zaehler.current += 1);
      setLaeuft((l) => [...l, { id, name: datei.name }]);
      try {
        const v = await bildVorbereiten(datei);
        const r = await dokumentHochladen(code, v.blob, v.name, art);
        if (typeof r === 'string') setFehler((f) => [...f, FEHLER[r](datei.name)]);
        else onHinzu(r);
      } catch {
        setFehler((f) => [...f, FEHLER.fehler(datei.name)]);
      } finally {
        setLaeuft((l) => l.filter((x) => x.id !== id));
      }
    }
    feld.value = '';
  };

  const entfernen = async (d: DokumentEintrag) => {
    setEntfernt(d.pfad);
    const ok = await dokumentEntfernen(code, d.pfad);
    setEntfernt(null);
    if (ok) onEntfernt(d.pfad);
    else setFehler([`„${d.name}“ ließ sich nicht entfernen — bitte versuchen Sie es noch einmal.`]);
  };

  /** Ohne Einwilligung kein Dateidialog — aber ein Hinweis, wo der Haken fehlt. */
  const waehlen = (feld: HTMLInputElement | null) => {
    if (einwilligung) {
      feld?.click();
      return;
    }
    setErinnern(true);
    haken.current?.focus();
    haken.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  const gesperrt = frei === 0 || laeuft.length > 0;
  const haupt = `${KNOPF} disabled:cursor-not-allowed`;
  const neben = `${KNOPF_ZWEIT} disabled:cursor-not-allowed`;

  /* Die Ablage gestrichelt wie jede Stelle, an der noch etwas hinein soll — ohne Farbe. */
  return (
    <div className="mt-4 rounded-[10px] border border-dashed border-ui-feld-rand p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-ui-tinte">
        <Camera className="h-4 w-4 shrink-0 text-ui-schiefer" aria-hidden /> {titel}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-ui-schiefer">
        {text ?? 'Foto oder PDF, bis 10 MB je Datei.'} Ihr Berater liest die Zahlen ab — die Felder
        können Sie dann leer lassen.
      </p>

      {/*
        EINWILLIGUNG vor der ersten Datei, ausdruecklich auch fuer besondere
        Kategorien (Art. 9 DSGVO): Auf einer Gehaltsabrechnung steht die
        Kirchensteuer, auf einer Beitragsrechnung womoeglich ein
        Risikozuschlag. Einmal je Check — sie gilt fuer alle Schritte.
        Sie steht VOR den Knoepfen: lesen, abhaken, waehlen.
      */}
      {!einwilligung && (
        <>
          <label className={`ui-innen mt-3 flex cursor-pointer items-start gap-2.5 p-3 text-xs leading-relaxed text-ui-tinte [&_strong]:font-medium ${
            erinnern ? 'ring-2 ring-ui-knopf' : ''}`}>
            <input
              ref={haken}
              type="checkbox"
              checked={einwilligung}
              onChange={(e) => onEinwilligung(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span>
              Ich willige ein, dass meine Unterlagen beim Hochladen geschützt gespeichert und mit dem Absenden
              meinem Berater zugänglich gemacht werden. Gelöscht werden sie, sobald er sie löscht,
              <strong> spätestens 90 Tage</strong> nach dem Absenden — sende ich nicht ab, mit Ablauf des
              Links. Das schließt Angaben zu Religionszugehörigkeit (Kirchensteuer) und Gesundheit ein, die auf
              Unterlagen stehen können (Art. 9 Abs. 2 lit. a DSGVO). Widerruf jederzeit bei meinem Berater.
              Mehr in der{' '}
              <a href="/datenschutz" target="_blank" rel="noopener" className="font-medium text-ui-tinte underline underline-offset-2">
                Datenschutzerklärung
              </a>.
            </span>
          </label>
          {erinnern && (
            <p role="alert" className="mt-1.5 text-xs font-medium text-rose-700">
              Bitte setzen Sie zuerst den Haken — dann können Sie Dateien wählen.
            </p>
          )}
        </>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {touch && (
          <button type="button" onClick={() => waehlen(kamera.current)} disabled={gesperrt} className={haupt}>
            <Camera className="h-4 w-4" aria-hidden /> Foto aufnehmen
          </button>
        )}
        <button type="button" onClick={() => waehlen(eingabe.current)} disabled={gesperrt} className={touch ? neben : haupt}>
          <Upload className="h-4 w-4" aria-hidden /> Datei wählen
        </button>
      </div>
      <input
        ref={eingabe}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        aria-label={titel}
        onChange={(e) => void hochladen(e.target.files, e.target)}
      />
      {touch && (
        <input
          ref={kamera}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          aria-label={`${titel}: Foto aufnehmen`}
          onChange={(e) => void hochladen(e.target.files, e.target)}
        />
      )}

      {(eigene.length > 0 || laeuft.length > 0) && (
        <ul className="mt-3 space-y-1.5">
          {eigene.map((d) => (
            <li key={d.pfad} className="ui-innen flex items-center gap-2 px-3 py-1.5">
              {/* Die Art der Datei zeigt das Symbol, nicht eine Farbe. */}
              {d.typ === 'application/pdf'
                ? <FileText className="h-4 w-4 shrink-0 text-ui-schiefer" aria-hidden />
                : <BildSymbol className="h-4 w-4 shrink-0 text-ui-schiefer" aria-hidden />}
              <span className="min-w-0 flex-1 truncate text-sm text-ui-tinte">{d.name}</span>
              <span className="shrink-0 text-xs tabular-nums text-ui-schiefer">{groesse(d.groesse)}</span>
              <button
                type="button"
                onClick={() => void entfernen(d)}
                disabled={entfernt === d.pfad}
                aria-label={`${d.name} entfernen`}
                className="shrink-0 rounded-full p-1.5 text-ui-schiefer hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"
              >
                {entfernt === d.pfad
                  ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  : <Trash2 className="h-4 w-4" aria-hidden />}
              </button>
            </li>
          ))}
          {laeuft.map((x) => (
            <li key={x.id} className="ui-innen flex items-center gap-2 px-3 py-1.5 text-sm text-ui-tinte">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{x.name}</span>
              <span className="shrink-0 text-xs text-ui-schiefer">wird hochgeladen …</span>
            </li>
          ))}
        </ul>
      )}

      {fehler.length > 0 && (
        <div role="alert" className="mt-2 space-y-0.5 rounded-md bg-rose-50 px-2.5 py-1.5 text-xs text-rose-900">
          {fehler.map((f) => <p key={f}>{f}</p>)}
        </div>
      )}

      {einwilligung && frei === 0 && (
        <p className="mt-2 text-xs font-medium text-ui-tinte">
          Es sind {DOKUMENTE_HOECHSTENS} Unterlagen hochgeladen — mehr nimmt ein Check nicht auf.
        </p>
      )}
    </div>
  );
}
