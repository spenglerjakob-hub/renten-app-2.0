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
        className="text-xs text-slate-500 underline-offset-2 hover:text-rose-700 hover:underline">
        Konto löschen …
      </button>
    );
  }

  if (vorschau || laufendesAbo) {
    return (
      <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
        <p>
          {vorschau
            ? 'In der Vorschau lässt sich das Konto nicht löschen — gelöscht würde Ihr echtes Konto.'
            : 'Solange Ihr Abo läuft, lässt sich das Konto nicht löschen — sonst liefe die Abrechnung weiter. '
              + 'Kündigen Sie das Abo zuerst unter „Abo & Team“ → „Abo verwalten“; danach geht es hier weiter.'}
        </p>
        <button type="button" onClick={() => setOffen(false)}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-50">
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
      <label htmlFor="konto-loeschen-bestaetigung" className="block font-bold">
        Zur Bestätigung LÖSCHEN eintippen:
      </label>
      <input
        id="konto-loeschen-bestaetigung" type="text" value={bestaetigung} autoComplete="off"
        onChange={(e) => setBestaetigung(e.target.value)}
        className="w-full rounded-md border border-rose-300 bg-white p-2 text-sm text-slate-900"
      />
      {authMeldung?.art === 'fehler' && <p role="alert">{authMeldung.text}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button"
          disabled={bestaetigung.trim().toUpperCase() !== 'LÖSCHEN' || loeschtKonto}
          onClick={() => void kontoLoeschen()}
          className="flex items-center gap-1.5 rounded-md bg-rose-600 px-3 py-1.5 font-bold text-white hover:bg-rose-500 disabled:opacity-40">
          <Trash2 className="h-3.5 w-3.5" aria-hidden /> Konto endgültig löschen
        </button>
        <button type="button" onClick={() => { setOffen(false); setBestaetigung(''); }}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-50">
          Abbrechen
        </button>
      </div>
    </div>
  );
}
