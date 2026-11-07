import { describe, expect, it } from 'vitest';
import { SIE, vornamen, woerter } from './ansprache';

describe('woerter', () => {
  const du = woerter({ form: 'du', mehrere: false, name: 'Max' });
  const ihr = woerter({ form: 'du', mehrere: true, name: 'Max und Erika' });
  const sie = woerter(SIE);

  it('Fuerwoerter fuer eine Person, ein Paar und das Sie', () => {
    expect([du.du, du.dir, du.dich, du.dein(), du.dein('e'), du.Dein('en')]).toEqual(['du', 'dir', 'dich', 'dein', 'deine', 'Deinen']);
    expect([ihr.du, ihr.dir, ihr.dich, ihr.dein(), ihr.dein('e'), ihr.Dein('em')]).toEqual(['ihr', 'euch', 'euch', 'euer', 'eure', 'Eurem']);
    expect([sie.du, sie.dir, sie.dich, sie.dein(), sie.dein('e'), sie.Dein('er')]).toEqual(['Sie', 'Ihnen', 'Sie', 'Ihr', 'Ihre', 'Ihrer']);
    expect([du.Du, ihr.Dir, sie.Du]).toEqual(['Du', 'Euch', 'Sie']);
  });

  it('Verben je Form — ohne Sie-Text gilt der Du-Text', () => {
    expect(du.w('schließt du', 'schließt ihr', 'schließen Sie')).toBe('schließt du');
    expect(ihr.w('schließt du', 'schließt ihr', 'schließen Sie')).toBe('schließt ihr');
    expect(sie.w('schließt du', 'schließt ihr', 'schließen Sie')).toBe('schließen Sie');
    expect(ihr.w('hast')).toBe('hast');
  });

  it('Angaben einer Person: auch beim Paar „du“, beim Sie unveraendert', () => {
    expect([ihr.einzeln.du, ihr.einzeln.dein('en'), ihr.einzeln.w('trägst', 'tragt')]).toEqual(['du', 'deinen', 'trägst']);
    expect(du.einzeln).toBe(du);
    expect([sie.einzeln.du, sie.einzeln.dein('en')]).toEqual(['Sie', 'Ihren']);
  });

  it('der Kernsatz beginnt mit dem Vornamen — ohne Namen und beim Sie gross', () => {
    expect(du.anrede('dir')).toBe('Max, dir');
    expect(ihr.anrede('euch')).toBe('Max und Erika, euch');
    expect(woerter({ form: 'du', mehrere: false, name: '' }).anrede('dir')).toBe('Dir');
    expect(woerter({ form: 'sie', mehrere: false, name: 'Max' }).anrede('Ihnen')).toBe('Ihnen');
  });
});

describe('vornamen', () => {
  const p = (name: string, vorname = '', nachname = '') => ({ name, vorname, nachname });

  it('der Vorname, bei einem Paar beide', () => {
    expect(vornamen([p('Max Mustermann', 'Max', 'Mustermann')])).toBe('Max');
    expect(vornamen([p('Max Mustermann', 'Max', 'Mustermann'), p('Erika Mustermann', 'Erika', 'Mustermann')])).toBe('Max und Erika');
    // Aus der Zeit vor den getrennten Feldern
    expect(vornamen([p('Anna Maria Berg')])).toBe('Anna Maria');
  });

  it('leer, wenn einer fehlt — sonst hiesse „Max, euch“ nur einen von beiden', () => {
    expect(vornamen([p('')])).toBe('');
    expect(vornamen([p('Max Mustermann', 'Max', 'Mustermann'), p('')])).toBe('');
    expect(vornamen([p('Mustermann', '', 'Mustermann')])).toBe('');
  });
});
