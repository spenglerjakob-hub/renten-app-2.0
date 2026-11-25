import { describe, expect, it } from 'vitest';
import { mitarbeiterHinweise } from '@renten/engine';
import { beratungDatenSchema, firmenAngebotSchema, type BeratungDaten, type FirmenModellDaten } from '@renten/schema';
import { laufzeitText } from '../features/tuev-berechnung';
import { spracheAusAdresse, tokenAusAdresse, unterschriftLink } from '../lib/unterschrift-link';
import { wahl } from '../lib/sprache';
import { SCHRITTE, SCHRITTE_EN, schrittNamen } from './gespraech';
import {
  P, beitragsHinweise, beitragsRechnung, belastungJeVertrag, eingabenVon, hochrechnung, kennzahlenRechnung, leistungsRechnung,
  lueckeMitBetriebsrente, probeabrechnung, reglerGrenzen, spaeterBeginnen, versorgungslueckeRechnung,
} from './rechnung';
import {
  fazitText, festePunkte, gehaelterOptionen, lohnsteuerHinweis, mindestzuschussText, nettolohnGrundlage, regelKern, regelText,
  reglerErklaerung, steuerklasseOptionen, traegerText, vertragName,
} from './texte';
import { zeitpunktText } from './unterschrift-daten';
import {
  abrechnungZeile, anbieterSatz, angabenZeile, angebotSatz, axaZeile, beitragZeile, einkommenUndKvZeile, entscheidungZeile, grvZeile,
  kennzahlenZeile, kvZeile, leistungZeile, lueckeMitZeile, lueckeZeile, ortZeile, personZeile, rechnungZeile, spaeterZeile,
  unterlagenZeile, vertragZeile, vorbereitungStand, vorsorgeZeile,
} from './zeilen';

/*
 * DIE MITARBEITERBERATUNG AUF ENGLISCH (`lib/sprache.tsx`).
 *
 * Geprueft wird, was sich leicht verliert: dass Deutsch die Vorgabe bleibt,
 * dass jeder Satz, den es auf Deutsch gibt, auch auf Englisch da ist — und
 * dass im englischen kein deutsches Wort stehen bleibt, wenn sich ein Satz
 * aus Teilen zusammensetzt. Betraege stehen in beiden Sprachen in deutscher
 * Schreibweise.
 */

const HEUTE = new Date(2026, 10, 12);
const nbsp = (s: string) => s.replace(/\s/g, ' ');

/** Deutsche Woerter, die in einem englischen Satz nichts verloren haben. Fachbegriffe in Klammern sind erlaubt. */
const DEUTSCH = /\b(und|oder|der|die|das|den|dem|ein|eine|Ihr|Ihre|Ihren|Ihrer|Sie|im|am|ist|sind|nicht|mit|von|für|auf|bei|zum|zur|netto|brutto|Monat|Jahr|Jahre|fehlt|fehlen|Rente|Arbeitgeber|Umwandlung|Zuschuss|geschätzt|Prognose)\b/;
const ohneKlammern = (s: string) => s.replace(/\([A-ZÄÖÜ][a-zäöüß]+\)/g, '');
const englisch = (s: string) => expect(ohneKlammern(nbsp(s)), s).not.toMatch(DEUTSCH);

const MODELLE: FirmenModellDaten[] = [
  { art: 'zuschuss', quote: 0.5, deckelMonat: 100 },
  { art: 'zuschuss', quote: 0.25, deckelMonat: 0 },
  { art: 'frei', quote: 0.2, deckelMonat: 0, stufen: [{ abMonat: 50, betragMonat: 25 }, { abMonat: 70, betragMonat: 30 }] },
  { art: 'frei', quote: 0.2, deckelMonat: 40, stufen: [] },
  { art: 'frei', quote: 0, deckelMonat: 0, stufen: [{ abMonat: 50, betragMonat: 25 }] },
  { art: 'frei', quote: 0, deckelMonat: 0, stufen: [] },
  { art: 'festbetrag', festbetragMonat: 50, mindestUmwandlungMonat: 50 },
  { art: 'festbetrag', festbetragMonat: 50, mindestUmwandlungMonat: 0 },
  { art: 'matching', weg: 'dv', matchingMonat: 100, zuschussImMatching: false },
  { art: 'matching', weg: 'dv', matchingMonat: 100, zuschussImMatching: true },
  { art: 'matching', weg: 'ukasse', matchingMonat: 100, zuschussImMatching: false },
];

