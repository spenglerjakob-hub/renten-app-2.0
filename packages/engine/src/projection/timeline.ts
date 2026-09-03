import type { Szenario, Person, Vertrag, EinkommenHeute } from '../model.js';
import { parameterFuer, rechtsstandInfo, type RechtsstandInfo } from '../params/registry.js';
import {
  haushaltssteuer, zusatzsteuer, abgeltungsteuer, type Einkunftsquelle,
} from '../tax/haushalt.js';
import { kirchensteuersatz } from '../tax/estg.js';
import {
  kvPvImAlter, kvSatzVoll, pvSatzMitglied,
  type Beitragspflichtig, type KinderStatus,
} from '../social/kv-pv.js';
import { pkvImJahr, type PkvAnnahmen } from '../social/pkv.js';
import {
  versorgungsfreibetrag, rentenfreibetrag, ertragsanteil,
  altersentlastungsbetrag, type EingefrorenerFreibetrag,
} from '../pension/freibetraege.js';
import { zugangsfaktor } from '../pension/grv.js';
import { besoldung } from '../pension/beamte.js';
import { bruttoZuNetto, nettoZuBrutto, erwerbHaushalt } from '../erwerb/netto.js';
import { bavKapitalMonatswert, bavKapitalSteuer } from '../products/bav.js';
import { kapitalversicherungErtrag, ansparphase, entnahmeplan } from '../products/kapitalanlage.js';
import { entnahmeplanBewerten } from '../products/entnahmeplaner.js';
import { avdAnsparphase, avdAuszahlung } from '../products/altersvorsorgedepot.js';
import { parseDatum, alterExakt, heute, type Datum } from '../util/datum.js';
import { euroText } from '../util/text.js';

export interface JahresPosten {
  id: string;
  bezeichnung: string;
  schicht: 1 | 2 | 3;
  bruttoJahr: number;
  zveBeitrag: number;
  kvPvJahr: number;
  steuerJahr: number;
  nettoJahr: number;
}

export interface Jahreszeile {
  jahr: number;
  /** Alter der Person A in diesem Jahr */
  alterA: number;
  alterB: number | null;
  /** true, sobald ALLE beruecksichtigten Personen im Ruhestand sind */
  vollstaendigImRuhestand: boolean;
  /** true, solange mindestens eine Person noch erwerbstaetig ist */
  gemischtePhase: boolean;

  bruttoGesamt: number;
  kvPvGesamt: number;
  steuerGesamt: number;
  nettoGesamt: number;
  /** Monatliches Haushaltsnetto */
  nettoMonat: number;

  /** Zielbedarf dieses Jahres, nominal */
  zielNettoMonat: number;
  /** Kaufkraftfaktor gegenueber heute (zum Abzinsen) */
  kaufkraftfaktor: number;

  zve: number;
  durchschnittssatz: number;
  grenzsatz: number;

  posten: JahresPosten[];
  /** true, wenn fuer dieses Jahr fortgeschriebene Parameter verwendet wurden */
  parameterFortgeschrieben: boolean;
}

/** Ergebnis des Auszahlungs-Planers, fuer die Anzeige. */
export interface PlanerErgebnis {
  /** Frei erfasstes Startkapital */
  startkapital: number;
  /** Aus Vertraegen mit Strategie "planer" uebertragenes NETTO-Kapital */
  uebertragen: number;
  /** startkapital + uebertragen */
  gesamtkapital: number;
  /** Monatliche Bruttoentnahme im ersten Jahr */
  bruttoMonat: number;
  /** Monatliche Nettoentnahme im ersten Jahr */
  nettoMonat: number;
  /** true, wenn die Entnahme im Haushaltsnetto beruecksichtigt wird */
  imNettoEnthalten: boolean;
}

export interface ProjektionsErgebnis {
  zeilen: Jahreszeile[];
  rechtsstand: RechtsstandInfo;
  /** Erstes Jahr, in dem alle Personen im Ruhestand sind */
  ruhestandsjahr: number;
  /** Eingefrorene Freibetraege je Person, fuer die Anzeige */
  freibetraege: { personId: string; art: 'rente' | 'versorgung'; wert: EingefrorenerFreibetrag }[];
  /** Auszahlungs-Planer; null, wenn kein Kapital vorhanden ist */
  planer: PlanerErgebnis | null;
  /**
   * Je Wertpapierdepot der erreichte Wert zum Rentenbeginn. Ohne diese Angabe
   * bliebe unsichtbar, was die Sparrate ueber die Jahre aufgebaut hat.
   */
  depots: { vertragId: string; endkapital: number; bruttoMonat: number }[];
  /**
   * Einmalige Kapitalauszahlungen (Strategie "kapital"). BEWUSST NICHT Teil
   * von nettoGesamt oder nettoMonat: eine Einmalzahlung ist keine laufende
   * Rente; sonst spraenge das Monatsnetto im Rentenjahr sinnlos nach oben.
   */
  kapitalauszahlungen: {
    vertragId: string; bezeichnung: string; jahr: number;
    bruttoKapital: number; steuer: number; nettoKapital: number;
    /**
     * Kranken- und Pflegeversicherung auf die Kapitalleistung ueber die
     * gesamten 120 Monate (§ 229 Abs. 1 S. 3 SGB V). Sie faellt an, obwohl
     * der Betrag kein laufendes Einkommen liefert — beim Depot ist sie 0.
     */
    kvPvGesamt: number;
  }[];
  /**
   * Je Kapitalvertrag mit Strategie "rente": Steuer im Zuflussjahr und die
   * daraus abgeleitete Monatsrente. Ohne diese Angabe bliebe unsichtbar,
   * warum aus 300.000 EUR Kapital rund 1.000 EUR im Monat werden.
   */
  verrentungen: KapitalVerrentung[];
  /**
   * Je Altersvorsorgedepot Endkapital, Eigenbeitraege und vereinnahmte
   * Zulagen. Ohne diese Angabe bliebe die Foerderung unsichtbar — und genau
   * sie ist der Grund, ueberhaupt ein gefoerdertes Depot zu waehlen.
   */
  avd: AvdLauf[];
  /**
   * Allgemeine Hinweise zur Rechnung — genaeherte Besoldung, fehlendes Datum.
   * Sie gehoeren zu keinem einzelnen Vertrag.
   */
  hinweise: string[];
  /**
   * Hinweise, die zu genau EINEM Vertrag gehoeren. Getrennt gefuehrt, damit
   * sie im Gutachten unter dem betreffenden Vertrag stehen koennen statt in
   * einem Sammelkasten, in dem niemand erkennt, worauf sie sich beziehen.
   */
  vertragsHinweise: { vertragId: string; text: string }[];
}

interface PersonKontext {
  person: Person;
  geburt: Datum;
  rentenbeginn: Datum;
  rentenbeginnJahr: number;
  alterBeiRentenbeginn: number;
  /** Bruttomonatsbezug im ersten Rentenjahr, nominal */
  startbezugMonat: number;
  freibetrag: EingefrorenerFreibetrag;
  istVersorgungsbezug: boolean;
}

function personKontext(person: Person, s: Szenario, jetzt: Datum): PersonKontext | null {
  const geburt = parseDatum(person.geburtsdatum);
  const rentenbeginn = parseDatum(person.rentenbeginn);
  if (!geburt || !rentenbeginn) return null;

  const alterBeiRentenbeginn = alterExakt(geburt, rentenbeginn);
  const rentenbeginnJahr = rentenbeginn.jahr;
  const jahreBisRente = Math.max(0, rentenbeginnJahr - jetzt.jahr);
  const pRente = parameterFuer(rentenbeginnJahr, { indexRate: s.annahmen.tarifIndex });

  let startbezugMonat: number;
  const istVersorgungsbezug = person.art === 'pension';

  if (istVersorgungsbezug) {
    const b = besoldung(person.besoldungsgruppe, person.besoldungsstufe, s.einkommenHeute.besoldungsland, rentenbeginnJahr, {
      verheiratet: s.haushalt.verheiratet,
      kinder: s.haushalt.kinderUnter25,
    });
    const heutigerWert = b.brutto * (person.ruhegehaltssatz / 100);
    startbezugMonat = heutigerWert * Math.pow(1 + s.annahmen.rentendynamik, jahreBisRente);
  } else {
    const zf = zugangsfaktor(alterBeiRentenbeginn, geburt.jahr);
    startbezugMonat =
      person.grvBruttoHeute * Math.pow(1 + s.annahmen.rentendynamik, jahreBisRente) * zf;
  }

  // Der Freibetrag bemisst sich nach dem Jahresbetrag des ERSTEN VOLLEN
  // Kalenderjahres — also nach einer bereits erfolgten Rentenanpassung.
  const massgebenderJahresbetrag = startbezugMonat * 12 * (1 + s.annahmen.rentendynamik);

  const freibetrag = istVersorgungsbezug
    ? versorgungsfreibetrag(rentenbeginnJahr, massgebenderJahresbetrag)
    : rentenfreibetrag(rentenbeginnJahr, massgebenderJahresbetrag);

  void pRente;
  return {
    person, geburt, rentenbeginn, rentenbeginnJahr, alterBeiRentenbeginn,
    startbezugMonat, freibetrag, istVersorgungsbezug,
  };
}

