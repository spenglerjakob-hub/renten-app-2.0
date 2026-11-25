/**
 * VORBEREITUNG UND GESPRAECH — welche Seiten der Mitarbeiter zu sehen bekommt.
 *
 * Eine Beratung wird OHNE den Mitarbeiter vorbereitet: Der Berater traegt
 * ein, was er vorab weiss, und geht alle Schritte durch. Mit „Gespräch
 * starten“ waehlt er, welche Seiten er zeigt. Was abgewaehlt ist, wird im
 * Gespraech uebersprungen — nicht jeder muss seine Versorgungsluecke sehen,
 * und die Angaben standen schon vorher fest.
 *
 * EINE SEITE ist ein Stueck eines Schritts (`components/Ablauf.tsx`), so wie
 * es im Ablauf als eigene Ansicht aufgeht. Ein Schritt, dessen Seiten alle
 * ausgeblendet sind, steht im Gespraech gar nicht da; die uebrigen zaehlen
 * dann neu durch („Schritt 2 von 4“).
 *
 * IMMER DABEI sind der Beitrag — um ihn geht es — und der Abschluss:
 * Entscheidung und Unterschrift. Ohne sie gaebe es kein Gespraech.
 *
 * Ausgeblendet ist nur die ANSICHT. Die Daten bleiben, die Rechnung laeuft
 * mit allem, und die Unterlagen drucken wie immer jede Seite.
 *
 * Vertiefungen („Anbieter und Bedingungen“, „Kennzahlen und Fazit“) stehen
 * nicht zur Wahl: Sie liegen ohnehin nicht auf dem Weg und oeffnen sich nur
 * auf Wunsch — solange ihr Schritt gezeigt wird.
 */
import type { Sprache } from '../lib/sprache';

export const SCHRITTE = [
  'Angebot', 'Ihre Angaben', 'Versorgungslücke', 'Ihre Rechnung', 'Leistung im Alter', 'Entscheidung', 'Unterlagen',
] as const;

/** Dieselben sieben auf Englisch — fuer den Bildschirm einer Beratung auf Englisch (`lib/sprache.tsx`). */
export const SCHRITTE_EN = [
  'Your offer', 'Your details', 'Pension gap', 'Your calculation', 'Benefits in retirement', 'Decision', 'Documents',
] as const;

/** Die Namen der Schritte, wie der Mitarbeiter sie liest. Die Auswahl der Seiten (Berater) bleibt deutsch. */
export const schrittNamen = (sprache: Sprache): readonly string[] => (sprache === 'en' ? SCHRITTE_EN : SCHRITTE);

/** Unter diesem Namen merkt sich der Ablauf, wo die Stuecke eines Schritts stehen (`Stuecke` in `schritte.tsx`). */
export const KENNUNGEN = ['angebot', 'angaben', 'luecke', 'rechnung', 'leistung', 'entscheidung', 'unterlagen'] as const;

export type Kennung = (typeof KENNUNGEN)[number];

export interface GespraechSeite {
  /** Die ID des Stuecks im Schritt — mit `jeVertrag` ihr Anfang („vertrag-direkt“, „vertrag-ukasse“) */
  id: string;
  titel: string;
  /** Je Vertrag ein Stueck: Die Seite steht fuer alle, deren ID so beginnt */
  jeVertrag?: boolean;
  /** Immer dabei — nicht abwaehlbar */
  immer?: boolean;
}

