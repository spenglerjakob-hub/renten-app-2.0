import type { MitarbeiterBav, MitarbeiterVertrag } from '@renten/engine';
import type { BeratungAngaben, BeratungDaten, FirmenAngebot } from '@renten/schema';
import type { Unterlagen } from '../lib/bav-beratung';
import { euro, euroGenau, prozent } from '../components/Feld';
import { alterAm } from '../features/daten-ergebnis';
import { KLASSE_ROEMISCH, regelText, traegerText, vertragName } from './texte';
import { zeitpunktText } from './unterschrift-daten';
import { wahl, type Sprache } from '../lib/sprache';
import {
  monatsgehalt, rentenbeginnVon,
  type Hochrechnung, type KennzahlenErgebnis, type Leistung, type LueckeMitBetriebsrente, type Probeabrechnung,
  type SpaeterZeile, type Versorgungsluecke, type VertragsLeistung,
} from './rechnung';

/**
 * WAS IN DEN ZEILEN DER MITARBEITERBERATUNG STEHT — fuer die Schritte und fuer
 * die Stuecke darin (`components/Ablauf.tsx`).
 *
 * Eine Zeile sagt, was eingetragen oder gerechnet ist, nicht dass etwas da
 * ist: „Lücke 612 € im Monat“ laesst sich mit einem Blick pruefen, ein Haken
 * nicht. Fehlt etwas, das die Beratung braucht, steht es als `fehlt` da —
 * dann traegt die Zeile den leeren Kreis statt des Hakens.
 *
 * SPRACHE: Jede Zeile gibt es auf Deutsch und auf Englisch (`s`, zuletzt und
 * mit Deutsch als Vorgabe). Was der BERATER liest — die Mitarbeiterliste,
 * der Kopf der Beratung, das Fenster „Gespräch starten“ — ruft ohne Sprache.
 */
export interface ZeilenText {
  ergebnis?: string;
  fehlt?: string;
}

/** „Bruttogehalt fehlt“, „Name und Geburtsdatum fehlen“, „Name, Geburtsdatum und Bruttogehalt fehlen“. */
const fehlen = (was: string[], s: Sprache = 'de') => {
  if (was.length === 0) return undefined;
  if (s === 'en') return was.length === 1 ? `${was[0]} missing` : `${was.slice(0, -1).join(', ')} and ${was[was.length - 1]} missing`;
  if (was.length === 1) return `${was[0]} fehlt`;
  return `${was.slice(0, -1).join(', ')} und ${was[was.length - 1]} fehlen`;
};

/* --- 1. Angebot ------------------------------------------------------------ */

/** Welche Vertraege das Angebot der Firma kennt — im Matching-Modell bis zu zwei. */
export function angebotVertraege(a: FirmenAngebot): MitarbeiterVertrag['weg'][] {
  if (a.modell.art !== 'matching') return ['direkt'];
  return a.modell.weg === 'dv' ? ['direkt', 'ukasse'] : ['ukasse'];
}

/** Die Regel der Firma — der Satz aus dem Angebot, ohne Punkt. */
export const angebotSatz = (a: FirmenAngebot, s: Sprache = 'de') => regelText(a.modell, s).replace(/\.$/, '');

/** „Direktversicherung — Musterleben, Tarif Klassik“; ohne Eintrag nur der Weg. */
export function anbieterSatz(a: FirmenAngebot, s: Sprache = 'de'): string {
  return angebotVertraege(a)
    .map((v) => [vertragName(v, a, s), traegerText(v, a, s)].filter(Boolean).join(' — '))
    .join(' · ');
}

/* --- 2. Angaben ------------------------------------------------------------ */

function werUndAlter(a: BeratungAngaben, heute: Date, s: Sprache = 'de'): string {
  const name = a.name.trim();
  const alter = alterAm(a.geburtsdatum, heute);
  if (name && alter !== null) return `${name}, ${alter}`;
  if (name) return name;
  return alter !== null ? wahl(s)(`${alter} Jahre`, `${alter} years old`) : '';
}

