import type { Vertrag, VertragsTyp } from '@renten/engine';

/**
 * Die Beschriftungen der Vertragsarten — EINE Quelle fuer Bildschirm und
 * Papier. Standen bis dahin nur in Vertraege.tsx; das Gutachten haette sie
 * sonst nachgebaut, und dann stuenden auf dem Ausdruck andere Woerter als in
 * der Eingabemaske.
 */
export const TYPEN: Record<1 | 2 | 3, { wert: VertragsTyp; text: string }[]> = {
  1: [{ wert: 'basis', text: 'Rürup / Basisrente' }],
  2: [
    { wert: 'bav', text: 'bAV (laufende Rente)' },
    { wert: 'bavUkasse', text: 'Unterstützungskasse / Direktzusage' },
    { wert: 'bavKapital', text: 'bAV (Kapitalauszahlung)' },
    { wert: 'riester', text: 'Riester-Rente' },
    { wert: 'avd', text: 'Altersvorsorgedepot (ab 2027)' },
  ],
  3: [
    { wert: 'prvRente', text: 'Private Rente (monatlich)' },
    { wert: 'prvKapital', text: 'Private Rente (Kapitalwahl)' },
    { wert: 'immobilie', text: 'Vermietete Immobilie' },
    { wert: 'etf', text: 'Wertpapierdepot (ETF)' },
  ],
};

export const SCHICHT_TITEL: Record<1 | 2 | 3, string> = {
  1: 'Schicht 1 — Basisversorgung',
  2: 'Schicht 2 — Betrieblich und gefördert',
  3: 'Schicht 3 — Privat',
};

export function istKapital(t: VertragsTyp) {
  return t === 'bavKapital' || t === 'prvKapital';
}

/**
 * "Kapitalauszahlung" gibt es nur beim Depot. Bei Ruerup ist eine Kapitalwahl
 * gesetzlich ausgeschlossen (§ 10 EStG verlangt eine lebenslange Rente), bei
 * bAV und privater Rente gibt es dafuer eigene Vertragsarten.
 */
export const STRATEGIEN: Record<'etf' | 'avd' | 'sonst', { wert: Vertrag['strategie']; text: string }[]> = {
  etf: [
    { wert: 'rente', text: 'Als laufende Rente ins Netto' },
    { wert: 'planer', text: 'Kapital in den Entnahmeplaner' },
    { wert: 'kapital', text: 'Kapitalauszahlung (einmalig)' },
  ],
  avd: [
    { wert: 'rente', text: 'Als laufende Rente ins Netto' },
    { wert: 'ignorieren', text: 'Nicht einrechnen' },
  ],
  sonst: [
    { wert: 'rente', text: 'Als laufende Rente ins Netto' },
    { wert: 'planer', text: 'Kapital in den Entnahmeplaner' },
    { wert: 'ignorieren', text: 'Nicht einrechnen' },
  ],
};

/** Klartext fuer eine Vertragsart, unabhaengig von der Schicht. */
export function typText(t: VertragsTyp): string {
  for (const schicht of [1, 2, 3] as const) {
    const treffer = TYPEN[schicht].find((x) => x.wert === t);
    if (treffer) return treffer.text;
  }
  return t;
}

/** Klartext fuer die gewaehlte Verwendung. */
export function strategieText(v: Vertrag): string {
  const gruppe = v.typ === 'etf' ? 'etf' : v.typ === 'avd' ? 'avd' : 'sonst';
  return STRATEGIEN[gruppe].find((x) => x.wert === v.strategie)?.text ?? v.strategie;
}
