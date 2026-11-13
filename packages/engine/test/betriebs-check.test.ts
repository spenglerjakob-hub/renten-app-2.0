import { describe, it, expect } from 'vitest';
import {
  betriebsCheck, lohnlisteLesen, type BetriebsCheckEingaben, type BetriebsModell,
} from '../src/analyse/betriebs-check.js';
import { betriebUmstieg, festbetragModell, matchingModell, zuschussModell } from '../src/analyse/matching-modell.js';
import { parameterFuer } from '../src/params/registry.js';

/*
 * Der Betriebs-Check rechnet das Modell fuer die ganze Belegschaft: je
 * Gehaltsgruppe ein Teilnehmer, mal Anzahl und Teilnahmequote. Was der
 * Arbeitgeber spart, haengt am Gehalt — ein Beispiel-Mitarbeiter mal n
 * stimmt nur, wenn alle gleich verdienen.
 */

const p = parameterFuer(2026, { indexRate: 0 });
const steuer = { verheiratet: false, bundesland: 'Nordrhein-Westfalen', kirchensteuerpflichtig: false };
const ZUSCHUSS: BetriebsModell = { art: 'zuschuss', quote: 0.5, deckelMonat: 100 };
const kinder = { hatKinder: false, kinderUnter25: 0 };

const eingaben = (over: Partial<BetriebsCheckEingaben> = {}): BetriebsCheckEingaben => ({
  gruppen: [{ name: '', anzahl: 1, jahresbrutto: 54_000 }],
  modell: ZUSCHUSS,
  umwandlungMonat: 200,
  quoten: [0.3, 0.5, 0.8],
  unternehmensSteuersatz: 0.3,
  umlagenSatz: 0,
  ...over,
});

const kopfBasis = (jahresbrutto: number, umwandlungMonat = 200) => ({
  jahresbrutto, umwandlungMonat, unternehmensSteuersatz: 0.3, umlagenSatz: 0,
  privatVersichert: false, pkvPraemieMonat: 0, kinder,
});

describe('betriebsCheck — je Gruppe dieselbe Rechnung wie auf der Seite des Modells', () => {
  it('Zuschussmodell: ein Mitarbeiter, volle Teilnahme = die Zahlen der Zuschussmodell-Seite mal zwölf', () => {
    const seite = zuschussModell({ ...kopfBasis(54_000), quote: 0.5, deckelMonat: 100 }, steuer, p);
    const r = betriebsCheck(eingaben({ quoten: [1] }), steuer, p);
    const k = r.gruppen[0]!.kopf;
    expect(k.agBeitragMonat).toBeCloseTo(seite.arbeitgeber.zuschussMonat, 9);
    expect(k.agNettoMonat).toBeCloseTo(seite.arbeitgeber.nettoKostenMonat, 9);
    expect(k.maNettoMonat).toBeCloseTo(seite.mitarbeiter.nettoAufwandMonat, 9);
    expect(k.vorsorgeMonat).toBeCloseTo(300, 6);
    const s = r.szenarien[0]!;
    expect(s.agNettoJahr).toBeCloseTo(seite.arbeitgeber.nettoKostenMonat * 12, 6);
    expect(s.vorsorgeJahr).toBeCloseTo(3600, 4);
    expect(s.teilnehmer).toBe(1);
  });

  it('Festbetrag: unter der Mindestumwandlung gibt es nur den gesetzlichen Zuschuss', () => {
    const modell: BetriebsModell = { art: 'festbetrag', festbetragMonat: 50, mindestUmwandlungMonat: 50 };
    const mit = betriebsCheck(eingaben({ modell, umwandlungMonat: 50, quoten: [1] }), steuer, p).gruppen[0]!.kopf;
    const ohne = betriebsCheck(eingaben({ modell, umwandlungMonat: 30, quoten: [1] }), steuer, p).gruppen[0]!.kopf;
    const seite = festbetragModell({ ...kopfBasis(54_000, 50), festbetragMonat: 50, mindestUmwandlungMonat: 50 }, steuer, p);
    expect(mit.agBeitragMonat).toBeCloseTo(50, 6);
    expect(mit.agNettoMonat).toBeCloseTo(seite.arbeitgeber.nettoKostenMonat, 9);
    expect(ohne.agBeitragMonat).toBeCloseTo(30 * 0.15, 2);
  });

  it('Matching: Pflichtzuschuss und Unterstützungskasse zusammen sind der Arbeitgeberbeitrag', () => {
    const modell: BetriebsModell = { art: 'matching', weg: 'dv', matchingMonat: 338, zuschussImMatching: false };
    const seite = matchingModell({ ...kopfBasis(54_000, 293.91), weg: 'dv', matchingMonat: 338, zuschussImMatching: false }, steuer, p);
    const k = betriebsCheck(eingaben({ modell, umwandlungMonat: 293.91, quoten: [1] }), steuer, p).gruppen[0]!.kopf;
    expect(k.agBeitragMonat).toBeCloseTo(seite.arbeitgeber.pflichtzuschussMonat + 338, 6);
    expect(k.vorsorgeMonat).toBeCloseTo(676, 0);
    expect(k.agNettoMonat).toBeCloseTo(seite.arbeitgeber.nettoKostenMonat, 9);
  });
});

