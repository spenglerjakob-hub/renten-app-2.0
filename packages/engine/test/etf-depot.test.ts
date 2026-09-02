import { PKV_VORGABE } from '../src/social/pkv.js';
import { describe, it, expect } from 'vitest';
import { projiziere } from '../src/projection/timeline.js';
import type { Szenario, Vertrag } from '../src/model.js';

function szenario(depot: Partial<Vertrag>): Szenario {
  return {
    schemaVersion: 1,
    haushalt: {
      verheiratet: false, bundesland: 'Baden-Württemberg', kirchensteuer: false,
      hatKinder: false, kinderUnter25: 0, kinder: [], kvStatus: 'kvdr', pkv: PKV_VORGABE,
      zielNettoHeute: 2000,
    },
    annahmen: { inflation: 0.02, rentendynamik: 0.01, tarifIndex: 0.01, gehaltsdynamik: 0.02 },
    einkommenHeute: {
      modus: 'brutto', betrag: 4000, auszahlungen: 12,
      besoldungsgruppe: 'A13', besoldungsstufe: 4, besoldungsland: 'Baden-Württemberg',
    grvPflicht: false, grvBeitragMonat: 0,
    },
    personen: [{
      id: 'A', name: 'Test', geburtsdatum: '1975-01-01', rentenbeginn: '2042-01-01',
      art: 'grv', grvBruttoHeute: 1500,
      besoldungsgruppe: 'A13', besoldungsstufe: 8, ruhegehaltssatz: 71.75,
      dienstbeginn: '2000-01-01', teilzeitphasen: [],
    }],
    vertraege: [{
      id: 'd1', inhaber: 'A', schicht: 3, typ: 'etf', name: 'Depot',
      brutto: 0, strategie: 'rente', altvertrag: false,
      kapitalHeute: 40_000, sparrate: 300, renditeAnsparphase: 0.06,
      renditeEntnahme: 0.02, ter: 0.002, entnahmedauer: 20, teilfreistellung: 0.3,
      ...depot,
    }],
    planer: { startkapital: 0, dauerJahre: 25, rendite: 0.02, dynamik: 0, insNettoEinrechnen: false },
  };
}

/** Nettoentnahme des ersten Rentenjahres. */
function ersteEntnahme(s: Szenario): number {
  const r = projiziere(s);
  const zeile = r.zeilen.find((z) => z.jahr === r.ruhestandsjahr)!;
  return zeile.posten.find((x) => x.id === 'd1')?.nettoJahr ?? 0;
}

function depotwert(s: Szenario): number {
  return projiziere(s).depots.find((d) => d.vertragId === 'd1')?.endkapital ?? 0;
}

describe('Wertpapierdepot: die Eingaben wirken', () => {
  it('erscheint ueberhaupt im Kassenbon', () => {
    expect(ersteEntnahme(szenario({}))).toBeGreaterThan(0);
  });

  it('erhoeht die Entnahme, wenn die SPARRATE steigt', () => {
    // Regression: Die Zeitachse teilte frueher nur den heutigen Depotwert
    // durch die Entnahmedauer — die Sparrate blieb vollstaendig wirkungslos.
    const wenig = ersteEntnahme(szenario({ sparrate: 100 }));
    const viel = ersteEntnahme(szenario({ sparrate: 600 }));
    expect(viel).toBeGreaterThan(wenig * 1.5);
  });

  it('erhoeht die Entnahme, wenn die RENDITE der Ansparphase steigt', () => {
    const niedrig = ersteEntnahme(szenario({ renditeAnsparphase: 0.02 }));
    const hoch = ersteEntnahme(szenario({ renditeAnsparphase: 0.08 }));
    expect(hoch).toBeGreaterThan(niedrig * 1.5);
  });

  it('erhoeht die Entnahme, wenn die Rendite der ENTNAHMEPHASE steigt', () => {
    const niedrig = ersteEntnahme(szenario({ renditeEntnahme: 0 }));
    const hoch = ersteEntnahme(szenario({ renditeEntnahme: 0.04 }));
    expect(hoch).toBeGreaterThan(niedrig);
  });

  it('senkt die Entnahme, wenn die laufenden Kosten (TER) steigen', () => {
    const guenstig = ersteEntnahme(szenario({ ter: 0.001 }));
    const teuer = ersteEntnahme(szenario({ ter: 0.02 }));
    expect(teuer).toBeLessThan(guenstig);
  });

  it('senkt die Entnahme, wenn ein Ausgabeaufschlag anfaellt', () => {
    const ohne = ersteEntnahme(szenario({ ausgabeaufschlag: 0 }));
    const mit = ersteEntnahme(szenario({ ausgabeaufschlag: 0.05 }));
    expect(mit).toBeLessThan(ohne);
  });

  it('baut aus Startkapital und Sparrate einen plausiblen Depotwert auf', () => {
    // 40 000 EUR, 300 EUR/Monat, 6 % minus 0,2 % TER, 17 Jahre bis 2042.
    // Grob: 40 000 * 1,058^17 = rund 104 000, Sparplan rund 100 000.
    // Vorabpauschale und Kosten druecken das etwas.
    const wert = depotwert(szenario({}));
    expect(wert).toBeGreaterThan(150_000);
    expect(wert).toBeLessThan(230_000);
    // Deutlich mehr als das blosse Startkapital plus Einzahlungen.
    expect(wert).toBeGreaterThan(40_000 + 300 * 12 * 17);
  });
});

