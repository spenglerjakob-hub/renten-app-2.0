import { describe, expect, it } from 'vitest';
import { beratungDatenSchema, firmenAngebotSchema } from '@renten/schema';
import type { Beratung, Firma } from '../lib/bav-beratung';
import {
  belastungsZeilen, csvDateiname, csvZelle, durchdringung, durchdringungText, quoteText, satzText, uebersichtCsv, uebersichtSummen,
  uebersichtZeilen,
} from './uebersicht-daten';
import { P } from './rechnung';

const firma: Firma = {
  id: 'f', name: 'Muster GmbH', logoPfad: null, geaendertAm: '', besitzer: 'a', eigene: true, buero: null,
  angebot: firmenAngebotSchema.parse({ modell: { art: 'zuschuss', quote: 0.5, deckelMonat: 100 } }),
};

const beratung = (id: string, name: string, status: Beratung['status'], umwandlungMonat: number, beginn = ''): Beratung => ({
  id, firma: 'f', mitarbeiter: name, status, beratenAm: null, geaendertAm: '', besitzer: 'a', eigene: true,
  daten: beratungDatenSchema.parse({
    angaben: { name, geburtsdatum: '01.01.1990', jahresbrutto: 48_000 },
    umwandlungMonat,
    entscheidung: { status, beginn },
  }),
});

const liste = [
  beratung('1', 'Zora Zander', 'teilnahme', 150, '01.01.2027'),
  beratung('2', 'Anna Beispiel', 'teilnahme', 250, '01.02.2027'),
  beratung('3', 'Ben Muster', 'verzicht', 150),
  beratung('4', 'Carla Offen', 'offen', 100),
];

