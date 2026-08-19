import { DatabaseSync } from 'node:sqlite';
import { id, type Datenbank, type Konto, type SzenarioDatensatz } from './kern.js';

/**
 * Persistenz.
 *
 * SQLite fuer Entwicklung und kleine Installationen. Der Zugriff laeuft
 * ausschliesslich ueber das unten definierte Repository-Interface — ein
 * Wechsel auf Postgres beruehrt nur diese Datei.
 */

export function datenbankOeffnen(pfad = process.env.DB_PFAD ?? 'daten.sqlite'): Datenbank {
  const db = new DatabaseSync(pfad);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS konten (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      erstellt_am TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS anmelde_tokens (
      token_hash TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      gueltig_bis INTEGER NOT NULL,
      verbraucht INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sitzungen (
      token_hash TEXT PRIMARY KEY,
      konto_id TEXT NOT NULL REFERENCES konten(id) ON DELETE CASCADE,
      gueltig_bis INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS szenarien (
      id TEXT PRIMARY KEY,
      konto_id TEXT NOT NULL REFERENCES konten(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      daten TEXT NOT NULL,
      schema_version INTEGER NOT NULL,
      erstellt_am TEXT NOT NULL,
      geaendert_am TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_szenarien_konto ON szenarien(konto_id);
    CREATE INDEX IF NOT EXISTS idx_sitzungen_gueltig ON sitzungen(gueltig_bis);
  `);

  const api = {

    kontoPerEmail(email: string): Konto | null {
      const r = db.prepare('SELECT id, email, erstellt_am FROM konten WHERE email = ?').get(email) as
        | { id: string; email: string; erstellt_am: string } | undefined;
      return r ? { id: r.id, email: r.email, erstelltAm: r.erstellt_am } : null;
    },

    kontoAnlegen(email: string): Konto {
      const konto: Konto = { id: id(), email, erstelltAm: new Date().toISOString() };
      db.prepare('INSERT INTO konten (id, email, erstellt_am) VALUES (?, ?, ?)')
        .run(konto.id, konto.email, konto.erstelltAm);
      return konto;
    },

    anmeldeTokenSpeichern(tokenHash: string, email: string, gueltigBis: number) {
      db.prepare('INSERT INTO anmelde_tokens (token_hash, email, gueltig_bis) VALUES (?, ?, ?)')
        .run(tokenHash, email, gueltigBis);
    },

    anmeldeTokenEinloesen(tokenHash: string): string | null {
      const r = db.prepare(
        'SELECT email, gueltig_bis, verbraucht FROM anmelde_tokens WHERE token_hash = ?',
      ).get(tokenHash) as { email: string; gueltig_bis: number; verbraucht: number } | undefined;
      if (!r || r.verbraucht === 1 || r.gueltig_bis < Date.now()) return null;
      db.prepare('UPDATE anmelde_tokens SET verbraucht = 1 WHERE token_hash = ?').run(tokenHash);
      return r.email;
    },

    sitzungAnlegen(tokenHash: string, kontoId: string, gueltigBis: number) {
      db.prepare('INSERT INTO sitzungen (token_hash, konto_id, gueltig_bis) VALUES (?, ?, ?)')
        .run(tokenHash, kontoId, gueltigBis);
    },

    sitzungAufloesen(tokenHash: string): string | null {
      const r = db.prepare('SELECT konto_id, gueltig_bis FROM sitzungen WHERE token_hash = ?')
        .get(tokenHash) as { konto_id: string; gueltig_bis: number } | undefined;
      if (!r || r.gueltig_bis < Date.now()) return null;
      return r.konto_id;
    },

    sitzungBeenden(tokenHash: string) {
      db.prepare('DELETE FROM sitzungen WHERE token_hash = ?').run(tokenHash);
    },

    szenarienListen(kontoId: string): SzenarioDatensatz[] {
      const rows = db.prepare(
        'SELECT id, konto_id, name, daten, schema_version, erstellt_am, geaendert_am FROM szenarien WHERE konto_id = ? ORDER BY geaendert_am DESC',
      ).all(kontoId) as Record<string, string | number>[];
      return rows.map(abbilden);
    },

    szenarioLesen(kontoId: string, szenarioId: string): SzenarioDatensatz | null {
      const r = db.prepare(
        'SELECT id, konto_id, name, daten, schema_version, erstellt_am, geaendert_am FROM szenarien WHERE id = ? AND konto_id = ?',
      ).get(szenarioId, kontoId) as Record<string, string | number> | undefined;
      return r ? abbilden(r) : null;
    },

    szenarioAnlegen(kontoId: string, name: string, daten: string, schemaVersion: number): SzenarioDatensatz {
      const jetzt = new Date().toISOString();
      const neu: SzenarioDatensatz = {
        id: id(), kontoId, name, daten, schemaVersion, erstelltAm: jetzt, geaendertAm: jetzt,
      };
      db.prepare(
        'INSERT INTO szenarien (id, konto_id, name, daten, schema_version, erstellt_am, geaendert_am) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(neu.id, neu.kontoId, neu.name, neu.daten, neu.schemaVersion, neu.erstelltAm, neu.geaendertAm);
      return neu;
    },

    szenarioAktualisieren(kontoId: string, szenarioId: string, name: string, daten: string): boolean {
      const r = db.prepare(
        'UPDATE szenarien SET name = ?, daten = ?, geaendert_am = ? WHERE id = ? AND konto_id = ?',
      ).run(name, daten, new Date().toISOString(), szenarioId, kontoId);
      return Number(r.changes) > 0;
    },

    szenarioLoeschen(kontoId: string, szenarioId: string): boolean {
      const r = db.prepare('DELETE FROM szenarien WHERE id = ? AND konto_id = ?').run(szenarioId, kontoId);
      return Number(r.changes) > 0;
    },

    /** DSGVO: vollstaendige Loeschung eines Kontos samt Szenarien. */
    kontoLoeschen(kontoId: string) {
      db.prepare('DELETE FROM konten WHERE id = ?').run(kontoId);
    },

    aufraeumen() {
      const jetzt = Date.now();
      db.prepare('DELETE FROM sitzungen WHERE gueltig_bis < ?').run(jetzt);
      db.prepare('DELETE FROM anmelde_tokens WHERE gueltig_bis < ?').run(jetzt);
    },

    schliessen() { db.close(); },
  };
  return api;
}

function abbilden(r: Record<string, string | number>): SzenarioDatensatz {
  return {
    id: String(r.id), kontoId: String(r.konto_id), name: String(r.name),
    daten: String(r.daten), schemaVersion: Number(r.schema_version),
    erstelltAm: String(r.erstellt_am), geaendertAm: String(r.geaendert_am),
  };
}
