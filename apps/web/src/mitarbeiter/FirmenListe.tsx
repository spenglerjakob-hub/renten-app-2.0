import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, Building2, Plus } from 'lucide-react';
import { agenturDatenSchema, neuesAngebot } from '@renten/schema';
import { firmenLaden, staendeLaden, type Firma, type Stand } from '../lib/bav-beratung';
import {
  agenturAnlegen, agenturenLaden, agenturenStandLaden, meineAgentur, type Agentur, type AgenturStand,
} from '../lib/bav-agenturen';
import { kollegenLaden, type Kollege } from '../lib/bav-gemeinsam';
import { useZugang } from '../store/zugang';
import { TextFeld } from '../components/Feld';
import { EINLEITUNG, ETIKETT, FEHLER, FELD, FELD_LABEL, KNOPF, Karte, Titel } from '../components/stil';
import { agenturKurz, agenturStandText, agenturZeilen, type Sortierung } from './agentur-texte';
import { agenturMerken } from './agentur-hook';
import { FirmenKarten, NeueFirma, StandZeile } from './firmen-karten';
import type { Ort } from './ort';

const SORTIERUNGEN: { wert: Sortierung; text: string }[] = [
  { wert: 'name', text: 'Name' },
  { wert: 'firmen', text: 'Meiste Firmen' },
  { wert: 'geaendert', text: 'Zuletzt geändert' },
];

/**
 * Einstieg der Seite. Drei Sichten, je nach Konto:
 *
 * - DIE bAV-VERWALTUNG sieht zuerst ihre Agenturen — sortierbar, mit Firmen,
 *   Beratungen und Zugaengen —, darunter die Firmen ohne Agentur.
 * - EIN ZUGANG EINER AGENTUR sieht die Firmenkunden seiner Agentur; was er
 *   anlegt, gehoert zu ihr und beginnt mit ihren Vorgaben.
 * - ALLE ANDEREN sehen ihre Firmen und die, die Kollegen fuer ihr Buero
 *   freigegeben haben — wie bisher.
 *
 * Gibt es die Agenturen in der Datenbank noch nicht, gilt fuer alle die
 * dritte Sicht.
 */
