import { describe, expect, it } from 'vitest';
import { firmenAngebotSchema, type FirmenModellDaten } from '@renten/schema';
import {
  MODELL_NAME, euroText, fazitText, festePunkte, firmenHinweise, mindestzuschussText, modellNameNachDas, regelFuerVereinbarung, regelKern,
  regelText, reglerErklaerung, traegerText, vertragName,
} from './texte';
import type { KennzahlenErgebnis, KennzahlenWeg } from './rechnung';

const nbsp = (s: string) => s.replace(/\s/g, ' ');
/** Das Beispiel des individuellen Modells: ab 50 € Umwandlung 25 € fest, ab 70 € 30 € — dazu 20 % der ganzen Umwandlung. */
const FREI: FirmenModellDaten = { art: 'frei', quote: 0.2, deckelMonat: 0, stufen: [{ abMonat: 50, betragMonat: 25 }, { abMonat: 70, betragMonat: 30 }] };

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
    // Die gesetzliche Rente: allgemein, ohne Betrag und ohne Verweis auf eine Rechnung
    expect(festePunkte(a)).toContain(
      'Auf den beitragsfreien Teil Ihrer Umwandlung zahlen Sie keine Rentenbeiträge; Ihre gesetzliche Rente fällt dadurch etwas niedriger aus.',
    );
    expect(festePunkte(a).some((p) => p.includes('die Rechnung zeigt'))).toBe(false);
  });
});

describe('Fazit und Herleitung', () => {
  const weg = (art: KennzahlenWeg['art'], x: Partial<KennzahlenWeg>): KennzahlenWeg => ({
    art, netto: 231.57, summeEinzahlung: 32_203.85, summeAuszahlung: 50_018.13, nettoHebel: 1.5532, rendite: 0.01965,
    echterGewinn: 17_814.28, amortisationsJahre: 11.59, ...x,
  });
  const k = (x: Partial<KennzahlenErgebnis>): KennzahlenErgebnis => ({
    monateEinzahlung: 303, jahreAuszahlung: 18, lebenserwartung: 85, geschaetzt: false, prognose: null, garantiert: null, kapital: null, ...x,
  });

  it('aus der geschätzten Hochrechnung: so benannt, mit dem Hinweis „keine Zusage“', () => {
    const t = nbsp(fazitText(k({ geschaetzt: true, prognose: weg('prognose', {}) })));
    expect(t).toContain('erhalten Sie mit der geschätzten Rente aus der Hochrechnung nach Steuer und Krankenversicherung 1,55 € zurück.');
    expect(t).toContain('Die Werte beruhen auf der beispielhaften, geschätzten Hochrechnung — keine Zusage.');
    expect(nbsp(fazitText(k({ prognose: weg('prognose', {}) })))).not.toContain('geschätzt');
  });

  it('Prognose mit Garantie — ohne Minderung der gesetzlichen Rente', () => {
    const t = nbsp(fazitText(k({ prognose: weg('prognose', {}), garantiert: weg('garantiert', { nettoHebel: 1.1351, rendite: 0.00566 }) })));
    expect(t).toContain('Für jeden Euro, den Sie netto einzahlen, erhalten Sie mit der prognostizierten Rente nach Steuer und Krankenversicherung 1,55 € zurück.');
    expect(t).toContain('Nettorendite von 2,0 % im Jahr');
    expect(t).toContain('Nach 11,6 Jahren Rente sind Ihre Einzahlungen zurückgeflossen; bis 85 bleibt ein Netto-Gewinn von 17.814 €.');
    expect(t).toContain('Schon mit der garantierten Rente sind es 1,14 € je Euro (0,6 % im Jahr).');
    expect(t).not.toContain('gesetzliche Rente fällt');
    expect(t).not.toContain('Nicht eingerechnet');
  });

  it('weniger zurück als eingezahlt; Amortisation hinter der Lebenserwartung', () => {
    const t = nbsp(fazitText(k({ garantiert: weg('garantiert', { nettoHebel: 0.85, rendite: -0.012, amortisationsJahre: 21.2 }) })));
    expect(t).toContain('mit der garantierten Rente');
    expect(t).toContain('0,85 € zurück — weniger, als Sie einzahlen.');
    expect(t).toContain('erst nach 21,2 Jahren Rente zurück — später, als bis zum Alter von 85 gerechnet.');
    expect(t).not.toContain('Nicht eingerechnet');
    expect(fazitText(k({}))).toBe('');
  });
});

