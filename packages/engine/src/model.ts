import type { KvStatus } from './social/kv-pv.js';
import type { AvdKind } from './products/altersvorsorgedepot.js';
import type { PkvAnnahmen } from './social/pkv.js';

export type PersonId = 'A' | 'B';
export type Versorgungsart = 'grv' | 'pension';

export type VertragsTyp =
  | 'basis'        // Ruerup
  | 'bav'          // Direktversicherung/Pensionskasse, laufende Rente
  | 'bavUkasse'    // Unterstuetzungskasse/Direktzusage (§ 19 Versorgungsbezug)
  | 'bavKapital'
  | 'riester'
  | 'avd'          // Altersvorsorgedepot ab 2027
  | 'prvRente'
  | 'prvKapital'
  | 'immobilie'
  | 'etf';

/**
 * 'kapital' gibt es derzeit nur beim Wertpapierdepot: der Betrag zaehlt nicht
 * zur laufenden Rente, wird aber als einmalige Nettoauszahlung ausgewiesen.
 * Bei Ruerup ist eine Kapitalwahl gesetzlich ausgeschlossen, bei den uebrigen
 * Arten gibt es dafuer eigene Vertragstypen (bavKapital, prvKapital).
 */
export type Auszahlungsstrategie = 'rente' | 'planer' | 'kapital' | 'ignorieren';

export interface Teilzeitphase {
  id: string;
  bezeichnung: string;
  vonJahr: number;
  bisJahr: number;
  beschaeftigungsgrad: number;
}

export interface Person {
  id: PersonId;
  name: string;
  /** ISO-Datum yyyy-mm-dd */
  geburtsdatum: string;
  rentenbeginn: string;
  art: Versorgungsart;

  /** GRV: heutiger monatlicher Bruttoanspruch */
  grvBruttoHeute: number;

  /** Pension */
  besoldungsgruppe: string;
  besoldungsstufe: number;
  ruhegehaltssatz: number;
  dienstbeginn: string;
  teilzeitphasen: Teilzeitphase[];
}

export interface Vertrag {
  id: string;
  inhaber: PersonId;
  schicht: 1 | 2 | 3;
  typ: VertragsTyp;
  name: string;

  /** Monatliche Bruttorente bzw. Bruttokapital, je nach Typ */
  brutto: number;

  strategie: Auszahlungsstrategie;
  /** Vertragsabschluss vor 2005 (Steuerprivileg) */
  altvertrag: boolean;

  /** prvKapital / bavKapital */
  beginnJahr?: number;
  monatsbeitrag?: number;
  dynamik?: number;

  /** immobilie */
  bewirtschaftungskostenProzent?: number;

  /** etf */
  kapitalHeute?: number;
  sparrate?: number;
  renditeAnsparphase?: number;
  renditeEntnahme?: number;
  ter?: number;
  ausgabeaufschlag?: number;
  depotgebuehrJahr?: number;
  entnahmedauer?: number;
  sonderzahlung?: number;
  sonderzahlungJahr?: number;
  /** Aktienfonds 30 %, Mischfonds 15 %, sonst 0 */
  teilfreistellung?: number;
  /** Einstandswert des heutigen Kapitals (fuer die Gewinnermittlung) */
  einstandswert?: number;
}

export interface Annahmen {
  /** Alle als Dezimalzahl, z. B. 0.02 fuer 2 % */
  inflation: number;
  rentendynamik: number;
  /** Fortschreibung der steuerlichen Eckwerte ("Tarif auf Raedern") */
  tarifIndex: number;
  gehaltsdynamik: number;
}

export type GehaltsEingabe = 'brutto' | 'netto' | 'besoldung';

export interface Haushalt {
  verheiratet: boolean;
  bundesland: string;
  kirchensteuer: boolean;
  hatKinder: boolean;
  kinderUnter25: number;
  /**
   * Die Kinder mit Geburtsjahr und Ausbildungsdauer — massgeblich dafuer, wie
   * lange die Kinderzulage laeuft. `kinderUnter25` daneben steuert
   * Pflegeversicherung und Kinderfreibetrag; beide muessen zusammenpassen.
   */
  kinder: AvdKind[];
  kvStatus: KvStatus;
  /**
   * Die private Krankenversicherung mit ihrem Verlauf ueber die Zeit.
   *
   * Loest das fruehere `pkvPraemieMonat` ab: eine einzelne Zahl liess sich
   * nicht fortschreiben, und genau das fehlte — die Praemie lief unveraendert
   * durch jedes Jahr der Zeitachse.
   */
  pkv: PkvAnnahmen;
  /** Zielnetto in heutiger Kaufkraft */
  zielNettoHeute: number;
}

export interface EinkommenHeute {
  modus: GehaltsEingabe;
  /** Monatsbetrag bei brutto/netto */
  betrag: number;
  /** Anzahl Auszahlungen p. a. */
  auszahlungen: number;
  besoldungsgruppe: string;
  besoldungsstufe: number;
  besoldungsland: string;
}

export interface Entnahmeplaner {
  startkapital: number;
  dauerJahre: number;
  rendite: number;
  dynamik: number;
  insNettoEinrechnen: boolean;
}

export interface Szenario {
  schemaVersion: 1;
  haushalt: Haushalt;
  annahmen: Annahmen;
  einkommenHeute: EinkommenHeute;
  /** true: getrennte Einkommen je Partner (siehe einkommenPartner) */
  einkommenGetrennt?: boolean;
  einkommenPartner?: EinkommenHeute;
  personen: Person[];
  vertraege: Vertrag[];
  planer: Entnahmeplaner;
}