const angebot = (modell: FirmenModellDaten) => firmenAngebotSchema.parse({
  bundesland: 'Bayern', versicherer: 'Musterleben', tarif: 'Klassik', ukasse: 'Muster-Kasse e. V.', modell,
});
const beratung = (angaben: Partial<BeratungDaten['angaben']> = {}, rest: Record<string, unknown> = {}): BeratungDaten =>
  beratungDatenSchema.parse({
    angaben: { name: 'Anna Beispiel', geburtsdatum: '15.03.1985', jahresbrutto: 54_000, ...angaben },
    umwandlungMonat: 200,
    ...rest,
  });

describe('Sprache der Beratung', () => {
  it('ist Deutsch, solange nichts gewählt ist', () => {
    expect(beratung().sprache).toBe('de');
    expect(wahl('de')('Deutsch', 'English')).toBe('Deutsch');
    expect(wahl('en')('Deutsch', 'English')).toBe('English');
  });

  it('nennt die sieben Schritte in beiden Sprachen', () => {
    expect(SCHRITTE_EN).toHaveLength(SCHRITTE.length);
    expect(schrittNamen('de')).toBe(SCHRITTE);
    expect(schrittNamen('en')).toEqual(['Your offer', 'Your details', 'Pension gap', 'Your calculation', 'Benefits in retirement', 'Decision', 'Documents']);
  });
});

describe('Die Regel der Firma auf Englisch', () => {
  it('ohne Sprache bleibt alles deutsch — so rufen die Unterlagen', () => {
    expect(nbsp(regelText({ art: 'zuschuss', quote: 0.5, deckelMonat: 100 })))
      .toBe('Ihr Arbeitgeber gibt 50 % Ihres Beitrags dazu, höchstens 100 € im Monat.');
    expect(nbsp(regelText({ art: 'zuschuss', quote: 0.5, deckelMonat: 100 }, 'de')))
      .toBe('Ihr Arbeitgeber gibt 50 % Ihres Beitrags dazu, höchstens 100 € im Monat.');
  });

  it('sagt dieselbe Regel, mit Beträgen in deutscher Schreibweise', () => {
    expect(nbsp(regelText({ art: 'zuschuss', quote: 0.5, deckelMonat: 100 }, 'en')))
      .toBe('Your employer adds 50 % of your contribution, up to 100 € a month.');
    expect(nbsp(regelText({ art: 'festbetrag', festbetragMonat: 50, mindestUmwandlungMonat: 50 }, 'en')))
      .toBe('Your employer adds 50 € a month if you convert at least 50 €.');
    expect(nbsp(regelText(MODELLE[2]!, 'en')))
      .toBe('Your employer adds 20 % of your contribution and, on top, a fixed contribution: 25 € a month from 50 € converted, 30 € from 70 €.');
  });

  it('enthält in jedem Modell ihren Kern wörtlich — er wird in der Überschrift hervorgehoben', () => {
    for (const m of MODELLE) {
      for (const s of ['de', 'en'] as const) {
        expect(regelText(m, s), `${m.art} ${s}`).toContain(regelKern(m, s));
      }
      englisch(regelText(m, 'en'));
    }
  });

  it('nennt Vertrag und Träger', () => {
    const a = angebot(MODELLE[8]!);
    expect(vertragName('direkt', a, 'en')).toBe('Direct insurance (Direktversicherung)');
    expect(vertragName('ukasse', a, 'en')).toBe('Support fund (Unterstützungskasse)');
    expect(traegerText('direkt', a, 'en')).toBe('Musterleben, tariff Klassik');
    expect(anbieterSatz(a, 'en')).toBe('Direct insurance (Direktversicherung) — Musterleben, tariff Klassik · Support fund (Unterstützungskasse) — Muster-Kasse e. V.');
  });

  it('hat für jeden festen Hinweis einen englischen', () => {
    for (const m of MODELLE) {
      const a = angebot(m);
      expect(festePunkte(a, 'en')).toHaveLength(festePunkte(a).length);
      festePunkte(a, 'en').forEach(englisch);
    }
  });

  it('übersetzt die Auswahl von Steuerklasse und Gehältern, ohne die Werte zu ändern', () => {
    expect(steuerklasseOptionen('en').map((o) => o.wert)).toEqual(steuerklasseOptionen('de').map((o) => o.wert));
    expect(gehaelterOptionen('en').map((o) => o.wert)).toEqual(gehaelterOptionen('de').map((o) => o.wert));
    expect(steuerklasseOptionen('en')[0]!.text).toBe('I – single');
    englisch(nettolohnGrundlage(5, 13, 'en'));
    englisch(lohnsteuerHinweis(3, 'en'));
  });
});

