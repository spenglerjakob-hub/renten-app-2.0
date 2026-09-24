import { euro, prozent } from '../components/Feld';
import type { SparzielErgebnis, SparzielEingaben } from '../features/sparziel-berechnung';
import { Seite, Untertitel, Tabelle, Zeile, GrosseZahl, Text } from './Bausteine';

/**
 * "Was Sie jetzt tun koennen" — die Luecke als Monatsbetrag.
 *
 * Das Gutachten stellte bisher nur fest, DASS eine Luecke besteht. Diese
 * Seite beantwortet die Frage, die der Leser danach hat: was muss ich
 * zuruecklegen? Sie nennt eine Groessenordnung und kein Produkt — was mit
 * dem Betrag zu tun ist, gehoert ins Gespraech, nicht in eine Modellrechnung.
 */
export function Sparziel({
  ergebnis, eingaben, rentenjahr, inflation,
}: {
  ergebnis: SparzielErgebnis;
  eingaben: SparzielEingaben;
  rentenjahr: number;
  inflation: number;
}) {
  const r = ergebnis;

  return (
    <Seite
      titel="Was Sie jetzt tun können"
      nummer={`Bei ${prozent(eingaben.rendite)} Rendite nach Kosten`}
    >
      <div className="grid grid-cols-3 gap-3">
        <GrosseZahl
          titel={`Es fehlen im Jahr ${rentenjahr}`}
          wert={euro(r.luecke)}
          ton="schlecht"
          hinweis={`monatlich · in heutigem Geld ${euro(r.lueckeHeute)}`}
        />
        <GrosseZahl
          titel="Dafür nötiges Kapital"
          wert={euro(r.zielkapital)}
          hinweis={`bei Rentenbeginn, für ${eingaben.auszahldauer} Jahre`}
        />
        <GrosseZahl
          titel="Ihr Startbeitrag"
          wert={euro(r.gewaehlt.startbeitrag)}
          ton="gut"
          hinweis={`im Monat, ${r.jahreBisRente} Jahre lang`}
        />
      </div>

      {/*
        Die Dynamik ist der Kern dieser Seite: derselbe Betrag am Ende, aber
        ein deutlich kleinerer Einstieg. Eine Tabelle zeigt den Handel in
        einem Blick, eine einzelne Zahl verschweigt ihn.
      */}
      <Untertitel>Mit oder ohne Beitragsdynamik</Untertitel>
      <Tabelle
        kopf={[
          'Ihr Beitrag steigt jährlich um',
          'Start heute',
          'Im letzten Sparjahr',
          'Summe aller Beiträge',
        ]}
        spalten={[34, 20, 23, 23]}
      >
        {r.varianten.map((v) => (
          <Zeile
            key={v.dynamik}
            fett={Math.abs(v.dynamik - eingaben.dynamik) < 1e-9}
            zellen={[
              v.dynamik === 0 ? 'gleichbleibender Beitrag' : prozent(v.dynamik),
              euro(v.startbeitrag),
              euro(v.endbeitrag),
              euro(v.summeBeitraege),
            ]}
          />
        ))}
      </Tabelle>

      <Text>
        <strong>Wie diese Tabelle zu lesen ist.</strong> Alle vier Zeilen führen zum selben
        Kapital von {euro(r.zielkapital)}. Sie unterscheiden sich nur darin, wie die Last über die
        Jahre verteilt wird: Wer den Beitrag jährlich steigen lässt, beginnt mit deutlich weniger
        — bei {prozent(0.03)} Dynamik mit {euro(r.varianten[1]?.startbeitrag ?? 0)} statt{' '}
        {euro(r.varianten[0]?.startbeitrag ?? 0)} — zahlt dafür am Ende mehr. Weil das Gehalt über
        dieselben Jahre meist ebenfalls steigt, fühlt sich ein dynamischer Beitrag durchgehend
        gleich schwer an.
      </Text>

      {/*
        Die eindringlichste Zahl des ganzen Gutachtens: Wer spaeter beginnt,
        zahlt mehr im Monat UND ueber die kuerzere Zeit trotzdem mehr
        insgesamt. Beides gehoert nebeneinander, sonst wirkt nur die halbe
        Aussage.
      */}
      {r.aufschub.length > 1 && (
        <>
          <Untertitel>Was es kostet, damit zu warten</Untertitel>
          <Tabelle
            kopf={[
              'Wenn Sie beginnen',
              'Sparjahre',
              'Startbeitrag',
              'Summe aller Beiträge',
              'Mehr als heute',
            ]}
            spalten={[26, 14, 18, 22, 20]}
          >
            {r.aufschub.map((a) => (
              <Zeile
                key={a.wartenJahre}
                fett={a.wartenJahre === 0}
                zellen={[
                  a.wartenJahre === 0 ? 'heute' : `in ${a.wartenJahre} Jahren`,
                  `${a.sparjahre}`,
                  euro(a.startbeitrag),
                  euro(a.summeBeitraege),
                  a.wartenJahre === 0 ? '—' : `+ ${euro(a.mehrGesamt)}`,
                ]}
              />
            ))}
          </Tabelle>

          {/*
            DIE KERNAUSSAGE DER SEITE, deshalb als Kasten und nicht als
            Fliesstext: zwei Zahlen, die man sich merkt, und darunter der
            Grund. Als Absatz ging sie unter der Tabelle unter.
          */}
          <div className="mt-3 break-inside-avoid rounded-lg border-2 border-amber-400 bg-amber-50 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
              Was Warten kostet — je Jahr Aufschub
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-4">
              <div>
                <div className="text-2xl font-black tabular-nums text-amber-900">
                  + {euro(r.proJahrWarten.mehrProMonat)}
                </div>
                <div className="text-[11px] text-amber-900">mehr Beitrag im Monat</div>
              </div>
              <div>
                <div className="text-2xl font-black tabular-nums text-amber-900">
                  + {euro(r.proJahrWarten.mehrGesamt)}
                </div>
                <div className="text-[11px] text-amber-900">mehr insgesamt — trotz kürzerer Sparzeit</div>
              </div>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-slate-800">
              {/* Die beiden Betraege stehen gross darueber; der Satz erklaert
                  nur noch, warum. */}
              Das wirkt zunächst widersprüchlich: Wer später beginnt, zahlt über <em>weniger</em> Jahre und
              am Ende trotzdem <em>mehr</em>. Der Grund ist der Zinseszins — die Jahre am Anfang
              sind die wertvollsten, weil ihre Erträge am längsten mitarbeiten. Wer sie
              verstreichen lässt, muss den fehlenden Ertrag aus eigener Tasche nachlegen.
            </p>
          </div>

          <Text>
            Die Summen sind nominal addiert. Wer später beginnt, zahlt seine Beiträge in
            späteren und damit etwas weniger wertvollen Euro — der Effekt ist real, fällt aber
            eine Spur kleiner aus, als die rohe Differenz aussehen lässt.
          </Text>
        </>
      )}

      <Untertitel>Worauf die Rechnung beruht</Untertitel>
      <Text>
        Angenommen sind <strong>{prozent(eingaben.rendite)}</strong> Rendite pro Jahr{' '}
        <strong>nach Kosten</strong> — was ein Vertrag an Gebühren nimmt, ist also schon
        abgezogen zu denken. Das Kapital wird ab Rentenbeginn über{' '}
        <strong>{eingaben.auszahldauer} Jahre</strong> verbraucht; die Entnahme wächst mit{' '}
        {prozent(inflation)} Inflation mit, damit sie über die gesamte Zeit dieselbe Kaufkraft
        hat. Die Abgeltungsteuer auf den Ertragsanteil der Entnahme ist bereits berücksichtigt.
      </Text>

      <Text>
        Diese Seite nennt eine <strong>Größenordnung</strong>, keine Produktempfehlung. Welcher
        Weg dorthin der richtige ist — geförderte Vorsorge, betriebliche Lösung oder freies
        Sparen — hängt an Ihrer Steuerlast, Ihrem Arbeitgeber und Ihrer Lebensplanung und gehört
        ins persönliche Gespräch.
      </Text>
    </Seite>
  );
}
