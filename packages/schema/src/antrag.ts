import { z } from 'zod';

/**
 * Die Angaben für den Antrag nach „Lösungen annehmen“: Bezugsrecht im
 * Todesfall je Lösung und die Bankverbindung. Die Ausweiskopie ist eine
 * Datei und steht nicht hier.
 *
 * Diese Angaben liegen NICHT im Szenario — das liegt im Browser und geht in
 * jeden Export. Sie stehen in der Tabelle `antraege` (Migration
 * 20261104120000_antraege), wo die Datenbank sie beim Einreichen des Kunden
 * noch einmal prüft: dieselben vier Werte, dieselbe IBAN-Prüfziffer.
 */

/**
 * Die vier Bezugsrechte im Todesfall — `text` im Wortlaut, wie er im Antrag
 * steht; `kurz` für die Auswahl, in der die langen Texte nicht lesbar wären.
 */
export const BEZUGSRECHTE = [
  {
    wert: 1,
    kurz: 'Ehegatte, ersatzweise die Kinder',
    text: 'der Ehegatte, mit dem der Versicherungsnehmer (VN) im Zeitpunkt des Todes verheiratet war. Ist dieser '
      + 'vorverstorben, die Kinder des VN i.S.v. § 10 Absatz 1 Nr. 2 b) EStG',
  },
  {
    wert: 2,
    kurz: 'Kinder, ersatzweise der Ehegatte',
    text: 'die Kinder des Versicherungsnehmers (VN) i.S.v. § 10 Absatz 1 Nr. 2b) EStG. Sind diese (solche) bei Tod '
      + 'nicht vorhanden, der Ehegatte, mit dem der VN bei Tod verheiratet war',
  },
  {
    wert: 3,
    kurz: 'Ehegatte bzw. eingetragener Lebenspartner',
    text: 'der Ehegatte bzw. der eingetragene Lebenspartner, mit dem der Versicherungsnehmer im Zeitpunkt des Todes '
      + 'verheiratet war (§ 10 Absatz 1 Nr. 2 b) EStG',
  },
  {
    wert: 4,
    kurz: 'Kinder',
    text: 'die Kinder des Versicherungsnehmers gemäß § 10 Absatz 1 Nr. 2 b) EStG',
  },
] as const;

export type BezugsrechtWert = (typeof BEZUGSRECHTE)[number]['wert'];

/** Vorbelegt: der erste Punkt. */
export const BEZUGSRECHT_VORGABE: BezugsrechtWert = 1;

export const bezugsrechtText = (wert: number) => BEZUGSRECHTE.find((b) => b.wert === wert)?.text ?? '';

/** Die Felder, nach denen ein Kundenlink fragen kann — wie `offen` in der Datenbank. */
export const ANTRAG_FELDER = ['bezugsrecht', 'bank', 'ausweis'] as const;
export type AntragFeld = (typeof ANTRAG_FELDER)[number];

/** Leerzeichen raus, Großbuchstaben — so speichert die Datenbank sie auch. */
export const ibanBereinigt = (iban: string) => iban.replace(/\s+/g, '').toUpperCase();

/**
 * Prüfziffer nach ISO 13616 (Modulo 97), dazu Form und — für Deutschland —
 * die Länge von 22 Stellen. Dieselbe Regel wie `privat.iban_gueltig`.
 */
export function ibanGueltig(iban: string): boolean {
  const v = ibanBereinigt(iban);
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(v)) return false;
  if (v.startsWith('DE') && v.length !== 22) return false;
  const r = v.slice(4) + v.slice(0, 4);
  let rest = 0;
  for (const c of r) {
    rest = c >= '0' && c <= '9'
      ? (rest * 10 + Number(c)) % 97
      : (rest * 100 + (c.charCodeAt(0) - 55)) % 97;
  }
  return rest === 1;
}

/** In Vierergruppen, wie auf der Bankkarte: „DE89 3704 0044 0532 0130 00“. */
export const ibanFormatiert = (iban: string) => ibanBereinigt(iban).replace(/(.{4})(?=.)/g, '$1 ');

const bankSchema = z.object({
  inhaber: z.string().max(120).default(''),
  iban: z.string().max(42).default(''),
});

/** Bezugsrecht je Lösung: die ID des Angebots → 1–4. */
const bezugsrechtSchema = z.record(z.string().min(1).max(64), z.number().int().min(1).max(4));

export const antragAngabenSchema = z.object({
  bezugsrecht: bezugsrechtSchema.default({}),
  bank: bankSchema.optional(),
});
export type AntragAngaben = z.infer<typeof antragAngabenSchema>;

/** Was der Kunde einreicht — dieselbe Form, nur die Felder, nach denen gefragt war. */
export const antragEingangSchema = z.object({
  bezugsrecht: bezugsrechtSchema.optional(),
  bank: bankSchema.optional(),
});
export type AntragEingang = z.infer<typeof antragEingangSchema>;

/** Das Abbild einer angenommenen Lösung im Antrag. */
export const antragLoesungSchema = z.object({
  id: z.string().min(1).max(64),
  art: z.enum(['bav', 'avd', 'basis', 'privat']),
  anbieter: z.string().max(120).default(''),
  inhaber: z.enum(['A', 'B']).default('A'),
  /** Für wen — der Name der Person, nur für den Antragsbogen des Beraters */
  person: z.string().max(120).default(''),
  beitragMonat: z.number().min(0).max(100_000).default(0),
  agZuschussMonat: z.number().min(0).max(100_000).default(0),
  renteMonat: z.number().min(0).max(1_000_000).default(0),
  kapital: z.number().min(0).max(100_000_000).default(0),
});
export type AntragLoesung = z.infer<typeof antragLoesungSchema>;

/**
 * Nach der Bankverbindung wird nur gefragt, wenn eine Lösung keine
 * Betriebsrente ist: Bei der bAV zahlt der Arbeitgeber den Beitrag.
 */
export const braucheBank = (loesungen: readonly Pick<AntragLoesung, 'art'>[]) =>
  loesungen.some((l) => l.art !== 'bav');

/**
 * Welche Angaben noch fehlen — die Vorschlagsliste für den Kundenlink.
 * Die Ausweiskopie fehlt, solange keine Datei hochgeladen ist.
 */
export function offeneAngaben(
  angaben: AntragAngaben, loesungen: readonly Pick<AntragLoesung, 'id' | 'art'>[], ausweisDa: boolean,
): AntragFeld[] {
  const offen: AntragFeld[] = [];
  if (loesungen.some((l) => !angaben.bezugsrecht[l.id])) offen.push('bezugsrecht');
  if (braucheBank(loesungen) && !(angaben.bank && angaben.bank.inhaber.trim() && ibanGueltig(angaben.bank.iban))) {
    offen.push('bank');
  }
  if (!ausweisDa) offen.push('ausweis');
  return offen;
}

/**
 * Den Eingang des Kunden übernehmen: Er ERGÄNZT die Angaben des Beraters.
 * Was der Kunde nicht gefragt wurde, bleibt, wie es ist; wo beide etwas
 * angegeben haben, gilt die Angabe des Kunden — nach ihr war gefragt.
 */
export function eingangUebernehmen(angaben: AntragAngaben, eingang: AntragEingang): AntragAngaben {
  return {
    bezugsrecht: { ...angaben.bezugsrecht, ...(eingang.bezugsrecht ?? {}) },
    bank: eingang.bank ? { inhaber: eingang.bank.inhaber, iban: ibanBereinigt(eingang.bank.iban) } : angaben.bank,
  };
}
