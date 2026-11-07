import { describe, expect, it } from 'vitest';
import { fallName, mitName, namensTeile, vollerName } from './namen';

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

describe('fallName', () => {
  const p = (name: string, vorname = '', nachname = '') => ({ name, vorname, nachname });

  it('eine Person: der ganze Name', () => {
    expect(fallName([p('Max Mustermann', 'Max', 'Mustermann')])).toBe('Max Mustermann');
    // Aus der Zeit vor den getrennten Feldern: nur der ganze Name
    expect(fallName([p('Max  Mustermann')])).toBe('Max Mustermann');
  });

  it('ein Paar mit gleichem Nachnamen: der Nachname einmal', () => {
    expect(fallName([p('Max Mustermann', 'Max', 'Mustermann'), p('Erika Mustermann', 'Erika', 'Mustermann')]))
      .toBe('Max und Erika Mustermann');
  });

  it('verschiedene Nachnamen oder nur ein Teil: beide ganz', () => {
    expect(fallName([p('Max Mustermann', 'Max', 'Mustermann'), p('Erika Schmidt', 'Erika', 'Schmidt')]))
      .toBe('Max Mustermann und Erika Schmidt');
    expect(fallName([p('Max', 'Max', ''), p('Erika', 'Erika', '')])).toBe('Max und Erika');
  });

  it('ohne Namen leer — Platzhalter gehören nicht in den Plannamen', () => {
    expect(fallName([p(''), p('  ')])).toBe('');
    expect(fallName([p(''), p('Erika Mustermann', 'Erika', 'Mustermann')])).toBe('Erika Mustermann');
  });
});
