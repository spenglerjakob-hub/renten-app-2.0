import { describe, expect, it } from 'vitest';
import { ringBoegen } from './AnteilsRing';

describe('ringBoegen', () => {
  it('teilt den Umfang im Verhaeltnis der Werte, nacheinander', () => {
    const b = ringBoegen([93.5, 6.5, 32.5], 132.5);
    expect(b.map((x) => x.laenge)).toEqual([93.5, 6.5, 32.5]);
    expect(b.map((x) => x.beginn)).toEqual([0, 93.5, 100]);
  });

  it('fuellt genau den ganzen Umfang', () => {
    const b = ringBoegen([3, 1, 2], 100);
    const letzter = b[b.length - 1]!;
    expect(letzter.beginn + letzter.laenge).toBeCloseTo(100, 10);
  });

  it('laesst Teile ohne Wert weg, ohne die Reihenfolge zu verschieben', () => {
    const b = ringBoegen([5, 0, 5], 10);
    expect(b.map((x) => x.laenge)).toEqual([5, 0, 5]);
    expect(b.map((x) => x.beginn)).toEqual([0, 5, 5]);
  });

  it('bleibt leer, wenn es nichts zu teilen gibt', () => {
    expect(ringBoegen([0, 0], 10)).toEqual([{ laenge: 0, beginn: 0 }, { laenge: 0, beginn: 0 }]);
    expect(ringBoegen([-3, 0], 10).every((x) => x.laenge === 0)).toBe(true);
  });
});
