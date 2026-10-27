import { useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { KNOPF_KLEIN } from './stil';

/**
 * Ein Link zum Weitergeben: Feld zum Markieren und ein Knopf, der ihn in die
 * Zwischenablage legt. `neu` hebt einen gerade erstellten Link mit dem Rand
 * in Cyan hervor — der eine Akzent, statt eines gruenen Kastens.
 */
export function LinkFeld({ link, neu, beschriftung = 'Einladungslink' }: {
  link: string; neu: boolean; beschriftung?: string;
}) {
  const [kopiert, setKopiert] = useState(false);
  const feld = useRef<HTMLInputElement>(null);
  const kopieren = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setKopiert(true);
      window.setTimeout(() => setKopiert(false), 2000);
    } catch {
      // Ohne Zugriff auf die Zwischenablage: markieren, dann kopiert man selbst.
      feld.current?.select();
    }
  };
  return (
    <div className="flex w-full gap-1.5">
      <input
        ref={feld} readOnly value={link} aria-label={beschriftung} onFocus={(e) => e.currentTarget.select()}
        className={`ui-feld min-w-0 flex-1 px-2.5 py-1.5 font-mono text-xs ${neu ? 'border-ui-knopf-rand ring-1 ring-ui-knopf-rand' : ''}`}
      />
      <button type="button" onClick={() => void kopieren()} className={KNOPF_KLEIN}>
        {kopiert ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
        {kopiert ? 'Kopiert' : 'Kopieren'}
      </button>
    </div>
  );
}
