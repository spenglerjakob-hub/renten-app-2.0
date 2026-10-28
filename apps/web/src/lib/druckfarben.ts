/**
 * Druckfarben in Logos.
 *
 * Logos kommen oft als Druckdatei: ein JPEG in CMYK ohne Farbprofil, etwa
 * aus Illustrator mit dem Profil „Print“. Chrome und Firefox rechnen CMYK
 * dann stark vereinfacht in Bildschirmfarben um — Rot = (1 − C)(1 − K) usw.
 * Ein Druckblau C 100 / M 80 / Y 0 / K 15 wird so zu grellem #002BD9;
 * gedruckt und mit Farbmanagement ist es ein dunkles Blau um #0C3A85.
 *
 * `logoVorbereiten` (bild.ts) rechnet solche Logos nach: Aus der einfachen
 * Umrechnung werden C, M, Y und K zurueckgewonnen und wie im Offsetdruck
 * gemischt. Safari rechnet selbst mit Farbmanagement — dort bleibt das Bild,
 * wie es ist (`browserRechnetEinfach`).
 */

export type Rgb = readonly [number, number, number];

/** Steht unter dem Logo, wenn eine Druckdatei nachgerechnet wurde. */
export const DRUCKFARBEN_HINWEIS = 'Druckdatei (CMYK) erkannt – die Farben sind für den Bildschirm umgerechnet. '
  + 'Am genauesten ist eine Fassung fürs Web (PNG).';

/**
 * Volltoene und Uebereinanderdrucke im Offsetdruck auf gestrichenem Papier
 * (ISO Coated v2, FOGRA39), relativ farbmetrisch in sRGB — das Papier ist
 * Weiss. Gaengige, gerundete Werte: eine Naeherung, kein Farbprofil.
 */
export const DRUCK_VOLLTOENE = {
  papier: [255, 255, 255],
  c: [0, 159, 227],
  m: [229, 0, 125],
  y: [255, 237, 0],
  cm: [49, 39, 131],
  cy: [0, 150, 64],
  my: [227, 6, 19],
  cmy: [43, 41, 40],
  k: [29, 29, 27],
} as const satisfies Record<string, Rgb>;

/**
 * Ist die Datei ein JPEG mit vier Farbkanaelen (CMYK oder YCCK)? `kopf` ist
 * der Anfang der Datei — bis zum Bildkopf (SOF) reicht er bei Logos immer.
 */
export function istCmykJpeg(kopf: Uint8Array): boolean {
  if (kopf[0] !== 0xff || kopf[1] !== 0xd8) return false;
  let i = 2;
  while (i + 3 < kopf.length) {
    if (kopf[i] !== 0xff) return false;
    const marker = kopf[i + 1]!;
    // Fuellbytes und Marker ohne Laenge
    if (marker === 0xff) { i += 1; continue; }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    // Bilddaten oder Ende vor dem Bildkopf: kein Bild, das wir kennen
    if (marker === 0xda || marker === 0xd9) return false;
    // SOF0 bis SOF15 — ohne DHT (C4), JPG (C8) und DAC (CC): Laenge, Bittiefe, Hoehe, Breite, Zahl der Kanaele
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return i + 9 < kopf.length && kopf[i + 9] === 4;
    }
    i += 2 + ((kopf[i + 2]! << 8) | kopf[i + 3]!);
  }
  return false;
}

const zuLinear = (v: number) => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const zuSrgb = (l: number) => {
  const s = l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, s)) * 255);
};

/**
 * Die Farbe im Druck zu einer Farbe aus der einfachen Umrechnung des Browsers.
 *
 * 1. Zurueck zu C, M, Y und K, mit so viel Schwarz wie moeglich. Genau ist das,
 *    wo eine Buntfarbe 0 % hat — bei Logofarben fast immer.
 * 2. C, M und Y dreifach linear zwischen den acht Volltoenen und
 *    Uebereinanderdrucken mischen.
 * 3. Schwarz darueberdrucken: im linearen Licht mit dem Ton von K multipliziert.
 */
