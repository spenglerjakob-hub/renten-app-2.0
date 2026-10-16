import type { SzenarioParsed } from '@renten/schema';
import { STANDARD_OFFEN, standardSzenario } from '../store/standard';

/**
 * VORBELEGUNG — welche Angaben eines Falls noch nicht vom Berater stammen.
 *
 * Ein neuer Fall ist vollstaendig vorbelegt: Er rechnet ab der ersten
 * Sekunde, und der Berater prueft und korrigiert, statt bei null zu
 * beginnen. Damit daraus keine stille Behauptung wird, traegt jede
 * Vorbelegung eine Marke — am Feld, im Fortschritt und im Gutachten.
 *
 * ZWEI ARTEN, weil sie Verschiedenes bedeuten:
 *   - BEISPIEL: gehoert dem Mandanten und stimmt fast nie (Geburtsdatum,
 *     Einkommen, Rentenanspruch, Ziel). Bleibt er stehen, steht er im
 *     Gutachten als Beispielwert.
 *   - STANDARD: eine uebliche Annahme oder typische Angabe (Inflation,
 *     Rentenanpassung, KVdR). Passt sie, darf sie bleiben — sie ist nur
 *     sichtbar als Annahme gekennzeichnet.
 *
 * Gespeichert wird das im Szenario selbst (`offen`), damit es mit dem Fall
 * reist: ins Konto, in die Datei, aus dem Vorsorge-Check.
 */

export type VorbelegungsArt = 'beispiel' | 'standard';

export interface VorbelegungsEintrag {
  art: VorbelegungsArt;
  /** Kurzbezeichnung fuer Listen: „Geburtsdatum“, „Rentenanspruch“ */
  text: string;
  /** Woher der Standardwert kommt — fuer den Tooltip */
  hinweis?: string;
}

/** Je Person mit `*` statt der Kennung: 'personen.*.geburtsdatum' gilt fuer A und B. */
const EINTRAEGE: Record<string, VorbelegungsEintrag> = {
  'personen.*.geburtsdatum': { art: 'beispiel', text: 'Geburtsdatum' },
  'personen.*.grvBruttoHeute': { art: 'beispiel', text: 'Rentenanspruch' },
  'personen.*.rentenbeginn': { art: 'standard', text: 'Rentenbeginn', hinweis: 'Regelaltersgrenze nach Jahrgang.' },
  'einkommenHeute.betrag': { art: 'beispiel', text: 'Einkommen' },
  'einkommenPartner.betrag': { art: 'beispiel', text: 'Einkommen Partner' },
  'einkommenHeute.modus': { art: 'standard', text: 'Art des Einkommens' },
  'einkommenHeute.auszahlungen': { art: 'standard', text: 'Gehälter im Jahr' },
  'haushalt.zielNettoHeute': { art: 'beispiel', text: 'Zielnetto' },
  'haushalt.verheiratet': { art: 'standard', text: 'Familienstand' },
  'haushalt.bundesland': { art: 'standard', text: 'Bundesland' },
  'haushalt.kirchensteuer': { art: 'standard', text: 'Kirchensteuer' },
  'haushalt.kvStatus': { art: 'standard', text: 'Krankenversicherung' },
  'haushalt.zusatzbeitrag': { art: 'standard', text: 'Zusatzbeitrag', hinweis: 'Gesetzlicher Durchschnitt.' },
  'haushalt.kinderUnter25': { art: 'standard', text: 'Kinder' },
  'haushalt.pkv': { art: 'beispiel', text: 'PKV-Beitrag' },
  'annahmen.inflation': { art: 'standard', text: 'Inflation', hinweis: 'Vorsichtige Annahme: 2 % pro Jahr.' },
  'annahmen.rentendynamik': {
    art: 'standard', text: 'Rentenanpassung',
    hinweis: '1 % pro Jahr; die Renteninformation zeigt Hochrechnungen mit 1 % und 2 %.',
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
  einem frischen Fall: Was dort genauso steht, ist vermutlich noch die
  Vorbelegung. Ohne das stuende jeder alte Fall — auch der unberuehrte
  Beispielfall im Speicher — auf „alles erledigt“.

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
  // Person B kopiert beim Anlegen die Angaben von A — gleich dem Standard heisst Beispiel.
  if (s.haushalt.verheiratet && s.personen.some((p) => p.id === 'B')) {
    for (const feld of ['geburtsdatum', 'grvBruttoHeute', 'rentenbeginn']) {
      pruefe(`personen.B.${feld}`, `personen.A.${feld}`);
    }
  }
  // Ausgewertet ist ein alter Fall vermutlich, wenn er echte Angaben traegt.
  if (offen.some((p) => eintragVon(p)?.art === 'beispiel' && relevant(s, p))) offen.push('auswertung');
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

/** Die offenen Beispielwerte als Bezeichnungen, je Person mit Namen, wenn es zwei sind. */
export function offeneBeispiele(s: SzenarioParsed, nameVon?: (id: 'A' | 'B') => string): string[] {
  const paar = s.haushalt.verheiratet && s.personen.length > 1;
  return offenePfade(s)
    .filter((p) => eintragVon(p)?.art === 'beispiel' && relevant(s, p))
    .map((p) => {
      const text = eintragVon(p)!.text;
      const m = PERSON.exec(p);
      return m && paar && nameVon ? `${text} (${nameVon(m[1] as 'A' | 'B')})` : text;
    });
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
