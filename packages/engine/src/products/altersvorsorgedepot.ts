import type { AvdParameter, LegalParameters } from '../params/types.js';
import { ansparphase, entnahmeplan, type DepotVerlauf } from './kapitalanlage.js';
import { zusatzsteuer, abgeltungsteuer } from '../tax/haushalt.js';
import { kennzahlen } from '../analyse/kennzahlen.js';

/**
 * Altersvorsorgedepot ab dem 01.01.2027.
 *
 * Das gefoerderte Depot loest den Riester-Vertrag ab. Fuer die Rechnung sind
 * drei Eigenschaften entscheidend, und alle drei unterscheiden es vom freien
 * ETF-Depot:
 *
 *  1. Auf den Eigenbeitrag gibt es ZULAGEN. Sie fliessen wie eine zusaetzliche
 *     Einzahlung in den Vertrag und verzinsen sich mit.
 *  2. In der Ansparphase faellt KEINE Vorabpauschale an. Wer hier die
 *     Depot-Logik unveraendert anwendet, zieht dem Vertrag jedes Jahr Steuern
 *     ab, die es nicht gibt.
 *  3. Die Auszahlung ist VOLLSTAENDIG nachgelagert zu versteuern, und zwar
 *     mit dem persoenlichen (tariflichen) Satz — nicht mit Abgeltungsteuer.
 *     Das ist der teuerste Verwechslungsfehler, den man hier machen kann:
 *     25 % statt des Grenzsteuersatzes schoenen die Rechnung erheblich.
 */

/**
 * Ein Kind mit eigener Ausbildungsdauer.
 *
 * Frueher stand hier nur das Geburtsjahr, dazu EIN Schalter "in Ausbildung"
 * fuer alle Kinder gemeinsam. Wer mit 22 fertig war, bekam die Zulage
 * trotzdem bis 25 gerechnet — bei 300 EUR im Jahr drei Jahre zu viel.
 */
export interface AvdKind {
  geburtsjahr: number;
  /**
   * Bis EINSCHLIESSLICH diesem Jahr in Ausbildung oder Studium; fehlt das
   * Feld, gibt es keine.
   *
   * Ein Jahr und kein Alter: der Rechenkern prueft jahrweise. Ein Alter
   * muesste an jeder Stelle erst in ein Jahr zurueckgerechnet werden, und
   * `jahr - geburtsjahr` ist das Alter, das im Jahr ERREICHT wird — nicht das
   * an einem Stichtag. Diese Verwechslung soll hier gar nicht erst moeglich
   * sein. Ausserdem beantwortet ein Mensch die Frage "bis wann?" mit einer
   * Jahreszahl, nicht mit einem Alter.
   */
  ausbildungBisJahr?: number;
}

/**
 * Letztes Beitragsjahr, in dem dieses Kind noch Kinderzulage bringt.
 *
 * Steht bewusst als eigene, exportierte Funktion da: die Oberflaeche zeigt
 * denselben Wert an ("noch 3 Jahre"). Zwei Fassungen derselben Regel laufen
 * frueher oder spaeter auseinander — und dann zeigt die Seite eine andere
 * Zahl, als sie rechnet.
 */
export function avdKinderzulageBis(kind: AvdKind, p: AvdParameter): number {
  // Kindergeld laeuft immer bis 18. Daran aendert eine Ausbildung nichts,
  // und ein frueheres Ausbildungsende verkuerzt diesen Teil auch nicht.
  const ohneAusbildung = kind.geburtsjahr + p.kinderzulageBisAlter - 1;
  if (kind.ausbildungBisJahr === undefined) return ohneAusbildung;

  // Darueber hinaus nur, solange die Ausbildung LAEUFT und das Kind unter 25
  // ist. Beide Grenzen wirken; frueher wirkte nur die zweite.
  return Math.max(
    ohneAusbildung,
    Math.min(kind.ausbildungBisJahr, kind.geburtsjahr + p.kinderzulageBisAlterAusbildung - 1),
  );
}

export interface AvdZulagen {
  /** Stufe 1: 50 % auf die ersten 360 EUR */
  stufe1: number;
  /** Stufe 2: 25 % auf die weiteren 1 440 EUR */
  stufe2: number;
  grundzulage: number;
  kinderzulage: number;
  /** Einmaliger Berufseinsteigerbonus */
  bonus: number;
  /** Wie viele Kinder in DIESEM Jahr noch Anspruch haben */
  kinderMitAnspruch: number;
  /**
   * Was es JEDES Jahr gibt: Grundzulage plus Kinderzulage, ohne den einmaligen
   * Bonus.
   *
   * Getrennt gefuehrt, weil sonst die Foerderquote des ersten Jahres fuer die
   * ganze Laufzeit versprochen wird. Bei 360 EUR Beitrag unter 25 waeren das
   * 105,6 % statt der dauerhaft geltenden 50 % — ein Unterschied, an dem sich
   * eine Sparentscheidung aufhaengen kann.
   */
  dauerhaft: number;
  /** Zulagen dieses Jahres einschliesslich Bonus */
  gesamt: number;
  /** Zulagen je Euro Eigenbeitrag, EINSCHLIESSLICH einmaligem Bonus */
  foerderquote: number;
  /** Zulagen je Euro Eigenbeitrag, wie sie dauerhaft gelten */
  foerderquoteDauerhaft: number;
  hinweise: string[];
}