/** Bruttobezug einer Person in einem Kalenderjahr (nominal, Jahresbetrag). */
function bezugImJahr(k: PersonKontext, jahr: number, dynamik: number): number {
  if (jahr < k.rentenbeginnJahr) return 0;
  const jahreSeitBeginn = jahr - k.rentenbeginnJahr;
  return k.startbezugMonat * 12 * Math.pow(1 + dynamik, jahreSeitBeginn);
}

export function projiziere(s: Szenario): ProjektionsErgebnis {
  const jetzt = heute();
  const hinweise: string[] = [];
  const vertragsHinweise: ProjektionsErgebnis['vertragsHinweise'] = [];

  const personen = s.personen
    .filter((p) => p.id === 'A' || s.haushalt.verheiratet)
    .map((p) => personKontext(p, s, jetzt))
    .filter((k): k is PersonKontext => k !== null);

  if (personen.length === 0) {
    return {
      zeilen: [], ruhestandsjahr: jetzt.jahr, freibetraege: [], planer: null, depots: [],
      kapitalauszahlungen: [], verrentungen: [], avd: [], vertragsHinweise: [],
      rechtsstand: rechtsstandInfo(jetzt.jahr, { indexRate: s.annahmen.tarifIndex }),
      hinweise: ['Kein gueltiges Geburts- oder Rentenbeginndatum erfasst.'],
    };
  }

  const ruhestandsjahr = Math.max(...personen.map((k) => k.rentenbeginnJahr));
  const kinder: KinderStatus = { hatKinder: s.haushalt.hatKinder, kinderUnter25: s.haushalt.kinderUnter25 };
  const personA = personen[0]!;
  const letztesJahr = personA.geburt.jahr + 100;
  /*
    Das Alter von Person A steuert den Praemienverlauf: den Wegfall des
    gesetzlichen Zuschlags (§ 149 VAG) und die Daempfung ab 65
    (§ 150 Abs. 3 VAG). Die Praemie ist ein HAUSHALTSbetrag; bei zwei Personen
    ist das eine Naeherung, und zwar eine bewusste — ein zweites Alter haette
    zwei Praemien gebraucht, die es im Szenario nicht gibt.
  */
  const alterHeuteA = alterExakt(personA.geburt, { jahr: jetzt.jahr, monat: 7, tag: 1 });

  // --- Erwerbseinkommen heute ---
  const pHeute = parameterFuer(jetzt.jahr, { indexRate: s.annahmen.tarifIndex });
  /*
    ERWERBSPHASE UND RUHESTAND SIND ZWEI FRAGEN.

    Bis hierher steuerte der Ruhestandsstatus beide Phasen, begruendet damit,
    dass aus der PKV praktisch niemand zurueckkommt. Das gilt aber nur in
    EINER Richtung. Der umgekehrte Fall ist der Regelfall bei Selbststaendigen:
    wer in der Erwerbsphase freiwillig gesetzlich versichert ist, kommt im
    Ruhestand in die KVdR, sofern er die Vorversicherungszeit erfuellt. Dort
    ist nur die gesetzliche Rente zur Haelfte beitragspflichtig und eine
    Ruerup- oder Privatrente gar nicht — bei freiwilliger Mitgliedschaft im
    Alter dagegen alles. Der Unterschied betraegt in einem typischen Fall
    ueber 300 EUR im Monat.

    Fuer Angestellte und Beamte wird die Erwerbsphase weiterhin abgeleitet:
    dort ist sie aus dem Ruhestandsstatus eindeutig, und eine zweite Frage
    braechte keine Information — nur eine weitere Gelegenheit, sich zu
    widersprechen. Die Ableitung steht HIER und nicht in der Oberflaeche,
    damit es keinen Zustand geben kann, in dem beide Felder einander
    widersprechen.
  */
  const privatVersichert = s.einkommenHeute.modus === 'selbststaendig'
    ? s.haushalt.kvErwerb === 'pkv'
    : s.haushalt.kvStatus === 'pkv';

  // Die Praemie zaehlt in einer Phase nur, wenn sie dort auch privat sind.
  const pkvGebraucht = privatVersichert || s.haushalt.kvStatus === 'pkv';
  const pkv: PkvAnnahmen = pkvGebraucht
    ? s.haushalt.pkv
    // Ohne PKV ist die Praemie null — und der Entlastungstarif dazu: er senkt
    // eine Praemie, die es dann nicht gibt.
    : { ...s.haushalt.pkv, praemieMonat: 0, bet: { ...s.haushalt.pkv.bet, aktiv: false } };

  const erwerbsOpt = {
    verheiratet: s.haushalt.verheiratet,
    bundesland: s.haushalt.bundesland,
    kirchensteuerpflichtig: s.haushalt.kirchensteuer,
    kinder,
    privatVersichert,
  };

  /** Jahresbrutto aus einer Einkommensangabe, egal in welcher Form erfasst. */
  const bruttoAus = (e: EinkommenHeute): number => {
    if (e.modus === 'besoldung') {
      const b = besoldung(e.besoldungsgruppe, e.besoldungsstufe, e.besoldungsland, jetzt.jahr, {
        verheiratet: s.haushalt.verheiratet,
        kinder: s.haushalt.kinderUnter25,
      });
      if (!b.belegt) {
        hinweise.push(
          'Die Besoldung beruht auf einer Naeherung, nicht auf der amtlichen Tabelle des Dienstherrn. ' +
          'Der ausgewiesene Betrag kann um mehrere hundert Euro im Monat abweichen.',
        );
      }
      return b.brutto * 12;
    }
    if (e.modus === 'netto') {
      return nettoZuBrutto(e.betrag * e.auszahlungen, {
        ...erwerbsOpt, beamter: false,
        // Beim Umkehren zaehlt die Praemie von HEUTE: das eingegebene Netto
        // ist ein heutiges.
        pkvPraemieMonat: pkvImJahr(pkv, alterHeuteA, 0).gesamtMonat,
      }, pHeute).jahresbrutto;
    }
    return e.betrag * e.auszahlungen;
  };

  /**
   * Erwerbseinkommen je Person, in der Reihenfolge von `personen`.
   *
   * BEFUND: Frueher lief das gesamte Haushaltseinkommen als EINE Person durch
   * bruttoZuNetto. Die Beitragsbemessungsgrenzen gelten aber je Person; die
   * Sozialabgaben fielen dadurch bei Doppelverdienern deutlich zu niedrig aus.
   * Deshalb wird das Einkommen jetzt in jedem Fall auf Personen verteilt —
   * bei getrennter Erfassung mit den echten Betraegen, sonst haelftig.
   */
  const einkommenJePerson: {
    brutto: number; beamter: boolean; selbststaendig: boolean; grvBeitragJahr: number;
  }[] = (() => {
    /** Erwerbsart und GRV-Beitrag EINER Einkommensangabe. */
    const art = (e: EinkommenHeute, brutto: number) => ({
      brutto,
      beamter: e.modus === 'besoldung',
      selbststaendig: e.modus === 'selbststaendig',
      /*
        Der EINGETRAGENE Beitrag, nicht ein Satz darauf. Die Oberflaeche
        belegt das Feld mit dem vollen Satz vor; wer freiwillig einen anderen
        Betrag zahlt, traegt ihn ein. Was hier steht, ist deshalb, was
        tatsaechlich fliesst.
      */
      grvBeitragJahr: e.modus === 'selbststaendig' && e.grvPflicht
        ? Math.max(0, e.grvBeitragMonat) * 12
        : 0,
    });

    const getrennt = s.einkommenGetrennt === true && personen.length > 1;
    if (getrennt) {
      const zweites = s.einkommenPartner ?? s.einkommenHeute;
      return personen.map((_, i) => {
        const e = i === 0 ? s.einkommenHeute : zweites;
        return art(e, bruttoAus(e));
      });
    }
    const gesamt = bruttoAus(s.einkommenHeute);
    return personen.map(() => art(s.einkommenHeute, gesamt / personen.length));
  })();

  // --- Auszahlungs-Planer ---
  // Kapital aus Vertraegen mit Strategie "planer" wird im Zuflussjahr
  // besteuert und fliesst NETTO in den Planer. Als Bemessungsgrundlage dient
  // das uebrige Renteneinkommen des Ruhestandsjahres. Damit wird die
  // Zirkularitaet vermieden, die entstuende, wenn die Planerentnahme ihre
  // eigene Steuerbemessung mitbestimmte.
  const pRuhestand = parameterFuer(ruhestandsjahr, { indexRate: s.annahmen.tarifIndex });
  const uebertragenesKapital = planerKapital(s, personen, pRuhestand);
  const planerGesamt = Math.max(0, s.planer.startkapital) + uebertragenesKapital;

  const planerBewertung = entnahmeplanBewerten(
    {
      kapital: planerGesamt,
      dauerJahre: s.planer.dauerJahre,
      rendite: s.planer.rendite,
      dynamik: s.planer.dynamik,
      kirchensteuerpflichtig: s.haushalt.kirchensteuer,
      bundesland: s.haushalt.bundesland,
    },
    pRuhestand,
  );

  const planerErgebnis: PlanerErgebnis | null =
    planerGesamt > 0
      ? {
          startkapital: Math.max(0, s.planer.startkapital),
          uebertragen: uebertragenesKapital,
          gesamtkapital: planerGesamt,
          bruttoMonat: planerBewertung.bruttoMonat,
          nettoMonat: planerBewertung.nettoMonat,
          imNettoEnthalten: s.planer.insNettoEinrechnen,
        }
      : null;

  // --- Wertpapierdepots ---
  // Der Aufbau ist ueber alle Jahre konstant und die Entnahmerate haengt vom
  // Endkapital ab, deshalb einmal VOR der Schleife.
  const depots = new Map<string, EtfVerlauf>();
  for (const v of s.vertraege) {
    if (v.typ !== 'etf' || v.strategie !== 'rente') continue;
    const k = personen.find((x) => x.person.id === v.inhaber) ?? personA;
    const jahreBis = Math.max(0, k.rentenbeginnJahr - jetzt.jahr);
    depots.set(v.id, etfVerlauf(v, s, pRuhestand, jahreBis));
  }

  // --- Altersvorsorgedepots (ab 2027) ---
  // Wie beim freien Depot haengt die Auszahlung vom Endkapital ab, also
  // einmal VOR der Schleife. Anders als beim freien Depot ist die Auszahlung
  // aber voll TARIFLICH zu versteuern — sie laeuft deshalb spaeter ueber
  // `quellen` und nicht als fertig versteuerter Posten.
  const avdLaeufe = new Map<string, AvdLauf>();
  for (const v of s.vertraege) {
    if (v.typ !== 'avd') continue;
    const k = personen.find((x) => x.person.id === v.inhaber) ?? personA;
    const jahreBis = Math.max(0, k.rentenbeginnJahr - jetzt.jahr);
    const lauf = avdLauf(v, k, jahreBis, jetzt.jahr, s, pRuhestand);
    avdLaeufe.set(v.id, lauf);
    for (const h of lauf.hinweise) {
      vertragsHinweise.push({ vertragId: v.id, text: h });
    }
  }

  // --- Kapitalvertraege als Rente ueber eine feste Zahl von Jahren ---
  // Wie beim Depot haengt die Rate am Endkapital, also einmal VOR der
  // Schleife. Die Entnahme ist bereits versteuert und laeuft deshalb nicht
  // ueber `quellen`, sondern als fertiger Posten in die Jahreszeile.
  const verrentungen = new Map<string, KapitalVerrentung>();
  for (const v of s.vertraege) {
    if (!istKapitalvertrag(v.typ) || v.strategie !== 'rente') continue;
    const k = personen.find((x) => x.person.id === v.inhaber) ?? personA;
    const r = kapitalVerrentung(v, k, personen, s, pRuhestand);
    if (!r) continue;
    verrentungen.set(v.id, r);
    vertragsHinweise.push({
      vertragId: v.id,
      text: `Von ${euroText(r.bruttoKapital)} Kapital bleiben nach Steuer im Auszahlungsjahr `
        + `${euroText(r.nettoKapital)}. Verteilt auf ${r.dauerJahre} Jahre ergibt das bei `
        + `${(r.rendite * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} % Rendite `
        + `${euroText(r.bruttoMonat)} brutto im Monat.`,
    });
  }

  // --- Einmalige Kapitalauszahlungen ---
  const kapitalauszahlungen: ProjektionsErgebnis['kapitalauszahlungen'] = [];
  for (const v of s.vertraege) {
    if (v.strategie !== 'kapital') continue;
    const k = personen.find((x) => x.person.id === v.inhaber) ?? personA;

    if (istKapitalvertrag(v.typ)) {
      const zveBasis = zveBasisImJahr(s, personen, k.rentenbeginnJahr, pRuhestand);
      const r = kapitalNachSteuer(v, k, s, zveBasis, k.rentenbeginnJahr, pRuhestand);
      if (r.bruttoKapital <= 0) continue;
      kapitalauszahlungen.push({
        vertragId: v.id,
        bezeichnung: v.name || 'Kapitalauszahlung',
        jahr: k.rentenbeginnJahr,
        ...r,
        kvPvGesamt: 0,   // wird nach der Jahresschleife aus den Posten gefuellt
      });
      continue;
    }

    if (v.typ !== 'etf') continue;
    const jahreBis = Math.max(0, k.rentenbeginnJahr - jetzt.jahr);
    const r = etfNettoKapital(v, s, pRuhestand, jahreBis);
    if (r.bruttoKapital <= 0) continue;
    kapitalauszahlungen.push({
      vertragId: v.id,
      bezeichnung: v.name || 'Wertpapierdepot',
      jahr: k.rentenbeginnJahr,
      ...r,
      kvPvGesamt: 0,   // Depotentnahmen loesen keine Beitraege aus
    });
  }

  const zeilen: Jahreszeile[] = [];

  for (let jahr = jetzt.jahr; jahr <= letztesJahr; jahr++) {
    const p = parameterFuer(jahr, { indexRate: s.annahmen.tarifIndex });
    const jahreAbHeute = jahr - jetzt.jahr;
    const kaufkraftfaktor = Math.pow(1 + s.annahmen.inflation, jahreAbHeute);

    const quellen: Einkunftsquelle[] = [];
    const beitragspflichtig: Beitragspflichtig[] = [];
    const posten: JahresPosten[] = [];

    // Die private Krankenversicherung DIESES Jahres — sie wird in der
    // Erwerbsphase wie im Ruhestand gebraucht.
    const pkvHeuer = pkvImJahr(pkv, alterHeuteA + jahreAbHeute, jahreAbHeute);

    /**
     * Werbungskosten-Pauschbetrag, je Person und Einkunftsart EINMAL:
     * 102 EUR fuer alle Versorgungsbezuege (§ 9a S. 1 Nr. 1b) und 102 EUR fuer
     * alle sonstigen Einkuenfte (§ 9a S. 1 Nr. 3).
     *
     * Vorher bekam ihn jeder Vertrag einzeln — wer zwei Unterstuetzungskassen
     * hatte, zog ihn doppelt ab. Und wer nur einen Ruerup und keine
     * gesetzliche Rente hat, bekam ihn gar nicht.
     */
    const pauschRest = new Map<string, number>();
    const nimmPauschbetrag = (personId: string, art: 'versorgung' | 'sonstige', betrag: number) => {
      const schluessel = `${personId}|${art}`;
      const rest = pauschRest.get(schluessel) ?? 0;
      const genutzt = Math.min(rest, betrag);
      pauschRest.set(schluessel, rest - genutzt);
      return genutzt;
    };

    let nochErwerbstaetig = false;

    // --- Schicht 1: Renten und Pensionen ---
    for (const k of personen) {
      if (jahr < k.rentenbeginnJahr) {
        nochErwerbstaetig = true;
        continue;
      }
      const brutto = bezugImJahr(k, jahr, s.annahmen.rentendynamik);

      // Der EINGEFRORENE Freibetrag wird gegen den GESTIEGENEN Bruttobezug
      // gerechnet. Genau hier lag der groesste Genauigkeitsfehler des
      // Prototyps: dort wuchs das Netto mit derselben Rate wie das Brutto.
      const werbungskosten = k.istVersorgungsbezug
        ? p.pauschbetraege.versorgungsbezuege
        : p.pauschbetraege.renten;
      const zveBeitrag = Math.max(0, brutto - k.freibetrag.jahresbetrag - werbungskosten);

      quellen.push({
        id: `person-${k.person.id}`,
        bezeichnung: k.istVersorgungsbezug ? `Pension ${k.person.name || k.person.id}` : `Gesetzliche Rente ${k.person.name || k.person.id}`,
        brutto, zveBeitrag, kvPv: 0,
      });
      beitragspflichtig.push({
        id: `person-${k.person.id}`,
        art: k.istVersorgungsbezug ? 'versorgungsbezug' : 'gesetzlicheRente',
        monatsbetrag: brutto / 12,
      });

      // Die Person hat ihren Pauschbetrag fuer DIESE Einkunftsart oben schon
      // verbraucht; der jeweils andere bleibt fuer ihre Vertraege offen.
      pauschRest.set(`${k.person.id}|versorgung`,
        k.istVersorgungsbezug ? 0 : p.pauschbetraege.versorgungsbezuege);
      pauschRest.set(`${k.person.id}|sonstige`,
        k.istVersorgungsbezug ? p.pauschbetraege.renten : 0);
    }

    // --- Erwerbseinkommen der noch arbeitenden Personen ---
    // Der Prototyp sprang von "alle arbeiten" direkt auf "alle in Rente" und
    // liess die gemischte Phase aus.
    if (nochErwerbstaetig) {
      // Nur die Personen, die in DIESEM Jahr noch arbeiten. Frueher wurde das
      // Haushaltseinkommen pauschal nach Koepfen geteilt — unabhaengig davon,
      // wer wie viel verdient hat.
      const nochAmArbeiten = personen.filter((k) => jahr < k.rentenbeginnJahr).length || 1;
      /*
        Der PKV-Aufwand ist ein HAUSHALTSbetrag und wird auf die
        Erwerbstaetigen verteilt. Ihn jeder Person voll zu uebergeben
        verdoppelte ihn bei zwei Verdienern — genau das geschah hier bisher.
        Enthalten ist auch der Beitrag zum Entlastungstarif: er faellt in der
        Erwerbsphase tatsaechlich an.
      */
      const pkvAufwandMonat = privatVersichert ? pkvHeuer.gesamtMonat / nochAmArbeiten : 0;

      const arbeitend = personen
        .map((k, i) => ({ k, e: einkommenJePerson[i]! }))
        .filter(({ k }) => jahr < k.rentenbeginnJahr)
        .map(({ e }) => ({
          jahresbrutto: e.brutto * Math.pow(1 + s.annahmen.gehaltsdynamik, jahreAbHeute),
          beamter: e.beamter,
          selbststaendig: e.selbststaendig,
          // Der Beitrag waechst mit dem Einkommen mit — er ist entweder ein
          // Satz darauf oder ein Betrag, den man mit steigendem Gewinn
          // ebenfalls anhebt.
          grvBeitragJahr: e.grvBeitragJahr * Math.pow(1 + s.annahmen.gehaltsdynamik, jahreAbHeute),
          pkvPraemieMonat: pkvAufwandMonat,
        }));

      const n = erwerbHaushalt(arbeitend, { ...erwerbsOpt, beamter: false }, p);
      posten.push({
        id: 'erwerb', bezeichnung: 'Erwerbseinkommen', schicht: 1,
        bruttoJahr: n.jahresbrutto, zveBeitrag: n.zve, kvPvJahr: n.sv,
        steuerJahr: n.est + n.soli + n.kirchensteuer, nettoJahr: n.jahresnetto,
      });
    }

    // --- Schichten 2 und 3: Vertraege ---
    for (const v of s.vertraege) {
      const k = personen.find((x) => x.person.id === v.inhaber) ?? personA;
      if (jahr < k.rentenbeginnJahr) continue;
      if (v.strategie === 'ignorieren') continue;

      const r = vertragImJahr(v, k, jahr, s, p, avdLaeufe);
      if (!r) continue;
      // Zwei Gruppen erscheinen hier NICHT als laufendes Einkommen, sondern
      // weiter unten als eigener, fertig versteuerter Posten:
      //
      //  - Strategie "planer": das Kapital geht in den Auszahlungs-Planer.
      //  - Kapitalvertraege ueberhaupt: ihr Einmalbetrag wird verrentet,
      //    einmalig ausgezahlt oder uebertragen — nie als Jahreseinkommen
      //    gebucht. Genau das war der Fehler, aus dem 25.000 EUR "Rente im
      //    Monat" wurden.
      //
      // Die Beitragspflicht in der KV/PV bleibt davon unberuehrt: § 229
      // Abs. 1 S. 3 SGB V belastet 1/120 des Betrags ueber 120 Monate,
      // unabhaengig davon, was der Empfaenger mit dem Geld macht.
      if (v.strategie !== 'planer' && !istKapitalvertrag(v.typ)) {
        // "avd" waere als Ersatzbezeichnung im Kassenbon nicht lesbar; die
        // uebrigen Kuerzel sind wenigstens Woerter.
        const bezeichnung = v.name || (v.typ === 'avd' ? 'Altersvorsorgedepot' : v.typ);
        // Was vom Werbungskosten-Pauschbetrag der Person noch uebrig ist.
        const pausch = r.pauschbetragArt
          ? nimmPauschbetrag(v.inhaber, r.pauschbetragArt, r.zveBeitrag)
          : 0;
        quellen.push({
          id: v.id, bezeichnung, brutto: r.brutto,
          zveBeitrag: Math.max(0, r.zveBeitrag - pausch), kvPv: 0,
        });
      }
      if (r.kvArt) {
        const monatsbetrag = r.kvMonatsbetrag ?? r.brutto / 12;
        beitragspflichtig.push({ id: v.id, art: r.kvArt, monatsbetrag });
      }
    }

    // --- KV/PV ---
    const kv = kvPvImAlter(s.haushalt.kvStatus, beitragspflichtig, kinder, p, {
      // NACH Entlastung: der Zuschuss nach § 106 SGB VI ist auf die halbe
      // Praemie gedeckelt, senkt ein Entlastungstarif sie, greift der Deckel
      // frueher. Der BET-Beitrag selbst laeuft im Alter nicht mehr.
      pkvPraemieMonat: pkvHeuer.praemieMonat,
      personen: personen.filter((k) => jahr >= k.rentenbeginnJahr).length || 1,
    });
    const kvPvJahr = kv.gesamt * 12;

    // --- Altersentlastungsbetrag ---
    //
    // § 24a Satz 2 EStG nimmt ausdruecklich AUS: Versorgungsbezuege (§ 19
    // Abs. 2), Leibrenten nach § 22 Nr. 1 S. 3 Buchst. a — also gesetzliche
    // Rente UND Ruerup — sowie Leistungen aus gefoerderten Vertraegen nach
    // § 22 Nr. 5 (Riester, bAV, Altersvorsorgedepot). Beguenstigt bleiben
    // Ertragsanteilsrenten, Mieteinkuenfte und Kapitalertraege.
    //
    // Vorher lief die Summe ueber ALLE Nicht-Personen-Quellen; der Betrag
    // fiel dadurch zu hoch aus.
    const beguenstigt = new Set(['prvRente', 'immobilie', 'etf', 'prvKapital']);
    const sonstigeEinkuenfte = quellen
      .filter((q) => {
        if (q.id === 'erwerb' || q.id.startsWith('person-')) return false;
        const vertrag = s.vertraege.find((x) => x.id === q.id);
        // Der Entnahmeplaner traegt Kapitalertraege — ebenfalls beguenstigt.
        return vertrag ? beguenstigt.has(vertrag.typ) : true;
      })
      .reduce((sum, q) => sum + q.zveBeitrag, 0);
    const alterA = alterExakt(personA.geburt, { jahr, monat: 7, tag: 1 });
    let aeb = 0;
    if (alterA >= 65 && sonstigeEinkuenfte > 0) {
      aeb = altersentlastungsbetrag(personA.geburt.jahr + 65, sonstigeEinkuenfte).jahresbetrag;
    }

    // --- Steuer: EINMAL auf das Gesamteinkommen ---
    const st = haushaltssteuer(
      quellen,
      {
        verheiratet: s.haushalt.verheiratet,
        bundesland: s.haushalt.bundesland,
        kirchensteuerpflichtig: s.haushalt.kirchensteuer,
        vorsorgeaufwand: kv.abzugsfaehig * 12,
        weitereAbzuege: p.pauschbetraege.sonderausgaben * (s.haushalt.verheiratet ? 2 : 1) + aeb,
      },
      p,
    );

    // KV/PV je Quelle: der Rechenkern hat die Beitraege einzeln ermittelt,
    // sie werden hier NICHT mehr aus einer Summe verteilt.
    //
    // Jeder Verteilungsschluessel ist falsch, weil die Saetze verschieden
    // sind: eine gesetzliche Rente kostet 12,95 %, ein Versorgungsbezug
    // 21,7 % nach Freibetrag, ein Ruerup in der KVdR gar nichts. Nach Brutto
    // verteilt stand beim Ruerup ein Beitrag, den es nicht gibt, und der
    // gesetzlichen Rente fehlte er.
    //
    // Rueckfall auf das Brutto nur, wenn Beitraege anfallen, die keiner
    // Quelle zugeordnet sind — privat Versicherte ohne gesetzliche Rente
    // zahlen eine Praemie unabhaengig vom Bezug.
    const jeQuelle = new Map(kv.jeQuelle.map((x) => [x.id, (x.kv + x.pv) * 12]));
    const zugeordnet = [...jeQuelle.values()].reduce((sum, x) => sum + x, 0);
    const offen = kvPvJahr - zugeordnet;
    const bruttoSumme = quellen.reduce((sum, q) => sum + q.brutto, 0);
    for (const q of quellen) {
      const anteilKv = (jeQuelle.get(q.id) ?? 0)
        + (offen > 0.005 && bruttoSumme > 0 ? (q.brutto / bruttoSumme) * offen : 0);
      const steuer = st.aufteilung.find((a) => a.id === q.id)?.gesamt ?? 0;
      const vertrag = s.vertraege.find((v) => v.id === q.id);
      posten.push({
        id: q.id,
        bezeichnung: q.bezeichnung,
        schicht: vertrag?.schicht ?? 1,
        bruttoJahr: q.brutto,
        zveBeitrag: q.zveBeitrag,
        kvPvJahr: anteilKv,
        steuerJahr: steuer,
        nettoJahr: q.brutto - anteilKv - steuer,
      });
    }

    // --- Wertpapierdepots als eigene Posten in Schicht 3 ---
    // Depotentnahmen unterliegen der Abgeltungsteuer, nicht dem Tarif; sie
    // laufen deshalb nicht ueber `quellen`, sondern fertig versteuert hierher.
    for (const [id, e] of depots) {
      const v = s.vertraege.find((x) => x.id === id);
      if (!v) continue;
      const k = personen.find((x) => x.person.id === v.inhaber) ?? personA;
      const jahreSeitRente = jahr - k.rentenbeginnJahr;
      if (jahreSeitRente < 0 || jahreSeitRente >= e.entnahmedauer) continue;
      if (e.bruttoProJahr <= 0) continue;

      const gewinnanteil = e.gewinnanteilJeJahr[jahreSeitRente] ?? 0;
      const { steuer } = abgeltungsteuer(
        e.bruttoProJahr * gewinnanteil,
        {
          kirchensteuerpflichtig: s.haushalt.kirchensteuer,
          bundesland: s.haushalt.bundesland,
          teilfreistellung: e.teilfreistellung,
          sparerpauschbetrag: p.pauschbetraege.sparer * (s.haushalt.verheiratet ? 2 : 1),
        },
        p,
      );

      // Nur freiwillig gesetzlich Versicherte zahlen auf Kapitalertraege
      // KV/PV-Beitraege; in der KVdR bleiben sie beitragsfrei.
      const kvPvJahr = s.haushalt.kvStatus === 'freiwillig'
        ? e.bruttoProJahr * (kvSatzVoll(p) + pvSatzMitglied(kinder, p))
        : 0;

      posten.push({
        id: v.id,
        bezeichnung: v.name || 'Wertpapierdepot',
        schicht: 3,
        bruttoJahr: e.bruttoProJahr,
        zveBeitrag: 0,
        kvPvJahr,
        steuerJahr: steuer,
        nettoJahr: e.bruttoProJahr - steuer - kvPvJahr,
      });
    }

    // --- Kapitalvertraege als eigene Posten ---
    //
    // Das Kapital ist im Zuflussjahr bereits tariflich versteuert; die
    // laufende Entnahme traegt nur noch die Abgeltungsteuer auf ihren
    // Ertragsanteil. Sie laeuft deshalb nicht ueber `quellen`.
    //
    // Die KV/PV kommt aus `kv.jeQuelle` — NICHT aus dem Restbetrag `offen`.
    // Sonst wuerde sie nach Bruttoanteil auf die uebrigen Einkuenfte verteilt,
    // und der gerade beseitigte Verteilungsschluessel kaeme durch die
    // Hintertuer zurueck.
    // Auch Vertraege mit Strategie "planer" und "kapital" kommen hier vorbei:
    // sie liefern kein laufendes Einkommen, tragen aber ihre Beitraege. Ohne
    // einen Posten dafuer stimmte die Summe der Posten nicht mehr mit
    // `kvPvGesamt` ueberein, und zehn Jahre Beitragspflicht verschwaenden
    // lautlos aus der Rechnung.
    for (const v of s.vertraege) {
      if (!istKapitalvertrag(v.typ) || v.strategie === 'ignorieren') continue;
      const k = personen.find((x) => x.person.id === v.inhaber) ?? personA;
      if (jahr < k.rentenbeginnJahr) continue;

      const kvPvVertrag = jeQuelle.get(v.id) ?? 0;
      const e = verrentungen.get(v.id);
      const jahreSeitRente = jahr - k.rentenbeginnJahr;
      const laeuft = e !== undefined && jahreSeitRente < e.dauerJahre;

      // Nach dem Ende der Verrentung kann noch Beitragspflicht bestehen: die
      // 120 Monate des § 229 SGB V laufen unabhaengig von der Entnahmedauer.
      if (!laeuft && kvPvVertrag <= 0) continue;

      const bruttoJahr = laeuft ? e.bruttoMonat * 12 : 0;
      const steuerJahr = laeuft ? e.steuerJahr : 0;
      const name = v.name || 'Kapitalauszahlung';
      posten.push({
        id: v.id,
        // Ohne den Zusatz staende eine Zeile mit 0 EUR Brutto und einem
        // Beitragsabzug da, ohne dass erkennbar waere warum.
        bezeichnung: laeuft ? name : `${name} (Beiträge auf die Kapitalleistung)`,
        schicht: v.schicht,
        bruttoJahr,
        zveBeitrag: 0,
        kvPvJahr: kvPvVertrag,
        steuerJahr,
        nettoJahr: bruttoJahr - steuerJahr - kvPvVertrag,
      });
    }

    // --- Auszahlungs-Planer als eigener Posten in Schicht 3 ---
    // Die Entnahme unterliegt der Abgeltungsteuer und wird deshalb NICHT in
    // den Tarif des Haushalts eingerechnet, sondern fertig versteuert
    // hinzugefuegt.
    if (planerErgebnis?.imNettoEnthalten) {
      const jahreSeitRuhestand = jahr - ruhestandsjahr;
      if (jahreSeitRuhestand >= 0 && jahreSeitRuhestand < s.planer.dauerJahre) {
        const dyn = Math.pow(1 + s.planer.dynamik, jahreSeitRuhestand);
        const bruttoJahr = planerBewertung.bruttoMonat * 12 * dyn;
        const steuerJahr = planerBewertung.steuerJahr * dyn;
        posten.push({
          id: 'planer',
          bezeichnung: 'Entnahmeplan',
          schicht: 3,
          bruttoJahr,
          zveBeitrag: 0,
          kvPvJahr: 0,
          steuerJahr,
          nettoJahr: bruttoJahr - steuerJahr,
        });
      }
    }

    const bruttoGesamt = posten.reduce((sum, x) => sum + x.bruttoJahr, 0);
    const kvGesamt = posten.reduce((sum, x) => sum + x.kvPvJahr, 0);
    const steuerGesamt = posten.reduce((sum, x) => sum + x.steuerJahr, 0);
    const nettoGesamt = posten.reduce((sum, x) => sum + x.nettoJahr, 0);

    zeilen.push({
      jahr,
      alterA: Math.floor(alterA),
      alterB: personen[1] ? Math.floor(alterExakt(personen[1].geburt, { jahr, monat: 7, tag: 1 })) : null,
      vollstaendigImRuhestand: !nochErwerbstaetig,
      gemischtePhase: nochErwerbstaetig && jahr >= Math.min(...personen.map((k) => k.rentenbeginnJahr)),
      bruttoGesamt, kvPvGesamt: kvGesamt, steuerGesamt, nettoGesamt,
      nettoMonat: nettoGesamt / 12,
      zielNettoMonat: s.haushalt.zielNettoHeute * kaufkraftfaktor,
      kaufkraftfaktor,
      zve: st.zve,
      durchschnittssatz: st.durchschnittssatz,
      grenzsatz: st.grenzsatz,
      posten,
      parameterFortgeschrieben: p.extrapoliert,
    });
  }

  // Beitraege auf eine Kapitalleistung ueber alle Jahre aufsummieren.
  //
  // Sie fallen zehn Jahre lang an, obwohl der Betrag kein laufendes Einkommen
  // liefert. Ohne diese Summe zeigte der Vertrags-TUEV einen Einmalbetrag,
  // von dem nur die Steuer abgezogen waere — bei 300.000 EUR sind das mehrere
  // zehntausend Euro Unterschied.
  for (const a of kapitalauszahlungen) {
    a.kvPvGesamt = zeilen.reduce(
      (sum, z) => sum + (z.posten.find((x) => x.id === a.vertragId)?.kvPvJahr ?? 0),
      0,
    );
  }

  return {
    zeilen,
    ruhestandsjahr,
    rechtsstand: rechtsstandInfo(letztesJahr, { indexRate: s.annahmen.tarifIndex }),
    freibetraege: personen.map((k) => ({
      personId: k.person.id,
      art: k.istVersorgungsbezug ? ('versorgung' as const) : ('rente' as const),
      wert: k.freibetrag,
    })),
    planer: planerErgebnis,
    depots: [...depots.values()].map((e) => ({
      vertragId: e.vertragId,
      endkapital: e.endkapital,
      bruttoMonat: e.bruttoProJahr / 12,
    })),
    kapitalauszahlungen,
    verrentungen: [...verrentungen.values()],
    avd: [...avdLaeufe.values()],
    hinweise,
    vertragsHinweise,
  };
}

