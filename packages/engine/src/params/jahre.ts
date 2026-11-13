import type { LegalParameters } from './types.js';

/**
 * Belegte Rechtsstaende. Die jaehrliche Aktualisierung ist damit ein reiner
 * Daten-Commit — kein Eingriff in Rechenlogik.
 *
 * Pflegehinweis: Beim Anlegen eines neuen Jahrgangs genuegen fuer den
 * Steuertarif die vier Eckwerte. Die Tests in test/estg-tarif.test.ts pruefen
 * Stetigkeit, Monotonie und den Verlauf des Grenzsteuersatzes automatisch —
 * ein Zahlendreher faellt dort auf, nicht erst beim Nutzer.
 */

const soliStandard = {
  satz: 0.055,
  freigrenze: 0,           // je Jahrgang gesetzt
  milderungszoneEnde: 0,   // je Jahrgang gesetzt
  milderungssatz: 0.119,
};

const riesterStandard = {
  grundzulage: 175,
  kinderzulageAb2008: 300,
  kinderzulageVor2008: 185,
  hoechstbetrag: 2100,
  mindesteigenbeitragQuote: 0.04,
  sockelbetrag: 60,
};

/**
 * Altersvorsorgedepot. Feste Betraege aus dem am 08.05.2026 verabschiedeten
 * Gesetz; in allen Jahrgaengen identisch, weil das Gesetz keine Indexierung
 * vorsieht. Vor 2027 gibt es das Produkt nicht — das steuert `abJahr`.
 */
const avdStandard = {
  abJahr: 2027,
  mindesteigenbeitragJahr: 120,
  stufe1Grenze: 360,
  stufe1Satz: 0.5,
  stufe2Grenze: 1800,
  stufe2Satz: 0.25,
  kinderzulage: 300,
  kinderzulageBisAlter: 18,
  kinderzulageBisAlterAusbildung: 25,
  berufseinsteigerbonus: 200,
  berufseinsteigerAlterMax: 25,
  auszahlungAbAlter: 65,
  auszahlplanBisAlter: 85,
  teilauszahlungMax: 0.3,
  hoechstbetragEigenbeitrag: 1800,
};

export const PARAMETER_2024: LegalParameters = {
  jahr: 2024,
  extrapoliert: false,
  quelle: 'EStG/SGB Rechtsstand 2024',
  est: { grundfreibetrag: 11604, zone2Ende: 17005, zone3Ende: 66760, zone4Ende: 277825 },
  soli: { ...soliStandard, freigrenze: 18130, milderungszoneEnde: 33320 },
  kv: { allgemeinerSatz: 0.146, zusatzbeitrag: 0.017 },
  pv: { satz: 0.034, kinderloseZuschlag: 0.006, abschlagJeKind: 0.0025, maxKinderAbschlaege: 4, arbeitnehmerAnteilSachsenAufschlag: 0.005 },
  bbgKvJahr: 62100,
  bbgRvJahr: 90600,
  hoechstbetragAltersvorsorge: 27566,
  bezugsgroesseMonat: 3535,
  rentenwert: 39.32,
  durchschnittsentgelt: 45358,
  pauschbetraege: { arbeitnehmer: 1230, versorgungsbezuege: 102, renten: 102, sonderausgaben: 36, sparer: 1000 },
  // Programmablaufplan 2024 (BMF)
  lohnsteuer: { w1Stkl5: 13279, w2Stkl5: 33380, w3Stkl5: 222260, entlastungAlleinerziehend: 4260 },
  rvSatzGesamt: 0.186,
  avSatzGesamt: 0.026,
  riester: riesterStandard,
  abgeltungsteuersatz: 0.25,
  // BMF-Schreiben vom 5.1.2024: Basiszins zum 2.1.2024 (§ 18 Abs. 4 InvStG)
  basiszins: 0.0229,
  avd: avdStandard,
};

