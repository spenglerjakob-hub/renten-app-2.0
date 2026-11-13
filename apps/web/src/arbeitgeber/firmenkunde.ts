import type { FirmenAngebot } from '@renten/schema';

/**
 * DER FIRMENKUNDE AUF DEN ARBEITGEBER-SEITEN — die reinen Teile.
 *
 * Zuschuss-, Festbetrag-, Matching-Modell und bKV rechnen fuer einen
 * Arbeitgeber. Wer das ist, waehlt der Berater aus seinen Firmen der
 * Mitarbeiterberatung (oder legt ihn neu an): Name und Logo stehen dann im
 * Kopf der Seite und im Ausdruck, und was das Angebot der Firma ueber das
 * Unternehmen weiss — Sitz, Steuersatz, Umlagen —, wird vorbelegt.
 *
 * Die vier Seiten sind eigene Seiten; der Wechsel dazwischen laedt neu.
 * Deshalb merkt sich der Tab die gewaehlte Firma (`sessionStorage`, nur die
 * Kennung). Eine Adresse mit `?firma=` geht vor — so fuehrt ein Verweis aus
 * der Mitarbeiterberatung direkt zur richtigen Firma.
 */

export const FIRMA_MERKER = 'rentenplaner.ag.firma';

const KENNUNG = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Welche Firma beim Laden gilt: aus der Adresse, sonst die zuletzt gewaehlte dieses Tabs. */
export function gemerkteFirma(suche: string, speicher: Pick<Storage, 'getItem'> | null): string | null {
  const ausAdresse = new URLSearchParams(suche).get('firma');
  if (ausAdresse && KENNUNG.test(ausAdresse)) return ausAdresse.toLowerCase();
  try {
    const gemerkt = speicher?.getItem(FIRMA_MERKER) ?? null;
    return gemerkt && KENNUNG.test(gemerkt) ? gemerkt.toLowerCase() : null;
  } catch {
    return null; // Speicher gesperrt (privater Modus, Richtlinie)
  }
}

/** Die Wahl fuer diesen Tab merken — `null` vergisst sie. */
export function firmaMerken(id: string | null, speicher: Pick<Storage, 'setItem' | 'removeItem'> | null): void {
  try {
    if (id && KENNUNG.test(id)) speicher?.setItem(FIRMA_MERKER, id.toLowerCase());
    else speicher?.removeItem(FIRMA_MERKER);
  } catch {
    /* dann eben nur fuer diese Seite */
  }
}

/**
 * Was eine Seite aus dem Angebot der Firma uebernimmt: Tatsachen des
 * Unternehmens. NICHT das Modell — die Seite ist dazu da, Modelle
 * durchzuspielen; ins Angebot kommt eines erst mit „Übernehmen“.
 */
export interface FirmenWerte {
  bundesland: string;
  steuersatz: number;
  umlagen: number;
}

export function firmenWerte(
  a: Pick<FirmenAngebot, 'bundesland' | 'unternehmensSteuersatz' | 'umlagenSatz'>,
): FirmenWerte {
  return { bundesland: a.bundesland, steuersatz: a.unternehmensSteuersatz, umlagen: a.umlagenSatz };
}

const prozent = (v: number, stellen: number) =>
  `${(v * 100).toLocaleString('de-DE', { maximumFractionDigits: stellen })} %`;

/** „Sitz Bayern, Steuersatz 30 %, Umlagen 2,5 %“ — der Satz unter der Auswahl. */
export function werteText(w: FirmenWerte): string {
  return [
    `Sitz ${w.bundesland}`,
    `Steuersatz ${prozent(w.steuersatz, 1)}`,
    w.umlagen > 0 ? `Umlagen ${prozent(w.umlagen, 2)}` : 'ohne Umlagen',
  ].join(', ');
}

/** Name fuer Kopf und Ausdruck — ohne Raender, Zeilenumbrueche als Leerzeichen. */
export function firmenName(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}

/** „13.11.2026“ — das Datum im Briefkopf des Ausdrucks. */
export function datumText(d: Date): string {
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
