import { describe, it, expect } from 'vitest';
import {
  loesungsmix, loesungsmixEigen, loesungenGesperrt, MIX_MINDESTBEITRAG,
  type MixWuensche, type Loesungsmix, type MixVorgabe,
} from '../src/analyse/loesungsmix.js';
import { loesungFuer, type LoesungId } from '../src/analyse/loesungen.js';
import { type FoerderKontext } from '../src/analyse/foerdercheck.js';
import { zusatzsteuer } from '../src/tax/haushalt.js';
import { SV_FREI_QUOTE } from '../src/analyse/vertrags-tuev.js';
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

const W: MixWuensche = { verfuegbar: 'nein', auszahlung: 'offen', foerderung: 'ja', arbeitgeber: 'nein' };
const mix = (netto: number, w: Partial<MixWuensche> = {}, k: FoerderKontext = angestellt) =>
  loesungsmix(k, steuerOpt, p, netto, { ...W, ...w });
const teil = (m: Loesungsmix, id: LoesungId) => m.teile.find((t) => t.id === id);
const ids = (m: Loesungsmix) => m.teile.map((t) => t.id);
const grund = (m: Loesungsmix, id: LoesungId) => m.ausgelassen.find((a) => a.id === id)?.grund;

describe('Lösungsmix — Zulagen mitnehmen und flexibel bleiben', () => {
  it('möglichst alles verfügbar, Förderung ja: zwei Drittel privat, ein Drittel ins Depot', () => {
    const m = mix(300, { verfuegbar: 'ja' });
    expect(ids(m)).toEqual(['avd', 'privat']);
    expect(teil(m, 'privat')!.loesung.nettoMonat).toBeCloseTo(200, 6);
    expect(teil(m, 'avd')!.loesung.nettoMonat).toBeCloseTo(100, 1);
    expect(teil(m, 'avd')!.loesung.zulageMonat).toBeGreaterThan(0);
    expect(m.nettoMonat).toBeCloseTo(300, 1);
    expect(m.verfuegbarMonat).toBeCloseTo(200, 6);
    expect(m.vertragMonat).toBeGreaterThan(m.nettoMonat);
    expect(m.dazuMonat).toBeCloseTo(m.vertragMonat - m.nettoMonat, 6);
  });

  it('einen Teil verfügbar: ein Drittel privat, in glatten Beträgen', () => {
    const m = mix(160, { verfuegbar: 'teil' });
    // 160 / 3 = 53,33 — glatt 55.
    expect(teil(m, 'privat')!.loesung.nettoMonat).toBeCloseTo(55, 6);
    expect(teil(m, 'avd')!.loesung.nettoMonat).toBeCloseTo(105, 1);
    expect(m.teile.reduce((s, t) => s + t.anteil, 0)).toBeCloseTo(1, 6);
  });

  it('nichts muss verfügbar bleiben: alles ins Depot, privat ist nicht nötig', () => {
    const m = mix(100);
    expect(ids(m)).toEqual(['avd']);
    expect(grund(m, 'privat')).toBe('nichtNoetig');
    expect(grund(m, 'bav')).toBe('nichtGewuenscht');
  });

  it('über dem geförderten Höchstbetrag fließt der Rest privat', () => {
    const m = mix(400);
    expect(ids(m)).toEqual(['avd', 'privat']);
    expect(teil(m, 'avd')!.loesung.eigenbeitragMonat).toBeCloseTo(p.avd.hoechstbetragEigenbeitrag / 12, 2);
    expect(m.verfuegbarMonat).toBe(0);
    expect(m.ueberlaufMonat).toBeGreaterThan(200);
    expect(m.nettoMonat).toBeCloseTo(400, 1);
  });

  it('ohne Förderung und ohne Arbeitgeber: alles privat', () => {
    const m = mix(250, { foerderung: 'nein' });
    expect(ids(m)).toEqual(['privat']);
    expect(m.vertragMonat).toBeCloseTo(250, 6);
    expect(m.dazuMonat).toBe(0);
    expect(grund(m, 'avd')).toBe('nichtGewuenscht');
    expect(grund(m, 'basis')).toBe('nichtGewuenscht');
  });
});

