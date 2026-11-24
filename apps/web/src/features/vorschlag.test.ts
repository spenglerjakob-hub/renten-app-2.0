import { describe, it, expect } from 'vitest';
import { szenarioSchema, type SzenarioParsed } from '@renten/schema';
import { musterSzenario } from '../test/musterfall';
import { angeboteAusMix, vorschlagStand } from './vorschlag-berechnung';
import { angeboteMitVorschlag } from './angebote-liste';
import {
  MIX_NAME, WUNSCH_FRAGEN, mixAusgelassenText, mixDazu, mixGrund, mixKurz, wunschAntwort,
} from './vorschlag-texte';
import { woerter } from '../lib/ansprache';

const DU = woerter({ form: 'du', mehrere: false, name: '' });
/** Betraege stehen mit geschuetztem Leerzeichen vor dem Euro-Zeichen — fuer den Vergleich ein gewoehnliches. */
const glatt = (s: string) => s.replace(/\u00a0/g, ' ');

type Wuensche = SzenarioParsed['loesungen']['wuensche'];

/** Der Musterfall (Jahrgang 1985, 4.000 € brutto) mit Beitrag und Antworten. */
const fall = (wuensche: Wuensche, nettoMonat = 200, mehr: (s: SzenarioParsed) => unknown = (s) => s) => {
  const s = musterSzenario();
  return szenarioSchema.parse(mehr({ ...s, loesungen: { ...s.loesungen, nettoMonat, wuensche } }));
};
const ALLE: Wuensche = { verfuegbar: 'ja', auszahlung: 'offen', foerderung: 'ja', arbeitgeber: 'nein' };

describe('vorschlagStand', () => {
  it('ohne Antworten gibt es keinen Vorschlag — nichts ist vorbelegt', () => {
    const stand = vorschlagStand(fall({}), null);
    expect(stand).toMatchObject({ mitArbeitgeber: true, offen: 4, mix: null, wuensche: null });
    expect(vorschlagStand(fall({ verfuegbar: 'ja', foerderung: 'ja' }), null).offen).toBe(2);
  });

  it('möglichst flexibel und Zulagen mitnehmen: Altersvorsorgedepot und private Rente', () => {
    const { mix, offen } = vorschlagStand(fall(ALLE), null);
    expect(offen).toBe(0);
    expect(mix!.teile.map((x) => x.id)).toEqual(['avd', 'privat']);
    // Zwei Drittel bleiben verfuegbar: 200 € · 2/3 = 133,33 → glatt 135.
    expect(mix!.teile[1]!.loesung.nettoMonat).toBeCloseTo(135, 6);
    expect(mix!.nettoMonat).toBeCloseTo(200, 1);
    expect(mix!.zulageMonat).toBeGreaterThan(0);
    expect(glatt(mixKurz(mix!))).toBe('65 € Altersvorsorgedepot · 135 € Private Rente');
  });

  it('Beamte werden nicht nach dem Arbeitgeber gefragt — drei Antworten genügen', () => {
    const beamter = (s: SzenarioParsed) => ({ ...s, einkommenHeute: { ...s.einkommenHeute, modus: 'besoldung' } });
    const stand = vorschlagStand(fall({ verfuegbar: 'nein', auszahlung: 'offen', foerderung: 'ja' }, 200, beamter), null);
    expect(stand.mitArbeitgeber).toBe(false);
    expect(stand.offen).toBe(0);
    expect(stand.mix!.teile.some((x) => x.id === 'bav')).toBe(false);
    // Eine frueher gegebene Antwort zaehlt ohne die Frage nicht.
    const mitAntwort = vorschlagStand(fall({ ...ALLE, arbeitgeber: 'ja' }, 200, beamter), null);
    expect(mitAntwort.wuensche!.arbeitgeber).toBe('nein');
  });

  it('der Arbeitgeberzuschuss aus dem Plan wirkt im Vorschlag', () => {
    const mit = (quote: number) => vorschlagStand(fall({ ...ALLE, verfuegbar: 'nein', arbeitgeber: 'ja' }, 200,
      (s) => ({ ...s, loesungen: { ...s.loesungen, agZuschussQuote: quote } })), null).mix!;
    const pflicht = mit(0.15).teile.find((x) => x.id === 'bav')!.loesung;
    const modell = mit(0.5).teile.find((x) => x.id === 'bav')!.loesung;
    expect(modell.agZuschussMonat).toBeGreaterThan(pflicht.agZuschussMonat * 2);
  });

  it('die frühere Brutto-Vorgabe ändert den Vorschlag nicht — er rechnet vom Netto-Aufwand', () => {
    const netto = vorschlagStand(fall(ALLE), null).mix!;
    const brutto = vorschlagStand(fall(ALLE, 200, (s) => ({ ...s, loesungen: { ...s.loesungen, vorgabe: 'brutto', bruttoMonat: 999 } })), null).mix!;
    expect(brutto.nettoMonat).toBeCloseTo(netto.nettoMonat, 6);
    expect(brutto.vertragMonat).toBeCloseTo(netto.vertragMonat, 6);
  });
});

