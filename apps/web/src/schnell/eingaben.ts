import {
  alterExakt, heute, parameterFuer, parseDatum, projiziere, regelaltersrentenbeginn,
  schaetzeEntgeltpunkte, toDe, type ProjektionsErgebnis,
} from '@renten/engine';
import { szenarioSchema, type SzenarioParsed } from '@renten/schema';
import { STANDARD_OFFEN, standardSzenario } from '../store/standard';
import { nettoHeuteMonat } from '../features/bezug';

/**
 * DIE SCHNELLRECHNUNG — sechs Angaben, der Rest wie ein neuer Fall im Rechner.
 *
 * Bewusst KEINE eigene Rechnung: Aus den Angaben wird dasselbe Szenario wie
 * im Rechner, und dieselbe Projektion rechnet es. Nur so stimmen die Zahlen
 * mit dem vollen Rechner ueberein — und nur so kann der Fall nach der
 * Anmeldung unveraendert dort weiterlaufen (Musterfall).
 *
 * Alles Uebrige sind die Standardwerte eines neuen Falls, sichtbar als
 * Annahmen: alleinstehend, angestellt, gesetzlich versichert (KVdR) mit dem
 * durchschnittlichen Zusatzbeitrag, keine weiteren Vertraege.
 */

export type SchnellFeld = 'geburtsdatum' | 'bundesland' | 'kirchensteuer' | 'brutto' | 'rente' | 'ziel';

export interface SchnellEingaben {
  /** TT.MM.JJJJ */
  geburtsdatum: string;
  bundesland: string;
  kirchensteuer: boolean;
  bruttoMonat: number;
  /** Rente laut Renteninformation — null: geschaetzt aus Einkommen und Alter */
  rente: number | null;
  /** Zielnetto in heutiger Kaufkraft — null: Faustregel 80 % des heutigen Nettos */
  ziel: number | null;
}

/** Das Beispiel beim ersten Aufruf — dasselbe wie ein neuer Fall im Rechner. */
export const SCHNELL_BEISPIEL: SchnellEingaben = {
  geburtsdatum: '01.01.1985',
  bundesland: 'Baden-Württemberg',
  kirchensteuer: false,
  bruttoMonat: 4000,
  rente: null,
  ziel: null,
};

/** Faustregel fuer das Ziel, wie der Vorschlag im Rechner: 80 % des heutigen Nettos, auf 50 EUR. */
export const ZIEL_FAUSTREGEL = 0.8;

/** Welcher Pfad des Szenarios zu welchem Feld gehoert — fuer die Marken im Musterfall. */
const PFAD: Record<SchnellFeld, string> = {
  geburtsdatum: 'personen.A.geburtsdatum',
  bundesland: 'haushalt.bundesland',
  kirchensteuer: 'haushalt.kirchensteuer',
  brutto: 'einkommenHeute.betrag',
  rente: 'personen.A.grvBruttoHeute',
  ziel: 'haushalt.zielNettoHeute',
};

/**
 * Die gesetzliche Rente geschaetzt — dieselbe Schaetzung wie der
 * Karriere-Schaetzer im Rechner: heutige Kaufkraft, ohne Zu- und Abschlaege.
 */
export function renteGeschaetzt(e: SchnellEingaben): number {
  const geburt = parseDatum(e.geburtsdatum);
  if (!geburt || e.bruttoMonat <= 0) return 0;
  const jetzt = heute();
  const p = parameterFuer(jetzt.jahr, { indexRate: 0.01 });
  const beginn = regelaltersrentenbeginn(geburt);
  const s = schaetzeEntgeltpunkte(e.bruttoMonat * 12, alterExakt(geburt, jetzt), alterExakt(geburt, beginn), p);
  return Math.round(s.monatsrenteHeutigeKaufkraft);
}

function szenario(e: SchnellEingaben, zielHeute: number, rente: number, angefasst: ReadonlySet<SchnellFeld>): SzenarioParsed {
  const s = standardSzenario();
  const geburtsdatum = parseDatum(e.geburtsdatum) ? e.geburtsdatum : SCHNELL_BEISPIEL.geburtsdatum;
  const rentenbeginn = toDe(regelaltersrentenbeginn(parseDatum(geburtsdatum)!));
  /*
    Was angefasst wurde, ist geprueft; der Rest bleibt Beispiel- oder
    Standardwert — auch im Musterfall nach der Anmeldung. Eine GESCHAETZTE
    Rente und das Ziel aus der Faustregel bleiben Beispielwerte: Sie sind
    nicht die Angaben des Mandanten.
  */
  const gesetzt = [...angefasst].filter((f) => (f === 'rente' ? e.rente !== null : f === 'ziel' ? e.ziel !== null : true));
  const offen = STANDARD_OFFEN.filter((p) => !gesetzt.some((f) => PFAD[f] === p));
  return szenarioSchema.parse({
    ...s,
    haushalt: { ...s.haushalt, bundesland: e.bundesland, kirchensteuer: e.kirchensteuer, zielNettoHeute: zielHeute },
    einkommenHeute: { ...s.einkommenHeute, modus: 'brutto', betrag: e.bruttoMonat, auszahlungen: 12 },
    personen: [{
      ...s.personen[0]!, geburtsdatum, rentenbeginn, rentenbeginnManuell: false, grvBruttoHeute: rente,
    }],
    offen,
  });
}

export interface SchnellErgebnis {
  szenario: SzenarioParsed;
  ergebnis: ProjektionsErgebnis;
  /** Die Zeile des Rentenbeginns — wie die Uebersicht im Rechner */
  zeile: ProjektionsErgebnis['zeilen'][number];
  nettoHeute: number;
  rente: number;
  renteGeschaetzt: boolean;
  zielHeute: number;
  zielAusFaustregel: boolean;
}

/**
 * Rechnet die Schnellrechnung — zweimal die Projektion des Rechners: einmal
 * fuer das heutige Netto (die Grundlage der Faustregel), einmal mit dem Ziel.
 * Je Projektion wenige Millisekunden.
 */
export function schnellRechnen(e: SchnellEingaben, angefasst: ReadonlySet<SchnellFeld> = new Set()): SchnellErgebnis | null {
  const rente = e.rente ?? renteGeschaetzt(e);
  const vorlaeufig = projiziere(szenario(e, e.ziel ?? 2000, rente, angefasst));
  const nettoHeute = nettoHeuteMonat(vorlaeufig);
  const zielHeute = e.ziel ?? Math.round((nettoHeute * ZIEL_FAUSTREGEL) / 50) * 50;
  const s = szenario(e, zielHeute, rente, angefasst);
  const ergebnis = projiziere(s);
  // Dieselbe Wahl des Jahres wie die Uebersicht im Rechner (`App.tsx`): das Jahr des Rentenbeginns.
  const beginnJahr = parseDatum(s.personen[0]!.rentenbeginn)?.jahr;
  const zeile = ergebnis.zeilen.find((z) => z.jahr === beginnJahr)
    ?? ergebnis.zeilen.find((z) => z.jahr === ergebnis.ruhestandsjahr)
    ?? ergebnis.zeilen.find((z) => z.vollstaendigImRuhestand);
  if (!zeile) return null;
  return {
    szenario: s, ergebnis, zeile, nettoHeute,
    rente, renteGeschaetzt: e.rente === null,
    zielHeute, zielAusFaustregel: e.ziel === null,
  };
}
