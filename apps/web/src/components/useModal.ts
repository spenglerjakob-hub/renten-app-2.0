import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

const FOKUSSIERBAR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Was jedes modale Fenster braucht — der Dialog in der Mitte ebenso wie die
 * Schublade von rechts.
 *
 * Barrierefreiheit ist hier kein Beiwerk: Ein Fenster, aus dem der
 * Tastaturfokus herausrutscht, ist fuer Tastatur- und Screenreader-Nutzer eine
 * Sackgasse. Deshalb wandert der Fokus beim Oeffnen hinein, bleibt darin
 * gefangen, Escape schliesst, der Hintergrund scrollt nicht mit, und beim
 * Schliessen kehrt der Fokus auf das ausloesende Element zurueck.
 *
 * DER SCHLIESSER LIEGT IN EINER REF, nicht in der Abhaengigkeitsliste.
 * Aufrufer uebergeben ihn meist als Pfeilfunktion, die bei jedem Rendern neu
 * entsteht. Stand er in der Liste, lief der Effekt bei jedem Rendern des
 * Aufrufers neu: Aufraeumen gab den Fokus an das ausloesende Element zurueck,
 * der Neustart setzte ihn auf den ersten Knopf. Wer im Ehepartner-Dialog ein
 * Einkommen eintippte, verlor so nach der ersten Ziffer das Feld — jede
 * Eingabe aendert das Szenario, und die Seite rendert neu.
 */
export function useModal(
  offen: boolean,
  kastenRef: RefObject<HTMLElement>,
  onSchliessen: () => void,
  /** Ist das falsch, schliesst Escape nicht — der Dialog muss dann selbst einen Weg nach vorn anbieten. */
  schliessbar = true,
) {
  const schliessenRef = useRef(onSchliessen);
  useLayoutEffect(() => { schliessenRef.current = onSchliessen; });

  useEffect(() => {
    if (!offen) return;

    const vorher = document.activeElement as HTMLElement | null;
    const kasten = kastenRef.current;
    kasten?.querySelector<HTMLElement>(FOKUSSIERBAR)?.focus();

    const beiTaste = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (schliessbar) schliessenRef.current(); return; }
      if (e.key !== 'Tab' || !kasten) return;

      const ziele = [...kasten.querySelectorAll<HTMLElement>(FOKUSSIERBAR)]
        .filter((el) => !el.hasAttribute('disabled'));
      if (ziele.length === 0) return;

      const erstes = ziele[0]!;
      const letztes = ziele[ziele.length - 1]!;
      if (e.shiftKey && document.activeElement === erstes) { e.preventDefault(); letztes.focus(); }
      else if (!e.shiftKey && document.activeElement === letztes) { e.preventDefault(); erstes.focus(); }
    };

    document.addEventListener('keydown', beiTaste);
    // Hintergrund nicht mitscrollen lassen.
    const vorherigesOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', beiTaste);
      document.body.style.overflow = vorherigesOverflow;
      vorher?.focus();
    };
  }, [offen, schliessbar, kastenRef]);
}
