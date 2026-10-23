/**
 * DER STIL DER SEITE — zwei Referenzen zum Vergleich, dieselben Rollen
 * (index.css: `.mb-steep`, `.mb-seline`).
 *
 * Gewaehlt wird mit `?stil=seline` oder `?stil=steep` in der Adresse; die
 * Wahl merkt sich das Geraet. Ohne Wahl gilt Steep. Eine Bequemlichkeit je
 * Geraet, nichts, was gerechnet oder gespeichert wird — fehlt der Speicher
 * (privates Fenster), gilt eben die Adresse oder die Vorgabe.
 */
export type Stil = 'steep' | 'seline';

export const STILE: readonly { id: Stil; text: string }[] = [
  { id: 'steep', text: 'Steep' },
  { id: 'seline', text: 'Seline' },
];

const SCHLUESSEL = 'rentenplaner.mitarbeiterberatung.stil';
const istStil = (x: unknown): x is Stil => x === 'steep' || x === 'seline';

export function stilMerken(stil: Stil): void {
  try { window.localStorage.setItem(SCHLUESSEL, stil); } catch { /* ohne Speicher gilt die Adresse */ }
}

/** Der Stil aus der Adresse (und dann gemerkt), sonst der gemerkte, sonst Steep. */
export function stilLaden(suche: string): Stil {
  const ausAdresse = new URLSearchParams(suche).get('stil');
  if (istStil(ausAdresse)) {
    stilMerken(ausAdresse);
    return ausAdresse;
  }
  try {
    const gemerkt = window.localStorage.getItem(SCHLUESSEL);
    if (istStil(gemerkt)) return gemerkt;
  } catch { /* privates Fenster */ }
  return 'steep';
}
