import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { firmaAgenturSetzen, type Firma } from '../lib/bav-beratung';
import { agenturenLaden, type Agentur } from '../lib/bav-agenturen';
import { useZugang } from '../store/zugang';
import { AuswahlFeld } from '../components/Feld';
import { FEHLER, KNOPF_ZWEIT, Karte } from '../components/stil';

const OHNE = '';

/**
 * „Agentur“ im Reiter „Angebot“ einer Firma.
 *
 * Die bAV-VERWALTUNG ordnet die Firma hier einer Agentur zu, verschiebt sie
 * in eine andere oder nimmt sie heraus. Hat sie ein Zugang der bisherigen
 * Agentur angelegt, geht sie dabei an den ueber, der sie verschiebt — sonst
 * saehe der sie als Besitzer weiter (Trigger `bav_firmen_agentur_gewechselt`).
 * EIN ZUGANG DER AGENTUR liest, wer die Firma ausser ihm sieht. Alle anderen
 * sehen die Karte nicht. Was erlaubt ist, prueft die Datenbank.
 */
export function AgenturKarte({ firma, agentur, onGeaendert }: {
  firma: Firma;
  /** Die Agentur der Firma, sobald sie geladen ist */
  agentur: Agentur | null;
  onGeaendert: (f: Firma) => void;
}) {
  const verwaltet = useZugang((s) => s.zugang?.verwalter === true);
  const [agenturen, setAgenturen] = useState<Agentur[] | null>(null);
  const [wahl, setWahl] = useState(firma.agentur ?? OHNE);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ art: 'gut' | 'fehler'; text: string } | null>(null);

  useEffect(() => {
    if (!verwaltet) return undefined;
    let aktiv = true;
    void agenturenLaden().then((a) => { if (aktiv) setAgenturen(Array.isArray(a) ? a : []); });
    return () => { aktiv = false; };
  }, [verwaltet]);
  useEffect(() => { setWahl(firma.agentur ?? OHNE); }, [firma.agentur]);

  if (!verwaltet) {
    if (firma.agentur === null) return null;
    return (
      <Karte titel="Agentur">
        <p className="flex max-w-3xl items-start gap-2 text-sm leading-relaxed text-ui-schiefer">
          <Building2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            {firma.name} gehört zur Agentur{agentur ? ` ${agentur.name}` : ''}: Alle Zugänge der Agentur und die
            bAV-Verwaltung sehen und bearbeiten die Firma mit allen Beratungen.
          </span>
        </p>
      </Karte>
    );
  }

  // Ohne Agenturen (oder ohne die Tabelle) gibt es nichts zuzuordnen.
  if (agenturen === null || (agenturen.length === 0 && firma.agentur === null)) return null;

  const optionen = [{ wert: OHNE, text: 'Keine Agentur' }, ...agenturen.map((a) => ({ wert: a.id, text: a.name }))];
  const geaendert = wahl !== (firma.agentur ?? OHNE);
  const ziel = agenturen.find((a) => a.id === wahl) ?? null;

  const zuordnen = async () => {
    if (laeuft || !geaendert) return;
    setLaeuft(true);
    setMeldung(null);
    const neu = wahl === OHNE ? null : wahl;
    const ok = await firmaAgenturSetzen(firma.id, neu);
    setLaeuft(false);
    if (!ok) { setMeldung({ art: 'fehler', text: 'Das hat nicht geklappt. Bitte versuchen Sie es noch einmal.' }); return; }
    setMeldung({ art: 'gut', text: ziel ? `Die Firma gehört jetzt zur Agentur ${ziel.name}.` : 'Die Firma gehört zu keiner Agentur mehr.' });
    // Eine Firma eines Zugangs der bisherigen Agentur gehoert danach dem, der sie verschoben hat.
    onGeaendert({ ...firma, agentur: neu, eigene: firma.eigene || firma.agentur !== null, aenderbar: true });
  };

  return (
    <Karte titel="Agentur">
      <p className="max-w-3xl text-sm leading-relaxed text-ui-schiefer">
        Zu welcher Agentur gehört {firma.name}? Die Zugänge der Agentur sehen und bearbeiten die Firma mit allen
        Beratungen — auch Gehalt, Steuer- und Gesundheitsangaben der Mitarbeiter. Das Angebot der Firma bleibt, wie es ist.
        {firma.agentur !== null && ' Wechselt sie die Agentur, sehen die Zugänge der bisherigen sie nicht mehr.'}
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <AuswahlFeld label="Agentur" wert={wahl} onChange={(v) => { setWahl(v); setMeldung(null); }} optionen={optionen} />
        </div>
        <button type="button" onClick={() => void zuordnen()} disabled={laeuft || !geaendert} className={KNOPF_ZWEIT}>
          {laeuft ? 'Einen Moment …' : 'Zuordnen'}
        </button>
      </div>
      {meldung && (
        meldung.art === 'fehler'
          ? <p role="alert" className={`mt-3 ${FEHLER}`}>{meldung.text}</p>
          : <p role="status" className="mt-3 text-sm text-ui-tinte">{meldung.text}</p>
      )}
    </Karte>
  );
}
