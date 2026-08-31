import { useState } from 'react';
import { Mail, Copy, Check } from 'lucide-react';
import { Dialog } from '../components/Dialog';
import type { AvdKind } from '@renten/engine';
import { TextFeld, euro } from '../components/Feld';

/** Die Eckdaten der Rechnung, die mit in die Anfrage gehen. */
export interface Eckdaten {
  beitragMonat: number;
  geburtsdatum: string;
  kinder: readonly AvdKind[];
  verheiratet: boolean;
  /** Zulagen, die es jedes Jahr gibt */
  zulagenJahr: number;
  /** Einmaliger Berufseinsteigerbonus, 0 wenn keiner */
  bonus: number;
  /** Steuerersparnis je Jahr ueber die Zulagen hinaus */
  steuerersparnisJahr: number;
  endkapital: number;
  rentenbeginnJahr: number;
}

function anfrageText(name: string, telefon: string, zeit: string, d: Eckdaten): string {
  const zeilen = [
    'Guten Tag,',
    '',
    'ich habe mich auf Ihrer Seite über das Altersvorsorgedepot informiert',
    'und hätte dazu gerne eine Beratung.',
    '',
    `Name: ${name}`,
    telefon ? `Telefon: ${telefon}` : null,
    zeit ? `Am besten erreichbar: ${zeit}` : null,
    '',
    'Meine Angaben im Rechner:',
    `- Beitrag: ${euro(d.beitragMonat)} im Monat (${euro(d.beitragMonat * 12)} im Jahr)`,
    d.geburtsdatum ? `- Geburtsdatum: ${d.geburtsdatum}` : null,
    `- Familienstand: ${d.verheiratet ? 'verheiratet' : 'alleinstehend'}`,
    d.kinder.length > 0
      ? `- Kinder (Geburtsjahre): ${d.kinder.map((k) => (
          k.ausbildungBisJahr !== undefined
            ? `${k.geburtsjahr} (Ausbildung bis ${k.ausbildungBisJahr})`
            : String(k.geburtsjahr)
        )).join(', ')}`
      : '- Kinder: keine',
    '',
    'Das Ergebnis der Rechnung:',
    `- Zulagen: ${euro(d.zulagenJahr)} pro Jahr`,
    d.bonus > 0 ? `- Berufseinsteigerbonus: ${euro(d.bonus)} einmalig` : null,
    d.steuerersparnisJahr > 0
      ? `- Steuerersparnis: ${euro(d.steuerersparnisJahr)} pro Jahr`
      : null,
    d.endkapital > 0 && d.rentenbeginnJahr > 0
      ? `- Kapital zum Rentenbeginn ${d.rentenbeginnJahr}: ${euro(d.endkapital)}`
      : null,
    '',
    'Die Zahlen stammen aus einer Modellrechnung ohne Gewähr.',
    '',
    'Mit freundlichen Grüßen',
    name,
  ];
  return zeilen.filter((z) => z !== null).join('\n');
}

/**
 * Beratungsanfrage.
 *
 * Die Seite hat keinen Server und soll auch keinen bekommen: Sie rechnet im
 * Browser, und personenbezogene Daten sollen ihn nicht ohne Zutun verlassen.
 * Der Knopf oeffnet deshalb das Mailprogramm des Nutzers mit fertigem Text —
 * ABGESCHICKT WIRD ERST VON IHM SELBST. Das steht auch so im Fenster; wer
 * glaubt, die Seite verschicke etwas, waere sonst zu Recht veraergert.
 */
export function BeratungDialog({
  offen, onSchliessen, empfaenger, eckdaten,
}: {
  offen: boolean;
  onSchliessen: () => void;
  empfaenger: string;
  eckdaten: Eckdaten;
}) {
  const [vorname, setVorname] = useState('');
  const [nachname, setNachname] = useState('');
  const [telefon, setTelefon] = useState('');
  const [zeit, setZeit] = useState('');
  const [kopiert, setKopiert] = useState(false);

  const name = `${vorname} ${nachname}`.trim();
  const bereit = vorname.trim().length > 0 && nachname.trim().length > 0;

  const betreff = `Beratung zum Altersvorsorgedepot${name ? ` — ${name}` : ''}`;
  const text = anfrageText(name, telefon.trim(), zeit.trim(), eckdaten);
  const mailto =
    `mailto:${empfaenger}?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(text)}`;

  const kopieren = async () => {
    try {
      await navigator.clipboard.writeText(`${empfaenger}\n\n${betreff}\n\n${text}`);
      setKopiert(true);
      setTimeout(() => setKopiert(false), 2500);
    } catch {
      setKopiert(false);
    }
  };

  return (
    <Dialog
      offen={offen}
      titel="Beratung zum Altersvorsorgedepot"
      beschreibung="Tragen Sie Ihren Namen ein — wir bereiten daraus eine E-Mail mit Ihren Eckdaten vor."
      onSchliessen={onSchliessen}
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextFeld label="Vorname" wert={vorname} onChange={setVorname} platzhalter="Max" />
          <TextFeld label="Nachname" wert={nachname} onChange={setNachname} platzhalter="Mustermann" />
          <TextFeld label="Telefon (freiwillig)" wert={telefon} onChange={setTelefon}
            platzhalter="0170 1234567" />
          <TextFeld label="Wann erreichbar? (freiwillig)" wert={zeit} onChange={setZeit}
            platzhalter="werktags ab 17 Uhr" />
        </div>

        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-xs font-bold text-slate-700">Das steht in der Mail:</p>
          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-slate-600">
            {text}
          </pre>
        </div>

        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
          Beim Klick öffnet sich <strong>Ihr Mailprogramm</strong> mit diesem Text.
          Abgeschickt wird die Nachricht erst, wenn Sie dort auf Senden drücken. Diese Seite
          verschickt und speichert nichts.
        </p>

        <div className="flex flex-wrap gap-2">
          <a
            href={bereit ? mailto : undefined}
            aria-disabled={!bereit}
            onClick={(e) => { if (!bereit) e.preventDefault(); }}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold ${
              bereit
                ? 'bg-indigo-600 text-white hover:bg-indigo-500'
                : 'cursor-not-allowed bg-slate-200 text-slate-400'
            }`}
          >
            <Mail className="h-4 w-4" aria-hidden /> Mail öffnen
          </a>
          <button
            type="button"
            onClick={kopieren}
            className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            {kopiert
              ? <><Check className="h-3.5 w-3.5" aria-hidden /> Kopiert</>
              : <><Copy className="h-3.5 w-3.5" aria-hidden /> Text kopieren</>}
          </button>
        </div>

        <p className="text-[11px] leading-relaxed text-slate-500">
          Kein Mailprogramm eingerichtet? Kopieren Sie den Text und schreiben Sie an{' '}
          <span className="font-medium text-slate-700">{empfaenger}</span>.
        </p>
      </div>
    </Dialog>
  );
}
