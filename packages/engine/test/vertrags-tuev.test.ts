import { describe, it, expect } from 'vitest';
import { vertragsTuev, renteOderKapital, type TuevAnnahmen, type TuevKontext } from '../src/analyse/vertrags-tuev.js';
import { parameterFuer } from '../src/params/registry.js';
import { avdProfitabilitaet } from '../src/products/altersvorsorgedepot.js';
import { projiziere } from '../src/projection/timeline.js';
import type { Szenario, Vertrag } from '../src/model.js';

const p = parameterFuer(2026, { indexRate: 0 });

const szenario: Szenario = {
  schemaVersion: 1,
  haushalt: {
    verheiratet: false, bundesland: 'Nordrhein-Westfalen', kirchensteuer: false,
    hatKinder: false, kinderUnter25: 0, kinderGeburtsjahre: [], kinderInAusbildung: false, kvStatus: 'kvdr', pkvPraemieMonat: 0,
    zielNettoHeute: 2000,
  },
  annahmen: { inflation: 0.02, rentendynamik: 0.02, tarifIndex: 0, gehaltsdynamik: 0.02 },
  einkommenHeute: {
    modus: 'brutto', betrag: 4500, auszahlungen: 12,
    besoldungsgruppe: 'A13', besoldungsstufe: 4, besoldungsland: 'Bund',
  },
  personen: [{
    id: 'A', name: 'Test', geburtsdatum: '1975-01-01', rentenbeginn: '2042-01-01',
    art: 'grv', grvBruttoHeute: 1800,
    besoldungsgruppe: 'A13', besoldungsstufe: 8, ruhegehaltssatz: 71.75,
    dienstbeginn: '2000-01-01', teilzeitphasen: [],
  }],
  vertraege: [],
  planer: { startkapital: 0, dauerJahre: 25, rendite: 0.02, dynamik: 0, insNettoEinrechnen: false },
};

function vertrag(over: Partial<Vertrag> = {}): Vertrag {
  return {
    id: 'v1', inhaber: 'A', schicht: 3, typ: 'prvRente', name: 'Test',
    brutto: 0, strategie: 'rente', altvertrag: false,
    ...over,
  };
}

function annahmen(over: Partial<TuevAnnahmen> = {}): TuevAnnahmen {
  return {
    beitragMonat: 200, dynamik: 0, agZuschussMonat: 0, kinder: [],
    beginnJahr: 2026, lebenserwartung: 85,
    ...over,
  };
}

function kontext(over: Partial<TuevKontext> = {}): TuevKontext {
  return {
    jahresbrutto: 54_000,
    zveHeute: 40_000,
    rentenbeginnJahr: 2042,
    alterBeiRentenbeginn: 67,
    bruttoRenteMonat: 400,
    kvPvMonat: 50,
    steuerMonat: 50,
    nettoRenteMonat: 300,
    bruttoKapital: 0,
    steuerKapital: 0,
    nettoKapital: 0,
    ...over,
  };
}

