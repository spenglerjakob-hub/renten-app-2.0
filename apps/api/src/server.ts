import { serve } from '@hono/node-server';
import { appErzeugen } from './app.js';
import { datenbankOeffnen } from './db-sqlite.js';

const { app, db } = appErzeugen({
  db: datenbankOeffnen(),
  linkVersenden: async (email, token) => {
    // In der Entwicklung wird der Link nur protokolliert. Fuer den Produktiv-
    // betrieb hier den E-Mail-Versand anbinden.
    console.log(`[anmeldung] ${email}: ${process.env.BASIS_URL ?? 'http://localhost:5173'}/anmelden?token=${token}`);
  },
});

setInterval(() => db.aufraeumen(), 3600_000).unref();

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port });
console.log(`renten-api laeuft auf http://localhost:${port}`);
