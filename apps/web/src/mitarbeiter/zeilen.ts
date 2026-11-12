import type { MitarbeiterBav, MitarbeiterVertrag } from '@renten/engine';
import type { BeratungAngaben, BeratungDaten, FirmenAngebot } from '@renten/schema';
import type { Unterlagen } from '../lib/bav-beratung';
import { euro, euroGenau, prozent } from '../components/Feld';
import { alterAm } from '../features/daten-ergebnis';
import { KLASSE_ROEMISCH, regelText, traegerText, vertragName } from './texte';
import { zeitpunktText } from './unterschrift-daten';
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
 */
export interface ZeilenText {
  ergebnis?: string;
  fehlt?: string;
}

const fehlen = (was: string[]) => (was.length === 0 ? undefined : `${was.join(' und ')} ${was.length > 1 ? 'fehlen' : 'fehlt'}`);

/* --- 1. Angebot ------------------------------------------------------------ */

/** Welche Vertraege das Angebot der Firma kennt — im Matching-Modell bis zu zwei. */
export function angebotVertraege(a: FirmenAngebot): MitarbeiterVertrag['weg'][] {
  if (a.modell.art !== 'matching') return ['direkt'];
  return a.modell.weg === 'dv' ? ['direkt', 'ukasse'] : ['ukasse'];
}

/** Die Regel der Firma — der Satz aus dem Angebot, ohne Punkt. */
export const angebotSatz = (a: FirmenAngebot) => regelText(a.modell).replace(/\.$/, '');

/** „Direktversicherung — Musterleben, Tarif Klassik“; ohne Eintrag nur der Weg. */
export function anbieterSatz(a: FirmenAngebot): string {
  return angebotVertraege(a)
    .map((w) => [vertragName(w, a), traegerText(w, a)].filter(Boolean).join(' — '))
    .join(' · ');
}

/* --- 2. Angaben ------------------------------------------------------------ */

function werUndAlter(a: BeratungAngaben, heute: Date): string {
  const name = a.name.trim();
  const alter = alterAm(a.geburtsdatum, heute);
  if (name && alter !== null) return `${name}, ${alter}`;
  if (name) return name;
  return alter !== null ? `${alter} Jahre` : '';
}

const personFehlt = (a: BeratungAngaben, heute: Date) => [
  a.name.trim() ? '' : 'Name',
  alterAm(a.geburtsdatum, heute) === null ? 'Geburtsdatum' : '',
].filter(Boolean);

export function personZeile(a: BeratungAngaben, heute: Date): ZeilenText {
  const beginn = rentenbeginnVon(a);
  return {
    ergebnis: [werUndAlter(a, heute), beginn ? `Rentenbeginn ${beginn}` : ''].filter(Boolean).join(' · ') || undefined,
    fehlt: fehlen(personFehlt(a, heute)),
  };
}

export function einkommenZeile(a: BeratungAngaben): ZeilenText {
  if (a.jahresbrutto <= 0) return { fehlt: 'Bruttogehalt fehlt' };
  const kinder = a.kinder.length;
  return {
    ergebnis: [
      `${euro(monatsgehalt(a))} brutto im Monat`,
      `Steuerklasse ${KLASSE_ROEMISCH[a.steuerklasse]}`,
      kinder === 1 ? '1 Kind' : kinder > 1 ? `${kinder} Kinder` : '',
    ].filter(Boolean).join(' · '),
  };
}

export function kvZeile(a: BeratungAngaben): ZeilenText {
  if (a.kv === 'privat') {
    return { ergebnis: a.pkvPraemieMonat > 0 ? `privat · ${euro(a.pkvPraemieMonat)} im Monat` : 'privat' };
  }
  return { ergebnis: ['gesetzlich', a.krankenkasse, `${prozent(a.zusatzbeitrag, 2)} Zusatzbeitrag`].filter(Boolean).join(' · ') };
}