describe('Vertrags-TUEV: Einzahlphase', () => {
  it('rechnet bei einem privaten Vertrag den vollen Beitrag als Aufwand', () => {
    // Aus versteuertem Geld: keine Ersparnis, kein Zuschuss, keine Zulage.
    const r = vertragsTuev(vertrag({ typ: 'prvRente' }), annahmen(), kontext(), szenario, p);
    expect(r.echterAufwandMonat).toBeCloseTo(200, 6);
    expect(r.steuerersparnisMonat).toBe(0);
    expect(r.svErsparnisMonat).toBe(0);
    expect(r.summeEinzahlung).toBeCloseTo(200 * 12 * 16, 4);
  });

  it('senkt den Aufwand einer bAV um Steuer- UND SV-Ersparnis', () => {
    const r = vertragsTuev(vertrag({ typ: 'bav', schicht: 2 }), annahmen(), kontext(), szenario, p);
    expect(r.svErsparnisMonat).toBeGreaterThan(0);
    expect(r.steuerersparnisMonat).toBeGreaterThan(0);
    expect(r.echterAufwandMonat).toBeLessThan(200);
    expect(r.echterAufwandMonat).toBeCloseTo(
      200 - r.steuerersparnisMonat - r.svErsparnisMonat, 6,
    );
  });

  it('gewaehrt oberhalb beider Beitragsbemessungsgrenzen keine SV-Ersparnis mehr', () => {
    // Befund: Der Prototyp rechnete die Ersparnis auch oberhalb der BBG an.
    const hoch = kontext({ jahresbrutto: p.bbgRvJahr + 20_000, zveHeute: 90_000 });
    const r = vertragsTuev(vertrag({ typ: 'bav', schicht: 2 }), annahmen(), hoch, szenario, p);
    expect(r.svErsparnisMonat).toBe(0);
    expect(r.hinweise.join(' ')).toContain('Beitragsbemessungsgrenzen');
  });

  it('rechnet den Arbeitgeberzuschuss gegen den eigenen Aufwand', () => {
    const ohne = vertragsTuev(vertrag({ typ: 'bav', schicht: 2 }), annahmen(), kontext(), szenario, p);
    const mit = vertragsTuev(
      vertrag({ typ: 'bav', schicht: 2 }), annahmen({ agZuschussMonat: 50 }), kontext(), szenario, p,
    );
    expect(mit.agZuschussMonat).toBeCloseTo(50, 6);
    expect(mit.echterAufwandMonat).toBeLessThan(ohne.echterAufwandMonat);
  });

  it('beruecksichtigt Riester-Zulagen inklusive Kinderzulage', () => {
    const ohneKind = vertragsTuev(vertrag({ typ: 'riester', schicht: 2 }), annahmen(), kontext(), szenario, p);
    const mitKind = vertragsTuev(
      vertrag({ typ: 'riester', schicht: 2 }),
      annahmen({ kinder: [{ geburtsjahr: 2020 }] }),
      kontext(), szenario, p,
    );
    expect(ohneKind.zulageMonat).toBeGreaterThan(0);
    expect(mitKind.zulageMonat).toBeGreaterThan(ohneKind.zulageMonat);
  });

  it('meldet gekuerzte Riester-Zulagen bei zu geringem Eigenbeitrag', () => {
    // Befund C9: Der Prototyp kannte die Kuerzung nicht.
    // 4 % von 54 000 = 2160 EUR Mindesteigenbeitrag; 20 EUR/Monat = 240 EUR
    // liegen deutlich darunter.
    const knapp = vertragsTuev(
      vertrag({ typ: 'riester', schicht: 2 }), annahmen({ beitragMonat: 20 }), kontext(), szenario, p,
    );
    expect(knapp.zulagenGekuerzt).toBe(true);

    const voll = vertragsTuev(
      vertrag({ typ: 'riester', schicht: 2 }), annahmen({ beitragMonat: 200 }), kontext(), szenario, p,
    );
    expect(voll.zulagenGekuerzt).toBe(false);
  });
});

describe('Vertrags-TUEV: Kennzahlen', () => {
  it('berechnet den Netto-Hebel als Verhaeltnis der Summen', () => {
    const r = vertragsTuev(vertrag(), annahmen(), kontext(), szenario, p);
    expect(r.nettoHebel).toBeCloseTo(r.summeAuszahlung / r.summeEinzahlung, 9);
    // 18 Rentenjahre * 300 EUR gegen 16 Jahre * 200 EUR
    expect(r.summeAuszahlung).toBeCloseTo(300 * 12 * 18, 4);
  });

  it('weist ein Verlustgeschaeft als solches aus', () => {
    const mager = kontext({ nettoRenteMonat: 50 });
    const r = vertragsTuev(vertrag(), annahmen(), mager, szenario, p);
    expect(r.nettoHebel).toBeLessThan(1);
    expect(r.echterGewinn).toBeLessThan(0);
    expect(r.hinweise.join(' ')).toContain('weniger heraus');
  });

  it('liefert eine positive Rendite, wenn mehr herauskommt als hinein', () => {
    const r = vertragsTuev(vertrag(), annahmen(), kontext(), szenario, p);
    expect(r.nettoHebel).toBeGreaterThan(1);
    expect(r.rendite).toBeGreaterThan(0);
    expect(r.rendite).toBeLessThan(0.5);
  });

  it('setzt die Rendite so an, dass der Kapitalwert null wird', () => {
    // Gegenprobe: Mit der gemeldeten Rendite abgezinst muessen sich
    // Ein- und Auszahlungen aufheben.
    const r = vertragsTuev(vertrag(), annahmen(), kontext(), szenario, p);
    const z = r.rendite;
    let npv = 0;
    for (let t = 1; t <= r.jahreEinzahlung; t++) npv -= (200 * 12) / Math.pow(1 + z, t);
    for (let t = 1; t <= r.jahreAuszahlung; t++) npv += (300 * 12) / Math.pow(1 + z, r.jahreEinzahlung + t);
    expect(Math.abs(npv)).toBeLessThan(1);
  });

  it('nennt die Amortisationsdauer in Rentenjahren', () => {
    const r = vertragsTuev(vertrag(), annahmen(), kontext(), szenario, p);
    expect(r.amortisationsJahre).toBeCloseTo(r.summeEinzahlung / (300 * 12), 6);
  });

  it('warnt, wenn die Amortisation hinter der Lebenserwartung liegt', () => {
    const r = vertragsTuev(vertrag(), annahmen(), kontext({ nettoRenteMonat: 120 }), szenario, p);
    expect(r.amortisationsJahre).toBeGreaterThan(r.jahreAuszahlung);
    expect(r.hinweise.join(' ')).toContain('Lebenserwartung');
  });

  it('behandelt eine Kapitalauszahlung als Einmalbetrag am Ende', () => {
    const r = vertragsTuev(
      vertrag({ typ: 'prvKapital' }), annahmen(),
      kontext({ nettoRenteMonat: 0, nettoKapital: 80_000 }), szenario, p,
    );
    expect(r.summeAuszahlung).toBe(80_000);
    expect(r.amortisationsJahre).toBe(0);
  });
});

