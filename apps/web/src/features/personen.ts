/**
 * Der Anzeigename einer Person — EINE Quelle fuer Bildschirm und Papier.
 *
 * "Person A" ist ein Platzhalter, kein Name. Sobald einer eingetragen ist,
 * hat der Platzhalter nichts mehr zu suchen: aus "Person A — Jakob Spengler"
 * wird "Jakob Spengler", aus "Inhaber: Person B" der Name des Partners.
 *
 * Die Regel stand bisher an acht Stellen einzeln im JSX, an dreien gar nicht
 * (dort erschien nur "A" oder "B"). Solche Regeln laufen auseinander.
 */

import { fallName } from '../lib/namen';

interface Benannt {
  id: string;
  name: string;
}

export function personName(p: Benannt): string {
  return p.name.trim() || `Person ${p.id}`;
}

/**
 * Dasselbe, wenn nur die Kennung vorliegt — etwa beim Vertragsinhaber, der
 * im Vertrag als 'A' oder 'B' steht.
 */
export function personNameAus(personen: readonly Benannt[], id: string): string {
  const p = personen.find((x) => x.id === id);
  return p ? personName(p) : `Person ${id}`;
}

/**
 * Der Name des Falls aus dem Plan: Person A, mit Ehepartner auch Person B —
 * Vorschlag beim Speichern des Plans und für den Kunden im Antrag. Leer ohne
 * Namen; Platzhalter wie „Person A“ gehören nicht in einen Plannamen.
 */
export function fallNameAus(
  personen: readonly (Benannt & { vorname?: string; nachname?: string })[], verheiratet: boolean,
): string {
  return fallName(personen.filter((p) => p.id === 'A' || verheiratet));
}
