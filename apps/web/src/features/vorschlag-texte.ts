import {
  MIX_MINDESTBEITRAG, type LoesungId, type Loesungsmix, type MixAusgelassen, type MixTeil, type MixWuensche,
} from '@renten/engine';
import type { AnspracheWoerter } from '../lib/ansprache';
import { euro } from '../components/Feld';

/**
 * DIE WORTE ZUM VORSCHLAG — die vier Fragen, und zu jedem Baustein der Satz,
 * warum er dabei ist (oder fehlt). Bildschirm und Gutachten sagen dasselbe;
 * deshalb stehen die Saetze hier und nicht in der Ansicht.
 *
 * Jeder Grund nennt den Wunsch, auf den er antwortet: „Zulagen mitnehmen",
 * „Bleibt verfügbar". Der Kunde soll seine Antworten im Vorschlag
 * wiederfinden — sonst ist es eine Rechnung und kein Vorschlag fuer ihn.
 */

export const MIX_NAME: Record<LoesungId, string> = {
  avd: 'Altersvorsorgedepot',
  bav: 'Betriebsrente',
  basis: 'Basisrente (Rürup)',
  privat: 'Private Rente',
};

/** In einem Wort, was der Baustein im Mix leistet. */
export const MIX_ROLLE: Record<LoesungId, string> = {
  avd: 'Zulagen vom Staat',
  bav: 'Zuschuss vom Arbeitgeber',
  basis: 'Steuervorteil',
  privat: 'Flexibel',
};

export interface WunschAntwort<W extends string> { wert: W; text: string; unter: string }
export interface WunschFrage<K extends keyof MixWuensche = keyof MixWuensche> {
  id: K;
  /** Fuer das Gutachten: die Frage als Stichwort */
  kurz: string;
  frage: (t: AnspracheWoerter) => string;
  antworten: readonly WunschAntwort<MixWuensche[K]>[];
}

const frage = <K extends keyof MixWuensche>(f: WunschFrage<K>) => f;

export const WUNSCH_FRAGEN = {
  verfuegbar: frage({
    id: 'verfuegbar',
    kurz: 'Vor der Rente an das Geld kommen',
    frage: (t) => `${t.w('Willst du', 'Wollt ihr', 'Möchten Sie')} vor der Rente an das Geld kommen können?`,
    antworten: [
      { wert: 'nein', text: 'Nein', unter: 'Es ist fürs Alter gedacht.' },
      { wert: 'teil', text: 'Einen Teil', unter: 'Ein Drittel bleibt verfügbar.' },
      { wert: 'ja', text: 'Möglichst alles', unter: 'Zwei Drittel bleiben verfügbar.' },
    ],
  }),
  auszahlung: frage({
    id: 'auszahlung',
    kurz: 'Auszahlung im Alter',
    frage: () => 'Wie soll das Geld im Alter fließen?',
    antworten: [
      { wert: 'rente', text: 'Lebenslange Rente', unter: 'Monat für Monat, ein Leben lang.' },
      { wert: 'offen', text: 'Noch offen', unter: 'Rente oder Kapital entscheidet sich später.' },
      { wert: 'kapital', text: 'Als Kapital', unter: 'Auf einmal oder nach Plan.' },
    ],
  }),
  foerderung: frage({
    id: 'foerderung',
    kurz: 'Zulagen und Steuervorteile vom Staat',
    frage: () => 'Zulagen und Steuervorteile vom Staat mitnehmen?',
    antworten: [
      { wert: 'ja', text: 'Ja, mitnehmen', unter: 'Dafür ist das Geld bis zur Rente gebunden.' },
      { wert: 'nein', text: 'Nein, lieber frei', unter: 'Keine Förderung, keine Bindung.' },
    ],
  }),
  arbeitgeber: frage({
    id: 'arbeitgeber',
    kurz: 'Betriebsrente über den Arbeitgeber',
    frage: (t) => `Soll ${t.einzeln.dein()} Arbeitgeber mitzahlen?`,
    antworten: [
      { wert: 'ja', text: 'Ja, Betriebsrente', unter: 'Der Arbeitgeber gibt mindestens 15 % dazu.' },
      { wert: 'nein', text: 'Nein, ohne Arbeitgeber', unter: 'Unabhängig vom Arbeitsplatz.' },
    ],
  }),
} as const;

/** Die gegebene Antwort in Worten — fuer das Gutachten. */
export function wunschAntwort<K extends keyof MixWuensche>(id: K, wert: MixWuensche[K]): string {
  const antworten: readonly WunschAntwort<string>[] = WUNSCH_FRAGEN[id].antworten;
  return antworten.find((a) => a.wert === wert)?.text ?? '';
}

