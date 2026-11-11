import { GEHAELTER_IM_JAHR, type FirmenAngebot, type FirmenModellDaten, type SteuerklasseBeratung } from '@renten/schema';
import type { Mindestzuschuss, MitarbeiterVertrag } from '@renten/engine';
import type { KennzahlenErgebnis, ReglerGrenzen } from './rechnung';

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

/** Die Steuerklasse in roemischen Ziffern, wie auf der Gehaltsabrechnung. */
export const KLASSE_ROEMISCH: Record<SteuerklasseBeratung, string> = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V' };

/** Die Auswahl der Steuerklasse — mit dem, wofuer sie steht. */
export const STEUERKLASSE_OPTIONEN: { wert: string; text: string }[] = [
  { wert: '1', text: 'I – ledig' },
  { wert: '2', text: 'II – alleinerziehend' },
  { wert: '3', text: 'III – verheiratet, Partner in V oder ohne Lohn' },
  { wert: '4', text: 'IV – verheiratet, beide in IV' },
  { wert: '5', text: 'V – verheiratet, Partner in III' },
];

/** Gehaelter im Jahr wie im Rechner („Auszahlungen pro Jahr“). */
export const GEHAELTER_OPTIONEN: { wert: string; text: string }[] = GEHAELTER_IM_JAHR.map((g) => ({
  wert: String(g), text: g === 12.5 ? '12,5 (halbes 13.)' : `${g} Gehälter`,
}));

/** „12,5“ statt „12.5“ */
export const gehaelterText = (g: number) => g.toLocaleString('de-DE');

/**
 * Womit der Nettolohn der Versorgungsluecke rechnet: mit der Lohnsteuer der
 * Klasse — bei V im Grundtarif wie IV, denn den hohen Abzug der Klasse V
 * gleicht die Steuererklaerung aus (`nettolohnHeute`, Basis `jahr`).
 */
export function nettolohnGrundlage(k: SteuerklasseBeratung, gehaelter: number): string {
  const klasse = k === 5 ? 'bei Steuerklasse V im Grundtarif wie IV' : `mit der Lohnsteuer der Steuerklasse ${KLASSE_ROEMISCH[k]}`;
  return `${klasse}${gehaelter > 12 ? `, im Monatsdurchschnitt mit ${gehaelterText(gehaelter)} Gehältern` : ''}`;
}

/**
 * Die Fussnote zur Steuer im Monat: Lohnsteuer der Klasse, genaehert — bei
 * III und V weicht der Monat vom Jahresergebnis ab.
 */
export function lohnsteuerHinweis(k: SteuerklasseBeratung): string {
  return `Lohnsteuer der Steuerklasse ${KLASSE_ROEMISCH[k]}, genähert — auf der Gehaltsabrechnung kann sie um wenige Euro abweichen.`
    + (k === 3 || k === 5 ? ' Bei III und V gleicht die Steuererklärung das über das Jahr aus.' : '');
}

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

/**
 * Der Kern der Regel — das Wort, das in der Ueberschrift hervorgehoben wird
 * (`regelText` enthaelt ihn immer woertlich).
 */
