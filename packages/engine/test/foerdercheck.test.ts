import { describe, it, expect } from 'vitest';
import {
  foerdercheck, basisrahmenJahr, type FoerderKontext,
} from '../src/analyse/foerdercheck.js';
import { SV_FREI_QUOTE, STEUER_FREI_QUOTE } from '../src/analyse/vertrags-tuev.js';
import { parameterFuer } from '../src/params/registry.js';

const p = parameterFuer(2026, { indexRate: 0 });
const steuerOpt = {
  verheiratet: false, bundesland: 'Baden-Württemberg', kirchensteuerpflichtig: false,
};

/** Angestellter, gesetzlich versichert, ohne laufende Foerderung. */
const angestellt: FoerderKontext = {
  beamter: false,
  selbststaendig: false,
  privatVersichert: false,
  pkvPraemieMonat: 0,
  jahresbrutto: 72_000,
  zveHeute: 50_000,
  grvBeitragJahr: 0,
  bavEigenanteilJahr: 0,
  basisBeitragJahr: 0,
  grvDeckung: 0.6,
  lueckeMonat: 0,
};

const bav = (k: FoerderKontext) => foerdercheck(k, steuerOpt, p).find((b) => b.id === 'bav') ?? null;
const basis = (k: FoerderKontext) => foerdercheck(k, steuerOpt, p).find((b) => b.id === 'basis') ?? null;

describe('Fördercheck — betriebliche Altersvorsorge', () => {
  it('meldet den vollen Rahmen, wenn nichts umgewandelt wird', () => {
    const b = bav(angestellt);
    expect(b).not.toBeNull();
    expect(b!.rahmenMonat).toBeCloseTo(STEUER_FREI_QUOTE * p.bbgRvJahr / 12, 6);
  });

  it('zieht die laufende Umwandlung vom Rahmen ab', () => {
    const b = bav({ ...angestellt, bavEigenanteilJahr: 1_200 });
    expect(b!.rahmenMonat).toBeCloseTo((STEUER_FREI_QUOTE * p.bbgRvJahr - 1_200) / 12, 6);
  });

  it('schweigt, wenn der steuerfreie Rahmen ausgeschöpft ist', () => {
    expect(bav({ ...angestellt, bavEigenanteilJahr: STEUER_FREI_QUOTE * p.bbgRvJahr })).toBeNull();
  });

  it('schweigt bei Beamten und Selbstständigen — sie können nicht umwandeln', () => {
    expect(bav({ ...angestellt, beamter: true })).toBeNull();
    expect(bav({ ...angestellt, selbststaendig: true })).toBeNull();
  });

  it('nennt die Beitragsfreiheit nur, solange die 4-Prozent-Grenze offen ist', () => {
    // Zwischen 4 % und 8 %: steuerfrei ja, beitragsfrei nein. Genau der
    // Unterschied, den man vor dem Abschluss kennen sollte.
    const knapp = bav({ ...angestellt, bavEigenanteilJahr: SV_FREI_QUOTE * p.bbgRvJahr });
    expect(knapp).not.toBeNull();
    expect(knapp!.text).toContain('4-Prozent-Grenze');

    const offen = bav(angestellt);
    expect(offen!.text).toContain('beitragsfrei');
    expect(offen!.text).not.toContain('4-Prozent-Grenze');
  });

  it('spart bei einem privat Versicherten weniger als bei einem gesetzlich versicherten', () => {
    /*
      Der Befund aus der PKV-Runde: die Krankenversicherungsbeitraege eines
      privat Versicherten haengen am Vertrag, nicht am Gehalt — eine
      Umwandlung senkt sie um nichts.
    */
    const gesetzlich = bav(angestellt)!;
    const privat = bav({ ...angestellt, privatVersichert: true, pkvPraemieMonat: 600 })!;
    expect(privat.ersparnisJahr).toBeLessThan(gesetzlich.ersparnisJahr);
  });

  it('rechnet eine Förderung aus, die den Beitrag nicht übersteigt', () => {
    const b = bav(angestellt)!;
    expect(b.ersparnisJahr).toBeGreaterThan(0);
    expect(b.nettoAufwandMonat).toBeLessThan(b.probeMonat);
    expect(b.nettoAufwandMonat).toBeGreaterThan(0);
  });
});

