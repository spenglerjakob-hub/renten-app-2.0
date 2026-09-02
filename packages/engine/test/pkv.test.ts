import { describe, it, expect } from 'vitest';
import {
  pkvImJahr, pkvVerlauf, arbeitgeberzuschuss, betVergleich,
  PKV_VORGABE, ZUSCHLAG_QUOTE,
  type PkvAnnahmen, type BetAnnahmen,
} from '../src/social/pkv.js';
import { parameterFuer } from '../src/params/registry.js';
import { projiziere } from '../src/projection/timeline.js';
import type { Szenario } from '../src/model.js';

const p = parameterFuer(2026, { indexRate: 0 });

const ohneBet: BetAnnahmen = { aktiv: false, beitragMonat: 0, entlastungMonat: 0, abAlter: 67 };
const basis: PkvAnnahmen = {
  praemieMonat: 400,
  steigerung: 0.03,
  steigerungAb65: 0.015,
  zuschlagEnthalten: true,
  bet: ohneBet,
};

describe('Praemienverlauf', () => {
  it('schreibt die Praemie ueberhaupt fort', () => {
    // Der eigentliche Befund: bis hierher stand sie still.
    const heute = pkvImJahr(basis, 40, 0);
    const in20 = pkvImJahr(basis, 60, 20);
    expect(heute.praemieMonat).toBeCloseTo(400, 6);
    expect(in20.praemieMonat).toBeCloseTo(400 * Math.pow(1.03, 20), 6);
  });

  it('laesst den gesetzlichen Zuschlag mit 61 wegfallen, nicht mit 65', () => {
    // § 149 VAG: erhoben bis zum Kalenderjahr des 60. Geburtstags.
    const mit60 = pkvImJahr(basis, 60, 20);
    const mit61 = pkvImJahr(basis, 61, 21);

    // Trotz eines weiteren Steigerungsjahres FAELLT die Praemie.
    expect(mit61.praemieMonat).toBeLessThan(mit60.praemieMonat);
    expect(mit61.praemieMonat).toBeCloseTo(
      400 * Math.pow(1.03, 21) / (1 + ZUSCHLAG_QUOTE), 6,
    );
  });

  it('kuerzt um 1/1,1 und nicht um 10 %', () => {
    // Der Zuschlag sitzt OBEN AUF der Nettopraemie: sein Wegfall teilt durch
    // 1,1 und kuerzt damit um rund 9,1 %, nicht um 10 %.
    const flach: PkvAnnahmen = { ...basis, steigerung: 0, steigerungAb65: 0 };
    const nachher = pkvImJahr(flach, 61, 21).praemieMonat;
    expect(nachher).toBeCloseTo(400 / 1.1, 6);
    expect(nachher).not.toBeCloseTo(400 * 0.9, 4);
  });

  it('gibt keinen Rabatt, wenn der Zuschlag gar nicht in der Praemie steckt', () => {
    const ohne: PkvAnnahmen = { ...basis, zuschlagEnthalten: false, steigerung: 0, steigerungAb65: 0 };
    expect(pkvImJahr(ohne, 61, 21).praemieMonat).toBeCloseTo(400, 6);
  });

  it('gibt niemandem eine Stufe, der die Grenze heute schon hinter sich hat', () => {
    // Wer heute 62 ist, hat den Zuschlag nicht in seiner Praemie — ihn
    // abzuziehen waere ein Rabatt aus dem Nichts.
    const flach: PkvAnnahmen = { ...basis, steigerung: 0, steigerungAb65: 0 };
    expect(pkvImJahr(flach, 62, 0).praemieMonat).toBeCloseTo(400, 6);
    expect(pkvImJahr(flach, 70, 8).praemieMonat).toBeCloseTo(400, 6);
  });

  it('daempft die Steigerung ab 65 (§ 150 Abs. 3 VAG)', () => {
    const ohne: PkvAnnahmen = { ...basis, zuschlagEnthalten: false };
    const mit70 = pkvImJahr(ohne, 70, 30);  // 25 Jahre bis 65, dann 5 gedaempft
    expect(mit70.praemieMonat).toBeCloseTo(
      400 * Math.pow(1.03, 25) * Math.pow(1.015, 5), 6,
    );
  });

  it('macht ab 65 KEINE Stufe nach unten', () => {
    // Der verbreitete Merksatz "mit 65 fallen 10 % weg" verwechselt § 149 mit
    // § 150: ab 65 werden Erhoehungen finanziert, die Praemie sinkt nicht.
    const ohne: PkvAnnahmen = { ...basis, zuschlagEnthalten: false };
    expect(pkvImJahr(ohne, 65, 25).praemieMonat)
      .toBeGreaterThan(pkvImJahr(ohne, 64, 24).praemieMonat);
  });

  it('behaelt die Stufe auch ohne jede Steigerung', () => {
    // Kontrollprobe: die Stufe haengt am Zuschlag, nicht am Wachstum. Ohne
    // diesen Test koennte ein Rechenfehler im Wachstum die Stufe vortaeuschen.
    const flach: PkvAnnahmen = { ...basis, steigerung: 0, steigerungAb65: 0 };
    const reihe = pkvVerlauf(flach, 1986, 2026, 2076).map((x) => x.praemieMonat);
    const gesenkt = reihe.filter((v, i) => i > 0 && v < reihe[i - 1]! - 1e-9);
    expect(gesenkt).toHaveLength(1);
  });
});

