import { describe, expect, it } from 'vitest';
import { FIRMEN, ortAus, ortSuche } from './ort';

const F = 'a1a1a1a1-0000-4000-8000-00000000000a';
const B = 'b2b2b2b2-0000-4000-8000-00000000000b';

describe('Ort in der Adresse', () => {
  it('ohne Angaben: die Firmen', () => {
    expect(ortAus('')).toEqual(FIRMEN);
    expect(ortSuche(FIRMEN)).toBe('');
  });

  it('Firma mit Reiter, Beratung — hin und zurück', () => {
    for (const o of [
      { firma: F, beratung: null, reiter: 'angebot' as const },
      { firma: F, beratung: null, reiter: 'mitarbeiter' as const },
      { firma: F, beratung: B, reiter: 'mitarbeiter' as const },
    ]) {
      expect(ortAus(ortSuche(o))).toEqual(o);
    }
  });

  it('Unsinn wird ignoriert: keine UUID, Beratung ohne Firma, unbekannter Reiter', () => {
    expect(ortAus('?firma=1%20or%201=1')).toEqual(FIRMEN);
    expect(ortAus(`?beratung=${B}`)).toEqual(FIRMEN);
    expect(ortAus(`?firma=${F}&reiter=geheim`).reiter).toBe('mitarbeiter');
  });
});
