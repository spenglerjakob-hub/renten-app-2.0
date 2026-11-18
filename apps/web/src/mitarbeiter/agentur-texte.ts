import { agenturAnsprechpartner, type AgenturDaten } from '@renten/schema';
import type { Auftritt } from '../features/auftritt';
import { AUFTRITT_LEER } from '../features/auftritt';
import type { Agentur, AgenturStand } from '../lib/bav-agenturen';
import type { Firma, Stand } from '../lib/bav-beratung';

/*
 * AGENTUREN in der Mitarbeiterberatung — die reinen Teile: was die Liste der
 * bAV-Verwaltung je Agentur zeigt, wie sie sortiert, und wessen Name auf den
 * Unterlagen einer Firma der Agentur steht.
 */

/** Was die Uebersicht je Agentur zeigt. */
export interface AgenturZeile {
  agentur: Agentur;
  firmen: number;
  /** Beratungen ueber alle Firmen der Agentur */
  stand: Stand;
  zugaenge: number;
  einladungen: number;
}

export type Sortierung = 'name' | 'firmen' | 'geaendert';

const LEER: Stand = { offen: 0, teilnahme: 0, verzicht: 0 };

export function agenturZeilen(
  agenturen: readonly Agentur[], firmen: readonly Firma[],
  staende: Record<string, Stand>, zugaenge: Record<string, AgenturStand>, sortierung: Sortierung = 'name',
): AgenturZeile[] {
  const zeilen = agenturen.map((agentur): AgenturZeile => {
    const eigene = firmen.filter((f) => f.agentur === agentur.id);
    const stand = eigene.reduce<Stand>((s, f) => {
      const x = staende[f.id] ?? LEER;
      return { offen: s.offen + x.offen, teilnahme: s.teilnahme + x.teilnahme, verzicht: s.verzicht + x.verzicht };
    }, { ...LEER });
    const z = zugaenge[agentur.id] ?? { zugaenge: 0, einladungen: 0 };
    return { agentur, firmen: eigene.length, stand, zugaenge: z.zugaenge, einladungen: z.einladungen };
  });
  const nachName = (a: AgenturZeile, b: AgenturZeile) => a.agentur.name.localeCompare(b.agentur.name, 'de');
  if (sortierung === 'firmen') return zeilen.sort((a, b) => b.firmen - a.firmen || nachName(a, b));
  if (sortierung === 'geaendert') {
    return zeilen.sort((a, b) => b.agentur.geaendertAm.localeCompare(a.agentur.geaendertAm) || nachName(a, b));
  }
  return zeilen.sort(nachName);
}

const mehrzahl = (n: number, eins: string, viele: string) => `${n.toLocaleString('de-DE')} ${n === 1 ? eins : viele}`;

/** „3 Firmen · 2 Zugänge · 1 offene Einladung“ — die Zeile unter dem Namen. */
export function agenturStandText(z: Pick<AgenturZeile, 'firmen' | 'zugaenge' | 'einladungen'>): string {
  return [
    z.firmen === 0 ? 'Noch keine Firma' : mehrzahl(z.firmen, 'Firma', 'Firmen'),
    z.zugaenge === 0 ? 'noch kein Zugang' : mehrzahl(z.zugaenge, 'Zugang', 'Zugänge'),
    ...(z.einladungen > 0 ? [mehrzahl(z.einladungen, 'offene Einladung', 'offene Einladungen')] : []),
  ].join(' · ');
}

/** „Anna Agentin · Organr. 4711“ — leer, wenn nichts eingetragen ist. */
export function agenturKurz(d: Pick<AgenturDaten, 'vorname' | 'nachname' | 'organisationsnummer'>): string {
  return [
    agenturAnsprechpartner(d),
    d.organisationsnummer.trim() ? `Organr. ${d.organisationsnummer.trim()}` : '',
  ].filter(Boolean).join(' · ');
}

/**
 * Der Auftritt auf den Unterlagen einer Firma, die zu einer Agentur gehoert.
 * Die Unterlagen eines Firmenkunden sprechen fuer seine Agentur:
 *
 * - Erstellt sie die bAV-VERWALTUNG, gelten Name der Agentur, ihr
 *   Ansprechpartner und ihr Kontakt, wo sie eingetragen sind — die Verwaltung
 *   arbeitet im Namen der Agentur, nicht im eigenen.
 * - Erstellt sie ein ZUGANG DER AGENTUR (`mitglied`), gehen seine eigenen
 *   Angaben aus „Ihr Auftritt“ vor: Er hat beraten. Was er nicht eingetragen
 *   hat, kommt von der Agentur — ohne eigenen Auftritt also alles.
 *
 * Logo, Farbe, Internetadresse und Zusatzzeile bleiben immer vom
 * angemeldeten Berater. Der Name ist auch die Vorgabe fuer „Wer hat
 * beraten?“ im AXA-Antrag (`axaBerater`); je Beratung laesst sich ein
 * anderer eintragen.
 */
export function agenturAuftritt(auftritt: Auftritt | null, agentur: Agentur | null, mitglied = false): Auftritt | null {
  if (!agentur) return auftritt;
  const d = agentur.daten;
  const basis = auftritt ?? AUFTRITT_LEER;
  const wahl = (eigen: string, vonAgentur: string) =>
    (mitglied ? eigen.trim() || vonAgentur.trim() : vonAgentur.trim() || eigen);
  const eigenerName = [basis.berater, basis.vorname, basis.nachname].some((s) => s.trim() !== '');
  const name = agenturAnsprechpartner(d);
  return {
    ...basis,
    firma: wahl(basis.firma, agentur.name),
    ...(name && !(mitglied && eigenerName) ? { berater: name, vorname: d.vorname.trim(), nachname: d.nachname.trim() } : {}),
    telefon: wahl(basis.telefon, d.telefon),
    email: wahl(basis.email, d.email),
  };
}
