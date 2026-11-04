import { beforeEach, describe, expect, it } from 'vitest';
import { projiziere, versorgungsluecke, nurPerson } from '@renten/engine';
import { szenarioSchema } from '@renten/schema';
import { standardSzenario } from '../store/standard';
import { useSzenario, type SzenarioParsed } from '../store/szenario';
import { angebotPositionen, ansichtMitAngenommenen, mitAngenommenen } from './tuev-berechnung';

/**
 * „Lösungen annehmen“: Aus Alternativen werden Entscheidungen. Der Store
 * merkt sich die angenommenen Angebote, `mitAngenommenen` rechnet sie
 * gemeinsam ins Ergebnis.
 */

const mitAngeboten = (angenommen: string[] = []): SzenarioParsed => {
  const s = standardSzenario();
  return szenarioSchema.parse({
    ...s,
    haushalt: { ...s.haushalt, zielNettoHeute: 3000 },
    loesungen: {
      ...s.loesungen,
      angebote: [
        { id: 'p', loesung: 'privat', name: 'Private', beitragMonat: 150, renteMonat: 250 },
        // Rein arbeitgeberfinanziert, etwa fuer den Geschaeftsfuehrer.
        { id: 'g', loesung: 'bav', name: 'GGF', beitragMonat: 0, agZuschussMonat: 300, renteMonat: 400 },
        // Nur ein Kapital, keine Rente.
        { id: 'k', loesung: 'privat', name: 'Kapital', beitragMonat: 100, kapital: 60_000 },
        // Ohne Rente und ohne Kapital — nicht zu rechnen.
        { id: 'x', loesung: 'basis', name: 'Leer', beitragMonat: 100 },
      ],
      angenommen,
    },
  });
};

const ruhestand = (s: SzenarioParsed) => {
  const e = projiziere(s);
  return e.zeilen.find((z) => z.jahr === e.ruhestandsjahr)!;
};

describe('Lösungen annehmen im Store', () => {
  beforeEach(() => {
    useSzenario.getState().zuruecksetzen();
    useSzenario.getState().uebernehmen(mitAngeboten(), 'Test');
  });
  const angenommen = () => useSzenario.getState().szenario.loesungen.angenommen;

  it('annehmen und zuruecknehmen — jedes Angebot hoechstens einmal', () => {
    const st = useSzenario.getState();
    st.angebotAnnehmen('p', true);
    st.angebotAnnehmen('g', true);
    st.angebotAnnehmen('p', true);
    expect(angenommen()).toEqual(['p', 'g']);
    st.angebotAnnehmen('p', false);
    expect(angenommen()).toEqual(['g']);
  });

  it('nur Angebote, die es gibt', () => {
    useSzenario.getState().angebotAnnehmen('gibt-es-nicht', true);
    expect(angenommen()).toEqual([]);
  });

  it('ein entferntes Angebot nimmt seine Annahme mit', () => {
    const st = useSzenario.getState();
    st.angebotAnnehmen('p', true);
    st.angebotAnnehmen('g', true);
    st.angebotEntfernen('p');
    expect(angenommen()).toEqual(['g']);
    expect(useSzenario.getState().szenario.loesungen.angebote.map((a) => a.id)).toEqual(['g', 'k', 'x']);
  });
});

