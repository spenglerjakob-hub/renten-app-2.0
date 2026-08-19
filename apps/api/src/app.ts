import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { szenarioSchema } from '@renten/schema';
import { tokenErzeugen, tokenHashen, type Datenbank } from './kern.js';
import { limiter } from './ratelimit.js';

const SITZUNG_COOKIE = 'renten_sitzung';
const SITZUNG_DAUER_MS = 30 * 24 * 3600 * 1000;
const ANMELDE_DAUER_MS = 15 * 60 * 1000;
const MAX_SZENARIEN = 50;
const MAX_KOERPER_BYTES = 256 * 1024;

const anmeldeSchema = z.object({ email: z.string().email().max(254) });
const speicherSchema = z.object({
  name: z.string().min(1).max(120),
  szenario: szenarioSchema,
});

export interface AppOptionen {
  /** Persistenz-Adapter. Der produktive wird in server.ts gewaehlt. */
  db: Datenbank;
  /** Versand des Magic Link. In Tests wird der Token stattdessen zurueckgegeben. */
  linkVersenden?: (email: string, token: string) => Promise<void> | void;
  tokenImResponse?: boolean;
}

export function appErzeugen(opts: AppOptionen): { app: Hono; db: Datenbank } {
  const db = opts.db;
  const app = new Hono();

  const anmeldeLimit = limiter(5, 15 * 60 * 1000);
  const schreibLimit = limiter(120, 60 * 1000);

  const ip = (c: Context) =>
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'lokal';

  /** Sitzungs-Token aus Cookie oder Authorization-Header. */
  function sitzungsToken(c: Context): string | null {
    const roh = c.req.header('cookie') ?? '';
    const treffer = new RegExp(`(?:^|;\\s*)${SITZUNG_COOKIE}=([^;]+)`).exec(roh);
    return treffer?.[1] ?? c.req.header('authorization')?.replace(/^Bearer\s+/i, '') ?? null;
  }

  /** Loest die Sitzung zum Konto auf. Ohne gueltige Sitzung: null. */
  function kontoAus(c: Context): string | null {
    const token = sitzungsToken(c);
    if (!token) return null;
    return db.sitzungAufloesen(tokenHashen(token));
  }

  app.get('/api/gesundheit', (c) => c.json({ ok: true, dienst: 'renten-api' }));

  // --- Anmeldung per Magic Link: keine Passwoerter, also keine Hashes zu verlieren ---

  app.post('/api/anmeldung/anfordern', async (c) => {
    const l = anmeldeLimit(ip(c));
    if (!l.erlaubt) return c.json({ fehler: 'Zu viele Anfragen. Bitte spaeter erneut versuchen.' }, 429);

    const body = await c.req.json().catch(() => null);
    const r = anmeldeSchema.safeParse(body);
    if (!r.success) return c.json({ fehler: 'Bitte eine gueltige E-Mail-Adresse angeben.' }, 400);

    const email = r.data.email.toLowerCase();
    const token = tokenErzeugen();
    db.anmeldeTokenSpeichern(tokenHashen(token), email, Date.now() + ANMELDE_DAUER_MS);
    await opts.linkVersenden?.(email, token);

    // Immer dieselbe Antwort — sonst liesse sich abfragen, welche Adressen registriert sind.
    return c.json({ ok: true, ...(opts.tokenImResponse ? { token } : {}) });
  });

  app.post('/api/anmeldung/einloesen', async (c) => {
    const body = await c.req.json().catch(() => null);
    const token = typeof body?.token === 'string' ? body.token : null;
    if (!token) return c.json({ fehler: 'Token fehlt.' }, 400);

    const email = db.anmeldeTokenEinloesen(tokenHashen(token));
    if (!email) return c.json({ fehler: 'Der Anmeldelink ist abgelaufen oder wurde bereits benutzt.' }, 401);

    const konto = db.kontoPerEmail(email) ?? db.kontoAnlegen(email);
    const sitzung = tokenErzeugen();
    db.sitzungAnlegen(tokenHashen(sitzung), konto.id, Date.now() + SITZUNG_DAUER_MS);

    c.header(
      'Set-Cookie',
      `${SITZUNG_COOKIE}=${sitzung}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SITZUNG_DAUER_MS / 1000}`,
    );
    return c.json({ ok: true, konto: { id: konto.id, email: konto.email } });
  });

  app.post('/api/abmeldung', async (c) => {
    const token = sitzungsToken(c);
    if (token) db.sitzungBeenden(tokenHashen(token));
    c.header('Set-Cookie', `${SITZUNG_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
    return c.json({ ok: true });
  });

  // --- Szenarien ---

  app.get('/api/szenarien', async (c) => {
    const konto = kontoAus(c);
    if (!konto) return c.json({ fehler: 'Nicht angemeldet.' }, 401);
    return c.json({
      szenarien: db.szenarienListen(konto).map((s) => ({
        id: s.id, name: s.name, schemaVersion: s.schemaVersion,
        erstelltAm: s.erstelltAm, geaendertAm: s.geaendertAm,
      })),
    });
  });

  app.get('/api/szenarien/:id', async (c) => {
    const konto = kontoAus(c);
    if (!konto) return c.json({ fehler: 'Nicht angemeldet.' }, 401);
    const s = db.szenarioLesen(konto, c.req.param('id'));
    // Bewusst 404 statt 403: Ein fremdes Szenario soll sich nicht einmal
    // als existierend erkennen lassen.
    if (!s) return c.json({ fehler: 'Szenario nicht gefunden.' }, 404);
    return c.json({ id: s.id, name: s.name, szenario: JSON.parse(s.daten), geaendertAm: s.geaendertAm });
  });

  app.post('/api/szenarien', async (c) => {
    const konto = kontoAus(c);
    if (!konto) return c.json({ fehler: 'Nicht angemeldet.' }, 401);
    if (!schreibLimit(konto).erlaubt) return c.json({ fehler: 'Zu viele Schreibvorgaenge.' }, 429);

    const laenge = Number(c.req.header('content-length') ?? 0);
    if (laenge > MAX_KOERPER_BYTES) return c.json({ fehler: 'Szenario ist zu gross.' }, 413);

    if (db.szenarienListen(konto).length >= MAX_SZENARIEN) {
      return c.json({ fehler: `Es sind hoechstens ${MAX_SZENARIEN} Szenarien moeglich.` }, 409);
    }

    const body = await c.req.json().catch(() => null);
    const r = speicherSchema.safeParse(body);
    if (!r.success) {
      return c.json({ fehler: 'Szenario ungueltig.', details: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }, 400);
    }

    const neu = db.szenarioAnlegen(konto, r.data.name, JSON.stringify(r.data.szenario), r.data.szenario.schemaVersion);
    return c.json({ id: neu.id, name: neu.name, geaendertAm: neu.geaendertAm }, 201);
  });

  app.put('/api/szenarien/:id', async (c) => {
    const konto = kontoAus(c);
    if (!konto) return c.json({ fehler: 'Nicht angemeldet.' }, 401);
    if (!schreibLimit(konto).erlaubt) return c.json({ fehler: 'Zu viele Schreibvorgaenge.' }, 429);

    const body = await c.req.json().catch(() => null);
    const r = speicherSchema.safeParse(body);
    if (!r.success) {
      return c.json({ fehler: 'Szenario ungueltig.', details: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }, 400);
    }

    const ok = db.szenarioAktualisieren(konto, c.req.param('id'), r.data.name, JSON.stringify(r.data.szenario));
    if (!ok) return c.json({ fehler: 'Szenario nicht gefunden.' }, 404);
    return c.json({ ok: true });
  });

  app.delete('/api/szenarien/:id', async (c) => {
    const konto = kontoAus(c);
    if (!konto) return c.json({ fehler: 'Nicht angemeldet.' }, 401);
    const ok = db.szenarioLoeschen(konto, c.req.param('id'));
    if (!ok) return c.json({ fehler: 'Szenario nicht gefunden.' }, 404);
    return c.json({ ok: true });
  });

  /** DSGVO: Konto und alle Daten loeschen. */
  app.delete('/api/konto', async (c) => {
    const konto = kontoAus(c);
    if (!konto) return c.json({ fehler: 'Nicht angemeldet.' }, 401);
    db.kontoLoeschen(konto);
    c.header('Set-Cookie', `${SITZUNG_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
    return c.json({ ok: true });
  });

  return { app, db };
}
