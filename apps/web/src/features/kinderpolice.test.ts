import { beforeEach, describe, expect, it } from 'vitest';
import { projiziere, KINDERPOLICE_LEBENSERWARTUNG } from '@renten/engine';
import { exportiere, importiere } from '@renten/schema';
import { useSzenario, type SzenarioParsed } from '../store/szenario';
import { tuevPositionen, beiKind, kindName, desKindes } from './tuev-berechnung';
import { strategieText, kinderpoliceText } from './vertragsarten';

/**
 * KINDERPOLICE im Rechner: Der Kunde zahlt, ausgezahlt wird an ein Kind oder
 * Enkel. Der Store schaltet einen Vertrag um, der Vertrags-TUEV rechnet die
 * Auszahlung beim Kind — und die eigene Rente bleibt, wie sie war.
 */

const st = () => useSzenario.getState();
const sz = () => st().szenario;

/** Eine private Rente mit Pruefung — der Ausgangspunkt jeder Kinderpolice. */
function privateRente(): string {
  st().vertragHinzufuegen(3);
  const v = sz().vertraege[sz().vertraege.length - 1]!;
  st().vertragAendern(v.id, { name: 'Kinderpolice Lena', brutto: 600, kapitalAlternative: 150_000 });
  st().tuevHinzufuegen(v.id);
  const t = sz().tuev.find((x) => x.vertragId === v.id)!;
  st().tuevAendern(t.id, { beitragMonat: 50, beginnDatum: '01.12.2026', beginnJahr: 2026 });
  return v.id;
}

const vertrag = (id: string) => sz().vertraege.find((v) => v.id === id)!;
const pruefung = (id: string) => sz().tuev.find((t) => t.vertragId === id)!;
const position = (s: SzenarioParsed, id: string) => tuevPositionen(s, null, []).find((p) => p.vertrag.id === id)!;

describe('Kinderpolice umschalten', () => {
  beforeEach(() => st().zuruecksetzen());

  it('an: versicherte Person mit Vorgaben, Lebenserwartung 90', () => {
    const id = privateRente();
    expect(pruefung(id).lebenserwartung).toBe(85);
    st().kinderpoliceUmschalten(id, true);
    expect(vertrag(id).versichertePerson).toEqual({ vorname: '', geburtsdatum: '', rentenbeginn: '', steuersatzImAlter: 0.25 });
    expect(vertrag(id).strategie).toBe('rente');
    expect(pruefung(id).lebenserwartung).toBe(KINDERPOLICE_LEBENSERWARTUNG);
  });

  it('nur Rente oder Kapital — Planer und Verrentung gehoeren zur eigenen Rente', () => {
    const id = privateRente();
    st().vertragAendern(id, { strategie: 'planer' });
    st().kinderpoliceUmschalten(id, true);
    expect(vertrag(id).strategie).toBe('rente');

    const id2 = privateRente();
    st().vertragAendern(id2, { strategie: 'kapital' });
    st().kinderpoliceUmschalten(id2, true);
    expect(vertrag(id2).strategie).toBe('kapital');
  });

  it('aus: alles zurueck, auch „Beiträge bis“; eine eigene Lebenserwartung bleibt', () => {
    const id = privateRente();
    st().kinderpoliceUmschalten(id, true);
    st().tuevAendern(pruefung(id).id, { beitragBis: '31.12.2036' });
    st().kinderpoliceUmschalten(id, false);
    expect(vertrag(id).versichertePerson).toBeUndefined();
    expect(pruefung(id).beitragBis).toBeUndefined();
    expect(pruefung(id).lebenserwartung).toBe(85);

    st().kinderpoliceUmschalten(id, true);
    st().tuevAendern(pruefung(id).id, { lebenserwartung: 95 });
    st().kinderpoliceUmschalten(id, false);
    expect(pruefung(id).lebenserwartung).toBe(95);
  });

  it('wieder an: die eingetragenen Angaben zum Kind bleiben erhalten, solange der Vertrag sie hat', () => {
    const id = privateRente();
    st().kinderpoliceUmschalten(id, true);
    st().vertragAendern(id, { versichertePerson: { ...vertrag(id).versichertePerson!, vorname: 'Lena' } });
    st().kinderpoliceUmschalten(id, true);
    expect(vertrag(id).versichertePerson?.vorname).toBe('Lena');
  });

  it('wechselt die Vertragsart, endet die Kinderpolice', () => {
    const id = privateRente();
    st().kinderpoliceUmschalten(id, true);
    st().tuevAendern(pruefung(id).id, { beitragBis: '31.12.2036' });
    st().vertragAendern(id, { typ: 'etf' });
    expect(vertrag(id).typ).toBe('etf');
    expect(vertrag(id).versichertePerson).toBeUndefined();
    expect(pruefung(id).beitragBis).toBeUndefined();
    expect(pruefung(id).lebenserwartung).toBe(85);
  });

  it('übersteht Speichern und Laden', () => {
    const id = privateRente();
    st().kinderpoliceUmschalten(id, true);
    st().vertragAendern(id, {
      versichertePerson: { vorname: 'Lena', geburtsdatum: '12.03.2025', rentenbeginn: '', steuersatzImAlter: 0.3 },
    });
    st().tuevAendern(pruefung(id).id, { beitragBis: '31.12.2036' });
    const r = importiere(exportiere(sz()));
    if (!r.ok) throw new Error(r.fehler.join(' '));
    expect(r.szenario.vertraege.find((v) => v.id === id)?.versichertePerson?.steuersatzImAlter).toBe(0.3);
    expect(r.szenario.tuev.find((t) => t.vertragId === id)?.beitragBis).toBe('31.12.2036');
  });
});

