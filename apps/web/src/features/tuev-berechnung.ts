import {
  vertragsTuev, renteOderKapital, bruttoZuNetto, parameterFuer, parseDatum, pkvImJahr,
  versorgungsluecke, projiziere, kenntKapitalwahl,
  type Jahreszeile, type TuevErgebnis, type RenteOderKapital, type Vertrag,
  type ProjektionsErgebnis, type Szenario,
  type LegalParameters, type FoerderKontext,
} from '@renten/engine';
import type { SzenarioParsed } from '../store/szenario';

/**
 * Die Vertrags-TUEV-Rechnung, herausgeloest aus der Oberflaeche.
 *
 * Sie stand bis dahin mitten im JSX von VertragsTuev.tsx. Fuer das gedruckte
 * Gutachten wird dieselbe Rechnung ein zweites Mal gebraucht — sie dort
 * nachzubauen hiesse, zwei Fassungen derselben Rechnung zu pflegen, und die
 * laufen auseinander. Deshalb: eine Funktion, zwei Aufrufer.
 */

export interface TuevPosition {
  vertrag: Vertrag;
  ergebnis: TuevErgebnis;
  vergleich: RenteOderKapital | null;
  /** Wird der Vertrag als Kapital ausgezahlt statt als Rente? */
  istKapital: boolean;
  alterBeiRentenbeginn: number;
  rentenbeginnJahr: number;
  /**
   * BEIDE Auszahlungswege desselben Vertrags, sobald beide Betraege erfasst
   * sind: die laufende Rente des Anbieters und seine Kapitalalternative.
   *
   * Jeder Weg ist eine VOLLSTAENDIGE Vertrags-TUEV-Rechnung — Netto-Hebel,
   * Rendite, echter Gewinn. Frueher waren das zwei Vertragsarten, und man
   * musste sich beim Anlegen entscheiden; verglichen werden konnte nie.
   */
  wege: {
    rente: TuevErgebnis;
    kapital: TuevErgebnis;
    /** Ab welchem Alter die Rente das Kapital ueberholt */
    breakEven: RenteOderKapital;
  } | null;
}

/** Bemessungsgrundlage: das tatsaechliche Bruttogehalt und das zvE. */
export function tuevBasis(szenario: SzenarioParsed): {
  p: LegalParameters; jahresbrutto: number; zve: number; monatsbrutto: number;
} {
  const jahr = new Date().getFullYear();
  const p = parameterFuer(jahr, {
    indexRate: szenario.annahmen.tarifIndex,
    // Der individuelle Zusatzbeitrag wirkt auch hier: Der TUEV misst die
    // Ersparnis einer Entgeltumwandlung an genau diesen Saetzen.
    zusatzbeitrag: szenario.haushalt.zusatzbeitrag,
  });
  const brutto = szenario.einkommenHeute.betrag * szenario.einkommenHeute.auszahlungen;
  const n = bruttoZuNetto(brutto, {
    verheiratet: szenario.haushalt.verheiratet,
    bundesland: szenario.haushalt.bundesland,
    kirchensteuerpflichtig: szenario.haushalt.kirchensteuer,
    kinder: { hatKinder: szenario.haushalt.hatKinder, kinderUnter25: szenario.haushalt.kinderUnter25 },
    beamter: szenario.einkommenHeute.modus === 'besoldung',
    selbststaendig: szenario.einkommenHeute.modus === 'selbststaendig',
    grvBeitragJahr: szenario.einkommenHeute.modus === 'selbststaendig'
      && szenario.einkommenHeute.grvPflicht
      ? szenario.einkommenHeute.grvBeitragMonat * 12
      : 0,
    // Der Vertrags-TUEV rechnet mit dem HEUTIGEN Netto, also auch mit der
    // heutigen Praemie — inklusive eines laufenden Entlastungstarifs, denn der
    // belastet das Budget genauso.
    privatVersichert: privatImErwerb(szenario),
    pkvPraemieMonat: privatImErwerb(szenario)
      ? pkvImJahr(szenario.haushalt.pkv, alterHeuteA(szenario), 0).gesamtMonat
      : 0,
  }, p);
  return { p, jahresbrutto: n.jahresbrutto, zve: n.zve, monatsbrutto: n.monatsbrutto };
}

