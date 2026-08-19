import type { LegalParameters } from '../params/types.js';

export type KvStatus = 'kvdr' | 'freiwillig' | 'pkv';

/** Einkunftsarten mit unterschiedlicher Beitragsbehandlung im Alter. */
export type BeitragsArt =
  | 'gesetzlicheRente'   // halber Satz, DRV traegt die andere Haelfte
  | 'versorgungsbezug'   // voller Satz, KV-Freibetrag / PV-Freigrenze
  | 'sonstiges';         // nur bei freiwillig Versicherten beitragspflichtig

export interface Beitragspflichtig {
  art: BeitragsArt;
  /** Monatsbetrag in EUR */
  monatsbetrag: number;
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
}

/** Pflegeversicherungssatz des Mitglieds unter Beruecksichtigung der Kinder. */
export function pvSatzMitglied(k: KinderStatus, p: LegalParameters): number {
  if (!k.hatKinder) return p.pv.satz + p.pv.kinderloseZuschlag;
  // Ab dem 2. bis zum 5. Kind je 0,25 Punkte Abschlag, solange unter 25 Jahre.
  const abschlaege = Math.min(Math.max(0, k.kinderUnter25 - 1), p.pv.maxKinderAbschlaege);
  return Math.max(0, p.pv.satz - abschlaege * p.pv.abschlagJeKind);
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
 */
export function kvPvImAlter(
  status: KvStatus,
  einkuenfte: readonly Beitragspflichtig[],
  kinder: KinderStatus,
  p: LegalParameters,
  opts: { pkvPraemieMonat?: number; pkvBasisanteil?: number; personen?: number } = {},
): KvPvErgebnis {
  const personen = opts.personen ?? 1;
  const bbgMonat = (p.bbgKvJahr / 12) * personen;
  const kvVoll = kvSatzVoll(p);
  const kvHalb = kvVoll / 2;
  const pvSatz = pvSatzMitglied(kinder, p);
  const freibetrag = bavFreibetragMonat(p);

  const rang: Record<BeitragsArt, number> = { gesetzlicheRente: 0, versorgungsbezug: 1, sonstiges: 2 };
  const sortiert = [...einkuenfte].sort((a, b) => rang[a.art] - rang[b.art]);

  let kv = 0;
  let pv = 0;
  let restBbg = bbgMonat;

  if (status === 'pkv') {
    // Zuschuss des Rentenversicherungstraegers: halber ALLGEMEINER Satz ohne
    // Zusatzbeitrag (§ 106 SGB VI), begrenzt auf die Haelfte der Praemie.
    const praemie = opts.pkvPraemieMonat ?? 0;
    const rentenSumme = sortiert
      .filter((e) => e.art === 'gesetzlicheRente')
      .reduce((s, e) => s + e.monatsbetrag, 0);
    const bemessung = Math.min(rentenSumme, bbgMonat);
    const zuschuss = Math.min(bemessung * (p.kv.allgemeinerSatz / 2), praemie / 2);
    kv = Math.max(0, praemie - zuschuss);
    pv = 0; // in der Praemie enthalten
    const basisanteil = opts.pkvBasisanteil ?? 0.8;
    return { kv, pv, gesamt: kv, abzugsfaehig: praemie * basisanteil };
  }

  for (const e of sortiert) {
    const betrag = Math.max(0, e.monatsbetrag);
    if (betrag <= 0) continue;

    if (e.art === 'gesetzlicheRente') {
      const anrechenbar = Math.min(betrag, restBbg);
      restBbg -= anrechenbar;
      kv += anrechenbar * kvHalb;   // DRV traegt die andere Haelfte
      pv += anrechenbar * pvSatz;   // PV traegt das Mitglied allein
      continue;
    }

    if (e.art === 'versorgungsbezug') {
      const anrechenbar = Math.min(betrag, restBbg);
      restBbg -= anrechenbar;
      // KV: Freibetrag mindert die Bemessungsgrundlage.
      kv += Math.max(0, anrechenbar - freibetrag) * kvVoll;
      // PV: Freigrenze — oberhalb ist der volle Betrag beitragspflichtig.
      pv += anrechenbar > freibetrag ? anrechenbar * pvSatz : 0;
      continue;
    }

    // Sonstige Einkuenfte: nur freiwillig Versicherte zahlen darauf Beitraege.
    if (status === 'freiwillig') {
      const anrechenbar = Math.min(betrag, restBbg);
      restBbg -= anrechenbar;
      kv += anrechenbar * kvVoll;
      pv += anrechenbar * pvSatz;
    }
  }

  // Freiwillig Versicherte zahlen mindestens auf die Mindestbemessungsgrundlage
  // (1/3 der monatlichen Bezugsgroesse, § 240 Abs. 4 SGB V). Fehlte im Prototyp.
  if (status === 'freiwillig') {
    const mindestBemessung = (p.bezugsgroesseMonat / 3) * personen;
    const bemessen = bbgMonat - restBbg;
    if (bemessen < mindestBemessung) {
      const fehlend = mindestBemessung - bemessen;
      kv += fehlend * kvVoll;
      pv += fehlend * pvSatz;
    }
  }

  const gesamt = kv + pv;
  return { kv, pv, gesamt, abzugsfaehig: gesamt };
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
