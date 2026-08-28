import { create } from 'zustand';
import { szenarioSchema, importiere, exportiere, type SzenarioParsed } from '@renten/schema';
import type { Szenario, Vertrag, Person } from '@renten/engine';

const SPEICHER_SCHLUESSEL = 'rentenplaner.szenario.v1';

function standardSzenario(): SzenarioParsed {
  const jahr = new Date().getFullYear();
  return szenarioSchema.parse({
    schemaVersion: 1,
    haushalt: {
      verheiratet: false, bundesland: 'Nordrhein-Westfalen', kirchensteuer: false,
      hatKinder: false, kinderUnter25: 0, kvStatus: 'kvdr', pkvPraemieMonat: 600,
      zielNettoHeute: 2000,
    },
    annahmen: { inflation: 0.02, rentendynamik: 0.01, tarifIndex: 0.01, gehaltsdynamik: 0.02 },
    einkommenHeute: {
      modus: 'brutto', betrag: 4000, auszahlungen: 12,
      besoldungsgruppe: 'A13', besoldungsstufe: 4, besoldungsland: 'Bund',
    },
    personen: [{
      id: 'A', name: '', geburtsdatum: '01.01.1985', rentenbeginn: `01.01.${1985 + 67}`,
      art: 'grv', grvBruttoHeute: 1500,
      besoldungsgruppe: 'A13', besoldungsstufe: 8, ruhegehaltssatz: 71.75,
      dienstbeginn: `01.01.${jahr - 5}`, teilzeitphasen: [],
    }],
    vertraege: [],
    planer: { startkapital: 0, dauerJahre: 25, rendite: 0.02, dynamik: 0, insNettoEinrechnen: false },
  });
}

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
  setzeAnnahmen: (p: Partial<SzenarioParsed['annahmen']>) => void;
  setzeEinkommen: (p: Partial<SzenarioParsed['einkommenHeute']>) => void;
  setzePlaner: (p: Partial<SzenarioParsed['planer']>) => void;
  setzePerson: (id: 'A' | 'B', p: Partial<Person>) => void;
  partnerHinzufuegen: () => void;

  tuevHinzufuegen: (vertragId: string) => void;
  tuevAendern: (id: string, p: Partial<SzenarioParsed['tuev'][number]>) => void;
  tuevEntfernen: (id: string) => void;
  tuevKindHinzufuegen: (id: string) => void;
  tuevKindAendern: (id: string, kindId: string, geburtsjahr: number) => void;
  tuevKindEntfernen: (id: string, kindId: string) => void;

  vertragHinzufuegen: (schicht: 1 | 2 | 3) => void;
  vertragAendern: (id: string, p: Partial<Vertrag>) => void;
  vertragEntfernen: (id: string) => void;

  alsJsonExportieren: () => string;
  ausJsonImportieren: (roh: string) => void;
  zuruecksetzen: () => void;
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

  setzeHaushalt: (p) => get().setze((s) => ({ ...s, haushalt: { ...s.haushalt, ...p } })),
  setzeAnnahmen: (p) => get().setze((s) => ({ ...s, annahmen: { ...s.annahmen, ...p } })),
  setzeEinkommen: (p) => get().setze((s) => ({ ...s, einkommenHeute: { ...s.einkommenHeute, ...p } })),
  setzePlaner: (p) => get().setze((s) => ({ ...s, planer: { ...s.planer, ...p } })),

  setzePerson: (id, p) => get().setze((s) => ({
    ...s, personen: s.personen.map((x) => (x.id === id ? { ...x, ...p } : x)),
  })),

  partnerHinzufuegen: () => get().setze((s) => {
    if (s.personen.some((p) => p.id === 'B')) return s;
    const a = s.personen[0]!;
    return {
      ...s,
      personen: [...s.personen, { ...a, id: 'B' as const, name: '', geburtsdatum: a.geburtsdatum, rentenbeginn: a.rentenbeginn }],
    };
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
        beginnJahr: v?.beginnJahr ?? new Date().getFullYear(),
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

  vertragHinzufuegen: (schicht) => get().setze((s) => {
    const typ = schicht === 1 ? 'basis' : schicht === 2 ? 'bav' : 'prvRente';
    const neu: Vertrag = {
      id: neueId('v'),
      inhaber: 'A', schicht, typ, name: '', brutto: 0,
      strategie: 'rente', altvertrag: false,
    };
    return { ...s, vertraege: [...s.vertraege, neu] };
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

  zuruecksetzen: () => { const s = standardSzenario(); speichere(s); set({ szenario: s, importMeldung: null }); },
}));

export type { SzenarioParsed, Szenario };
