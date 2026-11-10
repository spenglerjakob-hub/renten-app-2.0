/**
 * ZEITREISE fuer den Probelauf im neuen Jahr.
 *
 * Wird ueber NODE_OPTIONS vorgeladen und verschiebt die Uhr des Prozesses auf
 * das Datum in JW_HEUTE (z. B. 2027-01-15). Die App fragt an vielen Stellen
 * `new Date().getFullYear()` und zieht damit den Rechtsstand des laufenden
 * Jahres — so laesst sich vor Silvester sehen, was am 1. Januar passiert.
 *
 *   JW_HEUTE=2027-01-15 NODE_OPTIONS="--import=/abs/pfad/zeitreise.mjs" pnpm -r test
 *
 * Verschoben wird um einen festen Abstand: Die Uhr laeuft weiter, Zeitmessungen
 * (Timeouts, Dauer) bleiben richtig. Ohne JW_HEUTE tut die Datei nichts.
 */
const ziel = process.env.JW_HEUTE;

if (ziel) {
  const zielZeit = Date.parse(ziel.length === 10 ? `${ziel}T12:00:00` : ziel);
  if (Number.isNaN(zielZeit)) throw new Error(`JW_HEUTE ist kein Datum: ${ziel}`);

  const Echt = globalThis.Date;
  const versatz = zielZeit - Echt.now();

  class Verschoben extends Echt {
    constructor(...args) {
      if (args.length === 0) super(Echt.now() + versatz);
      else super(...args);
    }

    static now() {
      return Echt.now() + versatz;
    }
  }

  globalThis.Date = Verschoben;
}
