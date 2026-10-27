import type { BeratungStatus } from '@renten/schema';
import type { UnterlagenArt, UnterschriftPerson } from '../lib/bav-beratung';

/**
 * Die Unterschrift am Bildschirm — was sich ohne Browser rechnen laesst: aus
 * den gezeichneten Strichen ein SVG-Pfad, sein Rahmen fuer den Druck, die
 * Pruefung wie in der Datenbank und welche Unterlagen eine Unterschrift
 * abdeckt (Migration 20261023120000).
 *
 * Gespeichert wird nur der Linienzug — keine Schreibdynamik wie Druck oder
 * Tempo.
 */

/** Ein Strich: Punkte in Pixeln des Feldes, [x, y]. */
export type Strich = readonly (readonly [number, number])[];

/** Die Breite, auf die jeder Zug normiert wird — so haengt er nicht an der Groesse des Feldes. */
export const ZUG_BREITE = 1000;
/** Dieselben Grenzen wie in der Datenbank (bav_unterschriften.zug). */
const ZUG_MUSTER = /^M[0-9MLQ. ]+$/;
const ZUG_MIN = 10;
const ZUG_MAX = 60000;
/** Punkte, die naeher beieinander liegen, traegt der Zug nicht — sie machen ihn nur laenger. */
const MIN_ABSTAND = 2;
/** So viel Linie muss es mindestens sein — ein versehentlicher Tupfer ist keine Unterschrift. */
const MIN_TINTE = 120;

const runde = (x: number) => Math.round(x * 10) / 10;
const begrenzt = (x: number, max: number) => Math.min(max, Math.max(0, x));

/** Die Punkte eines Strichs, normiert und ausgeduennt. */
function normiert(s: Strich, faktor: number, maxY: number): [number, number][] {
  const p: [number, number][] = [];
  for (const [x, y] of s) {
    const q: [number, number] = [runde(begrenzt(x * faktor, ZUG_BREITE)), runde(begrenzt(y * faktor, maxY))];
    const letzter = p[p.length - 1];
    if (!letzter || Math.hypot(q[0] - letzter[0], q[1] - letzter[1]) >= MIN_ABSTAND) p.push(q);
  }
  return p;
}

const paar = ([x, y]: readonly [number, number]) => `${x} ${y}`;
const mitte = (a: readonly [number, number], b: readonly [number, number]): [number, number] =>
  [runde((a[0] + b[0]) / 2), runde((a[1] + b[1]) / 2)];

/**
 * Die Striche als SVG-Pfad: auf die Breite 1000 normiert, dicht liegende
 * Punkte weggelassen, mit Q-Kurven ueber die Mittelpunkte geglaettet, auf
 * eine Nachkommastelle gerundet.
 */
export function zugAusStrichen(striche: readonly Strich[], breite: number, hoehe: number): string {
  if (!(breite > 0) || !(hoehe > 0)) return '';
  const faktor = ZUG_BREITE / breite;
  const maxY = runde(hoehe * faktor);
  let zug = '';
  for (const s of striche) {
    const [erster, ...innen] = normiert(s, faktor, maxY);
    if (!erster) continue;
    zug += `M${paar(erster)}`;
    const letzter = innen.pop();
    if (!letzter) {
      // Ein Punkt (etwa auf dem i) bekommt ein winziges Stueck Linie, sonst zeichnet ihn niemand.
      zug += `L${paar([runde(begrenzt(erster[0] + 1, ZUG_BREITE)), erster[1]])}`;
      continue;
    }
    // Jeder innere Punkt lenkt die Kurve; sie endet in der Mitte zum naechsten.
    innen.forEach((punkt, i) => { zug += `Q${paar(punkt)} ${paar(mitte(punkt, innen[i + 1] ?? letzter))}`; });
    zug += `L${paar(letzter)}`;
  }
  return zug;
}

/** Wie viel Linie die Striche haben, gemessen auf der Breite 1000. */
export function tinte(striche: readonly Strich[], breite: number): number {
  if (!(breite > 0)) return 0;
  const faktor = ZUG_BREITE / breite;
  let summe = 0;
  for (const s of striche) {
    s.forEach((p, i) => {
      const vorher = s[i - 1];
      if (vorher) summe += Math.hypot((p[0] - vorher[0]) * faktor, (p[1] - vorher[1]) * faktor);
    });
  }
  return summe;
}

