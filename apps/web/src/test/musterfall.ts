import { szenarioSchema, type SzenarioParsed } from '@renten/schema';
import { standardSzenario } from '../store/standard';

/**
 * DER MUSTERFALL DER TESTS — ein neuer Fall, in den die vier Angaben des
 * Mandanten EINGETRAGEN sind: Jahrgang 1985, 4.000 € brutto, 1.500 €
 * Rentenanspruch, 2.000 € Ziel.
 *
 * Bis November 2026 war das der neue Fall selbst (`standardSzenario`): Er
 * begann mit diesen Beispielwerten. Seit ein neuer Fall nichts mehr vorgibt
 * (`store/standard.ts`), braucht ein Test, der RECHNEN will, einen Fall mit
 * Angaben — sonst rechnete er mit den Platzhaltern (0 € Gehalt) und pruefte
 * nichts mehr.
 *
 * Das Geburtsdatum ist dasselbe wie der Platzhalter; hier ist es eingetragen
 * (nicht mehr in `offen`).
 */
export const MUSTER_ANGABEN = [
  'personen.A.geburtsdatum', 'personen.A.grvBruttoHeute', 'einkommenHeute.betrag', 'haushalt.zielNettoHeute',
] as const;

export function musterSzenario(): SzenarioParsed {
  const s = standardSzenario();
  return szenarioSchema.parse({
    ...s,
    haushalt: { ...s.haushalt, zielNettoHeute: 2000 },
    einkommenHeute: { ...s.einkommenHeute, betrag: 4000 },
    personen: [{ ...s.personen[0]!, geburtsdatum: '01.01.1985', grvBruttoHeute: 1500 }],
    offen: (s.offen ?? []).filter((p) => !(MUSTER_ANGABEN as readonly string[]).includes(p)),
  });
}
