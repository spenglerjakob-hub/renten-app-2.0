import { useId, useState } from 'react';
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
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
import {
  EINLEITUNG, FELD_LABEL, Hinweise, KNOPF, KNOPF_ZWEIT, LINK, Titel, Zahl,
} from '../components/stil';

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
    <p className="ui-innen mt-5 px-4 py-3 text-sm leading-relaxed text-ui-tinte">
      Beide Pakete in einem — <strong className="font-medium tabular-nums">{preisText(spart)}</strong> günstiger
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
    <details className="group ui-karte max-w-3xl">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 sm:px-7 [&::-webkit-details-marker]:hidden">
        <span className="text-lg font-medium tracking-[-0.01em] text-ui-tinte sm:text-xl">Mit Ihrer Zeit rechnen</span>
        <ChevronDown className="h-5 w-5 shrink-0 text-ui-schiefer transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t border-ui-linie px-5 pb-5 pt-5 sm:px-7 sm:pb-7">
        <p className="text-sm leading-relaxed text-ui-schiefer">
          Eine Zeitersparnis nennen wir bewusst nicht — die kennen nur Sie. Wenn Sie schätzen möchten:
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-4">
          <div>
            <label htmlFor={`${id}-min`} className={FELD_LABEL}>Gesparte Minuten je Fall</label>
            <input id={`${id}-min`} inputMode="numeric" value={minuten} onChange={(e) => setMinuten(e.target.value)}
              className="ui-feld w-32 p-2 text-sm tabular-nums" />
          </div>
          <div>
            <label htmlFor={`${id}-satz`} className={FELD_LABEL}>Ihr Stundensatz (€)</label>
            <input id={`${id}-satz`} inputMode="decimal" value={stundensatz} onChange={(e) => setStundensatz(e.target.value)}
              className="ui-feld w-32 p-2 text-sm tabular-nums" />
          </div>
          {gegenwert !== null && (
            <dl role="status" className="min-w-0">
              <Zahl etikett="Gegenwert Ihrer gesparten Zeit" wert={preisText(gegenwert)} zusatz="je Fall" />
            </dl>
          )}
        </div>
      </div>
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
    <div className="min-h-screen bg-ui-flaeche text-ui-tinte">
      <SeitenKopf verlinkt />

      {/* Wie eine Ansicht der Mitarbeiterberatung: Ueberschrift und Einleitung ueber den Karten, viel Luft. */}
      <main className="mx-auto max-w-6xl space-y-14 px-4 py-6 sm:px-6 sm:py-10">
        <div>
          <Titel gross>Preise</Titel>
          <p className={`mt-3 ${EINLEITUNG}`}>
            Für Finanz- und Versicherungsberater. {TESTTAGE} Tage kostenlos testen — ohne Zahlungsdaten, mit
            allen Funktionen. Danach wählen Sie das Paket, das zu Ihrer Beratung passt.
          </p>
          <p className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
            <a href="/schnellrechnung" className={LINK}>
              Erst ausprobieren? Schnellrechnung ohne Anmeldung →
            </a>
            <a href="#early-adopter" className={LINK}>
              Vor dem Start: Early Adopter werden →
            </a>
          </p>
        </div>

        <section aria-label="Pakete" className="space-y-6">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <IntervallSchalter wert={intervall} onWechsel={setIntervall} />
            <NutzerWahl wert={nutzer} onWechsel={setNutzer} />
            <p className="text-sm text-ui-schiefer">Ab 3, 5 und 8 Nutzern günstiger — für alle im Büro.</p>
          </div>

          {/*
            Drei Karten; das empfohlene Paket ist die eine Akzentkarte der
            Ansicht — sein Preis hervorgehoben wie die Zahl im Kernsatz der
            Beratung, darueber die Marke.
          */}
          <div className="grid grid-cols-1 gap-6 pt-2 md:grid-cols-3 md:gap-5">
            {PAKETE.map((p) => (
              <section
                key={p.id}
                aria-labelledby={`paket-${p.id}`}
                className={`${p.empfohlen ? 'ui-akzentkarte' : 'ui-karte'} relative flex flex-col p-5 sm:p-7`}
              >
                {p.empfohlen && (
                  <span className="ui-marke absolute -top-3 left-5 flex items-center gap-1 whitespace-nowrap px-2.5 py-1 text-xs font-medium sm:left-7">
                    {/* Kurz genug fuer eine Zeile: Der volle Satz brach um und
                        lag ueber dem Paketnamen. Der ganze Satz steht im Tooltip. */}
                    <Sparkles className="h-3 w-3" aria-hidden />
                    <span title={`Empfohlen, ${EMPFOHLEN_GRUND}`}>
                      Empfohlen für Privat- und Firmenkunden
                    </span>
                  </span>
                )}
                <h2 id={`paket-${p.id}`} className="text-lg font-medium tracking-[-0.01em] text-ui-tinte sm:text-xl">{p.name}</h2>
                <p className="mt-1 text-sm leading-relaxed text-ui-schiefer">{p.kurz}</p>
                <div className="mt-5">
                  <PaketPreis id={p.id} intervall={intervall} nutzer={nutzer} akzent={p.empfohlen} />
                </div>
                {p.id === 'alles' && <BuendelVorteil intervall={intervall} nutzer={nutzer} />}
                <div className="mt-6 flex-1 border-t border-ui-linie pt-5">
                  <Hinweise punkte={LEISTUNGEN[p.id]} />
                </div>
                <a
                  href="/?registrieren"
                  className={`mt-6 w-full ${p.empfohlen ? KNOPF : KNOPF_ZWEIT}`}
                >
                  {TESTTAGE} Tage kostenlos testen
                </a>
              </section>
            ))}
          </div>
          <p className="text-xs text-ui-schiefer">Alle Preise netto, {UST_HINWEIS}</p>

          <ZeitRechnung />
        </section>

        <FruehstartAnfrage />

        <section aria-labelledby="staffel">
          <Titel als="h2" id="staffel">Mengenrabatt</Titel>
          <p className={`mt-2 ${EINLEITUNG}`}>
            Preis je Nutzer und {zeitraum} — der Preis der erreichten Staffel gilt für alle Nutzer im Büro.
          </p>
          <div className="ui-karte mt-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-sm text-ui-schiefer">
                <tr>
                  <th scope="col" className="px-4 pb-3 pt-5 font-normal sm:px-7">Nutzer</th>
                  {PAKETE.map((p) => (
                    <th key={p.id} scope="col" className="px-4 pb-3 pt-5 text-right font-normal sm:px-7">
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
                    className={`border-t border-ui-linie text-ui-tinte ${i === staffel ? 'bg-ui-knopf/10 font-medium' : ''}`}
                  >
                    <th scope="row" className="px-4 py-3 font-medium sm:px-7">{spanne}</th>
                    {PAKETE.map((p) => (
                      <td key={p.id} className="px-4 py-3 text-right tabular-nums sm:px-7">
                        {preisText(preisJeNutzer(p.id, intervall, STAFFEL_AB[i]!))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="fragen" className="max-w-3xl">
          <Titel als="h2" id="fragen">Häufige Fragen</Titel>
          <div className="ui-karte mt-5 divide-y divide-ui-linie">
            {FRAGEN.map((f) => (
              <details key={f.frage} className="group px-5 py-4 sm:px-7">
                <summary className="flex cursor-pointer list-none items-start gap-3 text-base font-medium text-ui-tinte [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-ui-schiefer transition-transform group-open:rotate-90" aria-hidden />
                  {f.frage}
                </summary>
                <p className="mt-2 pl-7 text-sm leading-relaxed text-ui-schiefer">{f.antwort}</p>
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