describe('Rente oder Kapital', () => {
  it('nennt das Break-Even-Alter ohne Verzinsung', () => {
    // 60 000 EUR Kapital gegen 500 EUR Rente = 120 Monate = 10 Jahre
    const r = renteOderKapital(500, 60_000, 67);
    expect(r.breakEvenOhneZins).toBeCloseTo(77, 6);
  });

  it('verschiebt das Break-Even-Alter durch Verzinsung nach hinten', () => {
    const r = renteOderKapital(500, 60_000, 67);
    expect(r.breakEvenMitZins).toBeGreaterThan(r.breakEvenOhneZins);
    expect(r.kapitalTraegtSichSelbst).toBe(false);
  });

  it('erkennt, wenn der Kapitalertrag die Rente allein traegt', () => {
    // 2 % auf 600 000 EUR sind 1000 EUR im Monat — mehr als die Rente.
    const r = renteOderKapital(800, 600_000, 67);
    expect(r.kapitalTraegtSichSelbst).toBe(true);
    expect(r.breakEvenMitZins).toBe(Infinity);
  });
});

describe('Vertrags-TUEV: Auszahlseite stimmt mit dem Kassenbon ueberein', () => {
  // Befund: Der TUEV kannte frueher nur das fertige Netto. Die Herleitung
  // Brutto minus KV/PV minus Steuer fehlte, und damit die Gegenueberstellung
  // von Netto-Aufwand und Netto-Rente. Jetzt kommt die ganze Auszahlseite aus
  // demselben Projektionsposten, den auch der Kassenbon anzeigt — dieser Test
  // haelt fest, dass beide Stellen der App nicht auseinanderlaufen koennen.
  const prv: Vertrag = {
    id: 'v1', inhaber: 'A', schicht: 3, typ: 'prvRente', name: 'Rente',
    brutto: 500, strategie: 'rente', altvertrag: false,
  };
  const mitVertrag: Szenario = { ...szenario, vertraege: [prv] };

  const proj = projiziere(mitVertrag);
  const zeile = proj.zeilen.find((z) => z.jahr === 2042)!;
  const posten = zeile.posten.find((x) => x.id === 'v1')!;

  const k = kontext({
    bruttoRenteMonat: posten.bruttoJahr / 12,
    kvPvMonat: posten.kvPvJahr / 12,
    steuerMonat: posten.steuerJahr / 12,
    nettoRenteMonat: posten.nettoJahr / 12,
  });

  it('reicht Brutto, KV/PV und Steuer unveraendert durch', () => {
    const r = vertragsTuev(prv, annahmen(), k, mitVertrag, p);
    expect(r.bruttoRenteMonat).toBeCloseTo(posten.bruttoJahr / 12, 6);
    expect(r.kvPvMonat).toBeCloseTo(posten.kvPvJahr / 12, 6);
    expect(r.steuerMonat).toBeCloseTo(posten.steuerJahr / 12, 6);
    expect(r.nettoRenteMonat).toBeCloseTo(posten.nettoJahr / 12, 6);
  });

  it('die angezeigte Herleitung geht auf: Brutto minus Abzuege ergibt das Netto', () => {
    const r = vertragsTuev(prv, annahmen(), k, mitVertrag, p);
    expect(r.bruttoRenteMonat - r.kvPvMonat - r.steuerMonat).toBeCloseTo(r.nettoRenteMonat, 6);
    expect(r.bruttoRenteMonat).toBeGreaterThan(r.nettoRenteMonat);
  });
});

