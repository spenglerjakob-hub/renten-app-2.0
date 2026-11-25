import { GEHAELTER_IM_JAHR, type FirmenAngebot, type FirmenModellDaten, type SteuerklasseBeratung } from '@renten/schema';
import type { Mindestzuschuss, MitarbeiterVertrag } from '@renten/engine';
import type { KennzahlenErgebnis, ReglerGrenzen } from './rechnung';
import { KLASSE_ROEMISCH, euroText, freiStufen, gehaelterText, prozentText } from './texte';

/**
 * DIE SAETZE DER MITARBEITERBERATUNG AUF ENGLISCH — dieselben Funktionen wie
 * in `texte.ts`, Satz fuer Satz. `texte.ts` ruft sie, wenn die Beratung auf
 * Englisch laeuft (`lib/sprache.tsx`); die Unterlagen bleiben deutsch und
 * rufen ohne Sprache.
 *
 * Eigene Funktionen statt uebersetzter Bruchstuecke: Die deutschen Saetze
 * setzen sich aus Teilen zusammen, deren Reihenfolge im Englischen eine
 * andere ist.
 *
 * WORTWAHL, damit sie ueberall dieselbe ist:
 *   Entgeltumwandlung      salary conversion (convert part of your salary)
 *   Betriebsrente          company pension
 *   gesetzlicher Zuschuss  statutory subsidy
 *   Arbeitgeberbeitrag     employer contribution
 *   Sozialabgaben          social security contributions
 *   Beitragsbemessungsgrenze  contribution assessment ceiling
 *   Direktversicherung     direct insurance (Direktversicherung)
 *   Unterstuetzungskasse   support fund (Unterstützungskasse)
 *   Versorgungsluecke      pension gap
 *   gesetzliche Rente      statutory pension
 *   unverfallbar           vested
 *
 * Betraege und Prozente in deutscher Schreibweise (`lib/sprache.tsx`).
 */

type FreiModell = Extract<FirmenModellDaten, { art: 'frei' }>;

export const STEUERKLASSE_OPTIONEN_EN: { wert: string; text: string }[] = [
  { wert: '1', text: 'I – single' },
  { wert: '2', text: 'II – single parent' },
  { wert: '3', text: 'III – married, partner in V or without wages' },
  { wert: '4', text: 'IV – married, both in IV' },
  { wert: '5', text: 'V – married, partner in III' },
];

export const GEHAELTER_OPTIONEN_EN: { wert: string; text: string }[] = GEHAELTER_IM_JAHR.map((g) => ({
  wert: String(g), text: g === 12.5 ? '12,5 (half a 13th)' : `${g} salaries`,
}));

export function nettolohnGrundlageEn(k: SteuerklasseBeratung, gehaelter: number): string {
  const klasse = k === 5 ? 'for tax class V at the basic rate, as for IV' : `with the wage tax of tax class ${KLASSE_ROEMISCH[k]}`;
  return `${klasse}${gehaelter > 12 ? `, as a monthly average of ${gehaelterText(gehaelter)} salaries` : ''}`;
}

export function lohnsteuerHinweisEn(k: SteuerklasseBeratung): string {
  return `Wage tax of tax class ${KLASSE_ROEMISCH[k]}, approximated — on your payslip it may differ by a few euros.`
    + (k === 3 || k === 5 ? ' For III and V the tax return evens this out over the year.' : '');
}

export const WEG_NAME_EN: Record<FirmenAngebot['durchfuehrungsweg'], string> = {
  direktversicherung: 'Direct insurance (Direktversicherung)',
  pensionskasse: 'Pensionskasse',
  pensionsfonds: 'Pensionsfonds',
};

/** Im Satz, klein: „you take the direct insurance with you“. */
const WEG_IM_SATZ_EN: Record<FirmenAngebot['durchfuehrungsweg'], string> = {
  direktversicherung: 'direct insurance',
  pensionskasse: 'Pensionskasse',
  pensionsfonds: 'Pensionsfonds',
};

export function vertragNameEn(weg: MitarbeiterVertrag['weg'], a: FirmenAngebot): string {
  return weg === 'ukasse' ? 'Support fund (Unterstützungskasse)' : WEG_NAME_EN[a.durchfuehrungsweg];
}

export function traegerTextEn(weg: MitarbeiterVertrag['weg'], a: FirmenAngebot): string {
  if (weg === 'ukasse') return a.ukasse.trim();
  return [a.versicherer.trim(), a.tarif.trim()].filter(Boolean).join(', tariff ');
}

/** „25 € a month from 50 € converted, 30 € from 70 €“ — leer ohne Stufen. */
export function freiStufenTextEn(m: FreiModell): string {
  return freiStufen(m).map((s, i) => (i === 0
    ? `${euroText(s.betragMonat)} a month from ${euroText(s.abMonat)} converted`
    : `${euroText(s.betragMonat)} from ${euroText(s.abMonat)}`)).join(', ');
}

