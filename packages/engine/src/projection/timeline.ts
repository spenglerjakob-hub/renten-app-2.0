import type { Szenario, Person, PersonId, Vertrag } from '../model.js';
import { parameterFuer, rechtsstandInfo, type RechtsstandInfo } from '../params/registry.js';
import {
  haushaltssteuer, zusatzsteuer, abgeltungsteuer, type Einkunftsquelle,
} from '../tax/haushalt.js';
import { kirchensteuersatz } from '../tax/estg.js';
import {
  kvPvImAlter, kvSatzVoll, pvSatzMitglied, kinderImJahr,
  type Beitragspflichtig, type KinderStatus, type KvPvErgebnis, type MitgliedsKv,
} from '../social/kv-pv.js';
import { pkvImJahr } from '../social/pkv.js';
import { kvProfil } from '../social/kv-profil.js';
import { kvJePersonHeute, einkommenJePersonHeute } from '../erwerb/heute.js';
import {
  versorgungsfreibetrag, rentenfreibetrag, ertragsanteil,
  altersentlastungsbetrag, type EingefrorenerFreibetrag,
} from '../pension/freibetraege.js';
import { zugangsfaktor } from '../pension/grv.js';
import { besoldung } from '../pension/beamte.js';
import { erwerbHaushalt } from '../erwerb/netto.js';
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
  /**
   * Wem der Posten gehoert — fehlt er, gehoert er dem HAUSHALT.
   *
   * OPTIONAL und nicht `PersonId | 'haushalt'`: Der Entnahmeplan gehoert
   * wirklich keinem von beiden, und ein Pflichtfeld zwaenge jede kuenftige
   * Postenquelle zu einer Erfindung.
   *
   * Gefuellt wird er ausschliesslich aus der Zuordnung, die die Zeitachse
   * ohnehin schon aufloest (`personen.find(...) ?? personA`). Ihn hier aus
   * der Kennung zurueckzurechnen waere eine zweite Regel neben jener — und
   * genau daran ist die Beitragspflicht schon einmal gescheitert.
   */
  person?: PersonId;
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
    bruttoKapital: number; steuer: number;
    /**
     * Kranken- und Pflegeversicherung auf die Kapitalleistung, EINMALIG beim
     * Zufluss (§ 229 Abs. 1 S. 3 SGB V bemisst sie mit 1/120 ueber 120
     * Monate — das ist die Bemessung, nicht der Zahlungsweg). Beim Depot 0,
     * bei privat Versicherten ebenfalls.
     */
    kvPvGesamt: number;
    /** Nach Steuer UND Beitraegen — der Betrag, der wirklich ankommt. */
    nettoKapital: number;
    /**
     * Jahre zwischen Vertragsablauf und Rentenbeginn.
     *
     * 0, wenn der Vertrag erst zum Rentenbeginn ablaeuft — dann sind `jahr`
     * und Rentenbeginn dasselbe und es gibt nichts zu ueberbruecken.
     */
    wachstumJahre: number;
    /** Abgeltungsteuer auf den Zuwachs zwischen Ablauf und Rentenbeginn */
    steuerWachstum: number;
    /**
     * Was zum Rentenbeginn daraus geworden ist.
     *
     * Ohne vorgezogenen Ablauf gleich `nettoKapital`. Die Gesamtuebersicht
     * fragt, was zum Ruhestand da ist — bei einem Vertrag, der mit 60
     * ablaeuft, ist das nicht der Betrag von damals.
     */
    wertBeiRentenbeginn: number;
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
  const pRente = parameterFuer(rentenbeginnJahr, fortschreibung(s));

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
  const personA = personen[0]!;
  const letztesJahr = personA.geburt.jahr + 100;

  // --- Erwerbseinkommen heute ---
  const pHeute = parameterFuer(jetzt.jahr, fortschreibung(s));
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
  /*
    DIE VERSICHERUNG JE PERSON, in der Reihenfolge von `personen`.

    Bis hierher galt ein Status fuer den ganzen Haushalt und EINE Praemie,
    deren Verlauf am Alter von Person A haengt. Ein Paar aus Beamtem und
    Angestellter war damit nicht abbildbar, und das Alter des Partners fiel
    unter den Tisch: Der Wegfall des gesetzlichen Zuschlags (§ 149 VAG) und
    die Daempfung ab 65 (§ 150 Abs. 3 VAG) trafen beide Praemien im selben
    Jahr, auch wenn zehn Jahre dazwischenliegen.

    `kvProfil` haelt die Regel „Person, sonst Haushalt" an einer Stelle.
  */
  const kvJePerson = kvJePersonHeute(s, personen, jetzt.jahr);
  const kvA = kvJePerson[0]!;
  /** Ist in dieser Phase ueberhaupt jemand privat versichert? */
  const privatVersichert = kvJePerson.some((x) => x.privat);

  const erwerbsOpt = {
    verheiratet: s.haushalt.verheiratet,
    bundesland: s.haushalt.bundesland,
    kirchensteuerpflichtig: s.haushalt.kirchensteuer,
    // Vorbelegung fuer das laufende Jahr; in der Jahresschleife wird sie je
    // Jahr ersetzt, weil Kinder aelter werden.
    kinder: kinderImJahr(s.haushalt, jetzt.jahr),
    privatVersichert,
  };

  /**
   * Erwerbseinkommen je Person, in der Reihenfolge von `personen`.
   *
   * Die Ableitung steht in `erwerb/heute.ts` — sie loest die Besoldung aus
   * der Tabelle auf, kehrt ein eingegebenes Netto um, nimmt bei getrennter
   * Erfassung das zweite Einkommen dazu und verteilt einen Haushaltsbetrag
   * sonst auf die Koepfe. Der Vertrags-TUEV rechnet mit derselben Funktion;
   * vorher hatte er eine eigene, verkuerzte Fassung, die an vier Stellen
   * davon abwich (siehe den Kopf jener Datei).
   */
  const einkommenJePerson = einkommenJePersonHeute(s, kvJePerson, pHeute, jetzt.jahr, hinweise);

  // --- Auszahlungs-Planer ---
  // Kapital aus Vertraegen mit Strategie "planer" wird im Zuflussjahr
  // besteuert und fliesst NETTO in den Planer. Als Bemessungsgrundlage dient
  // das uebrige Renteneinkommen des Ruhestandsjahres. Damit wird die
  // Zirkularitaet vermieden, die entstuende, wenn die Planerentnahme ihre
  // eigene Steuerbemessung mitbestimmte.
  const pRuhestand = parameterFuer(ruhestandsjahr, fortschreibung(s));
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
    if (!istKapitalauszahlung(v) || v.strategie !== 'verrenten') continue;
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
  /**
   * Zu versteuerndes Einkommen des Haushalts in EINEM Jahr — Renten UND, wer
   * dann noch arbeitet, sein Erwerbseinkommen.
   *
   * Gebraucht fuer Vertraege, die VOR dem Rentenbeginn ablaufen: Die Steuer
   * auf die Kapitalleistung haengt am uebrigen Einkommen desselben Jahres.
   * `zveBasisImJahr` allein zaehlt nur Renten; wer mit 60 noch verdient,
   * saehe seine Kapitalleistung als einziges Einkommen und damit eine
   * Steuer, die es so nicht gibt.
   */
  const zveBasisMitErwerb = (jahr: number, pJahr: ReturnType<typeof parameterFuer>) => {
    const renten = zveBasisImJahr(s, personen, jahr, pJahr);
    const jahreAb = Math.max(0, jahr - jetzt.jahr);
    const arbeitendeKoepfe = personen.filter((k) => jahr < k.rentenbeginnJahr).length;
    if (arbeitendeKoepfe === 0) return renten;

    const arbeitend = personen
      .map((k, i) => ({ k, e: einkommenJePerson[i]!, kv: kvJePerson[i] ?? kvA }))
      .filter(({ k }) => jahr < k.rentenbeginnJahr)
      .map(({ e, kv }) => ({
        jahresbrutto: e.brutto * Math.pow(1 + s.annahmen.gehaltsdynamik, jahreAb),
        beamter: e.beamter,
        selbststaendig: e.selbststaendig,
        grvBeitragJahr: e.grvBeitragJahr * Math.pow(1 + s.annahmen.gehaltsdynamik, jahreAb),
        privatVersichert: kv.privat,
        zusatzbeitrag: kv.profil.zusatzbeitrag,
        pkvPraemieMonat: kv.privat
          ? pkvImJahr(kv.annahmen, kv.alterHeute + jahreAb, jahreAb).gesamtMonat
          : 0,
      }));
    const n = erwerbHaushalt(
      arbeitend,
      { ...erwerbsOpt, beamter: false, kinder: kinderImJahr(s.haushalt, jahr) },
      pJahr,
    );
    return renten + n.zve;
  };

  const kapitalauszahlungen: ProjektionsErgebnis['kapitalauszahlungen'] = [];
  for (const v of s.vertraege) {
    if (v.strategie !== 'kapital') continue;
    const k = personen.find((x) => x.person.id === v.inhaber) ?? personA;

    if (istKapitalauszahlung(v)) {
      /*
        DAS ABLAUFJAHR, nicht der Rentenbeginn. Ein Vertrag, der mit 60
        endet, zahlt mit 60 aus — und wird dann besteuert. Alles haengt an
        diesem Jahr: die Parameter, das uebrige Einkommen und bei der
        privaten Kapitalwahl das Alter, an dem die 12/62-Regel geprueft wird.
      */
      const zufluss = auszahlungsjahr(v, k.rentenbeginnJahr, jetzt.jahr);
      const pZufluss = parameterFuer(zufluss, fortschreibung(s));
      const zveBasis = zveBasisMitErwerb(zufluss, pZufluss);
      const r = kapitalNachSteuer(v, k, s, zveBasis, zufluss, pZufluss);
      if (r.bruttoKapital <= 0) continue;
      const weiter = nachAblaufGewachsen(
        r.nettoKapital, v.wachstumBisRente ?? 0, k.rentenbeginnJahr - zufluss, pRuhestand,
      );
      kapitalauszahlungen.push({
        vertragId: v.id,
        bezeichnung: v.name || 'Kapitalauszahlung',
        jahr: zufluss,
        bruttoKapital: r.bruttoKapital,
        steuer: r.steuer,
        nettoKapital: r.nettoKapital,
        // Einmalig beim Zufluss abgezogen, nicht ueber zehn Jahre verteilt.
        kvPvGesamt: r.kvPv,
        ...weiter,
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
      /*
        Das Depot laeuft ohnehin bis zum Rentenbeginn — es gibt nichts zu
        ueberbruecken. `etfNettoKapital` rechnet die Jahre bis dahin bereits
        mit der eigenen Rendite; ein zweiter Wachstumsschritt zaehlte doppelt.
      */
      wachstumJahre: 0,
      steuerWachstum: 0,
      wertBeiRentenbeginn: r.nettoKapital,
    });
  }

  const zeilen: Jahreszeile[] = [];

  for (let jahr = jetzt.jahr; jahr <= letztesJahr; jahr++) {
    const p = parameterFuer(jahr, fortschreibung(s));
    const jahreAbHeute = jahr - jetzt.jahr;
    const kaufkraftfaktor = Math.pow(1 + s.annahmen.inflation, jahreAbHeute);

    const quellen: Einkunftsquelle[] = [];
    /*
      Welche Quelle wem gehoert. Gefuellt beim Anlegen, aus der dort bereits
      aufgeloesten Person — nicht spaeter aus `s.vertraege` zurueckgesucht.
      Eine zweite Zuordnungsregel waere eine Regel zu viel, und der Umweg
      ueber `find` lief ausserdem je Quelle und Jahr.
    */
    const quelleZuPerson = new Map<string, PersonId>();
    const beitragspflichtig: Beitragspflichtig[] = [];
    const posten: JahresPosten[] = [];

    /*
      Die private Krankenversicherung DIESES Jahres, JE PERSON — sie wird in
      der Erwerbsphase wie im Ruhestand gebraucht. Je Person, weil der
      Wegfall des gesetzlichen Zuschlags (§ 149 VAG) und die Daempfung ab 65
      (§ 150 Abs. 3 VAG) am Alter haengen, und das ist bei zwei Partnern
      selten dasselbe.
    */
    const pkvHeuerJe = kvJePerson.map(
      (x) => pkvImJahr(x.annahmen, x.alterHeute + jahreAbHeute, jahreAbHeute),
    );

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

    /*
      Wer in diesem Jahr arbeitet und wer schon Rente bezieht — einmal
      bestimmt, statt im Vorbeigehen in einer Schleife gesetzt. Beide Mengen
      entscheiden weiter unten ueber die Veranlagung und darueber, ob die
      Krankenversicherung des Alters ueberhaupt greift.
    */
    const arbeitende = personen.filter((k) => jahr < k.rentenbeginnJahr);
    const nochErwerbstaetig = arbeitende.length > 0;
    const jemandImRuhestand = arbeitende.length < personen.length;

    // --- Schicht 1: Renten und Pensionen ---
    for (const k of personen) {
      if (jahr < k.rentenbeginnJahr) continue;
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
      quelleZuPerson.set(`person-${k.person.id}`, k.person.id);
      beitragspflichtig.push({
        id: `person-${k.person.id}`,
        art: k.istVersorgungsbezug ? 'versorgungsbezug' : 'gesetzlicheRente',
        monatsbetrag: brutto / 12,
        person: k.person.id,
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
    /** Sozialabgaben der Erwerbstaetigen, je Quelle — siehe unten. */
    const erwerbSv = new Map<string, number>();

    if (nochErwerbstaetig) {
      /*
        Jede arbeitende Person traegt IHRE Praemie — kein Haushaltsbetrag
        mehr, der nach Koepfen geteilt wird. Die Aufteilung steckt bereits in
        `kvJePerson`: Wer eine eigene Praemie eingetragen hat, traegt sie
        ganz; sonst deckt der Haushaltsbetrag alle privat Versicherten und
        wird unter ihnen geteilt.

        Damit entfaellt auch der frueheren Doppelzaehlung die Grundlage: Ein
        Rentner bekommt seine Praemie ueber `kvPvImAlter`, ein Arbeitender
        ueber diesen Weg — und niemand steht in beiden.
      */
      const amArbeiten = personen
        .map((k, i) => ({ k, e: einkommenJePerson[i]!, kv: kvJePerson[i] ?? kvA, i }))
        .filter(({ k }) => jahr < k.rentenbeginnJahr);

      const n = erwerbHaushalt(
        amArbeiten.map(({ e, kv, i }) => ({
          jahresbrutto: e.brutto * Math.pow(1 + s.annahmen.gehaltsdynamik, jahreAbHeute),
          beamter: e.beamter,
          selbststaendig: e.selbststaendig,
          // Der Beitrag waechst mit dem Einkommen mit — er ist entweder ein
          // Satz darauf oder ein Betrag, den man mit steigendem Gewinn
          // ebenfalls anhebt.
          grvBeitragJahr: e.grvBeitragJahr * Math.pow(1 + s.annahmen.gehaltsdynamik, jahreAbHeute),
          privatVersichert: kv.privat,
          zusatzbeitrag: kv.profil.zusatzbeitrag,
          pkvPraemieMonat: kv.privat ? (pkvHeuerJe[i]?.gesamtMonat ?? 0) : 0,
        })),
        // Der Kinderstatus gilt JE JAHR: waehrend der Erwerbsphase wachsen
        // Kinder aus der Beruecksichtigung heraus, und der Pflegebeitrag
        // steigt entsprechend wieder.
        { ...erwerbsOpt, beamter: false, kinder: kinderImJahr(s.haushalt, jahr) },
        p,
      );

      /*
        Das Erwerbseinkommen geht als QUELLE in die Veranlagung, nicht als
        fertig versteuerter Posten.

        Vorher rechnete `erwerbHaushalt` seine Steuer selbst, und
        `haushaltssteuer` rechnete daneben die der Renten — in einem Jahr, in
        dem einer arbeitet und der andere schon Rente bezieht, lief der Tarif
        damit ZWEIMAL: zwei Grundfreibetraege, zweimal Splitting. Bei
        24 000 EUR Rente neben 45 000 EUR Erwerbs-zvE fehlten dadurch 5 640 EUR
        Steuer im Jahr, also 470 EUR im Monat. Genau die Jahre zeigt der
        Jahresregler der Uebersicht.

        Die Sozialabgaben bleiben, wo sie sind: `erwerbHaushalt` rechnet sie
        je Person mit eigener Beitragsbemessungsgrenze. Sie kommen ueber
        `erwerbSv` an den Posten, damit sie nicht in den Verteilungsschluessel
        der Alters-Beitraege geraten.
      */
      amArbeiten.forEach(({ k }, i) => {
        const a = n.proPerson[i];
        if (!a) return;
        const id = `erwerb-${k.person.id}`;
        quellen.push({
          id,
          bezeichnung: personen.length > 1
            ? `Erwerbseinkommen ${k.person.name || k.person.id}`
            : 'Erwerbseinkommen',
          brutto: a.brutto,
          // Ohne den Sonderausgaben-Pauschbetrag: den zieht `haushaltssteuer`
          // einmal fuer den Haushalt ab.
          zveBeitrag: a.zveVorSonderausgaben,
          kvPv: a.sv,
        });
        erwerbSv.set(id, a.sv);
        quelleZuPerson.set(id, k.person.id);
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
      if (v.strategie !== 'planer' && !istKapitalauszahlung(v)) {
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
        quelleZuPerson.set(v.id, k.person.id);
      }
      if (r.kvArt) {
        const monatsbetrag = r.kvMonatsbetrag ?? r.brutto / 12;
        /*
          Der Inhaber MUSS mit: Beitragsgrenze und Freibetrag gehoeren dem
          Mitglied. Ohne ihn bekaeme jeder Vertrag seinen eigenen Freibetrag.

          `k.person.id` und nicht `v.inhaber`: Oben faellt `k` auf Person A
          zurueck, wenn der Inhaber gar nicht mitgerechnet wird — bei einem
          Alleinstehenden, dessen Vertrag noch auf 'B' steht. Mit `v.inhaber`
          entstand daraus eine zweite Mitgliedsgruppe, die es nicht gibt:
          zweite Beitragsbemessungsgrenze, zweiter Versorgungsfreibetrag und
          bei freiwillig Versicherten ein zweiter Mindestbeitrag.
        */
        beitragspflichtig.push({ id: v.id, art: r.kvArt, monatsbetrag, person: k.person.id });
      }
    }

    // --- KV/PV ---
    /*
      NUR, wenn ueberhaupt jemand im Ruhestand ist. Solange alle arbeiten,
      stecken die Beitraege im Erwerbsnetto (`erwerbHaushalt`) — die Rechnung
      hier ist die des ALTERS.

      Bisher lief sie in jedem Jahr mit und lieferte in reinen Erwerbsjahren
      einen Mindestbeitrag (freiwillig Versicherte) oder eine volle Praemie
      (privat Versicherte) auf gar keine Einkunft. Das fiel nicht auf, weil
      der Betrag mangels Brutto still unter den Tisch fiel — erst seit der
      Restposten unten nichts mehr verschwinden laesst, wird er sichtbar.
      Doppelt belastet wuerde er, nicht richtig.
    */
    /*
      Die Versicherung JE MITGLIED. Der Anteil der Praemie, der frueher hier
      nach Koepfen abgespalten werden musste, entfaellt: Ein Arbeitender ist
      in `beitragspflichtig` gar nicht vertreten und bekommt seine Praemie
      ueber `erwerbHaushalt`. Niemand steht in beiden Wegen.

      NACH Entlastung: der Zuschuss nach § 106 SGB VI ist auf die halbe
      Praemie gedeckelt; senkt ein Entlastungstarif sie, greift der Deckel
      frueher. Der Beitrag zum Entlastungstarif laeuft im Ruhestand mit einem
      Restanteil weiter — er fliesst ab, erhoeht den Zuschuss aber nicht und
      steht deshalb getrennt.
    */
    const jeMitglied: Record<string, MitgliedsKv> = {};
    kvJePerson.forEach((x, i) => {
      jeMitglied[x.id] = {
        status: x.profil.status,
        zusatzbeitrag: x.profil.zusatzbeitrag,
        pkvPraemieMonat: pkvHeuerJe[i]?.praemieMonat ?? 0,
        pkvWeitereBeitraegeMonat: pkvHeuerJe[i]?.betBeitragMonat ?? 0,
      };
    });

    const kv: KvPvErgebnis = jemandImRuhestand
      ? kvPvImAlter(s.haushalt.kvStatus, beitragspflichtig, kinderImJahr(s.haushalt, jahr), p, {
        jeMitglied,
        // Entscheidet ueber die beitragsfreie Familienversicherung eines
        // Partners ohne nennenswerte eigene Einkuenfte (§ 10 SGB V).
        verheiratet: s.haushalt.verheiratet,
      })
      : { kv: 0, pv: 0, gesamt: 0, abzugsfaehig: 0, jeQuelle: [] };
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
    // Als Set<VertragsTyp> typisiert: Ein Set<string> haette hier still eine
    // Vertragsart weitergefuehrt, die es nicht mehr gibt.
    const beguenstigt = new Set<Vertrag['typ']>(['prvRente', 'immobilie', 'etf']);
    const sonstigeEinkuenfte = quellen
      .filter((q) => {
        if (q.id.startsWith('erwerb') || q.id.startsWith('person-')) return false;
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
    /*
      ERST JETZT die Sozialabgaben der Erwerbstaetigen dazu. Sie sind keine
      Beitraege des Alters und duerfen deshalb weder in `zugeordnet` noch in
      `offen` eingehen — sonst verteilte der Rueckfall unten sie ein zweites
      Mal auf die Renten.
    */
    for (const [id, sv] of erwerbSv) jeQuelle.set(id, sv);
    // Der Rueckfall verteilt NUR auf Alterseinkuenfte. Ein Erwerbseinkommen
    // traegt seine eigenen Sozialabgaben und keinen Anteil an den Beitraegen
    // des Ruhestands.
    const altersQuelle = (id: string) => !id.startsWith('erwerb');
    const bruttoSumme = quellen
      .filter((q) => altersQuelle(q.id))
      .reduce((sum, q) => sum + q.brutto, 0);
    for (const q of quellen) {
      // Verbraucht: Was hier gebucht ist, darf am Ende nicht noch einmal als
      // unverteilter Rest erscheinen.
      const eigener = jeQuelle.get(q.id) ?? 0;
      jeQuelle.delete(q.id);
      const anteilKv = eigener
        + (offen > 0.005 && bruttoSumme > 0 && altersQuelle(q.id)
          ? (q.brutto / bruttoSumme) * offen
          : 0);
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
        person: quelleZuPerson.get(q.id),
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

      /*
        Nur freiwillig gesetzlich Versicherte zahlen auf Kapitalertraege
        KV/PV-Beitraege; in der KVdR bleiben sie beitragsfrei.

        Massgeblich ist die Versicherung des DEPOTINHABERS, nicht die des
        Haushalts: In einem gemischten Paar entscheidet, wem das Depot
        gehoert.
      */
      const kvDepot = kvProfil(s, k.person);
      const kvPvJahr = kvDepot.status === 'freiwillig'
        ? e.bruttoProJahr * (
          (kvDepot.zusatzbeitrag === undefined
            ? kvSatzVoll(p)
            : p.kv.allgemeinerSatz + kvDepot.zusatzbeitrag)
          + pvSatzMitglied(kinderImJahr(s.haushalt, jahr), p))
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
        person: k.person.id,
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
    // Kapitalvertraege mit Strategie "kapital" oder "planer" erscheinen hier
    // NICHT mehr: Ihre Beitraege sind beim Zufluss in einer Summe vom Kapital
    // abgezogen (siehe `kvPvAufKapitalleistung`). Frueher lief dafuer eine
    // Beitragspflicht ueber zehn Jahre mit — ein Posten ohne Brutto mit
    // negativem Netto, der das Haushaltsnetto ein zweites Mal minderte.
    for (const v of s.vertraege) {
      if (!istKapitalauszahlung(v) || v.strategie === 'ignorieren') continue;
      const k = personen.find((x) => x.person.id === v.inhaber) ?? personA;
      if (jahr < k.rentenbeginnJahr) continue;

      const kvPvVertrag = jeQuelle.get(v.id) ?? 0;
      jeQuelle.delete(v.id);
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
        person: k.person.id,
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

    /*
      Was keiner Einkunft zugeordnet werden konnte, bleibt trotzdem faellig.

      Der Rueckfall weiter oben verteilt den offenen Rest nach Bruttoanteil —
      das setzt voraus, dass es ueberhaupt ein Brutto gibt. Bei einem privat
      versicherten Paar ohne gesetzliche Rente gibt es keines: Dort fiel die
      Praemie bisher ERSATZLOS aus dem Haushaltsnetto heraus, und weil
      `kvPvGesamt` ebenfalls aus den Posten summiert wird, fiel es nicht
      einmal auf. Diese Zeile ist die einzige Stelle, die die Zusicherung
      "Summe der Posten = kv.gesamt x 12" tatsaechlich einloest.
    */
    const restKvPv = [...jeQuelle.values()].reduce((sum, x) => sum + x, 0)
      + (bruttoSumme > 0 ? 0 : Math.max(0, offen));
    if (restKvPv > 0.005) {
      posten.push({
        id: 'kv-pv-haushalt',
        bezeichnung: 'Kranken- und Pflegeversicherung',
        schicht: 1,
        bruttoJahr: 0,
        zveBeitrag: 0,
        kvPvJahr: restKvPv,
        steuerJahr: 0,
        nettoJahr: -restKvPv,
      });
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

/**
 * Die Fortschreibungsannahmen des Szenarios — an EINER Stelle gebuendelt.
 *
 * Sie bestimmen zwei Dinge: mit welchem Index Euro-Betraege in kuenftige
 * Jahre gerechnet werden und welchen Zusatzbeitrag die Krankenkasse erhebt.
 * Beides wird an jedem Parameterabruf gebraucht; einzeln durchgereicht wurde
 * frueher oder spaeter einer davon vergessen.
 */
function fortschreibung(s: Szenario) {
  return { indexRate: s.annahmen.tarifIndex, zusatzbeitrag: s.haushalt.zusatzbeitrag };
}

/**
 * Vertragsarten, die neben der laufenden Rente eine Kapitalauszahlung
 * anbieten. Bei Ruerup ist sie gesetzlich ausgeschlossen, bei der
 * Unterstuetzungskasse folgt sie eigenen Regeln (Zuflussprinzip), und Depots
 * kennen ohnehin keine Anbieterrente.
 */
export function kenntKapitalwahl(typ: Vertrag['typ']): boolean {
  return typ === 'bav' || typ === 'prvRente';
}

/**
 * NUTZT dieser Vertrag seinen Kapitalweg — statt der laufenden Rente?
 *
 * Nicht mehr die Vertragsart entscheidet das, sondern die gewaehlte
 * Strategie. Beide Wege stehen an demselben Vertrag; welcher in die
 * Gesamtuebersicht eingeht, waehlt der Nutzer.
 */
export function istKapitalauszahlung(v: Vertrag): boolean {
  return kenntKapitalwahl(v.typ)
    && (v.strategie === 'kapital' || v.strategie === 'verrenten' || v.strategie === 'planer');
}

/** Der Einmalbetrag des Vertrags — 0, wenn keiner erfasst ist. */
export function kapitalBetrag(v: Vertrag): number {
  return Math.max(0, v.kapitalAlternative ?? 0);
}

/**
 * In welchem Jahr die Kapitalleistung FLIESST.
 *
 * Ohne `ablaufJahr` zum Rentenbeginn, wie bisher — daran aendert sich fuer
 * gespeicherte Szenarien nichts. Ein Ablauf NACH dem Rentenbeginn ergibt
 * keinen Sinn und wird darauf begrenzt; einer in der Vergangenheit ebenso
 * wenig, denn was schon geflossen ist, plant man nicht mehr.
 */
export function auszahlungsjahr(v: Vertrag, rentenbeginnJahr: number, jetztJahr: number): number {
  if (v.ablaufJahr === undefined) return rentenbeginnJahr;
  return Math.min(rentenbeginnJahr, Math.max(jetztJahr, v.ablaufJahr));
}

/**
 * Was aus dem ausgezahlten Kapital bis zum Rentenbeginn wird.
 *
 * Der Vertrag ist beendet — und mit ihm sein Steuermantel. Der Zuwachs ist
 * eine gewoehnliche Geldanlage und traegt Abgeltungsteuer, genau wie beim
 * Wertpapierdepot. Ohne Wachstumssatz bleibt der Betrag stehen; erfunden
 * wird nichts.
 */
export function nachAblaufGewachsen(
  nettoKapital: number,
  satz: number,
  jahre: number,
  p: ReturnType<typeof parameterFuer>,
): { wachstumJahre: number; steuerWachstum: number; wertBeiRentenbeginn: number } {
  const n = Math.max(0, Math.round(jahre));
  if (n === 0 || nettoKapital <= 0 || satz === 0) {
    return { wachstumJahre: n, steuerWachstum: 0, wertBeiRentenbeginn: Math.max(0, nettoKapital) };
  }
  const brutto = nettoKapital * Math.pow(1 + satz, n);
  const zuwachs = Math.max(0, brutto - nettoKapital);
  const steuerWachstum = zuwachs * p.abgeltungsteuersatz;
  return { wachstumJahre: n, steuerWachstum, wertBeiRentenbeginn: brutto - steuerWachstum };
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
): { bruttoKapital: number; steuer: number; kvPv: number; nettoKapital: number } {
  const brutto = kapitalBetrag(v);
  const leer = { bruttoKapital: 0, steuer: 0, kvPv: 0, nettoKapital: 0 };
  if (brutto === 0) return leer;

  if (v.typ === 'bav') {
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
    // Altzusagen nach § 40b EStG a. F. sind steuerfrei, aber beitragspflichtig.
    const kvPv = kvPvAufKapitalleistung(brutto, s, k, jahr, p);
    return {
      bruttoKapital: brutto, steuer, kvPv,
      nettoKapital: Math.max(0, brutto - steuer - kvPv),
    };
  }

  if (v.typ === 'prvRente') {
    const beginnJahr = v.beginnJahr ?? jahr - 12;
    const e = kapitalversicherungErtrag({
      auszahlung: brutto,
      eingezahlteBeitraege: (v.monatsbeitrag ?? 0) * 12 * Math.max(0, jahr - beginnJahr),
      vertragsbeginnJahr: beginnJahr,
      auszahlungsJahr: jahr,
      /*
        Das Alter IM ZUFLUSSJAHR, nicht beim Rentenbeginn. Die 12/62-Regel
        des § 20 Abs. 1 Nr. 6 EStG haelt den Ertrag nur zur Haelfte
        steuerpflichtig, wenn die Auszahlung NACH dem 62. Lebensjahr
        erfolgt. Wer den Vertrag mit 60 ablaufen laesst, erfuellt sie nicht —
        mit dem Alter bei Rentenbeginn gerechnet saehe es so aus, als taete
        er es doch.
      */
      alterBeiAuszahlung: k.alterBeiRentenbeginn - (k.rentenbeginnJahr - jahr),
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
    /*
      Bei der privaten Kapitalwahl sind nur freiwillig Versicherte
      beitragspflichtig; in der KVdR bleibt die Leistung beitragsfrei, weil
      sie kein Versorgungsbezug ist.
    */
    const kvPv = kvProfil(s, k.person).status === 'freiwillig'
      ? kvPvAufKapitalleistung(brutto, s, k, jahr, p, 'sonstiges')
      : 0;
    return {
      bruttoKapital: brutto, steuer, kvPv,
      nettoKapital: Math.max(0, brutto - steuer - kvPv),
    };
  }

  return leer;
}

/**
 * Kranken- und Pflegeversicherung auf eine KAPITALLEISTUNG — einmalig.
 *
 * § 229 Abs. 1 S. 3 SGB V bemisst die Beitraege mit einem Hundertzwanzigstel
 * des Betrags ueber 120 Monate. Diese Verteilung ist die BEMESSUNG, nicht der
 * Zahlungsweg: Sie sorgt dafuer, dass der Freibetrag des § 226 SGB V
 * hundertzwanzigmal gegengerechnet wird — deshalb wird hier auch mit dem
 * Monatswert gerechnet und anschliessend hochmultipliziert, statt den ganzen
 * Betrag in einen Monat zu legen.
 *
 * Abgezogen wird der Betrag beim Zufluss, in einer Summe. Die frueher
 * gebuchte Beitragspflicht ueber zehn Jahre erzeugte in der Monatsrechnung
 * einen Posten ohne Brutto mit negativem Netto und minderte das Haushaltsnetto
 * ein zweites Mal.
 *
 * Der Freibetrag wird NICHT allein der Kapitalleistung zugerechnet: In den
 * 120 Bemessungsmonaten steht sie neben den laufenden Versorgungsbezuegen
 * derselben Person, und § 226 SGB V kennt den Freibetrag nur einmal je
 * Mitglied. Deshalb wird die ganze Beitragsrechnung dieses Mitglieds
 * aufgestellt und daraus der Anteil abgelesen, den die Kapitalleistung
 * ausloest. Wer schon Betriebsrenten bezieht, hat den Freibetrag verbraucht.
 */
function kvPvAufKapitalleistung(
  kapital: number,
  s: Szenario,
  k: PersonKontext,
  jahr: number,
  p: ReturnType<typeof parameterFuer>,
  art: 'versorgungsbezug' | 'sonstiges' = 'versorgungsbezug',
): number {
  const { monatswert, monate } = bavKapitalMonatswert(kapital);
  if (monatswert <= 0) return 0;
  // Der Status des EMPFAENGERS, nicht der des Haushalts.
  const r = kvPvImAlter(
    kvProfil(s, k.person).status,
    [
      ...laufendeEinkuenfte(s, k, jahr),
      { id: 'kapitalleistung', art, monatsbetrag: monatswert, person: k.person.id },
    ],
    kinderImJahr(s.haushalt, jahr),
    p,
    // Ohne Praemie: Bei privat Versicherten loest eine Kapitalleistung keine
    // Beitraege aus, `kvPvImAlter` liefert dann von selbst null.
    { pkvPraemieMonat: 0 },
  );
  // NUR der Anteil der Kapitalleistung. Die laufenden Bezuege stehen hier nur,
  // damit Freibetrag und Beitragsgrenze richtig aufgeteilt werden — ihre
  // eigenen Beitraege bucht die Jahresrechnung.
  const eigen = r.jeQuelle.find((x) => x.id === 'kapitalleistung');
  return eigen ? (eigen.kv + eigen.pv) * monate : 0;
}

/**
 * Die LAUFENDEN beitragspflichtigen Einkuenfte einer Person in einem Jahr.
 *
 * Gebraucht, um eine Kapitalleistung in die Rechnung ihres Mitglieds
 * einzuordnen: Beitragsgrenze und Freibetrag hat sie nicht fuer sich allein.
 * Bewusst schlank gehalten — hier zaehlt, was Grenze und Freibetrag
 * verbraucht, nicht die vollstaendige Jahresrechnung.
 */
function laufendeEinkuenfte(s: Szenario, k: PersonKontext, jahr: number): Beitragspflichtig[] {
  if (jahr < k.rentenbeginnJahr) return [];
  const liste: Beitragspflichtig[] = [{
    id: `person-${k.person.id}`,
    art: k.istVersorgungsbezug ? 'versorgungsbezug' : 'gesetzlicheRente',
    monatsbetrag: bezugImJahr(k, jahr, s.annahmen.rentendynamik) / 12,
    person: k.person.id,
  }];

  for (const v of s.vertraege) {
    if (v.inhaber !== k.person.id) continue;
    if (v.strategie === 'ignorieren') continue;
    // Nur laufende Betriebsrenten: Was selbst als Kapital ausgezahlt wird,
    // ist in diesem Jahr keine wiederkehrende Leistung.
    const laufendeBav = (v.typ === 'bav' && !istKapitalauszahlung(v)) || v.typ === 'bavUkasse';
    if (!laufendeBav || v.brutto <= 0) continue;
    liste.push({ id: v.id, art: 'versorgungsbezug', monatsbetrag: v.brutto, person: v.inhaber });
  }
  return liste;
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

    if (istKapitalauszahlung(v)) {
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
      /*
        EINE Vertragsart, ZWEI Wege. Welcher gilt, sagt die Strategie — nicht
        mehr die Vertragsart. Frueher waren das zwei Arten, und derselbe
        Vertrag liess sich nicht in beiden Wegen erfassen.
      */
      if (istKapitalauszahlung(v)) {
        /*
          Einmalige Kapitalleistung aus der bAV.

          Steuer: voll steuerpflichtig im Zuflussjahr (§ 22 Nr. 5 EStG); die
          Fuenftelregelung wird dafuer regelmaessig nicht gewaehrt. Der Betrag
          geht in voller Hoehe ins zvE. Altzusagen nach § 40b EStG a. F. sind
          steuerfrei, bleiben aber beitragspflichtig.

          KV/PV: SOFORT UND EINMALIG, abgezogen in `kapitalNachSteuer`.
          § 229 Abs. 1 S. 3 SGB V bemisst die Beitraege mit 1/120 ueber 120
          Monate — das ist die Bemessung, nicht der Zahlungsweg.
        */
        if (jahreSeitRente !== 0) return null;
        const kapital = kapitalBetrag(v);
        return { brutto: kapital, zveBeitrag: v.altvertrag ? 0 : kapital, kvArt: null };
      }
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
        kvArt: kvProfil(s, k.person).status === 'freiwillig' ? 'sonstiges' : null,
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
        kvArt: kvProfil(s, k.person).status === 'freiwillig' ? 'sonstiges' : null,
      };
    }
    case 'prvRente': {
      // Auch hier zwei Wege an einem Vertrag: laufende Rente oder Kapitalwahl.
      if (istKapitalauszahlung(v)) {
        // Kapitalwahl aus einer privaten Renten-/Lebensversicherung.
        // § 20 Abs. 1 Nr. 6 EStG: steuerpflichtig ist der Unterschiedsbetrag
        // zwischen Auszahlung und eingezahlten Beitraegen; bei mindestens
        // 12 Jahren Laufzeit UND Auszahlung nach dem 62. Lebensjahr nur zur
        // Haelfte, dann aber tariflich statt mit Abgeltungsteuer
        // (§ 32d Abs. 2 Nr. 2). Beides bildet kapitalversicherungErtrag ab.
        if (jahreSeitRente !== 0) return null;
        const auszahlung = kapitalBetrag(v);
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

        // Beitraege wie bei der bAV-Kapitalleistung: einmalig beim Zufluss,
        // abgezogen in `kapitalNachSteuer` — nicht als Zeitreihe.
        return {
          brutto: auszahlung,
          zveBeitrag: e.steuerpflichtigerAnteil,
          kvArt: null,
        };
      }
      const brutto = v.brutto * 12;
      return {
        brutto, zveBeitrag: brutto * ertragsanteil(k.alterBeiRentenbeginn),
        kvArt: 'sonstiges', pauschbetragArt: 'sonstige',
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
