import { create } from 'zustand';
import type { EmailOtpType } from '@supabase/supabase-js';
import { supabase, supabaseKonfiguriert, adresseBeimStart } from '../lib/supabase';

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
  | 'passwortNeu'
  /** Ueber einen Link aus einer Mail gekommen — wartet auf den Klick */
  | 'linkEinloesen';

/** Ein Link aus einer Bestaetigungs- oder Zuruecksetzen-Mail. */
export interface MailLink {
  tokenHash: string;
  typ: EmailOtpType;
}

export interface AuthStore {
  status: AuthStatus;
  email: string | null;
  laedt: boolean;
  meldung: { art: 'ok' | 'fehler'; text: string } | null;
  /** Gesetzt, solange ein Link aus einer Mail auf den Klick wartet. */
  link: MailLink | null;
  /** Adresse, deren Anmeldung an der fehlenden Bestaetigung scheiterte. */
  unbestaetigt: string | null;

  initialisieren: () => Promise<void>;
  registrieren: (email: string, passwort: string) => Promise<void>;
  anmelden: (email: string, passwort: string) => Promise<void>;
  passwortVergessen: (email: string) => Promise<void>;
  passwortSetzen: (neu: string) => Promise<void>;
  /** Loest den Link aus der Mail ein — erst auf Knopfdruck, siehe `linkAusAdresse`. */
  linkBestaetigen: () => Promise<void>;
  bestaetigungErneutSenden: () => Promise<void>;
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
  if (k.includes('otp_expired') || k.includes('otp expired') || k.includes('invalid or has expired')
    || k.includes('token has expired') || k.includes('link is invalid')) {
    return 'Dieser Link ist abgelaufen oder wurde schon benutzt. Bitte fordern Sie einen neuen an.';
  }
  if (k.includes('for security purposes')) {
    return 'Bitte warten Sie einen Moment, bevor Sie erneut eine E-Mail anfordern.';
  }
  if (k.includes('rate limit') || k.includes('too many requests')) {
    return 'Zu viele Versuche. Bitte warten Sie einen Moment.';
  }
  if (k.includes('failed to fetch') || k.includes('networkerror')) {
    return 'Keine Verbindung zum Server. Bitte prüfen Sie Ihre Internetverbindung.';
  }
  return roh;
}


/*
 * ABMELDUNG NACH PAUSE. Supabase haelt eine Sitzung unbefristet: Das
 * Zugriffstoken erneuert sich selbst, solange das Geraet es aufbewahrt. Wer
 * sich einmal angemeldet hat, bliebe auf diesem Rechner fuer immer drin —
 * auch wenn inzwischen ein Kollege davorsitzt. Deshalb ein eigener
 * Zeitstempel der letzten NUTZUNG (Klick, Taste, Zurueckkehren in den Tab).
 * Das automatische Erneuern des Tokens zaehlt ausdruecklich nicht: Ein offen
 * vergessener Tab soll nicht ewig angemeldet bleiben.
 */
const AKTIV_SCHLUESSEL = 'rentenplaner.auth.aktiv';
export const PAUSE_BIS_ABMELDUNG_MS = 48 * 60 * 60 * 1000;
const STEMPEL_ABSTAND_MS = 60 * 1000;