describe('Vertrags-TUEV: Altersvorsorgedepot', () => {
  // Befund: Ein Altersvorsorgedepot fiel im TUEV in den Zweig "aus
  // versteuertem Geld" — ohne Zulagen und ohne Steuervorteil. Der Vertrag
  // stand damit erheblich zu schlecht da.
  const avd = vertrag({ typ: 'avd', schicht: 2, name: 'Altersvorsorgedepot' });
  // Das Altersvorsorgedepot gibt es erst ab 2027 — ein frueherer Beginn
  // ergibt zu Recht keine Zulage.
  const avdAnnahmen = (over: Partial<TuevAnnahmen> = {}) =>
    annahmen({ beitragMonat: 150, beginnJahr: 2027, ...over });

  it('rechnet die Zulagen an', () => {
    const r = vertragsTuev(avd, avdAnnahmen(), kontext(), szenario, p);
    expect(r.zulageMonat).toBeCloseTo(540 / 12, 6);
  });

  it('senkt den Aufwand um die Steuerersparnis — nicht um die Zulagen', () => {
    // Die Zulagen fliessen in den Vertrag, nicht aus der eigenen Tasche. Der
    // Aufwand sinkt deshalb nur um die Steuerersparnis, genau wie im
    // Riester-Zweig direkt darueber.
    const r = vertragsTuev(avd, avdAnnahmen(), kontext(), szenario, p);
    expect(r.echterAufwandMonat).toBeLessThan(150);
    expect(r.echterAufwandMonat).toBeCloseTo(150 - r.steuerersparnisMonat, 6);
    expect(r.zulageMonat).toBeGreaterThan(0);
  });

  it('gibt den Steuervorteil nur, soweit er die Zulagen uebersteigt', () => {
    // Guenstigerpruefung: bei kleinem zvE bleibt es bei der blossen Zulage.
    const klein = vertragsTuev(
      avd, avdAnnahmen(), kontext({ zveHeute: 8_000 }), szenario, p,
    );
    expect(klein.steuerersparnisMonat).toBe(0);

    const gross = vertragsTuev(
      avd, avdAnnahmen(), kontext({ zveHeute: 90_000 }), szenario, p,
    );
    expect(gross.steuerersparnisMonat).toBeGreaterThan(0);
  });

  it('zahlt den Berufseinsteigerbonus nur einmal ueber die Laufzeit', () => {
    // Rentenbeginn 2042, Beginn 2026, Alter dort 51 — kein Bonus.
    const alt = vertragsTuev(avd, avdAnnahmen(), kontext(), szenario, p);
    // Dieselbe Person 30 Jahre juenger: Bonus genau im ersten Jahr.
    const jung = vertragsTuev(
      avd, avdAnnahmen(),
      kontext({ alterBeiRentenbeginn: 37 }), szenario, p,
    );
    expect(alt.zulageMonat).toBeCloseTo(540 / 12, 6);
    expect(jung.zulageMonat).toBeCloseTo((540 + 200) / 12, 6);
  });
});

describe('Gegenprobe: TUEV und Landingpage rechnen dieselbe Zulage', () => {
  // Beide Stellen der Anwendung bewerten denselben Vertrag. Laufen sie
  // auseinander, glaubt der Nutzer zu Recht keiner von beiden.
  it('gleiche Kinder, gleicher Beitrag, gleiche Zulage im ersten Jahr', () => {
    const kinderGeburtsjahre = [2015, 2022];
    const beitragMonat = 150;

    const ausTuev = vertragsTuev(
      vertrag({ typ: 'avd', schicht: 2 }),
      annahmen({
        beitragMonat,
        beginnJahr: 2027,
        kinder: kinderGeburtsjahre.map((geburtsjahr) => ({ geburtsjahr })),
      }),
      kontext(),
      szenario,
      p,
    );

    const ausSeite = avdProfitabilitaet(
      {
        beitragMonat, jahre: 15, kinderGeburtsjahre,
        alterHeute: 40, startjahr: 2027, zveHeute: 40_000, endkapital: 50_000,
        bruttoRenteJahr: 3_000, steuerRenteJahr: 800, jahreAuszahlung: 18,
        bruttoEinmal: 0, steuerEinmal: 0,
      },
      { verheiratet: false, bundesland: 'Nordrhein-Westfalen', kirchensteuerpflichtig: false },
      p,
    );

    expect(ausTuev.zulageMonat).toBeCloseTo(ausSeite.zulageMonat, 6);
    // 540 Grundzulage plus zweimal 300 Kinderzulage
    expect(ausTuev.zulageMonat * 12).toBeCloseTo(1140, 4);
  });
});
