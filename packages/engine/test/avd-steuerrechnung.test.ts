import { describe, it, expect } from 'vitest';
import { avdSteuerrechnung, avdSteuervorteil } from '../src/products/altersvorsorgedepot.js';
import { bruttoZuNetto, zveAufschluesselung } from '../src/erwerb/netto.js';
import { tarifGrenzsteuersatz, grundtarif, einkommensteuer } from '../src/tax/estg.js';
import { PARAMETER_2026 } from '../src/params/jahre.js';

/*
  Fest an den belegten Rechtsstand 2026 gebunden: Die Zahlen sollen sich
  nicht verschieben, wenn ein neuer Jahrgang dazukommt.
*/
const p = PARAMETER_2026;
const ohneKinder = { hatKinder: false, kinderUnter25: 0 };
const opt = (verheiratet: boolean) => ({ verheiratet, bundesland: 'Baden-Württemberg', kirchensteuerpflichtig: false });
/** Voller Beitrag: 150 EUR im Monat, 540 EUR Grundzulage */
const voll = { eigenbeitragJahr: 1800, zulagenJahr: 540, kinder: ohneKinder };

describe('zveAufschluesselung', () => {
  it('liefert dasselbe zvE wie bruttoZuNetto, und die Posten gehen auf', () => {
    for (const brutto of [0, 800, 1500, 12_000, 45_000, 90_000, 150_000]) {
      for (const verheiratet of [false, true]) {
        const o = { ...opt(verheiratet), kinder: ohneKinder };
        const z = zveAufschluesselung(brutto, o, p);
        expect(z.zve).toBe(bruttoZuNetto(brutto, o, p).zve);
        expect(z.brutto - z.arbeitnehmerPauschbetrag - z.vorsorgeaufwand - z.sonderausgabenPauschbetrag)
          .toBeCloseTo(z.zve, 6);
        expect(z.arbeitnehmerPauschbetrag).toBeGreaterThanOrEqual(0);
        expect(z.vorsorgeaufwand).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('zieht ohne Einkommen auch keine Pauschbetraege ab', () => {
    const z = zveAufschluesselung(0, { ...opt(true), kinder: ohneKinder }, p);
    expect(z).toEqual({ brutto: 0, arbeitnehmerPauschbetrag: 0, vorsorgeaufwand: 0, sonderausgabenPauschbetrag: 0, zve: 0 });
  });
});

describe('tarifGrenzsteuersatz', () => {
  const e = p.est;

  it('trifft die Anker des Tarifs', () => {
    expect(tarifGrenzsteuersatz(e.grundfreibetrag - 1, false, p)).toBe(0);
    expect(tarifGrenzsteuersatz(e.grundfreibetrag + 1, false, p)).toBeCloseTo(0.14, 3);
    expect(tarifGrenzsteuersatz(e.zone2Ende, false, p)).toBeCloseTo(0.2397, 6);
    expect(tarifGrenzsteuersatz(e.zone3Ende, false, p)).toBeCloseTo(0.42, 6);
    expect(tarifGrenzsteuersatz(e.zone3Ende + 1000, false, p)).toBe(0.42);
    expect(tarifGrenzsteuersatz(e.zone4Ende + 1000, false, p)).toBe(0.45);
  });

  it('stimmt mit der Steuerdifferenz ueber einen breiten Schritt ueberein', () => {
    for (let zve = 13_000; zve <= 120_000; zve += 3_700) {
      const differenz = (grundtarif(zve + 500, e) - grundtarif(zve - 500, e)) / 1000;
      expect(Math.abs(tarifGrenzsteuersatz(zve, false, p) - differenz)).toBeLessThan(0.003);
    }
  });

  it('nimmt im Splitting den Satz des halben gemeinsamen Einkommens', () => {
    for (const zve of [20_000, 45_000, 80_000]) {
      expect(tarifGrenzsteuersatz(2 * zve, true, p)).toBe(tarifGrenzsteuersatz(zve, false, p));
    }
  });
});

describe('avdSteuerrechnung', () => {
  it('rechnet dieselbe Ersparnis wie avdSteuervorteil', () => {
    for (const brutto of [20_000, 35_000, 45_000, 70_000, 120_000]) {
      for (const verheiratet of [false, true]) {
        const r = avdSteuerrechnung({ ...voll, bruttoJahr: brutto, partnerBruttoJahr: 30_000 }, opt(verheiratet), p);
        const v = avdSteuervorteil({ eigenbeitragJahr: 1800, zulagenJahr: 540, zveHeute: r.zve }, opt(verheiratet), p);
        expect(r.ersparnis).toBe(v.steuerersparnis);
        expect(r.ueberZulagen).toBe(v.ueberZulagen);
        expect(r.abzug).toBe(v.abzugsfaehig);
        expect(r.steuerOhneAbzug.gesamt - r.steuerMitAbzug.gesamt).toBeCloseTo(r.ersparnis, 9);
      }
    }
  });

  it('ledig: zvE ist das eigene, Abzug 1.800 plus 540 Zulage', () => {
    const r = avdSteuerrechnung({ ...voll, bruttoJahr: 45_000 }, opt(false), p);
    expect(r.partner).toBeNull();
    expect(r.splitting).toBe(false);
    expect(r.zve).toBe(bruttoZuNetto(45_000, { ...opt(false), kinder: ohneKinder }, p).zve);
    expect(r.eigenbeitragAbziehbar).toBe(1800);
    expect(r.abzug).toBe(2340);
    expect(r.ueberZulagen).toBeCloseTo(Math.max(0, r.ersparnis - 540), 9);
  });

  it('kappt den Eigenbeitrag beim Hoechstbetrag', () => {
    const r = avdSteuerrechnung({ ...voll, eigenbeitragJahr: 3000, bruttoJahr: 60_000 }, opt(false), p);
    expect(r.eigenbeitragAbziehbar).toBe(p.avd.hoechstbetragEigenbeitrag);
    expect(r.abzug).toBe(p.avd.hoechstbetragEigenbeitrag + 540);
  });

  it('verheiratet: zaehlt das Einkommen des Partners mit — die Ersparnis steigt damit', () => {
    const fuer = (partner: number) => avdSteuerrechnung({ ...voll, bruttoJahr: 45_000, partnerBruttoJahr: partner }, opt(true), p);
    const reihe = [0, 30_000, 45_000, 80_000].map(fuer);
    for (let i = 1; i < reihe.length; i++) {
      expect(reihe[i]!.zve).toBeGreaterThan(reihe[i - 1]!.zve);
      expect(reihe[i]!.ersparnis).toBeGreaterThanOrEqual(reihe[i - 1]!.ersparnis);
      expect(reihe[i]!.grenzsteuersatz).toBeGreaterThanOrEqual(reihe[i - 1]!.grenzsteuersatz);
    }
    // Ohne Partnergehalt bleibt es bei der bisherigen Rechnung.
    expect(reihe[0]!.zve).toBe(bruttoZuNetto(45_000, { ...opt(true), kinder: ohneKinder }, p).zve);
    expect(reihe[0]!.partner?.zve).toBe(0);
  });

  it('zwei gleiche Gehaelter im Splitting entlasten wie zweimal der Grundtarif', () => {
    const paar = avdSteuerrechnung({ ...voll, bruttoJahr: 45_000, partnerBruttoJahr: 45_000 }, opt(true), p);
    const allein = avdSteuerrechnung({ ...voll, bruttoJahr: 45_000 }, opt(false), p);
    expect(paar.zve).toBeCloseTo(2 * allein.zve, 6);
    expect(paar.grenzsteuersatzEst).toBeCloseTo(allein.grenzsteuersatzEst, 9);
    expect(einkommensteuer(paar.zve, true, p)).toBe(2 * grundtarif(allein.zve, p.est));
  });

  it('weist den Grenzsteuersatz aus, und der Satz auf den Abzug liegt knapp darunter', () => {
    const r = avdSteuerrechnung({ ...voll, bruttoJahr: 45_000 }, opt(false), p);
    expect(r.grenzsteuersatzEst).toBeGreaterThan(0.25);
    expect(r.grenzsteuersatzEst).toBeLessThan(0.35);
    expect(r.mitSoli).toBe(false);
    expect(r.grenzsteuersatz).toBe(r.grenzsteuersatzEst);
    // Der Tarif steigt mit dem Einkommen: ueber den abgezogenen Betrag hinweg
    // ist der Satz im Schnitt etwas kleiner als am oberen Ende.
    expect(r.satzAufAbzug).toBeGreaterThan(r.grenzsteuersatzEst - 0.02);
    expect(r.satzAufAbzug).toBeLessThanOrEqual(r.grenzsteuersatzEst + 0.005);
  });

  it('rechnet den Soli in den Grenzsteuersatz, sobald er den naechsten Euro belastet', () => {
    const r = avdSteuerrechnung({ ...voll, bruttoJahr: 150_000 }, opt(false), p);
    expect(r.mitSoli).toBe(true);
    expect(r.grenzsteuersatz).toBeGreaterThan(r.grenzsteuersatzEst);
    expect(r.grenzsteuersatz).toBeLessThanOrEqual(0.42 * (1 + p.soli.milderungssatz) + 1e-9);
  });

  it('bei kleinem Einkommen ist die Zulage guenstiger — kein Vorteil darueber hinaus', () => {
    const r = avdSteuerrechnung({ ...voll, bruttoJahr: 20_000 }, opt(false), p);
    expect(r.guenstigerAlsZulage).toBe(false);
    expect(r.ueberZulagen).toBe(0);
    expect(r.ersparnis).toBeLessThanOrEqual(540);
  });
});
