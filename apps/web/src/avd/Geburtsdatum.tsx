import { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { parseDatum, regelaltersrentenbeginn } from '@renten/engine';
import { Dialog } from '../components/Dialog';
import { DatumFeld } from '../components/Feld';

/**
 * Fragt beim Aufruf der Seite zuerst das Geburtsdatum ab.
 *
 * An ihm haengt alles: Rentenbeginn, Laufzeit, Berufseinsteigerbonus. Ohne
 * es rechnet die Seite mit einem Beispieljahrgang, und der Besucher haelt
 * die Zahlen fuer seine eigenen.
 *
 * Das Fenster ist bewusst NICHT wegklickbar. Damit daraus keine Sackgasse
 * wird, gibt es genau eine Bedingung fuer das Weiterkommen, und sie ist
 * sichtbar: ein Datum, das sich lesen laesst. Der Knopf sagt selbst, was
 * fehlt, statt stumm gesperrt zu bleiben.
 */
export function GeburtsdatumDialog({
  offen, onFertig,
}: {
  offen: boolean;
  onFertig: (geburtsdatum: string) => void;
}) {
  const [wert, setWert] = useState('');

  const geburt = parseDatum(wert);
  const jetzt = new Date().getFullYear();
  // Ein Tippfehler wie 1085 soll nicht als Rentenbeginn 1152 durchgehen.
  const plausibel = geburt !== null && geburt.jahr > jetzt - 110 && geburt.jahr <= jetzt;
  const rentenbeginn = plausibel ? regelaltersrentenbeginn(geburt) : null;

  return (
    <Dialog
      offen={offen}
      schliessbar={false}
      titel="Zuerst Ihr Geburtsdatum"
      beschreibung="Daraus ergibt sich, wann Sie in Rente gehen und wie lange Sie noch ansparen können."
      onSchliessen={() => { /* nicht schliessbar — siehe Kommentar oben */ }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (plausibel) onFertig(wert);
        }}
      >
        <DatumFeld
          label="Geburtsdatum"
          wert={wert}
          onChange={setWert}
          hilfe="Acht Ziffern genügen — die Punkte setzt das Feld."
        />

        {rentenbeginn && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-xs leading-relaxed text-indigo-900">
            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              Ihre Regelaltersgrenze liegt im Jahr <strong>{rentenbeginn.jahr}</strong> — bis dahin
              sind es noch {Math.max(0, rentenbeginn.jahr - jetzt)} Jahre.
            </span>
          </p>
        )}

        <button
          type="submit"
          disabled={!plausibel}
          className="mt-4 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {plausibel ? 'Weiter zur Berechnung' : 'Bitte Geburtsdatum eintragen'}
        </button>

        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          Ihre Eingaben bleiben auf Ihrem Gerät. Die Seite rechnet im Browser und schickt nichts
          an uns — auch nicht dieses Datum.
        </p>
      </form>
    </Dialog>
  );
}
