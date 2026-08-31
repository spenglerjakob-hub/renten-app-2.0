import { describe, it, expect } from 'vitest';
import {
  avdZulagen, avdAnsparphase, avdAuszahlung, avdSteuervorteil, avdGegenFreiesDepot,
  avdProfitabilitaet,
} from '../src/products/altersvorsorgedepot.js';
import { ansparphase } from '../src/products/kapitalanlage.js';
import { parameterFuer } from '../src/params/registry.js';
import { projiziere } from '../src/projection/timeline.js';
import type { Szenario, Vertrag } from '../src/model.js';

const p = parameterFuer(2027, { indexRate: 0 });

/** N junge Kinder — in den Testjahren durchweg kindergeldberechtigt. */
const kinder = (n: number) => Array.from({ length: n }, () => 2025);
const a = p.avd;

describe('Altersvorsorgedepot: Zulagenstufen', () => {
  it('gewaehrt auf die ersten 360 EUR die Haelfte', () => {
    const z = avdZulagen({ eigenbeitragJahr: 360, kinderGeburtsjahre: kinder(0), alter: 40, jahr: 2030 }, a);
    expect(z.stufe1).toBeCloseTo(180, 6);
    expect(z.stufe2).toBe(0);
    expect(z.grundzulage).toBeCloseTo(180, 6);
  });

  it('gewaehrt auf die weiteren 1 440 EUR ein Viertel', () => {
    const z = avdZulagen({ eigenbeitragJahr: 1800, kinderGeburtsjahre: kinder(0), alter: 40, jahr: 2030 }, a);
    expect(z.stufe1).toBeCloseTo(180, 6);
    expect(z.stufe2).toBeCloseTo(360, 6);
    expect(z.grundzulage).toBeCloseTo(540, 6);
  });

  it('deckelt die Grundzulage bei 540 EUR', () => {
    const z = avdZulagen({ eigenbeitragJahr: 6000, kinderGeburtsjahre: kinder(0), alter: 40, jahr: 2030 }, a);
    expect(z.grundzulage).toBeCloseTo(540, 6);
    expect(z.hinweise.join(' ')).toMatch(/steigt die Grundzulage\s+nicht weiter/);
  });

  it('ist am Knickpunkt stetig', () => {
    const links = avdZulagen({ eigenbeitragJahr: 359.99, kinderGeburtsjahre: kinder(0), alter: 40, jahr: 2030 }, a).grundzulage;
    const rechts = avdZulagen({ eigenbeitragJahr: 360.01, kinderGeburtsjahre: kinder(0), alter: 40, jahr: 2030 }, a).grundzulage;
    expect(Math.abs(rechts - links)).toBeLessThan(0.02);
  });

  it('streicht die Foerderung unterhalb des Mindesteigenbeitrags GANZ', () => {
    // Der Fallstrick, den schon Riester hatte: nicht anteilig weniger,
    // sondern gar nichts. 10 EUR im Monat sind 120 EUR im Jahr — genau die
    // Grenze; ein Cent darunter faellt alles weg.
    const knapp = avdZulagen({ eigenbeitragJahr: 120, kinderGeburtsjahre: kinder(2), alter: 40, jahr: 2030 }, a);
    expect(knapp.gesamt).toBeGreaterThan(0);

    const darunter = avdZulagen({ eigenbeitragJahr: 119.99, kinderGeburtsjahre: kinder(2), alter: 40, jahr: 2030 }, a);
    expect(darunter.gesamt).toBe(0);
    expect(darunter.kinderzulage).toBe(0);
    expect(darunter.hinweise.join(' ')).toMatch(/entfällt die Förderung/);
  });

  it('zahlt 300 EUR je Kind zusaetzlich', () => {
    const ohne = avdZulagen({ eigenbeitragJahr: 1800, kinderGeburtsjahre: kinder(2), alter: 40, jahr: 2030 }, a);
    const mit = avdZulagen({ eigenbeitragJahr: 1800, kinderGeburtsjahre: kinder(2), alter: 40, jahr: 2030 }, a);
    expect(mit.kinderzulage).toBeCloseTo(600, 6);
    expect(mit.gesamt - avdZulagen({ eigenbeitragJahr: 1800, kinderGeburtsjahre: kinder(0), alter: 40, jahr: 2030 }, a).gesamt)
      .toBeCloseTo(600, 6);
    expect(ohne.kinderzulage).toBeCloseTo(600, 6);
  });

  it('KORREKTUR: die Kinderzulage haengt am Eigenbeitrag, sie ist keine Pauschale', () => {
    // Je Kind ein Euro fuer jeden eigenen Euro, hoechstens 300 EUR. Die vollen
    // 300 EUR je Kind gibt es deshalb ab 300 EUR Eigenbeitrag — unabhaengig
    // davon, wie viele Kinder es sind. Vorher wurden pauschal 300 EUR je Kind
    // gezahlt; bei 120 EUR Beitrag und drei Kindern waren das 900 EUR Zulage
    // auf 120 EUR Einzahlung.
    expect(avdZulagen({ eigenbeitragJahr: 300, kinderGeburtsjahre: kinder(2), alter: 40, jahr: 2030 }, a).kinderzulage)
      .toBeCloseTo(600, 6);
    expect(avdZulagen({ eigenbeitragJahr: 150, kinderGeburtsjahre: kinder(2), alter: 40, jahr: 2030 }, a).kinderzulage)
      .toBeCloseTo(300, 6);
    expect(avdZulagen({ eigenbeitragJahr: 120, kinderGeburtsjahre: kinder(3), alter: 40, jahr: 2030 }, a).kinderzulage)
      .toBeCloseTo(360, 6);
  });

  it('weist auf die gekuerzte Kinderzulage hin, statt sie still zu kuerzen', () => {
    const knapp = avdZulagen({ eigenbeitragJahr: 150, kinderGeburtsjahre: kinder(1), alter: 40, jahr: 2030 }, a);
    expect(knapp.hinweise.join(' ')).toMatch(/volle Kinderzulage/);
    const voll = avdZulagen({ eigenbeitragJahr: 300, kinderGeburtsjahre: kinder(1), alter: 40, jahr: 2030 }, a);
    expect(voll.hinweise.join(' ')).not.toMatch(/volle Kinderzulage/);
  });

  it('gibt den Berufseinsteigerbonus nur unter 25', () => {
    expect(avdZulagen({ eigenbeitragJahr: 1800, kinderGeburtsjahre: kinder(0), alter: 24, jahr: 2030 }, a).bonus).toBe(200);
    expect(avdZulagen({ eigenbeitragJahr: 1800, kinderGeburtsjahre: kinder(0), alter: 25, jahr: 2030 }, a).bonus).toBe(0);
  });

  it('kennt das Produkt vor 2027 nicht', () => {
    const z = avdZulagen({ eigenbeitragJahr: 1800, kinderGeburtsjahre: kinder(0), alter: 40, jahr: 2026 }, a);
    expect(z.gesamt).toBe(0);
    expect(z.hinweise.join(' ')).toMatch(/erst ab 2027/);
  });

  it('foerdert kleine Beitraege anteilig deutlich staerker als grosse', () => {
    const klein = avdZulagen({ eigenbeitragJahr: 360, kinderGeburtsjahre: kinder(0), alter: 40, jahr: 2030 }, a);
    const gross = avdZulagen({ eigenbeitragJahr: 3600, kinderGeburtsjahre: kinder(0), alter: 40, jahr: 2030 }, a);
    expect(klein.foerderquote).toBeCloseTo(0.5, 6);
    expect(gross.foerderquote).toBeCloseTo(0.15, 6);
    expect(klein.foerderquote).toBeGreaterThan(gross.foerderquote);
  });
});

