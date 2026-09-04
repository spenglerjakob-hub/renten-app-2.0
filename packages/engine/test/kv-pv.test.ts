import { PKV_VORGABE } from '../src/social/pkv.js';
import { describe, it, expect } from 'vitest';
import {
  kvPvImAlter, kvSatzVoll, pvSatzMitglied, bavFreibetragMonat,
  type Beitragspflichtig,
} from '../src/social/kv-pv.js';
import { parameterFuer, durchschnittlicherZusatzbeitrag } from '../src/params/registry.js';
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

describe('Betriebsrenten zaehlen ZUSAMMEN', () => {
  /*
    DER GEMELDETE FEHLER: Der Freibetrag des § 226 Abs. 2 SGB V ging von
    JEDEM Versorgungsbezug einzeln ab. Wer vier Betriebsrenten knapp unter
    der Grenze hatte, zahlte im Rechner gar nichts — die Kasse rechnet
    dagegen auf die Summe ab. Bei 197,75 EUR Freibetrag (2026) und vier
    Vertraegen a 180 EUR waren das rund 118 EUR im Monat, die im Gutachten
    fehlten.
  */
  const person = (id: string, betrag: number): Beitragspflichtig =>
    ({ id, art: 'versorgungsbezug', monatsbetrag: betrag, person: 'A' });

  it('vier Vertraege kosten dasselbe wie ein Vertrag ueber ihre Summe', () => {
    const vier = kvPvImAlter('kvdr',
      [person('b1', 180), person('b2', 180), person('b3', 180), person('b4', 180)],
      kinderlos, p);
    const einer = kvPvImAlter('kvdr', [person('b1', 720)], kinderlos, p);
    expect(vier.gesamt).toBeCloseTo(einer.gesamt, 6);
  });

  it('und sie kosten wirklich etwas — vorher waren es null', () => {
    const fb = bavFreibetragMonat(p);
    const r = kvPvImAlter('kvdr',
      [person('b1', 180), person('b2', 180), person('b3', 180), person('b4', 180)],
      kinderlos, p);
    // Jeder einzelne Vertrag liegt unter dem Freibetrag.
    expect(180).toBeLessThan(fb);
    expect(r.kv).toBeCloseTo((720 - fb) * kvSatzVoll(p), 6);
    // PV: Freigrenze, oberhalb traegt die VOLLE Summe.
    expect(r.pv).toBeCloseTo(720 * pvSatzMitglied(kinderlos, p), 6);
  });

  it('unter der Freigrenze bleibt auch die Summe beitragsfrei', () => {
    const fb = bavFreibetragMonat(p);
    const r = kvPvImAlter('kvdr',
      [person('b1', fb / 3), person('b2', fb / 3)], kinderlos, p);
    expect(r.gesamt).toBe(0);
  });

  it('der Freibetrag steht JEDER Person einmal zu', () => {
    const fb = bavFreibetragMonat(p);
    const zwei = kvPvImAlter('kvdr', [
      { id: 'b1', art: 'versorgungsbezug', monatsbetrag: 500, person: 'A' },
      { id: 'b2', art: 'versorgungsbezug', monatsbetrag: 500, person: 'B' },
    ], kinderlos, p);
    const eine = kvPvImAlter('kvdr', [person('b1', 500), person('b2', 500)], kinderlos, p);

    // Zwei Mitglieder: zweimal Freibetrag. Ein Mitglied: einmal.
    expect(zwei.kv).toBeCloseTo((1000 - 2 * fb) * kvSatzVoll(p), 6);
    expect(eine.kv).toBeCloseTo((1000 - fb) * kvSatzVoll(p), 6);
    expect(zwei.kv).toBeLessThan(eine.kv);
    // Die PV kennt keinen Freibetrag — dort aendert die Aufteilung nichts.
    expect(zwei.pv).toBeCloseTo(eine.pv, 6);
  });

  it('ohne Personenangabe gehoert alles EINEM Mitglied', () => {
    // Der Einpersonenfall ist die richtige Vorgabe: Wer nichts angibt, darf
    // nicht versehentlich mehrere Freibetraege bekommen.
    const ohne = kvPvImAlter('kvdr',
      [versorgung(400, 'b1'), versorgung(400, 'b2')], kinderlos, p);
    const mit = kvPvImAlter('kvdr', [person('b1', 400), person('b2', 400)], kinderlos, p);
    expect(ohne.gesamt).toBeCloseTo(mit.gesamt, 6);
  });

  it('die anteilige Verteilung geht in der Summe auf', () => {
    const r = kvPvImAlter('kvdr',
      [rente(1500), person('b1', 300), person('b2', 700)], kinderlos, p);
    const summe = r.jeQuelle.reduce((x, q) => x + q.kv + q.pv, 0);
    expect(summe).toBeCloseTo(r.gesamt, 6);
    // Der groessere Bezug traegt mehr — die Verteilung folgt dem Betrag.
    const b1 = r.jeQuelle.find((q) => q.id === 'b1')!;
    const b2 = r.jeQuelle.find((q) => q.id === 'b2')!;
    expect(b2.kv + b2.pv).toBeCloseTo((b1.kv + b1.pv) * (700 / 300), 6);
  });
});