/**
 * Privat krankenversichert IN DER ERWERBSPHASE.
 *
 * Der Vertrags-TUEV rechnet mit dem heutigen Netto und dem heutigen
 * Grenzsteuersatz — massgeblich ist deshalb die Erwerbsphase, nicht der
 * Ruhestand. Dieselbe Ableitung wie in der Zeitachse: bei Selbststaendigen
 * eine eigene Angabe, sonst aus dem Ruhestandsstatus.
 */
function privatImErwerb(szenario: SzenarioParsed): boolean {
  return szenario.einkommenHeute.modus === 'selbststaendig'
    ? szenario.haushalt.kvErwerb === 'pkv'
    : szenario.haushalt.kvStatus === 'pkv';
}

/** Alter von Person A heute — steuert den Praemienverlauf. */
function alterHeuteA(szenario: SzenarioParsed): number {
  const geburt = parseDatum(szenario.personen[0]?.geburtsdatum ?? '');
  return geburt ? new Date().getFullYear() - geburt.jahr : 40;
}

/** Ein Jahr aus einem Datumsfeld, egal ob TT.MM.JJJJ oder JJJJ-MM-TT. */
function jahrAus(datum: string, ersatz: number): number {
  return parseDatum(datum)?.jahr ?? ersatz;
}

/**
 * Die Auszahlseite eines Vertrags im GEGENTEILIGEN Weg.
 *
 * Die Zeitachse rechnet immer nur den gewaehlten Weg — den anderen gibt es
 * dort nicht. Statt ihn hier ein zweites Mal nachzubauen, wird die Projektion
 * mit umgestellter Strategie noch einmal gerechnet: dieselbe Funktion,
 * dieselben Regeln, kein Auseinanderlaufen. Das kostet wenige Millisekunden
 * und nur dann, wenn beide Betraege ueberhaupt erfasst sind.
 */
function andererWeg(
  szenario: SzenarioParsed,
  v: Vertrag,
  strategie: Vertrag['strategie'],
): { posten: Jahreszeile['posten'][number] | undefined; einmal: ProjektionsErgebnis['kapitalauszahlungen'][number] | undefined } {
  const klon: Szenario = {
    ...szenario,
    vertraege: szenario.vertraege.map((x) => (x.id === v.id ? { ...x, strategie } : x)),
  };
  const e = projiziere(klon);
  const zeile = e.zeilen.find((z) => z.jahr === e.ruhestandsjahr);
  return {
    posten: zeile?.posten.find((x) => x.id === v.id),
    einmal: e.kapitalauszahlungen.find((x) => x.vertragId === v.id),
  };
}

