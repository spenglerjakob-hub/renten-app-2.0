import { create } from 'zustand';
import { antraegeLaden, antragLoeschen, type Antrag } from '../lib/antraege';

/**
 * Die Anträge des Beraters — für die Etappe „Abschluss“, das Fenster
 * „Anträge“ und die Marke „n eingegangen“ in der Seitenleiste. Eigener Store
 * wie beim Vorsorge-Check: Die Marke soll stehen, auch wenn das Fenster zu ist.
 */
export interface AntraegeStore {
  liste: Antrag[];
  laedt: boolean;
  meldung: { art: 'ok' | 'fehler'; text: string } | null;
  laden: () => Promise<void>;
  /** Nach dem Speichern: den Antrag in der Liste ersetzen oder vorn einfügen. */
  merken: (a: Antrag) => void;
  loeschen: (id: string) => Promise<boolean>;
  meldungSetzen: (m: AntraegeStore['meldung']) => void;
}

/** Der Fehler in Worten — mit dem Fall, dass die Migration noch nicht eingespielt ist. */
export function antragFehlertext(e: unknown): string {
  if (typeof e === 'object' && e && 'message' in e) {
    const m = String((e as { message: unknown }).message);
    const code = 'code' in e ? String((e as { code: unknown }).code) : '';
    if (m.includes('hoechstens 500')) return 'Es sind höchstens 500 Anträge je Konto möglich.';
    if (code === 'PGRST205' || code === 'PGRST202' || code === '42P01' || code === '42883' || m.includes('schema cache')) {
      return 'Die Anträge sind in der Datenbank noch nicht eingerichtet. '
        + 'Bitte wenden Sie sich an den Betreiber des Rentenplaners.';
    }
    if (code === '42501' || m.includes('row-level security')) return 'Keine Berechtigung für diesen Antrag.';
    if (m.includes('Failed to fetch')) return 'Keine Verbindung zum Server — bitte später erneut versuchen.';
    return m;
  }
  return 'Unbekannter Fehler';
}

export const useAntraege = create<AntraegeStore>((set, get) => ({
  liste: [],
  laedt: false,
  meldung: null,

  laden: async () => {
    set({ laedt: true });
    try {
      set({ liste: await antraegeLaden(), laedt: false });
    } catch (e) {
      set({ laedt: false, meldung: { art: 'fehler', text: antragFehlertext(e) } });
    }
  },

  merken: (a) => set({ liste: [a, ...get().liste.filter((x) => x.id !== a.id)] }),

  loeschen: async (id) => {
    try {
      await antragLoeschen(id);
      set({ liste: get().liste.filter((x) => x.id !== id), meldung: { art: 'ok', text: 'Antrag gelöscht.' } });
      return true;
    } catch (e) {
      set({ meldung: { art: 'fehler', text: antragFehlertext(e) } });
      return false;
    }
  },

  meldungSetzen: (meldung) => set({ meldung }),
}));
