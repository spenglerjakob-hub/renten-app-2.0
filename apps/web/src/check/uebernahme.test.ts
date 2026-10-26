import { describe, expect, it } from 'vitest';
import { leereAntworten, szenarioAusCheck } from './uebernahme';

describe('szenarioAusCheck — Namen', () => {
  it('reicht Vor- und Nachname und den ganzen Namen weiter', () => {
    const x = leereAntworten();
    x.a = { ...x.a, vorname: 'Anna Maria', nachname: 'von Berg', name: 'Anna Maria von Berg', geburtsdatum: '15.03.1985' };
    const p = szenarioAusCheck(x).personen[0]!;
    expect([p.vorname, p.nachname, p.name]).toEqual(['Anna Maria', 'von Berg', 'Anna Maria von Berg']);
  });

  it('teilt den Namen aus Antworten von vor der Trennung', () => {
    const x = leereAntworten();
    const { vorname: _v, nachname: _n, ...alt } = x.a;
    x.a = { ...alt, name: 'Anna Beispiel', geburtsdatum: '15.03.1985' };
    const p = szenarioAusCheck(x).personen[0]!;
    expect([p.vorname, p.nachname, p.name]).toEqual(['Anna', 'Beispiel', 'Anna Beispiel']);
  });
});
