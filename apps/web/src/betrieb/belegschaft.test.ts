import { describe, expect, it } from 'vitest';
import { betriebsCheck, lohnlisteLesen, parameterFuer, type BelegschaftGruppe } from '@renten/engine';
import {
  BEISPIEL_GRUPPEN, HOECHSTENS_GRUPPEN, LAGE_TEXT, MODELL_VORGABEN, STAND_SCHLUESSEL, beitragName, durchschnittsGruppe,
  gruppenZeilen, lohnlisteText, modellSeite, modellText, standLesen, standSchreiben, standVorgabe,
} from './belegschaft';

const A = 'aaaaaaaa-0000-4000-8000-00000000f001';
const B = 'bbbbbbbb-0000-4000-8000-00000000f002';
const p = parameterFuer(2026, { indexRate: 0 });
const steuer = { verheiratet: false, bundesland: 'Nordrhein-Westfalen', kirchensteuerpflichtig: false };

const check = (gruppen: readonly BelegschaftGruppe[]) => betriebsCheck({
  gruppen, modell: MODELL_VORGABEN.zuschuss, umwandlungMonat: 100, quoten: [0.5],
  unternehmensSteuersatz: 0.3, umlagenSatz: 0,
}, steuer, p);

describe('Vorgabe der Seite', () => {
  it('die Beispiel-Belegschaft zeigt alle drei Lagen — in diesem und im nächsten Jahr', () => {
    for (const jahr of [2026, 2027]) {
      const r = betriebsCheck({
        gruppen: BEISPIEL_GRUPPEN, modell: MODELL_VORGABEN.zuschuss, umwandlungMonat: 100, quoten: [0.5],
        unternehmensSteuersatz: 0.3, umlagenSatz: 0,
      }, steuer, parameterFuer(jahr, { indexRate: 0 }));
      expect(r.koepfe).toBe(34);
      expect(new Set(r.gruppen.map((g) => g.svLage))).toEqual(new Set(['voll', 'teilweise', 'keine']));
    }
  });

  it('beginnt mit dem Zuschussmodell, 100 € Umwandlung und 30 / 50 / 80 % Teilnahme', () => {
    const s = standVorgabe();
    expect(s.modell).toEqual({ art: 'zuschuss', quote: 0.5, deckelMonat: 100 });
    expect([s.umwandlungMonat, s.quoten, s.beispiel]).toEqual([100, [0.3, 0.5, 0.8], true]);
  });

  it('mit dem Modell der Firma — ohne die Vorgabe zu verändern', () => {
    const s = standVorgabe(MODELL_VORGABEN.festbetrag);
    s.gruppen[0]!.anzahl = 99;
    expect(s.modell.art).toBe('festbetrag');
    expect(BEISPIEL_GRUPPEN[0]!.anzahl).toBe(18);
    expect(standVorgabe().gruppen[0]!.anzahl).toBe(18);
  });
});

describe('Stand im Browser — je Firma ein Fach', () => {
  const stand = { ...standVorgabe(), beispiel: false, gruppen: [{ name: 'Lager', anzahl: 7, jahresbrutto: 36_000 }] };

  it('schreiben und lesen', () => {
    const roh = standSchreiben(null, A, stand);
    expect(standLesen(roh, A)).toEqual(stand);
    expect(standLesen(roh, B)).toBeNull();
    expect(standLesen(roh, null)).toBeNull();
  });

  it('ohne Firma hat ein eigenes Fach; die Fächer stören sich nicht', () => {
    let roh = standSchreiben(null, null, stand);
    roh = standSchreiben(roh, A, { ...stand, umwandlungMonat: 150 });
    expect(standLesen(roh, null)!.umwandlungMonat).toBe(100);
    expect(standLesen(roh, A)!.umwandlungMonat).toBe(150);
    roh = standSchreiben(roh, A, null);
    expect(standLesen(roh, A)).toBeNull();
    expect(standLesen(roh, null)).not.toBeNull();
  });

  it('das letzte Fach entfernt: nichts mehr zu speichern', () => {
    expect(standSchreiben(standSchreiben(null, A, stand), A, null)).toBeNull();
  });

  it('was keine Kennung ist, landet im Fach ohne Firma', () => {
    const roh = standSchreiben(null, '__proto__', stand);
    expect(standLesen(roh, null)).toEqual(stand);
    expect(Object.keys(JSON.parse(roh!) as object)).toEqual(['ohne']);
  });

  it('liest misstrauisch: Unsinn, fremde Typen und zu große Zahlen', () => {
    expect(standLesen('kein json', A)).toBeNull();
    expect(standLesen('[]', A)).toBeNull();
    expect(standLesen(JSON.stringify({ [A]: { gruppen: [], modell: { art: 'zuschuss' } } }), A)).toBeNull();
    expect(standLesen(JSON.stringify({ [A]: { gruppen: [{}], modell: { art: 'anders' } } }), A)).toBeNull();
    const schief = standLesen(JSON.stringify({ [A]: {
      gruppen: [{ name: 5, anzahl: 12.4, jahresbrutto: 1e12 }, 'x', { name: 'N'.repeat(99), anzahl: -3, jahresbrutto: '40000' }],
      modell: { art: 'matching', weg: 'ukasse', matchingMonat: 99_999, zuschussImMatching: true },
      umwandlungMonat: 'viel', quoten: [2, -1], vlMonat: 40, vlAnzahl: 3.6,
    } }), A)!;
    expect(schief.gruppen).toEqual([
      { name: '', anzahl: 12, jahresbrutto: 10_000_000 },
      { name: 'N'.repeat(40), anzahl: 0, jahresbrutto: 0 },
    ]);
    // In die Unterstützungskasse umgewandelt gibt es keinen Pflichtzuschuss im Matching.
    expect(schief.modell).toEqual({ art: 'matching', weg: 'ukasse', matchingMonat: 10_000, zuschussImMatching: false });
    expect([schief.umwandlungMonat, schief.quoten, schief.vlMonat, schief.vlAnzahl, schief.beispiel])
      .toEqual([100, [1, 0, 0.8], 40, 4, false]);
  });

  it('höchstens 60 Gruppen', () => {
    const viele = Array.from({ length: 80 }, (_, i) => ({ name: '', anzahl: 1, jahresbrutto: 30_000 + i * 1000 }));
    expect(standLesen(standSchreiben(null, A, { ...stand, gruppen: viele }), A)!.gruppen).toHaveLength(HOECHSTENS_GRUPPEN);
  });

  it('der Schlüssel im Speicher', () => {
    expect(STAND_SCHLUESSEL).toBe('rentenplaner.betrieb.v1');
  });
});