describe('Altersvorsorgedepot: Ansparphase', () => {
  const basis = {
    beitragMonat: 150, dynamik: 0, startkapital: 0, jahre: 30,
    renditeBrutto: 0.06, ter: 0.002, kinderGeburtsjahre: kinder(0), alterHeute: 37, startjahr: 2027,
  };

  it('zaehlt nur den Eigenbeitrag als Eigenleistung, die Zulage kommt obendrauf', () => {
    const r = avdAnsparphase(basis, p);
    expect(r.eigenbeitraege).toBeCloseTo(150 * 12 * 30, 4);
    // 1 800 EUR Eigenbeitrag im Jahr => volle Grundzulage 540 EUR
    expect(r.zulagenGesamt).toBeCloseTo(540 * 30, 4);
    expect(r.ersteZulagen.grundzulage).toBeCloseTo(540, 6);
  });

  it('die Zulagen erhoehen das Endkapital messbar', () => {
    const mit = avdAnsparphase(basis, p);
    const ohne = ansparphase({
      startkapital: 0, sparrateMonat: 150, jahre: 30,
      renditeBrutto: 0.06, ter: 0.002, ausgabeaufschlag: 0, depotgebuehrJahr: 0,
      teilfreistellung: 0, basiszins: 0, sparerpauschbetrag: 0,
      abgeltungsteuerSatzEffektiv: 0,
    });
    expect(mit.endkapital).toBeGreaterThan(ohne.endkapital);
    // 540 von 1 800 EUR sind 30 % mehr Zufluss — das muss sich im Endkapital
    // in derselben Groessenordnung wiederfinden.
    expect(mit.endkapital / ohne.endkapital).toBeCloseTo(1.3, 1);
  });

  it('zieht in der Ansparphase KEINE Vorabpauschale ab', () => {
    // Nachweis ueber den Vergleich mit einem freien Depot, das denselben
    // Zufluss hat: das AVD darf nicht schlechter abschneiden.
    const eigenPlusZulage = (1800 + 540) / 12;
    const frei = ansparphase({
      startkapital: 0, sparrateMonat: eigenPlusZulage, jahre: 30,
      renditeBrutto: 0.06, ter: 0.002, ausgabeaufschlag: 0, depotgebuehrJahr: 0,
      teilfreistellung: 0.3, basiszins: 0.0253, sparerpauschbetrag: 1000,
      abgeltungsteuerSatzEffektiv: 0.26375,
    });
    const avd = avdAnsparphase(basis, p);
    expect(avd.endkapital).toBeGreaterThan(frei.endkapital);
  });

  it('zahlt den Berufseinsteigerbonus nur EINMAL, nicht jaehrlich', () => {
    const jung = avdAnsparphase({ ...basis, alterHeute: 22, jahre: 5 }, p);
    // 5 Jahre x 540 EUR Grundzulage + einmal 200 EUR Bonus
    expect(jung.zulagenGesamt).toBeCloseTo(540 * 5 + 200, 4);
  });

  it('liefert bei zu kleinem Beitrag null Zulagen samt Hinweis', () => {
    const r = avdAnsparphase({ ...basis, beitragMonat: 5 }, p);
    expect(r.zulagenGesamt).toBe(0);
    expect(r.endkapital).toBeGreaterThan(0);
    expect(r.hinweise.join(' ')).toMatch(/entfällt die Förderung/);
  });
});

