import { test } from 'node:test';
import assert from 'node:assert/strict';
import { datenbankOeffnen } from '../dist/db-sqlite.js';
import { speicherDatenbank } from '../dist/db-memory.js';

/**
 * Vertragstest: Beide Adapter muessen sich identisch verhalten.
 *
 * Laeuft ueber node:test statt vitest, weil vitest eine Vite-Version buendelt,
 * die node:sqlite noch nicht als eingebautes Modul kennt.
 */
const adapter = [
  ['SQLite', () => datenbankOeffnen(':memory:')],
  ['Speicher', () => speicherDatenbank()],
];

for (const [name, erzeuge] of adapter) {
  test(`${name}: Konten und Sitzungen`, () => {
    const db = erzeuge();
    assert.equal(db.kontoPerEmail('x@y.de'), null);

    const k = db.kontoAnlegen('x@y.de');
    assert.equal(db.kontoPerEmail('x@y.de').id, k.id);

    db.sitzungAnlegen('hash1', k.id, Date.now() + 10000);
    assert.equal(db.sitzungAufloesen('hash1'), k.id);

    db.sitzungAnlegen('abgelaufen', k.id, Date.now() - 1);
    assert.equal(db.sitzungAufloesen('abgelaufen'), null);

    db.sitzungBeenden('hash1');
    assert.equal(db.sitzungAufloesen('hash1'), null);
    db.schliessen();
  });

  test(`${name}: Anmeldetoken ist einmalig`, () => {
    const db = erzeuge();
    db.anmeldeTokenSpeichern('t1', 'a@b.de', Date.now() + 10000);
    assert.equal(db.anmeldeTokenEinloesen('t1'), 'a@b.de');
    assert.equal(db.anmeldeTokenEinloesen('t1'), null, 'zweites Einloesen muss scheitern');

    db.anmeldeTokenSpeichern('t2', 'a@b.de', Date.now() - 1);
    assert.equal(db.anmeldeTokenEinloesen('t2'), null, 'abgelaufener Token');
    db.schliessen();
  });

  test(`${name}: Szenarien sind an ihr Konto gebunden`, () => {
    const db = erzeuge();
    const a = db.kontoAnlegen('a@b.de');
    const b = db.kontoAnlegen('b@b.de');
    const s = db.szenarioAnlegen(a.id, 'Plan A', '{"schemaVersion":1}', 1);

    assert.equal(db.szenarioLesen(a.id, s.id).name, 'Plan A');
    assert.equal(db.szenarioLesen(b.id, s.id), null, 'fremdes Konto darf nicht lesen');
    assert.equal(db.szenarioAktualisieren(b.id, s.id, 'Gekapert', '{}'), false);
    assert.equal(db.szenarioLoeschen(b.id, s.id), false);
    assert.equal(db.szenarienListen(a.id).length, 1, 'Original unveraendert');

    assert.equal(db.szenarioAktualisieren(a.id, s.id, 'Plan B', '{"schemaVersion":1}'), true);
    assert.equal(db.szenarioLesen(a.id, s.id).name, 'Plan B');
    assert.equal(db.szenarioLoeschen(a.id, s.id), true);
    assert.equal(db.szenarienListen(a.id).length, 0);
    db.schliessen();
  });

  test(`${name}: Kontoloeschung entfernt alle Szenarien (DSGVO)`, () => {
    const db = erzeuge();
    const k = db.kontoAnlegen('weg@b.de');
    db.szenarioAnlegen(k.id, 'Eins', '{}', 1);
    db.szenarioAnlegen(k.id, 'Zwei', '{}', 1);
    assert.equal(db.szenarienListen(k.id).length, 2);

    db.kontoLoeschen(k.id);
    assert.equal(db.kontoPerEmail('weg@b.de'), null);
    assert.equal(db.szenarienListen(k.id).length, 0);
    db.schliessen();
  });

  test(`${name}: aufraeumen entfernt abgelaufene Eintraege`, () => {
    const db = erzeuge();
    const k = db.kontoAnlegen('c@b.de');
    db.sitzungAnlegen('alt', k.id, Date.now() - 1000);
    db.sitzungAnlegen('neu', k.id, Date.now() + 100000);
    db.aufraeumen();
    assert.equal(db.sitzungAufloesen('neu'), k.id);
    db.schliessen();
  });
}
