import type { LegalParameters } from './types.js';
import { BELEGTE_JAHRE, BASISJAHR, VORABWERTE, type Vorabwerte } from './jahre.js';

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
  /**
   * INDIVIDUELLER Zusatzbeitrag der Krankenkasse, z. B. 0.031 fuer 3,1 %.
   *
   * Der Rechtsstand kennt nur den durchschnittlichen Zusatzbeitrag, den das
   * Bundesministerium jaehrlich festsetzt. Die Kassen weichen davon nach oben
   * und unten ab, und der Unterschied ist kein Rundungsfehler: ein Punkt
   * Zusatzbeitrag sind auf ein Jahresbrutto von 60.000 EUR rund 300 EUR.
   *
   * Fehlt die Angabe, bleibt es beim gesetzlichen Durchschnitt. Der Satz gilt
   * fuer alle Jahre der Projektion — er wird wie jeder andere Prozentsatz
   * nicht fortgeschrieben.
   */
  zusatzbeitrag?: number;
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
    // Folgt gesetzlich der knappschaftlichen Beitragsbemessungsgrenze und
    // damit derselben Entwicklung wie die uebrigen Grenzbetraege.
    hoechstbetragAltersvorsorge: r(basis.hoechstbetragAltersvorsorge),
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
    // Die Grenzen der Steuerklasse V folgen dem Tarif; der Entlastungsbetrag
    // fuer Alleinerziehende ist ein fester Betrag ohne Indexierung.
    lohnsteuer: {
      ...basis.lohnsteuer,
      w1Stkl5: r(basis.lohnsteuer.w1Stkl5),
      w2Stkl5: r(basis.lohnsteuer.w2Stkl5),
      w3Stkl5: r(basis.lohnsteuer.w3Stkl5),
    },
    riester: { ...basis.riester },
    // Die Zulagen des Altersvorsorgedepots sind feste Euro-Betraege ohne
    // gesetzliche Indexierung — sie werden bewusst nicht fortgeschrieben.
    avd: { ...basis.avd },
  };
}

/**
 * Vorabwerte, die fuer `jahr` gelten: nach dem Basisjahr bekannt geworden und
 * nicht juenger als `jahr`. Aufsteigend — spaetere ueberschreiben fruehere.
 * Vorabwerte eines inzwischen belegten Jahres zaehlen nicht mehr.
 */
function vorabBis(jahr: number): Vorabwerte[] {
  return VORABWERTE
    .filter((v) => v.jahr > BASISJAHR.jahr && v.jahr <= jahr)
    .sort((a, b) => a.jahr - b.jahr);
}

/**
 * Legt die Vorabwerte ueber ein fortgeschriebenes Jahr.
 *
 * Nur die GENANNTEN Felder wechseln: Sie kommen aus dem Vorab-Jahr und werden
 * von dort mit demselben Index und denselben Rundungen fortgeschrieben wie
 * alles andere (`skaliere`). Die uebrigen Felder bleiben, wie sie aus dem
 * Basisjahr kommen — sonst haetten alle spaeteren Jahre einen anderen
 * Steuertarif, nur weil eine Beitragsbemessungsgrenze frueher bekannt wurde.
 */
function mitVorab(p: LegalParameters, v: Vorabwerte, indexRate: number): LegalParameters {
  const { kv, pv, ...einfach } = v.werte;
  const basis: LegalParameters = {
    ...BASISJAHR,
    ...einfach,
    kv: { ...BASISJAHR.kv, ...kv },
    pv: { ...BASISJAHR.pv, ...pv },
    jahr: v.jahr,
  };
  const ausVorab = skaliere(basis, p.jahr, indexRate);
  const neu: LegalParameters = {
    ...p,
    // Saetze werden nicht fortgeschrieben — sie gelten ab dem Vorab-Jahr unveraendert.
    kv: { ...p.kv, ...kv },
    pv: { ...p.pv, ...pv },
    quelle: `${p.quelle}; ${v.quelle}`,
  };
  for (const feld of Object.keys(einfach) as (keyof typeof einfach)[]) neu[feld] = ausVorab[feld];
  return neu;
}

