import { describe, it, expect } from 'vitest';
import { szenarioSchema, type SzenarioParsed } from '@renten/schema';
import { musterSzenario } from '../test/musterfall';
import { angeboteAusMix, eigenAusMix, eigenSetzen, vorschlagStand, type EigenTeil } from './vorschlag-berechnung';
import { angeboteMitVorschlag } from './angebote-liste';
import {
  MIX_NAME, WUNSCH_FRAGEN, mixAusgelassenText, mixDazu, mixGrund, mixGrundEigen, mixKurz, wunschAntwort,
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
      beitragMonat: Math.round(bav.eigenbeitragMonat), renteMonat: 0, kapital: 0, name: '', inhaber: 'A', ausVorschlag: true,
    });
    expect(angebote[1]!.agZuschussMonat).toBeCloseTo(bav.agZuschussMonat, 2);
    expect(angebote[2]).toMatchObject({ loesung: 'privat', beitragMonat: 100, agZuschussMonat: 0 });
  });

  it('unberührte Angebote weichen dem neuen Vorschlag, bearbeitete und angenommene bleiben', () => {
    const a = (id: string, mehr: object = {}) => ({
      id, loesung: 'privat' as const, name: '', inhaber: 'A' as const, beitragMonat: 100, agZuschussMonat: 0,
      dynamik: 0, renteMonat: 0, kapital: 0, ausVorschlag: false, ...mehr,
    });
    const alt = [a('leer'), a('benannt', { name: 'Musterleben' }), a('rente', { renteMonat: 300 }), a('angenommen')];
    const neu = [a('n1'), a('n2')];
    expect(angeboteMitVorschlag(alt, ['angenommen'], neu).map((x) => x.id))
      .toEqual(['benannt', 'rente', 'angenommen', 'n1', 'n2']);
    // Den Anbieter hat der Vorschlag von Hand mitgebracht: Unveraendert weicht das Angebot — mit Rente bleibt es.
    const ausVorschlag = [
      a('tarif', { name: 'Musterleben Flex', ausVorschlag: true }),
      a('tarifMitRente', { name: 'Musterleben Flex', ausVorschlag: true, renteMonat: 200 }),
    ];
    expect(angeboteMitVorschlag(ausVorschlag, [], neu).map((x) => x.id)).toEqual(['tarifMitRente', 'n1', 'n2']);
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

describe('der Vorschlag von Hand — Lösung und Höhe frei eingetragen', () => {
  const zeile = (loesung: EigenTeil['loesung'], betragMonat: number, vorgabe: EigenTeil['vorgabe'] = 'netto', name = ''): EigenTeil =>
    ({ loesung, betragMonat, vorgabe, name });
  /** Der Musterfall mit einer Verteilung von Hand — mit oder ohne Antworten. */
  const vonHand = (teile: EigenTeil[], wuensche: Wuensche = {}, mehr: (s: SzenarioParsed) => unknown = (s) => s) =>
    fall(wuensche, 200, (s) => mehr({ ...s, loesungen: { ...s.loesungen, eigen: { aktiv: true, teile } } }));

  it('gilt auch ohne Antworten — und gegen die Regeln des Vorschlags', () => {
    const stand = vorschlagStand(vonHand([zeile('bav', 100, 'brutto'), zeile('privat', 10)]), null);
    expect(stand.eigen).toBe(true);
    expect(stand.wuensche).toBeNull();
    expect(stand.offen).toBe(4);
    expect(stand.mix!.teile.map((x) => x.id)).toEqual(['bav', 'privat']);
    expect(stand.mix!.teile[0]!.loesung.eigenbeitragMonat).toBeCloseTo(100, 6);
    // 10 € liegen unter dem Mindestbeitrag der Regeln — von Hand stehen sie da.
    expect(stand.mix!.teile[1]!.loesung.nettoMonat).toBeCloseTo(10, 6);
  });

  it('die Antworten ändern die Verteilung nicht, stehen aber weiter für das Gutachten bereit', () => {
    const ohne = vorschlagStand(vonHand([zeile('privat', 250)]), null);
    const mit = vorschlagStand(vonHand([zeile('privat', 250)], { ...ALLE, arbeitgeber: 'ja' }), null);
    expect(mit.mix!.teile.map((x) => x.id)).toEqual(['privat']);
    expect(mit.mix!.nettoMonat).toBeCloseTo(ohne.mix!.nettoMonat, 6);
    expect(mit.wuensche).toMatchObject({ foerderung: 'ja', arbeitgeber: 'ja' });
  });

  it('nicht aktiv zählt wieder der Vorschlag aus den Antworten', () => {
    const s = fall(ALLE, 200, (x) => ({ ...x, loesungen: { ...x.loesungen, eigen: { aktiv: false, teile: [zeile('basis', 999)] } } }));
    const stand = vorschlagStand(s, null);
    expect(stand.eigen).toBe(false);
    expect(stand.mix!.teile.map((x) => x.id)).toEqual(['avd', 'privat']);
  });

  it('der Arbeitgeberzuschuss aus dem Plan gilt auch von Hand', () => {
    const mit = (quote: number) => vorschlagStand(vonHand([zeile('bav', 200, 'brutto')], {},
      (s) => ({ ...s, loesungen: { ...s.loesungen, agZuschussQuote: quote } })), null).mix!.teile[0]!.loesung;
    expect(mit(0.15).agZuschussMonat).toBeCloseTo(30, 6);
    expect(mit(0.5).agZuschussMonat).toBeCloseTo(100, 6);
  });

  it('Beamte: Die Betriebsrente ist gesperrt — die Eingabe nennt den Grund', () => {
    const beamter = (s: SzenarioParsed) => ({ ...s, einkommenHeute: { ...s.einkommenHeute, modus: 'besoldung' } });
    const stand = vorschlagStand(vonHand([zeile('bav', 100, 'brutto'), zeile('privat', 50)], {}, beamter), null);
    expect(stand.mix!.teile.map((x) => x.id)).toEqual(['privat']);
    const sperre = stand.gesperrt.find((a) => a.id === 'bav')!;
    expect(mixAusgelassenText(sperre, null)).toBe('Beamte wandeln kein Entgelt um.');
    // Beim Angestellten ist nichts gesperrt.
    expect(vorschlagStand(fall({}), null).gesperrt).toEqual([]);
  });

  it('die Eingabe geht vom Vorschlag aus den Antworten aus — beim ersten Ändern springt nichts', () => {
    const regel = vorschlagStand(fall({ ...ALLE, verfuegbar: 'teil', arbeitgeber: 'ja' }, 300), null).mix!;
    const start = eigenAusMix(regel);
    expect(start.map((x) => x.loesung)).toEqual(['avd', 'bav', 'privat']);
    expect(start.every((x) => x.vorgabe === 'netto' && x.name === '')).toBe(true);
    const danach = vorschlagStand(vonHand(start), null).mix!;
    expect(danach.nettoMonat).toBeCloseTo(regel.nettoMonat, 1);
    expect(danach.vertragMonat).toBeCloseTo(regel.vertragMonat, 0);
    expect(eigenAusMix(null)).toEqual([]);
  });

  it('eine Zeile setzen: je Lösung höchstens eine, in fester Reihenfolge', () => {
    let teile = eigenSetzen([], 'privat', { betragMonat: 100 });
    teile = eigenSetzen(teile, 'avd', { betragMonat: 150, vorgabe: 'brutto' });
    teile = eigenSetzen(teile, 'privat', { name: 'Musterleben Flex' });
    expect(teile).toEqual([
      { loesung: 'avd', betragMonat: 150, vorgabe: 'brutto', name: '' },
      { loesung: 'privat', betragMonat: 100, vorgabe: 'netto', name: 'Musterleben Flex' },
    ]);
  });

  it('übernommen werden Beitrag und Anbieter — ein eingetragener Beitrag auf den Cent', () => {
    const teile = [zeile('avd', 99.5, 'brutto', ' Depot Plus '), zeile('bav', 60), zeile('privat', 80, 'netto', 'Musterleben Flex')];
    const mix = vorschlagStand(vonHand(teile), null).mix!;
    const angebote = angeboteAusMix(mix, teile);
    expect(angebote.map((a) => [a.loesung, a.name])).toEqual([['avd', 'Depot Plus'], ['bav', ''], ['privat', 'Musterleben Flex']]);
    expect(angebote[0]!.beitragMonat).toBe(99.5);
    // Aus dem Netto-Aufwand gerechnet: der Beitrag in ganzen Euro, wie beim Vorschlag aus den Antworten.
    expect(Number.isInteger(angebote[1]!.beitragMonat)).toBe(true);
    expect(angebote[1]!.agZuschussMonat).toBeGreaterThan(0);
    expect(angebote[2]!.beitragMonat).toBe(80);
    // Ohne Zeilen bleibt es wie bisher: ohne Namen.
    expect(angeboteAusMix(mix).every((a) => a.name === '')).toBe(true);
  });

  it('die Worte nennen, was der Baustein bringt — ohne Bezug auf Antworten', () => {
    const mix = vorschlagStand(vonHand([zeile('avd', 100, 'brutto'), zeile('bav', 100, 'brutto'), zeile('basis', 100, 'brutto'), zeile('privat', 50)]), null).mix!;
    const grund = (id: string) => glatt(mixGrundEigen(mix.teile.find((x) => x.id === id)!));
    expect(grund('avd')).toMatch(/^Der Staat legt \d+ € im Monat dazu/);
    expect(grund('avd')).not.toContain('Zulagen mitnehmen');
    expect(grund('bav')).toMatch(/^Der Arbeitgeber zahlt mit: 15 € Zuschuss im Monat/);
    expect(grund('basis')).toMatch(/^Lebenslange Rente mit Steuervorteil: \d+ € Steuerersparnis im Monat\.$/);
    expect(grund('privat')).toBe('Ohne Förderung, dafür ohne Bindung: jederzeit verfügbar, im Alter als Rente oder Kapital.');
    expect(glatt(mixKurz(mix))).toMatch(/Altersvorsorgedepot · \d+ € Betriebsrente · \d+ € Basisrente \(Rürup\) · 50 € Private Rente$/);
  });

  it('ein unbrauchbarer Wert im Plan fällt weg — dann gilt der Vorschlag aus den Antworten', () => {
    const s = musterSzenario();
    const kaputt = szenarioSchema.parse({ ...s, loesungen: { ...s.loesungen, eigen: { aktiv: 'ja', teile: 'x' } } });
    expect(kaputt.loesungen.eigen).toEqual({ aktiv: false, teile: [] });
    expect(szenarioSchema.parse(s).loesungen.eigen).toEqual({ aktiv: false, teile: [] });
  });
});
