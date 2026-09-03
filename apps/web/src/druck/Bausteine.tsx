import type { ReactNode } from 'react';

/**
 * Bausteine des gedruckten Gutachtens.
 *
 * WARUM EIN EIGENES DOKUMENT: Der Ausdruck war bisher ein Abzug der
 * Bedienoberflaeche. Das kann nicht gut aussehen — eine Eingabemaske besteht
 * aus Formularfeldern, ein Gutachten aus Text und Tabellen. Auf dem Papier
 * standen deshalb leere Eingabekaesten. Hier wird das Dokument eigens gebaut;
 * gerechnet wird nichts neu, alle Zahlen kommen aus demselben Ergebnis, das
 * auch der Bildschirm zeigt.
 *
 * DIE SCHRIFTSTUFEN. Sie stehen als Tailwind-Literale in den einzelnen
 * Bausteinen und Seiten; hier ist die Leiter, an der sie sich ausrichten —
 * sonst laeuft sie beim naechsten Eingriff wieder auseinander:
 *
 *   10 px  Fussnoten, Kachelbeschriftungen, Hinweiszeilen
 *   11 px  Fliesstext (`Text`), Tabellen, Gruppenzeilen
 *   12 px  `Angabe`, `Untertitel`, Inhaltsverzeichnis
 *   14 px  hervorgehobene Zeilen im TUEV-Bogen
 *   16 px  Seitentitel (`text-base`)
 *   24 px  `GrosseZahl` (`text-2xl`)
 *
 * Jede Stufe lag bis dahin einen Punkt tiefer. Das Dokument liest ein
 * Endverbraucher am Kuechentisch, nicht ein Sachbearbeiter am Bildschirm —
 * und der Platz war da: die vollste Seite fuellte 928 von 979 Punkten, die
 * leerste 498.
 */

/**
 * Eine Seite des Gutachtens.
 *
 * `break-before: page` steht auf jeder Seite ausser der ersten. Frueher gab
 * es genau EINEN erzwungenen Umbruch im ganzen Ausdruck; alles andere fiel
 * dorthin, wo der Browser gerade Platz hatte.
 */
export function Seite({
  titel, nummer, erste = false, children,
}: {
  titel?: string;
  /** Kurzer Zusatz neben dem Titel, z. B. der Zeitraum */
  nummer?: string;
  erste?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={erste ? '' : 'break-before-page'}>
      {titel && (
        <header className="mb-4 flex items-baseline justify-between gap-4 border-b-2 border-slate-800 pb-1">
          <h2 className="text-base font-black tracking-tight text-slate-900">{titel}</h2>
          {nummer && <span className="text-[11px] font-medium text-slate-500">{nummer}</span>}
        </header>
      )}
      {children}
    </section>
  );
}

/** Ueberschrift innerhalb einer Seite. Bleibt bei ihrem Absatz. */
export function Untertitel({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-2 mt-5 break-after-avoid text-[12px] font-bold uppercase tracking-wider text-slate-500 first:mt-0">
      {children}
    </h3>
  );
}

/**
 * Ein Feld-Wert-Paar. Ersetzt auf dem Papier das, was auf dem Bildschirm ein
 * Eingabefeld ist.
 */
export function Angabe({ feld, wert }: { feld: string; wert: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 break-inside-avoid border-b border-dotted border-slate-200 py-1">
      <dt className="text-[12px] text-slate-600">{feld}</dt>
      <dd className="text-right text-[12px] font-semibold tabular-nums text-slate-900">{wert}</dd>
    </div>
  );
}