describe('Altersvorsorgedepot: Auszahlung', () => {
  it('zahlt nicht vor 65 aus', () => {
    const r = avdAuszahlung({ kapital: 200_000, alterBeiBeginn: 62, dauerJahre: 25, rendite: 0.03 }, a);
    expect(r.hinweise.join(' ')).toMatch(/frühestens ab 65/);
  });

  it('verlaengert einen zu kurzen Auszahlplan bis mindestens 85', () => {
    const r = avdAuszahlung({ kapital: 200_000, alterBeiBeginn: 67, dauerJahre: 10, rendite: 0.03 }, a);
    expect(r.dauerJahre).toBe(18);
    expect(r.hinweise.join(' ')).toMatch(/mindestens bis 85/);
  });

  it('laesst einen laengeren Plan unangetastet', () => {
    const r = avdAuszahlung({ kapital: 200_000, alterBeiBeginn: 67, dauerJahre: 25, rendite: 0.03 }, a);
    expect(r.dauerJahre).toBe(25);
    expect(r.hinweise).toHaveLength(0);
  });

  it('zehrt das Kapital ueber die Laufzeit genau auf', () => {
    const r = avdAuszahlung({ kapital: 200_000, alterBeiBeginn: 67, dauerJahre: 20, rendite: 0.03 }, a);
    // Die Rentenformel ist nachschuessig: erst verzinsen, dann auszahlen.
    let rest = 200_000;
    for (let j = 0; j < r.dauerJahre; j++) rest = rest * 1.03 - r.bruttoJahr;
    expect(rest).toBeCloseTo(0, 4);
  });
});

describe('Altersvorsorgedepot als Vertragsart in der Zeitachse', () => {
  const jetztJahr = new Date().getFullYear();
  const rentenbeginn = `${jetztJahr + 25}-01-01`;

  function szenario(over: Partial<Vertrag> = {}): Szenario {
    return {
      schemaVersion: 1,
      haushalt: {
        verheiratet: false, bundesland: 'Baden-Württemberg', kirchensteuer: false,
        hatKinder: false, kinderUnter25: 0, kinderGeburtsjahre: [], kinderInAusbildung: false, kvStatus: 'kvdr', pkvPraemieMonat: 0,
        zielNettoHeute: 2000,
      },
      annahmen: { inflation: 0.02, rentendynamik: 0.02, tarifIndex: 0.02, gehaltsdynamik: 0.02 },
      einkommenHeute: {
        modus: 'brutto', betrag: 4500, auszahlungen: 12,
        besoldungsgruppe: 'A13', besoldungsstufe: 4, besoldungsland: 'Bund',
      },
      personen: [{
        id: 'A', name: 'Test',
        geburtsdatum: `${jetztJahr - 42}-01-01`, rentenbeginn,
        art: 'grv', grvBruttoHeute: 1800,
        besoldungsgruppe: 'A13', besoldungsstufe: 8, ruhegehaltssatz: 71.75,
        dienstbeginn: '2005-01-01', teilzeitphasen: [],
      }],
      vertraege: [{
        id: 'avd1', inhaber: 'A', schicht: 2, typ: 'avd', name: 'Altersvorsorgedepot',
        brutto: 0, strategie: 'rente', altvertrag: false,
        monatsbeitrag: 150, dynamik: 0, renditeAnsparphase: 0.06, ter: 0.002,
        renditeEntnahme: 0.02, entnahmedauer: 25,
        ...over,
      }],
      planer: { startkapital: 0, dauerJahre: 25, rendite: 0.02, dynamik: 0, insNettoEinrechnen: false },
    };
  }

  it('erscheint als Posten im ersten Rentenjahr', () => {
    const r = projiziere(szenario());
    const zeile = r.zeilen.find((z) => z.jahr === jetztJahr + 25)!;
    const posten = zeile.posten.find((x) => x.id === 'avd1');
    expect(posten).toBeDefined();
    expect(posten!.bruttoJahr).toBeGreaterThan(0);
    expect(posten!.schicht).toBe(2);
  });

  it('wird TARIFLICH besteuert, nicht mit Abgeltungsteuer', () => {
    // Der entscheidende Unterschied zum freien Depot: das volle Brutto geht
    // ins zu versteuernde Einkommen. Beim ETF-Depot ist zveBeitrag 0, weil
    // dort die Abgeltungsteuer schon abgezogen ist.
    const r = projiziere(szenario());
    const zeile = r.zeilen.find((z) => z.jahr === jetztJahr + 25)!;
    const posten = zeile.posten.find((x) => x.id === 'avd1')!;
    expect(posten.zveBeitrag).toBeCloseTo(posten.bruttoJahr, 6);
    expect(posten.steuerJahr).toBeGreaterThan(0);
  });

  it('die Zulagen erhoehen die Auszahlung messbar', () => {
    const mit = projiziere(szenario());
    // Derselbe Vertrag, aber unter dem Mindesteigenbeitrag: keine Foerderung.
    const ohne = projiziere(szenario({ monatsbeitrag: 5 }));

    const j = jetztJahr + 25;
    const bruttoMit = mit.zeilen.find((z) => z.jahr === j)!.posten.find((x) => x.id === 'avd1')!.bruttoJahr;
    const bruttoOhne = ohne.zeilen.find((z) => z.jahr === j)!.posten.find((x) => x.id === 'avd1')!.bruttoJahr;

    // 150 EUR gegen 5 EUR Beitrag sind 30-fach; mit Zulage muss der Abstand
    // noch groesser sein.
    expect(bruttoMit / bruttoOhne).toBeGreaterThan(30);
    expect(ohne.hinweise.join(' ')).toMatch(/entfällt die Förderung/);
  });

  it('zahlt nur ueber die Auszahlungsdauer, danach nicht mehr', () => {
    const r = projiziere(szenario({ entnahmedauer: 20 }));
    const j = jetztJahr + 25;
    const posten = (jahr: number) => r.zeilen.find((z) => z.jahr === jahr)?.posten.find((x) => x.id === 'avd1');
    expect(posten(j + 19)).toBeDefined();
    expect(posten(j + 20)).toBeUndefined();
  });

  it('bleibt in der KVdR beitragsfrei, in der freiwilligen Versicherung nicht', () => {
    const j = jetztJahr + 25;
    const kvdr = projiziere(szenario());
    const frei = projiziere({
      ...szenario(),
      haushalt: { ...szenario().haushalt, kvStatus: 'freiwillig' },
    });
    const kvVon = (r: ReturnType<typeof projiziere>) =>
      r.zeilen.find((z) => z.jahr === j)!.posten.find((x) => x.id === 'avd1')!.kvPvJahr;
    expect(kvVon(frei)).toBeGreaterThan(kvVon(kvdr));
  });
});

