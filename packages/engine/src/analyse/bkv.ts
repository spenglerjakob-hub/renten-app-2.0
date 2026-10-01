import type { LegalParameters } from '../params/types.js';
import { bruttoZuNetto } from '../erwerb/netto.js';
import { kirchensteuersatz } from '../tax/estg.js';
import type { KinderStatus } from '../social/kv-pv.js';
import { arbeitgeberSvErsparnis, type MatchingSteuer } from './matching-modell.js';

/**
 * BETRIEBLICHE KRANKENVERSICHERUNG (bKV) — die Rechnung fuer den Arbeitgeber.
 *
 * Der Arbeitgeber schliesst fuer seine Belegschaft einen Gruppenvertrag ab
 * (Budget- oder Bausteintarif) und zahlt die Beitraege. Kann der Mitarbeiter
 * nur den Versicherungsschutz verlangen und kein Geld, ist das SACHLOHN
 * (BFH VI R 13/16, BMF-Schreiben zu § 8 EStG). Sachlohn bleibt bis zur
 * monatlichen Freigrenze von 50 EUR steuerfrei (§ 8 Abs. 2 S. 11 EStG) und
 * damit auch beitragsfrei in der Sozialversicherung — vorausgesetzt:
 *   - die Beitraege werden MONATLICH gezahlt (eine Jahreszahlung fliesst in
 *     einem Monat zu und reisst die Grenze),
 *   - die bKV kommt ZUSAETZLICH zum ohnehin geschuldeten Gehalt, nicht per
 *     Gehaltsumwandlung.
 *
 * FREIGRENZE, KEIN FREIBETRAG: Die 50 EUR gelten fuer ALLE Sachbezuege des
 * Monats zusammen (auch Gutschein- und Tankkarten). Liegt die Summe auch nur
 * einen Cent darueber, ist der GESAMTE Betrag steuer- und beitragspflichtig.
 *
 * Fuer den Arbeitgeber sind die Beitraege Betriebsausgabe. Die Rechnung
 * stellt die bKV einer Gehaltserhoehung gegenueber, die beim Mitarbeiter
 * netto genauso viel ankommen laesst — das ist der Vergleich, den ein
 * Arbeitgeber versteht: „Was muesste ich brutto drauflegen?"
 *
 * FUENF WEGE. Passt der Tarif nicht in die Freigrenze (oder will der
 * Arbeitgeber sie fuer anderes nutzen), bleiben andere Gestaltungen:
 *   - SACHBEZUG: Tarif und andere Sachbezuege zusammen hoechstens 50 EUR.
 *   - AUFTEILEN: Der Arbeitgeber zahlt bis zur Freigrenze, der Mitarbeiter
 *     den Rest aus dem Netto. Die Freigrenze gilt fuer den Vorteil „nach
 *     Anrechnung der vom Steuerpflichtigen gezahlten Entgelte"
 *     (§ 8 Abs. 2 S. 11 EStG) — der Eigenanteil holt den Arbeitgeberteil
 *     also unter die Grenze.
 *   - PAUSCHAL: Der Arbeitgeber versteuert den ganzen Beitrag pauschal mit
 *     30 % nach § 37b Abs. 2 EStG, dazu Soli und ggf. Kirchensteuer. Fuer den
 *     Mitarbeiter lohnsteuerfrei, aber NICHT beitragsfrei: Die SvEV nimmt nur
 *     Zuwendungen an Arbeitnehmer Dritter aus (§ 1 Abs. 1 Nr. 14 SvEV). Pauschal
 *     versteuerte Vorteile zaehlen bei der 50-EUR-Grenze nicht mit, andere
 *     Sachbezuege bleiben frei.
 *   - BARLOHN: Der Beitrag als Zuschuss mit Geldanspruch — steuer- und
 *     beitragspflichtig wie Gehalt, beruehrt die Freigrenze aber nicht.
 *     (Als Sachlohn ueber 50 EUR waere es genauso teuer, und die anderen
 *     Sachbezuege fielen mit aus der Grenze.)
 *   - ARBEITNEHMER: Der Mitarbeiter zahlt selbst aus dem Netto, der
 *     Arbeitgeber bietet nur den Gruppenvertrag an.
 */

