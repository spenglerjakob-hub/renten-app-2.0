import { describe, it, expect } from 'vitest';
import { bruttoZuNetto, erwerbHaushalt } from '../src/erwerb/netto.js';
import { PKV_VORGABE, arbeitgeberzuschuss } from '../src/social/pkv.js';
import { parameterFuer } from '../src/params/registry.js';
import { projiziere } from '../src/projection/timeline.js';
import type { Szenario } from '../src/model.js';

const p = parameterFuer(2026, { indexRate: 0 });

const opt = {
  verheiratet: true,
  bundesland: 'Baden-Württemberg',
  kirchensteuerpflichtig: false,
  kinder: { hatKinder: false, kinderUnter25: 0 },
};

const angestellt = (jahresbrutto: number) => ({ jahresbrutto, beamter: false });

describe('Erwerbseinkommen des Haushalts', () => {
  it('setzt die Beitragsbemessungsgrenze JE PERSON an', () => {
    // BEFUND: Frueher lief das gesamte Haushaltseinkommen als EINE Person
    // durch bruttoZuNetto. Die Grenzen gelten aber je Person, weshalb die
    // Sozialabgaben deutlich zu niedrig ausfielen.
    const alsEinePerson = bruttoZuNetto(120_000, opt, p);
    const alsPaar = erwerbHaushalt([angestellt(60_000), angestellt(60_000)], opt, p);

    expect(alsPaar.sv).toBeGreaterThan(alsEinePerson.sv);
    // Gemessene Groessenordnung: rund 7 500 EUR im Jahr, also gut 600 im Monat.
    const unterschied = alsPaar.sv - alsEinePerson.sv;
    expect(unterschied).toBeGreaterThan(6_000);
    expect(unterschied).toBeLessThan(9_000);
  });

  it('weist deshalb ein NIEDRIGERES Netto aus als die alte Rechnung', () => {
    const alt = bruttoZuNetto(120_000, opt, p);
    const neu = erwerbHaushalt([angestellt(60_000), angestellt(60_000)], opt, p);
    expect(neu.jahresnetto).toBeLessThan(alt.jahresnetto);
  });

  it('bleibt bei EINER Person identisch zu bruttoZuNetto', () => {
    const einzeln = bruttoZuNetto(60_000, { ...opt, verheiratet: false }, p);
    const ueberHaushalt = erwerbHaushalt([angestellt(60_000)], { ...opt, verheiratet: false }, p);

    expect(ueberHaushalt.sv).toBeCloseTo(einzeln.sv, 6);
    expect(ueberHaushalt.zve).toBeCloseTo(einzeln.zve, 6);
    expect(ueberHaushalt.est).toBeCloseTo(einzeln.est, 6);
    expect(ueberHaushalt.jahresnetto).toBeCloseTo(einzeln.jahresnetto, 6);
  });

  it('besteuert EINMAL gemeinsam, nicht zweimal einzeln', () => {
    // Splitting auf das gemeinsame zvE. Zwei Einzelveranlagungen ergaeben
    // wegen der Progression ein anderes Ergebnis.
    const paar = erwerbHaushalt([angestellt(90_000), angestellt(30_000)], opt, p);
    const zweiEinzeln =
      bruttoZuNetto(90_000, { ...opt, verheiratet: false }, p).est +
      bruttoZuNetto(30_000, { ...opt, verheiratet: false }, p).est;

    expect(paar.est).toBeLessThan(zweiEinzeln);
  });

  it('summiert Brutto und Sozialabgaben ueber alle Personen', () => {
    const r = erwerbHaushalt([angestellt(50_000), angestellt(70_000)], opt, p);
    expect(r.jahresbrutto).toBe(120_000);
    expect(r.proPerson).toHaveLength(2);
    expect(r.sv).toBeCloseTo(r.proPerson[0]!.sv + r.proPerson[1]!.sv, 6);
    expect(r.zve).toBeCloseTo(r.proPerson[0]!.zveBeitrag + r.proPerson[1]!.zveBeitrag, 6);
  });

  it('rechnet ein gemischtes Paar aus Beamter und Angestellter richtig', () => {
    // Der Beamte ist privat versichert — das steht jetzt an `privatVersichert`
    // und nicht mehr stillschweigend an `beamter`.
    const privat = { ...opt, privatVersichert: true };
    const gemischt = erwerbHaushalt(
      [{ jahresbrutto: 60_000, beamter: true, pkvPraemieMonat: 400 }, angestellt(60_000)],
      privat, p,
    );

    // Die verbeamtete Person zahlt keine RV/AV, sondern die PKV-Praemie —
    // und keinen Arbeitgeberzuschuss, an dessen Stelle die Beihilfe tritt.
    expect(gemischt.proPerson[0]!.sv).toBeCloseTo(400 * 12, 6);
    // Die angestellte Person zahlt deutlich mehr.
    expect(gemischt.proPerson[1]!.sv).toBeGreaterThan(gemischt.proPerson[0]!.sv);

    // Gegenprobe: zwei Angestellte zahlen zusammen mehr Sozialabgaben.
    const beideAngestellt = erwerbHaushalt([angestellt(60_000), angestellt(60_000)], opt, p);
    expect(beideAngestellt.sv).toBeGreaterThan(gemischt.sv);
  });

  /*
    BEFUND: Ein Beamter OHNE gesetzten PKV-Status zahlte gar keine
    Krankenversicherung. Die Praemie war null, weil kein PKV-Status gesetzt
    war, und der Beamtenzweig kannte keinen gesetzlichen Fall — sein Netto war
    um den vollen Beitrag zu hoch. Freiwillig gesetzlich versicherte Beamte
    gibt es, und sie tragen den vollen Satz: der Dienstherr zahlt keinen
    Arbeitgeberanteil.
  */
  it('laesst einen gesetzlich versicherten Beamten nicht beitragsfrei', () => {
    const r = erwerbHaushalt([{ jahresbrutto: 60_000, beamter: true }], opt, p);
    expect(r.proPerson[0]!.sv).toBeGreaterThan(0);

    // Voller Satz statt halbem: mehr als ein Angestellter mit demselben Brutto,
    // der nur seinen Anteil traegt — obwohl beim Beamten RV und AV fehlen.
    const bemessung = Math.min(60_000, p.bbgKvJahr);
    const voll = bemessung * (p.kv.allgemeinerSatz + p.kv.zusatzbeitrag + p.pv.satz + p.pv.kinderloseZuschlag);
    expect(r.proPerson[0]!.sv).toBeCloseTo(voll, 6);
  });

  /*
    BEFUND: Ein privat versicherter ANGESTELLTER zahlte bis zum Rentenbeginn
    GKV-Beitraege und wechselte erst zum Rentenbeginn in die PKV — obwohl aus
    der PKV praktisch niemand zurueckkommt.
  */
  it('rechnet den privat versicherten Angestellten mit Praemie und Arbeitgeberzuschuss', () => {
    const privat = { ...opt, privatVersichert: true };
    const praemie = 700;
    const r = erwerbHaushalt(
      [{ jahresbrutto: 60_000, beamter: false, pkvPraemieMonat: praemie }], privat, p,
    );

    const gesetzlich = erwerbHaushalt([angestellt(60_000)], opt, p);
    const zuschuss = arbeitgeberzuschuss(praemie, 60_000, p);

    // Renten- und Arbeitslosenversicherung laufen unveraendert weiter, an die
    // Stelle von KV/PV tritt der eigene Anteil an der Praemie.
    const rvAv = 60_000 * (p.rvSatzGesamt / 2 + p.avSatzGesamt / 2);
    expect(r.proPerson[0]!.sv).toBeCloseTo(rvAv + (praemie - zuschuss) * 12, 6);
    expect(r.proPerson[0]!.sv).not.toBeCloseTo(gesetzlich.proPerson[0]!.sv, 6);
  });

  it('kommt mit einem Alleinverdiener-Paar zurecht', () => {
    const r = erwerbHaushalt([angestellt(120_000), angestellt(0)], opt, p);
    expect(r.proPerson[1]!.sv).toBe(0);
    // Nur ein Einkommen -> nur eine Beitragsbemessungsgrenze wirkt.
    expect(r.sv).toBeCloseTo(bruttoZuNetto(120_000, opt, p).sv, 6);
  });

  it('liefert bei leerer Liste Nullwerte statt NaN', () => {
    const r = erwerbHaushalt([], opt, p);
    expect(r.jahresbrutto).toBe(0);
    expect(r.sv).toBe(0);
    expect(r.jahresnetto).toBe(0);
  });
});

