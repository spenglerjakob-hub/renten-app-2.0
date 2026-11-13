import { describe, expect, it } from 'vitest';
import { firmenAngebotSchema } from '@renten/schema';
import {
  FIRMA_MERKER, datumText, firmaMerken, firmenName, firmenWerte, gemerkteFirma, werteText,
} from './firmenkunde';

const A = 'aaaaaaaa-0000-4000-8000-00000000f001';
const B = 'bbbbbbbb-0000-4000-8000-00000000f002';

/** Ein Speicher wie sessionStorage, nur im Test. */
const speicher = (start: Record<string, string> = {}) => {
  const werte = new Map(Object.entries(start));
  return {
    getItem: (k: string) => werte.get(k) ?? null,
    setItem: (k: string, v: string) => { werte.set(k, v); },
    removeItem: (k: string) => { werte.delete(k); },
    werte,
  };
};

describe('gemerkteFirma — welche Firma beim Laden gilt', () => {
  it('ohne Adresse und ohne Merker: keine', () => {
    expect(gemerkteFirma('', speicher())).toBeNull();
    expect(gemerkteFirma('', null)).toBeNull();
  });

  it('die zuletzt gewählte dieses Tabs', () => {
    expect(gemerkteFirma('', speicher({ [FIRMA_MERKER]: A }))).toBe(A);
  });

  it('die Adresse geht vor — ein Verweis aus der Mitarbeiterberatung führt zur richtigen Firma', () => {
    expect(gemerkteFirma(`?firma=${B}`, speicher({ [FIRMA_MERKER]: A }))).toBe(B);
    expect(gemerkteFirma(`?x=1&firma=${B.toUpperCase()}`, null)).toBe(B);
  });

  it('was keine Kennung ist, zählt nicht — weder aus der Adresse noch aus dem Speicher', () => {
    expect(gemerkteFirma('?firma=<script>', speicher({ [FIRMA_MERKER]: A }))).toBe(A);
    expect(gemerkteFirma('?firma=neu', null)).toBeNull();
    expect(gemerkteFirma('', speicher({ [FIRMA_MERKER]: 'irgendwas' }))).toBeNull();
  });

  it('ein gesperrter Speicher stört nicht', () => {
    const gesperrt = { getItem: () => { throw new Error('gesperrt'); } };
    expect(gemerkteFirma('', gesperrt)).toBeNull();
    expect(gemerkteFirma(`?firma=${A}`, gesperrt)).toBe(A);
  });
});

describe('firmaMerken', () => {
  it('merkt die Kennung und vergisst sie wieder', () => {
    const s = speicher();
    firmaMerken(A, s);
    expect(s.werte.get(FIRMA_MERKER)).toBe(A);
    expect(gemerkteFirma('', s)).toBe(A);
    firmaMerken(null, s);
    expect(s.werte.has(FIRMA_MERKER)).toBe(false);
  });

  it('nur Kennungen — sonst wird vergessen', () => {
    const s = speicher({ [FIRMA_MERKER]: A });
    firmaMerken('neu', s);
    expect(s.werte.has(FIRMA_MERKER)).toBe(false);
  });

  it('ein gesperrter Speicher wirft nicht', () => {
    const gesperrt = { setItem: () => { throw new Error('voll'); }, removeItem: () => { throw new Error('gesperrt'); } };
    expect(() => firmaMerken(A, gesperrt)).not.toThrow();
    expect(() => firmaMerken(null, gesperrt)).not.toThrow();
    expect(() => firmaMerken(A, null)).not.toThrow();
  });
});

describe('firmenWerte — was die Seite aus dem Angebot der Firma übernimmt', () => {
  it('Sitz, Steuersatz und Umlagen — nicht das Modell', () => {
    const angebot = firmenAngebotSchema.parse({
      bundesland: 'Bayern', unternehmensSteuersatz: 0.28, umlagenSatz: 0.025,
      modell: { art: 'festbetrag', festbetragMonat: 80, mindestUmwandlungMonat: 40 },
    });
    expect(firmenWerte(angebot)).toEqual({ bundesland: 'Bayern', steuersatz: 0.28, umlagen: 0.025 });
  });

  it('eine neue Firma bringt die Vorgaben der Seiten mit: 30 %, ohne Umlagen', () => {
    expect(firmenWerte(firmenAngebotSchema.parse({}))).toEqual({ bundesland: 'Nordrhein-Westfalen', steuersatz: 0.3, umlagen: 0 });
  });

  it('der Satz unter der Auswahl', () => {
    expect(werteText({ bundesland: 'Bayern', steuersatz: 0.28, umlagen: 0.025 })).toBe('Sitz Bayern, Steuersatz 28 %, Umlagen 2,5 %');
    expect(werteText({ bundesland: 'Hessen', steuersatz: 0.3, umlagen: 0 })).toBe('Sitz Hessen, Steuersatz 30 %, ohne Umlagen');
    expect(werteText({ bundesland: 'Hessen', steuersatz: 0.315, umlagen: 0.0215 })).toBe('Sitz Hessen, Steuersatz 31,5 %, Umlagen 2,15 %');
  });
});

describe('Name und Datum im Briefkopf', () => {
  it('der Name ohne Ränder und Umbrüche', () => {
    expect(firmenName('  Müller &\n Söhne   GmbH ')).toBe('Müller & Söhne GmbH');
  });

  it('das Datum zweistellig', () => {
    expect(datumText(new Date(2026, 10, 3))).toBe('03.11.2026');
  });
});
