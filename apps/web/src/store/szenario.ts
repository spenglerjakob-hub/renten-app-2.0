import { create } from 'zustand';
import {
  importiere, exportiere, annahmenKoppeln, einkommenHeuteSchema, type SzenarioParsed,
} from '@renten/schema';
import { parseDatum, toDe, regelaltersrentenbeginn, regelaltersgrenze } from '@renten/engine';
import type { Szenario, Vertrag, Person, AvdKind } from '@renten/engine';
import { standardSzenario } from './standard';
import { geprueft, offenePfade, pfadeAus, wiederOffen } from '../features/vorbelegung';

const SPEICHER_SCHLUESSEL = 'rentenplaner.szenario.v1';

export type Angebot = SzenarioParsed['loesungen']['angebote'][number];

/**
 * Erstes Jahr des Altersvorsorgedepots. Steht hier nur, um den Beginn eines
 * neuen TUEV-Eintrags sinnvoll vorzubelegen; gerechnet wird ausschliesslich
 * mit dem Parameter aus dem Rechtsstand.
 */
const AVD_AB_JAHR = 2027;

function ladeGespeichert(): SzenarioParsed {
  if (typeof localStorage === 'undefined') return standardSzenario();
  const roh = localStorage.getItem(SPEICHER_SCHLUESSEL);
  if (!roh) return standardSzenario();
  const r = importiere(roh);
  return r.ok ? r.szenario : standardSzenario();
}

export interface SzenarioStore {
  szenario: SzenarioParsed;
  importMeldung: { art: 'ok' | 'fehler'; texte: string[] } | null;

  setze: (fn: (s: SzenarioParsed) => SzenarioParsed) => void;
  setzeHaushalt: (p: Partial<SzenarioParsed['haushalt']>) => void;
  /**
   * Anzahl der Kinder setzen und die Liste daran angleichen.
   *
   * Zieht `kinderUnter25` und `hatKinder` mit: die ANZAHL steuert
   * Pflegeversicherung und Kinderfreibetrag, die JAHRGAENGE die Kinderzulage.
   * Beides sind Aussagen ueber dieselben Kinder und muessen zusammenpassen.
   * Als Aktion im Store und nicht in der Oberflaeche, weil es DREI Stellen
   * gibt, an denen Kinder erfasst werden — dieselbe Logik dreimal kopiert
   * laeuft sicher auseinander.
   */
  setzeKinderAnzahl: (n: number) => void;
  /**
   * Den Zielanteil EINER Person setzen — und das Haushaltsziel als Summe.
   *
   * Bei Paaren sind die beiden Anteile die Eingabe, das Haushaltsziel ist
   * ihr Ergebnis. Als Aktion im Store und nicht in der Oberflaeche, aus dem
   * gleichen Grund wie bei `setzeKinderAnzahl`: Es sind zwei Felder, die
   * zusammenpassen muessen, und eine kopierte Regel laeuft auseinander.
   *
   * Festgeschrieben wird dabei AUCH der nicht angefasste Anteil. Bliebe er
   * offen, zeigte die Oberflaeche fuer ihn die halbe Haushaltssumme — und die
   * aendert sich ja gerade. Beim Tippen in das eine Feld spraenge der Wert im
   * anderen.
   */
  setzeZielAnteil: (id: 'A' | 'B', betrag: number) => void;
  setzeKind: (index: number, p: Partial<AvdKind>) => void;
  setzeAnnahmen: (p: Partial<SzenarioParsed['annahmen']>) => void;
  setzeEinkommen: (p: Partial<SzenarioParsed['einkommenHeute']>) => void;
  setzeEinkommenPartner: (p: Partial<SzenarioParsed['einkommenHeute']>) => void;
  setzeEinkommenGetrennt: (b: boolean) => void;
  setzePlaner: (p: Partial<SzenarioParsed['planer']>) => void;
  setzePerson: (id: 'A' | 'B', p: Partial<SzenarioParsed['personen'][number]>) => void;
  rentenbeginnZuruecksetzen: (id: 'A' | 'B') => void;
  partnerHinzufuegen: () => void;

