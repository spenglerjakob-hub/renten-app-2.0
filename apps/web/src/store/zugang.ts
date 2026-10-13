import { create } from 'zustand';
import { paketDeckt, paketVon, type Bereich, type Intervall, type PaketId } from '@renten/schema/preise';
import { supabase } from '../lib/supabase';
import {
  einladungVergessen, fruehstartVergessen, istEinladungsToken, offeneEinladung, offenerFruehstart,
} from '../lib/einladung';

/**
 * Was das angemeldete Konto nutzen darf: Paket, Testphase, Buero, Abo.
 *
 * ENTSCHIEDEN WIRD AUF DEM SERVER (`mein_zugang()`, Migration …_abo.sql) —
 * hier wird nur gefragt und angezeigt. Erzwungen wird es dort, wo Daten
 * entstehen (Szenarien, Kundenlinks); die Rechner selbst laufen im Browser,
 * dort sperrt nur die Zugangsschranke.
 *
 * ZWISCHENSPEICHER: Die letzte Antwort liegt je Konto im localStorage. Wer
 * neu laedt, sieht den Rechner sofort; die frische Antwort kommt im
 * Hintergrund und sperrt notfalls nachtraeglich. Durchlassen darf der
 * Zwischenspeicher, sperren nur die frische Antwort.
 *
 * IST DER SERVER NICHT ERREICHBAR, wird durchgelassen — mit dem letzten
 * bekannten Stand, sonst ganz. Ein zahlender Kunde im Funkloch soll nicht
 * vor der Sperrseite stehen; und wer den Rechner ohne Paket will, kommt an
 * den Browser-Code ohnehin heran. Speichern geht ohne Paket trotzdem nicht.
 */

export type Quelle = 'vorab' | 'frei' | 'fruehstart' | 'abo' | 'test';
export type Rolle = 'inhaber' | 'mitglied';

export interface AboAngaben {
  paket: PaketId;
  intervall: Intervall;
  plaetze: number;
  belegt: number;
  /** Status bei Stripe: active, trialing, past_due, canceled, unpaid, … */
  status: string;
  laeuftBis: string | null;
  kuendigungZum: string | null;
}

export interface Zugang {
  /** Das freigeschaltete Paket — null: keins */
  paket: PaketId | null;
  quelle: Quelle | null;
  /** Ende der Testphase bzw. des Abos (Kuendigung oder Laufzeit) */
  bis: string | null;
  /** Ende der Testphase, sobald ein Starttermin feststeht */
  testBis: string | null;
  /** Ab wann ein Paket noetig ist — null: noch kein Termin */
  aboPflichtAb: string | null;
  /** Buchung freigeschaltet (Zahlung eingerichtet) */
  zahlungBereit: boolean;
  freizugang: 'bestand' | 'betreiber' | 'partner' | null;
  betreiber: boolean;
  buero: string | null;
  bueroName: string | null;
  rolle: Rolle | null;
  /** Unter den gebuchten Plaetzen des Bueros */
  hatPlatz: boolean;
  abo: AboAngaben | null;
  /** Early Adopter (Link eingeloest) — auch nach Ablauf der drei Monate */
  fruehstart: boolean;
  /** Wann der Link eingeloest wurde */
  fruehstartSeit: string | null;
  /** Ende der kostenlosen Zeit, sobald ein Starttermin feststeht */
  fruehstartBis: string | null;
  /** Wann zuletzt eine Rueckmeldung kam — fuer die Erinnerung */
  letzteRueckmeldung: string | null;
}

export type EinladungsAntwort =
  'ok' | 'ungueltig' | 'abgelaufen' | 'schon_im_buero' | 'anderes_buero' | 'kein_abo' | 'voll';
export type FruehstartAntwort = 'ok' | 'ungueltig' | 'abgelaufen' | 'schon_dabei' | 'frei';

const PAKET_IDS = ['alles', 'rente', 'ag'] as const;
const QUELLEN = ['vorab', 'frei', 'fruehstart', 'abo', 'test'] as const;
const ANTWORTEN = ['ok', 'ungueltig', 'abgelaufen', 'schon_im_buero', 'anderes_buero', 'kein_abo', 'voll'] as const;
const FRUEHSTART_ANTWORTEN = ['ok', 'ungueltig', 'abgelaufen', 'schon_dabei', 'frei'] as const;

const aus = <T extends string>(liste: readonly T[], v: unknown): T | null =>
  (liste as readonly unknown[]).includes(v) ? (v as T) : null;
const text = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null);