describe('Modell in Worten', () => {
  it('Zuschuss mit und ohne Deckel', () => {
    expect(modellText({ art: 'zuschuss', quote: 0.5, deckelMonat: 100 })).toBe('Zuschuss 50 % der Umwandlung, höchstens 100 € im Monat');
    expect(modellText({ art: 'zuschuss', quote: 0.2, deckelMonat: 0 })).toBe('Zuschuss 20 % der Umwandlung, ohne Deckel');
  });

  it('Festbetrag und Matching', () => {
    expect(modellText(MODELL_VORGABEN.festbetrag)).toBe('Festbetrag 50 € im Monat ab 50 € Umwandlung');
    expect(modellText({ art: 'matching', weg: 'dv', matchingMonat: 338, zuschussImMatching: true }))
      .toBe('Matching 338 € im Monat in die Unterstützungskasse, einschließlich Pflichtzuschuss, Umwandlung in die Direktversicherung');
    expect(modellText({ art: 'matching', weg: 'ukasse', matchingMonat: 100, zuschussImMatching: false }))
      .toBe('Matching 100 € im Monat in die Unterstützungskasse, Umwandlung in die Unterstützungskasse');
  });

  it('Name des Beitrags und Seite des Modells', () => {
    expect([beitragName(MODELL_VORGABEN.zuschuss), beitragName(MODELL_VORGABEN.festbetrag), beitragName(MODELL_VORGABEN.matching)])
      .toEqual(['Zuschuss', 'Festbetrag', 'Matching und Pflichtzuschuss']);
    expect([modellSeite(MODELL_VORGABEN.zuschuss), modellSeite(MODELL_VORGABEN.festbetrag), modellSeite(MODELL_VORGABEN.matching)])
      .toEqual(['/zuschussmodell', '/festbetrag', '/arbeitgeber']);
  });
});

describe('gruppenZeilen — die Tabelle je Gehaltsgruppe', () => {
  it('wenige Gruppen stehen einzeln, mit Bezeichnung und Lage', () => {
    const { baender, zeilen } = gruppenZeilen(check(BEISPIEL_GRUPPEN).gruppen);
    expect(baender).toBe(false);
    expect(zeilen.map((z) => [z.text, z.anzahl, z.gehaltText, z.lage])).toEqual([
      ['Produktion', 18, '38.000 €', 'voll'],
      ['Verwaltung', 8, '48.000 €', 'voll'],
      ['Technik', 6, '82.000 €', 'teilweise'],
      ['Leitung', 2, '120.000 €', 'keine'],
    ]);
    // Derselbe Zuschuss — aber er kostet oben mehr.
    expect(zeilen[0]!.agBeitragMonat).toBeCloseTo(zeilen[3]!.agBeitragMonat, 6);
    expect(zeilen[0]!.agNettoMonat).toBeLessThan(zeilen[3]!.agNettoMonat);
  });

  it('ohne Bezeichnung steht „Mitarbeiter“', () => {
    expect(gruppenZeilen(check([{ name: ' ', anzahl: 3, jahresbrutto: 40_000 }]).gruppen).zeilen[0]!.text).toBe('Mitarbeiter');
  });

  it('viele Gruppen werden zu Bändern von 10.000 € — Köpfe und Kosten bleiben', () => {
    const viele = Array.from({ length: 30 }, (_, i) => ({ name: '', anzahl: 1 + (i % 3), jahresbrutto: 31_000 + i * 3_000 }));
    const r = check(viele);
    const { baender, zeilen } = gruppenZeilen(r.gruppen);
    expect(baender).toBe(true);
    expect(zeilen.length).toBeLessThanOrEqual(12);
    expect(zeilen[0]!.text).toBe('30.000 bis unter 40.000 €');
    expect(zeilen[0]!.gehaltText).toMatch(/^Ø \d\d\.\d00 €$/);
    expect(zeilen.reduce((n, z) => n + z.anzahl, 0)).toBe(r.koepfe);
    const kosten = zeilen.reduce((n, z) => n + z.anzahl * z.agNettoMonat * 12, 0);
    expect(kosten).toBeCloseTo(r.szenarien[0]!.agNettoJahr / 0.5, 4);
    // 60.000 bis 70.000 € liegt 2026 um die Grenze der Krankenversicherung (69.750 €).
    expect(zeilen.find((z) => z.text.startsWith('60.000'))!.lage).toBe('voll');
    expect(zeilen.some((z) => z.lage === 'gemischt')).toBe(true);
    expect(LAGE_TEXT.gemischt).toBe('teils über einer Beitragsgrenze');
  });
});