describe('regelKern', () => {
  it('steht woertlich in der Regel — fuer jedes Modell', () => {
    const modelle: FirmenModellDaten[] = [
      { art: 'zuschuss', quote: 0.5, deckelMonat: 100 },
      { art: 'zuschuss', quote: 0.3, deckelMonat: 0 },
      { art: 'festbetrag', festbetragMonat: 50, mindestUmwandlungMonat: 50 },
      { art: 'matching', weg: 'dv', matchingMonat: 100, zuschussImMatching: false },
      { art: 'matching', weg: 'ukasse', matchingMonat: 80, zuschussImMatching: false },
      FREI,
      { art: 'frei', quote: 0, deckelMonat: 0, stufen: FREI.stufen },
      { art: 'frei', quote: 0.25, deckelMonat: 60, stufen: [] },
      { art: 'frei', quote: 0, deckelMonat: 0, stufen: [] },
    ];
    for (const m of modelle) expect(regelText(m)).toContain(regelKern(m));
  });
});

describe('Individuelles Modell in Worten', () => {
  it('Stufen und Anteil zusammen — das Beispiel: ab 50 € 25 €, ab 70 € 30 €, dazu 20 %', () => {
    expect(nbsp(regelText(FREI))).toBe(
      'Ihr Arbeitgeber gibt 20 % Ihres Beitrags dazu und obendrauf einen festen Zuschuss: ab 50 € Umwandlung 25 € im Monat, ab 70 € 30 €.',
    );
    expect(nbsp(regelFuerVereinbarung(FREI))).toBe(
      'Der Arbeitgeber zahlt zusätzlich 20 % der Umwandlung und einen festen Zuschuss nach der Höhe der Umwandlung '
      + '(ab 50 € Umwandlung 25 € im Monat, ab 70 € 30 €; es gilt die höchste erreichte Stufe), mindestens den Zuschuss nach § 1a Abs. 1a BetrAVG.',
    );
    expect(MODELL_NAME.frei).toBe('Individuelles Modell');
    expect(modellNameNachDas('frei')).toBe('individuelle Modell');
    expect(modellNameNachDas('zuschuss')).toBe('Zuschussmodell');
  });

  it('nur Stufen, nur Anteil (mit Deckel), nichts davon', () => {
    expect(nbsp(regelText({ art: 'frei', quote: 0, deckelMonat: 0, stufen: FREI.stufen })))
      .toBe('Ihr Arbeitgeber gibt einen festen Zuschuss dazu: ab 50 € Umwandlung 25 € im Monat, ab 70 € 30 €.');
    expect(nbsp(regelText({ art: 'frei', quote: 0.25, deckelMonat: 60, stufen: [] })))
      .toBe('Ihr Arbeitgeber gibt 25 % Ihres Beitrags (höchstens 60 € im Monat) dazu.');
    expect(nbsp(regelText({ art: 'frei', quote: 0, deckelMonat: 0, stufen: [] })))
      .toBe('Ihr Arbeitgeber zahlt den gesetzlichen Zuschuss von 15 %, soweit er Sozialabgaben spart.');
    expect(nbsp(regelFuerVereinbarung({ art: 'frei', quote: 0, deckelMonat: 0, stufen: [] })))
      .toBe('Der Arbeitgeber zahlt den Zuschuss nach § 1a Abs. 1a BetrAVG.');
  });

  it('die Stufen stehen aufsteigend da, wie auch immer sie eingetragen sind; Stufen ohne Betrag fallen weg', () => {
    const m: FirmenModellDaten = { art: 'frei', quote: 0, deckelMonat: 0, stufen: [{ abMonat: 100, betragMonat: 40 }, { abMonat: 30, betragMonat: 0 }, { abMonat: 50, betragMonat: 25 }] };
    expect(nbsp(regelText(m))).toBe('Ihr Arbeitgeber gibt einen festen Zuschuss dazu: ab 50 € Umwandlung 25 € im Monat, ab 100 € 40 €.');
  });

  it('gesetzlicher Zuschuss: enthalten, aufgestockt, unter der ersten Stufe', () => {
    const z = (quote: number, mindest: number, regel: number) =>
      ({ quoteMonat: quote, ersparnisMonat: mindest * 1.4, mindestMonat: mindest, regelMonat: regel, aufgestockt: regel + 0.005 < mindest });
    expect(nbsp(mindestzuschussText(z(15, 15, 50), FREI)))
      .toBe('15 % Ihrer Umwandlung sind 15 €. Ihr Arbeitgeber gibt 50 € — der Zuschuss ist darin enthalten.');
    const nurStufe: FirmenModellDaten = { art: 'frei', quote: 0, deckelMonat: 0, stufen: [{ abMonat: 100, betragMonat: 20 }] };
    expect(nbsp(mindestzuschussText(z(30, 30, 20), nurStufe)))
      .toBe('15 % Ihrer Umwandlung sind 30 € — mehr als der Zuschuss nach der Regel Ihres Arbeitgebers (20 €). Ihr Arbeitgeber zahlt deshalb 30 €.');
    expect(nbsp(mindestzuschussText(z(12, 12, 0), nurStufe)))
      .toBe('Nach der Regel Ihres Arbeitgebers gibt es bei dieser Umwandlung noch keinen Zuschuss. Er zahlt den gesetzlichen Zuschuss: 15 % Ihrer Umwandlung sind 12 €.');
    expect(nbsp(mindestzuschussText(z(12, 12, 0), { art: 'frei', quote: 0, deckelMonat: 0, stufen: [] })))
      .toBe('Ihr Arbeitgeber zahlt den gesetzlichen Zuschuss: 15 % Ihrer Umwandlung sind 12 €.');
  });

  it('Gut zu wissen: wie beim Zuschussmodell — Pflichtzuschuss sofort, freiwilliger Teil nach drei Jahren, Vertrag zum Mitnehmen', () => {
    const frei = festePunkte(firmenAngebotSchema.parse({ modell: FREI }));
    expect(frei).toEqual(festePunkte(firmenAngebotSchema.parse({ modell: { art: 'zuschuss' } })));
  });
});