/** Pauschsteuersatz fuer Sachzuwendungen, § 37b Abs. 2 EStG */
export const PAUSCHSTEUER_37B = 0.3;

/** Sachbezugsfreigrenze im Monat, § 8 Abs. 2 S. 11 EStG (seit 2022). */
export const SACHBEZUG_FREIGRENZE_MONAT = 50;

export interface BkvEingaben {
  /** Beitrag je Mitarbeiter und Monat laut Angebot */
  beitragMonat: number;
  /** Andere Sachbezuege desselben Monats (Gutscheinkarte, Tankkarte …) */
  weitereSachbezuegeMonat: number;
  /** Bruttogehalt eines Beispiel-Mitarbeiters, fuer den Gehaltsvergleich */
  jahresbrutto: number;
  unternehmensSteuersatz: number;
  umlagenSatz: number;
  privatVersichert: boolean;
  pkvPraemieMonat: number;
  kinder: KinderStatus;
}

export type BkvWegId = 'sachbezug' | 'aufteilen' | 'pauschal' | 'barlohn' | 'arbeitnehmer';

export interface BkvGehalt {
  bruttoMonat: number;
  agAbgabenMonat: number;
  kostenVorSteuerMonat: number;
  steuerersparnisMonat: number;
  nettoKostenMonat: number;
  svMonat: number;
  steuerMonat: number;
  nettoMonat: number;
}

export interface BkvWeg {
  id: BkvWegId;
  titel: string;
  /** Eine Zeile, worum es geht */
  kurz: string;
  /** Rechtlich und rechnerisch gangbar */
  moeglich: boolean;
  /** Warum nicht moeglich — oder warum nicht sinnvoll, obwohl moeglich */
  grund?: string;
  /** Monatsbeitrag des Tarifs: der Versicherungsschutz des Mitarbeiters */
  schutzMonat: number;
  arbeitgeber: {
    /** Anteil am Beitrag, den der Arbeitgeber zahlt */
    beitragMonat: number;
    /** Arbeitgeberanteil SV und Umlagen */
    abgabenMonat: number;
    /** Pauschale Lohnsteuer mit Soli und Kirchensteuer (§ 37b) */
    pauschsteuerMonat: number;
    kostenVorSteuerMonat: number;
    steuerersparnisMonat: number;
    nettoKostenMonat: number;
  };
  mitarbeiter: {
    /** Eigenanteil am Beitrag, aus dem Netto */
    eigenanteilMonat: number;
    /** Steuer und Sozialabgaben auf den Arbeitgeberteil */
    abzuegeMonat: number;
    /** Was ihn der Schutz netto kostet: Eigenanteil + Abzuege */
    belastungMonat: number;
    /** Netto-Vorteil: Schutz minus Belastung */
    vorteilMonat: number;
  };
  /** Gehaltserhoehung mit demselben Netto-Vorteil — null ohne Vorteil */
  gehalt: BkvGehalt | null;
  /** Was der Arbeitgeber gegenueber dieser Gehaltserhoehung spart, Monat nach Steuern */
  ersparnisGegenGehaltMonat: number;
  /** Netto-Vorteil beim Mitarbeiter je Euro Nettokosten des Arbeitgebers */
  hebel: number;
}

export interface BkvErgebnis {
  /** Tarif und andere Sachbezuege bleiben zusammen in der 50-EUR-Grenze */
  inFreigrenze: boolean;
  /** Freier Rest der Freigrenze nach Tarif und anderen Sachbezuegen, Monat */
  freigrenzeRestMonat: number;
  wege: BkvWeg[];
  /** Vorschlag, mit dem die Seite startet */
  vorauswahl: BkvWegId;
  hinweise: string[];
}