export function tuevPositionen(
  szenario: SzenarioParsed,
  zeile: Jahreszeile | null,
  /**
   * Einmalige Kapitalauszahlungen. Sie stehen BEWUSST nicht in der
   * Jahreszeile — eine Einmalzahlung ist keine laufende Rente. Der TUEV
   * braucht sie trotzdem, sonst zeigt er bei genau diesen Vertraegen null.
   */
  kapitalauszahlungen: ProjektionsErgebnis['kapitalauszahlungen'] = [],
): TuevPosition[] {
  const basis = tuevBasis(szenario);
  const jetzt = new Date().getFullYear();

  return szenario.tuev.flatMap((t) => {
    const v = szenario.vertraege.find((x) => x.id === t.vertragId);
    if (!v) return [];

    const posten = zeile?.posten.find((x) => x.id === v.id);
    // Nicht die Vertragsart entscheidet, sondern die gewaehlte Verwendung:
    // eine Kapitalauszahlung, die ueber 25 Jahre verrentet wird, liefert in
    // der Zeitachse eine MONATSRENTE. Wer hier nach der Art fragt, sucht
    // einen Einmalbetrag, den es nicht gibt, und zeigt 0 EUR an.
    const einmal = kapitalauszahlungen.find((x) => x.vertragId === v.id);
    const istKapital = einmal !== undefined;

    /*
      Die Auszahlseite kommt VOLLSTAENDIG aus der Projektion — Brutto und
      Abzuege, nicht nur das Netto. Nur so koennen Bildschirm, Gutachten und
      Zeitachse nicht auseinanderlaufen.

      DIE STEUER IST DER ANTEILIGE WERT, und das ist eine bewusste
      Entscheidung, keine Nachlaessigkeit. Es gab den Gegenversuch: Die
      Auszahlseite rechnete eine Zeit lang die MEHRBELASTUNG — Steuer des
      Haushalts mit diesem Vertrag minus Steuer ohne ihn. Bei 500 EUR
      Betriebsrente neben 1.575 EUR gesetzlicher Rente sind das 86,75 statt
      27,10 EUR im Monat, also 339 statt 399 EUR Nettorente.

      Beide Zahlen sind fuer sich richtig; sie beantworten nur verschiedene
      Fragen. Die Mehrbelastung sagt, was der Vertrag dem Haushalt
      ZUSAETZLICH bringt — nachpruefbar, aber sie haengt daran, in welcher
      Reihenfolge man die Einkuenfte betrachtet: Dieselbe Rente allein waere
      steuerfrei, als letzte gerechnet kostet sie den Grenzsatz. Bei mehreren
      Vertraegen traegt jeder den Grenzsatz, und die Einzelwerte addieren
      sich nicht mehr zur Haushaltssteuer.

      Gewaehlt ist deshalb die anteilige Zurechnung: EINE Zahl, die im
      Kassenbon, im Gutachten und hier dieselbe ist, und die sich ueber alle
      Vertraege zur tatsaechlichen Steuer aufaddiert. Der Kunde kann sie
      nachrechnen, ohne den Begriff „Grenzsteuersatz" zu kennen.

      DER PREIS, offen benannt: Die EINZAHLseite rechnet weiterhin marginal
      (`zusatzsteuer`, also Differenz — siehe Befund B3 im Kopf von
      `analyse/vertrags-tuev.ts`). Ersparnis zum Grenzsatz gegen Last zum
      Durchschnitt faellt zugunsten des Vertrags aus; die ausgewiesene
      Rendite ist damit eher die obere Kante. Wer das aendern will, aendert
      BEIDE Seiten — eine allein zu drehen macht es nur schiefer.
    */
    const nettoRenteMonat = !istKapital && posten ? posten.nettoJahr / 12 : 0;
    const bruttoRenteMonat = !istKapital && posten ? posten.bruttoJahr / 12 : 0;
    const kvPvMonat = !istKapital && posten ? posten.kvPvJahr / 12 : 0;
    const steuerMonat = !istKapital && posten ? posten.steuerJahr / 12 : 0;

    /*
      Bei der Einmalzahlung mindern zwei Posten den Betrag: die Steuer im
      Zuflussjahr und die Beitraege zur Kranken- und Pflegeversicherung. Beide
      werden beim Zufluss abgezogen und kommen fertig aus dem Rechenkern;
      `nettoKapital` ist bereits nach beidem. Getrennt weitergereicht werden
      sie nur, damit die Herleitung sichtbar bleibt.
    */
    const bruttoKapital = einmal?.bruttoKapital ?? 0;
    const steuerKapital = einmal?.steuer ?? 0;
    const kvPvKapital = einmal?.kvPvGesamt ?? 0;
    const nettoKapital = einmal?.nettoKapital ?? 0;

    const person = szenario.personen.find((x) => x.id === v.inhaber) ?? szenario.personen[0]!;
    const rentenbeginnJahr = jahrAus(person.rentenbeginn, jetzt + 20);
    const alterBeiRentenbeginn = rentenbeginnJahr - jahrAus(person.geburtsdatum, 1980);

    /**
     * Eine TUEV-Rechnung fuer diesen Vertrag mit EINER bestimmten Auszahlseite.
     *
     * Herausgezogen, weil sie jetzt bis zu dreimal gebraucht wird: fuer den
     * gewaehlten Weg und fuer die beiden Wege des Vergleichs. Der Kontext —
     * Gehalt, zvE, Krankenversicherung, GRV-Beitrag — ist jedes Mal derselbe;
     * nur die Auszahlseite wechselt.
     */
    const rechne = (vertrag: Vertrag, auszahlseite: {
      bruttoRenteMonat: number; kvPvMonat: number; steuerMonat: number; nettoRenteMonat: number;
      bruttoKapital: number; steuerKapital: number; kvPvKapital: number; nettoKapital: number;
    }) => vertragsTuev(
      vertrag,
      {
        beitragMonat: t.beitragMonat,
        dynamik: t.dynamik,
        agZuschussMonat: t.agZuschussMonat,
        kinder: t.kinder,
        beginnJahr: t.beginnJahr,
        lebenserwartung: t.lebenserwartung,
      },
      {
        jahresbrutto: basis.jahresbrutto,
        zveHeute: basis.zve,
        beamter: szenario.einkommenHeute.modus === 'besoldung',
        /*
          Ohne diese beiden Angaben rechnete der TUEV jedem Nicht-Beamten den
          KV/PV-Anteil als Ersparnis an — bei einem privat Versicherten das
          Doppelte des Richtigen. Die Praemie ist Bezugsgroesse fuer den
          Arbeitgeberzuschuss, der mit dem umgewandelten Entgelt sinkt; ohne
          Entlastungstarif, denn der Zuschuss haengt an der Praemie.
        */
        privatVersichert: privatImErwerb(szenario),
        pkvPraemieMonat: privatImErwerb(szenario)
          ? pkvImJahr(szenario.haushalt.pkv, alterHeuteA(szenario), 0).praemieMonat
          : 0,
        /*
          Der GRV-Beitrag entscheidet ueber den freien Hoechstbetrag des
          § 10 Abs. 3 EStG — und damit darueber, wie viel von einer Basisrente
          absetzbar ist. Ohne diese Angabe unterstellte der TUEV jedem den
          fiktiven Arbeitnehmer- UND Arbeitgeberanteil.
        */
        selbststaendig: szenario.einkommenHeute.modus === 'selbststaendig',
        grvBeitragJahr: szenario.einkommenHeute.modus === 'selbststaendig'
          && szenario.einkommenHeute.grvPflicht
          ? szenario.einkommenHeute.grvBeitragMonat * 12
          : 0,
        rentenbeginnJahr,
        alterBeiRentenbeginn,
        ...auszahlseite,
      },
      szenario,
      basis.p,
    );

    const ergebnis = rechne(v, {
      bruttoRenteMonat, kvPvMonat, steuerMonat, nettoRenteMonat,
      bruttoKapital, steuerKapital, kvPvKapital, nettoKapital,
    });

    /*
      BEIDE WEGE, sobald beide Betraege dastehen. Der gewaehlte kommt aus der
      Projektion, der andere aus einer zweiten Rechnung mit umgestellter
      Strategie. Geschaetzt wird nichts: Fehlt einer der beiden Betraege,
      gibt es keinen Vergleich.
    */
    const beide = kenntKapitalwahl(v.typ) && v.brutto > 0 && (v.kapitalAlternative ?? 0) > 0;
    let wege: TuevPosition['wege'] = null;

    if (beide) {
      const gegen = andererWeg(szenario, v, istKapital ? 'rente' : 'kapital');
      const rentePosten = istKapital ? gegen.posten : posten;
      const kapitalEinmal = istKapital ? einmal : gegen.einmal;

      const renteSeite = {
        bruttoRenteMonat: (rentePosten?.bruttoJahr ?? 0) / 12,
        kvPvMonat: (rentePosten?.kvPvJahr ?? 0) / 12,
        steuerMonat: (rentePosten?.steuerJahr ?? 0) / 12,
        nettoRenteMonat: (rentePosten?.nettoJahr ?? 0) / 12,
        bruttoKapital: 0, steuerKapital: 0, kvPvKapital: 0, nettoKapital: 0,
      };
      const kapitalSeite = {
        bruttoRenteMonat: 0, kvPvMonat: 0, steuerMonat: 0, nettoRenteMonat: 0,
        bruttoKapital: kapitalEinmal?.bruttoKapital ?? 0,
        steuerKapital: kapitalEinmal?.steuer ?? 0,
        kvPvKapital: kapitalEinmal?.kvPvGesamt ?? 0,
        nettoKapital: kapitalEinmal?.nettoKapital ?? 0,
      };

      // Die Strategie wandert MIT: Sie entscheidet im TUEV ueber die Dauer
      // der Auszahlphase — lebenslang bei der Rente, endlich beim Kapital.
      wege = {
        rente: rechne({ ...v, strategie: 'rente' }, renteSeite),
        kapital: rechne({ ...v, strategie: 'kapital' }, kapitalSeite),
        breakEven: renteOderKapital(
          renteSeite.nettoRenteMonat, kapitalSeite.nettoKapital, alterBeiRentenbeginn,
        ),
      };
    }

    // Der Vergleich braucht eine ECHTE Kapitalalternative. Ohne sie verglichen
    // wir die Rente mit ihrer eigenen Auszahlungssumme — das ergibt immer
    // wieder die Lebenserwartung, also nichts.
    const vergleichsKapital = nettoKapital > 0 ? nettoKapital : t.vergleichKapitalNetto;
    const vergleich = wege?.breakEven ?? (
      t.vergleichen && vergleichsKapital > 0 && nettoRenteMonat > 0
        ? renteOderKapital(nettoRenteMonat, vergleichsKapital, alterBeiRentenbeginn)
        : null
    );

    return [{ vertrag: v, ergebnis, vergleich, istKapital, alterBeiRentenbeginn, rentenbeginnJahr, wege }];
  });
}

