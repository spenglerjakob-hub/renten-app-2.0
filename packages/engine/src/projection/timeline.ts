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
  }[];
  /**
   * Je Altersvorsorgedepot Endkapital, Eigenbeitraege und vereinnahmte
   * Zulagen. Ohne diese Angabe bliebe die Foerderung unsichtbar — und genau
   * sie ist der Grund, ueberhaupt ein gefoerdertes Depot zu waehlen.
   */
  avd: AvdLauf[];
  hinweise: string[];
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

  const personen = s.personen
    .filter((p) => p.id === 'A' || s.haushalt.verheiratet)
    .map((p) => personKontext(p, s, jetzt))
    .filter((k): k is PersonKontext => k !== null);

  if (personen.length === 0) {
    return {
      zeilen: [], ruhestandsjahr: jetzt.jahr, freibetraege: [], planer: null, depots: [],
      kapitalauszahlungen: [], avd: [],
      rechtsstand: rechtsstandInfo(jetzt.jahr, { indexRate: s.annahmen.tarifIndex }),
      hinweise: ['Kein gueltiges Geburts- oder Rentenbeginndatum erfasst.'],
    };
  }

  const ruhestandsjahr = Math.max(...personen.map((k) => k.rentenbeginnJahr));
  const kinder: KinderStatus = { hatKinder: s.haushalt.hatKinder, kinderUnter25: s.haushalt.kinderUnter25 };
  const personA = personen[0]!;
  const letztesJahr = personA.geburt.jahr + 100;

  // --- Erwerbseinkommen heute ---
  const pHeute = parameterFuer(jetzt.jahr, { indexRate: s.annahmen.tarifIndex });
  const erwerbsOpt = {
    verheiratet: s.haushalt.verheiratet,
    bundesland: s.haushalt.bundesland,
    kirchensteuerpflichtig: s.haushalt.kirchensteuer,
    kinder,
    pkvPraemieMonat: s.haushalt.kvStatus === 'pkv' ? s.haushalt.pkvPraemieMonat : 0,
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
  const einkommenJePerson: { brutto: number; beamter: boolean }[] = (() => {
    const getrennt = s.einkommenGetrennt === true && personen.length > 1;
    if (getrennt) {
      const zweites = s.einkommenPartner ?? s.einkommenHeute;
      return personen.map((_, i) => {
        const e = i === 0 ? s.einkommenHeute : zweites;
        return { brutto: bruttoAus(e), beamter: e.modus === 'besoldung' };
      });
    }
    const gesamt = bruttoAus(s.einkommenHeute);
    const beamter = s.einkommenHeute.modus === 'besoldung';
    return personen.map(() => ({ brutto: gesamt / personen.length, beamter }));
  })();

  // --- Auszahlungs-Planer ---
  // Kapital aus Vertraegen mit Strategie "planer" wird im Zuflussjahr
  // besteuert und fliesst NETTO in den Planer. Als Bemessungsgrundlage dient
  // das uebrige Renteneinkommen des Ruhestandsjahres. Damit wird die
  // Zirkularitaet vermieden, die entstuende, wenn die Planerentnahme ihre
  // eigene Steuerbemessung mitbestimmte.
  const pRuhestand = parameterFuer(ruhestandsjahr, { indexRate: s.annahmen.tarifIndex });
  const uebertragenesKapital = planerKapital(s, personen, ruhestandsjahr, pRuhestand);
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
      hinweise.push(`${v.name || 'Altersvorsorgedepot'}: ${h}`);
    }
  }

  // --- Einmalige Kapitalauszahlungen ---
  const kapitalauszahlungen: ProjektionsErgebnis['kapitalauszahlungen'] = [];
  for (const v of s.vertraege) {
    if (v.typ !== 'etf' || v.strategie !== 'kapital') continue;
    const k = personen.find((x) => x.person.id === v.inhaber) ?? personA;
    const jahreBis = Math.max(0, k.rentenbeginnJahr - jetzt.jahr);
    const r = etfNettoKapital(v, s, pRuhestand, jahreBis);
    if (r.bruttoKapital <= 0) continue;
    kapitalauszahlungen.push({
      vertragId: v.id,
      bezeichnung: v.name || 'Wertpapierdepot',
      jahr: k.rentenbeginnJahr,
      ...r,
    });
  }

  const zeilen: Jahreszeile[] = [];

  for (let jahr = jetzt.jahr; jahr <= letztesJahr; jahr++) {
    const p = parameterFuer(jahr, { indexRate: s.annahmen.tarifIndex });
    const jahreAbHeute = jahr - jetzt.jahr;
    const kaufkraftfaktor = Math.pow(1 + s.annahmen.inflation, jahreAbHeute);

    const quellen: Einkunftsquelle[] = [];
    const beitragspflichtig: Beitragspflichtig[] = [];
    // Je Quelle der Betrag, der ueberhaupt KV/PV-pflichtig ist. Ohne diese
    // Spur wuerde die Beitragslast unten nach BRUTTO verteilt — und damit
    // auch beitragsfreien Bezuegen (Riester und Altersvorsorgedepot in der
    // KVdR) Beitraege zugeschrieben, die sie nicht ausloesen.
    const kvBasis = new Map<string, number>();
    const posten: JahresPosten[] = [];

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
        art: k.istVersorgungsbezug ? 'versorgungsbezug' : 'gesetzlicheRente',
        monatsbetrag: brutto / 12,
      });
      kvBasis.set(`person-${k.person.id}`, brutto);
    }

    // --- Erwerbseinkommen der noch arbeitenden Personen ---
    // Der Prototyp sprang von "alle arbeiten" direkt auf "alle in Rente" und
    // liess die gemischte Phase aus.
    if (nochErwerbstaetig) {
      // Nur die Personen, die in DIESEM Jahr noch arbeiten. Frueher wurde das
      // Haushaltseinkommen pauschal nach Koepfen geteilt — unabhaengig davon,
      // wer wie viel verdient hat.
      const arbeitend = personen
        .map((k, i) => ({ k, e: einkommenJePerson[i]! }))
        .filter(({ k }) => jahr < k.rentenbeginnJahr)
        .map(({ e }) => ({
          jahresbrutto: e.brutto * Math.pow(1 + s.annahmen.gehaltsdynamik, jahreAbHeute),
          beamter: e.beamter,
          pkvPraemieMonat: erwerbsOpt.pkvPraemieMonat,
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
      // Vertraege mit Strategie "planer" werden weiter unten als Kapital in
      // den Auszahlungs-Planer uebertragen; ihr Brutto darf hier nicht
      // zusaetzlich als laufendes Einkommen erscheinen. Die Beitragspflicht
      // in der KV/PV bleibt davon unberuehrt.
      if (v.strategie !== 'planer') {
        // "avd" waere als Ersatzbezeichnung im Kassenbon nicht lesbar; die
        // uebrigen Kuerzel sind wenigstens Woerter.
        const bezeichnung = v.name || (v.typ === 'avd' ? 'Altersvorsorgedepot' : v.typ);
        quellen.push({ id: v.id, bezeichnung, brutto: r.brutto, zveBeitrag: r.zveBeitrag, kvPv: 0 });
      }
      if (r.kvArt) {
        const monatsbetrag = r.kvMonatsbetrag ?? r.brutto / 12;
        beitragspflichtig.push({ art: r.kvArt, monatsbetrag });
        kvBasis.set(v.id, monatsbetrag * 12);
      }
    }

    // --- KV/PV ---
    const kv = kvPvImAlter(s.haushalt.kvStatus, beitragspflichtig, kinder, p, {
      pkvPraemieMonat: s.haushalt.pkvPraemieMonat,
      personen: personen.filter((k) => jahr >= k.rentenbeginnJahr).length || 1,
    });
    const kvPvJahr = kv.gesamt * 12;

    // --- Altersentlastungsbetrag auf nicht-Renten-Einkuenfte ---
    const sonstigeEinkuenfte = quellen
      .filter((q) => q.id !== 'erwerb' && !q.id.startsWith('person-'))
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

    // KV/PV verursachungsgerecht auf die Quellen verteilen: nach dem
    // BEITRAGSPFLICHTIGEN Betrag, nicht nach dem Brutto. Sonst truege etwa
    // eine Riester-Rente in der KVdR im Kassenbon Beitraege, die sie gar
    // nicht ausloest — und der gesetzlichen Rente fehlten sie.
    // Rueckfall auf das Brutto, wenn keine Quelle beitragspflichtig ist,
    // die Kasse aber trotzdem etwas kostet (privat Versicherte zahlen eine
    // Praemie unabhaengig vom Bezug).
    const bruttoSumme = quellen.reduce((sum, q) => sum + q.brutto, 0);
    const kvBasisSumme = quellen.reduce((sum, q) => sum + (kvBasis.get(q.id) ?? 0), 0);
    for (const q of quellen) {
      const anteilKv = kvBasisSumme > 0
        ? ((kvBasis.get(q.id) ?? 0) / kvBasisSumme) * kvPvJahr
        : bruttoSumme > 0 ? (q.brutto / bruttoSumme) * kvPvJahr : 0;
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
    avd: [...avdLaeufe.values()],
    hinweise,
  };
}

/**
 * NETTO-Kapital, das aus Vertraegen mit Strategie "planer" in den
 * Auszahlungs-Planer fliesst.
 *
 * Die Steuer wird auf Basis des uebrigen Renteneinkommens des
 * Ruhestandsjahres ermittelt — ohne die Planerentnahme selbst, weil diese
 * sonst ihre eigene Bemessungsgrundlage mitbestimmen wuerde.
 */
function planerKapital(
  s: Szenario,
  personen: PersonKontext[],
  ruhestandsjahr: number,
  p: ReturnType<typeof parameterFuer>,
): number {
  const kandidaten = s.vertraege.filter((v) => v.strategie === 'planer');
  if (kandidaten.length === 0) return 0;

  // Uebriges zvE des Ruhestandsjahres aus Schicht 1.
  const zveBasis = personen.reduce((sum, k) => {
    if (ruhestandsjahr < k.rentenbeginnJahr) return sum;
    const brutto = bezugImJahr(k, ruhestandsjahr, s.annahmen.rentendynamik);
    const wk = k.istVersorgungsbezug
      ? p.pauschbetraege.versorgungsbezuege
      : p.pauschbetraege.renten;
    return sum + Math.max(0, brutto - k.freibetrag.jahresbetrag - wk);
  }, 0);

  const kistSatz = s.haushalt.kirchensteuer ? kirchensteuersatz(s.haushalt.bundesland) : 0;

  let summe = 0;
  for (const v of kandidaten) {
    const k = personen.find((x) => x.person.id === v.inhaber) ?? personen[0]!;

    if (v.typ === 'bavKapital') {
      const { steuer } = bavKapitalSteuer(
        {
          kapital: Math.max(0, v.brutto),
          zveBasis,
          verheiratet: s.haushalt.verheiratet,
          kirchensteuersatz: kistSatz,
          altzusageVor2005: v.altvertrag,
          fuenftelregelungAnwenden: false,
        },
        p,
      );
      summe += Math.max(0, v.brutto - steuer);
      continue;
    }

    if (v.typ === 'prvKapital') {
      const auszahlung = Math.max(0, v.brutto);
      if (auszahlung === 0) continue;
      const beginnJahr = v.beginnJahr ?? ruhestandsjahr - 12;
      const e = kapitalversicherungErtrag({
        auszahlung,
        eingezahlteBeitraege: (v.monatsbeitrag ?? 0) * 12 * Math.max(0, ruhestandsjahr - beginnJahr),
        vertragsbeginnJahr: beginnJahr,
        auszahlungsJahr: ruhestandsjahr,
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
      summe += Math.max(0, auszahlung - steuer);
      continue;
    }

    if (v.typ === 'etf') {
      const jahreBis = Math.max(0, ruhestandsjahr - new Date().getFullYear());
      summe += etfNettoKapital(v, s, p, jahreBis).nettoKapital;
    }
  }
  return summe;
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
      kinderGeburtsjahre: s.haushalt.kinderGeburtsjahre,
      kinderInAusbildung: s.haushalt.kinderInAusbildung,
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
} | null {
  const jahreSeitRente = jahr - k.rentenbeginnJahr;

  switch (v.typ) {
    case 'basis': {
      // Ruerup unterliegt demselben Kohortenprinzip wie die gesetzliche Rente.
      const anteil = rentenfreibetrag(k.rentenbeginnJahr, 1).besteuerungsanteil ?? 1;
      const brutto = v.brutto * 12;
      return { brutto, zveBeitrag: brutto * anteil, kvArt: 'sonstiges' };
    }
    case 'bav': {
      const brutto = v.brutto * 12;
      const zve = v.altvertrag ? brutto * ertragsanteil(k.alterBeiRentenbeginn) : brutto;
      return { brutto, zveBeitrag: zve, kvArt: 'versorgungsbezug' };
    }
    case 'bavUkasse': {
      const brutto = v.brutto * 12;
      const fb = versorgungsfreibetrag(k.rentenbeginnJahr, brutto);
      return {
        brutto,
        zveBeitrag: Math.max(0, brutto - fb.jahresbetrag - p.pauschbetraege.versorgungsbezuege),
        kvArt: 'versorgungsbezug',
      };
    }
    case 'riester': {
      // Riester-Renten sind voll steuerpflichtig, aber fuer Pflichtversicherte
      // in der KVdR beitragsfrei (kein Versorgungsbezug).
      const brutto = v.brutto * 12;
      return { brutto, zveBeitrag: brutto, kvArt: s.haushalt.kvStatus === 'freiwillig' ? 'sonstiges' : null };
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
        kvArt: s.haushalt.kvStatus === 'freiwillig' ? 'sonstiges' : null,
      };
    }
    case 'prvRente': {
      const brutto = v.brutto * 12;
      return { brutto, zveBeitrag: brutto * ertragsanteil(k.alterBeiRentenbeginn), kvArt: 'sonstiges' };
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