export function vorsorgeZeile(a: BeratungAngaben): ZeilenText {
  return {
    ergebnis: a.bavBestandMonat > 0
      ? `Bestehende Betriebsrente ${euro(a.bavBestandMonat)} im Monat`
      : 'Keine bestehende Betriebsrente',
  };
}

/** Der ganze Schritt: wer, und mit welchem Gehalt — was die Rechnung braucht, steht als fehlend da. */
export function angabenZeile(a: BeratungAngaben, heute: Date): ZeilenText {
  return {
    ergebnis: [werUndAlter(a, heute), a.jahresbrutto > 0 ? `${euro(monatsgehalt(a))} brutto im Monat` : '']
      .filter(Boolean).join(' · ') || undefined,
    fehlt: fehlen([...personFehlt(a, heute), a.jahresbrutto > 0 ? '' : 'Bruttogehalt'].filter(Boolean)),
  };
}

/* --- 3. Versorgungsluecke -------------------------------------------------- */

/** Ohne Rechnung (es fehlen Geburtsdatum oder Gehalt) steht nichts da. */
export function lueckeZeile(l: Versorgungsluecke | null): ZeilenText {
  if (!l) return {};
  return {
    ergebnis: l.lueckeMonat < 0.5
      ? `Rentenziel von ${l.zielProzent} % erreicht`
      : `Lücke ${euro(l.lueckeMonat)} im Monat · ${l.lueckeProzent} % des Nettolohns`,
  };
}

/** Die gesetzliche Rente, mit der gerechnet wird — eingetragen oder aus dem Gehalt geschaetzt. */
export function grvZeile(a: BeratungAngaben, schaetzungMonat: number): ZeilenText {
  return {
    ergebnis: a.grvRente > 0
      ? `Gesetzliche Rente ${euro(a.grvRente)} im Monat, eingetragen`
      : `Gesetzliche Rente ${euro(schaetzungMonat)} im Monat, geschätzt`,
  };
}

/* --- 4. Rechnung ------------------------------------------------------------ */

export function rechnungZeile(r: MitarbeiterBav): ZeilenText {
  if (r.umwandlungMonat <= 0.005) return { fehlt: 'Noch kein Betrag gewählt' };
  return { ergebnis: `${euro(r.nettoAufwandMonat)} netto im Monat · ${euroGenau(r.gesamtMonat)} in Ihre Vorsorge` };
}

export function abrechnungZeile(a: Probeabrechnung): ZeilenText {
  return { ergebnis: `Netto ${euroGenau(a.netto.mit)} statt ${euroGenau(a.netto.ohne)}` };
}

export function hochrechnungZeile(h: Hochrechnung): ZeilenText {
  return { ergebnis: `Kapital ${euro(h.kapital)} · Rente ${euro(h.renteMonat)} im Monat, geschätzt` };
}

export function spaeterZeile(einJahr: SpaeterZeile): ZeilenText {
  return { ergebnis: `Ein Jahr warten kostet ${euro(einJahr.wenigerKapital)} Kapital` };
}

/* --- 5. Leistung im Alter -------------------------------------------------- */

const FEHLENDE_WERTE = 'Werte aus dem Angebot fehlen';

/** Ein Vertrag: was netto bleibt — die Prognose, sonst die garantierte Rente, sonst das Kapital. */
export function vertragZeile(l: VertragsLeistung | null, ausHochrechnung: boolean): ZeilenText {
  if (l?.prognose) {
    return { ergebnis: `${euro(l.prognose.nettoMonat)} netto im Monat, ${ausHochrechnung ? 'Prognose geschätzt' : 'Prognose'}` };
  }
  if (l?.garantiert) return { ergebnis: `${euro(l.garantiert.nettoMonat)} netto im Monat, garantiert` };
  if (l?.kapital) return { ergebnis: `${euro(l.kapital.netto)} Kapital netto` };
  return { fehlt: FEHLENDE_WERTE };
}