/**
 * Die Angaben, aus denen der Foerdercheck seinen Befund zieht.
 *
 * Er sitzt hier und nicht im Rechenkern, weil nur die Oberflaeche weiss, wo
 * die Beitraege stehen: Ein Vertrag traegt seine kuenftige Rente
 * (`brutto`), aber nur bei wenigen Arten auch einen laufenden Beitrag. Was
 * heute in eine bAV oder eine Basisrente fliesst, steht ausschliesslich in
 * den Positionen des Vertrags-TUEV.
 *
 * `ohneBeitrag` zaehlt die gefoerderten Vertraege, zu denen KEIN Beitrag
 * erfasst ist. Ohne diese Zahl behauptete der Check bei einem ungeprueften
 * Vertrag, der ganze Rahmen sei frei — und das waere schlicht falsch.
 */
export function foerderBasis(szenario: SzenarioParsed, zeile: Jahreszeile | null): {
  kontext: FoerderKontext;
  steuerOpt: { verheiratet: boolean; bundesland: string; kirchensteuerpflichtig: boolean };
  p: LegalParameters;
  ohneBeitrag: number;
} {
  const basis = tuevBasis(szenario);
  const gefoerdert = szenario.vertraege.filter(
    (v) => v.typ.startsWith('bav') || v.typ === 'basis',
  );

  /*
    Was heute schon in ein Altersvorsorgedepot fliesst — aus der SPARRATE des
    Vertrags, nicht aus dem TUEV-Beitrag: Beim Depot ist die Sparrate die
    Eingabe, und ein Depot ohne TUEV-Eintrag darf nicht als „zahlt nichts"
    durchgehen. Mehrere Depots werden addiert; die Foerderung kennt nur die
    Summe der Eigenbeitraege.
  */
  const avdEigenbeitragJahr = szenario.vertraege
    .filter((v) => v.typ === 'avd' && v.strategie !== 'ignorieren')
    .reduce((summe, v) => {
      const t = szenario.tuev.find((x) => x.vertragId === v.id);
      return summe + Math.max(v.sparrate ?? 0, t?.beitragMonat ?? 0) * 12;
    }, 0);

  let bavEigenanteilJahr = 0;
  let bavArbeitgeberJahr = 0;
  let basisBeitragJahr = 0;
  let ohneBeitrag = 0;
  for (const v of gefoerdert) {
    const t = szenario.tuev.find((x) => x.vertragId === v.id);
    if (!t || t.beitragMonat <= 0) { ohneBeitrag += 1; continue; }
    if (v.typ === 'basis') {
      basisBeitragJahr += t.beitragMonat * 12;
    } else {
      /*
        BEIDE Teile werden gebraucht, und zwar getrennt: Die Grenzen des
        § 3 Nr. 63 EStG und des § 1 Abs. 1 Nr. 9 SvEV gelten fuer die Summe
        aller Beitraege aus dem Dienstverhaeltnis — der Arbeitgeberanteil
        verbraucht den Rahmen also mit und geht dem eigenen vor. Fuer den
        Satz „Sie wandeln heute X um" zaehlt dagegen nur der Eigenanteil.
      */
      const ag = Math.min(Math.max(0, t.agZuschussMonat), t.beitragMonat);
      bavArbeitgeberJahr += ag * 12;
      bavEigenanteilJahr += (t.beitragMonat - ag) * 12;
    }
  }

  /*
    Wie viel des Bedarfs die gesetzliche Rente bzw. die Pension traegt. Die
    Posten der Ruhestandszeile tragen die Kennung `person-A` / `person-B` —
    alles andere sind Vertraege.
  */
  const grvNettoMonat = (zeile?.posten ?? [])
    .filter((x) => x.id.startsWith('person-'))
    .reduce((s, x) => s + x.nettoJahr, 0) / 12;
  const grvDeckung = zeile && zeile.zielNettoMonat > 0
    ? grvNettoMonat / zeile.zielNettoMonat
    : 0;

  return {
    p: basis.p,
    ohneBeitrag,
    steuerOpt: {
      verheiratet: szenario.haushalt.verheiratet,
      bundesland: szenario.haushalt.bundesland,
      kirchensteuerpflichtig: szenario.haushalt.kirchensteuer,
    },
    kontext: {
      jahresbrutto: basis.jahresbrutto,
      zveHeute: basis.zve,
      beamter: szenario.einkommenHeute.modus === 'besoldung',
      selbststaendig: szenario.einkommenHeute.modus === 'selbststaendig',
      grvBeitragJahr: szenario.einkommenHeute.modus === 'selbststaendig'
        && szenario.einkommenHeute.grvPflicht
        ? szenario.einkommenHeute.grvBeitragMonat * 12
        : 0,
      privatVersichert: privatImErwerb(szenario),
      pkvPraemieMonat: privatImErwerb(szenario)
        ? pkvImJahr(szenario.haushalt.pkv, alterHeuteA(szenario), 0).praemieMonat
        : 0,
      bavEigenanteilJahr,
      bavArbeitgeberJahr,
      basisBeitragJahr,
      grvDeckung,
      /*
        In HEUTIGER Kaufkraft. Der Befund nennt die Luecke neben einem
        Beitrag, den jemand heute zahlen wuerde — stuende sie in Euro des
        Rentenjahres, verglichen sich zwei verschiedene Massstaebe.
      */
      lueckeMonat: zeile ? versorgungsluecke(zeile) / zeile.kaufkraftfaktor : 0,
      avdEigenbeitragJahr,
      /*
        Die Kinder aus den BASISDATEN. Wer sie oben eintraegt, soll die 300 EUR
        je Kind im Foerdercheck wiederfinden, ohne sie ein zweites Mal zu
        nennen — und mit den Jahrgaengen, damit die Zulage mit dem
        Kindergeldanspruch auslaeuft statt ewig zu laufen.
      */
      kinder: szenario.haushalt.kinder,
      alter: alterHeuteA(szenario),
      jahr: new Date().getFullYear(),
    },
  };
}