const personFehlt = (a: BeratungAngaben, heute: Date, s: Sprache = 'de') => [
  a.name.trim() ? '' : 'Name',
  alterAm(a.geburtsdatum, heute) === null ? wahl(s)('Geburtsdatum', 'Date of birth') : '',
].filter(Boolean);

export function personZeile(a: BeratungAngaben, heute: Date, s: Sprache = 'de'): ZeilenText {
  const beginn = rentenbeginnVon(a);
  return {
    ergebnis: [werUndAlter(a, heute, s), beginn ? wahl(s)(`Rentenbeginn ${beginn}`, `Retirement on ${beginn}`) : '']
      .filter(Boolean).join(' · ') || undefined,
    fehlt: fehlen(personFehlt(a, heute, s), s),
  };
}

export function einkommenZeile(a: BeratungAngaben, s: Sprache = 'de'): ZeilenText {
  const w = wahl(s);
  if (a.jahresbrutto <= 0) return { fehlt: w('Bruttogehalt fehlt', 'Gross salary missing') };
  const kinder = a.kinder.length;
  return {
    ergebnis: [
      w(`${euro(monatsgehalt(a))} brutto im Monat`, `${euro(monatsgehalt(a))} gross a month`),
      w(`Steuerklasse ${KLASSE_ROEMISCH[a.steuerklasse]}`, `Tax class ${KLASSE_ROEMISCH[a.steuerklasse]}`),
      kinder === 1 ? w('1 Kind', '1 child') : kinder > 1 ? w(`${kinder} Kinder`, `${kinder} children`) : '',
    ].filter(Boolean).join(' · '),
  };
}

export function kvZeile(a: BeratungAngaben, s: Sprache = 'de'): ZeilenText {
  const w = wahl(s);
  if (a.kv === 'privat') {
    return {
      ergebnis: a.pkvPraemieMonat > 0
        ? w(`privat · ${euro(a.pkvPraemieMonat)} im Monat`, `private · ${euro(a.pkvPraemieMonat)} a month`)
        : w('privat', 'private'),
    };
  }
  return {
    ergebnis: [
      w('gesetzlich', 'statutory'), a.krankenkasse,
      w(`${prozent(a.zusatzbeitrag, 2)} Zusatzbeitrag`, `${prozent(a.zusatzbeitrag, 2)} additional contribution`),
    ].filter(Boolean).join(' · '),
  };
}

/**
 * Einkommen, Steuer und Krankenversicherung stehen in EINEM Stueck — seine
 * Zeile nennt das Einkommen und dahinter nur, wie jemand versichert ist. Die
 * Kasse und ihr Satz stuenden sonst als vierte und fuenfte Angabe in der Zeile.
 */
export function einkommenUndKvZeile(a: BeratungAngaben, s: Sprache = 'de'): ZeilenText {
  const w = wahl(s);
  const e = einkommenZeile(a, s);
  if (!e.ergebnis) return e;
  return {
    ergebnis: `${e.ergebnis} · ${a.kv === 'privat'
      ? w('privat versichert', 'privately insured') : w('gesetzlich versichert', 'statutory health insurance')}`,
  };
}

export function vorsorgeZeile(a: BeratungAngaben, s: Sprache = 'de'): ZeilenText {
  const w = wahl(s);
  return {
    ergebnis: a.bavBestandMonat > 0
      ? w(`Bestehende Betriebsrente ${euro(a.bavBestandMonat)} im Monat`, `Existing company pension ${euro(a.bavBestandMonat)} a month`)
      : w('Keine bestehende Betriebsrente', 'No existing company pension'),
  };
}

/** Der ganze Schritt: wer, und mit welchem Gehalt — was die Rechnung braucht, steht als fehlend da. */
export function angabenZeile(a: BeratungAngaben, heute: Date, s: Sprache = 'de'): ZeilenText {
  const w = wahl(s);
  return {
    ergebnis: [
      werUndAlter(a, heute, s),
      a.jahresbrutto > 0 ? w(`${euro(monatsgehalt(a))} brutto im Monat`, `${euro(monatsgehalt(a))} gross a month`) : '',
    ].filter(Boolean).join(' · ') || undefined,
    fehlt: fehlen([...personFehlt(a, heute, s), a.jahresbrutto > 0 ? '' : w('Bruttogehalt', 'Gross salary')].filter(Boolean), s),
  };
}

