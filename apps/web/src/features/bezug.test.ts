import { describe, expect, it } from 'vitest';
import type { ProjektionsErgebnis } from '@renten/engine';
import { szenarioSchema } from '@renten/schema';
import { standardSzenario } from '../store/standard';
import { anteilAmNetto, anteilAnLuecke, nettoHeuteMonat } from './bezug';
import { angebotPositionen } from './tuev-berechnung';

const mitZeile0 = (nettoGesamt: number, vollstaendigImRuhestand = false) =>
  ({ zeilen: [{ nettoGesamt, vollstaendigImRuhestand }] }) as unknown as ProjektionsErgebnis;

describe('Bezugsgroessen', () => {
  it('das heutige Haushaltsnetto — und keines im Ruhestand oder ohne Ergebnis', () => {
    expect(nettoHeuteMonat(mitZeile0(32_280))).toBe(2690);
    expect(nettoHeuteMonat(mitZeile0(32_280, true))).toBe(0);
    expect(nettoHeuteMonat(null)).toBe(0);
  });

  it('ein Betrag als Anteil am Netto', () => {
    expect(anteilAmNetto(412, 2690)?.replace(/\s/g, ' ')).toBe('15,3 %');
    expect(anteilAmNetto(100, 2690)?.replace(/\s/g, ' ')).toBe('3,7 %');
    expect(anteilAmNetto(100, 0)).toBeNull();
    expect(anteilAmNetto(0, 2690)).toBeNull();
  });

  it('der Anteil an der Luecke: hoechstens „ganz“', () => {
    expect(anteilAnLuecke(0.21).replace(/\s/g, ' ')).toBe('21 %');
    expect(anteilAnLuecke(1)).toBe('ganz');
    expect(anteilAnLuecke(0.996)).toBe('ganz');
  });
});

describe('Angebote: welchen Teil der Luecke sie schliessen', () => {
  const mitAngebot = (zielNettoHeute: number) => {
    const s = standardSzenario();
    return szenarioSchema.parse({
      ...s,
      haushalt: { ...s.haushalt, zielNettoHeute },
      loesungen: {
        ...s.loesungen,
        angebote: [{ id: 'x', loesung: 'privat', name: 'Test', beitragMonat: 150, renteMonat: 300 }],
      },
    });
  };

  it('Zuwachs des Haushaltsnettos geteilt durch die Luecke — zwischen 0 und 100 %', () => {
    const [p] = angebotPositionen(mitAngebot(2000));
    expect(p!.rente).not.toBeNull();
    expect(p!.lueckeAnteil).not.toBeNull();
    expect(p!.lueckeAnteil!.anteil).toBeGreaterThan(0);
    expect(p!.lueckeAnteil!.anteil).toBeLessThanOrEqual(1);
    expect(p!.lueckeAnteil!.jahr).toBe(p!.rentenbeginnJahr);
  });

  it('ohne Luecke kein Anteil', () => {
    const [p] = angebotPositionen(mitAngebot(500));
    expect(p!.lueckeAnteil).toBeNull();
  });
});
