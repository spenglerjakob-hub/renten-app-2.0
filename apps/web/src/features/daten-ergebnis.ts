import { parseDatum } from '@renten/engine';
import type { SzenarioParsed } from '@renten/schema';
import { euro } from '../components/Feld';
import { fehlt } from './vorbelegung';

/**
 * DAS ERGEBNIS EINES SCHRITTS DER ANGABEN IN EINEM SATZ — fuer die Zeile, zu
 * der ein Schritt wird, sobald man weiter ist (`components/Ablauf.tsx`).
 *
 * Die Zeile soll sagen, was eingetragen ist, nicht dass etwas eingetragen
 * ist: „Verheiratet · 2 Kinder · gesetzlich versichert“ laesst sich mit einem
 * Blick pruefen, ein Haken nicht. Eine Angabe, die noch FEHLT, steht nicht
 * darin — unter ihr liegt nur ein Platzhalter (`features/vorbelegung.ts`);
 * dass sie fehlt, sagt die Zeile daneben selbst.
 */

type Person = SzenarioParsed['personen'][number];
type Einkommen = SzenarioParsed['einkommenHeute'];

const beteiligte = (s: SzenarioParsed) => s.personen.filter((p) => p.id === 'A' || s.haushalt.verheiratet);

/** Vollendete Lebensjahre am Stichtag — null ohne gueltiges Geburtsdatum. */
export function alterAm(geburtsdatum: string, heute: Date): number | null {
  const d = parseDatum(geburtsdatum);
  if (!d) return null;
  const vorGeburtstag = heute.getMonth() + 1 < d.monat
    || (heute.getMonth() + 1 === d.monat && heute.getDate() < d.tag);
  const alter = heute.getFullYear() - d.jahr - (vorGeburtstag ? 1 : 0);
  return alter >= 0 && alter < 130 ? alter : null;
}

/** „Anna, 41“ — ohne Namen „41 Jahre“, ohne Geburtsdatum nur der Name. */
function werUndAlter(s: SzenarioParsed, p: Person, heute: Date): string {
  const name = (p.vorname ?? '').trim() || p.name.trim();
  const alter = fehlt(s, `personen.${p.id}.geburtsdatum`) ? null : alterAm(p.geburtsdatum, heute);
  if (name && alter !== null) return `${name}, ${alter}`;
  if (name) return name;
  return alter !== null ? `${alter} Jahre` : '';
}

export function haushaltSatz(s: SzenarioParsed): string {
  const kinder = s.haushalt.kinderUnter25;
  return [
    s.haushalt.verheiratet ? 'Verheiratet' : 'Alleinstehend',
    kinder === 1 ? '1 Kind' : kinder > 1 ? `${kinder} Kinder` : '',
    s.haushalt.kvStatus === 'pkv' ? 'privat versichert' : 'gesetzlich versichert',
  ].filter(Boolean).join(' · ');
}

export function personenSatz(s: SzenarioParsed, heute: Date): string {
  const wer = beteiligte(s);
  const namen = wer.map((p) => werUndAlter(s, p, heute)).filter(Boolean);
  // Der Anspruch steht nur bei einer Person dabei — bei zweien wuerde die Zeile zur Tabelle.
  const [einzige] = wer;
  const anspruch = wer.length === 1 && einzige
    ? einzige.art === 'pension' ? 'Pension'
      : fehlt(s, `personen.${einzige.id}.grvBruttoHeute`) ? '' : `Rentenanspruch ${euro(einzige.grvBruttoHeute)}`
    : '';
  return [...namen, anspruch].filter(Boolean).join(' · ');
}

function einkommenText(e: Einkommen, betragFehlt: boolean): string {
  if (betragFehlt && e.modus !== 'besoldung') return '';
  switch (e.modus) {
    case 'brutto': return `${euro(e.betrag)} brutto im Monat`;
    case 'netto': return `${euro(e.betrag)} netto im Monat`;
    case 'besoldung': return `Besoldung ${e.besoldungsgruppe}, Stufe ${e.besoldungsstufe}`;
    case 'selbststaendig': return `${euro(e.betrag)} Gewinn im Monat`;
  }
}

export function einkommenSatz(s: SzenarioParsed): string {
  const eigenes = einkommenText(s.einkommenHeute, fehlt(s, 'einkommenHeute.betrag'));
  return s.haushalt.verheiratet && s.einkommenGetrennt
    ? [eigenes, einkommenText(s.einkommenPartner, fehlt(s, 'einkommenPartner.betrag'))].filter(Boolean).join(' · ')
    : eigenes;
}

/** @param offen Die Frage nach Vertraegen ist noch nicht beantwortet — dann sagt die Zeile selbst „noch nicht erfasst“. */
export function vertraegeSatz(s: SzenarioParsed, offen: boolean): string {
  const n = s.vertraege.length;
  if (n === 0) return offen ? '' : 'Keine bestehenden Verträge';
  return n === 1 ? '1 Vertrag' : `${n} Verträge`;
}

export function zielSatz(s: SzenarioParsed): string {
  if (fehlt(s, 'haushalt.zielNettoHeute')) return '';
  return `${euro(s.haushalt.zielNettoHeute)} netto im Monat, in heutigem Geld`;
}

/** Die ganze Etappe „Daten & Ziel“ in einer Zeile: wer, und mit welchem Ziel. */
export function datenSatz(s: SzenarioParsed, heute: Date): string {
  const namen = beteiligte(s).map((p) => werUndAlter(s, p, heute)).filter(Boolean);
  const ziel = fehlt(s, 'haushalt.zielNettoHeute') ? '' : `Ziel ${euro(s.haushalt.zielNettoHeute)} netto`;
  return [...namen, ziel].filter(Boolean).join(' · ');
}
