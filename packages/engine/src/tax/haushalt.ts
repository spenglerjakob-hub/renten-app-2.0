import type { LegalParameters } from '../params/types.js';
import { einkommensteuer, grenzsteuersatz, solidaritaetszuschlag, kirchensteuersatz } from './estg.js';

/**
 * Eine Einkunftsquelle im Rentenalter mit ihrem Beitrag zum zu versteuernden
 * Einkommen.
 */
export interface Einkunftsquelle {
  id: string;
  bezeichnung: string;
  /** Bruttobetrag im Jahr */
  brutto: number;
  /** Anteil, der in das zvE eingeht (nach Freibetraegen/Ertragsanteil) */
  zveBeitrag: number;
  /** KV/PV-Beitraege auf diese Quelle, jaehrlich */
  kvPv: number;
}

export interface SteuerAufteilung {
  id: string;
  /** Anteilig zugerechnete Einkommensteuer */
  est: number;
  soli: number;
  kirchensteuer: number;
  /** est + soli + kirchensteuer */
  gesamt: number;
}

export interface HaushaltsSteuer {
  /** Zu versteuerndes Einkommen des Haushalts */
  zve: number;
  est: number;
  soli: number;
  kirchensteuer: number;
  gesamt: number;
  /** Belastung bezogen auf das zvE — nur zur Anzeige */
  durchschnittssatz: number;
  /**
   * Belastung des NAECHSTEN Euro. Fuer Entscheidungsfragen ("lohnt sich eine
   * zusaetzliche Einzahlung?") ist ausschliesslich dieser Satz massgeblich.
   */
  grenzsatz: number;
  /**
   * Verursachungsgerechte Aufteilung der Gesamtsteuer auf die Quellen.
   * Die Summe entspricht per Konstruktion exakt `gesamt` — im Prototyp
   * stimmten Kassenbon und Steuer-Panel nicht ueberein (Befund B2).
   */
  aufteilung: SteuerAufteilung[];
}

/**
 * Berechnet die Steuer des Haushalts EINMAL auf das Gesamteinkommen und teilt
 * sie anschliessend auf die Quellen auf.
 *
 * Der Prototyp multiplizierte stattdessen jede Quelle einzeln mit einem
 * Durchschnittssatz, dessen Nenner ausserdem eine andere Bemessungsgrundlage
 * hatte als der Zaehler. Dadurch war die Summe der ausgewiesenen Einzelsteuern
 * nicht die tatsaechliche Steuerschuld.
 */
export function haushaltssteuer(
  quellen: readonly Einkunftsquelle[],
  opts: {
    verheiratet: boolean;
    bundesland: string;
    kirchensteuerpflichtig: boolean;
    /** Abzugsfaehige Vorsorgeaufwendungen (KV/PV Basisabsicherung), jaehrlich */
    vorsorgeaufwand: number;
    /** Weitere Abzuege (Werbungskosten-, Sonderausgabenpauschbetraege) */
    weitereAbzuege: number;
  },
  p: LegalParameters,
): HaushaltsSteuer {
  const zveRoh = quellen.reduce((s, q) => s + q.zveBeitrag, 0);
  const zve = Math.max(0, zveRoh - opts.vorsorgeaufwand - opts.weitereAbzuege);

  const est = einkommensteuer(zve, opts.verheiratet, p);
  const soli = solidaritaetszuschlag(est, opts.verheiratet, p);
  const kistSatz = opts.kirchensteuerpflichtig ? kirchensteuersatz(opts.bundesland) : 0;
  const kirche = est * kistSatz;
  const gesamt = est + soli + kirche;

  // Aufteilung proportional zum zvE-Beitrag der Quelle.
  const summeBeitraege = quellen.reduce((s, q) => s + Math.max(0, q.zveBeitrag), 0);
  const aufteilung: SteuerAufteilung[] = quellen.map((q) => {
    const anteil = summeBeitraege > 0 ? Math.max(0, q.zveBeitrag) / summeBeitraege : 0;
    const e = est * anteil;
    const s = soli * anteil;
    const k = kirche * anteil;
    return { id: q.id, est: e, soli: s, kirchensteuer: k, gesamt: e + s + k };
  });

  const gs = grenzsteuersatz(zve, opts.verheiratet, p, 100) * (1 + kistSatz);

  return {
    zve,
    est,
    soli,
    kirchensteuer: kirche,
    gesamt,
    durchschnittssatz: zve > 0 ? gesamt / zve : 0,
    grenzsatz: gs,
    aufteilung,
  };
}

/**
 * Steuerliche Mehrbelastung durch einen ZUSAETZLICHEN Betrag im zvE.
 *
 * Das ist die fachlich richtige Groesse fuer den Vertrags-TUEV: Wie viel
 * Steuer loest genau dieser Vertrag aus? Der Prototyp zeigte den Grenzsatz an,
 * rechnete aber mit dem Durchschnittssatz (Befund B3).
 */
export function zusatzsteuer(
  zveBasis: number,
  zusatz: number,
  opts: { verheiratet: boolean; bundesland: string; kirchensteuerpflichtig: boolean },
  p: LegalParameters,
): number {
  if (zusatz <= 0) return 0;
  const kistSatz = opts.kirchensteuerpflichtig ? kirchensteuersatz(opts.bundesland) : 0;
  const vorher = einkommensteuer(zveBasis, opts.verheiratet, p);
  const nachher = einkommensteuer(zveBasis + zusatz, opts.verheiratet, p);
  const dEst = nachher - vorher;
  const dSoli =
    solidaritaetszuschlag(nachher, opts.verheiratet, p) -
    solidaritaetszuschlag(vorher, opts.verheiratet, p);
  return dEst + dSoli + dEst * kistSatz;
}

/**
 * Abgeltungsteuer § 32d inkl. Solidaritaetszuschlag und Kirchensteuer.
 *
 * Bei Kirchensteuerpflicht MINDERT die Kirchensteuer die Kapitalertragsteuer
 * (Formel § 32d Abs. 1 S. 4/5) — effektiv 24,45 % statt 25 % bei 8 %
 * Kirchensteuer. Der Prototyp addierte sie an einer Stelle korrekt, an anderer
 * fehlerhaft obendrauf (Befund B7).
 */
export function abgeltungsteuer(
  ertrag: number,
  opts: { kirchensteuerpflichtig: boolean; bundesland: string; teilfreistellung?: number; sparerpauschbetrag?: number },
  p: LegalParameters,
): { steuer: number; bemessung: number } {
  const tf = opts.teilfreistellung ?? 0;
  const nachTeilfreistellung = Math.max(0, ertrag) * (1 - tf);
  const bemessung = Math.max(0, nachTeilfreistellung - (opts.sparerpauschbetrag ?? 0));
  if (bemessung <= 0) return { steuer: 0, bemessung: 0 };

  const k = opts.kirchensteuerpflichtig ? kirchensteuersatz(opts.bundesland) : 0;
  // e / (4 + k) * ... -> effektiver Satz inkl. Kirchensteuerermaessigung
  const kapSt = bemessung / (4 + k);
  const soli = kapSt * p.soli.satz;
  const kirche = kapSt * k;
  return { steuer: kapSt + soli + kirche, bemessung };
}
