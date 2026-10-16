import type { SzenarioParsed } from '@renten/schema';
import { eintragVon, offenePfade, relevant } from './vorbelegung';

/**
 * FORTSCHRITT EINES FALLS — nur aus echten Schritten.
 *
 * Gezaehlt wird, was wirklich getan ist: Das Konto ist angelegt, die
 * Beispielwerte sind ersetzt oder bestaetigt, Vertraege sind erfasst (oder
 * es gibt ausdruecklich keine), das Ergebnis wurde angesehen. Vorbelegte
 * Beispielwerte zaehlen NICHT — sonst stuende ein unberuehrter Fall auf
 * „fast fertig“. Standardwerte blockieren keinen Schritt: Sie sind gueltige
 * Annahmen und sichtbar gekennzeichnet.
 *
 * Nie 0 %: Das Konto ist ein echter, erledigter Schritt. Kommt ein Fall aus
 * dem Vorsorge-Check, sind Mandantendaten, Einkuenfte und Vertraege oft
 * schon erledigt — der Vorsprung ist dann ebenso echt.
 */

export type FallSchrittId = 'konto' | 'mandant' | 'einkuenfte' | 'vertraege' | 'ziel' | 'auswertung';

export interface FallSchritt {
  id: FallSchrittId;
  text: string;
  erledigt: boolean;
  /** Was noch fehlt, in Worten: „Beispielwert: Rentenanspruch“ */
  offen: string[];
  /** Erledigt, aber mit Standardwerten — die Leiste sagt es dazu */
  mitStandard: boolean;
}

const PERSON = /^personen\.([AB])\.(.+)$/;

/** Welche Pfade zu welchem Schritt gehoeren. Die Annahmen gehoeren keinem — sie stehen im Kopf. */
const GEHOERT_ZU: Record<'mandant' | 'einkuenfte' | 'ziel', (pfad: string) => boolean> = {
  mandant: (p) => /^personen\.[AB]\.(geburtsdatum|rentenbeginn)$/.test(p)
    || (p.startsWith('haushalt.') && p !== 'haushalt.zielNettoHeute'),
  einkuenfte: (p) => p.startsWith('einkommen') || /^personen\.[AB]\.grvBruttoHeute$/.test(p),
  ziel: (p) => p === 'haushalt.zielNettoHeute',
};

export function fallFortschritt(
  s: SzenarioParsed,
  { konto, nameVon }: { konto: boolean; nameVon?: (id: 'A' | 'B') => string },
): FallSchritt[] {
  const offen = offenePfade(s).filter((p) => relevant(s, p));
  const paar = s.haushalt.verheiratet && s.personen.length > 1;

  const text = (pfad: string) => {
    const t = eintragVon(pfad)?.text ?? pfad;
    const m = PERSON.exec(pfad);
    return m && paar && nameVon ? `${t} (${nameVon(m[1] as 'A' | 'B')})` : t;
  };

  const bereich = (id: 'mandant' | 'einkuenfte' | 'ziel', titel: string): FallSchritt => {
    const hier = offen.filter(GEHOERT_ZU[id]);
    const beispiele = hier.filter((p) => eintragVon(p)?.art === 'beispiel');
    return {
      id,
      text: titel,
      erledigt: beispiele.length === 0,
      offen: beispiele.map((p) => `Beispielwert: ${text(p)}`),
      mitStandard: beispiele.length === 0 && hier.some((p) => eintragVon(p)?.art === 'standard'),
    };
  };

  return [
    { id: 'konto', text: 'Konto', erledigt: konto, offen: konto ? [] : ['nicht angemeldet'], mitStandard: false },
    bereich('mandant', 'Mandantendaten'),
    bereich('einkuenfte', 'Einkünfte'),
    {
      id: 'vertraege',
      text: 'Vorsorgeverträge',
      erledigt: !offen.includes('vertraege'),
      offen: offen.includes('vertraege') ? ['noch nicht erfasst'] : [],
      mitStandard: false,
    },
    bereich('ziel', 'Ziel'),
    {
      id: 'auswertung',
      text: 'Auswertung',
      erledigt: !offen.includes('auswertung'),
      offen: offen.includes('auswertung') ? ['Ergebnis noch nicht angesehen'] : [],
      mitStandard: false,
    },
  ];
}

/** Sind die Angaben der ersten Etappe vollstaendig? Fuer den Haken in der Etappen-Leiste. */
export function datenErledigt(schritte: readonly FallSchritt[]): boolean {
  return schritte
    .filter((x) => x.id === 'mandant' || x.id === 'einkuenfte' || x.id === 'vertraege' || x.id === 'ziel')
    .every((x) => x.erledigt);
}
