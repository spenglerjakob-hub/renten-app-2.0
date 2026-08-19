import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { appErzeugen } from '../src/app.js';
import { speicherDatenbank } from '../src/db-memory.js';
import type { Datenbank } from '../src/kern.js';
import { szenarioSchema } from '@renten/schema';

const beispiel = szenarioSchema.parse({
  schemaVersion: 1,
  haushalt: { verheiratet: false, bundesland: 'Berlin', kirchensteuer: false, hatKinder: false, kinderUnter25: 0, kvStatus: 'kvdr', pkvPraemieMonat: 0, zielNettoHeute: 2000 },
  annahmen: { inflation: 0.02, rentendynamik: 0.01, tarifIndex: 0.01, gehaltsdynamik: 0.02 },
  einkommenHeute: { modus: 'brutto', betrag: 4000, auszahlungen: 12, besoldungsgruppe: 'A13', besoldungsstufe: 4, besoldungsland: 'Bund' },
  personen: [{ id: 'A', name: 'Test', geburtsdatum: '01.01.1985', rentenbeginn: '01.01.2052', art: 'grv', grvBruttoHeute: 1500, besoldungsgruppe: 'A13', besoldungsstufe: 8, ruhegehaltssatz: 71.75, dienstbeginn: '01.01.2020', teilzeitphasen: [] }],
  vertraege: [],
  planer: { startkapital: 0, dauerJahre: 25, rendite: 0.02, dynamik: 0, insNettoEinrechnen: false },
});

let db: Datenbank;
let app: ReturnType<typeof appErzeugen>['app'];

async function anmelden(email = 'test@example.de'): Promise<string> {
  const r1 = await app.request('/api/anmeldung/anfordern', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const { token } = await r1.json() as { token: string };
  const r2 = await app.request('/api/anmeldung/einloesen', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  const cookie = r2.headers.get('set-cookie')!;
  return cookie.split(';')[0]!;
}

const mitCookie = (c: string, init: RequestInit = {}): RequestInit => ({
  ...init,
  headers: { 'content-type': 'application/json', cookie: c, ...(init.headers ?? {}) },
});

beforeEach(() => {
  db = speicherDatenbank();
  app = appErzeugen({ db, tokenImResponse: true }).app;
});
afterEach(() => db.schliessen());

describe('Anmeldung', () => {
  it('legt beim ersten Einloesen ein Konto an', async () => {
    const cookie = await anmelden();
    expect(cookie).toContain('renten_sitzung=');
    expect(db.kontoPerEmail('test@example.de')).not.toBeNull();
  });

  it('setzt das Sitzungscookie HttpOnly und SameSite', async () => {
    const r1 = await app.request('/api/anmeldung/anfordern', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.de' }),
    });
    const { token } = await r1.json() as { token: string };
    const r2 = await app.request('/api/anmeldung/einloesen', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }),
    });
    const c = r2.headers.get('set-cookie')!;
    expect(c).toContain('HttpOnly');
    expect(c).toContain('SameSite=Lax');
    expect(c).toContain('Secure');
  });

  it('laesst einen Anmeldetoken nur einmal einloesen', async () => {
    const r1 = await app.request('/api/anmeldung/anfordern', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'einmal@example.de' }),
    });
    const { token } = await r1.json() as { token: string };
    const body = JSON.stringify({ token });
    const ers = await app.request('/api/anmeldung/einloesen', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    expect(ers.status).toBe(200);
    const zweit = await app.request('/api/anmeldung/einloesen', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    expect(zweit.status).toBe(401);
  });

  it('verraet nicht, ob eine Adresse registriert ist', async () => {
    const a = await app.request('/api/anmeldung/anfordern', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'neu@example.de' }) });
    const b = await app.request('/api/anmeldung/anfordern', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'test@example.de' }) });
    expect(a.status).toBe(b.status);
  });

  it('begrenzt die Anmeldeversuche', async () => {
    const anfrage = () => app.request('/api/anmeldung/anfordern', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '9.9.9.9' },
      body: JSON.stringify({ email: 'flut@example.de' }),
    });
    for (let i = 0; i < 5; i++) expect((await anfrage()).status).toBe(200);
    expect((await anfrage()).status).toBe(429);
  });
});

