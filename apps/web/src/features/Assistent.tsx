import type { ReactNode } from 'react';
import { Check, FileStack, HeartPulse, Target, UserRound, Wallet, type LucideIcon } from 'lucide-react';
import type { ProjektionsErgebnis } from '@renten/engine';
import { Basisdaten, type BasisTeil } from './Basisdaten';
import { useSzenario } from '../store/szenario';
import { eintragVon, fehlendeAngaben, fehltSatz, offenePfade, relevant } from './vorbelegung';
import { personNameAus } from './personen';
import type { FallSchrittId } from './fortschritt';
import { KNOPF_ZWEIT } from '../components/stil';
import { Stuecke, type Stueck } from '../components/Ablauf';
import { FrageKopf, Hilfe, Hilfen } from '../components/Frage';
import { einkommenSatz, haushaltSatz, personenSatz, vertraegeSatz, zielSatz } from './daten-ergebnis';
import { useAnsprache } from '../components/Ansprache';
import type { AnspracheWoerter } from '../lib/ansprache';

/**
 * DER ASSISTENT fuer die erste Etappe: dieselben Angaben wie im Formular,
 * aber einzeln abgefragt. Ein Schritt ist offen; die davor stehen darueber
 * als Zeilen mit dem, was eingetragen ist.
 *
 * FRAGE ZUERST, wie im Vorsorge-Check: Jeder Schritt beginnt mit einer Frage
 * und einer kurzen Zeile dazu, darunter stehen gleich die Felder. In welcher
 * Unterlage die Zahl steht, klappt darunter auf („Wo finde ich das?“) — wer
 * sie kennt, muss nicht daran vorbei.
 *
 * SO WENIG TEXT WIE MOEGLICH: Unter den Feldern steht keine Erklaerung mehr.
 * Was man nur einmal wissen muss, oeffnet sich am Fragezeichen neben der
 * Beschriftung (`info` an den Feldern).
 *
 * Er schreibt in denselben Speicher wie das Formular und der Rechner. Es gibt
 * also nichts zu „uebernehmen": Wer mitten im Assistenten auf das Formular
 * umschaltet, findet dort alles, was er gerade eingetragen hat. Darin liegt
 * der Unterschied zum Vorsorge-Check fuer Kunden, der seine Antworten erst am
 * Ende als Szenario uebergibt.
 */

interface AssistentSchritt {
  /** Der kurze Name — fuer die Zeile des erledigten Schritts und „Weiter: …“ */
  titel: (t: AnspracheWoerter) => string;
  /** Zeichen, Frage und eine kurze Zeile dazu — der Kopf des offenen Schritts. Per Du, ein Paar per ihr. */
  symbol: LucideIcon;
  frage: (t: AnspracheWoerter) => string;
  unter: (t: AnspracheWoerter) => string;
  /** „Wo finde ich das?“: die Unterlage in zwei, drei Woertern und der Hinweis dazu — ohne: keine Hilfe */
  unterlageKurz?: string;
  unterlage?: (t: AnspracheWoerter) => ReactNode;
  /** Ein Teil der Basisdaten — oder die Vertraege, die der Aufrufer mitgibt */
  teil: BasisTeil | 'vertraege';
}

