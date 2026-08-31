import { create } from 'zustand';
import { szenarioSchema, type SzenarioParsed } from '@renten/schema';
import { supabase, supabaseKonfiguriert, type SzenarioZeile } from '../lib/supabase';
import { useAuth } from './auth';

/**
 * Gespeicherte Szenarien eines angemeldeten Kontos.
 *
 * Bewusst NEBEN dem lokalen Store (store/szenario.ts), nicht darueber: Der
 * lokale Stand bleibt die Quelle der Wahrheit fuer das gerade bearbeitete
 * Szenario. Wer sich nicht anmeldet, verliert keine Funktion.
 *
 * Validiert wird mit demselben Schema wie beim Datei-Import. Das ist Komfort
 * und schuetzt vor kaputten Datensaetzen — die Sicherheitsgrenze liegt in den
 * Row-Level-Security-Policies der Datenbank, nicht hier.
 *
 * Die ANMELDUNG liegt seit der Zugangsschranke in `store/auth.ts`. Dieser
 * Store haelt nur noch, wer angemeldet ist, damit die Liste im richtigen
 * Moment geladen und beim Abmelden geleert wird.
 */

export interface GespeichertesSzenario {
  id: string;
  name: string;
  geaendertAm: string;
}

export interface FernStore {
  angemeldetAls: string | null;
  liste: GespeichertesSzenario[];
  laedt: boolean;
  meldung: { art: 'ok' | 'fehler'; text: string } | null;

  initialisieren: () => Promise<void>;

  listeLaden: () => Promise<void>;
  speichern: (name: string, szenario: SzenarioParsed) => Promise<string | null>;
  aktualisieren: (id: string, name: string, szenario: SzenarioParsed) => Promise<void>;
  laden: (id: string) => Promise<SzenarioParsed | null>;
  loeschen: (id: string) => Promise<void>;
  meldungLoeschen: () => void;
}

function fehlertext(e: unknown): string {
  if (typeof e === 'object' && e && 'message' in e) {
    const m = String((e as { message: unknown }).message);
    if (m.includes('hoechstens 50')) return 'Es sind höchstens 50 Szenarien je Konto möglich.';
    if (m.includes('daten_groesse')) return 'Das Szenario ist zu groß zum Speichern.';
    if (m.includes('row-level security')) return 'Kein Zugriff auf diesen Datensatz.';
    return m;
  }
  return 'Unbekannter Fehler';
}

export const useFernSzenarien = create<FernStore>((set, get) => ({
  angemeldetAls: null,
  liste: [],
  laedt: false,
  meldung: null,

  meldungLoeschen: () => set({ meldung: null }),

  initialisieren: async () => {
    if (!supabase) return;

    // Die Sitzung gehoert dem Auth-Store; hier wird nur mitgehoert, um die
    // Liste zur richtigen Zeit zu laden und beim Abmelden zu leeren.
    const uebernehmen = (email: string | null) => {
      const vorher = get().angemeldetAls;
      if (email === vorher) return;
      set({ angemeldetAls: email });
      if (email) void get().listeLaden();
      else set({ liste: [] });
    };

    uebernehmen(useAuth.getState().email);
    useAuth.subscribe((s) => uebernehmen(s.email));
  },

  listeLaden: async () => {
    if (!supabase) return;
    set({ laedt: true });
    const { data, error } = await supabase
      .from('szenarien')
      .select('id, name, geaendert_am')
      .order('geaendert_am', { ascending: false });
    if (error) {
      set({ laedt: false, meldung: { art: 'fehler', text: fehlertext(error) } });
      return;
    }
    set({
      laedt: false,
      liste: (data ?? []).map((z) => ({
        id: z.id as string,
        name: z.name as string,
        geaendertAm: z.geaendert_am as string,
      })),
    });
  },

  speichern: async (name, szenario) => {
    if (!supabase) return null;
    const geprueft = szenarioSchema.safeParse(szenario);
    if (!geprueft.success) {
      set({ meldung: { art: 'fehler', text: 'Szenario ist unvollständig und wurde nicht gespeichert.' } });
      return null;
    }
    set({ laedt: true });
    const { data, error } = await supabase
      .from('szenarien')
      // besitzer wird serverseitig aus auth.uid() gesetzt.
      .insert({ name, daten: geprueft.data, schema_version: geprueft.data.schemaVersion })
      .select('id')
      .single();
    if (error) {
      set({ laedt: false, meldung: { art: 'fehler', text: fehlertext(error) } });
      return null;
    }
    await get().listeLaden();
    set({ meldung: { art: 'ok', text: `„${name}" gespeichert.` } });
    return (data as { id: string }).id;
  },

  aktualisieren: async (id, name, szenario) => {
    if (!supabase) return;
    const geprueft = szenarioSchema.safeParse(szenario);
    if (!geprueft.success) {
      set({ meldung: { art: 'fehler', text: 'Szenario ist unvollständig und wurde nicht gespeichert.' } });
      return;
    }
    set({ laedt: true });
    const { error } = await supabase
      .from('szenarien')
      .update({ name, daten: geprueft.data, schema_version: geprueft.data.schemaVersion })
      .eq('id', id);
    if (error) {
      set({ laedt: false, meldung: { art: 'fehler', text: fehlertext(error) } });
      return;
    }
    await get().listeLaden();
    set({ meldung: { art: 'ok', text: 'Gespeichert.' } });
  },

  laden: async (id) => {
    if (!supabase) return null;
    set({ laedt: true });
    const { data, error } = await supabase
      .from('szenarien')
      .select('daten')
      .eq('id', id)
      .single();
    set({ laedt: false });
    if (error) {
      set({ meldung: { art: 'fehler', text: fehlertext(error) } });
      return null;
    }
    // Auch beim Lesen validieren: Der Datensatz kann aus einer aelteren
    // Schemaversion stammen.
    const geprueft = szenarioSchema.safeParse((data as Pick<SzenarioZeile, 'daten'>).daten);
    if (!geprueft.success) {
      set({ meldung: { art: 'fehler', text: 'Der gespeicherte Stand passt nicht zum aktuellen Schema.' } });
      return null;
    }
    return geprueft.data;
  },

  loeschen: async (id) => {
    if (!supabase) return;
    const { error } = await supabase.from('szenarien').delete().eq('id', id);
    if (error) {
      set({ meldung: { art: 'fehler', text: fehlertext(error) } });
      return;
    }
    await get().listeLaden();
    set({ meldung: { art: 'ok', text: 'Gelöscht.' } });
  },
}));

export { supabaseKonfiguriert };
