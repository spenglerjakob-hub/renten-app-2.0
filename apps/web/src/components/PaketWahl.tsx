import { useId, useState } from 'react';
import { CreditCard, Minus, Plus } from 'lucide-react';
import {
  PAKETE, MAX_NUTZER, JAHR_MONATE, UST_HINWEIS, paketVon, preisJeNutzer, gesamtpreis, ersparnis,
  type Intervall, type PaketId,
} from '@renten/schema/preise';
import { FEHLER, KNOPF } from './stil';

/**
 * Bausteine der Paketwahl: Zahlweise, Nutzerzahl, Preis eines Pakets.
 *
 * Fuer die Preisseite, die Sperrseite und "Abo & Team". Hier
 * steht keine Zahl — gerechnet wird ausschliesslich mit preise.ts aus
 * `@renten/schema`. Beides schlank gehalten, ueber den Unterpfad `/preise`
 * und ohne `components/Feld`: Sonst zoegen Szenario-Pruefung (zod) bzw. die
 * ganze Rechenlogik in die Preisseite. Der Stil kommt aus `./stil` — der
 * zieht nichts nach.
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
    <div role="radiogroup" aria-label="Zahlweise" className="inline-flex max-w-full gap-1 rounded-full border border-ui-linie bg-ui-karte p-1">
      {([['monat', 'Monatlich'], ['jahr', 'Jährlich']] as const).map(([id, text]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={wert === id}
          onClick={() => onWechsel(id)}
          // Wird es eng, rutscht "2 Monate gratis" unter "Jaehrlich" statt aus dem Bild.
          className={`flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            wert === id ? 'bg-ui-dunkel text-white' : 'text-ui-schiefer hover:text-ui-tinte'
          }`}
        >
          {text}
          {id === 'jahr' && gratis > 0 && (
            <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
              wert === id ? 'bg-white/15 text-white' : 'bg-ui-innen text-ui-tinte'
            }`}>
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
      <label htmlFor={id} className="text-sm font-medium text-ui-tinte">Nutzer</label>
      <div className="inline-flex items-center rounded-full border border-ui-feld-rand bg-white">
        <button
          type="button"
          aria-label="Ein Nutzer weniger"
          onClick={() => setze(wert - 1)}
          disabled={wert <= 1}
          className="rounded-l-full py-2 pl-3 pr-2 text-ui-schiefer hover:bg-ui-innen hover:text-ui-tinte disabled:opacity-30"
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
          className="w-14 border-x border-ui-linie py-1.5 text-center text-sm font-medium tabular-nums text-ui-tinte [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <button
          type="button"
          aria-label="Ein Nutzer mehr"
          onClick={() => setze(wert + 1)}
          disabled={wert >= MAX_NUTZER}
          className="rounded-r-full py-2 pl-2 pr-3 text-ui-schiefer hover:bg-ui-innen hover:text-ui-tinte disabled:opacity-30"
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

/**
 * Preis je Nutzer, Summe fuer das Buero und was der Mengenrabatt spart.
 * `akzent`: der Preis des empfohlenen Pakets, hervorgehoben wie die Zahl im
 * Kernsatz der Mitarbeiterberatung.
 */
