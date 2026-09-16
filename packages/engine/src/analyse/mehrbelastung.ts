import type { Szenario } from '../model.js';
import { projiziere } from '../projection/timeline.js';

/**
 * WAS EIN VERTRAG TATSAECHLICH KOSTET — Steuer und Beitraege als Differenz.
 *
 * DAS PROBLEM. Die Zeitachse verteilt die Haushaltssteuer ANTEILIG nach dem
 * Beitrag jeder Quelle zum zu versteuernden Einkommen. Fuer den Kassenbon ist
 * das richtig: Er beantwortet „woher kommt welcher Euro des Haushaltsnettos",
 * und dafuer muss die Summe aufgehen.
 *
 * Fuer die Frage des Vertrags-TUEV ist es falsch. Der fragt: „Was bringt MIR
 * DIESER Vertrag?" — und das ist eine Frage nach dem letzten Euro, nicht nach
 * einem Durchschnittseuro. Eine Betriebsrente kommt OBENDRAUF auf den
 * progressiven Tarif. Der anteilige Schluessel gibt ihr den
 * Durchschnittssatz; nachgemessen an einem Alleinstehenden mit 1.500 EUR
 * gesetzlicher Rente waren das 5,4 % statt der tatsaechlichen 16 bis 17 %.
 * Eine bAV von 500 EUR erschien dadurch mit 399 EUR netto statt mit 339 —
 * knapp 60 EUR im Monat zu guenstig, und ueber `kennzahlen()` auch in Rendite,
 * Nettohebel und Amortisationsdauer hinein.
 *
 * WARUM AUCH KV/PV. Nicht nur die Steuer ist progressiv gestaffelt: Der
 * Freibetrag des § 226 Abs. 2 SGB V steht dem MITGLIED einmal zu, nicht jedem
 * Bezug. Wer schon eine Betriebsrente bezieht, zahlt auf die zweite den vollen
 * Satz ohne jeden Freibetrag. Die anteilige Verteilung verschmiert das auf
 * beide; die Differenz trifft es.
 *
 * WIE. Mit dem unveraenderten `projiziere()` auf einem Klon ohne diesen
 * Vertrag — dieselbe Machart wie `nurPerson`, der Vertrags-TUEV und die
 * Stellschrauben. Anders als bei `nurPerson` gibt es hier keine Falle: Es wird
 * nur gefiltert, kein Inhaber umgeschrieben, also greift auch kein Rueckfall
 * ueber `?? personA`.
 *
 * WAS DAS BEDEUTET, UND ES IST KEIN FEHLER: Bei mehreren Vertraegen addieren
 * sich die Einzelwerte NICHT zur Haushaltssteuer. Jeder ist fuer sich „der
 * letzte", also traegt jeder den Grenzsatz — zusammen mehr, als der Haushalt
 * insgesamt zahlt. Wer die Werte summieren will, ist beim Kassenbon richtig.
 */
export interface Mehrbelastung {
  /** Steuer, die ohne diesen Vertrag wegfiele — Jahresbetrag */
  steuerJahr: number;
  /** KV/PV, die ohne diesen Vertrag wegfielen — Jahresbetrag */
  kvPvJahr: number;
  /** Brutto des Vertrags in diesem Jahr, aus der vollen Rechnung */
  bruttoJahr: number;
  /** Brutto abzueglich beider Mehrbelastungen — Jahresbetrag */
  nettoJahr: number;
}

/**
 * Die Mehrbelastung JEDES Vertrags in einem Jahr.
 *
 * Als Sammelaufruf und nicht je Vertrag einzeln, weil die volle Projektion
 * sonst N-mal statt einmal liefe. Gerechnet werden N+1 Projektionen; der
 * Aufrufer sollte das Ergebnis memoisieren.
 *
 * Vertraege ohne Brutto im fraglichen Jahr — noch nicht ausgezahlt, als
 * Kapital entnommen, auf „ignorieren" gestellt — stehen mit Nullen in der
 * Karte. Sie ganz wegzulassen zwaenge jeden Aufrufer zu einer Fallunterscheidung.
 */
export function mehrbelastungJeVertrag(
  s: Szenario,
  jahr: number,
): Map<string, Mehrbelastung> {
  const karte = new Map<string, Mehrbelastung>();
  const voll = projiziere(s).zeilen.find((z) => z.jahr === jahr);
  if (!voll) return karte;

  for (const v of s.vertraege) {
    const posten = voll.posten.find((x) => x.id === v.id);
    const bruttoJahr = posten?.bruttoJahr ?? 0;
    if (bruttoJahr <= 0) {
      karte.set(v.id, { steuerJahr: 0, kvPvJahr: 0, bruttoJahr: 0, nettoJahr: 0 });
      continue;
    }

    const ohne = projiziere({ ...s, vertraege: s.vertraege.filter((x) => x.id !== v.id) })
      .zeilen.find((z) => z.jahr === jahr);
    /*
      Ohne Gegenstueck bleibt nur die anteilige Zurechnung. Das passiert, wenn
      das Jahr ohne diesen Vertrag gar nicht mehr existiert — etwa weil er die
      einzige Einkunft der spaeteren Person war und sich die Zeitachse
      verkuerzt. Lieber der alte Wert als eine Null, die wie „kostenlos"
      aussaehe.
    */
    if (!ohne) {
      karte.set(v.id, {
        steuerJahr: posten?.steuerJahr ?? 0,
        kvPvJahr: posten?.kvPvJahr ?? 0,
        bruttoJahr,
        nettoJahr: posten?.nettoJahr ?? 0,
      });
      continue;
    }

    /*
      Nie unter null: Ein Vertrag kann die Haushaltssteuer nicht senken. Dass
      die Differenz rechnerisch knapp negativ wird, ist bei Rundungen an
      Tarifgrenzen moeglich — als Ergebnis waere es Unsinn.
    */
    const steuerJahr = Math.max(0, voll.steuerGesamt - ohne.steuerGesamt);
    const kvPvJahr = Math.max(0, voll.kvPvGesamt - ohne.kvPvGesamt);
    karte.set(v.id, {
      steuerJahr,
      kvPvJahr,
      bruttoJahr,
      nettoJahr: bruttoJahr - steuerJahr - kvPvJahr,
    });
  }

  return karte;
}