/**
 * Zulagen fuer EIN Beitragsjahr.
 *
 * Der Mindesteigenbeitrag ist der Fallstrick, den schon Riester hatte: wer
 * darunter bleibt, bekommt nicht etwa anteilig weniger, sondern gar nichts.
 * Deshalb steht das hier als eigener Hinweis und nicht nur als stille Null.
 */
export function avdZulagen(
  args: {
    eigenbeitragJahr: number;
    /**
     * Die Kinder — NICHT ihre Anzahl.
     *
     * Die Kinderzulage haengt am Kindergeldanspruch und endet mit ihm. Mit
     * einer blossen Anzahl liesse sie sich ueber die ganze Ansparphase
     * rechnen; bei 30 Jahren Laufzeit waeren das leicht 5 000 EUR zu viel.
     * Riester macht es in `products/bav.ts` seit jeher ueber die Geburtsjahre.
     */
    kinder?: readonly AvdKind[];
    /** Alter des SPARERS — entscheidet ueber den Berufseinsteigerbonus */
    alter: number;
    /**
     * Beitragsjahr. PFLICHT, weil ohne Jahr nicht zu entscheiden waere, welche
     * Kinder noch Anspruch haben — und ein stillschweigendes "alle zaehlen"
     * genau der Fehler waere, den diese Aenderung behebt.
     */
    jahr: number;
  },
  p: AvdParameter,
): AvdZulagen {
  const hinweise: string[] = [];
  const eigen = Math.max(0, args.eigenbeitragJahr);
  const leer: AvdZulagen = {
    stufe1: 0, stufe2: 0, grundzulage: 0, kinderzulage: 0, bonus: 0, kinderMitAnspruch: 0,
    dauerhaft: 0, gesamt: 0, foerderquote: 0, foerderquoteDauerhaft: 0, hinweise,
  };

  if (args.jahr < p.abJahr) {
    hinweise.push(`Das Altersvorsorgedepot gibt es erst ab ${p.abJahr}.`);
    return leer;
  }

  if (eigen < p.mindesteigenbeitragJahr) {
    hinweise.push(
      `Unter ${p.mindesteigenbeitragJahr} € Eigenbeitrag im Jahr ` +
      `(${(p.mindesteigenbeitragJahr / 12).toFixed(2).replace('.', ',')} € im Monat) ` +
      'entfällt die Förderung vollständig — nicht anteilig.',
    );
    return leer;
  }

  const stufe1 = Math.min(eigen, p.stufe1Grenze) * p.stufe1Satz;
  const stufe2 = Math.max(0, Math.min(eigen, p.stufe2Grenze) - p.stufe1Grenze) * p.stufe2Satz;
  const grundzulage = stufe1 + stufe2;

  // Die Kinderzulage ist KEINE Pauschale, sondern eine Eins-zu-eins-Zulage:
  // je Kind ein Euro fuer jeden eigenen Euro, hoechstens 300 EUR. Die vollen
  // 300 EUR je Kind gibt es deshalb erst ab 300 EUR Eigenbeitrag im Jahr —
  // unabhaengig davon, wie viele Kinder es sind.
  //
  // Und sie laeuft nur, solange Kindergeld fliesst: im Regelfall bis 18, bei
  // Ausbildung oder Studium hoechstens bis 25 — und dort auch nur so lange,
  // wie die Ausbildung tatsaechlich dauert (siehe avdKinderzulageBis).
  const kinder = (args.kinder ?? []).filter(
    (kind) => args.jahr >= kind.geburtsjahr && args.jahr <= avdKinderzulageBis(kind, p),
  ).length;

  // Wer "Ausbildung bis 2050" eintraegt, soll nicht stillschweigend mit 2044
  // gerechnet bekommen. Eine gekappte Angabe ohne Hinweis liest sich als
  // Rechenfehler.
  for (const kind of args.kinder ?? []) {
    const gedeckelt = kind.geburtsjahr + p.kinderzulageBisAlterAusbildung - 1;
    if (kind.ausbildungBisJahr !== undefined && kind.ausbildungBisJahr > gedeckelt) {
      hinweise.push(
        `Für das ${kind.geburtsjahr} geborene Kind ist Ausbildung bis ${kind.ausbildungBisJahr} ` +
        `angegeben. Die Kinderzulage endet aber spätestens mit ` +
        `${p.kinderzulageBisAlterAusbildung} — hier also ${gedeckelt}.`,
      );
    }
  }

  const jeKind = Math.min(p.kinderzulage, eigen);
  const kinderzulage = kinder * jeKind;
  if (kinder > 0 && jeKind < p.kinderzulage) {
    hinweise.push(
      `Die volle Kinderzulage von ${p.kinderzulage} € je Kind gibt es erst ab ` +
      `${p.kinderzulage} € Eigenbeitrag im Jahr (${(p.kinderzulage / 12).toFixed(2).replace('.', ',')} € im Monat). ` +
      `Hier sind es ${jeKind.toFixed(0)} € je Kind.`,
    );
  }

  const bonus = args.alter < p.berufseinsteigerAlterMax ? p.berufseinsteigerbonus : 0;

  if (eigen > p.stufe2Grenze) {
    hinweise.push(
      `Oberhalb von ${p.stufe2Grenze} € Eigenbeitrag im Jahr steigt die Grundzulage ` +
      'nicht weiter. Mehr Beitrag lohnt sich dann nur noch wegen der Rendite und der Steuer.',
    );
  }

  const dauerhaft = grundzulage + kinderzulage;
  const gesamt = dauerhaft + bonus;
  return {
    stufe1, stufe2, grundzulage, kinderzulage, bonus, kinderMitAnspruch: kinder,
    dauerhaft, gesamt,
    foerderquote: eigen > 0 ? gesamt / eigen : 0,
    foerderquoteDauerhaft: eigen > 0 ? dauerhaft / eigen : 0,
    hinweise,
  };
}

