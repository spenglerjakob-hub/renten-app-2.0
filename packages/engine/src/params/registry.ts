import type { LegalParameters } from './types.js';
import { BELEGTE_JAHRE, BASISJAHR } from './jahre.js';

/**
 * Fortschreibungsannahme fuer Jahre jenseits des letzten belegten Rechtsstands.
 *
 * Der Gesetzgeber passt Tarifeckwerte, Beitragsbemessungsgrenzen und
 * Bezugsgroessen regelmaessig an die Lohnentwicklung an ("Tarif auf Raedern").
 * Die Projektion unterstellt genau das: Alle EURO-Betraege werden mit dem
 * gewaehlten Index fortgeschrieben, alle PROZENT-Saetze bleiben konstant.
 *
 * Ohne Fortschreibung (Index 0 %) rutschen Rentner allein durch die
 * nominale Rentendynamik in immer hoehere Tarifzonen — das ist die "kalte
 * Progression". Mit Index = Rentendynamik bleibt die Belastung real konstant.
 * Beides sind Annahmen, keine Prognosen; welche gewaehlt wurde, weist das
 * Ergebnis in `rechtsstand` aus und der PDF-Druck erlaeutert sie ausfuehrlich.
 */
export interface Fortschreibung {
  /** Jaehrliche Indexierung aller Euro-Betraege, z. B. 0.02 fuer 2 % p. a. */
  indexRate: number;
}

const belegtNachJahr = new Map<number, LegalParameters>(
  BELEGTE_JAHRE.map((p) => [p.jahr, p]),
);

function skaliere(basis: LegalParameters, jahr: number, indexRate: number): LegalParameters {
  const jahre = jahr - basis.jahr;
  const f = Math.pow(1 + indexRate, jahre);
  // Tarifeckwerte werden auf volle Euro gerundet, wie es der Gesetzgeber tut.
  const r = (v: number) => Math.round(v * f);

  return {
    ...basis,
    jahr,
    extrapoliert: true,
    quelle:
      indexRate === 0
        ? `fortgeschrieben aus ${basis.jahr} ohne Indexierung (nominal eingefroren)`
        : `fortgeschrieben aus ${basis.jahr} mit ${(indexRate * 100).toLocaleString('de-DE', { maximumFractionDigits: 2 })} % p. a.`,
    est: {
      grundfreibetrag: r(basis.est.grundfreibetrag),
      zone2Ende: r(basis.est.zone2Ende),
      zone3Ende: r(basis.est.zone3Ende),
      zone4Ende: r(basis.est.zone4Ende),
    },
    soli: {
      ...basis.soli,
      freigrenze: r(basis.soli.freigrenze),
      milderungszoneEnde: r(basis.soli.milderungszoneEnde),
    },
    bbgKvJahr: r(basis.bbgKvJahr),
    bbgRvJahr: r(basis.bbgRvJahr),
    bezugsgroesseMonat: basis.bezugsgroesseMonat * f,
    rentenwert: basis.rentenwert * f,
    durchschnittsentgelt: basis.durchschnittsentgelt * f,
    pauschbetraege: {
      arbeitnehmer: r(basis.pauschbetraege.arbeitnehmer),
      versorgungsbezuege: r(basis.pauschbetraege.versorgungsbezuege),
      renten: r(basis.pauschbetraege.renten),
      sonderausgaben: r(basis.pauschbetraege.sonderausgaben),
      sparer: r(basis.pauschbetraege.sparer),
    },
    riester: { ...basis.riester },
    // Die Zulagen des Altersvorsorgedepots sind feste Euro-Betraege ohne
    // gesetzliche Indexierung — sie werden bewusst nicht fortgeschrieben.
    avd: { ...basis.avd },
  };
}

/**
 * Liefert den Parametersatz fuer ein Kalenderjahr.
 * Belegte Jahre werden exakt zurueckgegeben, alles danach fortgeschrieben.
 * Jahre VOR dem fruehesten belegten Stand nutzen diesen unveraendert.
 */
export function parameterFuer(jahr: number, fs: Fortschreibung): LegalParameters {
  const exakt = belegtNachJahr.get(jahr);
  if (exakt) return exakt;

  const fruehestes = BELEGTE_JAHRE[0]!;
  if (jahr < fruehestes.jahr) return { ...fruehestes, jahr, extrapoliert: true, quelle: `Rechtsstand ${fruehestes.jahr} rueckwirkend angewandt` };

  return skaliere(BASISJAHR, jahr, fs.indexRate);
}

/** Beschreibung des verwendeten Rechtsstands fuer Anzeige und PDF. */
export interface RechtsstandInfo {
  basisjahr: number;
  letztesBelegtesJahr: number;
  indexRate: number;
  /** Jahre, fuer die fortgeschrieben wurde (leer, wenn alles belegt ist) */
  fortgeschriebenAb: number | null;
  text: string;
}

export function rechtsstandInfo(bisJahr: number, fs: Fortschreibung): RechtsstandInfo {
  const letztes = BASISJAHR.jahr;
  const fortgeschriebenAb = bisJahr > letztes ? letztes + 1 : null;
  const pct = (fs.indexRate * 100).toLocaleString('de-DE', { maximumFractionDigits: 2 });
  return {
    basisjahr: letztes,
    letztesBelegtesJahr: letztes,
    indexRate: fs.indexRate,
    fortgeschriebenAb,
    text: fortgeschriebenAb
      ? `Rechtsstand ${letztes}; ab ${fortgeschriebenAb} mit ${pct} % p. a. fortgeschrieben`
      : `Rechtsstand ${letztes}`,
  };
}

export { BELEGTE_JAHRE, BASISJAHR };
