import { useId, useRef, useState } from 'react';
import { AlertTriangle, Check, ImagePlus, Trash2 } from 'lucide-react';
import { NamenFelder, TextFeld } from '../components/Feld';
import { namensTeile, vollerName } from '../lib/namen';
import { FELD_LABEL, KNOPF_KLEIN } from '../components/stil';
import { logoVorbereiten, type LogoFehler, type VorbereitetesLogo } from '../lib/bild';
import {
  FARBVORSCHLAEGE, GRENZEN, farbeNormal, linieKaumSichtbar, titelTauglich, type Auftritt,
} from './auftritt';

const LOGO_FEHLER: Record<LogoFehler, string> = {
  typ: 'Bitte ein Bild als PNG, JPG oder WebP wählen.',
  'zu-gross': 'Das Logo ist zu groß. Bitte eine kleinere Datei wählen.',
  fehler: 'Das Bild ließ sich nicht lesen. Bitte eine andere Datei wählen.',
};

/**
 * Die Eingaben fuer „Ihr Auftritt im Gutachten“ — in der Schnellrechnung
 * (Logo, Firma, Farbe) und im Fenster des Rechners (`voll`: dazu Name und
 * Kontakt). Gespeichert wird beim Aufrufer.
 *
 * Das Logo wird hier vorbereitet (`logoVorbereiten`): neu gezeichnet,
 * hoechstens 800 Pixel, ohne Metadaten. Hinaus geht nur das Ergebnis.
 */
