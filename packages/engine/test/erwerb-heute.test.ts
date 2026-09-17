import { describe, it, expect } from 'vitest';
import { erwerbsBasisHeute } from '../src/erwerb/heute.js';
import { bruttoZuNetto } from '../src/erwerb/netto.js';
import { zusatzsteuer } from '../src/tax/haushalt.js';
import { basisrahmenJahr } from '../src/analyse/foerdercheck.js';
import { PKV_VORGABE } from '../src/social/pkv.js';
import { parameterFuer } from '../src/params/registry.js';
import { PARAMETER_2026 } from '../src/params/jahre.js';
import { projiziere } from '../src/projection/timeline.js';
import type { Szenario, EinkommenHeute } from '../src/model.js';

/*
  DIE BEMESSUNGSGRUNDLAGE DES VERTRAGS-TUEV.

  Der TUEV hatte bis hierher eine eigene, verkuerzte Fassung dieser Ableitung:
  `betrag × auszahlungen` durch `bruttoZuNetto`. Sie war an vier Stellen
  falsch, und jede davon traf das zu versteuernde Einkommen, mit dem die
  Foerderung einer Basisrente gemessen wird. Gegen ein Steuerblatt der AXA
  gerechnet kam dabei ein Nettoaufwand von 217 statt 171 EUR im Monat heraus.

  Jeder der vier Faelle steht hier als eigene Zusicherung — sie sind der Grund
  fuer diese Datei, und ohne Test verschwinden sie beim naechsten Umbau.
*/

const JAHR = 2026;
const p = parameterFuer(JAHR, { indexRate: 0 });

const einkommen = (over: Partial<EinkommenHeute> = {}): EinkommenHeute => ({
  modus: 'brutto', betrag: 5_000, auszahlungen: 12,
  besoldungsgruppe: 'A13', besoldungsstufe: 4, besoldungsland: 'Baden-Württemberg',
  grvPflicht: false, grvBeitragMonat: 0,
  ...over,
});

const person = (id: 'A' | 'B', geburt: string) => ({
  id, name: id, geburtsdatum: geburt, rentenbeginn: '2050-01-01',
  art: 'grv' as const, grvBruttoHeute: 1_500, besoldungsgruppe: 'A13', besoldungsstufe: 8,
  ruhegehaltssatz: 71.75, dienstbeginn: '2000-01-01', teilzeitphasen: [],
});

const szenario = (over: Partial<Szenario> = {}): Szenario => ({
  schemaVersion: 1,
  haushalt: {
    verheiratet: true, bundesland: 'Bayern', kirchensteuer: true,
    hatKinder: false, kinderUnter25: 0, kinder: [],
    kvStatus: 'kvdr', kvErwerb: 'gesetzlich', pkv: PKV_VORGABE, zielNettoHeute: 3_000,
  },
  annahmen: { inflation: 0.02, rentendynamik: 0.01, tarifIndex: 0, gehaltsdynamik: 0.02 },
  einkommenHeute: einkommen(),
  personen: [person('A', '1975-01-01'), person('B', '1980-01-01')],
  vertraege: [],
  planer: { startkapital: 0, dauerJahre: 25, rendite: 0.02, dynamik: 0, insNettoEinrechnen: false },
  ...over,
});

/** Was 3 600 EUR Basisrentenbeitrag im Jahr netto kosten, im Monat. */
const nettoaufwandMonat = (zve: number) =>
  (3_600 - zusatzsteuer(zve - 3_600, 3_600, {
    verheiratet: true, bundesland: 'Bayern', kirchensteuerpflichtig: true,
  }, p)) / 12;

