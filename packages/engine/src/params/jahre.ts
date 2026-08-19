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
  bezugsgroesseMonat: 3535,
  rentenwert: 39.32,
  durchschnittsentgelt: 45358,
  pauschbetraege: { arbeitnehmer: 1230, versorgungsbezuege: 102, renten: 102, sonderausgaben: 36, sparer: 1000 },
  rvSatzGesamt: 0.186,
  avSatzGesamt: 0.026,
  riester: riesterStandard,
  abgeltungsteuersatz: 0.25,
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
  bezugsgroesseMonat: 3745,
  rentenwert: 40.79,
  durchschnittsentgelt: 50493,
  pauschbetraege: { arbeitnehmer: 1230, versorgungsbezuege: 102, renten: 102, sonderausgaben: 36, sparer: 1000 },
  rvSatzGesamt: 0.186,
  avSatzGesamt: 0.026,
  riester: riesterStandard,
  abgeltungsteuersatz: 0.25,
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
  bezugsgroesseMonat: 3955,
  rentenwert: 42.52,
  durchschnittsentgelt: 51944,
  pauschbetraege: { arbeitnehmer: 1230, versorgungsbezuege: 102, renten: 102, sonderausgaben: 36, sparer: 1000 },
  rvSatzGesamt: 0.186,
  avSatzGesamt: 0.026,
  riester: riesterStandard,
  abgeltungsteuersatz: 0.25,
};

export const BELEGTE_JAHRE: readonly LegalParameters[] = [
  PARAMETER_2024,
  PARAMETER_2025,
  PARAMETER_2026,
];

/** Juengster belegter Rechtsstand — Basis jeder Fortschreibung. */
export const BASISJAHR = PARAMETER_2026;
