/**
 * Reiterleiste in der Optik des urspruenglichen Entwurfs: Grossbuchstaben,
 * gesperrte Laufweite, der aktive Reiter auf Weiss mit indigofarbener
 * Unterkante. Waagerecht scrollbar, damit vier Reiter auch auf schmalen
 * Bildschirmen erreichbar bleiben.
 */
export function Reiterleiste<T extends string>({
  reiter, aktiv, onWechsel, beschriftung,
}: {
  reiter: readonly { id: T; text: string }[];
  aktiv: T;
  onWechsel: (id: T) => void;
  beschriftung: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={beschriftung}
      className="hide-scrollbar flex overflow-x-auto border-b border-slate-200 bg-slate-50 print:hidden"
    >
      {reiter.map((r) => (
        <button
          key={r.id}
          type="button"
          role="tab"
          aria-selected={aktiv === r.id}
          onClick={() => onWechsel(r.id)}
          className={`min-w-[80px] shrink-0 flex-1 whitespace-nowrap py-2.5 text-[10px] font-bold uppercase tracking-wider transition-colors sm:py-3 sm:text-[11px] ${
            aktiv === r.id
              ? 'border-b-2 border-indigo-700 bg-white text-indigo-700'
              : 'text-slate-500 hover:bg-slate-100/60 hover:text-slate-700'
          }`}
        >
          {r.text}
        </button>
      ))}
    </div>
  );
}
