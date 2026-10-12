import { useRef, useState } from 'react';
import { Camera, FileText, Image as BildSymbol, Loader2, Trash2, Upload } from 'lucide-react';
import {
  dokumentHochladen, dokumentEntfernen, DOKUMENTE_HOECHSTENS, DOKUMENT_MAX_BYTES,
  type DokumentArt, type DokumentEintrag, type HochladenFehler,
} from '../lib/check';
import { bildVorbereiten } from '../lib/bild';

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
  const knopf = 'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40';
  const haupt = `${knopf} bg-indigo-600 text-white hover:bg-indigo-500`;
  const neben = `${knopf} border border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-50`;

  return (
    <div className="mt-3 rounded-lg border-2 border-dashed border-indigo-200 bg-white p-3">
      <p className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
        <Camera className="h-4 w-4 shrink-0 text-indigo-600" aria-hidden /> {titel}
      </p>
      <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
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
          <label className={`mt-2.5 flex cursor-pointer items-start gap-2.5 rounded-md bg-indigo-50 p-2.5 text-xs leading-relaxed text-slate-700 ${
            erinnern ? 'ring-2 ring-amber-400' : ''}`}>
            <input
              ref={haken}
              type="checkbox"
              checked={einwilligung}
              onChange={(e) => onEinwilligung(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600"
            />
            <span>
              Ich willige ein, dass meine Unterlagen beim Hochladen geschützt gespeichert und mit dem Absenden
              meinem Berater zugänglich gemacht werden. Gelöscht werden sie, sobald er sie löscht,
              <strong> spätestens 90 Tage</strong> nach dem Absenden — sende ich nicht ab, mit Ablauf des
              Links. Das schließt Angaben zu Religionszugehörigkeit (Kirchensteuer) und Gesundheit ein, die auf
              Unterlagen stehen können (Art. 9 Abs. 2 lit. a DSGVO). Widerruf jederzeit bei meinem Berater.
              Mehr in der{' '}
              <a href="/datenschutz" target="_blank" rel="noopener" className="font-medium text-indigo-700 underline">
                Datenschutzerklärung
              </a>.
            </span>
          </label>
          {erinnern && (
            <p role="alert" className="mt-1.5 text-xs font-semibold text-amber-800">
              Bitte setzen Sie zuerst den Haken — dann können Sie Dateien wählen.
            </p>
          )}
        </>
      )}

      <div className="mt-2.5 flex flex-wrap gap-2">
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
        <ul className="mt-2.5 space-y-1.5">
          {eigene.map((d) => (
            <li key={d.pfad} className="flex items-center gap-2 rounded-md bg-slate-50 px-2.5 py-1.5">
              {d.typ === 'application/pdf'
                ? <FileText className="h-4 w-4 shrink-0 text-rose-600" aria-hidden />
                : <BildSymbol className="h-4 w-4 shrink-0 text-indigo-600" aria-hidden />}
              <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{d.name}</span>
              <span className="shrink-0 text-xs tabular-nums text-slate-500">{groesse(d.groesse)}</span>
              <button
                type="button"
                onClick={() => void entfernen(d)}
                disabled={entfernt === d.pfad}
                aria-label={`${d.name} entfernen`}
                className="shrink-0 rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
              >
                {entfernt === d.pfad
                  ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  : <Trash2 className="h-4 w-4" aria-hidden />}
              </button>
            </li>
          ))}
          {laeuft.map((x) => (
            <li key={x.id} className="flex items-center gap-2 rounded-md bg-indigo-50 px-2.5 py-1.5 text-sm text-indigo-900">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{x.name}</span>
              <span className="shrink-0 text-xs">wird hochgeladen …</span>
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
        <p className="mt-2 text-xs text-amber-800">
          Es sind {DOKUMENTE_HOECHSTENS} Unterlagen hochgeladen — mehr nimmt ein Check nicht auf.
        </p>
      )}
    </div>
  );
}