describe('KV/PV-Verteilung im Kassenbon', () => {
  // Befund beim Einbau des Altersvorsorgedepots: die Beitragslast wurde nach
  // BRUTTO auf die Quellen verteilt. Damit trug ein in der KVdR beitragsfreier
  // Bezug im Kassenbon Beitraege, die er nicht ausloest — und der
  // gesetzlichen Rente fehlten sie. Betroffen war auch die Riester-Rente.
  const jetztJahr = new Date().getFullYear();
  const j = jetztJahr + 25;

  function mitVertrag(v: Partial<Vertrag>): Szenario {
    return {
      schemaVersion: 1,
      haushalt: {
        verheiratet: false, bundesland: 'Baden-Württemberg', kirchensteuer: false,
        hatKinder: false, kinderUnter25: 0, kinderGeburtsjahre: [], kinderInAusbildung: false, kvStatus: 'kvdr', pkvPraemieMonat: 0,
        zielNettoHeute: 2000,
      },
      annahmen: { inflation: 0.02, rentendynamik: 0.02, tarifIndex: 0.02, gehaltsdynamik: 0.02 },
      einkommenHeute: {
        modus: 'brutto', betrag: 4500, auszahlungen: 12,
        besoldungsgruppe: 'A13', besoldungsstufe: 4, besoldungsland: 'Bund',
      },
      personen: [{
        id: 'A', name: 'Test',
        geburtsdatum: `${jetztJahr - 42}-01-01`, rentenbeginn: `${j}-01-01`,
        art: 'grv', grvBruttoHeute: 1800,
        besoldungsgruppe: 'A13', besoldungsstufe: 8, ruhegehaltssatz: 71.75,
        dienstbeginn: '2005-01-01', teilzeitphasen: [],
      }],
      vertraege: [{
        id: 'x', inhaber: 'A', schicht: 2, typ: 'riester', name: 'Riester',
        brutto: 0, strategie: 'rente', altvertrag: false,
        ...v,
      }],
      planer: { startkapital: 0, dauerJahre: 25, rendite: 0.02, dynamik: 0, insNettoEinrechnen: false },
    };
  }

  it('schreibt einem in der KVdR beitragsfreien Bezug KEINE Beitraege zu', () => {
    const r = projiziere(mitVertrag({ typ: 'riester', brutto: 400 }));
    const zeile = r.zeilen.find((z) => z.jahr === j)!;
    const riester = zeile.posten.find((x) => x.id === 'x')!;
    expect(riester.bruttoJahr).toBeCloseTo(4800, 6);
    expect(riester.kvPvJahr).toBe(0);
  });

  it('laesst die Beitragssumme des Haushalts dabei unveraendert', () => {
    // Die Beitraege verschwinden nicht, sie landen bei der Quelle, die sie
    // ausloest — der gesetzlichen Rente.
    const ohne = projiziere(mitVertrag({ typ: 'riester', brutto: 0 }));
    const mit = projiziere(mitVertrag({ typ: 'riester', brutto: 400 }));
    const kv = (r: ReturnType<typeof projiziere>) => r.zeilen.find((z) => z.jahr === j)!.kvPvGesamt;
    expect(kv(mit)).toBeCloseTo(kv(ohne), 6);

    const rente = mit.zeilen.find((z) => z.jahr === j)!.posten.find((x) => x.id === 'person-A')!;
    expect(rente.kvPvJahr).toBeCloseTo(kv(mit), 6);
  });

  it('belastet denselben Bezug in der freiwilligen Versicherung sehr wohl', () => {
    const basis = mitVertrag({ typ: 'riester', brutto: 400 });
    const frei = projiziere({ ...basis, haushalt: { ...basis.haushalt, kvStatus: 'freiwillig' } });
    const riester = frei.zeilen.find((z) => z.jahr === j)!.posten.find((x) => x.id === 'x')!;
    expect(riester.kvPvJahr).toBeGreaterThan(0);
  });
});

