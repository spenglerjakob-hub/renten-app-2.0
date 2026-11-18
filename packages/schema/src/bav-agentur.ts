import { z } from 'zod';
import { firmenAngebotSchema, type FirmenAngebot } from './bav-beratung.js';

/* ==========================================================================
 * AGENTUREN — die Ebene ueber den Firmen der bAV-Mitarbeiterberatung.
 *
 * Die bAV-Verwaltung des Betreibers fuehrt Agenturen; jede hat Firmenkunden.
 * Was die Verwaltung an der Agentur eintraegt, belegt jede Firma vor, die in
 * ihr angelegt wird: Organisationsnummer, Versicherer, Tarif, Sitz — und wer
 * als Berater im AXA-Antrag und im Gespraechsprotokoll steht.
 *
 * VORGABE AXA. Das Werkzeug nutzen vorerst AXA-Vertriebe: Eine neue Firma
 * beginnt deshalb mit der AXA als Versicherer. Zusammen mit dem
 * Durchfuehrungsweg Direktversicherung (ohnehin die Vorgabe) gelten damit
 * von Anfang an der AXA-Antrag und das AXA-Gespraechsprotokoll
 * (`istAxaAntrag`). Bestehende Firmen bleiben, wie sie sind.
 * ======================================================================== */

/** Der Versicherer, mit dem eine neue Firma beginnt. */
export const AXA_VERSICHERER = 'AXA Lebensversicherung AG';

export const agenturDatenSchema = z.object({
  /** Ansprechpartner der Agentur — steht als Berater im AXA-Antrag und im Protokoll ihrer Firmen */
  vorname: z.string().max(60).default(''),
  nachname: z.string().max(60).default(''),
  /** AXA-Organisationsnummer (Organr.) — Vorgabe fuer jede Firma der Agentur */
  organisationsnummer: z.string().max(40).default(''),
  anschrift: z.string().max(300).default(''),
  telefon: z.string().max(60).default(''),
  email: z.string().max(120).default(''),
  /** Sitz der Agentur — Vorgabe fuer das Bundesland ihrer Firmen; leer: die Vorgabe des Angebots */
  bundesland: z.string().max(40).default(''),
  /** Vorgaben fuer das Angebot neuer Firmen */
  versicherer: z.string().max(120).default(AXA_VERSICHERER),
  tarif: z.string().max(120).default(''),
});

export type AgenturDaten = z.infer<typeof agenturDatenSchema>;

/**
 * Die Daten einer Agentur aus der Datenbank lesen. Passt etwas nicht (zu
 * langer Text, fremder Typ), gelten die Vorgaben — die Seite bleibt bedienbar.
 */
export function agenturDatenLesen(roh: unknown): AgenturDaten {
  const r = agenturDatenSchema.safeParse(roh ?? {});
  return r.success ? r.data : agenturDatenSchema.parse({});
}

/** „Vorname Nachname“ des Ansprechpartners — leer, wenn keiner eingetragen ist. */
export function agenturAnsprechpartner(d: Pick<AgenturDaten, 'vorname' | 'nachname'>): string {
  return [d.vorname.trim(), d.nachname.trim()].filter(Boolean).join(' ');
}

/**
 * Das Angebot, mit dem eine NEUE Firma beginnt: AXA als Versicherer; in einer
 * Agentur mit deren Vorgaben (Versicherer, Tarif, Organisationsnummer, Sitz).
 * `eigen` sind Angaben, die der Anlegende schon gemacht hat (Modell, Sitz,
 * Steuersatz von den Arbeitgeber-Seiten) — sie gehen vor.
 */
export function neuesAngebot(
  agentur: AgenturDaten | null = null,
  eigen: z.input<typeof firmenAngebotSchema> = {},
): FirmenAngebot {
  const vorgabe: z.input<typeof firmenAngebotSchema> = { versicherer: AXA_VERSICHERER };
  if (agentur) {
    // Ein geleerter Versicherer an der Agentur heisst: keine Vorgabe — nicht „doch AXA“.
    vorgabe.versicherer = agentur.versicherer.trim();
    vorgabe.tarif = agentur.tarif.trim();
    vorgabe.organisationsnummer = agentur.organisationsnummer.trim();
    if (agentur.bundesland.trim() !== '') vorgabe.bundesland = agentur.bundesland.trim();
  }
  return firmenAngebotSchema.parse({ ...vorgabe, ...eigen });
}
