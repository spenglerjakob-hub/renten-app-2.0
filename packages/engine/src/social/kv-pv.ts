import type { LegalParameters } from '../params/types.js';
import { PKV_BASISANTEIL } from './pkv.js';

export type KvStatus = 'kvdr' | 'freiwillig' | 'pkv';

/**
 * Krankenversicherung in der Erwerbsphase.
 *
 * Nur zwei Werte, weil die Rechnung dort nur zwei Faelle kennt: gesetzlich
 * (pflicht oder freiwillig — der Unterschied liegt in der Bemessung, nicht im
 * Satz) oder privat. Die drei Ruhestandswerte sind eine andere Frage.
 */
export type KvErwerb = 'gesetzlich' | 'pkv';

/** Einkunftsarten mit unterschiedlicher Beitragsbehandlung im Alter. */
export type BeitragsArt =
  | 'gesetzlicheRente'   // halber Satz, DRV traegt die andere Haelfte
  | 'versorgungsbezug'   // voller Satz, KV-Freibetrag / PV-Freigrenze
  | 'sonstiges';         // nur bei freiwillig Versicherten beitragspflichtig

export interface Beitragspflichtig {
  /**
   * Kennung der Quelle (Vertrag oder Person).
   *
   * Nur dafuer da, den berechneten Beitrag wieder der richtigen Quelle
   * zuzuordnen. Ohne sie musste der Aufrufer die Summe nach einem Schluessel
   * verteilen, und jeder Schluessel ist falsch: eine gesetzliche Rente kostet
   * 12,95 %, ein Versorgungsbezug 21,7 %, eine private Rente gar nichts.
   */
  id: string;
  art: BeitragsArt;
  /** Monatsbetrag in EUR */
  monatsbetrag: number;
  /**
   * Wem die Einkunft gehoert.
   *
   * Beitragsbemessungsgrenze und Freibetrag stehen jedem MITGLIED einmal zu,
   * nicht dem Haushalt und schon gar nicht jedem Vertrag. Ohne diese Angabe
   * liesse sich beides nicht auseinanderhalten: Ein Ehepaar bekaeme einen
   * gemeinsamen Topf, aus dem einer allein schoepfen koennte, und jeder
   * Vertrag seinen eigenen Freibetrag.
   *
   * Fehlt sie, gehoert alles einem gedachten Mitglied. Das ist der
   * Einpersonenfall und damit die richtige Vorgabe.
   */
  person?: string;
}

export interface KinderStatus {
  /** Mitglied hat mindestens ein Kind (entfaellt Kinderlosenzuschlag) */
  hatKinder: boolean;
  /** Anzahl Kinder unter 25 — ab dem 2. Kind je 0,25 Punkte Abschlag */
  kinderUnter25: number;
}

export interface KvPvErgebnis {
  /** Monatliche KV-Beitraege des Mitglieds */
  kv: number;
  /** Monatliche PV-Beitraege des Mitglieds */
  pv: number;
  /** Summe, monatlich */
  gesamt: number;
  /** Als Sonderausgabe abzugsfaehiger Anteil (Basisabsicherung), monatlich */
  abzugsfaehig: number;
  /**
   * Was jede einzelne Quelle ausloest, monatlich.
   *
   * Die Summe ergibt `gesamt`. Wer den Gesamtbetrag stattdessen nach einem
   * Schluessel verteilt, weist Beitraege dort aus, wo keine anfallen — beim
   * Ruerup zum Beispiel, der in der KVdR beitragsfrei ist.
   */
  jeQuelle: { id: string; kv: number; pv: number }[];
}

/** Pflegeversicherungssatz des Mitglieds unter Beruecksichtigung der Kinder. */
export function pvSatzMitglied(k: KinderStatus, p: LegalParameters): number {
  if (!k.hatKinder) return p.pv.satz + p.pv.kinderloseZuschlag;
  // Ab dem 2. bis zum 5. Kind je 0,25 Punkte Abschlag, solange unter 25 Jahre.
  const abschlaege = Math.min(Math.max(0, k.kinderUnter25 - 1), p.pv.maxKinderAbschlaege);
  return Math.max(0, p.pv.satz - abschlaege * p.pv.abschlagJeKind);
}

