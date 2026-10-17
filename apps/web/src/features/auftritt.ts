/**
 * „Ihr Auftritt im Gutachten“ — Logo, Firma, Name und Kontakt des Beraters.
 *
 * Rein, ohne Oberflaeche und ohne Speicher: Die Schnellrechnung (ohne
 * Supabase-Bundle), das Fenster im Rechner und das Gutachten nutzen dieselben
 * Funktionen. Gespeichert wird im Browser (`lib/auftritt-lokal.ts`) oder im
 * Konto (`lib/auftritt-konto.ts`, Tabelle `berater_profil`).
 *
 * DIE AKZENTFARBE faerbt nur Linien und Ueberschriften — nie die Farben, die
 * etwas bedeuten (Gruen fuers Ergebnis, Rot fuer die Luecke). Eine Farbe, die
 * auf Weiss zu hell fuer Text ist, faerbt nur die Linien; das Formular sagt
 * das dazu.
 */

export interface Auftritt {
  firma: string;
  berater: string;
  telefon: string;
  email: string;
  web: string;
  /** Freie Zeile, etwa Vermittlerstatus und Registernummer */
  zusatz: string;
  /** '#rrggbb' — null ist die Vorgabe (Linien wie bisher) */
  farbe: string | null;
  /** Zum Anzeigen: Data-URL (im Browser) oder Object-URL (aus dem Konto) */
  logo: string | null;
}

export type AuftrittText = 'firma' | 'berater' | 'telefon' | 'email' | 'web' | 'zusatz';

export const AUFTRITT_LEER: Auftritt = {
  firma: '', berater: '', telefon: '', email: '', web: '', zusatz: '', farbe: null, logo: null,
};

/** Dieselben Grenzen wie in der Datenbank (`berater_profil`). */
export const GRENZEN: Record<AuftrittText, number> = {
  firma: 120, berater: 120, telefon: 40, email: 254, web: 200, zusatz: 300,
};

const TEXTE: AuftrittText[] = ['firma', 'berater', 'telefon', 'email', 'web', 'zusatz'];

/** WCAG: Ab diesem Kontrast auf Weiss taugt eine Farbe fuer Ueberschriften. */
export const TITEL_KONTRAST = 4.5;
/** Darunter sind Linien auf weissem Papier kaum zu sehen. */
export const LINIE_KONTRAST = 1.5;

export function farbeGueltig(farbe: unknown): farbe is string {
  return typeof farbe === 'string' && /^#[0-9a-f]{6}$/.test(farbe);
}

/** Bringt Eingaben wie „#1E3A8A“ in die gespeicherte Form; Ungueltiges wird null. */
export function farbeNormal(farbe: string | null | undefined): string | null {
  const f = (farbe ?? '').trim().toLowerCase();
  return farbeGueltig(f) ? f : null;
}

