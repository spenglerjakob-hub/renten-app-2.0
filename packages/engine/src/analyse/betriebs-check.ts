import type { LegalParameters } from '../params/types.js';
import {
  betriebUmstieg, festbetragModell, matchingModell, zuschussModell,
  type MatchingSteuer, type ModellBasis, type ModellKosten, type UmwandlungsWeg,
} from './matching-modell.js';
import { zuschussDeckel } from './bav-mitarbeiter.js';

/* ==========================================================================
 * BETRIEBS-CHECK — das Modell fuer die GANZE BELEGSCHAFT.
 *
 * Die Arbeitgeber-Seiten rechnen einen Beispiel-Mitarbeiter und nehmen ihn
 * mal n. Das stimmt nur, wenn alle gleich verdienen. Was der Arbeitgeber an
 * Sozialabgaben spart, haengt aber am Gehalt: Bis zur
 * Beitragsbemessungsgrenze der Krankenversicherung spart er alle vier
 * Zweige, darueber nur Renten- und Arbeitslosenversicherung, ueber der
 * Grenze der Rentenversicherung nichts mehr — der Zuschuss kostet dort
 * voll. Ein Betrieb mit vielen Gutverdienern zahlt je Kopf deutlich mehr als
 * einer mit Tariflohn.
 *
 * Hier rechnet jedes Modell (`zuschussModell`, `festbetragModell`,
 * `matchingModell`) je GEHALTSGRUPPE fuer einen Teilnehmer — dieselbe
 * Rechnung wie auf der Seite des Modells —, und die Belegschaft ist die
 * Summe: Anzahl x Teilnahmequote x Kopfwert. Die Quote ist eine Annahme;
 * deshalb gibt es sie in Szenarien nebeneinander.
 *
 * Vereinfachungen, die die Seite nennt: Jeder Teilnehmer wandelt denselben
 * Betrag um; alle Gruppen nehmen gleich haeufig teil; fuer das Netto der
 * Mitarbeiter gilt eine einheitliche Annahme zu Steuer und
 * Krankenversicherung (`steuerOpt`, gesetzlich versichert, ohne Kinder). Die
 * Kosten des ARBEITGEBERS haengen davon nicht ab — nur am Gehalt.
 * ======================================================================== */

/** Eine Gehaltsgruppe der Belegschaft — ohne Namen, nur Anzahl und Gehalt. */
export interface BelegschaftGruppe {
  /** Bezeichnung fuer die Anzeige, z. B. „Produktion“ — darf leer sein */
  name: string;
  anzahl: number;
  /** Bruttogehalt je Kopf im Jahr */
  jahresbrutto: number;
}

/** Das Modell des Betriebs — dieselben drei wie auf den Arbeitgeber-Seiten. */
export type BetriebsModell =
  /** `deckelMonat` 0: ohne Deckel — wie an den Feldern der Seiten */
  | { art: 'zuschuss'; quote: number; deckelMonat: number }
  | { art: 'festbetrag'; festbetragMonat: number; mindestUmwandlungMonat: number }
  | { art: 'matching'; weg: UmwandlungsWeg; matchingMonat: number; zuschussImMatching: boolean };

export interface BetriebsCheckEingaben {
  gruppen: readonly BelegschaftGruppe[];
  modell: BetriebsModell;
  /** Was ein Teilnehmer im Schnitt umwandelt, Monat */
  umwandlungMonat: number;
  /** Teilnahmequoten der Szenarien, z. B. 0,3 / 0,5 / 0,8 */
  quoten: readonly number[];
  unternehmensSteuersatz: number;
  umlagenSatz: number;
  /** Vermoegenswirksame Leistungen, die der Betrieb heute zahlt — fuer den Vergleich */
  vl?: { betragMonat: number; anzahl: number };
}