/*
  DIE REIHENFOLGE: erst die Person — wer du bist, wann du in Rente gehst, was
  die Rentenversicherung nennt (und ob es einen Ehepartner gibt) —, dann der
  Haushalt mit der Krankenversicherung, das Einkommen, die bestehende
  Vorsorge, zuletzt das Ziel: Es misst sich am Einkommen davor. Das Formular
  „auf einen Blick“ hat dieselbe Reihenfolge.
*/
const SCHRITTE: AssistentSchritt[] = [
  {
    titel: (t) => t.w('Du & deine gesetzliche Rente', 'Ihr beide & eure gesetzliche Rente'),
    teil: 'personen',
    symbol: UserRound,
    frage: (t) => t.w('Zuerst zu dir', 'Zuerst zu euch beiden'),
    unter: () => 'Geburtsdatum und der Betrag aus der Renteninformation.',
    unterlageKurz: 'Renteninformation oder Versorgungsauskunft',
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
    titel: () => 'Haushalt & Krankenversicherung',
    teil: 'haushalt',
    symbol: HeartPulse,
    frage: (t) => t.w('Wo wohnst du, wie bist du krankenversichert?', 'Wo wohnt ihr, wie seid ihr krankenversichert?'),
    unter: () => 'Für Steuer, Krankenversicherung und Zulagen.',
    unterlageKurz: 'Versichertenkarte oder Beitragsrechnung',
    unterlage: (t) => (
      <>
        Gesetzlich versichert: der <strong>Name {t.dein('er')} Krankenkasse</strong> — den Zusatzbeitrag kennt
        der Rechner. Privat versichert: {t.dein('e')} <strong>Beitragsrechnung</strong>. Bei Kindern genügt das
        Geburtsjahr; es entscheidet über Pflegeversicherung, Kinderfreibetrag und Zulagen.
      </>
    ),
  },
  {
    titel: () => 'Einkommen',
    teil: 'einkommen',
    symbol: Wallet,
    frage: (t) => t.w('Was verdienst du?', 'Was verdient ihr?'),
    unter: () => 'Ein normaler Monat, ohne Sonderzahlungen.',
    unterlageKurz: 'Gehaltsabrechnung, Bezügemitteilung oder Steuerbescheid',
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
    symbol: FileStack,
    frage: (t) => t.w('Welche Vorsorge hast du schon?', 'Welche Vorsorge habt ihr schon?'),
    unter: () => 'Betriebsrente, Riester, private Rente, Depot — je Vertrag ein Eintrag.',
    unterlageKurz: 'Standmitteilung oder Depotauszug',
    unterlage: () => (
      <>
        Die jährliche <strong>Standmitteilung</strong> jedes Vertrags: garantierte bzw. prognostizierte
        Monatsrente, Beitrag und Beginn. Bei Betriebsrenten den Anteil des Arbeitgebers
        (Gehaltsabrechnung), bei Depots den <strong>Depotauszug</strong>.
      </>
    ),
  },
  {
    titel: (t) => `${t.Dein()} Ziel`,
    teil: 'ziel',
    symbol: Target,
    // Keine Unterlage — nur eine Ueberlegung; sie steht deshalb gleich unter der Frage.
    frage: (t) => t.w('Wie viel möchtest du im Ruhestand haben?', 'Wie viel möchtet ihr im Ruhestand haben?'),
    unter: () => 'Im Monat, in heutiger Kaufkraft.',
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
 * darunter — gesprungen wird dorthin, wo noch eine Angabe fehlt.
 */
export function assistentSchrittFuer(id: FallSchrittId, offen: readonly string[]): number | null {
  switch (id) {
    case 'mandant': return SCHRITTE.findIndex((x) => x.teil === 'personen');
    // Nur Angaben des Mandanten zaehlen — Standardwerte wie „12 Gehaelter“ fehlen nicht.
    case 'einkuenfte': return offen.some((p) => p.startsWith('einkommen') && eintragVon(p)?.art === 'angabe')
      ? SCHRITTE.findIndex((x) => x.teil === 'einkommen')
      : SCHRITTE.findIndex((x) => x.teil === 'personen');
    case 'vertraege': return SCHRITTE.findIndex((x) => x.teil === 'vertraege');
    case 'ziel': return SCHRITTE.findIndex((x) => x.teil === 'ziel');
    default: return null;
  }
}

/**
 * Der erste Schritt, in dem eine der genannten Angaben steht — dorthin fuehrt
 * „Zu den Angaben“. Der erste, nicht irgendeiner: Die Angaben werden von oben
 * nach unten ausgefuellt, und das Ziel misst sich am Einkommen davor.
 */
export function assistentSchrittFuerPfade(pfade: readonly string[]): number | null {
  const n = SCHRITTE.findIndex((x) => pfade.some((p) => PFADE_JE_TEIL[x.teil](p)));
  return n >= 0 ? n : null;
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
    nicht erledigt. Fehlt darin noch eine Angabe (bei den Vertraegen: noch
    nichts erfasst), traegt seine Zeile einen leeren Kreis und sagt, welche.
  */
  const nameVon = (id: 'A' | 'B') => personNameAus(szenario.personen, id);
  const fehltIn = (x: AssistentSchritt): string | undefined => (x.teil === 'vertraege'
    ? (vertraegeOffen ? 'noch nicht erfasst' : undefined)
    : fehltSatz(fehlendeAngaben(szenario, nameVon, PFADE_JE_TEIL[x.teil])) || undefined);
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
    fehlt: fehltIn(x),
    inhalt: (
      // `handy-eingaben`: am Telefon Eingaben in 16 px und daumenhoch (index.css) — wie im Vorsorge-Check.
      <div className="ui-karte handy-eingaben p-5 sm:p-7">
        <FrageKopf symbol={x.symbol} titel={x.frage(t)} unter={x.unter(t)} als="h3" />

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

        {/* Was beim Ausfuellen hilft, steht UNTER den Feldern und klappt auf — wer die Zahl kennt, muss nicht daran vorbei. */}
        {x.unterlage && x.unterlageKurz && (
          <Hilfen>
            <Hilfe unterlage={x.unterlageKurz}>{x.unterlage(t)}</Hilfe>
          </Hilfen>
        )}
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
