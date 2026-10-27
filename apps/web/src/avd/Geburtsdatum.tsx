import { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { parseDatum, regelaltersrentenbeginn } from '@renten/engine';
import { Dialog } from '../components/Dialog';
import { DatumFeld } from '../components/Feld';
import { Hinweis, KNOPF } from '../components/stil';

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
          <Hinweis symbol={CalendarClock} klasse="mt-4">
            Ihre Regelaltersgrenze liegt im Jahr <span className="font-medium">{rentenbeginn.jahr}</span> — bis dahin
            sind es noch {Math.max(0, rentenbeginn.jahr - jetzt)} Jahre.
          </Hinweis>
        )}

        <button
          type="submit"
          disabled={!plausibel}
          className={`mt-5 w-full ${KNOPF} disabled:cursor-not-allowed`}
        >
          {plausibel ? 'Weiter zur Berechnung' : 'Bitte Geburtsdatum eintragen'}
        </button>

        <p className="mt-3 text-xs leading-relaxed text-ui-schiefer">
          Ihre Eingaben bleiben auf Ihrem Gerät. Die Seite rechnet im Browser und schickt nichts
          an uns — auch nicht dieses Datum.
        </p>
      </form>
    </Dialog>
  );
}
