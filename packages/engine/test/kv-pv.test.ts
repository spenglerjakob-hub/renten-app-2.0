import { PKV_VORGABE } from '../src/social/pkv.js';
import { describe, it, expect } from 'vitest';
import {
  kvPvImAlter, kvSatzVoll, pvSatzMitglied, bavFreibetragMonat,
  type Beitragspflichtig,
} from '../src/social/kv-pv.js';
import { parameterFuer } from '../src/params/registry.js';
import { projiziere } from '../src/projection/timeline.js';
import type { Szenario } from '../src/model.js';

/**
 * Fuer die Kranken- und Pflegeversicherung im Alter gab es bis hierher KEINEN
 * Test. Genau deshalb ist unbemerkt geblieben, dass der Kassenbon einem
 * Ruerup-Vertrag Beitraege zuschrieb, die er gar nicht ausloest.
 */

const p = parameterFuer(2026, { indexRate: 0 });
const kinderlos = { hatKinder: false, kinderUnter25: 0 };
const mitKindern = { hatKinder: true, kinderUnter25: 3 };

const rente = (betrag: number): Beitragspflichtig =>
  ({ id: 'rente', art: 'gesetzlicheRente', monatsbetrag: betrag });
const versorgung = (betrag: number, id = 'bav'): Beitragspflichtig =>
  ({ id, art: 'versorgungsbezug', monatsbetrag: betrag });
const sonstiges = (betrag: number, id = 'ruerup'): Beitragspflichtig =>
  ({ id, art: 'sonstiges', monatsbetrag: betrag });

describe('KV/PV im Alter: die Saetze', () => {
  it('auf die gesetzliche Rente: HALBER Krankenkassenbeitrag, VOLLER Pflegebeitrag', () => {
    // Die Rentenversicherung traegt die Haelfte der Krankenversicherung
    // (§ 249a SGB V), die Pflegeversicherung traegt der Rentner ALLEIN
    // (§ 59 Abs. 1 SGB XI). Wer beides haelftelt, rechnet die Belastung
    // deutlich zu niedrig.
    const r = kvPvImAlter('kvdr', [rente(2000)], kinderlos, p);
    expect(r.kv).toBeCloseTo(2000 * (kvSatzVoll(p) / 2), 6);
    expect(r.pv).toBeCloseTo(2000 * pvSatzMitglied(kinderlos, p), 6);
    // 8,75 % + 4,2 % = 12,95 %
    expect(r.gesamt / 2000).toBeCloseTo(0.1295, 4);
  });

  it('die Pflegeversicherung wird NICHT halbiert', () => {
    const r = kvPvImAlter('kvdr', [rente(2000)], kinderlos, p);
    expect(r.pv).toBeGreaterThan(2000 * pvSatzMitglied(kinderlos, p) * 0.9);
  });

  it('Kinderlosenzuschlag und Abschlaege ab dem 2. Kind', () => {
    const ohne = kvPvImAlter('kvdr', [rente(2000)], kinderlos, p);
    const mit = kvPvImAlter('kvdr', [rente(2000)], mitKindern, p);
    expect(ohne.pv).toBeGreaterThan(mit.pv);
    // kinderlos 4,2 %; mit drei Kindern 3,6 − 2 × 0,25 = 3,1 %
    expect(ohne.pv / 2000).toBeCloseTo(0.042, 4);
    expect(mit.pv / 2000).toBeCloseTo(0.031, 4);
  });
});

