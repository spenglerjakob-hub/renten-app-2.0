import type { ReactNode } from 'react';
import { Check, FileText } from 'lucide-react';
import type { ProjektionsErgebnis } from '@renten/engine';
import { Basisdaten, type BasisTeil } from './Basisdaten';
import { useSzenario } from '../store/szenario';
import { eintragVon, offenePfade, relevant } from './vorbelegung';
import type { FallSchrittId } from './fortschritt';
import { KNOPF_ZWEIT } from '../components/stil';
import { Stuecke, type Stueck } from '../components/Ablauf';
import { einkommenSatz, haushaltSatz, personenSatz, vertraegeSatz, zielSatz } from './daten-ergebnis';
import { useAnsprache } from '../components/Ansprache';
import type { AnspracheWoerter } from '../lib/ansprache';

/**
 * DER ASSISTENT fuer die erste Etappe: dieselben Angaben wie im Formular,
 * aber einzeln abgefragt — mit der Unterlage, in der die Zahl steht. Ein
 * Schritt ist offen; die davor stehen darueber als Zeilen mit dem, was
 * eingetragen ist.
 *
 * Er schreibt in denselben Speicher wie das Formular und der Rechner. Es gibt
 * also nichts zu „uebernehmen": Wer mitten im Assistenten auf das Formular
 * umschaltet, findet dort alles, was er gerade eingetragen hat. Darin liegt
 * der Unterschied zum Vorsorge-Check fuer Kunden, der seine Antworten erst am
 * Ende als Szenario uebergibt.
 */

interface AssistentSchritt {
  /** Titel und Unterlage sprechen den Kunden an — per Du, ein Paar per ihr */
  titel: (t: AnspracheWoerter) => string;
  unterlage: (t: AnspracheWoerter) => ReactNode;
  /** Ein Teil der Basisdaten — oder die Vertraege, die der Aufrufer mitgibt */
  teil: BasisTeil | 'vertraege';
}

const SCHRITTE: AssistentSchritt[] = [
  {
    titel: () => 'Haushalt & Krankenversicherung',
    teil: 'haushalt',
    unterlage: (t) => (
      <>
        Gesetzlich versichert: der <strong>Name {t.dein('er')} Krankenkasse</strong> — den Zusatzbeitrag kennt
        der Rechner. Privat versichert: {t.dein('e')} <strong>Beitragsrechnung</strong>. Bei Kindern genügt das
        Geburtsjahr; es entscheidet über Pflegeversicherung, Kinderfreibetrag und Zulagen.
      </>
    ),
  },
  {
    titel: (t) => t.w('Du & deine gesetzliche Rente', 'Ihr beide & eure gesetzliche Rente'),
    teil: 'personen',
    // Das Zitat aus der Renteninformation bleibt woertlich — so steht es im Brief.
    unterlage: (t) => (
      <>
        Die <strong>Renteninformation</strong> der Deutschen Rentenversicherung: der Betrag unter{' '}
        <em>„Höhe Ihrer künftigen Regelaltersrente“</em>. Beamte: die <strong>Versorgungsauskunft</strong>{' '}
        mit dem Ruhegehaltssatz. Keine Renteninformation zur Hand? Der Rentenschätzer rechnet aus
        {' '}{t.dein('em')} Einkommen.
      </>
    ),
  },
  {
    titel: () => 'Einkommen',
    teil: 'einkommen',
    unterlage: () => (
      <>
        Die letzte <strong>Gehaltsabrechnung</strong>: das Gesamtbrutto eines normalen Monats —
        Weihnachts- und Urlaubsgeld stecken in der Anzahl der Gehälter. Beamte: die{' '}
        <strong>Bezügemitteilung</strong>. Selbstständige: der Gewinn aus dem letzten{' '}
        <strong>Steuerbescheid</strong>.
      </>
    ),
  },
  {
    titel: () => 'Bestehende Vorsorge',
    teil: 'vertraege',
    unterlage: () => (
      <>
        Die jährliche <strong>Standmitteilung</strong> jedes Vertrags: garantierte bzw. prognostizierte
        Monatsrente, Beitrag und Beginn. Bei Betriebsrenten den Anteil des Arbeitgebers
        (Gehaltsabrechnung), bei Depots den <strong>Depotauszug</strong>. Kein Vertrag? Dann einfach
        weiter.
      </>
    ),
  },
  {
    titel: (t) => `${t.Dein()} Ziel`,
    teil: 'ziel',
    unterlage: (t) => (
      <>
        Keine Unterlage — nur eine Überlegung: Wie viel Geld im Monat {t.w('brauchst du', 'braucht ihr')} im Ruhestand,
        gerechnet in <strong>heutigem Geld</strong>? Die Preissteigerung bis dahin rechnet der
        Planer selbst hinzu.
      </>
    ),
  },
];