/** Das Modell fuer EINEN Teilnehmer einer Gehaltsgruppe, Monat. */
export interface BetriebsCheckKopf {
  umwandlungMonat: number;
  /** Beitrag des Arbeitgebers in die Altersvorsorge (Zuschuss, Festbetrag, Matching) */
  agBeitragMonat: number;
  /** Gesparte Arbeitgeberanteile zur Sozialversicherung und Umlagen */
  agAbgabenGespartMonat: number;
  agKostenVorSteuerMonat: number;
  agNettoMonat: number;
  /** Was die Umwandlung den Mitarbeiter netto kostet */
  maNettoMonat: number;
  /** Was insgesamt in die Altersvorsorge fliesst */
  vorsorgeMonat: number;
  /** Dieselben Kosten als Gehaltserhoehung: so viel kaeme netto an — 0 ohne Kosten */
  gehaltNettoMonat: number;
}

export interface BetriebsCheckGruppe {
  gruppe: BelegschaftGruppe;
  kopf: BetriebsCheckKopf;
  /** Wie der Arbeitgeber auf die Umwandlung dieser Gruppe Sozialabgaben spart */
  svLage: 'voll' | 'teilweise' | 'keine';
}

/** Die Belegschaft bei einer Teilnahmequote, Jahr. */
export interface BetriebsCheckSzenario {
  quote: number;
  /** Anzahl x Quote — ein Erwartungswert, darf gebrochen sein */
  teilnehmer: number;
  agBeitragJahr: number;
  agAbgabenGespartJahr: number;
  agKostenVorSteuerJahr: number;
  agSteuerersparnisJahr: number;
  agNettoJahr: number;
  /** Nettokosten im Verhaeltnis zur Lohnsumme der ganzen Belegschaft */
  anteilLohnsumme: number;
  /** Nettokosten je Teilnehmer im Monat — 0 ohne Teilnehmer */
  agNettoJeTeilnehmerMonat: number;
  vorsorgeJahr: number;
  maNettoJahr: number;
  /** Dieselben Kosten als Gehaltserhoehung: so viel kaeme bei den Mitarbeitern netto an */
  gehaltNettoJahr: number;
}

/** Die VL von heute — und dieselbe VL als Beitrag zur Betriebsrente, Jahr. */
export interface BetriebsCheckVl {
  betragMonat: number;
  anzahl: number;
  /** VL mit Arbeitgeberanteil Sozialversicherung und Umlagen, nach Steuern */
  heuteNettoJahr: number;
  /** Dieselbe VL als Arbeitgeberbeitrag — abgabenfrei, nach Steuern */
  alsBetriebsrenteNettoJahr: number;
  ersparnisNettoJahr: number;
  /** Was von der VL heute bei den Mitarbeitern netto ankommt */
  heuteBeimMitarbeiterNettoJahr: number;
  /** Was als Beitrag zur Betriebsrente in der Altersvorsorge ankommt — ungekuerzt */
  alsBetriebsrenteVorsorgeJahr: number;
}

export interface BetriebsCheckErgebnis {
  /** Mitarbeiter insgesamt */
  koepfe: number;
  lohnsummeJahr: number;
  /** Nur Gruppen mit Anzahl und Gehalt */
  gruppen: BetriebsCheckGruppe[];
  /** In der Reihenfolge der Quoten */
  szenarien: BetriebsCheckSzenario[];
  vl: BetriebsCheckVl | null;
  /** Koepfe je Lage — wie viele ueber welcher Grenze verdienen */
  svLagen: { voll: number; teilweise: number; keine: number };
}

const KEINE_KINDER = { hatKinder: false, kinderUnter25: 0 };

