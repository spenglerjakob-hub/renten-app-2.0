/**
 * Texte zum gemeinsamen Beraten einer Firma im Buero (`Gemeinsam.tsx`). In
 * der Oberflaeche heisst, wer die Firma angelegt hat, nicht „Inhaber“ — bei
 * einer Firma daechte man an den Arbeitgeber. Er „pflegt das Angebot“; die
 * Firma ist von ihm „freigegeben“.
 */

/**
 * Die Zeile zu einer freigegebenen Firma, in der Liste und im Kopf der Firma:
 * die eigene „Fürs Büro freigegeben“, die eines Kollegen „Freigegeben von …“.
 * Nicht freigegeben: null.
 */
export function freigabeText(eigene: boolean, freigegeben: boolean, von: string | null): string | null {
  if (!eigene) return von ? `Freigegeben von ${von}` : 'Für Ihr Büro freigegeben';
  return freigegeben ? 'Fürs Büro freigegeben' : null;
}

/** „betreut von …“ an einer Beratung einer freigegebenen Firma — ohne Namen keine Zeile. */
export function betreutText(eigene: boolean, von: string | null): string | null {
  if (eigene) return 'betreut von Ihnen';
  return von ? `betreut von ${von}` : null;
}
