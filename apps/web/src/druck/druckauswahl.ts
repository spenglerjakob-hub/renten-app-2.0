/**
 * DIE DRUCKAUSWAHL — welche Themen das Gutachten enthaelt.
 *
 * Statt zweier fester Umfaenge („Kurzfassung“, „Ausführlich“) waehlt der
 * Berater im Druckfenster Thema fuer Thema, die Vertrags-Pruefungen je
 * Vertrag. Immer dabei sind das Deckblatt mit dem Inhalt und „Rechtsstand,
 * Methodik und Vorbehalt“: Ein Dokument mit dem Namen des Kunden und Zahlen
 * bis in die 2070er geht nicht ohne Vorbehalt hinaus.
 *
 * Festgehalten wird, was ABGEWAEHLT ist — ein Thema, das im Fall neu dazukommt
 * (etwa erste angenommene Loesungen), ist so von selbst dabei. Die Auswahl
 * gilt, bis die Seite neu geladen wird; im Browser gespeichert wird sie nicht.
 */

/** Die waehlbaren Themen in der Reihenfolge des Gutachtens. */
export const THEMEN = [
  'angaben', 'vertraege', 'renteneinkuenfte', 'partner', 'mitLoesungen',
  'krankenversicherung', 'sparziel', 'foerderung', 'loesungen', 'pruefung', 'merkblatt',
] as const;

export type Thema = (typeof THEMEN)[number];
/** Dazu der Vorbehalt — er steht in der Liste, ist aber nicht abwaehlbar. */
export type ThemaId = Thema | 'rechtsstand';

/** Die Kurzfassung fuer das Gespraech — dieselben Seiten wie der fruehere Umfang „kurz“. */
export const KURZFASSUNG: readonly Thema[] = ['angaben', 'vertraege', 'renteneinkuenfte', 'partner', 'mitLoesungen'];

export interface DruckAuswahl {
  /** Abgewaehlte Themen */
  aus: Thema[];
  /** Abgewaehlte Vertrags-Pruefungen, je Vertrags-ID — solange das Thema an ist */
  vertraegeAus: string[];
}

export const ALLES: DruckAuswahl = { aus: [], vertraegeAus: [] };
export const KURZ: DruckAuswahl = { aus: THEMEN.filter((t) => !KURZFASSUNG.includes(t)), vertraegeAus: [] };

/** Kommt diese Seite in den Druck? Der Vorbehalt immer. */
export function gewaehlt(s: { thema: ThemaId; vertragId?: string }, a: DruckAuswahl): boolean {
  if (s.thema === 'rechtsstand') return true;
  if (a.aus.includes(s.thema)) return false;
  return !(s.thema === 'pruefung' && s.vertragId !== undefined && a.vertraegeAus.includes(s.vertragId));
}

/** Ein Thema an- oder abwaehlen. Fuer die Vertrags-Pruefungen gilt das fuer alle Vertraege. */
export function themaSetzen(a: DruckAuswahl, t: Thema, an: boolean): DruckAuswahl {
  const aus = a.aus.filter((x) => x !== t);
  return { aus: an ? aus : [...aus, t], vertraegeAus: t === 'pruefung' ? [] : a.vertraegeAus };
}

export type PruefungStand = 'alle' | 'einige' | 'keine';

/** Wie viele der Vertrags-Pruefungen gewaehlt sind — fuer das Sammel-Kaestchen. */
export function pruefungStand(a: DruckAuswahl, ids: readonly string[]): PruefungStand {
  if (a.aus.includes('pruefung') || ids.length === 0) return 'keine';
  const an = ids.filter((id) => !a.vertraegeAus.includes(id)).length;
  return an === ids.length ? 'alle' : an === 0 ? 'keine' : 'einige';
}

/**
 * Eine Vertrags-Pruefung an- oder abwaehlen. Ist das ganze Thema aus, bleibt
 * es fuer die anderen Vertraege aus; ist keiner mehr gewaehlt, ist das Thema aus.
 */
export function vertragSetzen(a: DruckAuswahl, id: string, an: boolean, ids: readonly string[]): DruckAuswahl {
  const vorher = a.aus.includes('pruefung') ? [...ids] : a.vertraegeAus.filter((x) => ids.includes(x));
  const vertraegeAus = an ? vorher.filter((x) => x !== id) : [...new Set([...vorher, id])];
  const aus = a.aus.filter((x) => x !== 'pruefung');
  if (ids.length > 0 && ids.every((x) => vertraegeAus.includes(x))) return { aus: [...aus, 'pruefung'], vertraegeAus: [] };
  return { aus, vertraegeAus };
}
