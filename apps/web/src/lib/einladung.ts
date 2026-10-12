/**
 * Einladung in ein Buero: `https://js-rentenplaner.de/?einladung=<Token>`.
 *
 * Wer den Link oeffnet, hat oft noch kein Konto — dazwischen liegen
 * Registrierung und Bestaetigungsmail. Deshalb wird das Token beim ersten
 * Aufruf gemerkt (localStorage, 14 Tage) und aus der Adresse genommen;
 * eingeloest wird es erst, wenn jemand angemeldet ist (Zugangsschranke).
 * Bei der Registrierung wandert es zusaetzlich in die Kontodaten — so klappt
 * es auch, wenn die Bestaetigungsmail auf einem anderen Geraet aufgeht.
 *
 * Das Token oeffnet keine Daten: Ob es gilt, fuer wen und ob ein Platz frei
 * ist, entscheidet allein der Server (`einladung_annehmen`).
 */

const SCHLUESSEL = 'rentenplaner.einladung';
const HALTBAR_MS = 14 * 24 * 60 * 60 * 1000;
const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const istEinladungsToken = (t: unknown): t is string => typeof t === 'string' && TOKEN.test(t);

/** Der Link, den der Inhaber weitergibt. */
export const einladungsLink = (token: string) => `${window.location.origin}/?einladung=${token}`;

/** Liest `?einladung=` aus der Adresse, merkt es sich und raeumt die Adresse auf. */
export function einladungAusAdresse(): void {
  try {
    const u = new URL(window.location.href);
    const t = u.searchParams.get('einladung');
    if (t === null) return;
    u.searchParams.delete('einladung');
    window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash);
    if (istEinladungsToken(t)) {
      localStorage.setItem(SCHLUESSEL, JSON.stringify({ token: t.toLowerCase(), am: Date.now() }));
    }
  } catch { /* privates Fenster: dann eben ohne */ }
}

/** Das gemerkte Token — oder null, wenn keins da oder es zu alt ist. */
export function offeneEinladung(): string | null {
  try {
    const roh = localStorage.getItem(SCHLUESSEL);
    if (!roh) return null;
    const { token, am } = JSON.parse(roh) as { token?: unknown; am?: unknown };
    if (istEinladungsToken(token) && typeof am === 'number' && Date.now() - am < HALTBAR_MS) return token;
    localStorage.removeItem(SCHLUESSEL);
    return null;
  } catch { return null; }
}

export function einladungVergessen(): void {
  try { localStorage.removeItem(SCHLUESSEL); } catch { /* egal */ }
}