/** Das Modell fuer einen Kopf — die Zahlen, die Belegschaft und VL-Vergleich brauchen. */
function kopfRechnen(
  modell: BetriebsModell, basis: ModellBasis, steuerOpt: MatchingSteuer, p: LegalParameters,
): BetriebsCheckKopf & { agBeitragMaxMonat: number } {
  if (modell.art === 'matching') {
    const r = matchingModell({
      ...basis, weg: modell.weg, matchingMonat: modell.matchingMonat, zuschussImMatching: modell.zuschussImMatching,
    }, steuerOpt, p);
    return {
      umwandlungMonat: r.mitarbeiter.umwandlungMonat,
      agBeitragMonat: r.arbeitgeber.pflichtzuschussMonat + r.arbeitgeber.ukasseMonat,
      agAbgabenGespartMonat: r.arbeitgeber.svErsparnisMonat + r.arbeitgeber.umlagenErsparnisMonat,
      agKostenVorSteuerMonat: r.arbeitgeber.kostenVorSteuerMonat,
      agNettoMonat: r.arbeitgeber.nettoKostenMonat,
      maNettoMonat: r.mitarbeiter.nettoAufwandMonat,
      vorsorgeMonat: r.vertrag.gesamtMonat,
      gehaltNettoMonat: r.gehalt?.nettoMonat ?? 0,
      agBeitragMaxMonat: modell.matchingMonat,
    };
  }
  const r = modell.art === 'zuschuss'
    ? zuschussModell({ ...basis, quote: modell.quote, deckelMonat: zuschussDeckel(modell.deckelMonat) }, steuerOpt, p)
    : festbetragModell({
      ...basis, festbetragMonat: modell.festbetragMonat, mindestUmwandlungMonat: modell.mindestUmwandlungMonat,
    }, steuerOpt, p);
  return {
    umwandlungMonat: r.mitarbeiter.umwandlungMonat,
    agBeitragMonat: r.arbeitgeber.zuschussMonat,
    agAbgabenGespartMonat: r.arbeitgeber.svErsparnisMonat + r.arbeitgeber.umlagenErsparnisMonat,
    agKostenVorSteuerMonat: r.arbeitgeber.kostenVorSteuerMonat,
    agNettoMonat: r.arbeitgeber.nettoKostenMonat,
    maNettoMonat: r.mitarbeiter.nettoAufwandMonat,
    vorsorgeMonat: r.vertragMonat,
    gehaltNettoMonat: r.gehalt?.nettoMonat ?? 0,
    agBeitragMaxMonat: modell.art === 'zuschuss' ? zuschussDeckel(modell.deckelMonat) : modell.festbetragMonat,
  };
}

/**
 * Wie der Arbeitgeber auf eine Umwandlung dieser Gruppe spart:
 *   - voll: das Gehalt liegt bis zur Grenze der Krankenversicherung — jeder
 *     umgewandelte Euro spart alle vier Zweige;
 *   - keine: auch nach der Umwandlung liegt es ueber der Grenze der
 *     Rentenversicherung — kein Euro spart etwas;
 *   - teilweise: dazwischen (nur Renten- und Arbeitslosenversicherung, oder
 *     die Umwandlung reicht ueber eine Grenze hinweg).
 */
function svLage(jahresbrutto: number, umwandlungJahr: number, p: LegalParameters): BetriebsCheckGruppe['svLage'] {
  if (jahresbrutto <= p.bbgKvJahr) return 'voll';
  if (jahresbrutto - umwandlungJahr >= p.bbgRvJahr) return 'keine';
  return 'teilweise';
}

