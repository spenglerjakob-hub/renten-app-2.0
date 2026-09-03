import { PKV_VORGABE } from '../src/social/pkv.js';
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
    hatKinder: false, kinderUnter25: 0, kinder: [], kvStatus: 'kvdr', kvErwerb: 'gesetzlich', pkv: PKV_VORGABE,
    zielNettoHeute: 2000,
  },
  annahmen: { inflation: 0.02, rentendynamik: 0.02, tarifIndex: 0, gehaltsdynamik: 0.02 },
  einkommenHeute: {
    modus: 'brutto', betrag: 4500, auszahlungen: 12,
    besoldungsgruppe: 'A13', besoldungsstufe: 4, besoldungsland: 'Bund',
    grvPflicht: false, grvBeitragMonat: 0,
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
    beamter: false,
    privatVersichert: false,
    pkvPraemieMonat: 0,
    selbststaendig: false,
    grvBeitragJahr: 0,
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
    const kinderListe = [{ geburtsjahr: 2015 }, { geburtsjahr: 2022 }];
    const beitragMonat = 150;

    // Die Kinder stehen im HAUSHALT, nicht an der TUEV-Position: das
    // Altersvorsorgedepot liest sie aus derselben Quelle wie die Zeitachse.
    // Stuende hier weiter `annahmen({ kinder })`, waere die Kinderzulage
    // stillschweigend null — genau der Fehler, der gemeldet wurde.
    const ausTuev = vertragsTuev(
      vertrag({ typ: 'avd', schicht: 2 }),
      annahmen({ beitragMonat, beginnJahr: 2027 }),
      kontext(),
      { ...szenario, haushalt: { ...szenario.haushalt, kinder: kinderListe } },
      p,
    );

    const ausSeite = avdProfitabilitaet(
      {
        beitragMonat, jahre: 15, kinder: kinderListe,
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

describe('Zulagen: Aufschluesselung und gemeinsame Quelle', () => {
  const kinderListe = [{ geburtsjahr: 2015 }, { geburtsjahr: 2022 }];
  const mitKindern = {
    ...szenario,
    haushalt: { ...szenario.haushalt, kinder: kinderListe, hatKinder: true, kinderUnter25: 2 },
  };

  const tuevAvd = (s: Szenario) => vertragsTuev(
    vertrag({ typ: 'avd', schicht: 2 }),
    annahmen({ beitragMonat: 150, beginnJahr: 2027 }),
    kontext(),
    s,
    p,
  );

  it('die Einzelposten ergeben genau die Summe — sonst luegt die Anzeige', () => {
    // Die Oberflaeche zeigt Grundzulage und Kinderzulage getrennt und den
    // Bonus als eigene Zeile. Ergeben sie zusammen nicht zulageMonat, steht
    // auf dem Bildschirm eine Rechnung, die nicht aufgeht.
    const r = tuevAvd(mitKindern);
    const d = r.zulageDetail;
    if (!d) throw new Error('zulageDetail fehlt');
    expect(d.grundzulageMonat + d.kinderzulageMonat + d.bonusMonat)
      .toBeCloseTo(r.zulageMonat, 8);
  });

  it('die Kinder kommen aus dem Haushalt, nicht von der TUEV-Position', () => {
    // Ohne Kinder im Haushalt gibt es keine Kinderzulage — auch dann nicht,
    // wenn an der Position welche eingetragen sind. Genau das war der
    // gemeldete Fehler: im TUEV blieb die Kinderzulage immer null.
    const ausHaushalt = tuevAvd(mitKindern).zulageDetail;
    expect(ausHaushalt?.kinderzulageMonat).toBeGreaterThan(0);
    expect(ausHaushalt?.kinderMitAnspruch).toBe(2);

    const nurAnDerPosition = vertragsTuev(
      vertrag({ typ: 'avd', schicht: 2 }),
      annahmen({ beitragMonat: 150, beginnJahr: 2027, kinder: kinderListe }),
      kontext(),
      szenario,
      p,
    );
    expect(nurAnDerPosition.zulageDetail?.kinderzulageMonat).toBe(0);
  });

  it('Riester liest weiter die Kinder der TUEV-Position', () => {
    // Regressionsschutz: Riester wurde bewusst NICHT umgestellt.
    const mit = vertragsTuev(
      vertrag({ typ: 'riester', schicht: 2 }),
      annahmen({ beitragMonat: 150, beginnJahr: 2027, kinder: kinderListe }),
      kontext(),
      szenario,
      p,
    );
    const ohne = vertragsTuev(
      vertrag({ typ: 'riester', schicht: 2 }),
      annahmen({ beitragMonat: 150, beginnJahr: 2027 }),
      kontext(),
      szenario,
      p,
    );
    expect(mit.zulageMonat).toBeGreaterThan(ohne.zulageMonat);
    // Riester bekommt keine Aufschluesselung — Stufen und Bonus gibt es dort nicht.
    expect(mit.zulageDetail).toBeUndefined();
  });

  it('TUEV und Vertragsblatt zeigen dieselbe Zulage', () => {
    // Zwei Ansichten derselben Zahl. Laufen sie auseinander, glaubt der
    // Nutzer zu Recht keiner von beiden.
    const v = vertrag({ typ: 'avd', schicht: 2 });
    const proj = projiziere({
      ...mitKindern,
      vertraege: [{ ...v, monatsbeitrag: 150, renditeAnsparphase: 0.06, ter: 0.002 }],
    });
    const lauf = proj.avd[0];
    if (!lauf) throw new Error('kein AVD-Lauf');

    const d = tuevAvd(mitKindern).zulageDetail;
    if (!d) throw new Error('zulageDetail fehlt');
    expect(d.grundzulageMonat * 12).toBeCloseTo(lauf.grundzulageJahr1, 4);
    expect(d.kinderzulageMonat * 12).toBeCloseTo(lauf.kinderzulageJahr1, 4);
  });

  it('der echte Aufwand enthaelt die Zulage NICHT', () => {
    // Bewusste Entscheidung: "Kostet Sie wirklich" ist, was aus der eigenen
    // Tasche geht. Die Zulage kommt vom Staat und steht auf der Habenseite.
    // Festgehalten, damit das nicht spaeter als Fehler "korrigiert" wird —
    // deshalb steht sie in der Anzeige auch in einem eigenen Kasten.
    const r = tuevAvd(mitKindern);
    expect(r.zulageMonat).toBeGreaterThan(0);
    expect(r.echterAufwandMonat).toBeGreaterThan(r.beitragMonat - r.zulageMonat);
  });
});

describe('Ansparphase: die gesetzlichen Grenzen', () => {
  // BEFUND: Der TUEV rechnete Steuer- und SV-Ersparnis auf den vollen
  // Beitrag. Bei 1.000 EUR im Monat wies er dadurch einen um rund 280 EUR zu
  // niedrigen Aufwand aus — die bAV sah deutlich besser aus, als sie ist.
  const bav = (beitragMonat: number, typ: 'bav' | 'bavUkasse' = 'bav', k = kontext()) =>
    vertragsTuev(
      vertrag({ typ, schicht: 2 }),
      annahmen({ beitragMonat }),
      k,
      szenario,
      p,
    );

  const svGrenzeMonat = (0.04 * p.bbgRvJahr) / 12;   // 338 EUR
  const stGrenzeMonat = (0.08 * p.bbgRvJahr) / 12;   // 676 EUR

  it('§ 3 Nr. 63: die SV-Ersparnis endet bei 4 % der Beitragsbemessungsgrenze', () => {
    const drunter = bav(200);
    const genau = bav(Math.floor(svGrenzeMonat));
    const drueber = bav(1000);

    // Unterhalb der Grenze waechst sie mit dem Beitrag …
    expect(genau.svErsparnisMonat).toBeGreaterThan(drunter.svErsparnisMonat);
    // … darueber nicht mehr. Das war der Fehler.
    expect(drueber.svErsparnisMonat).toBeCloseTo(genau.svErsparnisMonat, 0);
  });

  it('§ 3 Nr. 63: die Steuerersparnis endet bei 8 % der Beitragsbemessungsgrenze', () => {
    const anDerGrenze = bav(Math.floor(stGrenzeMonat));
    const weitDarueber = bav(2000);
    expect(weitDarueber.steuerersparnisMonat).toBeCloseTo(anDerGrenze.steuerersparnisMonat, 0);
  });

  it('der Aufwand steigt oberhalb der Grenzen fast im Gleichschritt mit dem Beitrag', () => {
    // Von 1.000 auf 2.000 EUR kommt keine Foerderung mehr dazu: die zweiten
    // 1.000 EUR kosten praktisch voll. Vorher stieg der Aufwand nur um 362.
    const tausend = bav(1000);
    const zweitausend = bav(2000);
    expect(zweitausend.echterAufwandMonat - tausend.echterAufwandMonat)
      .toBeGreaterThan(950);
  });

  it('warnt, wenn der Beitrag ueber den Grenzen liegt', () => {
    const text = bav(1000).hinweise.join(' ');
    expect(text).toContain('beitragsfrei');
    expect(text).toContain('Steuerfrei');
  });

  it('Unterstuetzungskasse: steuerfrei ohne Grenze, beitragsfrei nur bis 4 %', () => {
    // § 3 Nr. 63 gilt nur fuer Direktversicherung, Pensionskasse und
    // Pensionsfonds. Die U-Kasse ist unbegrenzt lohnsteuerfrei.
    const direkt = bav(1000, 'bav');
    const ukasse = bav(1000, 'bavUkasse');
    expect(ukasse.steuerersparnisMonat).toBeGreaterThan(direkt.steuerersparnisMonat);
    expect(ukasse.svErsparnisMonat).toBeCloseTo(direkt.svErsparnisMonat, 6);
  });

  it('Beamte sparen mit einer Entgeltumwandlung keine Sozialabgaben', () => {
    const r = bav(200, 'bav', kontext({ beamter: true }));
    expect(r.svErsparnisMonat).toBe(0);
    expect(r.hinweise.join(' ')).toContain('Beamter');
  });

  it('§ 10 Abs. 3: der Ruerup-Abzug endet am Hoechstbetrag', () => {
    // Der Hoechstbetrag ist zuerst durch die Beitraege zur gesetzlichen
    // Rentenversicherung verbraucht — Arbeitnehmer- UND Arbeitgeberanteil.
    const verbraucht = Math.min(54_000, p.bbgRvJahr) * p.rvSatzGesamt;
    const rahmenMonat = (p.hoechstbetragAltersvorsorge - verbraucht) / 12;

    const ruerup = (beitragMonat: number) => vertragsTuev(
      vertrag({ typ: 'basis', schicht: 1 }),
      annahmen({ beitragMonat }),
      kontext(),
      szenario,
      p,
    );

    // Unterhalb des Rahmens wirkt der volle Beitrag.
    const drunter = ruerup(Math.floor(rahmenMonat * 0.5));
    expect(drunter.steuerersparnisMonat).toBeGreaterThan(0);

    // Darueber kommt nichts mehr dazu.
    const anDerGrenze = ruerup(Math.floor(rahmenMonat));
    const weitDarueber = ruerup(Math.floor(rahmenMonat * 2));
    expect(weitDarueber.steuerersparnisMonat).toBeCloseTo(anDerGrenze.steuerersparnisMonat, 0);
    expect(weitDarueber.hinweise.join(' ')).toContain('Höchstbetrag');
  });

  it('Ruerup: kleine Beitraege bleiben unveraendert voll abziehbar', () => {
    // Schutz gegen eine Ueberkorrektur: wer 200 EUR im Monat einzahlt, liegt
    // weit unter dem Rahmen und darf nichts verlieren.
    const r = vertragsTuev(
      vertrag({ typ: 'basis', schicht: 1 }),
      annahmen({ beitragMonat: 200 }),
      kontext(),
      szenario,
      p,
    );
    expect(r.echterAufwandMonat).toBeLessThan(200);
    expect(r.hinweise.join(' ')).not.toContain('Höchstbetrag');
  });
});

describe('Auszahldauer: Auszahlplan gegen lebenslange Rente', () => {
  it('eine lebenslange Rente laeuft bis zur Lebenserwartung', () => {
    const r = vertragsTuev(vertrag({ typ: 'prvRente' }), annahmen(), kontext(), szenario, p);
    expect(r.jahreAuszahlung).toBe(18);   // 85 − 67
  });

  it('ein Auszahlplan endet mit seiner Laufzeit, nicht mit dem Leben', () => {
    // Zehn Jahre Verrentung sind nach zehn Jahren zu Ende. Wer bis 85 rechnet,
    // schreibt dem Vertrag acht Jahre Zahlungen zu, die es nicht gibt — und
    // die Rendite faellt entsprechend zu hoch aus.
    const bei = (entnahmedauer: number) => vertragsTuev(
      vertrag({ typ: 'bavKapital', entnahmedauer }), annahmen(), kontext(), szenario, p,
    );
    const kurz = bei(10);
    const lang = bei(18);

    expect(kurz.jahreAuszahlung).toBe(10);
    expect(lang.jahreAuszahlung).toBe(18);
    expect(kurz.summeAuszahlung).toBeLessThan(lang.summeAuszahlung);
    expect(kurz.rendite).toBeLessThan(lang.rendite);
  });

  it('ein Auszahlplan ueber die Lebenserwartung hinaus zaehlt nur bis dorthin', () => {
    // Was nach dem Tod ausgezahlt wuerde, kommt beim Vertragsinhaber nicht an.
    const r = vertragsTuev(
      vertrag({ typ: 'bavKapital', entnahmedauer: 30 }), annahmen(), kontext(), szenario, p,
    );
    expect(r.jahreAuszahlung).toBe(18);
  });

  it('gilt auch fuer Depot und Altersvorsorgedepot', () => {
    for (const typ of ['etf', 'avd'] as const) {
      const r = vertragsTuev(
        vertrag({ typ, entnahmedauer: 12 }), annahmen(), kontext(), szenario, p,
      );
      expect(r.jahreAuszahlung, typ).toBe(12);
    }
  });
});

/* ------------------------------------------------------------------ */

describe('Entgeltumwandlung bei privater Krankenversicherung', () => {
  const bav = (k: TuevKontext, beitragMonat = 200) =>
    vertragsTuev(
      vertrag({ typ: 'bav', schicht: 2 }),
      annahmen({ beitragMonat }),
      k,
      szenario,
      p,
    );

  /** Weit unter beiden Beitragsbemessungsgrenzen. */
  const brutto = 54_000;

  it('rechnet privat Versicherten keine KV/PV-Ersparnis an', () => {
    /*
      DER GEMELDETE BEFUND: Die Ersparnis war fuer jeden Nicht-Beamten gleich,
      `kvStatus` wurde gar nicht gelesen. Eine private Praemie haengt aber am
      Vertrag, nicht am Gehalt.
    */
    const gkv = bav(kontext({ jahresbrutto: brutto }));
    const pkv = bav(kontext({
      jahresbrutto: brutto, privatVersichert: true, pkvPraemieMonat: 600,
    }));
    expect(pkv.svErsparnisMonat).toBeLessThan(gkv.svErsparnisMonat);
  });

  /*
    ENTSCHEIDEND IST NICHT DIE BEITRAGSBEMESSUNGSGRENZE, sondern welcher der
    beiden Deckel des § 257 SGB V greift. Der Zuschuss ist das Kleinere aus
    "halber Beitragssatz auf das Entgelt" und "halbe Praemie". Nur solange die
    gehaltsbezogene Groesse die kleinere ist, bewegt er sich mit einer
    Umwandlung — und das ist er, wenn die Praemie mehr als rund 21 % des
    Monatsbruttos ausmacht.
  */
  it('laesst den Zuschuss unberuehrt, solange er am Praemiendeckel haengt', () => {
    // 600 EUR Praemie auf 4 500 EUR Monatsbrutto: der Praemiendeckel greift,
    // der Zuschuss ruehrt sich nicht. Der haeufigere Fall.
    const r = bav(kontext({
      jahresbrutto: brutto, privatVersichert: true, pkvPraemieMonat: 600,
    }));
    const nurRvAv = 200 * (p.rvSatzGesamt / 2 + p.avSatzGesamt / 2);
    expect(r.svErsparnisMonat).toBeCloseTo(nurRvAv, 6);
  });

  it('verliert bei hoher Praemie den Arbeitgeberzuschuss mit', () => {
    // 800 EUR Praemie auf 3 333 EUR Monatsbrutto — eine Familienpraemie auf
    // mittlerem Gehalt. Jetzt bemisst sich der Zuschuss am Entgelt und sinkt
    // mit: 10,55 % verlorener Zuschuss gegen 10,60 % RV/AV, es bleiben Cent.
    const r = bav(kontext({
      jahresbrutto: 40_000, zveHeute: 30_000,
      privatVersichert: true, pkvPraemieMonat: 800,
    }));
    expect(Math.abs(r.svErsparnisMonat)).toBeLessThan(1);
    expect(r.hinweise.join(' ')).toContain('§ 257 SGB V');
  });

  it('behaelt sonst die vollen RV/AV-Anteile', () => {
    const hoch = kontext({
      jahresbrutto: p.bbgKvJahr + 15_000, zveHeute: 80_000,
      privatVersichert: true, pkvPraemieMonat: 900,
    });
    const r = bav(hoch);
    const erwartet = 200 * (p.rvSatzGesamt / 2 + p.avSatzGesamt / 2);
    expect(r.svErsparnisMonat).toBeCloseTo(erwartet, 6);
  });

  it('nennt den Grund im Hinweis', () => {
    const r = bav(kontext({
      jahresbrutto: p.bbgKvJahr + 15_000, zveHeute: 80_000,
      privatVersichert: true, pkvPraemieMonat: 900,
    }));
    expect(r.hinweise.join(' ')).toContain('privat krankenversichert');
    // Ohne bewegten Zuschuss darf der zweite Hinweis NICHT erscheinen.
    expect(r.hinweise.join(' ')).not.toContain('§ 257 SGB V');
  });

  it('laesst einen Beamten bei null, ob privat versichert oder nicht', () => {
    for (const privatVersichert of [true, false]) {
      const r = bav(kontext({ beamter: true, privatVersichert, pkvPraemieMonat: 400 }));
      expect(r.svErsparnisMonat, String(privatVersichert)).toBe(0);
    }
  });
});

describe('Beitragsbemessungsgrenze: der Teil darunter zaehlt', () => {
  const bav = (jahresbrutto: number, beitragMonat: number) =>
    vertragsTuev(
      vertrag({ typ: 'bav', schicht: 2 }),
      annahmen({ beitragMonat }),
      kontext({ jahresbrutto, zveHeute: jahresbrutto * 0.75 }),
      szenario,
      p,
    );

  it('springt an der Grenze nicht mehr auf null', () => {
    /*
      BEFUND: `jahresbrutto < bbg` entschied ueber das VOLLE Gehalt. Wer knapp
      darueber lag, bekam gar keine KV/PV-Ersparnis — obwohl die Umwandlung
      ihn darunter bringt.
    */
    const beitrag = 300;                       // 3 600 EUR im Jahr
    const knappDrueber = bav(p.bbgKvJahr + 1_200, beitrag);
    const klarDrunter = bav(p.bbgKvJahr - 20_000, beitrag);
    const klarDrueber = bav(p.bbgKvJahr + 40_000, beitrag);

    // Ein Teil der Umwandlung liegt unter der Grenze, also zaehlt er auch.
    expect(knappDrueber.svErsparnisMonat).toBeGreaterThan(klarDrueber.svErsparnisMonat);
    // Aber nicht so viel wie bei jemandem, der ganz darunter liegt.
    expect(knappDrueber.svErsparnisMonat).toBeLessThan(klarDrunter.svErsparnisMonat);
  });

  it('aendert an den klaren Faellen nichts', () => {
    // Regressionsprobe: weit unter beiden Grenzen bleibt es beim vollen Satz.
    const r = bav(54_000, 200);
    const voll = 200 * (
      p.kv.allgemeinerSatz / 2 + p.kv.zusatzbeitrag / 2 + p.pv.satz / 2
      + p.rvSatzGesamt / 2 + p.avSatzGesamt / 2
    );
    expect(r.svErsparnisMonat).toBeCloseTo(voll, 6);
  });
});

/* ------------------------------------------------------------------ */

describe('Selbstständige im Vertrags-TÜV', () => {
  const selbst = (over: Partial<TuevKontext> = {}) =>
    kontext({ selbststaendig: true, grvBeitragJahr: 0, ...over });

  const pruefe = (
    typ: 'basis' | 'bav' | 'riester' | 'avd',
    k: TuevKontext,
    beitragMonat = 300,
  ) =>
    vertragsTuev(
      vertrag({ typ, schicht: typ === 'basis' ? 1 : 2 }),
      // Das Altersvorsorgedepot gibt es erst ab 2027; vorher waeren die
      // Zulagen null, und der Test pruefte nichts.
      annahmen({ beitragMonat, beginnJahr: typ === 'avd' ? 2027 : 2026 }),
      k, szenario, p,
    );

  it('gibt der Basisrente den vollen Höchstbetrag, wenn keine GRV-Beiträge fließen', () => {
    /*
      BEFUND: `min(brutto, bbgRv) × 18,6 %` unterstellte JEDEM, sein
      Hoechstbetrag sei durch Arbeitnehmer- UND Arbeitgeberbeitraege belegt.
      Ein Selbststaendiger ohne Rentenversicherungspflicht hat gar nichts
      verbraucht — genau deshalb ist die Basisrente sein klassisches Produkt.
    */
    /*
      Der Beitrag muss GROSS genug sein, um den Unterschied zu zeigen: bei
      54 000 EUR Gehalt sind vom Hoechstbetrag noch gut 20 000 EUR frei, ein
      kleiner Beitrag passt bei beiden hinein und ergibt dieselbe Zahl. Erst
      oberhalb dieser Grenze trennt sich der Selbststaendige ab.
    */
    const alsSelbst = pruefe('basis', selbst(), 2_000);
    const alsAngestellter = pruefe('basis', kontext(), 2_000);
    expect(alsSelbst.steuerersparnisMonat).toBeGreaterThan(alsAngestellter.steuerersparnisMonat);
    expect(alsSelbst.hinweise.join(' ')).toContain('§ 10 Abs. 3 EStG');
  });

  it('zieht den eigenen GRV-Beitrag vom Höchstbetrag ab', () => {
    const ohne = pruefe('basis', selbst(), 2_000);
    const mit = pruefe('basis', selbst({ grvBeitragJahr: 20_000 }), 2_000);
    // Mit hohem eigenem Beitrag bleibt weniger Rahmen — also weniger Ersparnis.
    expect(mit.steuerersparnisMonat).toBeLessThanOrEqual(ohne.steuerersparnisMonat);
    // Und der Hinweis auf den vollen Rahmen entfaellt.
    expect(mit.hinweise.join(' ')).not.toContain('in voller Höhe');
  });

  it('weist bei der bAV keine Beitragsersparnis aus', () => {
    // Ohne Arbeitgeber laesst sich kein Entgelt umwandeln.
    const r = pruefe('bav', selbst());
    expect(r.svErsparnisMonat).toBe(0);
    expect(r.hinweise.join(' ')).toContain('kein Entgelt umwandeln');
  });

  it('rechnet ohne Rentenversicherungspflicht keine Riester-Zulagen an', () => {
    const r = pruefe('riester', selbst());
    expect(r.zulageMonat).toBe(0);
    expect(r.hinweise.join(' ')).toContain('§ 10a EStG');

    // Gegenprobe: ein Angestellter bekommt sie weiterhin.
    expect(pruefe('riester', kontext()).zulageMonat).toBeGreaterThan(0);
  });

  it('laesst die Förderung des Altersvorsorgedepots unberührt', () => {
    // Selbststaendige sind dort ab 2027 ausdruecklich foerderberechtigt.
    const alsSelbst = pruefe('avd', selbst());
    const alsAngestellter = pruefe('avd', kontext());
    expect(alsSelbst.zulageMonat).toBeCloseTo(alsAngestellter.zulageMonat, 6);
    expect(alsSelbst.zulageMonat).toBeGreaterThan(0);
    expect(alsSelbst.hinweise.join(' ')).toContain('förderberechtigt');
  });

  it('laesst Angestellte und Beamte unveraendert', () => {
    // Regressionsprobe: die vier Zweige duerfen sich nicht gegenseitig stoeren.
    for (const typ of ['basis', 'bav', 'riester', 'avd'] as const) {
      const angestellt = pruefe(typ, kontext());
      const beamter = pruefe(typ, kontext({ beamter: true }));
      expect(angestellt.echterAufwandMonat, typ).toBeGreaterThan(0);
      expect(beamter.svErsparnisMonat, typ).toBe(0);
    }
  });
});