/**
 * Eine Stufe der Belastungsrechnung. `art` steuert nur die Farbe.
 */
export interface TreppenZeile {
  text: string;
  betrag: number;
  art: 'abzug' | 'summe';
}

/**
 * DIE BELASTUNG ALS TREPPE: von dem, was monatlich in den Vertrag fliesst,
 * hinunter zu dem, was aus der eigenen Tasche geht.
 *
 * Vorher begann die Karte beim Eigenbeitrag, und was insgesamt ankommt, stand
 * nur als Nebensatz in einem anderen Kasten. Wer 150 EUR einzahlt und 45 EUR
 * Zulage bekommt, sieht jetzt zuerst die 195 EUR, die der Vertrag bekommt.
 *
 * WORAN MAN SICH HIER VERTUT: Was ganz oben steht, haengt an der Vertragsart.
 *
 *   Zulagenvertraege (Altersvorsorgedepot, Riester) — `beitragMonat` ist der
 *   EIGENBEITRAG, die Zulagen kommen obendrauf. Zufluss = Beitrag + Zulagen.
 *
 *   bAV — `beitragMonat` ist bereits der GESAMTBEITRAG, aus dem der
 *   Arbeitgeberzuschuss herausgerechnet wird. Zufluss = Beitrag.
 *
 * KEINE DOPPELZAEHLUNG: Die Zulagen mindern den Aufwand nach wie vor nicht
 * (`avdSteuervorteil.eigenaufwandNetto` zieht sie bewusst nicht ab — sie
 * stehen als hoeheres Kapital auf der Habenseite). Die Treppe hebt die
 * oberste Zeile um sie an und zieht sie in der naechsten wieder ab; unten
 * steht unveraendert `echterAufwandMonat`.
 */
