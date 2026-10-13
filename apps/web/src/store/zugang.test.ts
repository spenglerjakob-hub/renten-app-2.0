import { describe, expect, it } from 'vitest';
import {
  aboSichtbar, aboZusatz, deckt, fruehstartVorbei, rueckmeldungFaellig, tageBis, zugangAus, type Zugang,
} from './zugang';

const TAG = 86_400_000;
const jetzt = Date.parse('2026-10-12T12:00:00Z');
const in_ = (tage: number) => new Date(jetzt + tage * TAG).toISOString();

/** Eine Antwort von `mein_zugang()`, wie sie aus der Datenbank kommt. */
const roh = (x: Record<string, unknown> = {}) => ({
  paket: 'alles', quelle: 'vorab', bis: null, test_bis: null, abo_pflicht_ab: null, zahlung_bereit: false,
  freizugang: null, betreiber: false, fruehstart: false, fruehstart_seit: null, fruehstart_bis: null,
  letzte_rueckmeldung: null, buero: null, buero_name: null, rolle: null, hat_platz: false, abo: null,
  ...x,
});
const z = (x: Record<string, unknown> = {}) => zugangAus(roh(x)) as Zugang;

describe('zugangAus', () => {
  it('liest die Antwort samt Abo', () => {
    const a = zugangAus(roh({
      paket: 'rente', quelle: 'abo', rolle: 'inhaber', hat_platz: true, buero: 'b1', buero_name: 'Muster',
      zahlung_bereit: true,
      abo: { paket: 'rente', intervall: 'jahr', plaetze: 3, belegt: 2, status: 'active', laeuft_bis: in_(30), kuendigung_zum: null },
    }));
    expect(a).toMatchObject({
      paket: 'rente', quelle: 'abo', rolle: 'inhaber', hatPlatz: true, bueroName: 'Muster', zahlungBereit: true,
      abo: { paket: 'rente', intervall: 'jahr', plaetze: 3, belegt: 2, status: 'active', kuendigungZum: null },
    });
  });

  it('weist Unbrauchbares ab', () => {
    expect(zugangAus(null)).toBeNull();
    expect(zugangAus([])).toBeNull(); // so antwortet ein falsch nachgebildeter Server
    expect(zugangAus('alles')).toBeNull();
  });

  it('liest den Early-Adopter-Stand', () => {
    const a = z({
      quelle: 'fruehstart', bis: in_(60), fruehstart: true, fruehstart_seit: in_(-30), fruehstart_bis: in_(60),
      letzte_rueckmeldung: in_(-2),
    });
    expect(a).toMatchObject({
      quelle: 'fruehstart', fruehstart: true, fruehstartSeit: in_(-30), fruehstartBis: in_(60), letzteRueckmeldung: in_(-2),
    });
    // Eine aeltere Antwort ohne die Felder: kein Early Adopter.
    const alt = zugangAus({ paket: 'alles', quelle: 'vorab' }) as Zugang;
    expect(alt).toMatchObject({ fruehstart: false, fruehstartSeit: null, fruehstartBis: null, letzteRueckmeldung: null });
  });

  it('schaltet mit unbekannten Werten nichts frei', () => {
    const a = z({ paket: 'premium', quelle: 'geschenkt', betreiber: 'ja', rolle: 'chef' });
    expect(a.paket).toBeNull();
    expect(a.quelle).toBeNull();
    expect(a.betreiber).toBe(false);
    expect(a.rolle).toBeNull();
  });
});

describe('deckt', () => {
  it('All inklusive deckt beide Bereiche, die anderen Pakete nur ihren', () => {
    expect(deckt(z({ paket: 'alles' }), 'rente', jetzt)).toBe(true);
    expect(deckt(z({ paket: 'alles' }), 'ag', jetzt)).toBe(true);
    expect(deckt(z({ paket: 'rente', quelle: 'abo' }), 'ag', jetzt)).toBe(false);
    expect(deckt(z({ paket: 'ag', quelle: 'abo' }), 'rente', jetzt)).toBe(false);
    expect(deckt(z({ paket: null, quelle: null }), 'rente', jetzt)).toBe(false);
  });

  it('eine Testphase endet zu ihrem Zeitpunkt — auch im Zwischenspeicher', () => {
    expect(deckt(z({ quelle: 'test', bis: in_(1) }), 'rente', jetzt)).toBe(true);
    expect(deckt(z({ quelle: 'test', bis: in_(-0.01) }), 'rente', jetzt)).toBe(false);
  });

  it('die Early-Adopter-Zeit ebenso', () => {
    expect(deckt(z({ quelle: 'fruehstart', bis: in_(1) }), 'ag', jetzt)).toBe(true);
    expect(deckt(z({ quelle: 'fruehstart', bis: in_(-0.01) }), 'ag', jetzt)).toBe(false);
  });
});