describe('Die Rechnung auf Englisch', () => {
  it('prüft den gesetzlichen Zuschuss und erklärt den Regler in jedem Modell', () => {
    for (const m of MODELLE) {
      const f = angebot(m);
      for (const umwandlungMonat of [30, 200, 500]) {
        const d = beratung({}, { umwandlungMonat });
        const r = beitragsRechnung(f, d);
        if (r.mindestzuschuss) englisch(mindestzuschussText(r.mindestzuschuss, m, 'en'));
        englisch(reglerErklaerung(reglerGrenzen(f, d), m, 'en'));
      }
    }
  });

  it('gibt die Hinweise des Rechenkerns auf Deutsch unverändert und auf Englisch in gleicher Zahl', () => {
    for (const m of MODELLE) {
      const f = angebot(m);
      for (const angaben of [{}, { kv: 'privat' as const, pkvPraemieMonat: 450 }, { jahresbrutto: 96_000 }]) {
        for (const umwandlungMonat of [30, 250, 600]) {
          const d = beratung(angaben, { umwandlungMonat });
          const r = beitragsRechnung(f, d);
          expect(beitragsHinweise(f, d, r, 'de')).toBe(r.hinweise);
          const en = beitragsHinweise(f, d, r, 'en');
          expect(en, `${m.art} ${umwandlungMonat}`).toHaveLength(r.hinweise.length);
          en.forEach(englisch);
          // Derselbe Rechenkern, direkt gerufen: Deutsch ist die Vorgabe.
          expect(mitarbeiterHinweise(f.modell as never, eingabenVon(d.angaben, d.umwandlungMonat), r, P)).toEqual(r.hinweise);
        }
      }
    }
  });

  it('beschriftet die Belastung auf Englisch mit denselben Beträgen', () => {
    const f = angebot(MODELLE[0]!);
    const d = beratung();
    const r = beitragsRechnung(f, d);
    const de = belastungJeVertrag(r.vertraege[0]!, r, d.angaben, f)!;
    const en = belastungJeVertrag(r.vertraege[0]!, r, d.angaben, f, P, 'en')!;
    expect(en.zeilen.map((z) => z.betrag)).toEqual(de.zeilen.map((z) => z.betrag));
    expect(en.zeilen.map((z) => z.text)).toEqual(['− Employer contribution', '= Your salary conversion', '− Social security saved', '− Tax saved']);
    en.zeilen.forEach((z) => { if (z.erklaerung) englisch(z.erklaerung); });
  });

  it('nennt Laufzeiten und Zeitpunkte', () => {
    expect(laufzeitText(280)).toBe('23 Jahre, 4 Monate');
    expect(laufzeitText(280, 'en')).toBe('23 years, 4 months');
    expect(laufzeitText(13, 'en')).toBe('1 year, 1 month');
    expect(laufzeitText(24, 'en')).toBe('2 years');
    expect(zeitpunktText('2026-11-24T13:32:00Z', 'en')).toBe('24.11.2026 at 14:32');
    expect(zeitpunktText('2026-11-24T13:32:00Z')).toBe('24.11.2026 um 14:32 Uhr');
  });
});