export interface AvdJahr {
  jahr: number;
  alter: number;
  /** Depotwert am Jahresende */
  kapital: number;
  /** Eigenbeitraege bis einschliesslich dieses Jahres */
  eigenbeitraegeKumuliert: number;
  /** Zulagen bis einschliesslich dieses Jahres */
  zulagenKumuliert: number;
  /** Kursgewinne = Kapital minus eingezahltes Geld; kann negativ nicht werden */
  gewinnKumuliert: number;
}

export interface AvdAnsparErgebnis {
  endkapital: number;
  /** Summe der EIGENbeitraege ohne Zulagen */
  eigenbeitraege: number;
  /** Summe aller vereinnahmten Zulagen */
  zulagenGesamt: number;
  /** Zulagen des ersten Jahres, aufgeschluesselt */
  ersteZulagen: AvdZulagen;
  /**
   * Jahr fuer Jahr, damit sich der Aufbau zeichnen laesst. Ohne die Reihe
   * bliebe unsichtbar, dass die Zulagen mitverzinst werden — der staerkste
   * Effekt der Foerderung ueberhaupt.
   */
  verlauf: AvdJahr[];
  hinweise: string[];
}

/**
 * Ansparphase des Altersvorsorgedepots.
 *
 * Baut auf `ansparphase()` auf, aber jahrweise, weil die Zulage vom
 * Eigenbeitrag DIESES Jahres abhaengt und der Bonus nur einmal faellt. Der
 * Basiszins geht mit 0 hinein — das ist die technische Umsetzung von
 * "keine Vorabpauschale" und keine Vereinfachung.
 */
