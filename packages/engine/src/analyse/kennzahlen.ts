/**
 * Kennzahlen einer Vorsorge-Zahlungsreihe.
 *
 * Herausgeloest aus dem Vertrags-TUEV, weil inzwischen zwei Stellen dieselben
 * Zahlen brauchen: der TUEV selbst und die Seite zum Altersvorsorgedepot.
 * Zwei getrennte Implementierungen wuerden frueher oder spaeter
 * auseinanderlaufen — und nichts ist unglaubwuerdiger als eine Anwendung, die
 * denselben Vertrag an zwei Stellen verschieden bewertet.
 */

export interface Zahlungsreihe {
  /** Netto-Aufwand je Jahr der Ansparphase */
  einzahlungenJeJahr: readonly number[];
  /** Laufende Netto-Auszahlung je Jahr der Auszahlphase */
  auszahlungJeJahr: number;
  jahreAuszahlung: number;
  /**
   * Einmalige Netto-Auszahlung zu Rentenbeginn.
   *
   * Frueher galt: entweder Kapital ODER Rente. Das Altersvorsorgedepot kann
   * beides zugleich — bis zu 30 % auf einen Schlag, der Rest als Auszahlplan.
   * Deshalb werden beide Stroeme addiert statt sich fuer einen zu entscheiden.
   */
  kapitalEinmalig: number;
}

/**
 * Interner Zinsfuss der Netto-Zahlungsreihe: Einzahlungen negativ waehrend der
 * Ansparphase, Auszahlungen positiv danach. Bisektion, weil die Reihe genau
 * einen Vorzeichenwechsel hat und damit monoton im Zins ist.
 */
export function internerZins(r: Zahlungsreihe): number {
  const n = r.einzahlungenJeJahr.length;
  if (n === 0) return 0;

  const kapitalwert = (zins: number) => {
    let npv = 0;
    for (let t = 0; t < n; t++) npv -= r.einzahlungenJeJahr[t]! / Math.pow(1 + zins, t + 1);
    // Der Einmalbetrag faellt im Jahr des Rentenbeginns an, ...
    if (r.kapitalEinmalig > 0) npv += r.kapitalEinmalig / Math.pow(1 + zins, n);
    // ... die laufende Auszahlung in den Jahren danach.
    for (let t = 1; t <= r.jahreAuszahlung; t++) {
      npv += r.auszahlungJeJahr / Math.pow(1 + zins, n + t);
    }
    return npv;
  };

  let lo = -0.5, hi = 0.5;
  if (kapitalwert(lo) < 0) return lo;
  if (kapitalwert(hi) > 0) return hi;

  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (kapitalwert(mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export interface Kennzahlen {
  summeEinzahlung: number;
  summeAuszahlung: number;
  /** Summe Auszahlung / Summe Einzahlung. Unter 1 = Verlustgeschaeft. */
  nettoHebel: number;
  /** Effektive Nettorendite p. a. als Dezimalzahl */
  rendite: number;
  echterGewinn: number;
  /** Jahre ab Rentenbeginn, bis die Einzahlungen zurueckgeflossen sind */
  amortisationsJahre: number;
}

/** Alle Kennzahlen einer Netto-Zahlungsreihe auf einmal. */
export function kennzahlen(r: Zahlungsreihe): Kennzahlen {
  const summeEinzahlung = r.einzahlungenJeJahr.reduce((sum, x) => sum + x, 0);
  const summeAuszahlung = r.kapitalEinmalig + r.auszahlungJeJahr * r.jahreAuszahlung;

  const nettoHebel = summeEinzahlung > 0 ? summeAuszahlung / summeEinzahlung : 0;
  const rendite = summeEinzahlung > 0 && summeAuszahlung > 0 ? internerZins(r) : 0;

  // Der Einmalbetrag zaehlt sofort gegen die Einzahlungen; erst der Rest muss
  // ueber die laufende Rente hereinkommen.
  const offen = Math.max(0, summeEinzahlung - r.kapitalEinmalig);
  const amortisationsJahre = r.auszahlungJeJahr > 0 ? offen / r.auszahlungJeJahr : 0;

  return {
    summeEinzahlung,
    summeAuszahlung,
    nettoHebel,
    rendite,
    echterGewinn: summeAuszahlung - summeEinzahlung,
    amortisationsJahre,
  };
}