export function AuftrittFormular({ wert, onAendern, onLogo, voll = false, anmeldeAdresse = null }: {
  wert: Auftritt;
  onAendern: (teil: Partial<Auftritt>) => void;
  /** Ein neues, vorbereitetes Logo — null: entfernt */
  onLogo: (logo: VorbereitetesLogo | null) => void;
  voll?: boolean;
  /** Fuer „Anmelde-Adresse übernehmen“ — vorbelegt wird die E-Mail bewusst nicht */
  anmeldeAdresse?: string | null;
}) {
  const id = useId();
  const dateiRef = useRef<HTMLInputElement>(null);
  const [fehler, setFehler] = useState<string | null>(null);
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
    onLogo(r);
  };

  return (
    <div className="space-y-4">
      {/* ---------- Logo ---------- */}
      <div>
        <span id={`${id}-logo`} className={FELD_LABEL}>Logo</span>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-16 w-36 shrink-0 items-center justify-center rounded-lg border border-dashed border-ui-feld-rand bg-white p-1">
            {wert.logo
              ? <img src={wert.logo} alt="Ihr Logo" className="max-h-full max-w-full object-contain" />
              : <span className="text-xs text-ui-schiefer">Noch kein Logo</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => dateiRef.current?.click()} disabled={liest} className={KNOPF_KLEIN}>
              <ImagePlus className="h-3.5 w-3.5" aria-hidden /> {liest ? 'Wird gelesen …' : wert.logo ? 'Anderes Logo' : 'Logo wählen'}
            </button>
            {wert.logo && (
              <button type="button" onClick={() => { setFehler(null); onLogo(null); }} className={KNOPF_KLEIN}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden /> Logo entfernen
              </button>
            )}
          </div>
          <input
            ref={dateiRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-labelledby={`${id}-logo`}
            className="hidden"
            onChange={(e) => void logoGewaehlt(e.target.files?.[0])}
          />
        </div>
        <p className="mt-1 text-xs leading-relaxed text-ui-schiefer">
          PNG, JPG oder WebP. Wird im Browser verkleinert. Laden Sie nur ein Logo hoch, das Sie verwenden dürfen.
        </p>
        {fehler && <p role="alert" className="mt-1 text-xs font-medium text-rose-700">{fehler}</p>}
      </div>

      {/* ---------- Firma, Name, Kontakt ---------- */}
      <TextFeld
        label="Firmenname" wert={wert.firma} onChange={(s) => onAendern({ firma: s })}
        maxLaenge={GRENZEN.firma} autoComplete="organization" platzhalter="z. B. Muster Finanz GmbH"
      />
      {voll && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {/* Vor- und Nachname getrennt; der ganze Name (`berater`) steht im Briefkopf und wird mitgeschrieben. */}
            <NamenFelder {...namensTeile(wert.berater, wert.vorname, wert.nachname)} beschriftung={['Ihr Vorname', 'Ihr Nachname']}
              onChange={(teile) => onAendern({ ...teile, berater: vollerName(teile) })} eigener />
            <TextFeld
              label="Telefon" typ="tel" wert={wert.telefon} onChange={(s) => onAendern({ telefon: s })}
              maxLaenge={GRENZEN.telefon} autoComplete="tel"
            />
            <div>
              <TextFeld
                label="E-Mail" typ="email" wert={wert.email} onChange={(s) => onAendern({ email: s })}
                maxLaenge={GRENZEN.email} autoComplete="email"
              />
              {anmeldeAdresse && wert.email.trim() !== anmeldeAdresse && (
                <button
                  type="button"
                  onClick={() => onAendern({ email: anmeldeAdresse })}
                  className="mt-1 text-xs font-medium text-ui-tinte underline-offset-4 hover:underline"
                >
                  Anmelde-Adresse übernehmen
                </button>
              )}
            </div>
            <TextFeld
              label="Website" wert={wert.web} onChange={(s) => onAendern({ web: s })}
              maxLaenge={GRENZEN.web} autoComplete="url" platzhalter="z. B. www.muster-finanz.de"
            />
          </div>
          <TextFeld
            label="Zusatzzeile (optional)" wert={wert.zusatz} onChange={(s) => onAendern({ zusatz: s })}
            maxLaenge={GRENZEN.zusatz}
            platzhalter="z. B. Versicherungsmakler mit Erlaubnis nach § 34d Abs. 1 GewO, Reg.-Nr. D-…"
          />
        </>
      )}

      {/* ---------- Akzentfarbe ---------- */}
      <fieldset>
        <legend className={FELD_LABEL}>Akzentfarbe</legend>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={!wert.farbe}
            onClick={() => onAendern({ farbe: null })}
            title="Wie bisher: grüne Linie auf dem Deckblatt, Überschriften grau"
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              !wert.farbe ? 'border-ui-dunkel bg-ui-dunkel text-white' : 'border-ui-zweit-rand bg-white text-ui-tinte hover:bg-ui-innen'
            }`}
          >
            Standard
          </button>
          {FARBVORSCHLAEGE.map((v) => (
            <button
              key={v.farbe}
              type="button"
              aria-pressed={wert.farbe === v.farbe}
              aria-label={v.name}
              title={v.name}
              onClick={() => onAendern({ farbe: v.farbe })}
              className={`flex h-7 w-7 items-center justify-center rounded-full border-2 ${
                wert.farbe === v.farbe ? 'border-ui-tinte ring-2 ring-ui-feld-rand' : 'border-white ring-1 ring-ui-feld-rand'
              }`}
              style={{ backgroundColor: v.farbe }}
            >
              {wert.farbe === v.farbe && <Check className="h-4 w-4 text-white" aria-hidden />}
            </button>
          ))}
          <label className="flex items-center gap-1.5 text-xs font-medium text-ui-tinte/80">
            <input
              type="color"
              value={wert.farbe ?? '#0c0a09'}
              onChange={(e) => onAendern({ farbe: farbeNormal(e.target.value) })}
              className="h-7 w-9 cursor-pointer rounded border border-ui-feld-rand bg-white p-0.5"
            />
            Eigene Farbe
          </label>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-ui-schiefer">
          Für Linien und Überschriften im Gutachten. Die Ergebnisse behalten ihre hellblaue Hervorhebung.
        </p>
        {wert.farbe && !titelTauglich(wert.farbe) && (
          <p role="status" className="mt-1 flex items-start gap-1.5 text-xs text-ui-tinte">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-ui-schiefer" aria-hidden />
            Diese Farbe ist für Überschriften zu hell. Im Gutachten färbt sie nur die Linien; Überschriften bleiben schwarz.
          </p>
        )}
        {linieKaumSichtbar(wert.farbe) && (
          <p className="mt-1 flex items-start gap-1.5 text-xs text-ui-tinte">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-ui-schiefer" aria-hidden />
            Sehr hell — die Linien sind auf weißem Papier kaum zu sehen.
          </p>
        )}
      </fieldset>
    </div>
  );
}
