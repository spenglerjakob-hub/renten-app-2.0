import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { auftrittLokalMerken, auftrittLokalVerwerfen, offenerAuftrittLokal } from './auftritt-lokal';

const LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('Auftritt im Browser', () => {
  let speicher: Map<string, string>;
  let voll = false;
  beforeEach(() => {
    speicher = new Map();
    voll = false;
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => speicher.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (voll) throw Object.assign(new Error('voll'), { name: 'QuotaExceededError' });
        speicher.set(k, v);
      },
      removeItem: (k: string) => { speicher.delete(k); },
      clear: () => speicher.clear(),
      key: () => null,
      length: 0,
    } as Storage;
  });
  afterEach(() => { delete (globalThis as { localStorage?: Storage }).localStorage; });

  it('merken, wiederfinden, verwerfen', () => {
    expect(auftrittLokalMerken({ firma: 'Muster Finanz GmbH', farbe: '#1E3A8A', logo: LOGO })).toBe('ok');
    expect(offenerAuftrittLokal()).toEqual({ firma: 'Muster Finanz GmbH', farbe: '#1e3a8a', logo: LOGO });
    auftrittLokalVerwerfen();
    expect(offenerAuftrittLokal()).toBeNull();
  });

  it('ein leerer Entwurf wird nicht abgelegt, sondern entfernt', () => {
    auftrittLokalMerken({ firma: 'Muster', farbe: null, logo: null });
    expect(speicher.size).toBe(1);
    auftrittLokalMerken({ firma: '  ', farbe: null, logo: null });
    expect(speicher.size).toBe(0);
  });

  it('nur PNG- und WebP-Data-URLs gehen in den Speicher', () => {
    auftrittLokalMerken({ firma: 'Muster', farbe: null, logo: 'data:image/svg+xml;base64,PHN2Zy8+' });
    expect(offenerAuftrittLokal()?.logo).toBeNull();
  });

  it('nach 14 Tagen ist er weg — und wird dabei aufgeraeumt', () => {
    auftrittLokalMerken({ firma: 'Muster', farbe: null, logo: null });
    expect(offenerAuftrittLokal(Date.now() + 13 * 86_400_000)).not.toBeNull();
    expect(offenerAuftrittLokal(Date.now() + 15 * 86_400_000)).toBeNull();
    expect(speicher.size).toBe(0);
  });

  it('ein kaputter Eintrag wird verworfen statt geladen', () => {
    speicher.set('rentenplaner.auftritt.v1', 'kein json');
    expect(offenerAuftrittLokal()).toBeNull();
    expect(speicher.size).toBe(0);
    speicher.set('rentenplaner.auftritt.v1', JSON.stringify({ seit: Date.now(), firma: 'x', farbe: 'rot', logo: null }));
    expect(offenerAuftrittLokal()).toBeNull();
    expect(speicher.size).toBe(0);
    speicher.set('rentenplaner.auftritt.v1', JSON.stringify({ seit: Date.now(), firma: 'x', farbe: null, logo: 'javascript:alert(1)' }));
    expect(offenerAuftrittLokal()).toBeNull();
  });

  it('voller Speicher: eine Meldung statt eines Absturzes', () => {
    voll = true;
    expect(auftrittLokalMerken({ firma: 'Muster', farbe: null, logo: LOGO })).toBe('voll');
  });
});
