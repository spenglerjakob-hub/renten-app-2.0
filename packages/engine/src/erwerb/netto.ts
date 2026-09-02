import type { LegalParameters } from '../params/types.js';
import { einkommensteuer, solidaritaetszuschlag, kirchensteuersatz } from '../tax/estg.js';
import { kvPvArbeitnehmer, kvSatzVoll, pvSatzMitglied, type KinderStatus } from '../social/kv-pv.js';
import { arbeitgeberzuschuss, PKV_BASISANTEIL } from '../social/pkv.js';

export interface ErwerbsOptionen {
  verheiratet: boolean;
  bundesland: string;
  kirchensteuerpflichtig: boolean;
  kinder: KinderStatus;
  /** Beamte zahlen keine gesetzliche RV/AV */
  beamter?: boolean;
  /**
   * Privat krankenversichert.
   *
   * BEFUND: Diese Angabe gab es hier nicht — die Praemie hing allein an
   * `beamter`, und `beamter` ist im Rechenkern nichts weiter als "Einkommen
   * als Besoldung erfasst". Damit erledigte EIN Merkmal zwei verschiedene
   * Aufgaben: "keine RV/AV" und "privat krankenversichert". Die Mengen sind
   * aber nicht dieselbe. Jeder Beamte ist privat versichert, laengst nicht
   * jeder privat Versicherte ist Beamter.
   *
   * Die Folge waren zwei falsche Nettos: ein privat versicherter Angestellter
   * zahlte bis zum Rentenbeginn den GKV-Arbeitnehmeranteil, und ein Beamter
   * ohne gesetzten PKV-Status zahlte GAR KEINE Krankenversicherung, weil die
   * Praemie dann auf null gesetzt wurde und der Beamtenzweig keine
   * Alternative kannte.
   */
  privatVersichert?: boolean;
  /**
   * Monatlicher Aufwand fuer die private Kranken- und Pflegeversicherung —
   * Praemie zuzueglich eines etwaigen Beitragsentlastungstarifs, VOR dem
   * Arbeitgeberzuschuss. Fortgeschrieben auf das jeweilige Jahr.
   */
  pkvPraemieMonat?: number;
}

export interface ErwerbsNetto {
  jahresbrutto: number;
  jahresnetto: number;
  monatsbrutto: number;
  monatsnetto: number;
  sv: number;
  est: number;
  soli: number;
  kirchensteuer: number;
  zve: number;
}

/**
 * Sozialabgaben und zvE-Beitrag EINER Person.
 *
 * Bewusst je Person, denn `kvPvArbeitnehmer` deckelt an den
 * Beitragsbemessungsgrenzen — und die gelten je Person, nicht je Haushalt.
 * Auch die Pauschbetraege nach § 9a und § 10c stehen jeder Person einzeln zu.
 */
function personAnteil(
  jahresbrutto: number,
  o: ErwerbsOptionen,
  p: LegalParameters,
  beamter: boolean,
  pkvPraemieMonat: number,
): { brutto: number; sv: number; zveBeitrag: number } {
  const brutto = Math.max(0, jahresbrutto);
  const privat = o.privatVersichert ?? false;

  let sv: number;
  let vorsorgeAbzug: number;

  const gesetzlich = kvPvArbeitnehmer(brutto, o.kinder, p, { sachsen: o.bundesland === 'Sachsen' });

  if (privat) {
    /*
      Der Arbeitgeberzuschuss (§ 257 SGB V, § 61 SGB XI) steht Beschaeftigten
      zu, nicht Beamten — bei denen tritt die Beihilfe an seine Stelle, und
      die steckt bereits in der niedrigeren Praemie, die sie eintragen.
    */
    const aufwandMonat = Math.max(0, pkvPraemieMonat);
    const zuschussMonat = beamter ? 0 : arbeitgeberzuschuss(aufwandMonat, brutto, p);
    const eigenerAnteil = Math.max(0, aufwandMonat - zuschussMonat) * 12;

    // Abziehbar ist nur der EIGENE Anteil: der Zuschuss ist nach
    // § 3 Nr. 62 EStG steuerfrei und mindert deshalb den Sonderausgabenabzug.
    const kvAbzug = eigenerAnteil * PKV_BASISANTEIL;

    if (beamter) {
      sv = eigenerAnteil;
      vorsorgeAbzug = kvAbzug;
    } else {
      // Renten- und Arbeitslosenversicherung laufen unveraendert weiter — die
      // private Krankenversicherung aendert daran nichts.
      sv = gesetzlich.rv + gesetzlich.av + eigenerAnteil;
      vorsorgeAbzug = gesetzlich.rv + kvAbzug;
    }
  } else if (beamter) {
    /*
      Beamter, aber gesetzlich versichert — freiwillige Mitgliedschaft. Selten,
      aber es gibt sie, und bisher stand hier eine Null: die Praemie war 0,
      weil kein PKV-Status gesetzt war, und einen gesetzlichen Zweig gab es
      nicht. Ein Dienstherr zahlt keinen Arbeitgeberanteil, also traegt das
      Mitglied den vollen Satz.
    */
    const bemessung = Math.min(brutto, p.bbgKvJahr);
    const kv = bemessung * kvSatzVoll(p);
    const pv = bemessung * pvSatzMitglied(o.kinder, p);
    sv = kv + pv;
    // Wie bei Angestellten: der auf das Krankengeld entfallende Anteil ist
    // nicht abzugsfaehig (§ 10 Abs. 1 Nr. 3 Buchst. a S. 4 EStG).
    vorsorgeAbzug = kv * 0.96 + pv;
  } else {
    sv = gesetzlich.gesamt;
    vorsorgeAbzug = gesetzlich.abzugsfaehig;
  }

  const zveBeitrag = Math.max(
    0,
    brutto - p.pauschbetraege.arbeitnehmer - p.pauschbetraege.sonderausgaben - vorsorgeAbzug,
  );

  return { brutto, sv, zveBeitrag };
}

