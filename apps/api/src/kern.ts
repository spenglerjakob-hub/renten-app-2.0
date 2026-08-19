import { randomBytes, createHash } from 'node:crypto';

/**
 * Datenmodell und Persistenz-Vertrag — ohne Bindung an einen konkreten Treiber.
 * Die Adapter liegen in db-sqlite.ts (produktiv) und db-memory.ts (Tests).
 */

export interface Konto {
  id: string;
  email: string;
  erstelltAm: string;
}

export interface SzenarioDatensatz {
  id: string;
  kontoId: string;
  name: string;
  /** Eingabe-JSON, niemals Ergebnisse */
  daten: string;
  schemaVersion: number;
  erstelltAm: string;
  geaendertAm: string;
}

export interface Datenbank {
  kontoPerEmail(email: string): Konto | null;
  kontoAnlegen(email: string): Konto;
  anmeldeTokenSpeichern(tokenHash: string, email: string, gueltigBis: number): void;
  anmeldeTokenEinloesen(tokenHash: string): string | null;
  sitzungAnlegen(tokenHash: string, kontoId: string, gueltigBis: number): void;
  sitzungAufloesen(tokenHash: string): string | null;
  sitzungBeenden(tokenHash: string): void;
  szenarienListen(kontoId: string): SzenarioDatensatz[];
  szenarioLesen(kontoId: string, szenarioId: string): SzenarioDatensatz | null;
  szenarioAnlegen(kontoId: string, name: string, daten: string, schemaVersion: number): SzenarioDatensatz;
  szenarioAktualisieren(kontoId: string, szenarioId: string, name: string, daten: string): boolean;
  szenarioLoeschen(kontoId: string, szenarioId: string): boolean;
  kontoLoeschen(kontoId: string): void;
  aufraeumen(): void;
  schliessen(): void;
}

export function tokenErzeugen(): string {
  return randomBytes(32).toString('base64url');
}

/** Tokens werden ausschliesslich als Hash gespeichert. */
export function tokenHashen(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function id(): string {
  return randomBytes(16).toString('hex');
}
