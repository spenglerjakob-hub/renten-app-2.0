import type {
  BelegschaftGruppe, BetriebsCheckGruppe, BetriebsModell, LohnlisteErgebnis,
} from '@renten/engine';

/**
 * BETRIEBS-CHECK — die reinen Teile der Seite.
 *
 * Die Seite rechnet ein Arbeitgebermodell fuer die ganze Belegschaft
 * (`betriebsCheck` im Rechenkern). Hier steht, was sie darum herum braucht:
 * die Vorgaben, der Stand im Browser, die Zeilen der Gruppentabelle und die
 * Saetze zu Modell und eingefuegter Lohnliste.
 *
 * DIE BELEGSCHAFT BLEIBT IM BROWSER. Gehaltsgruppen gehen nicht ins Konto —
 * sie liegen je Firma im `localStorage` dieses Geraets, ohne Namen einzelner
 * Personen. Ins Konto geht wie auf den anderen Arbeitgeber-Seiten nur die
 * Firma selbst (Name, Logo).
 */

/** So viele Gruppen fuehrt die Seite hoechstens — wie `lohnlisteLesen` sie liefert. */
export const HOECHSTENS_GRUPPEN = 60;

/**
 * Die Belegschaft, mit der die Seite beginnt: ein Betrieb mit 34 Leuten.
 * Technik und Leitung liegen bewusst ueber den Beitragsgrenzen — daran sieht
 * man sofort, warum die Gruppen einzeln gerechnet werden.
 */
export const BEISPIEL_GRUPPEN: readonly BelegschaftGruppe[] = [
  { name: 'Produktion', anzahl: 18, jahresbrutto: 38_000 },
  { name: 'Verwaltung', anzahl: 8, jahresbrutto: 48_000 },
  { name: 'Technik', anzahl: 6, jahresbrutto: 82_000 },
  { name: 'Leitung', anzahl: 2, jahresbrutto: 120_000 },
];

export const MODELL_VORGABEN: { [A in BetriebsModell['art']]: Extract<BetriebsModell, { art: A }> } = {
  zuschuss: { art: 'zuschuss', quote: 0.5, deckelMonat: 100 },
  festbetrag: { art: 'festbetrag', festbetragMonat: 50, mindestUmwandlungMonat: 50 },
  matching: { art: 'matching', weg: 'dv', matchingMonat: 100, zuschussImMatching: false },
};

/** Was die Seite je Firma im Browser behaelt. */
export interface BetriebsStand {
  gruppen: BelegschaftGruppe[];
  /** Noch die Beispiel-Belegschaft der Seite */
  beispiel: boolean;
  modell: BetriebsModell;
  /** Was ein Teilnehmer im Schnitt umwandelt, Monat */
  umwandlungMonat: number;
  /** Teilnahme: vorsichtig, erwartet, hoch */
  quoten: [number, number, number];
  vlMonat: number;
  vlAnzahl: number;
}

export function standVorgabe(modell: BetriebsModell = MODELL_VORGABEN.zuschuss): BetriebsStand {
  return {
    gruppen: BEISPIEL_GRUPPEN.map((g) => ({ ...g })),
    beispiel: true,
    modell: { ...modell },
    umwandlungMonat: 100,
    quoten: [0.3, 0.5, 0.8],
    vlMonat: 0,
    vlAnzahl: 0,
  };
}

/* --------------------------------------------------------------------------
 * Der Stand im Browser: ein Eintrag je Firma, „ohne“ fuer die Rechnung ohne
 * Firma. Gelesen wird misstrauisch — der Speicher gehoert dem Browser, nicht
 * der Seite.
 * ------------------------------------------------------------------------ */

export const STAND_SCHLUESSEL = 'rentenplaner.betrieb.v1';
const OHNE_FIRMA = 'ohne';
const KENNUNG = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const fach = (firma: string | null) => (firma && KENNUNG.test(firma) ? firma.toLowerCase() : OHNE_FIRMA);

const zahl = (v: unknown, min: number, max: number, sonst: number) =>
  (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : sonst);

function gruppeAus(roh: unknown): BelegschaftGruppe | null {
  if (!roh || typeof roh !== 'object') return null;
  const g = roh as Record<string, unknown>;
  return {
    name: typeof g.name === 'string' ? g.name.slice(0, 40) : '',
    anzahl: Math.round(zahl(g.anzahl, 0, 9_999, 0)),
    jahresbrutto: zahl(g.jahresbrutto, 0, 10_000_000, 0),
  };
}

function modellAus(roh: unknown): BetriebsModell | null {
  if (!roh || typeof roh !== 'object') return null;
  const m = roh as Record<string, unknown>;
  if (m.art === 'zuschuss') {
    return { art: 'zuschuss', quote: zahl(m.quote, 0, 1, 0.5), deckelMonat: zahl(m.deckelMonat, 0, 10_000, 100) };
  }
  if (m.art === 'festbetrag') {
    return {
      art: 'festbetrag', festbetragMonat: zahl(m.festbetragMonat, 0, 10_000, 50),
      mindestUmwandlungMonat: zahl(m.mindestUmwandlungMonat, 0, 10_000, 50),
    };
  }
  if (m.art === 'matching') {
    const weg = m.weg === 'ukasse' ? 'ukasse' : 'dv';
    return {
      art: 'matching', weg, matchingMonat: zahl(m.matchingMonat, 0, 10_000, 100),
      zuschussImMatching: weg === 'dv' && m.zuschussImMatching === true,
    };
  }
  return null;
}