describe('Arbeitgeberzuschuss (§ 257 SGB V, § 61 SGB XI)', () => {
  it('traegt die Haelfte, solange die Praemie klein ist', () => {
    // Unterhalb des Deckels: genau die halbe Praemie.
    expect(arbeitgeberzuschuss(200, 60_000, p)).toBeCloseTo(100, 6);
  });

  it('deckelt am halben Beitragssatz auf die Bemessungsgrundlage', () => {
    const erwartet = (60_000 / 12)
      * ((p.kv.allgemeinerSatz + p.kv.zusatzbeitrag + p.pv.satz) / 2);
    expect(arbeitgeberzuschuss(2_000, 60_000, p)).toBeCloseTo(erwartet, 6);
  });

  it('rechnet oberhalb der Beitragsbemessungsgrenze nicht weiter', () => {
    const anDerGrenze = arbeitgeberzuschuss(2_000, p.bbgKvJahr, p);
    const weitDarueber = arbeitgeberzuschuss(2_000, p.bbgKvJahr * 3, p);
    expect(weitDarueber).toBeCloseTo(anDerGrenze, 6);
  });

  it('ist nie groesser als die halbe Praemie', () => {
    for (const praemie of [50, 300, 900, 5_000]) {
      expect(arbeitgeberzuschuss(praemie, p.bbgKvJahr * 2, p)).toBeLessThanOrEqual(praemie / 2 + 1e-9);
    }
  });
});

describe('Beitragsentlastungstarif', () => {
  const bet: BetAnnahmen = { aktiv: true, beitragMonat: 100, entlastungMonat: 250, abAlter: 67 };
  const mitBet: PkvAnnahmen = { ...basis, bet, zuschlagEnthalten: false, steigerung: 0, steigerungAb65: 0 };

  it('kostet vor dem Stichalter und entlastet danach', () => {
    const vorher = pkvImJahr(mitBet, 50, 10);
    expect(vorher.betBeitragMonat).toBe(100);
    expect(vorher.entlastungMonat).toBe(0);
    expect(vorher.gesamtMonat).toBeCloseTo(400 + 100, 6);

    const nachher = pkvImJahr(mitBet, 70, 30);
    expect(nachher.betBeitragMonat).toBe(0);
    expect(nachher.entlastungMonat).toBe(250);
    expect(nachher.praemieMonat).toBeCloseTo(150, 6);
  });

  it('senkt die Praemie nie unter null', () => {
    const gross: PkvAnnahmen = { ...mitBet, bet: { ...bet, entlastungMonat: 5_000 } };
    expect(pkvImJahr(gross, 70, 30).praemieMonat).toBe(0);
  });

  it('nennt das Alter, ab dem sich der Tarif getragen hat', () => {
    // 27 Jahre a 1 200 EUR = 32 400 EUR eingezahlt, 3 000 EUR Entlastung im
    // Jahr — nach 10,8 Jahren ist er drin.
    const v = betVergleich(bet, 40, 85);
    expect(v.eingezahlt).toBeCloseTo(100 * 12 * 27, 6);
    expect(v.erspart).toBeCloseTo(250 * 12 * 18, 6);
    expect(v.breakEvenAlter).toBeCloseTo(67 + 32_400 / 3_000, 6);
  });

  it('kennt kein Break-even ohne Entlastung', () => {
    expect(betVergleich({ ...bet, entlastungMonat: 0 }, 40, 85).breakEvenAlter).toBeNull();
  });

  it('ist sofort drin, wenn er nichts kostet', () => {
    expect(betVergleich({ ...bet, beitragMonat: 0 }, 40, 85).breakEvenAlter).toBe(67);
  });
});

