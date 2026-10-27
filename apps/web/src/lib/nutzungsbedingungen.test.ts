import { describe, expect, it } from 'vitest';
import { NUTZUNGSBEDINGUNGEN_FASSUNG, hatZugestimmt } from './nutzungsbedingungen';

// Relativ zur Fassung geschrieben: Er gilt auf dem Arbeitszweig wie auf live, wo die aeltere Fassung steht.
describe('hatZugestimmt', () => {
  it('laesst durch, wer der Fassung dieser Seite zugestimmt hat', () => {
    expect(hatZugestimmt({ nutzungsbedingungen: NUTZUNGSBEDINGUNGEN_FASSUNG })).toBe(true);
  });

  it('laesst durch, wer einer neueren Fassung zugestimmt hat — etwa auf der Testseite', () => {
    expect(hatZugestimmt({ nutzungsbedingungen: '2999-12-31' })).toBe(true);
  });

  it('fragt erneut nach einer aelteren Fassung', () => {
    expect(hatZugestimmt({ nutzungsbedingungen: '2026-01-01' })).toBe(false);
  });

  it('fragt ohne Zustimmung oder mit unbrauchbarem Wert', () => {
    expect(hatZugestimmt(undefined)).toBe(false);
    expect(hatZugestimmt({})).toBe(false);
    expect(hatZugestimmt({ nutzungsbedingungen: 'ja' })).toBe(false);
    expect(hatZugestimmt({ nutzungsbedingungen: 20261020 })).toBe(false);
  });
});
