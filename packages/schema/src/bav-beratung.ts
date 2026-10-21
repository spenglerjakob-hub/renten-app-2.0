import { z } from 'zod';
import { kindSchema } from './szenario.js';

/**
 * bAV-Mitarbeiterberatung: was in `bav_firmen.angebot` und
 * `bav_beratungen.daten` steht (Migration …_bav_beratung.sql).
 *
 * Die Datenbank prueft nur Typ und Groesse, die Form steht hier. Jedes Feld
 * hat eine Vorgabe: Was fehlt — etwa in einer Zeile von vor einer
 * Erweiterung —, bekommt beim Lesen seinen Standardwert, nichts wird
 * unlesbar. Gespeichert werden nur EINGABEN, keine Ergebnisse: Gerechnet
 * wird jedes Mal neu mit dem Rechenkern (`bavMitarbeiter`).
 */

const betrag = (max: number) => z.number().finite().min(0).max(max);
/** TT.MM.JJJJ oder leer — wie im Rechner (`DatumFeld`, `parseDatum`). */
const datum = () => z.string().regex(/^(\d{2}\.\d{2}\.\d{4})?$/).default('');

/** Das Modell der Firma — dieselben Stellschrauben wie auf den Arbeitgeber-Seiten. */
export const firmenModellSchema = z.discriminatedUnion('art', [
  z.object({
    art: z.literal('zuschuss'),
    /** Anteil der Umwandlung, den der Arbeitgeber dazugibt, z. B. 0,5 */
    quote: z.number().min(0).max(1).default(0.5),
    deckelMonat: betrag(10_000).default(100),
  }),
  z.object({
    art: z.literal('festbetrag'),
    festbetragMonat: betrag(10_000).default(50),
    mindestUmwandlungMonat: betrag(10_000).default(50),
  }),
  z.object({
    art: z.literal('matching'),
    /** Wohin der Mitarbeiter umwandelt; das Matching geht immer in die Unterstuetzungskasse */
    weg: z.enum(['dv', 'ukasse']).default('dv'),
    matchingMonat: betrag(10_000).default(100),
    zuschussImMatching: z.boolean().default(false),
  }),
]);

export const MODELL_VORGABE = { art: 'zuschuss', quote: 0.5, deckelMonat: 100 } as const;

/** Wohin die Umwandlung fliesst (§ 3 Nr. 63 EStG) — beim Matching-Modell der Weg des Mitarbeiters. */
export const DURCHFUEHRUNGSWEGE = ['direktversicherung', 'pensionskasse', 'pensionsfonds'] as const;

export const firmenAngebotSchema = z.object({
  /** Fuer die Entgeltumwandlungsvereinbarung: Anschrift des Arbeitgebers */
  anschrift: z.string().max(300).default(''),
  begruessung: z.string().max(1500).default(''),
  /** Hinweise aus der Versorgungsordnung, je Zeile einer */
  hinweise: z.string().max(3000).default(''),
  modell: firmenModellSchema.default(MODELL_VORGABE),
  durchfuehrungsweg: z.enum(DURCHFUEHRUNGSWEGE).default('direktversicherung'),
  versicherer: z.string().max(120).default(''),
  tarif: z.string().max(120).default(''),
  /** Matching-Modell: Traeger der Unterstuetzungskasse */
  ukasse: z.string().max(120).default(''),
  /** Sitz der Firma — Vorgabe fuer die Angaben jedes Mitarbeiters */
  bundesland: z.string().max(40).default('Nordrhein-Westfalen'),
  /** Erster Monat der Umwandlung; leer: der naechste Monatserste */
  beginn: datum(),
});

export const beratungAngabenSchema = z.object({
  name: z.string().max(120).default(''),
  geburtsdatum: datum(),
  jahresbrutto: betrag(2_000_000).default(0),
  /** Leer: das Bundesland der Firma */
  bundesland: z.string().max(40).default(''),
  verheiratet: z.boolean().default(false),
  /** Jahresbrutto des Partners — fuer die Steuerersparnis im Splitting; 0: ohne Einkommen */
  partnerBrutto: betrag(2_000_000).default(0),
  kirchensteuer: z.boolean().default(false),
  kinder: z.array(kindSchema).max(15).default([]),
  kv: z.enum(['gesetzlich', 'privat']).default('gesetzlich'),
  krankenkasse: z.string().max(120).default(''),
  zusatzbeitrag: z.number().min(0).max(0.1).default(0.029),
  pkvPraemieMonat: betrag(10_000).default(0),
  /** Gesetzliche Rente laut Renteninformation, Monat; 0: geschaetzt */
  grvRente: betrag(20_000).default(0),
  /** Leer: Regelaltersgrenze */
  rentenbeginn: datum(),
  /** Laufende Beitraege in eine bestehende Direktversicherung oder Pensionskasse, Monat */
  bavBestandMonat: betrag(10_000).default(0),
});

