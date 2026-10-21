import { describe, expect, it } from 'vitest';
import { firmenAngebotSchema } from '@renten/schema';
import { euroText, festePunkte, firmenHinweise, regelFuerVereinbarung, regelText, traegerText, vertragName } from './texte';

const nbsp = (s: string) => s.replace(/\s/g, ' ');

describe('Die Regel der Firma in Worten', () => {
  it('Zuschussmodell mit und ohne Deckel', () => {
    expect(nbsp(regelText({ art: 'zuschuss', quote: 0.5, deckelMonat: 100 })))
      .toBe('Ihr Arbeitgeber gibt 50 % Ihres Beitrags dazu, höchstens 100 € im Monat.');
    expect(nbsp(regelText({ art: 'zuschuss', quote: 0.25, deckelMonat: 0 }))).toBe('Ihr Arbeitgeber gibt 25 % Ihres Beitrags dazu.');
  });

  it('Festbetrag-Modell mit Mindestumwandlung', () => {
    expect(nbsp(regelText({ art: 'festbetrag', festbetragMonat: 50, mindestUmwandlungMonat: 50 })))
      .toBe('Ihr Arbeitgeber gibt 50 € im Monat dazu, wenn Sie mindestens 50 € umwandeln.');
  });

  it('Matching-Modell: mit und ohne Pflichtzuschuss im Betrag, Umwandlung in die Unterstützungskasse', () => {
    expect(nbsp(regelText({ art: 'matching', weg: 'dv', matchingMonat: 100, zuschussImMatching: false })))
      .toContain('dazu den gesetzlichen Zuschuss von 15 %');
    expect(nbsp(regelText({ art: 'matching', weg: 'dv', matchingMonat: 100, zuschussImMatching: true })))
      .toContain('einschließlich des gesetzlichen Zuschusses');
    expect(nbsp(regelText({ art: 'matching', weg: 'ukasse', matchingMonat: 100, zuschussImMatching: false })))
      .toContain('Ihre Umwandlung fließt ebenfalls dorthin');
  });

  it('dieselbe Regel für die Vereinbarung — mit dem Pflichtzuschuss, außer bei reiner Unterstützungskasse', () => {
    expect(nbsp(regelFuerVereinbarung({ art: 'zuschuss', quote: 0.5, deckelMonat: 100 })))
      .toBe('Der Arbeitgeber zahlt zusätzlich 50 % der Umwandlung, höchstens 100 € im Monat, mindestens den Zuschuss nach § 1a Abs. 1a BetrAVG.');
    expect(nbsp(regelFuerVereinbarung({ art: 'festbetrag', festbetragMonat: 50, mindestUmwandlungMonat: 0 })))
      .toBe('Der Arbeitgeber zahlt zusätzlich 50 € im Monat, mindestens den Zuschuss nach § 1a Abs. 1a BetrAVG.');
    expect(nbsp(regelFuerVereinbarung({ art: 'matching', weg: 'ukasse', matchingMonat: 100, zuschussImMatching: false })))
      .toBe('Der Arbeitgeber zahlt 100 € im Monat in die Unterstützungskasse.');
  });

  it('Beträge: ganze Euro ohne Nachkommastellen, sonst mit', () => {
    expect(nbsp(euroText(100))).toBe('100 €');
    expect(nbsp(euroText(12.5))).toBe('12,50 €');
  });
});

describe('Vertrag, Träger und Hinweise', () => {
  const a = firmenAngebotSchema.parse({
    durchfuehrungsweg: 'pensionskasse', versicherer: 'Muster Leben AG', tarif: 'Klassik Plus', ukasse: 'Muster U-Kasse e. V.',
    hinweise: '• Beginn immer zum Monatsersten\n\n- Dynamik 2 % möglich ',
  });

  it('Namen und Träger je Vertrag', () => {
    expect(vertragName('direkt', a)).toBe('Pensionskasse');
    expect(vertragName('ukasse', a)).toBe('Unterstützungskasse');
    expect(traegerText('direkt', a)).toBe('Muster Leben AG, Tarif Klassik Plus');
    expect(traegerText('ukasse', a)).toBe('Muster U-Kasse e. V.');
  });

  it('Hinweise der Firma je Zeile, ohne Aufzählungszeichen', () => {
    expect(firmenHinweise(a)).toEqual(['Beginn immer zum Monatsersten', 'Dynamik 2 % möglich']);
  });

  it('feste Punkte je Modell: Mitnahme nur mit Direktversicherung', () => {
    expect(festePunkte(a).some((p) => p.includes('nehmen Sie die Pensionskasse mit'))).toBe(true);
    const uk = firmenAngebotSchema.parse({ modell: { art: 'matching', weg: 'ukasse' } });
    expect(festePunkte(uk).some((p) => p.includes('nehmen Sie'))).toBe(false);
    expect(festePunkte(uk).some((p) => p.includes('drei Jahre'))).toBe(true);
  });
});