type Baustein = MixTeil['loesung'];

/** Was der Staat zum Depot dazulegt — derselbe Satz im Vorschlag aus den Antworten und von Hand. */
const depotSatz = (l: Baustein) => {
  const steuer = l.steuerErsparnisMonat >= 0.5 ? `, dazu ${euro(l.steuerErsparnisMonat)} Steuerersparnis` : '';
  return `Der Staat legt ${euro(l.zulageMonat)} im Monat dazu${steuer}.`
    + (l.begrenzt ? ' Der geförderte Höchstbetrag ist damit ausgeschöpft.' : '');
};

/** Was der Arbeitgeber und die Abgabenersparnis zur Betriebsrente beitragen. */
const bavSatz = (l: Baustein) => `Der Arbeitgeber zahlt mit: ${euro(l.agZuschussMonat)} Zuschuss im Monat, dazu `
  + `${euro(l.steuerErsparnisMonat + l.svErsparnisMonat)} weniger Steuer und Sozialabgaben.`;

const PRIVAT_SATZ = 'Ohne Förderung, dafür ohne Bindung: jederzeit verfügbar, im Alter als Rente oder Kapital.';

/** Warum der Baustein dabei ist — ein, zwei Saetze, mit den Betraegen dieses Kunden. */
export function mixGrund(teil: MixTeil, mix: Loesungsmix, w: MixWuensche, t: AnspracheWoerter): string {
  const l = teil.loesung;
  const andere = mix.teile.filter((x) => x.id !== 'privat');
  switch (teil.id) {
    case 'avd':
      return `Zulagen mitnehmen: ${depotSatz(l)}`;
    case 'bav':
      return bavSatz(l)
        + (mix.bavAnGrenze ? ' Bis zur Grenze, bis zu der die Umwandlung frei von Sozialabgaben ist — darüber lohnt sie kaum noch.' : '');
    case 'basis': {
      const davor = andere.filter((x) => x.id !== 'basis').map((x) => MIX_NAME[x.id]);
      return `Lebenslange Rente mit Steuervorteil: ${euro(l.steuerErsparnisMonat)} Steuerersparnis im Monat.`
        + (davor.length > 0 ? ` Hierhin fließt, was in ${davor.join(' und ')} nicht mehr hineinpasst.` : '');
    }
    default: {
      if (andere.length === 0) {
        return w.foerderung === 'nein'
          ? PRIVAT_SATZ
          : 'Jederzeit verfügbar, im Alter als Rente oder Kapital — eine geförderte Lösung passt hier nicht.';
      }
      const saetze: string[] = [];
      if (mix.verfuegbarMonat > 0.5) {
        saetze.push(w.verfuegbar === 'nein'
          ? 'Im Alter als Kapital: Voll auszahlen lässt sich nur die private Vorsorge.'
          : `Bleibt verfügbar: An dieses Geld ${t.w('kommst du', 'kommt ihr', 'kommen Sie')} auch vor der Rente.`);
      }
      if (mix.ueberlaufMonat > 0.5) {
        saetze.push(mix.verfuegbarMonat > 0.5
          ? `${euro(mix.ueberlaufMonat)} davon, weil die geförderten Verträge voll sind.`
          : 'Die geförderten Verträge sind voll — der Rest fließt ohne Förderung, dafür frei verfügbar.');
      }
      return saetze.join(' ');
    }
  }
}

/**
 * Was der Baustein bringt — fuer die VON HAND eingetragene Verteilung
 * (`loesungen.eigen`). Ohne Bezug auf die Antworten: Diesen Baustein hat der
 * Berater gewaehlt, nicht die Regel. Die Saetze nennen deshalb nur, was er
 * leistet.
 */
export function mixGrundEigen(teil: MixTeil): string {
  const l = teil.loesung;
  switch (teil.id) {
    case 'avd':
      return l.zulageMonat >= 0.5 ? depotSatz(l)
        : l.steuerErsparnisMonat >= 0.5 ? `Gefördert über die Steuer: ${euro(l.steuerErsparnisMonat)} Steuerersparnis im Monat.`
          : 'Gefördertes Depot fürs Alter — hier ohne Zulage.';
    case 'bav':
      return l.agZuschussMonat >= 0.5 ? bavSatz(l)
        : `${euro(l.steuerErsparnisMonat + l.svErsparnisMonat)} weniger Steuer und Sozialabgaben im Monat.`;
    case 'basis':
      return l.steuerErsparnisMonat >= 0.5
        ? `Lebenslange Rente mit Steuervorteil: ${euro(l.steuerErsparnisMonat)} Steuerersparnis im Monat.`
        : 'Lebenslange Rente — hier ohne Steuerersparnis.';
    default:
      return PRIVAT_SATZ;
  }
}