export const PARAMETER_2025: LegalParameters = {
  jahr: 2025,
  extrapoliert: false,
  quelle: 'EStG/SGB Rechtsstand 2025 (Steuerfortentwicklungsgesetz)',
  est: { grundfreibetrag: 12096, zone2Ende: 17443, zone3Ende: 68480, zone4Ende: 277825 },
  soli: { ...soliStandard, freigrenze: 19950, milderungszoneEnde: 36660 },
  kv: { allgemeinerSatz: 0.146, zusatzbeitrag: 0.025 },
  pv: { satz: 0.036, kinderloseZuschlag: 0.006, abschlagJeKind: 0.0025, maxKinderAbschlaege: 4, arbeitnehmerAnteilSachsenAufschlag: 0.005 },
  bbgKvJahr: 66150,
  bbgRvJahr: 96600,
  hoechstbetragAltersvorsorge: 29344,
  bezugsgroesseMonat: 3745,
  rentenwert: 40.79,
  durchschnittsentgelt: 50493,
  pauschbetraege: { arbeitnehmer: 1230, versorgungsbezuege: 102, renten: 102, sonderausgaben: 36, sparer: 1000 },
  // Geaenderter Programmablaufplan 2025 (BMF, Januar 2025)
  lohnsteuer: { w1Stkl5: 13785, w2Stkl5: 34240, w3Stkl5: 222260, entlastungAlleinerziehend: 4260 },
  rvSatzGesamt: 0.186,
  avSatzGesamt: 0.026,
  riester: riesterStandard,
  abgeltungsteuersatz: 0.25,
  // BMF-Schreiben vom 10.1.2025: Basiszins zum 2.1.2025 (§ 18 Abs. 4 InvStG)
  basiszins: 0.0253,
  avd: avdStandard,
};

export const PARAMETER_2026: LegalParameters = {
  jahr: 2026,
  extrapoliert: false,
  quelle: 'EStG/SGB Rechtsstand 2026',
  est: { grundfreibetrag: 12348, zone2Ende: 17799, zone3Ende: 69878, zone4Ende: 277825 },
  soli: { ...soliStandard, freigrenze: 20350, milderungszoneEnde: 37400 },
  kv: { allgemeinerSatz: 0.146, zusatzbeitrag: 0.029 },
  pv: { satz: 0.036, kinderloseZuschlag: 0.006, abschlagJeKind: 0.0025, maxKinderAbschlaege: 4, arbeitnehmerAnteilSachsenAufschlag: 0.005 },
  bbgKvJahr: 69750,
  bbgRvJahr: 101400,
  hoechstbetragAltersvorsorge: 30826,
  bezugsgroesseMonat: 3955,
  rentenwert: 42.52,
  durchschnittsentgelt: 51944,
  pauschbetraege: { arbeitnehmer: 1230, versorgungsbezuege: 102, renten: 102, sonderausgaben: 36, sparer: 1000 },
  // Programmablaufplan 2026 (BMF, 12.11.2025)
  lohnsteuer: { w1Stkl5: 14071, w2Stkl5: 34939, w3Stkl5: 222260, entlastungAlleinerziehend: 4260 },
  rvSatzGesamt: 0.186,
  avSatzGesamt: 0.026,
  riester: riesterStandard,
  abgeltungsteuersatz: 0.25,
  // BMF-Schreiben vom 13.1.2026: Basiszins zum 2.1.2026 (§ 18 Abs. 4 InvStG)
  basiszins: 0.032,
  avd: avdStandard,
};

export const BELEGTE_JAHRE: readonly LegalParameters[] = [
  PARAMETER_2024,
  PARAMETER_2025,
  PARAMETER_2026,
];

/** Juengster belegter Rechtsstand — Basis jeder Fortschreibung. */
export const BASISJAHR = PARAMETER_2026;

/**
 * VORAB BEKANNTE WERTE eines Jahres, dessen Rechtsstand noch nicht vollstaendig ist.
 *
 * Im Herbst steht ein Teil des neuen Jahres schon fest — die Rechengroessen
 * der Sozialversicherung —, der Rest noch nicht: Steuertarif, Lohnsteuer-PAP,
 * Rentenwert, Basiszins. Einen Jahrgang mit `extrapoliert: false` legt man
 * erst an, wenn alles amtlich ist; ein halb belegter Jahrgang gaebe sich als
 * Rechtsstand aus, der er nicht ist.
 *
 * Bis dahin stehen die bekannten Werte hier. Die Fortschreibung
 * (`registry.ts`) nimmt sie AB IHREM JAHR statt der hochgerechneten und
 * schreibt sie fuer spaetere Jahre von dort aus fort. Alle uebrigen Felder
 * bleiben Fortschreibung aus dem Basisjahr, das Jahr bleibt `extrapoliert`.
 * Fuer belegte Jahre und fuer alles vor dem Vorab-Jahr aendert sich nichts —
 * die Werte gelten also von selbst ab dem 1. Januar.
 *
 * Sobald der volle Jahrgang angelegt ist, gehoeren die Vorabwerte des Jahres
 * GELOESCHT: Sie sind dann im Jahrgang aufgegangen. test/rechtsstand.test.ts
 * wacht darueber.
 */