/** Geschuetzte Leerzeichen (vor €) wie normale lesen. */
const n = (s: string) => s.replace(/\u00a0/g, ' ');

describe('Gesetzlicher Mindestzuschuss in Worten', () => {
  const FEST: FirmenModellDaten = { art: 'festbetrag', festbetragMonat: 50, mindestUmwandlungMonat: 50 };
  const z = (quote: number, ersparnis: number, mindest: number, regel: number) =>
    ({ quoteMonat: quote, ersparnisMonat: ersparnis, mindestMonat: mindest, regelMonat: regel, aufgestockt: regel + 0.005 < mindest });

  it('Festbetrag deckt die 15 %', () => {
    expect(n(mindestzuschussText(z(43.2, 61.2, 43.2, 50), FEST)))
      .toBe('15 % Ihrer Umwandlung sind 43,20 €. Ihr Arbeitgeber gibt 50 € — der Zuschuss ist darin enthalten.');
  });

  it('15 % über dem Festbetrag: aufgestockt', () => {
    expect(n(mindestzuschussText(z(54, 60, 54, 50), FEST)))
      .toBe('15 % Ihrer Umwandlung sind 54 € — mehr als der Festbetrag von 50 €. Ihr Arbeitgeber zahlt deshalb 54 €.');
  });

  it('über dem Rahmen: geschuldet ist der Zuschuss, soweit der Arbeitgeber Sozialabgaben spart', () => {
    expect(n(mindestzuschussText(z(90, 59.01, 59.01, 50), FEST))).toBe(
      '15 % Ihrer Umwandlung wären 90 €; geschuldet ist der Zuschuss, soweit Ihr Arbeitgeber Sozialabgaben spart: 59,01 € '
      + '— mehr als der Festbetrag von 50 €. Ihr Arbeitgeber zahlt deshalb 59,01 €.',
    );
    // Deckt die Regel auch den begrenzten Zuschuss, steht das so da
    expect(n(mindestzuschussText(z(90, 59.01, 59.01, 100), { art: 'zuschuss', quote: 0.5, deckelMonat: 100 }))).toBe(
      '15 % Ihrer Umwandlung wären 90 €; geschuldet ist der Zuschuss, soweit Ihr Arbeitgeber Sozialabgaben spart: 59,01 €. '
      + 'Ihr Arbeitgeber gibt 100 € — der Zuschuss ist darin enthalten.',
    );
  });

  it('Festbetrag erst ab der Mindestumwandlung', () => {
    expect(n(mindestzuschussText(z(6, 8.5, 6, 0), FEST)))
      .toBe('Den Festbetrag gibt es ab 50 € Umwandlung. Bis dahin zahlt Ihr Arbeitgeber den gesetzlichen Zuschuss: 15 % Ihrer Umwandlung sind 6 €.');
  });

  it('Zuschuss unter 15 %, Deckel darunter, Matching mit und ohne enthaltenen Zuschuss', () => {
    expect(n(mindestzuschussText(z(30, 42, 30, 20), { art: 'zuschuss', quote: 0.1, deckelMonat: 0 })))
      .toBe('15 % Ihrer Umwandlung sind 30 € — mehr als 10 % Ihres Beitrags (20 €). Ihr Arbeitgeber zahlt deshalb 30 €.');
    expect(n(mindestzuschussText(z(45, 63, 45, 30), { art: 'zuschuss', quote: 0.5, deckelMonat: 30 })))
      .toBe('15 % Ihrer Umwandlung sind 45 € — mehr als der Deckel von 30 €. Ihr Arbeitgeber zahlt deshalb 45 €.');
    expect(n(mindestzuschussText(z(30, 42, 30, 20), { art: 'matching', weg: 'dv', matchingMonat: 20, zuschussImMatching: true }))).toBe(
      '15 % Ihrer Umwandlung sind 30 € — mehr als das Matching von 20 €. Ihr Arbeitgeber zahlt deshalb 30 € in Ihre '
      + 'Direktversicherung; in die Unterstützungskasse fließt dann nichts.',
    );
    expect(n(mindestzuschussText(z(22.5, 31, 22.5, 100), { art: 'matching', weg: 'dv', matchingMonat: 100, zuschussImMatching: true })))
      .toBe('15 % Ihrer Umwandlung sind 22,50 €. Der Zuschuss ist im Matching von 100 € enthalten und fließt in Ihre Direktversicherung.');
    expect(n(mindestzuschussText(z(22.5, 31, 22.5, 122.5), { art: 'matching', weg: 'dv', matchingMonat: 100, zuschussImMatching: false })))
      .toBe('15 % Ihrer Umwandlung sind 22,50 €. Der Zuschuss fließt zusätzlich zum Matching in Ihre Direktversicherung.');
  });
});

