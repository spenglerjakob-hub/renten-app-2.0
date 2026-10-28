import { useState } from 'react';
import { ShieldCheck, Users } from 'lucide-react';
import type { Firma } from '../lib/bav-beratung';
import { firmaFreigeben, kollegenName, type Kollege } from '../lib/bav-gemeinsam';
import { aboSichtbar, useZugang, wirksam } from '../store/zugang';
import { Schalter } from '../components/Feld';
import { FEHLER, Hinweis, KNOPF_KLEIN, KNOPF_KLEIN_GEFAHR, KNOPF_ZWEIT, Karte, Vermerk } from '../components/stil';

const TITEL = 'Gemeinsam beraten';

/**
 * „Gemeinsam beraten“ im Reiter „Angebot“. Wer die Firma angelegt hat, gibt
 * sie fuer sein Buero („Abo & Team“) frei oder beendet die Freigabe; ein
 * Kollege sieht, wer sie freigegeben hat und wer mitberaet. Ohne Buero steht
 * hier ein Hinweis auf „Abo & Team“ — solange das nicht zu sehen ist, nichts.
 * Was erlaubt ist, prueft die Datenbank.
 */
export function GemeinsamKarte({ firma, kollegen, onGeaendert }: {
  firma: Firma;
  /** Die Mitglieder des eigenen Bueros, man selbst eingeschlossen */
  kollegen: Kollege[] | 'laedt' | 'fehler';
  /** Nach dem Freigeben oder Beenden: die Firma mit neuem Stand */
  onGeaendert: (f: Firma) => void;
}) {
  const z = useZugang(wirksam);
  const oeffneFenster = useZugang((s) => s.oeffneFenster);
  // Solange die Anfrage laeuft, zeigt der Schalter schon den Zielzustand — bei einem Fehler springt er zurueck.
  const [schwebt, setSchwebt] = useState<boolean | null>(null);
  const [beenden, setBeenden] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const liste = Array.isArray(kollegen) ? kollegen : [];
  const freigegeben = firma.buero !== null;
  const kollegenListe = <KollegenListe kollegen={liste} pflegt={firma.besitzer} buero={z?.bueroName ?? null} />;

  if (!firma.eigene) {
    const von = kollegenName(liste, firma.besitzer);
    return (
      <Karte titel={TITEL}>
        <p className="max-w-3xl text-sm leading-relaxed text-ui-schiefer">
          {von ?? 'Ein Kollege'} hat {firma.name} für Ihr Büro freigegeben: Sie sehen und bearbeiten alle Beratungen der
          Firma.
        </p>
        {liste.length > 0 && kollegenListe}
      </Karte>
    );
  }

  if (!z?.buero) {
    if (!aboSichtbar(z)) return null;
    return (
      <Karte titel={TITEL}>
        <p className="max-w-3xl text-sm leading-relaxed text-ui-schiefer">
          Beraten mehrere Kollegen Ihrer Agentur bei {firma.name}? Mit einem Büro unter „Abo & Team“ — Ihrem Abo mit
          Plätzen für Kollegen — geben Sie die Firma hier für alle frei.
        </p>
        <button type="button" onClick={oeffneFenster} className={`mt-3 ${KNOPF_ZWEIT}`}>
          <Users className="h-4 w-4" aria-hidden /> Abo & Team öffnen
        </button>
      </Karte>
    );
  }

  if (kollegen === 'fehler') {
    return (
      <Karte titel={TITEL}>
        <p className="text-sm text-ui-schiefer">Gemeinsam beraten ist gerade nicht erreichbar. Bitte laden Sie die Seite später neu.</p>
      </Karte>
    );
  }

  const buero = z.buero;
  const laeuft = schwebt !== null;
  const schalten = async (an: boolean) => {
    setSchwebt(an);
    setFehler(null);
    const r = await firmaFreigeben(firma.id, an);
    setSchwebt(null);
    setBeenden(false);
    if (r === 'ok') onGeaendert({ ...firma, buero: an ? buero : null });
    else if (r === 'kein_buero') setFehler('Sie gehören zu keinem Büro mehr. Bitte laden Sie die Seite neu.');
    else setFehler('Das hat nicht geklappt. Bitte versuchen Sie es noch einmal.');
  };

  return (
    <Karte titel={TITEL}>
      <p className="max-w-3xl text-sm leading-relaxed text-ui-schiefer">
        Führen mehrere Kollegen Ihrer Agentur Gespräche bei {firma.name}? Freigegeben sehen und bearbeiten alle Kollegen in
        Ihrem Büro die Beratungen dieser Firma, auch Kollegen, die später dazukommen. Das Angebot pflegen weiter nur Sie.
      </p>
      <fieldset disabled={laeuft} className="m-0 mt-4 min-w-0 border-0 p-0">
        <Schalter label={`Für Ihr Büro${z.bueroName ? ` „${z.bueroName}“` : ''} freigeben`} wert={schwebt ?? (freigegeben && !beenden)}
          onChange={(an) => { if (an) void schalten(true); else setBeenden(true); }} />
      </fieldset>
      {beenden && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="min-w-0 flex-1 basis-64 text-ui-tinte">
            Freigabe beenden? Ihre Kollegen sehen die Firma dann nicht mehr; ihre Beratungen darin gehen an Sie.
          </span>
          <button type="button" disabled={laeuft} onClick={() => void schalten(false)} className={KNOPF_KLEIN_GEFAHR}>Ja, beenden</button>
          <button type="button" disabled={laeuft} onClick={() => setBeenden(false)} className={KNOPF_KLEIN}>Abbrechen</button>
        </div>
      )}
      {freigegeben && liste.length > 0 && kollegenListe}
      <Hinweis symbol={ShieldCheck} klasse="mt-4">
        Freigegeben sehen alle Kollegen im Büro die Angaben aller Mitarbeiter dieser Firma — auch Gehalt, Steuer- und
        Gesundheitsangaben.
      </Hinweis>
      {fehler && <p role="alert" className={`mt-3 ${FEHLER}`}>{fehler}</p>}
    </Karte>
  );
}

/** Wer im Buero mitberaet — mit Agentur, man selbst als „(Sie)“, wer das Angebot pflegt mit Vermerk. */
function KollegenListe({ kollegen, pflegt, buero }: { kollegen: Kollege[]; pflegt: string; buero: string | null }) {
  return (
    <div className="mt-4">
      <p className="text-sm font-medium text-ui-tinte">Im Büro{buero ? ` „${buero}“` : ''}</p>
      <ul className="mt-2 divide-y divide-ui-linie border-y border-ui-linie" aria-label="Kollegen im Büro">
        {kollegen.map((k) => (
          <li key={k.nutzer} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
            <span className="min-w-0 flex-1">
              <span className="break-words text-ui-tinte">
                {k.name || 'Ohne Namen'}{k.ich && <span className="text-ui-schiefer"> (Sie)</span>}
              </span>
              {k.agentur && <span className="block break-words text-xs text-ui-schiefer">{k.agentur}</span>}
            </span>
            {k.nutzer === pflegt && <Vermerk>pflegt das Angebot</Vermerk>}
          </li>
        ))}
      </ul>
    </div>
  );
}
