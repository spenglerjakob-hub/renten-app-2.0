import {
  bavMitarbeiter, bavRahmenVoll, grvMinderung, bruttoZuNetto, parameterFuer, parseDatum, projiziere,
  renteOderKapital, schaetzeEntgeltpunkte,
  type FirmenModell, type KinderStatus, type LegalParameters, type MatchingSteuer, type MitarbeiterBav,
  type MitarbeiterEingaben, type MitarbeiterVertrag, type RenteOderKapital, type Vertrag,
} from '@renten/engine';
import type { BeratungAngaben, BeratungDaten, FirmenAngebot, VersichererWerte } from '@renten/schema';
import { leereAntworten, regelRentenbeginn, szenarioAusCheck } from '../check/uebernahme';
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

const OHNE_KINDER: KinderStatus = { hatKinder: false, kinderUnter25: 0 };

/** Das Bundesland der Angaben, sonst das der Firma. */
export const bundeslandVon = (a: BeratungAngaben, f: FirmenAngebot) => a.bundesland || f.bundesland;

export function kinderStatus(a: BeratungAngaben): KinderStatus {
  return {
    hatKinder: a.kinder.length > 0,
    kinderUnter25: a.kinder.filter((k) => JETZT - k.geburtsjahr < 25).length,
  };
}

/**
 * Die Steuer des Mitarbeiters. Verheiratet mit Einkommen des Partners: dessen
 * zvE aus seinem Brutto (gesetzlich versichert, ohne Kinder gerechnet) —
 * die Ersparnis entsteht dann im gemeinsamen Splittingtarif.
 */
export function steuerVon(a: BeratungAngaben, f: FirmenAngebot, p: LegalParameters = P): MatchingSteuer {
  const bundesland = bundeslandVon(a, f);
  const partnerZveJahr = a.verheiratet && a.partnerBrutto > 0
    ? bruttoZuNetto(a.partnerBrutto, { verheiratet: false, bundesland, kirchensteuerpflichtig: false, kinder: OHNE_KINDER }, p).zve
    : 0;
  return { verheiratet: a.verheiratet, bundesland, kirchensteuerpflichtig: a.kirchensteuer, partnerZveJahr };
}

export function eingabenVon(a: BeratungAngaben, umwandlungMonat: number): MitarbeiterEingaben {
  return {
    jahresbrutto: a.jahresbrutto,
    umwandlungMonat,
    privatVersichert: a.kv === 'privat',
    pkvPraemieMonat: a.pkvPraemieMonat,
    kinder: kinderStatus(a),
    bavBestandMonat: a.bavBestandMonat,
  };
}

/** Schritt 3: was die Umwandlung kostet und was in den Vertrag fliesst. */
export function beitragsRechnung(f: FirmenAngebot, d: BeratungDaten, p: LegalParameters = P): MitarbeiterBav {
  return bavMitarbeiter(f.modell as FirmenModell, eingabenVon(d.angaben, d.umwandlungMonat), steuerVon(d.angaben, f, p), p);
}

/** „Rahmen voll nutzen“: die Umwandlung, mit der der beitragsfreie Rahmen genau voll ist. */
export function rahmenVoll(f: FirmenAngebot, a: BeratungAngaben, p: LegalParameters = P): number {
  return bavRahmenVoll(f.modell as FirmenModell, eingabenVon(a, 0), bundeslandVon(a, f), p);
}

/** Rentenbeginn als TT.MM.JJJJ: der eingetragene oder die Regelaltersgrenze. Null ohne Geburtsdatum. */
export function rentenbeginnVon(a: BeratungAngaben): string | null {
  return parseDatum(a.rentenbeginn) ? a.rentenbeginn : regelRentenbeginn(a.geburtsdatum);
}