describe('betriebsCheck — das Gehalt entscheidet, was der Arbeitgeber spart', () => {
  // 2026: Grenze Krankenversicherung 69.750 €, Rentenversicherung 101.400 €.
  const r = betriebsCheck(eingaben({
    gruppen: [
      { name: 'Produktion', anzahl: 20, jahresbrutto: 38_000 },
      { name: 'Technik', anzahl: 8, jahresbrutto: 85_000 },
      { name: 'Leitung', anzahl: 2, jahresbrutto: 130_000 },
    ],
    quoten: [1],
  }), steuer, p);
  const [prod, technik, leitung] = r.gruppen;

  it('bis zur Grenze der Krankenversicherung spart er alle Zweige, darüber weniger, ganz oben nichts', () => {
    expect([prod!.svLage, technik!.svLage, leitung!.svLage]).toEqual(['voll', 'teilweise', 'keine']);
    expect(prod!.kopf.agAbgabenGespartMonat).toBeGreaterThan(technik!.kopf.agAbgabenGespartMonat);
    expect(technik!.kopf.agAbgabenGespartMonat).toBeGreaterThan(0);
    expect(leitung!.kopf.agAbgabenGespartMonat).toBe(0);
    expect(r.svLagen).toEqual({ voll: 20, teilweise: 8, keine: 2 });
  });

  it('der Zuschuss ist für alle gleich — die Nettokosten nicht', () => {
    for (const g of r.gruppen) expect(g.kopf.agBeitragMonat).toBeCloseTo(100, 6);
    expect(prod!.kopf.agNettoMonat).toBeLessThan(technik!.kopf.agNettoMonat);
    expect(technik!.kopf.agNettoMonat).toBeLessThan(leitung!.kopf.agNettoMonat);
    // Ganz oben kostet der Zuschuss voll: 100 € vor Steuern, 70 € nach 30 %.
    expect(leitung!.kopf.agKostenVorSteuerMonat).toBeCloseTo(100, 6);
    expect(leitung!.kopf.agNettoMonat).toBeCloseTo(70, 6);
  });

  it('ein Beispiel-Mitarbeiter mal 30 rechnet diesen Betrieb zu billig', () => {
    const beispiel = zuschussModell({ ...kopfBasis(54_000), quote: 0.5, deckelMonat: 100 }, steuer, p);
    const malDreissig = beispiel.arbeitgeber.nettoKostenMonat * 12 * 30;
    expect(r.szenarien[0]!.agNettoJahr).toBeGreaterThan(malDreissig * 1.05);
  });

  it('Summen: Köpfe, Lohnsumme, Anteil an der Lohnsumme, Kosten je Teilnehmer', () => {
    expect(r.koepfe).toBe(30);
    expect(r.lohnsummeJahr).toBe(20 * 38_000 + 8 * 85_000 + 2 * 130_000);
    const s = r.szenarien[0]!;
    const erwartet = (20 * prod!.kopf.agNettoMonat + 8 * technik!.kopf.agNettoMonat + 2 * leitung!.kopf.agNettoMonat) * 12;
    expect(s.agNettoJahr).toBeCloseTo(erwartet, 6);
    expect(s.anteilLohnsumme).toBeCloseTo(erwartet / r.lohnsummeJahr, 12);
    expect(s.agNettoJeTeilnehmerMonat).toBeCloseTo(erwartet / 30 / 12, 9);
    expect(s.agKostenVorSteuerJahr - s.agSteuerersparnisJahr).toBeCloseTo(s.agNettoJahr, 6);
    expect(s.agBeitragJahr - s.agAbgabenGespartJahr).toBeCloseTo(s.agKostenVorSteuerJahr, 6);
  });

  it('mit den Grenzen von 2027 rückt die Technik näher an die volle Ersparnis', () => {
    // 2027 liegt die Grenze der Krankenversicherung bei 76.500 € — wer 72.000 € verdient, ist dann darunter.
    const fall = eingaben({ gruppen: [{ name: '', anzahl: 1, jahresbrutto: 72_000 }], quoten: [1] });
    const heute = betriebsCheck(fall, steuer, p).gruppen[0]!;
    const dann = betriebsCheck(fall, steuer, parameterFuer(2027, { indexRate: 0 })).gruppen[0]!;
    expect([heute.svLage, dann.svLage]).toEqual(['teilweise', 'voll']);
    expect(dann.kopf.agNettoMonat).toBeLessThan(heute.kopf.agNettoMonat);
  });
});