/**
 * WIE WEIT DIE VORBEREITUNG IST — fuer die Mitarbeiterliste der Firma und
 * den Kopf der Beratung. Wer dreissig Gespraeche vorbereitet, soll in der
 * Liste sehen, welche fertig sind und wo noch etwas fehlt.
 *
 * VORBEREITET ist eine Beratung, sobald die Rechnung laufen kann: Name,
 * Geburtsdatum und Bruttogehalt stehen da (`angabenZeile`). Das ist
 * abgeleitet, kein Haken zum Setzen — ein Haken liesse sich vergessen, und
 * er bliebe stehen, wenn jemand das Gehalt wieder loescht. Alles andere
 * (Steuerklasse, Krankenkasse, der Betrag) hat eine Vorgabe oder entsteht
 * im Gespraech.
 *
 * Nur fuer OFFENE Beratungen: Mit der Entscheidung ist die Vorbereitung
 * Geschichte — dann sagt der Status, was gilt.
 */
export type Vorbereitung =
  /** Es fehlt noch etwas — `text` nennt es („Geburtsdatum und Bruttogehalt fehlen“) */
  | { art: 'fehlt'; text: string }
  | { art: 'vorbereitet' }
  /** „Gespräch starten“ ist gedrueckt, entschieden ist noch nicht */
  | { art: 'gespraech' };

export function vorbereitungStand(d: BeratungDaten, heute: Date): Vorbereitung | null {
  if (d.entscheidung.status !== 'offen') return null;
  if (d.gespraech.aktiv) return { art: 'gespraech' };
  const fehlt = angabenZeile(d.angaben, heute).fehlt;
  return fehlt ? { art: 'fehlt', text: fehlt } : { art: 'vorbereitet' };
}

/** Wie viele der offenen Beratungen vorbereitet sind — ein laufendes Gespraech zaehlt dazu. */
export function vorbereitetZaehlen(staende: readonly (Vorbereitung | null)[]): { offen: number; vorbereitet: number } {
  const offene = staende.filter((s): s is Vorbereitung => s !== null);
  return { offen: offene.length, vorbereitet: offene.filter((s) => s.art !== 'fehlt').length };
}

/* --- 3. Versorgungsluecke -------------------------------------------------- */

/** Ohne Rechnung (es fehlen Geburtsdatum oder Gehalt) steht nichts da. */
export function lueckeZeile(l: Versorgungsluecke | null, s: Sprache = 'de'): ZeilenText {
  if (!l) return {};
  const w = wahl(s);
  return {
    ergebnis: l.lueckeMonat < 0.5
      ? w(`Rentenziel von ${l.zielProzent} % erreicht`, `Pension target of ${l.zielProzent} % reached`)
      : w(`Lücke ${euro(l.lueckeMonat)} im Monat · ${l.lueckeProzent} % des Nettolohns`,
        `Gap of ${euro(l.lueckeMonat)} a month · ${l.lueckeProzent} % of net pay`),
  };
}

/** Die gesetzliche Rente, mit der gerechnet wird — eingetragen oder aus dem Gehalt geschaetzt. */
export function grvZeile(a: BeratungAngaben, schaetzungMonat: number, s: Sprache = 'de'): ZeilenText {
  const w = wahl(s);
  return {
    ergebnis: a.grvRente > 0
      ? w(`Gesetzliche Rente ${euro(a.grvRente)} im Monat, eingetragen`, `Statutory pension ${euro(a.grvRente)} a month, entered`)
      : w(`Gesetzliche Rente ${euro(schaetzungMonat)} im Monat, geschätzt`, `Statutory pension ${euro(schaetzungMonat)} a month, estimated`),
  };
}

/* --- 4. Rechnung ------------------------------------------------------------ */

export function rechnungZeile(r: MitarbeiterBav, s: Sprache = 'de'): ZeilenText {
  const w = wahl(s);
  if (r.umwandlungMonat <= 0.005) return { fehlt: w('Noch kein Betrag gewählt', 'No amount chosen yet') };
  return {
    ergebnis: w(`${euro(r.nettoAufwandMonat)} netto im Monat · ${euroGenau(r.gesamtMonat)} in Ihre Vorsorge`,
      `${euro(r.nettoAufwandMonat)} net a month · ${euroGenau(r.gesamtMonat)} into your pension`),
  };
}

