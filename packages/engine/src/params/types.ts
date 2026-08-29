/**
 * Rechtsstands-Registry.
 *
 * Jeder Jahrgang buendelt saemtliche steuer- und sozialversicherungsrechtlichen
 * Groessen an EINER Stelle. Der fruehere Prototyp mischte Werte aus 2024, 2025
 * und 2026 in derselben Rechnung (Befund A4) — das ist hier strukturell
 * ausgeschlossen, weil die Projektion fuer jedes Kalenderjahr genau einen
 * Parametersatz zieht.
 */

/**
 * Der Einkommensteuertarif nach § 32a EStG wird NICHT ueber die amtlichen
 * Koeffizienten gepflegt, sondern ueber die vier Eckwerte:
 * Grundfreibetrag und die drei Zonengrenzen.
 *
 * Begruendung: Der Tarif ist so konstruiert, dass der Grenzsteuersatz bei
 * 14,00 % beginnt, an der Grenze Zone 2/3 bei 23,97 % liegt und am Ende der
 * Progression 42 % erreicht. Aus diesen Ankern plus den Zonengrenzen ergeben
 * sich alle quadratischen Koeffizienten und Abzugsbetraege eindeutig — die
 * Herleitung reproduziert die amtlichen Konstanten auf < 0,01 EUR genau
 * (siehe test/estg-tarif.test.ts).
 *
 * Vorteil: Der Tarif ist per Konstruktion STETIG. Der Sprung von 85 EUR bei
 * einem zvE von 17.005 EUR, den der Prototyp durch das Vermischen zweier
 * Tarifjahrgaenge erzeugte, kann so nicht mehr entstehen.
 */
export interface EstTarifEckwerte {
  /** Ende der Nullzone (§ 32a Abs. 1 Nr. 1) */
  grundfreibetrag: number;
  /** Ende der ersten Progressionszone */
  zone2Ende: number;
  /** Ende der zweiten Progressionszone (Beginn Proportionalzone 42 %) */
  zone3Ende: number;
  /** Ende der 42-%-Zone (ab dem Folge-Euro greift die "Reichensteuer") */
  zone4Ende: number;
}

export interface SoliParameter {
  /** 5,5 % der Einkommensteuer */
  satz: number;
  /** Freigrenze der ESt, bis zu der kein SolZ anfaellt (Grundtarif) */
  freigrenze: number;
  /** Obergrenze der Milderungszone (Grundtarif) */
  milderungszoneEnde: number;
  /** Anteil, mit dem der die Freigrenze uebersteigende Betrag belastet wird */
  milderungssatz: number;
}

export interface KvParameter {
  /** Allgemeiner Beitragssatz § 241 SGB V */
  allgemeinerSatz: number;
  /** Durchschnittlicher Zusatzbeitrag § 242a SGB V */
  zusatzbeitrag: number;
}

export interface PvParameter {
  satz: number;
  /** Zuschlag fuer Kinderlose, allein vom Mitglied getragen */
  kinderloseZuschlag: number;
  /** Abschlag je Kind ab dem 2. bis zum 5. Kind (bis Vollendung 25. Lj.) */
  abschlagJeKind: number;
  maxKinderAbschlaege: number;
  /** Arbeitnehmeranteil in Sachsen abweichend (Buss- und Bettag) */
  arbeitnehmerAnteilSachsenAufschlag: number;
}

export interface Pauschbetraege {
  /** § 9a Nr. 1a — Arbeitnehmer-Pauschbetrag */
  arbeitnehmer: number;
  /** § 9a Nr. 1b — Werbungskosten bei Versorgungsbezuegen */
  versorgungsbezuege: number;
  /** § 9a Nr. 3 — Werbungskosten bei sonstigen Einkuenften (Renten) */
  renten: number;
  /** § 10c — Sonderausgaben-Pauschbetrag */
  sonderausgaben: number;
  /** § 20 Abs. 9 — Sparer-Pauschbetrag (Einzelveranlagung) */
  sparer: number;
}

