import {
  bavMitarbeiter, bavRahmenVoll, bruttoZuNetto, entnahmeplan, kennzahlen, parameterFuer, parseDatum, projiziere,
  renteOderKapital, schaetzeEntgeltpunkte, SV_FREI_QUOTE,
  type FirmenModell, type Kennzahlen, type KinderStatus, type LegalParameters, type MatchingSteuer, type MitarbeiterBav,
  type MitarbeiterEingaben, type MitarbeiterVertrag, type RenteOderKapital, type Vertrag,
} from '@renten/engine';
import type { BeratungAngaben, BeratungDaten, FirmenAngebot, VersichererWerte } from '@renten/schema';
import { leereAntworten, regelRentenbeginn, szenarioAusCheck } from '../check/uebernahme';
import { belastungsTreppe } from '../features/tuev-berechnung';
import type { SzenarioParsed } from '../store/szenario';

/**
 * Die Rechnung der Mitarbeiterberatung — ohne Oberflaeche.
 *
 * BEITRAGSSEITE: `bavMitarbeiter` aus dem Rechenkern, also dieselben
 * Funktionen wie auf den Arbeitgeber-Seiten. Mitarbeiter und Arbeitgeber
 * sehen dieselben Zahlen.
 *
 * LEISTUNGSSEITE: die Werte des Versicherers als Vertraege in einem Szenario
 * aus den Angaben, gerechnet von `projiziere` — genau wie die erfassten
 * Angebote im Loesungsvergleich (`angebotPositionen`). Steuer und Kranken-
 * versicherung im Alter haben damit keine zweite Fassung. Das Szenario baut
 * `szenarioAusCheck` (Vorsorge-Check): dieselbe Uebersetzung von Angaben in
 * ein Szenario, dieselben Vorgaben fuer alles, was nicht gefragt wird.
 */

/** Rechtsstand heute, ohne Fortschreibung — wie auf den Arbeitgeber-Seiten. */
export const P = parameterFuer(new Date().getFullYear(), { indexRate: 0 });
const JETZT = new Date().getFullYear();

/** Das Bundesland der Angaben, sonst das der Firma. */
export const bundeslandVon = (a: BeratungAngaben, f: FirmenAngebot) => a.bundesland || f.bundesland;

export function kinderStatus(a: BeratungAngaben): KinderStatus {
  return {
    hatKinder: a.kinder.length > 0,
    kinderUnter25: a.kinder.filter((k) => JETZT - k.geburtsjahr < 25).length,
  };
}

/**
 * Die Steuer des Mitarbeiters: die Lohnsteuer seiner Steuerklasse — wie auf
 * der Gehaltsabrechnung und im Angebot des Versicherers. Bei III und V
 * gleicht die Steuererklaerung das Jahr aus; das sagt die Fussnote.
 */
export function steuerVon(a: BeratungAngaben, f: FirmenAngebot): MatchingSteuer {
  return {
    verheiratet: a.steuerklasse === 3, bundesland: bundeslandVon(a, f), kirchensteuerpflichtig: a.kirchensteuer,
    steuerklasse: a.steuerklasse,
  };
}

/** Das Monatsgehalt: erfasst wird es, gespeichert das Jahr mit Sonderzahlungen. */
export const monatsgehalt = (a: BeratungAngaben) => a.jahresbrutto / (a.gehaelter > 0 ? a.gehaelter : 12);

/**
 * Das laufende Gehalt aufs Jahr: zwoelf Monatsgehaelter, ohne Weihnachts- und
 * Urlaubsgeld. Damit rechnet der Monat — Probeabrechnung, Umwandlung, Regler —
 * wie die Lohnsteuer auf der Abrechnung. Rente und Versorgungsluecke rechnen
 * mit dem ganzen Jahr (`jahresbrutto`).
 */
export const laufendesJahresbrutto = (a: BeratungAngaben) =>
  (a.gehaelter === 12 ? a.jahresbrutto : monatsgehalt(a) * 12);

export function eingabenVon(a: BeratungAngaben, umwandlungMonat: number): MitarbeiterEingaben {
  return {
    jahresbrutto: laufendesJahresbrutto(a),
    umwandlungMonat,
    privatVersichert: a.kv === 'privat',
    pkvPraemieMonat: a.pkvPraemieMonat,
    kinder: kinderStatus(a),
    bavBestandMonat: a.bavBestandMonat,
  };
}

/** Schritt 4: was die Umwandlung kostet und was in den Vertrag fliesst. */
export function beitragsRechnung(f: FirmenAngebot, d: BeratungDaten, p: LegalParameters = P): MitarbeiterBav {
  return bavMitarbeiter(f.modell as FirmenModell, eingabenVon(d.angaben, d.umwandlungMonat), steuerVon(d.angaben, f), p);
}