/** Relative Leuchtdichte nach WCAG 2.x. */
function leuchtdichte(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const kanal = (wert: number) => {
    const s = wert / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * kanal((n >> 16) & 255) + 0.7152 * kanal((n >> 8) & 255) + 0.0722 * kanal(n & 255);
}

/** Kontrast einer Farbe auf weissem Papier: 1 (Weiss) bis 21 (Schwarz). */
export function kontrastZuWeiss(hex: string): number {
  return 1.05 / (leuchtdichte(hex) + 0.05);
}

export function titelTauglich(farbe: string | null): boolean {
  return farbeGueltig(farbe) && kontrastZuWeiss(farbe) >= TITEL_KONTRAST;
}

export function linieKaumSichtbar(farbe: string | null): boolean {
  return farbeGueltig(farbe) && kontrastZuWeiss(farbe) < LINIE_KONTRAST;
}

/**
 * Die CSS-Variablen fuer Gutachten und Vorschau. Ohne Farbe leer — dann
 * greifen die Vorgaben in den Bausteinen, und es aendert sich kein Pixel.
 */
export function akzentVariablen(a: Pick<Auftritt, 'farbe'> | null | undefined): Record<string, string> {
  const f = a?.farbe ?? null;
  if (!farbeGueltig(f)) return {};
  return titelTauglich(f)
    ? { '--akzent-linie': f, '--akzent-titel': f }
    : { '--akzent-linie': f };
}

const voll = (s: string) => s.trim() !== '';

/** Steht etwas vom Berater auf dem Gutachten? Eine Farbe allein ist kein Auftritt. */
export function auftrittSichtbar(a: Auftritt | null | undefined): boolean {
  return Boolean(a && (a.logo || TEXTE.some((k) => voll(a[k]))));
}

/** Alles leer — auch keine Farbe. */
export function auftrittLeer(a: Auftritt | null | undefined): boolean {
  return !auftrittSichtbar(a) && !farbeGueltig(a?.farbe ?? null);
}

/** Die Kontaktzeile unter dem Namen: „0711 123456 · max@muster.de · www.muster.de“ */
export function kontaktZeile(a: Auftritt): string {
  return [a.telefon, a.email, a.web].map((s) => s.trim()).filter(voll).join(' · ');
}

/** Hoechstens zwei Zeilen in 8 pt neben der Seitenzahl. */
const FUSS_MAX = 100;

/** Links in der Fusszeile: Firma, Name, Telefon — sonst E-Mail und Website. */
export function fusszeileText(a: Auftritt): string {
  const kern = [a.firma, a.berater, a.telefon].map((s) => s.trim()).filter(voll);
  const teile = kern.length > 0 ? kern : [a.email, a.web].map((s) => s.trim()).filter(voll);
  const text = teile.join(' · ').replace(/\s+/g, ' ');
  return text.length > FUSS_MAX ? `${text.slice(0, FUSS_MAX - 1).trimEnd()}…` : text;
}

/**
 * Ein Text als CSS-Zeichenkette. Maskiert werden Backslash und
 * Anfuehrungszeichen, Steuerzeichen werden zu Leerzeichen — und „<“ wird als
 * CSS-Escape geschrieben, damit ein „</style>“ im Firmennamen auch dort nichts
 * ausrichtet, wo der Text als HTML gelesen wuerde.
 */
export function cssZeichenkette(text: string): string {
  const sauber = text
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/</g, '\\3c ');
  return `"${sauber}"`;
}

/**
 * Die Fusszeile jeder gedruckten Seite: `@page`-Randfelder, die Chrome und
 * Edge ab Version 131 drucken; andere Browser lassen sie weg. Ohne Auftritt
 * leer — dann bleibt der Ausdruck wie bisher.
 *
 * `vertical-align: top` setzt die Zeile direkt unter den Satzspiegel; den
 * unteren Teil des Randes nutzt der Browser, wenn seine eigenen Kopf- und
 * Fusszeilen eingeschaltet sind.
 */
export function fusszeileCss(a: Auftritt | null | undefined): string {
  if (!a || !auftrittSichtbar(a)) return '';
  const links = fusszeileText(a);
  const stil = 'font-family: ui-sans-serif, system-ui, sans-serif; font-size: 8pt; line-height: 1.3; '
    + 'color: #64748b; vertical-align: top; padding-top: 3mm;';
  return [
    '@media print { @page {',
    links ? `  @bottom-left { content: ${cssZeichenkette(links)}; ${stil} text-align: left; }` : '',
    `  @bottom-right { content: "erstellt mit dem JS-Rentenplaner · Seite " counter(page) " von " counter(pages); ${stil} text-align: right; white-space: nowrap; }`,
    '} }',
  ].filter(Boolean).join('\n');
}

/** Farbvorschlaege — alle dunkel genug fuer Ueberschriften. */
export const FARBVORSCHLAEGE: { farbe: string; name: string }[] = [
  { farbe: '#1e3a8a', name: 'Dunkelblau' },
  { farbe: '#0f766e', name: 'Petrol' },
  { farbe: '#166534', name: 'Dunkelgrün' },
  { farbe: '#7f1d1d', name: 'Bordeaux' },
  { farbe: '#334155', name: 'Anthrazit' },
];
