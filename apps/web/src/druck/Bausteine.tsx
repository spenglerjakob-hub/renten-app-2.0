import { createContext, useContext, type ReactNode } from 'react';

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
 * DER STIL „SELINE“ wie am Bildschirm: Tinte und Schiefer auf weissem Papier,
 * Haarlinien, keine Farbflaechen. Gewicht hoechstens 500, keine Versalien —
 * betont wird durch Gewicht und Tinte, nicht durch Farbe.
 *
 * DIE AKZENTFARBE aus „Ihr Auftritt im Gutachten“ wirkt an genau drei
 * Stellen: am Balken des Deckblatts (`DeckblattKopf.tsx`), an der Linie unter
 * dem Seitentitel und an den Untertiteln. Gesetzt wird sie als CSS-Variable am
 * Gutachten (`akzentVariablen`); ohne sie gilt Tinte. Was etwas bedeutet —
 * das Ergebnis, die Luecke — traegt den Akzent des Stils: die Hervorhebung
 * (`ui-hervor`, `ui-marke`), nie die Farbe des Beraters.
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
        <header className="mb-4 flex items-baseline justify-between gap-4 border-b-2 border-[color:var(--akzent-linie,rgb(var(--ui-tinte)))] pb-1">
          <h2 className="text-base font-medium tracking-[-0.01em] text-ui-tinte">{titel}</h2>
          {nummer && <span className="text-[11px] text-ui-schiefer">{nummer}</span>}
        </header>
      )}
      {children}
    </section>
  );
}

/**
 * Ueberschrift innerhalb einer Seite. Bleibt bei ihrem Absatz.
 *
 * Der obere Abstand ist `mt-4` und nicht `mt-5`: Auf der Angabenseite stehen
 * sechs davon, das waren 24 Punkte allein an Luft zwischen den Bloecken. Die
 * Trennung traegt die Schrift in Tinte ueber dem Schiefer des Texts, nicht
 * der Abstand.
 */
export function Untertitel({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-2 mt-4 break-after-avoid text-[12px] font-medium text-[color:var(--akzent-titel,rgb(var(--ui-tinte)))] first:mt-0">
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
    <div className="flex items-baseline justify-between gap-3 break-inside-avoid border-b border-ui-linie py-1">
      <dt className="text-[12px] text-ui-schiefer">{feld}</dt>
      <dd className="text-right text-[12px] font-medium tabular-nums text-ui-tinte">{wert}</dd>
    </div>
  );
}

/** Ein Kasten auf der Innenflaeche: Aufstellung, Aufschluesselung, Hinweise. */
export const KASTEN = 'break-inside-avoid rounded-[10px] border border-ui-linie bg-ui-innen p-3';
/** Seine Beschriftung — klein, in Schiefer, ohne Versalien. */
export const KASTEN_TITEL = 'mb-2 text-[11px] font-medium text-ui-schiefer';

/** Die Summe einer Aufstellung: Linie und Betrag in Tinte, wie die Posten der Beratung. */
export function Summe({ text, wert }: { text: ReactNode; wert: ReactNode }) {
  return (
    <div className="mt-1 flex items-baseline justify-between border-t border-ui-tinte pt-1">
      <span className="text-[12px] font-medium text-ui-tinte">{text}</span>
      <span className="text-[14px] font-medium tabular-nums text-ui-tinte">{wert}</span>
    </div>
  );
}