  tuevHinzufuegen: (vertragId: string) => void;
  tuevAendern: (id: string, p: Partial<SzenarioParsed['tuev'][number]>) => void;
  tuevEntfernen: (id: string) => void;
  tuevKindHinzufuegen: (id: string) => void;
  tuevKindAendern: (id: string, kindId: string, geburtsjahr: number) => void;
  tuevKindEntfernen: (id: string, kindId: string) => void;

  setzeLoesungen: (p: Partial<Omit<SzenarioParsed['loesungen'], 'angebote'>>) => void;
  angebotHinzufuegen: (a: Omit<Angebot, 'id'>) => void;
  angebotAendern: (id: string, p: Partial<Angebot>) => void;
  angebotEntfernen: (id: string) => void;

  vertragHinzufuegen: (schicht: 1 | 2 | 3) => void;
  vertragAendern: (id: string, p: Partial<Vertrag>) => void;
  vertragEntfernen: (id: string) => void;

  /**
   * Eine vorbelegte Angabe als geprueft markieren, ohne sie zu aendern —
   * „Stimmt so“ am Feld, „Keine bestehenden Vertraege“ im Assistenten.
   * Siehe `features/vorbelegung.ts`.
   */
  pruefen: (pfad: string) => void;
  /** Das Ergebnis wurde angesehen — der letzte Schritt des Fortschritts. */
  ausgewertet: () => void;

  alsJsonExportieren: () => string;
  ausJsonImportieren: (roh: string) => void;
  /** Einen ganzen Fall uebernehmen — etwa den Musterfall aus der Schnellrechnung — mit Meldung. */
  uebernehmen: (s: SzenarioParsed, meldung: string) => void;
  zuruecksetzen: () => void;
}

/**
 * Rentenbeginn aus dem Geburtsdatum, als deutsches Datum.
 * Null, wenn das Geburtsdatum (noch) nicht lesbar ist.
 */
export function automatischerRentenbeginn(geburtsdatum: string): string | null {
  const g = parseDatum(geburtsdatum);
  return g ? toDe(regelaltersrentenbeginn(g)) : null;
}

/** Regelaltersgrenze als Text, fuer den Hinweis unter dem Feld. */
export function regelaltersgrenzeText(geburtsdatum: string): string | null {
  const g = parseDatum(geburtsdatum);
  if (!g) return null;
  const jahre = regelaltersgrenze(g.jahr);
  const volle = Math.floor(jahre + 1e-9);
  const monate = Math.round((jahre - volle) * 12);
  return monate === 0 ? `${volle} Jahre` : `${volle} Jahre und ${monate} Monate`;
}