/** Die Seiten jedes Schritts, in der Reihenfolge des Wegs. Die IDs sind die der Stuecke in `schritte.tsx`. */
export const GESPRAECH_SEITEN: Record<Kennung, readonly GespraechSeite[]> = {
  angebot: [{ id: 'angebot', titel: 'Ihr Angebot' }],
  angaben: [
    { id: 'person', titel: 'Zur Person' },
    { id: 'einkommen', titel: 'Einkommen, Steuer und Krankenversicherung' },
    { id: 'vorsorge', titel: 'Bisherige Vorsorge' },
  ],
  luecke: [{ id: 'luecke', titel: 'Ihre Versorgungslücke' }],
  rechnung: [
    { id: 'beitrag', titel: 'Ihr Beitrag', immer: true },
    { id: 'abrechnung', titel: 'Probeabrechnung' },
    { id: 'spaeter', titel: 'Später beginnen?' },
  ],
  leistung: [
    { id: 'vertrag', titel: 'Ihr Vertrag', jeVertrag: true },
    { id: 'luecke', titel: 'Ihre Versorgungslücke mit Betriebsrente' },
  ],
  entscheidung: [
    { id: 'wahl', titel: 'Die Entscheidung', immer: true },
    { id: 'axa', titel: 'Für den AXA-Antrag', immer: true },
    { id: 'empfehlung', titel: 'Empfehlung und Ort', immer: true },
  ],
  unterlagen: [{ id: 'unterlagen', titel: 'Unterschrift und Unterlagen', immer: true }],
};

/** So steht eine Seite in `gespraech.ausgeblendet`. */
export const seitenSchluessel = (kennung: Kennung, id: string) => `${kennung}.${id}`;

const waehlbar = (kennung: Kennung) => GESPRAECH_SEITEN[kennung].filter((s) => !s.immer);

/** Alle abwaehlbaren Seiten — „Nur das Nötigste“ blendet genau diese aus. */
export const ALLE_WAEHLBAREN: readonly string[] = KENNUNGEN.flatMap(
  (k) => waehlbar(k).map((s) => seitenSchluessel(k, s.id)),
);

/**
 * Eine gespeicherte Auswahl, wie diese Fassung sie versteht: nur Seiten, die
 * es gibt und die sich abwaehlen lassen, jede einmal, in der Reihenfolge des
 * Wegs. Was eine andere Fassung dazugeschrieben hat, faellt weg — die Seite
 * wird dann gezeigt.
 */
export function bereinigt(ausgeblendet: readonly string[] | undefined): string[] {
  const menge = new Set(ausgeblendet ?? []);
  return ALLE_WAEHLBAREN.filter((s) => menge.has(s));
}

/** Die Seite, zu der ein Stueck gehoert — null fuer Vertiefungen und alles, was nicht zur Wahl steht. */
function seiteVon(kennung: Kennung, stueckId: string): GespraechSeite | null {
  return GESPRAECH_SEITEN[kennung].find(
    (s) => s.id === stueckId || (s.jeVertrag === true && stueckId.startsWith(`${s.id}-`)),
  ) ?? null;
}

/** Ist dieses Stueck im Gespraech ausgeblendet? Was nicht zur Wahl steht, nie. */
export function stueckAusgeblendet(ausgeblendet: ReadonlySet<string>, kennung: Kennung, stueckId: string): boolean {
  const seite = seiteVon(kennung, stueckId);
  return seite !== null && !seite.immer && ausgeblendet.has(seitenSchluessel(kennung, seite.id));
}

/** Steht der Schritt im Gespraech da? Sobald eine seiner Seiten gezeigt wird. */
export function schrittSichtbar(ausgeblendet: ReadonlySet<string>, kennung: Kennung): boolean {
  return GESPRAECH_SEITEN[kennung].some((s) => s.immer || !ausgeblendet.has(seitenSchluessel(kennung, s.id)));
}

/** Die Nummern (0–6) der Schritte, die im Gespraech dastehen. Nie leer: Rechnung, Entscheidung, Unterlagen. */
export function sichtbareSchritte(ausgeblendet: ReadonlySet<string>): number[] {
  return KENNUNGEN.flatMap((k, i) => (schrittSichtbar(ausgeblendet, k) ? [i] : []));
}

/**
 * Der Schritt, der gezeigt wird, wenn `schritt` selbst ausgeblendet ist: der
 * naechste sichtbare danach — das Gespraech geht nach vorn —, sonst der letzte.
 */
export function gezeigterSchritt(sichtbar: readonly number[], schritt: number): number {
  if (sichtbar.includes(schritt)) return schritt;
  return sichtbar.find((i) => i > schritt) ?? sichtbar[sichtbar.length - 1] ?? schritt;
}

/** Wie viele sichtbare Schritte bis einschliesslich `weit` erreicht sind — als Index in `sichtbar`. */
export function weitSichtbar(sichtbar: readonly number[], weit: number): number {
  let n = 0;
  sichtbar.forEach((i, j) => { if (i <= weit) n = j; });
  return n;
}

