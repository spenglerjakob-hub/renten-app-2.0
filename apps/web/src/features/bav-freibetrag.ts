import { bavFreibetragMonat, parameterFuer, type Szenario } from '@renten/engine';
import { istKapital } from './vertragsarten';
import { personNameAus } from './personen';

/**
 * WANN DER FREIBETRAG ZUR STOLPERFALLE WIRD.
 *
 * Der Freibetrag des § 226 Abs. 2 SGB V steht jedem Mitglied EINMAL zu und
 * gilt fuer die SUMME seiner Versorgungsbezuege. Wer drei oder vier
 * Betriebsrenten hat, die einzeln darunter liegen, sieht am Vertrag jeweils
 * "unter der Grenze" — und im Kassenbon trotzdem Beitraege. Ohne ein Wort
 * dazu wirkt das wie ein Rechenfehler.
 *
 * Erkannt wird deshalb genau der Fall, in dem die Summe etwas kostet, der
 * einzelne Vertrag aber nicht: mehr als eine laufende Betriebsrente bei einer
 * Person. Bei nur einem Vertrag erklaert sich der Abzug von selbst.
 */
export interface GeteilterFreibetrag {
  /** Der Freibetrag des betrachteten Jahres, monatlich */
  betragMonat: number;
  /** Namen der Personen, bei denen sich mehrere Bezuege ihn teilen */
  personen: string[];
}

/**
 * Laufende Versorgungsbezuege einer Person.
 *
 * Nur was die Kasse als wiederkehrende Leistung sieht: Betriebsrenten und
 * Unterstuetzungskassen. Eine Beamtenpension zaehlt mit — sie ist ebenfalls
 * ein Versorgungsbezug und verbraucht den Freibetrag. Was als Kapital
 * ausgezahlt wird, ist keine laufende Leistung und steht hier nicht.
 */
function laufendeBezuege(szenario: Szenario, personId: string): number {
  const person = szenario.personen.find((x) => x.id === personId);
  const pension = person?.art === 'pension' ? 1 : 0;
  const vertraege = szenario.vertraege.filter((v) =>
    v.inhaber === personId
    && v.strategie !== 'ignorieren'
    && v.brutto > 0
    && ((v.typ === 'bav' && !istKapital(v)) || v.typ === 'bavUkasse'));
  return pension + vertraege.length;
}

/**
 * Teilen sich bei irgendeiner Person mehrere Bezuege den Freibetrag?
 *
 * `null`, wenn nicht — dann gibt es nichts zu erklaeren, und ein Hinweis
 * waere blosses Rauschen.
 */
export function geteilterFreibetrag(szenario: Szenario, jahr: number): GeteilterFreibetrag | null {
  // Privat Versicherte zahlen eine Praemie; Freibetrag und Freigrenze der
  // gesetzlichen Kasse spielen bei ihnen keine Rolle.
  if (szenario.haushalt.kvStatus === 'pkv') return null;

  const betroffen = szenario.personen
    .filter((x) => laufendeBezuege(szenario, x.id) > 1)
    .map((x) => personNameAus(szenario.personen, x.id));
  if (betroffen.length === 0) return null;

  const p = parameterFuer(jahr, {
    indexRate: szenario.annahmen.tarifIndex,
    zusatzbeitrag: szenario.haushalt.zusatzbeitrag,
  });
  return { betragMonat: bavFreibetragMonat(p), personen: betroffen };
}

/**
 * Der Freibetrag auf Cent genau.
 *
 * `euro` rundet auf volle Euro — bei 197,75 EUR stuende dort "198 EUR", und
 * wer den Wert nachschlaegt, faende ihn nicht wieder. Abgezinst wird er
 * ebenfalls nicht: Der Satz zitiert einen Paragrafen, keine Hochrechnung.
 */
export function freibetragText(betragMonat: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
    .format(betragMonat);
}
