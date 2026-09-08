import type { LegalParameters } from '../params/types.js';

/**
 * Die private Krankenversicherung ueber die Zeit.
 *
 * Bis hierher stand die Praemie STILL: der Betrag, den jemand heute eintraegt,
 * lief unveraendert durch jedes Jahr der Zeitachse — waehrend Rente und Bedarf
 * daneben mit ihren Dynamiken wuchsen. Die PKV-Last schrumpfte damit real Jahr
 * fuer Jahr, allein weil sie nicht fortgeschrieben wurde. Fuer einen privat
 * Versicherten war das die groesste einzelne Schoenfaerberei im Modell.
 *
 * WAS HIER RECHTSSTAND IST UND WAS ANNAHME — die Trennung ist wichtig, weil
 * der Verlauf sonst wie eine Prognose aussieht, die er nicht ist:
 *
 *   RECHTSSTAND (§ 149 VAG): Der gesetzliche Zuschlag von 10 % wird vom Jahr
 *   nach dem 21. bis zum Ende des KALENDERJAHRES DES 60. GEBURTSTAGS erhoben.
 *   Ab 61 entfaellt er — die Praemie sinkt einmalig um 1/1,1, also rund 9,1 %.
 *
 *   RECHTSSTAND (§ 150 Abs. 3 VAG): Ab 65 werden die daraus angesammelten
 *   Mittel verwendet, um PRAEMIENERHOEHUNGEN ZU FINANZIEREN. Sie senken die
 *   Praemie nicht — es gibt dort keine zweite Stufe nach unten, sondern eine
 *   gedaempfte Steigerung. Der verbreitete Merksatz "mit 65 fallen 10 % weg"
 *   verwechselt die beiden Normen.
 *
 *   ANNAHME: die beiden Steigerungssaetze. Das Gesetz schreibt den Mechanismus
 *   vor, nicht den Betrag. Beide sind deshalb Eingaben, keine Konstanten.
 *
 * NICHT gerechnet wird die Stufe ab 80 (§ 150 Abs. 3 S. 2 VAG: nicht
 * verbrauchte Mittel senken dann die Praemie). Auch dort steht der Mechanismus
 * im Gesetz, der Betrag haengt am einzelnen Versicherer. Die Projektion faellt
 * dadurch eher zu vorsichtig aus — das ist die Richtung, in der ein
 * Vorsorgerechner irren darf.
 */

/** Letztes Lebensjahr, in dem der gesetzliche Zuschlag erhoben wird (§ 149 VAG). */
export const ZUSCHLAG_BIS_ALTER = 60;
/** Hoehe des gesetzlichen Zuschlags auf die Bruttopraemie (§ 149 VAG). */
export const ZUSCHLAG_QUOTE = 0.1;
/** Ab diesem Alter daempfen die angesammelten Mittel die Erhoehungen (§ 150 Abs. 3 VAG). */
export const DAEMPFUNG_AB_ALTER = 65;

/**
 * Anteil der Praemie, der auf die Basisabsicherung entfaellt und damit als
 * Sonderausgabe abziehbar ist (§ 10 Abs. 1 Nr. 3 EStG).
 *
 * Steht hier als EINE Zahl, weil sie an drei Stellen gebraucht wird: fuer die
 * Praemie im Alter, fuer die Praemie in der Erwerbsphase und fuer den
 * Beitragsentlastungstarif. Drei Kopien einer Schaetzgroesse waeren drei
 * Gelegenheiten, sie unterschiedlich zu pflegen.
 */
export const PKV_BASISANTEIL = 0.8;

/**
 * Beitragsentlastungstarif: ein Beitrag heute, der ab einem gewaehlten Alter
 * eine feste Entlastung bringt.
 *
 * Beide Betraege sind NOMINAL zu verstehen — so, wie sie im Vertrag stehen.
 * Die Entlastung waechst nicht mit; sie verliert ueber die Jahre an Kaufkraft,
 * und genau das soll die Rechnung zeigen, statt es wegzuglaetten.
 */
