import type { KvStatus, KvErwerb } from './social/kv-pv.js';
import type { AvdKind } from './products/altersvorsorgedepot.js';
import type { PkvAnnahmen } from './social/pkv.js';

export type PersonId = 'A' | 'B';
export type Versorgungsart = 'grv' | 'pension';

/**
 * Die Vertragsart sagt, WAS es ist — nicht, wie es ausgezahlt wird.
 *
 * „bAV (Kapitalauszahlung)" und „Private Rente (Kapitalwahl)" waren bis
 * hierher eigene Arten. Damit liess sich derselbe Vertrag nicht in beiden
 * Wegen erfassen: Man musste sich beim Anlegen entscheiden und konnte nie
 * vergleichen. Der Weg steht jetzt in `strategie`, der Betrag in
 * `kapitalAlternative`; gespeicherte Dateien schreibt das Schema um.
 */
export type VertragsTyp =
  | 'basis'        // Ruerup — Kapitalwahl gesetzlich ausgeschlossen
  | 'bav'          // Direktversicherung/Pensionskasse
  | 'bavUkasse'    // Unterstuetzungskasse/Direktzusage (§ 19 Versorgungsbezug)
  | 'riester'
  | 'avd'          // Altersvorsorgedepot ab 2027
  | 'prvRente'
  | 'immobilie'
  | 'etf';

/**
 * Wie die Leistung in die Gesamtuebersicht eingeht.
 *
 * `rente`      — die laufende Rente des Anbieters (`brutto`)
 * `kapital`    — die Kapitalauszahlung (`kapitalAlternative`), einmalig
 * `verrenten`  — dieselbe Kapitalauszahlung, ueber feste Jahre verteilt
 * `planer`     — dieselbe Kapitalauszahlung in den Auszahlungs-Planer
 * `ignorieren` — gar nicht
 *
 * Beim Wertpapierdepot und beim Altersvorsorgedepot meint `kapital` den
 * Depotwert; dort gibt es keine Anbieterrente, die daneben stuende.
 */
export type Auszahlungsstrategie = 'rente' | 'planer' | 'kapital' | 'verrenten' | 'ignorieren';

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

  /** Monatliche BRUTTORENTE des Anbieters */
  brutto: number;
  /**
   * Was der Anbieter STATT der Rente einmalig auszahlen wuerde.
   *
   * Beide Wege stehen damit an einem Vertrag. `strategie` entscheidet,
   * welcher in die Gesamtuebersicht eingeht; der andere wird trotzdem
   * gerechnet, sonst gaebe es nichts zu vergleichen.
   */
  kapitalAlternative?: number;

  strategie: Auszahlungsstrategie;
  /** Vertragsabschluss vor 2005 (Steuerprivileg) */
  altvertrag: boolean;

  /** Kapitalauszahlung einer privaten Rentenversicherung: Beitragssumme */
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

export type GehaltsEingabe = 'brutto' | 'netto' | 'besoldung' | 'selbststaendig';

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
  /** Krankenversicherung IM RUHESTAND */
  kvStatus: KvStatus;
  /**
   * Individueller Zusatzbeitrag der Krankenkasse, z. B. 0.031 fuer 3,1 %.
   *
   * Ohne Angabe gilt der durchschnittliche Zusatzbeitrag des Rechtsstands.
   * Die Kassen weichen davon spuerbar ab, und der Satz wirkt auf beide
   * Lebensphasen: auf das Erwerbsnetto und auf die Beitraege im Alter.
   */
  zusatzbeitrag?: number;
  /**
   * Krankenversicherung in der ERWERBSPHASE.
   *
   * Getrennt gefuehrt, weil beides auseinanderfallen kann: Wer als
   * Selbststaendiger freiwillig gesetzlich versichert ist, kommt im Ruhestand
   * in die KVdR — und dort gilt eine ganz andere Rechnung.
   */
  kvErwerb: KvErwerb;
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
  /** Monatsbetrag bei brutto/netto, Gewinn bei selbststaendig */
  betrag: number;
  /** Anzahl Auszahlungen p. a. */
  auszahlungen: number;
  besoldungsgruppe: string;
  besoldungsstufe: number;
  besoldungsland: string;
  /** Nur bei `selbststaendig`: zahlt in die gesetzliche Rentenversicherung ein */
  grvPflicht: boolean;
  /** Nur bei `selbststaendig`: monatlicher eigener Beitrag zur GRV */
  grvBeitragMonat: number;
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