describe('Erwerbsbasis heute', () => {
  it('kehrt ein eingegebenes NETTO um, statt es als Brutto zu nehmen', () => {
    /*
      Der Fall, der den Befund ausgeloest hat: `modus` ist im Schema mit
      'netto' vorbelegt, das ist also der Regelfall. Der TUEV reichte den
      Nettobetrag unveraendert als Brutto weiter.
    */
    const s = szenario({
      einkommenHeute: einkommen({ modus: 'netto', betrag: 5_000 }),
      // Alleinstehend, damit der Betrag nicht noch auf zwei Koepfe faellt.
      haushalt: { ...szenario().haushalt, verheiratet: false },
      personen: [person('A', '1975-01-01')],
    });
    const b = erwerbsBasisHeute(s, p, JAHR);

    // Das Brutto muss deutlich ueber dem eingegebenen Netto liegen.
    expect(b.jahresbrutto).toBeGreaterThan(60_000 * 1.3);

    // Und die Gegenprobe: das Netto trifft die Eingabe wieder.
    const zurueck = bruttoZuNetto(b.jahresbrutto, {
      verheiratet: false, bundesland: 'Bayern', kirchensteuerpflichtig: true,
      kinder: { hatKinder: false, kinderUnter25: 0 },
    }, p);
    expect(zurueck.jahresnetto).toBeCloseTo(60_000, 0);

    // Die alte Fassung setzte das Netto als Brutto an — messbar weniger zvE.
    const alt = bruttoZuNetto(60_000, {
      verheiratet: false, bundesland: 'Bayern', kirchensteuerpflichtig: true,
      kinder: { hatKinder: false, kinderUnter25: 0 },
    }, p);
    expect(b.zve).toBeGreaterThan(alt.zve + 20_000);
  });

  it('loest eine BESOLDUNG aus der Tabelle auf, statt null zu liefern', () => {
    /*
      Bei `modus: 'besoldung'` ist `betrag` gar nicht gefuellt — die Besoldung
      kommt aus der Tabelle. Die alte Fassung rechnete `betrag × 12` und kam
      auf null: ein Beamter sah ueberhaupt keine Steuerersparnis.
    */
    const s = szenario({
      einkommenHeute: einkommen({ modus: 'besoldung', betrag: 0 }),
      haushalt: { ...szenario().haushalt, verheiratet: false },
      personen: [person('A', '1975-01-01')],
    });
    const b = erwerbsBasisHeute(s, p, JAHR);

    expect(b.jahresbrutto).toBeGreaterThan(50_000);
    expect(b.zve).toBeGreaterThan(30_000);
    expect(b.jePerson[0]!.beamter).toBe(true);
    // Und damit ueberhaupt eine Foerderung.
    expect(nettoaufwandMonat(b.zve)).toBeLessThan(300);
  });

  it('nimmt bei getrennter Erfassung das ZWEITE Einkommen dazu', () => {
    /*
      `einkommenPartner` wurde ignoriert, waehrend `verheiratet` den
      Splittingtarif ausloeste: halbes Einkommen zum Tarif fuer zwei.
    */
    const s = szenario({
      einkommenGetrennt: true,
      einkommenHeute: einkommen({ modus: 'brutto', betrag: 78_298 / 12 }),
      einkommenPartner: einkommen({ modus: 'brutto', betrag: 52_199 / 12 }),
    });
    const b = erwerbsBasisHeute(s, p, JAHR);

    expect(b.jahresbrutto).toBeCloseTo(130_497, 0);
    expect(b.jePerson).toHaveLength(2);
    expect(b.jePerson[1]!.brutto).toBeCloseTo(52_199, 0);

    // Nur Person A gerechnet — so rechnete der TUEV — waere deutlich weniger.
    const nurA = erwerbsBasisHeute(
      szenario({
        einkommenGetrennt: true,
        einkommenHeute: einkommen({ modus: 'brutto', betrag: 78_298 / 12 }),
        einkommenPartner: einkommen({ modus: 'brutto', betrag: 0 }),
      }),
      p, JAHR,
    );
    expect(b.zve).toBeGreaterThan(nurA.zve + 30_000);
    expect(nettoaufwandMonat(b.zve)).toBeLessThan(nettoaufwandMonat(nurA.zve));
  });

  it('verteilt ein gemeinsames Einkommen auf zwei Koepfe mit je eigener Grenze', () => {
    /*
      Der Haushaltsbetrag als EINE Person gerechnet setzt
      Beitragsbemessungsgrenzen und Pauschbetraege nur einmal an — das zvE
      faellt dadurch zu HOCH aus, die Foerderung zu guenstig.
    */
    const s = szenario({ einkommenHeute: einkommen({ modus: 'brutto', betrag: 130_497 / 12 }) });
    const b = erwerbsBasisHeute(s, p, JAHR);

    const alsEinePerson = bruttoZuNetto(130_497, {
      verheiratet: true, bundesland: 'Bayern', kirchensteuerpflichtig: true,
      kinder: { hatKinder: false, kinderUnter25: 0 },
    }, p);

    expect(b.jahresbrutto).toBeCloseTo(130_497, 0);
    expect(b.sv).toBeGreaterThan(alsEinePerson.sv);
    expect(b.zve).toBeLessThan(alsEinePerson.zve);
    // Zwei Arbeitnehmer-Pauschbetraege statt einem.
    expect(alsEinePerson.zve - b.zve).toBeGreaterThan(p.pauschbetraege.arbeitnehmer);
  });

  it('liefert dasselbe zvE wie die Zeitachse — eine Ableitung, nicht zwei', () => {
    /*
      DIE EIGENTLICHE ZUSICHERUNG DIESER RUNDE. Zwei Fassungen derselben
      Rechnung laufen auseinander; genau das war passiert. Beide Wege muessen
      im laufenden Jahr denselben Wert ergeben.
    */
    const faelle: Szenario[] = [
      szenario(),
      szenario({ einkommenHeute: einkommen({ modus: 'netto', betrag: 4_000 }) }),
      szenario({ einkommenHeute: einkommen({ modus: 'besoldung', betrag: 0 }) }),
      szenario({
        einkommenGetrennt: true,
        einkommenHeute: einkommen({ modus: 'brutto', betrag: 6_000 }),
        einkommenPartner: einkommen({ modus: 'netto', betrag: 2_500 }),
      }),
      szenario({
        einkommenHeute: einkommen({ modus: 'selbststaendig', betrag: 9_000, grvPflicht: true, grvBeitragMonat: 800 }),
      }),
    ];

    const jetzt = new Date().getFullYear();
    for (const s of faelle) {
      const pJetzt = parameterFuer(jetzt, { indexRate: s.annahmen.tarifIndex });
      const b = erwerbsBasisHeute(s, pJetzt, jetzt);
      const ausZeitachse = projiziere(s).zeilen.find((z) => z.jahr === jetzt)!
        .posten.filter((x) => x.id.startsWith('erwerb-'))
        .reduce((summe, x) => summe + x.bruttoJahr, 0);
      expect(b.jahresbrutto).toBeCloseTo(ausZeitachse, 2);
    }
  });

  it('trifft das Steuerblatt der AXA, wenn dessen zvE eingesetzt wird', () => {
    /*
      Der Abnahmefall der ganzen Runde: Die STEUERRECHNUNG war nie das
      Problem. Verheiratet, 8 % Kirchensteuer, 3 600 EUR Jahresbeitrag zur
      Basisversorgung, zvE 129 195 EUR — das Blatt weist 1 550,88 EUR
      Ersparnis und 2 049,12 EUR Nettoaufwand aus.
    */
    const opt = { verheiratet: true, bundesland: 'Bayern', kirchensteuerpflichtig: true };
    const ersparnis = zusatzsteuer(129_195 - 3_600, 3_600, opt, PARAMETER_2026);
    expect(ersparnis).toBeCloseTo(1_550.88, 2);
    expect(3_600 - ersparnis).toBeCloseTo(2_049.12, 2);
    // Und der Hoechstbetrag, den das Blatt ausdruecklich nennt.
    expect(PARAMETER_2026.hoechstbetragAltersvorsorge).toBe(30_826);
    expect(PARAMETER_2026.hoechstbetragAltersvorsorge * 2).toBe(61_652);
  });
});

