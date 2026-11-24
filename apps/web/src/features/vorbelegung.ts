import type { SzenarioParsed } from '@renten/schema';
import { STANDARD_OFFEN, standardSzenario } from '../store/standard';

/**
 * WAS AN EINEM FALL NOCH OFFEN IST — fehlende Angaben und uebliche Annahmen.
 *
 * Ein neuer Fall gibt NICHTS vor, was dem Mandanten gehoert: Geburtsdatum,
 * Einkommen, Rentenanspruch und Ziel stehen leer da, bis sie jemand
 * eintraegt. (Bis November 2026 standen dort Beispielwerte — Jahrgang 1985,
 * 4.000 € brutto —, mit denen der Fall von der ersten Sekunde an rechnete.
 * Das sah nach einer Auskunft aus und war keine.)
 *
 * ZWEI ARTEN, weil sie Verschiedenes bedeuten:
 *   - ANGABE: gehoert dem Mandanten (Geburtsdatum, Einkommen,
 *     Rentenanspruch, Ziel). Solange sie offen ist, FEHLT sie: Das Feld
 *     steht leer, und ohne sie gibt es kein Ergebnis.
 *   - STANDARD: eine uebliche Annahme oder typische Angabe (Inflation,
 *     Rentenanpassung, KVdR). Passt sie, darf sie bleiben — sie blockiert
 *     nichts.
 *
 * Gespeichert wird das im Szenario selbst (`offen`), damit es mit dem Fall
 * reist: ins Konto, in die Datei, aus dem Vorsorge-Check.
 *
 * WAS UNTER EINER FEHLENDEN ANGABE LIEGT, ist ein technischer Platzhalter
 * (`store/standard.ts`): Das Schema verlangt ein gueltiges Datum und Zahlen.
 * Gezeigt und gerechnet wird damit nie — dafuer sorgen `fehlt` am Feld und
 * `fehlendeAngaben` am Ergebnis.
 */

export type VorbelegungsArt = 'angabe' | 'standard';

export interface VorbelegungsEintrag {
  art: VorbelegungsArt;
  /** Kurzbezeichnung fuer Listen: „Geburtsdatum“, „Rentenanspruch“ */
  text: string;
  /** Woher der Standardwert kommt — fuer den Tooltip */
  hinweis?: string;
}

/** Je Person mit `*` statt der Kennung: 'personen.*.geburtsdatum' gilt fuer A und B. */
const EINTRAEGE: Record<string, VorbelegungsEintrag> = {
  'personen.*.geburtsdatum': { art: 'angabe', text: 'Geburtsdatum' },
  'personen.*.grvBruttoHeute': { art: 'angabe', text: 'Rentenanspruch' },
  'personen.*.rentenbeginn': { art: 'standard', text: 'Rentenbeginn', hinweis: 'Regelaltersgrenze nach Jahrgang.' },
  'einkommenHeute.betrag': { art: 'angabe', text: 'Einkommen' },
  'einkommenPartner.betrag': { art: 'angabe', text: 'Einkommen Partner' },
  'einkommenHeute.modus': { art: 'standard', text: 'Art des Einkommens' },
  'einkommenHeute.auszahlungen': { art: 'standard', text: 'Gehälter im Jahr' },
  'haushalt.zielNettoHeute': { art: 'angabe', text: 'Zielnetto' },
  'haushalt.verheiratet': { art: 'standard', text: 'Familienstand' },
  'haushalt.bundesland': { art: 'standard', text: 'Bundesland' },
  'haushalt.kirchensteuer': { art: 'standard', text: 'Kirchensteuer' },
  'haushalt.kvStatus': { art: 'standard', text: 'Krankenversicherung' },
  'haushalt.zusatzbeitrag': { art: 'standard', text: 'Zusatzbeitrag', hinweis: 'Gesetzlicher Durchschnitt.' },
  'haushalt.kinderUnter25': { art: 'standard', text: 'Kinder' },
  'haushalt.pkv': { art: 'angabe', text: 'PKV-Beitrag' },
  'annahmen.inflation': { art: 'standard', text: 'Inflation', hinweis: 'Vorsichtige Annahme: 2 % pro Jahr.' },
  'annahmen.rentendynamik': {
    art: 'standard', text: 'Rentenanpassung',
    hinweis: 'Vorgabe 1,5 % pro Jahr (bis November 2026: 1 %), zwischen den Hochrechnungen der Renteninformation mit 1 % und 2 %.',
  },
};