describe('betriebsCheck — Teilnahme in Szenarien', () => {
  const r = betriebsCheck(eingaben({
    gruppen: [{ name: '', anzahl: 40, jahresbrutto: 42_000 }, { name: '', anzahl: 10, jahresbrutto: 90_000 }],
  }), steuer, p);

  it('die Quote ist ein Erwartungswert: alles wächst im Verhältnis', () => {
    const [a, b, c] = r.szenarien;
    expect([a!.quote, b!.quote, c!.quote]).toEqual([0.3, 0.5, 0.8]);
    expect([a!.teilnehmer, b!.teilnehmer, c!.teilnehmer]).toEqual([15, 25, 40]);
    expect(b!.agNettoJahr / a!.agNettoJahr).toBeCloseTo(0.5 / 0.3, 9);
    expect(c!.vorsorgeJahr / b!.vorsorgeJahr).toBeCloseTo(0.8 / 0.5, 9);
    // Je Teilnehmer kostet es in jedem Szenario dasselbe.
    expect(a!.agNettoJeTeilnehmerMonat).toBeCloseTo(c!.agNettoJeTeilnehmerMonat, 9);
  });

  it('Quoten bleiben zwischen 0 und 100 %', () => {
    const x = betriebsCheck(eingaben({ quoten: [-0.2, 1.7] }), steuer, p).szenarien;
    expect(x.map((s) => s.quote)).toEqual([0, 1]);
    expect(x[0]!.agNettoJahr).toBe(0);
    expect(x[0]!.agNettoJeTeilnehmerMonat).toBe(0);
  });

  it('dasselbe Geld als Gehaltserhöhung: bei den Mitarbeitern käme netto weniger an, als der Arbeitgeber in die Vorsorge gibt', () => {
    const s = r.szenarien[1]!;
    expect(s.gehaltNettoJahr).toBeGreaterThan(0);
    expect(s.gehaltNettoJahr).toBeLessThan(s.agBeitragJahr);
    expect(s.vorsorgeJahr).toBeCloseTo(s.agBeitragJahr + 25 * 200 * 12, 4);
    expect(s.maNettoJahr).toBeLessThan(25 * 200 * 12);
  });
});