describe('Lösungsmix — mit dem Arbeitgeber', () => {
  it('Depot und Betriebsrente zu gleichen Teilen', () => {
    const m = mix(200, { arbeitgeber: 'ja' });
    expect(ids(m)).toEqual(['avd', 'bav']);
    expect(teil(m, 'bav')!.loesung.nettoMonat).toBeCloseTo(100, 1);
    expect(teil(m, 'avd')!.loesung.nettoMonat).toBeCloseTo(100, 1);
    expect(m.agZuschussMonat).toBeGreaterThan(0);
    expect(m.nettoMonat).toBeCloseTo(200, 1);
  });

  it('ist das Depot voll, bekommt die Betriebsrente den Rest', () => {
    const m = mix(270, { arbeitgeber: 'ja' });
    const avd = teil(m, 'avd')!.loesung;
    expect(avd.eigenbeitragMonat).toBeCloseTo(p.avd.hoechstbetragEigenbeitrag / 12, 2);
    expect(teil(m, 'bav')!.loesung.nettoMonat).toBeGreaterThan(135);
    expect(m.nettoMonat).toBeCloseTo(270, 0);
    expect(m.bavAnGrenze).toBe(false);
    expect(teil(m, 'privat')).toBeUndefined();
  });

  it('die Betriebsrente höchstens bis zur sozialabgabenfreien Grenze — der Zuschuss zählt mit', () => {
    const m = mix(900, { arbeitgeber: 'ja' });
    const bav = teil(m, 'bav')!.loesung;
    expect(m.bavAnGrenze).toBe(true);
    expect(bav.eigenbeitragMonat + bav.agZuschussMonat).toBeCloseTo(SV_FREI_QUOTE * p.bbgRvJahr / 12, 1);
    // Kein Satz ueber volle Sozialabgaben — die Grenze ist nicht ueberschritten.
    expect(bav.hinweise.join(' ')).not.toContain('nur noch steuerfrei');
    expect(teil(m, 'privat')!.loesung.nettoMonat).toBeGreaterThan(300);
    expect(m.nettoMonat).toBeCloseTo(900, 0);
    // Was heute schon umgewandelt wird, belegt die Grenze.
    const belegt = mix(900, { arbeitgeber: 'ja' }, { ...angestellt, bavEigenanteilJahr: SV_FREI_QUOTE * p.bbgRvJahr });
    expect(teil(belegt, 'bav')).toBeUndefined();
    expect(grund(belegt, 'bav')).toBe('ausgeschoepft');
  });

  it('mit einem Teil verfügbar: Drittel, Drittel, Drittel', () => {
    const m = mix(300, { arbeitgeber: 'ja', verfuegbar: 'teil' });
    expect(ids(m)).toEqual(['avd', 'bav', 'privat']);
    for (const t of m.teile) expect(t.loesung.nettoMonat).toBeCloseTo(100, 1);
  });

  it('für zwei geförderte Verträge zu wenig: nur das Depot', () => {
    const m = mix(40, { arbeitgeber: 'ja' });
    expect(ids(m)).toEqual(['avd']);
    expect(grund(m, 'bav')).toBe('zuKlein');
  });

  it('Beamte: keine Betriebsrente — mit dem Satz der Lösung', () => {
    const m = mix(200, { arbeitgeber: 'ja' }, { ...angestellt, beamter: true });
    expect(teil(m, 'bav')).toBeUndefined();
    expect(grund(m, 'bav')).toBe('nichtMoeglich');
    expect(m.ausgelassen.find((a) => a.id === 'bav')!.hinweis).toContain('Beamte');
  });

  it('ohne Förderung, aber mit Arbeitgeber: Betriebsrente und, was verfügbar bleiben soll', () => {
    const m = mix(210, { foerderung: 'nein', arbeitgeber: 'ja', verfuegbar: 'teil' });
    expect(ids(m)).toEqual(['bav', 'privat']);
    expect(teil(m, 'privat')!.loesung.nettoMonat).toBeCloseTo(70, 6);
    expect(teil(m, 'bav')!.loesung.nettoMonat).toBeCloseTo(140, 1);
  });

  it('rechnet nacheinander: die Steuerersparnis ist zusammen so groß wie in Wirklichkeit', () => {
    const m = mix(600, { arbeitgeber: 'ja', auszahlung: 'rente' });
    const minderung = m.teile.reduce((s, t) => s + t.loesung.zveMinderungMonat * 12, 0);
    const wirklich = zusatzsteuer(angestellt.zveHeute - minderung, minderung, steuerOpt, p);
    const avd = teil(m, 'avd')!.loesung;
    // Beim Depot zaehlt nur, was ueber die Zulage hinausgeht — der Rest der Ersparnis IST die Zulage.
    const gezeigt = m.steuerErsparnisMonat * 12 + (avd.zveMinderungMonat > 0 ? avd.zulageMonat * 12 : 0);
    expect(gezeigt).toBeCloseTo(wirklich, 0);
    // Nebeneinander gerechnet waere es mehr.
    const einzeln = m.teile.reduce((s, t) => s
      + loesungFuer(t.id, angestellt, steuerOpt, p, t.loesung.nettoMonat).steuerErsparnisMonat, 0);
    expect(einzeln).toBeGreaterThanOrEqual(m.steuerErsparnisMonat - 0.01);
  });
});

