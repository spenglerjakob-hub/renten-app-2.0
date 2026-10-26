import { useState } from 'react';
import { Mail, Copy, Check } from 'lucide-react';
import { Dialog } from '../components/Dialog';
import type { AvdKind } from '@renten/engine';
import { NamenFelder, TextFeld, euro } from '../components/Feld';
import { Hinweis, KNOPF, KNOPF_ZWEIT } from '../components/stil';
import { vollerName, type NamensTeile } from '../lib/namen';

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
  offen, onSchliessen, empfaenger, eckdaten, name: teile, onName,
}: {
  offen: boolean;
  onSchliessen: () => void;
  empfaenger: string;
  eckdaten: Eckdaten;
  /** Derselbe Name wie auf der Seite — wer ihn dort schon eingetragen hat, tippt ihn hier nicht noch einmal. */
  name: NamensTeile;
  onName: (n: NamensTeile) => void;
}) {
  const [telefon, setTelefon] = useState('');
  const [zeit, setZeit] = useState('');
  const [kopiert, setKopiert] = useState(false);

  const name = vollerName(teile);
  const bereit = teile.vorname.trim().length > 0 && teile.nachname.trim().length > 0;

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
          <NamenFelder vorname={teile.vorname} nachname={teile.nachname} onChange={onName}
            platzhalter={['Max', 'Mustermann']} eigener />
          <TextFeld label="Telefon (freiwillig)" wert={telefon} onChange={setTelefon}
            platzhalter="0170 1234567" />
          <TextFeld label="Wann erreichbar? (freiwillig)" wert={zeit} onChange={setZeit}
            platzhalter="werktags ab 17 Uhr" />
        </div>

        <div className="ui-innen px-3 py-2">
          <p className="text-xs font-medium text-ui-tinte">Das steht in der Mail:</p>
          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-ui-schiefer">
            {text}
          </pre>
        </div>

        <Hinweis>
          Beim Klick öffnet sich <span className="font-medium">Ihr Mailprogramm</span> mit diesem Text.
          Abgeschickt wird die Nachricht erst, wenn Sie dort auf Senden drücken. Diese Seite
          verschickt und speichert nichts.
        </Hinweis>

        <div className="flex flex-wrap gap-2 border-t border-ui-linie pt-4">
          <a
            href={bereit ? mailto : undefined}
            aria-disabled={!bereit}
            onClick={(e) => { if (!bereit) e.preventDefault(); }}
            className={`${KNOPF} flex-1 ${bereit ? '' : 'cursor-not-allowed opacity-40'}`}
          >
            <Mail className="h-4 w-4" aria-hidden /> Mail öffnen
          </a>
          <button
            type="button"
            onClick={kopieren}
            className={KNOPF_ZWEIT}
          >
            {kopiert
              ? <><Check className="h-3.5 w-3.5" aria-hidden /> Kopiert</>
              : <><Copy className="h-3.5 w-3.5" aria-hidden /> Text kopieren</>}
          </button>
        </div>

        <p className="text-xs leading-relaxed text-ui-schiefer">
          Kein Mailprogramm eingerichtet? Kopieren Sie den Text und schreiben Sie an{' '}
          <span className="font-medium text-ui-tinte">{empfaenger}</span>.
        </p>
      </div>
    </Dialog>
  );
}