function standAusObjekt(roh: unknown): BetriebsStand | null {
  if (!roh || typeof roh !== 'object') return null;
  const s = roh as Record<string, unknown>;
  const modell = modellAus(s.modell);
  if (!modell || !Array.isArray(s.gruppen)) return null;
  const gruppen = s.gruppen.slice(0, HOECHSTENS_GRUPPEN).map(gruppeAus).filter((g): g is BelegschaftGruppe => g !== null);
  if (gruppen.length === 0) return null;
  const q = Array.isArray(s.quoten) ? s.quoten : [];
  return {
    gruppen,
    beispiel: s.beispiel === true,
    modell,
    umwandlungMonat: zahl(s.umwandlungMonat, 0, 10_000, 100),
    quoten: [zahl(q[0], 0, 1, 0.3), zahl(q[1], 0, 1, 0.5), zahl(q[2], 0, 1, 0.8)],
    vlMonat: zahl(s.vlMonat, 0, 1_000, 0),
    vlAnzahl: Math.round(zahl(s.vlAnzahl, 0, 99_999, 0)),
  };
}

function faecher(roh: string | null): Record<string, unknown> {
  if (!roh) return {};
  try {
    const alle: unknown = JSON.parse(roh);
    return alle && typeof alle === 'object' && !Array.isArray(alle) ? { ...(alle as Record<string, unknown>) } : {};
  } catch {
    return {};
  }
}

/** Der gespeicherte Stand einer Firma — null: nichts (Brauchbares) gespeichert. */
export function standLesen(roh: string | null, firma: string | null): BetriebsStand | null {
  return standAusObjekt(faecher(roh)[fach(firma)]);
}

/**
 * Den Stand einer Firma in den Speicherinhalt schreiben — `null` entfernt
 * ihn. Liefert den neuen Inhalt, oder null, wenn nichts mehr zu speichern ist.
 */
export function standSchreiben(roh: string | null, firma: string | null, stand: BetriebsStand | null): string | null {
  const alle = faecher(roh);
  if (stand) alle[fach(firma)] = stand;
  else delete alle[fach(firma)];
  return Object.keys(alle).length > 0 ? JSON.stringify(alle) : null;
}

/* --------------------------------------------------------------------------
 * Anzeige
 * ------------------------------------------------------------------------ */

const euro = (n: number) => `${Math.round(n).toLocaleString('de-DE')} €`;
const prozent = (n: number) => `${(n * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`;

/** Das Modell in einem Satzteil — fuer die Annahmen im Ausdruck. */
export function modellText(m: BetriebsModell): string {
  if (m.art === 'zuschuss') {
    return `Zuschuss ${prozent(m.quote)} der Umwandlung, ${m.deckelMonat > 0 ? `höchstens ${euro(m.deckelMonat)} im Monat` : 'ohne Deckel'}`;
  }
  if (m.art === 'festbetrag') {
    return `Festbetrag ${euro(m.festbetragMonat)} im Monat ab ${euro(m.mindestUmwandlungMonat)} Umwandlung`;
  }
  const weg = m.weg === 'dv' ? 'Direktversicherung' : 'Unterstützungskasse';
  return `Matching ${euro(m.matchingMonat)} im Monat in die Unterstützungskasse${
    m.zuschussImMatching ? ', einschließlich Pflichtzuschuss' : ''}, Umwandlung in die ${weg}`;
}

/** Wie der Beitrag des Arbeitgebers im Modell heisst. */
export function beitragName(m: BetriebsModell): string {
  return m.art === 'zuschuss' ? 'Zuschuss' : m.art === 'festbetrag' ? 'Festbetrag' : 'Matching und Pflichtzuschuss';
}

/** Die Seite, die das Modell im Einzelnen zeigt. */
export function modellSeite(m: BetriebsModell): string {
  return m.art === 'zuschuss' ? '/zuschussmodell' : m.art === 'festbetrag' ? '/festbetrag' : '/arbeitgeber';
}

export type Lage = BetriebsCheckGruppe['svLage'] | 'gemischt';

export const LAGE_TEXT: Record<Lage, string> = {
  voll: 'spart alle Sozialabgaben',
  teilweise: 'spart einen Teil der Sozialabgaben',
  keine: 'spart keine Sozialabgaben',
  gemischt: 'teils über einer Beitragsgrenze',
};

/** Eine Zeile der Tabelle „Je Gehaltsgruppe“ — eine Gruppe oder ein Gehaltsband. */
export interface GruppenZeile {
  schluessel: string;
  text: string;
  anzahl: number;
  gehaltText: string;
  lage: Lage;
  /** Je Teilnehmer im Monat */
  agBeitragMonat: number;
  agNettoMonat: number;
}

