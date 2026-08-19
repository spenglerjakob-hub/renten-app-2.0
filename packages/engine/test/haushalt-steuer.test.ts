import { describe, it, expect } from 'vitest';
import { haushaltssteuer, zusatzsteuer, abgeltungsteuer } from '../src/tax/haushalt.js';
import { bruttoZuNetto, nettoZuBrutto } from '../src/erwerb/netto.js';
import { PARAMETER_2026 } from '../src/params/jahre.js';

const p = PARAMETER_2026;
const opts = { verheiratet: false, bundesland: 'Nordrhein-Westfalen', kirchensteuerpflichtig: false, vorsorgeaufwand: 0, weitereAbzuege: 0 };

describe('Haushaltssteuer', () => {
  const quellen = [
    { id: 'grv', bezeichnung: 'Gesetzliche Rente', brutto: 24000, zveBeitrag: 20000, kvPv: 2000 },
    { id: 'bav', bezeichnung: 'bAV', brutto: 6000, zveBeitrag: 6000, kvPv: 1000 },
    { id: 'prv', bezeichnung: 'Private Rente', brutto: 4000, zveBeitrag: 680, kvPv: 0 },
  ];

  it('Summe der Einzelsteuern entspricht exakt der Gesamtsteuer', () => {
    const r = haushaltssteuer(quellen, opts, p);
    const summe = r.aufteilung.reduce((s, a) => s + a.gesamt, 0);
    expect(summe).toBeCloseTo(r.gesamt, 6);
  });

  it('Gesamtsteuer entspricht der Steuer auf das Gesamt-zvE', () => {
    const r = haushaltssteuer(quellen, opts, p);
    expect(r.zve).toBe(26680);
    // gegen die Tarifformel gegengerechnet
    expect(r.est).toBeGreaterThan(0);
    expect(r.gesamt).toBeCloseTo(r.est + r.soli + r.kirchensteuer, 6);
  });

  it('Grenzsatz liegt ueber dem Durchschnittssatz (progressiver Tarif)', () => {
    const r = haushaltssteuer(quellen, opts, p);
    expect(r.grenzsatz).toBeGreaterThan(r.durchschnittssatz);
  });

  it('Kirchensteuer erhoeht die Belastung um den Landessatz', () => {
    const ohne = haushaltssteuer(quellen, opts, p);
    const mit = haushaltssteuer(quellen, { ...opts, kirchensteuerpflichtig: true }, p);
    expect(mit.kirchensteuer).toBeCloseTo(ohne.est * 0.09, 4);
    const bayern = haushaltssteuer(quellen, { ...opts, kirchensteuerpflichtig: true, bundesland: 'Bayern' }, p);
    expect(bayern.kirchensteuer).toBeCloseTo(ohne.est * 0.08, 4);
  });

  it('ist unabhaengig von der Reihenfolge der Quellen', () => {
    const a = haushaltssteuer(quellen, opts, p);
    const b = haushaltssteuer([...quellen].reverse(), opts, p);
    expect(b.gesamt).toBeCloseTo(a.gesamt, 9);
    expect(b.zve).toBe(a.zve);
  });
});

describe('Zusatzsteuer (Grenzbetrachtung fuer den Vertrags-TUEV)', () => {
  const o = { verheiratet: false, bundesland: 'Berlin', kirchensteuerpflichtig: false };

  it('entspricht der Differenz der Steuerbetraege', () => {
    const basis = 30000;
    const zusatz = 3000;
    const s = zusatzsteuer(basis, zusatz, o, p);
    expect(s).toBeGreaterThan(0);
    // Effektive Belastung des Zusatzbetrags liegt im Progressionsbereich
    expect(s / zusatz).toBeGreaterThan(0.14);
    expect(s / zusatz).toBeLessThan(0.45);
  });

  it('liegt ueber der Durchschnittsbelastung — genau der Fehler des Prototyps', () => {
    const basis = 30000;
    const zusatz = 3000;
    const grenz = zusatzsteuer(basis, zusatz, o, p) / zusatz;
    const r = haushaltssteuer([{ id: 'x', bezeichnung: 'x', brutto: basis, zveBeitrag: basis, kvPv: 0 }], { ...o, vorsorgeaufwand: 0, weitereAbzuege: 0 }, p);
    expect(grenz).toBeGreaterThan(r.durchschnittssatz);
  });
});

describe('Abgeltungsteuer', () => {
  it('betraegt ohne Kirchensteuer 26,375 % des Ertrags', () => {
    const { steuer } = abgeltungsteuer(10000, { kirchensteuerpflichtig: false, bundesland: 'Berlin' }, p);
    expect(steuer / 10000).toBeCloseTo(0.26375, 5);
  });

  it('mindert die Kapitalertragsteuer bei Kirchensteuer (nicht additiv)', () => {
    const { steuer } = abgeltungsteuer(10000, { kirchensteuerpflichtig: true, bundesland: 'Bayern' }, p);
    // 8 % Kirchensteuer -> effektiv 27,82 %, NICHT 26,375 % + 8 %
    expect(steuer / 10000).toBeCloseTo(0.278186, 4);
  });

  it('beruecksichtigt Teilfreistellung und Sparerpauschbetrag', () => {
    const r = abgeltungsteuer(10000, { kirchensteuerpflichtig: false, bundesland: 'Berlin', teilfreistellung: 0.3, sparerpauschbetrag: 1000 }, p);
    expect(r.bemessung).toBeCloseTo(10000 * 0.7 - 1000, 6);
  });
});

describe('Erwerbsphase: Netto <-> Brutto', () => {
  const o = { verheiratet: false, bundesland: 'Nordrhein-Westfalen', kirchensteuerpflichtig: false, kinder: { hatKinder: false, kinderUnter25: 0 } };

  it('Umkehrung trifft das Zielnetto', () => {
    for (const zielMonat of [1800, 2500, 3200, 5000]) {
      const r = nettoZuBrutto(zielMonat * 12, o, p);
      expect(r.jahresnetto).toBeCloseTo(zielMonat * 12, 0);
    }
  });

  it('Netto steigt monoton mit dem Brutto', () => {
    let vorher = -1;
    for (let brutto = 12000; brutto <= 250000; brutto += 2000) {
      const n = bruttoZuNetto(brutto, o, p).jahresnetto;
      expect(n).toBeGreaterThan(vorher);
      vorher = n;
    }
  });

  it('Netto liegt immer unter dem Brutto', () => {
    for (const brutto of [20000, 60000, 120000, 300000]) {
      expect(bruttoZuNetto(brutto, o, p).jahresnetto).toBeLessThan(brutto);
    }
  });

  it('der Faktor 1,55 des Prototyps ist nur in einem schmalen Band brauchbar', () => {
    // Der Faktor ist um rund 2.700 EUR Netto kalibriert und trifft dort gut;
    // nach beiden Seiten laeuft er weg. Genau deshalb darf er nicht die
    // Grundlage des Vertrags-TUEV sein.
    const abweichung = (nettoMonat: number) =>
      nettoMonat * 1.55 - nettoZuBrutto(nettoMonat * 12, o, p).monatsbrutto;

    expect(abweichung(2700)).toBeLessThan(50);        // im Kalibrierpunkt gut
    expect(abweichung(1200)).toBeGreaterThan(250);    // kleine Einkommen: zu hoch
    expect(abweichung(8000)).toBeLessThan(-1500);     // hohe Einkommen: zu niedrig
  });
});