/** Die Antwort von `mein_zugang()` — geprueft, damit Unbekanntes nichts freischaltet. */
export function zugangAus(roh: unknown): Zugang | null {
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return null;
  const r = roh as Record<string, unknown>;
  const a = r.abo && typeof r.abo === 'object' ? (r.abo as Record<string, unknown>) : null;
  const aboPaket = aus(PAKET_IDS, a?.paket);
  return {
    paket: aus(PAKET_IDS, r.paket),
    quelle: aus(QUELLEN, r.quelle),
    bis: text(r.bis),
    testBis: text(r.test_bis),
    aboPflichtAb: text(r.abo_pflicht_ab),
    zahlungBereit: r.zahlung_bereit === true,
    freizugang: aus(['bestand', 'betreiber', 'partner'] as const, r.freizugang),
    betreiber: r.betreiber === true,
    buero: text(r.buero),
    bueroName: text(r.buero_name),
    rolle: aus(['inhaber', 'mitglied'] as const, r.rolle),
    hatPlatz: r.hat_platz === true,
    abo: a && aboPaket
      ? {
          paket: aboPaket,
          intervall: a.intervall === 'jahr' ? 'jahr' : 'monat',
          plaetze: Number(a.plaetze) || 0,
          belegt: Number(a.belegt) || 0,
          status: text(a.status) ?? '',
          laeuftBis: text(a.laeuft_bis),
          kuendigungZum: text(a.kuendigung_zum),
        }
      : null,
    fruehstart: r.fruehstart === true,
    fruehstartSeit: text(r.fruehstart_seit),
    fruehstartBis: text(r.fruehstart_bis),
    letzteRueckmeldung: text(r.letzte_rueckmeldung),
  };
}

/** Laeuft das Abo? Wie `privat.abo_aktiv` in der Datenbank. */
export const aboAktiv = (status: string | null | undefined) =>
  status === 'active' || status === 'trialing' || status === 'past_due';

/** Darf dieser Zugang den Bereich jetzt nutzen? */
export function deckt(z: Zugang, bereich: Bereich, jetzt = Date.now()): boolean {
  if (!paketDeckt(z.paket, bereich)) return false;
  // Testphase und Early-Adopter-Zeit enden zu einem festen Zeitpunkt — auch im Zwischenspeicher.
  const befristet = z.quelle === 'test' || z.quelle === 'fruehstart';
  return !(befristet && z.bis !== null && Date.parse(z.bis) <= jetzt);
}

/** Ganze Tage bis zu einem Zeitpunkt, aufgerundet — "noch 1 Tag" bis zuletzt. */
export function tageBis(iso: string | null, jetzt = Date.now()): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((Date.parse(iso) - jetzt) / 86_400_000));
}

export const tage = (n: number) => `${n} ${n === 1 ? 'Tag' : 'Tage'}`;
export const datum = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('de-DE') : '—');

/**
 * Der Eintrag "Abo & Team" in der Seitenleiste. Solange kein Starttermin
 * feststeht, sehen ihn nur der Betreiber, Bueros und Early Adopter — fuer
 * alle anderen aendert sich bis dahin nichts.
 */
export const aboSichtbar = (z: Zugang | null) =>
  !!z && (z.betreiber || z.aboPflichtAb !== null || z.buero !== null || z.fruehstart);

/** Zweite Zeile des Eintrags. */
export function aboZusatz(z: Zugang): string {
  if (z.quelle === 'test') return `Testphase: noch ${tage(tageBis(z.bis))}`;
  if (z.quelle === 'fruehstart') return `Early Adopter: noch ${tage(tageBis(z.bis))}`;
  if (z.fruehstart && z.quelle === 'vorab') return 'Early Adopter';
  if (z.abo && aboAktiv(z.abo.status)) {
    return `${paketVon(z.abo.paket).name} · ${z.abo.plaetze} ${z.abo.plaetze === 1 ? 'Platz' : 'Plätze'}`;
  }
  if (z.betreiber) return 'Betreiberkonto';
  if (z.freizugang === 'bestand') return 'Kostenlos (Bestandsschutz)';
  if (z.freizugang === 'partner') return 'Kostenlos (Partnerzugang)';
  return 'Paket wählen, Kollegen einladen';
}

/** Alle vier Wochen bitten wir Early Adopter um eine Rueckmeldung. */
const RUECKMELDUNG_ALLE_MS = 28 * 86_400_000;

/**
 * Ist eine Rueckmeldung faellig? Nur bei Early Adoptern, solange ihre
 * kostenlose Zeit laeuft (oder vor dem Start): vier Wochen nach der letzten
 * Rueckmeldung, die erste vier Wochen nach dem Einloesen.
 */
export function rueckmeldungFaellig(z: Zugang, jetzt = Date.now()): boolean {
  if (!z.fruehstart || !(z.quelle === 'fruehstart' || z.quelle === 'vorab')) return false;
  const seit = z.letzteRueckmeldung ?? z.fruehstartSeit;
  return seit !== null && jetzt - Date.parse(seit) > RUECKMELDUNG_ALLE_MS;
}

