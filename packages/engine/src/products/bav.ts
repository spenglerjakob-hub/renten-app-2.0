import type { LegalParameters } from '../params/types.js';
import { einkommensteuer } from '../tax/estg.js';

/**
 * Besteuerung einer Kapitalauszahlung aus der betrieblichen Altersversorgung.
 *
 * WICHTIG (Befund B5): Der Prototyp wandte auf bAV-Kapital die
 * Fuenftelregelung (§ 34 EStG) an. Fuer Leistungen aus Direktversicherung,
 * Pensionskasse und Pensionsfonds nach § 22 Nr. 5 EStG wird sie nach
 * staendiger BFH-Rechtsprechung REGELMAESSIG NICHT gewaehrt: Die Kapitalwahl
 * ist vertraglich vorgesehen und damit nicht "aussergewoehnlich". Der volle
 * Betrag faellt im Zuflussjahr an und trifft dort die Progressionsspitze.
 *
 * Standard ist deshalb die volle Besteuerung. Die Fuenftelregelung laesst sich
 * fuer die Faelle, in denen sie in Betracht kommt (Direktzusage,
 * Unterstuetzungskasse), bewusst zuschalten.
 */
export function bavKapitalSteuer(
  args: {
    kapital: number;
    /** uebriges zvE des Zuflussjahres */
    zveBasis: number;
    verheiratet: boolean;
    kirchensteuersatz: number;
    /** Pauschalversteuerte Altzusage nach § 40b a. F. -> steuerfrei */
    altzusageVor2005: boolean;
    /** Nur bei Direktzusage/U-Kasse ggf. zulaessig */
    fuenftelregelungAnwenden: boolean;
  },
  p: LegalParameters,
): { steuer: number; methode: string; hinweis: string } {
  const k = Math.max(0, args.kapital);
  if (k === 0) return { steuer: 0, methode: 'keine', hinweis: '' };

  if (args.altzusageVor2005) {
    return {
      steuer: 0,
      methode: 'steuerfrei',
      hinweis: 'Pauschalversteuerte Altzusage (§ 40b EStG a. F.): Kapitalleistung steuerfrei. Die KV/PV-Pflicht auf 1/120 ueber 120 Monate bleibt bestehen.',
    };
  }

  const basisSt = einkommensteuer(args.zveBasis, args.verheiratet, p);

  if (args.fuenftelregelungAnwenden) {
    const mitFuenftel = einkommensteuer(args.zveBasis + k / 5, args.verheiratet, p);
    const est = (mitFuenftel - basisSt) * 5;
    return {
      steuer: est * (1 + args.kirchensteuersatz),
      methode: 'fuenftelregelung',
      hinweis: 'Fuenftelregelung (§ 34 EStG) angewandt — kommt nur bei Direktzusage/Unterstuetzungskasse in Betracht.',
    };
  }

  const voll = einkommensteuer(args.zveBasis + k, args.verheiratet, p);
  const est = voll - basisSt;
  return {
    steuer: est * (1 + args.kirchensteuersatz),
    methode: 'voll',
    hinweis: 'Volle Besteuerung im Zuflussjahr (§ 22 Nr. 5 EStG). Die Fuenftelregelung wird fuer Direktversicherung, Pensionskasse und Pensionsfonds regelmaessig nicht gewaehrt.',
  };
}

/**
 * Beitragspflicht einer bAV-Kapitalleistung in der KV/PV:
 * 1/120 des Betrags gilt fuer 120 Monate als monatlicher Versorgungsbezug
 * (§ 229 Abs. 1 S. 3 SGB V). Diese Regel hatte der Prototyp korrekt.
 */
export function bavKapitalMonatswert(kapital: number): { monatswert: number; monate: number } {
  return { monatswert: Math.max(0, kapital) / 120, monate: 120 };
}

/**
 * Riester: Mindesteigenbeitrag § 86 EStG.
 * 4 % des rentenversicherungspflichtigen Vorjahreseinkommens abzueglich der
 * Zulagen, mindestens der Sockelbetrag. Wird er unterschritten, werden die
 * Zulagen anteilig gekuerzt — der klassische Riester-Fallstrick, den der
 * Prototyp nicht abbildete (Befund C9).
 */
export function riesterZulagenkuerzung(
  args: { eigenbeitragJahr: number; vorjahresbruttoRvPflichtig: number; zulagenGesamt: number },
  p: LegalParameters,
): { faktor: number; mindesteigenbeitrag: number; gekuerzt: boolean } {
  const soll = Math.max(
    p.riester.sockelbetrag,
    args.vorjahresbruttoRvPflichtig * p.riester.mindesteigenbeitragQuote - args.zulagenGesamt,
  );
  if (args.eigenbeitragJahr >= soll) return { faktor: 1, mindesteigenbeitrag: soll, gekuerzt: false };
  const faktor = soll > 0 ? Math.max(0, args.eigenbeitragJahr / soll) : 0;
  return { faktor, mindesteigenbeitrag: soll, gekuerzt: true };
}

/** Riester-Zulagen eines Jahres. */
export function riesterZulagen(
  kinder: readonly { geburtsjahr: number }[],
  jahr: number,
  p: LegalParameters,
): number {
  let z = p.riester.grundzulage;
  for (const k of kinder) {
    const alter = jahr - k.geburtsjahr;
    if (alter >= 0 && alter < 25) {
      z += k.geburtsjahr >= 2008 ? p.riester.kinderzulageAb2008 : p.riester.kinderzulageVor2008;
    }
  }
  return z;
}