describe('Lösungsmix — Rente oder Kapital', () => {
  it('lebenslange Rente: die Basisrente bekommt, was nicht mehr ins Depot passt', () => {
    const m = mix(400, { auszahlung: 'rente' });
    expect(ids(m)).toEqual(['avd', 'basis']);
    expect(teil(m, 'basis')!.loesung.steuerErsparnisMonat).toBeGreaterThan(0);
    expect(m.nettoMonat).toBeCloseTo(400, 1);
  });

  it('Basisrente erst nach dem Depot', () => {
    const m = mix(100, { auszahlung: 'rente' });
    expect(ids(m)).toEqual(['avd']);
    expect(grund(m, 'basis')).toBe('nachrangig');
  });

  it('Basisrente nicht bei geringer Steuerersparnis', () => {
    const m = mix(400, { auszahlung: 'rente' }, { ...angestellt, zveHeute: 16_000, jahresbrutto: 22_000 });
    expect(teil(m, 'basis')).toBeUndefined();
    expect(grund(m, 'basis')).toBe('steuerGering');
    expect(teil(m, 'privat')).toBeDefined();
  });

  it('Basisrente nicht, wer offen bleiben oder an das Geld kommen will', () => {
    expect(grund(mix(400), 'basis')).toBe('nurRente');
    expect(grund(mix(400, { auszahlung: 'rente', verfuegbar: 'ja' }), 'basis')).toBe('gebunden');
  });

  it('Kapital im Alter: mindestens ein Drittel bleibt privat', () => {
    const m = mix(150, { auszahlung: 'kapital' });
    expect(m.kapitalRegel).toBe(true);
    expect(teil(m, 'privat')!.loesung.nettoMonat).toBeCloseTo(50, 6);
    expect(teil(m, 'avd')!.loesung.nettoMonat).toBeCloseTo(100, 1);
    expect(grund(m, 'basis')).toBe('nurRente');
    // Wer ohnehin zwei Drittel verfuegbar haelt, braucht die Regel nicht.
    expect(mix(300, { auszahlung: 'kapital', verfuegbar: 'ja' }).kapitalRegel).toBe(false);
  });

  it('Selbstständige mit hohem Steuersatz und vollem Depot: Basisrente allein', () => {
    const k = { ...angestellt, selbststaendig: true, avdEigenbeitragJahr: p.avd.hoechstbetragEigenbeitrag };
    const m = mix(300, { auszahlung: 'rente' }, k);
    expect(ids(m)).toEqual(['basis']);
    expect(grund(m, 'avd')).toBe('ausgeschoepft');
    expect(grund(m, 'bav')).toBe('nichtMoeglich');
  });
});

