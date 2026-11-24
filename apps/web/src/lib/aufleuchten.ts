/**
 * FEHLENDE ANGABEN ZEIGEN — „Zu den Angaben“ fuehrt nicht nur in den
 * Abschnitt, sondern an das Feld: Es kommt ins Bild, bekommt den Fokus und
 * leuchtet kurz auf. Sonst steht man vor fuenf Feldern und sucht das leere.
 *
 * Die Felder melden sich selbst: `ZahlFeld` und `DatumFeld` tragen
 * `data-fehlt`, solange ihre Angabe fehlt (`leer`). Deshalb braucht es hier
 * keine Liste, welche Angabe in welchem Feld steht — gezeigt wird, was im
 * offenen Abschnitt leer ist.
 *
 * Aufgeleuchtet wird ueber eine Klasse am Feld (`.ui-aufleuchten` in
 * index.css), die nach kurzer Zeit wieder faellt. Wer Bewegung abgeschaltet
 * hat, sieht denselben Rahmen ohne Pulsieren.
 */
const KLASSE = 'ui-aufleuchten';
/** So lange steht der Rahmen — zwei Pulse der Animation und etwas Nachklang. */
export const AUFLEUCHTEN_MS = 2000;

const laufend = new WeakMap<HTMLElement, number>();

/** Die Felder mit fehlender Angabe, soweit sie gerade zu sehen sind. */
export function fehlendeFelder(wurzel: ParentNode = document): HTMLElement[] {
  return [...wurzel.querySelectorAll<HTMLElement>('[data-fehlt]')].filter((el) => el.getClientRects().length > 0);
}

/**
 * Das erste fehlende Feld ins Bild holen und fokussieren, alle sichtbaren
 * kurz aufleuchten lassen.
 *
 * @returns ob es ein solches Feld gab
 */
export function fehlendeFelderZeigen(wurzel: ParentNode = document): boolean {
  const felder = fehlendeFelder(wurzel);
  const erstes = felder[0];
  if (!erstes) return false;
  // Nur bewegen, wenn es nicht gut im Bild steht — oben Platz fuer die Kopfleiste, unten fuer die Fussleiste.
  const r = erstes.getBoundingClientRect();
  if (r.top < 140 || r.bottom > window.innerHeight - 160) erstes.scrollIntoView({ block: 'center' });
  erstes.focus({ preventScroll: true });
  for (const feld of felder) {
    window.clearTimeout(laufend.get(feld));
    feld.classList.remove(KLASSE);
    // Ein Blick aufs Layout startet die Animation neu, wenn die Klasse eben noch gesetzt war.
    void feld.offsetWidth;
    feld.classList.add(KLASSE);
    laufend.set(feld, window.setTimeout(() => feld.classList.remove(KLASSE), AUFLEUCHTEN_MS));
  }
  return true;
}
