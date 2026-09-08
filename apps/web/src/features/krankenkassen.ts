/**
 * DIE GESETZLICHEN KRANKENKASSEN UND IHRE ZUSATZBEITRAEGE.
 *
 * Warum diese Liste ueberhaupt: Der Zusatzbeitrag ist die einzige Angabe der
 * Krankenversicherung, die von Kasse zu Kasse abweicht — 2026 zwischen
 * 2,18 % und 4,39 % bei einem Durchschnitt von 2,9 %. Ueber eine
 * Hochrechnung von dreissig Jahren macht das einen vierstelligen
 * Unterschied. Die wenigsten Kunden kennen den Satz ihrer Kasse auswendig;
 * im Beratungsgespraech ist eine Auswahl schneller als das Nachschlagen.
 *
 * WIE DIE LISTE ZU PFLEGEN IST. Die Saetze aendern sich zum Jahreswechsel,
 * einzelne Kassen passen auch unterjaehrig an. `KASSEN_STAND` sagt, worauf
 * sich die Liste bezieht, und wird in der Oberflaeche angezeigt — eine
 * undatierte Liste veralteter Saetze waere schlimmer als gar keine.
 *
 * GESPEICHERT WIRD DER SATZ, NICHT DIE KASSE. Die Auswahl schreibt den
 * Prozentwert ins Szenario; die Kasse steht nur als Beschriftung daneben.
 * Ein Gutachten von heute soll auch dann noch dieselben Zahlen zeigen, wenn
 * die Kasse im Januar erhoeht — sonst aendert sich rueckwirkend ein
 * Dokument, das jemand ausgedruckt und weitergegeben hat.
 */
export interface Krankenkasse {
  name: string;
  /** Individueller Zusatzbeitrag als Dezimalwert, z. B. 0.0329 fuer 3,29 % */
  zusatzbeitrag: number;
}

/** Worauf sich die Saetze beziehen. Steht so auch in der Oberflaeche. */
export const KASSEN_STAND = 'Zusatzbeiträge 2026';

/**
 * Die Kassen, alphabetisch — so sucht man eine Kasse, nicht nach Beitragshoehe.
 *
 * Geprueft beim Eintragen: Jeder Zusatzbeitrag plus der allgemeine Satz von
 * 14,6 % ergibt genau den Beitragssatz 2026 der Vorlage, keine Kasse steht
 * doppelt, und die Spanne von 2,18 % bis 4,39 % deckt sich mit dem, was
 * unabhaengig dazu veroeffentlicht ist.
 *
 * Die Liste ist eine BEQUEMLICHKEIT, keine Rechengroesse: Wer seine Kasse
 * nicht findet oder einen abweichenden Satz hat, traegt ihn weiter von Hand
 * ein.
 */
