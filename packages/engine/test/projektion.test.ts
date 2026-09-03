import { PKV_VORGABE } from '../src/social/pkv.js';
import { describe, it, expect } from 'vitest';
import { projiziere } from '../src/projection/timeline.js';
import { ruhestandsfenster } from '../src/analyse/ruhestandsfenster.js';
import type { Szenario } from '../src/model.js';

function szenario(over: Partial<Szenario> = {}): Szenario {
  return {
    schemaVersion: 1,
    haushalt: {
      verheiratet: false, bundesland: 'Nordrhein-Westfalen', kirchensteuer: false,
      hatKinder: false, kinderUnter25: 0, kinder: [], kvStatus: 'kvdr', kvErwerb: 'gesetzlich', pkv: PKV_VORGABE,
      zielNettoHeute: 2000,
    },
    annahmen: { inflation: 0.02, rentendynamik: 0.02, tarifIndex: 0.02, gehaltsdynamik: 0.02 },
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
    ...over,
  };
}

describe('Projektion', () => {
  it('liefert eine Zeile je Kalenderjahr bis Alter 100', () => {
    const r = projiziere(szenario());
    expect(r.zeilen.length).toBeGreaterThanOrEqual(50);
    const jahre = r.zeilen.map((z) => z.jahr);
    expect(new Set(jahre).size).toBe(jahre.length);
  });

  it('friert den Rentenfreibetrag als EURO-Betrag ein', () => {
    const r = projiziere(szenario());
    expect(r.freibetraege).toHaveLength(1);
    const fb = r.freibetraege[0]!;
    expect(fb.art).toBe('rente');
    expect(fb.wert.jahresbetrag).toBeGreaterThan(0);
    // Rentenbeginn 2042 -> Besteuerungsanteil 92 %
    expect(fb.wert.besteuerungsanteil).toBeCloseTo(0.82 + (2042 - 2022) * 0.005, 6);
  });

  it('KERNKORREKTUR: das Netto waechst langsamer als das Brutto', () => {
    // Weil der Freibetrag nominal eingefroren bleibt, steigt der
    // steuerpflichtige Anteil jedes Jahr. Der Prototyp liess das Netto mit
    // derselben Rate wachsen wie das Brutto und ueberschaetzte spaetere
    // Jahre dadurch deutlich (Befund B1).
    const r = projiziere(szenario());
    const ruhestand = r.zeilen.filter((z) => z.vollstaendigImRuhestand && z.bruttoGesamt > 0);
    expect(ruhestand.length).toBeGreaterThan(20);

    const erst = ruhestand[0]!;
    const spaet = ruhestand[20]!;

    const bruttoWachstum = spaet.bruttoGesamt / erst.bruttoGesamt;
    const nettoWachstum = spaet.nettoGesamt / erst.nettoGesamt;

    expect(nettoWachstum).toBeLessThan(bruttoWachstum);
  });

  it('die Steuerquote steigt im Ruhestand an', () => {
    const r = projiziere(szenario());
    const ruhestand = r.zeilen.filter((z) => z.vollstaendigImRuhestand && z.bruttoGesamt > 0);
    const quote = (z: (typeof ruhestand)[number]) => z.steuerGesamt / z.bruttoGesamt;
    expect(quote(ruhestand[20]!)).toBeGreaterThan(quote(ruhestand[0]!));
  });

  it('weist fortgeschriebene Jahre als solche aus', () => {
    const r = projiziere(szenario());
    expect(r.rechtsstand.fortgeschriebenAb).toBe(2027);
    expect(r.rechtsstand.text).toContain('fortgeschrieben');
    expect(r.zeilen.some((z) => z.parameterFortgeschrieben)).toBe(true);
  });

  it('bildet die gemischte Phase ab, wenn Partner zu verschiedenen Zeiten in Rente gehen', () => {
    const s = szenario({
      haushalt: { ...szenario().haushalt, verheiratet: true },
      personen: [
        { ...szenario().personen[0]!, id: 'A', rentenbeginn: '2042-01-01' },
        { ...szenario().personen[0]!, id: 'B', name: 'Partner', geburtsdatum: '1980-01-01', rentenbeginn: '2047-01-01' },
      ],
    });
    const r = projiziere(s);
    const gemischt = r.zeilen.filter((z) => z.gemischtePhase);
    // 2042 bis 2046: A bezieht Rente, B arbeitet noch
    expect(gemischt.length).toBe(5);
    expect(gemischt[0]!.jahr).toBe(2042);
    // In dieser Phase gibt es sowohl Erwerbseinkommen als auch Rente
    const z = gemischt[0]!;
    expect(z.posten.some((x) => x.id === 'erwerb')).toBe(true);
    expect(z.posten.some((x) => x.id === 'person-A')).toBe(true);
  });

  it('Steuer und KV/PV summieren sich exakt auf die Postensumme', () => {
    const r = projiziere(szenario());
    for (const z of r.zeilen) {
      const netto = z.posten.reduce((s, x) => s + x.nettoJahr, 0);
      expect(z.nettoGesamt).toBeCloseTo(netto, 6);
      const brutto = z.posten.reduce((s, x) => s + x.bruttoJahr, 0);
      expect(z.bruttoGesamt).toBeCloseTo(brutto, 6);
    }
  });

  it('ist unabhaengig von der Reihenfolge der Vertraege', () => {
    const v = [
      { id: 'v1', inhaber: 'A' as const, schicht: 2 as const, typ: 'bav' as const, name: 'bAV', brutto: 300, strategie: 'rente' as const, altvertrag: false },
      { id: 'v2', inhaber: 'A' as const, schicht: 3 as const, typ: 'prvRente' as const, name: 'Privat', brutto: 200, strategie: 'rente' as const, altvertrag: false },
      { id: 'v3', inhaber: 'A' as const, schicht: 1 as const, typ: 'basis' as const, name: 'Ruerup', brutto: 250, strategie: 'rente' as const, altvertrag: false },
    ];
    const a = projiziere(szenario({ vertraege: v }));
    const b = projiziere(szenario({ vertraege: [...v].reverse() }));
    const jahrA = a.zeilen.find((z) => z.jahr === 2045)!;
    const jahrB = b.zeilen.find((z) => z.jahr === 2045)!;
    expect(jahrB.nettoGesamt).toBeCloseTo(jahrA.nettoGesamt, 6);
    expect(jahrB.steuerGesamt).toBeCloseTo(jahrA.steuerGesamt, 6);
  });

  it('meldet ungueltige Datumsangaben statt NaN zu produzieren', () => {
    const r = projiziere(szenario({
      personen: [{ ...szenario().personen[0]!, geburtsdatum: '99.99.9999' }],
    }));
    expect(r.zeilen).toHaveLength(0);
    expect(r.hinweise[0]).toContain('gueltiges');
  });
});

