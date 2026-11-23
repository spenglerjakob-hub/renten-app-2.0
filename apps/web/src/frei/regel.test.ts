import { describe, expect, it } from 'vitest';
import { FREI_STUFEN_MAX } from '@renten/schema';
import {
  FREI_LEER, anteilText, freiHatRegel, freiRegelAus, freiRegelHinweise, freiRegelKurz, regelBeimFirmenwechsel, regelGleich, stufeHinzu,
  stufeMoeglich, stufenText,
} from './regel';

const BEISPIEL = { quote: 0.2, deckelMonat: 0, stufen: [{ abMonat: 50, betragMonat: 25 }, { abMonat: 70, betragMonat: 30 }] };

describe('Das individuelle Modell — die Regel in Worten', () => {
  it('ohne Vorbelegung: leer, und das heißt nur der gesetzliche Zuschuss', () => {
    expect(FREI_LEER).toEqual({ quote: 0, deckelMonat: 0, stufen: [] });
    expect(freiHatRegel(FREI_LEER)).toBe(false);
    expect(freiRegelKurz(FREI_LEER)).toBe('nur der gesetzliche Pflichtzuschuss');
    expect(freiHatRegel({ ...FREI_LEER, stufen: [{ abMonat: 50, betragMonat: 0 }] })).toBe(false);
  });

  it('Stufen und Anteil — das Beispiel: ab 50 € 25 €, ab 70 € 30 €, dazu 20 %', () => {
    expect(stufenText(BEISPIEL.stufen)).toBe('ab 50 € Umwandlung 25 € im Monat, ab 70 € 30 €');
    expect(anteilText(BEISPIEL)).toBe('20 % der Umwandlung');
    expect(freiRegelKurz(BEISPIEL)).toBe('fester Zuschuss ab 50 € Umwandlung 25 € im Monat, ab 70 € 30 €; dazu 20 % der Umwandlung');
    expect(freiHatRegel(BEISPIEL)).toBe(true);
  });

  it('nur Anteil, mit Deckel — nur Stufen, unsortiert eingegeben', () => {
    expect(freiRegelKurz({ quote: 0.255, deckelMonat: 80, stufen: [] })).toBe('25,5 % der Umwandlung (höchstens 80 € im Monat)');
    expect(freiRegelKurz({ quote: 0, deckelMonat: 0, stufen: [{ abMonat: 100, betragMonat: 40 }, { abMonat: 50, betragMonat: 12.5 }] }))
      .toBe('fester Zuschuss ab 50 € Umwandlung 12,50 € im Monat, ab 100 € 40 €');
  });

  it('eine Stufe ohne Betrag steht nicht im Text', () => {
    expect(stufenText([{ abMonat: 50, betragMonat: 25 }, { abMonat: 100, betragMonat: 0 }])).toBe('ab 50 € Umwandlung 25 € im Monat');
  });
});

describe('Stufen anlegen', () => {
  it('die erste bei 50 €, jede weitere 50 € über der höchsten — ohne Betrag', () => {
    const eine = stufeHinzu([]);
    expect(eine).toEqual([{ abMonat: 50, betragMonat: 0 }]);
    expect(stufeHinzu([{ abMonat: 70, betragMonat: 30 }, { abMonat: 50, betragMonat: 25 }]).at(-1)).toEqual({ abMonat: 120, betragMonat: 0 });
  });

  it('höchstens so viele, wie das Angebot der Firma aufnimmt', () => {
    let s = stufeHinzu([]);
    for (let i = 0; i < 20; i++) s = stufeHinzu(s);
    expect(s).toHaveLength(FREI_STUFEN_MAX);
    expect(stufeMoeglich(s)).toBe(false);
  });
});

