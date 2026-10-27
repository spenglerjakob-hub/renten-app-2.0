import { useState } from 'react';
import { KNOPF_KLEIN, KNOPF_KLEIN_GEFAHR } from './stil';

/**
 * Zwei Klicks fuer alles, was sich nicht rueckgaengig machen laesst. Das
 * „Ja“ steht in Rot wie jedes Loeschen — der erste Knopf bleibt leise.
 */
export function Sicher({ text, frage, ja, onJa, deaktiviert = false }: {
  text: string; frage: string; ja: string; onJa: () => Promise<void>; deaktiviert?: boolean;
}) {
  const [offen, setOffen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  if (!offen) {
    return (
      <button type="button" onClick={() => setOffen(true)} disabled={deaktiviert} className={KNOPF_KLEIN}>
        {text}
      </button>
    );
  }
  return (
    <span className="flex shrink-0 flex-wrap items-center gap-1.5 text-xs">
      <span className="font-medium text-ui-tinte">{frage}</span>
      <button type="button" disabled={laeuft}
        onClick={async () => { setLaeuft(true); await onJa(); setLaeuft(false); setOffen(false); }}
        className={KNOPF_KLEIN_GEFAHR}>
        {ja}
      </button>
      <button type="button" onClick={() => setOffen(false)} className={KNOPF_KLEIN}>
        Abbrechen
      </button>
    </span>
  );
}
