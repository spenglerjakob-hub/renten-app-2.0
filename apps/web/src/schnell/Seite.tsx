import { useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, Check, ChevronDown, Save } from 'lucide-react';
import { BUNDESLAENDER } from '@renten/engine';
import { Logo } from '../components/Logo';
import { RechtsLinks } from '../components/RechtsLinks';
import { AuswahlFeld, DatumFeld, Schalter, ZahlFeld, euro, prozent } from '../components/Feld';
import { KaufkraftKarte } from '../features/KaufkraftKarte';
import { musterfallMerken } from '../lib/musterfall';
import { AUFTRITT_LEER, auftrittLeer } from '../features/auftritt';
import { AuftrittFormular } from '../features/AuftrittFormular';
import { DeckblattVorschau } from '../features/DeckblattVorschau';
import {
  auftrittLokalMerken, auftrittLokalVerwerfen, offenerAuftrittLokal, type AuftrittEntwurf,
} from '../lib/auftritt-lokal';
import {
  SCHNELL_BEISPIEL, ZIEL_FAUSTREGEL, schnellRechnen, type SchnellEingaben, type SchnellFeld,
} from './eingaben';

const laender = BUNDESLAENDER.map((l) => ({ wert: l as string, text: l }));

/**
 * Was ein Konto zusaetzlich bringt — beim Namen genannt, nicht als
 * verschwommene Vorschau angedeutet.
 */
const MIT_KONTO = [
  'Fall speichern und Mandanten verwalten',
  'Gutachten als PDF für Ihren Mandanten — mit Ihrem Logo und Ihren Kontaktdaten',
  'Detailauswertung: Besteuerungsanteil, Kranken- und Pflegeversicherung (KVdR), Versorgungsfreibetrag',
  'Sparrechner, Vertrags-TÜV und Lösungsvergleich mit Ihren Angeboten',
  'Paare, Beamte, Selbstständige und privat Versicherte',
  'Vorsorge-Check: Ihr Mandant trägt seine Angaben per Link selbst ein',
];

/**
 * DIE SCHNELLRECHNUNG (/schnellrechnung) — ein Fall ohne Anmeldung.
 *
 * Wert vor Registrierung: Wer den Rechner kennenlernen will, rechnet zuerst
 * einen echten Fall — mit derselben Rechnung wie im vollen Rechner
 * (`eingaben.ts`). Registrieren muss erst, wer speichern, drucken oder tiefer
 * schauen will; das steht unten offen da.
 *
 * Nichts verlaesst den Browser. „Fall speichern“ legt den Fall lokal ab und
 * fuehrt zur Registrierung; nach der Anmeldung liegt er im Rechner.
 */