describe('Übersicht für den Arbeitgeber', () => {
  it('nur Teilnahmen tragen Beträge; Arbeitgeberanteil nach der Regel der Firma', () => {
    const z = uebersichtZeilen(firma, liste);
    expect(z.map((x) => x.name)).toEqual(['Anna Beispiel', 'Ben Muster', 'Carla Offen', 'Zora Zander']);
    const anna = z[0]!;
    expect(anna.umwandlungMonat).toBe(250);
    expect(anna.arbeitgeberMonat).toBeCloseTo(100, 6); // 50 %, gedeckelt bei 100 €
    expect(anna.gesamtMonat).toBeCloseTo(350, 6);
    expect(z[1]!.umwandlungMonat).toBe(0);
    expect(z[2]!.gesamtMonat).toBe(0);
  });

  it('Summen', () => {
    const s = uebersichtSummen(uebersichtZeilen(firma, liste));
    expect(s).toMatchObject({ teilnahmen: 2, verzichte: 1, offen: 1, umwandlungMonat: 400 });
    expect(s.arbeitgeberMonat).toBeCloseTo(175, 6);
  });

  it('CSV: BOM, Semikolon, Komma als Dezimaltrenner, Kopfzeile', () => {
    const csv = uebersichtCsv(uebersichtZeilen(firma, liste));
    expect(csv.startsWith('﻿"Name";"Entscheidung";')).toBe(true);
    expect(csv).toContain('"Anna Beispiel";"Teilnahme";250,00;100,00;350,00;"01.02.2027"\r\n');
    expect(csv).toContain('"Ben Muster";"Verzicht";0,00;0,00;0,00;""');
    expect(csv.split('\r\n')).toHaveLength(6);
  });

  it('CSV: keine Formeln aus Namen, Anführungszeichen verdoppelt', () => {
    expect(csvZelle('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvZelle('-1+2')).toBe('"\'-1+2"');
    expect(csvZelle('Müller "Mo"')).toBe('"Müller ""Mo"""');
  });

  it('Dateiname ohne Sonderzeichen', () => {
    expect(csvDateiname('Müller & Söhne GmbH', new Date('2026-10-21T10:00:00Z'))).toBe('bAV-Uebersicht-Muller-Sohne-GmbH-2026-10-21.csv');
  });
});

describe('Netto-Belastung des Arbeitgebers', () => {
  it('Summe über die Teilnahmen: Beitrag − gesparte Sozialabgaben − Umlagen − Steuer', () => {
    const s = uebersichtSummen(uebersichtZeilen(firma, liste));
    const b = s.belastung;
    expect(b.beitragMonat).toBeCloseTo(s.arbeitgeberMonat, 6);
    expect(b.svErsparnisMonat).toBeGreaterThan(0);
    expect(b.umlagenErsparnisMonat).toBe(0); // Vorgabe: ohne Umlagen
    expect(b.beitragMonat - b.svErsparnisMonat - b.umlagenErsparnisMonat).toBeCloseTo(b.kostenVorSteuerMonat, 6);
    expect(b.steuerersparnisMonat).toBeCloseTo(b.kostenVorSteuerMonat * 0.3, 6); // Vorgabe: 30 %
    expect(b.kostenVorSteuerMonat - b.steuerersparnisMonat).toBeCloseTo(b.nettoKostenMonat, 6);
    expect(b.nettoKostenMonat).toBeGreaterThan(0);
    expect(b.nettoKostenMonat).toBeLessThan(s.arbeitgeberMonat / 2);
  });

  it('Verzicht und offen kosten nichts; die Summe ist die der Teilnahmen', () => {
    const z = uebersichtZeilen(firma, liste);
    expect(z.find((x) => x.status === 'verzicht')!.belastung.nettoKostenMonat).toBe(0);
    expect(z.find((x) => x.status === 'offen')!.belastung.beitragMonat).toBe(0);
    const nurTeilnahmen = z.filter((x) => x.status === 'teilnahme').reduce((n, x) => n + x.belastung.nettoKostenMonat, 0);
    expect(uebersichtSummen(z).belastung.nettoKostenMonat).toBeCloseTo(nurTeilnahmen, 9);
  });

  it('mit dem Steuersatz und den Umlagen der Firma', () => {
    const mit = { ...firma, angebot: { ...firma.angebot, unternehmensSteuersatz: 0.15, umlagenSatz: 0.03 } };
    const vorgabe = uebersichtSummen(uebersichtZeilen(firma, liste)).belastung;
    const b = uebersichtSummen(uebersichtZeilen(mit, liste)).belastung;
    expect(b.beitragMonat).toBeCloseTo(vorgabe.beitragMonat, 9);
    expect(b.svErsparnisMonat).toBeCloseTo(vorgabe.svErsparnisMonat, 9);
    // Beitragsfrei sind 4 % der BBG, der Zuschuss zaehlt zuerst: Zora ganz, Anna (250 + 100) nur bis zum Rahmen.
    const rahmen = (0.04 * P.bbgRvJahr) / 12;
    expect(b.umlagenErsparnisMonat).toBeCloseTo((150 + Math.min(250, rahmen - 100)) * 0.03, 6);
    expect(b.umlagenErsparnisMonat).toBeLessThan(400 * 0.03);
    expect(b.steuerersparnisMonat).toBeCloseTo(b.kostenVorSteuerMonat * 0.15, 6);
  });

  it('die CSV bleibt, wie sie war — ohne die Belastung', () => {
    const csv = uebersichtCsv(uebersichtZeilen(firma, liste));
    expect(csv.split('\r\n')[0]).toBe('﻿"Name";"Entscheidung";"Umwandlung je Monat";"Arbeitgeberanteil je Monat";"Beitrag gesamt je Monat";"Beginn"');
  });
});

describe('Durchdringungsquote', () => {
  const summen = uebersichtSummen(uebersichtZeilen(firma, liste)); // 2 Teilnahmen, 1 Verzicht, 1 offen

  it('ohne Belegschaft im Angebot: alle Mitarbeiter in der Liste, auch Verzicht und offen', () => {
    expect(durchdringung(summen, 0)).toEqual({ teilnahmen: 2, belegschaft: 4, quelle: 'liste', angebotZuKlein: false, quote: 0.5 });
    expect(quoteText(0.5)).toBe('50 %');
  });

  it('mit Belegschaft: Teilnahmen je Mitarbeiter im Unternehmen', () => {
    const d = durchdringung(summen, 12);
    expect(d).toMatchObject({ belegschaft: 12, quelle: 'angebot', angebotZuKlein: false });
    expect(d.quote).toBeCloseTo(2 / 12, 9);
    expect(quoteText(d.quote)).toBe('17 %');
  });

  it('eine Belegschaft kleiner als die Liste zählt nicht — nie über 100 %', () => {
    const d = durchdringung(summen, 3);
    expect(d).toMatchObject({ belegschaft: 4, quelle: 'liste', angebotZuKlein: true, quote: 0.5 });
    expect(durchdringung(summen, 4)).toMatchObject({ belegschaft: 4, quelle: 'angebot', angebotZuKlein: false });
  });

  it('ohne Beratungen: keine Quote', () => {
    const leer = uebersichtSummen([]);
    expect(durchdringung(leer, 0).quote).toBeNull();
    expect(durchdringung(leer, 10).quote).toBe(0);
    expect(quoteText(null)).toBe('—');
  });
});

describe('Texte der Übersicht', () => {
  const summen = uebersichtSummen(uebersichtZeilen(firma, liste));

  it('Durchdringung in Worten — mit der Herkunft der Zahl', () => {
    expect(durchdringungText(durchdringung(summen, 0))).toBe('2 von 4 Mitarbeitern in der Liste nutzen das Angebot.');
    expect(durchdringungText(durchdringung(summen, 12))).toBe('2 von 12 Mitarbeitern im Unternehmen nutzen das Angebot.');
    const eine = uebersichtSummen(uebersichtZeilen(firma, [liste[0]!]));
    expect(durchdringungText(durchdringung(eine, 0))).toBe('1 von 1 Mitarbeiter in der Liste nutzt das Angebot.');
  });

  it('Sätze der Firma', () => {
    expect(satzText(0.3)).toBe('30 %');
    expect(satzText(0.255)).toBe('25,5 %');
    expect(satzText(0.0215)).toBe('2,2 %');
  });

  it('Aufstellung: Zeilen ergeben die Netto-Belastung, Umlagen nur mit Satz', () => {
    const z = belastungsZeilen(summen.belastung, firma.angebot);
    expect(z.map((x) => x.text)).toEqual([
      'Beitrag des Arbeitgebers', '− gesparte Sozialabgaben durch die Entgeltumwandlung', '= Aufwand vor Steuern',
      '− Steuerersparnis als Betriebsausgabe (30 %)', '= Netto-Belastung',
    ]);
    expect(z[0]!.monat - z[1]!.monat).toBeCloseTo(z[2]!.monat, 9);
    expect(z[2]!.monat - z[3]!.monat).toBeCloseTo(z[4]!.monat, 9);
    expect(z.map((x) => x.art)).toEqual(['posten', 'posten', 'zwischensumme', 'posten', 'summe']);

    const mitUmlagen = belastungsZeilen(summen.belastung, { unternehmensSteuersatz: 0.3, umlagenSatz: 0.025 });
    expect(mitUmlagen[2]!.text).toBe('− gesparte Umlagen (2,5 %)');
  });

  it('übersteigt die Ersparnis den Beitrag, heißt es Ersparnis — Beträge ohne Vorzeichen', () => {
    const b = { beitragMonat: 22.5, svErsparnisMonat: 31.7, umlagenErsparnisMonat: 0, kostenVorSteuerMonat: -9.2, steuerersparnisMonat: -2.76, nettoKostenMonat: -6.44 };
    const z = belastungsZeilen(b, { unternehmensSteuersatz: 0.3, umlagenSatz: 0 });
    expect(z.map((x) => x.text)).toEqual([
      'Beitrag des Arbeitgebers', '− gesparte Sozialabgaben durch die Entgeltumwandlung', '= Ersparnis vor Steuern',
      '− Steuer auf die Ersparnis (30 %)', '= Netto-Ersparnis',
    ]);
    expect(z.map((x) => x.monat)).toEqual([22.5, 31.7, 9.2, 2.76, 6.44]);
  });
});