export function regelKern(m: FirmenModellDaten): string {
  if (m.art === 'zuschuss') return `${prozentText(m.quote)} Ihres Beitrags`;
  if (m.art === 'festbetrag') return `${euroText(m.festbetragMonat)} im Monat`;
  return `${euroText(m.matchingMonat)} im Monat`;
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

/**
 * Die Pruefung des gesetzlichen Zuschusses in Worten (§ 1a Abs. 1a BetrAVG):
 * 15 % der Umwandlung, soweit der Arbeitgeber dadurch Sozialabgaben spart.
 * Gerechnet ist er immer (`bavMitarbeiter` zahlt mindestens ihn) — hier
 * steht, ob die Regel der Firma dafuer reicht oder er sie uebersteigt, etwa
 * ein Festbetrag von 50 € ab rund 334 € Umwandlung. Schritt 4 und Protokoll.
 */
export function mindestzuschussText(z: Mindestzuschuss, m: FirmenModellDaten): string {
  const mindest = euroText(z.mindestMonat);
  // „soweit“: Ueber dem Rahmen frei von Sozialabgaben spart der Arbeitgeber nichts mehr dazu.
  const begrenzt = z.quoteMonat > z.ersparnisMonat + 0.005 && z.mindestMonat < z.quoteMonat - 0.005;
  const pflicht = begrenzt
    ? `15 % Ihrer Umwandlung wären ${euroText(z.quoteMonat)}; geschuldet ist der Zuschuss, soweit Ihr Arbeitgeber Sozialabgaben spart: ${mindest}`
    : `15 % Ihrer Umwandlung sind ${euroText(z.quoteMonat)}`;
  const regel = euroText(z.regelMonat);

  if (z.aufgestockt && z.regelMonat <= 0.005) {
    const vorab = m.art === 'festbetrag' ? `Den Festbetrag gibt es ab ${euroText(m.mindestUmwandlungMonat)} Umwandlung. Bis dahin zahlt ` : 'Ihr Arbeitgeber zahlt ';
    return `${vorab}${m.art === 'festbetrag' ? 'Ihr Arbeitgeber ' : ''}den gesetzlichen Zuschuss: ${pflicht}.`;
  }
  if (z.aufgestockt) {
    const u = z.quoteMonat / 0.15;
    const name = m.art === 'festbetrag' ? `der Festbetrag von ${regel}`
      : m.art === 'matching' ? `das Matching von ${regel}`
      : m.deckelMonat > 0 && m.quote * u > m.deckelMonat + 0.005 ? `der Deckel von ${regel}`
      : `${prozentText(m.quote)} Ihres Beitrags (${regel})`;
    const wohin = m.art === 'matching' ? ' in Ihre Direktversicherung; in die Unterstützungskasse fließt dann nichts' : '';
    return `${pflicht} — mehr als ${name}. Ihr Arbeitgeber zahlt deshalb ${mindest}${wohin}.`;
  }
  if (m.art === 'matching') {
    return m.zuschussImMatching
      ? `${pflicht}. Der Zuschuss ist im Matching von ${euroText(m.matchingMonat)} enthalten und fließt in Ihre Direktversicherung.`
      : `${pflicht}. Der Zuschuss fließt zusätzlich zum Matching in Ihre Direktversicherung.`;
  }
  return `${pflicht}. Ihr Arbeitgeber gibt ${regel} — der Zuschuss ist darin enthalten.`;
}

/**
 * Was der Regler in Schritt 4 abdeckt: bis zur Markierung frei von
 * Sozialabgaben (4 % der BBG), bis zum Ende steuerfrei (8 %).
 */
export function reglerErklaerung(g: Pick<ReglerGrenzen, 'rahmenUmwandlung' | 'maxUmwandlung' | 'rahmenMonat' | 'steuerRahmenMonat'>, m: FirmenModellDaten): string {
  const ukasse = m.art === 'matching' && m.weg === 'ukasse';
  const mit = m.art !== 'matching' ? ' für Umwandlung und Arbeitgeberbeitrag zusammen'
    : m.weg === 'dv' ? ' für Umwandlung und gesetzlichen Zuschuss zusammen' : '';
  const ende = m.art !== 'matching' ? `${euroText(g.steuerRahmenMonat)} Gesamtbeitrag`
    : ukasse ? `${euroText(g.steuerRahmenMonat)} für Umwandlung und Matching zusammen`
    : `${euroText(g.steuerRahmenMonat)} in Ihrer Direktversicherung`;
  const obendrauf = m.art === 'matching' && m.weg === 'dv' ? ' Der Beitrag des Arbeitgebers in die Unterstützungskasse kommt obendrauf.' : '';
  if (g.maxUmwandlung < 0.005) {
    return 'Der steuerfreie Rahmen ist schon voll — durch den Beitrag des Arbeitgebers oder eine bestehende Betriebsrente.';
  }
  if (g.rahmenUmwandlung < 0.005) {
    return 'Der Rahmen frei von Sozialabgaben ist schon voll — durch den Beitrag des Arbeitgebers oder eine bestehende '
      + `Betriebsrente. Ihre Umwandlung spart deshalb nur Steuern; der Regler reicht bis ${ende} (8 % der `
      + `Beitragsbemessungsgrenze), so viel bleibt steuerfrei.${obendrauf}`;
  }
  return `Bis zur Markierung bleibt Ihre Umwandlung frei von Sozialabgaben: 4 % der Beitragsbemessungsgrenze, `
    + `${euroText(g.rahmenMonat)} im Monat${mit} — bei Ihnen bis ${euroText(g.rahmenUmwandlung)} Umwandlung. Darüber sparen Sie `
    + `nur noch Steuern; der Regler reicht bis ${ende} (8 %), so viel bleibt steuerfrei.${obendrauf}`;
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
