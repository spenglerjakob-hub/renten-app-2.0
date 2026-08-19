/**
 * Renten- und Versorgungsfreibetrag.
 *
 * Zentrale Eigenschaft beider Freibetraege: Sie werden EINMAL im Jahr des
 * Versorgungsbeginns ermittelt und dann als absoluter EURO-Betrag auf
 * Lebenszeit eingefroren. Weil die Bezuege danach weiter steigen, waechst der
 * steuerpflichtige Anteil Jahr fuer Jahr — das Netto waechst also LANGSAMER
 * als das Brutto.
 *
 * Der Prototyp berechnete die Freibetraege korrekt, wandte sie aber nur auf das
 * erste Rentenjahr an und liess das Netto anschliessend mit derselben Rate
 * wachsen wie das Brutto (Befund B1). Ueber 25 Rentenjahre ueberschaetzte das
 * die spaeteren Nettobezuege erheblich. Deshalb liefern die Funktionen hier
 * einen eingefrorenen Jahresbetrag, den die Projektion in jedem Folgejahr
 * unveraendert gegen das gestiegene Brutto rechnet.
 */

export interface EingefrorenerFreibetrag {
  /** Auf Lebenszeit festgeschriebener steuerfreier Jahresbetrag in EUR */
  jahresbetrag: number;
  /** Nur zur Anzeige: der Prozentsatz der Kohorte */
  prozentsatz: number;
  /** Nur bei Versorgungsbezuegen: Hoechstbetrag und Zuschlag der Kohorte */
  hoechstbetrag?: number;
  zuschlag?: number;
  /** Bei Renten: steuerpflichtiger Anteil der Kohorte */
  besteuerungsanteil?: number;
  kohortenjahr: number;
}

/**
 * Versorgungsfreibetrag § 19 Abs. 2 EStG inkl. Zuschlag.
 * Abschmelzung nach Wachstumschancengesetz 2024: ab 2023 in Schritten von
 * 0,4 Prozentpunkten, Hoechstbetrag -30 EUR, Zuschlag -9 EUR pro Jahrgang;
 * Nulldurchgang 2058.
 */
export function versorgungsfreibetrag(
  versorgungsbeginnJahr: number,
  massgebenderJahresbetrag: number,
): EingefrorenerFreibetrag {
  let pct: number, max: number, zuschlag: number;

  if (versorgungsbeginnJahr <= 2005) {
    pct = 0.40; max = 3000; zuschlag = 900;
  } else if (versorgungsbeginnJahr <= 2020) {
    const s = versorgungsbeginnJahr - 2005;
    pct = 0.40 - s * 0.016; max = 3000 - s * 120; zuschlag = 900 - s * 36;
  } else if (versorgungsbeginnJahr <= 2022) {
    const s = versorgungsbeginnJahr - 2020;
    pct = 0.16 - s * 0.008; max = 1200 - s * 60; zuschlag = 360 - s * 18;
  } else {
    const s = versorgungsbeginnJahr - 2022;
    pct = Math.max(0, 0.144 - s * 0.004);
    max = Math.max(0, 1080 - s * 30);
    zuschlag = Math.max(0, 324 - s * 9);
  }

  const freibetrag = Math.min(massgebenderJahresbetrag * pct, max);
  return {
    jahresbetrag: freibetrag + zuschlag,
    prozentsatz: pct,
    hoechstbetrag: max,
    zuschlag,
    kohortenjahr: versorgungsbeginnJahr,
  };
}

/**
 * Besteuerungsanteil der gesetzlichen Rente § 22 Nr. 1 S. 3 EStG.
 * Wachstumschancengesetz: ab 2023 Anstieg um 0,5 Prozentpunkte je Jahrgang,
 * beginnend bei 82,5 %, 100 % ab 2058.
 */
export function besteuerungsanteilRente(rentenbeginnJahr: number): number {
  if (rentenbeginnJahr <= 2005) return 0.50;
  if (rentenbeginnJahr <= 2020) return Math.min(1, 0.50 + (rentenbeginnJahr - 2005) * 0.02);
  if (rentenbeginnJahr <= 2022) return Math.min(1, 0.80 + (rentenbeginnJahr - 2020) * 0.01);
  return Math.min(1, 0.82 + (rentenbeginnJahr - 2022) * 0.005);
}

