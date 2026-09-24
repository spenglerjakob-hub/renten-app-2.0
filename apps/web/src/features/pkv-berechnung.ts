import {
  pkvImJahr, pkvVerlauf, arbeitgeberzuschuss, betVergleich, betNetto, parameterFuer,
  erwerbsBasisHeute, zusatzsteuer, PKV_BASISANTEIL,
  type PkvJahr, type BetVergleich, type BetNetto, type Jahreszeile, type LegalParameters,
} from '@renten/engine';
import { kvProfil } from '@renten/engine';
import { personName } from './personen';
import type { SzenarioParsed } from '../store/szenario';

/**
 * Die PKV-Rechnung, einmal fuer Bildschirm und Papier.
 *
 * Dieselbe Trennung wie bei `sparziel-berechnung.ts` und `tuev-berechnung.ts`:
 * die Rechnung steht hier, nicht im JSX. Der PKV-Rechner auf dem Bildschirm
 * und die Gutachtenseite muessen zwingend dieselben Zahlen zeigen.
 */

/** Lebenserwartung fuer die Entlastungstarif-Rechnung. */
export const LEBENSERWARTUNG = 85;

export interface PkvErgebnis {
  /** Wessen Versicherung gerechnet wurde */
  person: string;
  /** Angenommene Steigerung DIESER Versicherung, p. a. */
  steigerung: number;
  /** Alter dieser Person heute */
  alterHeute: number;
  rentenjahr: number;
  alterBeiRentenbeginn: number;

  /** Praemie heute, im Rentenjahr und mit 80 — jeweils nominal */
  heute: PkvJahr;
  beiRente: PkvJahr;
  mitAchtzig: PkvJahr | null;

  /** Dieselben Betraege in heutiger Kaufkraft */
  beiRenteHeutigesGeld: number;
  mitAchtzigHeutigesGeld: number;

  /**
   * Was der Arbeitgeber heute davon traegt — auf den GESAMTbeitrag, also
   * einschliesslich Entlastungstarif. 0 bei Beamten und Selbststaendigen.
   */
  zuschussHeute: number;

  /** Der ganze Verlauf bis zur Lebenserwartung */
  verlauf: (PkvJahr & { jahr: number })[];

  /** Anteil der Praemie am Zielnetto des Rentenjahres */
  anteilAmZiel: number;

  bet: BetVergleich | null;
  /**
   * Derselbe Tarif nach Arbeitgeberzuschuss und Steuer, samt der Saetze, mit
   * denen gerechnet wurde — damit die Oberflaeche sie nennen kann.
   */
  betNetto: (BetNetto & { steuersatzHeute: number; steuersatzRuhestand: number }) | null;
  /** Ab welchem Alter die Entlastung greift */
  betAbAlter: number;
}

/**
 * Steuer je Euro Sonderausgabe: die Differenz der Jahressteuer mit und ohne
 * diesen Abzug, geteilt durch den Abzug. Kein Tabellen-Grenzsteuersatz,
 * sondern dieselbe `zusatzsteuer` wie ueberall, samt Soli und Kirchensteuer.
 *
 * `zve` ist das zvE MIT dem Abzug; ohne ihn laege es um `abzug` hoeher.
 */
function steuerJeEuro(
  zve: number,
  abzug: number,
  opts: { verheiratet: boolean; bundesland: string; kirchensteuerpflichtig: boolean },
  p: LegalParameters,
): number {
  // Bei null Abzug die Probe mit einem Euro-Hunderter, damit ein Satz entsteht.
  const betrag = abzug > 1 ? abzug : 100;
  return zusatzsteuer(Math.max(0, zve), betrag, opts, p) / betrag;
}

/**
 * Gibt `null` zurueck, wenn es nichts zu zeigen gibt — kein PKV-Status oder
 * keine Praemie. Dann entfaellt der Block, statt eine Nullrechnung zu drucken.
 */
