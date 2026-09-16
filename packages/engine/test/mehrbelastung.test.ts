import { describe, it, expect } from 'vitest';
import { PKV_VORGABE } from '../src/social/pkv.js';
import { mehrbelastungJeVertrag } from '../src/analyse/mehrbelastung.js';
import { projiziere } from '../src/projection/timeline.js';
import type { Szenario, Vertrag } from '../src/model.js';

/*
  Alle Fortschreibungen auf null: So ist das Rentenjahr mit den Werten des
  Rechtsstands vergleichbar, und die Erwartungen unten sind von Hand
  nachrechenbar statt aus dem Lauf abgeschrieben.

  Rentenbeginn 2026 bei Geburt 1959 heisst: rund zehn Monate NACH der
  Regelaltersgrenze, also Zuschlag nach § 77 SGB VI. Aus 1.500 EUR werden
  dadurch 1.575 — fuer die Frage hier ohne Belang, aber es erklaert die
  Bruttobetraege.
*/
const bav = (id: string, brutto: number, over: Partial<Vertrag> = {}): Vertrag => ({
  id, inhaber: 'A', schicht: 2, typ: 'bav',
  name: id, brutto, strategie: 'rente', altvertrag: false, ...over,
});

/** Basisrente (Ruerup) — tariflich wie die bAV, nur ohne Beitragspflicht. */
const ruerup = (id: string, brutto: number): Vertrag => ({
  id, inhaber: 'A', schicht: 1, typ: 'basis',
  name: id, brutto, strategie: 'rente', altvertrag: false,
  beginnJahr: 2010, monatsbeitrag: 150,
});

/**
 * Freies Wertpapierdepot mit laufender Entnahme.
 *
 * Gross genug, dass der Sparerpauschbetrag (§ 20 Abs. 9 EStG) ueberschritten
 * wird — sonst waere die Steuer null und der Vergleich unten trivial wahr.
 */
const depot = (id: string, kapital: number): Vertrag => ({
  id, inhaber: 'A', schicht: 3, typ: 'etf',
  name: id, brutto: 0, strategie: 'rente', altvertrag: false,
  kapitalHeute: kapital, sparrate: 0,
  renditeAnsparphase: 0.05, renditeEntnahme: 0.04, ter: 0.002, entnahmedauer: 20,
});

const szenario = (vertraege: Vertrag[]): Szenario => ({
  schemaVersion: 1,
  haushalt: {
    verheiratet: false, bundesland: 'Baden-Württemberg', kirchensteuer: false,
    hatKinder: false, kinderUnter25: 0, kinder: [],
    kvStatus: 'kvdr', kvErwerb: 'gesetzlich', pkv: PKV_VORGABE, zielNettoHeute: 2000,
  },
  annahmen: { inflation: 0, rentendynamik: 0, tarifIndex: 0, gehaltsdynamik: 0 },
  einkommenHeute: {
    modus: 'brutto', betrag: 0, auszahlungen: 12,
    besoldungsgruppe: 'A13', besoldungsstufe: 4, besoldungsland: 'Baden-Württemberg',
    grvPflicht: false, grvBeitragMonat: 0,
  },
  personen: [{
    id: 'A', name: 'Test', geburtsdatum: '1959-01-01', rentenbeginn: '2026-01-01',
    art: 'grv', grvBruttoHeute: 1500,
    besoldungsgruppe: 'A13', besoldungsstufe: 8, ruhegehaltssatz: 71.75,
    dienstbeginn: '2000-01-01', teilzeitphasen: [],
  }],
  vertraege,
  planer: { startkapital: 0, dauerJahre: 25, rendite: 0.02, dynamik: 0, insNettoEinrechnen: false },
});

const JAHR = 2027;