export const tinteGenug = (striche: readonly Strich[], breite: number) => tinte(striche, breite) >= MIN_TINTE;

/** Derselbe Test wie in der Datenbank. */
export function zugGueltig(zug: string): boolean {
  return zug.length >= ZUG_MIN && zug.length <= ZUG_MAX && ZUG_MUSTER.test(zug);
}

/**
 * Der Rahmen der Linien, mit etwas Rand — als viewBox. So fuellt die
 * Unterschrift im Druck die Zeile, gleich wie klein sie gezeichnet wurde.
 * Die Zahlen stehen paarweise (x y), auch in den Q-Kurven.
 */
export function zugRahmen(zug: string): { x: number; y: number; breite: number; hoehe: number } | null {
  if (!zugGueltig(zug)) return null;
  const z = (zug.match(/[0-9.]+/g) ?? []).map(Number);
  const xs = z.filter((_, i) => i % 2 === 0);
  const ys = z.filter((_, i) => i % 2 === 1);
  if (ys.length === 0) return null;
  const kleinste = (w: number[]) => w.reduce((a, b) => Math.min(a, b), Infinity);
  const groesste = (w: number[]) => w.reduce((a, b) => Math.max(a, b), -Infinity);
  const minX = kleinste(xs); const maxX = groesste(xs);
  const minY = kleinste(ys); const maxY = groesste(ys);
  const rand = 8;
  // Eine fast gerade Linie bekaeme sonst einen Rahmen ohne Hoehe — sie stuende riesig in der Zeile.
  const breite = Math.max(maxX - minX, 60) + 2 * rand;
  const hoehe = Math.max(maxY - minY, 30) + 2 * rand;
  return { x: runde(minX - rand), y: runde(minY - rand), breite: runde(breite), hoehe: runde(hoehe) };
}

/** Welche Unterlagen eine Unterschrift abdeckt — wie der Trigger in der Datenbank. */
export function dokumenteFuer(status: BeratungStatus, person: UnterschriftPerson, axa = false): UnterlagenArt[] {
  if (status === 'offen') return [];
  // Im AXA-Antrag unterschreibt der Berater mit: Einwilligung und AXA-Gespraechsprotokoll (wie die Datenbank es zaehlt).
  if (person === 'berater') return axa && status === 'teilnahme' ? ['protokoll', 'vereinbarung'] : ['protokoll'];
  return ['protokoll', status === 'teilnahme' ? 'vereinbarung' : 'verzicht'];
}

export const DOKUMENT_NAME: Record<UnterlagenArt, string> = {
  protokoll: 'Beratungsprotokoll',
  vereinbarung: 'Vereinbarung über Entgeltumwandlung',
  verzicht: 'Erklärung zum Verzicht auf die Entgeltumwandlung',
};
/** Bei AXA steht an Stelle der Vereinbarung der AXA-Antrag (axa-antrag.tsx). */
export const AXA_ANTRAG_NAME = 'AXA-Antrag auf Entgeltumwandlung';

/** „Beratungsprotokoll und Vereinbarung über Entgeltumwandlung“ */
export function dokumenteText(arten: readonly UnterlagenArt[], axa = false): string {
  const namen = arten.map((a) => (axa && a === 'vereinbarung' ? AXA_ANTRAG_NAME : DOKUMENT_NAME[a]));
  return namen.length <= 1 ? (namen[0] ?? '') : `${namen.slice(0, -1).join(', ')} und ${namen[namen.length - 1]}`;
}

// Die Zeit gilt in Deutschland — auch wenn das Geraet anders eingestellt ist.
const DATUM = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' });
const UHRZEIT = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });

/** „23.10.2026 um 14:32 Uhr“ */
export function zeitpunktText(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${DATUM.format(d)} um ${UHRZEIT.format(d)} Uhr`;
}

/** Der Vermerk unter der Linie. */
export function vermerkText(name: string, iso: string): string {
  return `Elektronisch unterschrieben von ${name.trim()} am ${zeitpunktText(iso)}`;
}

/** Die ersten 16 Zeichen der Pruefsumme in Vierergruppen — zum Abgleichen von Papier und Ablage. */
export function pruefsummeKurz(hex: string): string {
  return (hex.slice(0, 16).match(/.{1,4}/g) ?? []).join(' ');
}
