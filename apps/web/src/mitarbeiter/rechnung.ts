import {
  bavMitarbeiter, bavRahmenVoll, grvMinderung, bruttoZuNetto, entnahmeplan, kennzahlen, parameterFuer, parseDatum, projiziere,
  renteOderKapital, schaetzeEntgeltpunkte, STEUER_FREI_QUOTE,
  type FirmenModell, type Kennzahlen, type KinderStatus, type LegalParameters, type MatchingSteuer, type MitarbeiterBav,
  type MitarbeiterEingaben, type MitarbeiterVertrag, type RenteOderKapital, type Vertrag,
} from '@renten/engine';
import type { BeratungAngaben, BeratungDaten, FirmenAngebot, HochrechnungAnnahmen, VersichererWerte } from '@renten/schema';
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

/** Schritt 4: was die Umwandlung kostet und was in den Vertrag fliesst. */
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

/** Ein Monat als fortlaufende Zahl — dann ist „Monate dazwischen“ eine Subtraktion. */
const monatsIndex = (x: { jahr: number; monat: number }) => x.jahr * 12 + (x.monat - 1);

/**
 * Der erste Monat der Umwandlung: laut Entscheidung, sonst laut Angebot der
 * Firma, sonst der naechste Monatserste.
 */
export function beginnVon(d: BeratungDaten, f: FirmenAngebot, heute = new Date()): { jahr: number; monat: number } {
  const x = parseDatum(d.entscheidung.beginn) ?? parseDatum(f.beginn);
  if (x) return { jahr: x.jahr, monat: x.monat };
  const naechster = heute.getMonth() + 2;
  return naechster > 12 ? { jahr: heute.getFullYear() + 1, monat: 1 } : { jahr: heute.getFullYear(), monat: naechster };
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

/** Die Minderung der gesetzlichen Rente mit allen Zwischenwerten — fuer „So gerechnet“. */
export interface MinderungHerleitung {
  /** Beitragsfreie Umwandlung im Jahr: so viel weniger rentenversichertes Entgelt */
  svFreiJahr: number;
  durchschnittsentgelt: number;
  /** Entgeltpunkte, die je Jahr fehlen */
  entgeltpunkteJeJahr: number;
  /** Jahre der Umwandlung, monatsgenau */
  jahre: number;
  entgeltpunkte: number;
  rentenwert: number;
  /** Um so viel sinkt die Monatsrente — nach heutigem Stand */
  renteMonat: number;
  /** Auch nach der Umwandlung ueber der Beitragsbemessungsgrenze: keine Minderung */
  ueberBbg: boolean;
}

/**
 * Um so viel sinkt die gesetzliche Rente durch die beitragsfreie Umwandlung
 * (`grvMinderung` im Rechenkern): weniger rentenversichertes Entgelt, also
 * weniger Entgeltpunkte — je Jahr der Umwandlung, monatsgenau vom Beginn bis
 * zum Rentenbeginn, mal dem heutigen Rentenwert.
 */
export function grvMinderungVon(
  d: BeratungDaten, f: FirmenAngebot, r: MitarbeiterBav, p: LegalParameters = P, heute = new Date(),
): MinderungHerleitung {
  const a = d.angaben;
  const svFreiMonat = Math.max(0, r.umwandlungMonat - r.svPflichtigMonat);
  const jahre = monateDerUmwandlung(d, f, heute) / 12;
  const g = grvMinderung(a.jahresbrutto, svFreiMonat, jahre, p);
  return {
    svFreiJahr: svFreiMonat * 12,
    durchschnittsentgelt: p.durchschnittsentgelt,
    entgeltpunkteJeJahr: jahre > 0 ? g.entgeltpunkte / jahre : 0,
    jahre,
    entgeltpunkte: g.entgeltpunkte,
    rentenwert: p.rentenwert,
    renteMonat: g.renteMonat,
    ueberBbg: svFreiMonat > 0 && a.jahresbrutto - svFreiMonat * 12 >= p.bbgRvJahr,
  };
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

/**
 * Das Szenario des Mitarbeiters OHNE neuen Vertrag und seine Projektion —
 * fuer die Versorgungsluecke und als Vergleich fuer die Leistung im Alter.
 */
export function basisProjektion(a: BeratungAngaben, f: FirmenAngebot, p: LegalParameters = P) {
  const grv = grvVon(a.jahresbrutto, a.grvRente, a.geburtsdatum, rentenbeginnVon(a), p);
  const szenario = szenarioAusBeratung(a, f, grv.monat, p);
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
 * Schritt 5: die Werte des Versicherers nach Steuer und Krankenversicherung im
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
  const b = basisProjektion(a, f, p);
  const grv = b.grv;
  const minderung = grvMinderungVon(d, f, r, p).renteMonat;
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
    const personen = basis.personen.map((x) => (x.id === 'A' ? { ...x, grvBruttoHeute: Math.max(0, grv.monat - minderung) } : x));
    return projiziere({ ...basis, personen, vertraege: [...basis.vertraege, ...neu] });
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

/* --------------------------------------------------------------------------
 * VERSORGUNGSLUECKE — der Nettolohn heute gegen die gesetzliche Rente netto,
 * beides in heutiger Kaufkraft.
 * ------------------------------------------------------------------------ */

/** Lohn heute, im Monat: Steuern als Anteil der Jahressteuer, Sozialabgaben, Netto. */
export interface Lohn {
  bruttoMonat: number;
  steuernMonat: number;
  svMonat: number;
  nettoMonat: number;
}

/**
 * Der Nettolohn des Mitarbeiters heute — `bruttoZuNetto`, mit denselben
 * Angaben wie die Modelle. Verheiratet zaehlt der Splittingtarif nur, wenn
 * der Partner kein Einkommen hat; sonst rechnet es wie Steuerklasse IV mit
 * dem Grundtarif. Die Steuer ist der Monatsanteil der Jahressteuer — die
 * Lohnsteuer der Abrechnung verteilt sie je nach Steuerklasse anders.
 */
export function nettolohnHeute(a: BeratungAngaben, f: FirmenAngebot, p: LegalParameters = P): Lohn {
  const n = bruttoZuNetto(Math.max(0, a.jahresbrutto), {
    verheiratet: a.verheiratet && a.partnerBrutto <= 0,
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
  const lohn = nettolohnHeute(a, f, p);
  return {
    lohn,
    grv: b.grv,
    rente,
    lueckeMonat: Math.max(0, lohn.nettoMonat - rente.nettoMonat),
    anteil: lohn.nettoMonat > 0 ? rente.nettoMonat / lohn.nettoMonat : 0,
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
  /** Hoechstens so viel Umwandlung: der steuerfreie Rahmen (8 % der BBG) */
  maxUmwandlung: number;
  maxNetto: number;
  /** „Rahmen voll“: Umwandlung und Netto dazu */
  vollUmwandlung: number;
  vollNetto: number;
}

export function reglerGrenzen(f: FirmenAngebot, d: BeratungDaten, p: LegalParameters = P): ReglerGrenzen {
  const maxUmwandlung = Math.floor((STEUER_FREI_QUOTE * p.bbgRvJahr) / 12);
  const vollUmwandlung = Math.min(maxUmwandlung, rahmenVoll(f, d.angaben, p));
  return {
    maxUmwandlung,
    maxNetto: Math.floor(nettoBei(f, d, maxUmwandlung, p)),
    vollUmwandlung,
    vollNetto: nettoBei(f, d, vollUmwandlung, p),
  };
}

/**
 * Die Umwandlung, die netto genau `netto` kostet — Bisektion wie `suche` im
 * Loesungsvergleich: Der Netto-Aufwand steigt mit der Umwandlung. Auf Cent,
 * hoechstens bis `maxUmwandlung`.
 */
export function umwandlungFuerNetto(f: FirmenAngebot, d: BeratungDaten, netto: number, p: LegalParameters = P): number {
  if (netto <= 0) return 0;
  const max = Math.floor((STEUER_FREI_QUOTE * p.bbgRvJahr) / 12);
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
  };
}

/* --------------------------------------------------------------------------
 * BEISPIELHAFTE HOCHRECHNUNG — mit den Annahmen und der Rechnung des
 * ETF-Depots im Rechner (`etfVerlauf` in der Zeitachse): In der Ansparphase
 * waechst das Geld mit der Rendite minus den laufenden Kosten, der
 * Ausgabeaufschlag geht von jedem Beitrag ab. Ab Rentenbeginn verteilt
 * `entnahmeplan` aus dem Rechenkern das Kapital ueber die Entnahmedauer, mit
 * der Rendite der Entnahmephase minus den Kosten. Angespart wird monatsgenau,
 * weil Beitraege und Laufzeit hier monatsgenau sind; Steuern auf Ertraege
 * (Vorabpauschale) gibt es in der bAV nicht. Ein Beispiel — die Werte des
 * Versicherers folgen.
 * ------------------------------------------------------------------------ */

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
  /** Entnahme brutto im Monat, `annahmen.entnahmedauer` Jahre lang */
  entnahmeMonat: number;
}

/**
 * Endwert der Monatsbeitraege nach Ausgabeaufschlag, vorschuessig (Beitrag am
 * Monatsanfang), Monatszins aus der Jahresrendite nach Kosten.
 */
export function hochrechnung(f: FirmenAngebot, d: BeratungDaten, r: MitarbeiterBav, heute = new Date()): Hochrechnung {
  const a = d.hochrechnung;
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
    entnahmeMonat: plan.bruttoProJahr / 12,
  };
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
    prognose: weg('prognose', summe((v) => v.prognose?.nettoMonat ?? 0)),
    garantiert: weg('garantiert', summe((v) => v.garantiert?.nettoMonat ?? 0)),
    kapital: weg('kapital', summe((v) => v.kapital?.netto ?? 0)),
  };
}