export function abrechnungZeile(a: Probeabrechnung, s: Sprache = 'de'): ZeilenText {
  return {
    ergebnis: wahl(s)(`Netto ${euroGenau(a.netto.mit)} statt ${euroGenau(a.netto.ohne)}`,
      `Net pay ${euroGenau(a.netto.mit)} instead of ${euroGenau(a.netto.ohne)}`),
  };
}

/**
 * Das Stueck „Ihr Beitrag“: der Betrag und — seit die Hochrechnung dort
 * steht — was daraus werden kann. Ohne Laufzeit bis zum Rentenbeginn gibt es
 * keine Hochrechnung; dann bleibt es beim Betrag.
 */
export function beitragZeile(r: MitarbeiterBav, h: Hochrechnung, s: Sprache = 'de'): ZeilenText {
  const z = rechnungZeile(r, s);
  if (!z.ergebnis || h.monate <= 0) return z;
  return { ergebnis: wahl(s)(`${z.ergebnis} · geschätzt ${euro(h.kapital)} Kapital`, `${z.ergebnis} · an estimated ${euro(h.kapital)} in capital`) };
}

export function spaeterZeile(einJahr: SpaeterZeile, s: Sprache = 'de'): ZeilenText {
  return {
    ergebnis: wahl(s)(`Ein Jahr warten kostet ${euro(einJahr.wenigerKapital)} Kapital`,
      `Waiting one year costs ${euro(einJahr.wenigerKapital)} in capital`),
  };
}

/* --- 5. Leistung im Alter -------------------------------------------------- */

const fehlendeWerte = (s: Sprache) => wahl(s)('Werte aus dem Angebot fehlen', 'Figures from the offer missing');

/** Ein Vertrag: was netto bleibt — die Prognose, sonst die garantierte Rente, sonst das Kapital. */
export function vertragZeile(l: VertragsLeistung | null, ausHochrechnung: boolean, s: Sprache = 'de'): ZeilenText {
  const w = wahl(s);
  if (l?.prognose) {
    return {
      ergebnis: w(`${euro(l.prognose.nettoMonat)} netto im Monat, ${ausHochrechnung ? 'Prognose geschätzt' : 'Prognose'}`,
        `${euro(l.prognose.nettoMonat)} net a month, ${ausHochrechnung ? 'estimated projection' : 'projection'}`),
    };
  }
  if (l?.garantiert) {
    return { ergebnis: w(`${euro(l.garantiert.nettoMonat)} netto im Monat, garantiert`, `${euro(l.garantiert.nettoMonat)} net a month, guaranteed`) };
  }
  if (l?.kapital) return { ergebnis: w(`${euro(l.kapital.netto)} Kapital netto`, `${euro(l.kapital.netto)} lump sum, net`) };
  return { fehlt: fehlendeWerte(s) };
}

export function lueckeMitZeile(x: LueckeMitBetriebsrente, s: Sprache = 'de'): ZeilenText {
  const haupt = x.prognose ?? x.garantiert;
  if (!haupt) return {};
  const w = wahl(s);
  return {
    ergebnis: haupt.anteil >= 1
      ? w('Schließt die Versorgungslücke ganz', 'Closes the pension gap completely')
      : w(`Schließt ${haupt.prozent} % der Versorgungslücke`, `Closes ${haupt.prozent} % of the pension gap`),
  };
}

const zahl = (x: number) => x.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function kennzahlenZeile(k: KennzahlenErgebnis, s: Sprache = 'de'): ZeilenText {
  const haupt = k.prognose ?? k.garantiert ?? k.kapital;
  if (!haupt) return {};
  return {
    ergebnis: wahl(s)(`Nettorendite ${zahl(haupt.rendite * 100)} % · Netto-Hebel ${zahl(haupt.nettoHebel)} ×`,
      `Net return ${zahl(haupt.rendite * 100)} % · net leverage ${zahl(haupt.nettoHebel)} ×`),
  };
}