describe('Das Ergebnis mit den angenommenen Lösungen', () => {
  it('ohne Annahme bleibt das Szenario, wie es ist', () => {
    const s = mitAngeboten();
    const m = mitAngenommenen(s);
    expect(m.szenario).toBe(s);
    expect(m.neu.size).toBe(0);
  });

  it('die angenommenen Angebote kommen GEMEINSAM zu den Vertraegen', () => {
    const s = mitAngeboten(['p', 'g']);
    const m = mitAngenommenen(s);
    expect(m.szenario.vertraege).toHaveLength(s.vertraege.length + 2);
    expect([...m.neu]).toEqual(['angebot-p', 'angebot-g']);
    expect(m.loesungen.map((x) => x.angebot.id)).toEqual(['p', 'g']);

    const vorher = ruhestand(s);
    const nachher = ruhestand(m.szenario);
    // Beide Renten stehen als Posten im Ergebnis ...
    expect(nachher.posten.map((p) => p.id)).toEqual(expect.arrayContaining(['angebot-p', 'angebot-g']));
    // ... und das Netto steigt, die Luecke sinkt.
    expect(nachher.nettoMonat).toBeGreaterThan(vorher.nettoMonat);
    expect(versorgungsluecke(nachher)).toBeLessThan(versorgungsluecke(vorher));

    // Gemeinsam mehr als jedes fuer sich — aber hoechstens die Summe der einzelnen Zuwaechse:
    // Mit jeder weiteren Rente steigt die Steuer auf alle.
    const [p, g] = angebotPositionen(s);
    const einzeln = (x: typeof p) => x!.rente!.nettoRenteMonat;
    const zuwachs = nachher.nettoMonat - vorher.nettoMonat;
    expect(zuwachs).toBeGreaterThan(Math.max(einzeln(p), einzeln(g)));
    expect(zuwachs).toBeLessThanOrEqual(einzeln(p) + einzeln(g) + 1);
  });

  it('ohne Rente laeuft das Angebot als Kapitalauszahlung', () => {
    const m = mitAngenommenen(mitAngeboten(['k']));
    expect(m.szenario.vertraege.find((v) => v.id === 'angebot-k')!.strategie).toBe('kapital');
    const e = projiziere(m.szenario);
    expect(e.kapitalauszahlungen.map((k) => k.vertragId)).toContain('angebot-k');
  });

  it('nicht rechenbare Angebote und Annahmen ohne Angebot zaehlen nicht', () => {
    const s = mitAngeboten(['x', 'weg']);
    const m = mitAngenommenen(s);
    expect(m.szenario).toBe(s);
    expect(m.neu.size).toBe(0);
  });

  it('ohne Anbieter steht die Loesung im Kassenbon, nicht das Kuerzel des Vertragstyps', () => {
    const s = mitAngeboten(['g']);
    const ohneName = { ...s, loesungen: { ...s.loesungen, angebote: s.loesungen.angebote.map((a) => ({ ...a, name: '' })) } };
    const posten = ruhestand(mitAngenommenen(ohneName).szenario).posten.find((p) => p.id === 'angebot-g');
    expect(posten!.bezeichnung).toBe('Betriebsrente');
  });

  it('Einzelbetrachtung: erst im Haushalt rechnen, dann die Person herausschneiden', () => {
    const s = mitAngeboten(['p']);
    const paar = szenarioSchema.parse({
      ...s,
      haushalt: { ...s.haushalt, verheiratet: true },
      personen: [...s.personen, { ...s.personen[0]!, id: 'B', name: 'Bea' }],
      loesungen: { ...s.loesungen, angebote: s.loesungen.angebote.map((a) => (a.id === 'p' ? { ...a, inhaber: 'B' } : a)) },
    });
    const m = mitAngenommenen(paar);
    expect(m.szenario.vertraege.find((v) => v.id === 'angebot-p')!.inhaber).toBe('B');
    expect(ansichtMitAngenommenen(m, null)).toBe(m);
    // Bei Person A ist nichts angenommen, bei Person B das Angebot — umgeschrieben auf die Ansicht.
    expect(ansichtMitAngenommenen(m, 'A')).toBeNull();
    const b = ansichtMitAngenommenen(m, 'B')!;
    expect([...b.neu]).toEqual(['angebot-p']);
    expect(b.szenario.vertraege.some((v) => v.id === 'angebot-p')).toBe(true);
    expect(b.szenario).toEqual(nurPerson(m.szenario, 'B'));
  });
});
