import {
  pkvImJahr, pkvVerlauf, arbeitgeberzuschuss, betVergleich, parameterFuer,
  type PkvJahr, type BetVergleich,
} from '@renten/engine';
import type { SzenarioParsed } from '../store/szenario';

/**
 * Die PKV-Rechnung, einmal fuer Bildschirm und Papier.
 *
 * Dieselbe Trennung wie bei `sparziel-berechnung.ts` und `tuev-berechnung.ts`:
 * die Rechnung steht hier, nicht im JSX. Der PKV-Rechner auf dem Bildschirm
 * und die Gutachtenseite muessen zwingend dieselben Zahlen zeigen.
 */

/** Lebenserwartung fuer die Entlastungstarif-Rechnung. */
export const LEBENSERWARTUNG = 85;

export interface PkvErgebnis {
  /** Alter von Person A heute */
  alterHeute: number;
  rentenjahr: number;
  alterBeiRentenbeginn: number;

  /** Praemie heute, im Rentenjahr und mit 80 — jeweils nominal */
  heute: PkvJahr;
  beiRente: PkvJahr;
  mitAchtzig: PkvJahr | null;

  /** Dieselben Betraege in heutiger Kaufkraft */
  beiRenteHeutigesGeld: number;
  mitAchtzigHeutigesGeld: number;

  /** Was der Arbeitgeber heute davon traegt (0 bei Beamten) */
  zuschussHeute: number;

  /** Der ganze Verlauf bis zur Lebenserwartung */
  verlauf: (PkvJahr & { jahr: number })[];

  /** Anteil der Praemie am Zielnetto des Rentenjahres */
  anteilAmZiel: number;

  bet: BetVergleich | null;
}

/**
 * Gibt `null` zurueck, wenn es nichts zu zeigen gibt — kein PKV-Status oder
 * keine Praemie. Dann entfaellt der Block, statt eine Nullrechnung zu drucken.
 */
export function pkvRechnen(
  szenario: SzenarioParsed,
  zielNettoMonatImRentenjahr: number,
): PkvErgebnis | null {
  const h = szenario.haushalt;
  if (h.kvStatus !== 'pkv' || h.pkv.praemieMonat <= 0) return null;

  const personA = szenario.personen[0];
  if (!personA) return null;

  const jetzt = new Date().getFullYear();
  const geburtsjahr = Number(personA.geburtsdatum.slice(-4));
  const rentenjahr = Number(personA.rentenbeginn.slice(-4));
  if (!Number.isFinite(geburtsjahr) || !Number.isFinite(rentenjahr)) return null;

  const alterHeute = jetzt - geburtsjahr;
  const alterBeiRentenbeginn = rentenjahr - geburtsjahr;

  const heute = pkvImJahr(h.pkv, alterHeute, 0);
  const beiRente = pkvImJahr(h.pkv, alterBeiRentenbeginn, rentenjahr - jetzt);
  const mitAchtzig = alterHeute < 80
    ? pkvImJahr(h.pkv, 80, geburtsjahr + 80 - jetzt)
    : null;

  /*
    Abgezinst wird mit der Inflation, nicht mit der Praemiensteigerung: die
    Frage ist, was die Praemie DANN in heutigem Geld wiegt — nicht, wie sie
    gewachsen ist.
  */
  const heutigesGeld = (betrag: number, jahr: number) =>
    betrag / Math.pow(1 + szenario.annahmen.inflation, jahr - jetzt);

  const p = parameterFuer(jetzt, {
    indexRate: szenario.annahmen.tarifIndex,
    zusatzbeitrag: szenario.haushalt.zusatzbeitrag,
  });
  const beamter = szenario.einkommenHeute.modus === 'besoldung';
  const jahresbrutto = szenario.einkommenHeute.betrag * szenario.einkommenHeute.auszahlungen;
  const zuschussHeute = beamter ? 0 : arbeitgeberzuschuss(heute.praemieMonat, jahresbrutto, p);

  return {
    alterHeute,
    rentenjahr,
    alterBeiRentenbeginn,
    heute,
    beiRente,
    mitAchtzig,
    beiRenteHeutigesGeld: heutigesGeld(beiRente.praemieMonat, rentenjahr),
    mitAchtzigHeutigesGeld: mitAchtzig
      ? heutigesGeld(mitAchtzig.praemieMonat, geburtsjahr + 80)
      : 0,
    zuschussHeute,
    verlauf: pkvVerlauf(h.pkv, geburtsjahr, jetzt, geburtsjahr + LEBENSERWARTUNG),
    /*
      Die Praemie steht im Geld des Rentenjahres, das Zielnetto ebenfalls —
      der Anteil ist damit ohne Umrechnung vergleichbar.
    */
    anteilAmZiel: zielNettoMonatImRentenjahr > 0
      ? beiRente.praemieMonat / zielNettoMonatImRentenjahr
      : 0,
    bet: h.pkv.bet.aktiv && h.pkv.bet.entlastungMonat > 0
      ? betVergleich(h.pkv.bet, alterHeute, LEBENSERWARTUNG)
      : null,
  };
}

/** Ab diesem Anteil am Zielnetto ist die Praemie ein eigenes Thema. */
export const SCHWELLE_ANTEIL = 0.15;