export function lueckeMitZeile(x: LueckeMitBetriebsrente): ZeilenText {
  const haupt = x.prognose ?? x.garantiert;
  if (!haupt) return {};
  return { ergebnis: haupt.anteil >= 1 ? 'Schließt die Versorgungslücke ganz' : `Schließt ${haupt.prozent} % der Versorgungslücke` };
}

const zahl = (x: number) => x.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function kennzahlenZeile(k: KennzahlenErgebnis): ZeilenText {
  const haupt = k.prognose ?? k.garantiert ?? k.kapital;
  if (!haupt) return {};
  return { ergebnis: `Nettorendite ${zahl(haupt.rendite * 100)} % · Netto-Hebel ${zahl(haupt.nettoHebel)} ×` };
}

/**
 * Der ganze Schritt: die Netto-Rente aller Vertraege zusammen. Stammt eine
 * Prognose aus der geschaetzten Hochrechnung, sagt es auch diese Zeile —
 * wie ueberall, wo der Wert steht.
 */
export function leistungZeile(leistung: Leistung | null, r: MitarbeiterBav, d: BeratungDaten): ZeilenText {
  if (r.vertraege.length === 0) return { fehlt: 'Ohne Umwandlung kein Vertrag' };
  const renten = (leistung?.vertraege ?? []).map((v) => v.prognose ?? v.garantiert)
    .filter((w): w is NonNullable<typeof w> => w !== null);
  if (renten.length > 0) {
    const allePrognose = (leistung?.vertraege ?? []).every((v) => v.prognose !== null);
    const geschaetzt = r.vertraege.some((v) => d.versicherer[v.weg].ausHochrechnung);
    const summe = renten.reduce((s, w) => s + w.nettoMonat, 0);
    return {
      ergebnis: `Betriebsrente ${euro(summe)} netto im Monat${allePrognose ? (geschaetzt ? ', Prognose geschätzt' : ', Prognose') : ''}`,
    };
  }
  const kapital = (leistung?.vertraege ?? []).reduce((s, v) => s + (v.kapital?.netto ?? 0), 0);
  return kapital > 0 ? { ergebnis: `${euro(kapital)} Kapital netto` } : { fehlt: FEHLENDE_WERTE };
}

/* --- 6. Entscheidung -------------------------------------------------------- */

/** @param autoBeginn Der vorbelegte Beginn — gilt, solange keiner eingetragen ist */
export function entscheidungZeile(d: BeratungDaten, r: MitarbeiterBav, autoBeginn: string): ZeilenText {
  const e = d.entscheidung;
  if (e.status === 'teilnahme') {
    return { ergebnis: `Teilnahme · ${euroGenau(r.umwandlungMonat)} im Monat ab ${e.beginn || autoBeginn}` };
  }
  return { ergebnis: e.status === 'verzicht' ? 'Verzicht' : 'Noch offen' };
}

/** @param fehlend Was fuer AXA-Antrag oder -Protokoll noch fehlt (`axaFehlt`) */
export function axaZeile(fehlend: readonly string[]): ZeilenText {
  if (fehlend.length === 0) return { ergebnis: 'Vollständig' };
  return { fehlt: fehlend.length === 1 ? '1 Angabe fehlt' : `${fehlend.length} Angaben fehlen` };
}

export function ortZeile(e: BeratungDaten['entscheidung']): ZeilenText {
  const ort = e.ort.trim();
  return {
    ergebnis: [ort, e.datum].filter(Boolean).join(', ') || undefined,
    fehlt: ort ? undefined : 'Ort fehlt',
  };
}

/* --- 7. Unterlagen ---------------------------------------------------------- */

export function unterlagenZeile(unterlagen: Unterlagen | null | 'fehler'): ZeilenText {
  return {
    ergebnis: unterlagen && unterlagen !== 'fehler'
      ? `Unterschrieben am ${zeitpunktText(unterlagen.erstelltAm)}`
      : 'Noch nicht unterschrieben',
  };
}