/** Early Adopter, dessen kostenlose Zeit vorbei ist — Zeit fuer Dank und Rabatt. */
export const fruehstartVorbei = (z: Zugang, jetzt = Date.now()) =>
  z.fruehstart && z.fruehstartBis !== null && Date.parse(z.fruehstartBis) <= jetzt;

// ---------------------------------------------------------------------------

const SPEICHER = 'rentenplaner.zugang.v1';
/** Aelter wird der Zwischenspeicher nicht genutzt. */
const SPEICHER_HALTBAR_MS = 30 * 24 * 60 * 60 * 1000;
/** Wer laenger weg war, bekommt beim Zurueckkehren in den Tab eine frische Antwort. */
const NEU_FRAGEN_MS = 10 * 60 * 1000;

function ausSpeicher(): { fuer: string; zugang: Zugang } | null {
  try {
    const s = JSON.parse(localStorage.getItem(SPEICHER) ?? 'null') as { fuer?: unknown; roh?: unknown; am?: unknown } | null;
    if (!s || typeof s.fuer !== 'string' || typeof s.am !== 'number' || Date.now() - s.am > SPEICHER_HALTBAR_MS) return null;
    const zugang = zugangAus(s.roh);
    return zugang ? { fuer: s.fuer, zugang } : null;
  } catch { return null; }
}

function inSpeicher(fuer: string, roh: unknown) {
  try { localStorage.setItem(SPEICHER, JSON.stringify({ fuer, roh, am: Date.now() })); } catch { /* voll oder gesperrt */ }
}

function speicherLeeren() {
  try { localStorage.removeItem(SPEICHER); } catch { /* egal */ }
}

/** Die Ansicht als Kunde — nur fuer den Betreiber, nur in diesem Tab. */
export interface Vorschau {
  titel: string;
  zugang: Zugang;
}

interface ZugangStore {
  /** Fuer welches Konto (E-Mail) `zugang` gilt */
  fuer: string | null;
  zugang: Zugang | null;
  /** offen: noch nicht gefragt · laedt · da: frische Antwort · fehler: keine brauchbare Antwort */
  stand: 'offen' | 'laedt' | 'da' | 'fehler';
  geladenAm: number;
  vorschau: Vorschau | null;
  fensterOffen: boolean;
  /** Antwort auf die zuletzt eingeloeste Einladung — fuer das Band */
  einladung: EinladungsAntwort | null;
  /** Antwort auf den zuletzt eingeloesten Early-Adopter-Link — fuer das Band */
  fruehstartAntwort: FruehstartAntwort | null;
  /** Solange ein Link eingeloest wird, wartet die Schranke. */
  loestEin: boolean;
  /** Das Fenster "Feedback geben" — von ueberall erreichbar */
  rueckmeldungOffen: boolean;

  laden: (fuer: string, frisch?: boolean) => Promise<void>;
  linksEinloesen: () => Promise<void>;
  einladungGesehen: () => void;
  fruehstartGesehen: () => void;
  zuruecksetzen: () => void;
  setzeVorschau: (v: Vorschau | null) => void;
  oeffneFenster: () => void;
  schliesseFenster: () => void;
  oeffneRueckmeldung: () => void;
  schliesseRueckmeldung: () => void;
}

/** Der Zugang, nach dem sich die Oberflaeche richtet — beim Betreiber ggf. die Vorschau. */
export const wirksam = (s: Pick<ZugangStore, 'zugang' | 'vorschau'>): Zugang | null =>
  (s.zugang?.betreiber && s.vorschau?.zugang) || s.zugang;

let laufend: { fuer: string; p: Promise<void> } | null = null;
/** Nur die zuletzt gestellte Anfrage darf den Stand setzen. */
let anfrage = 0;
let beobachtet = false;

function beobachten() {
  if (beobachtet || typeof document === 'undefined') return;
  beobachtet = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const s = useZugang.getState();
    if (s.fuer !== null && Date.now() - s.geladenAm > NEU_FRAGEN_MS) void s.laden(s.fuer, true);
  });
}

const gespeichert = typeof window === 'undefined' ? null : ausSpeicher();

