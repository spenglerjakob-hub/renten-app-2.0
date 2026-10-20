import { supabase } from './supabase';

/**
 * Early Adopter und Rueckmeldungen — duenne Huellen um die Funktionen der
 * Datenbank (Migrationen …_fruehstart.sql, …_fruehstart_teilnehmer.sql). Wer
 * was darf, pruefen die Funktionen selbst: Links und Teilnehmer sieht nur der
 * Betreiber, Rueckmeldungen schickt jedes angemeldete Konto, lesen kann sie
 * nur der Betreiber.
 */

export interface FruehstartLink {
  token: string;
  notiz: string;
  erstelltAm: string;
  gueltigBis: string;
  eingeloestAm: string | null;
  /** Wer eingeloest hat */
  email: string | null;
}

export interface FruehstartTeilnehmer {
  email: string;
  /** Notiz des Links, ueber den er kam */
  notiz: string;
  seit: string;
  /** Ende der kostenlosen Zeit — null, solange der Start offen ist */
  bis: string | null;
  rueckmeldungen: number;
  letzteRueckmeldung: string | null;
}

export interface Rueckmeldung {
  id: string;
  erstelltAm: string;
  email: string;
  bewertung: number | null;
  text: string;
  kontaktOk: boolean;
  seite: string;
  fruehstarter: boolean;
}

const text = (v: unknown) => (typeof v === 'string' ? v : '');

export async function fruehstartLinksLaden(): Promise<FruehstartLink[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('fruehstart_links');
  if (error || !Array.isArray(data)) return null;
  return (data as Record<string, unknown>[]).map((l) => ({
    token: text(l.token),
    notiz: text(l.notiz),
    erstelltAm: text(l.erstellt_am),
    gueltigBis: text(l.gueltig_bis),
    eingeloestAm: text(l.eingeloest_am) || null,
    email: text(l.email) || null,
  }));
}

export async function fruehstartTeilnehmerLaden(): Promise<FruehstartTeilnehmer[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('fruehstart_teilnehmer');
  if (error || !Array.isArray(data)) return null;
  return (data as Record<string, unknown>[]).map((t) => ({
    email: text(t.email),
    notiz: text(t.notiz),
    seit: text(t.seit),
    bis: text(t.bis) || null,
    rueckmeldungen: Number(t.rueckmeldungen) || 0,
    letzteRueckmeldung: text(t.letzte_rueckmeldung) || null,
  }));
}

export async function fruehstartLinkErstellen(notiz: string): Promise<{ token: string } | { fehler: string }> {
  if (!supabase) return { fehler: 'Die Anmeldung ist nicht eingerichtet.' };
  const { data, error } = await supabase.rpc('fruehstart_link_erstellen', { p_notiz: notiz });
  if (error || typeof data !== 'string') {
    return { fehler: error?.code === '42501' ? 'Links erstellt nur der Betreiber.' : 'Das hat nicht geklappt. Bitte noch einmal.' };
  }
  return { token: data };
}

export async function fruehstartLinkZurueckziehen(token: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.rpc('fruehstart_link_zurueckziehen', { p_token: token });
  return !error;
}

export async function rueckmeldungSenden(r: {
  bewertung: number | null; text: string; kontaktOk: boolean; seite: string;
}): Promise<true | { fehler: string }> {
  if (!supabase) return { fehler: 'Die Anmeldung ist nicht eingerichtet.' };
  const { error } = await supabase.rpc('rueckmeldung_senden', {
    p_bewertung: r.bewertung, p_text: r.text, p_kontakt_ok: r.kontaktOk, p_seite: r.seite,
  });
  if (!error) return true;
  if ((error.message ?? '').includes('Zu viele')) {
    return { fehler: 'Heute sind schon zehn Rückmeldungen von Ihnen eingegangen — vielen Dank! Morgen geht es weiter.' };
  }
  return { fehler: 'Das hat nicht geklappt. Bitte versuchen Sie es noch einmal.' };
}

export async function rueckmeldungenLaden(): Promise<Rueckmeldung[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('rueckmeldungen');
  if (error || !Array.isArray(data)) return null;
  return (data as Record<string, unknown>[]).map((r) => ({
    id: text(r.id),
    erstelltAm: text(r.erstellt_am),
    email: text(r.email),
    bewertung: typeof r.bewertung === 'number' ? r.bewertung : null,
    text: text(r.text),
    kontaktOk: r.kontakt_ok === true,
    seite: text(r.seite),
    fruehstarter: r.fruehstarter === true,
  }));
}

/** Eine Early-Adopter-Anfrage von der Preisseite — nur der Betreiber sieht sie. */
export interface FruehstartAnfrage {
  id: string;
  erstelltAm: string;
  name: string;
  email: string;
  buero: string;
  berater: number | null;
  status: 'offen' | 'zugesagt' | 'abgesagt';
  entschiedenAm: string | null;
  /** Token des persoenlichen Links nach der Zusage */
  link: string | null;
  linkGueltigBis: string | null;
  eingeloestAm: string | null;
}

export async function fruehstartAnfragenLaden(): Promise<FruehstartAnfrage[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('fruehstart_anfragen');
  if (error || !Array.isArray(data)) return null;
  return (data as Record<string, unknown>[]).map((a) => ({
    id: text(a.id),
    erstelltAm: text(a.erstellt_am),
    name: text(a.name),
    email: text(a.email),
    buero: text(a.buero),
    berater: typeof a.berater === 'number' ? a.berater : null,
    status: a.status === 'zugesagt' || a.status === 'abgesagt' ? a.status : 'offen',
    entschiedenAm: text(a.entschieden_am) || null,
    link: text(a.link) || null,
    linkGueltigBis: text(a.link_gueltig_bis) || null,
    eingeloestAm: text(a.eingeloest_am) || null,
  }));
}

/** Zusagen: legt den persoenlichen Link an (oder liefert den noch gueltigen) und gibt sein Token zurueck. */
export async function fruehstartAnfrageZusagen(id: string): Promise<{ token: string } | { fehler: string }> {
  if (!supabase) return { fehler: 'Die Anmeldung ist nicht eingerichtet.' };
  const { data, error } = await supabase.rpc('fruehstart_anfrage_zusagen', { p_id: id });
  if (error || typeof data !== 'string') {
    return { fehler: error?.code === '42501' ? 'Zusagen kann nur der Betreiber.' : 'Das hat nicht geklappt. Bitte noch einmal.' };
  }
  return { token: data };
}

export async function fruehstartAnfrageAbsagen(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.rpc('fruehstart_anfrage_absagen', { p_id: id });
  return !error;
}