/** Breiten der Gehaltsbaender — die schmalste, mit der die Tabelle kurz genug bleibt. */
const BAENDER = [10_000, 20_000, 50_000, 100_000, 250_000, 1_000_000] as const;

/**
 * Die Zeilen der Gruppentabelle. Bis `hoechstens` Gruppen steht jede fuer
 * sich; darueber werden sie zu Gehaltsbaendern (10.000 EUR, bei weit
 * gestreuten Gehaeltern breiter) — eine Entscheidungsvorlage mit 40 Zeilen
 * liest niemand, und Seite 1 des Ausdrucks traegt nur ein Dutzend. Die Werte
 * eines Bands sind der Durchschnitt seiner Koepfe; die Summen der Seite
 * bleiben genau.
 */
export function gruppenZeilen(
  gruppen: readonly BetriebsCheckGruppe[], hoechstens = 12,
): { baender: boolean; zeilen: GruppenZeile[] } {
  if (gruppen.length <= hoechstens) {
    return {
      baender: false,
      zeilen: gruppen.map((g, i) => ({
        schluessel: `g${i}`,
        text: g.gruppe.name.trim() || 'Mitarbeiter',
        anzahl: g.gruppe.anzahl,
        gehaltText: euro(g.gruppe.jahresbrutto),
        lage: g.svLage,
        agBeitragMonat: g.kopf.agBeitragMonat,
        agNettoMonat: g.kopf.agNettoMonat,
      })),
    };
  }
  const inBaendern = (breite: number) => {
    const nach = new Map<number, BetriebsCheckGruppe[]>();
    for (const g of gruppen) {
      const band = Math.floor(g.gruppe.jahresbrutto / breite);
      nach.set(band, [...(nach.get(band) ?? []), g]);
    }
    return nach;
  };
  const BAND = BAENDER.find((b) => inBaendern(b).size <= hoechstens) ?? BAENDER[BAENDER.length - 1]!;
  const nach = inBaendern(BAND);
  const zeilen = [...nach.entries()].sort((a, b) => a[0] - b[0]).map(([band, teile]): GruppenZeile => {
    const anzahl = teile.reduce((n, g) => n + g.gruppe.anzahl, 0);
    const schnitt = (wert: (g: BetriebsCheckGruppe) => number) =>
      teile.reduce((n, g) => n + g.gruppe.anzahl * wert(g), 0) / anzahl;
    const lagen = new Set(teile.map((g) => g.svLage));
    return {
      schluessel: `b${band}`,
      text: `${(band * BAND).toLocaleString('de-DE')} bis unter ${((band + 1) * BAND).toLocaleString('de-DE')} €`,
      anzahl,
      gehaltText: `Ø ${euro(Math.round(schnitt((g) => g.gruppe.jahresbrutto) / 100) * 100)}`,
      lage: lagen.size === 1 ? teile[0]!.svLage : 'gemischt',
      agBeitragMonat: schnitt((g) => g.kopf.agBeitragMonat),
      agNettoMonat: schnitt((g) => g.kopf.agNettoMonat),
    };
  });
  return { baender: true, zeilen };
}

/** Die ganze Belegschaft als EINE Gruppe mit dem Durchschnittsgehalt — fuer den Vergleich „ein Beispiel mal n“. */
export function durchschnittsGruppe(gruppen: readonly BelegschaftGruppe[]): BelegschaftGruppe | null {
  const gueltig = gruppen.filter((g) => g.anzahl > 0 && g.jahresbrutto > 0);
  const koepfe = gueltig.reduce((n, g) => n + Math.round(g.anzahl), 0);
  if (koepfe === 0) return null;
  const summe = gueltig.reduce((n, g) => n + Math.round(g.anzahl) * g.jahresbrutto, 0);
  return { name: '', anzahl: koepfe, jahresbrutto: summe / koepfe };
}

const mehrzahl = (n: number, eins: string, viele: string) => `${n.toLocaleString('de-DE')} ${n === 1 ? eins : viele}`;

/** Was aus der eingefuegten Lohnliste gelesen wurde — der Satz unter dem Feld. */
export function lohnlisteText(r: LohnlisteErgebnis, gehaelterImJahr: number): string {
  if (r.gruppen.length === 0) {
    return r.uebersprungen > 0
      ? 'Darin steht kein Gehalt. Je Zeile ein Gehalt — oder Anzahl und Gehalt.'
      : '';
  }
  const koepfe = r.gruppen.reduce((n, g) => n + g.anzahl, 0);
  const teile = [
    `${mehrzahl(koepfe, 'Mitarbeiter', 'Mitarbeiter')} in ${mehrzahl(r.gruppen.length, 'Gehaltsgruppe', 'Gehaltsgruppen')} erkannt.`,
  ];
  if (r.ausMonat) teile.push(`Monatsgehälter, mit ${String(gehaelterImJahr).replace('.', ',')} aufs Jahr gerechnet.`);
  if (r.uebersprungen > 0) teile.push(`${mehrzahl(r.uebersprungen, 'Zeile', 'Zeilen')} ohne Gehalt übersprungen.`);
  return teile.join(' ');
}