export function Seite() {
  const [e, setE] = useState<SchnellEingaben>(SCHNELL_BEISPIEL);
  const [angefasst, setAngefasst] = useState<ReadonlySet<SchnellFeld>>(new Set());
  const setze = (feld: SchnellFeld, teil: Partial<SchnellEingaben>) => {
    setE((x) => ({ ...x, ...teil }));
    setAngefasst((a) => new Set(a).add(feld));
  };
  const r = useMemo(() => schnellRechnen(e, angefasst), [e, angefasst]);
  const istBeispiel = angefasst.size === 0;

  /*
    IHR LOGO AUFS GUTACHTEN — Investition vor dem Konto, aber ehrlich: Die
    Vorschau ist das echte Deckblatt (`DeckblattVorschau`), alles bleibt in
    diesem Browser (`lib/auftritt-lokal.ts`) und laesst sich entfernen. Nach
    der Anmeldung uebernimmt der Rechner es ins Konto.
  */
  const [auftritt, setAuftritt] = useState<AuftrittEntwurf>(
    () => offenerAuftrittLokal() ?? { firma: '', farbe: null, logo: null },
  );
  const [auftrittOffen, setAuftrittOffen] = useState(() => offenerAuftrittLokal() !== null);
  const [speicherHinweis, setSpeicherHinweis] = useState<string | null>(null);
  const auftrittAendern = (teil: Partial<AuftrittEntwurf>) => {
    const neu = { ...auftritt, ...teil };
    setAuftritt(neu);
    const ergebnis = auftrittLokalMerken(neu);
    setSpeicherHinweis(
      ergebnis === 'voll' ? 'Das Logo ist zu groß für den Speicher dieses Browsers — es bleibt nur, bis Sie die Seite neu laden.'
        : ergebnis === 'gesperrt' ? 'Dieser Browser lässt keinen Speicher zu — Ihre Angaben bleiben nur, bis Sie die Seite neu laden.'
          : null,
    );
  };
  const auftrittEntfernen = () => {
    auftrittLokalVerwerfen();
    setAuftritt({ firma: '', farbe: null, logo: null });
    setSpeicherHinweis(null);
  };
  const auftrittVoll = { ...AUFTRITT_LEER, ...auftritt };
  const bleibtImBrowser = auftritt.logo ? 'bleiben Fall und Logo'
    : auftritt.firma.trim() ? 'bleiben Fall und Firmenname' : 'bleibt der Fall';

  const z = r?.zeile;
  const f = z?.kaufkraftfaktor ?? 1;
  const luecke = z ? Math.max(0, z.zielNettoMonat - z.nettoMonat) : 0;
  const jahrgang = e.geburtsdatum.slice(-4);

  const speichern = (ziel: string) => {
    if (!r) return;
    const kurz = `Jahrgang ${jahrgang} · ${euro(e.bruttoMonat)} brutto · `
      + (luecke > 0 ? `Lücke ${euro(luecke / f)} (heutige Kaufkraft)` : 'Ziel gedeckt');
    musterfallMerken(r.szenario, kurz);
    window.location.href = ziel;
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <header className="bg-slate-900 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Logo klasse="h-9 w-9" />
            <a href="/" className="text-sm font-black tracking-tight hover:underline">JS-Rentenplaner</a>
          </div>
          <a href="/" className="text-xs font-semibold text-slate-300 hover:text-white hover:underline">Anmelden</a>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-4xl">
          Schnellrechnung: Was bleibt im Alter netto?
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
          Ein Fall in einer Minute, ohne Anmeldung. Gerechnet wird wie im vollen Rechner: Steuer sowie
          Kranken- und Pflegeversicherung nach aktuellem Rechtsstand.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* ---------- Eingaben ---------- */}
          <section aria-labelledby="schnell-eingaben" className="rounded-xl border-2 border-indigo-200 bg-indigo-50/50 p-4 shadow-sm sm:p-5 lg:col-span-5">
            <h2 id="schnell-eingaben" className="text-sm font-bold text-slate-800">Ihr Mandant</h2>
            {istBeispiel && (
              <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                Beispielwerte — tragen Sie die Zahlen Ihres Mandanten ein.
              </p>
            )}
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <DatumFeld
                label="Geburtsdatum"
                wert={e.geburtsdatum}
                onChange={(v) => setze('geburtsdatum', { geburtsdatum: v })}
                hilfe={r ? `Rentenbeginn ${r.szenario.personen[0]!.rentenbeginn} — Regelaltersgrenze.` : undefined}
                vorbelegt={angefasst.has('geburtsdatum') ? undefined
                  : { art: 'beispiel', onPruefen: () => setAngefasst((a) => new Set(a).add('geburtsdatum')) }}
              />
              <ZahlFeld
                label="Bruttogehalt im Monat"
                wert={e.bruttoMonat}
                onChange={(n) => setze('brutto', { bruttoMonat: n })}
                einheit="€"
                hilfe="Angestellt, 12 Gehälter."
                vorbelegt={angefasst.has('brutto') ? undefined
                  : { art: 'beispiel', onPruefen: () => setAngefasst((a) => new Set(a).add('brutto')) }}
              />
              <ZahlFeld
                label="Gesetzliche Rente laut Renteninformation"
                wert={e.rente ?? r?.rente ?? 0}
                onChange={(n) => setze('rente', { rente: n })}
                einheit="€"
                hilfe={e.rente === null
                  ? 'Geschätzt aus Einkommen und Alter. Genauer: „Höhe Ihrer künftigen Regelaltersrente“ aus der Renteninformation.'
                  : 'Aus der Renteninformation: „Höhe Ihrer künftigen Regelaltersrente“.'}
                vorbelegt={e.rente === null ? { art: 'beispiel', hinweis: 'Geschätzt aus Einkommen und Alter.' } : undefined}
              />
              <ZahlFeld
                label="Zielnetto im Alter (Kaufkraft heute)"
                wert={e.ziel ?? r?.zielHeute ?? 0}
                onChange={(n) => setze('ziel', { ziel: n })}
                einheit="€"
                hilfe={r && r.nettoHeute > 0
                  ? (e.ziel === null
                    ? `Faustregel: ${prozent(ZIEL_FAUSTREGEL, 0)} des heutigen Nettos von ${euro(r.nettoHeute)}.`
                    : `Das sind ${prozent(r.zielHeute / r.nettoHeute, 0)} des heutigen Nettos von ${euro(r.nettoHeute)}.`)
                  : undefined}
                vorbelegt={e.ziel === null
                  ? { art: 'beispiel', hinweis: 'Faustregel: 80 % des heutigen Nettos.', onPruefen: r ? () => setze('ziel', { ziel: r.zielHeute }) : undefined }
                  : undefined}
              />
              <AuswahlFeld
                label="Bundesland"
                wert={e.bundesland}
                onChange={(v) => setze('bundesland', { bundesland: v })}
                optionen={laender}
                hilfe="Für den Kirchensteuersatz."
                vorbelegt={angefasst.has('bundesland') ? undefined : { art: 'standard' }}
              />
              <div className="flex items-end pb-2">
                <Schalter
                  label="Kirchensteuerpflichtig"
                  wert={e.kirchensteuer}
                  onChange={(b) => setze('kirchensteuer', { kirchensteuer: b })}
                  vorbelegt={angefasst.has('kirchensteuer') ? undefined : { art: 'standard' }}
                />
              </div>
            </div>
            {e.rente !== null && (
              <button type="button" onClick={() => setE((x) => ({ ...x, rente: null }))}
                className="mt-2 text-xs font-semibold text-indigo-700 hover:underline">
                Rente wieder schätzen lassen
              </button>
            )}
          </section>

          {/* ---------- Ergebnis ---------- */}
          <div className="space-y-4 lg:col-span-7">
            {r && z ? (
              <section aria-labelledby="schnell-ergebnis" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <h2 id="schnell-ergebnis" className="text-sm font-bold text-slate-800">Ergebnis für das Jahr {z.jahr}</h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <Kachel titel="Netto im Ruhestand" wert={euro(z.nettoMonat)} unten={`heute ${euro(z.nettoMonat / f)}`} />
                  <Kachel titel="Ziel" wert={euro(z.zielNettoMonat)} unten={`heute ${euro(z.zielNettoMonat / f)}`} />
                  <Kachel
                    titel="Versorgungslücke"
                    wert={luecke > 0 ? euro(luecke) : 'Gedeckt'}
                    unten={luecke > 0 ? `heute ${euro(luecke / f)}` : 'Ziel erreicht'}
                    ton={luecke > 0 ? 'luecke' : 'gut'}
                  />
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                  Monatsbeträge nach Steuer und Kranken- und Pflegeversicherung, im Geld des Jahres {z.jahr};
                  „heute“ in heutiger Kaufkraft.
                </p>
              </section>
            ) : (
              <p className="rounded-xl bg-white p-4 text-sm text-slate-500">Bitte ein gültiges Geburtsdatum eintragen.</p>
            )}

            {z && <KaufkraftKarte zeile={z} inflation={0.02} standard wo="im vollen Rechner änderbar" />}

            <section aria-labelledby="schnell-annahmen" className="rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm sm:p-5">
              <h2 id="schnell-annahmen" className="font-bold text-slate-800">Annahmen</h2>
              <ul className="mt-2 space-y-1 text-slate-600">
                <li>Rentenbeginn mit der Regelaltersgrenze; Inflation 2 % und Rentenanpassung 1 % pro Jahr.</li>
                <li>Alleinstehend, angestellt, gesetzlich krankenversichert (KVdR) mit dem durchschnittlichen Zusatzbeitrag.</li>
                <li>Keine weiteren Verträge — die erfassen Sie im vollen Rechner.</li>
              </ul>
              <p className="mt-2 text-xs text-slate-500">
                Paare, Beamte, Selbstständige und privat Versicherte rechnen Sie im vollen Rechner.
              </p>
            </section>

            {/* ---------- Ihr Logo aufs Gutachten ---------- */}
            <section aria-labelledby="schnell-auftritt" className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <h2 id="schnell-auftritt" className="m-0">
                <button
                  type="button"
                  onClick={() => setAuftrittOffen((v) => !v)}
                  aria-expanded={auftrittOffen}
                  aria-controls="schnell-auftritt-inhalt"
                  className="flex w-full items-center justify-between gap-3 p-4 text-left sm:p-5"
                >
                  <span>
                    <span className="block text-sm font-bold text-slate-800">Ihr Logo aufs Gutachten</span>
                    <span className="block text-xs font-normal text-slate-500">So sieht das Deckblatt für Ihren Mandanten aus</span>
                  </span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${auftrittOffen ? 'rotate-180' : ''}`} aria-hidden />
                </button>
              </h2>
              {auftrittOffen && (
                <div id="schnell-auftritt-inhalt" className="space-y-4 border-t border-slate-100 px-4 pb-4 pt-4 sm:px-5 sm:pb-5">
                  <AuftrittFormular
                    wert={auftrittVoll}
                    onAendern={(t) => auftrittAendern({
                      ...(t.firma !== undefined ? { firma: t.firma } : {}),
                      ...(t.farbe !== undefined ? { farbe: t.farbe } : {}),
                    })}
                    onLogo={(l) => auftrittAendern({ logo: l ? l.dataUrl : null })}
                  />
                  <DeckblattVorschau
                    auftritt={auftrittVoll}
                    zahlen={r && z ? { bedarf: r.zielHeute, netto: z.nettoMonat / f } : null}
                  />
                  <p className="text-xs leading-relaxed text-slate-600">
                    Logo, Firmenname und Farbe bleiben in diesem Browser, bis Sie ein Konto anlegen — danach liegen
                    sie in Ihrem Konto und stehen auf jedem Gutachten. Ihren Namen und Ihre Kontaktdaten ergänzen Sie
                    dort.
                  </p>
                  {speicherHinweis && <p role="status" className="text-xs font-semibold text-amber-800">{speicherHinweis}</p>}
                  {!auftrittLeer(auftrittVoll) && (
                    <button
                      type="button"
                      onClick={auftrittEntfernen}
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    >
                      Entfernen
                    </button>
                  )}
                </div>
              )}
            </section>

            {/* ---------- Mit Konto ---------- */}
            <section aria-labelledby="schnell-konto" className="rounded-xl border border-indigo-200 bg-white p-4 shadow-sm sm:p-5">
              <h2 id="schnell-konto" className="text-sm font-bold text-slate-800">Mit Konto zusätzlich</h2>
              <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
                {MIT_KONTO.map((x) => (
                  <li key={x} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden /> {x}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => speichern('/?registrieren')}
                disabled={!r}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                <Save className="h-4 w-4" aria-hidden /> Fall speichern
              </button>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                Zum Speichern brauchen Sie ein Konto — kostenlos, 14 Tage alle Funktionen, ohne
                Zahlungsdaten. Bis dahin {bleibtImBrowser} nur in diesem Browser.
              </p>
              <button
                type="button"
                onClick={() => speichern('/')}
                disabled={!r}
                className="mt-3 flex items-center gap-1 text-sm font-semibold text-indigo-700 hover:underline disabled:opacity-50"
              >
                Schon ein Konto? Anmelden und den Fall übernehmen <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            </section>
          </div>
        </div>

        <p className="mt-8 text-xs leading-relaxed text-slate-500">
          Modellrechnung ohne Gewähr. Keine Steuer-, Renten- oder Anlageberatung. Die Rechnung läuft vollständig
          in Ihrem Browser — Ihre Eingaben verlassen dieses Gerät nicht.
        </p>
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
        <RechtsLinks />
      </footer>
    </div>
  );
}

function Kachel({ titel, wert, unten, ton }: { titel: string; wert: string; unten: ReactNode; ton?: 'luecke' | 'gut' }) {
  return (
    <div className={`rounded-lg border p-3 ${ton === 'luecke' ? 'border-rose-200' : ton === 'gut' ? 'border-emerald-200' : 'border-slate-200'}`}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{titel}</div>
      <div className={`mt-0.5 text-xl font-black tabular-nums ${ton === 'luecke' ? 'text-rose-600' : ton === 'gut' ? 'text-emerald-700' : 'text-slate-900'}`}>
        {wert}
      </div>
      <div className="text-xs tabular-nums text-slate-500">{unten}</div>
    </div>
  );
}
