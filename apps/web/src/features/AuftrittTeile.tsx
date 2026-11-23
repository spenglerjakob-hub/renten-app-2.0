import { useId, useRef, useState } from 'react';
import { AlertTriangle, Check, ImagePlus, Trash2 } from 'lucide-react';
import { FELD_LABEL, KNOPF_KLEIN } from '../components/stil';
import { logoVorbereiten, type LogoFehler, type VorbereitetesLogo } from '../lib/bild';
import { DRUCKFARBEN_HINWEIS } from '../lib/druckfarben';
import { FARBVORSCHLAEGE, farbeNormal, linieKaumSichtbar, titelTauglich } from './auftritt';

/*
 * Logo und Akzentfarbe eines Auftritts — die beiden Eingaben, die „Ihr
 * Auftritt“ (Rechner, Schnellrechnung) und der Auftritt einer Agentur
 * (Mitarbeiterberatung) gemeinsam haben. Gespeichert wird beim Aufrufer.
 */

const LOGO_FEHLER: Record<LogoFehler, string> = {
  typ: 'Bitte ein Bild als PNG, JPG oder WebP wählen.',
  'zu-gross': 'Das Logo ist zu groß. Bitte eine kleinere Datei wählen.',
  fehler: 'Das Bild ließ sich nicht lesen. Bitte eine andere Datei wählen.',
};

/**
 * Das Logo waehlen oder entfernen. Es wird hier vorbereitet
 * (`logoVorbereiten`): neu gezeichnet, hoechstens 800 Pixel, ohne Metadaten.
 * Hinaus geht nur das Ergebnis.
 */
export function LogoWahl({ logo, onLogo, gesperrt = false, alt = 'Ihr Logo' }: {
  /** Zum Anzeigen: Data- oder Object-URL — null: keines */
  logo: string | null;
  /** Ein neues, vorbereitetes Logo — null: entfernt */
  onLogo: (logo: VorbereitetesLogo | null) => void;
  /** Nur ansehen — wer es festlegt, steht beim Aufrufer */
  gesperrt?: boolean;
  alt?: string;
}) {
  const id = useId();
  const dateiRef = useRef<HTMLInputElement>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [druckfarben, setDruckfarben] = useState(false);
  const [liest, setLiest] = useState(false);

  const logoGewaehlt = async (datei: File | undefined) => {
    if (!datei) return;
    setFehler(null);
    setLiest(true);
    const r = await logoVorbereiten(datei);
    setLiest(false);
    // Dieselbe Datei soll sich gleich noch einmal waehlen lassen.
    if (dateiRef.current) dateiRef.current.value = '';
    if (typeof r === 'string') { setFehler(LOGO_FEHLER[r]); return; }
    setDruckfarben(r.druckfarben);
    onLogo(r);
  };

  return (
    <div>
      <span id={`${id}-logo`} className={FELD_LABEL}>Logo</span>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-16 w-36 shrink-0 items-center justify-center rounded-lg border border-dashed border-ui-feld-rand bg-white p-1">
          {logo
            ? <img src={logo} alt={alt} className="max-h-full max-w-full object-contain" />
            : <span className="text-xs text-ui-schiefer">{gesperrt ? 'Kein Logo' : 'Noch kein Logo'}</span>}
        </div>
        {!gesperrt && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => dateiRef.current?.click()} disabled={liest} className={KNOPF_KLEIN}>
              <ImagePlus className="h-3.5 w-3.5" aria-hidden /> {liest ? 'Wird gelesen …' : logo ? 'Anderes Logo' : 'Logo wählen'}
            </button>
            {logo && (
              <button type="button" onClick={() => { setFehler(null); setDruckfarben(false); onLogo(null); }} className={KNOPF_KLEIN}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden /> Logo entfernen
              </button>
            )}
          </div>
        )}
        <input
          ref={dateiRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-labelledby={`${id}-logo`}
          className="hidden"
          onChange={(e) => void logoGewaehlt(e.target.files?.[0])}
        />
      </div>
      {!gesperrt && (
        <p className="mt-1 text-xs leading-relaxed text-ui-schiefer">
          PNG, JPG oder WebP. Wird im Browser verkleinert. Laden Sie nur ein Logo hoch, das Sie verwenden dürfen.
        </p>
      )}
      {druckfarben && logo && <p className="mt-1 text-xs leading-relaxed text-ui-schiefer">{DRUCKFARBEN_HINWEIS}</p>}
      {fehler && <p role="alert" className="mt-1 text-xs font-medium text-rose-700">{fehler}</p>}
    </div>
  );
}

