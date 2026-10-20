import { useMemo } from 'react';
import { ArrowRight, Hourglass } from 'lucide-react';
import type { Jahreszeile } from '@renten/engine';
import { useSzenario } from '../store/szenario';
import { euro, prozent } from '../components/Feld';
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
    <section className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${klasse}`}>
      <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
        <Hourglass className="h-4 w-4 shrink-0 text-slate-500" aria-hidden /> Was die Lücke für Sie bedeutet
      </h3>

      <dl className="mt-3 space-y-2 text-sm">
        <Posten
          label={kaufkraftHeute ? `Im Jahr ${zeile.jahr} (nominal)` : 'In heutiger Kaufkraft'}
          wert={`${euro(kaufkraftHeute ? r.luecke : r.lueckeHeute)} im Monat`}
        />
        <Posten label="Zeit zum Sparen" wert={`${r.jahreBisRente} Jahre, bis ${zeile.jahr}`} />
      </dl>

      <dl className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-sm">
        <Posten label="Nötiges Kapital zum Rentenbeginn" wert={euro(r.zielkapital)} />
        {/* Mit Bezugsgroesse: was die Rate fuer den Haushalt bedeutet. */}
        <Posten
          label="Sparrate ab heute"
          wert={`${euro(r.gewaehlt.startbeitrag)} im Monat`}
          ton="betont"
          zusatz={anteil ? `= ${anteil} Ihres heutigen Nettos von ${euro(nettoHeute)}` : undefined}
        />
        {/*
          Die Zahl bleibt — sie ist echt und aus derselben Rechnung. Gesetzt
          ist sie aber sachlich, nicht in Warnrot: Sie soll informieren, nicht
          draengen.
        */}
        <Posten label="Ein Jahr später beginnen" wert={`+ ${euro(r.proJahrWarten.mehrProMonat)} Sparrate im Monat`} />
      </dl>

      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        Bei {prozent(SPARZIEL_VORGABE.rendite)} Rendite nach Kosten, gleichbleibendem Beitrag und{' '}
        {SPARZIEL_VORGABE.auszahldauer} Jahren Auszahlung. Anpassen können Sie das im Sparrechner.
      </p>

      <button
        type="button"
        onClick={onSparen}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-500 print:hidden"
      >
        Wie schließe ich die Lücke? <ArrowRight className="h-4 w-4" aria-hidden />
      </button>
    </section>
  );
}

function Posten({ label, wert, ton, zusatz }: { label: string; wert: string; ton?: 'betont'; zusatz?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-slate-600">{label}</dt>
      <dd className={`min-w-0 text-right font-bold tabular-nums ${
        ton === 'betont' ? 'text-indigo-700' : 'text-slate-900'
      }`}>
        {wert}
        {zusatz && <span className="block text-xs font-normal text-slate-500">{zusatz}</span>}
      </dd>
    </div>
  );
}
