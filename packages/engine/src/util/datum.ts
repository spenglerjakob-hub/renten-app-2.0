/**
 * Datumsrechnung auf Basis echter Kalenderdaten.
 *
 * Der Prototyp mischte Monatsbruchteile (/12) mit Tagesbruchteilen (/365.25)
 * und akzeptierte ungeprueft Eingaben wie "99.99.9999", die als NaN durch die
 * gesamte Rechnung liefen (Befunde D3/D4).
 */

export interface Datum {
  jahr: number;
  monat: number; // 1-12
  tag: number;   // 1-31
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const DE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;

function gueltig(j: number, m: number, t: number): boolean {
  if (!Number.isInteger(j) || !Number.isInteger(m) || !Number.isInteger(t)) return false;
  if (j < 1900 || j > 2200 || m < 1 || m > 12 || t < 1) return false;
  const tageImMonat = new Date(Date.UTC(j, m, 0)).getUTCDate();
  return t <= tageImMonat;
}

/** Parst ISO (yyyy-mm-dd) oder deutsches Format (TT.MM.JJJJ). Null bei Unsinn. */
export function parseDatum(s: string | null | undefined): Datum | null {
  if (!s) return null;
  const iso = ISO.exec(s.trim());
  if (iso) {
    const [j, m, t] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    return gueltig(j, m, t) ? { jahr: j, monat: m, tag: t } : null;
  }
  const de = DE.exec(s.trim());
  if (de) {
    const [t, m, j] = [Number(de[1]), Number(de[2]), Number(de[3])];
    return gueltig(j, m, t) ? { jahr: j, monat: m, tag: t } : null;
  }
  return null;
}

export function toIso(d: Datum): string {
  return `${d.jahr}-${String(d.monat).padStart(2, '0')}-${String(d.tag).padStart(2, '0')}`;
}

export function toDe(d: Datum): string {
  return `${String(d.tag).padStart(2, '0')}.${String(d.monat).padStart(2, '0')}.${d.jahr}`;
}

function tagesnummer(d: Datum): number {
  return Math.floor(Date.UTC(d.jahr, d.monat - 1, d.tag) / 86400000);
}

/** Vollendete Jahre zwischen zwei Daten, als Dezimalzahl. */
export function jahreZwischen(von: Datum, bis: Datum): number {
  const tage = tagesnummer(bis) - tagesnummer(von);
  return tage / 365.2425;
}

/** Alter in vollendeten Jahren zu einem Stichtag. */
export function alterAm(geburt: Datum, stichtag: Datum): number {
  let alter = stichtag.jahr - geburt.jahr;
  if (stichtag.monat < geburt.monat || (stichtag.monat === geburt.monat && stichtag.tag < geburt.tag)) {
    alter -= 1;
  }
  return alter;
}

/** Exaktes Alter als Dezimalzahl. */
export function alterExakt(geburt: Datum, stichtag: Datum): number {
  return jahreZwischen(geburt, stichtag);
}

export function heute(): Datum {
  const d = new Date();
  return { jahr: d.getFullYear(), monat: d.getMonth() + 1, tag: d.getDate() };
}

/**
 * Regelaltersgrenze als konkretes Datum (Geburtsdatum + Jahre/Monate).
 */
export function datumPlus(d: Datum, jahre: number, monate = 0): Datum {
  const gesamtMonate = d.monat - 1 + monate + Math.round(jahre * 12);
  const j = d.jahr + Math.floor(gesamtMonate / 12);
  const m = (gesamtMonate % 12 + 12) % 12;
  const maxTag = new Date(Date.UTC(j, m + 1, 0)).getUTCDate();
  return { jahr: j, monat: m + 1, tag: Math.min(d.tag, maxTag) };
}

/** Anteil eines Kalenderjahres, in dem ein Bezug bereits laeuft (0..1). */
export function jahresanteilAb(start: Datum, jahr: number): number {
  if (jahr < start.jahr) return 0;
  if (jahr > start.jahr) return 1;
  const verbleibendeMonate = 12 - (start.monat - 1) - (start.tag > 1 ? 1 : 0);
  return Math.max(0, Math.min(12, verbleibendeMonate)) / 12;
}
