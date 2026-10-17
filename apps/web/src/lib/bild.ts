/**
 * Fotos vor dem Hochladen vorbereiten.
 *
 * ZWEI GRUENDE. Ein Handyfoto hat zwoelf Megapixel und drei bis acht
 * Megabyte; zum Ablesen einer Gehaltsabrechnung reichen 2400 Pixel an der
 * langen Kante. Und ein Handyfoto traegt in seinen EXIF-Daten oft den Ort, an
 * dem es aufgenommen wurde — die Wohnung des Kunden. Neu gezeichnet und als
 * JPEG gespeichert, ist beides erledigt: kleiner, und ohne Metadaten.
 *
 * Was der Browser nicht lesen kann (HEIC ausserhalb von Safari) und PDFs
 * gehen unveraendert hinaus.
 */
const MAX_KANTE = 2400;
const QUALITAET = 0.85;

export async function bildVorbereiten(datei: File): Promise<{ blob: Blob; name: string }> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(datei.type)) return { blob: datei, name: datei.name };
  try {
    // Mit der Ausrichtung aus den EXIF-Daten — sonst stuende ein Hochformatfoto quer.
    const bild = await createImageBitmap(datei, { imageOrientation: 'from-image' });
    const faktor = Math.min(1, MAX_KANTE / Math.max(bild.width, bild.height));
    const breite = Math.max(1, Math.round(bild.width * faktor));
    const hoehe = Math.max(1, Math.round(bild.height * faktor));
    const leinwand = document.createElement('canvas');
    leinwand.width = breite;
    leinwand.height = hoehe;
    const ctx = leinwand.getContext('2d');
    if (!ctx) throw new Error('Kein Canvas');
    // Weisser Grund: Transparente PNG-Flaechen wuerden im JPEG schwarz.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, breite, hoehe);
    ctx.drawImage(bild, 0, 0, breite, hoehe);
    bild.close();
    const blob = await new Promise<Blob | null>((fertig) => leinwand.toBlob(fertig, 'image/jpeg', QUALITAET));
    if (!blob) throw new Error('Kein Bild');
    return { blob, name: `${datei.name.replace(/\.[^.]+$/, '') || 'Foto'}.jpg` };
  } catch {
    return { blob: datei, name: datei.name };
  }
}

/**
 * Ein Logo fuers Gutachten vorbereiten.
 *
 * ANDERS ALS BEI FOTOS: Die Transparenz bleibt (kein weisser Grund), und es
 * wird PNG — verlustfrei, mit scharfen Kanten. Erst wenn das zu gross wird
 * (ein fotoartiges Logo), WebP; beides kann Transparenz. 800 Pixel an der
 * langen Kante reichen fuer 70 mm Breite im Druck (rund 290 dpi).
 *
 * Kein SVG: Es kann Skripte tragen. Neu gezeichnet ist auch das Logo ohne
 * Metadaten.
 */
export const LOGO_MAX_KANTE = 800;
/** Wie der Bucket `branding` */
export const LOGO_MAX_BYTES = 1024 * 1024;
const LOGO_PNG_BIS = 900 * 1024;
/** Was groesser ankommt, wird gar nicht erst gelesen. */
const LOGO_EINGANG_MAX = 15 * 1024 * 1024;

const LOGO_TYP_AUS_ENDUNG: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
};

export type LogoFehler = 'typ' | 'zu-gross' | 'fehler';

export interface VorbereitetesLogo {
  blob: Blob;
  /** Fuer Vorschau und Browser-Speicher */
  dataUrl: string;
  breite: number;
  hoehe: number;
}

export async function logoVorbereiten(datei: File): Promise<VorbereitetesLogo | LogoFehler> {
  const typ = datei.type || LOGO_TYP_AUS_ENDUNG[datei.name.toLowerCase().split('.').pop() ?? ''] || '';
  if (!/^image\/(png|jpeg|webp)$/.test(typ)) return 'typ';
  if (datei.size > LOGO_EINGANG_MAX) return 'zu-gross';
  try {
    const bild = await createImageBitmap(datei, { imageOrientation: 'from-image' });
    const faktor = Math.min(1, LOGO_MAX_KANTE / Math.max(bild.width, bild.height));
    const breite = Math.max(1, Math.round(bild.width * faktor));
    const hoehe = Math.max(1, Math.round(bild.height * faktor));
    const leinwand = document.createElement('canvas');
    leinwand.width = breite;
    leinwand.height = hoehe;
    const ctx = leinwand.getContext('2d');
    if (!ctx) return 'fehler';
    ctx.drawImage(bild, 0, 0, breite, hoehe);
    bild.close();
    const alsBlob = (art: string, qualitaet?: number) =>
      new Promise<Blob | null>((fertig) => leinwand.toBlob(fertig, art, qualitaet));
    let blob = await alsBlob('image/png');
    if (blob && blob.size > LOGO_PNG_BIS) {
      const webp = await alsBlob('image/webp', 0.9);
      // Safari liefert statt WebP stillschweigend PNG — dann bleibt es beim PNG.
      if (webp && webp.type === 'image/webp' && webp.size < blob.size) blob = webp;
    }
    if (!blob) return 'fehler';
    if (blob.size > LOGO_MAX_BYTES) return 'zu-gross';
    return { blob, dataUrl: await alsDataUrl(blob), breite, hoehe };
  } catch {
    // Unlesbar: beschaedigt, oder ein Format, das der Browser nicht kennt.
    return 'fehler';
  }
}

function alsDataUrl(blob: Blob): Promise<string> {
  return new Promise((fertig, fehler) => {
    const leser = new FileReader();
    leser.onload = () => fertig(String(leser.result));
    leser.onerror = () => fehler(leser.error);
    leser.readAsDataURL(blob);
  });
}

/**
 * Zurueck vom Browser-Speicher zur Datei — nur PNG und WebP, wie sie
 * `logoVorbereiten` erzeugt. Alles andere ist null.
 */
export function dataUrlZuBlob(dataUrl: string): Blob | null {
  const m = /^data:(image\/(?:png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!m) return null;
  try {
    const roh = atob(m[2]!);
    const bytes = new Uint8Array(roh.length);
    for (let i = 0; i < roh.length; i += 1) bytes[i] = roh.charCodeAt(i);
    return new Blob([bytes], { type: m[1] });
  } catch {
    return null;
  }
}
