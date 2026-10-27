import { describe, expect, it } from 'vitest';
import { mitName, namensTeile, vollerName } from './namen';

describe('vollerName', () => {
  it('setzt Vor- und Nachname zusammen', () => {
    expect(vollerName({ vorname: 'Anna', nachname: 'Beispiel' })).toBe('Anna Beispiel');
  });

  it('kommt mit einem leeren Teil aus', () => {
    expect(vollerName({ vorname: 'Anna', nachname: '' })).toBe('Anna');
    expect(vollerName({ vorname: '', nachname: 'Beispiel' })).toBe('Beispiel');
    expect(vollerName({ vorname: ' ', nachname: '' })).toBe('');
  });

  it('glaettet Leerzeichen', () => {
    expect(vollerName({ vorname: '  Anna   Maria ', nachname: ' von  Berg ' })).toBe('Anna Maria von Berg');
  });
});

describe('namensTeile', () => {
  it('nimmt die getrennten Felder, wenn sie zum Namen passen', () => {
    expect(namensTeile('Anna Maria von Berg', 'Anna Maria', 'von Berg')).toEqual({ vorname: 'Anna Maria', nachname: 'von Berg' });
    // Waehrend der Eingabe: Leerzeichen am Ende stehen nur in den Feldern
    expect(namensTeile('Anna', 'Anna ', '')).toEqual({ vorname: 'Anna ', nachname: '' });
  });

  it('teilt einen Namen ohne Felder: das letzte Wort ist der Nachname', () => {
    expect(namensTeile('Anna Beispiel')).toEqual({ vorname: 'Anna', nachname: 'Beispiel' });
    expect(namensTeile('  Anna   Maria  Schmidt ')).toEqual({ vorname: 'Anna Maria', nachname: 'Schmidt' });
    expect(namensTeile('Anna')).toEqual({ vorname: 'Anna', nachname: '' });
    expect(namensTeile('')).toEqual({ vorname: '', nachname: '' });
  });

  it('teilt neu, wenn der Name anderswo geaendert wurde (Live-Seite)', () => {
    expect(namensTeile('Max Muster', 'Anna', 'Beispiel')).toEqual({ vorname: 'Max', nachname: 'Muster' });
  });
});

describe('mitName', () => {
  it('speichert die Teile und den ganzen Namen', () => {
    expect(mitName({ vorname: 'Anna', nachname: 'Beispiel' })).toEqual({ vorname: 'Anna', nachname: 'Beispiel', name: 'Anna Beispiel' });
  });
});
