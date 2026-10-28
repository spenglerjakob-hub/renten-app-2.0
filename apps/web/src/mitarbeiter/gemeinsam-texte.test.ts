import { describe, expect, it } from 'vitest';
import { betreutText, freigabeText } from './gemeinsam-texte';

describe('Zeile zu einer freigegebenen Firma', () => {
  it('eigene Firma: nur wenn freigegeben', () => {
    expect(freigabeText(true, false, 'Ingrid Inhaberin')).toBeNull();
    expect(freigabeText(true, true, null)).toBe('Fürs Büro freigegeben');
  });

  it('Firma eines Kollegen: von wem — ohne Namen trotzdem erkennbar', () => {
    expect(freigabeText(false, true, 'Ingrid Inhaberin')).toBe('Freigegeben von Ingrid Inhaberin');
    expect(freigabeText(false, true, null)).toBe('Für Ihr Büro freigegeben');
  });
});

describe('„betreut von“ an einer Beratung', () => {
  it('die eigene, die eines Kollegen, ohne Namen keine Zeile', () => {
    expect(betreutText(true, 'Max')).toBe('betreut von Ihnen');
    expect(betreutText(false, 'Max Zwei')).toBe('betreut von Max Zwei');
    expect(betreutText(false, null)).toBeNull();
  });
});