export function avdAnsparphase(
  args: {
    beitragMonat: number;
    dynamik: number;
    startkapital: number;
    jahre: number;
    renditeBrutto: number;
    ter: number;
    kinder?: readonly AvdKind[];
    alterHeute: number;
    startjahr: number;
  },
  p: LegalParameters,
): AvdAnsparErgebnis {
  const hinweise: string[] = [];
  let kapital = Math.max(0, args.startkapital);
  let eigenSumme = 0;
  let zulagenSumme = 0;
  let bonusVerbraucht = false;
  let ersteZulagen: AvdZulagen | undefined;
  const verlauf: AvdJahr[] = [];

  for (let j = 0; j < Math.max(0, args.jahre); j++) {
    const beitragMonat = args.beitragMonat * Math.pow(1 + args.dynamik, j);
    const eigen = beitragMonat * 12;

    const z = avdZulagen(
      {
        eigenbeitragJahr: eigen,
        kinder: args.kinder,
        alter: args.alterHeute + j,
        jahr: args.startjahr + j,
      },
      p.avd,
    );
    // Der Bonus ist einmalig, nicht jaehrlich.
    const bonus = bonusVerbraucht ? 0 : z.bonus;
    if (bonus > 0) bonusVerbraucht = true;
    const zulage = z.grundzulage + z.kinderzulage + bonus;

    if (j === 0) {
      ersteZulagen = { ...z, bonus, gesamt: zulage, foerderquote: eigen > 0 ? zulage / eigen : 0 };
      hinweise.push(...z.hinweise);
    }

    // Ein Jahr Ansparen. basiszins 0: das Altersvorsorgedepot kennt in der
    // Ansparphase keine Vorabpauschale.
    const schritt: DepotVerlauf = ansparphase({
      startkapital: kapital,
      sparrateMonat: (eigen + zulage) / 12,
      jahre: 1,
      renditeBrutto: args.renditeBrutto,
      ter: args.ter,
      ausgabeaufschlag: 0,
      depotgebuehrJahr: 0,
      teilfreistellung: 0,
      basiszins: 0,
      sparerpauschbetrag: p.pauschbetraege.sparer,
      abgeltungsteuerSatzEffektiv: 0,
    });

    kapital = schritt.endkapital;
    eigenSumme += eigen;
    zulagenSumme += zulage;

    verlauf.push({
      jahr: args.startjahr + j,
      alter: args.alterHeute + j + 1,
      kapital,
      eigenbeitraegeKumuliert: eigenSumme,
      zulagenKumuliert: zulagenSumme,
      gewinnKumuliert: Math.max(0, kapital - eigenSumme - zulagenSumme - Math.max(0, args.startkapital)),
    });
  }

  return {
    endkapital: kapital,
    eigenbeitraege: eigenSumme,
    zulagenGesamt: zulagenSumme,
    ersteZulagen: ersteZulagen ?? avdZulagen(
      {
        eigenbeitragJahr: 0, kinder: args.kinder, alter: args.alterHeute,
        jahr: args.startjahr,
      },
      p.avd,
    ),
    verlauf,
    hinweise,
  };
}

/**
 * Bruttoauszahlung des Altersvorsorgedepots je Jahr.
 *
 * Ein Auszahlplan muss nach dem Gesetz mindestens bis zum 85. Lebensjahr
 * laufen; kuerzere Angaben werden deshalb angehoben, statt sie stillschweigend
 * zu rechnen. Die Auszahlung ist in VOLLER Hoehe steuerpflichtig — sie geht
 * also als tarifliche Einkunft weiter, nicht in die Abgeltungsteuer.
 */
export function avdAuszahlung(
  args: {
    kapital: number; alterBeiBeginn: number; dauerJahre: number; rendite: number;
    /** Anteil, der zu Rentenbeginn auf einen Schlag entnommen wird (0 bis 0,3) */
    teilauszahlungQuote?: number;
  },
  p: AvdParameter,
): { bruttoJahr: number; dauerJahre: number; teilauszahlung: number; hinweise: string[] } {
  const hinweise: string[] = [];
  if (args.kapital <= 0) return { bruttoJahr: 0, dauerJahre: 0, teilauszahlung: 0, hinweise };

  let alter = args.alterBeiBeginn;
  if (alter < p.auszahlungAbAlter) {
    hinweise.push(
      `Ausgezahlt wird frühestens ab ${p.auszahlungAbAlter}. Gerechnet wird deshalb ab ${p.auszahlungAbAlter}.`,
    );
    alter = p.auszahlungAbAlter;
  }

  const mindestdauer = Math.max(1, p.auszahlplanBisAlter - alter);
  let dauer = Math.max(1, Math.round(args.dauerJahre));
  if (dauer < mindestdauer) {
    hinweise.push(
      `Ein Auszahlplan muss mindestens bis ${p.auszahlplanBisAlter} laufen — ` +
      `hier ${mindestdauer} Jahre statt ${dauer}.`,
    );
    dauer = mindestdauer;
  }

  // Foerderunschaedliche Teilkapitalauszahlung zu Rentenbeginn, hoechstens
  // 30 %. Der Rest muss als Rente oder Auszahlplan weiterlaufen. Steuerlich
  // ist der Einmalbetrag im Zuflussjahr voll steuerpflichtig — das treibt die
  // Progression und wird deshalb getrennt ausgewiesen, nicht eingerechnet.
  let quote = Math.max(0, args.teilauszahlungQuote ?? 0);
  if (quote > p.teilauszahlungMax) {
    hinweise.push(
      `Auf einen Schlag sind höchstens ${Math.round(p.teilauszahlungMax * 100)} % ` +
      'förderunschädlich; gerechnet wird mit diesem Anteil.',
    );
    quote = p.teilauszahlungMax;
  }
  const teilauszahlung = args.kapital * quote;
  const rest = args.kapital - teilauszahlung;

  const r = Math.max(0, args.rendite);
  const brutto = r === 0
    ? rest / dauer
    : (rest * r) / (1 - Math.pow(1 + r, -dauer));

  return { bruttoJahr: brutto, dauerJahre: dauer, teilauszahlung, hinweise };
}