describe('Ruhestandsfenster fuer das Gutachten', () => {
  // Auf Papier ist die ganze Zeitachse unbrauchbar: rund 60 Balken werden zu
  // Haarstrichen. Gezeigt wird deshalb nur der Ruhestand.
  const mitRentenbeginn = (geburtsjahr: number, rentenjahr: number) => projiziere(szenario({
    personen: [{
      id: 'A', name: 'Test',
      geburtsdatum: `${geburtsjahr}-01-01`,
      rentenbeginn: `${rentenjahr}-01-01`,
      art: 'grv', grvBruttoHeute: 1800,
      besoldungsgruppe: 'A13', besoldungsstufe: 8, ruhegehaltssatz: 71.75,
      dienstbeginn: '2000-01-01', teilzeitphasen: [],
    }],
  }));

  it('beginnt bei 65, wenn die Rente spaeter anfaengt', () => {
    const e = (mitRentenbeginn(1990, 1990 + 67));
    const f = ruhestandsfenster(e);
    expect(f[0]!.alterA).toBe(65);
    expect(f[f.length - 1]!.alterA).toBe(95);
  });

  it('beginnt frueher, wenn die Rente frueher anfaengt', () => {
    // Genau der Fall, um den es bei einem vorgezogenen Rentenbeginn geht:
    // faengt das Fenster stur bei 65 an, fehlen die entscheidenden Jahre.
    const e = (mitRentenbeginn(1990, 1990 + 63));
    const f = ruhestandsfenster(e);
    expect(f[0]!.alterA).toBe(63);
  });

  it('zeigt keine Jahre, die es in der Zeitachse nicht gibt', () => {
    // Wer heute schon 70 ist, hat keine Zeile mit 65 — erfunden wird keine.
    const jetzt = new Date().getFullYear();
    const e = (mitRentenbeginn(jetzt - 70, jetzt - 3));
    const f = ruhestandsfenster(e);
    expect(f[0]!.alterA).toBe(e.zeilen[0]!.alterA);
    expect(f.every((z) => e.zeilen.includes(z))).toBe(true);
  });

  it('das Endalter laesst sich verschieben', () => {
    const e = (mitRentenbeginn(1990, 1990 + 67));
    expect(ruhestandsfenster(e, 85).at(-1)!.alterA).toBe(85);
  });
});

