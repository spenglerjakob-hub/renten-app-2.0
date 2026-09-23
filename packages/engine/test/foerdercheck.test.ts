import { describe, it, expect } from 'vitest';
import {
  foerdercheck, basisrahmenJahr, type FoerderKontext,
} from '../src/analyse/foerdercheck.js';
import { SV_FREI_QUOTE, STEUER_FREI_QUOTE } from '../src/analyse/vertrags-tuev.js';
import { avdSteuervorteil } from '../src/products/altersvorsorgedepot.js';
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
  bavArbeitgeberJahr: 0,
  basisBeitragJahr: 0,
  grvDeckung: 0.6,
  lueckeMonat: 0,
  avdEigenbeitragJahr: 0,
  kinder: [],
  alter: 40,
  jahr: 2026,
};

const bav = (k: FoerderKontext) => foerdercheck(k, steuerOpt, p).find((b) => b.id === 'bav') ?? null;
const basis = (k: FoerderKontext) => foerdercheck(k, steuerOpt, p).find((b) => b.id === 'basis') ?? null;
const avd = (k: FoerderKontext) => foerdercheck(k, steuerOpt, p).find((b) => b.id === 'avd') ?? null;

describe('Fördercheck — betriebliche Altersvorsorge', () => {
  it('misst den Rahmen am BEITRAGSFREIEN Teil, nicht am steuerfreien', () => {
    /*
      Beitrags- UND steuerfrei sind nur 4 % der Beitragsbemessungsgrenze; die
      zweiten 4 % sind allein steuerfrei. Der Rahmen, den der Befund nennt,
      ist deshalb der beitragsfreie — die zweite Stufe pauschal zu empfehlen
      waere falsch.
    */
    const b = bav(angestellt);
    expect(b).not.toBeNull();
    expect(b!.rahmenMonat).toBeCloseTo(SV_FREI_QUOTE * p.bbgRvJahr / 12, 6);
    expect(b!.rahmenMonat).toBeLessThan(STEUER_FREI_QUOTE * p.bbgRvJahr / 12);
  });

  it('zieht die laufende Umwandlung vom Rahmen ab', () => {
    const b = bav({ ...angestellt, bavEigenanteilJahr: 1_200 });
    expect(b!.rahmenMonat).toBeCloseTo((SV_FREI_QUOTE * p.bbgRvJahr - 1_200) / 12, 6);
  });

  it('schweigt, wenn der beitragsfreie Rahmen ausgeschöpft ist', () => {
    // Ab hier bliebe nur noch die Steuerfreiheit — und die reicht fuer eine
    // pauschale Empfehlung nicht aus.
    expect(bav({ ...angestellt, bavEigenanteilJahr: SV_FREI_QUOTE * p.bbgRvJahr })).toBeNull();
  });

  it('rechnet die Arbeitgeberbeiträge gegen den Rahmen — sie gehen vor', () => {
    /*
      Die Grenzen gelten fuer die SUMME aus dem Dienstverhaeltnis. Ein
      Zuschuss von 1.200 EUR verbraucht die vier Prozent mit; wer nur den
      Eigenanteil dagegenhaelt, weist einen Rahmen aus, den es nicht gibt.
    */
    const ohne = bav({ ...angestellt, bavEigenanteilJahr: 1_200 })!;
    const mit = bav({ ...angestellt, bavEigenanteilJahr: 1_200, bavArbeitgeberJahr: 1_200 })!;
    expect(mit.rahmenMonat).toBeCloseTo(ohne.rahmenMonat - 100, 6);
    expect(mit.text).toContain('Arbeitgeber');
  });

  it('schweigt, wenn Arbeitgeber und Eigenanteil zusammen die 4 % füllen', () => {
    expect(bav({
      ...angestellt,
      bavEigenanteilJahr: SV_FREI_QUOTE * p.bbgRvJahr / 2,
      bavArbeitgeberJahr: SV_FREI_QUOTE * p.bbgRvJahr / 2,
    })).toBeNull();
  });

  it('schweigt bei Beamten und Selbstständigen — sie können nicht umwandeln', () => {
    expect(bav({ ...angestellt, beamter: true })).toBeNull();
    expect(bav({ ...angestellt, selbststaendig: true })).toBeNull();
  });

  it('nennt die zweite Stufe im Hinweis, ohne sie zu empfehlen', () => {
    // Der Befund traegt die Auskunft, der Hinweis die Einschraenkung — im
    // Ausdruck steht nur der Befund, sonst sprengt er die Seite.
    const b = bav(angestellt)!;
    expect(b.text).toContain('Steuer- UND sozialversicherungsfrei');
    expect(b.hinweis).toBeDefined();
    expect(b.hinweis!).toContain('nur noch steuerfrei');
    expect(b.hinweis!).toContain('volle Sozialabgaben');
    // Der genannte Zusatzrahmen ist die Differenz beider Grenzen.
    expect(b.hinweis!).toContain(
      Math.round((STEUER_FREI_QUOTE - SV_FREI_QUOTE) * p.bbgRvJahr / 12).toLocaleString('de-DE'),
    );
  });

  it('rechnet die Ersparnis am beitragsfreien Beitrag — mit Sozialabgaben', () => {
    /*
      Weil die Probe jetzt innerhalb der 4 % bleibt, wirken Steuer UND
      Sozialabgaben. Die Foerderquote liegt dadurch deutlich hoeher als bei
      einem Beitrag, der nur steuerfrei waere.
    */
    const b = bav(angestellt)!;
    expect(b.probeMonat).toBeLessThanOrEqual(SV_FREI_QUOTE * p.bbgRvJahr / 12 + 1e-9);
    expect(b.foerderquote).toBeGreaterThan(0.4);
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

describe('Altersvorsorgedepot im Foerdercheck', () => {
  /*
    Der Check kannte nur Steuerrahmen. Beim Altersvorsorgedepot geht es um
    GELD VOM STAAT — 50 Cent je Euro bis 360 EUR, 25 Cent bis 1 800 EUR und
    300 EUR je Kind. Wer nichts einzahlt, bekommt nichts, und niemand traegt
    es nach.
  */
  const p2027 = parameterFuer(2027, { indexRate: 0 });
  const check = (k: Partial<FoerderKontext>) =>
    foerdercheck({ ...angestellt, jahr: 2027, ...k }, steuerOpt, p2027)
      .find((b) => b.id === 'avd') ?? null;

  it('meldet die volle Zulage, wenn gar kein Depot erfasst ist', () => {
    const b = check({ avdEigenbeitragJahr: 0 });
    expect(b).not.toBeNull();
    // 360 x 50 % + 1 440 x 25 % = 540 EUR Grundzulage beim Hoechstbetrag.
    expect(b!.ersparnisJahr).toBeCloseTo(540, 6);
    expect(b!.titel).toContain('bleiben ganz liegen');
  });

  it('rechnet 300 EUR je Kind mit Kindergeldanspruch dazu', () => {
    const ohne = check({ avdEigenbeitragJahr: 0, kinder: [] })!;
    const zwei = check({
      avdEigenbeitragJahr: 0,
      kinder: [{ geburtsjahr: 2020 }, { geburtsjahr: 2022 }],
    })!;
    expect(zwei.ersparnisJahr - ohne.ersparnisJahr).toBeCloseTo(600, 6);
    expect(zwei.text).toContain('Kinderzulage');
  });

  it('schweigt, sobald der Hoechstbetrag ausgeschoepft ist', () => {
    expect(check({ avdEigenbeitragJahr: p2027.avd.hoechstbetragEigenbeitrag })).toBeNull();
  });

  it('meldet nur noch die Luecke, wenn schon etwas eingezahlt wird', () => {
    const b = check({ avdEigenbeitragJahr: 900 })!;
    expect(b.ersparnisJahr).toBeGreaterThan(0);
    expect(b.ersparnisJahr).toBeLessThan(540);
    expect(b.titel).toContain('nicht ausgeschöpft');
  });

  it('verspricht vor dem Startjahr nichts, sondern nennt es', () => {
    const b = foerdercheck({ ...angestellt, jahr: 2026, avdEigenbeitragJahr: 0 }, steuerOpt, p)
      .find((x) => x.id === 'avd')!;
    expect(b.titel).toContain('2027');
    expect(b.text).toContain('Ab 2027');
  });
});

describe('Fördercheck — Zulage oder Steuerersparnis', () => {
  /*
    WOFUER DAS FELD DA IST: Beide Betraege stehen in `ersparnisJahr` und
    senken den Eigenaufwand — fuer die Anzeige sind sie trotzdem nicht
    dasselbe. Eine Zulage ist Geld vom Staat und eine Zahl, die man nennen
    kann; eine Steuerersparnis haengt an Einkommen und Familienstand. Ohne
    dieses Feld muesste die Oberflaeche an der `id` herumraten.
  */
  it('weist die Zulagen des Altersvorsorgedepots als ZULAGE aus', () => {
    const p2027 = parameterFuer(2027, { indexRate: 0 });
    const b = foerdercheck({ ...angestellt, jahr: 2027 }, steuerOpt, p2027)
      .find((x) => x.id === 'avd')!;
    expect(b.foerderArt).toBe('zulage');
    // Auch der Befund vor dem Startjahr — es bleibt eine Zulage.
    const vorher = foerdercheck({ ...angestellt, jahr: 2026 }, steuerOpt, p)
      .find((x) => x.id === 'avd')!;
    expect(vorher.foerderArt).toBe('zulage');
  });

  it('weist bAV und Basisrente als STEUERersparnis aus', () => {
    expect(bav(angestellt)!.foerderArt).toBe('steuer');
    const selbst: FoerderKontext = {
      ...angestellt, selbststaendig: true, grvBeitragJahr: 0,
      jahresbrutto: 90_000, zveHeute: 80_000,
    };
    expect(basis(selbst)!.foerderArt).toBe('steuer');
  });
});

describe('Altersvorsorgedepot — die Zulage kommt obendrauf', () => {
  /*
    BEFUND: Der Check rechnete „Eigenbeitrag minus Zulage" und schrieb
    „150 EUR kosten Sie nur 80 EUR — der Staat traegt 70 davon". Wer 150 EUR
    einzahlt, zahlt aber 150 EUR; die Zulage wird dem Depot ZUSAETZLICH
    gutgeschrieben. Dieselbe Doppelzaehlung, die `avdSteuervorteil`
    ausdruecklich ausschliesst.
  */
  const p2027 = parameterFuer(2027, { indexRate: 0 });
  const kind = [{ geburtsjahr: 2020 }];
  const check = (k: Partial<FoerderKontext>) =>
    foerdercheck({ ...angestellt, jahr: 2027, kinder: kind, ...k }, steuerOpt, p2027)
      .find((b) => b.id === 'avd')!;

  it('mindert den eigenen Beitrag NICHT um die Zulage', () => {
    /*
      zvE 35.000 — der Fall aus dem Screenshot (2.500 EUR netto). Der
      Sonderausgabenabzug bringt dort nicht mehr als die Zulage; der Beitrag
      kostet also genau, was man einzahlt. (Bei 50.000 waeren es schon 75 EUR
      im Jahr darueber — das prueft der Test weiter unten.)
    */
    const b = check({ zveHeute: 35_000, avdEigenbeitragJahr: 0 });
    expect(b.probeMonat).toBeCloseTo(150, 6);
    expect(b.ersparnisJahr).toBeCloseTo(840, 6);        // 540 Grund + 300 Kind
    expect(b.nettoAufwandMonat).toBeCloseTo(b.probeMonat, 6);
  });

  it('weist aus, was im Depot ankommt: Beitrag PLUS Zulage', () => {
    const b = check({ avdEigenbeitragJahr: 0 });
    expect(b.zuflussMonat).toBeCloseTo(150 + 70, 6);
    // Die Quote ist ein Aufschlag auf den Beitrag, kein Anteil daran.
    expect(b.foerderquote).toBeCloseTo(840 / 1800, 6);
  });

  it('mindert ihn nur um den Steuervorteil UEBER die Zulage — wie der TUEV', () => {
    for (const zveHeute of [50_000, 80_000, 200_000]) {
      const b = check({ zveHeute, avdEigenbeitragJahr: 0 });
      const v = avdSteuervorteil(
        { eigenbeitragJahr: 1_800, zulagenJahr: 840, zveHeute }, steuerOpt, p2027,
      );
      expect(v.ueberZulagen).toBeGreaterThan(0);
      expect(b.nettoAufwandMonat).toBeCloseTo(v.eigenaufwandNetto / 12, 6);
      // Niemals wieder „Beitrag minus Zulage":
      expect(b.nettoAufwandMonat).toBeGreaterThan(b.probeMonat - b.ersparnisJahr / 12);
    }
  });

  it('gilt auch vor dem Startjahr', () => {
    const b = foerdercheck({ ...angestellt, zveHeute: 35_000, jahr: 2026, kinder: kind }, steuerOpt, p)
      .find((x) => x.id === 'avd')!;
    expect(b.nettoAufwandMonat).toBeCloseTo(b.probeMonat, 6);
    expect(b.zuflussMonat).toBeCloseTo(b.probeMonat + b.ersparnisJahr / 12, 6);
  });
});
