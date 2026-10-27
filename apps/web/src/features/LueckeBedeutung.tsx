import { useMemo } from 'react';
import { ArrowRight, Hourglass } from 'lucide-react';
import type { Jahreszeile } from '@renten/engine';
import { useSzenario } from '../store/szenario';
import { euro, prozent } from '../components/Feld';
import { KNOPF_ZWEIT, Posten } from '../components/stil';
import { sparzielRechnen, SPARZIEL_VORGABE } from './sparziel-berechnung';
import { anteilAmNetto } from './bezug';

/**
 * "Was die Luecke fuer Sie bedeutet" — die Bruecke vom Ergebnis zum Sparrechner.
 *
 * Eine Luecke von 3.000 EUR im Jahr 2070 sagt fuer sich wenig: Sie ist
 * nominal, also um Jahrzehnte Inflation aufgeblaeht, und sie nennt nicht, was
 * zu tun waere. Hier steht sie in heutigem Geld, dazu das Kapital, das zum
 * Rentenbeginn noetig waere, und die Sparrate ab heute.
 *
 * Gerechnet wird mit denselben Vorgaben wie im Sparrechner
 * (`sparzielRechnen`, `SPARZIEL_VORGABE`). Die Zahlen stimmen deshalb mit
 * Schritt 3 und dem Gutachten ueberein, solange dort niemand die Annahmen
 * aendert. Ohne Luecke oder ohne Sparzeit entfaellt die Karte.
 */
export function LueckeBedeutung({ zeile, kaufkraftHeute, onSparen, klasse = '', nettoHeute = 0 }: {
  zeile: Jahreszeile;
  /** Das heutige Haushaltsnetto im Monat — die Bezugsgroesse fuer die Sparrate */
  nettoHeute?: number;
  /** Steht die Kopfzahl schon in heutigem Geld, nennt die Karte den nominalen Betrag */
  kaufkraftHeute: boolean;
  onSparen: () => void;
  klasse?: string;
}) {
  const szenario = useSzenario((x) => x.szenario);
  const r = useMemo(() => sparzielRechnen(szenario, zeile, SPARZIEL_VORGABE), [szenario, zeile]);
  if (!r) return null;
  const anteil = anteilAmNetto(r.gewaehlt.startbeitrag, nettoHeute);

  return (
    <section className={`ui-karte p-5 sm:p-7 ${klasse}`}>
      <h3 className="flex items-center gap-2.5 text-lg font-medium tracking-[-0.01em] text-ui-tinte sm:text-xl">
        <Hourglass className="h-4 w-4 shrink-0 text-ui-schiefer" aria-hidden /> Was die Lücke für Sie bedeutet
      </h3>

      {/* Zwei kleine Aufstellungen wie in der Beratung — die zweite fuehrt zur Sparrate. */}
      <dl className="mt-4 text-sm">
        <Posten
          text={kaufkraftHeute ? `Im Jahr ${zeile.jahr} (nominal)` : 'In heutiger Kaufkraft'}
          wert={`${euro(kaufkraftHeute ? r.luecke : r.lueckeHeute)} im Monat`}
        />
        <Posten text="Zeit zum Sparen" wert={`${r.jahreBisRente} Jahre, bis ${zeile.jahr}`} />
      </dl>

      <dl className="mt-3 border-t border-ui-linie pt-3 text-sm">
        <Posten text="Nötiges Kapital zum Rentenbeginn" wert={euro(r.zielkapital)} />
        {/* Mit Bezugsgroesse: was die Rate fuer den Haushalt bedeutet. */}
        <Posten
          text="Sparrate ab heute"
          wert={(
            <>
              <span className="font-medium">{euro(r.gewaehlt.startbeitrag)} im Monat</span>
              {anteil && <span className="block text-xs text-ui-schiefer">= {anteil} Ihres heutigen Nettos von {euro(nettoHeute)}</span>}
            </>
          )}
        />
        {/*
          Die Zahl bleibt — sie ist echt und aus derselben Rechnung. Gesetzt
          ist sie aber sachlich, nicht in Warnrot: Sie soll informieren, nicht
          draengen.
        */}
        <Posten text="Ein Jahr später beginnen" wert={`+ ${euro(r.proJahrWarten.mehrProMonat)} Sparrate im Monat`} />
      </dl>

      <p className="mt-4 text-xs leading-relaxed text-ui-schiefer">
        Bei {prozent(SPARZIEL_VORGABE.rendite)} Rendite nach Kosten, gleichbleibendem Beitrag und{' '}
        {SPARZIEL_VORGABE.auszahldauer} Jahren Auszahlung. Anpassen können Sie das im Sparrechner.
      </p>

      {/* Der zweite Knopf: Die Hauptaktion der Etappe ist „Weiter“ am Ende — sie fuehrt ebenfalls dorthin. */}
      <button type="button" onClick={onSparen} className={`mt-5 w-full print:hidden ${KNOPF_ZWEIT}`}>
        Wie schließe ich die Lücke? <ArrowRight className="h-4 w-4" aria-hidden />
      </button>
    </section>
  );
}