export interface AvdSteuervorteil {
  /** Abziehbarer Betrag: Eigenbeitrag bis zum Hoechstbetrag PLUS Zulagen */
  abzugsfaehig: number;
  /** Steuerersparnis aus dem Sonderausgabenabzug, brutto */
  steuerersparnis: number;
  /** Was die Ersparnis UEBER die Zulagen hinaus bringt — nur das zaehlt */
  ueberZulagen: number;
  /**
   * Was aus der eigenen Tasche geht: Eigenbeitrag abzueglich Steuerersparnis.
   *
   * Die Zulagen werden hier BEWUSST NICHT abgezogen. Sie kommen nicht vom
   * Sparer, sondern vom Staat, und stehen bereits als hoeheres Kapital auf der
   * Habenseite. Sie ein zweites Mal als Kostenminderung zu buchen zaehlt sie
   * doppelt und laesst das gefoerderte Depot so aussehen, als brauche es nur
   * halb so viel Geld. (Der Riester-Zweig im Vertrags-TUEV rechnet es seit
   * jeher richtig; dieser Zweig wich davon ab.)
   */
  eigenaufwandNetto: number;
  /** Was insgesamt im Depot ankommt: Eigenbeitrag PLUS Zulagen */
  zuflussInsDepot: number;
  /** true, wenn der Abzug guenstiger ist als die blosse Zulage */
  guenstigerAlsZulage: boolean;
}

/**
 * Sonderausgabenabzug § 10a EStG mit Guenstigerpruefung.
 *
 * Abziehbar ist der Eigenbeitrag bis zum Hoechstbetrag ZUZUEGLICH des
 * Zulagenanspruchs — fuer Alleinstehende ohne Kinder also 1 800 + 540 =
 * 2 340 EUR. Das Finanzamt prueft von Amts wegen, ob der Abzug guenstiger ist
 * als die Zulage; ist er es, wird die tarifliche Steuer um den
 * Zulagenanspruch wieder erhoeht. Unter dem Strich bleibt also nur der Teil
 * der Ersparnis, der UEBER den Zulagen liegt.
 *
 * Bewusst dieselbe Mechanik wie beim Riester-Vertrag: der Gesetzgeber hat sie
 * unveraendert uebernommen, also soll der Code sie nicht zweimal verschieden
 * abbilden.
 */
export function avdSteuervorteil(
  args: { eigenbeitragJahr: number; zulagenJahr: number; zveHeute: number },
  opt: { verheiratet: boolean; bundesland: string; kirchensteuerpflichtig: boolean },
  p: LegalParameters,
): AvdSteuervorteil {
  const eigen = Math.max(0, args.eigenbeitragJahr);
  const zulagen = Math.max(0, args.zulagenJahr);
  const abzugsfaehig = Math.min(eigen, p.avd.hoechstbetragEigenbeitrag) + zulagen;

  const steuerersparnis = zusatzsteuer(
    Math.max(0, args.zveHeute - abzugsfaehig),
    abzugsfaehig,
    opt,
    p,
  );
  const ueberZulagen = Math.max(0, steuerersparnis - zulagen);

  return {
    abzugsfaehig,
    steuerersparnis,
    ueberZulagen,
    eigenaufwandNetto: Math.max(0, eigen - ueberZulagen),
    zuflussInsDepot: eigen + zulagen,
    guenstigerAlsZulage: steuerersparnis > zulagen,
  };
}

export interface DepotSeite {
  /** Kapital zum Rentenbeginn */
  endkapital: number;
  /** Eigene Einzahlungen ueber die Laufzeit, brutto */
  eigenbeitraege: number;
  /** Was der Weg nach Zulagen und Steuervorteil wirklich gekostet hat */
  eigenaufwandNetto: number;
  /** Jaehrliche Bruttoauszahlung */
  bruttoJahr: number;
  /** Steuer auf die Jahresauszahlung */
  steuerJahr: number;
  /** Monatliche Nettoauszahlung */
  nettoMonat: number;
  /** Einmalige Auszahlung zu Rentenbeginn, netto (0 ohne Teilauszahlung) */
  nettoEinmal: number;
}

