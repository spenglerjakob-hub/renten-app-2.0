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
  const farbe = 'text-ui-schiefer hover:text-ui-tinte';
  return (
    <nav aria-label="Rechtliches" className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs print:hidden ${klasse}`}>
      <a href="/impressum" className={`underline-offset-2 hover:underline ${farbe}`}>Impressum</a>
      <span aria-hidden className="text-ui-asche">·</span>
      <a href="/datenschutz" className={`underline-offset-2 hover:underline ${farbe}`}>Datenschutz</a>
      <span aria-hidden className="text-ui-asche">·</span>
      <a href="/nutzungsbedingungen" className={`underline-offset-2 hover:underline ${farbe}`}>Nutzungsbedingungen</a>
      {/* Ohne Trennpunkt davor: Bricht die Zeile hier um, stuende er allein am Ende. */}
      <span className="text-ui-schiefer">© {new Date().getFullYear()} JS-Rentenplaner</span>
    </nav>
  );
}