describe('gruppenZeilen — weit gestreute Gehälter', () => {
  it('breitere Bänder, bis die Tabelle höchstens zwölf Zeilen hat', () => {
    // 25.000 bis 142.000 €: in 10.000er-Bändern wären es 13 Zeilen.
    const weit = Array.from({ length: 40 }, (_, i) => ({ name: '', anzahl: 1, jahresbrutto: 25_000 + i * 3_000 }));
    const { zeilen } = gruppenZeilen(check(weit).gruppen);
    expect(zeilen.length).toBeLessThanOrEqual(12);
    expect(zeilen[0]!.text).toBe('20.000 bis unter 40.000 €');
    expect(zeilen.reduce((n, z) => n + z.anzahl, 0)).toBe(40);
  });

  it('auch mit einem Vorstandsgehalt bleibt sie kurz', () => {
    const gruppen = [
      ...Array.from({ length: 14 }, (_, i) => ({ name: '', anzahl: 3, jahresbrutto: 30_000 + i * 6_000 })),
      { name: '', anzahl: 1, jahresbrutto: 2_400_000 },
    ];
    const { zeilen } = gruppenZeilen(check(gruppen).gruppen);
    expect(zeilen.length).toBeLessThanOrEqual(12);
    expect(zeilen.at(-1)!.anzahl).toBe(1);
    expect(zeilen.reduce((n, z) => n + z.anzahl, 0)).toBe(43);
  });
});

describe('durchschnittsGruppe — „ein Beispiel-Mitarbeiter mal n“', () => {
  it('alle Köpfe mit dem Durchschnittsgehalt', () => {
    const d = durchschnittsGruppe(BEISPIEL_GRUPPEN)!;
    expect(d.anzahl).toBe(34);
    expect(d.jahresbrutto).toBeCloseTo((18 * 38_000 + 8 * 48_000 + 6 * 82_000 + 2 * 120_000) / 34, 6);
  });

  it('für das Beispiel rechnet der Durchschnitt zu billig', () => {
    const genau = check(BEISPIEL_GRUPPEN).szenarien[0]!.agNettoJahr;
    const schnitt = check([durchschnittsGruppe(BEISPIEL_GRUPPEN)!]).szenarien[0]!.agNettoJahr;
    expect(genau).toBeGreaterThan(schnitt * 1.1);
  });

  it('ohne Belegschaft: keiner', () => {
    expect(durchschnittsGruppe([{ name: '', anzahl: 0, jahresbrutto: 40_000 }])).toBeNull();
  });
});

describe('lohnlisteText — der Satz unter der eingefügten Liste', () => {
  it('Monatsgehälter', () => {
    expect(lohnlisteText(lohnlisteLesen('Name;Brutto\nA;3.450\nB;3.450\nC;5.200', 13), 13))
      .toBe('3 Mitarbeiter in 2 Gehaltsgruppen erkannt. Monatsgehälter, mit 13 aufs Jahr gerechnet. 1 Zeile ohne Gehalt übersprungen.');
    expect(lohnlisteText(lohnlisteLesen('3.000', 12.5), 12.5))
      .toBe('1 Mitarbeiter in 1 Gehaltsgruppe erkannt. Monatsgehälter, mit 12,5 aufs Jahr gerechnet.');
  });

  it('Jahresgehälter in Gruppen', () => {
    expect(lohnlisteText(lohnlisteLesen('Produktion;1200;38000\nVertrieb;4;62000'), 12))
      .toBe('1.204 Mitarbeiter in 2 Gehaltsgruppen erkannt.');
  });

  it('nichts Brauchbares und nichts eingegeben', () => {
    expect(lohnlisteText(lohnlisteLesen('Lohnliste\nSumme'), 12)).toBe('Darin steht kein Gehalt. Je Zeile ein Gehalt — oder Anzahl und Gehalt.');
    expect(lohnlisteText(lohnlisteLesen(''), 12)).toBe('');
  });
});