/**
 * Das gefoerderte Altersvorsorgedepot gegen ein freies Wertpapierdepot.
 *
 * Das ist die eigentliche Frage: lohnt sich die Foerderung? Sie hat zwei
 * Vorteile — Zulagen und keine Vorabpauschale — und einen schweren Nachteil:
 * die Auszahlung ist VOLLSTAENDIG mit dem persoenlichen Satz zu versteuern,
 * waehrend das freie Depot nur den Gewinn mit 25 % belastet.
 *
 * Gerechnet wird mit demselben Bruttobeitrag, derselben Rendite und
 * ABSICHTLICH denselben Kosten auf beiden Seiten. Sonst misst der Vergleich
 * eine nebenbei unterstellte Kostendifferenz mit, statt allein den
 * Unterschied aus Foerderung und Steuer.
 *
 * Ausgewiesen wird deshalb beides: was hinten herauskommt UND was der Weg
 * netto gekostet hat. Nur die Auszahlungen zu vergleichen waere schief, weil
 * das gefoerderte Depot bei gleichem Bruttobeitrag weniger eigenes Geld
 * bindet.
 */
export function avdGegenFreiesDepot(
  args: {
    beitragMonat: number;
    jahre: number;
    renditeBrutto: number;
    /** Effektivkosten p. a., auf beiden Seiten gleich angesetzt */
    kosten: number;
    kinder?: readonly AvdKind[];
    alterHeute: number;
    alterBeiRente: number;
    startjahr: number;
    auszahldauer: number;
    renditeAuszahlung: number;
    teilauszahlungQuote?: number;
    zveHeute: number;
    /** Grenzsteuersatz im Alter, fuer die tarifliche Besteuerung der Auszahlung */
    steuersatzImAlter: number;
  },
  opt: { verheiratet: boolean; bundesland: string; kirchensteuerpflichtig: boolean },
  p: LegalParameters,
): { gefoerdert: DepotSeite; frei: DepotSeite } {
  // --- Gefoerdert ---
  const anspar = avdAnsparphase(
    {
      beitragMonat: args.beitragMonat, dynamik: 0, startkapital: 0, jahre: args.jahre,
      renditeBrutto: args.renditeBrutto, ter: args.kosten,
      kinder: args.kinder,
      alterHeute: args.alterHeute, startjahr: args.startjahr,
    },
    p,
  );
  const aus = avdAuszahlung(
    {
      kapital: anspar.endkapital, alterBeiBeginn: args.alterBeiRente,
      dauerJahre: args.auszahldauer, rendite: args.renditeAuszahlung,
      teilauszahlungQuote: args.teilauszahlungQuote,
    },
    p.avd,
  );

  // Steuervorteil des ERSTEN Jahres, auf die Laufzeit hochgerechnet. Genauer
  // waere Jahr fuer Jahr mit fortgeschriebenem Einkommen — dafuer muesste man
  // aber eine Gehaltsentwicklung unterstellen, die niemand kennt.
  const eigenJahr = args.beitragMonat * 12;
  const zulagenJahr = anspar.ersteZulagen.gesamt;
  const vorteil = avdSteuervorteil(
    { eigenbeitragJahr: eigenJahr, zulagenJahr, zveHeute: args.zveHeute }, opt, p,
  );

  const gefoerdert: DepotSeite = {
    endkapital: anspar.endkapital,
    eigenbeitraege: anspar.eigenbeitraege,
    eigenaufwandNetto: vorteil.eigenaufwandNetto * args.jahre,
    bruttoJahr: aus.bruttoJahr,
    steuerJahr: aus.bruttoJahr * args.steuersatzImAlter,
    nettoMonat: (aus.bruttoJahr * (1 - args.steuersatzImAlter)) / 12,
    nettoEinmal: aus.teilauszahlung * (1 - args.steuersatzImAlter),
  };

  // --- Frei ---
  // Hier wirkt die Vorabpauschale schon in der Ansparphase, und die Entnahme
  // trifft nur den GEWINN, dafuer aber mit Abgeltungsteuer.
  const sparerpauschbetrag = p.pauschbetraege.sparer * (opt.verheiratet ? 2 : 1);
  const teilfreistellung = 0.3;
  const freiAnspar = ansparphase({
    startkapital: 0,
    sparrateMonat: args.beitragMonat,
    jahre: args.jahre,
    renditeBrutto: args.renditeBrutto,
    ter: args.kosten,
    ausgabeaufschlag: 0,
    depotgebuehrJahr: 0,
    teilfreistellung,
    basiszins: p.basiszins,
    sparerpauschbetrag,
    abgeltungsteuerSatzEffektiv: p.abgeltungsteuersatz,
  });
  const plan = entnahmeplan(
    freiAnspar.endkapital,
    freiAnspar.anschaffungskosten,
    Math.max(1, Math.round(args.auszahldauer)),
    Math.max(0, args.renditeAuszahlung),
  );
  // Der Gewinnanteil STEIGT ueber die Auszahlungsjahre, weil zuerst die
  // guenstig eingekauften Anteile veraeussert werden. Das erste Jahr allein
  // wuerde das freie Depot zu guenstig zeigen; gemittelt wird deshalb ueber
  // die ganze Laufzeit.
  const anteile = plan.gewinnanteilJeJahr;
  const gewinnanteil = anteile.length > 0
    ? anteile.reduce((sum, x) => sum + x, 0) / anteile.length
    : 0;
  const { steuer: freiSteuer } = abgeltungsteuer(
    plan.bruttoProJahr * gewinnanteil,
    {
      kirchensteuerpflichtig: opt.kirchensteuerpflichtig,
      bundesland: opt.bundesland,
      teilfreistellung,
      sparerpauschbetrag,
    },
    p,
  );

  const frei: DepotSeite = {
    endkapital: freiAnspar.endkapital,
    eigenbeitraege: freiAnspar.eingezahlt,
    // Aus versteuertem Geld: was eingezahlt wird, ist auch der Aufwand.
    eigenaufwandNetto: freiAnspar.eingezahlt,
    bruttoJahr: plan.bruttoProJahr,
    steuerJahr: freiSteuer,
    nettoMonat: (plan.bruttoProJahr - freiSteuer) / 12,
    nettoEinmal: 0,
  };

  return { gefoerdert, frei };
}

