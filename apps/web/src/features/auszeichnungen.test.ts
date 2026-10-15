import { describe, expect, it } from 'vitest';
import type { Loesung, LoesungId } from '@renten/engine';
import { auszeichnungen } from './tuev-berechnung';

/** Eine Loesung mit den Feldern, auf die es hier ankommt. */
const l = (id: LoesungId, x: Partial<Loesung> = {}): Loesung => ({
  id, titel: id, schicht: 2, verfuegbar: true,
  nettoMonat: 100, eigenbeitragMonat: 100, steuerErsparnisMonat: 0, svErsparnisMonat: 0,
  zulageMonat: 0, agZuschussMonat: 0, vertragMonat: 100, hebel: 1, begrenzt: false,
  besteuerung: '', hinweise: [],
  ...x,
});

const netto = [
  l('avd', { hebel: 1.44, vertragMonat: 144 }),
  l('bav', { hebel: 2.84, vertragMonat: 284 }),
  l('basis', { hebel: 1.44, vertragMonat: 144 }),
  l('privat'),
];

describe('auszeichnungen', () => {
  it('Netto-Vorgabe: Meiste ist die bAV, „Günstigste" gibt es nicht', () => {
    expect(auszeichnungen(netto, false)).toEqual({ meiste: ['bav'], guenstigste: [] });
  });

  it('Brutto-Vorgabe: die günstigste und die meiste', () => {
    const brutto = [
      l('avd', { nettoMonat: 69, hebel: 1.6 }),
      l('bav', { nettoMonat: 58, hebel: 1.98 }),
      l('basis', { nettoMonat: 70, hebel: 1.43 }),
      l('privat'),
    ];
    expect(auszeichnungen(brutto, true)).toEqual({ meiste: ['bav'], guenstigste: ['bav'] });
  });

  it('gleichauf: beide bekommen die Auszeichnung', () => {
    const gleich = [l('avd', { hebel: 1.5 }), l('basis', { hebel: 1.5 }), l('privat')];
    expect(auszeichnungen(gleich, false).meiste).toEqual(['avd', 'basis']);
  });

  it('nichts hervorzuheben: nur privat, nur eine Lösung, keine Förderung', () => {
    expect(auszeichnungen([l('privat')], false)).toEqual({ meiste: [], guenstigste: [] });
    expect(auszeichnungen([l('privat'), l('basis', { hebel: 1 })], false).meiste).toEqual([]);
    expect(auszeichnungen([l('privat'), l('basis')], true).guenstigste).toEqual([]);
  });

  it('gedeckelte und nicht verfügbare Lösungen zählen nicht als günstigste', () => {
    const liste = [
      l('avd', { nettoMonat: 40, begrenzt: true, hebel: 1.2 }),
      l('bav', { nettoMonat: 0, verfuegbar: false }),
      l('basis', { nettoMonat: 70, hebel: 1.43 }),
      l('privat'),
    ];
    expect(auszeichnungen(liste, true)).toEqual({ meiste: ['basis'], guenstigste: ['basis'] });
  });
});
