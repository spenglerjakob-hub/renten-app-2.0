import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowRight, CalendarCheck, Check, ChevronDown, CircleCheck, HeartHandshake, HeartPulse, Megaphone, Printer, type LucideIcon,
} from 'lucide-react';
import {
  bkvModell, parameterFuer, BUNDESLAENDER, SACHBEZUG_FREIGRENZE_MONAT, PAUSCHSTEUER_37B, type BkvWeg, type BkvWegId,
} from '@renten/engine';
import { ZahlFeld, ProzentFeld, AuswahlFeld, Schalter, euro, euroGenau, prozent } from '../components/Feld';
import { RechtsLinks } from '../components/RechtsLinks';
import {
  Kopf, Kasten, Kachel, VergleichZeile, Zusatz, Balken, UmlagenErklaerung, Hinweiszeilen, Punkte, Zeile,
  KARTE, KARTE_TITEL, ERKLAERUNG, FUSSNOTE, TABELLE_KOPF, TABELLE_DRUCK, KOPFZELLE,
} from '../arbeitgeber/bausteine';
import { FirmenkundeWahl, firmenWerteSetzer, useFirmenkunde } from '../arbeitgeber/Firmenkunde';
import { EINLEITUNG, Hervor, KNOPF, LINK, Titel } from '../components/stil';

/**
 * Arbeitgeber-Seite „Betriebliche Krankenversicherung".
 *
 * ERST DER NUTZEN, DANN DIE RECHNUNG. Eine bKV entscheidet sich selten ueber
 * den Preis: Sie bindet Mitarbeiter, faellt Bewerbern auf und haelt gesund.
 * Deshalb stehen die Vorteile fuer den Arbeitgeber und seine Mitarbeiter oben,
 * gross und vor jeder Zahl. Darunter folgt, was sie kostet.
 *
 * Die bKV ist Sachlohn und bis zur Freigrenze von 50 EUR im Monat steuer- und
 * beitragsfrei. Die Rechnung zeigt, was sie den Arbeitgeber kostet und warum
 * sie guenstiger ist als dieselbe Leistung als Gehaltserhoehung. Liegt der
 * Tarif ueber der Freigrenze, ist das kein Alarm, sondern ein anderer Weg
 * (Aufteilen, Pauschalsteuer): Die Karte bleibt ruhig und nennt ihn. Der
 * Vergleich aller Wege ist zugeklappt — er ist Sache des Beraters, nicht der
 * erste Blick des Arbeitgebers; im Druck steht er offen. Die Beitraege haengen
 * vom Tarif ab; die Knoepfe sind Beispielbeitraege eines Budgettarifs, das
 * echte Angebot wird eingetragen.
 *
 * Eigenes Bundle, nur mit Konto (Zugangsschranke in main.tsx). Die Rechnung wird nicht gespeichert;
 * ins Konto geht nur die Firma, fuer die gerechnet wird (arbeitgeber/Firmenkunde.tsx).
 */

const p = parameterFuer(new Date().getFullYear(), { indexRate: 0 });

/**
 * Beispiel: AXA-Budgettarif, Beitrag je Mitarbeiter und Monat (Stand 10/2026).
 * Kein Angebot — Beitraege aendern sich, das echte Angebot wird eingetragen.
 * Das kleinste Budget nimmt der Versicherer erst ab 10 Mitarbeitern an.
 */
const BEISPIELE: { budget: number; beitrag: number; abMitarbeitern?: number }[] = [
  { budget: 300, beitrag: 11.92, abMitarbeitern: 10 },
  { budget: 600, beitrag: 21.88 },
  { budget: 900, beitrag: 28.72 },
  { budget: 1200, beitrag: 36.33 },
  { budget: 1500, beitrag: 42.67 },
];

/** Was der Arbeitgeber davon hat — die vier Gruende, die im Gespraech tragen. Das Geld folgt darunter in der Rechnung. */
const VORTEILE: { symbol: LucideIcon; titel: string; text: string }[] = [
  {
    symbol: HeartHandshake, titel: 'Mitarbeiter binden',
    text: 'Ein Benefit, den Ihre Mitarbeiter im Alltag spüren — beim Zahnarzt, beim Optiker, beim Facharzt. Wer kündigt, verliert ihn.',
  },
  {
    symbol: Megaphone, titel: 'Bewerber gewinnen',
    text: 'In jeder Stellenanzeige sichtbar und ein Argument gegenüber Bewerbern, das Wettbewerber oft nicht bieten.',
  },
  {
    symbol: HeartPulse, titel: 'Gesunde Belegschaft',
    text: 'Vorsorge und schnellere Facharzttermine können Ausfallzeiten verkürzen.',
  },
  {
    symbol: CalendarCheck, titel: 'Planbar, wenig Aufwand',
    text: 'Ein fester Beitrag je Mitarbeiter. Die Leistungen wickelt der Versicherer direkt mit dem Mitarbeiter ab.',
  },
];

/** Titel eines Abschnitts der Seite — zwischen dem Seitentitel und den Titeln der Karten. */
const ABSCHNITT = 'ui-titel text-[22px] leading-tight text-ui-tinte sm:text-[26px] print:text-base';

/** Kurzname fuer Tabellenkopf und Druckzeile */
const SPALTE: Record<BkvWegId, string> = {
  sachbezug: 'Sachbezug', aufteilen: 'Aufteilen', pauschal37b: '§ 37b', pauschal40: '§ 40', barlohn: 'Barlohn',
  arbeitnehmer: 'Selbstzahler',
};