describe('KV/PV im Alter: welche Einkunft was ausloest', () => {
  it('Ruerup und private Rente sind in der KVdR beitragsfrei', () => {
    // Eine private Leibrente ist kein Versorgungsbezug. Pflichtversicherte
    // Rentner zahlen darauf nichts.
    const nur = kvPvImAlter('kvdr', [sonstiges(1000)], kinderlos, p);
    expect(nur.gesamt).toBe(0);

    const mitRente = kvPvImAlter('kvdr', [rente(2000), sonstiges(1000)], kinderlos, p);
    const ohneRuerup = kvPvImAlter('kvdr', [rente(2000)], kinderlos, p);
    expect(mitRente.gesamt).toBeCloseTo(ohneRuerup.gesamt, 6);
  });

  it('freiwillig Versicherte zahlen darauf den vollen Satz', () => {
    const r = kvPvImAlter('freiwillig', [rente(2000), sonstiges(1000)], kinderlos, p);
    const ohne = kvPvImAlter('freiwillig', [rente(2000)], kinderlos, p);
    expect(r.gesamt - ohne.gesamt)
      .toBeCloseTo(1000 * (kvSatzVoll(p) + pvSatzMitglied(kinderlos, p)), 6);
  });

  it('Versorgungsbezuege: voller Satz, Freibetrag in der KV, Freigrenze in der PV', () => {
    const fb = bavFreibetragMonat(p);
    const r = kvPvImAlter('kvdr', [versorgung(1000)], kinderlos, p);
    // KV: der Freibetrag mindert die Bemessungsgrundlage.
    expect(r.kv).toBeCloseTo((1000 - fb) * kvSatzVoll(p), 6);
    // PV: oberhalb der Freigrenze ist der VOLLE Betrag beitragspflichtig.
    expect(r.pv).toBeCloseTo(1000 * pvSatzMitglied(kinderlos, p), 6);
  });

  it('unterhalb der Freigrenze bleibt der Versorgungsbezug beitragsfrei', () => {
    const fb = bavFreibetragMonat(p);
    const r = kvPvImAlter('kvdr', [versorgung(fb - 1)], kinderlos, p);
    expect(r.gesamt).toBe(0);
  });
});

describe('KV/PV im Alter: die Zuordnung auf die Quellen', () => {
  it('die Einzelbetraege ergeben in der Summe den Gesamtbetrag', () => {
    const r = kvPvImAlter(
      'kvdr',
      [rente(2000), versorgung(800), sonstiges(500)],
      kinderlos, p,
    );
    const summe = r.jeQuelle.reduce((s, q) => s + q.kv + q.pv, 0);
    expect(summe).toBeCloseTo(r.gesamt, 6);
  });

  it('DER GEMELDETE FEHLER: der Ruerup traegt exakt null', () => {
    // Vorher wurde der Gesamtbetrag nach dem Brutto verteilt. Im Kassenbon
    // stand deshalb beim Ruerup ein Beitrag, den es nicht gibt — und der
    // gesetzlichen Rente fehlte er.
    const r = kvPvImAlter('kvdr', [rente(3666), sonstiges(1000)], kinderlos, p);
    const ruerup = r.jeQuelle.find((q) => q.id === 'ruerup');
    expect(ruerup === undefined || ruerup.kv + ruerup.pv === 0).toBe(true);

    const grv = r.jeQuelle.find((q) => q.id === 'rente')!;
    expect(grv.kv + grv.pv).toBeCloseTo(r.gesamt, 6);
  });

  it('die Verteilung folgt dem Satz, nicht dem Betrag', () => {
    // Gesetzliche Rente 12,95 %, Versorgungsbezug rund 21,7 % nach Abzug des
    // Freibetrags. Gleich hohe Betraege duerfen NICHT gleich viel tragen.
    const r = kvPvImAlter('kvdr', [rente(1000), versorgung(1000)], kinderlos, p);
    const grv = r.jeQuelle.find((q) => q.id === 'rente')!;
    const bav = r.jeQuelle.find((q) => q.id === 'bav')!;
    expect(bav.kv + bav.pv).toBeGreaterThan(grv.kv + grv.pv);
  });
});

