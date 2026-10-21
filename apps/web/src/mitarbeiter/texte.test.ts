import { describe, expect, it } from 'vitest';
import { firmenAngebotSchema } from '@renten/schema';
import { euroText, fazitText, festePunkte, firmenHinweise, minderungText, regelFuerVereinbarung, regelText, traegerText, vertragName } from './texte';
import type { KennzahlenErgebnis, KennzahlenWeg, MinderungHerleitung } from './rechnung';

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

describe('Fazit und Herleitung', () => {
  const weg = (art: KennzahlenWeg['art'], x: Partial<KennzahlenWeg>): KennzahlenWeg => ({
    art, netto: 231.57, summeEinzahlung: 32_203.85, summeAuszahlung: 50_018.13, nettoHebel: 1.5532, rendite: 0.01965,
    echterGewinn: 17_814.28, amortisationsJahre: 11.59, ...x,
  });
  const k = (x: Partial<KennzahlenErgebnis>): KennzahlenErgebnis => ({
    monateEinzahlung: 303, jahreAuszahlung: 18, lebenserwartung: 85, prognose: null, garantiert: null, kapital: null, ...x,
  });

  it('Prognose mit Garantie und Minderung der gesetzlichen Rente', () => {
    const t = nbsp(fazitText(k({ prognose: weg('prognose', {}), garantiert: weg('garantiert', { nettoHebel: 1.1351, rendite: 0.00566 }) }), 49.61));
    expect(t).toContain('Für jeden Euro, den Sie netto einzahlen, erhalten Sie mit der prognostizierten Rente nach Steuer und Krankenversicherung 1,55 € zurück.');
    expect(t).toContain('Nettorendite von 2,0 % im Jahr');
    expect(t).toContain('Nach 11,6 Jahren Rente sind Ihre Einzahlungen zurückgeflossen; bis 85 bleibt ein Netto-Gewinn von 17.814 €.');
    expect(t).toContain('Schon mit der garantierten Rente sind es 1,14 € je Euro (0,6 % im Jahr).');
    expect(t).toContain('Nicht eingerechnet: Ihre gesetzliche Rente fällt um rund 50 € im Monat geringer aus');
  });

  it('weniger zurück als eingezahlt; Amortisation hinter der Lebenserwartung', () => {
    const t = nbsp(fazitText(k({ garantiert: weg('garantiert', { nettoHebel: 0.85, rendite: -0.012, amortisationsJahre: 21.2 }) }), 0));
    expect(t).toContain('mit der garantierten Rente');
    expect(t).toContain('0,85 € zurück — weniger, als Sie einzahlen.');
    expect(t).toContain('erst nach 21,2 Jahren Rente zurück — später, als bis zum Alter von 85 gerechnet.');
    expect(t).not.toContain('Nicht eingerechnet');
    expect(fazitText(k({}), 50)).toBe('');
  });

  it('So gerechnet: die Minderung Schritt für Schritt', () => {
    const m: MinderungHerleitung = {
      svFreiJahr: 2400, durchschnittsentgelt: 51_944, entgeltpunkteJeJahr: 2400 / 51_944, jahre: 25.25,
      entgeltpunkte: (2400 / 51_944) * 25.25, rentenwert: 42.52, renteMonat: (2400 / 51_944) * 25.25 * 42.52, ueberBbg: false,
    };
    const t = nbsp(minderungText(m));
    expect(t).toContain('2.400 € beitragsfreie Umwandlung im Jahr ÷ Durchschnittsentgelt 51.944 € = 0,0462 Entgeltpunkte weniger je Jahr.');
    expect(t).toContain('× 25,25 Jahre vom Beginn bis zum Rentenbeginn = 1,17 Entgeltpunkte. × Rentenwert 42,52 € = 49,61 € weniger Rente im Monat');
    expect(nbsp(minderungText({ ...m, ueberBbg: true }))).toContain('kostet keine Entgeltpunkte');
  });
});