/** Vertragsarten, die als Einmalbetrag faellig werden statt als laufende Rente. */
export function istKapitalvertrag(typ: Vertrag['typ']): boolean {
  return typ === 'bavKapital' || typ === 'prvKapital';
}

/**
 * Uebriges zu versteuerndes Einkommen eines Jahres aus Schicht 1.
 *
 * Dient als Bemessungsgrundlage fuer die Steuer auf eine Kapitalauszahlung —
 * ohne die Auszahlung selbst und ohne die daraus gespeiste Entnahme, weil
 * diese sonst ihre eigene Bemessungsgrundlage mitbestimmten.
 */
function zveBasisImJahr(
  s: Szenario,
  personen: PersonKontext[],
  jahr: number,
  p: ReturnType<typeof parameterFuer>,
): number {
  return personen.reduce((sum, k) => {
    if (jahr < k.rentenbeginnJahr) return sum;
    const brutto = bezugImJahr(k, jahr, s.annahmen.rentendynamik);
    const wk = k.istVersorgungsbezug
      ? p.pauschbetraege.versorgungsbezuege
      : p.pauschbetraege.renten;
    return sum + Math.max(0, brutto - k.freibetrag.jahresbetrag - wk);
  }, 0);
}

/**
 * Was von einer Kapitalauszahlung nach Steuer uebrig bleibt.
 *
 * Die Steuer faellt IM ZUFLUSSJAHR an: bei der bAV auf den vollen Betrag
 * (§ 22 Nr. 5 EStG), bei der Kapitalwahl einer privaten Rentenversicherung
 * auf den Unterschiedsbetrag (§ 20 Abs. 1 Nr. 6 EStG). Sie laesst sich nicht
 * dadurch strecken, dass man das Geld ueber Jahre ausgibt. Verrentet,
 * uebertragen oder ausgezahlt wird deshalb immer der NETTObetrag.
 *
 * Diese Rechnung stand bisher nur in planerKapital. Verrentung und
 * Einmalauszahlung brauchen dieselbe — drei Kopien liefen unweigerlich
 * auseinander.
 */
