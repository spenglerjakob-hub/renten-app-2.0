import { describe, expect, it } from 'vitest';
import { szenarioSchema } from '@renten/schema';
import { standardSzenario } from '../store/standard';
import {
  angebotPositionen, besteAngebote, besteAngeboteText, type AngebotPosition,
} from './tuev-berechnung';

/**
 * „Bestes“ im Angebotsvergleich: gemessen an der Nettorendite der RENTE.
 * Das Kapital laeuft kuerzer und haette sonst fast immer die hoechste
 * Rendite pro Jahr — Betriebsrente, Riester, Depot und Basisrente ohne
 * (volles) Kapital kaemen nie zum Zug.
 */

/** Ein Weg mit den Feldern, auf die es hier ankommt. */
const weg = (rendite: number, summeEinzahlung = 30_000) => ({ rendite, summeEinzahlung }) as AngebotPosition['rente'];

const pos = (id: string, rente: number | null, kapital: number | null, einzahlung = 30_000): AngebotPosition => ({
  angebot: { id },
  rente: rente === null ? null : weg(rente, einzahlung),
  kapital: kapital === null ? null : weg(kapital, einzahlung),
  breakEven: null,
  rentenbeginnJahr: 2060,
  lueckeAnteil: null,
}) as unknown as AngebotPosition;

describe('besteAngebote — die Nettorendite der Rente entscheidet', () => {
  it('das Kapital zählt nicht: die höhere Rendite des Kapitals macht ein Angebot nicht zum besten', () => {
    // Privat: Rente 2,1 %, Kapital 4,8 %. Betriebsrente: Rente 3,4 %, kein Kapital.
    const b = besteAngebote([pos('privat', 0.021, 0.048), pos('bav', 0.034, null)]);
    expect(b).toEqual({ weg: 'rente', rendite: 0.034, ids: ['bav'] });
  });

  it('auch mit Kapital auf beiden Seiten gewinnt die bessere Rente', () => {
    const b = besteAngebote([pos('a', 0.02, 0.06), pos('b', 0.03, 0.04)]);
    expect(b.ids).toEqual(['b']);
    expect(b.rendite).toBe(0.03);
  });

  it('gleichauf: beide bekommen die Auszeichnung', () => {
    expect(besteAngebote([pos('a', 0.03, 0.05), pos('b', 0.03, null), pos('c', 0.01, null)]).ids).toEqual(['a', 'b']);
  });

  it('ein Angebot nur mit Kapital steht außer Wertung, sobald ein anderes eine Rente nennt', () => {
    // Zwei mit Rente und eines nur mit Kapital: gemessen wird die Rente, das Kapital-Angebot faellt heraus.
    const b = besteAngebote([pos('a', 0.02, null), pos('b', 0.025, null), pos('k', null, 0.07)]);
    expect(b).toEqual({ weg: 'rente', rendite: 0.025, ids: ['b'] });
  });

  it('eine Rente allein ist kein Vergleich — auch nicht neben einem Angebot nur mit Kapital', () => {
    expect(besteAngebote([pos('a', 0.02, null), pos('k', null, 0.07)])).toEqual({ weg: null, rendite: -Infinity, ids: [] });
  });

  it('nennt kein Angebot eine Rente, entscheidet die Nettorendite des Kapitals', () => {
    const b = besteAngebote([pos('a', null, 0.04), pos('b', null, 0.05)]);
    expect(b).toEqual({ weg: 'kapital', rendite: 0.05, ids: ['b'] });
  });

  it('ohne eigenen Aufwand gibt es keine Rendite — das Angebot steht außer Wertung', () => {
    // Rein arbeitgeberfinanziert: der Rechenkern liefert 0 Einzahlung.
    const b = besteAngebote([pos('ggf', 0.5, null, 0), pos('a', 0.02, null), pos('b', 0.03, null)]);
    expect(b.ids).toEqual(['b']);
    // Bleibt daneben nur eines, wird nicht ausgezeichnet.
    expect(besteAngebote([pos('ggf', 0.5, null, 0), pos('a', 0.02, null)]).weg).toBeNull();
  });

  it('ein Angebot ohne Rente und ohne Kapital ist nicht zu rechnen und zählt nicht mit', () => {
    expect(besteAngebote([pos('leer', null, null), pos('a', 0.02, null)]).weg).toBeNull();
    expect(besteAngebote([pos('leer', null, null), pos('a', 0.02, null), pos('b', 0.01, null)]).ids).toEqual(['a']);
  });

  it('keines oder eines: keine Auszeichnung', () => {
    expect(besteAngebote([]).weg).toBeNull();
    expect(besteAngebote([pos('a', 0.03, 0.05)]).ids).toEqual([]);
  });

  it('der Satz darunter sagt, woran gemessen wurde', () => {
    expect(besteAngeboteText('rente')).toMatch(/höchste Nettorendite der Rente.*Kapitals zählt dabei nicht/);
    expect(besteAngeboteText('kapital')).toMatch(/höchste Nettorendite des Kapitals — keines der Angebote nennt eine Rente/);
  });
});

describe('besteAngebote — am gerechneten Fall', () => {
  /**
   * Der Fall aus der Beratung: eine private Rentenversicherung mit Kapitalwahlrecht
   * neben einer Betriebsrente ohne Kapital. Das Kapital der privaten rentiert pro
   * Jahr hoeher als jede Rente — und entschied bisher die Auszeichnung.
   */
  const s = standardSzenario();
  const szenario = szenarioSchema.parse({
    ...s,
    loesungen: {
      ...s.loesungen,
      angebote: [
        { id: 'p', loesung: 'privat', name: 'Private', beitragMonat: 150, renteMonat: 190, kapital: 95_000 },
        { id: 'b', loesung: 'bav', name: 'Betriebsrente', beitragMonat: 150, agZuschussMonat: 30, renteMonat: 330 },
      ],
    },
  });
  const positionen = angebotPositionen(szenario);
  const [p, b] = positionen;

  it('die Voraussetzung stimmt: das Kapital der privaten hat die höchste Rendite von allen', () => {
    expect(p!.kapital!.rendite).toBeGreaterThan(p!.rente!.rendite);
    expect(p!.kapital!.rendite).toBeGreaterThan(b!.rente!.rendite);
    expect(b!.kapital).toBeNull();
  });

  it('ausgezeichnet wird trotzdem die Betriebsrente — ihre Rente rentiert besser', () => {
    expect(b!.rente!.rendite).toBeGreaterThan(p!.rente!.rendite);
    expect(besteAngebote(positionen)).toEqual({ weg: 'rente', rendite: b!.rente!.rendite, ids: ['b'] });
  });
});