describe('Early Adopter', () => {
  const fs = (x: Record<string, unknown> = {}) =>
    z({ quelle: 'fruehstart', bis: in_(60), fruehstart: true, fruehstart_seit: in_(-10), fruehstart_bis: in_(60), ...x });

  it('bittet erst vier Wochen nach dem Einloesen um Feedback', () => {
    expect(rueckmeldungFaellig(fs(), jetzt)).toBe(false);
    expect(rueckmeldungFaellig(fs({ fruehstart_seit: in_(-27) }), jetzt)).toBe(false);
    expect(rueckmeldungFaellig(fs({ fruehstart_seit: in_(-29) }), jetzt)).toBe(true);
  });

  it('danach vier Wochen nach der letzten Rueckmeldung', () => {
    expect(rueckmeldungFaellig(fs({ fruehstart_seit: in_(-60), letzte_rueckmeldung: in_(-5) }), jetzt)).toBe(false);
    expect(rueckmeldungFaellig(fs({ fruehstart_seit: in_(-60), letzte_rueckmeldung: in_(-29) }), jetzt)).toBe(true);
  });

  it('vor dem Start ja, nach der kostenlosen Zeit und fuer andere Konten nicht', () => {
    expect(rueckmeldungFaellig(fs({ quelle: 'vorab', bis: null, fruehstart_bis: null, fruehstart_seit: in_(-40) }), jetzt)).toBe(true);
    expect(rueckmeldungFaellig(fs({ paket: null, quelle: null, fruehstart_seit: in_(-200), fruehstart_bis: in_(-3) }), jetzt)).toBe(false);
    expect(rueckmeldungFaellig(z({ quelle: 'test', bis: in_(5) }), jetzt)).toBe(false);
    // Ohne Beginn (aeltere Antwort): lieber nicht draengeln.
    expect(rueckmeldungFaellig(fs({ fruehstart_seit: null }), jetzt)).toBe(false);
  });

  it('erkennt das Ende der kostenlosen Zeit', () => {
    expect(fruehstartVorbei(fs(), jetzt)).toBe(false);
    expect(fruehstartVorbei(fs({ paket: null, quelle: null, fruehstart_bis: in_(-3) }), jetzt)).toBe(true);
    expect(fruehstartVorbei(fs({ quelle: 'vorab', fruehstart_bis: null }), jetzt)).toBe(false);
    expect(fruehstartVorbei(z({ paket: null, quelle: null, test_bis: in_(-3) }), jetzt)).toBe(false);
  });

  it('sieht "Abo & Team" schon vor dem Start und liest dort seinen Stand', () => {
    expect(aboSichtbar(fs({ quelle: 'vorab', bis: null, fruehstart_bis: null }))).toBe(true);
    expect(aboZusatz(fs({ quelle: 'vorab', bis: null, fruehstart_bis: null }))).toBe('Early Adopter');
    // aboZusatz rechnet mit der echten Uhr.
    const bis = new Date(Date.now() + 9 * TAG - 60_000).toISOString();
    expect(aboZusatz(fs({ bis, fruehstart_bis: bis }))).toBe('Early Adopter: noch 9 Tage');
  });
});

describe('Anzeige', () => {
  it('rundet die Resttage auf', () => {
    expect(tageBis(in_(9), jetzt)).toBe(9);
    expect(tageBis(in_(0.2), jetzt)).toBe(1);
    expect(tageBis(in_(-1), jetzt)).toBe(0);
  });

  it('"Abo & Team" sieht vor dem Start nur, wen es betrifft', () => {
    expect(aboSichtbar(z())).toBe(false);
    expect(aboSichtbar(z({ betreiber: true, freizugang: 'betreiber' }))).toBe(true);
    expect(aboSichtbar(z({ abo_pflicht_ab: in_(7) }))).toBe(true);
    expect(aboSichtbar(z({ buero: 'b1', rolle: 'mitglied' }))).toBe(true);
    expect(aboSichtbar(null)).toBe(false);
  });

  it('nennt im Eintrag den Stand', () => {
    expect(aboZusatz(z({ freizugang: 'bestand' }))).toBe('Kostenlos (Bestandsschutz)');
    expect(aboZusatz(z({ betreiber: true, freizugang: 'betreiber' }))).toBe('Betreiberkonto');
    expect(aboZusatz(z({
      quelle: 'abo', rolle: 'inhaber', buero: 'b1',
      abo: { paket: 'alles', intervall: 'monat', plaetze: 3, belegt: 2, status: 'active', laeuft_bis: null, kuendigung_zum: null },
    }))).toBe('All inklusive · 3 Plätze');
    expect(aboZusatz(z({ paket: null, quelle: null }))).toBe('Paket wählen, Kollegen einladen');
  });
});
