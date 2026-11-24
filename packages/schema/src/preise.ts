/**
 * Preise des Abos — die EINZIGE Stelle, an der Zahlen stehen.
 *
 * Die Preisseite rechnet damit, spaeter auch Sperrseite und das Fenster
 * "Abo & Team". Der Abgleich mit Stripe bekommt genau diese Staffeln
 * geschickt; in Edge Functions steht kein Preis. Aendert sich ein Preis, dann
 * hier — und danach in "Abo & Team" die Preise in Stripe abgleichen.
 * Bestehende Abos behalten ihren Preis, bis man sie bewusst umstellt.
 *
 * ZWEI PREISE JE PAKET: der regulaere (`monat`) und der EINSTEIGERPREIS
 * (`einsteiger`), der bis EINSTEIGER_BIS gilt. `preisJeNutzer` und alles, was
 * darauf rechnet, liefert den Preis, der am Stichtag GILT — die Seiten und der
 * Abgleich mit Stripe rechnen so von selbst mit dem richtigen. Den regulaeren
 * daneben zeigt `regulaerJeNutzer`.
 *
 * NACH DEM 31.12.2027 nennt die Preisseite von selbst den regulaeren Preis.
 * Stripe zieht nicht von selbst nach: in "Abo & Team" die Preise abgleichen
 * (neue Buchungen) und die laufenden Abos auf den neuen Preis umstellen —
 * monatliche zum ersten Zeitraum 2028, jaehrliche zur ersten Verlaengerung.
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
  /** Regulaerer Preis je Nutzer und Monat in Euro, netto — je Staffel aus STAFFEL_AB */
  monat: readonly [number, number, number, number];
  /** Einsteigerpreis je Nutzer und Monat, netto — gilt bis EINSTEIGER_BIS, je Staffel */
  einsteiger: readonly [number, number, number, number];
  empfohlen?: boolean;
}

export const PAKETE: readonly Paket[] = [
  {
    id: 'alles',
    name: 'All inklusive',
    kurz: 'Rentenplanung und Arbeitgeber-Vorsorgemodelle in einem Paket.',
    bereiche: ['rente', 'ag'],
    monat: [59, 53, 50, 47],
    einsteiger: [49, 44, 42, 39],
    empfohlen: true,
  },
  {
    id: 'rente',
    name: 'Rentenplanung',
    kurz: 'Versorgungsanalyse, Lösungsvorschlag, Gutachten und Vorsorge-Check.',
    bereiche: ['rente'],
    monat: [39, 35, 33, 31],
    einsteiger: [35, 32, 30, 28],
  },
  {
    id: 'ag',
    name: 'Arbeitgeber-Vorsorgemodelle',
    kurz: 'Matching-, Zuschuss- und Festbetrag-Modell sowie bKV für Arbeitgeber.',
    bereiche: ['ag'],
    monat: [29, 26, 25, 23],
    einsteiger: [25, 23, 21, 20],
  },
];

/** Der Jahrespreis in Monatspreisen — 10 heisst "zwei Monate gratis". */
export const JAHR_MONATE = 10;
/**
 * Der Einsteigerpreis gilt fuer Zeitraeume, die bis zu diesem Tag beginnen
 * (JJJJ-MM-TT, deutsche Zeit) — das erste Jahr des Abos. Danach gilt der
 * regulaere Preis: monatlich ab dem ersten Zeitraum danach, jaehrlich ab der
 * ersten Verlaengerung.
 */
export const EINSTEIGER_BIS = '2027-12-31';
/** Tage der kostenlosen Testphase. Muss zu `privat.einstellungen.testtage` passen. */
export const TESTTAGE = 30;
/** Bis hierhin wird online gebucht, darueber gibt es ein Angebot. */
export const MAX_NUTZER = 50;
/**
 * Early Adopter: Monate kostenlos ab dem Start (muss zu `privat.fruehstarter.monate`
 * passen) und der Dank danach — Rabatt in Prozent auf das erste Jahr, als Gutschein
 * bei Stripe (Schritt 4).
 *
 * Nur noch ein stilles Werkzeug des Betreibers: Er vergibt persoenliche Links
 * ("Abo & Team"). Auf der Preisseite steht das Angebot nicht mehr, anfragen
 * laesst es sich dort nicht.
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

/** Der Kalendertag in Deutschland, JJJJ-MM-TT — an Silvester zaehlt die deutsche Uhr, nicht die des Rechners. */
function tagInDeutschland(d: Date): string {
  const teile = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const teil = (art: string) => teile.find((t) => t.type === art)?.value ?? '';
  return `${teil('year')}-${teil('month')}-${teil('day')}`;
}