/**
 * Mindestbemessungsgrundlage freiwillig Versicherter, monatlich
 * (§ 240 Abs. 4 SGB V: ein Neunzigstel der monatlichen Bezugsgroesse je
 * Kalendertag, also ein Drittel im Monat).
 *
 * Herausgezogen, weil sie an zwei Stellen gilt: im Ruhestand und bei einem
 * freiwillig versicherten Selbststaendigen in der Erwerbsphase. Zweimal
 * geschrieben waere sie zweimal zu pflegen.
 */
export function mindestbemessungMonat(p: LegalParameters): number {
  return p.bezugsgroesseMonat / 3;
}

/**
 * Einkommensgrenze der beitragsfreien Familienversicherung, monatlich
 * (§ 10 Abs. 1 S. 1 Nr. 5 SGB V: ein Siebtel der monatlichen Bezugsgroesse).
 *
 * Abgeleitet und nicht als eigener Rechtsstandswert gefuehrt — aus demselben
 * Grund wie die Mindestbemessung: Die Bezugsgroesse wird bei der
 * Fortschreibung bereits indexiert, eine Ableitung waechst kostenlos mit und
 * kann nicht davon wegdriften.
 */
export function familienversicherungsgrenzeMonat(p: LegalParameters): number {
  return p.bezugsgroesseMonat / 7;
}

/** Voller allgemeiner KV-Satz inkl. Zusatzbeitrag. */
export function kvSatzVoll(p: LegalParameters): number {
  return p.kv.allgemeinerSatz + p.kv.zusatzbeitrag;
}

/**
 * Freibetrag auf Versorgungsbezuege in der KV: 1/20 der monatlichen
 * Bezugsgroesse (§ 226 Abs. 2 SGB V).
 *
 * Wichtig und im Prototyp bereits richtig erkannt: In der PFLEGEversicherung
 * wirkt derselbe Betrag als FREIGRENZE, nicht als Freibetrag — wird sie
 * ueberschritten, ist der volle Bezug beitragspflichtig.
 */
export function bavFreibetragMonat(p: LegalParameters): number {
  return p.bezugsgroesseMonat / 20;
}

/**
 * Berechnet KV/PV im Alter.
 *
 * Die Beitragsbemessungsgrenze wird auf die Einkunftsarten in einer FESTEN
 * fachlichen Rangfolge verteilt (gesetzliche Rente, dann Versorgungsbezuege,
 * dann Sonstiges) — nicht in der zufaelligen Eingabereihenfolge des Nutzers.
 * Im Prototyp veraenderte das Umsortieren der Vertragsliste das Ergebnis
 * (Befund C7).
 *
 * GERECHNET WIRD JE MITGLIED, nicht je Haushalt und nicht je Vertrag.
 * Beitragsbemessungsgrenze, Freibetrag und Mindestbemessung stehen jeder
 * Person einmal zu. Beides war vorher falsch: Der Freibetrag ging von jedem
 * Versorgungsbezug einzeln ab — wer vier Betriebsrenten knapp unter der
 * Grenze hatte, zahlte im Rechner gar nichts, obwohl die Kasse auf die
 * Summe abrechnet. Und Ehepaare teilten sich EINEN Topf aus zwei Grenzen,
 * aus dem einer allein schoepfen konnte.
 */
