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

/**
 * Vor- und Nachname zu einem gespeicherten Namen. Passen die getrennten
 * Felder zum ganzen Namen, gelten sie. Sonst stammt der Name aus der Zeit vor
 * der Trennung — oder wurde auf der Live-Seite geaendert, die nur den ganzen
 * Namen kennt und die Felder beim Speichern verwirft. Dann wird er geteilt:
 * das letzte Wort ist der Nachname, ein einzelnes Wort der Vorname.
 */
export function namensTeile(name: string, vorname = '', nachname = ''): NamensTeile {
  const ganz = vollerName({ vorname: name, nachname: '' });
  if (vollerName({ vorname, nachname }) === ganz) return { vorname, nachname };
  const woerter = ganz.split(' ').filter(Boolean);
  if (woerter.length < 2) return { vorname: woerter[0] ?? '', nachname: '' };
  return { vorname: woerter.slice(0, -1).join(' '), nachname: woerter[woerter.length - 1] ?? '' };
}

/** Was eine Eingabe in die beiden Felder speichert: die Teile und den ganzen Namen dazu. */
export function mitName(teile: NamensTeile): NamensTeile & { name: string } {
  return { ...teile, name: vollerName(teile) };
}
