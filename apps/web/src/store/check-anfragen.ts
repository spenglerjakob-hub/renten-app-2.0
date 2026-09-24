import { create } from 'zustand';
import { importiere, type SzenarioParsed } from '@renten/schema';
import {
  anfragenLaden, anfrageAnlegen, anfrageLoeschen, eingangLaden, type CheckAnfrage,
} from '../lib/check';

/**
 * Die Vorsorge-Checks, die ein Berater angefordert hat.
 *
 * Eigener Store, damit die Zahl neuer Eingaenge im Kopf der Karte stehen
 * kann, auch wenn die Karte zu ist — sonst sieht niemand, dass ein Kunde
 * geantwortet hat.
 */
export interface CheckStore {
  liste: CheckAnfrage[];
  laedt: boolean;
  meldung: { art: 'ok' | 'fehler'; text: string } | null;

  laden: () => Promise<void>;
  anlegen: (kunde: string) => Promise<CheckAnfrage | null>;
  /** Liefert das eingereichte Szenario — geprueft mit demselben Schema wie ein Datei-Import. */
  uebernehmen: (code: string) => Promise<SzenarioParsed | null>;
  loeschen: (code: string) => Promise<void>;
  meldungLoeschen: () => void;
}

function fehlertext(e: unknown): string {
  if (typeof e === 'object' && e && 'message' in e) {
    const m = String((e as { message: unknown }).message);
    const code = 'code' in e ? String((e as { code: unknown }).code) : '';
    if (m.includes('hoechstens 500')) return 'Es sind höchstens 500 offene Anfragen je Konto möglich.';
    /*
      Fehlen die Tabellen (Migration nicht eingespielt), meldet PostgREST
      PGRST205 „Could not find the table … in the schema cache". Genau so
      ging es beim ersten Einsatz: Die Oberflaeche war online, die Datenbank
      noch nicht — und die Karte zeigte den rohen englischen Text.
    */
    if (code === 'PGRST205' || code === '42P01' || m.includes('schema cache')) {
      return 'Der Vorsorge-Check ist in der Datenbank noch nicht eingerichtet. '
        + 'Bitte wenden Sie sich an den Betreiber des Rentenplaners.';
    }
    if (code === '42501' || m.includes('row-level security')) return 'Keine Berechtigung für diese Anfrage.';
    if (m.includes('Failed to fetch')) return 'Keine Verbindung zum Server — bitte später erneut versuchen.';
    return m;
  }
  return 'Unbekannter Fehler';
}

export const useCheckAnfragen = create<CheckStore>((set, get) => ({
  liste: [],
  laedt: false,
  meldung: null,

  meldungLoeschen: () => set({ meldung: null }),

  laden: async () => {
    set({ laedt: true });
    try {
      const liste = await anfragenLaden();
      /*
        Abgelaufene Anfragen OHNE Eingang raeumen sich selbst weg: Sie sind
        nicht mehr einreichbar und halten nur die Liste voll. Anfragen MIT
        Eingang bleiben, bis der Berater sie loescht — dort liegen
        Kundendaten, die er noch braucht.
      */
      const jetzt = Date.now();
      const verfallen = liste.filter((a) => !a.eingang && new Date(a.gueltigBis).getTime() < jetzt);
      await Promise.all(verfallen.map((a) => anfrageLoeschen(a.code).catch(() => undefined)));
      set({ liste: liste.filter((a) => !verfallen.includes(a)) });
    } catch (e) {
      set({ meldung: { art: 'fehler', text: fehlertext(e) } });
    } finally {
      set({ laedt: false });
    }
  },

  anlegen: async (kunde) => {
    try {
      const neu = await anfrageAnlegen(kunde);
      set({ liste: [neu, ...get().liste], meldung: null });
      return neu;
    } catch (e) {
      set({ meldung: { art: 'fehler', text: fehlertext(e) } });
      return null;
    }
  },

  uebernehmen: async (code) => {
    try {
      const daten = await eingangLaden(code);
      const r = importiere(JSON.stringify(daten));
      if (!r.ok) {
        set({ meldung: { art: 'fehler', text: `Die Angaben ließen sich nicht lesen: ${r.fehler.join(' ')}` } });
        return null;
      }
      return r.szenario;
    } catch (e) {
      set({ meldung: { art: 'fehler', text: fehlertext(e) } });
      return null;
    }
  },

  loeschen: async (code) => {
    try {
      await anfrageLoeschen(code);
      set({ liste: get().liste.filter((a) => a.code !== code) });
    } catch (e) {
      set({ meldung: { art: 'fehler', text: fehlertext(e) } });
    }
  },
}));
