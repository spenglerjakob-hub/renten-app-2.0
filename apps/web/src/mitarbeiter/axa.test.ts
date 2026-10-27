import { describe, expect, it } from 'vitest';
import { beratungDatenSchema, firmenAngebotSchema } from '@renten/schema';
import { beitragsRechnung } from './rechnung';
import { axaBetraege, axaFehlt, istAxaAntrag } from './axa';

const angebot = (x: object) => firmenAngebotSchema.parse({ versicherer: 'AXA Lebensversicherung AG', ...x });
const beratung = (umwandlungMonat = 150, axa: object = {}) => beratungDatenSchema.parse({
  angaben: { name: 'Anna Beispiel', geburtsdatum: '15.04.1990', jahresbrutto: 48_000 },
  umwandlungMonat,
  entscheidung: { status: 'teilnahme', axa },
});

describe('istAxaAntrag', () => {
  it('gilt bei AXA und Direktversicherung — gleich wie der Versicherer geschrieben ist', () => {
    for (const versicherer of ['AXA', 'AXA Lebensversicherung AG', 'axa leben', 'Die AXA']) {
      expect(istAxaAntrag(angebot({ versicherer }))).toBe(true);
    }
  });

  it('gilt nicht fuer andere Versicherer oder Woerter, die nur AXA enthalten', () => {
    for (const versicherer of ['', 'Allianz', 'Saxa Versicherung', 'Taxa AG']) {
      expect(istAxaAntrag(angebot({ versicherer }))).toBe(false);
    }
  });

  it('nur fuer die Direktversicherung, nicht fuer Pensionskasse, Pensionsfonds oder Matching in die U-Kasse', () => {
    expect(istAxaAntrag(angebot({ durchfuehrungsweg: 'pensionskasse' }))).toBe(false);
    expect(istAxaAntrag(angebot({ durchfuehrungsweg: 'pensionsfonds' }))).toBe(false);
    expect(istAxaAntrag(angebot({ modell: { art: 'matching', weg: 'ukasse', matchingMonat: 100 } }))).toBe(false);
    expect(istAxaAntrag(angebot({ modell: { art: 'matching', weg: 'dv', matchingMonat: 100 } }))).toBe(true);
    expect(istAxaAntrag(angebot({ modell: { art: 'festbetrag', festbetragMonat: 50, mindestUmwandlungMonat: 50 } }))).toBe(true);
  });
});

describe('axaBetraege', () => {
  it('Umwandlung und Arbeitgeberbeitrag ergeben den Beitrag der Direktversicherung — in jedem Modell', () => {
    const modelle = [
      { art: 'zuschuss', quote: 0.5, deckelMonat: 100 },
      { art: 'festbetrag', festbetragMonat: 50, mindestUmwandlungMonat: 50 },
      { art: 'matching', weg: 'dv', matchingMonat: 100 },
    ];
    for (const modell of modelle) {
      const r = beitragsRechnung(angebot({ modell }), beratung(150));
      const b = axaBetraege(r);
      const direkt = r.vertraege.find((v) => v.weg === 'direkt')!;
      expect(b.umwandlung).toBe(150);
      expect(b.arbeitgeber).toBeCloseTo(direkt.arbeitgeberMonat, 9);
      expect(b.gesamt).toBeCloseTo(direkt.beitragMonat, 9);
    }
  });

  it('Zuschussmodell 50 % bis 100 €: 150 € Umwandlung, 75 € dazu, 225 € zusammen', () => {
    const b = axaBetraege(beitragsRechnung(angebot({}), beratung(150)));
    expect(b.arbeitgeber).toBeCloseTo(75, 6);
    expect(b.gesamt).toBeCloseTo(225, 6);
  });
});

describe('axaFehlt', () => {
  const alles = {
    arbeitsunfaehig: 'nein', einschraenkung: 'nein', buRente: 'nein', kanal: 'persoenlich',
    erlaeutert: { versteuerung: 'ja', funktionsweise: 'ja', ausscheiden: 'ja', insolvenz: 'ja' },
  };

  it('nichts, wenn alles beantwortet ist — auch mit Ja oder Nein', () => {
    expect(axaFehlt(beratung(150, alles))).toEqual([]);
    expect(axaFehlt(beratung(150, { ...alles, buRente: 'ja', erlaeutert: { ...alles.erlaeutert, insolvenz: 'nein' } }))).toEqual([]);
  });

  it('nennt, was fehlt', () => {
    expect(axaFehlt(beratung())).toEqual(['die drei Fragen zur Gesundheit', 'wie die Beratung erfolgte', 'die erläuterten Besonderheiten']);
    expect(axaFehlt(beratung(150, { ...alles, einschraenkung: '' }))).toEqual(['die drei Fragen zur Gesundheit']);
    expect(axaFehlt(beratung(150, { ...alles, erlaeutert: { ...alles.erlaeutert, ausscheiden: '' } }))).toEqual(['die erläuterten Besonderheiten']);
  });
});
