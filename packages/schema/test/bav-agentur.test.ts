import { describe, expect, it } from 'vitest';
import {
  AGENTUR_ROLLEN, AXA_VERSICHERER, agenturAnsprechpartner, agenturDatenLesen, agenturDatenSchema, agenturRolleAus, firmenAngebotSchema,
  neuesAngebot,
} from '../src/index.js';

describe('agenturDatenSchema — was die Verwaltung an einer Agentur eintraegt', () => {
  it('leer: alles leer, der Versicherer ist die AXA', () => {
    expect(agenturDatenSchema.parse({})).toEqual({
      vorname: '', nachname: '', organisationsnummer: '', anschrift: '', telefon: '', email: '', bundesland: '',
      versicherer: AXA_VERSICHERER, tarif: '', farbe: '', web: '', zusatz: '',
    });
    expect(AXA_VERSICHERER).toBe('AXA Lebensversicherung AG');
  });

  it('der Auftritt der Agentur: Akzentfarbe, Internetadresse, Zusatzzeile', () => {
    const d = agenturDatenLesen({ farbe: '#1e3a8a', web: 'www.nord.example', zusatz: 'Versicherungsvertreter nach § 34d GewO' });
    expect([d.farbe, d.web, d.zusatz]).toEqual(['#1e3a8a', 'www.nord.example', 'Versicherungsvertreter nach § 34d GewO']);
    // Daten von vor dem Auftritt lesen sich wie bisher — ohne Vorgabe
    expect(agenturDatenLesen({ vorname: 'Anna' })).toMatchObject({ vorname: 'Anna', farbe: '', web: '', zusatz: '' });
    expect(agenturDatenSchema.safeParse({ web: 'x'.repeat(201) }).success).toBe(false);
  });

  it('Rollen: Unbekanntes ist ein Mitglied, nie ein Admin', () => {
    expect(AGENTUR_ROLLEN).toEqual(['mitglied', 'admin']);
    expect([agenturRolleAus('admin'), agenturRolleAus('mitglied'), agenturRolleAus('Admin'), agenturRolleAus(null), agenturRolleAus(undefined)])
      .toEqual(['admin', 'mitglied', 'mitglied', 'mitglied', 'mitglied']);
  });

  it('liest tolerant: Unbrauchbares ergibt die Vorgaben', () => {
    expect(agenturDatenLesen(null)).toEqual(agenturDatenSchema.parse({}));
    expect(agenturDatenLesen({ vorname: 'x'.repeat(61) })).toEqual(agenturDatenSchema.parse({}));
    expect(agenturDatenLesen({ vorname: 'Anna', organisationsnummer: '4711', fremd: 1 }))
      .toMatchObject({ vorname: 'Anna', organisationsnummer: '4711', versicherer: AXA_VERSICHERER });
  });

  it('Ansprechpartner als ein Name', () => {
    expect(agenturAnsprechpartner({ vorname: ' Anna ', nachname: 'Agentin' })).toBe('Anna Agentin');
    expect(agenturAnsprechpartner({ vorname: '', nachname: 'Agentin' })).toBe('Agentin');
    expect(agenturAnsprechpartner({ vorname: '', nachname: ' ' })).toBe('');
  });
});

describe('neuesAngebot — womit eine neue Firma beginnt', () => {
  it('ohne Agentur: AXA und Direktversicherung — damit gelten AXA-Antrag und AXA-Protokoll', () => {
    const a = neuesAngebot();
    expect(a.versicherer).toBe(AXA_VERSICHERER);
    expect(a.durchfuehrungsweg).toBe('direktversicherung');
    expect(a.modell).toEqual({ art: 'zuschuss', quote: 0.5, deckelMonat: 100 });
    expect([a.tarif, a.organisationsnummer, a.kollektivnummer]).toEqual(['', '', '']);
  });

  it('das gespeicherte Angebot einer bestehenden Firma aendert sich nicht: die Vorgabe des Schemas bleibt leer', () => {
    expect(firmenAngebotSchema.parse({}).versicherer).toBe('');
  });

  it('in einer Agentur: ihre Organisationsnummer, ihr Tarif, ihr Sitz', () => {
    const agentur = agenturDatenSchema.parse({ organisationsnummer: ' 4711-08 ', tarif: 'Relax bAV', bundesland: 'Bayern' });
    const a = neuesAngebot(agentur);
    expect([a.versicherer, a.tarif, a.organisationsnummer, a.bundesland]).toEqual([AXA_VERSICHERER, 'Relax bAV', '4711-08', 'Bayern']);
  });

  it('ohne Sitz an der Agentur bleibt die Vorgabe des Angebots', () => {
    expect(neuesAngebot(agenturDatenSchema.parse({})).bundesland).toBe('Nordrhein-Westfalen');
  });

  it('ein geleerter Versicherer an der Agentur bleibt leer', () => {
    expect(neuesAngebot(agenturDatenSchema.parse({ versicherer: '  ' })).versicherer).toBe('');
  });

  it('was der Anlegende schon angegeben hat, geht vor', () => {
    const agentur = agenturDatenSchema.parse({ bundesland: 'Bayern', organisationsnummer: '4711' });
    const a = neuesAngebot(agentur, {
      modell: { art: 'festbetrag', festbetragMonat: 80, mindestUmwandlungMonat: 40 },
      bundesland: 'Hessen', unternehmensSteuersatz: 0.28,
    });
    expect([a.modell.art, a.bundesland, a.unternehmensSteuersatz, a.organisationsnummer, a.versicherer])
      .toEqual(['festbetrag', 'Hessen', 0.28, '4711', AXA_VERSICHERER]);
  });
});