function kapitalNachSteuer(
  v: Vertrag,
  k: PersonKontext,
  s: Szenario,
  zveBasis: number,
  jahr: number,
  p: ReturnType<typeof parameterFuer>,
): { bruttoKapital: number; steuer: number; nettoKapital: number } {
  const brutto = Math.max(0, v.brutto);
  const leer = { bruttoKapital: 0, steuer: 0, nettoKapital: 0 };
  if (brutto === 0) return leer;

  if (v.typ === 'bavKapital') {
    const { steuer } = bavKapitalSteuer(
      {
        kapital: brutto,
        zveBasis,
        verheiratet: s.haushalt.verheiratet,
        kirchensteuersatz: s.haushalt.kirchensteuer ? kirchensteuersatz(s.haushalt.bundesland) : 0,
        altzusageVor2005: v.altvertrag,
        fuenftelregelungAnwenden: false,
      },
      p,
    );
    return { bruttoKapital: brutto, steuer, nettoKapital: Math.max(0, brutto - steuer) };
  }

  if (v.typ === 'prvKapital') {
    const beginnJahr = v.beginnJahr ?? jahr - 12;
    const e = kapitalversicherungErtrag({
      auszahlung: brutto,
      eingezahlteBeitraege: (v.monatsbeitrag ?? 0) * 12 * Math.max(0, jahr - beginnJahr),
      vertragsbeginnJahr: beginnJahr,
      auszahlungsJahr: jahr,
      alterBeiAuszahlung: k.alterBeiRentenbeginn,
      fondsgebunden: false,
      altvertragVor2005: v.altvertrag,
    });
    const steuer = zusatzsteuer(
      zveBasis,
      e.steuerpflichtigerAnteil,
      {
        verheiratet: s.haushalt.verheiratet,
        bundesland: s.haushalt.bundesland,
        kirchensteuerpflichtig: s.haushalt.kirchensteuer,
      },
      p,
    );
    return { bruttoKapital: brutto, steuer, nettoKapital: Math.max(0, brutto - steuer) };
  }

  return leer;
}