describe('Wertpapierdepot: Besteuerung', () => {
  it('besteuert nur den Gewinnanteil, nicht die Kapitalrueckzahlung', () => {
    const r = projiziere(szenario({}));
    const zeile = r.zeilen.find((z) => z.jahr === r.ruhestandsjahr)!;
    const posten = zeile.posten.find((x) => x.id === 'd1')!;
    // Waere der ganze Betrag steuerpflichtig, laege die Steuer bei rund 25 %.
    expect(posten.steuerJahr).toBeGreaterThan(0);
    expect(posten.steuerJahr).toBeLessThan(posten.bruttoJahr * 0.25);
  });

  it('laesst den steuerpflichtigen Anteil ueber die Jahre steigen (FIFO)', () => {
    // Zuerst werden die guenstig eingekauften Anteile veraeussert; der
    // Gewinnanteil jeder Entnahme waechst dadurch. Der Prototyp unterstellte
    // einen konstanten Anteil.
    const r = projiziere(szenario({}));
    const quote = (versatz: number) => {
      const z = r.zeilen.find((x) => x.jahr === r.ruhestandsjahr + versatz)!;
      const posten = z.posten.find((x) => x.id === 'd1')!;
      return posten.steuerJahr / posten.bruttoJahr;
    };
    expect(quote(10)).toBeGreaterThan(quote(0));
  });

  it('geht nicht in das zu versteuernde Einkommen ein', () => {
    // Kapitalertraege unterliegen der Abgeltungsteuer, nicht dem Tarif.
    const r = projiziere(szenario({}));
    const zeile = r.zeilen.find((z) => z.jahr === r.ruhestandsjahr)!;
    expect(zeile.posten.find((x) => x.id === 'd1')!.zveBeitrag).toBe(0);
  });

  it('erhebt in der KVdR keine KV/PV-Beitraege auf die Entnahme', () => {
    const r = projiziere(szenario({}));
    const zeile = r.zeilen.find((z) => z.jahr === r.ruhestandsjahr)!;
    expect(zeile.posten.find((x) => x.id === 'd1')!.kvPvJahr).toBe(0);
  });

  it('erhebt bei freiwilliger Versicherung KV/PV-Beitraege', () => {
    const s = szenario({});
    s.haushalt.kvStatus = 'freiwillig';
    const r = projiziere(s);
    const zeile = r.zeilen.find((z) => z.jahr === r.ruhestandsjahr)!;
    expect(zeile.posten.find((x) => x.id === 'd1')!.kvPvJahr).toBeGreaterThan(0);
  });
});

describe('Wertpapierdepot: Laufzeit', () => {
  it('endet nach Ablauf der Entnahmedauer', () => {
    const r = projiziere(szenario({ entnahmedauer: 15 }));
    const hat = (versatz: number) =>
      r.zeilen.find((z) => z.jahr === r.ruhestandsjahr + versatz)!.posten.some((x) => x.id === 'd1');
    expect(hat(0)).toBe(true);
    expect(hat(14)).toBe(true);
    expect(hat(15)).toBe(false);
  });

  it('zahlt bei kuerzerer Dauer mehr pro Jahr aus', () => {
    const kurz = ersteEntnahme(szenario({ entnahmedauer: 10 }));
    const lang = ersteEntnahme(szenario({ entnahmedauer: 30 }));
    expect(kurz).toBeGreaterThan(lang);
  });

  it('zahlt bei Strategie "kapital" einmalig aus statt laufend', () => {
    const r = projiziere(szenario({ strategie: 'kapital' }));
    const zeile = r.zeilen.find((z) => z.jahr === r.ruhestandsjahr)!;

    // Keine laufende Entnahme mehr ...
    expect(zeile.posten.some((x) => x.id === 'd1')).toBe(false);
    // ... dafuer eine Einmalzahlung.
    const a = r.kapitalauszahlungen.find((x) => x.vertragId === 'd1')!;
    expect(a).toBeDefined();
    expect(a.nettoKapital).toBeGreaterThan(100_000);
    expect(a.steuer).toBeGreaterThan(0);
    expect(a.nettoKapital).toBeCloseTo(a.bruttoKapital - a.steuer, 6);
    expect(a.jahr).toBe(r.ruhestandsjahr);
  });

  it('haelt die Einmalzahlung aus dem Monatsnetto heraus', () => {
    // Sonst spraenge das Monatsnetto im Rentenjahr sinnlos nach oben.
    const ohne = projiziere(szenario({ strategie: 'ignorieren' }));
    const mit = projiziere(szenario({ strategie: 'kapital' }));

    const netto = (r: ReturnType<typeof projiziere>) =>
      r.zeilen.find((z) => z.jahr === r.ruhestandsjahr)!.nettoGesamt;

    expect(netto(mit)).toBeCloseTo(netto(ohne), 6);
    expect(mit.kapitalauszahlungen).toHaveLength(1);
    expect(ohne.kapitalauszahlungen).toHaveLength(0);
  });

  it('erscheint nicht, wenn der Vertrag ignoriert wird', () => {
    const r = projiziere(szenario({ strategie: 'ignorieren' }));
    const zeile = r.zeilen.find((z) => z.jahr === r.ruhestandsjahr)!;
    expect(zeile.posten.some((x) => x.id === 'd1')).toBe(false);
  });
});