export function betriebsCheck(
  e: BetriebsCheckEingaben, steuerOpt: MatchingSteuer, p: LegalParameters,
): BetriebsCheckErgebnis {
  const satz = Math.min(0.6, Math.max(0, e.unternehmensSteuersatz));
  const umlagen = Math.max(0, e.umlagenSatz);
  const gruppenEin = e.gruppen
    .map((g) => ({ name: g.name, anzahl: Math.max(0, Math.round(g.anzahl)), jahresbrutto: Math.max(0, g.jahresbrutto) }))
    .filter((g) => g.anzahl > 0 && g.jahresbrutto > 0);

  const basisVon = (g: BelegschaftGruppe): ModellBasis => ({
    jahresbrutto: g.jahresbrutto,
    // Niemand wandelt mehr um, als er verdient.
    umwandlungMonat: Math.min(Math.max(0, e.umwandlungMonat), g.jahresbrutto / 12),
    unternehmensSteuersatz: satz,
    umlagenSatz: umlagen,
    privatVersichert: false,
    pkvPraemieMonat: 0,
    kinder: KEINE_KINDER,
  });

  const gruppen: BetriebsCheckGruppe[] = gruppenEin.map((g) => {
    const basis = basisVon(g);
    const { agBeitragMaxMonat: _max, ...kopf } = kopfRechnen(e.modell, basis, steuerOpt, p);
    return { gruppe: g, kopf, svLage: svLage(g.jahresbrutto, basis.umwandlungMonat * 12, p) };
  });

  const koepfe = gruppen.reduce((n, g) => n + g.gruppe.anzahl, 0);
  const lohnsummeJahr = gruppen.reduce((n, g) => n + g.gruppe.anzahl * g.gruppe.jahresbrutto, 0);
  /** Summe eines Kopfwerts ueber die Belegschaft, Jahr — bei voller Teilnahme. */
  const jahr = (wert: (k: BetriebsCheckKopf) => number) =>
    gruppen.reduce((n, g) => n + g.gruppe.anzahl * wert(g.kopf) * 12, 0);
  const voll = {
    agBeitrag: jahr((k) => k.agBeitragMonat),
    agAbgaben: jahr((k) => k.agAbgabenGespartMonat),
    agVorSteuer: jahr((k) => k.agKostenVorSteuerMonat),
    agNetto: jahr((k) => k.agNettoMonat),
    vorsorge: jahr((k) => k.vorsorgeMonat),
    maNetto: jahr((k) => k.maNettoMonat),
    gehaltNetto: jahr((k) => k.gehaltNettoMonat),
  };

  const szenarien: BetriebsCheckSzenario[] = e.quoten.map((roh) => {
    const quote = Math.min(1, Math.max(0, roh));
    const teilnehmer = koepfe * quote;
    const agNettoJahr = voll.agNetto * quote;
    return {
      quote,
      teilnehmer,
      agBeitragJahr: voll.agBeitrag * quote,
      agAbgabenGespartJahr: voll.agAbgaben * quote,
      agKostenVorSteuerJahr: voll.agVorSteuer * quote,
      agSteuerersparnisJahr: (voll.agVorSteuer - voll.agNetto) * quote,
      agNettoJahr,
      anteilLohnsumme: lohnsummeJahr > 0 ? agNettoJahr / lohnsummeJahr : 0,
      agNettoJeTeilnehmerMonat: teilnehmer > 0 ? agNettoJahr / teilnehmer / 12 : 0,
      vorsorgeJahr: voll.vorsorge * quote,
      maNettoJahr: voll.maNetto * quote,
      gehaltNettoJahr: voll.gehaltNetto * quote,
    };
  });

  // --- VL von heute: je Gruppe ein Kopf, verteilt wie die Belegschaft -----
  let vl: BetriebsCheckVl | null = null;
  const vlBetrag = Math.max(0, e.vl?.betragMonat ?? 0);
  const vlAnzahl = Math.min(koepfe, Math.max(0, Math.round(e.vl?.anzahl ?? 0)));
  if (vlBetrag > 0 && vlAnzahl > 0 && koepfe > 0) {
    let heute = 0, neu = 0, beimMitarbeiter = 0;
    for (const g of gruppen) {
      const basis = basisVon(g.gruppe);
      const modellFn = (b: ModellBasis): ModellKosten => {
        const k = kopfRechnen(e.modell, b, steuerOpt, p);
        return {
          kostenVorSteuerMonat: k.agKostenVorSteuerMonat, vorsorgeMonat: k.vorsorgeMonat,
          agBeitragMonat: k.agBeitragMonat, agBeitragMaxMonat: k.agBeitragMaxMonat,
        };
      };
      const r = betriebUmstieg(modellFn, basis, {
        neuTeilnehmer: 0,
        bestand: { anzahl: 0, umwandlungMonat: 0, zuschussQuote: 0 },
        vl: { betragMonat: vlBetrag, anzahl: 1, umwandler: 1, davonMitGehalt: 0 },
      }, steuerOpt, p);
      if (!r.kopfVl) continue;
      const bezieher = vlAnzahl * (g.gruppe.anzahl / koepfe);
      heute += bezieher * r.kopfVl.bisherNettoMonat * 12;
      neu += bezieher * r.kopfVl.neuNettoMonat * 12;
      beimMitarbeiter += bezieher * r.kopfVl.vlNettoMitarbeiterMonat * 12;
    }
    vl = {
      betragMonat: vlBetrag,
      anzahl: vlAnzahl,
      heuteNettoJahr: heute,
      alsBetriebsrenteNettoJahr: neu,
      ersparnisNettoJahr: heute - neu,
      heuteBeimMitarbeiterNettoJahr: beimMitarbeiter,
      alsBetriebsrenteVorsorgeJahr: vlBetrag * 12 * vlAnzahl,
    };
  }

  const lage = (art: BetriebsCheckGruppe['svLage']) =>
    gruppen.filter((g) => g.svLage === art).reduce((n, g) => n + g.gruppe.anzahl, 0);

  return {
    koepfe,
    lohnsummeJahr,
    gruppen,
    szenarien,
    vl,
    svLagen: { voll: lage('voll'), teilweise: lage('teilweise'), keine: lage('keine') },
  };
}