describe('Kinder in der Pflegeversicherung', () => {
  /*
    BEFUND: Der Kinderstatus wurde EINMAL aus dem Haushalt gebildet und fuer
    jedes Jahr der Projektion verwendet. Ein heute achtjaehriges Kind senkte
    den Pflegebeitrag damit auch noch im Ruhestand, in dem es laengst ueber
    fuenfzig ist. Die Abschlaege des § 55 Abs. 3 SGB XI enden aber mit dem
    25. Lebensjahr.
  */
  const mitKindern = (kinder: { geburtsjahr: number }[]) => szenario({
    haushalt: {
      verheiratet: false, bundesland: 'Nordrhein-Westfalen', kirchensteuer: false,
      hatKinder: kinder.length > 0, kinderUnter25: kinder.length, kinder,
      kvStatus: 'kvdr', kvErwerb: 'gesetzlich', pkv: PKV_VORGABE, zielNettoHeute: 2000,
    },
  });

  const kvPvIm = (s: Szenario, jahr: number) =>
    projiziere(s).zeilen.find((z) => z.jahr === jahr)!.kvPvGesamt;

  it('lässt den Abschlag mit dem 25. Geburtstag auslaufen', () => {
    const jetzt = new Date().getFullYear();
    // Drei Kinder, das juengste wird in fuenf Jahren 25.
    const drei = mitKindern([
      { geburtsjahr: jetzt - 24 }, { geburtsjahr: jetzt - 22 }, { geburtsjahr: jetzt - 20 },
    ]);
    // Dieselbe Familie, aber alle Kinder laengst erwachsen.
    const erwachsen = mitKindern([
      { geburtsjahr: jetzt - 40 }, { geburtsjahr: jetzt - 38 }, { geburtsjahr: jetzt - 36 },
    ]);

    // Heute: zwei Abschlaege (ab dem zweiten Kind) — der Beitrag ist niedriger.
    expect(kvPvIm(drei, jetzt)).toBeLessThan(kvPvIm(erwachsen, jetzt));
    // In zehn Jahren sind auch dort alle ueber 25: kein Unterschied mehr.
    expect(kvPvIm(drei, jetzt + 10)).toBeCloseTo(kvPvIm(erwachsen, jetzt + 10), 6);
  });

  it('behält den Wegfall des Kinderlosenzuschlags ein Leben lang', () => {
    /*
      Der Zuschlag entfaellt dauerhaft, sobald jemand ein Kind hat — anders
      als die Abschlaege. Wer ihn mit dem 25. Geburtstag zurueckkehren liesse,
      machte aus einer Verguenstigung eine Strafe.
    */
    const jetzt = new Date().getFullYear();
    const erwachseneKinder = mitKindern([{ geburtsjahr: jetzt - 40 }]);
    const kinderlos = mitKindern([]);
    expect(kvPvIm(erwachseneKinder, jetzt + 20)).toBeLessThan(kvPvIm(kinderlos, jetzt + 20));
  });

  it('rechnet ohne erfasste Geburtsjahre unverändert mit der Anzahl', () => {
    // Gespeicherte Dateien ohne Geburtsjahre duerfen nicht ploetzlich anders
    // rechnen: ein Kind ohne Jahrgang laesst sich nicht altern lassen.
    const jetzt = new Date().getFullYear();
    const nurAnzahl = szenario({
      haushalt: {
        verheiratet: false, bundesland: 'Nordrhein-Westfalen', kirchensteuer: false,
        hatKinder: true, kinderUnter25: 3, kinder: [],
        kvStatus: 'kvdr', kvErwerb: 'gesetzlich', pkv: PKV_VORGABE, zielNettoHeute: 2000,
      },
    });
    const ohneKinder = mitKindern([]);
    expect(kvPvIm(nurAnzahl, jetzt + 30)).toBeLessThan(kvPvIm(ohneKinder, jetzt + 30));
  });
});

