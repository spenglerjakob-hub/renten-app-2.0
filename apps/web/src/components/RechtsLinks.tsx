import { TIPPFLAECHE } from './stil';

/**
 * Impressum, Datenschutz und Nutzungsbedingungen — im Fuss JEDER Seite,
 * dazu der Urheberhinweis.
 *
 * Pflicht, nicht Zierde: § 5 DDG verlangt, dass das Impressum von jeder
 * Seite aus leicht erreichbar ist, Art. 13 DSGVO dasselbe fuer die
 * Datenschutzerklaerung. Die Landingpages kommen per QR-Code oder Link ohne
 * den Rechner drumherum — deshalb der eigene Baustein.
 */
export function RechtsLinks({ klasse = '' }: { klasse?: string }) {
  /*
    Die Links sind eine Zeile kleiner Schrift (16 px hoch) — mit TIPPFLAECHE am
    Telefon treffbar. Das unsichtbare Feld liegt hier HINTER allem anderen der
    Zeile (`-z-10` innerhalb der eigenen Ebene, `isolate`): Wo die Links
    umbrechen (schmale Seitenleiste), stehen sie nur 4 px untereinander, und
    das Feld des einen laege sonst ueber dem Nachbarn. So gewinnt immer der
    Link selbst; das Feld faengt nur Tipper daneben.
  */
  const link = `underline-offset-2 hover:underline text-ui-schiefer hover:text-ui-tinte ${TIPPFLAECHE} after:-z-10`;
  return (
    <nav aria-label="Rechtliches" className={`isolate flex flex-wrap items-center gap-x-3 gap-y-1 text-xs print:hidden ${klasse}`}>
      <a href="/impressum" className={link}>Impressum</a>
      <span aria-hidden className="text-ui-asche">·</span>
      <a href="/datenschutz" className={link}>Datenschutz</a>
      <span aria-hidden className="text-ui-asche">·</span>
      <a href="/nutzungsbedingungen" className={link}>Nutzungsbedingungen</a>
      {/* Ohne Trennpunkt davor: Bricht die Zeile hier um, stuende er allein am Ende. */}
      <span className="text-ui-schiefer">© {new Date().getFullYear()} JS-Rentenplaner</span>
    </nav>
  );
}