/** Zwei Spalten nebeneinander — auf A4 hochkant die brauchbare Aufteilung. */
export function Zweispaltig({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-8 gap-y-1">{children}</div>;
}

/**
 * Die hervorgehobenen Spalten einer Tabelle — die Zeilen lesen sie von hier.
 * Wie am Bildschirm ohne Toenung: Die Marke im Kopf („Meiste“) zeichnet die
 * Spalte aus, ihre Werte stehen in Gewicht 500.
 */
const MarkierteSpalten = createContext<readonly number[]>([]);

/**
 * Tabelle mit wiederholtem Kopf.
 *
 * `table-header-group` sorgt dafuer, dass die Kopfzeile auf jeder Folgeseite
 * erscheint. Ohne das steht auf Seite zwei eine Zahlenwand ohne Beschriftung.
 */
export function Tabelle({
  kopf, spalten, textSpalten, markiert = [], children,
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
  /**
   * Spalten, die das Ergebnis tragen (Index wie in `kopf`): ihre Werte in
   * Gewicht 500, wie die Auszeichnung „Meiste" am Bildschirm.
   */
  markiert?: readonly number[];
  children: ReactNode;
}) {
  const links = (i: number) => i === 0 || (textSpalten?.includes(i) ?? false);
  return (
    <MarkierteSpalten.Provider value={markiert}>
      <table className={`w-full border-collapse text-[11px] ${spalten ? 'table-fixed' : ''}`}>
        {spalten && (
          <colgroup>
            {spalten.map((b, i) => <col key={i} style={{ width: `${b}%` }} />)}
          </colgroup>
        )}
        <thead className="table-header-group">
          <tr className="border-b border-ui-asche">
            {kopf.map((k, i) => (
              <th
                key={i}
                className={`py-1 align-bottom font-medium ${i === 0 ? 'text-ui-schiefer' : 'text-ui-tinte'} ${
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
    </MarkierteSpalten.Provider>
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
  const markiert = useContext(MarkierteSpalten);
  // Wie die Vergleichstabelle am Bildschirm: die Beschriftung in Schiefer, betonte Zeilen ganz in Tinte.
  return (
    <tr className={`break-inside-avoid border-b border-ui-linie text-ui-tinte ${fett ? 'font-medium' : ''}`}>
      {zellen.map((z, i) => (
        <td
          key={i}
          // pr-3 ausser in der letzten Spalte: ohne Abstand stossen eine
          // rechtsbuendige und die folgende linksbuendige Spalte aneinander,
          // und "5 € Beitrag" und "—" lesen sich als ein Wert.
          className={`py-1 align-top ${i < zellen.length - 1 ? 'pr-3' : ''} ${
            links(i) ? 'text-left' : 'text-right tabular-nums'
          } ${i === 0 && !fett ? 'text-ui-schiefer' : ''} ${markiert.includes(i) ? 'font-medium' : ''}`}
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
      <td colSpan={spalten} className="pb-1 pt-3 text-[11px] font-medium text-ui-schiefer">
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
        <span className="block rounded-[6px] border border-ui-linie bg-ui-innen px-2 py-1 text-[10px] leading-relaxed text-ui-tinte">
          {text}
        </span>
      </td>
    </tr>
  );
}

/** Kleine Marke im Spaltenkopf — „★ Meiste", „Günstigste" — wie „Empfohlen" am Bildschirm. */
export function Abzeichen({ children }: { children: ReactNode }) {
  return (
    <span className="mt-0.5 block">
      <span className="ui-marke inline-block whitespace-nowrap px-1.5 py-px text-[9px] font-medium">
        {children}
      </span>
    </span>
  );
}

/**
 * Das Ergebnis einer Seite auf einen Blick: ein ruhiger Kasten mit der Marke
 * „Ergebnis", wie die ausgezeichnete Loesung am Bildschirm. Sachlich
 * formuliert — es fasst die Rechnung zusammen, es empfiehlt kein Produkt.
 */
export function Ergebnis({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 flex break-inside-avoid items-start gap-2.5 rounded-[10px] border border-ui-linie px-3 py-2">
      <span className="ui-marke mt-px shrink-0 px-1.5 py-0.5 text-[9px] font-medium">Ergebnis</span>
      <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-ui-tinte">{children}</p>
    </div>
  );
}

/**
 * Hervorgehobene Kennzahl fuer das Deckblatt und die Ergebnisseite. Ob gut
 * oder schlecht, sagen Zahl und Beschriftung; `ton` zeichnet nur die Zahl
 * aus, um die es geht — mit der Hervorhebung, ohne Ampel.
 */
export function GrosseZahl({
  titel, wert, hinweis, ton = 'neutral',
}: {
  titel: string;
  wert: string;
  hinweis?: string;
  ton?: 'neutral' | 'gut' | 'schlecht';
}) {
  return (
    <div className="break-inside-avoid rounded-[10px] border border-ui-linie bg-white p-3">
      <div className="text-[11px] text-ui-schiefer">{titel}</div>
      <div className="mt-0.5 text-2xl font-medium tabular-nums text-ui-tinte">
        {ton === 'neutral' ? wert : <span className="ui-hervor">{wert}</span>}
      </div>
      {hinweis && <div className="mt-0.5 text-[10px] leading-tight text-ui-schiefer">{hinweis}</div>}
    </div>
  );
}

/** Erklaerender Fliesstext in Schiefer; was er hervorhebt, steht in Tinte. Keine Restzeilen auf der Folgeseite. */
export function Text({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-[11px] leading-relaxed text-ui-schiefer [&_strong]:text-ui-tinte">{children}</p>;
}
