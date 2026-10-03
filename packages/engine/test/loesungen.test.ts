import { describe, it, expect } from 'vitest';
import { loesungsvergleich, type LoesungId } from '../src/analyse/loesungen.js';
import { type FoerderKontext } from '../src/analyse/foerdercheck.js';
import { STEUER_FREI_QUOTE } from '../src/analyse/vertrags-tuev.js';
import { parameterFuer } from '../src/params/registry.js';

const p = parameterFuer(2027, { indexRate: 0 });
const steuerOpt = { verheiratet: false, bundesland: 'Baden-Württemberg', kirchensteuerpflichtig: false };

const angestellt: FoerderKontext = {
  beamter: false, selbststaendig: false, privatVersichert: false, pkvPraemieMonat: 0,
  jahresbrutto: 60_000, zveHeute: 47_000, grvBeitragJahr: 0,
  bavEigenanteilJahr: 0, bavArbeitgeberJahr: 0, basisBeitragJahr: 0,
  grvDeckung: 0.6, lueckeMonat: 500, avdEigenbeitragJahr: 0,
  kinder: [], alter: 40, jahr: 2027,
};

const rechne = (k: FoerderKontext, netto = 100, quote?: number) => {
  const l = loesungsvergleich(k, steuerOpt, p, netto, quote === undefined ? {} : { agZuschussQuote: quote });
  return (id: LoesungId) => l.find((x) => x.id === id)!;
};

describe('Lösungsvergleich — was wird aus 100 € netto', () => {
  it('trifft bei jeder Lösung den Netto-Aufwand', () => {
    const r = rechne(angestellt);
    for (const id of ['avd', 'bav', 'basis', 'privat'] as const) {
      expect(r(id).nettoMonat).toBeCloseTo(100, 1);
      expect(r(id).begrenzt).toBe(false);
    }
  });

  it('privat: 100 bleiben 100', () => {
    const l = rechne(angestellt)('privat');
    expect(l.vertragMonat).toBeCloseTo(100, 6);
    expect(l.hebel).toBe(1);
  });

  it('bAV: Netto = Umwandlung − Steuer − SV, dazu mindestens 15 % vom Arbeitgeber', () => {
    const l = rechne(angestellt)('bav');
    expect(l.eigenbeitragMonat - l.steuerErsparnisMonat - l.svErsparnisMonat).toBeCloseTo(l.nettoMonat, 6);
    expect(l.svErsparnisMonat).toBeGreaterThan(0);
    expect(l.agZuschussMonat).toBeCloseTo(0.15 * l.eigenbeitragMonat, 6);
    expect(l.vertragMonat).toBeCloseTo(l.eigenbeitragMonat + l.agZuschussMonat, 6);
    // Bei 60.000 EUR Brutto bringt die Umwandlung deutlich mehr als 100 in den Vertrag.
    expect(l.hebel).toBeGreaterThan(1.8);
  });

  it('bAV mit Zuschussmodell 50 %: der Zuschuss richtet sich nach der Zusage', () => {
    const l = rechne(angestellt, 100, 0.5)('bav');
    expect(l.agZuschussMonat).toBeCloseTo(0.5 * l.eigenbeitragMonat, 6);
    expect(l.hebel).toBeGreaterThan(rechne(angestellt)('bav').hebel);
  });

  it('bAV: nicht für Beamte und Selbstständige', () => {
    expect(rechne({ ...angestellt, beamter: true })('bav').verfuegbar).toBe(false);
    expect(rechne({ ...angestellt, selbststaendig: true })('bav').verfuegbar).toBe(false);
  });

  it('bAV: begrenzt durch den steuerfreien Rahmen', () => {
    const l = rechne(angestellt, 2_000)('bav');
    expect(l.begrenzt).toBe(true);
    expect(l.nettoMonat).toBeLessThan(2_000);
    expect(l.eigenbeitragMonat * 1.15).toBeLessThanOrEqual(STEUER_FREI_QUOTE * p.bbgRvJahr / 12 * 1.15 + 1e-6);
  });

  it('Basisrente: Netto = Beitrag − Steuerersparnis', () => {
    const l = rechne(angestellt)('basis');
    expect(l.eigenbeitragMonat - l.steuerErsparnisMonat).toBeCloseTo(l.nettoMonat, 6);
    expect(l.hebel).toBeGreaterThan(1.3);
    // Wer keine Steuer zahlt, hat vom Abzug nichts.
    const ohne = rechne({ ...angestellt, zveHeute: 0 })('basis');
    expect(ohne.hebel).toBeCloseTo(1, 6);
  });

  it('Altersvorsorgedepot: Eigenbeitrag + Zulage, Steuervorteil nur über der Zulage', () => {
    const l = rechne(angestellt)('avd');
    expect(l.zulageMonat).toBeGreaterThan(0);
    expect(l.vertragMonat).toBeCloseTo(l.eigenbeitragMonat + l.zulageMonat, 6);
    expect(l.eigenbeitragMonat - l.steuerErsparnisMonat).toBeCloseTo(l.nettoMonat, 6);
    // Mit zwei Kindern kommt mehr dazu.
    const kinder = rechne({ ...angestellt, kinder: [{ geburtsjahr: 2020 }, { geburtsjahr: 2022 }] })('avd');
    expect(kinder.zulageMonat).toBeGreaterThan(l.zulageMonat);
  });

  it('Altersvorsorgedepot: über dem Höchstbetrag begrenzt', () => {
    const l = rechne(angestellt, 1_000)('avd');
    expect(l.begrenzt).toBe(true);
    expect(l.eigenbeitragMonat).toBeCloseTo(p.avd.hoechstbetragEigenbeitrag / 12, 2);
  });

  it('rechnet marginal: ein bestehendes Depot senkt die Zulage auf den Mehrbeitrag', () => {
    const neu = rechne(angestellt)('avd');
    const mitBestand = rechne({ ...angestellt, avdEigenbeitragJahr: 360 })('avd');
    // Die ersten 360 EUR (50 % Zulage) sind belegt — der Mehrbeitrag bekommt nur noch 25 %.
    expect(mitBestand.zulageMonat).toBeLessThan(neu.zulageMonat);
  });

  it('0 € netto: nichts', () => {
    const r = rechne(angestellt, 0);
    expect(r('bav').vertragMonat).toBe(0);
    expect(r('avd').vertragMonat).toBe(0);
  });
});
