import type { BeratungStatus } from '@renten/schema';
import { supabase } from './supabase';
import type { Nachweis, UnterlagenArt, Unterschrift, UnterschriftPerson } from './bav-beratung';

/**
 * Unterschrift per Link (Migration 20261102120000): Der Berater schickt dem
 * Mitarbeiter einen Link und nennt ihm getrennt davon einen Code. Mit beidem
 * liest der Mitarbeiter auf /unterschrift die festgeschriebenen Unterlagen
 * und unterschreibt sie — ohne Konto.
 *
 * Der Token steht im Fragment (#…): Er geht so weder an den Server der Seite
 * noch als Referer an Dritte. Die Datenbank kennt nur seine Pruefsumme.
 * Was der Mitarbeiter sieht und darf, entscheiden allein bav_link_oeffnen und
 * bav_link_unterschreiben; nach 5 falschen Codes ist der Link gesperrt.
 *
 * Diese Datei ist klein und haengt nicht an der Beratung — die oeffentliche
 * Seite laedt sie ohne den Rest der Mitarbeiterberatung.
 */

/** Wie lange ein Link gilt und wie oft der Code falsch sein darf — wie in der Datenbank. */
export const LINK_TAGE = 14;
export const LINK_VERSUCHE = 5;

/** Der Token: 32 Hex-Ziffern. */
export const LINK_TOKEN = /^[0-9a-f]{32}$/;
/** Der Code: 6 Ziffern. */
export const LINK_CODE = /^[0-9]{6}$/;

/** Die Seiten, deren Adresse die Datenbank fuer die E-Mail an den Berater annimmt. */
const SEITEN = ['https://js-rentenplaner.de', 'https://test.js-rentenplaner.de'];

