import { describe, expect, it } from 'vitest';
import { standardSzenario } from '../store/standard';
import { leereAntworten, szenarioAusCheck } from '../check/uebernahme';
import { datenErledigt, fallFortschritt } from './fortschritt';
import { geprueft } from './vorbelegung';

const zaehle = (s: ReturnType<typeof standardSzenario>, konto = true) =>
  fallFortschritt(s, { konto }).filter((x) => x.erledigt).length;

describe('Fortschritt eines Falls', () => {
  it('ein frischer Fall: 1 von 6 — das Konto, sonst nichts', () => {
    const schritte = fallFortschritt(standardSzenario(), { konto: true });
    expect(schritte.map((x) => x.id)).toEqual(['konto', 'mandant', 'einkuenfte', 'vertraege', 'ziel', 'auswertung']);
    expect(schritte.filter((x) => x.erledigt).map((x) => x.id)).toEqual(['konto']);
    expect(schritte.find((x) => x.id === 'einkuenfte')!.offen).toEqual(['Beispielwert: Rentenanspruch', 'Beispielwert: Einkommen']);
  });

  it('nie 0 mit Konto — und ohne Konto steht dort ehrlich „nicht angemeldet“', () => {
    expect(zaehle(standardSzenario())).toBe(1);
    const ohne = fallFortschritt(standardSzenario(), { konto: false });
    expect(ohne[0]).toMatchObject({ erledigt: false, offen: ['nicht angemeldet'] });
  });

  it('Standardwerte blockieren nichts, werden aber genannt', () => {
    const s = geprueft(standardSzenario(), ['personen.A.geburtsdatum']);
    const mandant = fallFortschritt(s, { konto: true }).find((x) => x.id === 'mandant')!;
    expect(mandant).toMatchObject({ erledigt: true, mitStandard: true });
  });

  it('zaehlt hoch, wenn Beispielwerte ersetzt und Schritte erledigt sind', () => {
    let s = geprueft(standardSzenario(), ['personen.A.geburtsdatum', 'personen.A.grvBruttoHeute', 'einkommenHeute.betrag']);
    expect(zaehle(s)).toBe(3);
    s = geprueft(s, ['vertraege', 'haushalt.zielNettoHeute']);
    expect(zaehle(s)).toBe(5);
    expect(datenErledigt(fallFortschritt(s, { konto: true }))).toBe(true);
    s = geprueft(s, ['auswertung']);
    expect(zaehle(s)).toBe(6);
  });

  it('ein vollstaendiger Fall aus dem Vorsorge-Check startet mit echtem Vorsprung', () => {
    const a = leereAntworten();
    const s = szenarioAusCheck({
      ...a,
      zielNettoHeute: 2500,
      a: { ...a.a, geburtsdatum: '12.05.1980', grvRente: 1700, einkommen: { ...a.a.einkommen, betrag: 4200 } },
    });
    // Alles erfasst — nur angesehen hat das Ergebnis noch niemand.
    expect(fallFortschritt(s, { konto: true }).filter((x) => !x.erledigt).map((x) => x.id)).toEqual(['auswertung']);
  });

  it('bei Beamten zaehlt der Rentenanspruch nicht', () => {
    const std = standardSzenario();
    const beamter = geprueft({
      ...std,
      einkommenHeute: { ...std.einkommenHeute, modus: 'besoldung' },
      personen: [{ ...std.personen[0]!, art: 'pension' }],
    }, []);
    const einkuenfte = fallFortschritt(beamter, { konto: true }).find((x) => x.id === 'einkuenfte')!;
    expect(einkuenfte.erledigt).toBe(true);
  });

  it('bei Paaren stehen die Namen dabei', () => {
    const std = standardSzenario();
    const paar = {
      ...std,
      haushalt: { ...std.haushalt, verheiratet: true },
      personen: [std.personen[0]!, { ...std.personen[0]!, id: 'B' as const }],
      offen: [...(std.offen ?? []), 'personen.B.geburtsdatum'],
    };
    const mandant = fallFortschritt(paar, { konto: true, nameVon: (id) => (id === 'A' ? 'Anna' : 'Ben') })
      .find((x) => x.id === 'mandant')!;
    expect(mandant.offen).toEqual(['Beispielwert: Geburtsdatum (Anna)', 'Beispielwert: Geburtsdatum (Ben)']);
  });
});