/** „Rahmen voll nutzen“: die Umwandlung, mit der der beitragsfreie Rahmen genau voll ist. */
export function rahmenVoll(f: FirmenAngebot, a: BeratungAngaben, p: LegalParameters = P): number {
  return bavRahmenVoll(f.modell as FirmenModell, eingabenVon(a, 0), bundeslandVon(a, f), p);
}

/** Rentenbeginn als TT.MM.JJJJ: der eingetragene oder die Regelaltersgrenze. Null ohne Geburtsdatum. */
export function rentenbeginnVon(a: BeratungAngaben): string | null {
  return parseDatum(a.rentenbeginn) ? a.rentenbeginn : regelRentenbeginn(a.geburtsdatum);
}

/** Ein Monat als fortlaufende Zahl — dann ist „Monate dazwischen“ eine Subtraktion. */
const monatsIndex = (x: { jahr: number; monat: number }) => x.jahr * 12 + (x.monat - 1);

/**
 * Der Beginn, wenn in der Beratung keiner eingetragen ist: laut Angebot der
 * Firma, sonst der naechste Monatserste — als TT.MM.JJJJ. So steht er
 * vorbelegt im Feld; bleibt er unveraendert, gilt er.
 */
export function automatischerBeginn(f: FirmenAngebot, heute = new Date()): string {
  if (parseDatum(f.beginn)) return f.beginn;
  const naechster = heute.getMonth() + 2;
  const [jahr, monat] = naechster > 12 ? [heute.getFullYear() + 1, 1] : [heute.getFullYear(), naechster];
  return `01.${String(monat).padStart(2, '0')}.${jahr}`;
}

/** Der Beginn als TT.MM.JJJJ: der eingetragene, sonst der automatische. */
export function beginnDatum(d: BeratungDaten, f: FirmenAngebot, heute = new Date()): string {
  return parseDatum(d.entscheidung.beginn) ? d.entscheidung.beginn : automatischerBeginn(f, heute);
}

/**
 * Der erste Monat der Umwandlung: laut Entscheidung, sonst laut Angebot der
 * Firma, sonst der naechste Monatserste.
 */
export function beginnVon(d: BeratungDaten, f: FirmenAngebot, heute = new Date()): { jahr: number; monat: number } {
  const x = parseDatum(beginnDatum(d, f, heute))!;
  return { jahr: x.jahr, monat: x.monat };
}

/**
 * Wie viele Monate umgewandelt wird: vom Beginn bis vor den Rentenbeginn.
 * Beginn 01.01.2027 und Rentenbeginn 01.04.2052 sind 303 Monate. Ohne
 * Geburtsdatum null.
 */
export function monateDerUmwandlung(d: BeratungDaten, f: FirmenAngebot, heute = new Date()): number {
  const r = parseDatum(rentenbeginnVon(d.angaben));
  return r ? Math.max(0, monatsIndex(r) - monatsIndex(beginnVon(d, f, heute))) : 0;
}

/**
 * Die gesetzliche Rente in heutiger Kaufkraft: laut Renteninformation, sonst
 * aus dem Gehalt geschaetzt (`schaetzeEntgeltpunkte`) — und dann so
 * gekennzeichnet.
 */
export function grvVon(
  brutto: number, grvRente: number, geburtsdatum: string, rentenbeginn: string | null, p: LegalParameters = P,
): { monat: number; geschaetzt: boolean } {
  if (grvRente > 0) return { monat: grvRente, geschaetzt: false };
  const g = parseDatum(geburtsdatum);
  const r = parseDatum(rentenbeginn);
  if (!g || !r || brutto <= 0) return { monat: 0, geschaetzt: true };
  const s = schaetzeEntgeltpunkte(brutto, JETZT - g.jahr, r.jahr - g.jahr, p);
  return { monat: Math.round(s.monatsrenteHeutigeKaufkraft * 100) / 100, geschaetzt: true };
}

/**
 * Angenommene Rentenanpassung im Jahr — in der Mitarbeiterberatung 1,5 %
 * statt der 1 % des Vorsorge-Checks. Gilt fuer das ganze Szenario der
 * Beratung, also fuer die Versorgungsluecke und die Leistung im Alter gleich.
 */
export const RENTENANPASSUNG = 0.015;

/**
 * Das Szenario des Mitarbeiters — ueber `szenarioAusCheck`, wie beim
 * Vorsorge-Check, mit der Rentenanpassung der Beratung. Die Steuer im Alter
 * folgt der Steuerklasse: bei III im Splittingtarif mit einem Partner ohne
 * eigenes Einkommen und ohne eigene Rente, sonst im Grundtarif — das
 * Einkommen des Partners fragt die Beratung nicht. Fuer Steuer und
 * Krankenversicherung im Alter reicht das.
 */