function neueId(praefix: string) {
  return `${praefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function speichere(s: SzenarioParsed) {
  try { localStorage.setItem(SPEICHER_SCHLUESSEL, exportiere(s)); } catch { /* Speicher voll oder gesperrt */ }
}

export const useSzenario = create<SzenarioStore>((set, get) => ({
  szenario: ladeGespeichert(),
  importMeldung: null,

  setze: (fn) => set((st) => { const s = fn(st.szenario); speichere(s); return { szenario: s }; }),

  /*
    JEDER SETTER STREICHT, WAS ER BERUEHRT, aus `offen` (siehe
    `features/vorbelegung.ts`): Wer ein Feld anfasst, hat es geprueft — auch
    wenn er denselben Wert eintippt. Die Marke am Feld verschwindet damit.
  */
  setzeHaushalt: (p) => get().setze((s) => geprueft(
    { ...s, haushalt: { ...s.haushalt, ...p } },
    pfadeAus('haushalt', p),
  )),

  setzeKinderAnzahl: (n) => get().setze((s) => {
    const anzahl = Math.max(0, Math.min(15, Math.round(n)));
    // Vorhandene Kinder behalten, fehlende mit einem Vorschlag auffuellen —
    // sonst verliert man beim Vertippen alle eingetragenen Jahrgaenge.
    const kinder = Array.from(
      { length: anzahl },
      (_, i) => s.haushalt.kinder[i] ?? { geburtsjahr: new Date().getFullYear() - 5 },
    );
    return geprueft({
      ...s,
      haushalt: { ...s.haushalt, kinder, kinderUnter25: anzahl, hatKinder: anzahl > 0 },
    }, ['haushalt.kinderUnter25']);
  }),

  setzeZielAnteil: (id, betrag) => get().setze((s) => {
    const haelfte = s.haushalt.zielNettoHeute / 2;
    const anteile = new Map(s.personen.map((x) => [
      x.id,
      x.id === id ? Math.max(0, betrag) : (x.zielAnteilHeute ?? haelfte),
    ]));
    /*
      Nur die gerechneten Personen zaehlen. Person B bleibt beim Umschalten
      auf "Single" erhalten, wird aber nicht mitgerechnet — ihr Anteil darf
      das Haushaltsziel dann nicht anheben.
    */
    const gerechnet = s.personen.filter((x) => x.id === 'A' || s.haushalt.verheiratet);
    const summe = gerechnet.reduce((sum, x) => sum + (anteile.get(x.id) ?? 0), 0);
    return geprueft({
      ...s,
      haushalt: { ...s.haushalt, zielNettoHeute: summe },
      personen: s.personen.map((x) => ({ ...x, zielAnteilHeute: anteile.get(x.id) })),
    }, ['haushalt.zielNettoHeute']);
  }),

  setzeKind: (index, p) => get().setze((s) => ({
    ...s,
    haushalt: {
      ...s.haushalt,
      kinder: s.haushalt.kinder.map((k, i) => (i === index ? { ...k, ...p } : k)),
    },
  })),
  // Die Oberflaeche kennt nur Inflation und Rentendynamik; Gehaltsdynamik und
  // Steuertarif-Index folgen ihnen. Wird der Tarif-Index ausdruecklich gesetzt
  // (Regler in der Rechtsstand-Karte), bleibt er davon unberuehrt.
  setzeAnnahmen: (p) => get().setze((s) => geprueft(annahmenKoppeln(
    { ...s, annahmen: { ...s.annahmen, ...p } },
    { tarifIndexBehalten: p.tarifIndex !== undefined },
  ), pfadeAus('annahmen', p))),
  setzeEinkommen: (p) => get().setze((s) => geprueft(
    { ...s, einkommenHeute: { ...s.einkommenHeute, ...p } },
    pfadeAus('einkommenHeute', p),
  )),
  setzeEinkommenPartner: (p) => get().setze((s) => geprueft(
    { ...s, einkommenPartner: { ...s.einkommenPartner, ...p } },
    pfadeAus('einkommenPartner', p),
  )),
  setzeEinkommenGetrennt: (b) => get().setze((s) => {
    const neu = { ...s, einkommenGetrennt: b };
    /*
      Das Einkommen des Partners steht beim ersten Einschalten noch auf der
      Vorgabe des Schemas — ein Beispielwert wie jeder andere. Wer es schon
      einmal eingetragen hat, behaelt es ohne Marke.
    */
    const unberuehrt = JSON.stringify(s.einkommenPartner) === JSON.stringify(einkommenHeuteSchema.parse({}));
    return b && unberuehrt ? wiederOffen(neu, ['einkommenPartner.betrag']) : neu;
  }),
  setzePlaner: (p) => get().setze((s) => ({ ...s, planer: { ...s.planer, ...p } })),

  setzePerson: (id, p) => get().setze((s) => geprueft({
    ...s,
    personen: s.personen.map((x) => {
      if (x.id !== id) return x;
      const neu = { ...x, ...p };

      // Von Hand gesetzter Rentenbeginn wird gemerkt und danach in Ruhe
      // gelassen — sonst ginge ein geplanter Vorruhestand verloren, sobald
      // das Geburtsdatum nachtraeglich korrigiert wird.
      if (p.rentenbeginn !== undefined && p.rentenbeginn !== x.rentenbeginn) {
        return { ...neu, rentenbeginnManuell: true };
      }

      if (p.geburtsdatum !== undefined && p.geburtsdatum !== x.geburtsdatum && !neu.rentenbeginnManuell) {
        const auto = automatischerRentenbeginn(neu.geburtsdatum);
        if (auto) return { ...neu, rentenbeginn: auto };
      }
      return neu;
    }),
    // Der automatisch nachgezogene Rentenbeginn bleibt ein Standardwert —
    // gestrichen wird nur, was im Aufruf steht.
  }, pfadeAus(`personen.${id}`, p))),

  // Zurueck auf die Regelaltersgrenze heisst: wieder der Standardwert.
  rentenbeginnZuruecksetzen: (id) => get().setze((s) => wiederOffen({
    ...s,
    personen: s.personen.map((x) => {
      if (x.id !== id) return x;
      const auto = automatischerRentenbeginn(x.geburtsdatum);
      return auto ? { ...x, rentenbeginn: auto, rentenbeginnManuell: false } : x;
    }),
  }, [`personen.${id}.rentenbeginn`])),

  partnerHinzufuegen: () => get().setze((s) => {
    if (s.personen.some((p) => p.id === 'B')) return s;
    const a = s.personen[0]!;
    /*
      Person B beginnt als Kopie von A. Ihre Angaben sind damit Beispiele —
      niemand hat sie fuer B geprueft.
    */
    return wiederOffen({
      ...s,
      personen: [...s.personen, { ...a, id: 'B' as const, name: '', geburtsdatum: a.geburtsdatum, rentenbeginn: a.rentenbeginn }],
    }, [
      'personen.B.geburtsdatum', 'personen.B.grvBruttoHeute',
      ...(a.rentenbeginnManuell ? [] : ['personen.B.rentenbeginn']),
    ]);
  }),

  tuevHinzufuegen: (vertragId) => get().setze((s) => {
    if (s.tuev.some((x) => x.vertragId === vertragId)) return s;
    const v = s.vertraege.find((x) => x.id === vertragId);
    return {
      ...s,
      tuev: [...s.tuev, {
        id: neueId('t'),
        vertragId,
        // Bei laufenden Vertraegen ist das Brutto die Rente, nicht der
        // Beitrag — deshalb nur ein Startwert, den der Nutzer anpasst.
        beitragMonat: v?.monatsbeitrag ?? v?.sparrate ?? 100,
        dynamik: v?.dynamik ?? 0,
        agZuschussMonat: 0,
        kinder: [],
        // Das Altersvorsorgedepot gibt es erst ab 2027. Mit dem laufenden
        // Jahr als Beginn stuende die Momentaufnahme des ersten Jahres ohne
        // jede Zulage da — und die Foerderung, um die es bei diesem Produkt
        // geht, waere unsichtbar. Aendern kann der Nutzer das Jahr weiterhin.
        beginnJahr: v?.beginnJahr
          ?? (v?.typ === 'avd'
            ? Math.max(new Date().getFullYear(), AVD_AB_JAHR)
            : new Date().getFullYear()),
        fruehereBeitraege: [],
        lebenserwartung: 85,
        vergleichen: false,
        vergleichKapitalNetto: 0,
      }],
    };
  }),

  tuevAendern: (id, p) => get().setze((s) => ({
    ...s, tuev: s.tuev.map((x) => (x.id === id ? { ...x, ...p } : x)),
  })),

  tuevEntfernen: (id) => get().setze((s) => ({
    ...s, tuev: s.tuev.filter((x) => x.id !== id),
  })),

  tuevKindHinzufuegen: (id) => get().setze((s) => ({
    ...s,
    tuev: s.tuev.map((x) => (x.id === id
      ? { ...x, kinder: [...x.kinder, { id: neueId('k'), geburtsjahr: new Date().getFullYear() }] }
      : x)),
  })),

  tuevKindAendern: (id, kindId, geburtsjahr) => get().setze((s) => ({
    ...s,
    tuev: s.tuev.map((x) => (x.id === id
      ? { ...x, kinder: x.kinder.map((k) => (k.id === kindId ? { ...k, geburtsjahr } : k)) }
      : x)),
  })),

  tuevKindEntfernen: (id, kindId) => get().setze((s) => ({
    ...s,
    tuev: s.tuev.map((x) => (x.id === id ? { ...x, kinder: x.kinder.filter((k) => k.id !== kindId) } : x)),
  })),

  setzeLoesungen: (p) => get().setze((s) => ({ ...s, loesungen: { ...s.loesungen, ...p } })),

  angebotHinzufuegen: (a) => get().setze((s) => ({
    ...s,
    loesungen: { ...s.loesungen, angebote: [...s.loesungen.angebote, { ...a, id: neueId('a') }].slice(0, 12) },
  })),

  angebotAendern: (id, p) => get().setze((s) => ({
    ...s,
    loesungen: { ...s.loesungen, angebote: s.loesungen.angebote.map((x) => (x.id === id ? { ...x, ...p } : x)) },
  })),

  angebotEntfernen: (id) => get().setze((s) => ({
    ...s,
    loesungen: { ...s.loesungen, angebote: s.loesungen.angebote.filter((x) => x.id !== id) },
  })),

  vertragHinzufuegen: (schicht) => get().setze((s) => {
    const typ = schicht === 1 ? 'basis' : schicht === 2 ? 'bav' : 'prvRente';
    const neu: Vertrag = {
      id: neueId('v'),
      inhaber: 'A', schicht, typ, name: '', brutto: 0,
      strategie: 'rente', altvertrag: false,
    };
    return geprueft({ ...s, vertraege: [...s.vertraege, neu] }, ['vertraege']);
  }),

  vertragAendern: (id, p) => get().setze((s) => ({
    ...s, vertraege: s.vertraege.map((v) => (v.id === id ? { ...v, ...p } : v)),
  })),

  vertragEntfernen: (id) => get().setze((s) => ({
    ...s,
    vertraege: s.vertraege.filter((v) => v.id !== id),
    // Sonst bliebe im TUEV eine Position ohne Vertrag zurueck.
    tuev: s.tuev.filter((x) => x.vertragId !== id),
  })),

  pruefen: (pfad) => get().setze((s) => geprueft(s, [pfad])),

  // Nur wenn es noch offen ist: Der Aufruf kommt aus einem Effekt, und ein
  // neues Szenario-Objekt bei jedem Zeichnen liesse die Projektion kreisen.
  ausgewertet: () => {
    if (offenePfade(get().szenario).includes('auswertung')) get().pruefen('auswertung');
  },

  alsJsonExportieren: () => exportiere(get().szenario),

  ausJsonImportieren: (roh) => {
    const r = importiere(roh);
    if (r.ok) {
      speichere(r.szenario);
      set({
        szenario: r.szenario,
        importMeldung: {
          art: 'ok',
          texte: r.warnungen.length ? r.warnungen : ['Szenario vollstaendig geladen.'],
        },
      });
    } else {
      // Der Prototyp schrieb Fehler nur auf die Konsole. Hier sieht der Nutzer sie.
      set({ importMeldung: { art: 'fehler', texte: r.fehler } });
    }
  },

  uebernehmen: (s, meldung) => { speichere(s); set({ szenario: s, importMeldung: { art: 'ok', texte: [meldung] } }); },

  zuruecksetzen: () => { const s = standardSzenario(); speichere(s); set({ szenario: s, importMeldung: null }); },
}));

export type { SzenarioParsed, Szenario };