describe('Altersvorsorgedepot: Sonderausgabenabzug', () => {
  const opt = { verheiratet: false, bundesland: 'Baden-Württemberg', kirchensteuerpflichtig: false };

  it('zieht Eigenbeitrag bis zum Hoechstbetrag PLUS Zulagen ab', () => {
    // Alleinstehend ohne Kinder: 1 800 + 540 = 2 340 EUR.
    const r = avdSteuervorteil(
      { eigenbeitragJahr: 1800, zulagenJahr: 540, zveHeute: 60_000 }, opt, p,
    );
    expect(r.abzugsfaehig).toBeCloseTo(2340, 6);
  });

  it('deckelt den Eigenbeitrag, nicht aber die Zulagen', () => {
    const r = avdSteuervorteil(
      { eigenbeitragJahr: 5000, zulagenJahr: 1140, zveHeute: 60_000 }, opt, p,
    );
    expect(r.abzugsfaehig).toBeCloseTo(1800 + 1140, 6);
  });

  it('GUENSTIGERPRUEFUNG: bei hohem Einkommen bringt der Abzug mehr als die Zulage', () => {
    const r = avdSteuervorteil(
      { eigenbeitragJahr: 1800, zulagenJahr: 540, zveHeute: 90_000 }, opt, p,
    );
    expect(r.guenstigerAlsZulage).toBe(true);
    expect(r.ueberZulagen).toBeGreaterThan(0);
    expect(r.eigenaufwandNetto).toBeLessThan(1800 - 540);
  });

  it('GUENSTIGERPRUEFUNG: bei kleinem Einkommen bleibt es bei der Zulage', () => {
    // Unter dem Grundfreibetrag faellt gar keine Steuer an, die Ersparnis ist
    // also 0 — der Abzug bringt dann nichts UEBER die Zulage hinaus.
    const r = avdSteuervorteil(
      { eigenbeitragJahr: 1800, zulagenJahr: 540, zveHeute: 8_000 }, opt, p,
    );
    expect(r.guenstigerAlsZulage).toBe(false);
    expect(r.ueberZulagen).toBe(0);
    expect(r.eigenaufwandNetto).toBeCloseTo(1800, 6);
  });

  it('KORREKTUR: die Zulagen mindern den Eigenaufwand NICHT', () => {
    // Sie kommen nicht aus der eigenen Tasche, sondern vom Staat, und stehen
    // bereits als hoeheres Kapital auf der Habenseite. Sie ein zweites Mal als
    // Kostenminderung zu buchen zaehlte sie doppelt und liess das gefoerderte
    // Depot aussehen, als brauche es nur halb so viel Geld.
    const r = avdSteuervorteil(
      { eigenbeitragJahr: 1800, zulagenJahr: 540, zveHeute: 60_000 }, opt, p,
    );
    expect(r.eigenaufwandNetto).toBeCloseTo(1800 - r.ueberZulagen, 6);
    expect(r.eigenaufwandNetto).toBeGreaterThan(1800 - 540);

    // Auf der Habenseite tauchen sie dagegen sehr wohl auf.
    expect(r.zuflussInsDepot).toBeCloseTo(1800 + 540, 6);
  });

  it('der Netto-Aufwand faellt nie unter null', () => {
    // Bei sehr kleinem Beitrag und sehr hohem Steuersatz kann die Ersparnis
    // den Beitrag uebersteigen — negativ wird der Aufwand trotzdem nicht.
    const r = avdSteuervorteil(
      { eigenbeitragJahr: 200, zulagenJahr: 200, zveHeute: 250_000 }, opt, p,
    );
    expect(r.eigenaufwandNetto).toBeGreaterThanOrEqual(0);
    expect(r.eigenaufwandNetto).toBeLessThanOrEqual(200);
  });
});

describe('Altersvorsorgedepot: Teilauszahlung zu Rentenbeginn', () => {
  const basis = { kapital: 200_000, alterBeiBeginn: 67, dauerJahre: 20, rendite: 0 };

  it('entnimmt 30 Prozent auf einen Schlag und verrentet den Rest', () => {
    const r = avdAuszahlung({ ...basis, teilauszahlungQuote: 0.3 }, a);
    expect(r.teilauszahlung).toBeCloseTo(60_000, 6);
    expect(r.bruttoJahr).toBeCloseTo(140_000 / 20, 6);
  });

  it('verteilt insgesamt genau dasselbe Kapital wie ohne Teilauszahlung', () => {
    const ohne = avdAuszahlung(basis, a);
    const mit = avdAuszahlung({ ...basis, teilauszahlungQuote: 0.3 }, a);
    expect(mit.teilauszahlung + mit.bruttoJahr * mit.dauerJahre)
      .toBeCloseTo(ohne.bruttoJahr * ohne.dauerJahre, 4);
  });

  it('kappt oberhalb von 30 Prozent, mit Hinweis', () => {
    const r = avdAuszahlung({ ...basis, teilauszahlungQuote: 0.6 }, a);
    expect(r.teilauszahlung).toBeCloseTo(60_000, 6);
    expect(r.hinweise.join(' ')).toMatch(/höchstens 30 %/);
  });

  it('laesst ohne Angabe alles im Auszahlplan', () => {
    const r = avdAuszahlung(basis, a);
    expect(r.teilauszahlung).toBe(0);
    expect(r.hinweise).toHaveLength(0);
  });
});