/** Brutto -> Netto fuer die Erwerbsphase, EINE Person. */
export function bruttoZuNetto(
  jahresbrutto: number,
  o: ErwerbsOptionen,
  p: LegalParameters,
): ErwerbsNetto {
  const a = personAnteil(jahresbrutto, o, p, o.beamter ?? false, o.pkvPraemieMonat ?? 0);
  const brutto = a.brutto;
  const sv = a.sv;
  const zve = a.zveBeitrag;

  const est = einkommensteuer(zve, o.verheiratet, p);
  const soli = solidaritaetszuschlag(est, o.verheiratet, p);
  const kist = o.kirchensteuerpflichtig ? est * kirchensteuersatz(o.bundesland) : 0;

  const netto = brutto - sv - est - soli - kist;
  return {
    jahresbrutto: brutto,
    jahresnetto: netto,
    monatsbrutto: brutto / 12,
    monatsnetto: netto / 12,
    sv, est, soli, kirchensteuer: kist, zve,
  };
}

export interface HaushaltsPerson {
  jahresbrutto: number;
  beamter: boolean;
  /**
   * Anteil dieser Person am monatlichen PKV-Aufwand des Haushalts.
   *
   * Der Haushaltsbetrag wird vom Aufrufer auf die Erwerbstaetigen verteilt.
   * Ihn jeder Person voll zu uebergeben verdoppelte ihn bei zwei Verdienern —
   * genau das tat die Zeitachse bisher.
   */
  pkvPraemieMonat?: number;
}

export interface ErwerbHaushaltErgebnis {
  jahresbrutto: number;
  jahresnetto: number;
  /** Sozialabgaben ALLER Personen zusammen */
  sv: number;
  /** Gemeinsames zu versteuerndes Einkommen */
  zve: number;
  est: number;
  soli: number;
  kirchensteuer: number;
  /** Brutto und SV je Person, in der uebergebenen Reihenfolge */
  proPerson: { brutto: number; sv: number; zveBeitrag: number }[];
}

/**
 * Erwerbseinkommen eines HAUSHALTS.
 *
 * BEFUND: Die Zeitachse schickte das gesamte Haushaltseinkommen als EINE
 * Person durch `bruttoZuNetto`. Die Beitragsbemessungsgrenzen gelten aber je
 * Person. Bei zwei Verdienern mit je 60 000 EUR wurden dadurch 18 526 EUR
 * Sozialabgaben statt 26 100 EUR angesetzt — rund 630 EUR im Monat zu wenig,
 * das ausgewiesene Netto war entsprechend zu hoch.
 *
 * Deshalb die Zweiteilung, die dem Gesetz entspricht:
 *  - Sozialabgaben JE PERSON, jede mit eigener Beitragsbemessungsgrenze.
 *  - Einkommensteuer EINMAL auf das gemeinsame zvE, mit Splittingtarif.
 */
export function erwerbHaushalt(
  personen: readonly HaushaltsPerson[],
  o: ErwerbsOptionen,
  p: LegalParameters,
): ErwerbHaushaltErgebnis {
  const proPerson = personen.map((x) =>
    personAnteil(x.jahresbrutto, o, p, x.beamter, x.pkvPraemieMonat ?? 0),
  );

  const jahresbrutto = proPerson.reduce((sum, x) => sum + x.brutto, 0);
  const sv = proPerson.reduce((sum, x) => sum + x.sv, 0);
  const zve = proPerson.reduce((sum, x) => sum + x.zveBeitrag, 0);

  const est = einkommensteuer(zve, o.verheiratet, p);
  const soli = solidaritaetszuschlag(est, o.verheiratet, p);
  const kist = o.kirchensteuerpflichtig ? est * kirchensteuersatz(o.bundesland) : 0;

  return {
    jahresbrutto,
    jahresnetto: jahresbrutto - sv - est - soli - kist,
    sv, zve, est, soli, kirchensteuer: kist,
    proPerson,
  };
}

/**
 * Netto -> Brutto durch Bisektion ueber die Vorwaertsfunktion.
 *
 * Der Prototyp schaetzte hier mit festen Faktoren (Netto x 1,55 bzw. x 1,35).
 * Da "Netto" die VOREINSTELLUNG der Gehaltseingabe war, stand damit der
 * gesamte Vertrags-TUEV auf einem geratenen zu versteuernden Einkommen
 * (Befund B9). Die Umkehrung ist monoton, also exakt loesbar.
 */
export function nettoZuBrutto(
  jahresnettoZiel: number,
  o: ErwerbsOptionen,
  p: LegalParameters,
): ErwerbsNetto {
  const ziel = Math.max(0, jahresnettoZiel);
  if (ziel === 0) return bruttoZuNetto(0, o, p);

  let lo = ziel;
  let hi = Math.max(ziel * 3, ziel + 100000);

  // Obergrenze absichern
  let guard = 0;
  while (bruttoZuNetto(hi, o, p).jahresnetto < ziel && guard++ < 60) hi *= 1.5;

  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (bruttoZuNetto(mid, o, p).jahresnetto < ziel) lo = mid;
    else hi = mid;
  }
  return bruttoZuNetto((lo + hi) / 2, o, p);
}
