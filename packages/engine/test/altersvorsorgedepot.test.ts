import { describe, it, expect } from 'vitest';
import { avdZulagen, avdAnsparphase, avdAuszahlung } from '../src/products/altersvorsorgedepot.js';
import { ansparphase } from '../src/products/kapitalanlage.js';
import { parameterFuer } from '../src/params/registry.js';
import { projiziere } from '../src/projection/timeline.js';
import type { Szenario, Vertrag } from '../src/model.js';

const p = parameterFuer(2027, { indexRate: 0 });
const a = p.avd;

describe('Altersvorsorgedepot: Zulagenstufen', () => {
  it('gewaehrt auf die ersten 360 EUR die Haelfte', () => {
    const z = avdZulagen({ eigenbeitragJahr: 360, kinder: 0, alter: 40 }, a);
    expect(z.stufe1).toBeCloseTo(180, 6);
    expect(z.stufe2).toBe(0);
    expect(z.grundzulage).toBeCloseTo(180, 6);
  });

  it('gewaehrt auf die weiteren 1 440 EUR ein Viertel', () => {
    const z = avdZulagen({ eigenbeitragJahr: 1800, kinder: 0, alter: 40 }, a);
    expect(z.stufe1).toBeCloseTo(180, 6);
    expect(z.stufe2).toBeCloseTo(360, 6);
    expect(z.grundzulage).toBeCloseTo(540, 6);
  });

  it('deckelt die Grundzulage bei 540 EUR', () => {
    const z = avdZulagen({ eigenbeitragJahr: 6000, kinder: 0, alter: 40 }, a);
    expect(z.grundzulage).toBeCloseTo(540, 6);
    expect(z.hinweise.join(' ')).toMatch(/steigt die Grundzulage\s+nicht weiter/);
  });

  it('ist am Knickpunkt stetig', () => {
    const links = avdZulagen({ eigenbeitragJahr: 359.99, kinder: 0, alter: 40 }, a).grundzulage;
    const rechts = avdZulagen({ eigenbeitragJahr: 360.01, kinder: 0, alter: 40 }, a).grundzulage;
    expect(Math.abs(rechts - links)).toBeLessThan(0.02);
  });

  it('streicht die Foerderung unterhalb des Mindesteigenbeitrags GANZ', () => {
    // Der Fallstrick, den schon Riester hatte: nicht anteilig weniger,
    // sondern gar nichts. 10 EUR im Monat sind 120 EUR im Jahr — genau die
    // Grenze; ein Cent darunter faellt alles weg.
    const knapp = avdZulagen({ eigenbeitragJahr: 120, kinder: 2, alter: 40 }, a);
    expect(knapp.gesamt).toBeGreaterThan(0);

    const darunter = avdZulagen({ eigenbeitragJahr: 119.99, kinder: 2, alter: 40 }, a);
    expect(darunter.gesamt).toBe(0);
    expect(darunter.kinderzulage).toBe(0);
    expect(darunter.hinweise.join(' ')).toMatch(/entfällt die Förderung/);
  });

  it('zahlt 300 EUR je Kind zusaetzlich', () => {
    const ohne = avdZulagen({ eigenbeitragJahr: 1800, kinder: 0, alter: 40 }, a);
    const mit = avdZulagen({ eigenbeitragJahr: 1800, kinder: 2, alter: 40 }, a);
    expect(mit.kinderzulage).toBeCloseTo(600, 6);
    expect(mit.gesamt - ohne.gesamt).toBeCloseTo(600, 6);
  });

  it('gibt den Berufseinsteigerbonus nur unter 25', () => {
    expect(avdZulagen({ eigenbeitragJahr: 1800, kinder: 0, alter: 24 }, a).bonus).toBe(200);
    expect(avdZulagen({ eigenbeitragJahr: 1800, kinder: 0, alter: 25 }, a).bonus).toBe(0);
  });

  it('kennt das Produkt vor 2027 nicht', () => {
    const z = avdZulagen({ eigenbeitragJahr: 1800, kinder: 0, alter: 40, jahr: 2026 }, a);
    expect(z.gesamt).toBe(0);
    expect(z.hinweise.join(' ')).toMatch(/erst ab 2027/);
  });

  it('foerdert kleine Beitraege anteilig deutlich staerker als grosse', () => {
    const klein = avdZulagen({ eigenbeitragJahr: 360, kinder: 0, alter: 40 }, a);
    const gross = avdZulagen({ eigenbeitragJahr: 3600, kinder: 0, alter: 40 }, a);
    expect(klein.foerderquote).toBeCloseTo(0.5, 6);
    expect(gross.foerderquote).toBeCloseTo(0.15, 6);
    expect(klein.foerderquote).toBeGreaterThan(gross.foerderquote);
  });
});

describe('Altersvorsorgedepot: Ansparphase', () => {
  const basis = {
    beitragMonat: 150, dynamik: 0, startkapital: 0, jahre: 30,
    renditeBrutto: 0.06, ter: 0.002, kinder: 0, alterHeute: 37, startjahr: 2027,
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
        hatKinder: false, kinderUnter25: 0, kvStatus: 'kvdr', pkvPraemieMonat: 0,
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
        hatKinder: false, kinderUnter25: 0, kvStatus: 'kvdr', pkvPraemieMonat: 0,
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