describe('Gefoerdertes gegen freies Depot', () => {
  const opt = { verheiratet: false, bundesland: 'Baden-Württemberg', kirchensteuerpflichtig: false };
  const basis = {
    beitragMonat: 150, jahre: 30, renditeBrutto: 0.06, kosten: 0.01,
    kinderGeburtsjahre: kinder(0), alterHeute: 37, alterBeiRente: 67, startjahr: 2027,
    auszahldauer: 25, renditeAuszahlung: 0, zveHeute: 50_000,
    steuersatzImAlter: 0.25,
  };

  it('das gefoerderte Depot baut mehr Kapital auf', () => {
    // Zulagen fliessen mit ein und es faellt keine Vorabpauschale an.
    const r = avdGegenFreiesDepot(basis, opt, p);
    expect(r.gefoerdert.endkapital).toBeGreaterThan(r.frei.endkapital);
  });

  it('kostet bei gleichem Bruttobeitrag netto deutlich weniger', () => {
    const r = avdGegenFreiesDepot(basis, opt, p);
    expect(r.gefoerdert.eigenbeitraege).toBeCloseTo(r.frei.eigenbeitraege, 2);
    expect(r.gefoerdert.eigenaufwandNetto).toBeLessThan(r.frei.eigenaufwandNetto);
  });

  it('wird dafuer in der Auszahlung haerter besteuert', () => {
    // Das ist die Kehrseite: voller Betrag zum persoenlichen Satz gegen
    // 25 % nur auf den Gewinn. Der Test haelt BEIDE Richtungen fest, damit
    // der Vergleich nicht versehentlich einseitig wird.
    const r = avdGegenFreiesDepot(basis, opt, p);
    const quote = (s: { steuerJahr: number; bruttoJahr: number }) => s.steuerJahr / s.bruttoJahr;
    expect(quote(r.gefoerdert)).toBeGreaterThan(quote(r.frei));
  });

  it('kippt bei einem hohen Steuersatz im Alter zugunsten des freien Depots', () => {
    const niedrig = avdGegenFreiesDepot({ ...basis, steuersatzImAlter: 0.15 }, opt, p);
    const hoch = avdGegenFreiesDepot({ ...basis, steuersatzImAlter: 0.42 }, opt, p);

    const vorsprung = (r: ReturnType<typeof avdGegenFreiesDepot>) =>
      r.gefoerdert.nettoMonat - r.frei.nettoMonat;
    expect(vorsprung(niedrig)).toBeGreaterThan(vorsprung(hoch));
  });

  it('weist die Teilauszahlung getrennt aus, statt sie einzurechnen', () => {
    const r = avdGegenFreiesDepot({ ...basis, teilauszahlungQuote: 0.3 }, opt, p);
    expect(r.gefoerdert.nettoEinmal).toBeGreaterThan(0);
    expect(r.frei.nettoEinmal).toBe(0);

    const ohne = avdGegenFreiesDepot(basis, opt, p);
    expect(r.gefoerdert.nettoMonat).toBeLessThan(ohne.gefoerdert.nettoMonat);
  });
});

describe('Vergleich: Besteuerung des freien Depots', () => {
  const opt = { verheiratet: false, bundesland: 'Baden-Württemberg', kirchensteuerpflichtig: false };

  it('mittelt den Gewinnanteil ueber die Auszahlungsjahre', () => {
    // Der Gewinnanteil steigt von Jahr zu Jahr (FIFO). Wuerde nur das erste
    // Jahr angesetzt, kaeme das freie Depot zu guenstig weg — und der
    // Vergleich waere zugunsten der falschen Seite verzerrt.
    const r = avdGegenFreiesDepot(
      {
        beitragMonat: 150, jahre: 30, renditeBrutto: 0.06, kosten: 0.01,
        kinderGeburtsjahre: kinder(0), alterHeute: 37, alterBeiRente: 67, startjahr: 2027,
        auszahldauer: 18, renditeAuszahlung: 0, zveHeute: 50_000,
        steuersatzImAlter: 0.25,
      },
      opt, p,
    );

    // Ueber die Laufzeit sind rund zwei Drittel des Depots Gewinn; die Steuer
    // muss deutlich ueber dem liegen, was der Gewinnanteil des ersten Jahres
    // ergaebe (dort ist er am kleinsten).
    expect(r.frei.steuerJahr).toBeGreaterThan(0);
    expect(r.frei.steuerJahr / r.frei.bruttoJahr).toBeGreaterThan(0.05);
    expect(r.frei.steuerJahr / r.frei.bruttoJahr).toBeLessThan(0.25);
  });
});

describe('Altersvorsorgedepot: Profitabilitaet', () => {
  const opt = { verheiratet: false, bundesland: 'Baden-Württemberg', kirchensteuerpflichtig: false };
  const basis = {
    beitragMonat: 150, jahre: 30, kinderGeburtsjahre: kinder(0), alterHeute: 37, startjahr: 2027,
    zveHeute: 50_000, endkapital: 180_000,
    bruttoRenteJahr: 10_000, steuerRenteJahr: 2_700, jahreAuszahlung: 18,
    bruttoEinmal: 0, steuerEinmal: 0,
  };

  it('trennt Zufluss ins Depot von dem, was es wirklich kostet', () => {
    const r = avdProfitabilitaet(basis, opt, p);
    expect(r.eigenbeitraegeGesamt).toBeCloseTo(150 * 12 * 30, 4);
    expect(r.zulagenGesamt).toBeCloseTo(540 * 30, 4);
    expect(r.zuflussInsDepotGesamt).toBeCloseTo(r.eigenbeitraegeGesamt + r.zulagenGesamt, 4);

    // Was aus der Tasche geht, ist der Eigenbeitrag MINUS Steuerersparnis —
    // die Zulagen mindern es nicht.
    expect(r.eigenaufwandNettoGesamt)
      .toBeCloseTo(r.eigenbeitraegeGesamt - r.steuerersparnisGesamt, 4);
    expect(r.eigenaufwandNettoGesamt).toBeGreaterThan(
      r.eigenbeitraegeGesamt - r.zulagenGesamt,
    );
  });

  it('reicht die uebergebene Auszahlseite unveraendert durch', () => {
    // Sie wird NICHT neu gerechnet: die Oberflaeche ermittelt sie ueber den
    // Haushaltstarif, und beide Stellen duerfen nicht auseinanderlaufen.
    const r = avdProfitabilitaet(basis, opt, p);
    expect(r.bruttoRenteMonat).toBeCloseTo(10_000 / 12, 6);
    expect(r.steuerRenteMonat).toBeCloseTo(2_700 / 12, 6);
    expect(r.nettoRenteMonat).toBeCloseTo(7_300 / 12, 6);
  });

  it('rechnet dieselben Kennzahlen wie der Vertrags-TUEV', () => {
    const r = avdProfitabilitaet(basis, opt, p);
    expect(r.summeAuszahlung).toBeCloseTo(7_300 * 18, 4);
    expect(r.nettoHebel).toBeCloseTo(r.summeAuszahlung / r.summeEinzahlung, 6);
    expect(r.echterGewinn).toBeCloseTo(r.summeAuszahlung - r.summeEinzahlung, 4);
    expect(r.rendite).toBeGreaterThan(0);
    expect(r.amortisationsJahre).toBeGreaterThan(0);
  });

  it('nimmt die Teilauszahlung in die Kennzahlen auf', () => {
    const ohne = avdProfitabilitaet(basis, opt, p);
    const mit = avdProfitabilitaet(
      { ...basis, bruttoRenteJahr: 7_000, steuerRenteJahr: 1_890, bruttoEinmal: 54_000, steuerEinmal: 18_700 },
      opt, p,
    );
    expect(mit.nettoEinmal).toBeCloseTo(54_000 - 18_700, 4);
    // Der Einmalbetrag kommt frueher — die Amortisation verkuerzt sich.
    expect(mit.amortisationsJahre).toBeLessThan(ohne.amortisationsJahre);
  });

  it('warnt, wenn hinten weniger herauskommt als vorn hinein', () => {
    const r = avdProfitabilitaet(
      { ...basis, bruttoRenteJahr: 1_000, steuerRenteJahr: 270 }, opt, p,
    );
    expect(r.nettoHebel).toBeLessThan(1);
    expect(r.hinweise.join(' ')).toMatch(/weniger heraus, als eingezahlt/);
  });
});