/** Schritte, keine Felder — sie stehen in `offen`, haben aber keine Marke. */
export const SCHRITTE = ['vertraege', 'auswertung'] as const;

const PERSON = /^personen\.([AB])\.(.+)$/;

export function eintragVon(pfad: string): VorbelegungsEintrag | undefined {
  const m = PERSON.exec(pfad);
  return EINTRAEGE[m ? `personen.*.${m[2]}` : pfad];
}

/** Alle Pfade, die eine Marke kennen — fuer den Test gegen `STANDARD_OFFEN`. */
export const BEKANNTE_PFADE = Object.keys(EINTRAEGE);

/**
 * Der Wert hinter einem Pfad. Nur die Formen, die `EINTRAEGE` kennt —
 * kein allgemeiner Pfad-Leser.
 */
function wertAn(s: SzenarioParsed, pfad: string): unknown {
  const m = PERSON.exec(pfad);
  if (m) {
    const p = s.personen.find((x) => x.id === m[1]) as Record<string, unknown> | undefined;
    return p?.[m[2]!];
  }
  const [bereich, feld] = pfad.split('.') as [string, string];
  const b = (s as unknown as Record<string, Record<string, unknown> | undefined>)[bereich];
  return b?.[feld];
}

const gleich = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/*
  ALTE FAELLE tragen kein `offen`. Abgeleitet wird es aus dem Vergleich mit
  einem frischen Fall: Was dort genauso steht, hat vermutlich niemand
  eingetragen. Ohne das stuende jeder alte Fall — auch ein unberuehrter im
  Speicher — auf „alles erledigt“.

  Je Szenario-Objekt einmal: Die Felder fragen bei jedem Zeichnen, und ein
  frischer Fall kostet eine Schema-Pruefung.
*/
const abgeleitet = new WeakMap<SzenarioParsed, string[]>();

function ableiten(s: SzenarioParsed): string[] {
  const std = standardSzenario();
  const offen: string[] = [];
  const pruefe = (pfad: string, vergleich: string) => {
    if (gleich(wertAn(s, pfad), wertAn(std, vergleich))) offen.push(pfad);
  };
  for (const pfad of STANDARD_OFFEN) {
    if (pfad === 'vertraege') { if (s.vertraege.length === 0) offen.push(pfad); continue; }
    if (pfad === 'auswertung') continue;
    pruefe(pfad, pfad);
  }
  // Person B kopiert beim Anlegen die Angaben von A — gleich dem Platzhalter heisst: fehlt.
  if (s.haushalt.verheiratet && s.personen.some((p) => p.id === 'B')) {
    for (const feld of ['geburtsdatum', 'grvBruttoHeute', 'rentenbeginn']) {
      pruefe(`personen.B.${feld}`, `personen.A.${feld}`);
    }
  }
  // Ausgewertet ist ein alter Fall vermutlich, wenn er echte Angaben traegt.
  if (offen.some((p) => eintragVon(p)?.art === 'angabe' && relevant(s, p))) offen.push('auswertung');
  return offen;
}

/** Was offen ist — aus `offen` oder, bei alten Faellen, abgeleitet. */
export function offenePfade(s: SzenarioParsed): readonly string[] {
  if (s.offen) return s.offen;
  let o = abgeleitet.get(s);
  if (!o) { o = ableiten(s); abgeleitet.set(s, o); }
  return o;
}

/** Die Pfade, die ein Setter beruehrt: `pfadeAus('haushalt', { bundesland })` → ['haushalt.bundesland']. */
export function pfadeAus(praefix: string, teil: object): string[] {
  return Object.keys(teil).map((k) => `${praefix}.${k}`);
}

/** Streicht beruehrte Pfade aus `offen` — und schreibt `offen` dabei fest. */
export function geprueft(s: SzenarioParsed, pfade: readonly string[]): SzenarioParsed {
  return { ...s, offen: offenePfade(s).filter((p) => !pfade.includes(p)) };
}