describe('Lösungsmix — kleine Beiträge', () => {
  it('kein Vertrag unter dem Mindestbeitrag: der kleinere Teil wird angehoben', () => {
    // Ein Drittel von 60 sind 20 — zu wenig fuer einen Vertrag.
    const m = mix(60, { verfuegbar: 'teil' });
    expect(teil(m, 'privat')!.loesung.nettoMonat).toBeCloseTo(MIX_MINDESTBEITRAG, 6);
    expect(teil(m, 'avd')!.loesung.nettoMonat).toBeCloseTo(35, 1);
    expect(m.einVertrag).toBe(false);
  });

  it('für zwei Verträge zu wenig: einer — der, der dem Wunsch näher ist', () => {
    const teilweise = mix(40, { verfuegbar: 'teil' });
    expect(ids(teilweise)).toEqual(['avd']);
    expect(teilweise.einVertrag).toBe(true);
    const alles = mix(40, { verfuegbar: 'ja' });
    expect(ids(alles)).toEqual(['privat']);
    expect(alles.einVertrag).toBe(true);
  });

  it('ein Rest unter dem Mindestbeitrag bleibt unverplant', () => {
    const voll = mix(1_000);
    const depotNetto = teil(voll, 'avd')!.loesung.nettoMonat;
    const m = mix(Math.round(depotNetto) + 10);
    expect(ids(m)).toEqual(['avd']);
    expect(m.uebrigMonat).toBeGreaterThan(0);
    expect(m.uebrigMonat).toBeLessThan(MIX_MINDESTBEITRAG);
    expect(grund(m, 'privat')).toBe('zuKlein');
  });

  it('0 €: nichts', () => {
    const m = mix(0, { arbeitgeber: 'ja' });
    expect(m.teile).toEqual([]);
    expect(m.nettoMonat).toBe(0);
    expect(m.einVertrag).toBe(false);
  });

  it('jede Lösung steht höchstens einmal unter den ausgelassenen — und nie zugleich im Vorschlag', () => {
    for (const verfuegbar of ['nein', 'teil', 'ja'] as const) {
      for (const auszahlung of ['rente', 'offen', 'kapital'] as const) {
        for (const foerderung of ['ja', 'nein'] as const) {
          for (const arbeitgeber of ['ja', 'nein'] as const) {
            for (const netto of [0, 30, 60, 150, 400, 1_200]) {
              const m = mix(netto, { verfuegbar, auszahlung, foerderung, arbeitgeber });
              const aus = m.ausgelassen.map((a) => a.id);
              expect(new Set(aus).size).toBe(aus.length);
              for (const t of m.teile) expect(aus).not.toContain(t.id);
              // Nichts geht verloren: Bausteine plus Unverplantes ergeben den Wunsch (Rahmen ausgenommen).
              expect(m.nettoMonat + m.uebrigMonat).toBeLessThanOrEqual(netto + 0.01);
              if (m.teile.some((t) => t.id === 'privat')) expect(m.nettoMonat).toBeCloseTo(netto, 0);
              for (const t of m.teile) expect(t.loesung.nettoMonat).toBeGreaterThan(0.5);
            }
          }
        }
      }
    }
  });
});