/** Eine Seite zeigen oder ausblenden. Feste Seiten bleiben, wie sie sind. */
export function seiteSetzen(ausgeblendet: readonly string[], kennung: Kennung, id: string, zeigen: boolean): string[] {
  const schluessel = seitenSchluessel(kennung, id);
  if (!ALLE_WAEHLBAREN.includes(schluessel)) return bereinigt(ausgeblendet);
  return bereinigt(zeigen ? ausgeblendet.filter((s) => s !== schluessel) : [...ausgeblendet, schluessel]);
}

/**
 * Die Seite eines Stuecks wieder zeigen — fuer Verweise, die im Gespraech auf
 * eine ausgeblendete fuehren („es fehlt noch das Geburtsdatum“).
 */
export function stueckZeigen(ausgeblendet: readonly string[], kennung: Kennung, stueckId: string): string[] {
  const seite = seiteVon(kennung, stueckId);
  return seite ? seiteSetzen(ausgeblendet, kennung, seite.id, true) : bereinigt(ausgeblendet);
}

/** Alle abwaehlbaren Seiten eines Schritts auf einmal. */
export function schrittSetzen(ausgeblendet: readonly string[], kennung: Kennung, zeigen: boolean): string[] {
  const seiten = waehlbar(kennung).map((s) => seitenSchluessel(kennung, s.id));
  return bereinigt(zeigen ? ausgeblendet.filter((s) => !seiten.includes(s)) : [...ausgeblendet, ...seiten]);
}

/**
 * Wie viel eines Schritts gezeigt wird — fuer sein Sammel-Kaestchen.
 * „fest“: Der Schritt hat nichts Abwaehlbares (Entscheidung, Unterlagen).
 */
export function schrittStand(ausgeblendet: ReadonlySet<string>, kennung: Kennung): 'alle' | 'einige' | 'keine' | 'fest' {
  const seiten = waehlbar(kennung);
  if (seiten.length === 0) return 'fest';
  const gezeigt = seiten.filter((s) => !ausgeblendet.has(seitenSchluessel(kennung, s.id))).length;
  return gezeigt === seiten.length ? 'alle' : gezeigt === 0 ? 'keine' : 'einige';
}

/** Wie viele Seiten gezeigt werden — die festen mitgezaehlt, der Abschluss als je eine. */
export function gezeigteSeiten(ausgeblendet: ReadonlySet<string>): number {
  return KENNUNGEN.reduce((n, k) => {
    const seiten = GESPRAECH_SEITEN[k];
    // Entscheidung und Unterlagen zaehlen als eine Seite: So stehen sie auch in der Auswahl.
    if (seiten.every((s) => s.immer)) return n + 1;
    return n + seiten.filter((s) => s.immer || !ausgeblendet.has(seitenSchluessel(k, s.id))).length;
  }, 0);
}

/* ---------- Die zuletzt benutzte Auswahl ---------- */

/**
 * Was der Berater beim letzten Gespraech gewaehlt hat, gilt als Vorgabe fuer
 * das naechste — bei dreissig Mitarbeitern einer Firma waehlt er einmal.
 * Im Browser gemerkt: Es ist eine Gewohnheit dieses Arbeitsplatzes, keine
 * Angabe der Beratung. Nur Seitennamen, nichts ueber Personen.
 */
const SPEICHER = 'mb.gespraech.ausgeblendet';

export function letzteAuswahl(): string[] {
  try {
    const roh: unknown = JSON.parse(localStorage.getItem(SPEICHER) ?? '[]');
    return Array.isArray(roh) ? bereinigt(roh.filter((x): x is string => typeof x === 'string')) : [];
  } catch {
    return [];
  }
}

export function auswahlMerken(ausgeblendet: readonly string[]): void {
  try {
    localStorage.setItem(SPEICHER, JSON.stringify(bereinigt(ausgeblendet)));
  } catch {
    // Ohne Speicher (privates Fenster) gilt beim naechsten Mal wieder „alle Seiten“.
  }
}
