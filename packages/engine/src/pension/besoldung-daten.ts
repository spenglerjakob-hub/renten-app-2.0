/**
 * Besoldungstabellen.
 *
 * WICHTIG — Datenlage:
 * Der Prototyp erzeugte die Besoldung aus einer linearen Formel
 * (Grundgehalt + (Stufe-1) * Schritt) und einem Laenderfaktor von +/-5 %.
 * Reale Tabellen sind nichtlinear, die Laenderunterschiede deutlich groesser
 * und der Familienzuschlag ist laenderspezifisch (Befund C3). Fuer A13 Bund
 * 2026 liegt die Formel des Prototyps rund 400-550 EUR/Monat zu niedrig.
 *
 * Jede Tabelle traegt daher ein `belegt`-Flag:
 *   belegt = true  -> amtliche Werte, im Ergebnis ohne Vorbehalt verwendbar
 *   belegt = false -> Naeherung; die Oberflaeche MUSS sie als solche kennzeichnen
 *
 * Eine neue Landestabelle einzupflegen ist ein reiner Daten-Commit.
 */

export interface BesoldungsGruppenTabelle {
  /** Monatliches Grundgehalt je Erfahrungsstufe, Index 0 = Stufe 1 */
  stufen: readonly number[];
}

export interface Familienzuschlag {
  /** Stufe 1: Verheiratete / Lebenspartnerschaft */
  stufe1: number;
  /** Zuschlag je Kind (Stufe 2 ff.) */
  jeKind: number;
}

export interface Besoldungstabelle {
  land: string;
  jahr: number;
  belegt: boolean;
  quelle: string;
  gruppen: Readonly<Record<string, BesoldungsGruppenTabelle>>;
  familienzuschlag: Familienzuschlag;
}

export const BESOLDUNGSGRUPPEN = [
  'A7', 'A8', 'A9', 'A10', 'A11', 'A12', 'A13', 'A14', 'A15', 'A16', 'B1', 'B2', 'B3',
] as const;
export type Besoldungsgruppe = (typeof BESOLDUNGSGRUPPEN)[number];

export const BUNDESLAENDER = [
  'Bund', 'Baden-Württemberg', 'Bayern', 'Berlin', 'Brandenburg', 'Bremen', 'Hamburg',
  'Hessen', 'Mecklenburg-Vorpommern', 'Niedersachsen', 'Nordrhein-Westfalen',
  'Rheinland-Pfalz', 'Saarland', 'Sachsen', 'Sachsen-Anhalt', 'Schleswig-Holstein',
  'Thüringen',
] as const;

/**
 * Naeherungsformel als Rueckfallebene fuer Laender ohne eingepflegte Tabelle.
 * Bewusst als solche gekennzeichnet — sie ist NICHT amtlich.
 */
const NAEHERUNG_BASIS: Record<string, { basis: number; schritt: number }> = {
  A7: { basis: 2700, schritt: 90 },   A8: { basis: 2900, schritt: 100 },
  A9: { basis: 3200, schritt: 110 },  A10: { basis: 3400, schritt: 130 },
  A11: { basis: 3800, schritt: 140 }, A12: { basis: 4100, schritt: 160 },
  A13: { basis: 4700, schritt: 180 }, A14: { basis: 4900, schritt: 210 },
  A15: { basis: 5800, schritt: 250 }, A16: { basis: 6400, schritt: 280 },
  B1: { basis: 7200, schritt: 0 },    B2: { basis: 8500, schritt: 0 },
  B3: { basis: 9000, schritt: 0 },
};

const LAENDERFAKTOR: Record<string, number> = {
  'Bund': 1.05, 'Baden-Württemberg': 1.04, 'Bayern': 1.05, 'Berlin': 0.98,
  'Brandenburg': 0.99, 'Bremen': 1.0, 'Hamburg': 1.03, 'Hessen': 1.04,
  'Mecklenburg-Vorpommern': 0.98, 'Niedersachsen': 1.0, 'Nordrhein-Westfalen': 1.0,
  'Rheinland-Pfalz': 1.01, 'Saarland': 0.99, 'Sachsen': 1.02, 'Sachsen-Anhalt': 0.99,
  'Schleswig-Holstein': 1.0, 'Thüringen': 0.99,
};

function naeherungstabelle(land: string, jahr: number): Besoldungstabelle {
  const f = LAENDERFAKTOR[land] ?? 1.0;
  const gruppen: Record<string, BesoldungsGruppenTabelle> = {};
  for (const g of BESOLDUNGSGRUPPEN) {
    const d = NAEHERUNG_BASIS[g]!;
    const stufen: number[] = [];
    const anzahl = g.startsWith('B') ? 1 : 8;
    for (let i = 0; i < anzahl; i++) stufen.push((d.basis + i * d.schritt) * f);
    gruppen[g] = { stufen };
  }
  return {
    land, jahr, belegt: false,
    quelle: 'Naeherung (lineare Fortschreibung, kein amtlicher Tabellenwert)',
    gruppen,
    familienzuschlag: { stufe1: 150, jeKind: 300 },
  };
}

/**
 * Amtlich belegte Tabellen.
 *
 * Stand der Bearbeitung: In der Entwicklungsumgebung waren die amtlichen
 * Quellen (gesetze-im-internet.de, dbb.de, Besoldungsrechner) ueber den
 * Netzwerk-Proxy nicht erreichbar. Verifiziert werden konnten bislang nur die
 * Eckwerte fuer A13 Bund 2026 (Stufe 1: 5.343,23 EUR, Stufe 8: 6.806,11 EUR).
 *
 * Solange eine Gruppe hier nicht vollstaendig hinterlegt ist, faellt
 * `besoldungstabelle()` auf die Naeherung zurueck und meldet belegt = false.
 * Das Einpflegen der vollstaendigen Tabellen fuer Bund und
 * Baden-Wuerttemberg ist damit ein reiner Daten-Commit ohne Codeaenderung.
 */
export const BELEGTE_TABELLEN: readonly Besoldungstabelle[] = [
  // Sobald die amtlichen Tabellen vorliegen, hier eintragen mit belegt: true.
];

/** Einzelne, bereits verifizierte Eckwerte — dienen als Regressionstest. */
export const VERIFIZIERTE_ECKWERTE = [
  { land: 'Bund', jahr: 2026, gruppe: 'A13', stufe: 1, betrag: 5343.23 },
  { land: 'Bund', jahr: 2026, gruppe: 'A13', stufe: 8, betrag: 6806.11 },
] as const;

export function besoldungstabelle(land: string, jahr: number): Besoldungstabelle {
  const belegt = BELEGTE_TABELLEN.find((t) => t.land === land && t.jahr === jahr);
  if (belegt) return belegt;
  return naeherungstabelle(land, jahr);
}
