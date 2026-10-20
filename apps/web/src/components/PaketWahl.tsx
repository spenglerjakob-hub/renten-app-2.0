import { useId, useState } from 'react';
import { CreditCard, Minus, Plus } from 'lucide-react';
import {
  PAKETE, MAX_NUTZER, JAHR_MONATE, UST_HINWEIS, paketVon, preisJeNutzer, gesamtpreis, ersparnis, preisJeFall,
  FAELLE_VORGABE, type Intervall, type PaketId,
} from '@renten/schema/preise';

/**
 * Bausteine der Paketwahl: Zahlweise, Nutzerzahl, Preis eines Pakets.
 *
 * Fuer die Preisseite, die Sperrseite und "Abo & Team". Hier
 * steht keine Zahl — gerechnet wird ausschliesslich mit preise.ts aus
 * `@renten/schema`. Beides schlank gehalten, ueber den Unterpfad `/preise`
 * und ohne `components/Feld`: Sonst zoegen Szenario-Pruefung (zod) bzw. die
 * ganze Rechenlogik in die Preisseite.
 */

const euroFormat = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const euroCentFormat = new Intl.NumberFormat('de-DE', {
  style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2,
});
/** Ganze Euro, wenn es keine Cent gibt — sonst mit Cent. */
export const preisText = (n: number) => (Number.isInteger(n) ? euroFormat : euroCentFormat).format(n);

/**
 * WARUM „Empfohlen“ — ein Abzeichen ohne Grund waere nur ein Schubs. Mit
 * Grund kann der Berater selbst pruefen, ob er auf ihn zutrifft.
 */
export const EMPFOHLEN_GRUND = 'wenn Sie Privat- und Firmenkunden beraten';