/**
 * NETTO-Kapital, das aus Vertraegen mit Strategie "planer" in den
 * Auszahlungs-Planer fliesst.
 */
function planerKapital(
  s: Szenario,
  personen: PersonKontext[],
  p: ReturnType<typeof parameterFuer>,
): number {
  const kandidaten = s.vertraege.filter((v) => v.strategie === 'planer');
  if (kandidaten.length === 0) return 0;

  let summe = 0;
  for (const v of kandidaten) {
    const k = personen.find((x) => x.person.id === v.inhaber) ?? personen[0]!;

    if (istKapitalvertrag(v.typ)) {
      const zveBasis = zveBasisImJahr(s, personen, k.rentenbeginnJahr, p);
      summe += kapitalNachSteuer(v, k, s, zveBasis, k.rentenbeginnJahr, p).nettoKapital;
      continue;
    }

    if (v.typ === 'etf') {
      const jahreBis = Math.max(0, k.rentenbeginnJahr - new Date().getFullYear());
      summe += etfNettoKapital(v, s, p, jahreBis).nettoKapital;
    }
  }
  return summe;
}

export interface KapitalVerrentung {
  vertragId: string;
  /** Erstes Jahr der Verrentung — das Rentenjahr des Inhabers */
  startjahr: number;
  bruttoKapital: number;
  /** Steuer im Zuflussjahr. Faellt EINMAL an, nicht in jedem Rentenjahr. */
  steuerEinmal: number;
  nettoKapital: number;
  dauerJahre: number;
  rendite: number;
  /** Monatliche Bruttoentnahme aus dem versteuerten Kapital */
  bruttoMonat: number;
  /** Abgeltungsteuer auf den Ertragsanteil der Jahresentnahme */
  steuerJahr: number;
}

