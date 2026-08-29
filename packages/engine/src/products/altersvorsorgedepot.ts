import type { AvdParameter, LegalParameters } from '../params/types.js';
import { ansparphase, entnahmeplan, type DepotVerlauf } from './kapitalanlage.js';
import { zusatzsteuer, abgeltungsteuer } from '../tax/haushalt.js';

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

export interface AvdZulagen {
  /** Stufe 1: 50 % auf die ersten 360 EUR */
  stufe1: number;
  /** Stufe 2: 25 % auf die weiteren 1 440 EUR */
  stufe2: number;
  grundzulage: number;
  kinderzulage: number;
  /** Einmaliger Berufseinsteigerbonus */
  bonus: number;
  gesamt: number;
  /** Zulagen je Euro Eigenbeitrag */
  foerderquote: number;
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
  args: { eigenbeitragJahr: number; kinder: number; alter: number; jahr?: number },
  p: AvdParameter,
): AvdZulagen {
  const hinweise: string[] = [];
  const eigen = Math.max(0, args.eigenbeitragJahr);
  const leer: AvdZulagen = {
    stufe1: 0, stufe2: 0, grundzulage: 0, kinderzulage: 0, bonus: 0,
    gesamt: 0, foerderquote: 0, hinweise,
  };

  if (args.jahr !== undefined && args.jahr < p.abJahr) {
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
  const kinder = Math.max(0, args.kinder);
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

  const gesamt = grundzulage + kinderzulage + bonus;
  return {
    stufe1, stufe2, grundzulage, kinderzulage, bonus, gesamt,
    foerderquote: eigen > 0 ? gesamt / eigen : 0,
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
    kinder: number;
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
      { eigenbeitragJahr: 0, kinder: args.kinder, alter: args.alterHeute }, p.avd,
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
  /** Eigenbeitrag abzueglich Zulagen und zusaetzlicher Steuerersparnis */
  eigenaufwandNetto: number;
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
    eigenaufwandNetto: Math.max(0, eigen - zulagen - ueberZulagen),
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
    kinder: number;
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
      kinder: args.kinder, alterHeute: args.alterHeute, startjahr: args.startjahr,
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
  const gewinnanteil = plan.gewinnanteilJeJahr[0] ?? 0;
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