export function szenarioAusBeratung(a: BeratungAngaben, f: FirmenAngebot, grvMonatA: number): SzenarioParsed {
  const x = leereAntworten();
  x.a = {
    ...x.a,
    name: a.name,
    geburtsdatum: a.geburtsdatum,
    rentenbeginn: a.rentenbeginn,
    einkommen: { ...x.a.einkommen, modus: 'brutto', betrag: a.jahresbrutto / 12, auszahlungen: 12 },
    grvRente: grvMonatA,
  };
  x.verheiratet = a.steuerklasse === 3;
  if (x.verheiratet) {
    x.b = {
      ...x.b,
      geburtsdatum: a.geburtsdatum,
      einkommen: { ...x.b.einkommen, modus: 'brutto', betrag: 0, auszahlungen: 12 },
      grvRente: 0,
    };
  }
  x.bundesland = bundeslandVon(a, f);
  x.kirchensteuer = a.kirchensteuer;
  x.kinder = a.kinder;
  x.kv = a.kv;
  x.krankenkasse = a.krankenkasse;
  x.zusatzbeitrag = a.zusatzbeitrag;
  x.pkv = { ...x.pkv, praemieMonat: a.pkvPraemieMonat };
  const s = szenarioAusCheck(x);
  return { ...s, annahmen: { ...s.annahmen, rentendynamik: RENTENANPASSUNG } };
}

/**
 * Das Szenario des Mitarbeiters OHNE neuen Vertrag und seine Projektion —
 * fuer die Versorgungsluecke und als Vergleich fuer die Leistung im Alter.
 */
export function basisProjektion(a: BeratungAngaben, f: FirmenAngebot, p: LegalParameters = P) {
  const grv = grvVon(a.jahresbrutto, a.grvRente, a.geburtsdatum, rentenbeginnVon(a), p);
  const szenario = szenarioAusBeratung(a, f, grv.monat);
  const projektion = projiziere(szenario);
  const zeile = projektion.zeilen.find((z) => z.jahr === projektion.ruhestandsjahr) ?? null;
  return { grv, szenario, projektion, zeile };
}

export interface AuszahlungsWerte {
  bruttoMonat: number;
  kvPvMonat: number;
  steuerMonat: number;
  nettoMonat: number;
}

export interface KapitalWerte {
  brutto: number;
  steuer: number;
  kvPv: number;
  netto: number;
}

export interface VertragsLeistung {
  weg: MitarbeiterVertrag['weg'];
  garantiert: AuszahlungsWerte | null;
  prognose: AuszahlungsWerte | null;
  kapital: KapitalWerte | null;
  /** Ab welchem Alter die prognostizierte Rente das Kapital einholt */
  breakEven: RenteOderKapital | null;
}

export interface Leistung {
  vertraege: VertragsLeistung[];
  rentenbeginnJahr: number;
  alterBeiRentenbeginn: number;
  /** Teuerung bis zum ersten Rentenjahr — teilt man durch ihn, steht es in heutiger Kaufkraft */
  kaufkraftfaktor: number;
}

const TYP: Record<MitarbeiterVertrag['weg'], Vertrag['typ']> = { direkt: 'bav', ukasse: 'bavUkasse' };
const NAME: Record<MitarbeiterVertrag['weg'], string> = { direkt: 'Betriebsrente', ukasse: 'Unterstützungskasse' };
const leer = (w: VersichererWerte) => w.garantierteRente <= 0 && w.prognoseRente <= 0 && w.prognoseKapital <= 0;

/**
 * Schritt 5: die Werte des Versicherers nach Steuer und Krankenversicherung im
 * ersten Rentenjahr — garantiert und prognostiziert, dazu das Kapital.
 *
 * Wie `angebotPositionen`: Die Vertraege kommen zu einem Klon des Szenarios,
 * `projiziere` rechnet. Die gesetzliche Rente bleibt dabei, wie sie ist —
 * eine Minderung durch die Umwandlung rechnet die Beratung nicht ein.
 */
