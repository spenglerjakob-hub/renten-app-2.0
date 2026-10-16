import { describe, expect, it } from 'vitest';
import type { Jahreszeile } from '@renten/engine';
import { standardSzenario } from '../store/standard';
import { sparzielRechnen, SPARZIEL_VORGABE } from './sparziel-berechnung';
import { gespraechssatz, kaufkraft } from './kaufkraft';

/** Eine Jahreszeile mit den Feldern, auf die es hier ankommt. */
const zeile = (x: Partial<Jahreszeile>): Jahreszeile => ({
  jahr: 2052, alterA: 67, alterB: null,
  vollstaendigImRuhestand: true, gemischtePhase: false,
  bruttoGesamt: 0, kvPvGesamt: 0, steuerGesamt: 0, nettoGesamt: 0, nettoMonat: 1500,
  zielNettoMonat: 3346, kaufkraftfaktor: 1.673,
  zve: 0, durchschnittssatz: 0, grenzsatz: 0,
  posten: [], parameterFortgeschrieben: false,
  ...x,
});

describe('Kaufkraft bis zum Rentenbeginn', () => {
  it('rechnet den Kaufkraftverlust in Euro und beide Massstaebe der Luecke', () => {
    const k = kaufkraft(zeile({}))!;
    expect(k.bedarfHeute).toBeCloseTo(2000, 0);
    expect(k.nettoHeute).toBeCloseTo(896.6, 1);
    expect(k.verlustMonat).toBeCloseTo(603.4, 1);
    expect(k.verlustQuote).toBeCloseTo(0.4023, 4);
    expect(k.lueckeNominal).toBe(1846);
    expect(k.lueckeHeute).toBeCloseTo(1103.4, 1);
    // Verlust und heutiger Wert ergeben zusammen den Betrag des Rentenjahres.
    expect(k.verlustMonat + k.nettoHeute).toBeCloseTo(k.nettoNominal, 9);
  });

  it('die Luecke in heutiger Kaufkraft ist dieselbe Zahl wie im Sparrechner', () => {
    const jetzt = new Date().getFullYear();
    const z = zeile({ jahr: jetzt + 26 });
    const r = sparzielRechnen(standardSzenario(), z, SPARZIEL_VORGABE)!;
    expect(kaufkraft(z)!.lueckeHeute).toBeCloseTo(r.lueckeHeute, 9);
  });

  it('nichts zu zeigen, wenn der Ruhestand schon begonnen hat oder kein Ziel gesetzt ist', () => {
    expect(kaufkraft(zeile({ kaufkraftfaktor: 1 }))).toBeNull();
    expect(kaufkraft(zeile({ zielNettoMonat: 0 }))).toBeNull();
  });

  it('der Satz fuer das Gespraech nennt beide Zahlen und die Annahme', () => {
    const satz = gespraechssatz(kaufkraft(zeile({}))!, 0.02).replace(/\s/g, ' ');
    expect(satz).toContain('fehlen im Ruhestand voraussichtlich 1.103 € im Monat in heutiger Kaufkraft');
    expect(satz).toContain('im Jahr 2052 sind das 1.846 €');
    expect(satz).toContain('Ihr Netto von 1.500 € im Jahr 2052 entspricht in heutigen Preisen 897 €');
    expect(satz).toMatch(/bei 2(,0)? % Inflation pro Jahr/);
  });

  it('ohne Luecke sagt der Satz, dass das Ziel gedeckt ist', () => {
    const satz = gespraechssatz(kaufkraft(zeile({ nettoMonat: 3600 }))!, 0.02);
    expect(satz).toMatch(/^Ihr Ziel ist voraussichtlich gedeckt\./);
    expect(satz).not.toContain('fehlen');
  });
});