export interface AvdProfitabilitaet {
  /** --- Ansparphase, ueber die gesamte Laufzeit --- */
  eigenbeitraegeGesamt: number;
  zulagenGesamt: number;
  /** Was insgesamt im Depot ankommt: Eigenbeitraege PLUS Zulagen */
  zuflussInsDepotGesamt: number;
  steuerersparnisGesamt: number;
  /** Was es wirklich kostet: Eigenbeitraege minus Steuerersparnis */
  eigenaufwandNettoGesamt: number;
  /** Monatswerte des ersten Beitragsjahres */
  eigenbeitragMonat: number;
  zulageMonat: number;
  steuerersparnisMonat: number;
  eigenaufwandNettoMonat: number;
  /**
   * Aufgelaufene Steuerersparnis je Beitragsjahr.
   *
   * PARALLEL zu `AvdAnsparErgebnis.verlauf` — gleiche Laenge, gleiche
   * Reihenfolge, weil beide dieselbe Jahresschleife abbilden. Die Oberflaeche
   * zippt sie fuer den Tooltip des Kapitaldiagramms zusammen. Sie gehoert
   * NICHT in `verlauf` selbst: dort steht, was im Depot liegt, und die
   * ersparte Steuer liegt in der Tasche des Sparers.
   */
  steuerersparnisKumuliert: number[];

  /** --- Auszahlphase --- */
  /** Angespartes Kapital zum Rentenbeginn */
  endkapital: number;
  bruttoRenteMonat: number;
  steuerRenteMonat: number;
  nettoRenteMonat: number;
  bruttoEinmal: number;
  steuerEinmal: number;
  nettoEinmal: number;
  jahreAuszahlung: number;

  /** --- Kennzahlen, dieselben wie im Vertrags-TUEV --- */
  summeEinzahlung: number;
  summeAuszahlung: number;
  nettoHebel: number;
  rendite: number;
  echterGewinn: number;
  amortisationsJahre: number;
  hinweise: string[];
}

/**
 * Profitabilitaet eines Altersvorsorgedepots — brutto hinein, netto heraus.
 *
 * Bewusst nach demselben Muster wie der Vertrags-TUEV, bis hin zu denselben
 * Kennzahlen aus `analyse/kennzahlen.ts`. Wer beide Stellen der Anwendung
 * nutzt, soll dort nicht zwei verschiedene Bewertungen desselben Vertrags
 * vorfinden.
 *
 * Die AUSZAHLSEITE wird uebergeben, nicht neu gerechnet. Die Oberflaeche
 * ermittelt sie ueber den Haushaltstarif mit geschaetzter gesetzlicher Rente;
 * eine zweite Rechnung hier wuerde davon abweichen, sobald sich eine der
 * beiden aendert.
 */
