import { create } from 'zustand';
import { supabase, supabaseKonfiguriert } from '../lib/supabase';

/**
 * Anmeldung mit E-Mail und Passwort.
 *
 * WAS DAS LEISTET UND WAS NICHT: Das ist Zugangssteuerung, keine
 * Geheimhaltung. Der Rechner laeuft vollstaendig im Browser; wer das
 * JavaScript herunterlaedt, kann die Rechenlogik auch ohne Konto ausfuehren.
 * Echt geschuetzt sind die GESPEICHERTEN SZENARIEN — dort greifen die
 * Row-Level-Security-Regeln der Datenbank, und die sind eine harte Grenze.
 * Wer diese Schranke fuer mehr haelt, taeuscht sich.
 *
 * Bewusst getrennt von `szenarien-fern.ts`: Dort geht es um gespeicherte
 * Szenarien, hier um die Sitzung. Beides in einem Store zu fuehren hiess,
 * dass die Zugangsschranke von der Szenarienverwaltung abhaengt.
 */

export type AuthStatus =
  /** Sitzung wird aus dem lokalen Speicher gelesen — noch nichts entschieden */
  | 'prueft'
  | 'angemeldet'
  | 'abgemeldet'
  /** Ueber einen Zuruecksetzen-Link gekommen: neues Passwort vergeben */
  | 'passwortNeu';

export interface AuthStore {
  status: AuthStatus;
  email: string | null;
  laedt: boolean;
  meldung: { art: 'ok' | 'fehler'; text: string } | null;

  initialisieren: () => Promise<void>;
  registrieren: (email: string, passwort: string) => Promise<void>;
  anmelden: (email: string, passwort: string) => Promise<void>;
  passwortVergessen: (email: string) => Promise<void>;
  passwortSetzen: (neu: string) => Promise<void>;
  abmelden: () => Promise<void>;
  meldungLoeschen: () => void;
}

/**
 * Supabase antwortet englisch. Die haeufigen Faelle bekommen einen deutschen
 * Text; alles Uebrige wird im Klartext durchgereicht, statt es zu verschlucken
 * — eine unverstaendliche Meldung ist immer noch besser als gar keine.
 */
function fehlertext(e: unknown): string {
  const roh = typeof e === 'object' && e && 'message' in e
    ? String((e as { message: unknown }).message)
    : 'Unbekannter Fehler';

  const k = roh.toLowerCase();
  if (k.includes('invalid login credentials')) {
    return 'E-Mail-Adresse oder Passwort stimmen nicht.';
  }
  if (k.includes('email not confirmed')) {
    return 'Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse — der Link steht in Ihrem Postfach.';
  }
  if (k.includes('user already registered') || k.includes('already been registered')) {
    return 'Zu dieser Adresse gibt es bereits ein Konto. Melden Sie sich an oder setzen Sie Ihr Passwort zurück.';
  }
  if (k.includes('password should be at least')) {
    const n = roh.match(/(\d+)/)?.[1];
    return `Das Passwort ist zu kurz${n ? ` — mindestens ${n} Zeichen` : ''}.`;
  }
  if (k.includes('weak password') || k.includes('pwned')) {
    return 'Dieses Passwort gilt als unsicher. Bitte wählen Sie ein anderes.';
  }
  if (k.includes('rate limit') || k.includes('too many requests')) {
    return 'Zu viele Versuche. Bitte warten Sie einen Moment.';
  }
  if (k.includes('failed to fetch') || k.includes('networkerror')) {
    return 'Keine Verbindung zum Server. Bitte prüfen Sie Ihre Internetverbindung.';
  }
  return roh;
}

