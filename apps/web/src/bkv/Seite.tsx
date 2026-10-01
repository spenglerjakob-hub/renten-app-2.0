import { useMemo, useState } from 'react';
import {
  Building2, CircleCheck, HeartPulse, ListChecks, Printer, Stethoscope, TriangleAlert, Wallet,
} from 'lucide-react';
import { bkvModell, parameterFuer, BUNDESLAENDER, SACHBEZUG_FREIGRENZE_MONAT } from '@renten/engine';
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

export function Seite() {
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
  }, steuerOpt, p), [beitrag, weitere, brutto, steuersatz, umlagen, privat, praemie, steuerOpt]);

  const ag = r.arbeitgeber;
  const ma = r.mitarbeiter;
  const g = r.gehalt;
  const n = Math.max(1, Math.round(anzahl));
  const wertNetto = ma.wertMonat - ma.abzuegeMonat;
  const summe = Math.max(0, beitrag) + Math.max(0, weitere);
  const skala = Math.max(SACHBEZUG_FREIGRENZE_MONAT * 1.2, summe);
  /** Gewaehlter Beispieltarif, der bei dieser Mitarbeiterzahl nicht abschliessbar ist */
  const zuKlein = BEISPIELE.find((b) => b.abMitarbeitern && b.beitrag === beitrag && n < b.abMitarbeitern);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 print:min-h-0 print:bg-white">
      <Kopf />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10 print:max-w-none print:px-0 print:py-2">
        <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl print:text-xl">
          Betriebliche Krankenversicherung: Gesundheit als Benefit
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600 print:mt-1 print:text-[10px] print:leading-snug">
          Sie zahlen für Ihre Mitarbeiter eine private Zusatzversicherung — für Zahnersatz, Brille, Vorsorge oder
          Facharzttermine. Bis {euro(SACHBEZUG_FREIGRENZE_MONAT)} im Monat ist das ein steuer- und abgabenfreier
          Sachbezug: Beim Mitarbeiter kommt jeder Euro an, und Sie zahlen keine Lohnnebenkosten darauf.
        </p>

        <p className="mt-2 hidden text-[10px] leading-snug text-slate-600 print:block">
          Annahmen: Beitrag {euroGenau(beitrag)} je Mitarbeiter und Monat{weitere > 0 ? `, weitere Sachbezüge ${euroGenau(weitere)}` : ''},
          {' '}{n} Mitarbeiter. Unternehmenssteuer {prozent(steuersatz, 0)}{umlagen > 0 ? `, Umlagen ${prozent(umlagen)}` : ''}.
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
                <p className="text-[11px] text-slate-500">
                  Beispiel: AXA-Budgettarif, Jahresbudget je Mitarbeiter (Beiträge Stand 10/2026, kein Angebot):
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {BEISPIELE.map((b) => {
                    const gesperrt = b.abMitarbeitern !== undefined && n < b.abMitarbeitern;
                    return (
                      <button key={b.budget} type="button" onClick={() => setBeitrag(b.beitrag)} disabled={gesperrt}
                        title={gesperrt ? `Erst ab ${b.abMitarbeitern} Mitarbeitern abschließbar` : undefined}
                        className={`rounded-md border px-2 py-1.5 text-left text-[11px] leading-tight ${
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
                  <p className="mt-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-900">
                    Das Budget {euro(zuKlein.budget)} gibt es erst ab {zuKlein.abMitarbeitern} Mitarbeitern — bei {n} bitte
                    ein größeres Budget wählen.
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] text-slate-500">Budget 300 € erst ab 10 Mitarbeitern abschließbar.</p>
                )}
              </div>
              <ZahlFeld
                label="Weitere Sachbezüge im Monat" wert={weitere} onChange={setWeitere} einheit="€" schritt={5} min={0}
                hilfe="Gutschein-, Tank- oder Essenskarte über Sachbezug. Die 50 € gelten für alle zusammen."
              />
            </Kasten>

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
              <p className="-mt-1 text-[11px] leading-snug text-slate-500">
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
            <section className="grid gap-3 sm:grid-cols-3 print:grid-cols-3 print:gap-2">
              <Kachel
                symbol={<Building2 className="h-5 w-5" aria-hidden />} farbe="border-amber-200 bg-amber-50 text-amber-900"
                titel="Kostet Sie netto" betrag={ag.nettoKostenMonat}
                unten={`je Mitarbeiter und Monat, für ${euroGenau(ag.beitragMonat)} Beitrag`}
              />
              <Kachel
                symbol={<HeartPulse className="h-5 w-5" aria-hidden />} farbe="border-sky-200 bg-sky-50 text-sky-900"
                titel="Kommt beim Mitarbeiter an" betrag={wertNetto} genau={r.inFreigrenze}
                unten={r.inFreigrenze
                  ? 'Versicherungsschutz, ohne Steuer und Abgaben'
                  : `nach ${euro(ma.abzuegeMonat)} Steuer und Abgaben`}
              />
              <Kachel
                symbol={<Wallet className="h-5 w-5" aria-hidden />} farbe="border-emerald-300 bg-emerald-50 text-emerald-900"
                titel="Gespart gegenüber Gehalt" betrag={r.ersparnisGegenGehaltMonat}
                unten={!g ? 'kein Beitrag eingetragen'
                  : !r.inFreigrenze ? 'über der Freigrenze kein Vorteil mehr'
                  : `je Mitarbeiter und Monat — ${euro(r.ersparnisGegenGehaltMonat * 12 * n)} im Jahr bei ${n}`}
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
              <div className="mt-1 flex flex-wrap justify-between gap-x-3 text-[11px] text-slate-500">
                <span>bKV {euroGenau(beitrag)}{weitere > 0 ? ` + weitere Sachbezüge ${euroGenau(weitere)}` : ''}</span>
                <span>Freigrenze {euro(SACHBEZUG_FREIGRENZE_MONAT)} (§ 8 Abs. 2 S. 11 EStG)</span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-700 print:text-[10px] print:leading-snug">
                {r.inFreigrenze
                  ? <>In der Freigrenze: keine Lohnsteuer, keine Sozialabgaben — weder für Sie noch für den Mitarbeiter.
                    {r.freigrenzeRestMonat > 0.005 && <> Noch {euroGenau(r.freigrenzeRestMonat)} frei für andere Sachbezüge.</>}</>
                  : <>Über der Freigrenze ist der <strong>gesamte</strong> Betrag steuer- und beitragspflichtig — die
                    bKV wird wie Gehalt behandelt und verliert ihren Vorteil.</>}
              </p>
            </section>

            {/* --- Vergleich mit einer Gehaltserhoehung ------------------------ */}
            {g && (
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 print:break-inside-avoid print:p-2 print:shadow-none">
                <h2 className="text-sm font-black text-slate-900">Und als Gehaltserhöhung?</h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-600 print:text-[10px]">
                  Damit beim Mitarbeiter netto dasselbe ankommt, im Monat:
                </p>
                <table className="mt-2 w-full text-xs print:mt-1 print:text-[10px]">
                  <thead>
                    <tr className="text-left text-[11px] text-slate-500">
                      <th className="py-0.5 font-medium" />
                      <th className="py-0.5 text-right font-bold text-emerald-700">bKV</th>
                      <th className="py-0.5 pl-3 text-right font-bold text-slate-600">
                        <span className="sm:hidden">Gehalt</span><span className="hidden sm:inline">Gehaltserhöhung</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-700">
                    <VergleichZeile
                      text="Zahlung des Arbeitgebers"
                      links={<>{euroGenau(ag.beitragMonat)}<Zusatz> Beitrag</Zusatz></>}
                      rechts={<>{euro(g.bruttoMonat)}<Zusatz> brutto</Zusatz></>}
                    />
                    <VergleichZeile
                      text={`+ Arbeitgeberanteil Sozialversicherung${umlagen > 0 ? ' und Umlagen' : ''}`}
                      links={r.inFreigrenze ? <>0 €<Zusatz> frei</Zusatz></> : `+ ${euro(ag.abgabenMonat)}`}
                      rechts={`+ ${euro(g.agAbgabenMonat)}`}
                    />
                    <VergleichZeile
                      text="= Personalkosten vor Steuern" summe
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
                    <VergleichZeile
                      text="Beim Mitarbeiter kommt an" summe
                      links={<>{euro(wertNetto)}<Zusatz> Schutz</Zusatz></>}
                      rechts={<>{euro(g.nettoMonat)}<Zusatz> netto</Zusatz></>}
                    />
                  </tbody>
                </table>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500 print:text-[9px] print:leading-snug">
                  {r.inFreigrenze
                    ? <>Von {euro(g.bruttoMonat)} Gehaltserhöhung gehen beim Mitarbeiter {euro(g.svMonat)} Sozialabgaben
                      und {euro(g.steuerMonat)} Steuer ab, bei Ihnen kommen {euro(g.agAbgabenMonat)} Arbeitgeberanteil
                      dazu. Die bKV bringt denselben Wert für {euro(r.ersparnisGegenGehaltMonat)} weniger im Monat —
                      bei {n} Mitarbeiter{n === 1 ? '' : 'n'} {euro(r.ersparnisGegenGehaltMonat * 12 * n)} im Jahr.</>
                    : <>Über der Freigrenze wird die bKV wie Gehalt abgerechnet — beide Wege kosten dann gleich viel.
                      Den Beitrag oder die anderen Sachbezüge so wählen, dass die Summe bei höchstens
                      {' '}{euro(SACHBEZUG_FREIGRENZE_MONAT)} bleibt.</>}
                </p>
                <div className="mt-3 space-y-2 print:hidden">
                  <Balken text="bKV, kostet Sie netto" betrag={ag.nettoKostenMonat}
                    max={Math.max(g.nettoKostenMonat, ag.nettoKostenMonat, 1)} farbe="bg-emerald-500" />
                  <Balken text="Gehaltserhöhung, kostet Sie netto" betrag={g.nettoKostenMonat}
                    max={Math.max(g.nettoKostenMonat, ag.nettoKostenMonat, 1)} farbe="bg-slate-400" />
                </div>
              </section>
            )}

            {r.hinweise.length > 0 && (
              <section className="space-y-1.5">
                {r.hinweise.map((h, i) => (
                  <p key={i} className="rounded-lg bg-slate-200/60 px-3 py-2 text-[11px] leading-relaxed text-slate-700 print:px-2 print:py-1 print:text-[9px]">
                    {h}
                  </p>
                ))}
              </section>
            )}

            <div className="space-y-4 print:break-before-page print:space-y-2">
              <p className="hidden text-lg font-black text-slate-900 print:block">Vorteile und Umsetzung</p>

              <section className="grid gap-3 sm:grid-cols-2 print:grid-cols-2 print:gap-2">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 print:p-2">
                  <h2 className="flex items-center gap-1.5 text-sm font-black text-slate-900">
                    <Building2 className="h-4 w-4 text-emerald-600" aria-hidden /> Was Sie davon haben
                  </h2>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-relaxed text-slate-700 print:text-[10px] print:leading-snug">
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
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-relaxed text-slate-700 print:text-[10px] print:leading-snug">
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
                  <p className="mt-1 text-[10px] text-slate-500 print:text-[8px]">Leistungen je nach Tarif und Versicherer.</p>
                </div>
              </section>

              <section className="grid gap-3 sm:grid-cols-3 print:grid-cols-3 print:gap-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:col-span-2 print:col-span-2 print:break-inside-avoid print:p-2 print:shadow-none">
                  <h2 className="flex items-center gap-1.5 text-sm font-black text-slate-900">
                    <ListChecks className="h-4 w-4 text-indigo-600" aria-hidden /> Damit die Freigrenze hält
                  </h2>
                  <ul className="mt-1 space-y-0.5 text-xs leading-relaxed text-slate-600 print:text-[10px] print:leading-snug">
                    <li>• <strong>Monatlich zahlen</strong> — eine Jahreszahlung fließt in einem Monat zu und sprengt die Grenze</li>
                    <li>• <strong>Zusätzlich zum Gehalt</strong> gewähren, nicht per Gehaltsumwandlung</li>
                    <li>• Der Mitarbeiter kann nur den <strong>Versicherungsschutz</strong> verlangen, kein Geld</li>
                    <li>• Die 50 € mit <strong>anderen Sachbezügen</strong> abstimmen (Gutschein-, Tankkarte)</li>
                    <li>• Gruppenvertrag: <strong>Mindestteilnehmerzahl</strong> und Annahmeregeln im Angebot prüfen</li>
                    <li>• Allen Mitarbeitern oder klar abgegrenzten Gruppen anbieten (<strong>Gleichbehandlung</strong>)</li>
                    <li>• In der <strong>Lohnabrechnung</strong> als Sachbezug führen</li>
                  </ul>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm print:break-inside-avoid print:p-2 print:shadow-none">
                  <h2 className="text-sm font-black text-slate-900">
                    Bei {n} Mitarbeiter{n === 1 ? '' : 'n'} im Jahr
                  </h2>
                  <dl className="mt-1 space-y-0.5 text-xs text-slate-700">
                    <div className="flex justify-between gap-2"><dt>Beiträge</dt><dd className="tabular-nums">{euro(ag.beitragMonat * 12 * n)}</dd></div>
                    <div className="flex justify-between gap-2"><dt>Kosten netto</dt><dd className="font-bold tabular-nums">{euro(ag.nettoKostenMonat * 12 * n)}</dd></div>
                    {g && (
                      <div className="flex justify-between gap-2"><dt>als Gehalt netto</dt><dd className="tabular-nums">{euro(g.nettoKostenMonat * 12 * n)}</dd></div>
                    )}
                    <div className="flex justify-between gap-2 border-t border-slate-200 pt-0.5">
                      <dt>gespart</dt><dd className="font-bold tabular-nums text-emerald-700">{euro(r.ersparnisGegenGehaltMonat * 12 * n)}</dd>
                    </div>
                  </dl>
                </div>
              </section>

              <p className="text-[10px] leading-relaxed text-slate-500 print:text-[8px]">
                Modellrechnung zum Rechtsstand {p.jahr}, keine Steuer- oder Rechtsberatung. Beiträge und Leistungen
                hängen vom Tarif ab; die Beispielbeiträge sind Richtwerte, kein Angebot. Annahme- und
                Gesundheitsregeln legt der Versicherer fest. Der Gehaltsvergleich gilt für den eingetragenen
                Beispiel-Mitarbeiter.
              </p>
            </div>

            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs print:hidden">
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