export function avdProfitabilitaet(
  args: {
    beitragMonat: number;
    jahre: number;
    kinder?: readonly AvdKind[];
    alterHeute: number;
    startjahr: number;
    zveHeute: number;
    /** Angespartes Kapital zum Rentenbeginn — uebergeben, nicht neu gerechnet */
    endkapital: number;
    /**
     * Auszahlseite, alles optional: Wer nur wissen will, was das Ansparen
     * kostet und welches Kapital dabei herauskommt, muss keine Rentenwerte
     * erfinden. Ohne sie bleiben die Kennzahlen entsprechend bei null.
     */
    bruttoRenteJahr?: number;
    steuerRenteJahr?: number;
    jahreAuszahlung?: number;
    bruttoEinmal?: number;
    steuerEinmal?: number;
  },
  opt: { verheiratet: boolean; bundesland: string; kirchensteuerpflichtig: boolean },
  p: LegalParameters,
): AvdProfitabilitaet {
  const hinweise: string[] = [];

  // Jahr fuer Jahr, weil Zulage und Bonus vom Alter und vom Beitrag DIESES
  // Jahres abhaengen.
  let eigenSumme = 0, zulagenSumme = 0, ersparnisSumme = 0;
  let bonusVerbraucht = false;
  const einzahlungenJeJahr: number[] = [];
  const steuerersparnisKumuliert: number[] = [];
  let erstesJahr = { eigen: 0, zulage: 0, ersparnis: 0, netto: 0 };

  for (let j = 0; j < Math.max(0, args.jahre); j++) {
    const eigen = args.beitragMonat * 12;
    const z = avdZulagen(
      {
        eigenbeitragJahr: eigen,
        kinder: args.kinder,
        alter: args.alterHeute + j,
        jahr: args.startjahr + j,
      },
      p.avd,
    );
    const bonus = bonusVerbraucht ? 0 : z.bonus;
    if (bonus > 0) bonusVerbraucht = true;
    const zulage = z.grundzulage + z.kinderzulage + bonus;

    const vorteil = avdSteuervorteil(
      { eigenbeitragJahr: eigen, zulagenJahr: zulage, zveHeute: args.zveHeute }, opt, p,
    );

    eigenSumme += eigen;
    zulagenSumme += zulage;
    ersparnisSumme += vorteil.ueberZulagen;
    einzahlungenJeJahr.push(vorteil.eigenaufwandNetto);
    steuerersparnisKumuliert.push(ersparnisSumme);

    if (j === 0) {
      erstesJahr = {
        eigen, zulage, ersparnis: vorteil.ueberZulagen, netto: vorteil.eigenaufwandNetto,
      };
      hinweise.push(...z.hinweise);
    }
  }

  const bruttoRenteJahr = args.bruttoRenteJahr ?? 0;
  const steuerRenteJahr = args.steuerRenteJahr ?? 0;
  const jahreAuszahlung = args.jahreAuszahlung ?? 0;
  const bruttoEinmal = args.bruttoEinmal ?? 0;

  const nettoRenteJahr = Math.max(0, bruttoRenteJahr - steuerRenteJahr);
  const nettoEinmal = Math.max(0, bruttoEinmal - (args.steuerEinmal ?? 0));

  const kz = kennzahlen({
    einzahlungenJeJahr,
    auszahlungJeJahr: nettoRenteJahr,
    jahreAuszahlung,
    kapitalEinmalig: nettoEinmal,
  });

  if (kz.nettoHebel > 0 && kz.nettoHebel < 1) {
    hinweise.push(
      'Über die gesamte Laufzeit kommt weniger heraus, als eingezahlt wurde — ' +
      'und das schon ohne Berücksichtigung der Inflation.',
    );
  }
  if (jahreAuszahlung > 0 && kz.amortisationsJahre > jahreAuszahlung) {
    hinweise.push(
      `Die Einzahlungen sind erst nach ${kz.amortisationsJahre.toFixed(0)} Rentenjahren ` +
      `zurückgeflossen — der Auszahlplan läuft aber nur ${jahreAuszahlung} Jahre.`,
    );
  }

  return {
    eigenbeitraegeGesamt: eigenSumme,
    zulagenGesamt: zulagenSumme,
    zuflussInsDepotGesamt: eigenSumme + zulagenSumme,
    steuerersparnisGesamt: ersparnisSumme,
    eigenaufwandNettoGesamt: kz.summeEinzahlung,
    eigenbeitragMonat: erstesJahr.eigen / 12,
    zulageMonat: erstesJahr.zulage / 12,
    steuerersparnisMonat: erstesJahr.ersparnis / 12,
    eigenaufwandNettoMonat: erstesJahr.netto / 12,
    steuerersparnisKumuliert,

    endkapital: args.endkapital,
    bruttoRenteMonat: bruttoRenteJahr / 12,
    steuerRenteMonat: steuerRenteJahr / 12,
    nettoRenteMonat: nettoRenteJahr / 12,
    bruttoEinmal,
    steuerEinmal: args.steuerEinmal ?? 0,
    nettoEinmal,
    jahreAuszahlung,

    summeEinzahlung: kz.summeEinzahlung,
    summeAuszahlung: kz.summeAuszahlung,
    nettoHebel: kz.nettoHebel,
    rendite: kz.rendite,
    echterGewinn: kz.echterGewinn,
    amortisationsJahre: kz.amortisationsJahre,
    hinweise,
  };
}
