import { describe, expect, it } from 'vitest';
import { beratungDatenSchema, firmenAngebotSchema } from '@renten/schema';
import { beitragsRechnung } from './rechnung';
import { AUFTRITT_LEER } from '../features/auftritt';
import {
  axaBausteine, axaBerater, axaBetraege, axaFehlt, axaOrganr, axaVerzichtZuschuss, istAxaAntrag, mitGesundheitsfragen,
} from './axa';

const angebot = (x: object) => firmenAngebotSchema.parse({ versicherer: 'AXA Lebensversicherung AG', ...x });
const beratung = (umwandlungMonat = 150, axa: object = {}, status = 'teilnahme') => beratungDatenSchema.parse({
  angaben: { name: 'Anna Beispiel', geburtsdatum: '15.04.1990', jahresbrutto: 48_000 },
  umwandlungMonat,
  entscheidung: { status, axa },
});
const auftritt = { ...AUFTRITT_LEER, berater: 'Max Berater', vorname: 'Max', nachname: 'Berater' };

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
    buBefreiung: 'nein', kanal: 'persoenlich',
    erlaeutert: { versteuerung: 'ja', funktionsweise: 'ja', ausscheiden: 'ja', insolvenz: 'ja' },
  };
  const fragen = { arbeitsunfaehig: 'nein', einschraenkung: 'nein', buRente: 'nein' };

  it('nichts, wenn alles beantwortet ist — auch mit Ja oder Nein', () => {
    expect(axaFehlt(beratung(150, alles), 'Max Berater')).toEqual([]);
    expect(axaFehlt(beratung(150, { ...alles, erlaeutert: { ...alles.erlaeutert, insolvenz: 'nein' } }), 'Max Berater')).toEqual([]);
    expect(axaFehlt(beratung(150, { ...alles, ...fragen, buBefreiung: 'ja', buRente: 'ja' }), 'Max Berater')).toEqual([]);
  });

  it('die Fragen zur Gesundheit nur mit dem BU-Zusatz', () => {
    expect(axaFehlt(beratung(150, { ...alles, buBefreiung: 'ja' }), 'Max Berater')).toEqual(['die drei Fragen zur Gesundheit']);
    expect(axaFehlt(beratung(150, { ...alles, ...fragen, buBefreiung: 'ja', einschraenkung: '' }), 'Max Berater'))
      .toEqual(['die drei Fragen zur Gesundheit']);
  });

  it('nennt, was fehlt', () => {
    expect(axaFehlt(beratung(), '')).toEqual([
      'der Name des Beraters', 'ob die Beitragsbefreiung bei Berufsunfähigkeit eingeschlossen ist',
      'wie die Beratung erfolgte', 'die erläuterten Besonderheiten',
    ]);
    expect(axaFehlt(beratung(150, { ...alles, erlaeutert: { ...alles.erlaeutert, ausscheiden: '' } }), 'Max Berater'))
      .toEqual(['die erläuterten Besonderheiten']);
  });

  it('bei Verzicht nur, was ins Protokoll gehoert — ohne BU-Zusatz und Gesundheit', () => {
    expect(axaFehlt(beratung(150, {}, 'verzicht'), '')).toEqual(['der Name des Beraters', 'wie die Beratung erfolgte', 'die erläuterten Besonderheiten']);
    expect(axaFehlt(beratung(150, { ...alles, buBefreiung: '' }, 'verzicht'), 'Max Berater')).toEqual([]);
  });
});