/** Zwei Spalten nebeneinander — auf A4 hochkant die brauchbare Aufteilung. */
export function Zweispaltig({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-8 gap-y-1">{children}</div>;
}

/**
 * Tabelle mit wiederholtem Kopf.
 *
 * `table-header-group` sorgt dafuer, dass die Kopfzeile auf jeder Folgeseite
 * erscheint. Ohne das steht auf Seite zwei eine Zahlenwand ohne Beschriftung.
 */
export function Tabelle({
  kopf, spalten, textSpalten, children,
}: {
  kopf: ReactNode[];
  /** Feste Spaltenbreiten in Prozent — sonst richtet jede Tabelle anders aus */
  spalten?: number[];
  /**
   * Spalten, die TEXT enthalten und deshalb linksbuendig stehen. Vorgabe ist
   * rechtsbuendig ab der zweiten Spalte, weil dort meistens Zahlen stehen —
   * rechtsbuendiger Fliesstext klebt am Nachbarn und liest sich schlecht.
   */
  textSpalten?: number[];
  children: ReactNode;
}) {
  const links = (i: number) => i === 0 || (textSpalten?.includes(i) ?? false);
  return (
    <table className={`w-full border-collapse text-[11px] ${spalten ? 'table-fixed' : ''}`}>
      {spalten && (
        <colgroup>
          {spalten.map((b, i) => <col key={i} style={{ width: `${b}%` }} />)}
        </colgroup>
      )}
      <thead className="table-header-group">
        <tr className="border-b border-slate-400">
          {kopf.map((k, i) => (
            <th
              key={i}
              className={`py-1 font-bold text-slate-700 ${
                i < kopf.length - 1 ? 'pr-3' : ''
              } ${links(i) ? 'text-left' : 'text-right'}`}
            >
              {k}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

export function Zeile({
  zellen, fett = false, textSpalten,
}: {
  zellen: ReactNode[];
  fett?: boolean;
  textSpalten?: number[];
}) {
  const links = (i: number) => i === 0 || (textSpalten?.includes(i) ?? false);
  return (
    <tr className={`break-inside-avoid border-b border-slate-100 ${fett ? 'font-bold' : ''}`}>
      {zellen.map((z, i) => (
        <td
          key={i}
          // pr-3 ausser in der letzten Spalte: ohne Abstand stossen eine
          // rechtsbuendige und die folgende linksbuendige Spalte aneinander,
          // und "5 € Beitrag" und "—" lesen sich als ein Wert.
          className={`py-1 align-top ${i < zellen.length - 1 ? 'pr-3' : ''} ${
            links(i) ? 'text-left' : 'text-right tabular-nums'
          } text-slate-800`}
        >
          {z}
        </td>
      ))}
    </tr>
  );
}

/** Zwischenueberschrift innerhalb einer Tabelle — haelt die Spalten in einer Flucht. */
export function Gruppenzeile({ text, spalten }: { text: string; spalten: number }) {
  return (
    <tr className="break-inside-avoid break-after-avoid">
      <td colSpan={spalten} className="pb-1 pt-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
        {text}
      </td>
    </tr>
  );
}

/**
 * Hinweis unmittelbar unter der Zeile, zu der er gehoert.
 *
 * Als Tabellenzeile ueber alle Spalten und nicht als Kasten daneben: nur so
 * bleibt die Spaltenflucht erhalten, und der Hinweis steht dort, wo man ihn
 * sucht — beim Vertrag, statt in einem Sammelkasten auf einer anderen Seite.
 */
export function Hinweiszeile({ text, spalten }: { text: string; spalten: number }) {
  return (
    <tr className="break-inside-avoid">
      <td colSpan={spalten} className="pb-1">
        <span className="block rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] leading-relaxed text-amber-900">
          {text}
        </span>
      </td>
    </tr>
  );
}

/** Hervorgehobene Kennzahl fuer das Deckblatt und die Ergebnisseite. */
export function GrosseZahl({
  titel, wert, hinweis, ton = 'neutral',
}: {
  titel: string;
  wert: string;
  hinweis?: string;
  ton?: 'neutral' | 'gut' | 'schlecht';
}) {
  const farbe = ton === 'gut' ? 'text-emerald-700 border-emerald-300'
    : ton === 'schlecht' ? 'text-rose-700 border-rose-300'
    : 'text-slate-900 border-slate-300';
  return (
    <div className={`break-inside-avoid rounded-lg border bg-white p-3 ${farbe}`}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{titel}</div>
      <div className="mt-0.5 text-2xl font-black tabular-nums">{wert}</div>
      {hinweis && <div className="mt-0.5 text-[10px] leading-tight text-slate-500">{hinweis}</div>}
    </div>
  );
}

/** Erklaerender Fliesstext. Keine Restzeilen auf der Folgeseite. */
export function Text({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-[11px] leading-relaxed text-slate-600">{children}</p>;
}
