import { useMemo, useState } from 'react';
import { Building2, HandCoins, PiggyBank, Printer, Scale, ShieldCheck } from 'lucide-react';
import {
  festbetragModell, festbetragGehaltsStaffel, parameterFuer, BUNDESLAENDER, betriebUmstieg,
} from '@renten/engine';
import { ZahlFeld, ProzentFeld, AuswahlFeld, Schalter, euro, euroGenau, prozent } from '../components/Feld';
import { RechtsLinks } from '../components/RechtsLinks';
import {
  Kopf, Kasten, Kachel, Bon, Zeile, GehaltVergleich, UmlagenErklaerung, AndereModelle,
  BisherigeLeistungenFelder, UmstiegVergleich, KEINE_BISHERIGEN,
  bisherFuerKopf, betriebAngaben, bisherAnnahmen, hatBisherige, type BisherigeAngaben,
} from '../arbeitgeber/bausteine';

/**
 * Arbeitgeber-Seite „Festbetrag".
 *
 * Der Arbeitgeber zahlt einen festen Betrag (Vorgabe 50 EUR), sobald der
 * Mitarbeiter mindestens einen festen Betrag umwandelt (Vorgabe 50 EUR). Alle
 * bekommen dasselbe — unabhaengig vom Gehalt und davon, wie viel sie
 * darueber hinaus selbst einzahlen koennen. Das ist die Botschaft der Seite,
 * deshalb steht die Gehaltsstaffel „gleich fuer alle" im Mittelpunkt.
 *
 * Eigenes Bundle, nur mit Konto (Zugangsschranke in main.tsx), nichts wird gespeichert.
 */

const p = parameterFuer(new Date().getFullYear(), { indexRate: 0 });