export interface BetAnnahmen {
  /**
   * Ist ein Entlastungstarif vorhanden?
   *
   * Ein Schalter statt `bet: BetAnnahmen | null`, damit eingetragene Betraege
   * beim Abschalten stehen bleiben — dieselbe Ueberlegung, aus der ein
   * Vertrag die Strategie "ignorieren" hat, statt geloescht zu werden.
   */
  aktiv: boolean;
  /**
   * Was der Entlastungstarif heute im Monat kostet.
   *
   * Er steckt bereits in `praemieMonat` — dort steht der Gesamtbeitrag, so
   * wie ihn der Versicherer in Rechnung stellt. Diese Zahl sagt nur, welcher
   * Teil davon auf den Entlastungstarif entfaellt.
   */
  beitragMonat: number;
  /** Um wie viel er die Praemie ab `abAlter` senkt */
  entlastungMonat: number;
  /** Ab welchem Alter die Entlastung greift — meist 65 oder 67 */
  abAlter: number;
  /**
   * Welcher ANTEIL des Beitrags ab `abAlter` weiterlaeuft.
   *
   * Bei der AXA sinkt der Beitrag zum Entlastungstarif im Ruhestand auf ein
   * Viertel, statt ganz zu entfallen — die Entlastung ist lebenslang, der
   * Tarif traegt sich weiter mit. Andere Versicherer stellen ihn ab
   * Rentenbeginn beitragsfrei; dort steht hier 0. Deshalb eine Eingabe und
   * keine Konstante: Der Rechner soll nicht auf einen Anbieter festgelegt
   * sein.
   */
  beitragImRuhestand: number;
}

/**
 * Anteil des BET-Beitrags, der im Ruhestand weiterlaeuft, wenn nichts
 * anderes eingetragen ist — ein Viertel, wie beim AXA-Tarif.
 */
export const BET_RESTBEITRAG_VORGABE = 0.25;

export interface PkvAnnahmen {
  /**
   * GESAMTBEITRAG heute im Monat: Krankheitskosten- und
   * Pflegepflichtversicherung UND der Beitrag zum Entlastungstarif —
   * genau der Betrag, der auf der Rechnung des Versicherers steht.
   *
   * Frueher stand hier die Praemie OHNE den Entlastungstarif, und beide
   * Felder hiessen in der Maske „Beitrag monatlich". Wer seine Rechnung
   * abtippte, zaehlte den Entlastungstarif doppelt.
   */
  praemieMonat: number;
  /** Jaehrliche Steigerung bis 64 */
  steigerung: number;
  /** Gedaempfte Steigerung ab 65 (§ 150 Abs. 3 VAG) */
  steigerungAb65: number;
  /** Steckt der gesetzliche Zuschlag von 10 % in der eingetragenen Praemie? */
  zuschlagEnthalten: boolean;
  bet: BetAnnahmen;
}

export const PKV_VORGABE: PkvAnnahmen = {
  praemieMonat: 0,
  steigerung: 0.03,
  steigerungAb65: 0.015,
  zuschlagEnthalten: true,
  bet: {
    aktiv: false, beitragMonat: 0, entlastungMonat: 0, abAlter: 67,
    beitragImRuhestand: BET_RESTBEITRAG_VORGABE,
  },
};

/** Was die private Krankenversicherung in EINEM Jahr ausmacht, monatlich. */
export interface PkvJahr {
  alter: number;
  /** Krankenversicherungspraemie NACH Entlastung, OHNE Entlastungstarif */
  praemieMonat: number;
  /**
   * Beitrag zum Entlastungstarif. Ab `abAlter` nur noch der Restanteil —
   * bei der Vorgabe ein Viertel, nicht null.
   */
  betBeitragMonat: number;
  /** Was der Entlastungstarif in diesem Jahr erspart */
  entlastungMonat: number;
  /** Was tatsaechlich abfliesst: Praemie plus Beitrag zum Entlastungstarif */
  gesamtMonat: number;
}