/** Der Token aus `location.hash` — null, wenn der Link unvollstaendig ist. */
export function tokenAusAdresse(hash: string): string | null {
  const t = hash.replace(/^#/, '').trim().toLowerCase();
  return LINK_TOKEN.test(t) ? t : null;
}

/** Der Link fuer den Mitarbeiter. */
export function unterschriftLink(token: string, ursprung: string): string {
  return `${ursprung}/unterschrift#${token}`;
}

/** Die eigene Seite, wenn die Datenbank sie kennt — sonst null (lokal, Vorschau). */
export function linkSeite(ursprung: string): string | null {
  return SEITEN.includes(ursprung) ? ursprung : null;
}

/** Was ein Mitarbeiter eingibt: Leerzeichen und Bindestriche fallen weg. */
export function codeEingabe(text: string): string {
  return text.replace(/[\s-]/g, '').slice(0, 6);
}

// --- Antworten der Datenbank ----------------------------------------------

/** Kein Zugang (mehr) — die Seite erklaert, warum. */
export type LinkSperre = 'ungueltig' | 'abgelaufen' | 'gesperrt' | 'unterschrieben' | 'fehler';

export interface LinkInhalt {
  status: 'ok';
  mitarbeiter: string;
  firma: string;
  entscheidung: Exclude<BeratungStatus, 'offen'>;
  axa: boolean;
  gueltigBis: string;
  festgeschriebenAm: string;
  pruefsummen: Partial<Record<UnterlagenArt, string>>;
  unterlagen: Partial<Record<UnterlagenArt, string>>;
  berater: { name: string; telefon: string; email: string };
  unterschriften: Unterschrift[];
}

export type LinkOeffnen = LinkInhalt | { status: 'code_falsch'; rest: number } | { status: LinkSperre };

export type LinkUnterschreiben =
  | { status: 'ok'; name: string; unterschriebenAm: string; dokumente: UnterlagenArt[] }
  | { status: 'code_falsch'; rest: number }
  | { status: LinkSperre | 'zug_ungueltig' | 'veraendert' };

const ARTEN: readonly UnterlagenArt[] = ['protokoll', 'vereinbarung', 'verzicht'];
const PERSONEN: readonly UnterschriftPerson[] = ['mitarbeiter', 'berater'];
const SPERREN: readonly LinkSperre[] = ['ungueltig', 'abgelaufen', 'gesperrt', 'unterschrieben', 'fehler'];

const istObjekt = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const text = (x: unknown): string => (typeof x === 'string' ? x : '');
const istArt = (x: unknown): x is UnterlagenArt => (ARTEN as readonly unknown[]).includes(x);

/** Nur die bekannten Unterlagen, nur Text. */
function jeArt(x: unknown): Partial<Record<UnterlagenArt, string>> {
  const aus: Partial<Record<UnterlagenArt, string>> = {};
  if (!istObjekt(x)) return aus;
  for (const a of ARTEN) if (typeof x[a] === 'string') aus[a] = x[a] as string;
  return aus;
}

function unterschriftAus(x: unknown): Unterschrift | null {
  if (!istObjekt(x) || !(PERSONEN as readonly unknown[]).includes(x.person)) return null;
  return {
    person: x.person as UnterschriftPerson,
    name: text(x.name),
    zug: text(x.zug),
    dokumente: Array.isArray(x.dokumente) ? x.dokumente.filter(istArt) : [],
    unterschriebenAm: text(x.unterschrieben_am),
    kanal: x.kanal === 'link' ? 'link' : 'bildschirm',
    nachweis: null,
  };
}

/** Rest-Versuche oder Sperre — fuer beide Antworten gleich. */
function abgewiesen(v: Record<string, unknown>): { status: 'code_falsch'; rest: number } | { status: LinkSperre } | null {
  if (v.status === 'code_falsch') {
    const rest = typeof v.rest === 'number' ? v.rest : 0;
    return rest > 0 ? { status: 'code_falsch', rest } : { status: 'gesperrt' };
  }
  if ((SPERREN as readonly unknown[]).includes(v.status)) return { status: v.status as LinkSperre };
  return null;
}

/** Die Antwort von bav_link_oeffnen. Was nicht passt, gilt als Fehler. */
export function oeffnenAus(roh: unknown): LinkOeffnen {
  if (!istObjekt(roh)) return { status: 'fehler' };
  const nein = abgewiesen(roh);
  if (nein) return nein;
  if (roh.status !== 'ok') return { status: 'fehler' };
  const entscheidung = roh.entscheidung === 'teilnahme' || roh.entscheidung === 'verzicht' ? roh.entscheidung : null;
  const unterlagen = jeArt(roh.unterlagen);
  if (!entscheidung || !unterlagen.protokoll) return { status: 'fehler' };
  const b = istObjekt(roh.berater) ? roh.berater : {};
  return {
    status: 'ok',
    mitarbeiter: text(roh.mitarbeiter),
    firma: text(roh.firma),
    entscheidung,
    axa: roh.axa === true,
    gueltigBis: text(roh.gueltig_bis),
    festgeschriebenAm: text(roh.festgeschrieben_am),
    pruefsummen: jeArt(roh.pruefsummen),
    unterlagen,
    berater: { name: text(b.name), telefon: text(b.telefon), email: text(b.email) },
    unterschriften: (Array.isArray(roh.unterschriften) ? roh.unterschriften : [])
      .map(unterschriftAus)
      .filter((u): u is Unterschrift => u !== null),
  };
}

/** Die Antwort von bav_link_unterschreiben. */
export function unterschreibenAus(roh: unknown): LinkUnterschreiben {
  if (!istObjekt(roh)) return { status: 'fehler' };
  const nein = abgewiesen(roh);
  if (nein) return nein;
  if (roh.status === 'zug_ungueltig' || roh.status === 'veraendert') return { status: roh.status };
  if (roh.status !== 'ok' || !text(roh.unterschrieben_am)) return { status: 'fehler' };
  return {
    status: 'ok',
    name: text(roh.name),
    unterschriebenAm: text(roh.unterschrieben_am),
    dokumente: Array.isArray(roh.dokumente) ? roh.dokumente.filter(istArt) : [],
  };
}

/** Der Nachweis einer Unterschrift per Link, wie die Datenbank ihn festhaelt. */
export function nachweisAus(roh: unknown): Nachweis | null {
  if (!istObjekt(roh)) return null;
  const wahl = (k: string) => (typeof roh[k] === 'string' && roh[k] !== '' ? roh[k] as string : undefined);
  return {
    linkErstelltAm: wahl('link_erstellt_am'),
    linkErstelltVon: wahl('link_erstellt_von'),
    geoeffnetAm: wahl('geoeffnet_am'),
    codeBestaetigtAm: wahl('code_bestaetigt_am'),
    ip: wahl('ip'),
    weiterleitung: wahl('weiterleitung'),
    browser: wahl('browser'),
    adresse: wahl('adresse'),
    pruefsummen: jeArt(roh.pruefsummen),
  };
}

// --- Aufrufe ---------------------------------------------------------------

/** Mit Token und Code die Unterlagen holen. Ein falscher Code zaehlt als Fehlversuch. */
export async function linkOeffnen(token: string, code: string): Promise<LinkOeffnen> {
  if (!supabase) return { status: 'fehler' };
  try {
    const { data, error } = await supabase.rpc('bav_link_oeffnen', { p_token: token, p_code: code });
    return error ? { status: 'fehler' } : oeffnenAus(data);
  } catch {
    return { status: 'fehler' };
  }
}

/**
 * Unterschreiben. `pruefsummen` hat die Seite aus dem HTML gerechnet, das sie
 * gezeigt hat — weicht es von der festgeschriebenen Fassung ab, lehnt die
 * Datenbank ab.
 */
export async function linkUnterschreiben(
  token: string, code: string, zug: string, pruefsummen: Partial<Record<UnterlagenArt, string>>,
): Promise<LinkUnterschreiben> {
  if (!supabase) return { status: 'fehler' };
  try {
    const { data, error } = await supabase.rpc('bav_link_unterschreiben', {
      p_token: token, p_code: code, p_zug: zug, p_pruefsummen: pruefsummen,
    });
    return error ? { status: 'fehler' } : unterschreibenAus(data);
  } catch {
    return { status: 'fehler' };
  }
}
