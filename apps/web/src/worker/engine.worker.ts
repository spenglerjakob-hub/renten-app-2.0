/// <reference lib="webworker" />
import { projiziere, type Szenario, type ProjektionsErgebnis } from '@renten/engine';

/**
 * Die Engine laeuft im Web Worker.
 *
 * Der Prototyp rechnete alles synchron im Render-Zyklus: Jeder Tastendruck
 * loeste die vollstaendige Neuberechnung inklusive einer 50-Jahres-Schleife
 * aus und blockierte dabei den Hauptthread. Hier bleibt die Oberflaeche
 * bedienbar, waehrend gerechnet wird.
 */

export interface WorkerAnfrage {
  id: number;
  szenario: Szenario;
}

export interface WorkerAntwort {
  id: number;
  ok: true;
  ergebnis: ProjektionsErgebnis;
  dauerMs: number;
}

export interface WorkerFehler {
  id: number;
  ok: false;
  fehler: string;
}

self.onmessage = (e: MessageEvent<WorkerAnfrage>) => {
  const { id, szenario } = e.data;
  const start = performance.now();
  try {
    const ergebnis = projiziere(szenario);
    const antwort: WorkerAntwort = { id, ok: true, ergebnis, dauerMs: performance.now() - start };
    self.postMessage(antwort);
  } catch (err) {
    const antwort: WorkerFehler = {
      id, ok: false,
      fehler: err instanceof Error ? err.message : 'Unbekannter Fehler in der Berechnung',
    };
    self.postMessage(antwort);
  }
};
