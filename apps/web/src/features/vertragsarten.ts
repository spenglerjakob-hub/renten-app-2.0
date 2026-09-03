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
    { wert: 'bav', text: 'bAV (Direktversicherung / Pensionskasse)' },
    { wert: 'bavUkasse', text: 'Unterstützungskasse / Direktzusage' },
    { wert: 'riester', text: 'Riester-Rente' },
    { wert: 'avd', text: 'Altersvorsorgedepot (ab 2027)' },
  ],
  3: [
    { wert: 'prvRente', text: 'Private Rentenversicherung' },
    { wert: 'immobilie', text: 'Vermietete Immobilie' },
    { wert: 'etf', text: 'Wertpapierdepot (ETF)' },
  ],
};

export const SCHICHT_TITEL: Record<1 | 2 | 3, string> = {
  1: 'Schicht 1 — Basisversorgung',
  2: 'Schicht 2 — Betrieblich und gefördert',
  3: 'Schicht 3 — Privat',
};

/**
 * Bietet diese Vertragsart neben der Rente eine Kapitalauszahlung an?
 *
 * Frueher waren das zwei Vertragsarten; damit liess sich derselbe Vertrag
 * nicht in beiden Wegen erfassen und nie vergleichen. Jetzt entscheidet die
 * Auszahlungsstrategie, welcher Weg in die Gesamtuebersicht eingeht.
 */
export function kenntKapitalwahl(t: VertragsTyp) {
  return t === 'bav' || t === 'prvRente';
}

/** Nutzt dieser Vertrag seinen Kapitalweg? */
export function istKapital(v: Vertrag) {
  return kenntKapitalwahl(v.typ)
    && (v.strategie === 'kapital' || v.strategie === 'verrenten' || v.strategie === 'planer');
}

/** Vorgaben der Verrentung, wenn am Vertrag nichts anderes eingetragen ist. */
export const VERRENTUNG_JAHRE = 25;
export const VERRENTUNG_RENDITE = 0.02;

/**
 * Bei Ruerup ist eine Kapitalwahl gesetzlich ausgeschlossen (§ 10 EStG
 * verlangt eine lebenslange Rente); laufende Renten haben keinen Kapitalstock
 * zu verteilen. Deshalb gibt es "Kapitalauszahlung (einmalig)" nur dort, wo
 * tatsaechlich ein Betrag auf einmal faellig wird: beim Depot und bei den
 * beiden Kapitalvertragsarten.
 */
export const STRATEGIEN: Record<
  'etf' | 'avd' | 'kapitalwahl' | 'sonst',
  { wert: Vertrag['strategie']; text: string }[]
> = {
  etf: [
    { wert: 'rente', text: 'Als laufende Rente ins Netto' },
    { wert: 'planer', text: 'Kapital in den Entnahmeplaner' },
    { wert: 'kapital', text: 'Kapitalauszahlung (einmalig)' },
  ],
  avd: [
    { wert: 'rente', text: 'Als laufende Rente ins Netto' },
    { wert: 'ignorieren', text: 'Nicht einrechnen' },
  ],
  /*
    Der Vertrag traegt beide Betraege; hier wird gewaehlt, welcher in die
    Gesamtuebersicht eingeht. Der andere wird trotzdem gerechnet — sonst
    gaebe es nichts zu vergleichen.
  */
  kapitalwahl: [
    { wert: 'rente', text: 'Laufende Rente des Anbieters' },
    { wert: 'kapital', text: 'Kapitalauszahlung (einmalig)' },
    { wert: 'verrenten', text: 'Kapital über feste Jahre verrenten' },
    { wert: 'planer', text: 'Kapital in den Entnahmeplaner' },
    { wert: 'ignorieren', text: 'Nicht einrechnen' },
  ],
  sonst: [
    { wert: 'rente', text: 'Als laufende Rente ins Netto' },
    { wert: 'planer', text: 'Kapital in den Entnahmeplaner' },
    { wert: 'ignorieren', text: 'Nicht einrechnen' },
  ],
};

/** Welche Strategieliste zu einer Vertragsart gehoert. */
export function strategieGruppe(t: VertragsTyp): keyof typeof STRATEGIEN {
  if (t === 'etf') return 'etf';
  if (t === 'avd') return 'avd';
  if (kenntKapitalwahl(t)) return 'kapitalwahl';
  return 'sonst';
}

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
  const treffer = STRATEGIEN[strategieGruppe(v.typ)].find((x) => x.wert === v.strategie);
  if (!treffer) return v.strategie;
  if (v.strategie === 'verrenten') {
    return `Kapital über ${v.entnahmedauer ?? VERRENTUNG_JAHRE} Jahre verrentet`;
  }
  return treffer.text;
}
