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
