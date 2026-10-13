/**
 * Persoenliche Links: die Einladung in ein Buero (`/?einladung=<Token>`) und
 * der Early-Adopter-Zugang (`/?fruehstart=<Token>`).
 *
 * Wer einen solchen Link oeffnet, hat oft noch kein Konto — dazwischen liegen
 * Registrierung und Bestaetigungsmail. Deshalb wird das Token beim ersten
 * Aufruf gemerkt (localStorage, 14 Tage) und aus der Adresse genommen;
 * eingeloest wird es erst, wenn jemand angemeldet ist (Zugangsschranke).
 * Bei der Registrierung wandert es zusaetzlich in die Kontodaten — so klappt
 * es auch, wenn die Bestaetigungsmail auf einem anderen Geraet aufgeht.
 *
 * Ein Token oeffnet keine Daten: Ob es gilt und fuer wen, entscheidet allein
 * der Server (`einladung_annehmen`, `fruehstart_einloesen`).
 */

const HALTBAR_MS = 14 * 24 * 60 * 60 * 1000;
const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const istEinladungsToken = (t: unknown): t is string => typeof t === 'string' && TOKEN.test(t);

function gemerkterLink(parameter: string, schluessel: string) {
  return {
    /** Liest den Parameter aus der Adresse, merkt sich das Token und raeumt die Adresse auf. */
    ausAdresse(): void {
      try {
        const u = new URL(window.location.href);
        const t = u.searchParams.get(parameter);
        if (t === null) return;
        u.searchParams.delete(parameter);
        window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash);
        if (istEinladungsToken(t)) {
          localStorage.setItem(schluessel, JSON.stringify({ token: t.toLowerCase(), am: Date.now() }));
        }
      } catch { /* privates Fenster: dann eben ohne */ }
    },
    /** Das gemerkte Token — oder null, wenn keins da oder es zu alt ist. */
    offen(): string | null {
      try {
        const roh = localStorage.getItem(schluessel);
        if (!roh) return null;
        const { token, am } = JSON.parse(roh) as { token?: unknown; am?: unknown };
        if (istEinladungsToken(token) && typeof am === 'number' && Date.now() - am < HALTBAR_MS) return token;
        localStorage.removeItem(schluessel);
        return null;
      } catch { return null; }
    },
    vergessen(): void {
      try { localStorage.removeItem(schluessel); } catch { /* egal */ }
    },
    link: (token: string) => `${window.location.origin}/?${parameter}=${token}`,
  };
}

const einladung = gemerkterLink('einladung', 'rentenplaner.einladung');
export const einladungAusAdresse = einladung.ausAdresse;
export const offeneEinladung = einladung.offen;
export const einladungVergessen = einladung.vergessen;
/** Der Link, den der Inhaber weitergibt. */
export const einladungsLink = einladung.link;

const fruehstart = gemerkterLink('fruehstart', 'rentenplaner.fruehstart');
export const fruehstartAusAdresse = fruehstart.ausAdresse;
export const offenerFruehstart = fruehstart.offen;
export const fruehstartVergessen = fruehstart.vergessen;
/** Der Link, den der Betreiber einem Early Adopter schickt. */
export const fruehstartLink = fruehstart.link;