const euro = (n: number) => `${Math.round(n).toLocaleString('de-DE')} €`;
/** Mit Cent, wenn es Cent gibt — Tarifbeitraege wie 21,88 EUR. */
const euroCent = (n: number) => {
  const w = Math.round(n * 100) / 100;
  return `${w.toLocaleString('de-DE', { minimumFractionDigits: Number.isInteger(w) ? 0 : 2, maximumFractionDigits: 2 })} €`;
};

function unterGrenze(brutto: number, betrag: number, bbg: number): number {
  const vorher = Math.min(Math.max(0, brutto), bbg);
  const nachher = Math.min(Math.max(0, brutto + betrag), bbg);
  return Math.max(0, nachher - vorher);
}

export function bkvModell(e: BkvEingaben, steuerOpt: MatchingSteuer, p: LegalParameters): BkvErgebnis {
  const hinweise: string[] = [];
  const beitrag = Math.max(0, e.beitragMonat);
  const weitere = Math.max(0, e.weitereSachbezuegeMonat);
  const satz = Math.min(0.6, Math.max(0, e.unternehmensSteuersatz));
  const umlagenSatz = Math.max(0, e.umlagenSatz);
  const summe = beitrag + weitere;
  const inFreigrenze = summe <= SACHBEZUG_FREIGRENZE_MONAT + 1e-9;
  const freiFuerBkv = Math.max(0, SACHBEZUG_FREIGRENZE_MONAT - weitere);

  const erwerbOpt = {
    ...steuerOpt,
    kinder: e.kinder,
    privatVersichert: e.privatVersichert,
    pkvPraemieMonat: e.privatVersichert ? e.pkvPraemieMonat : 0,
  };
  const heute = bruttoZuNetto(Math.max(0, e.jahresbrutto), erwerbOpt, p);
  const sk = {
    beamter: false, selbststaendig: false,
    privatVersichert: e.privatVersichert, pkvPraemieMonat: e.pkvPraemieMonat,
  };
  /** AG-Abgaben (SV-Anteil und Umlagen) auf zusaetzliches Entgelt, Jahr. */
  const agAbgaben = (betragJahr: number) =>
    arbeitgeberSvErsparnis(betragJahr, { ...sk, jahresbrutto: e.jahresbrutto + betragJahr }, steuerOpt.bundesland, p)
    + unterGrenze(e.jahresbrutto, betragJahr, p.bbgRvJahr) * umlagenSatz;
  /** Was beim Mitarbeiter von zusaetzlichem Entgelt abgeht, Jahr. */
  const maAbzuege = (betragJahr: number) => {
    const mit = bruttoZuNetto(e.jahresbrutto + betragJahr, erwerbOpt, p);
    return { gesamt: betragJahr - (mit.jahresnetto - heute.jahresnetto), sv: mit.sv - heute.sv };
  };

  /** Gehaltserhoehung, die beim Mitarbeiter netto `zielMonat` ankommen laesst. */
  const gehaltFuer = (zielMonat: number): BkvGehalt | null => {
    if (zielMonat <= 0.5) return null;
    const ziel = zielMonat * 12;
    let lo = 0, hi = ziel * 4 + 1000;
    for (let i = 0; i < 60; i++) {
      const mitte = (lo + hi) / 2;
      const netto = bruttoZuNetto(e.jahresbrutto + mitte, erwerbOpt, p).jahresnetto - heute.jahresnetto;
      if (netto < ziel) lo = mitte; else hi = mitte;
    }
    const b = hi;
    const nachher = bruttoZuNetto(e.jahresbrutto + b, erwerbOpt, p);
    const ag = agAbgaben(b);
    const kosten = b + ag;
    return {
      bruttoMonat: b / 12,
      agAbgabenMonat: ag / 12,
      kostenVorSteuerMonat: kosten / 12,
      steuerersparnisMonat: kosten * satz / 12,
      nettoKostenMonat: kosten * (1 - satz) / 12,
      svMonat: (nachher.sv - heute.sv) / 12,
      steuerMonat: ((nachher.est + nachher.soli + nachher.kirchensteuer) - (heute.est + heute.soli + heute.kirchensteuer)) / 12,
      nettoMonat: (nachher.jahresnetto - heute.jahresnetto) / 12,
    };
  };

  const weg = (
    id: BkvWegId, titel: string, kurz: string, moeglich: boolean, grund: string | undefined,
    ag: { beitrag: number; abgaben: number; pauschsteuer: number },
    ma: { eigenanteil: number; abzuege: number },
  ): BkvWeg => {
    const kostenVorSteuer = ag.beitrag + ag.abgaben + ag.pauschsteuer;
    const steuerersparnis = kostenVorSteuer * satz;
    const nettoKosten = kostenVorSteuer - steuerersparnis;
    const belastung = ma.eigenanteil + ma.abzuege;
    const vorteil = beitrag - belastung;
    const gehalt = gehaltFuer(vorteil);
    return {
      id, titel, kurz, moeglich, grund,
      schutzMonat: beitrag,
      arbeitgeber: {
        beitragMonat: ag.beitrag, abgabenMonat: ag.abgaben, pauschsteuerMonat: ag.pauschsteuer,
        kostenVorSteuerMonat: kostenVorSteuer, steuerersparnisMonat: steuerersparnis, nettoKostenMonat: nettoKosten,
      },
      mitarbeiter: { eigenanteilMonat: ma.eigenanteil, abzuegeMonat: ma.abzuege, belastungMonat: belastung, vorteilMonat: vorteil },
      gehalt,
      // Wo der Weg wie Gehalt abgerechnet wird, sind beide gleich; ohne die
      // Klammer stuende dort aus Rundungsresten der Bisektion „−0 EUR".
      ersparnisGegenGehaltMonat: gehalt ? Math.max(0, gehalt.nettoKostenMonat - nettoKosten) : 0,
      hebel: nettoKosten > 0.005 ? vorteil / nettoKosten : 0,
    };
  };

  // --- Sachbezug: alles in der Freigrenze, nichts geht ab --------------------
  const sachbezug = weg(
    'sachbezug', 'Steuerfreier Sachbezug', 'Sie zahlen den Tarif, bis 50 € im Monat ohne Steuer und Abgaben',
    inFreigrenze,
    inFreigrenze ? undefined
      : `Tarif und andere Sachbezüge liegen bei ${euroCent(summe)} — über der Freigrenze von ${euro(SACHBEZUG_FREIGRENZE_MONAT)}.`,
    { beitrag, abgaben: 0, pauschsteuer: 0 },
    { eigenanteil: 0, abzuege: 0 },
  );

  // --- Aufteilen: Arbeitgeber bis zur Grenze, Mitarbeiter den Rest -----------
  const agTeil = Math.min(beitrag, freiFuerBkv);
  const aufteilen = weg(
    'aufteilen', 'Aufteilen',
    `Sie zahlen bis zur Freigrenze steuerfrei, der Mitarbeiter den Rest aus dem Netto`,
    !inFreigrenze && agTeil > 0.005,
    inFreigrenze ? 'Nicht nötig — der Tarif passt ganz in die Freigrenze.'
      : agTeil <= 0.005 ? 'Die anderen Sachbezüge schöpfen die Freigrenze schon aus.' : undefined,
    { beitrag: agTeil, abgaben: 0, pauschsteuer: 0 },
    { eigenanteil: beitrag - agTeil, abzuege: 0 },
  );

  // --- Pauschal nach § 37b Abs. 2: keine Lohnsteuer beim MA, aber SV ---------
  const kist = steuerOpt.kirchensteuerpflichtig ? kirchensteuersatz(steuerOpt.bundesland) : 0;
  const pauschsteuer = beitrag * PAUSCHSTEUER_37B * (1 + 0.055 + kist);
  const pauschal = weg(
    'pauschal', 'Pauschal versteuert (§ 37b)',
    'Sie übernehmen 30 % Pauschsteuer, der Mitarbeiter zahlt nur Sozialabgaben',
    true,
    inFreigrenze ? 'Möglich, aber unnötig teuer — in der Freigrenze ist die bKV ohnehin frei.' : undefined,
    { beitrag, abgaben: agAbgaben(beitrag * 12) / 12, pauschsteuer },
    { eigenanteil: 0, abzuege: maAbzuege(beitrag * 12).sv / 12 },
  );

  // --- Barlohn: wie Gehalt -----------------------------------------------------
  const barlohn = weg(
    'barlohn', 'Als Barlohn versteuert',
    'Zuschuss wie Gehalt: Der Mitarbeiter zahlt Steuer und Abgaben, Sie Ihren SV-Anteil',
    true,
    inFreigrenze ? 'Möglich, aber unnötig teuer — in der Freigrenze ist die bKV ohnehin frei.' : undefined,
    { beitrag, abgaben: agAbgaben(beitrag * 12) / 12, pauschsteuer: 0 },
    { eigenanteil: 0, abzuege: maAbzuege(beitrag * 12).gesamt / 12 },
  );

  // --- Arbeitnehmerfinanziert: nur der Gruppenvertrag ------------------------
  const arbeitnehmer = weg(
    'arbeitnehmer', 'Mitarbeiter zahlt selbst',
    'Sie bieten den Gruppenvertrag an, der Mitarbeiter zahlt aus dem Netto',
    true, undefined,
    { beitrag: 0, abgaben: 0, pauschsteuer: 0 },
    { eigenanteil: beitrag, abzuege: 0 },
  );

  const wege = [sachbezug, aufteilen, pauschal, barlohn, arbeitnehmer];

  // Vorschlag: steuerfrei, wo es geht. Sonst der Weg, bei dem je Euro
  // Arbeitgeberkosten am meisten beim Mitarbeiter ankommt — unter denen,
  // in denen der Arbeitgeber den ganzen Tarif traegt, wenn Aufteilen nicht geht.
  const vorauswahl: BkvWegId = inFreigrenze ? 'sachbezug'
    : aufteilen.moeglich ? 'aufteilen'
    : pauschal.hebel >= barlohn.hebel ? 'pauschal' : 'barlohn';

  // --- Hinweise --------------------------------------------------------------
  if (!inFreigrenze) {
    hinweise.push(
      `Tarif und andere Sachbezüge liegen zusammen bei ${euroCent(summe)} im Monat — über der Freigrenze von `
      + `${euro(SACHBEZUG_FREIGRENZE_MONAT)}. Weil es eine Freigrenze ist und kein Freibetrag, wäre als Sachbezug der `
      + 'GESAMTE Betrag steuer- und beitragspflichtig, nicht nur der Teil darüber — auch die anderen Sachbezüge. '
      + 'Deshalb einen der anderen Wege wählen.',
    );
  } else if (weitere > 0) {
    hinweise.push(
      `Die Freigrenze von ${euro(SACHBEZUG_FREIGRENZE_MONAT)} gilt für alle Sachbezüge zusammen. Mit den anderen `
      + `Sachbezügen bleiben noch ${euroCent(SACHBEZUG_FREIGRENZE_MONAT - summe)} frei.`,
    );
  }
  hinweise.push(
    'Steuerfrei nur bei monatlicher Beitragszahlung und wenn die bKV zusätzlich zum Gehalt gewährt wird — '
    + 'nicht per Gehaltsumwandlung. Der Mitarbeiter darf nur den Versicherungsschutz verlangen können, kein Geld.',
  );

  return {
    inFreigrenze,
    freigrenzeRestMonat: Math.max(0, SACHBEZUG_FREIGRENZE_MONAT - summe),
    wege,
    vorauswahl,
    hinweise,
  };
}