describe('Szenarien', () => {
  it('erfordert eine Anmeldung', async () => {
    expect((await app.request('/api/szenarien')).status).toBe(401);
  });

  it('legt an, liest, aendert und loescht', async () => {
    const cookie = await anmelden();

    const anlegen = await app.request('/api/szenarien', mitCookie(cookie, {
      method: 'POST', body: JSON.stringify({ name: 'Mein Plan', szenario: beispiel }),
    }));
    expect(anlegen.status).toBe(201);
    const { id } = await anlegen.json() as { id: string };

    const lesen = await app.request(`/api/szenarien/${id}`, mitCookie(cookie));
    expect(lesen.status).toBe(200);
    const gelesen = await lesen.json() as { name: string; szenario: unknown };
    expect(gelesen.name).toBe('Mein Plan');
    expect(gelesen.szenario).toEqual(beispiel);

    const aendern = await app.request(`/api/szenarien/${id}`, mitCookie(cookie, {
      method: 'PUT', body: JSON.stringify({ name: 'Umbenannt', szenario: beispiel }),
    }));
    expect(aendern.status).toBe(200);

    const loeschen = await app.request(`/api/szenarien/${id}`, mitCookie(cookie, { method: 'DELETE' }));
    expect(loeschen.status).toBe(200);
    expect((await app.request(`/api/szenarien/${id}`, mitCookie(cookie))).status).toBe(404);
  });

  it('weist ungueltige Szenarien mit Feldangabe zurueck', async () => {
    const cookie = await anmelden();
    const kaputt = { ...beispiel, personen: [{ ...beispiel.personen[0]!, geburtsdatum: '99.99.9999' }] };
    const r = await app.request('/api/szenarien', mitCookie(cookie, {
      method: 'POST', body: JSON.stringify({ name: 'Kaputt', szenario: kaputt }),
    }));
    expect(r.status).toBe(400);
    const body = await r.json() as { details: string[] };
    expect(body.details.join(' ')).toContain('geburtsdatum');
  });

  it('meldet fremde Szenarien als nicht gefunden, nicht als verboten', async () => {
    const cookieA = await anmelden('a@example.de');
    const angelegt = await app.request('/api/szenarien', mitCookie(cookieA, {
      method: 'POST', body: JSON.stringify({ name: 'Privat', szenario: beispiel }),
    }));
    const { id } = await angelegt.json() as { id: string };

    const cookieB = await anmelden('b@example.de');
    const fremd = await app.request(`/api/szenarien/${id}`, mitCookie(cookieB));
    // 404 statt 403: sonst waere die Existenz fremder Szenarien abfragbar.
    expect(fremd.status).toBe(404);

    const loeschVersuch = await app.request(`/api/szenarien/${id}`, mitCookie(cookieB, { method: 'DELETE' }));
    expect(loeschVersuch.status).toBe(404);
    expect(db.szenarienListen(db.kontoPerEmail('a@example.de')!.id)).toHaveLength(1);
  });

  it('speichert nur Eingaben, keine Ergebnisse', async () => {
    const cookie = await anmelden();
    const r = await app.request('/api/szenarien', mitCookie(cookie, {
      method: 'POST', body: JSON.stringify({ name: 'X', szenario: beispiel }),
    }));
    const { id } = await r.json() as { id: string };
    const satz = db.szenarioLesen(db.kontoPerEmail('test@example.de')!.id, id)!;
    const gespeichert = JSON.parse(satz.daten);
    expect(Object.keys(gespeichert).sort()).toEqual(
      ['annahmen', 'einkommenHeute', 'haushalt', 'personen', 'planer', 'schemaVersion', 'vertraege'],
    );
  });
});

describe('Konto loeschen (DSGVO)', () => {
  it('entfernt Konto und alle Szenarien', async () => {
    const cookie = await anmelden('weg@example.de');
    await app.request('/api/szenarien', mitCookie(cookie, {
      method: 'POST', body: JSON.stringify({ name: 'Weg', szenario: beispiel }),
    }));
    const kontoId = db.kontoPerEmail('weg@example.de')!.id;
    expect(db.szenarienListen(kontoId)).toHaveLength(1);

    const r = await app.request('/api/konto', mitCookie(cookie, { method: 'DELETE' }));
    expect(r.status).toBe(200);
    expect(db.kontoPerEmail('weg@example.de')).toBeNull();
    expect(db.szenarienListen(kontoId)).toHaveLength(0);
  });
});

describe('Kein Rechenendpunkt', () => {
  it('bietet bewusst keine serverseitige Berechnung an', async () => {
    for (const pfad of ['/api/calculate', '/api/berechnen', '/api/projektion']) {
      expect((await app.request(pfad, { method: 'POST' })).status).toBe(404);
    }
  });
});
