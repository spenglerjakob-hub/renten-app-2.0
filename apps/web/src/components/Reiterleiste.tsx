/**
 * Reiterleiste: ruhige Reiter auf Stein, der aktive auf Weiss mit einer
 * Unterkante in Tinte — ohne Grossbuchstaben und Farbe. Waagerecht
 * scrollbar, damit vier Reiter auch auf schmalen Bildschirmen erreichbar
 * bleiben.
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
      className="hide-scrollbar flex overflow-x-auto border-b border-ui-linie bg-ui-innen print:hidden"
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
          className={`min-w-[80px] flex-1 px-2 py-2.5 text-sm font-medium leading-tight transition-colors sm:shrink-0 sm:whitespace-nowrap sm:py-3 ${
            aktiv === r.id
              ? 'border-b-2 border-ui-tinte bg-white text-ui-tinte'
              : 'text-ui-schiefer hover:bg-ui-linie/40 hover:text-ui-tinte'
          }`}
        >
          {r.text}
        </button>
      ))}
    </div>
  );
}