/**
 * Die Akzentfarbe: Standard, fuenf Vorschlaege oder eine eigene. Sie faerbt
 * Linien und Ueberschriften — nie das, was etwas bedeutet.
 */
export function FarbWahl({ farbe, onFarbe, gesperrt = false, wofuer = 'im Gutachten' }: {
  /** '#rrggbb' — null: die Vorgabe */
  farbe: string | null;
  onFarbe: (farbe: string | null) => void;
  gesperrt?: boolean;
  /** „im Gutachten“ / „auf den Unterlagen“ — wo die Farbe erscheint */
  wofuer?: string;
}) {
  const Wofuer = wofuer.charAt(0).toUpperCase() + wofuer.slice(1);
  return (
    <fieldset disabled={gesperrt}>
      <legend className={FELD_LABEL}>Akzentfarbe</legend>
      <div className={`flex flex-wrap items-center gap-2 ${gesperrt ? 'opacity-60' : ''}`}>
        <button
          type="button"
          aria-pressed={!farbe}
          onClick={() => onFarbe(null)}
          title="Wie bisher: grüne Linie auf dem Deckblatt, Überschriften grau"
          className={`rounded-full border px-3 py-1 text-xs font-medium ${
            !farbe ? 'border-ui-dunkel bg-ui-dunkel text-white' : 'border-ui-zweit-rand bg-white text-ui-tinte hover:bg-ui-innen'
          }`}
        >
          Standard
        </button>
        {FARBVORSCHLAEGE.map((v) => (
          <button
            key={v.farbe}
            type="button"
            aria-pressed={farbe === v.farbe}
            aria-label={v.name}
            title={v.name}
            onClick={() => onFarbe(v.farbe)}
            className={`flex h-7 w-7 items-center justify-center rounded-full border-2 ${
              farbe === v.farbe ? 'border-ui-tinte ring-2 ring-ui-feld-rand' : 'border-white ring-1 ring-ui-feld-rand'
            }`}
            style={{ backgroundColor: v.farbe }}
          >
            {farbe === v.farbe && <Check className="h-4 w-4 text-white" aria-hidden />}
          </button>
        ))}
        <label className="flex items-center gap-1.5 text-xs font-medium text-ui-tinte/80">
          <input
            type="color"
            value={farbe ?? '#0c0a09'}
            onChange={(e) => onFarbe(farbeNormal(e.target.value))}
            className="h-7 w-9 cursor-pointer rounded border border-ui-feld-rand bg-white p-0.5"
          />
          Eigene Farbe
        </label>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-ui-schiefer">
        Für Linien und Überschriften {wofuer}. Die Ergebnisse behalten ihre hellblaue Hervorhebung.
      </p>
      {farbe && !titelTauglich(farbe) && (
        <p role="status" className="mt-1 flex items-start gap-1.5 text-xs text-ui-tinte">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-ui-schiefer" aria-hidden />
          Diese Farbe ist für Überschriften zu hell. {Wofuer} färbt sie nur die Linien; Überschriften bleiben schwarz.
        </p>
      )}
      {linieKaumSichtbar(farbe) && (
        <p className="mt-1 flex items-start gap-1.5 text-xs text-ui-tinte">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-ui-schiefer" aria-hidden />
          Sehr hell — die Linien sind auf weißem Papier kaum zu sehen.
        </p>
      )}
    </fieldset>
  );
}