/** Warum eine Loesung im Vorschlag fehlt — ein Satz. Ohne Antworten (`null`) nur fuer Gruende, die nicht an ihnen haengen. */
export function mixAusgelassenText(a: MixAusgelassen, w: MixWuensche | null): string {
  const zuKlein = `Unter ${euro(MIX_MINDESTBEITRAG)} im Monat lohnt ein eigener Vertrag nicht.`;
  switch (a.grund) {
    case 'nichtMoeglich': return a.hinweis ?? 'Für diesen Haushalt nicht möglich.';
    case 'nichtGewuenscht':
      return a.id === 'bav' ? 'Der Arbeitgeber soll nicht eingebunden werden.' : 'Förderung ist nicht gewünscht.';
    case 'ausgeschoepft':
      return a.id === 'avd' ? 'Der geförderte Höchstbetrag ist mit dem bestehenden Depot schon ausgeschöpft.'
        : a.id === 'bav' ? 'Der Rahmen ohne Sozialabgaben ist mit der bestehenden Betriebsrente schon ausgeschöpft.'
          : 'Der Höchstbetrag für Altersvorsorgeaufwendungen ist schon ausgeschöpft.';
    case 'zuKlein':
      return a.id === 'bav' ? `Für zwei geförderte Verträge ist der Beitrag zu klein. ${zuKlein}`
        : `Der Rest ist für einen eigenen Vertrag zu klein. ${zuKlein}`;
    case 'nurRente':
      return w?.auszahlung === 'kapital'
        ? 'Sie zahlt nur eine lebenslange Rente — gewünscht ist Kapital.'
        : 'Sie zahlt nur eine lebenslange Rente — die Auszahlung soll offen bleiben.';
    case 'gebunden': return 'Das Geld wäre bis zur Rente fest gebunden — gewünscht ist, an möglichst alles zu kommen.';
    case 'steuerGering': return 'Die Steuerersparnis ist zu klein: weniger als ein Viertel des Beitrags.';
    case 'nachrangig': return 'Erst wenn die Verträge mit Zulage und Arbeitgeberzuschuss voll sind — dort kommt mehr dazu.';
    default: return 'Der ganze Beitrag passt in die geförderten Verträge, und vor der Rente muss nichts verfügbar sein.';
  }
}

/** Was zum eigenen Aufwand dazukommt, in Posten — nur, was es gibt. */
export function mixDazu(mix: Loesungsmix): { text: string; wert: number }[] {
  return [
    { text: 'Zulagen vom Staat', wert: mix.zulageMonat },
    { text: 'Zuschuss vom Arbeitgeber', wert: mix.agZuschussMonat },
    { text: 'Steuerersparnis', wert: mix.steuerErsparnisMonat },
    { text: 'Sozialabgaben gespart', wert: mix.svErsparnisMonat },
  ].filter((x) => x.wert >= 0.5);
}

/** Der Vorschlag in einer Zeile: „65 € Altersvorsorgedepot · 135 € Private Rente". */
export function mixKurz(mix: Loesungsmix): string {
  return mix.teile.map((x) => `${euro(x.loesung.nettoMonat)} ${MIX_NAME[x.id]}`).join(' · ');
}

/** Die Regeln in Worten — zum Aufklappen unter dem Vorschlag und fuer das Gutachten. */
export const MIX_REGELN: readonly string[] = [
  'Was vor der Rente verfügbar bleiben soll, fließt in die private Vorsorge: nichts, ein Drittel oder zwei Drittel des Beitrags. Wer im Alter Kapital will, behält mindestens ein Drittel dort.',
  'Der Rest geht dorthin, wo etwas dazukommt: ins Altersvorsorgedepot (Zulagen) und, wenn gewünscht, in die Betriebsrente (Arbeitgeberzuschuss) — zu gleichen Teilen, jeweils bis zum geförderten Rahmen.',
  'Die Betriebsrente höchstens so weit, wie die Umwandlung frei von Sozialabgaben bleibt (4 % der Beitragsbemessungsgrenze).',
  'Die Basisrente erst danach — und nur, wer eine lebenslange Rente will, das Geld vorher nicht braucht und mindestens ein Viertel des Beitrags an Steuer spart.',
  `Was dann noch übrig ist, fließt ohne Förderung in die private Vorsorge. Kein Vertrag unter ${MIX_MINDESTBEITRAG} € im Monat.`,
];
