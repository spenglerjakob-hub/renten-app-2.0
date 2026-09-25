import { useMemo, useState } from 'react';
import { Building2, CheckCircle2, HandCoins, PiggyBank, Printer, ShieldCheck, Wand2 } from 'lucide-react';
import {
  zuschussModell, zuschussStaffel, zuschussVollAusschoepfen, parameterFuer, BUNDESLAENDER,
} from '@renten/engine';
import { ZahlFeld, ProzentFeld, AuswahlFeld, Schalter, euro, prozent } from '../components/Feld';
import {
  Kopf, Kasten, Kachel, Bon, Zeile, GehaltVergleich, UmlagenErklaerung, ModellWechsel,
} from '../arbeitgeber/bausteine';

/**
 * Arbeitgeber-Seite „Zuschussmodell".
 *
 * Die einfache Schwester des Matching-Modells: Der Arbeitgeber gibt einen
 * festen Anteil der Entgeltumwandlung dazu (Vorgabe 50 %, hoechstens 100 EUR),
 * alles fliesst in EINE Direktversicherung. Keine Unterstuetzungskasse, kein
 * PSV, der Mitarbeiter nimmt den Vertrag beim Wechsel mit.
 *
 * Eigenes Bundle, ohne Anmeldung, nichts wird gespeichert.
 */

const p = parameterFuer(new Date().getFullYear(), { indexRate: 0 });

