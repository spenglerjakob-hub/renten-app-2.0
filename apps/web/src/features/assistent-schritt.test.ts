import { describe, it, expect } from 'vitest';
import { assistentSchrittFuerPfade } from './Assistent';

/*
  Die Schritte des Assistenten: 0 Person und gesetzliche Rente, 1 Haushalt und
  Krankenversicherung, 2 Einkommen, 3 bestehende Vorsorge, 4 Ziel.
*/
describe('assistentSchrittFuerPfade — wohin „Zu den Angaben“ führt', () => {
  it('in den Abschnitt, in dem die Angabe steht', () => {
    expect(assistentSchrittFuerPfade(['personen.A.geburtsdatum'])).toBe(0);
    expect(assistentSchrittFuerPfade(['personen.B.grvBruttoHeute'])).toBe(0);
    expect(assistentSchrittFuerPfade(['haushalt.pkv'])).toBe(1);
    expect(assistentSchrittFuerPfade(['einkommenHeute.betrag'])).toBe(2);
    expect(assistentSchrittFuerPfade(['einkommenPartner.betrag'])).toBe(2);
    expect(assistentSchrittFuerPfade(['haushalt.zielNettoHeute'])).toBe(4);
  });

  it('fehlt mehreres, in den ersten — die Angaben werden von oben nach unten ausgefüllt', () => {
    expect(assistentSchrittFuerPfade(['haushalt.zielNettoHeute', 'einkommenHeute.betrag'])).toBe(2);
    expect(assistentSchrittFuerPfade(['haushalt.zielNettoHeute', 'einkommenHeute.betrag', 'personen.A.geburtsdatum'])).toBe(0);
  });

  it('ohne fehlende Angabe nirgendwohin', () => {
    expect(assistentSchrittFuerPfade([])).toBeNull();
    expect(assistentSchrittFuerPfade(['vertraege', 'auswertung'])).toBeNull();
  });
});
