import { useMemo, useState, type ReactNode } from 'react';
import {
  Building2, CircleCheck, HeartPulse, ListChecks, Printer, Stethoscope, TriangleAlert, Wallet,
} from 'lucide-react';
import {
  bkvModell, parameterFuer, BUNDESLAENDER, SACHBEZUG_FREIGRENZE_MONAT, PAUSCHSTEUER_37B, type BkvWeg, type BkvWegId,
} from '@renten/engine';
import { ZahlFeld, ProzentFeld, AuswahlFeld, Schalter, euro, euroGenau, prozent } from '../components/Feld';
import { RechtsLinks } from '../components/RechtsLinks';
import { Kopf, Kasten, Kachel, VergleichZeile, Zusatz, Balken, UmlagenErklaerung } from '../arbeitgeber/bausteine';

/**
 * Arbeitgeber-Seite „Betriebliche Krankenversicherung".
 *
 * Die bKV ist Sachlohn und bis zur Freigrenze von 50 EUR im Monat steuer- und
 * beitragsfrei. Die Seite zeigt, was sie den Arbeitgeber kostet, warum sie
 * guenstiger ist als dieselbe Leistung als Gehaltserhoehung — und wo die
 * Freigrenze kippt. Die Beitraege haengen vom Tarif ab; die Knoepfe sind
 * Beispielbeitraege eines Budgettarifs, das echte Angebot wird eingetragen.
 *
 * Eigenes Bundle, ohne Anmeldung, nichts wird gespeichert.
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
    <div className="min-h-screen bg-slate-100 text-slate-800 print:min-h-0 print:bg-white">
      <Kopf />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10 print:max-w-none print:px-0 print:py-2">
        <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl print:text-xl">
          Betriebliche Krankenversicherung: Gesundheit als Benefit
        </h1>
        <p className="mt-2 max-w-4xl text-sm leading-relaxed text-slate-600 print:mt-1 print:text-[10px] print:leading-snug">
          Sie zahlen für Ihre Mitarbeiter eine private Zusatzversicherung — für Zahnersatz, Brille, Vorsorge oder
          Facharzttermine. Bis {euro(SACHBEZUG_FREIGRENZE_MONAT)} im Monat ist das ein steuer- und abgabenfreier
          Sachbezug: Beim Mitarbeiter kommt jeder Euro an, und Sie zahlen keine Lohnnebenkosten darauf.
        </p>

        <p className="mt-2 hidden text-xs print:text-[10px] leading-snug text-slate-600 print:block">
          Annahmen: Beitrag {euroGenau(beitrag)} je Mitarbeiter und Monat{weitere > 0 ? `, weitere Sachbezüge ${euroGenau(weitere)}` : ''},
          {' '}{n} Mitarbeiter, Weg: {aktiv.titel}. Unternehmenssteuer {prozent(steuersatz, 0)}{umlagen > 0 ? `, Umlagen ${prozent(umlagen)}` : ''}.
          Beispiel-Mitarbeiter für den Gehaltsvergleich: {euro(brutto)} brutto im Jahr,
          {' '}{privat ? `privat versichert (${euro(praemie)} Prämie)` : 'gesetzlich versichert'}, {bundesland},
          {' '}{verheiratet ? 'verheiratet' : 'ledig'}, {kirchensteuer ? 'mit' : 'ohne'} Kirchensteuer. Rechtsstand {p.jahr}.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6 print:mt-2 print:block">
          {/* --- Eingaben ---------------------------------------------------- */}
          <div className="space-y-4 lg:col-span-4 print:hidden">
            <Kasten titel="bKV-Angebot">
              <ZahlFeld label="Mitarbeiter mit bKV" wert={anzahl} onChange={setAnzahl} min={1} schritt={1} stufen />
              <ZahlFeld
                label="Beitrag je Mitarbeiter und Monat" wert={beitrag} onChange={setBeitrag} einheit="€" schritt={1} min={0} gross
                hilfe="Laut Angebot des Versicherers. Monatlich zahlen — eine Jahreszahlung sprengt die Freigrenze."
              />
              <div>
                <p className="text-xs print:text-[11px] text-slate-500">
                  Beispiel: AXA-Budgettarif, Jahresbudget je Mitarbeiter (Beiträge Stand 10/2026, kein Angebot):
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {BEISPIELE.map((b) => {
                    const gesperrt = b.abMitarbeitern !== undefined && n < b.abMitarbeitern;
                    return (
                      <button key={b.budget} type="button" onClick={() => setBeitrag(b.beitrag)} disabled={gesperrt}
                        title={gesperrt ? `Erst ab ${b.abMitarbeitern} Mitarbeitern abschließbar` : undefined}
                        className={`rounded-md border px-2 py-1.5 text-left text-xs print:text-[11px] leading-tight ${
                          gesperrt ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
                          : beitrag === b.beitrag ? 'border-indigo-400 bg-indigo-50 text-indigo-900'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                        }`}>
                        <span className="block font-bold">Budget {euro(b.budget)}</span>
                        <span className={`block ${gesperrt ? '' : 'text-slate-500'}`}>{euroGenau(b.beitrag)} / Monat</span>
                      </button>
                    );
                  })}
                </div>
                {zuKlein ? (
                  <p className="mt-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-xs print:text-[11px] leading-snug text-amber-900">
                    Das Budget {euro(zuKlein.budget)} gibt es erst ab {zuKlein.abMitarbeitern} Mitarbeitern — bei {n} bitte
                    ein größeres Budget wählen.
                  </p>
                ) : (
                  <p className="mt-1 text-xs print:text-[11px] text-slate-500">Budget 300 € erst ab 10 Mitarbeitern abschließbar.</p>
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
                  <p className="text-xs leading-snug text-slate-600">
                    Geschätzt aus dem Beispiel-Mitarbeiter: <strong>{prozent(r.pauschsatz40.satz, 1)}</strong>
                    {traegtMa40 ? ' (Bruttosteuersatz)' : ' (Nettosteuersatz, weil Sie die Steuer übernehmen)'}, dazu Soli
                    {kirchensteuer ? ' und Kirchensteuer' : ''}. Den verbindlichen Satz setzt das Finanzamt fest.
                  </p>
                )}
                <Schalter label="Pauschsteuer trägt der Mitarbeiter" wert={traegtMa40} onChange={setTraegtMa40} />
                <p className="-mt-1 text-xs leading-snug text-slate-500">
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
              <p className="-mt-1 text-xs print:text-[11px] leading-snug text-slate-500">
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
            <p className="-mb-2 text-xs print:text-[11px] font-bold uppercase tracking-wide text-slate-500 print:mb-0">
              Gewählter Weg: <span className="text-indigo-700">{aktiv.titel}</span>
            </p>
            <section className="grid gap-3 sm:grid-cols-3 print:grid-cols-3 print:gap-2">
              <Kachel
                symbol={<Building2 className="h-5 w-5" aria-hidden />} farbe="border-amber-200 bg-amber-50 text-amber-900"
                titel="Kostet Sie netto" betrag={ag.nettoKostenMonat}
                unten={kostenText(aktiv)}
              />
              <Kachel
                symbol={<HeartPulse className="h-5 w-5" aria-hidden />} farbe="border-sky-200 bg-sky-50 text-sky-900"
                titel="Vorteil beim Mitarbeiter" betrag={ma.vorteilMonat} genau={ma.abzuegeMonat < 0.005}
                unten={ma.belastungMonat < 0.005
                  ? 'Versicherungsschutz, ohne Steuer und Abgaben'
                  : `Schutz für ${euroGenau(aktiv.schutzMonat)}, davon trägt er ${euroGenau(ma.belastungMonat)}`}
              />
              <Kachel
                symbol={<Wallet className="h-5 w-5" aria-hidden />} farbe="border-emerald-300 bg-emerald-50 text-emerald-900"
                titel="Gespart gegenüber Gehalt" betrag={aktiv.ersparnisGegenGehaltMonat}
                unten={!g ? 'kein Vergleich — Sie zahlen nichts dazu'
                  : aktiv.ersparnisGegenGehaltMonat < 0.5 ? 'kostet so viel wie eine Gehaltserhöhung'
                  : `je Mitarbeiter und Monat — ${euro(aktiv.ersparnisGegenGehaltMonat * 12 * n)} im Jahr bei ${n}`}
                gross
              />
            </section>

            {/* --- Sachbezug-Check: die eine Grenze, an der alles haengt ------- */}
            <section className={`rounded-2xl border-2 p-4 print:break-inside-avoid print:p-2 ${
              r.inFreigrenze ? 'border-emerald-200 bg-white' : 'border-rose-300 bg-rose-50'
            }`}>
              <h2 className="flex items-center gap-1.5 text-sm font-black text-slate-900">
                {r.inFreigrenze
                  ? <CircleCheck className="h-4 w-4 text-emerald-600" aria-hidden />
                  : <TriangleAlert className="h-4 w-4 text-rose-600" aria-hidden />}
                Sachbezug-Check: {euroGenau(summe)} von {euro(SACHBEZUG_FREIGRENZE_MONAT)}
              </h2>
              <div className="relative mt-2 h-4 overflow-hidden rounded-full bg-slate-100 print:[print-color-adjust:exact]">
                <div
                  className={`absolute inset-y-0 left-0 ${r.inFreigrenze ? 'bg-emerald-500' : 'bg-rose-500'}`}
                  style={{ width: `${(Math.max(0, beitrag) / skala) * 100}%` }}
                />
                <div
                  className={`absolute inset-y-0 ${r.inFreigrenze ? 'bg-emerald-300' : 'bg-rose-300'}`}
                  style={{ left: `${(Math.max(0, beitrag) / skala) * 100}%`, width: `${(Math.max(0, weitere) / skala) * 100}%` }}
                />
                <div
                  aria-hidden className="absolute inset-y-0 w-0.5 bg-slate-900"
                  style={{ left: `${(SACHBEZUG_FREIGRENZE_MONAT / skala) * 100}%` }}
                />
              </div>
              <div className="mt-1 flex flex-wrap justify-between gap-x-3 text-xs print:text-[11px] text-slate-500">
                <span>bKV {euroGenau(beitrag)}{weitere > 0 ? ` + weitere Sachbezüge ${euroGenau(weitere)}` : ''}</span>
                <span>Freigrenze {euro(SACHBEZUG_FREIGRENZE_MONAT)} (§ 8 Abs. 2 S. 11 EStG)</span>
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-700 print:text-[10px] print:leading-snug">
                {r.inFreigrenze
                  ? <>In der Freigrenze: keine Lohnsteuer, keine Sozialabgaben — weder für Sie noch für den Mitarbeiter.
                    {r.freigrenzeRestMonat > 0.005 && <> Noch {euroGenau(r.freigrenzeRestMonat)} frei für andere Sachbezüge.</>}</>
                  : <>Als Sachbezug wäre der <strong>gesamte</strong> Betrag steuer- und beitragspflichtig, auch die
                    anderen Sachbezüge. Unten stehen die Wege, die stattdessen bleiben.</>}
              </p>
            </section>

            {/* --- Die Wege im Vergleich — anklickbar --------------------------- */}
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 print:break-inside-avoid print:p-2 print:shadow-none">
              <h2 className="text-sm font-black text-slate-900">Welcher Weg passt?</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-600 print:text-[10px]">
                Je Mitarbeiter und Monat, für einen Tarif von {euroGenau(beitrag)}.<span className="print:hidden"> Antippen, um einen Weg zu wählen:</span>
              </p>
              <div role="radiogroup" aria-label="Weg der Finanzierung" className="mt-2 space-y-1.5 print:space-y-1">
                {r.wege.map((w) => (
                  <WegZeile key={w.id} weg={w} aktiv={w.id === aktiv.id} onWaehlen={() => setWahl(w.id)} />
                ))}
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-500 print:text-[9px] print:leading-snug">
                „Vorteil“ ist, was dem Mitarbeiter netto bleibt: der Schutz abzüglich Eigenanteil, Steuer und Abgaben.
                {wahl === null && <> Vorausgewählt ist der Weg, der {r.inFreigrenze ? 'ohne Steuer und Abgaben auskommt'
                  : r.vorauswahl === 'aufteilen' ? 'die Freigrenze am besten nutzt'
                  : 'bei dem je Euro Ihrer Kosten am meisten beim Mitarbeiter ankommt'}.</>}
              </p>
            </section>

            {r.hinweise.length > 0 && (
              <section className="space-y-1.5">
                {r.hinweise.map((h, i) => (
                  <p key={i} className="rounded-lg bg-slate-200/60 px-3 py-2 text-xs leading-relaxed text-slate-700 print:px-2 print:py-1 print:text-[9px]">
                    {h}
                  </p>
                ))}
              </section>
            )}

            {/* --- Vergleich mit einer Gehaltserhoehung ------------------------ */}
            {/* Im Druck beginnt hier Seite 2: Seite 1 traegt Kacheln, Check und Wege. */}
            {g ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 print:break-before-page print:break-inside-avoid print:p-2 print:shadow-none">
                <h2 className="text-sm font-black text-slate-900">{aktiv.titel} — und als Gehaltserhöhung?</h2>
                <p className="mt-1 text-[13px] leading-relaxed text-slate-600 print:text-[10px]">
                  Damit beim Mitarbeiter netto derselbe Vorteil ankommt, im Monat:
                </p>
                <table className="mt-2 w-full text-[13px] print:mt-1 print:text-[10px]">
                  <thead>
                    <tr className="text-left text-xs print:text-[11px] text-slate-500">
                      <th className="py-0.5 font-medium" />
                      <th className="py-0.5 text-right font-bold text-emerald-700">{SPALTE[aktiv.id]}</th>
                      <th className="py-0.5 pl-3 text-right font-bold text-slate-600">
                        <span className="sm:hidden">Gehalt</span><span className="hidden sm:inline">Gehaltserhöhung</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-700">
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
                <p className="mt-1 text-xs leading-relaxed text-slate-500 print:text-[9px] print:leading-snug">
                  {herleitung(aktiv, g, n)}
                </p>
                <div className="mt-3 space-y-2 print:hidden">
                  <Balken text={`${aktiv.titel}, kostet Sie netto`} betrag={ag.nettoKostenMonat}
                    max={Math.max(g.nettoKostenMonat, ag.nettoKostenMonat, 1)} farbe="bg-emerald-500" />
                  <Balken text="Gehaltserhöhung, kostet Sie netto" betrag={g.nettoKostenMonat}
                    max={Math.max(g.nettoKostenMonat, ag.nettoKostenMonat, 1)} farbe="bg-slate-400" />
                </div>
              </section>
            ) : aktiv.id === 'arbeitnehmer' && (
              <section className="rounded-2xl border border-slate-200 bg-white p-4 text-[13px] leading-relaxed text-slate-700 shadow-sm print:break-before-page print:p-2 print:text-[10px] print:shadow-none">
                <h2 className="text-sm font-black text-slate-900">Mitarbeiter zahlt selbst</h2>
                <p className="mt-1">
                  Sie schließen den Gruppenvertrag ab, der Mitarbeiter zahlt {euroGenau(beitrag)} im Monat aus dem
                  Netto. Für Sie entstehen keine Beiträge, nur etwas Aufwand in der Abrechnung. Sein Vorteil sind die
                  Gruppenkonditionen — je nach Tarif ohne Gesundheitsprüfung und Wartezeiten. Als Benefit wirkt das
                  schwächer: Der Mitarbeiter sieht vor allem die Kosten.
                </p>
              </section>
            )}


            <div className="space-y-4 print:space-y-2">
              <p className="hidden text-lg font-black text-slate-900 print:block">Vorteile und Umsetzung</p>

              <section className="grid gap-3 sm:grid-cols-2 print:grid-cols-2 print:gap-2">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 print:p-2">
                  <h2 className="flex items-center gap-1.5 text-sm font-black text-slate-900">
                    <Building2 className="h-4 w-4 text-emerald-600" aria-hidden /> Was Sie davon haben
                  </h2>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-[13px] leading-relaxed text-slate-700 print:text-[10px] print:leading-snug">
                    <li><strong>Bindung:</strong> ein Benefit, den Mitarbeiter im Alltag spüren — beim Zahnarzt, beim
                      Optiker, beim Facharzt. Wer kündigt, verliert ihn.</li>
                    <li><strong>Arbeitgebermarke:</strong> in Stellenanzeigen sichtbar und ein Argument gegenüber
                      Bewerbern, das Wettbewerber oft nicht bieten.</li>
                    <li><strong>Gesundheit:</strong> Vorsorge und schnellere Facharzttermine können Ausfallzeiten
                      verkürzen.</li>
                    <li><strong>Günstig:</strong> in der Freigrenze keine Lohnnebenkosten, die Beiträge sind
                      Betriebsausgabe.</li>
                    <li><strong>Planbar:</strong> ein fester Beitrag je Mitarbeiter, die Leistungen wickelt der
                      Versicherer direkt mit dem Mitarbeiter ab.</li>
                  </ul>
                </div>
                <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 print:p-2">
                  <h2 className="flex items-center gap-1.5 text-sm font-black text-slate-900">
                    <Stethoscope className="h-4 w-4 text-sky-600" aria-hidden /> Was Ihre Mitarbeiter davon haben
                  </h2>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-[13px] leading-relaxed text-slate-700 print:text-[10px] print:leading-snug">
                    <li><strong>Ohne Gesundheitsprüfung</strong> und meist ohne Wartezeiten — oft sind auch laufende
                      Behandlungen und bestehende Erkrankungen mitversichert.</li>
                    <li><strong>Budgettarif:</strong> ein Jahresbudget für Zahnreinigung, Brille, Vorsorge oder
                      Heilpraktiker, frei aufteilbar.</li>
                    <li><strong>Bausteine</strong> wie Zahnersatz, Krankenhaus mit Ein- oder Zweibettzimmer und
                      Chefarzt.</li>
                    <li><strong>Angehörige</strong> können oft zu Sonderkonditionen mitversichert werden, auf eigene
                      Kosten.</li>
                    <li>Beim Ausscheiden meist <strong>privat weiterführbar</strong>, ohne neue Gesundheitsprüfung.</li>
                  </ul>
                  <p className="mt-1 text-xs text-slate-500 print:text-[8px]">Leistungen je nach Tarif und Versicherer.</p>
                </div>
              </section>

              <section className="grid gap-3 sm:grid-cols-3 print:grid-cols-3 print:gap-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:col-span-2 print:col-span-2 print:break-inside-avoid print:p-2 print:shadow-none">
                  <h2 className="flex items-center gap-1.5 text-sm font-black text-slate-900">
                    <ListChecks className="h-4 w-4 text-indigo-600" aria-hidden /> Umsetzung: {aktiv.titel}
                  </h2>
                  <ul className="mt-1 space-y-0.5 text-[13px] leading-relaxed text-slate-600 print:text-[10px] print:leading-snug">
                    {UMSETZUNG[aktiv.id].map((punkt, i) => <li key={i}>• {punkt}</li>)}
                    <li>• Gruppenvertrag: <strong>Mindestteilnehmerzahl</strong> und Annahmeregeln im Angebot prüfen</li>
                    <li>• Allen Mitarbeitern oder klar abgegrenzten Gruppen anbieten (<strong>Gleichbehandlung</strong>)</li>
                  </ul>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm print:break-inside-avoid print:p-2 print:shadow-none">
                  <h2 className="text-sm font-black text-slate-900">
                    Bei {n} Mitarbeiter{n === 1 ? '' : 'n'} im Jahr
                  </h2>
                  <dl className="mt-1 space-y-0.5 text-[13px] print:text-xs text-slate-700">
                    <div className="flex justify-between gap-2"><dt>Beiträge{aktiv.id === 'aufteilen' ? ' (Ihr Anteil)' : ''}</dt><dd className="tabular-nums">{euro(ag.beitragMonat * 12 * n)}</dd></div>
                    <div className="flex justify-between gap-2"><dt>Kosten netto</dt><dd className="font-bold tabular-nums">{euro(ag.nettoKostenMonat * 12 * n)}</dd></div>
                    {g && (
                      <div className="flex justify-between gap-2"><dt>als Gehalt netto</dt><dd className="tabular-nums">{euro(g.nettoKostenMonat * 12 * n)}</dd></div>
                    )}
                    <div className="flex justify-between gap-2 border-t border-slate-200 pt-0.5">
                      <dt>gespart</dt><dd className="font-bold tabular-nums text-emerald-700">{euro(aktiv.ersparnisGegenGehaltMonat * 12 * n)}</dd>
                    </div>
                  </dl>
                </div>
              </section>

              <p className="text-xs leading-relaxed text-slate-500 print:text-[8px]">
                Modellrechnung zum Rechtsstand {p.jahr}, keine Steuer- oder Rechtsberatung. Beiträge und Leistungen
                hängen vom Tarif ab; die Beispielbeiträge sind Richtwerte, kein Angebot. Annahme- und
                Gesundheitsregeln legt der Versicherer fest. Der Gehaltsvergleich gilt für den eingetragenen
                Beispiel-Mitarbeiter. Pauschalversteuerung und Aufteilung vorab mit dem Steuerberater abstimmen; der Satz
                nach § 40 ist eine Schätzung aus dem Beispiel-Mitarbeiter, bis das Finanzamt ihn festsetzt.
              </p>
            </div>

            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] print:text-xs print:hidden">
              <span className="text-slate-500">Betriebsrente für Ihre Mitarbeiter:</span>
              <a href="/zuschussmodell" className="font-bold text-indigo-700 hover:underline">Zuschussmodell →</a>
              <span aria-hidden className="text-slate-300">·</span>
              <a href="/festbetrag" className="font-bold text-indigo-700 hover:underline">Festbetrag →</a>
              <span aria-hidden className="text-slate-300">·</span>
              <a href="/arbeitgeber" className="font-bold text-indigo-700 hover:underline">Matching-Modell →</a>
            </p>

            <button
              type="button" onClick={() => window.print()}
              className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 print:hidden"
            >
              <Printer className="h-4 w-4" aria-hidden /> Für den Arbeitgeber drucken
            </button>
            <RechtsLinks />
          </div>
        </div>
      </main>
    </div>
  );
}