/* --- Zusammenspiel mit der Zeitachse --- */

const szenario = (kvStatus: 'kvdr' | 'pkv', pkv: PkvAnnahmen): Szenario => ({
  schemaVersion: 1,
  haushalt: {
    verheiratet: false, bundesland: 'Baden-Württemberg', kirchensteuer: false,
    hatKinder: false, kinderUnter25: 0, kinder: [], kvStatus, pkv,
    zielNettoHeute: 2500,
  },
  annahmen: { inflation: 0.02, rentendynamik: 0.01, tarifIndex: 0.01, gehaltsdynamik: 0.02 },
  einkommenHeute: {
    modus: 'brutto', betrag: 5000, auszahlungen: 12,
    besoldungsgruppe: 'A13', besoldungsstufe: 4, besoldungsland: 'Baden-Württemberg',
  },
  personen: [{
    id: 'A', name: 'A', art: 'grv', geburtsdatum: '01.01.1986', rentenbeginn: '01.01.2053',
    grvBruttoHeute: 1500, besoldungsgruppe: 'A13', besoldungsstufe: 4,
    ruhegehaltssatz: 71.75, dienstbeginn: '', teilzeitphasen: [],
  }],
  vertraege: [], einkommenGetrennt: false,
  einkommenPartner: {
    modus: 'brutto', betrag: 0, auszahlungen: 12,
    besoldungsgruppe: 'A13', besoldungsstufe: 4, besoldungsland: 'Baden-Württemberg',
  },
  planer: { startkapital: 0, dauerJahre: 25, rendite: 0.02, dynamik: 0, insNettoEinrechnen: true },
});

describe('Zeitachse mit privater Krankenversicherung', () => {
  it('laesst die KV-Last ueber die Jahre wachsen', () => {
    const e = projiziere(szenario('pkv', basis));
    const imRuhestand = e.zeilen.filter((z) => z.vollstaendigImRuhestand);
    const erste = imRuhestand[0]!;
    const spaete = imRuhestand[15]!;
    expect(spaete.kvPvGesamt).toBeGreaterThan(erste.kvPvGesamt);
  });

  it('haelt die Summe der Posten mit dem Gesamtbetrag zusammen', () => {
    // Die Falle aus der KV/PV-Runde: eine Quelle ohne Posten liess die Summe
    // auseinanderlaufen.
    const e = projiziere(szenario('pkv', basis));
    for (const z of e.zeilen) {
      const summe = z.posten.reduce((s, x) => s + x.kvPvJahr, 0);
      expect(summe).toBeCloseTo(z.kvPvGesamt, 4);
    }
  });

  it('laesst ein GKV-Szenario voellig unberuehrt', () => {
    // Die Regressionsprobe zur Umstellung von `beamter` auf `kvStatus`.
    const mitPraemie = projiziere(szenario('kvdr', basis));
    const ohnePraemie = projiziere(szenario('kvdr', { ...basis, praemieMonat: 0 }));
    for (let i = 0; i < mitPraemie.zeilen.length; i++) {
      expect(mitPraemie.zeilen[i]!.nettoGesamt).toBeCloseTo(ohnePraemie.zeilen[i]!.nettoGesamt, 6);
    }
  });

  it('belastet die Erwerbsphase eines privat Versicherten', () => {
    // Der zweite Befund: die Praemie tauchte vor dem Rentenbeginn gar nicht auf.
    const privat = projiziere(szenario('pkv', basis));
    const gesetzlich = projiziere(szenario('kvdr', basis));
    const jahr = privat.zeilen[0]!.jahr;
    const a = privat.zeilen.find((z) => z.jahr === jahr)!;
    const b = gesetzlich.zeilen.find((z) => z.jahr === jahr)!;
    expect(a.nettoGesamt).not.toBeCloseTo(b.nettoGesamt, 2);
  });
});