describe('betriebsCheck — die VL von heute', () => {
  const fall = eingaben({
    gruppen: [{ name: '', anzahl: 20, jahresbrutto: 40_000 }],
    vl: { betragMonat: 40, anzahl: 15 },
  });
  const r = betriebsCheck(fall, steuer, p);

  it('als Beitrag zur Betriebsrente kostet dieselbe VL weniger und kommt ungekürzt an', () => {
    const vl = r.vl!;
    expect(vl.anzahl).toBe(15);
    expect(vl.heuteNettoJahr).toBeGreaterThan(vl.alsBetriebsrenteNettoJahr);
    expect(vl.ersparnisNettoJahr).toBeCloseTo(vl.heuteNettoJahr - vl.alsBetriebsrenteNettoJahr, 9);
    // Abgabenfrei: 40 € × 12 × 15, nach 30 % Steuer.
    expect(vl.alsBetriebsrenteNettoJahr).toBeCloseTo(40 * 12 * 15 * 0.7, 6);
    expect(vl.alsBetriebsrenteVorsorgeJahr).toBe(40 * 12 * 15);
    expect(vl.heuteBeimMitarbeiterNettoJahr).toBeLessThan(vl.alsBetriebsrenteVorsorgeJahr);
    expect(vl.heuteBeimMitarbeiterNettoJahr).toBeGreaterThan(0);
  });

  it('je Kopf dieselben Zahlen wie der Umstieg der Modellseiten', () => {
    const seite = betriebUmstieg(
      (b) => {
        const x = zuschussModell({ ...b, quote: 0.5, deckelMonat: 100 }, steuer, p);
        return { kostenVorSteuerMonat: x.arbeitgeber.kostenVorSteuerMonat, vorsorgeMonat: x.vertragMonat, agBeitragMonat: x.arbeitgeber.zuschussMonat, agBeitragMaxMonat: 100 };
      },
      kopfBasis(40_000),
      { neuTeilnehmer: 0, bestand: { anzahl: 0, umwandlungMonat: 0, zuschussQuote: 0 }, vl: { betragMonat: 40, anzahl: 1, umwandler: 1, davonMitGehalt: 0 } },
      steuer, p,
    ).kopfVl!;
    expect(r.vl!.heuteNettoJahr).toBeCloseTo(seite.bisherNettoMonat * 12 * 15, 6);
    expect(r.vl!.heuteBeimMitarbeiterNettoJahr).toBeCloseTo(seite.vlNettoMitarbeiterMonat * 12 * 15, 6);
  });

  it('mehr VL-Bezieher als Mitarbeiter gibt es nicht; ohne Angabe kein Vergleich', () => {
    expect(betriebsCheck({ ...fall, vl: { betragMonat: 40, anzahl: 99 } }, steuer, p).vl!.anzahl).toBe(20);
    expect(betriebsCheck({ ...fall, vl: { betragMonat: 0, anzahl: 10 } }, steuer, p).vl).toBeNull();
    expect(betriebsCheck({ ...fall, vl: undefined }, steuer, p).vl).toBeNull();
  });
});

describe('betriebsCheck — Ränder', () => {
  it('leere und unvollständige Gruppen zählen nicht; ohne Belegschaft steht überall null', () => {
    const r = betriebsCheck(eingaben({
      gruppen: [{ name: 'leer', anzahl: 0, jahresbrutto: 40_000 }, { name: 'ohne Gehalt', anzahl: 5, jahresbrutto: 0 }],
    }), steuer, p);
    expect(r.gruppen).toEqual([]);
    expect(r.koepfe).toBe(0);
    for (const s of r.szenarien) {
      expect(s.agNettoJahr).toBe(0);
      expect(s.anteilLohnsumme).toBe(0);
      expect(Number.isFinite(s.agNettoJeTeilnehmerMonat)).toBe(true);
    }
  });

  it('niemand wandelt mehr um, als er verdient', () => {
    const r = betriebsCheck(eingaben({ gruppen: [{ name: '', anzahl: 1, jahresbrutto: 1_200 }], umwandlungMonat: 500, quoten: [1] }), steuer, p);
    expect(r.gruppen[0]!.kopf.umwandlungMonat).toBeCloseTo(100, 6);
  });

  it('gebrochene Anzahlen werden ganze Köpfe', () => {
    expect(betriebsCheck(eingaben({ gruppen: [{ name: '', anzahl: 2.6, jahresbrutto: 40_000 }] }), steuer, p).koepfe).toBe(3);
  });
});