export const KRANKENKASSEN: readonly Krankenkasse[] = [
  { name: 'AOK Baden-Württemberg', zusatzbeitrag: 0.0299 },
  { name: 'AOK Bayern', zusatzbeitrag: 0.0269 },
  { name: 'AOK Bremen und Bremerhaven', zusatzbeitrag: 0.0329 },
  { name: 'AOK Hessen', zusatzbeitrag: 0.0298 },
  { name: 'AOK Niedersachsen', zusatzbeitrag: 0.0298 },
  { name: 'AOK Nordost', zusatzbeitrag: 0.035 },
  { name: 'AOK NordWest', zusatzbeitrag: 0.0299 },
  { name: 'AOK Plus', zusatzbeitrag: 0.031 },
  { name: 'AOK Rheinland-Pfalz/Saarland', zusatzbeitrag: 0.0247 },
  { name: 'AOK Rheinland/Hamburg', zusatzbeitrag: 0.0329 },
  { name: 'AOK Sachsen-Anhalt', zusatzbeitrag: 0.0289 },
  { name: 'Audi BKK', zusatzbeitrag: 0.026 },
  { name: 'BAHN BKK', zusatzbeitrag: 0.0365 },
  { name: 'BARMER', zusatzbeitrag: 0.0329 },
  { name: 'Bertelsmann BKK', zusatzbeitrag: 0.032 },
  { name: 'BIG direkt gesund', zusatzbeitrag: 0.0369 },
  { name: 'BKK 24', zusatzbeitrag: 0.0439 },
  { name: 'BKK Akzo Nobel', zusatzbeitrag: 0.0339 },
  { name: 'BKK Diakonie', zusatzbeitrag: 0.038 },
  { name: 'BKK DürkoppAdler', zusatzbeitrag: 0.0388 },
  { name: 'BKK Euregio', zusatzbeitrag: 0.0339 },
  { name: 'BKK exklusiv', zusatzbeitrag: 0.0349 },
  { name: 'BKK Faber-Castell & Partner', zusatzbeitrag: 0.0248 },
  { name: 'BKK firmus', zusatzbeitrag: 0.0218 },
  { name: 'BKK Freudenberg', zusatzbeitrag: 0.0299 },
  { name: 'BKK GILDEMEISTER SEIDENSTICKER', zusatzbeitrag: 0.034 },
  { name: 'BKK HERKULES', zusatzbeitrag: 0.0438 },
  { name: 'BKK Linde', zusatzbeitrag: 0.0299 },
  { name: 'BKK Melitta HMR', zusatzbeitrag: 0.039 },
  { name: 'BKK PFAFF', zusatzbeitrag: 0.0278 },
  { name: 'BKK Pfalz', zusatzbeitrag: 0.039 },
  { name: 'BKK ProVita', zusatzbeitrag: 0.0379 },
  { name: 'BKK Public', zusatzbeitrag: 0.025 },
  { name: 'BKK SBH', zusatzbeitrag: 0.0279 },
  { name: 'BKK Scheufelen', zusatzbeitrag: 0.0399 },
  { name: 'BKK Technoform', zusatzbeitrag: 0.0349 },
  { name: 'BKK VDN', zusatzbeitrag: 0.0319 },
  { name: 'BKK VerbundPlus', zusatzbeitrag: 0.0389 },
  { name: 'BKK Werra-Meissner', zusatzbeitrag: 0.0435 },
  { name: 'BKK WIRTSCHAFT UND FINANZEN', zusatzbeitrag: 0.0399 },
  { name: 'Bosch BKK', zusatzbeitrag: 0.0318 },
  { name: 'DAK-Gesundheit', zusatzbeitrag: 0.032 },
  { name: 'Debeka BKK', zusatzbeitrag: 0.0325 },
  { name: 'Die BERGISCHE', zusatzbeitrag: 0.0379 },
  { name: 'Die Continentale BKK', zusatzbeitrag: 0.0333 },
  { name: 'energie-BKK', zusatzbeitrag: 0.0398 },
  { name: 'Heimat Krankenkasse', zusatzbeitrag: 0.039 },
  { name: 'HEK', zusatzbeitrag: 0.0289 },
  { name: 'hkk', zusatzbeitrag: 0.0259 },
  { name: 'IKK - Die Innovationskasse', zusatzbeitrag: 0.043 },
  { name: 'IKK Brandenburg und Berlin', zusatzbeitrag: 0.0435 },
  { name: 'IKK classic', zusatzbeitrag: 0.0385 },
  { name: 'IKK gesund plus', zusatzbeitrag: 0.0339 },
  { name: 'IKK Südwest', zusatzbeitrag: 0.0387 },
  { name: 'KKH Kaufmännische Krankenkasse', zusatzbeitrag: 0.0378 },
  { name: 'Knappschaft', zusatzbeitrag: 0.043 },
  { name: 'mhplus Krankenkasse', zusatzbeitrag: 0.0386 },
  { name: 'mkk - meine krankenkasse', zusatzbeitrag: 0.035 },
  { name: 'Mobil Krankenkasse', zusatzbeitrag: 0.0389 },
  { name: 'Novitas BKK', zusatzbeitrag: 0.036 },
  { name: 'Pronova BKK', zusatzbeitrag: 0.037 },
  { name: 'R + V BKK', zusatzbeitrag: 0.0349 },
  { name: 'Salus BKK', zusatzbeitrag: 0.0329 },
  { name: 'SBK', zusatzbeitrag: 0.038 },
  { name: 'SECURVITA', zusatzbeitrag: 0.039 },
  { name: 'SKD BKK', zusatzbeitrag: 0.0298 },
  { name: 'Techniker Krankenkasse', zusatzbeitrag: 0.0269 },
  { name: 'TUI BKK', zusatzbeitrag: 0.025 },
  { name: 'VIACTIV Krankenkasse', zusatzbeitrag: 0.0419 },
  { name: 'vivida bkk', zusatzbeitrag: 0.0379 },
  { name: 'WMF BKK', zusatzbeitrag: 0.0285 },
  { name: 'ZF BKK', zusatzbeitrag: 0.034 },
];

/** Die Kasse zu einem Namen — `undefined`, wenn es sie nicht (mehr) gibt. */
export function kasseNach(name: string): Krankenkasse | undefined {
  return KRANKENKASSEN.find((k) => k.name === name);
}