/* ==========================================================================
 * BELEGSCHAFT AUS EINER LOHNLISTE — eingefuegt aus der Tabellenkalkulation.
 *
 * Je Zeile ein Mitarbeiter (ein Gehalt) oder eine Gruppe (Anzahl und
 * Gehalt, davor wahlweise eine Bezeichnung). Namen einzelner Personen
 * braucht die Rechnung nicht: Einzelne Gehaelter werden auf volle 1.000 EUR
 * gerundet und zu Gruppen gleichen Gehalts zusammengefasst — so steht am
 * Ende keine Liste von Personen da, sondern eine Verteilung.
 * ======================================================================== */

export interface LohnlisteErgebnis {
  gruppen: BelegschaftGruppe[];
  /** Zeilen, die als Mitarbeiter oder Gruppe gelesen wurden */
  gelesen: number;
  /** Zeilen ohne erkennbares Gehalt (Ueberschriften, Leeres) */
  uebersprungen: number;
  /** Monatsgehaelter erkannt und auf das Jahr hochgerechnet */
  ausMonat: boolean;
  /** Vor dem Gehalt steht eine Zahl, die eine Anzahl sein kann */
  anzahlSpalte: boolean;
  /** … und sie wurde als Anzahl der Mitarbeiter gelesen */
  alsAnzahl: boolean;
}

/** Wie die Zahl vor dem Gehalt gelesen wird: selbst entscheiden, als Anzahl, gar nicht. */
export type AnzahlSpalte = 'auto' | 'ja' | 'nein';

