import { describe, expect, it } from 'vitest';
import { mitTrennstellen } from './trennstellen';

const WEICH = '­';

describe('mitTrennstellen', () => {
  it('trennt die langen Namen an der Wortfuge', () => {
    expect(mitTrennstellen('Betriebsrente (Entgeltumwandlung)')).toBe(`Betriebsrente (Entgelt${WEICH}umwandlung)`);
    expect(mitTrennstellen('Altersvorsorgedepot')).toBe(`Alters${WEICH}vorsorge${WEICH}depot`);
  });

  it('ändert den sichtbaren Text nicht', () => {
    for (const titel of ['Betriebsrente (Entgeltumwandlung)', 'Altersvorsorgedepot', 'Basisrente (Rürup)', 'Private Rente / Depot']) {
      expect(mitTrennstellen(titel).split(WEICH).join('')).toBe(titel);
    }
  });

  it('lässt kurze Namen, wie sie sind', () => {
    expect(mitTrennstellen('Basisrente (Rürup)')).toBe('Basisrente (Rürup)');
  });
});