export function regelTextEn(m: FirmenModellDaten): string {
  if (m.art === 'zuschuss') {
    return m.deckelMonat > 0
      ? `Your employer adds ${prozentText(m.quote)} of your contribution, up to ${euroText(m.deckelMonat)} a month.`
      : `Your employer adds ${prozentText(m.quote)} of your contribution.`;
  }
  if (m.art === 'frei') {
    const stufen = freiStufenTextEn(m);
    const anteil = m.quote > 0
      ? `${prozentText(m.quote)} of your contribution${m.deckelMonat > 0 ? ` (up to ${euroText(m.deckelMonat)} a month)` : ''}`
      : '';
    if (anteil && stufen) return `Your employer adds ${anteil} and, on top, a fixed contribution: ${stufen}.`;
    if (anteil) return `Your employer adds ${anteil}.`;
    if (stufen) return `Your employer adds a fixed contribution: ${stufen}.`;
    return 'Your employer pays the statutory 15 % subsidy, to the extent it saves social security contributions.';
  }
  if (m.art === 'festbetrag') {
    return m.mindestUmwandlungMonat > 0
      ? `Your employer adds ${euroText(m.festbetragMonat)} a month if you convert at least ${euroText(m.mindestUmwandlungMonat)}.`
      : `Your employer adds ${euroText(m.festbetragMonat)} a month if you convert part of your salary.`;
  }
  const ukasse = `Your employer pays ${euroText(m.matchingMonat)} a month into a support fund (Unterstützungskasse)`;
  if (m.weg === 'ukasse') return `${ukasse}; your conversion goes there as well.`;
  return m.zuschussImMatching
    ? `${ukasse} — including the statutory subsidy to your direct insurance.`
    : `${ukasse}, plus the statutory 15 % subsidy into your direct insurance.`;
}

/** Der Kern der Regel — `regelTextEn` enthaelt ihn immer woertlich. */
export function regelKernEn(m: FirmenModellDaten): string {
  if (m.art === 'zuschuss') return `${prozentText(m.quote)} of your contribution`;
  if (m.art === 'frei') {
    return m.quote > 0 ? `${prozentText(m.quote)} of your contribution`
      : freiStufen(m).length > 0 ? 'a fixed contribution' : 'the statutory 15 % subsidy';
  }
  if (m.art === 'festbetrag') return `${euroText(m.festbetragMonat)} a month`;
  return `${euroText(m.matchingMonat)} a month`;
}

export function mindestzuschussTextEn(z: Mindestzuschuss, m: FirmenModellDaten): string {
  const mindest = euroText(z.mindestMonat);
  const begrenzt = z.quoteMonat > z.ersparnisMonat + 0.005 && z.mindestMonat < z.quoteMonat - 0.005;
  const pflicht = begrenzt
    ? `15 % of your conversion would be ${euroText(z.quoteMonat)}; the subsidy is owed to the extent your employer saves social security contributions: ${mindest}`
    : `15 % of your conversion is ${euroText(z.quoteMonat)}`;
  const regel = euroText(z.regelMonat);

  if (z.aufgestockt && z.regelMonat <= 0.005) {
    const vorab = m.art === 'festbetrag' ? `The fixed amount applies from ${euroText(m.mindestUmwandlungMonat)} converted. Until then your employer pays `
      : m.art === 'frei' && (m.quote > 0 || freiStufen(m).length > 0)
        ? 'Under your employer\'s rule there is no contribution yet for this conversion. Your employer pays '
        : 'Your employer pays ';
    return `${vorab}the statutory subsidy: ${pflicht}.`;
  }
  if (z.aufgestockt) {
    const u = z.quoteMonat / 0.15;
    const name = m.art === 'festbetrag' ? `the fixed amount of ${regel}`
      : m.art === 'matching' ? `the matching of ${regel}`
      : m.art === 'frei' ? `the contribution under your employer's rule (${regel})`
      : m.deckelMonat > 0 && m.quote * u > m.deckelMonat + 0.005 ? `the cap of ${regel}`
      : `${prozentText(m.quote)} of your contribution (${regel})`;
    const wohin = m.art === 'matching' ? ' into your direct insurance; nothing then goes into the support fund' : '';
    return `${pflicht} — more than ${name}. Your employer therefore pays ${mindest}${wohin}.`;
  }
  if (m.art === 'matching') {
    return m.zuschussImMatching
      ? `${pflicht}. The subsidy is included in the matching of ${euroText(m.matchingMonat)} and goes into your direct insurance.`
      : `${pflicht}. The subsidy goes into your direct insurance on top of the matching.`;
  }
  return `${pflicht}. Your employer adds ${regel} — the subsidy is included in that.`;
}