describe('Berufseinsteigerbonus: einmalig, nicht dauerhaft', () => {
  // Befund aus der Ansicht: Die Seite wies "Zulagen im Jahr 380 EUR" und
  // "105,6 % obendrauf" aus. Darin steckten 200 EUR Bonus, den es EINMAL gibt.
  // Dauerhaft sind es 180 EUR auf 360 EUR, also 50 %. Fuer eine Sparentscheidung
  // ueber 30 Jahre ist das ein erheblicher Unterschied.
  it('trennt die dauerhafte Zulage vom einmaligen Bonus', () => {
    const jung = avdZulagen({ eigenbeitragJahr: 360, kinderGeburtsjahre: kinder(0), alter: 24, jahr: 2030 }, a);
    expect(jung.bonus).toBe(200);
    expect(jung.gesamt).toBeCloseTo(380, 6);
    expect(jung.dauerhaft).toBeCloseTo(180, 6);
  });

  it('weist beide Foerderquoten getrennt aus', () => {
    const jung = avdZulagen({ eigenbeitragJahr: 360, kinderGeburtsjahre: kinder(0), alter: 24, jahr: 2030 }, a);
    expect(jung.foerderquote).toBeCloseTo(380 / 360, 6);        // 105,6 %
    expect(jung.foerderquoteDauerhaft).toBeCloseTo(0.5, 6);     // 50 %
  });

  it('ab 25 sind beide Quoten gleich', () => {
    const alt = avdZulagen({ eigenbeitragJahr: 360, kinderGeburtsjahre: kinder(0), alter: 25, jahr: 2030 }, a);
    expect(alt.bonus).toBe(0);
    expect(alt.dauerhaft).toBeCloseTo(alt.gesamt, 6);
    expect(alt.foerderquoteDauerhaft).toBeCloseTo(alt.foerderquote, 6);
  });

  it('die Trennung aendert die Summe ueber die Laufzeit NICHT', () => {
    // Der Bonus darf beim Umbau weder verschwinden noch doppelt gezaehlt
    // werden: 5 Jahre volle Grundzulage plus genau ein Bonus.
    const r = avdAnsparphase(
      {
        beitragMonat: 150, dynamik: 0, startkapital: 0, jahre: 5,
        renditeBrutto: 0.04, ter: 0.01, kinderGeburtsjahre: kinder(0), alterHeute: 22, startjahr: 2027,
      },
      p,
    );
    expect(r.zulagenGesamt).toBeCloseTo(540 * 5 + 200, 4);
    expect(r.ersteZulagen.dauerhaft).toBeCloseTo(540, 6);
    expect(r.ersteZulagen.gesamt).toBeCloseTo(740, 6);
  });
});