export function leistungsRechnung(
  f: FirmenAngebot, d: BeratungDaten, r: MitarbeiterBav, p: LegalParameters = P,
): Leistung | null {
  const a = d.angaben;
  const rentenbeginn = rentenbeginnVon(a);
  const g = parseDatum(a.geburtsdatum);
  const rb = parseDatum(rentenbeginn);
  if (!g || !rb) return null;
  const vertraege = r.vertraege.filter((v) => !leer(d.versicherer[v.weg]));
  const b = basisProjektion(a, f, p);
  const basis = b.szenario;
  const beginnJahr = beginnVon(d, f).jahr;

  const mit = (strategie: Vertrag['strategie'], rente: (w: VersichererWerte) => number) => {
    const neu: Vertrag[] = vertraege.map((v) => {
      const w = d.versicherer[v.weg];
      return {
        id: `bav-${v.weg}`, inhaber: 'A', schicht: 2, typ: TYP[v.weg], name: NAME[v.weg],
        brutto: rente(w), strategie, altvertrag: false,
        kapitalAlternative: w.prognoseKapital > 0 ? w.prognoseKapital : undefined,
        beginnJahr, monatsbeitrag: w.beitragMonat > 0 ? w.beitragMonat : v.beitragMonat, dynamik: w.dynamik,
      };
    });
    return projiziere({ ...basis, vertraege: [...basis.vertraege, ...neu] });
  };

  const ohne = b.projektion;
  const jahr = ohne.ruhestandsjahr;
  const zeileOhne = ohne.zeilen.find((z) => z.jahr === jahr);
  const mitPrognose = vertraege.some((v) => d.versicherer[v.weg].prognoseRente > 0)
    ? mit('rente', (w) => w.prognoseRente) : null;
  const mitGarantie = vertraege.some((v) => d.versicherer[v.weg].garantierteRente > 0)
    ? mit('rente', (w) => w.garantierteRente) : null;
  const mitKapital = vertraege.some((v) => d.versicherer[v.weg].prognoseKapital > 0)
    ? mit('kapital', (w) => w.prognoseRente) : null;

  const posten = (e: ReturnType<typeof projiziere> | null, id: string): AuszahlungsWerte | null => {
    const x = e?.zeilen.find((z) => z.jahr === e.ruhestandsjahr)?.posten.find((y) => y.id === id);
    return x && x.bruttoJahr > 0
      ? { bruttoMonat: x.bruttoJahr / 12, kvPvMonat: x.kvPvJahr / 12, steuerMonat: x.steuerJahr / 12, nettoMonat: x.nettoJahr / 12 }
      : null;
  };
  const alterBeiRentenbeginn = rb.jahr - g.jahr;

  const ergebnis = vertraege.map((v): VertragsLeistung => {
    const id = `bav-${v.weg}`;
    const prognose = d.versicherer[v.weg].prognoseRente > 0 ? posten(mitPrognose, id) : null;
    const garantiert = d.versicherer[v.weg].garantierteRente > 0 ? posten(mitGarantie, id) : null;
    const k = d.versicherer[v.weg].prognoseKapital > 0 ? mitKapital?.kapitalauszahlungen.find((x) => x.vertragId === id) : undefined;
    const kapital = k ? { brutto: k.bruttoKapital, steuer: k.steuer, kvPv: k.kvPvGesamt, netto: k.nettoKapital } : null;
    const breakEven = prognose && kapital && prognose.nettoMonat > 0 && kapital.netto > 0
      ? renteOderKapital(prognose.nettoMonat, kapital.netto, alterBeiRentenbeginn)
      : null;
    return { weg: v.weg, garantiert, prognose, kapital, breakEven };
  });

  return {
    vertraege: ergebnis,
    rentenbeginnJahr: jahr,
    alterBeiRentenbeginn,
    kaufkraftfaktor: zeileOhne?.kaufkraftfaktor ?? 1,
  };
}

/* --------------------------------------------------------------------------
 * VERSORGUNGSLUECKE — der Nettolohn heute gegen die gesetzliche Rente netto,
 * beides in heutiger Kaufkraft.
 * ------------------------------------------------------------------------ */

/** Lohn heute, im Monat: Lohnsteuer samt Zuschlaegen, Sozialabgaben, Netto. */
export interface Lohn {
  bruttoMonat: number;
  steuernMonat: number;
  svMonat: number;
  nettoMonat: number;
  /** Zu versteuerndes Einkommen im Jahr — fuer die Erklaerung der Steuerersparnis */
  zveJahr: number;
  /** Splittingtarif: Steuerklasse III */
  splitting: boolean;
}

/**
 * Der Nettolohn des Mitarbeiters heute — `bruttoZuNetto` mit der Lohnsteuer
 * seiner Steuerklasse, mit denselben Angaben wie die Modelle.
 *
 * `monat`: ein gewoehnlicher Monat wie auf der Abrechnung — zwoelf
 * Monatsgehaelter aufs Jahr (`laufendesJahresbrutto`). `jahr`: das ganze
 * Jahr mit Weihnachts- und Urlaubsgeld, im Monatsdurchschnitt — fuer die
 * Versorgungsluecke, deren Rente aus demselben Jahr geschaetzt ist.
 */
export function nettolohnHeute(a: BeratungAngaben, f: FirmenAngebot, p: LegalParameters = P, basis: 'monat' | 'jahr' = 'monat'): Lohn {
  const n = bruttoZuNetto(Math.max(0, basis === 'monat' ? laufendesJahresbrutto(a) : a.jahresbrutto), {
    verheiratet: a.steuerklasse === 3,
    steuerklasse: a.steuerklasse,
    bundesland: bundeslandVon(a, f),
    kirchensteuerpflichtig: a.kirchensteuer,
    kinder: kinderStatus(a),
    privatVersichert: a.kv === 'privat',
    pkvPraemieMonat: a.kv === 'privat' ? a.pkvPraemieMonat : 0,
  }, p);
  return {
    bruttoMonat: n.monatsbrutto,
    steuernMonat: (n.est + n.soli + n.kirchensteuer) / 12,
    svMonat: n.sv / 12,
    nettoMonat: n.monatsnetto,
    zveJahr: n.zve,
    splitting: a.steuerklasse === 3,
  };
}