/** „3.450,50 €“, „3450.5“, „48 000“ → Zahl; sonst null. */
function zahlAus(text: string): number | null {
  let t = text.replace(/[€\s  ]/g, '').replace(/EUR$/i, '');
  if (!/^-?[\d.,]+$/.test(t) || !/\d/.test(t)) return null;
  const komma = t.lastIndexOf(',');
  const punkt = t.lastIndexOf('.');
  if (komma >= 0 && punkt >= 0) {
    // Beides: das hintere ist das Dezimalzeichen.
    t = komma > punkt ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (komma >= 0) {
    // Nur Komma: Dezimalzeichen — ausser es gliedert Tausender (1,234,567).
    t = /^-?\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
  } else if (punkt >= 0) {
    // Nur Punkt: Tausenderpunkt, wenn genau drei Ziffern folgen (48.000) — sonst Dezimalpunkt.
    t = /^-?\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t;
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Ab hier gilt ein Betrag als Jahresgehalt. Darunter: Monat. */
const AB_JAHR = 15_000;
/** Kleinere Zahlen sind kein Gehalt: laufende Nummer, Stunden, Steuerklasse. */
const AB_GEHALT = 300;
const HOECHSTENS_GRUPPEN = 60;
/** Ueberschriften einer Spalte, die Koepfe zaehlt. */
const KOPF_ANZAHL = /^anz|k[oö]pf|kopf|mitarb|besch[aä]ft|person|stellen|^ma$|^fte$|st[uü]ck/i;
/** … und einer, die trotz „Mitarbeiter“ oder „Personal“ im Namen eine Nummer fuehrt. */
const KOPF_NUMMER = /nummer|nr\.?$|[-_ ]id$|^id$|kennung/i;

const spaltenVon = (zeile: string) =>
  (zeile.includes('\t') ? zeile.split('\t') : zeile.includes(';') ? zeile.split(';') : zeile.split(/\s+/))
    .map((s) => s.trim()).filter((s) => s !== '');
/** Tabellenkalkulation oder CSV — nur dort sagt die Zeile ueber den Daten etwas ueber die Spalten. */
const hatSpalten = (zeile: string) => zeile.includes('\t') || zeile.includes(';');

/**
 * Liest die eingefuegte Liste.
 *
 * Je Zeile:
 *   - ein Gehalt (ein Mitarbeiter) — auch mit Name oder Personalnummer davor,
 *     beides wird nicht uebernommen;
 *   - Anzahl und Gehalt (eine Gruppe), wahlweise mit Bezeichnung davor.
 *
 * Das Gehalt ist die LETZTE Zahl der Zeile, die ein Gehalt sein kann; die
 * Anzahl steht in der Spalte unmittelbar davor.
 *
 * IST DIE ZAHL DAVOR EINE ANZAHL? Nicht immer — dort kann auch eine laufende
 * Nummer, eine Personalnummer oder die Steuerklasse stehen. `'auto'` entscheidet:
 *   1. Die Ueberschrift der Spalte (Tabellenkalkulation, CSV): „Anzahl“,
 *      „Köpfe“, „Mitarbeiter“ … heisst ja, jede andere heisst nein.
 *   2. Ohne Ueberschrift: Zaehlt die Spalte ab 1 durch (1, 2, 3 …), ist sie
 *      eine laufende Nummer; steigt sie ueber fuenf und mehr Zeilen stetig
 *      und beginnt dreistellig, sind es Personalnummern. Sonst: Anzahl.
 * Die Seite zeigt, was gelesen wurde, und laesst es umstellen (`'ja'` / `'nein'`).
 */
export function lohnlisteLesen(text: string, gehaelterImJahr = 12, anzahlSpalte: AnzahlSpalte = 'auto'): LohnlisteErgebnis {
  const zeilen = text.split(/\r?\n/).map((z) => z.trim()).filter((z) => z !== '');
  const roh: { name: string; anzahl: number | null; betrag: number }[] = [];
  let uebersprungen = 0;
  /** Die Zeile ueber den Daten und die Stelle der Zahl vor dem Gehalt in der ersten Datenzeile */
  let kopfzeile: string | null = null;
  let anzahlStelle = -1;
  let spaltenZahl = 0;
  for (const z of zeilen) {
    // Spalten: Tab (Tabellenkalkulation), Semikolon (CSV), sonst Leerzeichen.
    const spalten = spaltenVon(z);
    const zahlen = spalten.map(zahlAus);
    let gehaltStelle = -1;
    zahlen.forEach((n, i) => { if (n !== null && n >= AB_GEHALT) gehaltStelle = i; });
    if (gehaltStelle < 0) {
      uebersprungen++;
      if (roh.length === 0 && hatSpalten(z)) kopfzeile = z;
      continue;
    }
    const davor = gehaltStelle > 0 ? zahlen[gehaltStelle - 1] ?? null : null;
    const anzahl = davor !== null && Number.isInteger(davor) && davor >= 1 && davor < 10_000 ? davor : null;
    const name = spalten.slice(0, gehaltStelle).filter((_, i) => zahlen[i] === null).join(' ');
    if (roh.length === 0) { anzahlStelle = gehaltStelle - 1; spaltenZahl = spalten.length; }
    roh.push({ name, anzahl, betrag: zahlen[gehaltStelle]! });
  }

  const anzahlen = roh.map((r) => r.anzahl);
  const hatAnzahl = anzahlen.some((n) => n !== null);
  let alsAnzahl = hatAnzahl && anzahlSpalte !== 'nein';
  if (hatAnzahl && anzahlSpalte === 'auto') {
    const kopf = kopfzeile ? spaltenVon(kopfzeile) : [];
    const ueberschrift = kopf.length === spaltenZahl && anzahlStelle >= 0 ? kopf[anzahlStelle] ?? '' : '';
    if (ueberschrift !== '') {
      alsAnzahl = KOPF_ANZAHL.test(ueberschrift) && !KOPF_NUMMER.test(ueberschrift);
    } else {
      const alle = anzahlen.every((n) => n !== null);
      const abEins = anzahlen[0] === 1 && anzahlen.every((n, i) => i === 0 || n === anzahlen[i - 1]! + 1);
      const steigend = anzahlen.every((n, i) => i === 0 || n! > anzahlen[i - 1]!);
      const laufendeNummer = alle && anzahlen.length >= 3 && abEins;
      const personalnummern = alle && anzahlen.length >= 5 && steigend && anzahlen[0]! >= 100;
      alsAnzahl = !laufendeNummer && !personalnummern;
    }
  }
  const eintraege = roh.map((r) => {
    const anzahl = alsAnzahl ? r.anzahl ?? 1 : 1;
    // Bezeichnungen nur fuer Gruppen — der Name eines Einzelnen bleibt draussen.
    return { name: anzahl > 1 ? r.name : '', anzahl, betrag: r.betrag };
  });

  // Monat oder Jahr? Entscheidet die Mehrheit der Koepfe — eine Liste mischt nicht.
  const koepfe = eintraege.reduce((n, r) => n + r.anzahl, 0);
  const monatKoepfe = eintraege.filter((r) => r.betrag < AB_JAHR).reduce((n, r) => n + r.anzahl, 0);
  const ausMonat = koepfe > 0 && monatKoepfe * 2 > koepfe;
  const faktor = ausMonat ? Math.max(1, gehaelterImJahr) : 1;

  // Einzelne auf volle 1.000 EUR runden (Gruppen auf 100) und gleiche Gehaelter zusammenfassen.
  const nach = new Map<string, BelegschaftGruppe>();
  for (const r of eintraege) {
    const schritt = r.anzahl > 1 ? 100 : 1000;
    const jahresbrutto = Math.max(schritt, Math.round((r.betrag * faktor) / schritt) * schritt);
    const schluessel = `${r.name}|${jahresbrutto}`;
    const g = nach.get(schluessel);
    if (g) g.anzahl += r.anzahl;
    else nach.set(schluessel, { name: r.name, anzahl: r.anzahl, jahresbrutto });
  }
  let gruppen = [...nach.values()].sort((a, b) => a.jahresbrutto - b.jahresbrutto || a.name.localeCompare(b.name, 'de'));
  // Zu viele verschiedene Gehaelter: in Baender von 5.000 EUR, mit dem Durchschnitt des Bands.
  if (gruppen.length > HOECHSTENS_GRUPPEN) {
    const baender = new Map<number, { anzahl: number; summe: number }>();
    for (const g of gruppen) {
      const band = Math.floor(g.jahresbrutto / 5000);
      const b = baender.get(band) ?? { anzahl: 0, summe: 0 };
      b.anzahl += g.anzahl;
      b.summe += g.anzahl * g.jahresbrutto;
      baender.set(band, b);
    }
    gruppen = [...baender.entries()].sort((a, b) => a[0] - b[0])
      .map(([, b]) => ({ name: '', anzahl: b.anzahl, jahresbrutto: Math.round(b.summe / b.anzahl / 100) * 100 }));
  }
  return { gruppen, gelesen: eintraege.length, uebersprungen, ausMonat, anzahlSpalte: hatAnzahl, alsAnzahl };
}