describe('Einmalige Kapitalauszahlung', () => {
  const mitKapital = () => szenario({
    vertraege: [{
      id: 'k1', inhaber: 'A', schicht: 2, typ: 'bav', name: 'Direktversicherung',
      brutto: 0, kapitalAlternative: 120_000, strategie: 'kapital', altvertrag: false,
    }],
  });

  it('zieht Steuer UND Beiträge beim Zufluss ab', () => {
    /*
      Eine Kapitalleistung wird im Zuflussjahr versteuert, und die Kasse zieht
      die Beitraege ebenfalls sofort ab. Dass § 229 Abs. 1 S. 3 SGB V sie mit
      1/120 ueber 120 Monate bemisst, ist eine Rechengroesse: Sie sorgt dafuer,
      dass der Freibetrag hundertzwanzigmal gegengerechnet wird.
    */
    const e = projiziere(mitKapital());
    const a = e.kapitalauszahlungen[0]!;
    expect(a.bruttoKapital).toBeCloseTo(120_000, 6);
    expect(a.steuer).toBeGreaterThan(0);
    expect(a.kvPvGesamt).toBeGreaterThan(0);
    expect(a.nettoKapital).toBeCloseTo(a.bruttoKapital - a.steuer - a.kvPvGesamt, 6);
  });

  it('hinterlässt keinen Posten in der Monatsrechnung', () => {
    /*
      DER BEFUND: Ein Posten ohne Brutto mit negativem Netto stand zehn Jahre
      lang in der Monatsrechnung — der Abzug, der bereits vom Kapital genommen
      war, minderte das Haushaltsnetto ein zweites Mal.
    */
    const e = projiziere(mitKapital());
    for (const z of e.zeilen) {
      expect(z.posten.find((x) => x.id === 'k1')).toBeUndefined();
      expect(z.posten.every((x) => x.nettoJahr >= 0)).toBe(true);
    }
  });

  it('lässt das monatliche Netto unberührt', () => {
    // Die Kapitalauszahlung ist eine Einmalzahlung; das Monatsnetto der
    // Ruhestandsjahre darf sich durch sie weder heben noch senken.
    const ohne = projiziere(szenario());
    const mit = projiziere(mitKapital());
    for (let i = 0; i < ohne.zeilen.length; i++) {
      expect(mit.zeilen[i]!.nettoMonat).toBeCloseTo(ohne.zeilen[i]!.nettoMonat, 6);
    }
  });

  it('hält die Summe der Posten mit der Jahressumme zusammen', () => {
    const e = projiziere(mitKapital());
    for (const z of e.zeilen) {
      const summe = z.posten.reduce((sum, x) => sum + x.kvPvJahr, 0);
      expect(summe).toBeCloseTo(z.kvPvGesamt, 4);
    }
  });

  it('rechnet die Beiträge mit dem Freibetrag über 120 Monate', () => {
    /*
      Gegenprobe zur Bemessung: Ohne die Verteilung auf 120 Monate faellt der
      Freibetrag des § 226 SGB V nur einmal an, und die Beitraege waeren
      spuerbar hoeher. Der ausgewiesene Betrag liegt deshalb unter dem vollen
      Satz auf das ganze Kapital.
    */
    const e = projiziere(mitKapital());
    const a = e.kapitalauszahlungen[0]!;
    expect(a.kvPvGesamt).toBeLessThan(a.bruttoKapital * 0.2);
    expect(a.kvPvGesamt).toBeGreaterThan(a.bruttoKapital * 0.1);
  });
});