describe('Kinderpolice im Vertrags-TÜV', () => {
  let id = '';
  beforeEach(() => {
    st().zuruecksetzen();
    id = privateRente();
    st().kinderpoliceUmschalten(id, true);
    st().vertragAendern(id, {
      versichertePerson: { vorname: 'Lena', geburtsdatum: '12.03.2025', rentenbeginn: '', steuersatzImAlter: 0.25 },
    });
  });

  it('Lena: Beitrag bis zum 18. Geburtstag, Rente ab 04/2092 mit 67, versteuert zu ihrem Satz', () => {
    const p = position(sz(), id);
    expect(p.kind).toBeDefined();
    const k = p.kind!;
    expect(k.vollstaendig).toBe(true);
    expect(k.rentenbeginn).toEqual({ jahr: 2092, monat: 4, tag: 1 });
    expect(k.alterBeiRentenbeginn).toBe(67);
    expect(k.beitragBis).toEqual({ jahr: 2043, monat: 3, tag: 12 });
    expect(k.beitragBisVorgeschlagen).toBe(true);
    expect(k.ruhezeitJahre).toBe(49);
    expect(k.ertragsanteil).toBe(0.17);
    expect(k.steuersatz).toBe(0.25);

    expect(p.istKapital).toBe(false);
    expect(p.rentenbeginnJahr).toBe(2092);
    // 12/2026 bis 03/2043: 1 + 16 · 12 + 3 Monate
    expect(p.ergebnis.monateEinzahlung).toBe(196);
    expect(p.ergebnis.summeEinzahlung).toBeCloseTo(196 * 50, 6);
    expect(p.ergebnis.steuerMonat).toBeCloseTo(600 * 0.17 * 0.25, 6);
    expect(p.ergebnis.nettoRenteMonat).toBeCloseTo(574.5, 6);
    expect(p.ergebnis.kvPvMonat).toBe(0);
    expect(p.ergebnis.jahreAuszahlung).toBe(KINDERPOLICE_LEBENSERWARTUNG - 67);
    // In heutigem Geld: ueber die Inflation bis 2092 abgezinst
    expect(k.kaufkraftfaktor).toBeCloseTo(Math.pow(1.02, 2092 - new Date().getFullYear()), 9);
  });

  it('beide Wege gerechnet, wenn Rente und Kapital am Vertrag stehen', () => {
    const p = position(sz(), id);
    expect(p.wege).not.toBeNull();
    expect(p.wege!.rente.nettoRenteMonat).toBeCloseTo(574.5, 6);
    // Kapital: Ertrag 150.000 − 9.800, nur zur Haelfte (12 Jahre Laufzeit, Auszahlung nach 62), zu 25 %
    expect(p.wege!.kapital.nettoKapital).toBeCloseTo(150_000 - (150_000 - 9_800) * 0.5 * 0.25, 6);
    expect(p.kind!.halbeinkuenfte).toBe(true);
  });

  it('Kapitalauszahlung gewaehlt: gerechnet ist das Kapital', () => {
    st().vertragAendern(id, { strategie: 'kapital' });
    const p = position(sz(), id);
    expect(p.istKapital).toBe(true);
    expect(p.ergebnis.nettoKapital).toBeCloseTo(150_000 - 140_200 * 0.5 * 0.25, 6);
    expect(p.ergebnis.nettoRenteMonat).toBe(0);
  });

  it('eingetragenes „Beiträge bis“ geht vor', () => {
    st().tuevAendern(pruefung(id).id, { beitragBis: '31.12.2036' });
    const p = position(sz(), id);
    expect(p.kind!.beitragBisVorgeschlagen).toBe(false);
    expect(p.kind!.beitragBis).toEqual({ jahr: 2036, monat: 12, tag: 31 });
    expect(p.ergebnis.monateEinzahlung).toBe(1 + 10 * 12);
  });

  it('der Steuersatz des Kindes ist eine Annahme und wirkt', () => {
    st().vertragAendern(id, { versichertePerson: { ...vertrag(id).versichertePerson!, steuersatzImAlter: 0 } });
    expect(position(sz(), id).ergebnis.nettoRenteMonat).toBe(600);
  });

  it('ohne Geburtsdatum: nur die Einzahlseite, kein Absturz', () => {
    st().vertragAendern(id, { versichertePerson: { ...vertrag(id).versichertePerson!, geburtsdatum: '' } });
    const p = position(sz(), id);
    expect(p.kind!.vollstaendig).toBe(false);
    expect(p.kind!.rentenbeginn).toBeNull();
    expect(p.kind!.beitragBis).toBeNull();
    expect(p.ergebnis.nettoRenteMonat).toBe(0);
    expect(p.ergebnis.nettoKapital).toBe(0);
    expect(p.ergebnis.summeEinzahlung).toBeGreaterThan(0);
    expect(p.wege).toBeNull();
  });

  it('die eigene Rente bleibt unberuehrt', () => {
    const mit = projiziere(sz());
    const ohne = projiziere({ ...sz(), vertraege: sz().vertraege.filter((v) => v.id !== id) });
    expect(mit).toEqual(ohne);
  });
});

