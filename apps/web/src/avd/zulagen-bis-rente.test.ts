import { describe, expect, it } from 'vitest';
import { avdKinderzulageBis, parameterFuer } from '@renten/engine';
import { depotZeitraum, zulagenBisRente } from './zulagen-bis-rente';

// Wie die Seite: der Rechtsstand ab dem Start des Depots, heute 2026.
const JETZT = 2026;
const p = parameterFuer(Math.max(JETZT, 2027), { indexRate: 0.01 });

describe('depotZeitraum', () => {
  it('Rentenbeginn und Beitragsjahre ab dem Start des Depots', () => {
    const z = depotZeitraum('01.01.1996', p, JETZT)!;
    expect(z.rentenbeginn).toEqual({ jahr: 2063, monat: 1 });
    expect(z.startjahr).toBe(2027);
    expect(z.jahre).toBe(36);
    expect(z.zuSpaet).toBe(false);
  });

  it('kommt zu spaet, wenn die Rente vor dem Start beginnt', () => {
    const z = depotZeitraum('01.01.1955', p, JETZT)!;
    expect(z.jahre).toBe(0);
    expect(z.zuSpaet).toBe(true);
  });

  it('kein Zeitraum ohne lesbares, plausibles Datum', () => {
    expect(depotZeitraum('', p, JETZT)).toBeNull();
    expect(depotZeitraum('01.01.1085', p, JETZT)).toBeNull();
    expect(depotZeitraum('01.01.2030', p, JETZT)).toBeNull();
  });
});

describe('zulagenBisRente', () => {
  it('Jahrgang 1996: 36 Jahre volle Grundzulage — bis zu 19.440 €', () => {
    const r = zulagenBisRente(depotZeitraum('01.01.1996', p, JETZT)!, [], p);
    expect(r.beitragVoll).toBe(150);
    expect(r.grundzulageJahr).toBe(540);
    expect(r.bonus).toBe(0);
    expect(r.ohneKinder).toBeCloseTo(36 * 540, 6);
    expect(r.mitKindern).toBe(r.ohneKinder);
  });

  it('unter 25: der Berufseinsteigerbonus kommt einmal dazu', () => {
    const z = depotZeitraum('15.06.2005', p, JETZT)!;
    const r = zulagenBisRente(z, [], p);
    expect(r.bonus).toBe(200);
    expect(r.ohneKinder).toBeCloseTo(z.jahre * 540 + 200, 6);
  });

  it('mit Kind: 300 € je Jahr, solange Kindergeld fliesst — mit Ausbildung laenger', () => {
    const z = depotZeitraum('01.01.1996', p, JETZT)!;
    const kind = { geburtsjahr: 2024 };
    const r = zulagenBisRente(z, [kind], p);
    const jahre = avdKinderzulageBis(kind, p.avd) - z.startjahr + 1;
    expect(r.mitKindern - r.ohneKinder).toBeCloseTo(jahre * p.avd.kinderzulage, 6);

    const mitAusbildung = zulagenBisRente(z, [{ geburtsjahr: 2024, ausbildungBisJahr: 2048 }], p);
    expect(mitAusbildung.mitKindern).toBeGreaterThan(r.mitKindern);
  });

  it('zu spaet: keine Zulage', () => {
    const r = zulagenBisRente(depotZeitraum('01.01.1955', p, JETZT)!, [{ geburtsjahr: 2020 }], p);
    expect(r.ohneKinder).toBe(0);
    expect(r.mitKindern).toBe(0);
    expect(r.bonus).toBe(0);
  });
});
