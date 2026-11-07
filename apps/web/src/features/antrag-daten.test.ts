import { describe, expect, it } from 'vitest';
import { antragLoesungSchema } from '@renten/schema';
import { angabenFuer, antragMail, antragsbogenHtml, htmlText, loesungenGleich } from './antrag-daten';

const loesung = (x: Partial<Parameters<typeof antragLoesungSchema.parse>[0]>) =>
  antragLoesungSchema.parse({ id: 'p', art: 'privat', anbieter: 'Musterleben', ...x });

describe('Angaben je Loesung', () => {
  it('vorbelegt der erste Punkt, Fremdes faellt weg, die Bank bleibt', () => {
    const l = [loesung({ id: 'p' }), loesung({ id: 'g', art: 'bav' })];
    expect(angabenFuer({ bezugsrecht: { p: 3, alt: 2 }, bank: { inhaber: 'A', iban: 'DE89' } }, l))
      .toEqual({ bezugsrecht: { p: 3, g: 1 }, bank: { inhaber: 'A', iban: 'DE89' } });
    expect(loesungenGleich(l, [...l])).toBe(true);
    expect(loesungenGleich(l, [l[0]!])).toBe(false);
  });

  it('die E-Mail an den Kunden nennt nur den Link, keine Angaben', () => {
    const m = decodeURIComponent(antragMail('Familie Muster', 'https://x.de/antrag#abc', '2026-12-04T00:00:00Z'));
    expect(m).toContain('https://x.de/antrag#abc');
    expect(m).toContain('4.12.2026');
    expect(m).not.toMatch(/IBAN|Ausweis/);
  });
});

describe('Antragsbogen', () => {
  const daten = {
    kunde: 'Familie <Muster>',
    loesungen: [
      loesung({ id: 'p', anbieter: 'Musterleben "Plus"', person: 'Max', beitragMonat: 100, renteMonat: 250 }),
      loesung({ id: 'g', art: 'bav', anbieter: 'GGF', person: 'Max', agZuschussMonat: 300, renteMonat: 400 }),
    ],
    angaben: { bezugsrecht: { p: 2, g: 1 }, bank: { inhaber: 'Max <script>', iban: 'DE89370400440532013000' } },
    ausweise: [
      { bild: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==', seite: 'vorne' as const, vomKunden: true },
      { bild: 'javascript:alert(1)', seite: 'hinten' as const, vomKunden: false },
    ],
    stand: new Date('2026-11-04T12:00:00Z'),
  };

  it('alle Angaben als Text — nichts davon wird Markup', () => {
    const html = antragsbogenHtml(daten);
    expect(html).toContain('Familie &lt;Muster&gt;');
    expect(html).toContain('Max &lt;script&gt;');
    expect(html).toContain('Musterleben &quot;Plus&quot;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('javascript:');
  });

  it('Bildquelle nur ein JPEG als data-URL; was fehlt, sagt der Bogen', () => {
    const html = antragsbogenHtml({
      ...daten,
      ausweise: [
        ...daten.ausweise,
        { bild: 'https://x.supabase.co/a.jpg', seite: 'vorne' as const, vomKunden: false },
        { bild: 'data:image/svg+xml;base64,PHN2Zz4=', seite: 'vorne' as const, vomKunden: false },
        { bild: null, seite: 'hinten' as const, vomKunden: true },
      ],
    });
    expect(html.match(/<img /g)).toHaveLength(1);
    expect(html).toContain('<img src="data:image/jpeg;base64,/9j/4AAQSkZJRg==" alt="">');
    expect(html).not.toContain('https://x.supabase.co');
    expect(html).not.toContain('svg+xml');
    expect(html.match(/ließ sich nicht laden/g)).toHaveLength(4);
    expect(html).toContain('Rückseite · vom Kunden');
  });

  it('Bezugsrecht im Wortlaut, IBAN in Vierergruppen, Kopie vom Kunden', () => {
    const html = antragsbogenHtml(daten);
    expect(html).toContain('2. die Kinder des Versicherungsnehmers (VN)');
    expect(html).toContain('DE89 3704 0044 0532 0130 00');
    expect(html).toContain('Vorderseite · vom Kunden');
    expect(htmlText(`a&b'"`)).toBe('a&amp;b&#39;&quot;');
  });

  it('eine falsche IBAN steht mit dem Grund daneben, eine fehlende als offen', () => {
    const mit = (iban: string) => antragsbogenHtml({ ...daten, angaben: { ...daten.angaben, bank: { inhaber: 'Max', iban } } });
    expect(mit('DE23 6605 5555 5555 54')).toContain(
      'DE23 6605 5555 5555 54 <span class="leer">(Eine deutsche IBAN hat 22\u00a0Stellen — hier sind es\u00a018.)</span>');
    expect(mit('DE89 3704 0044 0532 0130 01')).toContain('(Die Prüfziffer stimmt nicht');
    expect(mit('')).toContain('<td class="wert"><span class="leer">noch offen</span></td>');
    expect(antragsbogenHtml(daten)).not.toMatch(/Prüfziffer|Stellen —/);
  });

  it('nur bAV: keine Bankverbindung; ohne Kopie ein Vermerk', () => {
    const html = antragsbogenHtml({ ...daten, loesungen: [daten.loesungen[1]!], ausweise: [] });
    expect(html).not.toContain('Bankverbindung');
    expect(html).toContain('noch keine Kopie');
  });
});

describe('Vergleichen und bereinigen', () => {
  it('die Reihenfolge der Schluessel zaehlt nicht, die Werte schon', async () => {
    const { angabenGleich, angabenBereinigt } = await import('./antrag-daten');
    expect(angabenGleich({ bezugsrecht: { p: 1, g: 2 } }, { bezugsrecht: { g: 2, p: 1 } })).toBe(true);
    expect(angabenGleich({ bezugsrecht: { p: 1 } }, { bezugsrecht: { p: 2 } })).toBe(false);
    expect(angabenGleich({ bezugsrecht: {}, bank: { inhaber: '', iban: '' } }, { bezugsrecht: {} })).toBe(true);
    expect(angabenBereinigt({ bezugsrecht: { p: 1 }, bank: { inhaber: ' Max ', iban: 'de89 3704' } }))
      .toEqual({ bezugsrecht: { p: 1 }, bank: { inhaber: 'Max', iban: 'DE893704' } });
    expect(angabenBereinigt({ bezugsrecht: {}, bank: { inhaber: ' ', iban: '' } })).toEqual({ bezugsrecht: {} });
  });
});
