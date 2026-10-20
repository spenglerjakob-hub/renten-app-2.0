import { describe, expect, it } from 'vitest';
import { anfragePruefen } from './fruehstart-anfrage';

const gut = { name: 'Max Muster', email: 'max@muster.de', buero: 'Muster Finanz GmbH', berater: '3' };

describe('Early-Adopter-Anfrage: Pruefung im Browser', () => {
  it('vollstaendig und gueltig: keine Fehler', () => {
    expect(anfragePruefen(gut)).toEqual({});
    expect(anfragePruefen({ ...gut, buero: '', berater: '' })).toEqual({});
  });

  it('Name und E-Mail sind Pflicht', () => {
    const f = anfragePruefen({ name: '  ', email: '', buero: '', berater: '' });
    expect(f.name).toBe('Bitte geben Sie Ihren Namen an.');
    expect(f.email).toBe('Bitte prüfen Sie die E-Mail-Adresse.');
  });

  it('E-Mail braucht @ und Punkt in der Domain, ohne Leerzeichen', () => {
    for (const email of ['max', 'max@', 'max@muster', 'max muster@muster.de', '@muster.de']) {
      expect(anfragePruefen({ ...gut, email }).email, email).toBeDefined();
    }
    expect(anfragePruefen({ ...gut, email: ' max@muster.de ' }).email).toBeUndefined();
  });

  it('dieselben Grenzen wie die Datenbank', () => {
    expect(anfragePruefen({ ...gut, name: 'x'.repeat(121) }).name).toBe('Bitte höchstens 120 Zeichen.');
    expect(anfragePruefen({ ...gut, buero: 'x'.repeat(201) }).buero).toBe('Bitte höchstens 200 Zeichen.');
    expect(anfragePruefen({ ...gut, berater: '0' }).berater).toBe('Bitte eine Zahl von 1 bis 500.');
    expect(anfragePruefen({ ...gut, berater: '501' }).berater).toBe('Bitte eine Zahl von 1 bis 500.');
    expect(anfragePruefen({ ...gut, berater: '2,5' }).berater).toBe('Bitte eine Zahl von 1 bis 500.');
    expect(anfragePruefen({ ...gut, berater: '500' }).berater).toBeUndefined();
  });
});