export function reglerErklaerungEn(
  g: Pick<ReglerGrenzen, 'rahmenUmwandlung' | 'maxUmwandlung' | 'rahmenMonat' | 'steuerRahmenMonat'>, m: FirmenModellDaten,
): string {
  const ukasse = m.art === 'matching' && m.weg === 'ukasse';
  const mit = m.art !== 'matching' ? ' for conversion and employer contribution together'
    : m.weg === 'dv' ? ' for conversion and statutory subsidy together' : '';
  const ende = m.art !== 'matching' ? `${euroText(g.steuerRahmenMonat)} total contribution`
    : ukasse ? `${euroText(g.steuerRahmenMonat)} for conversion and matching together`
    : `${euroText(g.steuerRahmenMonat)} in your direct insurance`;
  const obendrauf = m.art === 'matching' && m.weg === 'dv' ? ' Your employer\'s contribution to the support fund comes on top.' : '';
  if (g.maxUmwandlung < 0.005) {
    return 'The tax-free allowance is already used up — by the employer contribution or an existing company pension.';
  }
  if (g.rahmenUmwandlung < 0.005) {
    return 'The allowance free of social security contributions is already used up — by the employer contribution or an '
      + `existing company pension. Your conversion therefore only saves tax; the slider goes up to ${ende} (8 % of the `
      + `contribution assessment ceiling), which is how much stays tax-free.${obendrauf}`;
  }
  return 'Up to the mark your conversion stays free of social security contributions: 4 % of the contribution assessment '
    + `ceiling, ${euroText(g.rahmenMonat)} a month${mit} — in your case up to ${euroText(g.rahmenUmwandlung)} converted. `
    + `Above that you only save tax; the slider goes up to ${ende} (8 %), which is how much stays tax-free.${obendrauf}`;
}

export function festePunkteEn(a: FirmenAngebot): string[] {
  const m = a.modell;
  const direkt = m.art !== 'matching' || m.weg === 'dv';
  const p: string[] = [
    'What you convert yourself belongs to you immediately — it is vested from the first contribution.',
  ];
  if (m.art !== 'matching') {
    p.push(
      'You also keep the statutory 15 % subsidy immediately. What your employer adds voluntarily on top becomes vested '
      + 'after three years, unless the company\'s pension plan (Versorgungsordnung) provides something more favourable.',
    );
  } else {
    p.push(
      'You keep your employer\'s contribution to the support fund if the commitment has existed for three years when you '
      + 'leave; after that it stays in place without further contributions. The company\'s pension plan can provide '
      + 'something more favourable.',
    );
  }
  if (direkt) {
    p.push(
      `If you change employer, you take the ${WEG_IM_SATZ_EN[a.durchfuehrungsweg]} with you — you are entitled to this `
      + 'within one year of leaving. You can also stop paying in and keep it, or continue it privately.',
    );
  }
  p.push(
    'You pay no pension contributions on the contribution-free part of your conversion; your statutory pension will '
    + 'therefore be slightly lower.',
    'The company pension is taxable in retirement, and contributions to statutory health insurance are due on it. '
    + 'Both are included in the calculation of your benefits in retirement.',
  );
  return p;
}

const dezimal = (x: number, stellen: number) =>
  x.toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen });
const ganzeEuro = (x: number) => euroText(Math.round(x));

export function fazitTextEn(k: KennzahlenErgebnis): string {
  const haupt = k.prognose ?? k.garantiert ?? k.kapital;
  if (!haupt) return '';
  const mit = haupt.art === 'prognose' ? (k.geschaetzt ? 'with the estimated pension from the projection' : 'with the projected pension')
    : haupt.art === 'garantiert' ? 'with the guaranteed pension'
      : k.geschaetzt ? 'with the estimated lump sum' : 'with the lump sum';
  const prozent = (x: number) => `${dezimal(x * 100, 1)} %`;
  const s: string[] = [
    `For every euro you pay in net, you get back ${dezimal(haupt.nettoHebel, 2)} € ${mit}, after tax and health `
    + `insurance${haupt.nettoHebel < 1 ? ' — less than you pay in' : ''}. `
    + `That corresponds to a net return of ${prozent(haupt.rendite)} a year.`,
  ];
  if (haupt.art === 'kapital') {
    s.push(`Net gain: ${ganzeEuro(haupt.echterGewinn)}.`);
  } else if (haupt.amortisationsJahre <= k.jahreAuszahlung) {
    s.push(
      `After ${dezimal(haupt.amortisationsJahre, 1)} years of pension your contributions have flowed back; `
      + `up to age ${k.lebenserwartung} a net gain of ${ganzeEuro(haupt.echterGewinn)} remains.`,
    );
  } else {
    s.push(
      `Your contributions only flow back after ${dezimal(haupt.amortisationsJahre, 1)} years of pension — `
      + `later than the age of ${k.lebenserwartung} used in this calculation.`,
    );
  }
  if (haupt.art === 'prognose' && k.garantiert) {
    s.push(
      `Even with the guaranteed pension it is ${dezimal(k.garantiert.nettoHebel, 2)} € per euro `
      + `(${prozent(k.garantiert.rendite)} a year).`,
    );
  }
  if (k.geschaetzt) s.push('The figures are based on the illustrative, estimated projection — not a commitment.');
  return s.join(' ');
}
