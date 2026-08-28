import type { Szenario, Person, Vertrag } from '../model.js';
import { parameterFuer, rechtsstandInfo, type RechtsstandInfo } from '../params/registry.js';
import {
  haushaltssteuer, zusatzsteuer, abgeltungsteuer, type Einkunftsquelle,
} from '../tax/haushalt.js';
import { kirchensteuersatz } from '../tax/estg.js';
import { kvPvImAlter, type Beitragspflichtig, type KinderStatus } from '../social/kv-pv.js';
import {
  versorgungsfreibetrag, rentenfreibetrag, ertragsanteil,
  altersentlastungsbetrag, type EingefrorenerFreibetrag,
} from '../pension/freibetraege.js';
import { zugangsfaktor } from '../pension/grv.js';
import { besoldung } from '../pension/beamte.js';
import { bruttoZuNetto, nettoZuBrutto } from '../erwerb/netto.js';
import { bavKapitalMonatswert, bavKapitalSteuer } from '../products/bav.js';
import { kapitalversicherungErtrag, ansparphase } from '../products/kapitalanlage.js';
import { entnahmeplanBewerten } from '../products/entnahmeplaner.js';
import { parseDatum, alterExakt, heute, type Datum } from '../util/datum.js';

/**
 * Basiszins § 203 Abs. 2 BewG fuer die Vorabpauschale. Das BMF setzt ihn
 * jaehrlich neu fest; fuer kuenftige Jahre ist er nicht bekannt, deshalb
 * eine konservative Annahme statt eines Scheinwertes.
 */
