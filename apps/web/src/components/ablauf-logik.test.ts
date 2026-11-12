import { describe, expect, it } from 'vitest';
import { erreichteEtappen, nachOeffnen, stueckeLage, STUECKE_ANFANG } from './ablauf-logik';

const STUECKE = [
  { id: 'luecke' },
  { id: 'netto' },
  { id: 'kaufkraft' },
  { id: 'steuer', vertiefung: true },
  { id: 'recht', vertiefung: true },
];

describe('stueckeLage', () => {
  it('beginnt mit dem ersten Stück des Wegs, ohne Vertiefungen', () => {
    const l = stueckeLage(STUECKE, STUECKE_ANFANG);
    expect(l.offen?.id).toBe('luecke');
    expect(l.weit).toBe(0);
    expect(l.amEnde).toBe(false);
    expect(l.naechstes?.id).toBe('netto');
    expect(l.weg.map((x) => x.id)).toEqual(['luecke', 'netto', 'kaufkraft']);
    expect(l.tiefer.map((x) => x.id)).toEqual(['steuer', 'recht']);
  });

  it('„Weiter“ öffnet das nächste Stück, das vorige bleibt erreicht', () => {
    const s = nachOeffnen(STUECKE, STUECKE_ANFANG, 'netto');
    expect(s).toEqual({ offen: 'netto', weit: 'netto' });
    const l = stueckeLage(STUECKE, s);
    expect(l.weit).toBe(1);
    expect(l.naechstes?.id).toBe('kaufkraft');
  });

  it('ein früheres Stück wieder öffnen nimmt nichts Erreichtes weg', () => {
    let s = nachOeffnen(STUECKE, STUECKE_ANFANG, 'netto');
    s = nachOeffnen(STUECKE, s, 'kaufkraft');
    s = nachOeffnen(STUECKE, s, 'luecke');
    expect(s).toEqual({ offen: 'luecke', weit: 'kaufkraft' });
    const l = stueckeLage(STUECKE, s);
    expect(l.amEnde).toBe(true);
    expect(l.naechstes?.id).toBe('netto');
  });

  it('ein von außen geöffnetes Stück zählt als erreicht, auch wenn es nie gemerkt wurde', () => {
    // Die Fortschrittsleiste springt zum dritten Stück; danach öffnet jemand das erste.
    const s = nachOeffnen(STUECKE, { offen: 'kaufkraft', weit: null }, 'luecke');
    expect(s).toEqual({ offen: 'luecke', weit: 'kaufkraft' });
  });

  it('am Ende des Wegs gibt es kein nächstes Stück — dort führt „Weiter“ zur nächsten Etappe', () => {
    const l = stueckeLage(STUECKE, { offen: 'kaufkraft', weit: 'kaufkraft' });
    expect(l.amEnde).toBe(true);
    expect(l.naechstes).toBeNull();
  });

  it('eine offene Vertiefung: der Weg gilt als gegangen, ein nächstes Stück gibt es nicht', () => {
    const s = nachOeffnen(STUECKE, { offen: 'kaufkraft', weit: 'kaufkraft' }, 'steuer');
    expect(s).toEqual({ offen: 'steuer', weit: 'kaufkraft' });
    const l = stueckeLage(STUECKE, s);
    expect(l.offen?.id).toBe('steuer');
    expect(l.amEnde).toBe(true);
    expect(l.naechstes).toBeNull();
  });

  it('eine Etappe, die schon hinter einem liegt, zeigt den ganzen Weg — auch ohne gemerkten Stand', () => {
    const l = stueckeLage(STUECKE, STUECKE_ANFANG, true);
    expect(l.offen?.id).toBe('luecke');
    expect(l.weit).toBe(2);
    expect(l.amEnde).toBe(true);
  });

  it('ein Stück, das es nicht mehr gibt, fällt auf den Anfang zurück', () => {
    const ohne = STUECKE.filter((x) => x.id !== 'netto');
    const l = stueckeLage(ohne, { offen: 'netto', weit: 'netto' });
    expect(l.offen?.id).toBe('luecke');
    expect(l.weit).toBe(0);
  });

  it('nur Vertiefungen oder gar nichts: kein Absturz', () => {
    expect(stueckeLage([{ id: 'a', vertiefung: true }], STUECKE_ANFANG).offen?.id).toBe('a');
    const leer = stueckeLage([], STUECKE_ANFANG);
    expect(leer.offen).toBeNull();
    expect(leer.amEnde).toBe(true);
  });
});

describe('erreichteEtappen', () => {
  const E = ['daten', 'ergebnis', 'sparen', 'loesungen', 'abschluss'] as const;

  it('zeigt alle Etappen bis zur weitesten erreichten', () => {
    expect(erreichteEtappen(E, 'daten', 0)).toEqual(['daten']);
    expect(erreichteEtappen(E, 'sparen', 2)).toEqual(['daten', 'ergebnis', 'sparen']);
  });

  it('eine frühere Etappe wieder öffnen lässt die späteren als Zeilen stehen', () => {
    expect(erreichteEtappen(E, 'daten', 3)).toEqual(['daten', 'ergebnis', 'sparen', 'loesungen']);
  });

  it('ein Sprung nach vorn (Seitenleiste) nimmt die Etappen davor mit', () => {
    expect(erreichteEtappen(E, 'abschluss', 0)).toEqual([...E]);
  });
});
