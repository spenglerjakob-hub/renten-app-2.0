import { useEffect, useRef, useState } from 'react';
import type { Szenario, ProjektionsErgebnis } from '@renten/engine';
import type { WorkerAnfrage, WorkerAntwort, WorkerFehler } from './engine.worker.js';

export interface ProjektionsStatus {
  ergebnis: ProjektionsErgebnis | null;
  rechnet: boolean;
  fehler: string | null;
  dauerMs: number;
}

const NICHTS: ProjektionsStatus = { ergebnis: null, rechnet: false, fehler: null, dauerMs: 0 };

/**
 * Rechnet das Szenario entprellt im Worker.
 * Das zuletzt gueltige Ergebnis bleibt sichtbar, solange neu gerechnet wird —
 * die Oberflaeche flackert dadurch nicht bei jeder Eingabe.
 *
 * Ohne Szenario (`null`) rechnet nichts, und der Worker entsteht erst mit dem
 * ersten Szenario: Das Ergebnis mit den angenommenen Loesungen braucht
 * seinen eigenen Lauf nur, wenn etwas angenommen ist.
 */
export function useProjektion(szenario: Szenario | null, entprellMs = 150): ProjektionsStatus {
  const [status, setStatus] = useState<ProjektionsStatus>(() => ({ ...NICHTS, rechnet: szenario !== null }));
  const workerRef = useRef<Worker | null>(null);
  const anfrageId = useRef(0);

  useEffect(() => () => { workerRef.current?.terminate(); workerRef.current = null; }, []);

  useEffect(() => {
    if (!szenario) {
      // Eine Antwort, die noch unterwegs ist, gilt nicht mehr.
      anfrageId.current++;
      setStatus((s) => (s === NICHTS ? s : NICHTS));
      return;
    }
    setStatus((s) => ({ ...s, rechnet: true }));
    const t = setTimeout(() => {
      if (!workerRef.current) {
        const w = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
        w.onmessage = (e: MessageEvent<WorkerAntwort | WorkerFehler>) => {
          // Veraltete Antworten verwerfen
          if (e.data.id !== anfrageId.current) return;
          if (e.data.ok) {
            setStatus({ ergebnis: e.data.ergebnis, rechnet: false, fehler: null, dauerMs: e.data.dauerMs });
          } else {
            setStatus((s) => ({ ...s, rechnet: false, fehler: e.data.ok ? null : (e.data as WorkerFehler).fehler }));
          }
        };
        workerRef.current = w;
      }
      const id = ++anfrageId.current;
      const anfrage: WorkerAnfrage = { id, szenario };
      workerRef.current.postMessage(anfrage);
    }, entprellMs);
    return () => clearTimeout(t);
  }, [szenario, entprellMs]);

  return status;
}