/**
 * Die private Krankenversicherung in einem bestimmten Jahr.
 *
 * `alter` ist das Alter IN DIESEM JAHR, `jahreAbHeute` der Abstand zum heutigen
 * Jahr. Aus beidem ergibt sich das heutige Alter — und damit, wie viele
 * Steigerungsjahre vor und wie viele nach der Daempfungsgrenze liegen.
 */
export function pkvImJahr(a: PkvAnnahmen, alter: number, jahreAbHeute: number): PkvJahr {
  const alterHeute = alter - jahreAbHeute;

  /*
    Stueckweise verzinsen statt mit einem Mischsatz: die Grenze bei 65 liegt
    irgendwo mitten in der Laufzeit, und ein Durchschnittssatz haette sie
    verwischt. `Math.min/max` fangen die Faelle ab, in denen jemand die Grenze
    heute schon ueberschritten hat oder sie nie erreicht.
  */
  const jahreBis65 = Math.min(Math.max(0, DAEMPFUNG_AB_ALTER - alterHeute), Math.max(0, jahreAbHeute));
  const jahreAb65 = Math.max(0, jahreAbHeute) - jahreBis65;

  /*
    Der Entlastungstarif steckt im eingetragenen GESAMTBEITRAG und wird
    vorweg herausgerechnet: Er folgt eigenen Regeln — sein Beitrag ist
    nominal vereinbart, steigt also nicht mit, und ab `abAlter` sinkt er auf
    einen Restanteil. Fortgeschrieben wird nur der Krankenversicherungsteil.
  */
  const betBeitragHeute = a.bet.aktiv ? Math.max(0, a.bet.beitragMonat) : 0;
  const kvAnteilHeute = Math.max(0, Math.max(0, a.praemieMonat) - betBeitragHeute);

  let praemie = kvAnteilHeute
    * Math.pow(1 + a.steigerung, jahreBis65)
    * Math.pow(1 + a.steigerungAb65, jahreAb65);

  /*
    Der Zuschlag faellt weg, nicht die Praemie um 10 %: er sitzt OBEN AUF der
    Nettopraemie, ein Wegfall teilt also durch 1,1 und kuerzt damit um rund
    9,1 %. Die Bedingung `alterHeute <= 60` ist keine Feinheit — wer heute
    schon 61 ist, hat den Zuschlag nie in seiner eingetragenen Praemie, und
    ihn abzuziehen waere schlicht ein Rabatt aus dem Nichts.
  */
  if (a.zuschlagEnthalten && alterHeute <= ZUSCHLAG_BIS_ALTER && alter > ZUSCHLAG_BIS_ALTER) {
    praemie /= 1 + ZUSCHLAG_QUOTE;
  }

  const bet = a.bet;
  const imRuhestand = bet.aktiv && alter >= bet.abAlter;
  const entlastung = imRuhestand
    ? Math.min(praemie, Math.max(0, bet.entlastungMonat))
    : 0;
  /*
    Ab `abAlter` faellt der Beitrag NICHT weg, sondern auf den vereinbarten
    Restanteil — bei der AXA ein Viertel. Ihn dort auf null zu setzen, wie es
    diese Rechnung frueher tat, zeigte die Belastung im Ruhestand zu niedrig.
  */
  const betBeitrag = !bet.aktiv ? 0
    : imRuhestand ? betBeitragHeute * Math.max(0, bet.beitragImRuhestand)
    : betBeitragHeute;

  const nachEntlastung = Math.max(0, praemie - entlastung);
  return {
    alter,
    praemieMonat: nachEntlastung,
    betBeitragMonat: betBeitrag,
    entlastungMonat: entlastung,
    gesamtMonat: nachEntlastung + betBeitrag,
  };
}

/** Derselbe Verlauf ueber eine Spanne von Kalenderjahren. */
export function pkvVerlauf(
  a: PkvAnnahmen,
  geburtsjahr: number,
  vonJahr: number,
  bisJahr: number,
): (PkvJahr & { jahr: number })[] {
  const reihe: (PkvJahr & { jahr: number })[] = [];
  for (let jahr = vonJahr; jahr <= bisJahr; jahr++) {
    reihe.push({ jahr, ...pkvImJahr(a, jahr - geburtsjahr, jahr - vonJahr) });
  }
  return reihe;
}