/** Eine Zeile im Wege-Vergleich: Radio-Knopf mit den drei Zahlen, die zaehlen. */
function WegZeile({ weg: w, aktiv, onWaehlen }: { weg: BkvWeg; aktiv: boolean; onWaehlen: () => void }) {
  return (
    <button
      type="button" role="radio" aria-checked={aktiv} disabled={!w.moeglich} onClick={onWaehlen}
      // druck-kopf: Knoepfe verschwinden sonst im Druck — hier traegt der
      // Knopf den Vergleich selbst.
      className={`druck-kopf flex w-full flex-col gap-1.5 rounded-xl border px-3 py-2 text-left sm:flex-row sm:items-center sm:gap-3 print:flex-row print:items-center print:gap-2 print:px-2 print:py-1 ${
        !w.moeglich ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
        : aktiv ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-400'
        : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50'
      }`}
    >
      <span className="flex min-w-0 flex-1 items-start gap-2">
        <span aria-hidden className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${
          aktiv ? 'border-indigo-600 bg-indigo-600 shadow-[inset_0_0_0_2px_white]' : 'border-slate-300 bg-white'
        }`} />
        <span className="min-w-0">
          <span className={`block text-[13px] print:text-xs font-bold ${w.moeglich ? 'text-slate-900' : ''}`}>{w.titel}</span>
          <span className="block text-xs leading-snug text-slate-500 print:text-[9px]">{w.kurz}</span>
          {w.grund && (
            <span className={`block text-xs leading-snug print:text-[9px] ${
              w.moeglich ? 'text-amber-700' : w.id === 'sachbezug' ? 'text-rose-600' : 'text-slate-500'
            }`}>
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
      <span className="block text-xs print:text-[10px] leading-tight text-slate-500">{titel}</span>
      <span className={`block text-[13px] print:text-xs tabular-nums ${hervor ? 'font-black text-emerald-700' : 'font-bold text-slate-800'}`}>{wert}</span>
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