export interface LegalParameters {
  jahr: number;
  /** true, wenn der Satz aus dem letzten belegten Jahr fortgeschrieben wurde */
  extrapoliert: boolean;
  /** Menschenlesbare Herkunft, erscheint im PDF */
  quelle: string;

  est: EstTarifEckwerte;
  soli: SoliParameter;
  kv: KvParameter;
  pv: PvParameter;

  /** Beitragsbemessungsgrenzen, JAHRESwerte */
  bbgKvJahr: number;
  bbgRvJahr: number;

  /** Monatliche Bezugsgroesse (West) — Basis fuer Freibetrag/Freigrenze bAV */
  bezugsgroesseMonat: number;
  /** Aktueller Rentenwert in EUR je Entgeltpunkt und Monat */
  rentenwert: number;
  /** Vorlaeufiges Durchschnittsentgelt § 69 Abs. 2 SGB VI */
  durchschnittsentgelt: number;

  pauschbetraege: Pauschbetraege;

  /** Beitragssaetze Arbeitnehmeranteil */
  rvSatzGesamt: number;
  avSatzGesamt: number;

  /** Riester: Grundzulage und Sonderausgaben-Hoechstbetrag § 10a */
  riester: { grundzulage: number; kinderzulageAb2008: number; kinderzulageVor2008: number; hoechstbetrag: number; mindesteigenbeitragQuote: number; sockelbetrag: number };

  /** Abgeltungsteuer § 32d */
  abgeltungsteuersatz: number;

  /** Altersvorsorgedepot ab 2027 */
  avd: AvdParameter;
}

/**
 * Altersvorsorgedepot (gefoerdertes Altersvorsorgedepot ab 01.01.2027).
 *
 * Gesetzgebungsstand: Bundestag 27.03.2026, Bundesrat 08.05.2026, Anwendung
 * ab dem 01.01.2027. Die Zulagenlogik ist damit final. Die Betraege nennt das
 * Gesetz als FESTE Euro-Werte ohne Indexierungsmechanismus — sie werden
 * deshalb bei der Fortschreibung bewusst NICHT hochgeschrieben, anders als
 * Tarifeckwerte und Beitragsbemessungsgrenzen.
 */
export interface AvdParameter {
  /** Erstes Jahr, in dem das Depot gefoerdert werden kann */
  abJahr: number;
  /** Ohne diesen Eigenbeitrag im Jahr entfaellt die Foerderung vollstaendig */
  mindesteigenbeitragJahr: number;
  /** Erste Stufe: 50 % auf die ersten 360 EUR */
  stufe1Grenze: number;
  stufe1Satz: number;
  /** Zweite Stufe: 25 % auf die weiteren 1 440 EUR */
  stufe2Grenze: number;
  stufe2Satz: number;
  /** Zulage je kindergeldberechtigtem Kind */
  kinderzulage: number;
  /** Einmaliger Berufseinsteigerbonus */
  berufseinsteigerbonus: number;
  /** Hoechstalter fuer den Bonus (Vollendung) */
  berufseinsteigerAlterMax: number;
  /** Fruehestes Auszahlungsalter */
  auszahlungAbAlter: number;
  /** Ein Auszahlplan muss mindestens bis zu diesem Alter laufen */
  auszahlplanBisAlter: number;
  /**
   * Sonderausgaben-Hoechstbetrag § 10a.
   *
   * ANNAHME, nicht belegt: Die zugaenglichen Quellen widersprechen sich
   * (3 000 EUR gegenueber 6 840 EUR). Angesetzt wird der unstrittige Teil —
   * Eigenbeitrag bis zur oberen Stufengrenze zuzueglich Zulagen. Sobald der
   * amtliche Wert vorliegt, ist es genau diese eine Zahl.
   */
  hoechstbetragAnnahme: number;
  /** true, solange der Hoechstbetrag nicht amtlich belegt ist */
  hoechstbetragUnsicher: boolean;
}
