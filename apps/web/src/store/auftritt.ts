import { create } from 'zustand';
import { auftrittLeer, type Auftritt } from '../features/auftritt';
import {
  logoHochladen, logoLaden, logosAufraeumen, profilEntfernen, profilLaden, profilSpeichern,
  type Angaben, type HochladenFehler,
} from '../lib/auftritt-konto';

/**
 * „Ihr Auftritt im Gutachten“ des angemeldeten Kontos.
 *
 * Geladen nach der Anmeldung (`App.tsx`), geleert beim Abmelden. Das Logo
 * liegt als Object-URL im Speicher — so steht es beim Drucken sofort bereit;
 * eine ersetzte URL wird freigegeben.
 */
export type SpeichernErgebnis = 'ok' | HochladenFehler;

interface AuftrittStore {
  status: 'aus' | 'laedt' | 'bereit' | 'fehler';
  /** Der gespeicherte Auftritt, `logo` als Object-URL — null: keiner eingerichtet */
  auftritt: Auftritt | null;
  /** Pfad des Logos im Bucket */
  logoPfad: string | null;
  laden: () => Promise<void>;
  /** `logo`: weggelassen = unveraendert, null = entfernen, Blob = neues Logo */
  speichern: (angaben: Angaben, logo?: Blob | null) => Promise<SpeichernErgebnis>;
  entfernen: () => Promise<boolean>;
  zuruecksetzen: () => void;
}

function freigeben(url: string | null | undefined) {
  if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
}

export const useAuftritt = create<AuftrittStore>((set, get) => ({
  status: 'aus',
  auftritt: null,
  logoPfad: null,

  laden: async () => {
    if (get().status === 'laedt') return;
    set({ status: 'laedt' });
    const p = await profilLaden();
    if (p === 'fehler') { set({ status: 'fehler' }); return; }
    const url = p?.logoPfad ? await logoLaden(p.logoPfad) : null;
    freigeben(get().auftritt?.logo);
    const a: Auftritt | null = p ? { ...p.angaben, logo: url } : null;
    set({ status: 'bereit', auftritt: a && !auftrittLeer(a) ? a : null, logoPfad: p?.logoPfad ?? null });
  },

  speichern: async (angaben, logo) => {
    const vorher = get();
    let pfad = vorher.logoPfad;
    let url = vorher.auftritt?.logo ?? null;
    if (logo instanceof Blob) {
      // Platz schaffen: Die Policy erlaubt hoechstens drei Dateien je Ordner.
      await logosAufraeumen(vorher.logoPfad);
      const r = await logoHochladen(logo);
      if (r === 'zu-gross' || r === 'typ' || r === 'fehler') return r;
      pfad = r;
      url = URL.createObjectURL(logo);
    } else if (logo === null) {
      pfad = null;
      url = null;
    }
    if (!(await profilSpeichern(angaben, pfad))) {
      // Ein schon hochgeladenes Logo raeumt das naechste Speichern ab.
      if (logo instanceof Blob) freigeben(url);
      return 'fehler';
    }
    if (vorher.auftritt?.logo !== url) freigeben(vorher.auftritt?.logo);
    const a: Auftritt = { ...angaben, logo: url };
    set({ status: 'bereit', auftritt: auftrittLeer(a) ? null : a, logoPfad: pfad });
    // Das vorige Logo entfernen — im Hintergrund.
    void logosAufraeumen(pfad);
    return 'ok';
  },

  entfernen: async () => {
    if (!(await profilEntfernen())) return false;
    freigeben(get().auftritt?.logo);
    set({ auftritt: null, logoPfad: null });
    return true;
  },

  zuruecksetzen: () => {
    freigeben(get().auftritt?.logo);
    set({ status: 'aus', auftritt: null, logoPfad: null });
  },
}));