/**
 * Zuschuss des Arbeitgebers zur privaten Kranken- und Pflegeversicherung
 * (§ 257 SGB V, § 61 SGB XI).
 *
 * Beide Normen haben dieselbe Gestalt: der halbe Beitragssatz auf die
 * beitragspflichtigen Einnahmen — also das tatsaechliche Brutto, gedeckelt an
 * der Beitragsbemessungsgrenze —, hoechstens aber die Haelfte dessen, was der
 * Beschaeftigte zahlt.
 *
 * Kranken- und Pflegeteil werden GEMEINSAM gerechnet, weil die Praemie als EIN
 * Betrag erfasst wird. Sie kuenstlich aufzuteilen, um die beiden Deckel
 * getrennt anzuwenden, hiesse einen Schluessel zu erfinden; die Summe beider
 * Saetze auf dieselbe Bemessungsgrundlage ergibt denselben Betrag, ohne die
 * Erfindung. Beim Pflegesatz zaehlt der allgemeine Satz: § 61 SGB XI deckelt
 * auf den Hoechstbeitrag fuer Mitglieder MIT Kindern, der Kinderlosenzuschlag
 * bleibt also aussen vor.
 *
 * Beamte bekommen ihn nicht — an seine Stelle tritt die Beihilfe, und die
 * steckt bereits in der niedrigeren Praemie, die sie eintragen.
 */
export function arbeitgeberzuschuss(
  praemieMonat: number,
  jahresbrutto: number,
  p: LegalParameters,
): number {
  const bemessungMonat = Math.min(Math.max(0, jahresbrutto), p.bbgKvJahr) / 12;
  const satzHalb = (p.kv.allgemeinerSatz + p.kv.zusatzbeitrag + p.pv.satz) / 2;
  return Math.min(bemessungMonat * satzHalb, Math.max(0, praemieMonat) / 2);
}

/** Eingezahlt gegen erspart — die Rechnung hinter dem Entlastungstarif. */
export interface BetVergleich {
  /** Jahre, in denen der Beitrag noch laeuft */
  jahreEinzahlung: number;
  /** Summe der Beitraege bis zum Beginn der Entlastung, nominal */
  eingezahlt: number;
  /** Summe der Entlastung bis zur Lebenserwartung, nominal */
  erspart: number;
  /** Davon als Sonderausgabe abziehbar (Basisanteil) */
  abzugsfaehig: number;
  /**
   * Alter, in dem die aufgelaufene Entlastung die Beitraege eingeholt hat.
   * `null`, wenn das nie geschieht — etwa bei einer Entlastung von null.
   */
  breakEvenAlter: number | null;
}

/**
 * Alles nominal addiert, ohne Abzinsung.
 *
 * Eine Abzinsung braeuchte einen Zinssatz, und der waere eine weitere Annahme
 * in einer Rechnung, die ohnehin schon auf zweien steht. Der Hinweis, dass
 * spaetere Euro weniger wert sind, gehoert daneben in den Text — nicht in eine
 * Zahl, die dann niemand mehr nachrechnen kann.
 */
export function betVergleich(
  bet: BetAnnahmen,
  alterHeute: number,
  lebenserwartung: number,
): BetVergleich {
  const jahreEinzahlung = Math.max(0, bet.abAlter - alterHeute);
  const jahreEntlastung = Math.max(0, lebenserwartung - bet.abAlter);

  const eingezahlt = Math.max(0, bet.beitragMonat) * 12 * jahreEinzahlung;
  const erspart = Math.max(0, bet.entlastungMonat) * 12 * jahreEntlastung;

  const entlastungJahr = Math.max(0, bet.entlastungMonat) * 12;
  const breakEvenAlter = entlastungJahr > 0
    ? bet.abAlter + eingezahlt / entlastungJahr
    : null;

  return {
    jahreEinzahlung,
    eingezahlt,
    erspart,
    abzugsfaehig: eingezahlt * PKV_BASISANTEIL,
    breakEvenAlter,
  };
}