describe('Die Zeilen der Schritte auf Englisch', () => {
  const f = angebot(MODELLE[0]!);
  const d = beratung();
  const r = beitragsRechnung(f, d);
  const h = hochrechnung(f, d, r);

  it('sagen dasselbe wie die deutschen', () => {
    expect(nbsp(angebotSatz(f, 'en'))).toBe('Your employer adds 50 % of your contribution, up to 100 € a month');
    expect(personZeile(d.angaben, HEUTE, 'en').ergebnis).toBe('Anna Beispiel, 41 · Retirement on 01.04.2052');
    expect(nbsp(einkommenUndKvZeile(d.angaben, 'en').ergebnis!)).toBe('4.500 € gross a month · Tax class I · statutory health insurance');
    expect(nbsp(kvZeile(beratung({ kv: 'privat', pkvPraemieMonat: 450 }).angaben, 'en').ergebnis!)).toBe('private · 450 € a month');
    expect(vorsorgeZeile(d.angaben, 'en').ergebnis).toBe('No existing company pension');
    expect(nbsp(rechnungZeile(r, 'en').ergebnis!)).toMatch(/^\d+ € net a month · [\d,]+ € into your pension$/);
    expect(nbsp(beitragZeile(r, h, 'en').ergebnis!)).toMatch(/ · an estimated [\d.]+ € in capital$/);
    expect(nbsp(abrechnungZeile(probeabrechnung(f, d, r), 'en').ergebnis!)).toMatch(/^Net pay [\d.,]+ € instead of [\d.,]+ €$/);
    expect(nbsp(spaeterZeile(spaeterBeginnen(h, r.nettoAufwandMonat)[1]!, 'en').ergebnis!)).toMatch(/^Waiting one year costs [\d.]+ € in capital$/);
    expect(entscheidungZeile(d, r, '01.01.2027', 'en').ergebnis).toBe('Still open');
    expect(nbsp(entscheidungZeile(beratung({}, { entscheidung: { status: 'teilnahme' } }), r, '01.01.2027', 'en').ergebnis!))
      .toBe('Taking part · 200 € a month from 01.01.2027');
    expect(entscheidungZeile(beratung({}, { entscheidung: { status: 'verzicht' } }), r, '01.01.2027', 'en').ergebnis).toBe('Waiver');
    expect(axaZeile([], 'en')).toEqual({ ergebnis: 'Complete' });
    expect(axaZeile(['a', 'b'], 'en')).toEqual({ fehlt: '2 details missing' });
    expect(ortZeile(d.entscheidung, 'en').fehlt).toBe('Place missing');
    expect(unterlagenZeile(null, 'en').ergebnis).toBe('Not yet signed');
  });

  it('nennen auf Englisch, was fehlt', () => {
    const leer = beratungDatenSchema.parse({});
    expect(angabenZeile(leer.angaben, HEUTE, 'en').fehlt).toBe('Name, Date of birth and Gross salary missing');
    expect(angabenZeile(beratung({ name: '' }).angaben, HEUTE, 'en').fehlt).toBe('Name missing');
    expect(rechnungZeile(beitragsRechnung(f, beratung({}, { umwandlungMonat: 0 })), 'en').fehlt).toBe('No amount chosen yet');
    expect(vertragZeile(null, false, 'en').fehlt).toBe('Figures from the offer missing');
  });

  it('lassen den Stand der Vorbereitung deutsch — den liest der Berater', () => {
    const leer = beratungDatenSchema.parse({ sprache: 'en' });
    expect(vorbereitungStand(leer, HEUTE)).toEqual({ art: 'fehlt', text: 'Name, Geburtsdatum und Bruttogehalt fehlen' });
  });

  it('stehen für Lücke, Leistung und Kennzahlen ohne deutsches Wort da', () => {
    const mitWerten = beratung({}, { versicherer: { direkt: { garantierteRente: 250, prognoseRente: 420, prognoseKapital: 110_000 } } });
    const rr = beitragsRechnung(f, mitWerten);
    const luecke = versorgungslueckeRechnung(f, mitWerten);
    const leistung = leistungsRechnung(f, mitWerten, rr);
    const kennzahlen = kennzahlenRechnung(f, mitWerten, leistung);
    const geschlossen = lueckeMitBetriebsrente(luecke, leistung, mitWerten);
    const zeilen = [
      lueckeZeile(luecke, 'en').ergebnis, grvZeile(mitWerten.angaben, 1500, 'en').ergebnis,
      vertragZeile(leistung?.vertraege[0] ?? null, false, 'en').ergebnis, leistungZeile(leistung, rr, mitWerten, 'en').ergebnis,
      geschlossen ? lueckeMitZeile(geschlossen, 'en').ergebnis : 'x', kennzahlen ? kennzahlenZeile(kennzahlen, 'en').ergebnis : 'x',
      kennzahlen ? fazitText(kennzahlen, 'en') : 'x',
    ];
    for (const z of zeilen) {
      expect(z).toBeTruthy();
      englisch(z!);
    }
  });
});

describe('Unterschrift per Link', () => {
  const TOKEN = '0123456789abcdef0123456789abcdef';

  it('trägt die Sprache in der Adresse, der Token bleibt im Fragment', () => {
    expect(unterschriftLink(TOKEN, 'https://js-rentenplaner.de')).toBe(`https://js-rentenplaner.de/unterschrift#${TOKEN}`);
    expect(unterschriftLink(TOKEN, 'https://js-rentenplaner.de', 'de')).toBe(`https://js-rentenplaner.de/unterschrift#${TOKEN}`);
    const en = unterschriftLink(TOKEN, 'https://js-rentenplaner.de', 'en');
    expect(en).toBe(`https://js-rentenplaner.de/unterschrift?lang=en#${TOKEN}`);
    const adresse = new URL(en);
    expect(tokenAusAdresse(adresse.hash)).toBe(TOKEN);
    expect(spracheAusAdresse(adresse.search)).toBe('en');
  });

  it('liest alles andere als Deutsch', () => {
    expect(spracheAusAdresse('')).toBe('de');
    expect(spracheAusAdresse('?lang=de')).toBe('de');
    expect(spracheAusAdresse('?lang=fr')).toBe('de');
    expect(spracheAusAdresse('?x=1&lang=en')).toBe('en');
  });
});