export const useZugang = create<ZugangStore>((set, get) => ({
  fuer: gespeichert?.fuer ?? null,
  zugang: gespeichert?.zugang ?? null,
  stand: 'offen',
  geladenAm: 0,
  vorschau: null,
  fensterOffen: false,
  einladung: null,
  fruehstartAntwort: null,
  loestEin: false,
  rueckmeldungOffen: false,

  laden: (fuer, frisch = false) => {
    if (!frisch && laufend?.fuer === fuer) return laufend.p;
    const p = (async () => {
      if (!supabase) return;
      beobachten();
      if (get().fuer !== fuer) {
        // Anderes Konto: nichts vom vorigen uebernehmen.
        set({ fuer, zugang: null, stand: 'laedt', vorschau: null, einladung: null, fruehstartAntwort: null });
      } else if (get().stand === 'offen') {
        set({ stand: 'laedt' });
      }
      const nr = ++anfrage;
      const { data, error } = await supabase.rpc('mein_zugang');
      if (nr !== anfrage || get().fuer !== fuer) return;
      const zugang = error ? null : zugangAus(data);
      if (!zugang) {
        console.warn('Zugang nicht ermittelt — die Schranke laesst durch.', error ?? data);
        set({ stand: 'fehler', geladenAm: Date.now() });
        return;
      }
      inSpeicher(fuer, data);
      set({ zugang, stand: 'da', geladenAm: Date.now() });
    })().finally(() => { if (laufend?.p === p) laufend = null; });
    laufend = { fuer, p };
    return p;
  },

  linksEinloesen: () => {
    // Nur einmal zugleich: Ein zweiter Aufruf bekaeme fuer dasselbe Token
    // "schon_im_buero" — und das Band zeigte die falsche Antwort.
    loesungLaeuft ??= einloesen(set, get).finally(() => { loesungLaeuft = null; });
    return loesungLaeuft;
  },

  einladungGesehen: () => set({ einladung: null }),
  fruehstartGesehen: () => set({ fruehstartAntwort: null }),

  zuruecksetzen: () => {
    speicherLeeren();
    laufend = null;
    anfrage += 1;
    set({
      fuer: null, zugang: null, stand: 'offen', geladenAm: 0, vorschau: null, fensterOffen: false,
      einladung: null, fruehstartAntwort: null, loestEin: false, rueckmeldungOffen: false,
    });
  },

  setzeVorschau: (vorschau) => set({ vorschau, fensterOffen: false }),
  oeffneFenster: () => set({ fensterOffen: true }),
  schliesseFenster: () => set({ fensterOffen: false }),
  oeffneRueckmeldung: () => set({ rueckmeldungOffen: true, fensterOffen: false }),
  schliesseRueckmeldung: () => set({ rueckmeldungOffen: false }),
}));

let loesungLaeuft: Promise<void> | null = null;

type Setzen = (teil: Partial<ZugangStore>) => void;

/**
 * Gemerkte Links einloesen: Einladung ins Buero und Early-Adopter-Zugang.
 * Kommt eine klare Antwort, ist das Token verbraucht — ob angenommen oder
 * nicht; bei einer Stoerung bleibt es fuer den naechsten Versuch.
 */
async function einloesen(set: Setzen, get: () => ZugangStore): Promise<void> {
  if (!supabase) return;
  const sb = supabase;
  const { data: sitzung } = await sb.auth.getSession();
  const konto = (sitzung.session?.user.user_metadata ?? {}) as Record<string, unknown>;
  const einladung = offeneEinladung() ?? (istEinladungsToken(konto.einladung) ? konto.einladung : null);
  const fruehstart = offenerFruehstart() ?? (istEinladungsToken(konto.fruehstart) ? konto.fruehstart : null);
  if (!einladung && !fruehstart) return;

  set({ loestEin: true });
  const ergebnis: Partial<ZugangStore> = {};
  /** Was aus den Kontodaten wieder raus kann */
  const aufraeumen: Record<string, null> = {};
  let neuLaden = false;

  if (einladung) {
    const { data, error } = await sb.rpc('einladung_annehmen', { p_token: einladung });
    if (error) console.warn('Einladung nicht eingeloest', error);
    else {
      einladungVergessen();
      if (konto.einladung != null) aufraeumen.einladung = null;
      ergebnis.einladung = aus(ANTWORTEN, data) ?? 'ungueltig';
      neuLaden ||= ergebnis.einladung === 'ok';
    }
  }
  if (fruehstart) {
    const { data, error } = await sb.rpc('fruehstart_einloesen', { p_token: fruehstart });
    if (error) console.warn('Early-Adopter-Link nicht eingeloest', error);
    else {
      fruehstartVergessen();
      if (konto.fruehstart != null) aufraeumen.fruehstart = null;
      ergebnis.fruehstartAntwort = aus(FRUEHSTART_ANTWORTEN, data) ?? 'ungueltig';
      neuLaden ||= ergebnis.fruehstartAntwort === 'ok';
    }
  }
  if (Object.keys(aufraeumen).length > 0) void sb.auth.updateUser({ data: aufraeumen });
  const fuer = get().fuer;
  if (neuLaden && fuer !== null) await get().laden(fuer, true);
  set({ ...ergebnis, loestEin: false });
}
