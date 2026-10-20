import { useId, useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import {
  PAKETE, STAFFEL_AB, TESTTAGE, MAX_NUTZER, UST_HINWEIS,
  preisJeNutzer, staffelIndex, type Intervall, type PaketId,
} from '@renten/schema/preise';
import { SeitenKopf } from '../components/SeitenKopf';
import { FruehstartAnfrage } from './FruehstartAnfrage';
import { RechtsLinks } from '../components/RechtsLinks';
import {
  EMPFOHLEN_GRUND, IntervallSchalter, NutzerWahl, PaketPreis, preisText,
} from '../components/PaketWahl';

/**
 * Die Preisseite (/preise).
 *
 * VORERST UNVERLINKT UND OHNE SUCHMASCHINEN: `noindex` im HTML und als
 * Kopfzeile (.htaccess). Beides faellt erst beim Start des Abos weg — bis
 * dahin sieht die Seite nur, wer die Adresse kennt.
 *
 * Alle Zahlen kommen aus `@renten/schema` (preise.ts); hier steht keine.
 */

/** Was jedes Paket enthaelt — in der Sprache der Berater, nicht der Technik. */
const LEISTUNGEN: Record<PaketId, string[]> = {
  /*
    Konkret statt „Alles aus …“: Mit drei abstrakten Zeilen sah das
    empfohlene, teuerste Paket aus, als biete es am wenigsten. Hier stehen
    die Hoehepunkte beider Pakete; vollstaendig sind sie in den Nachbarkarten.
  */
  alles: [
    'Netto-Rente, Versorgungslücke und Sparrechner',
    'Vertrags-TÜV und Lösungsvergleich mit Ihren Angeboten',
    'Gutachten als PDF und Vorsorge-Check per Kundenlink',
    'Matching-, Zuschuss- und Festbetrag-Modell',
    'Betriebliche Krankenversicherung als Sachbezug',
    'Ein Zugang für die ganze Beratung — privat und Firmenkunden',
  ],
  rente: [
    'Netto-Rente nach Steuer und Kranken-/Pflegeversicherung',
    'Versorgungslücke, Sparrechner und Kosten des Wartens',
    'Vertrags-TÜV und Lösungsvergleich: AVD, bAV, Basis- und Privatrente',
    'Angebote vergleichen — als Rente oder als Kapital',
    'Gutachten als PDF für Ihre Kunden',
    'Vorsorge-Check per Kundenlink, mit Upload von Unterlagen',
    'Szenarien sicher in Ihrem Konto speichern',
  ],
  ag: [
    'Matching-Modell: Entgeltumwandlung plus Unterstützungskasse',
    'Zuschussmodell: 50 % Zuschuss in einem Vertrag',
    'Festbetrag-Modell für die ganze Belegschaft',
    'Betriebliche Krankenversicherung als steuerfreier Sachbezug',
  ],
};

/**
 * Was das Buendel gegenueber beiden Paketen einzeln spart — aus denselben
 * Preisen wie die Karten, in der gewaehlten Staffel und Zahlweise.
 */
function BuendelVorteil({ intervall, nutzer }: { intervall: Intervall; nutzer: number }) {
  const einzeln = preisJeNutzer('rente', intervall, nutzer) + preisJeNutzer('ag', intervall, nutzer);
  const spart = einzeln - preisJeNutzer('alles', intervall, nutzer);
  if (spart <= 0) return null;
  return (
    <p className="mt-4 rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
      Beide Pakete in einem — <strong className="tabular-nums">{preisText(spart)}</strong> günstiger
      als einzeln ({preisText(einzeln)})
    </p>
  );
}

/**
 * Spaltenkoepfe der Staffeltabelle am Telefon. "RENTENPLANUNG" bricht nicht
 * um und schob die dritte Preisspalte aus dem Bild.
 */
const KURZNAME: Record<PaketId, string> = { alles: 'All inkl.', rente: 'Rente', ag: 'AG' };

/** Die Spannen der Staffeln, aus STAFFEL_AB abgeleitet: "1–2", "3–4", "5–7", "ab 8". */
const spannen = STAFFEL_AB.map((ab, i) => {
  const naechste = STAFFEL_AB[i + 1];
  if (naechste === undefined) return `ab ${ab}`;
  return naechste - 1 === ab ? `${ab}` : `${ab}–${naechste - 1}`;
});

const FRAGEN: { frage: string; antwort: string }[] = [
  {
    frage: 'Wie funktioniert die Testphase?',
    antwort: `${TESTTAGE} Tage lang alle Funktionen (All inklusive), ohne Zahlungsdaten. Die Testphase endet `
      + 'von selbst — Kosten entstehen erst, wenn Sie ein Paket buchen.',
  },
  {
    frage: 'Wie funktioniert der Mengenrabatt?',
    antwort: 'Der Preis richtet sich nach der Zahl der Nutzer in Ihrem Büro und gilt für alle: ab 3, ab 5 und '
      + 'ab 8 Nutzern wird es je Nutzer günstiger. Nutzer können Sie jederzeit hinzufügen; der Preis passt sich an.',
  },
  {
    frage: 'Was ist ein Nutzer?',
    antwort: 'Ein persönlicher Zugang für eine Person. Zugänge werden nicht geteilt — jeder Berater in Ihrem '
      + 'Büro bekommt seinen eigenen, mit eigenen Szenarien und Kundenlinks.',
  },
  {
    frage: 'Wie wird abgerechnet?',
    antwort: `Monatlich oder jährlich im Voraus, per Kreditkarte oder SEPA-Lastschrift. Sie erhalten eine Rechnung `
      + `mit ausgewiesener Umsatzsteuer. Alle Preise sind netto, ${UST_HINWEIS}`,
  },
  {
    frage: 'Wie kann ich kündigen?',
    antwort: 'Online im Kundenkonto: ein monatliches Abo zum Ende des laufenden Monats, ein jährliches zum Ende '
      + 'des Jahres. Bis dahin bleibt alles nutzbar.',
  },
  {
    frage: 'Für wen ist das Angebot?',
    antwort: 'Ausschließlich für Unternehmer im Sinne von § 14 BGB — etwa Versicherungsmakler, '
      + 'Finanzanlagenvermittler und Honorarberater.',
  },
  {
    frage: `Mehr als ${MAX_NUTZER} Nutzer?`,
    antwort: 'Für Maklerpools und Vertriebe machen wir Ihnen gern ein eigenes Angebot. Die Kontaktdaten stehen '
      + 'im Impressum.',
  },
];

/**
 * „Mit Ihrer Zeit rechnen“ — aufklappbar und LEER.
 *
 * Eine Zeitersparnis nennen wir bewusst nicht: Sie haengt am Buero, an den
 * Faellen und an dem, womit bisher gerechnet wurde. Wer sie kennt, traegt sie
 * ein und bekommt den Gegenwert je Fall; vorbelegt ist nichts.
 */
function ZeitRechnung() {
  const id = useId();
  const [minuten, setMinuten] = useState('');
  const [stundensatz, setStundensatz] = useState('');
  const zahl = (s: string) => Number(s.replace(',', '.'));
  const m = zahl(minuten);
  const h = zahl(stundensatz);
  const gegenwert = m > 0 && h > 0 ? Math.round((m / 60) * h * 100) / 100 : null;
  return (
    <details className="mt-4 max-w-2xl rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <summary className="cursor-pointer text-sm font-bold text-slate-800">Mit Ihrer Zeit rechnen</summary>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        Eine Zeitersparnis nennen wir bewusst nicht — die kennen nur Sie. Wenn Sie schätzen möchten:
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor={`${id}-min`} className="mb-1 block text-xs font-bold text-slate-700">Gesparte Minuten je Fall</label>
          <input id={`${id}-min`} inputMode="numeric" value={minuten} onChange={(e) => setMinuten(e.target.value)}
            className="w-28 rounded-lg border border-slate-300 p-2 text-sm tabular-nums" />
        </div>
        <div>
          <label htmlFor={`${id}-satz`} className="mb-1 block text-xs font-bold text-slate-700">Ihr Stundensatz (€)</label>
          <input id={`${id}-satz`} inputMode="decimal" value={stundensatz} onChange={(e) => setStundensatz(e.target.value)}
            className="w-28 rounded-lg border border-slate-300 p-2 text-sm tabular-nums" />
        </div>
      </div>
      {gegenwert !== null && (
        <p role="status" className="mt-3 text-sm text-slate-800">
          Gegenwert Ihrer gesparten Zeit: <strong className="tabular-nums">{preisText(gegenwert)}</strong> je Fall.
        </p>
      )}
    </details>
  );
}

export function Seite() {
  // Vorauswahl jaehrlich und 3 Nutzer: So zeigt die Seite gleich den Jahrespreis und die erste Rabattstaffel.
  const [intervall, setIntervall] = useState<Intervall>('jahr');
  const [nutzer, setNutzer] = useState(3);
  const staffel = staffelIndex(nutzer);
  const zeitraum = intervall === 'jahr' ? 'Jahr' : 'Monat';

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <SeitenKopf verlinkt />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">Preise</h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-slate-600">
          Für Finanz- und Versicherungsberater. {TESTTAGE} Tage kostenlos testen — ohne Zahlungsdaten, mit
          allen Funktionen. Danach wählen Sie das Paket, das zu Ihrer Beratung passt.
        </p>
        <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <a href="/schnellrechnung" className="font-semibold text-indigo-700 hover:underline">
            Erst ausprobieren? Schnellrechnung ohne Anmeldung →
          </a>
          <a href="#early-adopter" className="font-semibold text-indigo-700 hover:underline">
            Vor dem Start: Early Adopter werden →
          </a>
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
          <IntervallSchalter wert={intervall} onWechsel={setIntervall} />
          <NutzerWahl wert={nutzer} onWechsel={setNutzer} />
          <p className="text-xs text-slate-500">Ab 3, 5 und 8 Nutzern günstiger — für alle im Büro.</p>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-5">
          {PAKETE.map((p) => (
            <section
              key={p.id}
              aria-labelledby={`paket-${p.id}`}
              className={`relative flex flex-col rounded-2xl border bg-white p-5 shadow-sm sm:p-6 ${
                p.empfohlen ? 'border-indigo-400 ring-2 ring-indigo-400' : 'border-slate-200'
              }`}
            >
              {p.empfohlen && (
                <span className="absolute -top-3 left-5 flex items-center gap-1 whitespace-nowrap rounded-full bg-indigo-600 px-2.5 py-1 text-xs font-bold text-white">
                  {/* Kurz genug fuer eine Zeile: Der volle Satz brach um und
                      lag ueber dem Paketnamen. Der ganze Satz steht im Tooltip. */}
                  <Sparkles className="h-3 w-3" aria-hidden />
                  <span title={`Empfohlen, ${EMPFOHLEN_GRUND}`}>
                    Empfohlen für Privat- und Firmenkunden
                  </span>
                </span>
              )}
              <h2 id={`paket-${p.id}`} className="text-lg font-black text-slate-900">{p.name}</h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{p.kurz}</p>
              <div className="mt-4">
                <PaketPreis id={p.id} intervall={intervall} nutzer={nutzer} />
              </div>
              {p.id === 'alles' && <BuendelVorteil intervall={intervall} nutzer={nutzer} />}
              <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-700">
                {LEISTUNGEN[p.id].map((l) => (
                  <li key={l} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden /> {l}
                  </li>
                ))}
              </ul>
              <a
                href="/?registrieren"
                className={`mt-5 block rounded-lg px-4 py-2.5 text-center text-sm font-bold ${
                  p.empfohlen
                    ? 'bg-indigo-600 text-white hover:bg-indigo-500'
                    : 'border border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-50'
                }`}
              >
                {TESTTAGE} Tage kostenlos testen
              </a>
            </section>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">Alle Preise netto, {UST_HINWEIS}</p>

        <ZeitRechnung />

        <FruehstartAnfrage />

        <section aria-labelledby="staffel" className="mt-10">
          <h2 id="staffel" className="text-lg font-black text-slate-900">Mengenrabatt</h2>
          <p className="mt-1 text-sm text-slate-600">
            Preis je Nutzer und {zeitraum} — der Preis der erreichten Staffel gilt für alle Nutzer im Büro.
          </p>
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-3 py-2.5 font-bold sm:px-4">Nutzer</th>
                  {PAKETE.map((p) => (
                    <th key={p.id} scope="col" className="px-3 py-2.5 text-right font-bold sm:px-4">
                      <span className="sm:hidden" aria-hidden>{KURZNAME[p.id]}</span>
                      <span className="sr-only sm:not-sr-only">{p.name}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {spannen.map((spanne, i) => (
                  <tr
                    key={spanne}
                    aria-current={i === staffel ? 'true' : undefined}
                    className={`border-t border-slate-100 ${i === staffel ? 'bg-indigo-50 font-bold text-indigo-900' : ''}`}
                  >
                    <th scope="row" className="px-3 py-2.5 font-semibold sm:px-4">{spanne}</th>
                    {PAKETE.map((p) => (
                      <td key={p.id} className="px-3 py-2.5 text-right tabular-nums sm:px-4">
                        {preisText(preisJeNutzer(p.id, intervall, STAFFEL_AB[i]!))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="fragen" className="mt-10 max-w-3xl">
          <h2 id="fragen" className="text-lg font-black text-slate-900">Häufige Fragen</h2>
          <div className="mt-3 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-sm">
            {FRAGEN.map((f) => (
              <details key={f.frage} className="group px-4 py-3">
                <summary className="cursor-pointer list-none text-sm font-bold text-slate-800 marker:hidden">
                  <span className="mr-2 inline-block text-indigo-600 transition-transform group-open:rotate-90">›</span>
                  {f.frage}
                </summary>
                <p className="mt-2 pl-5 text-sm leading-relaxed text-slate-600">{f.antwort}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
        <RechtsLinks />
      </footer>
    </div>
  );
}
