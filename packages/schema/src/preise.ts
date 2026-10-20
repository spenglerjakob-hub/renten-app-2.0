/**
 * Preise des Abos — die EINZIGE Stelle, an der Zahlen stehen.
 *
 * Die Preisseite rechnet damit, spaeter auch Sperrseite und das Fenster
 * "Abo & Team". Der Abgleich mit Stripe bekommt genau diese Staffeln
 * geschickt; in Edge Functions steht kein Preis. Aendert sich ein Preis, dann
 * hier — und danach in "Abo & Team" die Preise in Stripe abgleichen.
 * Bestehende Abos behalten ihren Preis, bis man sie bewusst umstellt.
 *
 * Alle Betraege netto, in Euro je Nutzer und Monat.
 */

export type PaketId = 'alles' | 'rente' | 'ag';
/** Teile der Anwendung, die ein Paket freischaltet. */
export type Bereich = 'rente' | 'ag';
export type Intervall = 'monat' | 'jahr';

/**
 * Ab wie vielen Nutzern eine Staffel gilt. Der Preis der erreichten Staffel
 * gilt fuer ALLE Nutzer des Bueros (in Stripe: tiers_mode "volume").
 */
export const STAFFEL_AB = [1, 3, 5, 8] as const;

export interface Paket {
  id: PaketId;
  name: string;
  /** Ein Satz fuer Karten und Auswahl */
  kurz: string;
  bereiche: readonly Bereich[];
  /** Preis je Nutzer und Monat in Euro, netto — je Staffel aus STAFFEL_AB */
  monat: readonly [number, number, number, number];
  empfohlen?: boolean;
}

export const PAKETE: readonly Paket[] = [
  {
    id: 'alles',
    name: 'All inklusive',
    kurz: 'Rentenplanung und Arbeitgeber-Vorsorgemodelle in einem Paket.',
    bereiche: ['rente', 'ag'],
    monat: [59, 53, 50, 47],
    empfohlen: true,
  },
  {
    id: 'rente',
    name: 'Rentenplanung',
    kurz: 'Versorgungsanalyse, Lösungsvergleich, Gutachten und Vorsorge-Check.',
    bereiche: ['rente'],
    monat: [39, 35, 33, 31],
  },
  {
    id: 'ag',
    name: 'Arbeitgeber-Vorsorgemodelle',
    kurz: 'Matching-, Zuschuss- und Festbetrag-Modell sowie bKV für Arbeitgeber.',
    bereiche: ['ag'],
    monat: [29, 26, 25, 23],
  },
];

/** Der Jahrespreis in Monatspreisen — 10 heisst "zwei Monate gratis". */
export const JAHR_MONATE = 10;
/** Tage der kostenlosen Testphase. Muss zu `privat.einstellungen.testtage` passen. */
export const TESTTAGE = 14;
/** Bis hierhin wird online gebucht, darueber gibt es ein Angebot. */
export const MAX_NUTZER = 50;
/**
 * Early Adopter: Monate kostenlos ab dem Start (muss zu `privat.fruehstarter.monate`
 * passen) und der Dank danach — Rabatt in Prozent auf das erste Jahr, als Gutschein
 * bei Stripe (Schritt 4).
 */
export const FRUEHSTART_MONATE = 3;
export const FRUEHSTART_RABATT_PROZENT = 20;
/** Steuerhinweis zu allen Preisen. Kleinunternehmer: "gem. § 19 UStG ohne USt." */
export const UST_HINWEIS = 'zzgl. 19 % USt.';

export function paketVon(id: PaketId): Paket {
  const p = PAKETE.find((x) => x.id === id);
  if (!p) throw new Error(`Unbekanntes Paket: ${id}`);
  return p;
}

const ganz = (nutzer: number) => Math.max(1, Math.floor(nutzer));

/** Welche Staffel gilt bei dieser Nutzerzahl (Index in STAFFEL_AB)? */
export function staffelIndex(nutzer: number): number {
  const n = ganz(nutzer);
  let i = 0;
  STAFFEL_AB.forEach((ab, k) => { if (n >= ab) i = k; });
  return i;
}

/** Preis je Nutzer fuer ein Intervall — ein Monat oder ein ganzes Jahr. */
export function preisJeNutzer(id: PaketId, intervall: Intervall, nutzer: number): number {
  const m = paketVon(id).monat[staffelIndex(nutzer)]!;
  return intervall === 'jahr' ? m * JAHR_MONATE : m;
}

/** Summe fuer alle Nutzer des Bueros, je Intervall. */
export function gesamtpreis(id: PaketId, intervall: Intervall, nutzer: number): number {
  return preisJeNutzer(id, intervall, nutzer) * ganz(nutzer);
}

/** Was der Mengenrabatt im Intervall spart — gegenueber dem Einzelpreis. */
export function ersparnis(id: PaketId, intervall: Intervall, nutzer: number): number {
  return preisJeNutzer(id, intervall, 1) * ganz(nutzer) - gesamtpreis(id, intervall, nutzer);
}

/** Was die Jahreszahlung je Nutzer spart — gegenueber zwoelf Monatszahlungen. */
export function jahresvorteil(id: PaketId, nutzer: number): number {
  return preisJeNutzer(id, 'monat', nutzer) * 12 - preisJeNutzer(id, 'jahr', nutzer);
}

/** Lookup-Key des Stripe-Preises, z. B. `alles_monat`. */
export function lookupKey(id: PaketId, intervall: Intervall): string {
  return `${id}_${intervall}`;
}

/**
 * Die Staffeln fuer Stripe (billing_scheme "tiered", tiers_mode "volume"),
 * Betraege in Cent. Jede Staffel reicht bis eins vor die naechste; die
 * letzte ist nach oben offen.
 */
export function stripeStaffeln(id: PaketId, intervall: Intervall): { up_to: number | 'inf'; unit_amount: number }[] {
  return STAFFEL_AB.map((ab, i) => ({
    up_to: i + 1 < STAFFEL_AB.length ? STAFFEL_AB[i + 1]! - 1 : 'inf',
    unit_amount: Math.round(preisJeNutzer(id, intervall, ab) * 100),
  }));
}

/** Schaltet das Paket diesen Teil der Anwendung frei? */
export function paketDeckt(id: PaketId | null | undefined, bereich: Bereich): boolean {
  return !!id && paketVon(id).bereiche.includes(bereich);
}