describe('Kinderzulage endet mit dem Kindergeldanspruch', () => {
  // BEFUND: Die Kinderzulage lief ueber die GANZE Ansparphase. Wer mit 35 ein
  // fuenfjaehriges Kind eintrug, bekam 32 Jahre lang 300 EUR statt der
  // tatsaechlichen 13. Sie haengt am Kindergeldanspruch — im Regelfall bis 18,
  // bei Ausbildung oder Studium bis 25.
  const kind2020 = [2020];

  it('zahlt, solange das Kind unter 18 ist', () => {
    const drin = avdZulagen({ eigenbeitragJahr: 1800, kinderGeburtsjahre: kind2020, alter: 40, jahr: 2037 }, a);
    expect(drin.kinderzulage).toBeCloseTo(300, 6);
    expect(drin.kinderMitAnspruch).toBe(1);
  });

  it('hoert im Jahr des 18. Geburtstags auf', () => {
    const raus = avdZulagen({ eigenbeitragJahr: 1800, kinderGeburtsjahre: kind2020, alter: 40, jahr: 2038 }, a);
    expect(raus.kinderzulage).toBe(0);
    expect(raus.kinderMitAnspruch).toBe(0);
    // Die Grundzulage laeuft davon unberuehrt weiter.
    expect(raus.grundzulage).toBeCloseTo(540, 6);
  });

  it('laeuft mit Ausbildung oder Studium bis 25', () => {
    const args = { eigenbeitragJahr: 1800, kinderGeburtsjahre: kind2020, alter: 40 };
    expect(avdZulagen({ ...args, jahr: 2044, kinderInAusbildung: true }, a).kinderzulage).toBeCloseTo(300, 6);
    expect(avdZulagen({ ...args, jahr: 2045, kinderInAusbildung: true }, a).kinderzulage).toBe(0);
  });

  it('ein bereits volljaehriges Kind bringt gar nichts mehr', () => {
    const r = avdZulagen({ eigenbeitragJahr: 1800, kinderGeburtsjahre: [2000], alter: 45, jahr: 2030 }, a);
    expect(r.kinderzulage).toBe(0);
  });

  it('bei mehreren Kindern sinkt die Zulage in Stufen, nicht auf einen Schlag', () => {
    const args = { eigenbeitragJahr: 1800, kinderGeburtsjahre: [2015, 2022], alter: 40 };
    expect(avdZulagen({ ...args, jahr: 2030 }, a).kinderzulage).toBeCloseTo(600, 6);
    expect(avdZulagen({ ...args, jahr: 2035 }, a).kinderzulage).toBeCloseTo(300, 6);
    expect(avdZulagen({ ...args, jahr: 2041 }, a).kinderzulage).toBe(0);
  });

  it('ohne Geburtsjahre gibt es keine Kinderzulage — geraten wird nicht', () => {
    const r = avdZulagen({ eigenbeitragJahr: 1800, alter: 40, jahr: 2030 }, a);
    expect(r.kinderzulage).toBe(0);
  });

  it('DER BELEG: ueber die Laufzeit macht die Altersgrenze Tausende Euro aus', () => {
    // 30 Jahre ansparen, ein Kind von heute fuenf Jahren.
    const lauf = avdAnsparphase(
      {
        beitragMonat: 150, dynamik: 0, startkapital: 0, jahre: 30,
        renditeBrutto: 0.04, ter: 0.01,
        kinderGeburtsjahre: [2022], alterHeute: 37, startjahr: 2027,
      },
      p,
    );
    // Anspruch bis einschliesslich 2039, also 13 Beitragsjahre.
    const erwartet = 540 * 30 + 300 * 13;
    expect(lauf.zulagenGesamt).toBeCloseTo(erwartet, 4);

    // Ohne Altersgrenze waeren es 30 Jahre Kinderzulage gewesen.
    const frueherFalsch = 540 * 30 + 300 * 30;
    expect(frueherFalsch - lauf.zulagenGesamt).toBeCloseTo(300 * 17, 4);
  });

  it('die Ansparphase reicht die Ausbildungsannahme durch', () => {
    const basis = {
      beitragMonat: 150, dynamik: 0, startkapital: 0, jahre: 30,
      renditeBrutto: 0.04, ter: 0.01,
      kinderGeburtsjahre: [2022], alterHeute: 37, startjahr: 2027,
    };
    const ohne = avdAnsparphase(basis, p);
    const mit = avdAnsparphase({ ...basis, kinderInAusbildung: true }, p);
    expect(mit.zulagenGesamt - ohne.zulagenGesamt).toBeCloseTo(300 * 7, 4);
  });
});

describe('Steuerersparnis als Jahresreihe', () => {
  // Die Reihe laeuft PARALLEL zum Kapitalverlauf aus der Ansparphase — die
  // Oberflaeche zippt beide fuer den Tooltip zusammen. Laufen sie in der
  // Laenge auseinander, zeigt das Diagramm stillschweigend falsche Werte.
  const opt = { verheiratet: false, bundesland: 'Baden-Württemberg', kirchensteuerpflichtig: false };
  const gemeinsam = {
    beitragMonat: 150, jahre: 30, alterHeute: 37, startjahr: 2027,
  };

  const anspar = avdAnsparphase(
    { ...gemeinsam, dynamik: 0, startkapital: 0, renditeBrutto: 0.04, ter: 0.01 },
    p,
  );
  const profit = avdProfitabilitaet(
    { ...gemeinsam, zveHeute: 60_000, endkapital: anspar.endkapital },
    opt, p,
  );

  it('hat dieselbe Laenge wie der Kapitalverlauf', () => {
    expect(profit.steuerersparnisKumuliert).toHaveLength(anspar.verlauf.length);
    expect(profit.steuerersparnisKumuliert).toHaveLength(30);
  });

  it('waechst monoton und endet auf der Gesamtersparnis', () => {
    const reihe = profit.steuerersparnisKumuliert;
    for (let i = 1; i < reihe.length; i++) {
      expect(reihe[i]!).toBeGreaterThanOrEqual(reihe[i - 1]!);
    }
    expect(reihe[reihe.length - 1]!).toBeCloseTo(profit.steuerersparnisGesamt, 6);
  });

  it('bleibt bei null, wenn der Abzug nichts ueber die Zulagen hinaus bringt', () => {
    const ohne = avdProfitabilitaet(
      { ...gemeinsam, zveHeute: 8_000, endkapital: 100_000 }, opt, p,
    );
    expect(ohne.steuerersparnisKumuliert.every((x) => x === 0)).toBe(true);
  });

  it('braucht keine Auszahlungsangaben mehr', () => {
    // Die Seite zeigt nur noch Einzahlung und Kapital; Rentenwerte zu
    // erfinden, nur damit die Funktion sie bekommt, waere unehrlich.
    expect(profit.eigenbeitraegeGesamt).toBeCloseTo(150 * 12 * 30, 4);
    expect(profit.endkapital).toBeCloseTo(anspar.endkapital, 6);
    expect(profit.nettoRenteMonat).toBe(0);
    expect(profit.jahreAuszahlung).toBe(0);
  });
});