describe('Lösungsmix von Hand — der Berater trägt die Verteilung selbst ein', () => {
  const eigen = (vorgaben: MixVorgabe[], k: FoerderKontext = angestellt) => loesungsmixEigen(k, steuerOpt, p, vorgaben);
  const netto = (id: LoesungId, betragMonat: number): MixVorgabe => ({ id, betragMonat, vorgabe: 'netto' });
  const brutto = (id: LoesungId, betragMonat: number): MixVorgabe => ({ id, betragMonat, vorgabe: 'brutto' });

  it('was eingetragen ist, steht im Vorschlag — auch gegen jede Regel', () => {
    // 10 € privat liegen unter dem Mindestbeitrag, die Basisrente steht ohne Depot davor: Von Hand geht beides.
    const m = eigen([netto('privat', 10), netto('basis', 80), netto('bav', 60)]);
    expect(ids(m)).toEqual(['bav', 'basis', 'privat']);
    expect(teil(m, 'privat')!.loesung.nettoMonat).toBeCloseTo(10, 6);
    expect(teil(m, 'basis')!.loesung.nettoMonat).toBeCloseTo(80, 1);
    expect(teil(m, 'bav')!.loesung.nettoMonat).toBeCloseTo(60, 1);
    expect(m.nettoMonat).toBeCloseTo(150, 1);
    expect(m.teile.reduce((s, x) => s + x.anteil, 0)).toBeCloseTo(1, 6);
    expect(m.uebrigMonat).toBe(0);
    expect(m.einVertrag).toBe(false);
    expect(m.kapitalRegel).toBe(false);
  });

  it('der Betrag als Beitrag: 100 € Umwandlung und 150 € Eigenbeitrag stehen genau so im Vertrag', () => {
    const m = eigen([brutto('bav', 100), brutto('avd', 150)]);
    const bav = teil(m, 'bav')!.loesung;
    const avd = teil(m, 'avd')!.loesung;
    expect(bav.eigenbeitragMonat).toBeCloseTo(100, 6);
    expect(bav.agZuschussMonat).toBeCloseTo(15, 6);
    expect(bav.nettoMonat).toBeLessThan(100);
    expect(avd.eigenbeitragMonat).toBeCloseTo(150, 6);
    expect(avd.zulageMonat).toBeGreaterThan(0);
    expect(avd.begrenzt).toBe(false);
    expect(m.vertragMonat).toBeCloseTo(bav.vertragMonat + avd.vertragMonat, 6);
  });

  it('nacheinander gerechnet: Das Depot spart seine Steuer auf dem Einkommen nach der Betriebsrente', () => {
    const m = eigen([brutto('bav', 300), brutto('basis', 400)]);
    const bav = teil(m, 'bav')!.loesung;
    const allein = loesungFuer('basis', angestellt, steuerOpt, p, 400, { vorgabe: 'brutto' });
    const danach = loesungFuer('basis', { ...angestellt, zveHeute: angestellt.zveHeute - bav.zveMinderungMonat * 12 },
      steuerOpt, p, 400, { vorgabe: 'brutto' });
    expect(teil(m, 'basis')!.loesung.steuerErsparnisMonat).toBeCloseTo(danach.steuerErsparnisMonat, 6);
    expect(teil(m, 'basis')!.loesung.steuerErsparnisMonat).toBeLessThanOrEqual(allein.steuerErsparnisMonat + 1e-9);
  });

  it('über dem Förderrahmen wird mit dem Rahmen gerechnet — und die Lösung sagt es', () => {
    const m = eigen([brutto('avd', 500)]);
    const avd = teil(m, 'avd')!.loesung;
    expect(avd.begrenzt).toBe(true);
    expect(avd.eigenbeitragMonat).toBeCloseTo(p.avd.hoechstbetragEigenbeitrag / 12, 6);
    expect(avd.hinweise.join(' ')).toMatch(/Gefördert sind Eigenbeiträge bis/);
  });

  it('derselbe Vorschlag wie nach den Regeln, wenn man dessen Beträge einträgt', () => {
    const regel = mix(300, { verfuegbar: 'teil', arbeitgeber: 'ja' });
    const m = eigen(regel.teile.map((x) => netto(x.id, x.loesung.nettoMonat)));
    expect(ids(m)).toEqual(ids(regel));
    expect(m.nettoMonat).toBeCloseTo(regel.nettoMonat, 1);
    expect(m.vertragMonat).toBeCloseTo(regel.vertragMonat, 0);
    expect(m.zulageMonat).toBeCloseTo(regel.zulageMonat, 1);
    expect(m.agZuschussMonat).toBeCloseTo(regel.agZuschussMonat, 1);
  });

  it('ohne Betrag kein Baustein; je Lösung zählt die erste Zeile mit Betrag', () => {
    expect(eigen([]).teile).toEqual([]);
    expect(eigen([netto('privat', 0), brutto('avd', 0)]).teile).toEqual([]);
    const m = eigen([netto('privat', 0), netto('privat', 70), netto('privat', 999)]);
    expect(ids(m)).toEqual(['privat']);
    expect(m.nettoMonat).toBeCloseTo(70, 6);
  });

  it('Beamte: Die Betriebsrente ist gesperrt und fällt aus dem Vorschlag', () => {
    const beamter: FoerderKontext = { ...angestellt, beamter: true };
    const m = eigen([brutto('bav', 100), netto('privat', 50)], beamter);
    expect(ids(m)).toEqual(['privat']);
    expect(m.ausgelassen).toEqual([{ id: 'bav', grund: 'nichtMoeglich', hinweis: 'Beamte wandeln kein Entgelt um.' }]);
    expect(loesungenGesperrt(angestellt, steuerOpt, p)).toEqual([]);
  });

  it('ein ausgeschöpfter Rahmen sperrt die Lösung', () => {
    const voll: FoerderKontext = { ...angestellt, avdEigenbeitragJahr: p.avd.hoechstbetragEigenbeitrag };
    expect(loesungenGesperrt(voll, steuerOpt, p)).toEqual([{ id: 'avd', grund: 'ausgeschoepft' }]);
    expect(ids(eigen([brutto('avd', 100)], voll))).toEqual([]);
  });

  it('der Arbeitgeberzuschuss aus den Optionen gilt auch von Hand', () => {
    const m = loesungsmixEigen(angestellt, steuerOpt, p, [brutto('bav', 200)], { agZuschussQuote: 0.5 });
    expect(teil(m, 'bav')!.loesung.agZuschussMonat).toBeCloseTo(100, 6);
  });
});
