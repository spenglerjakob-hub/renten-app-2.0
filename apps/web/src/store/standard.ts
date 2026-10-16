import { szenarioSchema, type SzenarioParsed } from '@renten/schema';

/**
 * DER NEUE FALL — rein, ohne Speicher.
 *
 * Stand bisher in `store/szenario.ts`. Die Datei liest aber beim Import den
 * Speicher des Browsers und legt den Store an; die oeffentliche
 * Schnellrechnung braucht dieselbe Grundlage, ohne den Arbeitsfall eines
 * Beraters anzufassen, der am selben Geraet angemeldet war.
 */

/**
 * Was an einem frischen Fall OFFEN ist: die vorbelegten Angaben und die
 * beiden Schritte, die es bei einem neuen Fall noch nicht gibt.
 *
 * Bedeutung und Art je Pfad stehen in `features/vorbelegung.ts`; ein Test
 * dort prueft, dass jeder Pfad hier einen Eintrag hat.
 */
export const STANDARD_OFFEN: readonly string[] = [
  // Gehoeren dem Mandanten und stimmen fast nie: Beispielwerte.
  'personen.A.geburtsdatum',
  'personen.A.grvBruttoHeute',
  'einkommenHeute.betrag',
  'haushalt.zielNettoHeute',
  // Uebliche Annahmen und typische Angaben: Standardwerte.
  'personen.A.rentenbeginn',
  'einkommenHeute.modus',
  'einkommenHeute.auszahlungen',
  'haushalt.verheiratet',
  'haushalt.bundesland',
  'haushalt.kirchensteuer',
  'haushalt.kvStatus',
  'haushalt.zusatzbeitrag',
  'haushalt.kinderUnter25',
  'haushalt.pkv',
  'annahmen.inflation',
  'annahmen.rentendynamik',
  // Schritte
  'vertraege',
  'auswertung',
];

export function standardSzenario(): SzenarioParsed {
  const jahr = new Date().getFullYear();
  return szenarioSchema.parse({
    schemaVersion: 1,
    haushalt: {
      verheiratet: false, bundesland: 'Baden-Württemberg', kirchensteuer: false,
      hatKinder: false, kinderUnter25: 0, kvStatus: 'kvdr', pkvPraemieMonat: 600,
      zielNettoHeute: 2000,
    },
    annahmen: { inflation: 0.02, rentendynamik: 0.01, tarifIndex: 0.01, gehaltsdynamik: 0.02 },
    einkommenHeute: {
      modus: 'brutto', betrag: 4000, auszahlungen: 12,
      besoldungsgruppe: 'A13', besoldungsstufe: 4, besoldungsland: 'Baden-Württemberg',
    },
    personen: [{
      id: 'A', name: '', geburtsdatum: '01.01.1985', rentenbeginn: `01.01.${1985 + 67}`,
      art: 'grv', grvBruttoHeute: 1500,
      besoldungsgruppe: 'A13', besoldungsstufe: 8, ruhegehaltssatz: 71.75,
      dienstbeginn: `01.01.${jahr - 5}`, teilzeitphasen: [],
    }],
    vertraege: [],
    planer: { startkapital: 0, dauerJahre: 25, rendite: 0.02, dynamik: 0, insNettoEinrechnen: false },
    offen: [...STANDARD_OFFEN],
  });
}