describe('Mehrbelastung je Vertrag', () => {
  it('rechnet die bAV mit dem Grenzsatz, nicht mit dem Durchschnitt', () => {
    const s = szenario([bav('bav1', 500)]);
    const m = mehrbelastungJeVertrag(s, JAHR).get('bav1')!;

    /*
      KV/PV von Hand (§ 226 Abs. 2 SGB V, Rechtsstand 2026):
        KV  (500 - 197,75) x 17,5 %  = 52,89
        PV   500           x  4,2 %  = 21,00   (Freigrenze, voller Betrag)
                                     = 73,89 im Monat
    */
    expect(m.kvPvJahr / 12).toBeCloseTo(73.89, 1);

    /*
      Die Steuer ist die DIFFERENZ, nicht der Anteil. Anteilig waeren es
      27,10 EUR im Monat — der Durchschnittssatz von 5,4 %. Tatsaechlich
      kostet die bAV 86,75 EUR, weil sie oben auf den Tarif kommt.
    */
    expect(m.steuerJahr / 12).toBeCloseTo(86.75, 1);
    expect(m.nettoJahr / 12).toBeCloseTo(339.36, 1);

    // Die Gegenprobe zur alten Zurechnung: Der Posten der Zeitachse weist
    // weiterhin den anteiligen Wert aus — dort ist er richtig.
    const posten = projiziere(s).zeilen.find((z) => z.jahr === JAHR)!
      .posten.find((x) => x.id === 'bav1')!;
    expect(posten.steuerJahr / 12).toBeCloseTo(27.10, 1);
    expect(m.steuerJahr).toBeGreaterThan(posten.steuerJahr);
  });

  it('gibt der zweiten Betriebsrente den vollen Satz ohne Freibetrag', () => {
    /*
      Der Freibetrag des § 226 Abs. 2 SGB V steht dem MITGLIED einmal zu. Die
      erste bAV verbraucht ihn; die zweite traegt KV auf den vollen Betrag.
      Genau das ist der Grund, warum auch KV/PV differenziert wird und nicht
      anteilig verteilt.
    */
    const zwei = szenario([bav('bav1', 500), bav('bav2', 500)]);
    const m = mehrbelastungJeVertrag(zwei, JAHR);
    const zweite = m.get('bav2')!;

    // Ohne Freibetrag: 500 x 17,5 % + 500 x 4,2 % = 87,50 + 21,00 = 108,50
    expect(zweite.kvPvJahr / 12).toBeCloseTo(108.5, 1);

    // ... und damit mehr als die erste allein kostet (73,89).
    const allein = mehrbelastungJeVertrag(szenario([bav('bav1', 500)]), JAHR).get('bav1')!;
    expect(zweite.kvPvJahr).toBeGreaterThan(allein.kvPvJahr);
  });

  it('die Einzelwerte sind zusammen hoeher als ihre anteiligen Posten', () => {
    /*
      Keine Panne, sondern die Eigenschaft der Methode: Jeder Vertrag wird fuer
      sich als letzte Einkunft gerechnet, also traegt jeder den Grenzsatz.
      Zusammen ist das mehr, als die anteilige Verteilung denselben Vertraegen
      zuweist. Der Erklaersatz in der Oberflaeche benennt genau das — hier
      wird es festgenagelt, damit niemand es spaeter als Fehler „repariert".

      Verglichen wird mit den anteiligen Posten DERSELBEN Vertraege und nicht
      mit der Haushaltssteuer: Die traegt auch die gesetzliche Rente, und
      gegen sie zu pruefen hiesse, zwei verschiedene Dinge zu vergleichen.
    */
    const s = szenario([bav('bav1', 500), bav('bav2', 500)]);
    const m = mehrbelastungJeVertrag(s, JAHR);
    const zeile = projiziere(s).zeilen.find((z) => z.jahr === JAHR)!;

    const ids = ['bav1', 'bav2'];
    const differenz = ids.reduce((x, id) => x + m.get(id)!.steuerJahr, 0);
    const anteilig = ids.reduce(
      (x, id) => x + (zeile.posten.find((p) => p.id === id)?.steuerJahr ?? 0), 0);

    expect(differenz).toBeGreaterThan(anteilig);

    // Die anteiligen Posten ueber ALLE Quellen ergeben dagegen die
    // Gesamtsteuer exakt — das ist die Zusicherung des Kassenbons.
    const alle = zeile.posten.reduce((x, p) => x + p.steuerJahr, 0);
    expect(alle).toBeCloseTo(zeile.steuerGesamt, 6);
  });

  it('gilt genauso fuer eine Basisrente — die bAV ist kein Sonderfall', () => {
    /*
      Die Umstellung galt zuerst nur fuer die Betriebsrente. Gemessen wurde
      dann, dass JEDE tariflich besteuerte Rente denselben Abstand zeigt:
      Ruerup, Riester, Altersvorsorgedepot und Mieteinkuenfte liegen alle etwa
      beim Vierfachen, die private Rente hoeher (dort traegt nur der
      Ertragsanteil ueberhaupt Steuer, die Ausgangszahl ist also winzig).
    */
    const s = szenario([ruerup('rue1', 500)]);
    const m = mehrbelastungJeVertrag(s, JAHR).get('rue1')!;
    const posten = projiziere(s).zeilen.find((z) => z.jahr === JAHR)!
      .posten.find((x) => x.id === 'rue1')!;

    expect(m.steuerJahr).toBeGreaterThan(posten.steuerJahr * 2);

    // Und in der KVdR beitragsfrei: eine Basisrente ist kein Versorgungsbezug.
    expect(m.kvPvJahr).toBeCloseTo(0, 6);
  });

  it('laesst das freie Depot unveraendert — Abgeltungsteuer ist linear', () => {
    /*
      DER GEGENPROBEFALL, und er ist kein vergessener Zweig: Die
      Abgeltungsteuer ist ein PAUSCHSATZ. Sie hat keine Progressionswirkung,
      die sich auf Quellen verteilen liesse — anteilige Zurechnung und
      Differenz muessen deshalb denselben Betrag ergeben.

      Wer das spaeter als Luecke liest und das Depot „nachzieht", aendert
      nichts; wer die Gleichheit bricht, hat einen Fehler gebaut.
    */
    /*
      1,2 Mio und nicht 300.000: Im zweiten Rentenjahr deckt der
      Sparerpauschbetrag den steuerpflichtigen Ertragsanteil einer kleineren
      Entnahme noch vollstaendig ab — die Steuer waere null und der Vergleich
      unten trivial wahr. Die Zusicherung darunter faengt genau das ab.
    */
    const s = szenario([depot('dep1', 1200000)]);
    const zeile = projiziere(s).zeilen.find((z) => z.jahr === JAHR)!;
    const posten = zeile.posten.find((x) => x.id === 'dep1')!;
    const m = mehrbelastungJeVertrag(s, JAHR).get('dep1')!;

    // Erst sicherstellen, dass ueberhaupt Steuer anfaellt — sonst waere die
    // Gleichheit darunter nichtssagend.
    expect(posten.steuerJahr).toBeGreaterThan(0);
    expect(m.steuerJahr).toBeCloseTo(posten.steuerJahr, 6);
    expect(m.nettoJahr).toBeCloseTo(posten.nettoJahr, 6);
  });

  it('traegt Vertraege ohne Auszahlung mit Nullen', () => {
    // Auf „ignorieren" gestellt: kein Brutto, keine Belastung — aber der
    // Eintrag existiert, damit der Aufrufer nicht unterscheiden muss.
    const s = szenario([bav('bav1', 500, { strategie: 'ignorieren' })]);
    const m = mehrbelastungJeVertrag(s, JAHR).get('bav1')!;
    expect(m.bruttoJahr).toBe(0);
    expect(m.steuerJahr).toBe(0);
    expect(m.kvPvJahr).toBe(0);
    expect(m.nettoJahr).toBe(0);
  });
});