export function kvPvImAlter(
  status: KvStatus,
  einkuenfte: readonly Beitragspflichtig[],
  kinder: KinderStatus,
  p: LegalParameters,
  opts: {
    pkvPraemieMonat?: number;
    pkvBasisanteil?: number;
    /**
     * Weitere PKV-Beitraege, die NICHT zur Krankheitskostenversicherung
     * gehoeren — heute der Beitrag zum Beitragsentlastungstarif, soweit er
     * im Ruhestand weiterlaeuft.
     *
     * Getrennt gefuehrt, weil sie den Zuschuss nach § 106 SGB VI nicht
     * erhoehen duerfen: Der bemisst sich am Krankenversicherungsbeitrag und
     * ist auf dessen Haelfte gedeckelt. Sie werden deshalb ERST NACH der
     * Deckelung aufgeschlagen — abfliessen tun sie trotzdem.
     */
    pkvWeitereBeitraegeMonat?: number;
    /**
     * Ob die Personen miteinander verheiratet sind.
     *
     * Entscheidet ueber die beitragsfreie Familienversicherung des
     * § 10 SGB V — ohne Ehe gibt es sie zwischen Erwachsenen nicht.
     *
     * Vorgabe `false`: Der Einpersonenfall ist der haeufigere Aufruf, und
     * jede bestehende Rechnung bleibt damit unveraendert.
     */
    verheiratet?: boolean;
  } = {},
): KvPvErgebnis {
  const bbgMonat = p.bbgKvJahr / 12;
  const kvVoll = kvSatzVoll(p);
  const kvHalb = kvVoll / 2;
  const pvSatz = pvSatzMitglied(kinder, p);
  const freibetrag = bavFreibetragMonat(p);

  const rang: Record<BeitragsArt, number> = { gesetzlicheRente: 0, versorgungsbezug: 1, sonstiges: 2 };
  const sortiert = [...einkuenfte].sort((a, b) => rang[a.art] - rang[b.art]);

  /*
    Nach Mitglied gruppieren, die Rangfolge innerhalb der Gruppe erhalten.
    Ohne Angabe gehoert alles einem gedachten Mitglied — der Einpersonenfall.
  */
  const gruppen = new Map<string, Beitragspflichtig[]>();
  for (const e of sortiert) {
    const schluessel = e.person ?? '';
    const liste = gruppen.get(schluessel);
    if (liste) liste.push(e);
    else gruppen.set(schluessel, [e]);
  }
  // Ohne jede Einkunft bleibt EIN Mitglied uebrig: Ein freiwillig
  // Versicherter zahlt auch dann den Mindestbeitrag.
  if (gruppen.size === 0) gruppen.set('', []);

  /*
    FAMILIENVERSICHERUNG (§ 10 SGB V) — beitragsfrei mitversichert.

    Ohne sie bekam ein Ehegatte OHNE eigene Rente einen eigenen
    Mindestbeitrag aufgebuerdet (§ 240 Abs. 4 SGB V, rund 286 EUR im Monat
    2026). In der Zeitachse steht diesem Beitrag keine Einkunft gegenueber,
    er erschien deshalb als NEGATIVE Rente dieser Person — ein Minusbetrag,
    der im Haushaltsnetto landete. Rechtlich existiert er nicht: Wer als
    Ehegatte eines Mitglieds hoechstens ein Siebtel der Bezugsgroesse an
    Gesamteinkommen hat, zahlt weder KV- noch PV-Beitraege (§ 25 SGB XI
    fuer die Pflegeversicherung).

    Geprueft wird ausschliesslich das Einkommen. Ob im Einzelfall statt der
    Mitversicherung eine eigene Versicherungspflicht als Rentner besteht
    (§ 5 Abs. 1 Nr. 11 SGB V), haengt an der Vorversicherungszeit — neun
    Zehntel der zweiten Haelfte des Erwerbslebens. Die laesst sich aus den
    erfassten Daten nicht ableiten, und sie zu raten waere schlechter, als
    dem Wortlaut der Einkommensgrenze zu folgen.

    In der PKV gibt es keine beitragsfreie Mitversicherung — dort hat jeder
    Kopf seine eigene Praemie. Die Pruefung steht deshalb VOR dem
    PKV-Zweig und wirkt nur auf die gesetzlichen Faelle.
  */
  if (status !== 'pkv' && opts.verheiratet && gruppen.size > 1) {
    const grenze = familienversicherungsgrenzeMonat(p);
    const einkommen = (eigene: Beitragspflichtig[]) =>
      eigene.reduce((s, e) => s + Math.max(0, e.monatsbetrag), 0);

    const mitversichert = [...gruppen.entries()]
      .filter(([, eigene]) => einkommen(eigene) <= grenze)
      .map(([schluessel]) => schluessel);

    /*
      Mitversichert sein kann nur, wer bei jemandem mitversichert IST.
      Liegen alle unter der Grenze, bleibt die einkommensstaerkste Gruppe
      Mitglied — sonst zahlte ein Haushalt ohne jede Einkunft gar nichts,
      und die Mindestbemessung, die es genau dafuer gibt, liefe ins Leere.
    */
    if (mitversichert.length === gruppen.size) {
      const staerkste = [...gruppen.entries()]
        .sort((a, b) => einkommen(b[1]) - einkommen(a[1]))[0]?.[0];
      const i = mitversichert.indexOf(staerkste ?? '');
      if (i >= 0) mitversichert.splice(i, 1);
    }

    for (const schluessel of mitversichert) gruppen.delete(schluessel);
  }

  let kv = 0;
  let pv = 0;
  const jeQuelle: { id: string; kv: number; pv: number }[] = [];
  /** Beitrag buchen und zugleich der Quelle zuordnen. */
  const buche = (id: string, kvBetrag: number, pvBetrag: number) => {
    kv += kvBetrag;
    pv += pvBetrag;
    const vorhanden = jeQuelle.find((x) => x.id === id);
    if (vorhanden) { vorhanden.kv += kvBetrag; vorhanden.pv += pvBetrag; }
    else jeQuelle.push({ id, kv: kvBetrag, pv: pvBetrag });
  };

  if (status === 'pkv') {
    // Zuschuss des Rentenversicherungstraegers: halber allgemeiner Satz ZZGL.
    // des halben durchschnittlichen Zusatzbeitrags (§ 106 Abs. 2 SGB VI in der
    // Fassung seit dem GKV-Versichertenentlastungsgesetz 2019), begrenzt auf
    // die Haelfte der Praemie. Ohne den Zusatzbeitrag fiel der Zuschuss 2026
    // um 1,45 % der Rente zu niedrig aus — bei 2.000 EUR Rente rund 29 EUR.
    const praemie = opts.pkvPraemieMonat ?? 0;
    // Die Grenze wirkt JE RENTNER: Zwei Renten von je 2.000 EUR bleiben
    // beide voll bemessen, eine einzelne von 4.000 EUR nicht.
    const bemessung = [...gruppen.values()].reduce((summe, eigene) => {
      const rentenSumme = eigene
        .filter((e) => e.art === 'gesetzlicheRente')
        .reduce((s, e) => s + e.monatsbetrag, 0);
      return summe + Math.min(rentenSumme, bbgMonat);
    }, 0);
    const zuschuss = Math.min(bemessung * (kvVoll / 2), praemie / 2);
    // Der Entlastungstarif kommt NACH der Deckelung dazu: Er ist Aufwand,
    // aber keine Bemessungsgrundlage fuer den Zuschuss.
    const weitere = Math.max(0, opts.pkvWeitereBeitraegeMonat ?? 0);
    kv = Math.max(0, praemie - zuschuss) + weitere;
    pv = 0; // in der Praemie enthalten
    const basisanteil = opts.pkvBasisanteil ?? PKV_BASISANTEIL;
    /*
      Die Praemie haengt an keiner einzelnen Einkunft; sie wird deshalb der
      GROESSTEN gesetzlichen Rente zugeordnet — aus ihr wird der Zuschuss
      nach § 106 SGB VI tatsaechlich mit ausgezahlt.

      Vorher stand hier die ERSTE Rente der Rangfolge. Hatte ein Ehepaar
      eine Pension bei A (Rang 1) und eine Rente von 0 EUR bei B (Rang 0),
      landete die volle Haushaltspraemie auf einem Posten ohne Brutto — als
      negative Rente von mehreren hundert Euro. Nullbetraege scheiden jetzt
      aus; gibt es gar keine gesetzliche Rente, traegt sie die groesste
      Einkunft ueberhaupt.
    */
    const groesste = (xs: readonly Beitragspflichtig[]) =>
      xs.filter((e) => e.monatsbetrag > 0)
        .sort((a, b) => b.monatsbetrag - a.monatsbetrag)[0]?.id;
    const traeger = groesste(sortiert.filter((e) => e.art === 'gesetzlicheRente'))
      ?? groesste(sortiert);
    return {
      kv, pv, gesamt: kv,
      // Der Entlastungstarif ist ebenfalls Vorsorgeaufwand — mit demselben
      // Basisanteil, mit dem ihn schon der PKV-Rechner ansetzt.
      abzugsfaehig: (praemie + weitere) * basisanteil,
      jeQuelle: traeger ? [{ id: traeger, kv, pv: 0 }] : [],
    };
  }

  for (const eigene of gruppen.values()) {
    let restBbg = bbgMonat;

    /*
      Versorgungsbezuege werden GESAMMELT und erst danach abgerechnet.
      Freibetrag und Freigrenze des § 226 Abs. 2 SGB V gelten fuer ihre
      SUMME, nicht fuer jeden Bezug einzeln — genau daran scheiterte die
      alte Fassung.
    */
    const versorgung: { id: string; anrechenbar: number }[] = [];

    for (const e of eigene) {
      const betrag = Math.max(0, e.monatsbetrag);
      if (betrag <= 0) continue;

      if (e.art === 'gesetzlicheRente') {
        const anrechenbar = Math.min(betrag, restBbg);
        restBbg -= anrechenbar;
        buche(e.id,
          anrechenbar * kvHalb,   // DRV traegt die andere Haelfte
          anrechenbar * pvSatz);  // PV traegt das Mitglied allein
        continue;
      }

      if (e.art === 'versorgungsbezug') {
        const anrechenbar = Math.min(betrag, restBbg);
        restBbg -= anrechenbar;
        versorgung.push({ id: e.id, anrechenbar });
        continue;
      }

      // Sonstige Einkuenfte: nur freiwillig Versicherte zahlen darauf Beitraege.
      // Fuer Pflichtversicherte in der KVdR sind Ruerup, private Renten und
      // Mieteinkuenfte beitragsfrei — hier faellt bewusst gar nichts an.
      if (status === 'freiwillig') {
        const anrechenbar = Math.min(betrag, restBbg);
        restBbg -= anrechenbar;
        buche(e.id, anrechenbar * kvVoll, anrechenbar * pvSatz);
      }
    }

    /*
      Die Summe der Versorgungsbezuege dieses Mitglieds:
        - bis zur Freigrenze beitragsfrei, in KV wie PV (§ 226 Abs. 2 S. 1);
        - darueber mindert der Freibetrag die KV-Bemessung (S. 2), waehrend
          die PV den VOLLEN Betrag traegt — dort ist es eine Freigrenze.

      Die Beitraege gehen anteilig an die einzelnen Bezuege zurueck. Das ist
      eine Verteilung und keine Rechnung; sie haelt nur die Zusicherung ein,
      dass `jeQuelle` in der Summe `gesamt` ergibt.
    */
    const summeVersorgung = versorgung.reduce((s, x) => s + x.anrechenbar, 0);
    const ueberFreigrenze = summeVersorgung > freibetrag;
    const kvVersorgung = ueberFreigrenze ? (summeVersorgung - freibetrag) * kvVoll : 0;
    const pvVersorgung = ueberFreigrenze ? summeVersorgung * pvSatz : 0;
    for (const x of versorgung) {
      const anteil = summeVersorgung > 0 ? x.anrechenbar / summeVersorgung : 0;
      buche(x.id, kvVersorgung * anteil, pvVersorgung * anteil);
    }

    // Freiwillig Versicherte zahlen mindestens auf die Mindestbemessungsgrundlage
    // (1/3 der monatlichen Bezugsgroesse, § 240 Abs. 4 SGB V). Fehlte im Prototyp.
    if (status === 'freiwillig') {
      const mindestBemessung = mindestbemessungMonat(p);
      const bemessen = bbgMonat - restBbg;
      if (bemessen < mindestBemessung) {
        const fehlend = mindestBemessung - bemessen;
        // Der Mindestbeitrag haengt an keiner Einkunft. Er wird der groessten
        // dieses Mitglieds zugeordnet, damit die Einzelbetraege aufgehen.
        const groesste = [...eigene].sort((a, b) => b.monatsbetrag - a.monatsbetrag)[0];
        if (groesste) buche(groesste.id, fehlend * kvVoll, fehlend * pvSatz);
        else { kv += fehlend * kvVoll; pv += fehlend * pvSatz; }
      }
    }
  }

  const gesamt = kv + pv;
  return { kv, pv, gesamt, abzugsfaehig: gesamt, jeQuelle };
}