const SPEICHER = 'rentenplaner.assistent.v1';

/** Der zuletzt offene Schritt — eine Bequemlichkeit je Geraet. */
export function ladeAssistentSchritt(): number {
  try {
    const n = Number(localStorage.getItem(SPEICHER));
    if (Number.isInteger(n) && n >= 0 && n < SCHRITTE.length) return n;
  } catch { /* Speicher gesperrt */ }
  return 0;
}

export function merkeAssistentSchritt(n: number): number {
  const z = Math.max(0, Math.min(SCHRITTE.length - 1, n));
  try { localStorage.setItem(SPEICHER, String(z)); } catch { /* Speicher gesperrt */ }
  return z;
}

/**
 * Wohin ein offener Schritt des Fortschritts fuehrt. Die Einkuenfte stehen
 * in zwei Schritten: die gesetzliche Rente bei der Person, das Gehalt
 * darunter — gesprungen wird dorthin, wo noch ein Beispielwert steht.
 */
export function assistentSchrittFuer(id: FallSchrittId, offen: readonly string[]): number | null {
  switch (id) {
    case 'mandant': return SCHRITTE.findIndex((x) => x.teil === 'personen');
    // Nur Beispielwerte zaehlen — Standardwerte wie „12 Gehaelter“ fehlen nicht.
    case 'einkuenfte': return offen.some((p) => p.startsWith('einkommen') && eintragVon(p)?.art === 'beispiel')
      ? SCHRITTE.findIndex((x) => x.teil === 'einkommen')
      : SCHRITTE.findIndex((x) => x.teil === 'personen');
    case 'vertraege': return SCHRITTE.findIndex((x) => x.teil === 'vertraege');
    case 'ziel': return SCHRITTE.findIndex((x) => x.teil === 'ziel');
    default: return null;
  }
}

/** Welche offenen Pfade zu einem Schritt des Assistenten gehoeren. */
const PFADE_JE_TEIL: Record<AssistentSchritt['teil'], (p: string) => boolean> = {
  haushalt: (p) => p.startsWith('haushalt.') && p !== 'haushalt.zielNettoHeute',
  personen: (p) => /^personen\.[AB]\.(geburtsdatum|grvBruttoHeute)$/.test(p),
  einkommen: (p) => p.startsWith('einkommen'),
  vertraege: () => false,
  ziel: (p) => p === 'haushalt.zielNettoHeute',
};