export interface Versorgungsluecke {
  lohn: Lohn;
  /** Gesetzliche Rente nach heutigem Stand — eingetragen oder geschaetzt */
  grv: { monat: number; geschaetzt: boolean };
  /** Die gesetzliche Rente im ersten Rentenjahr, in heutiger Kaufkraft */
  rente: AuszahlungsWerte;
  lueckeMonat: number;
  /** Netto-Rente / Nettolohn */
  anteil: number;
  /** Was fehlt, in ganzen Prozent des Nettolohns; mit `renteProzent` zusammen 100 */
  lueckeProzent: number;
  /** Was die Rente ersetzt, in ganzen Prozent des Nettolohns */
  renteProzent: number;
  rentenbeginn: string;
  rentenbeginnJahr: number;
  alterBeiRentenbeginn: number;
  inflation: number;
  rentenanpassung: number;
}

/**
 * Was von der gesetzlichen Rente netto bleibt, gegen den Nettolohn heute.
 *
 * Die Rente kommt aus der Projektion (Posten `person-A` im ersten
 * Rentenjahr): mit Rentenanpassung bis dahin, nach Kranken- und
 * Pflegeversicherung und Steuer — und geteilt durch die Teuerung, also in
 * heutiger Kaufkraft. Ohne Geburtsdatum oder Gehalt null.
 */
export function versorgungslueckeRechnung(f: FirmenAngebot, d: BeratungDaten, p: LegalParameters = P): Versorgungsluecke | null {
  const a = d.angaben;
  const rentenbeginn = rentenbeginnVon(a);
  const g = parseDatum(a.geburtsdatum);
  const rb = parseDatum(rentenbeginn);
  if (!g || !rb || !rentenbeginn || a.jahresbrutto <= 0) return null;
  const b = basisProjektion(a, f, p);
  const posten = b.zeile?.posten.find((x) => x.id === 'person-A');
  if (!b.zeile || !posten) return null;
  const kk = b.zeile.kaufkraftfaktor > 0 ? b.zeile.kaufkraftfaktor : 1;
  const rente: AuszahlungsWerte = {
    bruttoMonat: posten.bruttoJahr / 12 / kk,
    kvPvMonat: posten.kvPvJahr / 12 / kk,
    steuerMonat: posten.steuerJahr / 12 / kk,
    nettoMonat: posten.nettoJahr / 12 / kk,
  };
  // Das ganze Jahr wie die Rente, die daraus geschaetzt ist — mit Sonderzahlungen
  const lohn = nettolohnHeute(a, f, p, 'jahr');
  const lueckeMonat = Math.max(0, lohn.nettoMonat - rente.nettoMonat);
  const anteil = lohn.nettoMonat > 0 ? rente.nettoMonat / lohn.nettoMonat : 0;
  // Ganze Prozent, die sich zu 100 ergaenzen: die Luecke als Rest der gerundeten Rente
  const renteProzent = Math.round(anteil * 100);
  return {
    lohn,
    grv: b.grv,
    rente,
    lueckeMonat,
    anteil,
    lueckeProzent: lueckeMonat >= 0.5 ? Math.max(0, 100 - renteProzent) : 0,
    renteProzent,
    rentenbeginn,
    rentenbeginnJahr: b.zeile.jahr,
    alterBeiRentenbeginn: rb.jahr - g.jahr,
    inflation: b.szenario.annahmen.inflation,
    rentenanpassung: b.szenario.annahmen.rentendynamik,
  };
}

/* --------------------------------------------------------------------------
 * NETTO-REGLER — der Mitarbeiter waehlt, was er netto aufwenden will; die
 * Umwandlung (brutto) ergibt sich daraus. Gespeichert wird weiter die
 * Umwandlung: Sie steht in der Vereinbarung.
 * ------------------------------------------------------------------------ */

const nettoBei = (f: FirmenAngebot, d: BeratungDaten, u: number, p: LegalParameters) =>
  beitragsRechnung(f, { ...d, umwandlungMonat: u }, p).nettoAufwandMonat;

export interface ReglerGrenzen {
  /**
   * Hoechstens so viel Umwandlung: bis der Rahmen voll ist, der frei von
   * Sozialabgaben bleibt — 4 % der BBG, Beitraege des Arbeitgebers in den
   * Vertrag zaehlen mit (`rahmenVoll`, wie „Rahmen voll“ auf den
   * Arbeitgeber-Seiten). Darueber fielen auf die Umwandlung Sozialabgaben an;
   * fuer den Mitarbeiter lohnt sie sich dann kaum.
   */
  maxUmwandlung: number;
  /** Der Netto-Aufwand dafuer */
  maxNetto: number;
  /** Der Rahmen im Monat: 4 % der BBG */
  rahmenMonat: number;
}

