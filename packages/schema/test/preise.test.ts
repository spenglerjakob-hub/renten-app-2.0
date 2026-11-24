import { describe, it, expect } from 'vitest';
import {
  PAKETE, STAFFEL_AB, JAHR_MONATE, EINSTEIGER_BIS, TESTTAGE,
  staffelIndex, preisJeNutzer, regulaerJeNutzer, gesamtpreis, ersparnis, jahresvorteil,
  einsteigerGilt, einsteigerBisText,
  stripeStaffeln, lookupKey, paketDeckt, paketVon,
} from '../src/preise.js';

/*
  Zwei Stichtage statt der Uhr des Rechners: Bis Ende 2027 gilt der
  Einsteigerpreis, danach der regulaere. Die Tests laufen so in jedem Jahr
  gleich — auch mit einer Uhr im neuen Jahr (Skill „jahreswechsel“).
*/
const EINSTIEG = new Date('2027-06-15T12:00:00+02:00');
const DANACH = new Date('2028-06-15T12:00:00+02:00');

describe('Preisstaffel', () => {
  it('ordnet die Nutzerzahl der richtigen Staffel zu', () => {
    const erwartet: [number, number][] = [[1, 0], [2, 0], [3, 1], [4, 1], [5, 2], [7, 2], [8, 3], [50, 3]];
    for (const [nutzer, index] of erwartet) expect(staffelIndex(nutzer)).toBe(index);
  });

  it('behandelt 0, Bruchteile und negative Zahlen wie einen Nutzer', () => {
    expect(staffelIndex(0)).toBe(0);
    expect(staffelIndex(2.9)).toBe(0);
    expect(staffelIndex(-3)).toBe(0);
    expect(gesamtpreis('alles', 'monat', 0, DANACH)).toBe(59);
    expect(gesamtpreis('alles', 'monat', 0, EINSTIEG)).toBe(49);
  });

  it('liefert die vereinbarten regulären Preise je Nutzer und Monat', () => {
    expect([1, 3, 5, 8].map((n) => regulaerJeNutzer('alles', 'monat', n))).toEqual([59, 53, 50, 47]);
    expect([1, 3, 5, 8].map((n) => regulaerJeNutzer('rente', 'monat', n))).toEqual([39, 35, 33, 31]);
    expect([1, 3, 5, 8].map((n) => regulaerJeNutzer('ag', 'monat', n))).toEqual([29, 26, 25, 23]);
  });

  it('rechnet das Jahr als zehn Monate', () => {
    expect(JAHR_MONATE).toBe(10);
    for (const p of PAKETE) {
      for (const n of [1, 3, 5, 8]) {
        for (const tag of [EINSTIEG, DANACH]) {
          expect(preisJeNutzer(p.id, 'jahr', n, tag)).toBe(preisJeNutzer(p.id, 'monat', n, tag) * 10);
        }
        expect(regulaerJeNutzer(p.id, 'jahr', n)).toBe(regulaerJeNutzer(p.id, 'monat', n) * 10);
      }
    }
    expect(jahresvorteil('alles', 1, DANACH)).toBe(59 * 2);
    expect(jahresvorteil('alles', 1, EINSTIEG)).toBe(49 * 2);
  });

  it('summiert und nennt die Ersparnis gegenüber dem Einzelpreis', () => {
    expect(gesamtpreis('alles', 'monat', 3, DANACH)).toBe(159);
    expect(gesamtpreis('rente', 'monat', 3, DANACH)).toBe(105);
    expect(gesamtpreis('ag', 'monat', 3, DANACH)).toBe(78);
    expect(ersparnis('alles', 'monat', 5, DANACH)).toBe(5 * 59 - 5 * 50);
    expect(ersparnis('alles', 'monat', 2, DANACH)).toBe(0);
    expect(gesamtpreis('alles', 'jahr', 8, DANACH)).toBe(8 * 470);
    // Mit dem Einsteigerpreis: dieselbe Rechnung auf den niedrigeren Staffeln.
    expect(gesamtpreis('alles', 'monat', 3, EINSTIEG)).toBe(3 * 44);
    expect(ersparnis('alles', 'monat', 5, EINSTIEG)).toBe(5 * 49 - 5 * 42);
    expect(gesamtpreis('alles', 'jahr', 8, EINSTIEG)).toBe(8 * 390);
  });

  it('hat je Paket eine vollständige, fallende Staffel', () => {
    for (const p of PAKETE) {
      for (const staffel of [p.monat, p.einsteiger]) {
        expect(staffel).toHaveLength(STAFFEL_AB.length);
        for (let i = 1; i < staffel.length; i++) expect(staffel[i]).toBeLessThanOrEqual(staffel[i - 1]!);
        for (const m of staffel) expect(m).toBeGreaterThan(0);
      }
    }
    expect(PAKETE.filter((p) => p.empfohlen).map((p) => p.id)).toEqual(['alles']);
  });
});