describe('Erwerbseinkommen in der Projektion', () => {
  const basis = (over: Partial<Szenario> = {}): Szenario => ({
    schemaVersion: 1,
    haushalt: {
      verheiratet: true, bundesland: 'Baden-Württemberg', kirchensteuer: false,
      hatKinder: false, kinderUnter25: 0, kinder: [], kvStatus: 'kvdr', kvErwerb: 'gesetzlich', pkv: PKV_VORGABE,
      zielNettoHeute: 3000,
    },
    annahmen: { inflation: 0.02, rentendynamik: 0.01, tarifIndex: 0.01, gehaltsdynamik: 0.02 },
    einkommenHeute: {
      modus: 'brutto', betrag: 10_000, auszahlungen: 12,
      besoldungsgruppe: 'A13', besoldungsstufe: 4, besoldungsland: 'Baden-Württemberg',
    grvPflicht: false, grvBeitragMonat: 0,
    },
    personen: [
      { id: 'A', name: 'A', geburtsdatum: '1975-01-01', rentenbeginn: '2042-01-01',
        art: 'grv', grvBruttoHeute: 1500, besoldungsgruppe: 'A13', besoldungsstufe: 8,
        ruhegehaltssatz: 71.75, dienstbeginn: '2000-01-01', teilzeitphasen: [] },
      { id: 'B', name: 'B', geburtsdatum: '1980-01-01', rentenbeginn: '2047-01-01',
        art: 'grv', grvBruttoHeute: 1200, besoldungsgruppe: 'A13', besoldungsstufe: 8,
        ruhegehaltssatz: 71.75, dienstbeginn: '2005-01-01', teilzeitphasen: [] },
    ],
    vertraege: [],
    planer: { startkapital: 0, dauerJahre: 25, rendite: 0.02, dynamik: 0, insNettoEinrechnen: false },
    ...over,
  });

  const erwerbIm = (s: Szenario, jahr: number) =>
    projiziere(s).zeilen.find((z) => z.jahr === jahr)!.posten.find((x) => x.id === 'erwerb');

  it('teilt das Haushaltseinkommen auch pauschal auf zwei Personen auf', () => {
    // 120 000 EUR als EINE Person ergaeben zu niedrige Sozialabgaben.
    const jetzt = new Date().getFullYear();
    const e = erwerbIm(basis(), jetzt)!;
    const alsEinePerson = bruttoZuNetto(120_000, { ...opt, verheiratet: true }, parameterFuer(jetzt, { indexRate: 0.01 }));
    expect(e.kvPvJahr).toBeGreaterThan(alsEinePerson.sv);
  });

  it('laesst bei getrennten Einkommen nur das Einkommen der Person wegfallen, die in Rente geht', () => {
    const s = basis({
      einkommenGetrennt: true,
      einkommenHeute: {
        modus: 'brutto', betrag: 8_000, auszahlungen: 12,
        besoldungsgruppe: 'A13', besoldungsstufe: 4, besoldungsland: 'Baden-Württemberg',
    grvPflicht: false, grvBeitragMonat: 0,
      },
      einkommenPartner: {
        modus: 'brutto', betrag: 2_000, auszahlungen: 12,
        besoldungsgruppe: 'A13', besoldungsstufe: 4, besoldungsland: 'Baden-Württemberg',
    grvPflicht: false, grvBeitragMonat: 0,
      },
    });

    // A geht 2042 in Rente, B erst 2047. Ab 2042 bleibt NUR das kleine
    // Einkommen von B uebrig — nicht die Haelfte des Haushalts.
    const vorher = erwerbIm(s, 2041)!;
    const nachher = erwerbIm(s, 2042)!;
    expect(nachher.bruttoJahr).toBeLessThan(vorher.bruttoJahr * 0.35);
  });

  it('halbiert bei pauschaler Erfassung dagegen nur nach Koepfen', () => {
    const s = basis();
    const vorher = erwerbIm(s, 2041)!;
    const nachher = erwerbIm(s, 2042)!;
    expect(nachher.bruttoJahr / vorher.bruttoJahr).toBeCloseTo(0.5 * 1.02, 2);
  });

  it('rechnet ein gemischtes Paar aus Beamter und Angestellter', () => {
    const s = basis({
      einkommenGetrennt: true,
      einkommenHeute: {
        modus: 'besoldung', betrag: 0, auszahlungen: 12,
        besoldungsgruppe: 'A13', besoldungsstufe: 8, besoldungsland: 'Baden-Württemberg',
    grvPflicht: false, grvBeitragMonat: 0,
      },
      einkommenPartner: {
        modus: 'brutto', betrag: 5_000, auszahlungen: 12,
        besoldungsgruppe: 'A13', besoldungsstufe: 4, besoldungsland: 'Baden-Württemberg',
    grvPflicht: false, grvBeitragMonat: 0,
      },
    });
    const e = erwerbIm(s, new Date().getFullYear())!;
    expect(e.bruttoJahr).toBeGreaterThan(0);
    expect(e.nettoJahr).toBeGreaterThan(0);
    expect(e.nettoJahr).toBeLessThan(e.bruttoJahr);
  });
});