export function reglerGrenzen(f: FirmenAngebot, d: BeratungDaten, p: LegalParameters = P): ReglerGrenzen {
  const maxUmwandlung = rahmenVoll(f, d.angaben, p);
  return {
    maxUmwandlung,
    maxNetto: nettoBei(f, d, maxUmwandlung, p),
    rahmenMonat: (SV_FREI_QUOTE * p.bbgRvJahr) / 12,
  };
}

/**
 * Die Umwandlung, die netto genau `netto` kostet — Bisektion wie `suche` im
 * Loesungsvergleich: Der Netto-Aufwand steigt mit der Umwandlung. Auf Cent,
 * hoechstens bis `max`, dem vollen Rahmen.
 */
export function umwandlungFuerNetto(
  f: FirmenAngebot, d: BeratungDaten, netto: number, p: LegalParameters = P, max = rahmenVoll(f, d.angaben, p),
): number {
  if (netto <= 0 || max <= 0) return 0;
  if (nettoBei(f, d, max, p) <= netto) return max;
  let tief = 0;
  let hoch = max;
  for (let i = 0; i < 30 && hoch - tief > 0.001; i++) {
    const mitte = (tief + hoch) / 2;
    if (nettoBei(f, d, mitte, p) < netto) tief = mitte;
    else hoch = mitte;
  }
  return Math.round(hoch * 100) / 100;
}

/* --------------------------------------------------------------------------
 * PROBEABRECHNUNG — der Monat ohne und mit Betriebsrente.
 * ------------------------------------------------------------------------ */

export interface Probeabrechnung {
  bruttoMonat: number;
  umwandlungMonat: number;
  arbeitgeberMonat: number;
  steuerBrutto: { ohne: number; mit: number };
  svBrutto: { ohne: number; mit: number };
  steuern: { ohne: number; mit: number };
  sv: { ohne: number; mit: number };
  netto: { ohne: number; mit: number };
  /** = Netto ohne − Netto mit, genau der Netto-Aufwand der Rechnung */
  eigenbeteiligungMonat: number;
  gesamtMonat: number;
  /** Fuer die Fussnote: nach welcher Klasse die Lohnsteuer gerechnet ist */
  steuerklasse: BeratungAngaben['steuerklasse'];
}

/**
 * „Ohne“ ist der Nettolohn heute. „Mit“ zieht davon genau die Ersparnisse
 * der Rechnung ab — so ist die Netto-Differenz auf den Cent die
 * Eigenbeteiligung, und es gibt keine zweite Steuerrechnung.
 */
export function probeabrechnung(f: FirmenAngebot, d: BeratungDaten, r: MitarbeiterBav, p: LegalParameters = P): Probeabrechnung {
  const lohn = nettolohnHeute(d.angaben, f, p);
  const b = lohn.bruttoMonat;
  const u = r.umwandlungMonat;
  return {
    bruttoMonat: b,
    umwandlungMonat: u,
    arbeitgeberMonat: r.arbeitgeberMonat,
    steuerBrutto: { ohne: b, mit: b - (u - r.steuerpflichtigMonat) },
    svBrutto: { ohne: b, mit: b - (u - r.svPflichtigMonat) },
    steuern: { ohne: lohn.steuernMonat, mit: lohn.steuernMonat - r.steuerersparnisMonat },
    sv: { ohne: lohn.svMonat, mit: lohn.svMonat - r.svErsparnisMonat },
    netto: { ohne: lohn.nettoMonat, mit: lohn.nettoMonat - r.nettoAufwandMonat },
    eigenbeteiligungMonat: r.nettoAufwandMonat,
    gesamtMonat: r.gesamtMonat,
    steuerklasse: d.angaben.steuerklasse,
  };
}

export type BelastungsTreppe = ReturnType<typeof belastungsTreppe>;

/**
 * „Ihre Belastung“ — die Treppe des Vertrags-TUEV (`belastungsTreppe`) fuer den
 * Vertrag, in den die Umwandlung fliesst: mit dessen Beitrag und
 * Arbeitgeberanteil; die Ersparnisse gehoeren ganz zur Umwandlung. Null fuer
 * einen Vertrag, den nur der Arbeitgeber bezahlt (Matching:
 * Unterstuetzungskasse) — er kostet den Mitarbeiter nichts.
 */
export function belastungJeVertrag(
  v: MitarbeiterVertrag, r: MitarbeiterBav, a: BeratungAngaben, f: FirmenAngebot, p: LegalParameters = P,
): BelastungsTreppe | null {
  if (v.beitragMonat - v.arbeitgeberMonat <= 0.005) return null;
  const lohn = nettolohnHeute(a, f, p);
  return belastungsTreppe({
    zulageMonat: 0,
    agZuschussMonat: v.arbeitgeberMonat,
    beitragMonat: v.beitragMonat,
    svErsparnisMonat: r.svErsparnisMonat,
    steuerersparnisMonat: r.steuerersparnisMonat,
    echterAufwandMonat: r.nettoAufwandMonat,
  }, {
    zve: lohn.zveJahr, p, beamter: false, selbststaendig: false, privatVersichert: a.kv === 'privat', splitting: lohn.splitting,
    steuerklasse: a.steuerklasse,
  });
}

