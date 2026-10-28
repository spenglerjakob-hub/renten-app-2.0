import { create } from 'zustand';
import { auftrittLeer, mitBueroAuftritt, type Auftritt, type BueroAuftritt } from '../features/auftritt';
import {
  bueroAuftrittLaden, logoHochladen, logoLaden, logosAufraeumen, profilEntfernen, profilLaden, profilSpeichern,
  type Angaben, type HochladenFehler,
} from '../lib/auftritt-konto';

/**
 * „Ihr Auftritt im Gutachten“ des angemeldeten Kontos.
 *
 * Geladen nach der Anmeldung (`App.tsx`), geleert beim Abmelden. Das Logo
 * liegt als Object-URL im Speicher — so steht es beim Drucken sofort bereit;
 * eine ersetzte URL wird freigegeben.
 *
 * IM BUERO gelten fuer Mitglieder Logo, Firmenname und Akzentfarbe des
 * Inhabers (`buero`): `auftritt` traegt sie schon, alles Gedruckte liest nur
 * ihn. Gespeichert wird dann nur Persoenliches — die eigenen Werte bleiben
 * in der Zeile und gelten nach einem Austritt wieder.
 */
export type SpeichernErgebnis = 'ok' | HochladenFehler;

interface AuftrittStore {
  status: 'aus' | 'laedt' | 'bereit' | 'fehler';
  /** Der Auftritt, der gilt, `logo` als Object-URL — null: keiner eingerichtet */
  auftritt: Auftritt | null;
  /** Pfad des eigenen Logos im Bucket */
  logoPfad: string | null;
  /** Gibt es eine eigene Zeile? Im Buero gilt auch ohne sie, was der Inhaber festlegt. */
  eigenes: boolean;
  /** Logo, Firmenname und Akzentfarbe des Bueros — null: kein Mitglied eines Bueros */
  buero: BueroAuftritt | null;
  laden: () => Promise<void>;
  /** `logo`: weggelassen = unveraendert, null = entfernen, Blob = neues Logo (im Buero ohne Wirkung) */
  speichern: (angaben: Angaben, logo?: Blob | null) => Promise<SpeichernErgebnis>;
  entfernen: () => Promise<boolean>;
  zuruecksetzen: () => void;
}

function freigeben(url: string | null | undefined) {
  if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
}

const oderNull = (a: Auftritt) => (auftrittLeer(a) ? null : a);

export const useAuftritt = create<AuftrittStore>((set, get) => ({
  status: 'aus',
  auftritt: null,
  logoPfad: null,
  eigenes: false,
  buero: null,

  laden: async () => {
    if (get().status === 'laedt') return;
    set({ status: 'laedt' });
    const [p, buero] = await Promise.all([profilLaden(), bueroAuftrittLaden()]);
    if (p === 'fehler' || buero === 'fehler') { set({ status: 'fehler' }); return; }
    // Im Buero das Logo des Inhabers, sonst das eigene
    const pfad = buero ? buero.logo : p?.logoPfad ?? null;
    const url = pfad ? await logoLaden(pfad) : null;
    freigeben(get().auftritt?.logo);
    const eigen: Auftritt | null = p ? { ...p.angaben, logo: url } : null;
    const a = buero ? mitBueroAuftritt(eigen, buero, url) : eigen;
    set({ status: 'bereit', auftritt: a ? oderNull(a) : null, logoPfad: p?.logoPfad ?? null, eigenes: p !== null, buero });
  },

  speichern: async (angaben, logo) => {
    const vorher = get();
    if (vorher.buero) {
      if (!(await profilSpeichern(angaben, null, true))) return 'fehler';
      const a = mitBueroAuftritt({ ...angaben, logo: null }, vorher.buero, vorher.auftritt?.logo ?? null);
      set({ status: 'bereit', auftritt: oderNull(a), eigenes: true });
      return 'ok';
    }
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
    set({ status: 'bereit', auftritt: oderNull(a), logoPfad: pfad, eigenes: true });
    // Das vorige Logo entfernen — im Hintergrund.
    void logosAufraeumen(pfad);
    return 'ok';
  },

  entfernen: async () => {
    if (!(await profilEntfernen())) return false;
    const { buero, auftritt } = get();
    // Im Buero bleibt, was der Inhaber festlegt.
    const a = buero ? oderNull(mitBueroAuftritt(null, buero, auftritt?.logo ?? null)) : null;
    if (!a) freigeben(auftritt?.logo);
    set({ auftritt: a, logoPfad: null, eigenes: false });
    return true;
  },

  zuruecksetzen: () => {
    freigeben(get().auftritt?.logo);
    set({ status: 'aus', auftritt: null, logoPfad: null, eigenes: false, buero: null });
  },
}));
