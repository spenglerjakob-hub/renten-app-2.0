import { describe, expect, it } from 'vitest';
import { vollerName } from './namen';

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