/** Ein Jahr jenseits des Basisjahrs: fortgeschrieben, darueber die vorab bekannten Werte. */
function fortgeschrieben(jahr: number, indexRate: number): LegalParameters {
  return vorabBis(jahr).reduce(
    (p, v) => mitVorab(p, v, indexRate),
    skaliere(BASISJAHR, jahr, indexRate),
  );
}

/**
 * Liefert den Parametersatz fuer ein Kalenderjahr.
 * Belegte Jahre werden exakt zurueckgegeben, alles danach fortgeschrieben —
 * mit den vorab bekannten Werten des Folgejahres, wo es sie gibt (`VORABWERTE`).
 * Jahre VOR dem fruehesten belegten Stand nutzen diesen unveraendert.
 */
export function parameterFuer(jahr: number, fs: Fortschreibung): LegalParameters {
  return mitZusatzbeitrag(basisParameter(jahr, fs), fs.zusatzbeitrag);
}

/**
 * Der individuelle Zusatzbeitrag ersetzt den durchschnittlichen.
 *
 * EIN Eingriff an EINER Stelle: Alle Rechnungen lesen den Satz aus den
 * Parametern — Erwerbsphase, Ruhestand, Vertrags-TUEV, Arbeitgeberzuschuss
 * zur PKV. Ihn hier zu setzen erspart es, jede dieser Stellen einzeln zu
 * unterrichten, und schliesst aus, dass eine davon vergessen wird.
 */
function mitZusatzbeitrag(p: LegalParameters, satz: number | undefined): LegalParameters {
  if (satz === undefined || satz === p.kv.zusatzbeitrag) return p;
  return { ...p, kv: { ...p.kv, zusatzbeitrag: Math.max(0, satz) } };
}

function basisParameter(jahr: number, fs: Fortschreibung): LegalParameters {
  const exakt = belegtNachJahr.get(jahr);
  if (exakt) return exakt;

  const fruehestes = BELEGTE_JAHRE[0]!;
  if (jahr < fruehestes.jahr) return { ...fruehestes, jahr, extrapoliert: true, quelle: `Rechtsstand ${fruehestes.jahr} rückwirkend angewandt` };

  return fortgeschrieben(jahr, fs.indexRate);
}

/** Der gesetzliche Durchschnitt — Vorbelegung fuer die Eingabe. */
export function durchschnittlicherZusatzbeitrag(jahr: number): number {
  return basisParameter(jahr, { indexRate: 0 }).kv.zusatzbeitrag;
}

/** Beschreibung des verwendeten Rechtsstands fuer Anzeige und PDF. */
export interface RechtsstandInfo {
  basisjahr: number;
  letztesBelegtesJahr: number;
  indexRate: number;
  /** Jahre, fuer die fortgeschrieben wurde (leer, wenn alles belegt ist) */
  fortgeschriebenAb: number | null;
  /**
   * Vorab bekannte Werte eines noch nicht belegten Jahres, die in der
   * Fortschreibung schon stecken — je Jahr ein Satz. Leer, wenn es keine gibt
   * oder die Rechnung nicht so weit reicht.
   */
  vorab: { jahr: number; text: string }[];
  text: string;
}

export function rechtsstandInfo(bisJahr: number, fs: Fortschreibung): RechtsstandInfo {
  const letztes = BASISJAHR.jahr;
  const fortgeschriebenAb = bisJahr > letztes ? letztes + 1 : null;
  const pct = (fs.indexRate * 100).toLocaleString('de-DE', { maximumFractionDigits: 2 });
  const vorab = vorabBis(bisJahr).map((v) => ({ jahr: v.jahr, text: v.text }));
  const dazu = vorab.length ? `. ${vorab.map((v) => v.text).join(' ')}` : '';
  return {
    basisjahr: letztes,
    letztesBelegtesJahr: letztes,
    indexRate: fs.indexRate,
    fortgeschriebenAb,
    vorab,
    text: fortgeschriebenAb
      ? `Rechtsstand ${letztes}; ab ${fortgeschriebenAb} mit ${pct} % p. a. fortgeschrieben${dazu}`
      : `Rechtsstand ${letztes}`,
  };
}

export { BELEGTE_JAHRE, BASISJAHR, VORABWERTE };
export type { Vorabwerte };
