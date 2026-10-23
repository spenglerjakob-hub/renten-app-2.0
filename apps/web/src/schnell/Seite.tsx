import { useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, Check, ChevronDown, Save } from 'lucide-react';
import { BUNDESLAENDER } from '@renten/engine';
import { SeitenKopf } from '../components/SeitenKopf';
import { RechtsLinks } from '../components/RechtsLinks';
import { AuswahlFeld, DatumFeld, Schalter, ZahlFeld, euro, prozent } from '../components/Feld';
import { Hervor, KNOPF, LINK, Titel } from '../components/stil';
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
    <div className="min-h-screen bg-ui-flaeche text-ui-tinte">
      <SeitenKopf
        verlinkt
        rechts={(
          <a href="/" className="shrink-0 rounded-full border border-ui-zweit-rand bg-ui-karte px-3 py-1.5 text-xs font-medium text-ui-tinte hover:bg-ui-innen">
            Anmelden
          </a>
        )}
      />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <Titel gross>
          Schnellrechnung: Was bleibt im Alter <Hervor>netto</Hervor>?
        </Titel>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ui-schiefer sm:text-base">
          Ein Fall in einer Minute, ohne Anmeldung. Gerechnet wird wie im vollen Rechner: Steuer sowie
          Kranken- und Pflegeversicherung nach aktuellem Rechtsstand.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* ---------- Eingaben ---------- */}
          <section aria-labelledby="schnell-eingaben" className="ui-eingabe p-4 sm:p-5 lg:col-span-5">
            <h2 id="schnell-eingaben" className="text-base font-medium text-ui-tinte">Ihr Mandant</h2>
            {istBeispiel && (
              <p className="mt-2 rounded-lg border border-dashed border-ui-schiefer/60 bg-ui-karte px-3 py-2 text-xs leading-relaxed text-ui-tinte">
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
                className="mt-2 text-xs font-medium text-ui-tinte underline-offset-4 hover:underline">
                Rente wieder schätzen lassen
              </button>
            )}
          </section>

          {/* ---------- Ergebnis ---------- */}
          <div className="space-y-4 lg:col-span-7">
            {r && z ? (
              <section aria-labelledby="schnell-ergebnis" className="ui-karte p-4 sm:p-5">
                <h2 id="schnell-ergebnis" className="text-base font-medium text-ui-tinte">Ergebnis für das Jahr {z.jahr}</h2>
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
                {/* Die Luecke in Euro allein sagt nicht, ob sie gross ist —
                    der Anteil am Ziel ordnet sie ein. */}
                {z.zielNettoMonat > 0 && <Deckung netto={z.nettoMonat} ziel={z.zielNettoMonat} />}
                <p className="mt-3 text-xs leading-relaxed text-ui-schiefer">
                  Monatsbeträge nach Steuer und Kranken- und Pflegeversicherung, im Geld des Jahres {z.jahr};
                  „heute“ in heutiger Kaufkraft.
                </p>
              </section>
            ) : (
              <p className="ui-karte p-4 text-sm text-ui-schiefer">Bitte ein gültiges Geburtsdatum eintragen.</p>
            )}

            {z && <KaufkraftKarte zeile={z} inflation={0.02} standard wo="im vollen Rechner änderbar" />}

            <section aria-labelledby="schnell-annahmen" className="ui-karte p-4 text-sm sm:p-5">
              <h2 id="schnell-annahmen" className="text-base font-medium text-ui-tinte">Annahmen</h2>
              <ul className="mt-2 space-y-1 text-ui-schiefer">
                <li>Rentenbeginn mit der Regelaltersgrenze; Inflation 2 % und Rentenanpassung 1 % pro Jahr.</li>
                <li>Alleinstehend, angestellt, gesetzlich krankenversichert (KVdR) mit dem durchschnittlichen Zusatzbeitrag.</li>
                <li>Keine weiteren Verträge — die erfassen Sie im vollen Rechner.</li>
              </ul>
              <p className="mt-2 text-xs text-ui-schiefer">
                Paare, Beamte, Selbstständige und privat Versicherte rechnen Sie im vollen Rechner.
              </p>
            </section>

            {/* ---------- Ihr Logo aufs Gutachten ---------- */}
            <section aria-labelledby="schnell-auftritt" className="ui-karte">
              <h2 id="schnell-auftritt" className="m-0">
                <button
                  type="button"
                  onClick={() => setAuftrittOffen((v) => !v)}
                  aria-expanded={auftrittOffen}
                  aria-controls="schnell-auftritt-inhalt"
                  className="flex w-full items-center justify-between gap-3 p-4 text-left sm:p-5"
                >
                  <span>
                    <span className="block text-base font-medium text-ui-tinte">Ihr Logo aufs Gutachten</span>
                    <span className="block text-xs font-normal text-ui-schiefer">So sieht das Deckblatt für Ihren Mandanten aus</span>
                  </span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-ui-schiefer transition-transform ${auftrittOffen ? 'rotate-180' : ''}`} aria-hidden />
                </button>
              </h2>
              {auftrittOffen && (
                <div id="schnell-auftritt-inhalt" className="space-y-4 border-t border-ui-linie px-4 pb-4 pt-4 sm:px-5 sm:pb-5">
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
                  <p className="text-xs leading-relaxed text-ui-schiefer">
                    Logo, Firmenname und Farbe bleiben in diesem Browser, bis Sie ein Konto anlegen — danach liegen
                    sie in Ihrem Konto und stehen auf jedem Gutachten. Ihren Namen und Ihre Kontaktdaten ergänzen Sie
                    dort.
                  </p>
                  {speicherHinweis && <p role="status" className="text-xs font-medium text-ui-tinte">{speicherHinweis}</p>}
                  {!auftrittLeer(auftrittVoll) && (
                    <button
                      type="button"
                      onClick={auftrittEntfernen}
                      className="rounded-full border border-ui-zweit-rand bg-white px-3 py-1.5 text-xs font-medium text-ui-tinte hover:bg-ui-innen"
                    >
                      Entfernen
                    </button>
                  )}
                </div>
              )}
            </section>

            {/* ---------- Mit Konto ---------- */}
            <section aria-labelledby="schnell-konto" className="ui-karte p-4 sm:p-5">
              <h2 id="schnell-konto" className="text-base font-medium text-ui-tinte">Mit Konto zusätzlich</h2>
              <ul className="mt-2 space-y-1.5 text-sm text-ui-tinte">
                {MIT_KONTO.map((x) => (
                  <li key={x} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-ui-tinte" aria-hidden /> {x}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => speichern('/?registrieren')}
                disabled={!r}
                className={`mt-4 w-full ${KNOPF}`}
              >
                <Save className="h-4 w-4" aria-hidden /> Fall speichern
              </button>
              <p className="mt-2 text-xs leading-relaxed text-ui-schiefer">
                Zum Speichern brauchen Sie ein Konto — kostenlos, 14 Tage alle Funktionen, ohne
                Zahlungsdaten. Bis dahin {bleibtImBrowser} nur in diesem Browser.
              </p>
              <button
                type="button"
                onClick={() => speichern('/')}
                disabled={!r}
                className={`mt-3 ${LINK} text-left disabled:opacity-50`}
              >
                Schon ein Konto? Anmelden und den Fall übernehmen <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            </section>
          </div>
        </div>

        <p className="mt-8 text-xs leading-relaxed text-ui-schiefer">
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

function Deckung({ netto, ziel }: { netto: number; ziel: number }) {
  const anteil = Math.min(1, Math.max(0, netto / ziel));
  const prozent = Math.round(anteil * 100);
  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm text-ui-tinte">
        <span>Das Netto deckt <strong className="font-medium tabular-nums">{prozent} %</strong> des Ziels</span>
        {prozent < 100 && <span className="text-ui-schiefer">es fehlen <strong className="font-medium tabular-nums text-ui-tinte">{100 - prozent} %</strong></span>}
      </div>
      {/* Wie der Luecken-Ring der Mitarbeiterberatung: Tinte das Netto, Stein die Luecke. */}
      <div
        role="img"
        aria-label={`Das Netto deckt ${prozent} % des Ziels`}
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-ui-luecke"
      >
        <div className="h-full rounded-full bg-ui-tinte" style={{ width: `${prozent}%` }} />
      </div>
    </div>
  );
}

function Kachel({ titel, wert, unten, ton }: { titel: string; wert: string; unten: ReactNode; ton?: 'luecke' | 'gut' }) {
  return (
    // Die Luecke ist die eine Zahl, auf die es ankommt: Rahmen in Tinte statt Rot — sie ist kein Fehler.
    <div className={`rounded-lg border p-3 ${ton === 'luecke' ? 'border-ui-tinte bg-ui-karte' : 'border-ui-linie bg-ui-innen'}`}>
      <div className="text-xs text-ui-schiefer">{titel}</div>
      <div className="ui-titel mt-0.5 text-2xl font-normal tabular-nums text-ui-tinte">
        {wert}
      </div>
      <div className="text-xs tabular-nums text-ui-schiefer">{unten}</div>
    </div>
  );
}