/**
 * Der ganze Schritt: die Netto-Rente aller Vertraege zusammen. Stammt eine
 * Prognose aus der geschaetzten Hochrechnung, sagt es auch diese Zeile —
 * wie ueberall, wo der Wert steht.
 */
export function leistungZeile(leistung: Leistung | null, r: MitarbeiterBav, d: BeratungDaten, s: Sprache = 'de'): ZeilenText {
  const w = wahl(s);
  if (r.vertraege.length === 0) return { fehlt: w('Ohne Umwandlung kein Vertrag', 'No contract without a conversion') };
  const renten = (leistung?.vertraege ?? []).map((v) => v.prognose ?? v.garantiert)
    .filter((w): w is NonNullable<typeof w> => w !== null);
  if (renten.length > 0) {
    const allePrognose = (leistung?.vertraege ?? []).every((v) => v.prognose !== null);
    const geschaetzt = r.vertraege.some((v) => d.versicherer[v.weg].ausHochrechnung);
    const summe = renten.reduce((x, rente) => x + rente.nettoMonat, 0);
    return {
      ergebnis: w(
        `Betriebsrente ${euro(summe)} netto im Monat${allePrognose ? (geschaetzt ? ', Prognose geschätzt' : ', Prognose') : ''}`,
        `Company pension ${euro(summe)} net a month${allePrognose ? (geschaetzt ? ', estimated projection' : ', projection') : ''}`,
      ),
    };
  }
  const kapital = (leistung?.vertraege ?? []).reduce((summe, v) => summe + (v.kapital?.netto ?? 0), 0);
  return kapital > 0
    ? { ergebnis: w(`${euro(kapital)} Kapital netto`, `${euro(kapital)} lump sum, net`) }
    : { fehlt: fehlendeWerte(s) };
}

/* --- 6. Entscheidung -------------------------------------------------------- */

/** @param autoBeginn Der vorbelegte Beginn — gilt, solange keiner eingetragen ist */
export function entscheidungZeile(d: BeratungDaten, r: MitarbeiterBav, autoBeginn: string, s: Sprache = 'de'): ZeilenText {
  const w = wahl(s);
  const e = d.entscheidung;
  if (e.status === 'teilnahme') {
    return {
      ergebnis: w(`Teilnahme · ${euroGenau(r.umwandlungMonat)} im Monat ab ${e.beginn || autoBeginn}`,
        `Taking part · ${euroGenau(r.umwandlungMonat)} a month from ${e.beginn || autoBeginn}`),
    };
  }
  return { ergebnis: e.status === 'verzicht' ? w('Verzicht', 'Waiver') : w('Noch offen', 'Still open') };
}

/** @param fehlend Was fuer AXA-Antrag oder -Protokoll noch fehlt (`axaFehlt`) */
export function axaZeile(fehlend: readonly string[], s: Sprache = 'de'): ZeilenText {
  const w = wahl(s);
  if (fehlend.length === 0) return { ergebnis: w('Vollständig', 'Complete') };
  return {
    fehlt: fehlend.length === 1 ? w('1 Angabe fehlt', '1 detail missing')
      : w(`${fehlend.length} Angaben fehlen`, `${fehlend.length} details missing`),
  };
}

export function ortZeile(e: BeratungDaten['entscheidung'], s: Sprache = 'de'): ZeilenText {
  const ort = e.ort.trim();
  return {
    ergebnis: [ort, e.datum].filter(Boolean).join(', ') || undefined,
    fehlt: ort ? undefined : wahl(s)('Ort fehlt', 'Place missing'),
  };
}

/* --- 7. Unterlagen ---------------------------------------------------------- */

export function unterlagenZeile(unterlagen: Unterlagen | null | 'fehler', s: Sprache = 'de'): ZeilenText {
  const w = wahl(s);
  return {
    ergebnis: unterlagen && unterlagen !== 'fehler'
      ? w(`Unterschrieben am ${zeitpunktText(unterlagen.erstelltAm)}`, `Signed on ${zeitpunktText(unterlagen.erstelltAm, 'en')}`)
      : w('Noch nicht unterschrieben', 'Not yet signed'),
  };
}