describe('Was an der Eingabe auffällt', () => {
  it('nichts beim Beispiel', () => {
    expect(freiRegelHinweise(BEISPIEL)).toEqual([]);
  });

  it('zwei Stufen auf derselben Schwelle; eine höhere Stufe mit kleinerem Betrag', () => {
    expect(freiRegelHinweise({ ...BEISPIEL, stufen: [{ abMonat: 50, betragMonat: 25 }, { abMonat: 50, betragMonat: 30 }] }))
      .toEqual(['Zwei Stufen beginnen bei 50 € — es gilt die untere Zeile.']);
    expect(freiRegelHinweise({ ...BEISPIEL, stufen: [{ abMonat: 50, betragMonat: 25 }, { abMonat: 70, betragMonat: 20 }] }))
      .toEqual(['Ab 70 € gibt es weniger als in der Stufe davor — wer mehr umwandelt, bekäme weniger.']);
  });
});

describe('Regel aus gespeichertem JSON', () => {
  it('liest, begrenzt und verwirft Unlesbares', () => {
    expect(freiRegelAus(BEISPIEL)).toEqual(BEISPIEL);
    expect(freiRegelAus(null)).toEqual(FREI_LEER);
    expect(freiRegelAus({ quote: 7, deckelMonat: -3, stufen: [{ abMonat: '50', betragMonat: 25 }, 'x', { abMonat: 1e9, betragMonat: 30 }] }))
      .toEqual({ quote: 1, deckelMonat: 0, stufen: [{ abMonat: 0, betragMonat: 25 }, { abMonat: 10_000, betragMonat: 30 }] });
    expect(freiRegelAus({ stufen: Array.from({ length: 40 }, () => ({ abMonat: 1, betragMonat: 1 })) }).stufen).toHaveLength(FREI_STUFEN_MAX);
  });
});

describe('Die Regel beim Wechsel der Firma', () => {
  const A = { quote: 0.1, deckelMonat: 40, stufen: [{ abMonat: 100, betragMonat: 50 }] };

  it('leere Seite: Die Regel der Firma kommt mit ihr — ohne Regel bleibt es leer', () => {
    expect(regelBeimFirmenwechsel(FREI_LEER, null, A)).toEqual(A);
    expect(regelBeimFirmenwechsel(FREI_LEER, null, null)).toBe(FREI_LEER);
  });

  it('unberührt von der vorigen Firma: Die Regel wechselt mit — nie die einer anderen Firma unter ihrem Namen', () => {
    expect(regelBeimFirmenwechsel({ ...A, stufen: [...A.stufen] }, A, BEISPIEL)).toEqual(BEISPIEL);
    expect(regelBeimFirmenwechsel(A, A, null)).toBe(FREI_LEER);
    // Die Regel der vorigen Firma von Hand geleert: Auch dann kommt die der neuen.
    expect(regelBeimFirmenwechsel({ ...FREI_LEER, stufen: [] }, A, BEISPIEL)).toEqual(BEISPIEL);
  });

  it('selbst eingestellt: bleibt, wohin auch immer gewechselt wird', () => {
    const eigene = { ...A, quote: 0.3 };
    expect(regelBeimFirmenwechsel(eigene, A, BEISPIEL)).toBe(eigene);
    expect(regelBeimFirmenwechsel(eigene, null, BEISPIEL)).toBe(eigene);
    expect(regelBeimFirmenwechsel(eigene, A, null)).toBe(eigene);
    // Auch eine angelegte Stufe ohne Betrag ist schon Eingabe.
    const begonnen = { ...FREI_LEER, stufen: [{ abMonat: 50, betragMonat: 0 }] };
    expect(regelBeimFirmenwechsel(begonnen, null, A)).toBe(begonnen);
  });

  it('gleich heißt Feld für Feld gleich', () => {
    expect(regelGleich(BEISPIEL, { ...BEISPIEL, stufen: BEISPIEL.stufen.map((s) => ({ ...s })) })).toBe(true);
    expect(regelGleich(BEISPIEL, { ...BEISPIEL, deckelMonat: 10 })).toBe(false);
  });
});