export const useAuth = create<AuthStore>((set) => ({
  // Ohne Supabase gibt es nichts zu pruefen — die Schranke laesst dann durch
  // und weist sichtbar darauf hin.
  status: supabaseKonfiguriert ? 'prueft' : 'abgemeldet',
  email: null,
  laedt: false,
  meldung: null,

  meldungLoeschen: () => set({ meldung: null }),

  initialisieren: async () => {
    if (!supabase) return;

    // ZUERST den Zuhoerer, dann die Sitzung lesen: Kommt der Nutzer ueber
    // einen Bestaetigungs- oder Zuruecksetzen-Link, wertet der Client die
    // Adresse beim Start aus. Wer erst danach zuhoert, verpasst das Ereignis.
    supabase.auth.onAuthStateChange((ereignis, sitzung) => {
      if (ereignis === 'PASSWORD_RECOVERY') {
        set({ status: 'passwortNeu', email: sitzung?.user.email ?? null, meldung: null });
        return;
      }
      set({
        status: sitzung ? 'angemeldet' : 'abgemeldet',
        email: sitzung?.user.email ?? null,
      });
    });

    const { data } = await supabase.auth.getSession();
    set((s) => (
      // Ein zwischenzeitlich eingetroffenes PASSWORD_RECOVERY nicht ueberschreiben.
      s.status === 'passwortNeu'
        ? s
        : { ...s, status: data.session ? 'angemeldet' : 'abgemeldet', email: data.session?.user.email ?? null }
    ));
  },

  registrieren: async (email, passwort) => {
    if (!supabase) return;
    set({ laedt: true, meldung: null });
    const { data, error } = await supabase.auth.signUp({
      email,
      password: passwort,
      options: { emailRedirectTo: window.location.origin },
    });

    if (error) {
      set({ laedt: false, meldung: { art: 'fehler', text: fehlertext(error) } });
      return;
    }

    // Ist die E-Mail-Bestaetigung im Projekt aktiv, gibt es hier noch KEINE
    // Sitzung. Das muss dastehen, sonst haelt der Nutzer die Registrierung
    // fuer wirkungslos und versucht es immer wieder.
    set({
      laedt: false,
      meldung: data.session
        ? { art: 'ok', text: 'Konto angelegt. Sie sind angemeldet.' }
        : {
            art: 'ok',
            text: `Wir haben eine E-Mail an ${email} geschickt. Bitte bestätigen Sie darin Ihre `
              + 'Adresse — danach können Sie sich anmelden.',
          },
    });
  },

  anmelden: async (email, passwort) => {
    if (!supabase) return;
    set({ laedt: true, meldung: null });
    const { error } = await supabase.auth.signInWithPassword({ email, password: passwort });
    set({
      laedt: false,
      meldung: error ? { art: 'fehler', text: fehlertext(error) } : null,
    });
  },

  passwortVergessen: async (email) => {
    if (!supabase) return;
    set({ laedt: true, meldung: null });
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });

    // BEWUSST immer dieselbe Antwort, auch im Fehlerfall aus fachlichen
    // Gruenden: Unterschiedliche Meldungen machten das Formular zum
    // Verzeichnis registrierter Kunden. Nur echte Stoerungen (kein Netz,
    // Ratenbegrenzung) werden gemeldet.
    const echteStoerung = error && /rate limit|too many|failed to fetch|networkerror/i
      .test(String((error as { message?: unknown }).message ?? ''));

    set({
      laedt: false,
      meldung: echteStoerung
        ? { art: 'fehler', text: fehlertext(error) }
        : {
            art: 'ok',
            text: `Falls es zu ${email} ein Konto gibt, ist eine E-Mail zum Zurücksetzen unterwegs.`,
          },
    });
  },

  passwortSetzen: async (neu) => {
    if (!supabase) return;
    set({ laedt: true, meldung: null });
    const { error } = await supabase.auth.updateUser({ password: neu });
    if (error) {
      set({ laedt: false, meldung: { art: 'fehler', text: fehlertext(error) } });
      return;
    }
    set({ laedt: false, status: 'angemeldet', meldung: { art: 'ok', text: 'Neues Passwort gespeichert.' } });
  },

  abmelden: async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    set({ status: 'abgemeldet', email: null, meldung: null });
  },
}));