describe('lohnlisteLesen — Belegschaft aus der eingefügten Lohnliste', () => {
  it('eine Spalte Monatsgehälter: aufs Jahr gerechnet, auf 1.000 € gerundet, gleiche zusammengefasst', () => {
    const r = lohnlisteLesen('3.450,00\n3.450\n2.980,00 €\n4.100,50');
    expect(r.ausMonat).toBe(true);
    expect(r.gelesen).toBe(4);
    expect(r.gruppen).toEqual([
      { name: '', anzahl: 1, jahresbrutto: 36_000 },
      { name: '', anzahl: 2, jahresbrutto: 41_000 },
      { name: '', anzahl: 1, jahresbrutto: 49_000 },
    ]);
  });

  it('13 Gehälter im Jahr', () => {
    expect(lohnlisteLesen('3.000', 13).gruppen[0]!.jahresbrutto).toBe(39_000);
  });

  it('Jahresgehälter bleiben Jahresgehälter', () => {
    const r = lohnlisteLesen('48.000\n52000\n48000,00');
    expect(r.ausMonat).toBe(false);
    expect(r.gruppen).toEqual([{ name: '', anzahl: 2, jahresbrutto: 48_000 }, { name: '', anzahl: 1, jahresbrutto: 52_000 }]);
  });

  it('aus der Tabellenkalkulation mit laufender Nummer und Namen: Namen und Nummern bleiben draußen', () => {
    const r = lohnlisteLesen('Nr\tName\tBrutto\n1\tMüller, Anna\t3.450,00 €\n2\tSchmidt, Jan\t3.450,00 €\n3\tWeber, Ute\t5.200,00 €');
    expect(r.uebersprungen).toBe(1);
    expect(r.gruppen).toEqual([{ name: '', anzahl: 2, jahresbrutto: 41_000 }, { name: '', anzahl: 1, jahresbrutto: 62_000 }]);
    expect(JSON.stringify(r)).not.toMatch(/Müller|Schmidt|Weber/);
  });

  it('sortierte Personalnummern sind keine Anzahl', () => {
    const r = lohnlisteLesen('1004;3100\n1010;3100\n1023;4200\n1077;4200\n1101;4200');
    expect(r.gruppen).toEqual([{ name: '', anzahl: 2, jahresbrutto: 37_000 }, { name: '', anzahl: 3, jahresbrutto: 50_000 }]);
  });

  it('Gruppen: Bezeichnung, Anzahl, Gehalt — die Bezeichnung bleibt, das Gehalt auf 100 € genau', () => {
    const r = lohnlisteLesen('Bereich;Anzahl;Jahresgehalt\nProduktion;12;38.250\nVertrieb Innen;4;62.500\nGeschäftsführung;1;140000');
    expect(r.ausMonat).toBe(false);
    expect(r.gruppen).toEqual([
      { name: 'Produktion', anzahl: 12, jahresbrutto: 38_300 },
      { name: 'Vertrieb Innen', anzahl: 4, jahresbrutto: 62_500 },
      // Eine Gruppe aus einer Person verliert ihre Bezeichnung — sie wäre ein Name.
      { name: '', anzahl: 1, jahresbrutto: 140_000 },
    ]);
  });

  it('Anzahl und Gehalt mit Leerzeichen getippt', () => {
    expect(lohnlisteLesen('12 38000\n3 52000').gruppen).toEqual([
      { name: '', anzahl: 12, jahresbrutto: 38_000 }, { name: '', anzahl: 3, jahresbrutto: 52_000 },
    ]);
  });

  it('Mitarbeiterzahlen, die zufällig aufsteigen, bleiben Anzahlen', () => {
    // Nach Größe sortiert — keine laufende Nummer (die begänne bei 1) und keine Personalnummern (dreistellig).
    const r = lohnlisteLesen('Lager;3;32000\nBüro;4;40000\nMontage;5;48000\nVertrieb;6;56000\nTechnik;7;64000');
    expect(r.alsAnzahl).toBe(true);
    expect(r.gruppen.map((g) => [g.name, g.anzahl])).toEqual([['Lager', 3], ['Büro', 4], ['Montage', 5], ['Vertrieb', 6], ['Technik', 7]]);
  });

  it('die Überschrift der Spalte entscheidet: „Anzahl“ ja, alles andere nein', () => {
    const koepfe = lohnlisteLesen('Bereich;Köpfe;Gehalt\nWerk;1;3000\nBüro;2;3500\nLager;3;4000');
    expect([koepfe.anzahlSpalte, koepfe.alsAnzahl]).toEqual([true, true]);
    expect(koepfe.gruppen.reduce((n, g) => n + g.anzahl, 0)).toBe(6);
    // Steuerklasse vor dem Gehalt: keine Anzahl — sonst würden aus zwei Leuten sechs.
    const klasse = lohnlisteLesen('Name\tStKl\tBrutto\nMüller, Anna\t1\t3.450,00\nSchmidt, Jan\t5\t2.900,00');
    expect([klasse.anzahlSpalte, klasse.alsAnzahl]).toEqual([true, false]);
    expect(klasse.gruppen.reduce((n, g) => n + g.anzahl, 0)).toBe(2);
    expect(JSON.stringify(klasse)).not.toMatch(/Müller|Schmidt/);
  });

  it('„Mitarbeiter-Nr.“ und „Personalnummer“ sind keine Anzahl', () => {
    for (const kopf of ['Mitarbeiter-Nr.', 'Personalnummer', 'Personal-ID', 'MA-Nr']) {
      const r = lohnlisteLesen(`${kopf};Gehalt\n17;3100\n4;3100\n230;4200`);
      expect([kopf, r.alsAnzahl, r.gruppen.reduce((n, g) => n + g.anzahl, 0)]).toEqual([kopf, false, 3]);
    }
  });

  it('die Wahl lässt sich umstellen', () => {
    const liste = 'Müller;3;3450\nSchmidt;1;2900';
    // Ohne Überschrift gilt die Zahl als Anzahl …
    expect(lohnlisteLesen(liste).gruppen.reduce((n, g) => n + g.anzahl, 0)).toBe(4);
    // … war es die Steuerklasse, stellt man es um.
    const nein = lohnlisteLesen(liste, 12, 'nein');
    expect([nein.anzahlSpalte, nein.alsAnzahl]).toEqual([true, false]);
    expect(nein.gruppen).toEqual([{ name: '', anzahl: 1, jahresbrutto: 35_000 }, { name: '', anzahl: 1, jahresbrutto: 41_000 }]);
    // Und umgekehrt: Personalnummern, die doch Anzahlen sind.
    const ja = lohnlisteLesen('1004;3100\n1010;3100\n1023;4200\n1077;4200\n1101;4200', 12, 'ja');
    expect(ja.alsAnzahl).toBe(true);
    expect(ja.gruppen.reduce((n, g) => n + g.anzahl, 0)).toBe(1004 + 1010 + 1023 + 1077 + 1101);
  });

  it('ohne Zahl vor dem Gehalt gibt es nichts umzustellen', () => {
    const r = lohnlisteLesen('3.450\n2.900', 12, 'ja');
    expect([r.anzahlSpalte, r.alsAnzahl]).toEqual([false, false]);
  });

  it('eine Spalte hinter dem Gehalt (Steuerklasse) stört nicht', () => {
    expect(lohnlisteLesen('Müller;3450;1\nSchmidt;2900;3').gruppen).toEqual([
      { name: '', anzahl: 1, jahresbrutto: 35_000 }, { name: '', anzahl: 1, jahresbrutto: 41_000 },
    ]);
  });

  it('Zeilen ohne Gehalt werden übersprungen und gezählt', () => {
    const r = lohnlisteLesen('Lohnliste Oktober\n\nSumme\n3.200');
    expect(r.gelesen).toBe(1);
    expect(r.uebersprungen).toBe(2);
    expect(lohnlisteLesen('').gruppen).toEqual([]);
  });

  it('sehr viele verschiedene Gehälter werden zu Bändern — Köpfe und Lohnsumme bleiben', () => {
    const liste = Array.from({ length: 200 }, (_, i) => String(30_000 + i * 1_000)).join('\n');
    const r = lohnlisteLesen(liste);
    expect(r.gruppen.length).toBeLessThanOrEqual(60);
    expect(r.gruppen.reduce((n, g) => n + g.anzahl, 0)).toBe(200);
    const summe = r.gruppen.reduce((n, g) => n + g.anzahl * g.jahresbrutto, 0);
    const genau = Array.from({ length: 200 }, (_, i) => 30_000 + i * 1_000).reduce((a, b) => a + b, 0);
    expect(Math.abs(summe - genau) / genau).toBeLessThan(0.001);
  });
});
