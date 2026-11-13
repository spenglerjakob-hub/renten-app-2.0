/**
 * WO EIN ABLAUF AUS STUECKEN STEHT — die reine Logik zu `components/Ablauf.tsx`.
 *
 * Eine Etappe der Beratung besteht aus Stuecken. Auf dem WEG liegt, was der
 * Reihe nach erklaert wird: Es ist immer genau ein Stueck offen, „Weiter“
 * zeigt das naechste, das vorige wird zur Zeile mit seinem Ergebnis. Was man
 * noch nicht erreicht hat, steht noch nicht da.
 *
 * VERTIEFUNGEN gehoeren nicht zum Weg: Sie stehen erst am Ende als Zeilen
 * da und oeffnen sich nur auf Wunsch — Steuer, Rechtsstand, die Pruefung
 * bestehender Vertraege. So bleibt der Weg kurz, und nichts fehlt.
 */

export interface StueckeStand {
  /** Das offene Stueck — null: das erste des Wegs */
  offen: string | null;
  /** Das weiteste erreichte Stueck des Wegs — null: nur das erste */
  weit: string | null;
}

export const STUECKE_ANFANG: StueckeStand = { offen: null, weit: null };

export interface StueckKern {
  id: string;
  /** Kein Teil des Wegs — steht erst am Ende als Zeile da */
  vertiefung?: boolean;
}

export interface StueckeLage<T extends StueckKern> {
  weg: T[];
  tiefer: T[];
  offen: T | null;
  /** Index des weitesten erreichten Stuecks im Weg */
  weit: number;
  /** Ist der Weg bis zum Ende gegangen? Erst dann stehen die Vertiefungen da. */
  amEnde: boolean;
  /** Das Stueck nach dem offenen — null am Ende des Wegs und in einer Vertiefung */
  naechstes: T | null;
}

/**
 * @param durch Die Etappe liegt schon hinter einem — dann gilt der ganze Weg
 *   als erreicht, auch wenn (nach dem Neuladen) kein Stand gemerkt ist.
 */
export function stueckeLage<T extends StueckKern>(
  stuecke: readonly T[], stand: StueckeStand, durch = false,
): StueckeLage<T> {
  const weg = stuecke.filter((x) => !x.vertiefung);
  const tiefer = stuecke.filter((x) => x.vertiefung);
  // Ein Stueck, das es nicht mehr gibt (die Luecke ist geschlossen), faellt auf den Anfang zurueck.
  const offen = stuecke.find((x) => x.id === stand.offen) ?? weg[0] ?? tiefer[0] ?? null;
  const iOffen = offen ? weg.indexOf(offen) : -1;
  const inVertiefung = offen !== null && iOffen < 0;
  const weit = Math.max(
    0,
    durch || inVertiefung ? weg.length - 1 : 0,
    weg.findIndex((x) => x.id === stand.weit),
    iOffen,
  );
  return {
    weg,
    tiefer,
    offen,
    weit,
    amEnde: weit >= weg.length - 1,
    naechstes: iOffen >= 0 ? weg[iOffen + 1] ?? null : null,
  };
}

/** Der Stand, nachdem ein Stueck geoeffnet wurde: Erreichtes bleibt erreicht. */
export function nachOeffnen<T extends StueckKern>(
  stuecke: readonly T[], stand: StueckeStand, id: string, durch = false,
): StueckeStand {
  // Erst, wo man steht (auch ein von aussen gesetztes offenes Stueck zaehlt), dann der Schritt.
  const jetzt = stueckeLage(stuecke, stand, durch);
  const dann = stueckeLage(stuecke, { offen: id, weit: jetzt.weg[jetzt.weit]?.id ?? null }, durch);
  return { offen: dann.offen?.id ?? null, weit: dann.weg[dann.weit]?.id ?? null };
}

/**
 * Wie viele Etappen dastehen: alle bis zur weitesten erreichten — die offene
 * an ihrer Stelle dazwischen, die uebrigen als Zeilen.
 *
 * @param offen Index der offenen Etappe
 * @param weit Index der weitesten erreichten
 */
export function erreichteEtappen(anzahl: number, offen: number, weit: number): number {
  return Math.min(anzahl, Math.max(weit, offen, 0) + 1);
}
