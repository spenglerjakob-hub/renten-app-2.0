import { useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';

/**
 * Ein Link zum Weitergeben: Feld zum Markieren und ein Knopf, der ihn in die
 * Zwischenablage legt. `neu` hebt einen gerade erstellten Link hervor.
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
        className={`min-w-0 flex-1 rounded-md border px-2 py-1.5 font-mono text-xs text-slate-700 ${
          neu ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300 bg-white'
        }`}
      />
      <button type="button" onClick={() => void kopieren()}
        className="flex shrink-0 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50">
        {kopiert ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
        {kopiert ? 'Kopiert' : 'Kopieren'}
      </button>
    </div>
  );
}