function letzteAktivitaet(): number | null {
  try {
    const n = Number(localStorage.getItem(AKTIV_SCHLUESSEL));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch { return null; }
}

function stempeln() {
  try { localStorage.setItem(AKTIV_SCHLUESSEL, String(Date.now())); } catch { /* privates Fenster */ }
}

function stempelLoeschen() {
  try { localStorage.removeItem(AKTIV_SCHLUESSEL); } catch { /* egal */ }
}

/**
 * Zu lange nicht benutzt? Ein FEHLENDER Stempel zaehlt als zu lange: So endet
 * auch jede Sitzung, die aus der Zeit vor dieser Regel stammt, einmal.
 */
function zuLangeNichtBenutzt(): boolean {
  const t = letzteAktivitaet();
  return t === null || Date.now() - t > PAUSE_BIS_ABMELDUNG_MS;
}

const LINK_TYPEN: readonly EmailOtpType[] = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email'];

/**
 * Link aus einer Mail im neuen Format: `/?token_hash=…&type=…`.
 *
 * WARUM NICHT DIREKT EINLOESEN: Firmen-Mailfilter (etwa Microsoft Defender)
 * rufen jeden Link einer Mail vorab auf, um ihn auf Schadcode zu pruefen.
 * Loeste schon der Aufruf die Bestaetigung aus, bestaetigte der Filter das
 * Konto — genau das ist bei den ersten Konten passiert (bestaetigt 8 bis 20
 * Sekunden nach der Registrierung). Deshalb zeigt die Seite nur einen Knopf;
 * erst der Klick eines Menschen loest den Link ein.
 */
function linkAusAdresse(adresse: string): MailLink | null {
  try {
    const p = new URL(adresse).searchParams;
    const tokenHash = p.get('token_hash');
    const typ = p.get('type') as EmailOtpType | null;
    if (!tokenHash || !typ || !LINK_TYPEN.includes(typ)) return null;
    return { tokenHash, typ };
  } catch { return null; }
}

/** Fehler, die Supabase bei Links im alten Format an die Adresse haengt (`#error_code=otp_expired`). */
function fehlerAusAdresse(adresse: string): string | null {
  try {
    const u = new URL(adresse);
    const p = new URLSearchParams(u.hash.replace(/^#/, ''));
    const q = u.searchParams;
    return p.get('error_code') ?? p.get('error_description') ?? q.get('error_code') ?? q.get('error_description');
  } catch { return null; }
}

/** Token und Fehler aus der Adresse entfernen — ein Neuladen soll nichts wiederholen. */
function adresseBereinigen() {
  try {
    const u = new URL(window.location.href);
    for (const k of ['token_hash', 'type', 'error', 'error_code', 'error_description']) u.searchParams.delete(k);
    u.hash = '';
    window.history.replaceState(window.history.state, '', u.pathname + u.search);
  } catch { /* nur Kosmetik */ }
}

const netzfehler = (e: unknown) =>
  /failed to fetch|networkerror|load failed/i.test(String((e as { message?: unknown })?.message ?? ''))
  || (e as { name?: string })?.name === 'AuthRetryableFetchError';

let aktivitaetVerfolgt = false;

export const useAuth = create<AuthStore>((set, get) => ({
  // Ohne Supabase gibt es nichts zu pruefen — die Schranke laesst dann durch
  // und weist sichtbar darauf hin.
  status: supabaseKonfiguriert ? 'prueft' : 'abgemeldet',
  email: null,
  laedt: false,
  meldung: null,
  link: null,
  unbestaetigt: null,

  meldungLoeschen: () => set({ meldung: null, unbestaetigt: null }),

  initialisieren: async () => {
    if (!supabase) return;
    const sb = supabase;

    const link = linkAusAdresse(adresseBeimStart);
    if (link) set({ status: 'linkEinloesen', link, meldung: null });

    const urlFehler = link ? null : fehlerAusAdresse(adresseBeimStart);
    if (urlFehler) {
      adresseBereinigen();
      set({ meldung: { art: 'fehler', text: fehlertext({ message: urlFehler }) } });
    }
    // Link im alten Format (`#access_token=…`): Der Client meldet gleich an —
    // das ist eine frische Anmeldung, keine alte Sitzung.
    if (/[#&]access_token=/.test(adresseBeimStart)) stempeln();

    // ZUERST den Zuhoerer, dann die Sitzung lesen: Kommt der Nutzer ueber
    // einen Zuruecksetzen-Link im alten Format, wertet der Client die Adresse
    // beim Start aus. Wer erst danach zuhoert, verpasst das Ereignis.
    sb.auth.onAuthStateChange((ereignis, sitzung) => {
      if (ereignis === 'PASSWORD_RECOVERY') {
        stempeln();
        set({ status: 'passwortNeu', link: null, email: sitzung?.user.email ?? null, meldung: null });
        return;
      }
      // Waehrend ein Link auf den Klick wartet oder ein neues Passwort
      // vergeben wird, entscheiden die Aktionen selbst ueber den Status.
      const s = get().status;
      if (s === 'linkEinloesen') return;
      if ((s === 'passwortNeu' || s === 'prueft') && ereignis !== 'SIGNED_OUT') return;
      set({
        status: sitzung ? 'angemeldet' : 'abgemeldet',
        email: sitzung?.user.email ?? null,
      });
    });

    if (!aktivitaetVerfolgt && typeof window !== 'undefined') {
      aktivitaetVerfolgt = true;
      const pruefen = () => {
        if (get().status !== 'angemeldet') return false;
        if (!zuLangeNichtBenutzt()) return false;
        void sb.auth.signOut({ scope: 'local' }).finally(stempelLoeschen);
        set({
          status: 'abgemeldet', email: null,
          meldung: { art: 'ok', text: 'Sie wurden nach zwei Tagen ohne Nutzung aus Sicherheitsgründen abgemeldet.' },
        });
        return true;
      };
      let zuletzt = 0;
      const benutzt = () => {
        if (pruefen() || get().status !== 'angemeldet') return;
        const jetzt = Date.now();
        if (jetzt - zuletzt < STEMPEL_ABSTAND_MS) return;
        zuletzt = jetzt;
        stempeln();
      };
      window.addEventListener('pointerdown', benutzt, { passive: true });
      window.addEventListener('keydown', benutzt, { passive: true });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') benutzt();
      });
      window.setInterval(pruefen, 5 * 60 * 1000);
    }

    // Wartet ein Link auf den Klick, bleibt es dabei — gleich, ob hier noch
    // eine alte Sitzung liegt. Der Klick entscheidet.
    if (link) return;

    const { data } = await sb.auth.getSession();
    // Ein zwischenzeitlich eingetroffenes PASSWORD_RECOVERY nicht ueberschreiben.
    if (get().status === 'passwortNeu') return;

    if (!data.session) {
      set({ status: 'abgemeldet', email: null });
      return;
    }

    if (zuLangeNichtBenutzt()) {
      await sb.auth.signOut({ scope: 'local' });
      stempelLoeschen();
      set({
        status: 'abgemeldet', email: null,
        meldung: get().meldung ?? { art: 'ok', text: 'Bitte melden Sie sich erneut an.' },
      });
      return;
    }

    // getSession liest nur den lokalen Speicher. getUser fragt beim Server
    // nach: Ein geloeschtes oder gesperrtes Konto ist damit sofort draussen,
    // nicht erst, wenn das Token ablaeuft. Ohne Netz bleibt es bei der
    // lokalen Sitzung — der Rechner laeuft ja auch offline.
    const { data: nutzer, error } = await sb.auth.getUser();
    if (error && !netzfehler(error)) {
      await sb.auth.signOut({ scope: 'local' });
      stempelLoeschen();
      set({
        status: 'abgemeldet', email: null,
        meldung: { art: 'fehler', text: 'Ihre Anmeldung ist nicht mehr gültig. Bitte melden Sie sich erneut an.' },
      });
      return;
    }

    if (get().status === 'passwortNeu') return;
    stempeln();
    set({ status: 'angemeldet', email: nutzer?.user?.email ?? data.session.user.email ?? null });
  },

  linkBestaetigen: async () => {
    const link = get().link;
    if (!supabase || !link) return;
    set({ laedt: true, meldung: null });
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: link.tokenHash, type: link.typ });
    adresseBereinigen();

    if (error || !data.session) {
      set({
        laedt: false, link: null, status: 'abgemeldet', email: null,
        meldung: { art: 'fehler', text: fehlertext(error ?? { message: 'otp_expired' }) },
      });
      return;
    }

    stempeln();
    set(link.typ === 'recovery'
      ? { laedt: false, link: null, status: 'passwortNeu', email: data.session.user.email ?? null, meldung: null }
      : { laedt: false, link: null, status: 'angemeldet', email: data.session.user.email ?? null, meldung: null });
  },

  bestaetigungErneutSenden: async () => {
    const email = get().unbestaetigt;
    if (!supabase || !email) return;
    set({ laedt: true });
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    set({
      laedt: false,
      unbestaetigt: error ? email : null,
      meldung: error
        ? { art: 'fehler', text: fehlertext(error) }
        : { art: 'ok', text: `Wir haben die Bestätigungsmail erneut an ${email} geschickt. Bitte sehen Sie auch im Spam-Ordner nach.` },
    });
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

    if (data.session) stempeln();
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
              + 'Adresse — danach sind Sie angemeldet. Keine Mail da? Sehen Sie bitte auch im Spam-Ordner nach.',
          },
    });
  },

  anmelden: async (email, passwort) => {
    if (!supabase) return;
    set({ laedt: true, meldung: null });
    const { error } = await supabase.auth.signInWithPassword({ email, password: passwort });
    if (!error) stempeln();
    // Scheitert es nur an der Bestaetigung, bietet die Maske an, die Mail
    // erneut zu schicken — die erste liegt oft im Spam oder ist abgelaufen.
    const unbestaetigt = /email not confirmed/i.test(String(error?.message ?? '')) ? email : null;
    set({
      laedt: false,
      unbestaetigt,
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
    stempeln();
    set({ laedt: false, status: 'angemeldet', meldung: { art: 'ok', text: 'Neues Passwort gespeichert.' } });
  },

  abmelden: async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    stempelLoeschen();
    set({ status: 'abgemeldet', email: null, meldung: null });
  },
}));
