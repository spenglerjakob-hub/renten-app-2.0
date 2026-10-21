import { describe, expect, it } from 'vitest';
import { beratungDatenSchema, firmenAngebotSchema } from '@renten/schema';
import type { Beratung, Firma } from '../lib/bav-beratung';
import { csvDateiname, csvZelle, uebersichtCsv, uebersichtSummen, uebersichtZeilen } from './uebersicht-daten';

const firma: Firma = {
  id: 'f', name: 'Muster GmbH', logoPfad: null, geaendertAm: '',
  angebot: firmenAngebotSchema.parse({ modell: { art: 'zuschuss', quote: 0.5, deckelMonat: 100 } }),
};

const beratung = (id: string, name: string, status: Beratung['status'], umwandlungMonat: number, beginn = ''): Beratung => ({
  id, firma: 'f', mitarbeiter: name, status, beratenAm: null, geaendertAm: '',
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