export function Seite() {
  const [brutto, setBrutto] = useState(54_000);
  const [privat, setPrivat] = useState(false);
  const [praemie, setPraemie] = useState(600);
  const [bundesland, setBundesland] = useState<string>('Nordrhein-Westfalen');
  const [verheiratet, setVerheiratet] = useState(false);
  const [kirchensteuer, setKirchensteuer] = useState(false);
  const [umwandlung, setUmwandlung] = useState(50);
  const [festbetrag, setFestbetrag] = useState(50);
  const [mindest, setMindest] = useState(50);
  const [steuersatz, setSteuersatz] = useState(0.3);
  const [umlagen, setUmlagen] = useState(0);
  const [anzahl, setAnzahl] = useState(1);
  const [bisher, setBisher] = useState<BisherigeAngaben>(KEINE_BISHERIGEN);

  const eingaben = useMemo(() => ({
    jahresbrutto: brutto,
    umwandlungMonat: umwandlung,
    festbetragMonat: festbetrag,
    mindestUmwandlungMonat: mindest,
    unternehmensSteuersatz: steuersatz,
    umlagenSatz: umlagen,
    privatVersichert: privat,
    pkvPraemieMonat: privat ? praemie : 0,
    kinder: { hatKinder: false, kinderUnter25: 0 },
    bisher: bisherFuerKopf(bisher),
  }), [brutto, umwandlung, festbetrag, mindest, steuersatz, umlagen, privat, praemie, bisher]);
  const steuerOpt = useMemo(
    () => ({ verheiratet, bundesland, kirchensteuerpflichtig: kirchensteuer }), [verheiratet, bundesland, kirchensteuer],
  );

  const r = useMemo(() => festbetragModell(eingaben, steuerOpt, p), [eingaben, steuerOpt]);
  // Die Staffel rechnet mit der Mindestumwandlung: der Fall, den jeder
  // Mitarbeiter erreichen kann — und der zeigt, dass alle dasselbe bekommen.
  const staffel = useMemo(
    () => festbetragGehaltsStaffel({ ...eingaben, umwandlungMonat: Math.max(mindest, 1) }, steuerOpt, p),
    [eingaben, mindest, steuerOpt],
  );

  const ma = r.mitarbeiter;
  const ag = r.arbeitgeber;
  const n = Math.max(1, Math.round(anzahl));
  const betrieb = useMemo(
    () => betriebUmstieg((e) => festbetragModell(e, steuerOpt, p), eingaben, betriebAngaben(bisher, n), steuerOpt, p),
    [eingaben, bisher, n, steuerOpt],
  );

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 print:min-h-0 print:bg-white">
      <Kopf />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10 print:max-w-none print:px-0 print:py-2">
        <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl print:text-xl">
          Betriebsrente mit festem Arbeitgeberbeitrag: {euro(festbetrag)} für jeden
        </h1>
        <p className="mt-2 max-w-4xl text-sm leading-relaxed text-slate-600 print:mt-1 print:text-[10px] print:leading-snug">
          Jeder Mitarbeiter, der mindestens {euro(mindest)} im Monat für seine Betriebsrente umwandelt, bekommt
          {' '}{euro(festbetrag)} von Ihnen dazu — gleich viel für alle, unabhängig vom Gehalt und davon, wie viel
          sich jemand leisten kann. Weil Sie auf die Umwandlung Sozialabgaben sparen, kostet Sie das nur einen
          Bruchteil.
        </p>
        <AndereModelle aktuell="/festbetrag" />

        <p className="mt-2 hidden text-xs print:text-[10px] leading-snug text-slate-600 print:block">
          Annahmen: Bruttogehalt {euro(brutto)} im Jahr, {privat ? `privat versichert (${euro(praemie)} Prämie)` : 'gesetzlich versichert'},
          {' '}{bundesland}, {verheiratet ? 'verheiratet' : 'ledig'}, {kirchensteuer ? 'mit' : 'ohne'} Kirchensteuer. Umwandlung {euro(ma.umwandlungMonat)}, Festbetrag
          {' '}{euro(festbetrag)} ab {euro(mindest)} Umwandlung. Unternehmenssteuer {prozent(steuersatz, 0)}
          {umlagen > 0 ? `, Umlagen ${prozent(umlagen)}` : ''}. Rechtsstand {p.jahr}.
          {bisherAnnahmen(bisher)}
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
              <Schalter label="kirchensteuerpflichtig" wert={kirchensteuer} onChange={setKirchensteuer} />
            </Kasten>

            <Kasten titel="Modell">
              <ZahlFeld label="Entgeltumwandlung im Monat" wert={umwandlung} onChange={setUmwandlung} einheit="€" schritt={10} />
              <div className="flex flex-wrap gap-1.5">
                {[50, 100, 200].map((b) => (
                  <button key={b} type="button" onClick={() => setUmwandlung(b)}
                    className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] print:text-xs font-bold text-slate-700 hover:bg-slate-50">
                    {euro(b)}
                  </button>
                ))}
              </div>
              <ZahlFeld
                label="Festbetrag des Arbeitgebers im Monat" wert={festbetrag} onChange={setFestbetrag} einheit="€" schritt={10}
                hilfe="Der gesetzliche Pflichtzuschuss von 15 % ist darin enthalten."
              />
              <ZahlFeld
                label="Ab einer Umwandlung von" wert={mindest} onChange={setMindest} einheit="€" schritt={10}
                hilfe="Darunter gibt es nur den gesetzlichen Pflichtzuschuss."
              />
            </Kasten>

            <BisherigeLeistungenFelder wert={bisher} onChange={setBisher} vlZiel="Direktversicherung" neuTeilnehmer={n} />

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
                unten={`für ${euro(ag.zuschussMonat)} Beitrag`}
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
                  <p className="pt-1 text-xs print:text-[11px] text-rose-700">
                    Davon {euro(ma.svPflichtigMonat)} beitragspflichtig — siehe Hinweise.
                  </p>
                )}
              </Bon>
              <Bon titel="Arbeitgeber">
                <Zeile text={r.schwelleErreicht ? 'Festbetrag' : 'Pflichtzuschuss (Schwelle nicht erreicht)'} betrag={ag.zuschussMonat} />
                {r.schwelleErreicht && (
                  <p className="pl-3 text-xs print:text-[11px] text-slate-500">
                    davon {euro(ag.davonPflichtzuschussMonat)} gesetzlicher Pflichtzuschuss
                  </p>
                )}
                <Zeile text="− gesparte Sozialabgaben" betrag={ag.svErsparnisMonat} />
                {ag.umlagenErsparnisMonat > 0 && <Zeile text="− gesparte Umlagen" betrag={ag.umlagenErsparnisMonat} />}
                <Zeile text="= Kosten vor Steuern" betrag={ag.kostenVorSteuerMonat} summe />
                <Zeile text="− Steuerersparnis (Betriebsausgabe)" betrag={ag.steuerersparnisMonat} />
                <p className="pl-3 text-xs leading-snug text-slate-500 print:text-[9px]">
                  Beiträge zur Direktversicherung sind sofort abziehbarer Personalaufwand; der Vertrag wird nicht
                  aktiviert (§ 4b EStG).
                </p>
                <Zeile text="= kostet netto" betrag={ag.nettoKostenMonat} summe />
              </Bon>
            </section>

            {/*
              GLEICH FUER ALLE — das Argument des Modells. Derselbe Beitrag bei
              jedem Gehalt; die Kosten unterscheiden sich nur dort, wo das Gehalt
              ueber einer Beitragsbemessungsgrenze liegt.
            */}
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 print:break-inside-avoid print:p-2 print:shadow-none">
              <h2 className="flex items-center gap-1.5 text-sm font-black text-slate-900">
                <Scale className="h-4 w-4 text-indigo-600" aria-hidden /> Gleich für alle — was es Sie je Mitarbeiter kostet
              </h2>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-600 print:text-[10px]">
                Bei {euro(mindest)} Umwandlung, im Monat, nach Steuern und gesparten Abgaben:
              </p>
              <table className="mt-2 w-full text-[13px] print:mt-1 print:text-[10px]">
                <thead>
                  <tr className="text-xs print:text-[11px] text-slate-500">
                    <th className="py-0.5 text-left font-medium">
                      <span className="sm:hidden">Brutto</span><span className="hidden sm:inline">Bruttogehalt im Jahr</span>
                    </th>
                    <th className="py-0.5 text-right font-medium">
                      <span className="sm:hidden">Beitrag</span><span className="hidden sm:inline">Ihr Beitrag</span>
                    </th>
                    <th className="py-0.5 text-right font-bold text-amber-800">
                      <span className="sm:hidden">AG netto</span><span className="hidden sm:inline">Sie netto</span>
                    </th>
                    <th className="py-0.5 text-right font-medium text-sky-800">
                      <span className="sm:hidden">MA netto</span><span className="hidden sm:inline">Mitarbeiter netto</span>
                    </th>
                    <th className="py-0.5 text-right font-bold text-emerald-700">
                      <span className="sm:hidden">Vertrag</span><span className="hidden sm:inline">im Vertrag</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="text-slate-700">
                  {staffel.map((st) => (
                    <tr key={st.jahresbrutto} className="border-t border-slate-100">
                      <td className="py-0.5">{euro(st.jahresbrutto)}</td>
                      <td className="py-0.5 text-right tabular-nums">{euro(st.zuschussMonat)}</td>
                      <td className="py-0.5 text-right tabular-nums">{euro(st.arbeitgeberNettoMonat)}</td>
                      <td className="py-0.5 text-right tabular-nums">{euro(st.mitarbeiterNettoMonat)}</td>
                      <td className="py-0.5 text-right tabular-nums">{euro(st.vertragMonat)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-xs leading-relaxed text-slate-500 print:text-[9px]">
                Jeder bekommt denselben Beitrag. Im Verhältnis zum Gehalt ist er für Geringverdiener am größten — für
                sie ist das Modell der stärkste Anreiz, überhaupt vorzusorgen. Über der Beitragsbemessungsgrenze der
                Krankenversicherung sparen Sie auf die Umwandlung weniger Abgaben; deshalb kostet es dort etwas mehr.
              </p>
            </section>

            {r.gehalt && (
              <GehaltVergleich
                modell="Festbetrag" g={r.gehalt} steuersatz={steuersatz} mitUmlagen={umlagen > 0}
                agZahlung={ag.zuschussMonat}
                agAbgabenGespart={ag.svErsparnisMonat + ag.umlagenErsparnisMonat}
                agKostenVorSteuer={ag.kostenVorSteuerMonat}
                agSteuer={ag.steuerersparnisMonat}
                agNetto={ag.nettoKostenMonat}
                gesamtVorsorge={r.vertragMonat}
              />
            )}
            {hatBisherige(bisher) && (
              <UmstiegVergleich u={r.umstieg} betrieb={betrieb} vlUmgang={bisher.vlUmgang} steuersatz={steuersatz} mitUmlagen={umlagen > 0} />
            )}

            {r.hinweise.length > 0 && (
              <section className="space-y-1.5">
                {r.hinweise.map((h, i) => (
                  <p key={i} className="rounded-lg bg-slate-200/60 px-3 py-2 text-xs leading-relaxed text-slate-700 print:px-2 print:py-1 print:text-[9px]">
                    {h}
                  </p>
                ))}
              </section>
            )}

            {/* Mit VL beginnt Seite 2 schon beim Vergleich mit heute (siehe UmstiegVergleich). */}
            <div className={`space-y-4 print:space-y-2 ${hatBisherige(bisher) ? '' : 'print:break-before-page'}`}>
              <p className="hidden text-lg font-black text-slate-900 print:block">Umsetzung</p>

              <section className="grid gap-3 sm:grid-cols-2 print:grid-cols-2 print:gap-2">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 print:p-2">
                  <h2 className="flex items-center gap-1.5 text-sm font-black text-slate-900">
                    <Scale className="h-4 w-4 text-emerald-600" aria-hidden /> Einfach und fair
                  </h2>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-[13px] leading-relaxed text-slate-700 print:text-[10px] print:leading-snug">
                    <li><strong>Ein fester Betrag für alle</strong> — leicht zu erklären, niemand fühlt sich benachteiligt.</li>
                    <li>Der gesetzliche <strong>Pflichtzuschuss ist enthalten</strong>; ab rund {euro(festbetrag / 0.15)} Umwandlung
                      wäre er höher als der Festbetrag, dann gilt er.</li>
                    <li><strong>Eine Direktversicherung</strong> je Mitarbeiter, kein Pensions-Sicherungs-Verein; beim Wechsel
                      nimmt der Mitarbeiter sie mit (§ 4 Abs. 3 BetrAVG).</li>
                    <li>Umwandlung und Pflichtzuschuss sind sofort unverfallbar, der <strong>freiwillige Teil</strong> erst nach
                      drei Jahren (§ 1b BetrAVG) — das Bezugsrecht dafür mit dem Versicherer gestalten.</li>
                    <li>Für <strong>Geringverdiener</strong> kann zusätzlich der BAV-Förderbetrag nach § 100 EStG greifen —
                      die Voraussetzungen mit dem Steuerberater prüfen.</li>
                  </ul>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm print:p-2 print:shadow-none">
                  <h2 className="text-sm font-black text-slate-900">
                    Bei {n} Mitarbeiter{n === 1 ? '' : 'n'} im Jahr
                  </h2>
                  <dl className="mt-1 space-y-0.5 text-[13px] print:text-xs text-slate-700">
                    <div className="flex justify-between gap-2"><dt>Kosten Arbeitgeber, netto</dt><dd className="font-bold tabular-nums">{euro(ag.nettoKostenMonat * 12 * n)}</dd></div>
                    <div className="flex justify-between gap-2"><dt>Beiträge in die Altersvorsorge</dt><dd className="tabular-nums">{euro(ag.zuschussMonat * 12 * n)}</dd></div>
                    <div className="flex justify-between gap-2"><dt>Altersvorsorge insgesamt</dt><dd className="font-bold tabular-nums text-emerald-700">{euro(r.vertragMonat * 12 * n)}</dd></div>
                  </dl>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm print:break-inside-avoid print:p-2 print:shadow-none">
                <h2 className="flex items-center gap-1.5 text-sm font-black text-slate-900">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden /> In die Versorgungsordnung
                </h2>
                <ul className="mt-1 grid gap-x-4 gap-y-0.5 text-[13px] leading-relaxed text-slate-600 sm:grid-cols-2 print:grid-cols-2 print:text-[10px] print:leading-snug">
                  <li>• {euro(festbetrag)} im Monat für jeden, der mindestens {euro(mindest)} umwandelt</li>
                  <li>• Der gesetzliche Zuschuss (§ 1a Abs. 1a BetrAVG) ist darin enthalten</li>
                  <li>• Für alle Beschäftigten gleich (Gleichbehandlung)</li>
                  <li>• Tarifvorrang prüfen (§ 20 BetrAVG)</li>
                  <li>• Unverfallbarkeit des freiwilligen Teils: gesetzlich 3 Jahre, kürzer möglich</li>
                  <li>• Ein Anbieter, ein Tarif — neue Mitarbeiter können mitgebrachte Verträge übertragen</li>
                </ul>
              </section>

              <p className="text-xs leading-relaxed text-slate-500 print:text-[8px]">
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
            <RechtsLinks />
          </div>
        </div>
      </main>
    </div>
  );
}
