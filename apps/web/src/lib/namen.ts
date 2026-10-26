/**
 * Vor- und Nachname.
 *
 * Erfasst werden beide getrennt; gespeichert wird dazu der ganze Name, wie er
 * bisher stand. Druck, Listen, Unterschriften und die Live-Seite lesen nur
 * ihn — sie bleiben unberuehrt.
 */
export interface NamensTeile {
  vorname: string;
  nachname: string;
}

/** Der ganze Name: „Vorname Nachname“, ohne doppelte Leerzeichen. */
export function vollerName({ vorname, nachname }: NamensTeile): string {
  return [vorname, nachname].map((s) => s.trim().replace(/\s+/g, ' ')).filter(Boolean).join(' ');
}