export interface Vorabwerte {
  jahr: number;
  /** Kurz, haengt an `quelle` des fortgeschriebenen Jahres */
  quelle: string;
  /** Ein Satz fuer Bildschirm und Gutachten: was schon eingerechnet ist */
  text: string;
  werte: {
    bbgKvJahr?: number;
    bbgRvJahr?: number;
    hoechstbetragAltersvorsorge?: number;
    bezugsgroesseMonat?: number;
    durchschnittsentgelt?: number;
    rvSatzGesamt?: number;
    avSatzGesamt?: number;
    kv?: Partial<LegalParameters['kv']>;
    pv?: Partial<LegalParameters['pv']>;
  };
}

/**
 * 2027 — Stand 13.11.2026, VORLAEUFIG.
 *
 * Rechengroessen: Sozialversicherungsrechengroessen-Verordnung 2027, vom
 * Kabinett beschlossen und dem Bundesrat zugeleitet (BR-Drs. 576/26 vom
 * 07.10.2026); die Zustimmung des Bundesrats steht aus. Werte nach der
 * Uebersicht „Vorlaeufige Rechengroessen in der Sozialversicherung fuer das
 * Jahr 2027“ eines Versicherers (November 2026, Quellen dort: bmas.de,
 * deutsche-rentenversicherung.de). Nach der Verkuendung im Bundesgesetzblatt
 * gegenlesen.
 *
 * Pflegebeitrag fuer Kinderlose: 4,5 % statt 4,2 % — der Zuschlag steigt nach
 * dem Entwurf des Pflegeneuordnungsgesetzes von 0,6 auf 0,9 Punkte
 * (Kabinettsbeschluss; Bundestag und Bundesrat stehen aus). Faellt das Gesetz
 * anders aus, diese Zeile anpassen oder streichen.
 *
 * Unveraendert und deshalb nicht aufgefuehrt: RV 18,6 %, AV 2,6 %, KV 14,6 %,
 * PV 3,6 % (alle laut Uebersicht). Der durchschnittliche Zusatzbeitrag bleibt
 * nach der Mitteilung des BMG vom 30.10.2026 bei 2,9 % — die Bekanntmachung
 * im Bundesanzeiger beim Anlegen des Jahrgangs gegenlesen.
 *
 * Nicht im Rechtsstand gefuehrt: Versicherungspflichtgrenze 84.150 EUR,
 * Geringfuegigkeitsgrenze 633 EUR, endgueltiges Durchschnittsentgelt 2025
 * (49.147 EUR).
 *
 * Noch offen fuer den vollen Jahrgang: Steuertarif und Soli-Freigrenze
 * (Einkommensteuerreformgesetz 2027, noch nicht verabschiedet), Lohnsteuer-PAP,
 * Rentenwert ab 1. Juli 2027, Basiszins.
 */
export const VORAB_2027: Vorabwerte = {
  jahr: 2027,
  quelle: 'Rechengrößen der Sozialversicherung 2027 vorläufig eingerechnet',
  text: 'Für 2027 sind die vorläufigen Rechengrößen der Sozialversicherung schon eingerechnet: '
    + 'Beitragsbemessungsgrenzen, Bezugsgröße, Durchschnittsentgelt und der Pflegebeitrag für Kinderlose.',
  werte: {
    bbgRvJahr: 106_200, // 8.850 EUR im Monat
    bbgKvJahr: 76_500, // 6.375 EUR im Monat
    // § 10 Abs. 3 EStG: BBG knappschaftliche RV 130.800 EUR x 24,7 % = 32.307,60 -> aufgerundet
    hoechstbetragAltersvorsorge: 32_308,
    bezugsgroesseMonat: 4_130, // 49.560 EUR im Jahr
    durchschnittsentgelt: 53_452, // vorlaeufig, Anlage 1 SGB VI
    pv: { kinderloseZuschlag: 0.009 }, // 3,6 % + 0,9 % = 4,5 %
  },
};

/** Aufsteigend nach Jahr. Leer, sobald jeder Vorab-Jahrgang voll belegt ist. */
export const VORABWERTE: readonly Vorabwerte[] = [VORAB_2027];