describe('axaBerater und axaOrganr', () => {
  it('der Name aus der Beratung, sonst aus „Ihr Auftritt“', () => {
    expect(axaBerater(beratung().entscheidung.axa, auftritt)).toEqual({ vorname: 'Max', nachname: 'Berater' });
    expect(axaBerater(beratung(150, { beraterVorname: ' Erika ', beraterNachname: 'Kollegin' }).entscheidung.axa, auftritt))
      .toEqual({ vorname: 'Erika', nachname: 'Kollegin' });
    expect(axaBerater(beratung(150, { beraterNachname: 'Kollegin' }).entscheidung.axa, auftritt)).toEqual({ vorname: '', nachname: 'Kollegin' });
    expect(axaBerater(beratung().entscheidung.axa, null)).toEqual({ vorname: '', nachname: '' });
    // Ein Auftritt nur mit dem ganzen Namen (Live-Seite) wird geteilt.
    expect(axaBerater(beratung().entscheidung.axa, { ...AUFTRITT_LEER, berater: 'Anna Maria Muster' }))
      .toEqual({ vorname: 'Anna Maria', nachname: 'Muster' });
  });

  it('die Organr. der Beratung, sonst die der Firma', () => {
    expect(axaOrganr(beratung().entscheidung.axa, angebot({ organisationsnummer: '1234' }))).toBe('1234');
    expect(axaOrganr(beratung(150, { organisationsnummer: ' 9876 ' }).entscheidung.axa, angebot({ organisationsnummer: '1234' }))).toBe('9876');
    expect(axaOrganr(beratung().entscheidung.axa, angebot({}))).toBe('');
  });
});

describe('BU-Zusatz in Antrag und Protokoll', () => {
  it('Fragen zur Gesundheit mit dem Zusatz und unbeantwortet, nicht ohne ihn', () => {
    expect(mitGesundheitsfragen(beratung(150, { buBefreiung: 'ja' }).entscheidung.axa)).toBe(true);
    expect(mitGesundheitsfragen(beratung(150, { buBefreiung: '' }).entscheidung.axa)).toBe(true);
    expect(mitGesundheitsfragen(beratung(150, { buBefreiung: 'nein' }).entscheidung.axa)).toBe(false);
  });

  it('die Baustein-Zeile nennt den Zusatz nur, wenn er gewaehlt ist', () => {
    const f = angebot({ tarif: 'Relax Rente' });
    expect(axaBausteine(f, beratung(150, { buBefreiung: 'ja' }).entscheidung.axa)).toBe('Relax Rente, Beitragsbefreiung bei Berufsunfähigkeit');
    expect(axaBausteine(f, beratung(150, { buBefreiung: 'nein' }).entscheidung.axa)).toBe('Relax Rente');
    expect(axaBausteine(angebot({}), beratung(150, { buBefreiung: 'ja' }).entscheidung.axa)).toBe('Beitragsbefreiung bei Berufsunfähigkeit');
  });
});

describe('axaVerzichtZuschuss', () => {
  it('Zuschussmodell: die Quote und was der Arbeitgeber laut Beratung dazugaebe', () => {
    const f = angebot({});
    expect(axaVerzichtZuschuss(f, beitragsRechnung(f, beratung(150)))).toEqual({ prozent: 50, euro: expect.closeTo(75, 6) });
    expect(axaVerzichtZuschuss(f, beitragsRechnung(f, beratung(0)))).toEqual({ prozent: 50, euro: null });
  });

  it('Festbetrag und Matching: ohne Prozent; ohne Umwandlung der feste Betrag des Modells', () => {
    const fest = angebot({ modell: { art: 'festbetrag', festbetragMonat: 50, mindestUmwandlungMonat: 50 } });
    expect(axaVerzichtZuschuss(fest, beitragsRechnung(fest, beratung(150)))).toEqual({ prozent: null, euro: expect.closeTo(50, 6) });
    expect(axaVerzichtZuschuss(fest, beitragsRechnung(fest, beratung(0)))).toEqual({ prozent: null, euro: 50 });
    const matching = angebot({ modell: { art: 'matching', weg: 'dv', matchingMonat: 100 } });
    const r = beitragsRechnung(matching, beratung(150));
    expect(axaVerzichtZuschuss(matching, r)).toEqual({ prozent: null, euro: expect.closeTo(r.arbeitgeberMonat, 9) });
    expect(axaVerzichtZuschuss(matching, beitragsRechnung(matching, beratung(0)))).toEqual({ prozent: null, euro: 100 });
  });
});