/* --------------------------------------------------------------------------
 * BEISPIELHAFTE HOCHRECHNUNG — mit der Rechnung des ETF-Depots im Rechner
 * (`etfVerlauf` in der Zeitachse): In der Ansparphase waechst das Geld mit der
 * Rendite minus den laufenden Kosten, der Ausgabeaufschlag geht von jedem
 * Beitrag ab. Ab Rentenbeginn verteilt `entnahmeplan` aus dem Rechenkern das
 * Kapital ueber die Entnahmedauer, mit der Rendite der Entnahmephase minus
 * den Kosten. Angespart wird monatsgenau, weil Beitraege und Laufzeit hier
 * monatsgenau sind; Steuern auf Ertraege (Vorabpauschale) gibt es in der bAV
 * nicht. Ein Beispiel — die Werte des Versicherers folgen.
 * ------------------------------------------------------------------------ */

/** Die Annahmen der Hochrechnung — benannt wie beim ETF-Depot am `Vertrag` */
export interface HochrechnungAnnahmen {
  renditeAnsparphase: number;
  renditeEntnahme: number;
  ausgabeaufschlag: number;
  ter: number;
  entnahmedauer: number;
}

/**
 * Was fest im Hintergrund rechnet. Abgestimmt an Angeboten der AXA ueber
 * verschiedene Eintrittsalter: Mit diesen Werten lag die Hochrechnung stets
 * nahe am Ergebnis des Versicherers. Sie stehen weder am Bildschirm noch im
 * Protokoll; verstellbar ist allein die Rendite der Ansparphase
 * (`daten.hochrechnung`). Die Entnahme ueber 30 Jahre gibt die Rente an.
 */
export const HOCHRECHNUNG_FEST = { renditeEntnahme: 0.02, ausgabeaufschlag: 0, ter: 0.015, entnahmedauer: 30 } as const;

export interface Hochrechnung {
  monate: number;
  annahmen: HochrechnungAnnahmen;
  /** Was jeden Monat in den Vertrag fliesst: Umwandlung und Arbeitgeber */
  beitragMonat: number;
  nettoSumme: number;
  /** Was Steuer- und Sozialabgabenersparnis beitragen */
  ersparnisSumme: number;
  arbeitgeberSumme: number;
  beitraegeSumme: number;
  /** Kapital minus Beitraege, also nach allen Kosten — negativ, wenn die Kosten ueberwiegen */
  ertrag: number;
  kapital: number;
  /** Die geschaetzte Rente brutto im Monat — die Entnahme ueber `annahmen.entnahmedauer` Jahre */
  renteMonat: number;
}

/**
 * Endwert der Monatsbeitraege nach Ausgabeaufschlag, vorschuessig (Beitrag am
 * Monatsanfang), Monatszins aus der Jahresrendite nach Kosten.
 */
export function hochrechnung(
  f: FirmenAngebot, d: BeratungDaten, r: MitarbeiterBav, heute = new Date(),
  a: HochrechnungAnnahmen = { ...HOCHRECHNUNG_FEST, renditeAnsparphase: d.hochrechnung.renditeAnsparphase },
): Hochrechnung {
  const n = monateDerUmwandlung(d, f, heute);
  const c = r.gesamtMonat;
  const angelegt = c * (1 - a.ausgabeaufschlag);
  // Wie im Depot: Rendite nach laufenden Kosten, nicht unter null
  const i = Math.pow(1 + Math.max(0, a.renditeAnsparphase - a.ter), 1 / 12) - 1;
  const kapital = i > 0 ? angelegt * ((Math.pow(1 + i, n) - 1) / i) * (1 + i) : angelegt * n;
  const plan = entnahmeplan(kapital, kapital, a.entnahmedauer, Math.max(0, a.renditeEntnahme - a.ter));
  const beitraegeSumme = c * n;
  return {
    monate: n,
    annahmen: a,
    beitragMonat: c,
    nettoSumme: r.nettoAufwandMonat * n,
    ersparnisSumme: (r.umwandlungMonat - r.nettoAufwandMonat) * n,
    arbeitgeberSumme: r.arbeitgeberMonat * n,
    beitraegeSumme,
    ertrag: kapital - beitraegeSumme,
    kapital,
    renteMonat: plan.bruttoProJahr / 12,
  };
}