export function PaketPreis({ id, intervall, nutzer, akzent = false }: {
  id: PaketId; intervall: Intervall; nutzer: number; akzent?: boolean;
}) {
  const je = preisJeNutzer(id, intervall, nutzer);
  const summe = gesamtpreis(id, intervall, nutzer);
  const spart = ersparnis(id, intervall, nutzer);
  const zeitraum = intervall === 'jahr' ? 'Jahr' : 'Monat';
  return (
    <div>
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="ui-titel text-[40px] font-normal leading-none tabular-nums text-ui-tinte">
          {akzent ? <span className="ui-hervor">{preisText(je)}</span> : preisText(je)}
        </span>
        <span className="text-sm text-ui-schiefer">je Nutzer und {zeitraum}</span>
      </p>
      {intervall === 'jahr' && (
        <p className="mt-2 text-xs text-ui-schiefer">entspricht {preisText(Math.round((je / 12) * 100) / 100)} im Monat</p>
      )}
      {nutzer > 1 && (
        <p className="mt-3 text-sm text-ui-tinte">
          {nutzer} Nutzer: <strong className="font-medium tabular-nums">{preisText(summe)}</strong> im {zeitraum}
        </p>
      )}
      {spart > 0 && (
        <p className="mt-0.5 text-xs text-ui-schiefer">
          Mengenrabatt: <span className="font-medium text-ui-tinte">{preisText(spart)}</span> gespart im {zeitraum}
        </p>
      )}
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
  gesperrtText = 'Die Buchung wird gerade eingerichtet und startet in Kürze.',
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
}) {
  const id = useId();
  const [paket, setPaket] = useState<PaketId>(vorauswahl);
  const [intervall, setIntervall] = useState<Intervall>('monat');
  const [nutzer, setNutzer] = useState(() => Math.min(MAX_NUTZER, Math.max(1, nutzerVorschlag)));
  const zeitraum = intervall === 'jahr' ? 'Jahr' : 'Monat';
  const summe = gesamtpreis(paket, intervall, nutzer);
  const spart = ersparnis(paket, intervall, nutzer);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <IntervallSchalter wert={intervall} onWechsel={setIntervall} />
        <NutzerWahl wert={nutzer} onWechsel={setNutzer} />
      </div>

      <div role="radiogroup" aria-label="Paket" className="mt-6 grid gap-3 sm:grid-cols-3">
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
              className={`relative flex flex-col rounded-[10px] border-2 bg-white p-4 text-left transition-colors ${
                aktiv ? 'border-ui-tinte' : 'border-ui-linie hover:border-ui-feld-rand'
              }`}
            >
              {p.empfohlen && (
                <span id={`${k}-tipp`} title={EMPFOHLEN_GRUND}
                  className="ui-marke absolute -top-2.5 right-3 px-2 py-0.5 text-xs font-medium">
                  Empfohlen<span className="sr-only">, {EMPFOHLEN_GRUND}</span>
                </span>
              )}
              <span id={`${k}-name`} className="text-base font-medium text-ui-tinte">{p.name}</span>
              <span id={`${k}-kurz`} className="mt-1 text-xs leading-snug text-ui-schiefer">{p.kurz}</span>
              <span id={`${k}-preis`} className="mt-auto flex flex-col pt-4">
                <span className="ui-titel text-[28px] font-normal leading-none tabular-nums text-ui-tinte">
                  {preisText(preisJeNutzer(p.id, intervall, nutzer))}
                </span>
                <span className="mt-1 text-xs text-ui-schiefer">je Nutzer und {zeitraum}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="ui-innen mt-6 px-4 py-3 text-sm text-ui-tinte">
        <p>
          {paketVon(paket).name}, {nutzer} Nutzer:{' '}
          <strong className="font-medium tabular-nums">{preisText(summe)}</strong> im {zeitraum}, {UST_HINWEIS}
        </p>
        {spart > 0 && (
          <p className="mt-0.5 text-xs text-ui-schiefer">
            Mengenrabatt: <span className="font-medium text-ui-tinte">{preisText(spart)}</span> gespart im {zeitraum}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => onBuchen(paket, intervall, nutzer)}
        disabled={!bereit || laedt}
        className={`mt-6 w-full ${KNOPF} disabled:cursor-not-allowed`}
      >
        <CreditCard className="h-4 w-4" aria-hidden />
        {laedt ? 'Einen Moment …' : 'Weiter zur Zahlung'}
      </button>
      {!bereit && <p className="mt-2 text-center text-xs font-medium text-ui-schiefer">{gesperrtText}</p>}
      {fehler && <p role="alert" className={`mt-2 ${FEHLER}`}>{fehler}</p>}
      <p className="mt-3 text-xs leading-relaxed text-ui-schiefer">
        Sie bezahlen sicher über unseren Zahlungsdienstleister Stripe; Rechnungsadresse und USt-IdNr. geben Sie
        dort an. Ein monatliches Abo ist zum Ende des Monats kündbar, ein jährliches zum Ende des Jahres.
        Weitere Kollegen laden Sie nach der Buchung unter „Abo & Team“ ein.
      </p>
    </div>
  );
}
