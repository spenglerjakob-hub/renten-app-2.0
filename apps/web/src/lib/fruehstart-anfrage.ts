/**
 * Die Early-Adopter-Anfrage von der Preisseite (/preise).
 *
 * Die Preisseite spricht beim Laden mit keinem Server; der Supabase-Client
 * kommt erst beim Absenden dazu (dynamischer Import). Geprueft wird zweimal:
 * hier fuer klare Hinweise am Feld, in der Datenbank verbindlich
 * (`fruehstart_anfrage_senden`, Migration …_fruehstart_anfragen.sql).
 */

export interface AnfrageAngaben {
  name: string;
  email: string;
  buero: string;
  /** Leer erlaubt */
  berater: string;
}

export type AnfrageFeld = 'name' | 'email' | 'buero' | 'berater';
export type AnfrageFehler = Partial<Record<AnfrageFeld, string>>;
export type AnfrageErgebnis = 'ok' | 'ungueltig' | 'viele' | 'fehler';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Fehler je Feld — leer, wenn alles passt. Dieselben Grenzen wie in der Datenbank. */
export function anfragePruefen(a: AnfrageAngaben): AnfrageFehler {
  const f: AnfrageFehler = {};
  const name = a.name.trim();
  if (name === '') f.name = 'Bitte geben Sie Ihren Namen an.';
  else if (name.length > 120) f.name = 'Bitte höchstens 120 Zeichen.';
  const email = a.email.trim();
  if (email === '' || email.length > 254 || !EMAIL.test(email)) f.email = 'Bitte prüfen Sie die E-Mail-Adresse.';
  if (a.buero.trim().length > 200) f.buero = 'Bitte höchstens 200 Zeichen.';
  const b = a.berater.trim();
  if (b !== '' && !(/^\d+$/.test(b) && Number(b) >= 1 && Number(b) <= 500)) f.berater = 'Bitte eine Zahl von 1 bis 500.';
  return f;
}

export async function fruehstartAnfrageSenden(a: AnfrageAngaben): Promise<AnfrageErgebnis> {
  try {
    const { supabase } = await import('./supabase');
    if (!supabase) return 'fehler';
    const b = a.berater.trim();
    const { error } = await supabase.rpc('fruehstart_anfrage_senden', {
      p_name: a.name.trim(),
      p_email: a.email.trim(),
      p_buero: a.buero.trim(),
      p_berater: b === '' ? null : Number(b),
    });
    if (!error) return 'ok';
    if (error.code === 'P0001') return 'viele';
    if (error.code === '22023') return 'ungueltig';
    return 'fehler';
  } catch {
    return 'fehler';
  }
}