export function Assistent({ ergebnis, onEhepartnerDialog, vertraege, onFertig, schritt: i, onSchritt }: {
  ergebnis: ProjektionsErgebnis | null;
  onEhepartnerDialog: () => void;
  /** Die Versorgungsschichten — dieselbe Eingabe wie im Formular */
  vertraege: ReactNode;
  /** Nach dem letzten Schritt: weiter zum Ergebnis */
  onFertig: () => void;
  /**
   * Der Schritt kommt von aussen: Die Fortschrittsleiste springt an die
   * Stelle, an der noch etwas fehlt.
   */
  schritt: number;
  onSchritt: (n: number) => void;
}) {
  const szenario = useSzenario((x) => x.szenario);
  const pruefen = useSzenario((x) => x.pruefen);
  const t = useAnsprache();
  const offen = offenePfade(szenario).filter((p) => relevant(szenario, p));
  const vertraegeOffen = offen.includes('vertraege');
  /*
    Kein Haken nach Position: Ein Schritt, an dem man vorbeigeklickt hat, ist
    nicht erledigt. Stehen noch Beispielwerte darin (bei den Vertraegen: noch
    nichts erfasst), traegt seine Zeile einen leeren Kreis und sagt es dazu.
  */
  const beispielOffen = (x: AssistentSchritt) => (x.teil === 'vertraege'
    ? vertraegeOffen
    : offen.some((p) => PFADE_JE_TEIL[x.teil](p) && eintragVon(p)?.art === 'beispiel'));
  const geheZu = (n: number) => onSchritt(Math.max(0, Math.min(SCHRITTE.length - 1, n)));
  const heute = new Date();
  const ergebnisVon: Record<AssistentSchritt['teil'], () => string> = {
    haushalt: () => haushaltSatz(szenario),
    personen: () => personenSatz(szenario, heute),
    einkommen: () => einkommenSatz(szenario),
    vertraege: () => vertraegeSatz(szenario, vertraegeOffen),
    ziel: () => zielSatz(szenario),
  };

  /*
    VON OBEN NACH UNTEN (`components/Ablauf`): Ein Schritt ist offen, die
    davor stehen darueber als Zeilen mit dem, was eingetragen ist — ein Klick
    oeffnet sie wieder. Die Linien-Leiste und „Zurueck“ entfallen damit: Die
    Zeilen sind beides.
  */
  const stuecke: Stueck[] = SCHRITTE.map((x, n) => ({
    id: x.teil,
    titel: x.titel(t),
    ergebnis: ergebnisVon[x.teil](),
    fehlt: beispielOffen(x) ? (x.teil === 'vertraege' ? 'noch nicht erfasst' : 'Beispielwerte offen') : undefined,
    inhalt: (
      <div className="ui-karte p-5 sm:p-7">
        <h3 className="text-lg font-medium tracking-[-0.01em] text-ui-tinte sm:text-xl">{x.titel(t)}</h3>
        {/* Die Unterlage als leiser Satz unter dem Titel — wie die Hilfetexte der Beratung, kein gelber Kasten. */}
        <p className="mt-2 flex max-w-3xl gap-2.5 text-sm leading-relaxed text-ui-schiefer [&_strong]:font-medium [&_strong]:text-ui-tinte">
          <FileText className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span><span className="font-medium text-ui-tinte">Das {t.w('brauchst du', 'braucht ihr')}: </span>{x.unterlage(t)}</span>
        </p>

        <div className="mt-6">
          {x.teil === 'vertraege'
            ? (
              <>
                {/*
                  KEINE VERTRAEGE ist auch eine Antwort — aber eine, die man
                  geben muss. Ohne diesen Knopf bliebe der Schritt offen, nur
                  weil es nichts zu erfassen gibt.
                */}
                {szenario.vertraege.length === 0 && (vertraegeOffen ? (
                  <button
                    type="button"
                    onClick={() => { pruefen('vertraege'); geheZu(n + 1); }}
                    className={`mb-5 ${KNOPF_ZWEIT}`}
                  >
                    <Check className="h-4 w-4" aria-hidden /> Keine bestehenden Verträge
                  </button>
                ) : (
                  <p className="mb-5 text-sm text-ui-schiefer">Vermerkt: keine bestehenden Verträge.</p>
                ))}
                {vertraege}
              </>
            )
            : <Basisdaten teil={x.teil} ergebnis={ergebnis} onEhepartnerDialog={onEhepartnerDialog} />}
        </div>
      </div>
    ),
  }));

  return (
    <Stuecke
      kennung="daten"
      beschriftung="Schritte der Angaben"
      stuecke={stuecke}
      offen={(SCHRITTE[i] ?? SCHRITTE[0]!).teil}
      onOeffnen={(id) => geheZu(SCHRITTE.findIndex((x) => x.teil === id))}
      weiter={{ text: 'Fertig — zum Ergebnis', onClick: onFertig }}
    />
  );
}