export function IntervallSchalter({ wert, onWechsel }: { wert: Intervall; onWechsel: (i: Intervall) => void }) {
  const gratis = 12 - JAHR_MONATE;
  return (
    <div role="radiogroup" aria-label="Zahlweise" className="inline-flex max-w-full rounded-lg border border-slate-200 bg-slate-100 p-1">
      {([['monat', 'Monatlich'], ['jahr', 'Jährlich']] as const).map(([id, text]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={wert === id}
          onClick={() => onWechsel(id)}
          // Wird es eng, rutscht "2 Monate gratis" unter "Jaehrlich" statt aus dem Bild.
          className={`flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 rounded-md px-3 py-1.5 text-sm font-bold ${
            wert === id ? 'bg-white text-slate-900 shadow' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          {text}
          {id === 'jahr' && gratis > 0 && (
            <span className="whitespace-nowrap rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-bold text-emerald-700">
              {gratis} Monate gratis
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function NutzerWahl({ wert, onWechsel }: { wert: number; onWechsel: (n: number) => void }) {
  const id = useId();
  const setze = (n: number) => onWechsel(Math.min(MAX_NUTZER, Math.max(1, Math.round(n) || 1)));
  return (
    <div className="inline-flex items-center gap-2">
      <label htmlFor={id} className="text-sm font-bold text-slate-700">Nutzer</label>
      <div className="inline-flex items-center rounded-lg border border-slate-300 bg-white">
        <button
          type="button"
          aria-label="Ein Nutzer weniger"
          onClick={() => setze(wert - 1)}
          disabled={wert <= 1}
          className="rounded-l-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
        >
          <Minus className="h-4 w-4" aria-hidden />
        </button>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_NUTZER}
          value={wert}
          onChange={(e) => setze(Number(e.target.value))}
          className="w-14 border-x border-slate-200 py-1.5 text-center text-sm font-bold tabular-nums [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <button
          type="button"
          aria-label="Ein Nutzer mehr"
          onClick={() => setze(wert + 1)}
          disabled={wert >= MAX_NUTZER}
          className="rounded-r-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

/** Hoechstens so viele Faelle im Monat — darueber waere es kein Beratungsfall mehr, sondern ein Tippfehler. */
const MAX_FAELLE = 200;

/**
 * Faelle im Monat — die Bezugsgroesse fuer den Preis je Fall.
 *
 * DIE ZAHL GEHOERT DEM BERATER. Vorbelegt ist eine vorsichtige Schaetzung
 * (`FAELLE_VORGABE`); je hoeher sie stuende, desto billiger saehe der Fall
 * aus. Deshalb die kleine Zahl und der Hinweis, dass es seine ist.
 */
export function FaelleWahl({ wert, onWechsel, hinweis = 'Ihre Schätzung' }: {
  wert: number;
  onWechsel: (n: number) => void;
  hinweis?: string;
}) {
  const id = useId();
  const setze = (n: number) => onWechsel(Math.min(MAX_FAELLE, Math.max(1, Math.round(n) || 1)));
  return (
    <div className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <label htmlFor={id} className="text-sm font-bold text-slate-700">Fälle im Monat</label>
      <div className="inline-flex items-center rounded-lg border border-slate-300 bg-white">
        <button type="button" aria-label="Ein Fall weniger" onClick={() => setze(wert - 1)} disabled={wert <= 1}
          className="rounded-l-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-30">
          <Minus className="h-4 w-4" aria-hidden />
        </button>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_FAELLE}
          value={wert}
          onChange={(e) => setze(Number(e.target.value))}
          aria-describedby={`${id}-hinweis`}
          className="w-14 border-x border-slate-200 py-1.5 text-center text-sm font-bold tabular-nums [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <button type="button" aria-label="Ein Fall mehr" onClick={() => setze(wert + 1)} disabled={wert >= MAX_FAELLE}
          className="rounded-r-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-30">
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <span id={`${id}-hinweis`} className="text-xs text-slate-500">{hinweis}</span>
    </div>
  );
}

/** „≈ 11,80 € je Beratungsfall bei 5 Fällen im Monat“ — netto, wie alle Preise. */
export function PreisJeFall({ id, intervall, nutzer, faelle, klasse = 'mt-1.5 text-sm text-slate-700' }: {
  id: PaketId; intervall: Intervall; nutzer: number; faelle: number; klasse?: string;
}) {
  return (
    <p className={klasse}>
      ≈ <strong className="tabular-nums">{preisText(preisJeFall(id, intervall, nutzer, faelle))}</strong> je
      Beratungsfall bei {faelle} {faelle === 1 ? 'Fall' : 'Fällen'} im Monat
    </p>
  );
}

/** Preis je Nutzer, Summe fuer das Buero und was der Mengenrabatt spart. */
export function PaketPreis({ id, intervall, nutzer, faelle }: {
  id: PaketId; intervall: Intervall; nutzer: number;
  /** Mit Faellen: dazu der Preis je Beratungsfall */
  faelle?: number;
}) {
  const je = preisJeNutzer(id, intervall, nutzer);
  const summe = gesamtpreis(id, intervall, nutzer);
  const spart = ersparnis(id, intervall, nutzer);
  const zeitraum = intervall === 'jahr' ? 'Jahr' : 'Monat';
  return (
    <div>
      <p className="flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-4xl font-black tabular-nums text-slate-900">{preisText(je)}</span>
        <span className="text-sm text-slate-500">je Nutzer und {zeitraum}</span>
      </p>
      {intervall === 'jahr' && (
        <p className="mt-0.5 text-xs text-slate-500">entspricht {preisText(Math.round((je / 12) * 100) / 100)} im Monat</p>
      )}
      {nutzer > 1 && (
        <p className="mt-1.5 text-sm text-slate-700">
          {nutzer} Nutzer: <strong className="tabular-nums">{preisText(summe)}</strong> im {zeitraum}
        </p>
      )}
      {spart > 0 && (
        <p className="mt-0.5 text-xs font-semibold text-emerald-700">
          Mengenrabatt: {preisText(spart)} gespart im {zeitraum}
        </p>
      )}
      {faelle !== undefined && <PreisJeFall id={id} intervall={intervall} nutzer={nutzer} faelle={faelle} />}
    </div>
  );
}

/**
 * Paket buchen: Zahlweise, Nutzerzahl, Paket — und weiter zur Kasse.
 *
 * Fuer Sperrseite und "Abo & Team". Solange die Zahlung nicht eingerichtet
 * ist (`bereit` falsch), bleibt der Knopf gesperrt; die Wahl laesst sich
 * trotzdem schon ansehen.
 */
export function PaketBuchung({
  bereit, onBuchen, vorauswahl = 'alles', nutzerVorschlag = 1, laedt = false, fehler = null,
  gesperrtText = 'Die Buchung wird gerade eingerichtet und startet in Kürze.', faelleAusKonto,
}: {
  bereit: boolean;
  onBuchen: (paket: PaketId, intervall: Intervall, nutzer: number) => void;
  /** Steht unter dem gesperrten Knopf */
  gesperrtText?: string;
  vorauswahl?: PaketId;
  /** Etwa die Zahl der Mitglieder, wenn ein Buero sein Abo erneuert */
  nutzerVorschlag?: number;
  laedt?: boolean;
  fehler?: string | null;
  /**
   * Gespeicherte Faelle der letzten 30 Tage — eine ECHTE Zahl aus dem Konto
   * statt einer Annahme. Ohne Faelle gilt die vorsichtige Vorgabe.
   */
  faelleAusKonto?: number;
}) {
  const id = useId();
  const [paket, setPaket] = useState<PaketId>(vorauswahl);
  const [intervall, setIntervall] = useState<Intervall>('monat');
  const [nutzer, setNutzer] = useState(() => Math.min(MAX_NUTZER, Math.max(1, nutzerVorschlag)));
  const ausKonto = faelleAusKonto !== undefined && faelleAusKonto > 0;
  const [faelle, setFaelle] = useState(() => (ausKonto ? faelleAusKonto : FAELLE_VORGABE));
  const zeitraum = intervall === 'jahr' ? 'Jahr' : 'Monat';
  const summe = gesamtpreis(paket, intervall, nutzer);
  const spart = ersparnis(paket, intervall, nutzer);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <IntervallSchalter wert={intervall} onWechsel={setIntervall} />
        <NutzerWahl wert={nutzer} onWechsel={setNutzer} />
        <FaelleWahl
          wert={faelle}
          onWechsel={setFaelle}
          hinweis={ausKonto && faelle === faelleAusKonto
            ? `aus Ihrem Konto: ${faelleAusKonto} gespeicherte ${faelleAusKonto === 1 ? 'Fall' : 'Fälle'} in 30 Tagen`
            : 'Ihre Schätzung'}
        />
      </div>

      <div role="radiogroup" aria-label="Paket" className="mt-4 grid gap-2 sm:grid-cols-3">
        {PAKETE.map((p) => {
          const aktiv = p.id === paket;
          // Name ist der Paketname; Beschreibung, Preis und "Empfohlen" kommen als Erlaeuterung dazu.
          const k = `${id}-${p.id}`;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={aktiv}
              aria-labelledby={`${k}-name`}
              aria-describedby={`${k}-preis ${k}-kurz${p.empfohlen ? ` ${k}-tipp` : ''}`}
              onClick={() => setPaket(p.id)}
              className={`relative flex flex-col rounded-xl border-2 p-3 text-left transition-colors ${
                aktiv ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              {p.empfohlen && (
                <span id={`${k}-tipp`} title={EMPFOHLEN_GRUND}
                  className="absolute -top-2.5 right-3 rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-bold text-white">
                  Empfohlen<span className="sr-only">, {EMPFOHLEN_GRUND}</span>
                </span>
              )}
              <span id={`${k}-name`} className="text-sm font-black text-slate-900">{p.name}</span>
              <span id={`${k}-kurz`} className="mt-0.5 text-xs leading-snug text-slate-600">{p.kurz}</span>
              <span id={`${k}-preis`} className="mt-auto flex flex-col pt-2">
                <span className="text-lg font-black tabular-nums text-slate-900">
                  {preisText(preisJeNutzer(p.id, intervall, nutzer))}
                </span>
                <span className="text-xs text-slate-500">je Nutzer und {zeitraum}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
        <p>
          {paketVon(paket).name}, {nutzer} Nutzer:{' '}
          <strong className="tabular-nums text-slate-900">{preisText(summe)}</strong> im {zeitraum}, {UST_HINWEIS}
        </p>
        {spart > 0 && (
          <p className="mt-0.5 text-xs font-semibold text-emerald-700">
            Mengenrabatt: {preisText(spart)} gespart im {zeitraum}
          </p>
        )}
        <PreisJeFall id={paket} intervall={intervall} nutzer={nutzer} faelle={faelle} klasse="mt-0.5 text-xs text-slate-600" />
      </div>

      <button
        type="button"
        onClick={() => onBuchen(paket, intervall, nutzer)}
        disabled={!bereit || laedt}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <CreditCard className="h-4 w-4" aria-hidden />
        {laedt ? 'Einen Moment …' : 'Weiter zur Zahlung'}
      </button>
      {!bereit && <p className="mt-2 text-center text-xs font-semibold text-slate-600">{gesperrtText}</p>}
      {fehler && <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900">{fehler}</p>}
      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        Sie bezahlen sicher über unseren Zahlungsdienstleister Stripe; Rechnungsadresse und USt-IdNr. geben Sie
        dort an. Ein monatliches Abo ist zum Ende des Monats kündbar, ein jährliches zum Ende des Jahres.
        Weitere Kollegen laden Sie nach der Buchung unter „Abo & Team“ ein.
      </p>
    </div>
  );
}
