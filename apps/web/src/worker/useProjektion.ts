import { useEffect, useRef, useState } from 'react';
import type { Szenario, ProjektionsErgebnis } from '@renten/engine';
import type { WorkerAnfrage, WorkerAntwort, WorkerFehler } from './engine.worker.js';

export interface ProjektionsStatus {
  ergebnis: ProjektionsErgebnis | null;
  rechnet: boolean;
  fehler: string | null;
  dauerMs: number;
}

/**
 * Rechnet das Szenario entprellt im Worker.
 * Das zuletzt gueltige Ergebnis bleibt sichtbar, solange neu gerechnet wird —
 * die Oberflaeche flackert dadurch nicht bei jeder Eingabe.
 */
export function useProjektion(szenario: Szenario, entprellMs = 150): ProjektionsStatus {
  const [status, setStatus] = useState<ProjektionsStatus>({
    ergebnis: null, rechnet: true, fehler: null, dauerMs: 0,
  });
  const workerRef = useRef<Worker | null>(null);
  const anfrageId = useRef(0);

  useEffect(() => {
    const w = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = w;
    w.onmessage = (e: MessageEvent<WorkerAntwort | WorkerFehler>) => {
      // Veraltete Antworten verwerfen
      if (e.data.id !== anfrageId.current) return;
      if (e.data.ok) {
        setStatus({ ergebnis: e.data.ergebnis, rechnet: false, fehler: null, dauerMs: e.data.dauerMs });
      } else {
        setStatus((s) => ({ ...s, rechnet: false, fehler: e.data.ok ? null : (e.data as WorkerFehler).fehler }));
      }
    };
    return () => { w.terminate(); workerRef.current = null; };
  }, []);

  useEffect(() => {
    setStatus((s) => ({ ...s, rechnet: true }));
    const t = setTimeout(() => {
      const w = workerRef.current;
      if (!w) return;
      const id = ++anfrageId.current;
      const anfrage: WorkerAnfrage = { id, szenario };
      w.postMessage(anfrage);
    }, entprellMs);
    return () => clearTimeout(t);
  }, [szenario, entprellMs]);

  return status;
}
