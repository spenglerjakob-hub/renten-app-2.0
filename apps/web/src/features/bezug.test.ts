import { describe, expect, it } from 'vitest';
import type { ProjektionsErgebnis } from '@renten/engine';
import { szenarioSchema } from '@renten/schema';
import { standardSzenario } from '../store/standard';
import { anteilAmNetto, anteilAnLuecke, nettoHeuteMonat } from './bezug';
import { angebotPositionen, ohneEigenaufwand } from './tuev-berechnung';

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

describe('Angebote ohne Eigenbeitrag: rein arbeitgeberfinanzierte bAV', () => {
  const nurArbeitgeber = () => {
    const s = standardSzenario();
    return szenarioSchema.parse({
      ...s,
      haushalt: { ...s.haushalt, zielNettoHeute: 2000 },
      loesungen: {
        ...s.loesungen,
        angebote: [{ id: 'g', loesung: 'bav', name: 'GGF', beitragMonat: 0, agZuschussMonat: 300, renteMonat: 400 }],
      },
    });
  };

  it('wird gerechnet: Rente netto, Anteil an der Luecke, kein eigener Aufwand', () => {
    const [p] = angebotPositionen(nurArbeitgeber());
    expect(p!.rente).not.toBeNull();
    expect(p!.rente!.nettoRenteMonat).toBeGreaterThan(0);
    expect(p!.rente!.echterAufwandMonat).toBe(0);
    expect(p!.lueckeAnteil!.anteil).toBeGreaterThan(0);
    // Ohne eigenen Aufwand gibt es keinen Hebel — die Anzeige setzt einen Strich statt „0,00“.
    expect(ohneEigenaufwand(p!.rente!)).toBe(true);
  });

  it('mit eigener Umwandlung ist es ein gewoehnliches Angebot', () => {
    const s = nurArbeitgeber();
    const [p] = angebotPositionen({ ...s, loesungen: { ...s.loesungen, angebote: [{ ...s.loesungen.angebote[0]!, beitragMonat: 100 }] } });
    expect(p!.rente!.echterAufwandMonat).toBeGreaterThan(0);
    expect(ohneEigenaufwand(p!.rente!)).toBe(false);
    expect(p!.rente!.nettoHebel).toBeGreaterThan(0);
  });

  it('ohne Arbeitgeber und ohne Umwandlung bleibt es leer', () => {
    const s = nurArbeitgeber();
    const [p] = angebotPositionen({ ...s, loesungen: { ...s.loesungen, angebote: [{ ...s.loesungen.angebote[0]!, agZuschussMonat: 0 }] } });
    expect(p!.rente).toBeNull();
  });
});