/**
 * Kapitalauszahlung als Rente ueber eine feste Zahl von Jahren.
 *
 * BEFUND: Bis hierher gab es diesen Weg ueberhaupt nicht. Ein Vertrag mit
 * Kapitalauszahlung und Strategie "rente" buchte den GESAMTEN Betrag als
 * Jahresbrutto eines einzigen Jahres. Jede Anzeige teilt einen Jahresbetrag
 * durch zwoelf — aus 300.000 EUR Kapital wurden 25.000 EUR "Rente im Monat".
 *
 * Richtig ist: das Kapital wird im Zuflussjahr versteuert, und was uebrig
 * bleibt, wird ueber `entnahmedauer` Jahre aufgezehrt. Die Rechnung dafuer
 * liegt seit dem ersten Commit im Rechenkern (`entnahmeplanBewerten`), war
 * aber nur ueber den globalen Auszahlungs-Planer erreichbar.
 */
function kapitalVerrentung(
  v: Vertrag,
  k: PersonKontext,
  personen: PersonKontext[],
  s: Szenario,
  p: ReturnType<typeof parameterFuer>,
): KapitalVerrentung | null {
  const zveBasis = zveBasisImJahr(s, personen, k.rentenbeginnJahr, p);
  const kapital = kapitalNachSteuer(v, k, s, zveBasis, k.rentenbeginnJahr, p);
  if (kapital.nettoKapital <= 0) return null;

  const dauerJahre = Math.max(1, Math.round(v.entnahmedauer ?? 25));
  const rendite = v.renditeEntnahme ?? 0.02;
  const e = entnahmeplanBewerten(
    {
      kapital: kapital.nettoKapital,
      dauerJahre,
      rendite,
      dynamik: 0,
      kirchensteuerpflichtig: s.haushalt.kirchensteuer,
      bundesland: s.haushalt.bundesland,
    },
    p,
  );
  if (e.bruttoMonat <= 0) return null;

  return {
    vertragId: v.id,
    startjahr: k.rentenbeginnJahr,
    bruttoKapital: kapital.bruttoKapital,
    steuerEinmal: kapital.steuer,
    nettoKapital: kapital.nettoKapital,
    dauerJahre,
    rendite,
    bruttoMonat: e.bruttoMonat,
    steuerJahr: e.steuerJahr,
  };
}

