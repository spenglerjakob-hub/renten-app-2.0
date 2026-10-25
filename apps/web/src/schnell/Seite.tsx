import { useMemo, useState } from 'react';
import { ArrowRight, ChevronDown, Save } from 'lucide-react';
import { BUNDESLAENDER } from '@renten/engine';
import { SeitenKopf } from '../components/SeitenKopf';
import { RechtsLinks } from '../components/RechtsLinks';
import { AuswahlFeld, DatumFeld, Schalter, ZahlFeld, euro, prozent } from '../components/Feld';
import {
  EINLEITUNG, Hervor, Hinweis, Hinweise, KNOPF, Kernsatz, Karte, LINK, SCHWEBEND, Titel, Zahl,
} from '../components/stil';
import { LueckenRing, ZIEL_RING } from '../components/LueckenRing';
import { KaufkraftKarte } from '../features/KaufkraftKarte';
import { KaufkraftSchalter } from '../components/KaufkraftSchalter';
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
  /*
    Die Darstellung des Ergebnisses: in heutiger Kaufkraft (wie die Luecke in
    der Beratung, und wie das Ziel eingegeben wird) oder nominal, im Geld des
    Rentenjahres — derselbe Schalter wie im Rechner. Die Kaufkraft-Karte
    zeigt immer beides; sie erklaert ja gerade die Umrechnung.
  */
  const [heute, setHeute] = useState(true);
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

  // Die Betraege im gewaehlten Massstab; die Fussnote nennt den anderen. Der Anteil ist in beiden derselbe.
  const gezeigt = (n: number) => (heute ? n / f : n);
  const anders = (n: number) => (heute ? n : n / f);
  const netto = z ? gezeigt(z.nettoMonat) : 0;
  const ziel = z ? gezeigt(z.zielNettoMonat) : 0;
  const lueckeGezeigt = gezeigt(luecke);
  const deckung = z && z.zielNettoMonat > 0 ? Math.round((z.nettoMonat / z.zielNettoMonat) * 100) : 0;

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

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-6 sm:px-6 sm:py-10">
        <div>
          <Titel gross>
            Schnellrechnung: Was bleibt im Alter <Hervor>netto</Hervor>?
          </Titel>
          <p className={`mt-3 ${EINLEITUNG}`}>
            Ein Fall in einer Minute, ohne Anmeldung. Gerechnet wird wie im vollen Rechner: Steuer sowie
            Kranken- und Pflegeversicherung nach aktuellem Rechtsstand.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/*
            ---------- Eingaben: eine weisse Karte wie die Berechnungsgrundlagen der Beratung ----------
            Ab 1280 px laeuft sie mit, damit die Eingaben beim Lesen des Ergebnisses im Blick bleiben —
            darunter nicht: Einspaltig waere sie hoeher als der Bildschirm und unten nicht mehr erreichbar.
          */}
          <Karte titel="Ihr Mandant" klasse="self-start lg:col-span-5 xl:sticky xl:top-6">
            {istBeispiel && <Hinweis klasse="mb-5">Beispielwerte — tragen Sie die Zahlen Ihres Mandanten ein.</Hinweis>}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
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
              <button type="button" onClick={() => setE((x) => ({ ...x, rente: null }))} className={`mt-3 ${LINK} text-xs`}>
                Rente wieder schätzen lassen
              </button>
            )}
          </Karte>

          {/* ---------- Ergebnis: Aussage, Ring als schwebendes Stueck, Kernsatz — wie Schritt 3 der Beratung ---------- */}
          <div className="space-y-6 lg:col-span-7">
            {r && z ? (
              <section aria-labelledby="schnell-ergebnis">
                <Titel als="h2" id="schnell-ergebnis">
                  {luecke > 0
                    ? <>Im Alter fehlen <span className="whitespace-nowrap tabular-nums"><Hervor>{euro(lueckeGezeigt)}</Hervor></span> im Monat</>
                    : <>Das Ziel ist <Hervor>gedeckt</Hervor></>}
                </Titel>
                <div className="mt-2 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
                  <p className={`${EINLEITUNG} min-w-0 flex-1 basis-72`}>
                    Ergebnis für das Jahr {z.jahr}, nach Steuer und Kranken- und Pflegeversicherung
                    {heute ? ' — in heutiger Kaufkraft.' : ` — nominal, im Geld des Jahres ${z.jahr}.`}
                  </p>
                  <KaufkraftSchalter wert={heute} onChange={setHeute} />
                </div>
                <div className={`${SCHWEBEND} mt-5 p-5 sm:p-7`}>
                  <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-center">
                    <LueckenRing ganz={ziel} gedeckt={Math.min(netto, ziel)} luecke={lueckeGezeigt}
                      gedecktProzent={Math.min(100, deckung)} lueckeProzent={Math.max(0, 100 - deckung)} texte={ZIEL_RING} />
                    <dl className="space-y-4">
                      <Zahl etikett="Netto im Ruhestand" punkt="bg-ui-tinte" wert={euro(netto)} zusatz={`${deckung} %`} />
                      {luecke > 0 && (
                        <Zahl etikett="Versorgungslücke" punkt="bg-ui-luecke ring-1 ring-ui-tinte/20" wert={euro(lueckeGezeigt)}
                          zusatz={`${100 - deckung} %`} />
                      )}
                    </dl>
                  </div>
                  <Kernsatz klasse="mt-6">
                    {deckung < 100
                      ? <>Das Netto deckt <Hervor>{deckung} %</Hervor> des Ziels.</>
                      : <>Das Netto erreicht <Hervor>{deckung} %</Hervor> des Ziels.</>}
                  </Kernsatz>
                  <p className="mt-3 text-xs leading-relaxed text-ui-schiefer">
                    {heute ? `Im Geld des Jahres ${z.jahr}` : 'In heutiger Kaufkraft'}: Netto {euro(anders(z.nettoMonat))} und
                    Ziel {euro(anders(z.zielNettoMonat))} im Monat{luecke > 0 ? `, Lücke ${euro(anders(luecke))}` : ''}.
                  </p>
                </div>
              </section>
            ) : (
              <Karte><p className="text-sm text-ui-schiefer">Bitte ein gültiges Geburtsdatum eintragen.</p></Karte>
            )}

            {z && <KaufkraftKarte zeile={z} inflation={0.02} standard wo="im vollen Rechner änderbar" />}

            <Karte titel="Annahmen">
              <Hinweise punkte={[
                'Rentenbeginn mit der Regelaltersgrenze; Inflation 2 % und Rentenanpassung 1 % pro Jahr.',
                'Alleinstehend, angestellt, gesetzlich krankenversichert (KVdR) mit dem durchschnittlichen Zusatzbeitrag.',
                'Keine weiteren Verträge — die erfassen Sie im vollen Rechner.',
              ]} />
              <p className="mt-4 text-xs leading-relaxed text-ui-schiefer">
                Paare, Beamte, Selbstständige und privat Versicherte rechnen Sie im vollen Rechner.
              </p>
            </Karte>

            {/* ---------- Ihr Logo aufs Gutachten ---------- */}
            <section aria-labelledby="schnell-auftritt" className="ui-karte">
              <h2 id="schnell-auftritt" className="m-0">
                <button
                  type="button"
                  onClick={() => setAuftrittOffen((v) => !v)}
                  aria-expanded={auftrittOffen}
                  aria-controls="schnell-auftritt-inhalt"
                  className="flex w-full items-center justify-between gap-3 p-5 text-left sm:p-7"
                >
                  <span>
                    <span className="block text-lg font-medium tracking-[-0.01em] text-ui-tinte sm:text-xl">Ihr Logo aufs Gutachten</span>
                    <span className="mt-0.5 block text-sm font-normal text-ui-schiefer">So sieht das Deckblatt für Ihren Mandanten aus</span>
                  </span>
                  <ChevronDown className={`h-5 w-5 shrink-0 text-ui-schiefer transition-transform ${auftrittOffen ? 'rotate-180' : ''}`} aria-hidden />
                </button>
              </h2>
              {auftrittOffen && (
                <div id="schnell-auftritt-inhalt" className="space-y-5 border-t border-ui-linie px-5 pb-5 pt-5 sm:px-7 sm:pb-7">
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
            <Karte titel="Mit Konto zusätzlich">
              <Hinweise punkte={MIT_KONTO} />
              <button
                type="button"
                onClick={() => speichern('/?registrieren')}
                disabled={!r}
                className={`mt-6 w-full ${KNOPF}`}
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
                className={`mt-4 ${LINK} text-left disabled:opacity-50`}
              >
                Schon ein Konto? Anmelden und den Fall übernehmen <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            </Karte>
          </div>
        </div>

        <p className="text-xs leading-relaxed text-ui-schiefer">
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
