import {
  avdAnsparphase, parseDatum, regelaltersrentenbeginn,
  type AvdKind, type LegalParameters,
} from '@renten/engine';

/**
 * DIE „BIS ZU“-BETRAEGE DER GEFUEHRTEN EINGABE.
 *
 * Nach dem Geburtsdatum (und wieder nach den Kindern) nennt die Seite eine
 * Summe: so viel Zulage gibt es hoechstens bis zur eigenen Rente. Sie ist fuer
 * jeden Besucher AUSGERECHNET und keine feste Werbezahl — ein 30-Jaehriger
 * kommt auf rund 20.000 €, ein 55-Jaehriger auf ein Drittel davon. Eine feste
 * Zahl waere fuer die Aelteren schlicht falsch.
 *
 * „Bis zu“ heisst: mit dem Beitrag der vollen Foerderung (die Grenze der
 * zweiten Zulagenstufe, 1.800 € im Jahr = 150 € im Monat) und jedes Jahr ab
 * dem Start des Depots bis zum Rentenbeginn. Gerechnet wird mit derselben
 * Funktion wie die Hochrechnung der Seite (`avdAnsparphase`) — eine eigene
 * Summenformel liefe frueher oder spaeter von ihr weg.
 */

/** Der Zeitraum, der aus dem Geburtsdatum folgt — fuer Info und Hochrechnung derselbe. */
export interface DepotZeitraum {
  rentenbeginn: { jahr: number; monat: number };
  /** Erstes Beitragsjahr: heute, fruehestens der Start des Depots */
  startjahr: number;
  /** Das Alter, mit dem die Seite das erste Beitragsjahr rechnet (wie bisher: heutiges Jahr minus Geburtsjahr) */
  alterHeute: number;
  /** Beitragsjahre ab dem Start bis zum Rentenbeginn */
  jahre: number;
  alterBeiRente: number;
  /** Der Rentenbeginn liegt vor dem Start des Depots — es kommt zu spaet */
  zuSpaet: boolean;
}

/**
 * Null, solange das Datum nicht lesbar oder nicht plausibel ist — ein
 * Tippfehler wie 1085 soll nicht als Rentenbeginn 1152 durchgehen.
 */
export function depotZeitraum(geburtsdatum: string, p: LegalParameters, jetzt: number): DepotZeitraum | null {
  const geburt = parseDatum(geburtsdatum);
  if (!geburt || geburt.jahr <= jetzt - 110 || geburt.jahr > jetzt) return null;
  const rentenbeginn = regelaltersrentenbeginn(geburt);
  const startjahr = Math.max(jetzt, p.avd.abJahr);
  const jahre = Math.max(0, rentenbeginn.jahr - startjahr);
  return {
    rentenbeginn: { jahr: rentenbeginn.jahr, monat: rentenbeginn.monat },
    startjahr,
    alterHeute: jetzt - geburt.jahr,
    jahre,
    alterBeiRente: rentenbeginn.jahr - geburt.jahr,
    zuSpaet: jahre <= 0,
  };
}

export interface ZulagenBisRente {
  /** Der Monatsbeitrag der vollen Foerderung (150 €) */
  beitragVoll: number;
  /** Die volle Grundzulage im Jahr (540 €) */
  grundzulageJahr: number;
  /** Der einmalige Berufseinsteigerbonus, wenn er faellt — sonst 0 */
  bonus: number;
  /** Alle Zulagen bis zur Rente ohne Kinder, den Bonus eingeschlossen */
  ohneKinder: number;
  /** Dasselbe mit den eingetragenen Kindern */
  mitKindern: number;
}

export function zulagenBisRente(
  z: DepotZeitraum,
  kinder: readonly AvdKind[],
  p: LegalParameters,
): ZulagenBisRente {
  const beitragVoll = p.avd.stufe2Grenze / 12;
  const lauf = (k: readonly AvdKind[]) => avdAnsparphase(
    {
      beitragMonat: beitragVoll, dynamik: 0, startkapital: 0, jahre: z.jahre,
      // Die Zulagen haengen nicht an der Rendite — gerechnet wird ohne.
      renditeBrutto: 0, ter: 0,
      kinder: k, alterHeute: z.alterHeute, startjahr: z.startjahr,
    },
    p,
  );
  const ohne = lauf([]);
  const mit = kinder.length > 0 ? lauf(kinder) : ohne;
  return {
    beitragVoll,
    grundzulageJahr: ohne.ersteZulagen.grundzulage,
    bonus: z.jahre > 0 ? ohne.ersteZulagen.bonus : 0,
    ohneKinder: ohne.zulagenGesamt,
    mitKindern: mit.zulagenGesamt,
  };
}