/* ------------------------------------------------------------------ */

describe('Selbstständige', () => {
  const gewinn = 60_000;
  const selbst = (over = {}) =>
    erwerbHaushalt(
      [{ jahresbrutto: gewinn, beamter: false, selbststaendig: true, ...over }],
      opt, p,
    );

  it('rechnet ohne eingetragenen Beitrag keine Rentenversicherung', () => {
    /*
      BEFUND: Ein Selbststaendiger musste sich als Angestellter eintragen und
      bekam damit Renten- und Arbeitslosenversicherung berechnet, die er nicht
      zahlt. Die meisten sind nicht pflichtversichert.
    */
    const r = selbst();
    const angestellt = erwerbHaushalt([{ jahresbrutto: gewinn, beamter: false }], opt, p);
    expect(r.proPerson[0]!.sv).toBeLessThan(angestellt.proPerson[0]!.sv);
  });

  it('uebernimmt den eingetragenen GRV-Beitrag unveraendert', () => {
    // Er traegt ihn ALLEIN — kein Arbeitgeber uebernimmt die Haelfte.
    const ohne = selbst().proPerson[0]!.sv;
    const mit = selbst({ grvBeitragJahr: 7_200 }).proPerson[0]!.sv;
    expect(mit - ohne).toBeCloseTo(7_200, 6);
  });

  it('zahlt niemals Arbeitslosenversicherung', () => {
    // Gegenprobe ueber die Differenz: waere die AV drin, laege sie hoeher.
    const r = selbst();
    const bemessung = Math.min(gewinn, p.bbgKvJahr);
    const nurKvPv = bemessung * (
      p.kv.allgemeinerSatz + p.kv.zusatzbeitrag
      + p.pv.satz + p.pv.kinderloseZuschlag
    );
    expect(r.proPerson[0]!.sv).toBeCloseTo(nurKvPv, 6);
  });

  it('traegt den VOLLEN Krankenkassenbeitrag, nicht den halben', () => {
    const r = selbst();
    const angestellt = erwerbHaushalt([{ jahresbrutto: gewinn, beamter: false }], opt, p);
    const bemessung = Math.min(gewinn, p.bbgKvJahr);
    const kvPvAngestellt = angestellt.proPerson[0]!.sv
      - gewinn * (p.rvSatzGesamt / 2 + p.avSatzGesamt / 2);
    // Der volle Satz ist genau das Doppelte des Arbeitnehmeranteils beim KV-
    // Grundsatz; beim Pflegesatz traegt das Mitglied den Zuschlag ohnehin
    // allein, deshalb nur groesser statt exakt doppelt.
    expect(r.proPerson[0]!.sv).toBeGreaterThan(kvPvAngestellt * 1.5);
    expect(bemessung).toBeGreaterThan(0);
  });

  it('setzt bei kleinem Gewinn die Mindestbemessungsgrundlage an', () => {
    // § 240 Abs. 4 SGB V: mindestens ein Drittel der Bezugsgroesse.
    const winzig = erwerbHaushalt(
      [{ jahresbrutto: 3_000, beamter: false, selbststaendig: true }], opt, p,
    );
    const mindest = (p.bezugsgroesseMonat / 3) * 12;
    const erwartet = mindest * (
      p.kv.allgemeinerSatz + p.kv.zusatzbeitrag + p.pv.satz + p.pv.kinderloseZuschlag
    );
    expect(winzig.proPerson[0]!.sv).toBeCloseTo(erwartet, 6);
  });

  it('zahlt privat versichert die Praemie ohne Arbeitgeberzuschuss', () => {
    // Es gibt keinen Arbeitgeber, der zuschiessen koennte.
    const privat = { ...opt, privatVersichert: true };
    const r = erwerbHaushalt(
      [{ jahresbrutto: gewinn, beamter: false, selbststaendig: true, pkvPraemieMonat: 700 }],
      privat, p,
    );
    expect(r.proPerson[0]!.sv).toBeCloseTo(700 * 12, 6);
  });

  it('bekommt keinen Arbeitnehmer-Pauschbetrag', () => {
    /*
      § 9a S. 1 Nr. 1a EStG gilt nur fuer Einkuenfte aus NICHTSELBSTAENDIGER
      Arbeit. Gegenprobe bei gleichem Sozialabgabenbetrag: das zvE des
      Selbststaendigen liegt genau um den Pauschbetrag hoeher.
    */
    const mitBeitrag = selbst({ grvBeitragJahr: 0 });
    const zveSelbst = mitBeitrag.proPerson[0]!.zveBeitrag;
    const sv = mitBeitrag.proPerson[0]!.sv;
    // Nachgebaut: Gewinn minus Sonderausgabenpauschbetrag minus abziehbare
    // Vorsorgeaufwendungen, OHNE den Arbeitnehmer-Pauschbetrag.
    const bemessung = Math.min(gewinn, p.bbgKvJahr);
    const kv = bemessung * (p.kv.allgemeinerSatz + p.kv.zusatzbeitrag);
    const pv = bemessung * (p.pv.satz + p.pv.kinderloseZuschlag);
    const abzug = kv * 0.96 + pv;
    expect(sv).toBeCloseTo(kv + pv, 6);
    expect(zveSelbst).toBeCloseTo(gewinn - p.pauschbetraege.sonderausgaben - abzug, 6);
  });
});