const BASISZINS = 0.0253;

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
      zeilen: [], ruhestandsjahr: jetzt.jahr, freibetraege: [], planer: null,
      rechtsstand: rechtsstandInfo(jetzt.jahr, { indexRate: s.annahmen.tarifIndex }),
      hinweise: ['Kein gueltiges Geburts- oder Rentenbeginndatum erfasst.'],
    };
  }

  const ruhestandsjahr = Math.max(...personen.map((k) => k.rentenbeginnJahr));
  const kinder: KinderStatus = { hatKinder: s.haushalt.hatKinder, kinderUnter25: s.haushalt.kinderUnter25 };
  const personA = personen[0]!;
  const letztesJahr = personA.geburt.jahr + 100;

  // Erwerbseinkommen heute als Ausgangsbasis
  const pHeute = parameterFuer(jetzt.jahr, { indexRate: s.annahmen.tarifIndex });
  const erwerbsOpt = {
    verheiratet: s.haushalt.verheiratet,
    bundesland: s.haushalt.bundesland,
    kirchensteuerpflichtig: s.haushalt.kirchensteuer,
    kinder,
    beamter: s.einkommenHeute.modus === 'besoldung',
    pkvPraemieMonat: s.haushalt.kvStatus === 'pkv' ? s.haushalt.pkvPraemieMonat : 0,
  };

  let erwerbsBruttoHeute: number;
  if (s.einkommenHeute.modus === 'besoldung') {
    const b = besoldung(
      s.einkommenHeute.besoldungsgruppe, s.einkommenHeute.besoldungsstufe,
      s.einkommenHeute.besoldungsland, jetzt.jahr,
      { verheiratet: s.haushalt.verheiratet, kinder: s.haushalt.kinderUnter25 },
    );
    erwerbsBruttoHeute = b.brutto * 12;
    if (!b.belegt) {
      hinweise.push(
        'Die Besoldung beruht auf einer Naeherung, nicht auf der amtlichen Tabelle des Dienstherrn. ' +
        'Der ausgewiesene Betrag kann um mehrere hundert Euro im Monat abweichen.',
      );
    }
  } else if (s.einkommenHeute.modus === 'netto') {
    erwerbsBruttoHeute = nettoZuBrutto(
      s.einkommenHeute.betrag * s.einkommenHeute.auszahlungen, erwerbsOpt, pHeute,
    ).jahresbrutto;
  } else {
    erwerbsBruttoHeute = s.einkommenHeute.betrag * s.einkommenHeute.auszahlungen;
  }

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

  const zeilen: Jahreszeile[] = [];

  for (let jahr = jetzt.jahr; jahr <= letztesJahr; jahr++) {
    const p = parameterFuer(jahr, { indexRate: s.annahmen.tarifIndex });
    const jahreAbHeute = jahr - jetzt.jahr;
    const kaufkraftfaktor = Math.pow(1 + s.annahmen.inflation, jahreAbHeute);

    const quellen: Einkunftsquelle[] = [];
    const beitragspflichtig: Beitragspflichtig[] = [];
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
    }

    // --- Erwerbseinkommen der noch arbeitenden Personen ---
    // Der Prototyp sprang von "alle arbeiten" direkt auf "alle in Rente" und
    // liess die gemischte Phase aus.
    if (nochErwerbstaetig) {
      const anteil = personen.filter((k) => jahr < k.rentenbeginnJahr).length / personen.length;
      const bruttoJahr =
        erwerbsBruttoHeute * Math.pow(1 + s.annahmen.gehaltsdynamik, jahreAbHeute) * anteil;
      const n = bruttoZuNetto(bruttoJahr, erwerbsOpt, p);
      posten.push({
        id: 'erwerb', bezeichnung: 'Erwerbseinkommen', schicht: 1,
        bruttoJahr, zveBeitrag: n.zve, kvPvJahr: n.sv,
        steuerJahr: n.est + n.soli + n.kirchensteuer, nettoJahr: n.jahresnetto,
      });
    }

    // --- Schichten 2 und 3: Vertraege ---
    for (const v of s.vertraege) {
      const k = personen.find((x) => x.person.id === v.inhaber) ?? personA;
      if (jahr < k.rentenbeginnJahr) continue;
      if (v.strategie === 'ignorieren') continue;

      const r = vertragImJahr(v, k, jahr, s, p);
      if (!r) continue;
      // Vertraege mit Strategie "planer" werden weiter unten als Kapital in
      // den Auszahlungs-Planer uebertragen; ihr Brutto darf hier nicht
      // zusaetzlich als laufendes Einkommen erscheinen. Die Beitragspflicht
      // in der KV/PV bleibt davon unberuehrt.
      if (v.strategie !== 'planer') {
        quellen.push({ id: v.id, bezeichnung: v.name || v.typ, brutto: r.brutto, zveBeitrag: r.zveBeitrag, kvPv: 0 });
      }
      if (r.kvArt) {
        beitragspflichtig.push({ art: r.kvArt, monatsbetrag: r.kvMonatsbetrag ?? r.brutto / 12 });
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

    // KV/PV verursachungsgerecht auf die Quellen verteilen
    const bruttoSumme = quellen.reduce((sum, q) => sum + q.brutto, 0);
    for (const q of quellen) {
      const anteilKv = bruttoSumme > 0 ? (q.brutto / bruttoSumme) * kvPvJahr : 0;
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
      // Depotwert zum Rentenbeginn abzueglich Abgeltungsteuer auf den Gewinn.
      const jahreBis = Math.max(0, ruhestandsjahr - new Date().getFullYear());
      const teilfreistellung = v.teilfreistellung ?? 0.3;
      const sparerpauschbetrag = p.pauschbetraege.sparer * (s.haushalt.verheiratet ? 2 : 1);
      const verlauf = ansparphase({
        startkapital: v.kapitalHeute ?? 0,
        einstandswert: v.einstandswert ?? v.kapitalHeute ?? 0,
        sparrateMonat: v.sparrate ?? 0,
        jahre: jahreBis,
        renditeBrutto: v.renditeAnsparphase ?? 0.06,
        ter: v.ter ?? 0.002,
        ausgabeaufschlag: v.ausgabeaufschlag ?? 0,
        depotgebuehrJahr: v.depotgebuehrJahr ?? 0,
        sonderzahlung: v.sonderzahlung,
        sonderzahlungInJahr: v.sonderzahlungJahr,
        teilfreistellung,
        basiszins: BASISZINS,
        sparerpauschbetrag,
        abgeltungsteuerSatzEffektiv: p.abgeltungsteuersatz,
      });
      const gewinn = Math.max(0, verlauf.endkapital - verlauf.anschaffungskosten);
      const { steuer } = abgeltungsteuer(
        gewinn,
        {
          kirchensteuerpflichtig: s.haushalt.kirchensteuer,
          bundesland: s.haushalt.bundesland,
          teilfreistellung,
          sparerpauschbetrag,
        },
        p,
      );
      summe += Math.max(0, verlauf.endkapital - steuer);
    }
  }
  return summe;
}

/** Laufende Auszahlung eines Vertrags in einem Kalenderjahr. */
function vertragImJahr(
  v: Vertrag,
  k: PersonKontext,
  jahr: number,
  s: Szenario,
  p: ReturnType<typeof parameterFuer>,
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
    case 'etf': {
      const dauer = v.entnahmedauer ?? 25;
      if (jahreSeitRente >= dauer) return null;
      if (v.strategie !== 'rente') return null;
      // Vereinfachte laufende Entnahme; die exakte FIFO-Rechnung liefert
      // products/kapitalanlage.ts und wird im Vertrags-TUEV verwendet.
      const brutto = (v.kapitalHeute ?? 0) / Math.max(1, dauer);
      return { brutto, zveBeitrag: brutto * 0.3, kvArt: s.haushalt.kvStatus === 'freiwillig' ? 'sonstiges' : null };
    }
    default:
      return null;
  }
}
