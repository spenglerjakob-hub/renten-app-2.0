import { describe, expect, it } from 'vitest';
import {
  ALLES, KURZ, KURZFASSUNG, THEMEN, gewaehlt, pruefungStand, themaSetzen, vertragSetzen, type DruckAuswahl,
} from './druckauswahl';

const IDS = ['v1', 'v2', 'v3'];

describe('Druckauswahl', () => {
  it('der Vorbehalt ist immer dabei, auch wenn alles andere aus ist', () => {
    const nichts: DruckAuswahl = { aus: [...THEMEN], vertraegeAus: [] };
    expect(gewaehlt({ thema: 'rechtsstand' }, nichts)).toBe(true);
    expect(THEMEN.every((t) => !gewaehlt({ thema: t }, nichts))).toBe(true);
    expect(THEMEN.every((t) => gewaehlt({ thema: t }, ALLES))).toBe(true);
  });

  it('die Kurzfassung sind dieselben Seiten wie frueher der Umfang „kurz“', () => {
    expect(KURZFASSUNG).toEqual(['angaben', 'vertraege', 'renteneinkuenfte', 'partner', 'mitLoesungen']);
    expect(THEMEN.filter((t) => gewaehlt({ thema: t }, KURZ))).toEqual(KURZFASSUNG);
  });

  it('ein Thema an und aus — die Reihenfolge der Auswahl zaehlt nicht', () => {
    const a = themaSetzen(themaSetzen(ALLES, 'merkblatt', false), 'sparziel', false);
    expect(gewaehlt({ thema: 'merkblatt' }, a)).toBe(false);
    expect(gewaehlt({ thema: 'sparziel' }, a)).toBe(false);
    expect(gewaehlt({ thema: 'angaben' }, a)).toBe(true);
    const b = themaSetzen(a, 'merkblatt', true);
    expect(gewaehlt({ thema: 'merkblatt' }, b)).toBe(true);
    expect(themaSetzen(b, 'merkblatt', true).aus).toEqual(['sparziel']);
  });

  it('Vertrags-Pruefungen je Vertrag', () => {
    const a = vertragSetzen(ALLES, 'v2', false, IDS);
    expect(pruefungStand(a, IDS)).toBe('einige');
    expect(gewaehlt({ thema: 'pruefung', vertragId: 'v2' }, a)).toBe(false);
    expect(gewaehlt({ thema: 'pruefung', vertragId: 'v1' }, a)).toBe(true);
    expect(pruefungStand(ALLES, IDS)).toBe('alle');
  });

  it('ist keiner mehr gewaehlt, ist das ganze Thema aus — und einer bringt es zurueck', () => {
    const keiner = IDS.reduce((a, id) => vertragSetzen(a, id, false, IDS), ALLES);
    expect(keiner).toEqual({ aus: ['pruefung'], vertraegeAus: [] });
    expect(pruefungStand(keiner, IDS)).toBe('keine');
    const einer = vertragSetzen(keiner, 'v3', true, IDS);
    expect(einer.aus).toEqual([]);
    expect(IDS.filter((id) => gewaehlt({ thema: 'pruefung', vertragId: id }, einer))).toEqual(['v3']);
  });

  it('das Sammel-Kaestchen schaltet alle Vertraege', () => {
    const einige = vertragSetzen(ALLES, 'v1', false, IDS);
    const aus = themaSetzen(einige, 'pruefung', false);
    expect(pruefungStand(aus, IDS)).toBe('keine');
    const an = themaSetzen(aus, 'pruefung', true);
    expect(pruefungStand(an, IDS)).toBe('alle');
    expect(an).toEqual(ALLES);
  });

  it('abgewaehlte Vertraege eines anderen Falls stoeren nicht', () => {
    const fremd: DruckAuswahl = { aus: [], vertraegeAus: ['alt-1'] };
    expect(pruefungStand(fremd, IDS)).toBe('alle');
    expect(vertragSetzen(fremd, 'v1', false, IDS).vertraegeAus).toEqual(['v1']);
    expect(pruefungStand(ALLES, [])).toBe('keine');
  });
});