describe('Beitragsbemessungsgrenze je Person', () => {
  it('eine Person allein zahlt hoechstens auf EINE Grenze', () => {
    // Vorher war es EIN Topf aus zwei Grenzen, aus dem einer allein
    // schoepfen konnte — ein Ehepartner mit hoher Rente zahlte auf bis zu
    // zwei Bemessungsgrenzen.
    const bbgMonat = p.bbgKvJahr / 12;
    const r = kvPvImAlter('kvdr', [
      { id: 'rA', art: 'gesetzlicheRente', monatsbetrag: bbgMonat * 2, person: 'A' },
    ], kinderlos, p);
    expect(r.kv).toBeCloseTo(bbgMonat * (kvSatzVoll(p) / 2), 6);
  });

  it('zwei Personen bekommen jede ihre eigene Grenze', () => {
    const bbgMonat = p.bbgKvJahr / 12;
    const r = kvPvImAlter('kvdr', [
      { id: 'rA', art: 'gesetzlicheRente', monatsbetrag: bbgMonat, person: 'A' },
      { id: 'rB', art: 'gesetzlicheRente', monatsbetrag: bbgMonat, person: 'B' },
    ], kinderlos, p);
    expect(r.kv).toBeCloseTo(bbgMonat * 2 * (kvSatzVoll(p) / 2), 6);
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
      kvStatus: 'kvdr', kvErwerb: 'gesetzlich', pkv: PKV_VORGABE, zielNettoHeute: 2500,
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

describe('Individueller Zusatzbeitrag', () => {
  /*
    Der Rechtsstand kennt nur den DURCHSCHNITTLICHEN Zusatzbeitrag. Die Kassen
    weichen davon ab, und der Unterschied ist kein Rundungsfehler: ein Punkt
    sind auf 60.000 EUR Jahresbrutto rund 300 EUR. Er wird deshalb an den
    Parametern gesetzt — an EINER Stelle, damit ihn keine Rechnung uebersieht.
  */
  it('ersetzt den durchschnittlichen Satz in den Parametern', () => {
    const standard = parameterFuer(2026, { indexRate: 0 });
    const eigen = parameterFuer(2026, { indexRate: 0, zusatzbeitrag: 0.041 });
    expect(eigen.kv.zusatzbeitrag).toBeCloseTo(0.041, 6);
    expect(standard.kv.zusatzbeitrag).toBeCloseTo(durchschnittlicherZusatzbeitrag(2026), 6);
    // Alles andere bleibt unangetastet.
    expect(eigen.kv.allgemeinerSatz).toBe(standard.kv.allgemeinerSatz);
    expect(eigen.bbgKvJahr).toBe(standard.bbgKvJahr);
  });

  it('wirkt auch in fortgeschriebenen Jahren', () => {
    const p = parameterFuer(2060, { indexRate: 0.02, zusatzbeitrag: 0.041 });
    expect(p.kv.zusatzbeitrag).toBeCloseTo(0.041, 6);
    expect(p.extrapoliert).toBe(true);
  });

  it('hebt die Beiträge im Alter entsprechend an', () => {
    const einkuenfte = [{ id: 'r', art: 'gesetzlicheRente' as const, monatsbetrag: 2_000 }];
    const kinder = { hatKinder: false, kinderUnter25: 0 };
    const niedrig = kvPvImAlter('kvdr', einkuenfte, kinder,
      parameterFuer(2026, { indexRate: 0, zusatzbeitrag: 0.01 }));
    const hoch = kvPvImAlter('kvdr', einkuenfte, kinder,
      parameterFuer(2026, { indexRate: 0, zusatzbeitrag: 0.04 }));
    // Halber Satz auf die gesetzliche Rente: 3 Punkte mehr sind 1,5 % von 2.000.
    expect(hoch.gesamt - niedrig.gesamt).toBeCloseTo(2_000 * 0.015, 6);
  });

  it('ohne Angabe bleibt es beim gesetzlichen Durchschnitt', () => {
    const ohne = parameterFuer(2026, { indexRate: 0 });
    const mitDurchschnitt = parameterFuer(2026, {
      indexRate: 0, zusatzbeitrag: durchschnittlicherZusatzbeitrag(2026),
    });
    expect(ohne.kv.zusatzbeitrag).toBe(mitDurchschnitt.kv.zusatzbeitrag);
  });
});