export function FirmenListe({ gehe }: { gehe: (o: Ort) => void }) {
  const zugang = useZugang((s) => s.zugang);
  const [firmen, setFirmen] = useState<Firma[] | 'laedt' | 'fehler'>('laedt');
  const [staende, setStaende] = useState<Record<string, Stand>>({});
  // Die Kollegen im Buero — fehlt der Stand, entfallen nur die Namen.
  const [kollegen, setKollegen] = useState<Kollege[]>([]);
  // Ohne Agenturen (oder ohne die Tabelle): leer — dann ist alles wie bisher.
  const [agenturen, setAgenturen] = useState<Agentur[]>([]);
  const [zugaenge, setZugaenge] = useState<Record<string, AgenturStand>>({});
  const [sortierung, setSortierung] = useState<Sortierung>('name');
  const verwaltet = zugang?.verwalter === true;

  useEffect(() => {
    let aktiv = true;
    void Promise.all([
      firmenLaden(), staendeLaden(), kollegenLaden(), agenturenLaden(), verwaltet ? agenturenStandLaden() : Promise.resolve({}),
    ]).then(([f, s, k, a, z]) => {
      if (!aktiv) return;
      setFirmen(f);
      if (s !== 'fehler') setStaende(s);
      if (k !== 'fehler') setKollegen(k);
      if (Array.isArray(a)) { setAgenturen(a); a.forEach(agenturMerken); }
      setZugaenge(z);
    });
    return () => { aktiv = false; };
  }, [verwaltet]);

  const liste = Array.isArray(firmen) ? firmen : [];
  const meine = zugang?.agentur ? agenturen.find((a) => a.id === zugang.agentur) ?? null : null;
  /** Der Name der eigenen Agentur — aus dem Zugang schon da, bevor die Agentur geladen ist */
  const meineName = meine?.name ?? (zugang?.agentur ? zugang.agenturName : null);
  const zeilen = useMemo(
    () => agenturZeilen(agenturen, liste, staende, zugaenge, sortierung),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agenturen, firmen, staende, zugaenge, sortierung],
  );
  const ohneAgentur = liste.filter((f) => f.agentur === null);

  const ladeStand = (
    <>
      {firmen === 'laedt' && <p className="text-sm text-ui-schiefer">Firmen werden geladen …</p>}
      {firmen === 'fehler' && (
        <p role="alert" className={FEHLER}>Die Firmen konnten nicht geladen werden. Bitte laden Sie die Seite neu.</p>
      )}
    </>
  );

  if (verwaltet) {
    const kopf = (
      <div>
        <Titel gross>bAV-Mitarbeiterberatung</Titel>
        <p className={`mt-3 ${EINLEITUNG}`}>
          Sie führen die bAV-Verwaltung: Unter jeder Agentur stehen ihre Firmenkunden mit allen Beratungen. Was Sie an
          einer Agentur eintragen — Ansprechpartner, Organisationsnummer, Versicherer —, ist für jede Firma vorbelegt,
          die in ihr angelegt wird.
        </p>
      </div>
    );
    if (!Array.isArray(firmen)) return <div className="space-y-10">{kopf}{ladeStand}</div>;
    return (
      <div className="space-y-12">
        {kopf}

        <section aria-labelledby="agenturen-titel" className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <Titel als="h2" id="agenturen-titel">Agenturen{agenturen.length > 0 ? ` (${agenturen.length})` : ''}</Titel>
            {agenturen.length > 1 && (
              <label className="text-sm text-ui-schiefer">
                <span className={FELD_LABEL}>Sortieren nach</span>
                <select value={sortierung} onChange={(e) => setSortierung(e.target.value as Sortierung)} className={`${FELD} min-w-[11rem]`}>
                  {SORTIERUNGEN.map((s) => <option key={s.wert} value={s.wert}>{s.text}</option>)}
                </select>
              </label>
            )}
          </div>
          <NeueAgentur gehe={gehe} />
          {agenturen.length === 0 ? (
            <p className="text-sm text-ui-schiefer">
              Noch keine Agentur. Legen Sie die erste an — danach tragen Sie ihre Daten ein und laden sie per Link ein.
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-4 md:grid-cols-2" aria-label="Agenturen">
              {zeilen.map((z) => {
                const kurz = agenturKurz(z.agentur.daten);
                return (
                  <li key={z.agentur.id}>
                    <button
                      type="button"
                      onClick={() => gehe({ agentur: z.agentur.id, firma: null, beratung: null, reiter: 'mitarbeiter' })}
                      className="ui-karte group flex h-full w-full items-start gap-3 p-6 text-left transition-colors hover:border-ui-asche"
                    >
                      <span className="min-w-0 flex-1">
                        <span className={`flex items-center gap-1.5 ${ETIKETT}`}>
                          <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden /> Agentur
                        </span>
                        <span className="mt-1 block break-words text-xl font-medium text-ui-tinte">{z.agentur.name}</span>
                        {kurz && <span className="mt-2 block break-words text-sm leading-relaxed text-ui-schiefer">{kurz}</span>}
                        <span className="mt-2 block text-sm leading-relaxed text-ui-tinte">{agenturStandText(z)}</span>
                        {z.firmen > 0 && <span className="mt-4 block"><StandZeile stand={z.stand} /></span>}
                      </span>
                      <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-ui-tinte transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="ohne-agentur-titel" className="space-y-5">
          <div>
            <Titel als="h2" id="ohne-agentur-titel">Firmen ohne Agentur{ohneAgentur.length > 0 ? ` (${ohneAgentur.length})` : ''}</Titel>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ui-schiefer">
              Ihre eigenen Firmen und die Ihres Büros. Einer Agentur ordnen Sie eine Firma in ihrem Reiter „Angebot“ zu.
            </p>
          </div>
          <NeueFirma angebot={() => neuesAngebot()} gehe={gehe} />
          {ohneAgentur.length === 0
            ? <p className="text-sm text-ui-schiefer">Keine Firma ohne Agentur.</p>
            : <FirmenKarten firmen={ohneAgentur} staende={staende} kollegen={kollegen} gehe={gehe} beschriftung="Firmen ohne Agentur" />}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div>
        {meineName && (
          <p className={`mb-2 flex items-center gap-1.5 ${ETIKETT}`}>
            <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden /> Agentur {meineName}
          </p>
        )}
        <Titel gross>bAV-Mitarbeiterberatung</Titel>
        <p className="mt-3 max-w-3xl text-base leading-relaxed text-ui-schiefer">
          Hat sich eine Firma für ein Modell entschieden, stellen Sie hier ihr Angebot ein — Modell, Versicherer, Logo —
          und führen dann jeden Mitarbeiter im Gespräch durch sieben Schritte. Am Ende stehen das Beratungsprotokoll,
          die Entgeltumwandlungsvereinbarung oder die Verzichtserklärung und eine Übersicht für den Arbeitgeber.
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ui-schiefer">
          Das Modell übernehmen Sie am schnellsten von der Arbeitgeber-Seite:{' '}
          <a href="/zuschussmodell" className="font-medium text-ui-tinte underline underline-offset-4">Zuschussmodell</a>,{' '}
          <a href="/festbetrag" className="font-medium text-ui-tinte underline underline-offset-4">Festbetrag-Modell</a>,{' '}
          <a href="/arbeitgeber" className="font-medium text-ui-tinte underline underline-offset-4">Matching-Modell</a> oder{' '}
          <a href="/individuelles-modell" className="font-medium text-ui-tinte underline underline-offset-4">individuelles Modell</a> —
          dort „Für die Mitarbeiter-Beratung übernehmen“.
        </p>
      </div>

      <NeueFirma
        angebot={async () => neuesAngebot((meine ?? await meineAgentur())?.daten ?? null)}
        inAgentur={meineName !== null}
        hinweis={meineName
          ? `Neue Firmen gehören zu Ihrer Agentur ${meineName}: Alle Zugänge der Agentur und die bAV-Verwaltung sehen und bearbeiten sie. Versicherer und Organisationsnummer sind vorbelegt.`
          : undefined}
        gehe={gehe}
      />

      {ladeStand}
      {Array.isArray(firmen) && (firmen.length === 0 ? (
        <p className="text-sm text-ui-schiefer">Noch keine Firma angelegt.</p>
      ) : (
        <FirmenKarten firmen={firmen} staende={staende} kollegen={kollegen} gehe={gehe}
          beschriftung={meineName ? `Firmenkunden der Agentur ${meineName}` : 'Firmen'} />
      ))}
    </div>
  );
}

/** „Neue Agentur“: nur der Name — die Daten folgen in der Ansicht der Agentur. */
function NeueAgentur({ gehe }: { gehe: (o: Ort) => void }) {
  const [name, setName] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);

  const anlegen = async (e: FormEvent) => {
    e.preventDefault();
    if (laeuft || name.trim() === '') return;
    setLaeuft(true);
    setMeldung(null);
    const a = await agenturAnlegen(name, agenturDatenSchema.parse({}));
    setLaeuft(false);
    if (a === 'fehler') { setMeldung('Die Agentur konnte nicht angelegt werden. Bitte versuchen Sie es noch einmal.'); return; }
    agenturMerken(a);
    gehe({ agentur: a.id, firma: null, beratung: null, reiter: 'mitarbeiter' });
  };

  return (
    <Karte titel="Neue Agentur">
      <form onSubmit={(e) => void anlegen(e)} className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <TextFeld label="Name der Agentur" wert={name} onChange={setName} maxLaenge={120} autoComplete="off" />
        </div>
        <button type="submit" disabled={laeuft || name.trim() === ''} className={KNOPF}>
          <Plus className="h-4 w-4" aria-hidden /> {laeuft ? 'Wird angelegt …' : 'Anlegen'}
        </button>
      </form>
      {meldung && <p role="alert" className={`mt-2 ${FEHLER}`}>{meldung}</p>}
    </Karte>
  );
}