/**
 * Was ein Vertrag von der Hochrechnung traegt — nach seinem Anteil am Beitrag
 * (die Hochrechnung waechst linear mit dem Beitrag), auf ganze Euro wie am
 * Bildschirm. Fuer „Geschaetzte Hochrechnung uebernehmen“ in der Leistung im
 * Alter; im Matching-Modell teilen sich Direktversicherung und
 * Unterstuetzungskasse die Werte.
 */
export function hochrechnungJeVertrag(h: Hochrechnung, r: MitarbeiterBav, weg: MitarbeiterVertrag['weg']): { renteMonat: number; kapital: number } {
  const v = r.vertraege.find((x) => x.weg === weg);
  const anteil = v && r.gesamtMonat > 0 ? v.beitragMonat / r.gesamtMonat : 0;
  return { renteMonat: Math.round(h.renteMonat * anteil), kapital: Math.round(h.kapital * anteil) };
}

/* --------------------------------------------------------------------------
 * KENNZAHLEN — wie im Vertrags-TUEV: Netto-Aufwand gegen Netto-Auszahlung,
 * mit `kennzahlen` aus dem Rechenkern. Der Vertrag allein; die geringere
 * gesetzliche Rente steht getrennt („Unterm Strich“).
 * ------------------------------------------------------------------------ */

export interface KennzahlenWeg extends Kennzahlen {
  art: 'prognose' | 'garantiert' | 'kapital';
  /** Netto-Rente im Monat aller Vertraege — beim Kapital die Einmalzahlung */
  netto: number;
}

export interface KennzahlenErgebnis {
  monateEinzahlung: number;
  jahreAuszahlung: number;
  lebenserwartung: number;
  /** Die Prognose stammt (auch) aus der geschaetzten Hochrechnung, nicht aus einem Angebot */
  geschaetzt: boolean;
  prognose: KennzahlenWeg | null;
  garantiert: KennzahlenWeg | null;
  kapital: KennzahlenWeg | null;
}

/**
 * Die Zahlungsreihe wie im Vertrags-TUEV (`vertrags-tuev.ts`): je
 * Kalenderjahr der Netto-Aufwand der Monate mit Umwandlung — mit der Dynamik
 * des Angebots steigt die Umwandlung jedes Jahr, der Netto-Aufwand wird dafuer
 * neu gerechnet. Ausgezahlt wird die Netto-Rente des ersten Rentenjahres bis
 * zur Lebenserwartung, beim Kapital einmal.
 */
export function kennzahlenRechnung(
  f: FirmenAngebot, d: BeratungDaten, l: Leistung | null, p: LegalParameters = P, heute = new Date(),
): KennzahlenErgebnis | null {
  if (!l || l.vertraege.length === 0) return null;
  const monate = monateDerUmwandlung(d, f, heute);
  if (monate <= 0) return null;
  const m = f.modell;
  const wegDerUmwandlung = m.art === 'matching' && m.weg === 'ukasse' ? 'ukasse' : 'direkt';
  const dynamik = Math.max(0, d.versicherer[wegDerUmwandlung].dynamik);

  const start = beginnVon(d, f, heute);
  const ohneDynamik = nettoBei(f, d, d.umwandlungMonat, p);
  const einzahlungenJeJahr: number[] = [];
  let rest = monate;
  for (let t = 0; rest > 0; t++) {
    // Im ersten Jahr ab dem Beginnmonat, danach volle Jahre, zuletzt bis vor den Rentenbeginn.
    const imJahr = Math.min(rest, t === 0 ? 13 - start.monat : 12);
    const netto = dynamik > 0 && t > 0 ? nettoBei(f, d, d.umwandlungMonat * Math.pow(1 + dynamik, t), p) : ohneDynamik;
    einzahlungenJeJahr.push(netto * imJahr);
    rest -= imJahr;
  }

  const jahreAuszahlung = Math.max(1, Math.round(d.lebenserwartung - l.alterBeiRentenbeginn));
  const summe = (w: (v: VertragsLeistung) => number) => l.vertraege.reduce((s, v) => s + w(v), 0);
  const weg = (art: KennzahlenWeg['art'], netto: number): KennzahlenWeg | null => {
    if (netto <= 0) return null;
    const istKapital = art === 'kapital';
    const k = kennzahlen({
      einzahlungenJeJahr,
      auszahlungJeJahr: istKapital ? 0 : netto * 12,
      jahreAuszahlung: istKapital ? 0 : jahreAuszahlung,
      kapitalEinmalig: istKapital ? netto : 0,
    });
    return { ...k, art, netto };
  };

  return {
    monateEinzahlung: monate,
    jahreAuszahlung,
    lebenserwartung: d.lebenserwartung,
    geschaetzt: l.vertraege.some((v) => d.versicherer[v.weg].ausHochrechnung),
    prognose: weg('prognose', summe((v) => v.prognose?.nettoMonat ?? 0)),
    garantiert: weg('garantiert', summe((v) => v.garantiert?.nettoMonat ?? 0)),
    kapital: weg('kapital', summe((v) => v.kapital?.netto ?? 0)),
  };
}
