/**
 * Wo man auf der Seite /mitarbeiterberatung steht — in der Adresse, damit
 * Neuladen und „Zurück“ im Browser funktionieren:
 *
 *   /mitarbeiterberatung                          Firmen (bAV-Verwaltung: Agenturen)
 *   /mitarbeiterberatung?agentur=<id>             eine Agentur mit ihren Firmen
 *   /mitarbeiterberatung?firma=<id>&reiter=…      eine Firma
 *   /mitarbeiterberatung?firma=<id>&beratung=<id> eine Beratung
 *
 * Die IDs sind UUIDs; alles andere wird ignoriert, statt eine Anfrage mit
 * Unsinn auszuloesen.
 */
export type Reiter = 'mitarbeiter' | 'angebot' | 'uebersicht';

export interface Ort {
  /** Die Agentur, deren Firmen man ansieht — nur ohne Firma; fehlt sie, ist es die Liste */
  agentur?: string | null;
  firma: string | null;
  beratung: string | null;
  reiter: Reiter;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REITER: readonly Reiter[] = ['mitarbeiter', 'angebot', 'uebersicht'];

export function ortAus(suche: string): Ort {
  const q = new URLSearchParams(suche);
  const firma = q.get('firma');
  const beratung = q.get('beratung');
  const reiter = q.get('reiter');
  const f = firma && UUID.test(firma) ? firma.toLowerCase() : null;
  const agentur = q.get('agentur');
  return {
    agentur: !f && agentur && UUID.test(agentur) ? agentur.toLowerCase() : null,
    firma: f,
    beratung: f && beratung && UUID.test(beratung) ? beratung.toLowerCase() : null,
    reiter: (REITER as readonly string[]).includes(reiter ?? '') ? reiter as Reiter : 'mitarbeiter',
  };
}

export function ortSuche(o: Ort): string {
  const q = new URLSearchParams();
  if (o.firma) q.set('firma', o.firma);
  else if (o.agentur) q.set('agentur', o.agentur);
  if (o.firma && o.beratung) q.set('beratung', o.beratung);
  else if (o.firma && o.reiter !== 'mitarbeiter') q.set('reiter', o.reiter);
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const FIRMEN: Ort = { agentur: null, firma: null, beratung: null, reiter: 'mitarbeiter' };