/** Die Werte aus dem Angebot des Versicherers, je Vertrag. */
export const versichererWerteSchema = z.object({
  /** Beitrag laut Angebot, Monat — vorbelegt aus der Rechnung */
  beitragMonat: betrag(100_000).default(0),
  garantierteRente: betrag(100_000).default(0),
  prognoseRente: betrag(100_000).default(0),
  prognoseKapital: betrag(100_000_000).default(0),
  /** Jaehrliche Steigerung des Beitrags laut Angebot */
  dynamik: z.number().min(0).max(0.1).default(0),
  /**
   * Prognose-Rente und Kapital stammen aus der geschaetzten Hochrechnung
   * („Geschaetzte Hochrechnung uebernehmen“), nicht aus dem Angebot — so
   * gekennzeichnet am Bildschirm, im Fazit und im Protokoll. Wer einen der
   * beiden Werte von Hand aendert, hebt das Kennzeichen auf.
   */
  ausHochrechnung: z.boolean().default(false),
});

export const BERATUNG_STATUS = ['offen', 'teilnahme', 'verzicht'] as const;

export const entscheidungSchema = z.object({
  /** Dasselbe wie die Spalte `status` — dort fuer Liste und Uebersicht */
  status: z.enum(BERATUNG_STATUS).default('offen'),
  /** Der Betrag ist `umwandlungMonat` — eine Zahl, nicht zwei, die auseinanderlaufen koennten */
  beginn: datum(),
  /** Verzicht: Grund, freiwillig */
  grund: z.string().max(500).default(''),
  empfehlung: z.string().max(2000).default(''),
  ort: z.string().max(120).default(''),
  datum: datum(),
});

/**
 * Die beispielhafte Hochrechnung: Verstellbar ist allein die Rendite der
 * Ansparphase, vor Kosten — benannt wie beim ETF-Depot am `Vertrag`. Alle
 * anderen Annahmen stehen fest in der Rechnung der Web-App. Grenze wie das Feld.
 */
export const hochrechnungSchema = z.object({
  renditeAnsparphase: z.number().min(0).max(0.2).default(0.06),
});

export const beratungDatenSchema = z.object({
  /** 2: sieben Schritte (mit „Ihre Versorgungslücke“) — aeltere Daten hebt `beratungLesen` an */
  version: z.literal(2).default(2),
  angaben: beratungAngabenSchema.default({}),
  umwandlungMonat: betrag(10_000).default(0),
  versicherer: z.object({
    /** Direktversicherung, Pensionskasse oder Pensionsfonds */
    direkt: versichererWerteSchema.default({}),
    /** Matching-Modell: die Unterstuetzungskasse */
    ukasse: versichererWerteSchema.default({}),
  }).default({}),
  entscheidung: entscheidungSchema.default({}),
  /** Bis zu welchem Alter die Rente in die Kennzahlen eingeht — dieselbe Vorgabe wie im Loesungsvergleich */
  lebenserwartung: z.number().int().min(60).max(120).default(85),
  /** Die Rendite der beispielhaften Hochrechnung — fruehere Felder (`beispielZins`, feste Annahmen) verwirft das Lesen */
  hochrechnung: hochrechnungSchema.default({}),
  /** Der zuletzt offene Schritt (0–6) — zum Weitermachen */
  schritt: z.number().int().min(0).max(6).default(0),
});

export type FirmenModellDaten = z.infer<typeof firmenModellSchema>;
export type FirmenAngebot = z.infer<typeof firmenAngebotSchema>;
export type BeratungAngaben = z.infer<typeof beratungAngabenSchema>;
export type VersichererWerte = z.infer<typeof versichererWerteSchema>;
export type Entscheidung = z.infer<typeof entscheidungSchema>;
export type BeratungDaten = z.infer<typeof beratungDatenSchema>;
export type BeratungStatus = (typeof BERATUNG_STATUS)[number];

/**
 * Ein Angebot aus der Datenbank lesen. Passt es nicht (unbekanntes Modell,
 * zu langer Text), gelten die Vorgaben — die Seite bleibt bedienbar, und der
 * Berater sieht, was neu einzustellen ist.
 */
export function angebotLesen(roh: unknown): FirmenAngebot {
  const r = firmenAngebotSchema.safeParse(roh ?? {});
  return r.success ? r.data : firmenAngebotSchema.parse({});
}

/**
 * Version 1 kannte sechs Schritte. Version 2 schiebt „Ihre Versorgungslücke“
 * als dritten ein — wer in einem spaeteren Schritt stand, steht danach eins
 * weiter, also wieder im selben Schritt. Alles andere bleibt, wie es ist.
 */
function anheben(roh: unknown): unknown {
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return roh;
  const o = roh as Record<string, unknown>;
  if (o.version === 2) return o;
  const schritt = typeof o.schritt === 'number' && o.schritt >= 2 ? o.schritt + 1 : o.schritt;
  return { ...o, version: 2, schritt };
}

/** Dasselbe fuer die Daten einer Beratung — aeltere Fassungen werden zuerst angehoben. */
export function beratungLesen(roh: unknown): BeratungDaten {
  const r = beratungDatenSchema.safeParse(anheben(roh ?? {}));
  return r.success ? r.data : beratungDatenSchema.parse({});
}