/**
 * Netto-Kapital eines Depots zum Rentenbeginn: Depotwert abzueglich
 * Abgeltungsteuer auf den Gewinn. Wird an zwei Stellen gebraucht — beim
 * Uebertrag in den Auszahlungs-Planer und bei der Strategie "kapital".
 */
function etfNettoKapital(
  v: Vertrag,
  s: Szenario,
  p: ReturnType<typeof parameterFuer>,
  jahreBisRente: number,
): { bruttoKapital: number; steuer: number; nettoKapital: number } {
  const e = etfVerlauf(v, s, p, jahreBisRente);
  const gewinn = Math.max(0, e.endkapital - e.anschaffungskosten);
  const { steuer } = abgeltungsteuer(
    gewinn,
    {
      kirchensteuerpflichtig: s.haushalt.kirchensteuer,
      bundesland: s.haushalt.bundesland,
      teilfreistellung: e.teilfreistellung,
      sparerpauschbetrag: p.pauschbetraege.sparer * (s.haushalt.verheiratet ? 2 : 1),
    },
    p,
  );
  return {
    bruttoKapital: e.endkapital,
    steuer,
    nettoKapital: Math.max(0, e.endkapital - steuer),
  };
}

export interface EtfVerlauf {
  vertragId: string;
  /** Depotwert zum Rentenbeginn, nach Kosten und Vorabpauschalen */
  endkapital: number;
  /** Steuerlich massgebliche Anschaffungskosten */
  anschaffungskosten: number;
  /** Jaehrliche Bruttoentnahme */
  bruttoProJahr: number;
  /** Steuerpflichtiger Gewinnanteil je Entnahmejahr (0..1) */
  gewinnanteilJeJahr: number[];
  entnahmedauer: number;
  teilfreistellung: number;
}

/**
 * Ansparen und Entnehmen eines Wertpapierdepots.
 *
 * BEFUND: Die Zeitachse teilte bisher schlicht den heutigen Depotwert durch
 * die Entnahmedauer. Sparrate, Rendite, TER, Ausgabeaufschlag, Depotgebuehr
 * und Sonderzahlung blieben damit vollstaendig wirkungslos — man konnte sie
 * eingeben, sie veraenderten das Ergebnis nicht.
 *
 * Die richtigen Funktionen lagen fertig in products/kapitalanlage.ts, waren
 * aber nie angeschlossen. Hier passiert das, an EINER Stelle fuer die
 * Zeitachse und den Kapitaluebertrag in den Planer.
 */
function etfVerlauf(
  v: Vertrag,
  s: Szenario,
  p: ReturnType<typeof parameterFuer>,
  jahreBisRente: number,
): EtfVerlauf {
  const teilfreistellung = v.teilfreistellung ?? 0.3;
  const sparerpauschbetrag = p.pauschbetraege.sparer * (s.haushalt.verheiratet ? 2 : 1);
  const entnahmedauer = Math.max(1, v.entnahmedauer ?? 25);

  const verlauf = ansparphase({
    startkapital: v.kapitalHeute ?? 0,
    einstandswert: v.einstandswert ?? v.kapitalHeute ?? 0,
    sparrateMonat: v.sparrate ?? 0,
    jahre: jahreBisRente,
    renditeBrutto: v.renditeAnsparphase ?? 0.06,
    ter: v.ter ?? 0.002,
    ausgabeaufschlag: v.ausgabeaufschlag ?? 0,
    depotgebuehrJahr: v.depotgebuehrJahr ?? 0,
    sonderzahlung: v.sonderzahlung,
    sonderzahlungInJahr: v.sonderzahlungJahr,
    teilfreistellung,
    basiszins: p.basiszins,
    sparerpauschbetrag,
    abgeltungsteuerSatzEffektiv: p.abgeltungsteuersatz,
  });

  // In der Entnahmephase wird ueblicherweise vorsichtiger angelegt; die TER
  // faellt weiter an.
  const renditeEntnahme = Math.max(0, (v.renditeEntnahme ?? 0.02) - (v.ter ?? 0.002));
  const plan = entnahmeplan(
    verlauf.endkapital,
    verlauf.anschaffungskosten,
    entnahmedauer,
    renditeEntnahme,
  );

  return {
    vertragId: v.id,
    endkapital: verlauf.endkapital,
    anschaffungskosten: verlauf.anschaffungskosten,
    bruttoProJahr: Math.max(0, plan.bruttoProJahr - (v.depotgebuehrJahr ?? 0)),
    gewinnanteilJeJahr: plan.gewinnanteilJeJahr,
    entnahmedauer,
    teilfreistellung,
  };
}

export interface AvdLauf {
  vertragId: string;
  /** Depotwert zum Rentenbeginn, einschliesslich verzinster Zulagen */
  endkapital: number;
  /** Summe der Eigenbeitraege ohne Zulagen */
  eigenbeitraege: number;
  /** Summe der vereinnahmten Zulagen */
  zulagenGesamt: number;
  /** Zulagen des ersten Beitragsjahres */
  grundzulageJahr1: number;
  kinderzulageJahr1: number;
  /** Jaehrliche Bruttoauszahlung */
  bruttoJahr: number;
  dauerJahre: number;
  hinweise: string[];
}

/**
 * Ansparen und Auszahlen eines Altersvorsorgedepots.
 *
 * Buendelt beide Phasen an einer Stelle, damit die Zeitachse und die
 * Landingpage dieselbe Rechnung sehen. Die Kinderzahl kommt aus dem Haushalt
 * und wird nicht am Vertrag erfasst — sonst haette man zwei Wahrheiten.
 */
function avdLauf(
  v: Vertrag,
  k: PersonKontext,
  jahreBisRente: number,
  startjahr: number,
  s: Szenario,
  p: ReturnType<typeof parameterFuer>,
): AvdLauf {
  const anspar = avdAnsparphase(
    {
      beitragMonat: v.monatsbeitrag ?? 0,
      dynamik: v.dynamik ?? 0,
      startkapital: v.kapitalHeute ?? 0,
      jahre: jahreBisRente,
      renditeBrutto: v.renditeAnsparphase ?? 0.06,
      ter: v.ter ?? 0.002,
      kinder: s.haushalt.kinder,
      alterHeute: k.alterBeiRentenbeginn - jahreBisRente,
      startjahr: Math.max(startjahr, p.avd.abJahr),
    },
    p,
  );

  // In der Auszahlphase wird ueblicherweise vorsichtiger angelegt.
  const renditeEntnahme = Math.max(0, (v.renditeEntnahme ?? 0.02) - (v.ter ?? 0.002));
  const aus = avdAuszahlung(
    {
      kapital: anspar.endkapital,
      alterBeiBeginn: k.alterBeiRentenbeginn,
      dauerJahre: v.entnahmedauer ?? 25,
      rendite: renditeEntnahme,
    },
    p.avd,
  );

  return {
    vertragId: v.id,
    endkapital: anspar.endkapital,
    eigenbeitraege: anspar.eigenbeitraege,
    zulagenGesamt: anspar.zulagenGesamt,
    grundzulageJahr1: anspar.ersteZulagen.grundzulage,
    kinderzulageJahr1: anspar.ersteZulagen.kinderzulage,
    bruttoJahr: aus.bruttoJahr,
    dauerJahre: aus.dauerJahre,
    hinweise: [...anspar.hinweise, ...aus.hinweise],
  };
}

