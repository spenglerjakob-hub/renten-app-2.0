import type { PersonId } from '../model.js';
import type { Jahreszeile, JahresPosten } from '../projection/timeline.js';

/**
 * Die Jahreszeile, nach Personen aufgeteilt.
 *
 * WOZU: Bei Ehepaaren steht im Kassenbon eine einzige Summe. Wer wissen will,
 * womit jeder der beiden dasteht, findet es dort nicht — und wer es sich
 * selbst zurechtlegen will, indem er beim Partner 0 EUR eintraegt, bekommt
 * ein anderes Szenario und nicht dasselbe aus einem anderen Blickwinkel.
 *
 * WAS DAS HIER NICHT IST: eine zweite Rechnung. Gerechnet ist alles schon —
 * die Steuer EINMAL fuer den Haushalt mit Splitting, die Beitraege je
 * Mitglied. Diese Datei gruppiert nur, was die Zeitachse ohnehin je Posten
 * ausweist. Deshalb steht sie in `analyse/` neben `versorgungsluecke` und
 * nicht in `projection/`: dort wird erzeugt, hier gelesen.
 *
 * WAS DIE ZAHLEN BEDEUTEN: Die Steuer je Person ist ein ANTEIL an der
 * gemeinsamen Steuer, verteilt nach dem Beitrag zum zu versteuernden
 * Einkommen. Sie ist nicht die Steuer, die diese Person allein zahlen
 * wuerde — allein veranlagt zahlte jeder von beiden mehr. Der
 * Splittingvorteil entsteht nur gemeinsam und gehoert beiden.
 */
export interface PersonenBlock {
  /** `null` steht fuer den Haushalt: Entnahmeplan, Beitraege ohne Traeger. */
  person: PersonId | null;
  bruttoJahr: number;
  kvPvJahr: number;
  steuerJahr: number;
  nettoJahr: number;
  posten: JahresPosten[];
}

/**
 * Reihenfolge A, B, Haushalt. Leere Bloecke entfallen — ein Block ohne
 * Posten waere eine Ueberschrift ohne Inhalt.
 *
 * Kein `Szenario`-Argument: Der Personenbezug haengt am Posten, nicht an
 * einer Nachschlagetabelle. Die Funktion ist damit ueberall aufrufbar, wo
 * eine Jahreszeile vorliegt.
 */
export function jePerson(z: Jahreszeile): PersonenBlock[] {
  const ordnung: (PersonId | null)[] = ['A', 'B', null];

  return ordnung
    .map((person) => {
      const posten = z.posten.filter((x) => (x.person ?? null) === person);
      const summe = (feld: 'bruttoJahr' | 'kvPvJahr' | 'steuerJahr' | 'nettoJahr') =>
        posten.reduce((s, x) => s + x[feld], 0);
      return {
        person,
        posten,
        bruttoJahr: summe('bruttoJahr'),
        kvPvJahr: summe('kvPvJahr'),
        steuerJahr: summe('steuerJahr'),
        nettoJahr: summe('nettoJahr'),
      };
    })
    .filter((b) => b.posten.length > 0);
}
