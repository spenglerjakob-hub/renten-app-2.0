import type { AvdParameter, LegalParameters } from '../params/types.js';
import { ansparphase, type DepotVerlauf } from './kapitalanlage.js';

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

  const kinderzulage = Math.max(0, args.kinder) * p.kinderzulage;
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

export interface AvdAnsparErgebnis {
  endkapital: number;
  /** Summe der EIGENbeitraege ohne Zulagen */
  eigenbeitraege: number;
  /** Summe aller vereinnahmten Zulagen */
  zulagenGesamt: number;
  /** Zulagen des ersten Jahres, aufgeschluesselt */
  ersteZulagen: AvdZulagen;
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
  }

  return {
    endkapital: kapital,
    eigenbeitraege: eigenSumme,
    zulagenGesamt: zulagenSumme,
    ersteZulagen: ersteZulagen ?? avdZulagen(
      { eigenbeitragJahr: 0, kinder: args.kinder, alter: args.alterHeute }, p.avd,
    ),
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
  args: { kapital: number; alterBeiBeginn: number; dauerJahre: number; rendite: number },
  p: AvdParameter,
): { bruttoJahr: number; dauerJahre: number; hinweise: string[] } {
  const hinweise: string[] = [];
  if (args.kapital <= 0) return { bruttoJahr: 0, dauerJahre: 0, hinweise };

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

  const r = Math.max(0, args.rendite);
  const brutto = r === 0
    ? args.kapital / dauer
    : (args.kapital * r) / (1 - Math.pow(1 + r, -dauer));

  return { bruttoJahr: brutto, dauerJahre: dauer, hinweise };
}