/** Ganze Jahre bis zum Rentenbeginn — fuer die Minderung der gesetzlichen Rente. */
export function jahreBisRente(a: BeratungAngaben): number {
  const r = parseDatum(rentenbeginnVon(a));
  return r ? Math.max(0, r.jahr - JETZT) : 0;
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

/** Um so viel sinkt die gesetzliche Rente durch die beitragsfreie Umwandlung — heutige Kaufkraft. */
export function grvMinderungVon(a: BeratungAngaben, r: MitarbeiterBav, p: LegalParameters = P) {
  return grvMinderung(a.jahresbrutto, r.umwandlungMonat - r.svPflichtigMonat, jahreBisRente(a), p);
}

/**
 * Das Szenario des Mitarbeiters — ueber `szenarioAusCheck`, wie beim
 * Vorsorge-Check. Verheiratet: der Partner gleich alt, mit seinem Brutto und
 * einer daraus geschaetzten gesetzlichen Rente. Mehr fragt die Beratung
 * nicht; fuer Steuer und Krankenversicherung im Alter reicht das.
 */
export function szenarioAusBeratung(a: BeratungAngaben, f: FirmenAngebot, grvMonatA: number, p: LegalParameters = P): SzenarioParsed {
  const x = leereAntworten();
  const rentenbeginn = rentenbeginnVon(a);
  x.a = {
    ...x.a,
    name: a.name,
    geburtsdatum: a.geburtsdatum,
    rentenbeginn: a.rentenbeginn,
    einkommen: { ...x.a.einkommen, modus: 'brutto', betrag: a.jahresbrutto / 12, auszahlungen: 12 },
    grvRente: grvMonatA,
  };
  x.verheiratet = a.verheiratet;
  if (a.verheiratet) {
    x.b = {
      ...x.b,
      geburtsdatum: a.geburtsdatum,
      einkommen: { ...x.b.einkommen, modus: 'brutto', betrag: a.partnerBrutto / 12, auszahlungen: 12 },
      grvRente: grvVon(a.partnerBrutto, 0, a.geburtsdatum, rentenbeginn, p).monat,
    };
  }
  x.bundesland = bundeslandVon(a, f);
  x.kirchensteuer = a.kirchensteuer;
  x.kinder = a.kinder;
  x.kv = a.kv;
  x.krankenkasse = a.krankenkasse;
  x.zusatzbeitrag = a.zusatzbeitrag;
  x.pkv = { ...x.pkv, praemieMonat: a.pkvPraemieMonat };
  return szenarioAusCheck(x);
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
  grv: { monat: number; geschaetzt: boolean };
  /** Minderung der gesetzlichen Rente, heutige Kaufkraft */
  grvMinderungMonat: number;
  /**
   * Um so viel steigt das Netto des HAUSHALTS im ersten Rentenjahr: mit der
   * prognostizierten Rente und der geminderten gesetzlichen Rente, gegen
   * ohne beides. Null ohne Prognose.
   */
  plusHaushaltMonat: number | null;
}

const TYP: Record<MitarbeiterVertrag['weg'], Vertrag['typ']> = { direkt: 'bav', ukasse: 'bavUkasse' };
const NAME: Record<MitarbeiterVertrag['weg'], string> = { direkt: 'Betriebsrente', ukasse: 'Unterstützungskasse' };
const leer = (w: VersichererWerte) => w.garantierteRente <= 0 && w.prognoseRente <= 0 && w.prognoseKapital <= 0;

/**
 * Schritt 4: die Werte des Versicherers nach Steuer und Krankenversicherung im
 * ersten Rentenjahr — garantiert und prognostiziert, dazu das Kapital.
 *
 * Wie `angebotPositionen`: Die Vertraege kommen zu einem Klon des Szenarios,
 * `projiziere` rechnet. Mit Vertrag sinkt die gesetzliche Rente um die
 * Minderung — so ist es in Wirklichkeit, und Steuer und KV auf die
 * Betriebsrente haengen auch an ihr.
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
  const grv = grvVon(a.jahresbrutto, a.grvRente, a.geburtsdatum, rentenbeginn, p);
  const minderung = grvMinderungVon(a, r, p).renteMonat;
  const basis = szenarioAusBeratung(a, f, grv.monat, p);
  const beginnJahr = JETZT + 1;

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
    const personen = basis.personen.map((x) => (x.id === 'A' ? { ...x, grvBruttoHeute: Math.max(0, grv.monat - minderung) } : x));
    return projiziere({ ...basis, personen, vertraege: [...basis.vertraege, ...neu] });
  };

  const ohne = projiziere(basis);
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

  const zeileMit = mitPrognose?.zeilen.find((z) => z.jahr === jahr);
  return {
    vertraege: ergebnis,
    rentenbeginnJahr: jahr,
    alterBeiRentenbeginn,
    kaufkraftfaktor: zeileOhne?.kaufkraftfaktor ?? 1,
    grv,
    grvMinderungMonat: minderung,
    plusHaushaltMonat: zeileMit && zeileOhne ? zeileMit.nettoMonat - zeileOhne.nettoMonat : null,
  };
}