export function Seite() {
  /** Vom Nutzer gewaehlter Weg — null: der Vorschlag der Rechnung */
  const [wahl, setWahl] = useState<BkvWegId | null>(null);
  const [beitrag, setBeitrag] = useState(21.88);
  const [weitere, setWeitere] = useState(0);
  const [anzahl, setAnzahl] = useState(10);
  const [steuersatz, setSteuersatz] = useState(0.3);
  const [umlagen, setUmlagen] = useState(0);
  const [brutto, setBrutto] = useState(48_000);
  const [privat, setPrivat] = useState(false);
  const [praemie, setPraemie] = useState(600);
  const [bundesland, setBundesland] = useState<string>('Nordrhein-Westfalen');
  const [verheiratet, setVerheiratet] = useState(false);
  const [kirchensteuer, setKirchensteuer] = useState(false);
  /** § 40: Satz vom Finanzamt statt der Schaetzung */
  const [eigenerSatz40, setEigenerSatz40] = useState(false);
  const [satz40, setSatz40] = useState(0.25);
  const [traegtMa40, setTraegtMa40] = useState(false);
  /** Der Vergleich der Wege: am Bildschirm zugeklappt, im Druck immer offen */
  const [wegeOffen, setWegeOffen] = useState(false);
  const wegeRef = useRef<HTMLElement>(null);
  const wegeZeigen = () => {
    setWegeOffen(true);
    // Erst nach dem Aufklappen ins Bild holen — vorher ist die Karte noch kurz.
    requestAnimationFrame(() => wegeRef.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start',
    }));
  };

  // Fuer welche Firma gerechnet wird: Name und Logo fuer Kopf und Ausdruck, Sitz, Steuersatz und Umlagen aus ihrem Angebot.
  const kunde = useFirmenkunde({
    werte: { bundesland, steuersatz, umlagen },
    onWerte: firmenWerteSetzer({ bundesland: setBundesland, steuersatz: setSteuersatz, umlagen: setUmlagen }),
  });

  const steuerOpt = useMemo(
    () => ({ verheiratet, bundesland, kirchensteuerpflichtig: kirchensteuer }), [verheiratet, bundesland, kirchensteuer],
  );
  const r = useMemo(() => bkvModell({
    beitragMonat: beitrag,
    weitereSachbezuegeMonat: weitere,
    jahresbrutto: brutto,
    unternehmensSteuersatz: steuersatz,
    umlagenSatz: umlagen,
    privatVersichert: privat,
    pkvPraemieMonat: privat ? praemie : 0,
    kinder: { hatKinder: false, kinderUnter25: 0 },
    anzahlMitarbeiter: Math.max(1, Math.round(anzahl)),
    pauschsatz40: eigenerSatz40 ? satz40 : null,
    pauschsteuer40TraegtMitarbeiter: traegtMa40,
  }, steuerOpt, p), [
    beitrag, weitere, brutto, steuersatz, umlagen, privat, praemie, steuerOpt, anzahl, eigenerSatz40, satz40, traegtMa40,
  ]);

  // Ein gewaehlter Weg, der durch neue Eingaben unmoeglich wird (Sachbezug
  // ueber 50 EUR), faellt auf den Vorschlag zurueck — die Wahl bleibt
  // gespeichert und greift wieder, sobald er moeglich ist.
  const gewaehlt = r.wege.find((w) => w.id === wahl);
  const aktiv: BkvWeg = gewaehlt?.moeglich ? gewaehlt : r.wege.find((w) => w.id === r.vorauswahl)!;
  const ag = aktiv.arbeitgeber;
  const ma = aktiv.mitarbeiter;
  const pauschsatzText = aktiv.id === 'pauschal40'
    ? `${prozent(r.pauschsatz40.satz, 1)}${r.pauschsatz40.geschaetzt ? ' (geschätzt)' : ''}`
    : prozent(PAUSCHSTEUER_37B, 0);
  const g = aktiv.gehalt;
  const n = Math.max(1, Math.round(anzahl));
  const summe = Math.max(0, beitrag) + Math.max(0, weitere);
  const skala = Math.max(SACHBEZUG_FREIGRENZE_MONAT * 1.2, summe);
  /** Gewaehlter Beispieltarif, der bei dieser Mitarbeiterzahl nicht abschliessbar ist */
  const zuKlein = BEISPIELE.find((b) => b.abMitarbeitern && b.beitrag === beitrag && n < b.abMitarbeitern);

  return (
    <div className="min-h-screen bg-ui-flaeche text-ui-tinte print:min-h-0 print:bg-white">
      <Kopf kunde={kunde.kunde} />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10 print:max-w-none print:px-0 print:py-2">
        <Titel gross klasse="print:text-xl">
          Betriebliche Krankenversicherung: <Hervor>Gesundheit als Benefit</Hervor>
        </Titel>
        <p className={`mt-3 ${EINLEITUNG} print:mt-1 print:text-[10px] print:leading-snug`}>
          Sie zahlen für Ihre Mitarbeiter eine private Zusatzversicherung — für Zahnersatz, Brille, Vorsorge oder
          Facharzttermine. Bis {euro(SACHBEZUG_FREIGRENZE_MONAT)} im Monat ist das ein steuer- und abgabenfreier
          Sachbezug: Beim Mitarbeiter kommt jeder Euro an, und Sie zahlen keine Lohnnebenkosten darauf.
        </p>

        {/* --- Wofür: die Vorteile zuerst --------------------------------------- */}
        <section aria-labelledby="bkv-vorteile" className="mt-8 sm:mt-10 print:mt-3">
          <h2 id="bkv-vorteile" className={ABSCHNITT}>Was Sie als Arbeitgeber davon haben</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 print:mt-2 print:grid-cols-4 print:gap-2">
            {VORTEILE.map((v) => <Vorteil key={v.titel} {...v} />)}
          </div>
          <div className={`${KARTE} mt-3 print:mt-2 print:break-inside-avoid`}>
            <h3 className={KARTE_TITEL}>Was Ihre Mitarbeiter davon haben</h3>
            <ul className="mt-3 grid gap-x-8 gap-y-2.5 text-sm leading-relaxed text-ui-tinte sm:grid-cols-2 lg:grid-cols-3 print:mt-1 print:grid-cols-3 print:gap-x-4 print:gap-y-1 print:text-[10px] print:leading-snug [&_strong]:font-medium">
              <Haken><strong>Ohne Gesundheitsprüfung</strong> und meist ohne Wartezeiten — oft sind auch laufende
                Behandlungen und bestehende Erkrankungen mitversichert.</Haken>
              <Haken><strong>Budgettarif:</strong> ein Jahresbudget für Zahnreinigung, Brille, Vorsorge oder
                Heilpraktiker, frei aufteilbar.</Haken>
              <Haken><strong>Bausteine</strong> wie Zahnersatz, Krankenhaus mit Ein- oder Zweibettzimmer und
                Chefarzt.</Haken>
              <Haken><strong>Angehörige</strong> können oft zu Sonderkonditionen mitversichert werden, auf eigene
                Kosten.</Haken>
              <Haken>Beim Ausscheiden meist <strong>privat weiterführbar</strong>, ohne neue Gesundheitsprüfung.</Haken>
            </ul>
            <p className="mt-3 text-xs text-ui-schiefer print:mt-1 print:text-[8px]">Leistungen je nach Tarif und Versicherer.</p>
          </div>
        </section>

        {/* --- Und was es kostet ------------------------------------------------- */}
        <h2 className={`mt-10 sm:mt-12 print:mt-3 ${ABSCHNITT}`}>Was es kostet</h2>
        <p className={`mt-2 ${EINLEITUNG} print:hidden`}>
          Je Mitarbeiter und Monat, gerechnet mit Ihren Angaben — und verglichen mit derselben Leistung als
          Gehaltserhöhung.
        </p>

        <p className="mt-2 hidden text-xs leading-snug text-ui-schiefer print:block print:text-[10px]">
          Annahmen: Beitrag {euroGenau(beitrag)} je Mitarbeiter und Monat{weitere > 0 ? `, weitere Sachbezüge ${euroGenau(weitere)}` : ''},
          {' '}{n} Mitarbeiter, Weg: {aktiv.titel}. Unternehmenssteuer {prozent(steuersatz, 0)}{umlagen > 0 ? `, Umlagen ${prozent(umlagen)}` : ''}.
          Beispiel-Mitarbeiter für den Gehaltsvergleich: {euro(brutto)} brutto im Jahr,
          {' '}{privat ? `privat versichert (${euro(praemie)} Prämie)` : 'gesetzlich versichert'}, {bundesland},
          {' '}{verheiratet ? 'verheiratet' : 'ledig'}, {kirchensteuer ? 'mit' : 'ohne'} Kirchensteuer. Rechtsstand {p.jahr}.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6 print:mt-2 print:block">
          {/* --- Eingaben ---------------------------------------------------- */}
          <div className="space-y-4 lg:col-span-4 print:hidden">
            <FirmenkundeWahl kunde={kunde} />

            <Kasten titel="bKV-Angebot">
              <ZahlFeld label="Mitarbeiter mit bKV" wert={anzahl} onChange={setAnzahl} min={1} schritt={1} stufen />
              <ZahlFeld
                label="Beitrag je Mitarbeiter und Monat" wert={beitrag} onChange={setBeitrag} einheit="€" schritt={1} min={0} gross
                hilfe="Laut Angebot des Versicherers. Monatlich zahlen — eine Jahreszahlung sprengt die Freigrenze."
              />
              <div>
                <p className="text-xs text-ui-schiefer print:text-[11px]">
                  Beispiel: AXA-Budgettarif, Jahresbudget je Mitarbeiter (Beiträge Stand 10/2026, kein Angebot):
                </p>
                {/* Gewaehlt wie ein Reiter: gefuellt in Soot; nicht abschliessbare Budgets leise auf der Innenflaeche. */}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {BEISPIELE.map((b) => {
                    const gesperrt = b.abMitarbeitern !== undefined && n < b.abMitarbeitern;
                    const gewaehlt = beitrag === b.beitrag;
                    return (
                      <button key={b.budget} type="button" onClick={() => setBeitrag(b.beitrag)} disabled={gesperrt}
                        aria-pressed={gewaehlt}
                        title={gesperrt ? `Erst ab ${b.abMitarbeitern} Mitarbeitern abschließbar` : undefined}
                        className={`rounded-[8px] border px-2.5 py-1.5 text-left text-xs leading-tight transition-colors print:text-[11px] ${
                          gesperrt ? 'cursor-not-allowed border-ui-linie bg-ui-innen text-ui-schiefer'
                          : gewaehlt ? 'border-ui-dunkel bg-ui-dunkel text-white'
                          : 'border-ui-zweit-rand bg-ui-karte text-ui-tinte hover:bg-ui-hover'
                        }`}>
                        <span className="block font-medium">Budget {euro(b.budget)}</span>
                        <span className={`block ${gesperrt ? '' : gewaehlt ? 'text-white/80' : 'text-ui-schiefer'}`}>{euroGenau(b.beitrag)} / Monat</span>
                      </button>
                    );
                  })}
                </div>
                {zuKlein ? (
                  <p className="mt-2 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs leading-snug text-rose-900 print:text-[11px]">
                    Das Budget {euro(zuKlein.budget)} gibt es erst ab {zuKlein.abMitarbeitern} Mitarbeitern — bei {n} bitte
                    ein größeres Budget wählen.
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs text-ui-schiefer print:text-[11px]">Budget 300 € erst ab 10 Mitarbeitern abschließbar.</p>
                )}
              </div>
              <ZahlFeld
                label="Weitere Sachbezüge im Monat" wert={weitere} onChange={setWeitere} einheit="€" schritt={5} min={0}
                hilfe="Gutschein-, Tank- oder Essenskarte über Sachbezug. Die 50 € gelten für alle zusammen."
              />
            </Kasten>

            {aktiv.id === 'pauschal40' && (
              <Kasten titel="Pauschalversteuerung § 40">
                <Schalter label="Satz vom Finanzamt eintragen" wert={eigenerSatz40} onChange={(an) => {
                  // Beim Einschalten mit der Schaetzung starten, nicht mit einem Fantasiewert.
                  if (an) setSatz40(Math.round(r.pauschsatz40.satz * 1000) / 1000);
                  setEigenerSatz40(an);
                }} />
                {eigenerSatz40 ? (
                  <ProzentFeld
                    label="Pauschsteuersatz nach § 40" wert={satz40} onChange={setSatz40} min={0} max={60} stellen={1}
                    hilfe="Den Satz ermittelt das Finanzamt bzw. der Steuerberater aus den Durchschnittswerten aller einbezogenen Mitarbeiter (R 40.1 Abs. 3 LStR). Ohne Soli und Kirchensteuer eintragen."
                  />
                ) : (
                  <p className="text-xs leading-snug text-ui-schiefer">
                    Geschätzt aus dem Beispiel-Mitarbeiter: <span className="font-medium text-ui-tinte">{prozent(r.pauschsatz40.satz, 1)}</span>
                    {traegtMa40 ? ' (Bruttosteuersatz)' : ' (Nettosteuersatz, weil Sie die Steuer übernehmen)'}, dazu Soli
                    {kirchensteuer ? ' und Kirchensteuer' : ''}. Den verbindlichen Satz setzt das Finanzamt fest.
                  </p>
                )}
                <Schalter label="Pauschsteuer trägt der Mitarbeiter" wert={traegtMa40} onChange={setTraegtMa40} />
                <p className="-mt-2 text-xs leading-snug text-ui-schiefer">
                  Abwälzung nach § 40 Abs. 3 S. 2 EStG: Der Mitarbeiter zahlt die Steuer aus dem Netto, die
                  Bemessungsgrundlage sinkt dadurch nicht.
                </p>
              </Kasten>
            )}

            <Kasten titel="Unternehmen">
              <ProzentFeld
                label="Steuersatz auf den Gewinn" wert={steuersatz} onChange={setSteuersatz} min={0} max={60}
                hilfe="GmbH mit 400 % Hebesatz rund 30 %. Einzelunternehmen und Personengesellschaften: persönlicher Satz."
              />
              <ProzentFeld
                label="Umlagen U1, U2, Insolvenzgeld" wert={umlagen} onChange={setUmlagen} min={0} max={10} stellen={2}
                hilfe="Fallen auf Gehalt an — auf die bKV in der Freigrenze nicht. Ohne Angabe nicht eingerechnet."
              />
              <UmlagenErklaerung onWaehlen={setUmlagen} />
            </Kasten>

            <Kasten titel="Beispiel-Mitarbeiter">
              <p className="-mt-2 text-xs leading-snug text-ui-schiefer print:text-[11px]">
                Nur für den Vergleich mit einer Gehaltserhöhung — die bKV selbst kostet bei jedem Gehalt gleich viel.
              </p>
              <ZahlFeld label="Bruttogehalt im Jahr" wert={brutto} onChange={setBrutto} einheit="€" schritt={1000} />
              <AuswahlFeld
                label="Krankenversicherung" wert={privat ? 'privat' : 'gesetzlich'}
                onChange={(v) => setPrivat(v === 'privat')}
                optionen={[{ wert: 'gesetzlich', text: 'gesetzlich' }, { wert: 'privat', text: 'privat' }]}
              />
              {privat && (
                <ZahlFeld label="PKV-Prämie im Monat" wert={praemie} onChange={setPraemie} einheit="€" schritt={10} />
              )}
              <AuswahlFeld
                label="Bundesland" wert={bundesland} onChange={setBundesland}
                optionen={BUNDESLAENDER.filter((l) => l !== 'Bund').map((l) => ({ wert: l as string, text: l }))}
              />
              <Schalter label="verheiratet" wert={verheiratet} onChange={setVerheiratet} />
              <Schalter label="kirchensteuerpflichtig" wert={kirchensteuer} onChange={setKirchensteuer} />
            </Kasten>
          </div>

          {/* --- Ergebnis ---------------------------------------------------- */}
          <div className="space-y-4 lg:col-span-8 print:space-y-2">
            <p className="-mb-1 text-sm text-ui-schiefer print:mb-0 print:text-[11px]">
              Gewählter Weg: <span className="font-medium text-ui-tinte">{aktiv.titel}</span>
            </p>
            <section className="grid gap-3 sm:grid-cols-3 print:grid-cols-3 print:gap-2">
              <Kachel
                titel="Kostet Sie netto" betrag={ag.nettoKostenMonat}
                unten={kostenText(aktiv)}
              />
              <Kachel
                titel="Vorteil beim Mitarbeiter" betrag={ma.vorteilMonat} genau={ma.abzuegeMonat < 0.005}
                unten={ma.belastungMonat < 0.005
                  ? 'Versicherungsschutz, ohne Steuer und Abgaben'
                  : `Schutz für ${euroGenau(aktiv.schutzMonat)}, davon trägt er ${euroGenau(ma.belastungMonat)}`}
              />
              <Kachel
                titel="Gespart gegenüber Gehalt" betrag={aktiv.ersparnisGegenGehaltMonat}
                unten={!g ? 'kein Vergleich — Sie zahlen nichts dazu'
                  : aktiv.ersparnisGegenGehaltMonat < 0.5 ? 'kostet so viel wie eine Gehaltserhöhung'
                  : `je Mitarbeiter und Monat — ${euro(aktiv.ersparnisGegenGehaltMonat * 12 * n)} im Jahr bei ${n}`}
                akzent
              />
            </section>

            {/* --- Sachbezug-Check: die eine Grenze, an der alles haengt ------- */}
            {/*
              DER SACHBEZUG-CHECK — immer eine ruhige Karte: der Balken in
              Tinte, die Grenze als Strich in Cyan, dem einen Akzent. Liegt der
              Tarif darueber, ist das kein Fehler, sondern der Anlass fuer einen
              anderen Weg: Die Karte sagt, warum, und nennt den Weg, mit dem
              gerechnet ist — ohne Warnzeichen und ohne Rot.
            */}
            <section className={`${KARTE} print:break-inside-avoid`}>
              <h2 className={`flex items-center gap-2 ${KARTE_TITEL}`}>
                {r.inFreigrenze && <CircleCheck className="h-5 w-5 shrink-0 text-ui-tinte print:h-4 print:w-4" aria-hidden />}
                Sachbezug-Check: {euroGenau(summe)} von {euro(SACHBEZUG_FREIGRENZE_MONAT)}
              </h2>
              <div className="relative mt-3 h-3 overflow-hidden rounded-full bg-ui-linie print:mt-2 print:[print-color-adjust:exact]">
                <div
                  className="absolute inset-y-0 left-0 bg-ui-tinte"
                  style={{ width: `${(Math.max(0, beitrag) / skala) * 100}%` }}
                />
                <div
                  className="absolute inset-y-0 bg-ui-daten-3"
                  style={{ left: `${(Math.max(0, beitrag) / skala) * 100}%`, width: `${(Math.max(0, weitere) / skala) * 100}%` }}
                />
                <div
                  aria-hidden className="absolute inset-y-0 w-1 bg-ui-knopf"
                  style={{ left: `${(SACHBEZUG_FREIGRENZE_MONAT / skala) * 100}%` }}
                />
              </div>
              <div className="mt-1.5 flex flex-wrap justify-between gap-x-3 text-xs text-ui-schiefer print:text-[11px]">
                <span>bKV {euroGenau(beitrag)}{weitere > 0 ? ` + weitere Sachbezüge ${euroGenau(weitere)}` : ''}</span>
                <span>Freigrenze {euro(SACHBEZUG_FREIGRENZE_MONAT)} (§ 8 Abs. 2 S. 11 EStG)</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-ui-tinte print:mt-1.5 print:text-[10px] print:leading-snug [&_strong]:font-medium">
                {r.inFreigrenze
                  ? <>In der Freigrenze: keine Lohnsteuer, keine Sozialabgaben — weder für Sie noch für den Mitarbeiter.
                    {r.freigrenzeRestMonat > 0.005 && <> Noch {euroGenau(r.freigrenzeRestMonat)} frei für andere Sachbezüge.</>}</>
                  : <>Über der Freigrenze: Als reiner Sachbezug wäre der <strong>gesamte</strong> Betrag steuer- und
                    beitragspflichtig. Gerechnet ist deshalb mit dem Weg <strong>{aktiv.titel}</strong>: {aktiv.kurz}.</>}
              </p>
              {!r.inFreigrenze && !wegeOffen && (
                <button type="button" onClick={wegeZeigen} className={`mt-2 ${LINK} text-sm print:hidden`}>
                  Alle Wege vergleichen <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </section>

            {/* --- Die Wege im Vergleich — anklickbar --------------------------- */}
            {/*
              Die Hinweise gehoeren zum Sachbezug — deshalb direkt unter dem
              Check. Ueber der Freigrenze sagt die Karte selbst, dass der ganze
              Betrag pflichtig waere; derselbe Hinweis darunter waere doppelt.
            */}
            <Hinweiszeilen hinweise={r.inFreigrenze ? r.hinweise : r.hinweise.filter((h) => !h.includes('GESAMTE'))} />

            {/*
              EINKLAPPBAR, zu als Vorgabe: Sechs Wege mit je drei Zahlen sind
              das Handwerk des Beraters. Zugeklappt nennt die Karte den
              gewaehlten Weg; ein Tipp zeigt alle. Der Titel sitzt im Knopf
              (`druck-kopf`), der Inhalt steht im Druck immer offen
              (`druck-inhalt`).

              IM DRUCK beginnt hier Seite 2: Seite 1 traegt, was den
              Arbeitgeber ueberzeugt — Vorteile, Kosten, Sachbezug-Check —,
              Seite 2 das Handwerk: Wege, Gehaltsvergleich, Umsetzung. Wege,
              die nicht gehen, stehen nicht im Ausdruck; so bleibt es bei zwei
              Seiten.
            */}
            <section ref={wegeRef} className={`${KARTE} scroll-mt-4 print:break-before-page print:break-inside-avoid`}>
              {/* Der Knopf reicht 8 px in den Rand der Karte (Flaeche zum Treffen) — der Titel traegt den Versatz, damit der Knopf in ihm bleibt. */}
              <h2 className={`${KARTE_TITEL} -m-2 print:m-0`}>
                <button
                  type="button" onClick={() => setWegeOffen((o) => !o)} aria-expanded={wegeOffen} aria-controls="bkv-wege"
                  className="druck-kopf flex w-full items-center justify-between gap-3 rounded-[8px] p-2 text-left hover:bg-ui-hover print:p-0"
                >
                  <span>Welcher Weg passt?</span>
                  <ChevronDown className={`h-5 w-5 shrink-0 text-ui-schiefer transition-transform print:hidden ${wegeOffen ? 'rotate-180' : ''}`} aria-hidden />
                </button>
              </h2>
              {!wegeOffen && (
                <p className={`${ERKLAERUNG} print:hidden`}>
                  Gewählt: <span className="font-medium text-ui-tinte">{aktiv.titel}</span> — kostet Sie
                  netto {euro(ag.nettoKostenMonat)}, Vorteil beim Mitarbeiter {euro(ma.vorteilMonat)}. Aufklappen, um
                  alle Wege zu vergleichen.
                </p>
              )}
              <div id="bkv-wege" className={`druck-inhalt ${wegeOffen ? 'block' : 'hidden'}`}>
                <p className={ERKLAERUNG}>
                  Je Mitarbeiter und Monat, für einen Tarif von {euroGenau(beitrag)}.<span className="print:hidden"> Antippen, um einen Weg zu wählen:</span>
                </p>
                <div role="radiogroup" aria-label="Weg der Finanzierung" className="mt-3 space-y-2 print:mt-2 print:space-y-1">
                  {r.wege.map((w) => (
                    <WegZeile key={w.id} weg={w} aktiv={w.id === aktiv.id} onWaehlen={() => setWahl(w.id)} />
                  ))}
                </div>
                <p className={FUSSNOTE}>
                  „Vorteil“ ist, was dem Mitarbeiter netto bleibt: der Schutz abzüglich Eigenanteil, Steuer und Abgaben.
                  {wahl === null && <> Vorausgewählt ist der Weg, der {r.inFreigrenze ? 'ohne Steuer und Abgaben auskommt'
                    : r.vorauswahl === 'aufteilen' ? 'die Freigrenze am besten nutzt'
                    : 'bei dem je Euro Ihrer Kosten am meisten beim Mitarbeiter ankommt'}.</>}
                </p>
              </div>
            </section>

            {/* --- Vergleich mit einer Gehaltserhoehung ------------------------ */}
            {g ? (
              <section className={`${KARTE} print:break-inside-avoid`}>
                <h2 className={KARTE_TITEL}>{aktiv.titel} — und als Gehaltserhöhung?</h2>
                <p className={ERKLAERUNG}>
                  Damit beim Mitarbeiter netto derselbe Vorteil ankommt, im Monat:
                </p>
                <table className={`mt-3 w-full text-sm print:mt-1 ${TABELLE_DRUCK}`}>
                  <thead>
                    <tr className={`text-left ${TABELLE_KOPF}`}>
                      <td className={`${KOPFZELLE} font-normal`} />
                      <th className={`${KOPFZELLE} text-right font-medium text-ui-tinte`}>{SPALTE[aktiv.id]}</th>
                      <th className={`${KOPFZELLE} pl-3 text-right font-normal`}>
                        <span className="sm:hidden">Gehalt</span><span className="hidden sm:inline">Gehaltserhöhung</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="text-ui-tinte">
                    <VergleichZeile
                      text={aktiv.id === 'aufteilen' ? 'Zahlung des Arbeitgebers (Ihr Anteil)' : 'Zahlung des Arbeitgebers'}
                      links={<>{euroGenau(ag.beitragMonat)}<Zusatz> Beitrag</Zusatz></>}
                      rechts={<>{euro(g.bruttoMonat)}<Zusatz> brutto</Zusatz></>}
                    />
                    <VergleichZeile
                      text={`+ Arbeitgeberanteil Sozialversicherung${umlagen > 0 ? ' und Umlagen' : ''}`}
                      links={ag.abgabenMonat < 0.005 ? <>0 €<Zusatz> frei</Zusatz></> : `+ ${euro(ag.abgabenMonat)}`}
                      rechts={`+ ${euro(g.agAbgabenMonat)}`}
                    />
                    {ag.pauschsteuerMonat > 0 && (
                      <VergleichZeile
                        text={`+ Pauschsteuer ${pauschsatzText} mit Soli${kirchensteuer ? ' und Kirchensteuer' : ''}`}
                        links={`+ ${euro(ag.pauschsteuerMonat)}`} rechts="—"
                      />
                    )}
                    <VergleichZeile
                      text={`= Personalkosten vor Steuern${aktiv.faktor > 1.005 ? ` (Faktor ${aktiv.faktor.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : ''}`}
                      summe
                      links={euro(ag.kostenVorSteuerMonat)} rechts={euro(g.kostenVorSteuerMonat)}
                    />
                    <VergleichZeile
                      text={`− Steuerersparnis (${prozent(steuersatz, 0)} Betriebsausgabe)`}
                      links={`− ${euro(ag.steuerersparnisMonat)}`} rechts={`− ${euro(g.steuerersparnisMonat)}`}
                    />
                    <VergleichZeile
                      text="= kostet Sie netto" summe hervor
                      links={euro(ag.nettoKostenMonat)} rechts={euro(g.nettoKostenMonat)}
                    />
                    {ma.eigenanteilMonat > 0.005 && (
                      <VergleichZeile
                        text="Eigenanteil des Mitarbeiters, aus dem Netto"
                        links={euroGenau(ma.eigenanteilMonat)} rechts="—"
                      />
                    )}
                    {ma.abzuegeMonat > 0.005 && (
                      <VergleichZeile
                        text={aktiv.id === 'pauschal37b' ? 'Abzüge beim Mitarbeiter (bei § 37b nur Sozialabgaben)'
                          : aktiv.id === 'pauschal40' ? `Pauschsteuer ${pauschsatzText}, trägt der Mitarbeiter`
                          : 'Steuer und Abgaben des Mitarbeiters'}
                        links={euro(ma.abzuegeMonat)}
                        rechts={euro(g.svMonat + g.steuerMonat)}
                      />
                    )}
                    <VergleichZeile
                      text="Vorteil beim Mitarbeiter, netto" summe
                      links={euro(ma.vorteilMonat)}
                      rechts={<>{euro(g.nettoMonat)}<Zusatz> netto</Zusatz></>}
                    />
                  </tbody>
                </table>
                <p className={FUSSNOTE}>
                  {herleitung(aktiv, g, n)}
                </p>
                <div className="mt-4 space-y-3 print:hidden">
                  <Balken text={`${aktiv.titel}, kostet Sie netto`} betrag={ag.nettoKostenMonat}
                    max={Math.max(g.nettoKostenMonat, ag.nettoKostenMonat, 1)} farbe="bg-ui-tinte" />
                  <Balken text="Gehaltserhöhung, kostet Sie netto" betrag={g.nettoKostenMonat}
                    max={Math.max(g.nettoKostenMonat, ag.nettoKostenMonat, 1)} farbe="bg-ui-daten-3" />
                </div>
              </section>
            ) : aktiv.id === 'arbeitnehmer' && (
              <section className={`${KARTE} text-sm leading-relaxed text-ui-tinte print:break-inside-avoid print:text-[10px] print:leading-snug`}>
                <h2 className={KARTE_TITEL}>Mitarbeiter zahlt selbst</h2>
                <p className="mt-3 print:mt-1">
                  Sie schließen den Gruppenvertrag ab, der Mitarbeiter zahlt {euroGenau(beitrag)} im Monat aus dem
                  Netto. Für Sie entstehen keine Beiträge, nur etwas Aufwand in der Abrechnung. Sein Vorteil sind die
                  Gruppenkonditionen — je nach Tarif ohne Gesundheitsprüfung und Wartezeiten. Als Benefit wirkt das
                  schwächer: Der Mitarbeiter sieht vor allem die Kosten.
                </p>
              </section>
            )}


            <div className="space-y-4 print:space-y-2">
              <section className="grid gap-3 sm:grid-cols-3 print:grid-cols-3 print:gap-2">
                <div className={`${KARTE} sm:col-span-2 print:col-span-2 print:break-inside-avoid`}>
                  <h2 className={KARTE_TITEL}>Umsetzung: {aktiv.titel}</h2>
                  <Punkte klasse="mt-3 print:mt-1">
                    {UMSETZUNG[aktiv.id].map((punkt, i) => <li key={i}>{punkt}</li>)}
                    <li>Gruppenvertrag: <strong>Mindestteilnehmerzahl</strong> und Annahmeregeln im Angebot prüfen</li>
                    <li>Allen Mitarbeitern oder klar abgegrenzten Gruppen anbieten (<strong>Gleichbehandlung</strong>)</li>
                  </Punkte>
                </div>
                <div className={`${KARTE} print:break-inside-avoid`}>
                  <h2 className={KARTE_TITEL}>
                    Bei {n} Mitarbeiter{n === 1 ? '' : 'n'} im Jahr
                  </h2>
                  <dl className="mt-3 text-sm print:mt-1 print:text-xs">
                    <Zeile text={`Beiträge${aktiv.id === 'aufteilen' ? ' (Ihr Anteil)' : ''}`} betrag={ag.beitragMonat * 12 * n} />
                    <Zeile text="Kosten netto" betrag={ag.nettoKostenMonat * 12 * n} stark />
                    {g && <Zeile text="als Gehalt netto" betrag={g.nettoKostenMonat * 12 * n} />}
                    <Zeile text="gespart" betrag={aktiv.ersparnisGegenGehaltMonat * 12 * n} summe />
                  </dl>
                </div>
              </section>

              <p className="text-xs leading-relaxed text-ui-schiefer print:text-[8px]">
                Modellrechnung zum Rechtsstand {p.jahr}, keine Steuer- oder Rechtsberatung. Beiträge und Leistungen
                hängen vom Tarif ab; die Beispielbeiträge sind Richtwerte, kein Angebot. Annahme- und
                Gesundheitsregeln legt der Versicherer fest. Der Gehaltsvergleich gilt für den eingetragenen
                Beispiel-Mitarbeiter. Pauschalversteuerung und Aufteilung vorab mit dem Steuerberater abstimmen; der Satz
                nach § 40 ist eine Schätzung aus dem Beispiel-Mitarbeiter, bis das Finanzamt ihn festsetzt.
              </p>
            </div>

            {/* Die Betriebsrente als Textlinks, wie „Andere Modelle“ auf ihren Seiten. */}
            <p className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm print:hidden">
              <span className="text-ui-schiefer">Betriebsrente für Ihre Mitarbeiter:</span>
              <a href="/zuschussmodell" className={LINK}>Zuschussmodell <ArrowRight className="h-3.5 w-3.5" aria-hidden /></a>
              <a href="/festbetrag" className={LINK}>Festbetrag <ArrowRight className="h-3.5 w-3.5" aria-hidden /></a>
              <a href="/arbeitgeber" className={LINK}>Matching-Modell <ArrowRight className="h-3.5 w-3.5" aria-hidden /></a>
            </p>

            <button type="button" onClick={() => window.print()} className={`${KNOPF} print:hidden`}>
              <Printer className="h-4 w-4" aria-hidden /> Für den Arbeitgeber drucken
            </button>
            <RechtsLinks />
          </div>
        </div>
      </main>
    </div>
  );
}

/** Ein Vorteil fuer den Arbeitgeber: Zeichen, ein Schlagwort, ein Satz — gross genug, um im Gespraech zu tragen. */
function Vorteil({ symbol: Zeichen, titel, text }: { symbol: LucideIcon; titel: string; text: string }) {
  return (
    <div className={`${KARTE} print:break-inside-avoid`}>
      <span aria-hidden className="ui-innen flex h-11 w-11 items-center justify-center rounded-full print:hidden">
        <Zeichen className="h-5 w-5 text-ui-tinte" />
      </span>
      <h3 className="mt-4 text-lg font-medium leading-snug tracking-[-0.01em] text-ui-tinte print:mt-0 print:text-xs">{titel}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-ui-schiefer print:mt-0.5 print:text-[10px] print:leading-snug">{text}</p>
    </div>
  );
}

/** Ein Punkt mit Haken — was der Mitarbeiter bekommt. */
function Haken({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2">
      <Check className="mt-1 h-4 w-4 shrink-0 text-ui-schiefer print:mt-0.5 print:h-2.5 print:w-2.5" aria-hidden />
      <span>{children}</span>
    </li>
  );
}

/** Eine Zeile im Wege-Vergleich: Radio-Knopf mit den drei Zahlen, die zaehlen. */
function WegZeile({ weg: w, aktiv, onWaehlen }: { weg: BkvWeg; aktiv: boolean; onWaehlen: () => void }) {
  return (
    <button
      type="button" role="radio" aria-checked={aktiv} disabled={!w.moeglich} onClick={onWaehlen}
      // druck-kopf: Knoepfe verschwinden sonst im Druck — hier traegt der
      // Knopf den Vergleich selbst.
      // Gewaehlt wie die Wahl in der Beratung: Rand und Punkt in Tinte, auf der Innenflaeche — ohne Blau.
      // Ein Weg, der nicht geht, steht nicht im Ausdruck — am Bildschirm sagt er, warum.
      className={`druck-kopf flex w-full flex-col gap-1.5 rounded-[10px] border px-3 py-2.5 text-left transition-colors sm:flex-row sm:items-center sm:gap-3 print:flex-row print:items-center print:gap-2 print:px-2 print:py-1 ${
        !w.moeglich ? 'cursor-not-allowed border-ui-linie bg-ui-innen text-ui-schiefer print:!hidden'
        : aktiv ? 'border-ui-tinte bg-ui-innen ring-1 ring-ui-tinte'
        : 'border-ui-linie bg-ui-karte hover:border-ui-feld-rand hover:bg-ui-hover'
      }`}
    >
      <span className="flex min-w-0 flex-1 items-start gap-2">
        <span aria-hidden className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${
          aktiv ? 'border-ui-tinte bg-ui-tinte shadow-[inset_0_0_0_2px_white]' : 'border-ui-feld-rand bg-white'
        }`} />
        <span className="min-w-0">
          <span className={`block text-sm font-medium print:text-xs ${w.moeglich ? 'text-ui-tinte' : ''}`}>{w.titel}</span>
          <span className="block text-xs leading-snug text-ui-schiefer print:text-[9px]">{w.kurz}</span>
          {w.grund && (
            <span className={`block text-xs leading-snug print:text-[9px] ${w.moeglich ? 'text-ui-tinte' : 'text-ui-schiefer'}`}>
              {w.grund}
            </span>
          )}
        </span>
      </span>
      {w.moeglich && (
        <span className="grid shrink-0 grid-cols-3 gap-2 pl-5 text-right sm:w-64 sm:pl-0 print:w-56 print:pl-0">
          <Zahl titel="Sie netto" wert={euro(w.arbeitgeber.nettoKostenMonat)} />
          <Zahl titel="MA trägt" wert={euro(w.mitarbeiter.belastungMonat)} />
          <Zahl titel="Vorteil MA" wert={euro(w.mitarbeiter.vorteilMonat)} hervor />
        </span>
      )}
    </button>
  );
}

function Zahl({ titel, wert, hervor }: { titel: string; wert: string; hervor?: boolean }) {
  return (
    <span className="block">
      <span className="block text-xs leading-tight text-ui-schiefer print:text-[10px]">{titel}</span>
      <span className={`block text-sm tabular-nums text-ui-tinte print:text-xs ${hervor ? 'font-medium' : ''}`}>{wert}</span>
    </span>
  );
}

function kostenText(w: BkvWeg): string {
  const a = w.arbeitgeber;
  switch (w.id) {
    case 'sachbezug': return `je Mitarbeiter und Monat, für ${euroGenau(a.beitragMonat)} Beitrag`;
    case 'aufteilen': return `für Ihren Anteil von ${euroGenau(a.beitragMonat)}, steuerfrei`;
    case 'pauschal37b': return `inkl. ${euro(a.pauschsteuerMonat)} Pauschsteuer und ${euro(a.abgabenMonat)} Sozialabgaben`;
    case 'pauschal40': return w.mitarbeiter.abzuegeMonat > 0.005
      ? `nur der Beitrag (${euro(a.beitragMonat * 12)} im Jahr) — die Pauschsteuer trägt der Mitarbeiter`
      : `inkl. ${euro(a.pauschsteuerMonat)} Pauschsteuer, keine Sozialabgaben — Beitrag ${euro(a.beitragMonat * 12)} im Jahr`;
    case 'barlohn': return `inkl. ${euro(a.abgabenMonat)} Arbeitgeberanteil Sozialabgaben`;
    case 'arbeitnehmer': return 'Sie bieten nur den Gruppenvertrag an';
  }
}

function herleitung(w: BkvWeg, g: NonNullable<BkvWeg['gehalt']>, n: number): ReactNode {
  const jahr = `bei ${n} Mitarbeiter${n === 1 ? '' : 'n'} ${euro(w.ersparnisGegenGehaltMonat * 12 * n)} im Jahr`;
  const gehaltSatz = <>Von {euro(g.bruttoMonat)} Gehaltserhöhung gehen beim Mitarbeiter {euro(g.svMonat)} Sozialabgaben
    und {euro(g.steuerMonat)} Steuer ab, bei Ihnen kommen {euro(g.agAbgabenMonat)} Arbeitgeberanteil dazu.</>;
  switch (w.id) {
    case 'sachbezug':
      return <>{gehaltSatz} Die bKV bringt denselben Vorteil für {euro(w.ersparnisGegenGehaltMonat)} weniger im Monat — {jahr}.</>;
    case 'aufteilen':
      return <>Ihr Anteil bleibt in der Freigrenze und damit frei von Steuer und Abgaben; den Rest von
        {' '}{euroGenau(w.mitarbeiter.eigenanteilMonat)} zahlt der Mitarbeiter aus dem Netto. {gehaltSatz} Gegenüber
        der Gehaltserhöhung sparen Sie {euro(w.ersparnisGegenGehaltMonat)} im Monat — {jahr}.</>;
    case 'pauschal40':
      return <>Pauschal versteuert nach § 40 ist der Beitrag frei von Sozialabgaben — für Sie und den Mitarbeiter.
        {w.mitarbeiter.abzuegeMonat > 0.005
          ? <> Die Pauschsteuer trägt der Mitarbeiter aus dem Netto, Sie zahlen nur den Beitrag.</>
          : <> Sie übernehmen die Pauschsteuer zu einem einheitlichen Satz, den das Finanzamt auf Antrag festsetzt.</>}
        {' '}Der Beitrag wird halbjährlich oder jährlich gezahlt; andere Sachbezüge bleiben in der Freigrenze. {gehaltSatz}
        {w.ersparnisGegenGehaltMonat >= 0.5 ? <> Ersparnis {euro(w.ersparnisGegenGehaltMonat)} im Monat — {jahr}.</> : null}</>;
    case 'pauschal37b':
      return <>Sie übernehmen die Lohnsteuer pauschal, der Mitarbeiter zahlt nur seine Sozialabgaben. Teurer als
        die Freigrenze, aber der ganze Tarif ist abgedeckt und andere Sachbezüge bleiben frei. {gehaltSatz}
        {w.ersparnisGegenGehaltMonat >= 0.5 ? <> Ersparnis {euro(w.ersparnisGegenGehaltMonat)} im Monat — {jahr}.</> : null}</>;
    case 'barlohn':
      return <>Als Barlohn ist der Beitrag Gehalt — beide Wege kosten gleich viel. Der Vorteil gegenüber einer
        Gehaltserhöhung liegt nur in den Gruppenkonditionen des Tarifs, nicht in Steuer und Abgaben.</>;
    case 'arbeitnehmer':
      return null;
  }
}

/** Was je Weg in der Umsetzung zu beachten ist — vor den allgemeinen Punkten. */
const UMSETZUNG: Record<BkvWegId, ReactNode[]> = {
  sachbezug: [
    <><strong>Monatlich zahlen</strong> — eine Jahreszahlung fließt in einem Monat zu und sprengt die Grenze</>,
    <><strong>Zusätzlich zum Gehalt</strong> gewähren, nicht per Gehaltsumwandlung</>,
    <>Der Mitarbeiter kann nur den <strong>Versicherungsschutz</strong> verlangen, kein Geld</>,
    <>Die 50 € mit <strong>anderen Sachbezügen</strong> abstimmen (Gutschein-, Tankkarte)</>,
    <>In der <strong>Lohnabrechnung</strong> als steuerfreien Sachbezug führen</>,
    <>Sie sind <strong>Versicherungsnehmer</strong> und zahlen die Beiträge; festhalten in einer <strong>arbeitsvertraglichen
      Vereinbarung</strong> mit klarer Definition (nur Versicherungsschutz, kein Geldanspruch)</>,
  ],
  aufteilen: [
    <>Ihr Anteil <strong>monatlich</strong> und <strong>zusätzlich zum Gehalt</strong>, nur als Versicherungsschutz</>,
    <>Der <strong>Eigenanteil</strong> wird vom Nettolohn einbehalten — nicht per Gehaltsumwandlung</>,
    <>Ihr Anteil und andere Sachbezüge zusammen höchstens <strong>50 €</strong></>,
    <>Mit Versicherer und Lohnbuchhaltung klären, dass sie die <strong>Aufteilung</strong> abbilden</>,
  ],
  pauschal37b: [
    <><strong>§ 37b Abs. 2 EStG:</strong> 30 % Pauschsteuer, dazu Soli und ggf. Kirchensteuer, in der Lohnsteuer-Anmeldung</>,
    <>Das Wahlrecht gilt <strong>einheitlich</strong> für alle Sachzuwendungen an Arbeitnehmer im Wirtschaftsjahr</>,
    <>Sozialversicherung bleibt <strong>pflichtig</strong> — beide Anteile werden abgerechnet</>,
    <>Zusätzlich zum Gehalt; höchstens 10.000 € je Empfänger und Jahr — nur, wenn die 50-€-Freigrenze nicht genutzt wird</>,
  ],
  pauschal40: [
    <>Beiträge <strong>halbjährlich oder jährlich</strong> zahlen — monatlich wären sie laufender Lohn, kein sonstiger Bezug</>,
    <><strong>Antrag beim Betriebsstättenfinanzamt</strong>; der einheitliche Satz wird nach R 40.1 Abs. 3 LStR aus den
      Durchschnittswerten der Mitarbeiter ermittelt</>,
    <>Erst ab <strong>20 Mitarbeitern</strong> („größere Zahl von Fällen“), darunter nur ausnahmsweise mit Zustimmung des Finanzamts</>,
    <>Höchstens <strong>1.000 € je Mitarbeiter und Jahr</strong> (§ 40 Abs. 1 S. 3 EStG)</>,
    <><strong>Sozialversicherungsfrei</strong> (§ 1 Abs. 1 S. 1 Nr. 2 SvEV)</>,
    <>Pauschsteuer tragen Sie (Nettosteuersatz) oder per <strong>Abwälzung</strong> der Mitarbeiter — vorab mit dem
      Steuerberater abstimmen</>,
  ],
  barlohn: [
    <>Als <strong>Zuschuss mit Geldanspruch</strong> gestalten, dann berührt er die 50-€-Grenze nicht</>,
    <>In der Lohnabrechnung wie Gehalt: Lohnsteuer und Sozialabgaben</>,
    <>Als Sachlohn über 50 € wäre es genauso teuer — und die anderen Sachbezüge fielen mit aus der Grenze</>,
  ],
  arbeitnehmer: [
    <>Der Mitarbeiter zahlt aus dem <strong>Netto</strong>, Sie leiten den Beitrag weiter oder er zahlt direkt</>,
    <>Kein Benefit im steuerlichen Sinn — ein Zuschuss lässt sich später ergänzen</>,
  ],
};
