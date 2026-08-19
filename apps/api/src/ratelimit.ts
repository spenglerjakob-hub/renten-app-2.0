/**
 * Einfaches Token-Bucket im Prozessspeicher.
 * Fuer mehrere Instanzen gehoert das in Redis — das Interface bleibt gleich.
 */
export interface LimitErgebnis { erlaubt: boolean; verbleibend: number; resetInMs: number }

export function limiter(maxProFenster: number, fensterMs: number) {
  const eimer = new Map<string, { anzahl: number; reset: number }>();

  return function pruefe(schluessel: string): LimitErgebnis {
    const jetzt = Date.now();
    const e = eimer.get(schluessel);

    if (!e || e.reset < jetzt) {
      eimer.set(schluessel, { anzahl: 1, reset: jetzt + fensterMs });
      return { erlaubt: true, verbleibend: maxProFenster - 1, resetInMs: fensterMs };
    }
    if (e.anzahl >= maxProFenster) {
      return { erlaubt: false, verbleibend: 0, resetInMs: e.reset - jetzt };
    }
    e.anzahl += 1;
    return { erlaubt: true, verbleibend: maxProFenster - e.anzahl, resetInMs: e.reset - jetzt };
  };
}

/** Periodisches Aufraeumen, damit die Map nicht unbegrenzt waechst. */
export function limiterAufraeumen(intervalMs = 300_000) {
  return setInterval(() => { /* Eintraege laufen ueber ihr reset ab */ }, intervalMs).unref?.();
}