/**
 * KV/PV in der Erwerbsphase (Arbeitnehmer-Anteil).
 * Der Prototyp rechnete mit 1,7 % bzw. 2,2 % PV-Anteil statt 1,8 % / 2,4 %
 * und kannte die saechsische Sonderregel nicht (Befund C5).
 */
export function kvPvArbeitnehmer(
  jahresbrutto: number,
  kinder: KinderStatus,
  p: LegalParameters,
  opts: { sachsen?: boolean } = {},
): { kv: number; pv: number; rv: number; av: number; gesamt: number; abzugsfaehig: number } {
  const bemessungKv = Math.min(jahresbrutto, p.bbgKvJahr);
  const bemessungRv = Math.min(jahresbrutto, p.bbgRvJahr);

  const kv = bemessungKv * (p.kv.allgemeinerSatz / 2 + p.kv.zusatzbeitrag / 2);

  // PV: Der Grundsatz wird paritaetisch getragen. Kinderlosenzuschlag UND
  // Kinderabschlaege wirken dagegen ausschliesslich auf den Mitgliedsanteil.
  // In Sachsen traegt der Arbeitnehmer zusaetzlich 0,5 Punkte.
  let pvAn = p.pv.satz / 2;
  if (kinder.hatKinder) {
    const abschlaege = Math.min(Math.max(0, kinder.kinderUnter25 - 1), p.pv.maxKinderAbschlaege);
    pvAn -= abschlaege * p.pv.abschlagJeKind;
  } else {
    pvAn += p.pv.kinderloseZuschlag;
  }
  if (opts.sachsen) pvAn += p.pv.arbeitnehmerAnteilSachsenAufschlag;
  const pv = bemessungKv * Math.max(0, pvAn);

  const rv = bemessungRv * (p.rvSatzGesamt / 2);
  const av = bemessungRv * (p.avSatzGesamt / 2);

  return {
    kv, pv, rv, av,
    gesamt: kv + pv + rv + av,
    // Abzugsfaehig als Vorsorgeaufwendungen: RV zu 100 % (§ 10 Abs. 1 Nr. 2),
    // KV/PV in Hoehe der Basisabsicherung. Die Arbeitslosenversicherung bringt
    // faktisch keinen Abzug, weil der Hoechstbetrag fuer sonstige
    // Vorsorgeaufwendungen bereits durch KV/PV ausgeschoepft ist — der Prototyp
    // zog sie dennoch ab und wies das Netto zu hoch aus.
    // Der auf das Krankengeld entfallende Anteil (4 %) ist nicht abzugsfaehig
    // (§ 10 Abs. 1 Nr. 3 Buchst. a S. 4 EStG).
    abzugsfaehig: rv + kv * 0.96 + pv,
  };
}
