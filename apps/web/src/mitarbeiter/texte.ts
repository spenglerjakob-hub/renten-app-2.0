import type { FirmenAngebot, FirmenModellDaten } from '@renten/schema';
import type { MitarbeiterVertrag } from '@renten/engine';
import type { KennzahlenErgebnis } from './rechnung';

/**
 * Die Saetze der Mitarbeiterberatung — einmal hier, damit Bildschirm,
 * Protokoll und Vereinbarung dasselbe sagen.
 *
 * Fachlich bewusst vorsichtig: Was die Versorgungsordnung der Firma
 * abweichend regeln kann (etwa eine kuerzere Unverfallbarkeit), steht mit
 * diesem Vorbehalt da. Die eigenen Hinweise der Firma kommen dazu.
 */

const euroFormat = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
/** 100 € statt 100,00 €, aber 12,50 € */
export const euroText = (n: number) => euroFormat.format(Math.round(n * 100) / 100).replace(/,00(\s)/, '$1');
const prozentText = (q: number) => `${Math.round(q * 1000) / 10} %`.replace('.', ',');

export const MODELL_NAME: Record<FirmenModellDaten['art'], string> = {
  zuschuss: 'Zuschussmodell',
  festbetrag: 'Festbetrag-Modell',
  matching: 'Matching-Modell',
};

export const WEG_NAME: Record<FirmenAngebot['durchfuehrungsweg'], string> = {
  direktversicherung: 'Direktversicherung',
  pensionskasse: 'Pensionskasse',
  pensionsfonds: 'Pensionsfonds',
};

/** Der Name eines Vertrags im Gespraech: „Direktversicherung“ oder „Unterstützungskasse“. */
export function vertragName(weg: MitarbeiterVertrag['weg'], a: FirmenAngebot): string {
  return weg === 'ukasse' ? 'Unterstützungskasse' : WEG_NAME[a.durchfuehrungsweg];
}

/** Wer den Vertrag fuehrt: Versicherer und Tarif bzw. die Unterstuetzungskasse — leer, wenn nichts eingetragen ist. */
export function traegerText(weg: MitarbeiterVertrag['weg'], a: FirmenAngebot): string {
  if (weg === 'ukasse') return a.ukasse.trim();
  return [a.versicherer.trim(), a.tarif.trim()].filter(Boolean).join(', Tarif ');
}

/** Die Regel der Firma in einem Satz, aus Sicht des Mitarbeiters. */
export function regelText(m: FirmenModellDaten): string {
  if (m.art === 'zuschuss') {
    return m.deckelMonat > 0
      ? `Ihr Arbeitgeber gibt ${prozentText(m.quote)} Ihres Beitrags dazu, höchstens ${euroText(m.deckelMonat)} im Monat.`
      : `Ihr Arbeitgeber gibt ${prozentText(m.quote)} Ihres Beitrags dazu.`;
  }
  if (m.art === 'festbetrag') {
    return m.mindestUmwandlungMonat > 0
      ? `Ihr Arbeitgeber gibt ${euroText(m.festbetragMonat)} im Monat dazu, wenn Sie mindestens ${euroText(m.mindestUmwandlungMonat)} umwandeln.`
      : `Ihr Arbeitgeber gibt ${euroText(m.festbetragMonat)} im Monat dazu, wenn Sie umwandeln.`;
  }
  const ukasse = `Ihr Arbeitgeber zahlt ${euroText(m.matchingMonat)} im Monat in eine Unterstützungskasse`;
  if (m.weg === 'ukasse') return `${ukasse}; Ihre Umwandlung fließt ebenfalls dorthin.`;
  return m.zuschussImMatching
    ? `${ukasse} — einschließlich des gesetzlichen Zuschusses zu Ihrer Direktversicherung.`
    : `${ukasse}, dazu den gesetzlichen Zuschuss von 15 % in Ihre Direktversicherung.`;
}

/** Dieselbe Regel in der dritten Person — fuer die Entgeltumwandlungsvereinbarung. */
export function regelFuerVereinbarung(m: FirmenModellDaten): string {
  if (m.art === 'zuschuss') {
    return `Der Arbeitgeber zahlt zusätzlich ${prozentText(m.quote)} der Umwandlung`
      + `${m.deckelMonat > 0 ? `, höchstens ${euroText(m.deckelMonat)} im Monat` : ''}, mindestens den Zuschuss nach § 1a Abs. 1a BetrAVG.`;
  }
  if (m.art === 'festbetrag') {
    return `Der Arbeitgeber zahlt zusätzlich ${euroText(m.festbetragMonat)} im Monat`
      + `${m.mindestUmwandlungMonat > 0 ? `, wenn die Umwandlung mindestens ${euroText(m.mindestUmwandlungMonat)} beträgt` : ''}`
      + ', mindestens den Zuschuss nach § 1a Abs. 1a BetrAVG.';
  }
  const kern = `Der Arbeitgeber zahlt ${euroText(m.matchingMonat)} im Monat in die Unterstützungskasse`;
  if (m.weg === 'ukasse') return `${kern}.`;
  return m.zuschussImMatching
    ? `${kern}, einschließlich des Zuschusses nach § 1a Abs. 1a BetrAVG zur Direktversicherung.`
    : `${kern} und dazu den Zuschuss nach § 1a Abs. 1a BetrAVG in die Direktversicherung.`;
}

