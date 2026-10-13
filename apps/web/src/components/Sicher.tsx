import { useState } from 'react';

/** Zwei Klicks fuer alles, was sich nicht rueckgaengig machen laesst. */
export function Sicher({ text, frage, ja, onJa, deaktiviert = false }: {
  text: string; frage: string; ja: string; onJa: () => Promise<void>; deaktiviert?: boolean;
}) {
  const [offen, setOffen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  if (!offen) {
    return (
      <button type="button" onClick={() => setOffen(true)} disabled={deaktiviert}
        className="shrink-0 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40">
        {text}
      </button>
    );
  }
  return (
    <span className="flex shrink-0 flex-wrap items-center gap-1.5 text-xs">
      <span className="font-bold text-slate-700">{frage}</span>
      <button type="button" disabled={laeuft}
        onClick={async () => { setLaeuft(true); await onJa(); setLaeuft(false); setOffen(false); }}
        className="rounded-md bg-slate-800 px-2 py-1 font-bold text-white hover:bg-slate-700 disabled:opacity-50">
        {ja}
      </button>
      <button type="button" onClick={() => setOffen(false)}
        className="rounded-md border border-slate-300 px-2 py-1 text-slate-600 hover:bg-slate-50">
        Abbrechen
      </button>
    </span>
  );
}
