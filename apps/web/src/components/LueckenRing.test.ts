import { describe, expect, it } from 'vitest';
import type { Jahreszeile } from '@renten/engine';
import { lueckenBoegen } from './LueckenRing';
import { neuerTeil } from '../features/ErgebnisKern';

const UMFANG = 2 * Math.PI * 42;

describe('lueckenBoegen', () => {
  it('ohne neuen Teil genau der Bogen von frueher', () => {
    const anteil = Math.min(1, Math.max(0, 2160 / 3347));
    expect(lueckenBoegen(3347, 2160)).toEqual({ alt: anteil * UMFANG, neu: 0 });
    expect(lueckenBoegen(3347, 2160, 0)).toEqual({ alt: anteil * UMFANG, neu: 0 });
    expect(lueckenBoegen(0, 100)).toEqual({ alt: 0, neu: 0 });
  });

  it('alt und neu ergeben zusammen den gedeckten Teil', () => {
    const b = lueckenBoegen(100, 65, 16, 100);
    expect(b.alt).toBeCloseTo(49, 10);
    expect(b.neu).toBeCloseTo(16, 10);
  });

  it('der neue Teil liegt im gedeckten, nie darueber hinaus', () => {
    expect(lueckenBoegen(100, 30, 50, 100)).toEqual({ alt: 0, neu: 30 });
    expect(lueckenBoegen(100, 30, -5, 100)).toEqual({ alt: 30, neu: 0 });
  });

  it('ueber dem Ziel ist der Ring voll', () => {
    const b = lueckenBoegen(100, 140, 20, 100);
    expect(b.alt + b.neu).toBeCloseTo(100, 10);
    expect(b.neu).toBeCloseTo(20, 10);
  });
});

describe('neuerTeil', () => {
  const zeile = (nettoMonat: number, zielNettoMonat = 3347) => ({ nettoMonat, zielNettoMonat }) as Jahreszeile;

  it('Zuwachs, Bogen und Prozentpunkte — mit der Luecke zusammen 100', () => {
    const t = neuerTeil(zeile(2160), zeile(1641))!;
    expect(t.betrag).toBe(519);
    expect(t.imRing).toBe(519);
    expect(t.prozent).toBe(16);
    const mit = Math.round((2160 / 3347) * 100);
    const vorher = Math.round((1641 / 3347) * 100);
    expect(vorher + t.prozent + (100 - mit)).toBe(100);
  });

  it('der Ring zeigt nur bis zum Ziel, der Betrag bleibt ganz', () => {
    const ueber = neuerTeil(zeile(4000), zeile(3000))!;
    expect(ueber.betrag).toBe(1000);
    expect(ueber.imRing).toBe(347);
    const schonGedeckt = neuerTeil(zeile(4000), zeile(3500))!;
    expect(schonGedeckt.imRing).toBe(0);
    expect(schonGedeckt.betrag).toBe(500);
  });

  it('ohne Zuwachs kein neuer Teil', () => {
    expect(neuerTeil(zeile(1641), zeile(1641))).toBeNull();
    expect(neuerTeil(zeile(1641.3), zeile(1641))).toBeNull();
    expect(neuerTeil(zeile(1600), zeile(1641))).toBeNull();
  });
});
