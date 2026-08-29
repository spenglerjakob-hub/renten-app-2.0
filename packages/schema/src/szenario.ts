import { z } from 'zod';

/**
 * Validierungsschema fuer ein Szenario.
 *
 * Dieselbe Definition gilt im Browser (Import/Export, localStorage) und im
 * Backend (Szenario-CRUD). Der Prototyp hatte kein Schema: `handleExport`
 * schrieb 45 Felder, `handleImport` stellte 13 davon wieder her und verwarf
 * den Rest stillschweigend (Befund A5).
 */

export const teilzeitphaseSchema = z.object({
  id: z.string(),
  bezeichnung: z.string().default('Teilzeit'),
  vonJahr: z.number().int().min(1900).max(2200),
  bisJahr: z.number().int().min(1900).max(2200),
  beschaeftigungsgrad: z.number().min(0).max(100),
});

/**
 * Datumspruefung. Die Form allein genuegt nicht: "99.99.9999" passt auf jedes
 * naive Muster, ist aber kein Datum. Geprueft wird deshalb der Kalender —
 * inklusive Schaltjahren.
 */
function istKalendarischGueltig(s: string): boolean {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const de = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  let j: number, m: number, t: number;
  if (iso) { j = +iso[1]!; m = +iso[2]!; t = +iso[3]!; }
  else if (de) { t = +de[1]!; m = +de[2]!; j = +de[3]!; }
  else return false;
  if (j < 1900 || j > 2200 || m < 1 || m > 12 || t < 1) return false;
  return t <= new Date(Date.UTC(j, m, 0)).getUTCDate();
}

const datumString = z
  .string()
  .refine(istKalendarischGueltig, 'Kein gueltiges Datum (erwartet TT.MM.JJJJ oder JJJJ-MM-TT)');

export const personSchema = z.object({
  id: z.enum(['A', 'B']),
  name: z.string().default(''),
  geburtsdatum: datumString,
  rentenbeginn: datumString,
  /**
   * true, sobald der Rentenbeginn von Hand gesetzt wurde. Dann laesst die
   * Automatik ihn in Ruhe — sonst ginge ein geplanter Vorruhestand verloren,
   * wenn nachtraeglich das Geburtsdatum korrigiert wird.
   * .default(false), damit frueher gespeicherte Dateien weiter laden.
   */
  rentenbeginnManuell: z.boolean().default(false),
  art: z.enum(['grv', 'pension']).default('grv'),
  grvBruttoHeute: z.number().min(0).default(0),
  besoldungsgruppe: z.string().default('A13'),
  besoldungsstufe: z.number().int().min(1).max(12).default(4),
  ruhegehaltssatz: z.number().min(0).max(71.75).default(71.75),
  dienstbeginn: datumString.default('2020-01-01'),
  teilzeitphasen: z.array(teilzeitphaseSchema).default([]),
});

export const vertragSchema = z.object({
  id: z.string(),
  inhaber: z.enum(['A', 'B']).default('A'),
  schicht: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  typ: z.enum(['basis', 'bav', 'bavUkasse', 'bavKapital', 'riester', 'prvRente', 'prvKapital', 'immobilie', 'etf']),
  name: z.string().default(''),
  brutto: z.number().min(0).default(0),
  strategie: z.enum(['rente', 'planer', 'kapital', 'ignorieren']).default('rente'),
  altvertrag: z.boolean().default(false),

  beginnJahr: z.number().int().min(1900).max(2200).optional(),
  monatsbeitrag: z.number().min(0).optional(),
  dynamik: z.number().min(-1).max(1).optional(),
  bewirtschaftungskostenProzent: z.number().min(0).max(100).optional(),

  kapitalHeute: z.number().min(0).optional(),
  sparrate: z.number().min(0).optional(),
  renditeAnsparphase: z.number().min(-1).max(1).optional(),
  renditeEntnahme: z.number().min(-1).max(1).optional(),
  ter: z.number().min(0).max(1).optional(),
  ausgabeaufschlag: z.number().min(0).max(1).optional(),
  depotgebuehrJahr: z.number().min(0).optional(),
  entnahmedauer: z.number().int().min(1).max(60).optional(),
  sonderzahlung: z.number().min(0).optional(),
  sonderzahlungJahr: z.number().int().min(1900).max(2200).optional(),
  teilfreistellung: z.number().min(0).max(1).optional(),
  einstandswert: z.number().min(0).optional(),
});