export function belastungsTreppe(r: TuevErgebnis): {
  zufluss: number;
  zeilen: TreppenZeile[];
  aufwand: number;
} {
  const zulagen = Math.max(0, r.zulageMonat);
  const agZuschuss = Math.max(0, r.agZuschussMonat);
  const zufluss = r.beitragMonat + zulagen;
  const zeilen: TreppenZeile[] = [];

  if (zulagen > 0) zeilen.push({ text: '− Zulagen vom Staat', betrag: zulagen, art: 'abzug' });
  if (agZuschuss > 0) zeilen.push({ text: '− Arbeitgeberzuschuss', betrag: agZuschuss, art: 'abzug' });

  /*
    Erst ab einem halben Euro: Bei privat Versicherten bleiben nach dem
    wegfallenden Arbeitgeberzuschuss manchmal Cent uebrig, und eine Zeile
    "SV-Ersparnis 0 EUR" sagt weniger als keine.
  */
  const sv = r.svErsparnisMonat >= 0.5 ? r.svErsparnisMonat : 0;
  const eigeneAbzuege: TreppenZeile[] = [];
  if (sv > 0) eigeneAbzuege.push({ text: '− SV-Ersparnis', betrag: sv, art: 'abzug' });
  if (r.steuerersparnisMonat > 0) {
    eigeneAbzuege.push({ text: '− Steuerersparnis', betrag: r.steuerersparnisMonat, art: 'abzug' });
  }

  /*
    Die Zwischensumme lohnt nur, wenn ueber ihr etwas abgezogen wurde UND
    unter ihr noch etwas folgt. Sonst wiederholte sie bloss die Zeile darueber
    oder die Endsumme darunter.
  */
  if (zeilen.length > 0 && eigeneAbzuege.length > 0) {
    zeilen.push({
      // "Entgeltumwandlung" trifft es nur dort, wo ein Zuschuss fliesst: Den
      // gibt es nach § 1a Abs. 1a BetrAVG gerade deshalb, weil der
      // Beschaeftigte Entgelt umwandelt.
      text: agZuschuss > 0 ? '= Ihre Entgeltumwandlung' : '= Ihr Eigenbeitrag',
      betrag: zufluss - zulagen - agZuschuss,
      art: 'summe',
    });
  }
  zeilen.push(...eigeneAbzuege);

  return { zufluss, zeilen, aufwand: r.echterAufwandMonat };
}

/**
 * Was die Zulagen JEDES Jahr ausmachen.
 *
 * Ohne den Berufseinsteigerbonus: Der faellt einmal an, und in einer Zeile
 * "jedes Jahr" verspraeche er eine Foerderung fuer die ganze Laufzeit, die es
 * nur im ersten Jahr gibt. Er steht deshalb ueberall als eigener Satz daneben.
 *
 * Hier und nicht zweimal in der Oberflaeche, damit Bildschirm und Ausdruck
 * nicht mit zwei verschiedenen Jahreszahlen dastehen.
 */
export function laufendeZulageJahr(r: TuevErgebnis): number {
  if (!r.zulageDetail) return r.zulageMonat * 12;
  return (r.zulageDetail.grundzulageMonat + r.zulageDetail.kinderzulageMonat) * 12;
}
