import { id, type Datenbank, type Konto, type SzenarioDatensatz } from './kern.js';

/**
 * Speicherresidente Implementierung des Datenbank-Interfaces.
 *
 * Verwendung: Tests und lokale Entwicklung ohne Persistenz. Weil die API
 * ausschliesslich gegen `Datenbank` programmiert, testet sie damit ihre
 * eigentliche Logik — Anmeldung, Eigentumspruefung, Validierung, Limits —
 * ohne von einem konkreten Treiber abzuhaengen.
 *
 * Der produktive Adapter (SQLite in db.ts, spaeter Postgres) wird beim
 * Zusammenbau in server.ts gewaehlt und braucht einen eigenen
 * Integrationstest, sobald die Zieldatenbank feststeht.
 */
export function speicherDatenbank(): Datenbank {
  const konten = new Map<string, Konto>();
  const kontenNachEmail = new Map<string, string>();
  const anmeldeTokens = new Map<string, { email: string; gueltigBis: number; verbraucht: boolean }>();
  const sitzungen = new Map<string, { kontoId: string; gueltigBis: number }>();
  const szenarien = new Map<string, SzenarioDatensatz>();

  return {
    kontoPerEmail(email) {
      const kid = kontenNachEmail.get(email);
      return kid ? konten.get(kid) ?? null : null;
    },
    kontoAnlegen(email) {
      const k: Konto = { id: id(), email, erstelltAm: new Date().toISOString() };
      konten.set(k.id, k);
      kontenNachEmail.set(email, k.id);
      return k;
    },
    anmeldeTokenSpeichern(hash, email, gueltigBis) {
      anmeldeTokens.set(hash, { email, gueltigBis, verbraucht: false });
    },
    anmeldeTokenEinloesen(hash) {
      const t = anmeldeTokens.get(hash);
      if (!t || t.verbraucht || t.gueltigBis < Date.now()) return null;
      t.verbraucht = true;
      return t.email;
    },
    sitzungAnlegen(hash, kontoId, gueltigBis) { sitzungen.set(hash, { kontoId, gueltigBis }); },
    sitzungAufloesen(hash) {
      const s = sitzungen.get(hash);
      return s && s.gueltigBis >= Date.now() ? s.kontoId : null;
    },
    sitzungBeenden(hash) { sitzungen.delete(hash); },

    szenarienListen(kontoId) {
      return [...szenarien.values()]
        .filter((s) => s.kontoId === kontoId)
        .sort((a, b) => b.geaendertAm.localeCompare(a.geaendertAm));
    },
    szenarioLesen(kontoId, szenarioId) {
      const s = szenarien.get(szenarioId);
      return s && s.kontoId === kontoId ? s : null;
    },
    szenarioAnlegen(kontoId, name, daten, schemaVersion) {
      const jetzt = new Date().toISOString();
      const s: SzenarioDatensatz = { id: id(), kontoId, name, daten, schemaVersion, erstelltAm: jetzt, geaendertAm: jetzt };
      szenarien.set(s.id, s);
      return s;
    },
    szenarioAktualisieren(kontoId, szenarioId, name, daten) {
      const s = szenarien.get(szenarioId);
      if (!s || s.kontoId !== kontoId) return false;
      szenarien.set(szenarioId, { ...s, name, daten, geaendertAm: new Date().toISOString() });
      return true;
    },
    szenarioLoeschen(kontoId, szenarioId) {
      const s = szenarien.get(szenarioId);
      if (!s || s.kontoId !== kontoId) return false;
      szenarien.delete(szenarioId);
      return true;
    },
    kontoLoeschen(kontoId) {
      const k = konten.get(kontoId);
      if (k) kontenNachEmail.delete(k.email);
      konten.delete(kontoId);
      for (const [sid, s] of szenarien) if (s.kontoId === kontoId) szenarien.delete(sid);
      for (const [h, s] of sitzungen) if (s.kontoId === kontoId) sitzungen.delete(h);
    },
    aufraeumen() {
      const jetzt = Date.now();
      for (const [h, s] of sitzungen) if (s.gueltigBis < jetzt) sitzungen.delete(h);
      for (const [h, t] of anmeldeTokens) if (t.gueltigBis < jetzt) anmeldeTokens.delete(h);
    },
    schliessen() { /* nichts zu tun */ },
  };
}