/** Nimmt Pfade (wieder) in `offen` auf — etwa die Angaben eines neu angelegten Partners. */
export function wiederOffen(s: SzenarioParsed, pfade: readonly string[]): SzenarioParsed {
  const alt = offenePfade(s);
  return { ...s, offen: [...alt, ...pfade.filter((p) => !alt.includes(p))] };
}

/** Die Pfade der Angaben, die noch fehlen: offen, eine Angabe des Mandanten, und im Fall ueberhaupt gefragt. */
export function fehlendePfade(s: SzenarioParsed): string[] {
  return offenePfade(s).filter((p) => eintragVon(p)?.art === 'angabe' && relevant(s, p));
}

/** Fehlt diese eine Angabe noch? Dann steht ihr Feld leer. */
export function fehlt(s: SzenarioParsed, pfad: string): boolean {
  return eintragVon(pfad)?.art === 'angabe' && offenePfade(s).includes(pfad) && relevant(s, pfad);
}

/**
 * Die fehlenden Angaben als Bezeichnungen, je Person mit Namen, wenn es zwei sind.
 * @param nur Nur diese Pfade — etwa die eines Schritts der Angaben
 */
export function fehlendeAngaben(
  s: SzenarioParsed,
  nameVon?: (id: 'A' | 'B') => string,
  nur: (pfad: string) => boolean = () => true,
): string[] {
  const paar = s.haushalt.verheiratet && s.personen.length > 1;
  return fehlendePfade(s).filter(nur).map((p) => {
    const text = eintragVon(p)!.text;
    const m = PERSON.exec(p);
    return m && paar && nameVon ? `${text} (${nameVon(m[1] as 'A' | 'B')})` : text;
  });
}

/** „Geburtsdatum fehlt“, „Geburtsdatum und Einkommen fehlen“ — leer, wenn nichts fehlt. */
export function fehltSatz(texte: readonly string[]): string {
  if (texte.length === 0) return '';
  if (texte.length === 1) return `${texte[0]} fehlt`;
  return `${texte.slice(0, -1).join(', ')} und ${texte[texte.length - 1]} fehlen`;
}

/**
 * KANN DER RECHENKERN UEBERHAUPT LAUFEN? Ohne Geburtsdatum und Einkommen
 * (und den PKV-Beitrag, wo es einen gibt) gibt es auch kein heutiges Netto.
 *
 * Rentenanspruch und Ziel gehoeren NICHT dazu: Das heutige Netto haengt an
 * ihnen nicht, und der Vorschlag fuer das Ziel („80 % des heutigen Nettos“)
 * braucht es, bevor das Ziel eingetragen ist. Ein ERGEBNIS gibt es trotzdem
 * erst, wenn nichts mehr fehlt (`fehlendePfade`).
 */
const FUER_DAS_NETTO = /^(personen\.[AB]\.geburtsdatum|einkommen(Heute|Partner)\.betrag|haushalt\.pkv)$/;
export function rechenbar(s: SzenarioParsed): boolean {
  return !fehlendePfade(s).some((p) => FUER_DAS_NETTO.test(p));
}

/**
 * Zaehlt eine offene Angabe ueberhaupt? Der Rentenanspruch nicht bei
 * Beamten, das Einkommen nicht bei Besoldung (sie kommt aus der Tabelle),
 * Person B nicht bei Alleinstehenden, der PKV-Beitrag nur bei PKV.
 */
export function relevant(s: SzenarioParsed, pfad: string): boolean {
  const m = PERSON.exec(pfad);
  if (m) {
    const p = s.personen.find((x) => x.id === m[1]);
    if (!p || (m[1] === 'B' && !s.haushalt.verheiratet)) return false;
    if (m[2] === 'grvBruttoHeute') return p.art === 'grv';
    return true;
  }
  if (pfad === 'einkommenHeute.betrag') return s.einkommenHeute.modus !== 'besoldung';
  if (pfad === 'einkommenPartner.betrag') {
    return s.haushalt.verheiratet && s.einkommenGetrennt && s.einkommenPartner.modus !== 'besoldung';
  }
  if (pfad === 'haushalt.pkv') return s.haushalt.kvStatus === 'pkv' || s.haushalt.kvErwerb === 'pkv';
  return true;
}
