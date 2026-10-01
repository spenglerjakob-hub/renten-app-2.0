/**
 * Impressum und Datenschutz — im Fuss JEDER Seite.
 *
 * Pflicht, nicht Zierde: § 5 DDG verlangt, dass das Impressum von jeder
 * Seite aus leicht erreichbar ist, Art. 13 DSGVO dasselbe fuer die
 * Datenschutzerklaerung. Die Landingpages kommen per QR-Code oder Link ohne
 * den Rechner drumherum — deshalb der eigene Baustein.
 */
export function RechtsLinks({ hell = false, klasse = '' }: { hell?: boolean; klasse?: string }) {
  const farbe = hell ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-800';
  return (
    <nav aria-label="Rechtliches" className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs print:hidden ${klasse}`}>
      <a href="/impressum" className={`underline-offset-2 hover:underline ${farbe}`}>Impressum</a>
      <span aria-hidden className={hell ? 'text-slate-600' : 'text-slate-300'}>·</span>
      <a href="/datenschutz" className={`underline-offset-2 hover:underline ${farbe}`}>Datenschutz</a>
    </nav>
  );
}