/** Die eigenen Hinweise der Firma, je Zeile einer. */
export function firmenHinweise(a: FirmenAngebot): string[] {
  return a.hinweise.split('\n').map((z) => z.replace(/^[•\-–*]\s*/, '').trim()).filter(Boolean);
}

/**
 * Was jeder Mitarbeiter wissen sollte — am Bildschirm in Schritt 1 und im
 * Protokoll unter „Hinweise und Risiken“.
 */
export function festePunkte(a: FirmenAngebot): string[] {
  const m = a.modell;
  const direkt = m.art !== 'matching' || m.weg === 'dv';
  const p: string[] = [
    'Ihre eigene Umwandlung gehört Ihnen sofort — sie ist ab dem ersten Beitrag unverfallbar.',
  ];
  if (m.art === 'zuschuss' || m.art === 'festbetrag') {
    p.push(
      'Den gesetzlichen Zuschuss von 15 % behalten Sie ebenfalls sofort. Was der Arbeitgeber freiwillig darüber hinaus '
      + 'gibt, wird nach drei Jahren unverfallbar, wenn die Versorgungsordnung nichts Günstigeres regelt.',
    );
  } else {
    p.push(
      'Den Beitrag des Arbeitgebers in die Unterstützungskasse behalten Sie, wenn die Zusage beim Ausscheiden drei Jahre '
      + 'bestanden hat; danach bleibt er beitragsfrei stehen. Die Versorgungsordnung kann Günstigeres regeln.',
    );
  }
  if (direkt) {
    p.push(
      `Wechseln Sie den Arbeitgeber, nehmen Sie die ${WEG_NAME[a.durchfuehrungsweg]} mit — den Anspruch darauf haben `
      + 'Sie innerhalb eines Jahres nach dem Ausscheiden. Sie können sie auch beitragsfrei stellen oder privat weiterführen.',
    );
  }
  p.push(
    'Auf den beitragsfreien Teil Ihrer Umwandlung zahlen Sie keine Rentenbeiträge; Ihre gesetzliche Rente fällt dadurch '
    + 'etwas niedriger aus.',
    'Die Betriebsrente ist im Alter steuerpflichtig, und in der gesetzlichen Krankenversicherung fallen auf sie Beiträge an. '
    + 'Beides ist in der Rechnung zur Leistung im Alter enthalten.',
  );
  return p;
}

const dezimal = (x: number, stellen: number) =>
  x.toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen });
const ganzeEuro = (x: number) => euroText(Math.round(x));

/** Das Fazit der Kennzahlen in Saetzen — der Vertrag allein, wie im Vertrags-TUEV. */
export function fazitText(k: KennzahlenErgebnis): string {
  const haupt = k.prognose ?? k.garantiert ?? k.kapital;
  if (!haupt) return '';
  const mit = haupt.art === 'prognose' ? (k.geschaetzt ? 'mit der geschätzten Rente aus der Hochrechnung' : 'mit der prognostizierten Rente')
    : haupt.art === 'garantiert' ? 'mit der garantierten Rente'
      : k.geschaetzt ? 'mit der geschätzten Kapitalauszahlung' : 'mit der Kapitalauszahlung';
  const prozent = (x: number) => `${dezimal(x * 100, 1)} %`;
  const s: string[] = [
    `Für jeden Euro, den Sie netto einzahlen, erhalten Sie ${mit} nach Steuer und Krankenversicherung `
    + `${dezimal(haupt.nettoHebel, 2)} € zurück${haupt.nettoHebel < 1 ? ' — weniger, als Sie einzahlen' : ''}. `
    + `Das entspricht einer Nettorendite von ${prozent(haupt.rendite)} im Jahr.`,
  ];
  if (haupt.art === 'kapital') {
    s.push(`Netto-Gewinn: ${ganzeEuro(haupt.echterGewinn)}.`);
  } else if (haupt.amortisationsJahre <= k.jahreAuszahlung) {
    s.push(
      `Nach ${dezimal(haupt.amortisationsJahre, 1)} Jahren Rente sind Ihre Einzahlungen zurückgeflossen; `
      + `bis ${k.lebenserwartung} bleibt ein Netto-Gewinn von ${ganzeEuro(haupt.echterGewinn)}.`,
    );
  } else {
    s.push(
      `Ihre Einzahlungen fließen erst nach ${dezimal(haupt.amortisationsJahre, 1)} Jahren Rente zurück — `
      + `später, als bis zum Alter von ${k.lebenserwartung} gerechnet.`,
    );
  }
  if (haupt.art === 'prognose' && k.garantiert) {
    s.push(
      `Schon mit der garantierten Rente sind es ${dezimal(k.garantiert.nettoHebel, 2)} € je Euro `
      + `(${prozent(k.garantiert.rendite)} im Jahr).`,
    );
  }
  if (k.geschaetzt) s.push('Die Werte beruhen auf der beispielhaften, geschätzten Hochrechnung — keine Zusage.');
  return s.join(' ');
}