describe('Einsteigerpreis', () => {
  it('gilt bis Ende 2027 — danach der reguläre Preis', () => {
    expect(EINSTEIGER_BIS).toBe('2027-12-31');
    expect(einsteigerBisText()).toBe('31.12.2027');
    expect([1, 3, 5, 8].map((n) => preisJeNutzer('alles', 'monat', n, EINSTIEG))).toEqual([49, 44, 42, 39]);
    expect([1, 3, 5, 8].map((n) => preisJeNutzer('rente', 'monat', n, EINSTIEG))).toEqual([35, 32, 30, 28]);
    expect([1, 3, 5, 8].map((n) => preisJeNutzer('ag', 'monat', n, EINSTIEG))).toEqual([25, 23, 21, 20]);
    for (const p of PAKETE) {
      for (const n of [1, 3, 5, 8]) {
        expect(preisJeNutzer(p.id, 'monat', n, DANACH)).toBe(regulaerJeNutzer(p.id, 'monat', n));
      }
    }
  });

  it('wechselt um Mitternacht deutscher Zeit, nicht nach der Uhr des Rechners', () => {
    // 31.12.2027, 23:59 in Deutschland (22:59 UTC): noch Einsteigerpreis.
    expect(einsteigerGilt(new Date('2027-12-31T22:59:00Z'))).toBe(true);
    // 01.01.2028, 00:00 in Deutschland (31.12., 23:00 UTC): regulaer.
    expect(einsteigerGilt(new Date('2027-12-31T23:00:00Z'))).toBe(false);
    expect(einsteigerGilt(new Date('2026-11-24T10:00:00Z'))).toBe(true);
  });

  it('liegt in jeder Staffel unter dem regulären Preis', () => {
    for (const p of PAKETE) {
      p.einsteiger.forEach((e, i) => expect(e).toBeLessThan(p.monat[i]!));
    }
  });

  it('lässt das Bündel in jeder Staffel günstiger als beide Pakete einzeln', () => {
    for (const tag of [EINSTIEG, DANACH]) {
      for (const n of STAFFEL_AB) {
        const einzeln = preisJeNutzer('rente', 'monat', n, tag) + preisJeNutzer('ag', 'monat', n, tag);
        expect(preisJeNutzer('alles', 'monat', n, tag)).toBeLessThan(einzeln);
      }
    }
  });
});

describe('Testphase', () => {
  it('dauert 30 Tage', () => {
    expect(TESTTAGE).toBe(30);
  });
});

describe('Stripe', () => {
  it('baut die Staffeln in Cent mit offenen Grenzen', () => {
    expect(stripeStaffeln('ag', 'monat', DANACH)).toEqual([
      { up_to: 2, unit_amount: 2900 },
      { up_to: 4, unit_amount: 2600 },
      { up_to: 7, unit_amount: 2500 },
      { up_to: 'inf', unit_amount: 2300 },
    ]);
    expect(stripeStaffeln('alles', 'jahr', DANACH).map((s) => s.unit_amount)).toEqual([59000, 53000, 50000, 47000]);
    for (const p of PAKETE) {
      for (const tag of [EINSTIEG, DANACH]) {
        for (const s of stripeStaffeln(p.id, 'monat', tag)) expect(Number.isInteger(s.unit_amount)).toBe(true);
      }
    }
  });

  it('gleicht bis Ende 2027 den Einsteigerpreis ab', () => {
    expect(stripeStaffeln('alles', 'monat', EINSTIEG)).toEqual([
      { up_to: 2, unit_amount: 4900 },
      { up_to: 4, unit_amount: 4400 },
      { up_to: 7, unit_amount: 4200 },
      { up_to: 'inf', unit_amount: 3900 },
    ]);
    expect(stripeStaffeln('rente', 'jahr', EINSTIEG).map((s) => s.unit_amount)).toEqual([35000, 32000, 30000, 28000]);
  });

  it('benennt die Preise einheitlich', () => {
    expect(lookupKey('rente', 'jahr')).toBe('rente_jahr');
  });
});

describe('Bereiche', () => {
  it('schaltet je Paket die richtigen Teile frei', () => {
    expect(paketDeckt('alles', 'rente')).toBe(true);
    expect(paketDeckt('alles', 'ag')).toBe(true);
    expect(paketDeckt('rente', 'ag')).toBe(false);
    expect(paketDeckt('ag', 'rente')).toBe(false);
    expect(paketDeckt(null, 'rente')).toBe(false);
  });

  it('kennt kein unbekanntes Paket', () => {
    // @ts-expect-error: absichtlich falsche Kennung
    expect(() => paketVon('gold')).toThrow();
  });
});