describe('Fördercheck — Basisrente', () => {
  /*
    Selbststaendig, ohne Rentenversicherungspflicht — der klassische Fall.
    Das zu versteuernde Einkommen liegt bei 60.000 EUR: darunter bleibt die
    Foerderquote unter der Schwelle von 35 %, und der Befund erschiene dann
    nur wegen einer schwachen Rente. Beides soll hier getrennt pruefbar sein.
  */
  const selbst: FoerderKontext = {
    ...angestellt, selbststaendig: true, jahresbrutto: 72_000, grvBeitragJahr: 0,
    zveHeute: 60_000,
  };

  it('gibt einem Selbstständigen ohne GRV-Beitrag den vollen Höchstbetrag', () => {
    const { rahmen, verbraucht } = basisrahmenJahr(selbst, false, p);
    expect(verbraucht).toBe(0);
    expect(rahmen).toBeCloseTo(p.hoechstbetragAltersvorsorge, 6);

    const b = basis(selbst);
    expect(b).not.toBeNull();
    expect(b!.rahmenMonat).toBeCloseTo(p.hoechstbetragAltersvorsorge / 12, 6);
    expect(b!.text).toContain('unverbraucht');
  });

  it('kürzt den Rahmen um den eigenen Beitrag', () => {
    const mitBeitrag = basisrahmenJahr({ ...selbst, grvBeitragJahr: 9_000 }, false, p);
    expect(mitBeitrag.rahmen).toBeCloseTo(p.hoechstbetragAltersvorsorge - 9_000, 6);
  });

  it('rechnet beim Angestellten mit Arbeitnehmer- UND Arbeitgeberanteil', () => {
    const { verbraucht } = basisrahmenJahr(angestellt, false, p);
    expect(verbraucht).toBeCloseTo(72_000 * p.rvSatzGesamt, 6);
  });

  it('deckelt den verbrauchten Anteil an der Beitragsbemessungsgrenze', () => {
    const { verbraucht } = basisrahmenJahr({ ...angestellt, jahresbrutto: 200_000 }, false, p);
    expect(verbraucht).toBeCloseTo(p.bbgRvJahr * p.rvSatzGesamt, 6);
  });

  it('zieht einen laufenden Basisrentenbeitrag ab', () => {
    const ohne = basisrahmenJahr(selbst, false, p).rahmen;
    const mit = basisrahmenJahr({ ...selbst, basisBeitragJahr: 6_000 }, false, p).rahmen;
    expect(mit).toBeCloseTo(ohne - 6_000, 6);
  });

  it('verdoppelt den Höchstbetrag bei Zusammenveranlagung', () => {
    const einzeln = basisrahmenJahr(selbst, false, p).hoechstbetrag;
    expect(basisrahmenJahr(selbst, true, p).hoechstbetrag).toBeCloseTo(einzeln * 2, 6);
  });

  it('empfiehlt nichts bei kleinem Einkommen und ausreichender Rente', () => {
    // Foerderquote unter der Schwelle, Rente traegt, keine Luecke.
    expect(basis({ ...selbst, zveHeute: 24_000, grvDeckung: 0.8, lueckeMonat: 0 })).toBeNull();
  });

  it('empfiehlt bei schwacher gesetzlicher Rente auch ohne hohes Einkommen', () => {
    const b = basis({ ...selbst, zveHeute: 24_000, grvDeckung: 0.3, lueckeMonat: 700 });
    expect(b).not.toBeNull();
    expect(b!.text).toContain('30 %');
  });

  it('empfiehlt einem Gutverdiener ohne Basisrente allein aus dem Einkommen', () => {
    const b = basis({ ...angestellt, zveHeute: 80_000, grvDeckung: 0.8, lueckeMonat: 0 });
    expect(b).not.toBeNull();
    expect(b!.foerderquote).toBeGreaterThan(0.35);
  });

  it('schweigt bei laufender Basisrente, solange die Rente trägt', () => {
    /*
      Der Hinweis lautet „bisher gar keine Basisrente". Wer eine hat, braucht
      ihn nicht — dann meldet sich hoechstens noch die schwache Rente.
    */
    expect(basis({
      ...angestellt, zveHeute: 80_000, basisBeitragJahr: 3_000,
      grvDeckung: 0.8, lueckeMonat: 0,
    })).toBeNull();
  });

  it('schweigt, wenn der Höchstbetrag durch GRV-Beiträge aufgebraucht ist', () => {
    /*
      DIE FALLE: Eine schwache gesetzliche Rente allein darf keine Empfehlung
      ausloesen. Ohne freien Rahmen bringt die Basisrente keine Foerderung —
      dann waere der Hinweis ein Verkaufsargument ohne Substanz.
    */
    const belegt = { ...selbst, grvBeitragJahr: p.hoechstbetragAltersvorsorge, grvDeckung: 0.2, lueckeMonat: 900 };
    expect(basisrahmenJahr(belegt, false, p).rahmen).toBe(0);
    expect(basis(belegt)).toBeNull();
  });

  it('schweigt bei einem Rahmen unterhalb der Bagatellgrenze', () => {
    // 100 EUR im Monat sind die Grenze; knapp darunter bleibt es still.
    const knapp = { ...selbst, grvBeitragJahr: p.hoechstbetragAltersvorsorge - 1_100, grvDeckung: 0.2, lueckeMonat: 900 };
    expect(basis(knapp)).toBeNull();
  });

  it('rechnet eine Förderung aus, die den Beitrag nicht übersteigt', () => {
    const b = basis(selbst)!;
    expect(b.ersparnisJahr).toBeGreaterThan(0);
    expect(b.nettoAufwandMonat).toBeLessThan(b.probeMonat);
    expect(b.foerderquote).toBeGreaterThan(0);
    expect(b.foerderquote).toBeLessThan(1);
  });
});
