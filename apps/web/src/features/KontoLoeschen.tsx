import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useAuth } from '../store/auth';
import { aboAktiv, useZugang } from '../store/zugang';

/**
 * KONTO LOESCHEN (Art. 17 DSGVO) — im Konto-Fenster und auf der Sperrseite.
 * Endgueltig und ohne Papierkorb, deshalb die Bestaetigung per Eintippen und
 * vorher der Hinweis, die Szenarien als Datei zu sichern (Art. 20).
 *
 * Solange der Inhaber ein Abo hat, das nicht gekuendigt ist, geht es nicht:
 * Die Abrechnung liefe sonst weiter. Mit der Stripe-Anbindung prueft das
 * auch die Edge Function `konto-loeschen`.
 */
export function KontoLoeschen({ sicherung }: { sicherung: string }) {
  const kontoLoeschen = useAuth((s) => s.kontoLoeschen);
  const loeschtKonto = useAuth((s) => s.laedt);
  const authMeldung = useAuth((s) => s.meldung);
  // Der echte Zugang, nie die Vorschau: Geloescht wuerde das echte Konto.
  const zugang = useZugang((s) => s.zugang);
  const vorschau = useZugang((s) => s.vorschau !== null);
  const [offen, setOffen] = useState(false);
  const [bestaetigung, setBestaetigung] = useState('');

  const laufendesAbo = zugang?.rolle === 'inhaber' && zugang.abo !== null
    && aboAktiv(zugang.abo.status) && zugang.abo.kuendigungZum === null;

  if (!offen) {
    return (
      <button type="button" onClick={() => setOffen(true)}
        className="text-xs text-ui-schiefer underline-offset-2 hover:text-rose-700 hover:underline">
        Konto löschen …
      </button>
    );
  }

  if (vorschau || laufendesAbo) {
    return (
      <div className="ui-innen space-y-2 p-3 text-xs leading-relaxed text-ui-tinte">
        <p>
          {vorschau
            ? 'In der Vorschau lässt sich das Konto nicht löschen — gelöscht würde Ihr echtes Konto.'
            : 'Solange Ihr Abo läuft, lässt sich das Konto nicht löschen — sonst liefe die Abrechnung weiter. '
              + 'Kündigen Sie das Abo zuerst unter „Abo & Team“ → „Abo verwalten“; danach geht es hier weiter.'}
        </p>
        <button type="button" onClick={() => setOffen(false)}
          className="rounded-full border border-ui-zweit-rand bg-white px-3 py-1.5 font-medium text-ui-tinte hover:bg-ui-innen">
          Schließen
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs leading-relaxed text-rose-900">
      <p>
        <strong>Konto endgültig löschen.</strong> Gelöscht werden Ihr Konto, alle gespeicherten Szenarien,
        Ihr Auftritt im Gutachten (Logo und Angaben) und alle Vorsorge-Check-Anfragen samt eingegangener
        Kundendaten. Das lässt sich nicht rückgängig
        machen. {sicherung}
        {zugang?.rolle === 'inhaber' && ' Mit Ihrem Konto endet auch Ihr Büro — für alle Mitglieder.'}
      </p>
      <label htmlFor="konto-loeschen-bestaetigung" className="block font-medium">
        Zur Bestätigung LÖSCHEN eintippen:
      </label>
      <input
        id="konto-loeschen-bestaetigung" type="text" value={bestaetigung} autoComplete="off"
        onChange={(e) => setBestaetigung(e.target.value)}
        className="ui-feld w-full border-rose-300 p-2 text-sm"
      />
      {authMeldung?.art === 'fehler' && <p role="alert">{authMeldung.text}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button"
          disabled={bestaetigung.trim().toUpperCase() !== 'LÖSCHEN' || loeschtKonto}
          onClick={() => void kontoLoeschen()}
          className="flex items-center gap-1.5 rounded-full bg-rose-600 px-3 py-1.5 font-medium text-white hover:bg-rose-700 disabled:opacity-40">
          <Trash2 className="h-3.5 w-3.5" aria-hidden /> Konto endgültig löschen
        </button>
        <button type="button" onClick={() => { setOffen(false); setBestaetigung(''); }}
          className="rounded-full border border-ui-zweit-rand bg-white px-3 py-1.5 font-medium text-ui-tinte hover:bg-ui-innen">
          Abbrechen
        </button>
      </div>
    </div>
  );
}