/** Laufende Auszahlung eines Vertrags in einem Kalenderjahr. */
function vertragImJahr(
  v: Vertrag,
  k: PersonKontext,
  jahr: number,
  s: Szenario,
  p: ReturnType<typeof parameterFuer>,
  avdLaeufe: ReadonlyMap<string, AvdLauf>,
): {
  brutto: number;
  zveBeitrag: number;
  kvArt: Beitragspflichtig['art'] | null;
  /**
   * Ueberschreibt den KV/PV-pflichtigen Monatsbetrag. Wird fuer
   * Kapitalleistungen gebraucht: dort faellt das Brutto EINMAL an, die
   * Beitragspflicht laeuft aber ueber 120 Monate auf je 1/120 (§ 229 SGB V).
   */
  kvMonatsbetrag?: number;
  /**
   * Welchen Werbungskosten-Pauschbetrag diese Einkunft beansprucht. Er steht
   * der PERSON einmal zu, nicht jedem Vertrag — deshalb entscheidet der
   * Aufrufer, wie viel davon noch uebrig ist.
   */
  pauschbetragArt?: 'versorgung' | 'sonstige';
} | null {
  const jahreSeitRente = jahr - k.rentenbeginnJahr;

  switch (v.typ) {
    case 'basis': {
      // Ruerup unterliegt demselben Kohortenprinzip wie die gesetzliche Rente.
      const anteil = rentenfreibetrag(k.rentenbeginnJahr, 1).besteuerungsanteil ?? 1;
      const brutto = v.brutto * 12;
      return { brutto, zveBeitrag: brutto * anteil, kvArt: 'sonstiges', pauschbetragArt: 'sonstige' };
    }
    case 'bav': {
      const brutto = v.brutto * 12;
      const zve = v.altvertrag ? brutto * ertragsanteil(k.alterBeiRentenbeginn) : brutto;
      return { brutto, zveBeitrag: zve, kvArt: 'versorgungsbezug', pauschbetragArt: 'sonstige' };
    }
    case 'bavUkasse': {
      // Der Werbungskosten-Pauschbetrag wird NICHT hier abgezogen: er steht
      // der Person einmal zu, nicht jedem Vertrag. Der Aufrufer verteilt ihn.
      const brutto = v.brutto * 12;
      const fb = versorgungsfreibetrag(k.rentenbeginnJahr, brutto);
      return {
        brutto,
        zveBeitrag: Math.max(0, brutto - fb.jahresbetrag),
        kvArt: 'versorgungsbezug',
        pauschbetragArt: 'versorgung',
      };
    }
    case 'riester': {
      // Riester-Renten sind voll steuerpflichtig, aber fuer Pflichtversicherte
      // in der KVdR beitragsfrei (kein Versorgungsbezug).
      const brutto = v.brutto * 12;
      return {
        brutto, zveBeitrag: brutto, pauschbetragArt: 'sonstige',
        kvArt: s.haushalt.kvStatus === 'freiwillig' ? 'sonstiges' : null,
      };
    }
    case 'avd': {
      // Altersvorsorgedepot ab 2027. Die Auszahlung ist VOLLSTAENDIG
      // nachgelagert zu versteuern, und zwar tariflich — nicht mit
      // Abgeltungsteuer wie das freie Depot. Deshalb steht dieser Zweig hier
      // bei den tariflichen Quellen und nicht bei den Depotposten.
      const lauf = avdLaeufe.get(v.id);
      if (!lauf) return null;
      if (jahreSeitRente < 0 || jahreSeitRente >= lauf.dauerJahre) return null;
      if (lauf.bruttoJahr <= 0) return null;

      // KV/PV wie bei Riester: in der KVdR beitragsfrei, bei freiwilliger
      // Versicherung beitragspflichtig.
      return {
        brutto: lauf.bruttoJahr,
        zveBeitrag: lauf.bruttoJahr,
        pauschbetragArt: 'sonstige',
        kvArt: s.haushalt.kvStatus === 'freiwillig' ? 'sonstiges' : null,
      };
    }
    case 'prvRente': {
      const brutto = v.brutto * 12;
      return {
        brutto, zveBeitrag: brutto * ertragsanteil(k.alterBeiRentenbeginn),
        kvArt: 'sonstiges', pauschbetragArt: 'sonstige',
      };
    }
    case 'bavKapital': {
      // Einmalige Kapitalleistung aus der bAV. Sie floss bisher UEBERHAUPT
      // NICHT in die Zeitachse ein — der Betrag verschwand stillschweigend.
      //
      // Steuer: voll steuerpflichtig im Zuflussjahr (§ 22 Nr. 5 EStG); die
      // Fuenftelregelung wird dafuer regelmaessig nicht gewaehrt. Der Betrag
      // geht deshalb in voller Hoehe ins zvE und wird zusammen mit dem
      // uebrigen Einkommen EINMAL tariflich besteuert.
      // Altzusagen nach § 40b EStG a. F. sind steuerfrei, bleiben aber
      // beitragspflichtig.
      //
      // KV/PV: 1/120 des Betrags gilt 120 Monate lang als Versorgungsbezug.
      const kapital = Math.max(0, v.brutto);
      const { monatswert } = bavKapitalMonatswert(kapital);
      const beitragsjahre = 10;

      if (jahreSeitRente === 0) {
        return {
          brutto: kapital,
          zveBeitrag: v.altvertrag ? 0 : kapital,
          kvArt: 'versorgungsbezug',
          kvMonatsbetrag: monatswert,
        };
      }
      if (jahreSeitRente > 0 && jahreSeitRente < beitragsjahre) {
        // Kein Zufluss mehr, aber die Beitragspflicht laeuft weiter.
        return { brutto: 0, zveBeitrag: 0, kvArt: 'versorgungsbezug', kvMonatsbetrag: monatswert };
      }
      return null;
    }
    case 'prvKapital': {
      // Kapitalwahl aus einer privaten Renten-/Lebensversicherung.
      // § 20 Abs. 1 Nr. 6 EStG: steuerpflichtig ist der Unterschiedsbetrag
      // zwischen Auszahlung und eingezahlten Beitraegen; bei mindestens
      // 12 Jahren Laufzeit UND Auszahlung nach dem 62. Lebensjahr nur zur
      // Haelfte, dann aber tariflich statt mit Abgeltungsteuer
      // (§ 32d Abs. 2 Nr. 2). Beides bildet kapitalversicherungErtrag ab.
      if (jahreSeitRente !== 0) return null;
      const auszahlung = Math.max(0, v.brutto);
      if (auszahlung === 0) return null;

      const beginnJahr = v.beginnJahr ?? jahr - 12;
      const beitragsjahre = Math.max(0, jahr - beginnJahr);
      const e = kapitalversicherungErtrag({
        auszahlung,
        eingezahlteBeitraege: (v.monatsbeitrag ?? 0) * 12 * beitragsjahre,
        vertragsbeginnJahr: beginnJahr,
        auszahlungsJahr: jahr,
        alterBeiAuszahlung: k.alterBeiRentenbeginn,
        fondsgebunden: false,
        altvertragVor2005: v.altvertrag,
      });

      return {
        brutto: auszahlung,
        zveBeitrag: e.steuerpflichtigerAnteil,
        kvArt: s.haushalt.kvStatus === 'freiwillig' ? 'sonstiges' : null,
        kvMonatsbetrag: s.haushalt.kvStatus === 'freiwillig' ? auszahlung / 120 : 0,
      };
    }
    case 'immobilie': {
      // Cashflow und Steuerbemessung sind zu trennen: Werbungskosten mindern
      // das zvE, die AfA mindert es zusaetzlich OHNE Zahlungswirkung.
      const kaltmiete = v.brutto * 12 * Math.pow(1 + (v.dynamik ?? 0), jahr - new Date().getFullYear());
      const kostenquote = (v.bewirtschaftungskostenProzent ?? 20) / 100;
      const cashflow = kaltmiete * (1 - kostenquote);
      const zve = Math.max(0, kaltmiete * (1 - kostenquote));
      return { brutto: cashflow, zveBeitrag: zve, kvArt: 'sonstiges' };
    }
    // 'etf' bewusst NICHT hier: Depotentnahmen unterliegen der
    // Abgeltungsteuer, nicht dem Tarif. Sie werden vor der Jahresschleife
    // ueber etfVerlauf aufgebaut und als eigener Posten gefuehrt.
    default:
      return null;
  }
}