describe('Kinderpolice — Texte', () => {
  const lena = { vorname: 'Lena' };
  const namenlos = { vorname: '  ' };

  it('mit und ohne Vornamen', () => {
    expect(beiKind(lena)).toBe('bei Lena');
    expect(beiKind(namenlos)).toBe('beim Kind');
    expect(kindName(lena)).toBe('Lena');
    expect(kindName(namenlos)).toBe('das Kind');
    expect(desKindes(lena)).toBe('Lena');
    expect(desKindes(namenlos)).toBe('des Kindes');
  });

  it('Verwendung und Art in der Vertragsliste', () => {
    const v = {
      id: 'k', inhaber: 'A' as const, schicht: 3 as const, typ: 'prvRente' as const, name: '', brutto: 600,
      strategie: 'rente' as const, altvertrag: false,
      versichertePerson: { vorname: 'Lena', geburtsdatum: '12.03.2025', rentenbeginn: '', steuersatzImAlter: 0.25 },
    };
    expect(strategieText(v)).toBe('Rente an Lena — nicht in der eigenen Rente');
    expect(strategieText({ ...v, strategie: 'kapital' })).toBe('Kapital an Lena — nicht in der eigenen Rente');
    expect(kinderpoliceText(v)).toBe('Kinderpolice für Lena');
    expect(kinderpoliceText({ typ: 'prvRente', versichertePerson: { ...v.versichertePerson, vorname: '' } })).toBe('Kinderpolice');
    expect(kinderpoliceText({ typ: 'prvRente', versichertePerson: undefined })).toBeNull();
    expect(kinderpoliceText({ typ: 'etf', versichertePerson: v.versichertePerson })).toBeNull();
  });
});
