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
      className="hide-scrollbar flex overflow-x-auto border-b border-indigo-200 bg-indigo-100/50 print:hidden"
    >
      {/* Am Telefon duerfen die Reiter umbrechen: Einzeilig wurde
          „Bestehende Vertraege pruefen“ rechts abgeschnitten. */}
      {reiter.map((r) => (
        <button
          key={r.id}
          type="button"
          role="tab"
          aria-selected={aktiv === r.id}
          onClick={() => onWechsel(r.id)}
          className={`min-w-[80px] flex-1 px-2 py-2.5 text-[11px] font-bold uppercase leading-tight tracking-wider transition-colors sm:shrink-0 sm:whitespace-nowrap sm:py-3 ${
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