export function Seite() {
  const [brutto, setBrutto] = useState(54_000);
  const [privat, setPrivat] = useState(false);
  const [praemie, setPraemie] = useState(600);
  const [bundesland, setBundesland] = useState<string>('Nordrhein-Westfalen');
  const [verheiratet, setVerheiratet] = useState(false);
  const [umwandlung, setUmwandlung] = useState(200);
  const [quote, setQuote] = useState(0.5);
  const [deckel, setDeckel] = useState(100);
  const [steuersatz, setSteuersatz] = useState(0.3);
  const [umlagen, setUmlagen] = useState(0);
  const [anzahl, setAnzahl] = useState(1);

  const eingaben = useMemo(() => ({
    jahresbrutto: brutto,
    umwandlungMonat: umwandlung,
    quote,
    deckelMonat: deckel,
    unternehmensSteuersatz: steuersatz,
    umlagenSatz: umlagen,
    privatVersichert: privat,
    pkvPraemieMonat: privat ? praemie : 0,
    kinder: { hatKinder: false, kinderUnter25: 0 },
  }), [brutto, umwandlung, quote, deckel, steuersatz, umlagen, privat, praemie]);
  const steuerOpt = useMemo(
    () => ({ verheiratet, bundesland, kirchensteuerpflichtig: false }), [verheiratet, bundesland],
  );

  const r = useMemo(() => zuschussModell(eingaben, steuerOpt, p), [eingaben, steuerOpt]);
  const staffel = useMemo(() => zuschussStaffel(eingaben, steuerOpt, p), [eingaben, steuerOpt]);
  const voll = () => setUmwandlung(zuschussVollAusschoepfen(eingaben, bundesland, p));

  const ma = r.mitarbeiter;
  const ag = r.arbeitgeber;
  const n = Math.max(1, Math.round(anzahl));

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 print:min-h-0 print:bg-white">
      <Kopf />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10 print:max-w-none print:px-0 print:py-2">
        <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl print:text-xl">
          Betriebsrente mit Arbeitgeberzuschuss: {prozent(quote, 0)} obendrauf
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600 print:mt-1 print:text-[10px] print:leading-snug">
          Der Mitarbeiter wandelt einen Teil seines Gehalts um, Sie legen {prozent(quote, 0)} davon dazu — höchstens
          {' '}{euro(deckel)} im Monat. Alles fließt in eine Direktversicherung. Weil Sie auf die Umwandlung
          Sozialabgaben sparen, kostet Sie der Zuschuss nur einen Bruchteil.
        </p>
        <ModellWechsel href="/arbeitgeber" text="Mehr Bindung gewünscht? Zum Matching-Modell mit Unterstützungskasse" />

        <p className="mt-2 hidden text-[10px] leading-snug text-slate-600 print:block">
          Annahmen: Bruttogehalt {euro(brutto)} im Jahr, {privat ? `privat versichert (${euro(praemie)} Prämie)` : 'gesetzlich versichert'},
          {' '}{bundesland}, {verheiratet ? 'verheiratet' : 'ledig'}. Umwandlung {euro(ma.umwandlungMonat)}, Zuschuss
          {' '}{prozent(quote, 0)} bis {euro(deckel)}. Unternehmenssteuer {prozent(steuersatz, 0)}
          {umlagen > 0 ? `, Umlagen ${prozent(umlagen)}` : ''}. Rechtsstand {p.jahr}.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6 print:mt-2 print:block">
          {/* --- Eingaben ---------------------------------------------------- */}
          <div className="space-y-4 lg:col-span-4 print:hidden">
            <Kasten titel="Mitarbeiter">
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
            </Kasten>

            <Kasten titel="Modell">
              <ZahlFeld label="Entgeltumwandlung im Monat" wert={umwandlung} onChange={setUmwandlung} einheit="€" schritt={10} />
              <div className="flex flex-wrap gap-1.5">
                {[100, 200].map((b) => (
                  <button key={b} type="button" onClick={() => setUmwandlung(b)}
                    className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
                    {euro(b)}
                  </button>
                ))}
                <button type="button" onClick={voll}
                  className="flex items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-bold text-indigo-800 hover:bg-indigo-100">
                  <Wand2 className="h-3.5 w-3.5" aria-hidden /> Rahmen voll ausschöpfen
                </button>
              </div>
              <ProzentFeld
                label="Zuschuss des Arbeitgebers" wert={quote} onChange={setQuote} min={0} max={100}
                hilfe="Anteil der Umwandlung. Der gesetzliche Pflichtzuschuss von 15 % ist darin enthalten."
              />
              <ZahlFeld label="Höchstens im Monat" wert={deckel} onChange={setDeckel} einheit="€" schritt={10} />
            </Kasten>

            <Kasten titel="Unternehmen">
              <ProzentFeld
                label="Steuersatz auf den Gewinn" wert={steuersatz} onChange={setSteuersatz} min={0} max={60}
                hilfe="GmbH mit 400 % Hebesatz rund 30 %. Einzelunternehmen und Personengesellschaften: persönlicher Satz."
              />
              <ProzentFeld
                label="Umlagen U1, U2, Insolvenzgeld" wert={umlagen} onChange={setUmlagen} min={0} max={10} stellen={2}
                hilfe="Sparen Sie auf den beitragsfreien Teil zusätzlich. Ohne Angabe nicht eingerechnet."
              />
              <UmlagenErklaerung onWaehlen={setUmlagen} />
              <ZahlFeld label="Mitarbeiter im Modell" wert={anzahl} onChange={setAnzahl} min={1} schritt={1} stufen />
            </Kasten>
          </div>

          {/* --- Ergebnis ---------------------------------------------------- */}
          <div className="space-y-4 lg:col-span-8 print:space-y-2">
            <section className="grid gap-3 sm:grid-cols-3 print:grid-cols-3 print:gap-2">
              <Kachel
                symbol={<HandCoins className="h-5 w-5" aria-hidden />} farbe="border-sky-200 bg-sky-50 text-sky-900"
                titel="Mitarbeiter zahlt netto" betrag={ma.nettoAufwandMonat}
                unten={`von ${euro(ma.umwandlungMonat)} Umwandlung`}
              />
              <Kachel
                symbol={<Building2 className="h-5 w-5" aria-hidden />} farbe="border-amber-200 bg-amber-50 text-amber-900"
                titel="Arbeitgeber zahlt netto" betrag={ag.nettoKostenMonat}
                unten={`für ${euro(ag.zuschussMonat)} Zuschuss`}
              />
              <Kachel
                symbol={<PiggyBank className="h-5 w-5" aria-hidden />} farbe="border-emerald-300 bg-emerald-50 text-emerald-900"
                titel="Fließt in die Direktversicherung" betrag={r.vertragMonat}
                unten={r.hebelMitarbeiter > 0
                  ? `${r.hebelMitarbeiter.toLocaleString('de-DE', { maximumFractionDigits: 1 })}-fach der Nettokosten des Mitarbeiters`
                  : 'jeden Monat'}
                gross
              />
            </section>

            <section className="grid gap-3 sm:grid-cols-2 print:grid-cols-2 print:gap-2">
              <Bon titel="Mitarbeiter">
                <Zeile text="Entgeltumwandlung" betrag={ma.umwandlungMonat} />
                <Zeile text="− gesparte Sozialabgaben" betrag={ma.svErsparnisMonat} />
                <Zeile text="− gesparte Steuer" betrag={ma.steuerersparnisMonat} />
                <Zeile text="= kostet netto" betrag={ma.nettoAufwandMonat} summe />
                {ma.svPflichtigMonat > 0.5 && (
                  <p className="pt-1 text-[11px] text-rose-700">
                    Davon {euro(ma.svPflichtigMonat)} beitragspflichtig — siehe Hinweise.
                  </p>
                )}
              </Bon>
              <Bon titel="Arbeitgeber">
                <Zeile text={`Zuschuss ${prozent(quote, 0)}${r.gedeckelt ? ' (gedeckelt)' : ''}`} betrag={ag.zuschussMonat} />
                <p className="pl-3 text-[11px] text-slate-500">
                  davon {euro(ag.davonPflichtzuschussMonat)} gesetzlicher Pflichtzuschuss
                </p>
                <Zeile text="− gesparte Sozialabgaben" betrag={ag.svErsparnisMonat} />
                {ag.umlagenErsparnisMonat > 0 && <Zeile text="− gesparte Umlagen" betrag={ag.umlagenErsparnisMonat} />}
                <Zeile text="= Kosten vor Steuern" betrag={ag.kostenVorSteuerMonat} summe />
                <Zeile text="− Steuerersparnis (Betriebsausgabe)" betrag={ag.steuerersparnisMonat} />
                <p className="pl-3 text-[11px] leading-snug text-slate-500 print:text-[9px]">
                  Beiträge zur Direktversicherung sind sofort abziehbarer Personalaufwand; der Vertrag wird nicht aktiviert (§ 4b EStG). Die Umwandlung ist ohnehin Lohnaufwand — steuerlich zählt nur, was zusätzlich anfällt: Zuschuss minus gesparte Abgaben.
                </p>
                <Zeile text="= kostet netto" betrag={ag.nettoKostenMonat} summe />
              </Bon>
            </section>

            {/*
              DIE STAFFEL: die Frage des Arbeitgebers ist nicht „was kostet
              dieser eine Fall", sondern „was kostet mich das je Mitarbeiter,
              je nachdem, wie viel er umwandelt". Oberhalb des Deckels sinken
              die Kosten sogar — der Zuschuss steht, die Ersparnis waechst.
            */}
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 print:break-inside-avoid print:p-2 print:shadow-none">
              <h2 className="text-sm font-black text-slate-900">Was kostet mich jeder Mitarbeiter?</h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-600 print:text-[10px]">
                Je nachdem, wie viel er umwandelt — im Monat, nach Steuern und gesparten Abgaben:
              </p>
              <table className="mt-2 w-full text-xs print:mt-1 print:text-[10px]">
                <thead>
                  <tr className="text-[11px] text-slate-500">
                    <th className="py-0.5 text-left font-medium">Umwandlung</th>
                    <th className="py-0.5 text-right font-medium">Zuschuss</th>
                    <th className="py-0.5 text-right font-bold text-amber-800">
                      <span className="sm:hidden">AG netto</span><span className="hidden sm:inline">Arbeitgeber netto</span>
                    </th>
                    <th className="py-0.5 text-right font-bold text-emerald-700">
                      <span className="sm:hidden">Vertrag</span><span className="hidden sm:inline">im Vertrag</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="text-slate-700">
                  {staffel.map((st) => {
                    const aktiv = Math.abs(st.umwandlungMonat - ma.umwandlungMonat) < 0.5;
                    return (
                      <tr key={st.umwandlungMonat}
                        className={`border-t border-slate-100 ${aktiv ? 'bg-amber-50 font-bold' : ''} cursor-pointer hover:bg-slate-50 print:cursor-auto`}
                        onClick={() => setUmwandlung(st.umwandlungMonat)}>
                        <td className="py-0.5">
                          {euro(st.umwandlungMonat)}
                          {st.voll && <span className="ml-1 text-[10px] font-normal text-indigo-700">Rahmen voll</span>}
                        </td>
                        <td className="py-0.5 text-right tabular-nums">{euro(st.zuschussMonat)}</td>
                        <td className="py-0.5 text-right tabular-nums">{euro(st.arbeitgeberNettoMonat)}</td>
                        <td className="py-0.5 text-right tabular-nums">{euro(st.vertragMonat)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500 print:text-[9px]">
                Oberhalb des Deckels sinken Ihre Kosten sogar: Der Zuschuss bleibt bei {euro(deckel)}, die gesparten
                Sozialabgaben wachsen mit jeder weiteren beitragsfreien Umwandlung.
                <span className="print:hidden"> Zeile antippen übernimmt den Betrag.</span>
              </p>
            </section>

            {r.gehalt && (
              <GehaltVergleich
                modell="Zuschussmodell" g={r.gehalt} steuersatz={steuersatz} mitUmlagen={umlagen > 0}
                agZahlung={ag.zuschussMonat}
                agAbgabenGespart={ag.svErsparnisMonat + ag.umlagenErsparnisMonat}
                agKostenVorSteuer={ag.kostenVorSteuerMonat}
                agSteuer={ag.steuerersparnisMonat}
                agNetto={ag.nettoKostenMonat}
                gesamtVorsorge={r.vertragMonat}
              />
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
              <p className="hidden text-lg font-black text-slate-900 print:block">Umsetzung</p>

              <section className="grid gap-3 sm:grid-cols-2 print:grid-cols-2 print:gap-2">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 print:p-2">
                  <h2 className="flex items-center gap-1.5 text-sm font-black text-slate-900">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden /> Einfach umzusetzen
                  </h2>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-relaxed text-slate-700 print:text-[10px] print:leading-snug">
                    <li><strong>Ein Vertrag</strong> je Mitarbeiter, eine Direktversicherung — keine Unterstützungskasse,
                      kein Pensions-Sicherungs-Verein.</li>
                    <li>Der gesetzliche <strong>Pflichtzuschuss ist enthalten</strong> — nichts kommt obendrauf.</li>
                    <li>Beim Wechsel <strong>nimmt der Mitarbeiter den Vertrag mit</strong> (Anspruch innerhalb eines
                      Jahres, § 4 Abs. 3 BetrAVG); für Sie ist er danach erledigt.</li>
                    <li>Umwandlung und Pflichtzuschuss sind sofort unverfallbar. Der <strong>freiwillige Teil</strong> darüber
                      hinaus erst nach drei Jahren (§ 1b BetrAVG) — das Bezugsrecht dafür mit dem Versicherer gestalten.</li>
                  </ul>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm print:p-2 print:shadow-none">
                  <h2 className="text-sm font-black text-slate-900">
                    Bei {n} Mitarbeiter{n === 1 ? '' : 'n'} im Jahr
                  </h2>
                  <dl className="mt-1 space-y-0.5 text-xs text-slate-700">
                    <div className="flex justify-between gap-2"><dt>Kosten Arbeitgeber, netto</dt><dd className="font-bold tabular-nums">{euro(ag.nettoKostenMonat * 12 * n)}</dd></div>
                    <div className="flex justify-between gap-2"><dt>Zuschüsse in die Altersvorsorge</dt><dd className="tabular-nums">{euro(ag.zuschussMonat * 12 * n)}</dd></div>
                    <div className="flex justify-between gap-2"><dt>Altersvorsorge insgesamt</dt><dd className="font-bold tabular-nums text-emerald-700">{euro(r.vertragMonat * 12 * n)}</dd></div>
                  </dl>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm print:break-inside-avoid print:p-2 print:shadow-none">
                <h2 className="flex items-center gap-1.5 text-sm font-black text-slate-900">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden /> In die Versorgungsordnung
                </h2>
                <ul className="mt-1 grid gap-x-4 gap-y-0.5 text-xs leading-relaxed text-slate-600 sm:grid-cols-2 print:grid-cols-2 print:text-[10px] print:leading-snug">
                  <li>• Zuschuss {prozent(quote, 0)} der Umwandlung, höchstens {euro(deckel)} im Monat</li>
                  <li>• Der gesetzliche Zuschuss (§ 1a Abs. 1a BetrAVG) ist darin enthalten</li>
                  <li>• Für alle Beschäftigten gleich (Gleichbehandlung)</li>
                  <li>• Tarifvorrang prüfen (§ 20 BetrAVG)</li>
                  <li>• Unverfallbarkeit des freiwilligen Teils: gesetzlich 3 Jahre, kürzer möglich</li>
                  <li>• Ein Anbieter, ein Tarif — neue Mitarbeiter können mitgebrachte Verträge übertragen</li>
                </ul>
              </section>

              <p className="text-[10px] leading-relaxed text-slate-500 print:text-[8px]">
                Modellrechnung zum Rechtsstand {p.jahr}, keine Steuer- oder Rechtsberatung. Nicht enthalten: die
                Besteuerung und Verbeitragung der späteren Leistungen. Die Ausgestaltung sollte ein bAV-Spezialist prüfen.
              </p>
            </div>

            <button
              type="button" onClick={() => window.print()}
              className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 print:hidden"
            >
              <Printer className="h-4 w-4" aria-hidden /> Für den Arbeitgeber drucken
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
