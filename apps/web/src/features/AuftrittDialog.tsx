import { useEffect, useState } from 'react';
import { Save, Trash2 } from 'lucide-react';
import { useAuftritt, type SpeichernErgebnis } from '../store/auftritt';
import { AUFTRITT_LEER, type Auftritt } from './auftritt';
import { AuftrittFormular } from './AuftrittFormular';
import { DeckblattVorschau } from './DeckblattVorschau';
import { FEHLER, Hinweis, KNOPF, KNOPF_KLEIN, KNOPF_KLEIN_GEFAHR } from '../components/stil';

const MELDUNG: Record<SpeichernErgebnis, string> = {
  ok: 'Gespeichert. Ihr nächstes Gutachten trägt Ihren Auftritt.',
  'zu-gross': 'Das Logo ist zu groß. Bitte eine kleinere Datei wählen.',
  typ: 'Dieses Bildformat nimmt der Speicher nicht an. Bitte PNG, JPG oder WebP wählen.',
  fehler: 'Das hat nicht geklappt. Bitte versuchen Sie es noch einmal.',
};

/**
 * Das Fenster „Ihr Auftritt im Gutachten“ im Rechner: Logo, Firma, Name und
 * Kontakt, gespeichert im Konto (`store/auftritt.ts`). Darunter die Vorschau
 * des Deckblatts.
 *
 * Gespeichert wird erst mit „Speichern“ — anders als in der Schnellrechnung,
 * die im Browser bei jeder Aenderung ablegt: Hier geht es auf den Server.
 */
export function AuftrittFenster({ anmeldeAdresse }: { anmeldeAdresse: string | null }) {
  const status = useAuftritt((s) => s.status);
  const gespeichert = useAuftritt((s) => s.auftritt);
  const speichern = useAuftritt((s) => s.speichern);
  const entfernen = useAuftritt((s) => s.entfernen);

  const [entwurf, setEntwurf] = useState<Auftritt>(gespeichert ?? AUFTRITT_LEER);
  // weggelassen = unveraendert, null = entfernen, Blob = neu
  const [neuesLogo, setNeuesLogo] = useState<Blob | null | undefined>(undefined);
  const [geaendert, setGeaendert] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [entfernenFrage, setEntfernenFrage] = useState(false);

  // Kam das Profil erst nach dem Oeffnen an, wird es uebernommen — solange nichts geaendert ist.
  useEffect(() => {
    if (!geaendert) setEntwurf(gespeichert ?? AUFTRITT_LEER);
  }, [gespeichert, geaendert]);

  const aendern = (teil: Partial<Auftritt>) => {
    setEntwurf((e) => ({ ...e, ...teil }));
    setGeaendert(true);
    setMeldung(null);
    setEntfernenFrage(false);
  };

  const sichern = async () => {
    setLaeuft(true);
    // Das Logo geht als Datei (neuesLogo), nicht als Anzeige-URL.
    const { firma, berater, vorname, nachname, telefon, email, web, zusatz, farbe } = entwurf;
    const r = await speichern({ firma, berater, vorname, nachname, telefon, email, web, zusatz, farbe }, neuesLogo);
    setLaeuft(false);
    setMeldung({ ok: r === 'ok', text: MELDUNG[r] });
    if (r === 'ok') { setGeaendert(false); setNeuesLogo(undefined); }
  };

  const wegnehmen = async () => {
    setLaeuft(true);
    const ok = await entfernen();
    setLaeuft(false);
    setEntfernenFrage(false);
    if (ok) {
      setEntwurf(AUFTRITT_LEER);
      setNeuesLogo(undefined);
      setGeaendert(false);
    }
    setMeldung(ok
      ? { ok: true, text: 'Entfernt. Das Gutachten erscheint wieder ohne Logo.' }
      : { ok: false, text: MELDUNG.fehler });
  };

  if (status === 'laedt' && !gespeichert && !geaendert) {
    return <p className="text-sm text-ui-schiefer">Wird geladen …</p>;
  }

  return (
    <div className="space-y-5">
      {status === 'fehler' && (
        <p role="alert" className={FEHLER}>
          Ihr gespeicherter Auftritt ließ sich gerade nicht laden. Was Sie jetzt speichern, ersetzt ihn.
        </p>
      )}

      <AuftrittFormular
        wert={entwurf}
        onAendern={aendern}
        onLogo={(l) => { aendern({ logo: l ? l.dataUrl : null }); setNeuesLogo(l ? l.blob : null); }}
        voll
        anmeldeAdresse={anmeldeAdresse}
      />

      <DeckblattVorschau auftritt={entwurf} />

      <Hinweis>
        <span className="font-medium">Tipp:</span> Schalten Sie im Druckdialog unter „Weitere Einstellungen“ die „Kopf- und
        Fußzeilen“ aus. Die Fußzeile mit Ihrem Namen und der Seitenzahl setzt das Gutachten selbst (Chrome
        und Edge).
      </Hinweis>

      {meldung && (
        <p role="status" className={meldung.ok ? 'ui-innen px-3 py-2 text-sm text-ui-tinte' : FEHLER}>
          {meldung.text}
        </p>
      )}

      {/* Speichern ist die Hauptaktion; Entfernen bleibt klein und fragt nach, das Ja in Rot wie jedes Loeschen. */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ui-linie pt-4">
        <button type="button" onClick={() => void sichern()} disabled={laeuft || !geaendert} className={KNOPF}>
          <Save className="h-4 w-4" aria-hidden /> {laeuft ? 'Wird gespeichert …' : 'Speichern'}
        </button>
        {gespeichert && (
          entfernenFrage ? (
            <span className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-ui-tinte">
              Logo und Angaben löschen?
              <button type="button" onClick={() => void wegnehmen()} disabled={laeuft} className={KNOPF_KLEIN_GEFAHR}>
                Wirklich entfernen
              </button>
              <button type="button" onClick={() => setEntfernenFrage(false)} className={KNOPF_KLEIN}>
                Behalten
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setEntfernenFrage(true)} disabled={laeuft} className={KNOPF_KLEIN}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> Auftritt entfernen
            </button>
          )
        )}
      </div>
    </div>
  );
}
