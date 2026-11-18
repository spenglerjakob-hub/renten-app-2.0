import { freiStufenGeordnet, type FreiStufe } from '@renten/engine';
import { FREI_STUFEN_MAX } from '@renten/schema';

/*
 * DAS INDIVIDUELLE MODELL — die reinen Teile der Oberflaeche: die Regel, wie
 * die Seiten sie halten, ihre Kurzform in Worten und was an der Eingabe
 * auffaellt. Gerechnet wird im Rechenkern (`freiesModell`).
 */

/** Die Regel, wie die Seiten sie halten: Deckel 0 heisst ohne Deckel — wie im Angebot der Firma. */
export interface FreiRegelEingabe {
  /** Anteil der gesamten Umwandlung — 0: keiner */
  quote: number;
  deckelMonat: number;
  stufen: FreiStufe[];
}

/** Ohne Vorbelegung: Die Regel baut der Berater selbst. */
export const FREI_LEER: FreiRegelEingabe = { quote: 0, deckelMonat: 0, stufen: [] };

/** Ganze Euro ohne Nachkommastellen, sonst auf den Cent: „25 €“, „12,50 €“. */
const euro = (n: number) => {
  const stellen = Number.isInteger(Math.round(n * 100) / 100) ? 0 : 2;
  return `${n.toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen })} €`;
};
/** „20 %“, „12,5 %“ — ohne angehaengte Null. */
export const prozentKurz = (n: number) => `${(n * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`;
const prozent = prozentKurz;

/** Ist eine Regel eingetragen? Sonst zahlt der Arbeitgeber nur den gesetzlichen Zuschuss. */
export const freiHatRegel = (m: FreiRegelEingabe) => m.quote > 0 || m.stufen.some((s) => s.betragMonat > 0);

/** Dieselbe Regel? Feld fuer Feld, die Stufen in der Reihenfolge der Eingabe. */
export const regelGleich = (a: FreiRegelEingabe, b: FreiRegelEingabe) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Welche Regel gilt, wenn die Firma wechselt. Die Regel einer Firma kommt mit
 * ihr — solange die Regel auf der Seite unberuehrt ist: leer, oder noch die
 * der vorigen Firma (`vonVoriger`). Dann steht nach dem Wechsel die Regel der
 * neuen Firma da, oder nichts, wenn sie keine hat — nie die einer anderen
 * Firma unter ihrem Namen. Was der Berater selbst eingestellt hat, bleibt.
 */
export function regelBeimFirmenwechsel(
  jetzt: FreiRegelEingabe, vonVoriger: FreiRegelEingabe | null, neue: FreiRegelEingabe | null,
): FreiRegelEingabe {
  const leer = !freiHatRegel(jetzt) && jetzt.stufen.length === 0;
  const unberuehrt = leer || (vonVoriger !== null && regelGleich(jetzt, vonVoriger));
  if (!unberuehrt) return jetzt;
  // Leer bleibt leer — dieselbe Regel, kein neuer Stand.
  return neue ?? (leer ? jetzt : FREI_LEER);
}

/** Lassen sich noch Stufen anlegen? */
export const stufeMoeglich = (stufen: readonly FreiStufe[]) => stufen.length < FREI_STUFEN_MAX;

/**
 * Eine weitere Stufe: 50 EUR ueber der hoechsten Schwelle (die erste bei
 * 50 EUR) — der Betrag bleibt leer, den traegt der Berater ein.
 */
export function stufeHinzu(stufen: readonly FreiStufe[]): FreiStufe[] {
  if (!stufeMoeglich(stufen)) return [...stufen];
  const hoechste = stufen.reduce((m, s) => Math.max(m, s.abMonat), 0);
  return [...stufen, { abMonat: hoechste + 50, betragMonat: 0 }];
}

/** Die Stufen, die etwas geben, aufsteigend — wie der Rechenkern sie liest. */
export const wirksameStufen = (stufen: readonly FreiStufe[]) => freiStufenGeordnet(stufen).filter((s) => s.betragMonat > 0);

/** „ab 50 € Umwandlung 25 € im Monat, ab 70 € 30 €“ — leer ohne Stufen. */
export function stufenText(stufen: readonly FreiStufe[]): string {
  return wirksameStufen(stufen).map((s, i) => (i === 0
    ? `ab ${euro(s.abMonat)} Umwandlung ${euro(s.betragMonat)} im Monat`
    : `ab ${euro(s.abMonat)} ${euro(s.betragMonat)}`)).join(', ');
}

/** „20 % der Umwandlung (höchstens 80 € im Monat)“ — leer ohne Anteil. */
export function anteilText(m: Pick<FreiRegelEingabe, 'quote' | 'deckelMonat'>): string {
  if (m.quote <= 0) return '';
  return `${prozent(m.quote)} der Umwandlung${m.deckelMonat > 0 ? ` (höchstens ${euro(m.deckelMonat)} im Monat)` : ''}`;
}

/** Die Regel in einem Satzteil — fuer Annahmen, Versorgungsordnung und Betriebs-Check. */
export function freiRegelKurz(m: FreiRegelEingabe): string {
  const stufen = stufenText(m.stufen);
  const teile = [stufen ? `fester Zuschuss ${stufen}` : '', anteilText(m)].filter(Boolean);
  return teile.length > 0 ? teile.join('; dazu ') : 'nur der gesetzliche Pflichtzuschuss';
}

/**
 * Was an der Eingabe auffaellt — bevor gerechnet wird: zwei Stufen auf
 * derselben Schwelle (die untere Zeile gilt) und eine Stufe, die weniger gibt
 * als die davor.
 */
export function freiRegelHinweise(m: FreiRegelEingabe): string[] {
  const h: string[] = [];
  const schwellen = m.stufen.map((s) => s.abMonat);
  const doppelt = schwellen.find((ab, i) => schwellen.indexOf(ab) !== i);
  if (doppelt !== undefined) {
    h.push(`Zwei Stufen beginnen bei ${euro(doppelt)} — es gilt die untere Zeile.`);
  }
  const geordnet = freiStufenGeordnet(m.stufen);
  const faellt = geordnet.find((s, i) => i > 0 && s.betragMonat + 0.005 < geordnet[i - 1]!.betragMonat);
  if (faellt) {
    h.push(`Ab ${euro(faellt.abMonat)} gibt es weniger als in der Stufe davor — wer mehr umwandelt, bekäme weniger.`);
  }
  return h;
}

const zahl = (v: unknown, min: number, max: number): number =>
  (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : 0);

/** Eine Regel aus gespeichertem JSON (Browser, Adresse) — fremde Werte werden begrenzt, Unlesbares faellt weg. */
export function freiRegelAus(roh: unknown): FreiRegelEingabe {
  if (!roh || typeof roh !== 'object') return { ...FREI_LEER, stufen: [] };
  const m = roh as Record<string, unknown>;
  const stufen = Array.isArray(m.stufen)
    ? m.stufen.filter((s): s is Record<string, unknown> => !!s && typeof s === 'object').slice(0, FREI_STUFEN_MAX)
      .map((s) => ({ abMonat: zahl(s.abMonat, 0, 10_000), betragMonat: zahl(s.betragMonat, 0, 10_000) }))
    : [];
  return { quote: zahl(m.quote, 0, 1), deckelMonat: zahl(m.deckelMonat, 0, 10_000), stufen };
}