export function pkvRechnen(
  szenario: SzenarioParsed,
  /** Die Zeile des Rentenbeginns — Zielnetto, zvE und Jahr des Ruhestands */
  zeile: Jahreszeile,
): PkvErgebnis | null {
  const zielNettoMonatImRentenjahr = zeile.zielNettoMonat;
  /*
    DIE PERSON, um die es geht — nicht mehr zwingend Person A.

    Seit die Krankenversicherung je Person gefuehrt wird, kann in einem
    gesetzlich versicherten Haushalt die Partnerin privat versichert sein.
    Gesucht ist deshalb die erste Person, die im Ruhestand privat versichert
    ist und einen Beitrag eingetragen hat.
  */
  const kandidaten = szenario.personen
    .filter((x) => x.id === 'A' || szenario.haushalt.verheiratet);
  const personA = kandidaten.find((x) => {
    const k = kvProfil(szenario, x);
    return k.status === 'pkv' && k.pkv.praemieMonat > 0;
  });
  if (!personA) return null;
  const profil = kvProfil(szenario, personA);
  const h = { ...szenario.haushalt, pkv: profil.pkv };

  const jetzt = new Date().getFullYear();
  const geburtsjahr = Number(personA.geburtsdatum.slice(-4));
  const rentenjahr = Number(personA.rentenbeginn.slice(-4));
  if (!Number.isFinite(geburtsjahr) || !Number.isFinite(rentenjahr)) return null;

  const alterHeute = jetzt - geburtsjahr;
  const alterBeiRentenbeginn = rentenjahr - geburtsjahr;

  const heute = pkvImJahr(h.pkv, alterHeute, 0);
  const beiRente = pkvImJahr(h.pkv, alterBeiRentenbeginn, rentenjahr - jetzt);
  const mitAchtzig = alterHeute < 80
    ? pkvImJahr(h.pkv, 80, geburtsjahr + 80 - jetzt)
    : null;

  /*
    Abgezinst wird mit der Inflation, nicht mit der Praemiensteigerung: die
    Frage ist, was die Praemie DANN in heutigem Geld wiegt — nicht, wie sie
    gewachsen ist.
  */
  const heutigesGeld = (betrag: number, jahr: number) =>
    betrag / Math.pow(1 + szenario.annahmen.inflation, jahr - jetzt);

  const p = parameterFuer(jetzt, {
    indexRate: szenario.annahmen.tarifIndex,
    zusatzbeitrag: profil.zusatzbeitrag,
  });
  /*
    DER ARBEITGEBERZUSCHUSS — aus der Erwerbslage DIESER Person.

    Vorher schloss die Rechnung nur Beamte aus: Ein Selbststaendiger sah
    „davon … vom Arbeitgeber", obwohl er keinen hat. Die Netto-Rechnung
    (`erwerb/netto.ts`) wusste das schon immer; jetzt kommt die Angabe aus
    derselben Quelle. Und die Grundlage ist der GESAMTbeitrag mit
    Entlastungstarif — wie dort. Mit der blossen Praemie stand der Zuschuss
    bei Angestellten zu niedrig da.
  */
  const erwerb = erwerbsBasisHeute(szenario, p, jetzt);
  const person = erwerb.jePerson.find((x) => x.id === personA.id) ?? erwerb.jePerson[0];
  const ohneArbeitgeber = !person || person.beamter || person.selbststaendig;
  const zuschuss = (praemie: number) =>
    ohneArbeitgeber ? 0 : arbeitgeberzuschuss(praemie, person.brutto, p);
  const zuschussHeute = zuschuss(heute.gesamtMonat);

  const bet = h.pkv.bet.aktiv && h.pkv.bet.entlastungMonat > 0
    ? betVergleich(h.pkv.bet, alterHeute, LEBENSERWARTUNG, jetzt)
    : null;

  /*
    DER ENTLASTUNGSTARIF NETTO. Drei Dinge wirken, die die Bruttorechnung
    nicht sieht:
    - Heute traegt der Arbeitgeber seinen Teil — soweit der Hoechstzuschuss
      nicht schon durch die Praemie ausgeschoepft ist. Deshalb die Differenz
      des Zuschusses mit und ohne den Tarif, nicht pauschal die Haelfte.
    - Heute mindert der eigene Anteil als Sonderausgabe die Steuer.
    - Im Ruhestand kostet die niedrigere Praemie Sonderausgabenabzug, zum
      Steuersatz dieses Jahres.
  */
  let betN: PkvErgebnis['betNetto'] = null;
  if (bet) {
    const betBeitrag = Math.max(0, h.pkv.bet.beitragMonat);
    const agAnteil = betBeitrag > 0
      ? (zuschussHeute - zuschuss(Math.max(0, heute.gesamtMonat - betBeitrag))) / betBeitrag
      : 0;
    const steuerOpt = {
      verheiratet: szenario.haushalt.verheiratet,
      bundesland: szenario.haushalt.bundesland,
      kirchensteuerpflichtig: szenario.haushalt.kirchensteuer,
    };
    const abzugHeute = betBeitrag * (1 - agAnteil) * 12 * PKV_BASISANTEIL;
    const steuersatzHeute = steuerJeEuro(erwerb.zve, abzugHeute, steuerOpt, p);

    const pRente = parameterFuer(zeile.jahr, {
      indexRate: szenario.annahmen.tarifIndex,
      zusatzbeitrag: profil.zusatzbeitrag,
    });
    const saldoJahr = (Math.max(0, h.pkv.bet.entlastungMonat)
      - betBeitrag * Math.max(0, h.pkv.bet.beitragImRuhestand)) * 12 * PKV_BASISANTEIL;
    // Das zvE der Zeile gilt MIT Entlastung, also mit dem kleineren Abzug.
    const steuersatzRuhestand = steuerJeEuro(
      zeile.zve - Math.max(0, saldoJahr), Math.max(0, saldoJahr), steuerOpt, pRente,
    );

    betN = {
      ...betNetto(h.pkv.bet, bet, { agAnteil, steuersatzHeute, steuersatzRuhestand }),
      steuersatzHeute,
      steuersatzRuhestand,
    };
  }

  return {
    person: personName(personA),
    steigerung: profil.pkv.steigerung,
    alterHeute,
    rentenjahr,
    alterBeiRentenbeginn,
    heute,
    beiRente,
    mitAchtzig,
    /*
      `gesamtMonat`, nicht `praemieMonat`: Der Beitrag zum Entlastungstarif
      endet mit Rentenbeginn nicht, er sinkt nur auf einen Restanteil. Wer
      hier die blosse Praemie zeigt, nennt weniger, als abfliesst.
    */
    beiRenteHeutigesGeld: heutigesGeld(beiRente.gesamtMonat, rentenjahr),
    mitAchtzigHeutigesGeld: mitAchtzig
      ? heutigesGeld(mitAchtzig.gesamtMonat, geburtsjahr + 80)
      : 0,
    zuschussHeute,
    verlauf: pkvVerlauf(h.pkv, geburtsjahr, jetzt, geburtsjahr + LEBENSERWARTUNG),
    /*
      Die Praemie steht im Geld des Rentenjahres, das Zielnetto ebenfalls —
      der Anteil ist damit ohne Umrechnung vergleichbar.
    */
    anteilAmZiel: zielNettoMonatImRentenjahr > 0
      ? beiRente.gesamtMonat / zielNettoMonatImRentenjahr
      : 0,
    bet,
    betNetto: betN,
    betAbAlter: h.pkv.bet.abAlter,
  };
}

/** Ab diesem Anteil am Zielnetto ist die Praemie ein eigenes Thema. */
export const SCHWELLE_ANTEIL = 0.15;
