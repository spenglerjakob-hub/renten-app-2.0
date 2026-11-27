import type { SzenarioParsed } from '@renten/schema';

type Angebot = SzenarioParsed['loesungen']['angebote'][number];

/**
 * Ein Angebot, an dem noch niemand gearbeitet hat: ohne Rente und Kapital —
 * und ohne Anbieter, es sei denn, den hat der Vorschlag selbst mitgebracht
 * (`ausVorschlag`: unveraendert uebernommen, mit dem von Hand eingetragenen Tarif).
 */
const unberuehrt = (a: Angebot) => a.renteMonat <= 0 && a.kapital <= 0 && (a.ausVorschlag || a.name.trim() === '');

/**
 * Die Angebote, nachdem ein Vorschlag uebernommen ist. Unberuehrte Angebote
 * weichen dem neuen Vorschlag — sonst stuende nach jeder geaenderten Antwort
 * ein weiterer Satz leerer Angebote da. Was der Berater mit einem Anbieter
 * versehen hat, was eine Rente oder ein Kapital traegt oder angenommen ist,
 * bleibt stehen.
 */
export function angeboteMitVorschlag(
  angebote: readonly Angebot[], angenommen: readonly string[], neu: readonly Angebot[],
): Angebot[] {
  const bleibt = angebote.filter((a) => !unberuehrt(a) || angenommen.includes(a.id));
  return [...bleibt, ...neu].slice(0, 12);
}