describe('der Vorschlag als Angebote', () => {
  const { mix } = vorschlagStand(fall({ ...ALLE, verfuegbar: 'teil', arbeitgeber: 'ja' }, 300), null);

  it('je Baustein ein Angebot mit seinem Beitrag — bei der Betriebsrente die Umwandlung und der Zuschuss', () => {
    const angebote = angeboteAusMix(mix!);
    expect(angebote.map((a) => a.loesung)).toEqual(['avd', 'bav', 'privat']);
    const bav = mix!.teile.find((x) => x.id === 'bav')!.loesung;
    expect(angebote[1]).toMatchObject({
      beitragMonat: Math.round(bav.eigenbeitragMonat), renteMonat: 0, kapital: 0, name: '', inhaber: 'A',
    });
    expect(angebote[1]!.agZuschussMonat).toBeCloseTo(bav.agZuschussMonat, 2);
    expect(angebote[2]).toMatchObject({ loesung: 'privat', beitragMonat: 100, agZuschussMonat: 0 });
  });

  it('unberührte Angebote weichen dem neuen Vorschlag, bearbeitete und angenommene bleiben', () => {
    const a = (id: string, mehr: object = {}) => ({
      id, loesung: 'privat' as const, name: '', inhaber: 'A' as const, beitragMonat: 100, agZuschussMonat: 0,
      dynamik: 0, renteMonat: 0, kapital: 0, ...mehr,
    });
    const alt = [a('leer'), a('benannt', { name: 'Musterleben' }), a('rente', { renteMonat: 300 }), a('angenommen')];
    const neu = [a('n1'), a('n2')];
    expect(angeboteMitVorschlag(alt, ['angenommen'], neu).map((x) => x.id))
      .toEqual(['benannt', 'rente', 'angenommen', 'n1', 'n2']);
    // Hoechstens zwoelf Angebote, wie ueberall.
    const viele = Array.from({ length: 11 }, (_, i) => a(`v${i}`, { name: 'x' }));
    expect(angeboteMitVorschlag(viele, [], neu)).toHaveLength(12);
  });
});

describe('die Worte zum Vorschlag', () => {
  it('jeder Baustein sagt, auf welchen Wunsch er antwortet — mit den Beträgen des Kunden', () => {
    const { mix, wuensche } = vorschlagStand(fall({ ...ALLE, verfuegbar: 'teil', arbeitgeber: 'ja' }, 300), null);
    const grund = (id: string) => glatt(mixGrund(mix!.teile.find((x) => x.id === id)!, mix!, wuensche!, DU));
    expect(grund('avd')).toMatch(/^Zulagen mitnehmen: Der Staat legt \d+ € im Monat dazu/);
    expect(grund('bav')).toMatch(/^Der Arbeitgeber zahlt mit: \d+ € Zuschuss im Monat/);
    expect(grund('privat')).toBe('Bleibt verfügbar: An dieses Geld kommst du auch vor der Rente.');
  });

  it('ohne Förderung sagt die private Rente, was man dafür bekommt', () => {
    const { mix, wuensche } = vorschlagStand(fall({ ...ALLE, foerderung: 'nein' }), null);
    expect(mix!.teile.map((x) => x.id)).toEqual(['privat']);
    expect(mixGrund(mix!.teile[0]!, mix!, wuensche!, DU)).toContain('ohne Bindung');
    expect(mixDazu(mix!)).toEqual([]);
  });

  it('volle Fördertöpfe: der Rest fließt privat — und das steht da', () => {
    const { mix, wuensche } = vorschlagStand(fall({ ...ALLE, verfuegbar: 'nein' }, 400), null);
    const privat = mix!.teile.find((x) => x.id === 'privat')!;
    expect(mixGrund(privat, mix!, wuensche!, DU)).toContain('Die geförderten Verträge sind voll');
    expect(mixGrund(mix!.teile[0]!, mix!, wuensche!, DU)).toContain('Höchstbetrag ist damit ausgeschöpft');
  });

  it('zu jeder ausgelassenen Lösung ein Satz, der zum Wunsch passt', () => {
    const { mix, wuensche } = vorschlagStand(fall({ ...ALLE, auszahlung: 'kapital' }), null);
    const text = (id: string) => mixAusgelassenText(mix!.ausgelassen.find((a) => a.id === id)!, wuensche!);
    expect(text('basis')).toBe('Sie zahlt nur eine lebenslange Rente — gewünscht ist Kapital.');
    expect(text('bav')).toBe('Der Arbeitgeber soll nicht eingebunden werden.');
    for (const a of mix!.ausgelassen) expect(mixAusgelassenText(a, wuensche!).length).toBeGreaterThan(10);
  });

  it('was dazukommt, in Posten — nur, was es gibt', () => {
    const { mix } = vorschlagStand(fall({ ...ALLE, verfuegbar: 'nein', arbeitgeber: 'ja' }, 300), null);
    const posten = mixDazu(mix!);
    expect(posten.map((x) => x.text)).toEqual(
      ['Zulagen vom Staat', 'Zuschuss vom Arbeitgeber', 'Steuerersparnis', 'Sozialabgaben gespart'],
    );
    // Aufwand plus alles, was dazukommt, ist, was in den Vertraegen landet.
    expect(mix!.nettoMonat + posten.reduce((s, x) => s + x.wert, 0)).toBeCloseTo(mix!.vertragMonat, 1);
  });

  it('jede Antwort hat ihre Worte — für das Gutachten', () => {
    expect(wunschAntwort('verfuegbar', 'ja')).toBe('Möglichst alles');
    expect(wunschAntwort('auszahlung', 'rente')).toBe('Lebenslange Rente');
    for (const f of Object.values(WUNSCH_FRAGEN)) {
      expect(f.frage(DU)).toMatch(/\?$/);
      for (const a of f.antworten) expect(a.unter).toMatch(/\.$/);
    }
    expect(Object.keys(MIX_NAME)).toEqual(['avd', 'bav', 'basis', 'privat']);
  });
});