export const haushaltSchema = z.object({
  verheiratet: z.boolean().default(false),
  bundesland: z.string().default('Baden-Württemberg'),
  kirchensteuer: z.boolean().default(false),
  hatKinder: z.boolean().default(false),
  kinderUnter25: z.number().int().min(0).max(15).default(0),
  kvStatus: z.enum(['kvdr', 'freiwillig', 'pkv']).default('kvdr'),
  pkvPraemieMonat: z.number().min(0).default(0),
  zielNettoHeute: z.number().min(0).default(2000),
});

export const annahmenSchema = z.object({
  inflation: z.number().min(-0.1).max(0.2).default(0.02),
  rentendynamik: z.number().min(-0.1).max(0.2).default(0.01),
  tarifIndex: z.number().min(0).max(0.2).default(0.01),
  gehaltsdynamik: z.number().min(-0.1).max(0.2).default(0.02),
});

export const einkommenHeuteSchema = z.object({
  modus: z.enum(['brutto', 'netto', 'besoldung']).default('netto'),
  betrag: z.number().min(0).default(2500),
  auszahlungen: z.number().min(12).max(14).default(12),
  besoldungsgruppe: z.string().default('A13'),
  besoldungsstufe: z.number().int().min(1).max(12).default(4),
  besoldungsland: z.string().default('Baden-Württemberg'),
});

export const planerSchema = z.object({
  startkapital: z.number().min(0).default(0),
  dauerJahre: z.number().int().min(1).max(60).default(25),
  rendite: z.number().min(-1).max(1).default(0.02),
  dynamik: z.number().min(-1).max(1).default(0),
  insNettoEinrechnen: z.boolean().default(false),
});

/**
 * Ein zur Pruefung ausgewaehlter Vertrag im Vertrags-TUEV.
 *
 * Das Feld ist NEU. Es traegt deshalb `.default([])` im Szenario — sonst
 * liessen sich frueher gespeicherte Szenarien und Exportdateien nicht mehr
 * einlesen.
 */
export const tuevPositionSchema = z.object({
  id: z.string().min(1).max(64),
  /** Verweis auf den geprueften Vertrag */
  vertragId: z.string().min(1).max(64),
  beitragMonat: z.number().min(0).max(100_000).default(100),
  dynamik: z.number().min(-1).max(1).default(0),
  agZuschussMonat: z.number().min(0).max(100_000).default(0),
  kinder: z.array(z.object({
    id: z.string().min(1).max(64),
    geburtsjahr: z.number().int().min(1900).max(2200),
  })).max(10).default([]),
  beginnJahr: z.number().int().min(1900).max(2200).default(new Date().getFullYear()),
  lebenserwartung: z.number().int().min(60).max(120).default(85),
  /** Zusaetzlich Rente gegen Kapital gegenueberstellen */
  vergleichen: z.boolean().default(false),
  /**
   * Die NETTO-Kapitalauszahlung, die der Anbieter alternativ zur Rente
   * leisten wuerde. Ohne diese Angabe ist der Vergleich sinnlos: man
   * vergliche die Rente mit ihrer eigenen Auszahlungssumme.
   */
  vergleichKapitalNetto: z.number().min(0).max(100_000_000).default(0),
});

export const szenarioSchema = z.object({
  schemaVersion: z.literal(1),
  haushalt: haushaltSchema,
  annahmen: annahmenSchema,
  einkommenHeute: einkommenHeuteSchema,
  personen: z.array(personSchema).min(1).max(2),
  vertraege: z.array(vertragSchema).max(50).default([]),
  /**
   * true: je Partner ein eigenes Einkommen (einkommenHeute fuer A,
   * einkommenPartner fuer B). false: ein Haushaltsbetrag, der fuer die
   * Sozialabgaben haelftig auf beide verteilt wird.
   * .default(false), damit frueher gespeicherte Dateien weiter laden.
   */
  einkommenGetrennt: z.boolean().default(false),
  einkommenPartner: einkommenHeuteSchema.default({}),

  planer: planerSchema,
  tuev: z.array(tuevPositionSchema).max(20).default([]),
});

export type SzenarioInput = z.input<typeof szenarioSchema>;
export type SzenarioParsed = z.output<typeof szenarioSchema>;