export function druckfarbe(r: number, g: number, b: number): Rgb {
  const hell = Math.max(r, g, b) / 255;
  if (hell <= 0) return DRUCK_VOLLTOENE.k;
  const k = 1 - hell;
  const c = 1 - r / 255 / hell;
  const m = 1 - g / 255 / hell;
  const y = 1 - b / 255 / hell;
  const v = DRUCK_VOLLTOENE;
  const kanal = (n: 0 | 1 | 2) => {
    const bunt = (1 - c) * (1 - m) * (1 - y) * v.papier[n] + c * (1 - m) * (1 - y) * v.c[n]
      + (1 - c) * m * (1 - y) * v.m[n] + (1 - c) * (1 - m) * y * v.y[n]
      + c * m * (1 - y) * v.cm[n] + c * (1 - m) * y * v.cy[n] + (1 - c) * m * y * v.my[n] + c * m * y * v.cmy[n];
    const schwarz = 255 + k * (v.k[n] - 255);
    return zuSrgb(zuLinear(bunt) * zuLinear(schwarz));
  };
  return [kanal(0), kanal(1), kanal(2)];
}

/** Alle Pixel einer Leinwand in Druckfarben — jede Farbe einmal gerechnet. */
export function druckfarbenUmrechnen(ctx: CanvasRenderingContext2D, breite: number, hoehe: number): void {
  const bild = ctx.getImageData(0, 0, breite, hoehe);
  const p = bild.data;
  const gerechnet = new Map<number, Rgb>();
  for (let i = 0; i < p.length; i += 4) {
    const schluessel = (p[i]! << 16) | (p[i + 1]! << 8) | p[i + 2]!;
    let neu = gerechnet.get(schluessel);
    if (!neu) {
      neu = druckfarbe(p[i]!, p[i + 1]!, p[i + 2]!);
      gerechnet.set(schluessel, neu);
    }
    p[i] = neu[0];
    p[i + 1] = neu[1];
    p[i + 2] = neu[2];
  }
  ctx.putImageData(bild, 0, 0);
}

/** 8 × 8 Pixel C 100 / M 80 / Y 0 / K 15, mit dem Adobe-Marker wie aus Illustrator */
const PROBE = '/9j/4AAQSkZJRgABAQAAAAAAAAD/7gAOQWRvYmUAZAAAAAAC/9sAQwABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB'
  + 'AQEBAQEBAQEBAQEBAQEBAQEBAQEB/9sAQwEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB'
  + 'AQEB/8AAFAgACAAIBAERAAIRAQMRAQQRAP/EABQAAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAA'
  + 'AAAACQr/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADgQBAAIRAxEEAAA/AEQIhyoFkP/Z';

let einfach: Promise<boolean> | null = null;

/**
 * Rechnet dieser Browser CMYK einfach um (Chrome, Firefox) — oder mit
 * Farbmanagement (Safari)? Nur im ersten Fall wird nachgerechnet; sonst
 * kaemen die Farben doppelt umgerechnet heraus. Einmal geprueft, gemerkt.
 */
export function browserRechnetEinfach(): Promise<boolean> {
  einfach ??= (async () => {
    try {
      const bytes = Uint8Array.from(atob(PROBE), (z) => z.charCodeAt(0));
      const bild = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
      const leinwand = document.createElement('canvas');
      leinwand.width = bild.width;
      leinwand.height = bild.height;
      const ctx = leinwand.getContext('2d');
      if (!ctx) return false;
      ctx.drawImage(bild, 0, 0);
      bild.close();
      const [r = 0, g = 0, b = 0] = ctx.getImageData(4, 4, 1, 1).data;
      return Math.abs(r - 0) <= 4 && Math.abs(g - 43) <= 4 && Math.abs(b - 217) <= 4;
    } catch {
      return false;
    }
  })();
  return einfach;
}
