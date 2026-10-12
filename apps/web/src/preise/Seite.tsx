import { useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import {
  PAKETE, STAFFEL_AB, TESTTAGE, MAX_NUTZER, UST_HINWEIS,
  preisJeNutzer, staffelIndex, type Intervall, type PaketId,
} from '@renten/schema/preise';
import { Logo } from '../components/Logo';
import { RechtsLinks } from '../components/RechtsLinks';
import { IntervallSchalter, NutzerWahl, PaketPreis, preisText } from '../components/PaketWahl';

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
  alles: [
    'Alles aus der Rentenplanung',
    'Alles aus den AG-Verkaufshilfen',
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

export function Seite() {
  const [intervall, setIntervall] = useState<Intervall>('monat');
  const [nutzer, setNutzer] = useState(1);
  const staffel = staffelIndex(nutzer);
  const zeitraum = intervall === 'jahr' ? 'Jahr' : 'Monat';

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <header className="bg-slate-900 text-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 sm:px-6">
          <Logo klasse="h-9 w-9" />
          <a href="/" className="text-sm font-black tracking-tight hover:underline">JS-Rentenplaner</a>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">Preise</h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-slate-600">
          Für Finanz- und Versicherungsberater. {TESTTAGE} Tage kostenlos testen — ohne Zahlungsdaten, mit
          allen Funktionen. Danach wählen Sie das Paket, das zu Ihrer Beratung passt.
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
                <span className="absolute -top-3 left-5 flex items-center gap-1 rounded-full bg-indigo-600 px-2.5 py-1 text-[11px] font-bold text-white">
                  <Sparkles className="h-3 w-3" aria-hidden /> Empfohlen
                </span>
              )}
              <h2 id={`paket-${p.id}`} className="text-lg font-black text-slate-900">{p.name}</h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{p.kurz}</p>
              <div className="mt-4">
                <PaketPreis id={p.id} intervall={intervall} nutzer={nutzer} />
              </div>
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