describe('Hoechstbetrag § 10 Abs. 3 EStG bei Zusammenveranlagung', () => {
  it('rechnet den Verbrauch BEIDER Personen an', () => {
    /*
      Der doppelte Hoechstbetrag steht dem Paar zu — verbraucht wird er dann
      aber auch von beiden. Nur Person A anzurechnen wies einen freien Rahmen
      aus, den es nicht gibt.
    */
    const gemeinsam = { grvBeitragJahr: 0, basisBeitragJahr: 0 };
    const nurA = basisrahmenJahr(
      { ...gemeinsam, selbststaendig: false, jahresbrutto: 60_000 }, true, p,
    );
    const beide = basisrahmenJahr(
      {
        ...gemeinsam, selbststaendig: false, jahresbrutto: 120_000,
        jePerson: [
          { selbststaendig: false, grvBeitragJahr: 0, brutto: 60_000 },
          { selbststaendig: false, grvBeitragJahr: 0, brutto: 60_000 },
        ],
      }, true, p,
    );

    expect(beide.verbraucht).toBeCloseTo(2 * 60_000 * p.rvSatzGesamt, 2);
    expect(beide.verbraucht).toBeCloseTo(2 * nurA.verbraucht, 2);
    expect(beide.rahmen).toBeLessThan(nurA.rahmen);
  });

  it('haelt die beiden Formeln bei einem gemischten Paar auseinander', () => {
    // Selbststaendiger ohne Rentenversicherungspflicht neben einer
    // Angestellten: Er verbraucht nichts, sie ihren fiktiven Gesamtbeitrag.
    const r = basisrahmenJahr(
      {
        selbststaendig: true, grvBeitragJahr: 0, jahresbrutto: 130_000, basisBeitragJahr: 0,
        jePerson: [
          { selbststaendig: true, grvBeitragJahr: 0, brutto: 78_000 },
          { selbststaendig: false, grvBeitragJahr: 0, brutto: 52_000 },
        ],
      }, true, p,
    );
    expect(r.verbraucht).toBeCloseTo(52_000 * p.rvSatzGesamt, 2);
  });

  it('bleibt ohne Personenangabe bei der Einzelrechnung', () => {
    const ohne = basisrahmenJahr(
      { selbststaendig: false, grvBeitragJahr: 0, jahresbrutto: 60_000, basisBeitragJahr: 0 },
      false, p,
    );
    expect(ohne.verbraucht).toBeCloseTo(60_000 * p.rvSatzGesamt, 2);
    expect(ohne.hoechstbetrag).toBe(p.hoechstbetragAltersvorsorge);
  });
});