/** Gilt an diesem Tag noch der Einsteigerpreis? */
export function einsteigerGilt(heute: Date = new Date()): boolean {
  return tagInDeutschland(heute) <= EINSTEIGER_BIS;
}

/** EINSTEIGER_BIS zum Lesen: "31.12.2027". */
export function einsteigerBisText(): string {
  return EINSTEIGER_BIS.split('-').reverse().join('.');
}

const jeIntervall = (monat: number, intervall: Intervall) => (intervall === 'jahr' ? monat * JAHR_MONATE : monat);

/**
 * Der GELTENDE Preis je Nutzer fuer ein Intervall — ein Monat oder ein ganzes
 * Jahr: bis EINSTEIGER_BIS der Einsteigerpreis, danach der regulaere.
 */
export function preisJeNutzer(id: PaketId, intervall: Intervall, nutzer: number, heute: Date = new Date()): number {
  const p = paketVon(id);
  const i = staffelIndex(nutzer);
  return jeIntervall((einsteigerGilt(heute) ? p.einsteiger : p.monat)[i]!, intervall);
}

/** Der regulaere Preis je Nutzer — steht neben dem Einsteigerpreis und gilt nach ihm. */
export function regulaerJeNutzer(id: PaketId, intervall: Intervall, nutzer: number): number {
  return jeIntervall(paketVon(id).monat[staffelIndex(nutzer)]!, intervall);
}

/** Summe fuer alle Nutzer des Bueros, je Intervall. */
export function gesamtpreis(id: PaketId, intervall: Intervall, nutzer: number, heute: Date = new Date()): number {
  return preisJeNutzer(id, intervall, nutzer, heute) * ganz(nutzer);
}

/** Was der Mengenrabatt im Intervall spart — gegenueber dem Einzelpreis. */
export function ersparnis(id: PaketId, intervall: Intervall, nutzer: number, heute: Date = new Date()): number {
  return preisJeNutzer(id, intervall, 1, heute) * ganz(nutzer) - gesamtpreis(id, intervall, nutzer, heute);
}

/** Was die Jahreszahlung je Nutzer spart — gegenueber zwoelf Monatszahlungen. */
export function jahresvorteil(id: PaketId, nutzer: number, heute: Date = new Date()): number {
  return preisJeNutzer(id, 'monat', nutzer, heute) * 12 - preisJeNutzer(id, 'jahr', nutzer, heute);
}

/** Lookup-Key des Stripe-Preises, z. B. `alles_monat`. */
export function lookupKey(id: PaketId, intervall: Intervall): string {
  return `${id}_${intervall}`;
}

/**
 * Die Staffeln fuer Stripe (billing_scheme "tiered", tiers_mode "volume"),
 * Betraege in Cent. Jede Staffel reicht bis eins vor die naechste; die
 * letzte ist nach oben offen. Der GELTENDE Preis: Wer bis EINSTEIGER_BIS
 * abgleicht, legt in Stripe den Einsteigerpreis an.
 */
export function stripeStaffeln(
  id: PaketId, intervall: Intervall, heute: Date = new Date(),
): { up_to: number | 'inf'; unit_amount: number }[] {
  return STAFFEL_AB.map((ab, i) => ({
    up_to: i + 1 < STAFFEL_AB.length ? STAFFEL_AB[i + 1]! - 1 : 'inf',
    unit_amount: Math.round(preisJeNutzer(id, intervall, ab, heute) * 100),
  }));
}

/** Schaltet das Paket diesen Teil der Anwendung frei? */
export function paketDeckt(id: PaketId | null | undefined, bereich: Bereich): boolean {
  return !!id && paketVon(id).bereiche.includes(bereich);
}