describe('KV/PV im Alter: privat Versicherte', () => {
  it('der Zuschuss enthaelt den halben Zusatzbeitrag', () => {
    // § 106 Abs. 2 SGB VI seit 2019: halber allgemeiner Satz ZUZUEGLICH des
    // halben durchschnittlichen Zusatzbeitrags. Ohne ihn fiel der Zuschuss
    // 2026 um 1,45 % der Rente zu niedrig aus.
    const praemie = 700;
    const r = kvPvImAlter('pkv', [rente(2000)], kinderlos, p, { pkvPraemieMonat: praemie });
    const zuschuss = praemie - r.kv;
    expect(zuschuss).toBeCloseTo(2000 * (kvSatzVoll(p) / 2), 6);
    // Der alte, zu niedrige Wert waere gewesen:
    expect(zuschuss).toBeGreaterThan(2000 * (p.kv.allgemeinerSatz / 2));
  });

  it('der Zuschuss ist auf die halbe Praemie begrenzt', () => {
    const r = kvPvImAlter('pkv', [rente(5000)], kinderlos, p, { pkvPraemieMonat: 200 });
    expect(r.kv).toBeCloseTo(100, 6);
  });
});

describe('Gegenprobe an der Zeitachse', () => {
  // Der Fall aus der Meldung: gesetzliche Rente plus Ruerup, Rentenbeginn
  // 2068, kinderlos, kirchensteuerpflichtig.
  const szenario: Szenario = {
    schemaVersion: 1,
    haushalt: {
      verheiratet: false, bundesland: 'Baden-Württemberg', kirchensteuer: true,
      hatKinder: false, kinderUnter25: 0, kinder: [],
      kvStatus: 'kvdr', pkv: PKV_VORGABE, zielNettoHeute: 2500,
    },
    annahmen: { inflation: 0.02, rentendynamik: 0.01, tarifIndex: 0.01, gehaltsdynamik: 0.02 },
    einkommenHeute: {
      modus: 'brutto', betrag: 5300, auszahlungen: 12,
      besoldungsgruppe: 'A13', besoldungsstufe: 4, besoldungsland: 'Baden-Württemberg',
    grvPflicht: false, grvBeitragMonat: 0,
    },
    personen: [{
      id: 'A', name: '', geburtsdatum: '01.04.2001', rentenbeginn: '01.04.2068',
      art: 'grv', grvBruttoHeute: 2414,
      besoldungsgruppe: 'A13', besoldungsstufe: 8, ruhegehaltssatz: 71.75,
      dienstbeginn: '01.01.2021', teilzeitphasen: [],
    }],
    vertraege: [{
      id: 'v1', inhaber: 'A', schicht: 1, typ: 'basis', name: 'Rürup',
      brutto: 1000, strategie: 'rente', altvertrag: false,
    }],
    planer: { startkapital: 0, dauerJahre: 25, rendite: 0.02, dynamik: 0, insNettoEinrechnen: false },
  };

  it('der Ruerup traegt im Kassenbon null, die gesetzliche Rente alles', () => {
    const z = projiziere(szenario).zeilen.find((x) => x.jahr === 2068)!;
    const ruerup = z.posten.find((x) => x.id === 'v1')!;
    const grv = z.posten.find((x) => x.id !== 'v1')!;

    expect(ruerup.kvPvJahr).toBeCloseTo(0, 6);
    expect(grv.kvPvJahr).toBeCloseTo(z.kvPvGesamt, 6);
    // 12,95 % der gesetzlichen Rente — nicht 10,17 % von allem.
    expect(z.kvPvGesamt / grv.bruttoJahr).toBeCloseTo(0.1295, 4);
  });

  it('die Summe der Posten ergibt weiterhin die Jahreszeile', () => {
    const z = projiziere(szenario).zeilen.find((x) => x.jahr === 2068)!;
    const summe = z.posten.reduce((s, x) => s + x.nettoJahr, 0);
    expect(summe).toBeCloseTo(z.nettoGesamt, 4);
  });
});