describe('Was der Regler abdeckt', () => {
  const g = { rahmenUmwandlung: 288, maxUmwandlung: 617.4, rahmenMonat: 338, steuerRahmenMonat: 676 };

  it('bis zur Markierung frei von Sozialabgaben, bis zum Ende steuerfrei', () => {
    expect(n(reglerErklaerung(g, { art: 'festbetrag', festbetragMonat: 50, mindestUmwandlungMonat: 50 }))).toBe(
      'Bis zur Markierung bleibt Ihre Umwandlung frei von Sozialabgaben: 4 % der Beitragsbemessungsgrenze, 338 € im Monat '
      + 'für Umwandlung und Arbeitgeberbeitrag zusammen — bei Ihnen bis 288 € Umwandlung. Darüber sparen Sie nur noch Steuern; '
      + 'der Regler reicht bis 676 € Gesamtbeitrag (8 %), so viel bleibt steuerfrei.',
    );
  });

  it('Matching: Direktversicherung oder Unterstützungskasse', () => {
    const dv = n(reglerErklaerung(g, { art: 'matching', weg: 'dv', matchingMonat: 100, zuschussImMatching: false }));
    expect(dv).toContain('für Umwandlung und gesetzlichen Zuschuss zusammen');
    expect(dv).toContain('bis 676 € in Ihrer Direktversicherung (8 %)');
    expect(dv).toContain('kommt obendrauf');
    expect(n(reglerErklaerung(g, { art: 'matching', weg: 'ukasse', matchingMonat: 100, zuschussImMatching: false })))
      .toContain('bis 676 € für Umwandlung und Matching zusammen (8 %)');
  });

  it('Rahmen frei von Sozialabgaben schon voll — nur noch steuerfrei; beides voll', () => {
    const m: FirmenModellDaten = { art: 'zuschuss', quote: 0.5, deckelMonat: 100 };
    expect(n(reglerErklaerung({ ...g, rahmenUmwandlung: 0 }, m))).toMatch(/^Der Rahmen frei von Sozialabgaben ist schon voll.*nur Steuern/);
    expect(n(reglerErklaerung({ ...g, rahmenUmwandlung: 0, maxUmwandlung: 0 }, m))).toMatch(/^Der steuerfreie Rahmen ist schon voll/);
  });
});
