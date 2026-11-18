import { useState, type FormEvent } from 'react';
import { ArrowRight, Plus, Users } from 'lucide-react';
import type { FirmenAngebot } from '@renten/schema';
import { firmaAnlegen, type Firma, type Stand } from '../lib/bav-beratung';
import { kollegenName, type Kollege } from '../lib/bav-gemeinsam';
import { TextFeld } from '../components/Feld';
import { ETIKETT, FEHLER, KNOPF, Karte } from '../components/stil';
import { STATUS_PUNKT } from './bausteine';
import { MODELL_NAME, regelText } from './texte';
import { anzahlText } from './uebersicht-daten';
import { freigabeText } from './gemeinsam-texte';
import type { Ort } from './ort';

/*
 * Die Firmen als Karten und das Formular „Neue Firma“ — fuer die Liste des
 * Beraters und fuer die Firmenkunden einer Agentur.
 */

const LEER: Stand = { offen: 0, teilnahme: 0, verzicht: 0 };

/** Der Stand der Beratungen in einer Zeile: „4 Teilnahmen · 1 Verzicht · 2 offen“ als Punkte mit Text. */
export function StandZeile({ stand, leer = 'Noch keine Beratung' }: { stand: Stand; leer?: string }) {
  return (
    <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {(['teilnahme', 'verzicht', 'offen'] as const).filter((k) => stand[k] > 0).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5 text-ui-tinte">
          <span aria-hidden className={`h-2 w-2 rounded-full ${STATUS_PUNKT[k]}`} />{anzahlText(k, stand[k])}
        </span>
      ))}
      {stand.teilnahme + stand.verzicht + stand.offen === 0 && <span className="text-ui-schiefer">{leer}</span>}
    </span>
  );
}

export function FirmenKarten({ firmen, staende, kollegen = [], gehe, beschriftung = 'Firmen' }: {
  firmen: readonly Firma[];
  staende: Record<string, Stand>;
  /** Die Kollegen im Buero — fuer „Freigegeben von …“ */
  kollegen?: readonly Kollege[];
  gehe: (o: Ort) => void;
  beschriftung?: string;
}) {
  return (
    <ul className="grid grid-cols-1 gap-4 md:grid-cols-2" aria-label={beschriftung}>
      {firmen.map((f) => {
        // Eine Firma einer Agentur ist nicht „freigegeben“: Wer sie sieht, gehoert zur Agentur oder zur Verwaltung.
        const zeile = f.agentur !== null && !f.eigene && f.buero === null
          ? null
          : freigabeText(f.eigene, f.buero !== null, f.eigene ? null : kollegenName([...kollegen], f.besitzer));
        return (
          <li key={f.id}>
            <button
              type="button"
              onClick={() => gehe({ firma: f.id, beratung: null, reiter: 'mitarbeiter' })}
              className="ui-karte group flex h-full w-full items-start gap-3 p-6 text-left transition-colors hover:border-ui-asche"
            >
              <span className="min-w-0 flex-1">
                <span className={`block ${ETIKETT}`}>{MODELL_NAME[f.angebot.modell.art]}</span>
                <span className="mt-1 block break-words text-xl font-medium text-ui-tinte">{f.name}</span>
                <span className="mt-2 block text-sm leading-relaxed text-ui-schiefer">{regelText(f.angebot.modell)}</span>
                {zeile && (
                  <span className="mt-2 flex items-center gap-1.5 text-sm text-ui-schiefer">
                    <Users className="h-3.5 w-3.5 shrink-0" aria-hidden /> {zeile}
                  </span>
                )}
                <span className="mt-4 block"><StandZeile stand={staende[f.id] ?? LEER} /></span>
              </span>
              <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-ui-tinte transition-transform group-hover:translate-x-0.5" aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * „Neue Firma“: nur der Name — alles Weitere steht danach im Angebot der
 * Firma, vorbelegt mit `angebot()` (AXA; in einer Agentur mit deren Daten).
 */
export function NeueFirma({ angebot, agentur = null, inAgentur = false, hinweis, gehe }: {
  /** Das Angebot, mit dem die Firma beginnt — erst beim Anlegen gefragt */
  angebot: () => FirmenAngebot | Promise<FirmenAngebot>;
  /** Die Agentur, in der die bAV-Verwaltung die Firma anlegt */
  agentur?: string | null;
  /** Landet die Firma in einer Agentur? Dann gilt deren Grenze. */
  inAgentur?: boolean;
  hinweis?: string;
  gehe: (o: Ort) => void;
}) {
  const [name, setName] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);

  const anlegen = async (e: FormEvent) => {
    e.preventDefault();
    if (laeuft || name.trim() === '') return;
    setLaeuft(true);
    setMeldung(null);
    const r = await firmaAnlegen(name, await angebot(), agentur);
    setLaeuft(false);
    if (r === 'grenze') {
      setMeldung(agentur || inAgentur ? 'Es sind höchstens 500 Firmen je Agentur möglich.' : 'Es sind höchstens 200 Firmen je Konto möglich.');
    } else if (r === 'fehler') setMeldung('Die Firma konnte nicht angelegt werden. Bitte versuchen Sie es noch einmal.');
    else gehe({ firma: r.id, beratung: null, reiter: 'angebot' });
  };

  return (
    <Karte titel="Neue Firma">
      <form onSubmit={(e) => void anlegen(e)} className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <TextFeld label="Name der Firma" wert={name} onChange={setName} maxLaenge={120} autoComplete="organization" />
        </div>
        <button type="submit" disabled={laeuft || name.trim() === ''} className={KNOPF}>
          <Plus className="h-4 w-4" aria-hidden /> {laeuft ? 'Wird angelegt …' : 'Anlegen'}
        </button>
      </form>
      {hinweis && <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ui-schiefer">{hinweis}</p>}
      {meldung && <p role="alert" className={`mt-2 ${FEHLER}`}>{meldung}</p>}
    </Karte>
  );
}
