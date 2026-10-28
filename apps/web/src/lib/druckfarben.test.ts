import { describe, expect, it } from 'vitest';
import { DRUCK_VOLLTOENE, druckfarbe, istCmykJpeg } from './druckfarben';

/** Ein JPEG-Kopf bis zum Bildkopf (SOF0) mit `kanaele` Farbkanaelen, davor beliebige Segmente. */
const jpeg = (kanaele: number, davor: number[] = []) => Uint8Array.from([
  0xff, 0xd8, ...davor,
  0xff, 0xc0, 0x00, 8 + 3 * kanaele, 8, 0x00, 0x08, 0x00, 0x08, kanaele, ...Array<number>(3 * kanaele).fill(1),
]);
const segment = (marker: number, laenge: number) => [0xff, marker, laenge >> 8, laenge & 0xff, ...Array<number>(laenge - 2).fill(0)];
const abstand = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

describe('istCmykJpeg', () => {
  it('erkennt vier Farbkanaele, auch hinter langen Metadaten', () => {
    expect(istCmykJpeg(jpeg(4))).toBe(true);
    expect(istCmykJpeg(jpeg(4, [...segment(0xe0, 16), ...segment(0xe1, 40_000), ...segment(0xee, 14)]))).toBe(true);
  });

  it('nicht bei RGB oder Graustufen, PNG oder einem Kopf ohne Bildkopf', () => {
    expect(istCmykJpeg(jpeg(3))).toBe(false);
    expect(istCmykJpeg(jpeg(1))).toBe(false);
    expect(istCmykJpeg(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(false);
    expect(istCmykJpeg(jpeg(4).slice(0, 10))).toBe(false);
    expect(istCmykJpeg(Uint8Array.from([0xff, 0xd8, ...segment(0xe1, 40_000)]).slice(0, 1000))).toBe(false);
  });
});

describe('druckfarbe', () => {
  it('Druckblau C 100 / M 80 / Y 0 / K 15: dunkel wie im Druck statt grell', () => {
    // So rechnet Chrome es um: #002BD9
    const blau = druckfarbe(0, 43, 217);
    expect(abstand(blau, [33, 53, 130])).toBeLessThan(6);
    // Nahe am Blau des Logos im PDF der Agentur (#0C3A85)
    expect(abstand(blau, [12, 58, 133])).toBeLessThan(30);
  });

  it('Rot M 100 / Y 100 ist der Volltonwert, Weiss bleibt Weiss, Schwarz ist K 100', () => {
    expect(druckfarbe(255, 0, 0)).toEqual(DRUCK_VOLLTOENE.my);
    expect(druckfarbe(255, 255, 255)).toEqual([255, 255, 255]);
    expect(druckfarbe(0, 0, 0)).toEqual(DRUCK_VOLLTOENE.k);
  });

  it('Grau aus Schwarz allein bleibt neutral', () => {
    const grau = druckfarbe(102, 102, 102);
    expect(Math.max(...grau) - Math.min(...grau)).toBeLessThanOrEqual(2);
    expect(grau[0]).toBeGreaterThan(110);
    expect(grau[0]).toBeLessThan(128);
  });

  it('ein heller Ton bleibt heller als der Vollton', () => {
    const voll = druckfarbe(0, 43, 217);
    const hell = druckfarbe(128, 149, 236);
    expect(hell[0] + hell[1] + hell[2]).toBeGreaterThan(voll[0] + voll[1] + voll[2]);
  });
});