/**
 * Rentenfreibetrag.
 *
 * @param massgebenderJahresbetrag Jahresbetrag der Rente im ERSTEN VOLLEN
 *   Kalenderjahr des Rentenbezugs — nicht im (ggf. unterjaehrigen) Startjahr.
 *   Der Prototyp nutzte den Startjahresbetrag und unterschaetzte den
 *   eingefrorenen Freibetrag dadurch leicht (Befund C10).
 */
export function rentenfreibetrag(
  rentenbeginnJahr: number,
  massgebenderJahresbetrag: number,
): EingefrorenerFreibetrag {
  const anteil = besteuerungsanteilRente(rentenbeginnJahr);
  return {
    jahresbetrag: massgebenderJahresbetrag * (1 - anteil),
    prozentsatz: 1 - anteil,
    besteuerungsanteil: anteil,
    kohortenjahr: rentenbeginnJahr,
  };
}

/**
 * Altersentlastungsbetrag § 24a EStG.
 *
 * Gilt fuer Einkuenfte, die WEDER Rente NOCH Versorgungsbezug sind — also
 * Mieteinkuenfte, Ertragsanteilsrenten und Kapitalertraege. Ebenfalls
 * kohortenweise eingefroren und bis 2058 abschmelzend. Fehlte im Prototyp
 * vollstaendig (Befund B10).
 *
 * Anspruch besteht ab dem Jahr NACH Vollendung des 64. Lebensjahres.
 */
export function altersentlastungsbetrag(
  erstesAnspruchsjahr: number,
  begünstigteEinkuenfte: number,
): EingefrorenerFreibetrag {
  let pct: number, max: number;
  if (erstesAnspruchsjahr <= 2005) { pct = 0.40; max = 1900; }
  else if (erstesAnspruchsjahr <= 2020) {
    const s = erstesAnspruchsjahr - 2005;
    pct = 0.40 - s * 0.016; max = 1900 - s * 76;
  } else if (erstesAnspruchsjahr <= 2022) {
    const s = erstesAnspruchsjahr - 2020;
    pct = 0.16 - s * 0.008; max = 760 - s * 38;
  } else {
    const s = erstesAnspruchsjahr - 2022;
    pct = Math.max(0, 0.144 - s * 0.004);
    max = Math.max(0, 684 - s * 19);
  }
  return {
    jahresbetrag: Math.min(Math.max(0, begünstigteEinkuenfte) * pct, max),
    prozentsatz: pct,
    hoechstbetrag: max,
    kohortenjahr: erstesAnspruchsjahr,
  };
}

/**
 * Ertragsanteil einer Leibrente § 22 Nr. 1 S. 3 Buchst. a Doppelbuchst. bb.
 * Massgeblich ist das Alter bei Rentenbeginn.
 *
 * Der Prototyp hatte drei Tabellenwerte falsch (72/74/75) und pauschalisierte
 * unterhalb von 60 sowie oberhalb von 75 (Befund C1).
 */
const ERTRAGSANTEIL: Readonly<Record<number, number>> = {
  50: 0.30, 51: 0.29, 52: 0.29, 53: 0.28, 54: 0.27, 55: 0.26, 56: 0.26, 57: 0.25,
  58: 0.24, 59: 0.23, 60: 0.22, 61: 0.22, 62: 0.21, 63: 0.20, 64: 0.19, 65: 0.18,
  66: 0.18, 67: 0.17, 68: 0.16, 69: 0.15, 70: 0.15, 71: 0.14, 72: 0.13, 73: 0.13,
  74: 0.12, 75: 0.11, 76: 0.10, 77: 0.10, 78: 0.09, 79: 0.08, 80: 0.08,
  81: 0.07, 82: 0.07, 83: 0.06, 84: 0.06, 85: 0.05,
};

export function ertragsanteil(alterBeiRentenbeginn: number): number {
  const a = Math.floor(alterBeiRentenbeginn);
  if (a <= 50) return 0.30;
  if (a >= 85) return 0.05;
  return ERTRAGSANTEIL[a] ?? 0.18;
}
