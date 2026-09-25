import { useMemo, useState } from 'react';
import { ArrowRightLeft, Building2, HandCoins, Link2, PiggyBank, Printer, ShieldCheck, Wand2 } from 'lucide-react';
import {
  matchingModell, optimaleUmwandlung, parameterFuer, BUNDESLAENDER, type UmwandlungsWeg,
} from '@renten/engine';
import { ZahlFeld, ProzentFeld, AuswahlFeld, Schalter, euro, prozent } from '../components/Feld';
import {
  Kopf, Kasten, Kachel, Bon, Zeile, GehaltVergleich, UmlagenErklaerung, WechselSpalte, ModellWechsel,
} from './bausteine';

/**
 * Arbeitgeber-Seite „Matching-Modell".
 *
 * Fuer das Gespraech mit dem ARBEITGEBER: Der Mitarbeiter wandelt Entgelt um,
 * der Arbeitgeber legt einen eigenen Beitrag in eine Unterstuetzungskasse
 * dazu. Die Seite zeigt, was das beide wirklich kostet, was es gegenueber
 * einer Gehaltserhoehung bringt und was in die Versorgungsordnung gehoert.
 *
 * Wie die Landingpage zum Altersvorsorgedepot: eigenes Bundle, ohne
 * Anmeldung, nichts wird gespeichert, und gedruckt ergibt sie EINE A4-Seite.
 */

const p = parameterFuer(new Date().getFullYear(), { indexRate: 0 });
const SV_GRENZE = (0.04 * p.bbgRvJahr) / 12;

export function Seite() {
  const [brutto, setBrutto] = useState(54_000);
  const [privat, setPrivat] = useState(false);
  const [praemie, setPraemie] = useState(600);
  const [bundesland, setBundesland] = useState<string>('Nordrhein-Westfalen');
  const [verheiratet, setVerheiratet] = useState(false);
  const [weg, setWeg] = useState<UmwandlungsWeg>('dv');
  const [umwandlung, setUmwandlung] = useState(() =>
    optimaleUmwandlung('dv', { jahresbrutto: 54_000, privatVersichert: false, pkvPraemieMonat: 0 }, 'Nordrhein-Westfalen', p));
  const [matching, setMatching] = useState(Math.round(SV_GRENZE));
  const [inklusive, setInklusive] = useState(false);
  const [steuersatz, setSteuersatz] = useState(0.3);
  const [umlagen, setUmlagen] = useState(0);
  const [anzahl, setAnzahl] = useState(1);

  const optimal = () => setUmwandlung(optimaleUmwandlung(
    weg, { jahresbrutto: brutto, privatVersichert: privat, pkvPraemieMonat: privat ? praemie : 0 }, bundesland, p,
  ));

  const r = useMemo(() => matchingModell(
    {
      jahresbrutto: brutto,
      umwandlungMonat: umwandlung,
      weg,
      matchingMonat: matching,
      zuschussImMatching: weg === 'dv' && inklusive,
      unternehmensSteuersatz: steuersatz,
      umlagenSatz: umlagen,
      privatVersichert: privat,
      pkvPraemieMonat: privat ? praemie : 0,
      kinder: { hatKinder: false, kinderUnter25: 0 },
    },
    { verheiratet, bundesland, kirchensteuerpflichtig: false },
    p,
  ), [brutto, umwandlung, weg, matching, inklusive, steuersatz, umlagen, privat, praemie, verheiratet, bundesland]);

  const ma = r.mitarbeiter;
  const ag = r.arbeitgeber;
  const n = Math.max(1, Math.round(anzahl));
  const g = r.gehalt;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 print:min-h-0 print:bg-white">
      <Kopf />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10 print:max-w-none print:px-0 print:py-2">
        <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl print:text-xl">
          Betriebsrente im Matching-Modell
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600 print:mt-1 print:text-[10px] print:leading-snug">
          Der Mitarbeiter wandelt einen Teil seines Gehalts um, Sie als Arbeitgeber legen einen eigenen
          Beitrag in eine Unterstützungskasse dazu. Beide zahlen deutlich weniger, als in der
          Altersvorsorge ankommt — und der Mitarbeiter hat einen guten Grund zu bleiben.
        </p>

        <ModellWechsel href="/zuschussmodell" text="Lieber einfacher? Zum Zuschussmodell: 50 % obendrauf, alles in einem Vertrag" />

        {/* Die Annahmen fuer das Papier — die Eingabespalte entfaellt im Druck. */}
        <p className="mt-2 hidden text-[10px] leading-snug text-slate-600 print:block">
          Annahmen: Bruttogehalt {euro(brutto)} im Jahr, {privat ? `privat versichert (${euro(praemie)} Prämie)` : 'gesetzlich versichert'},
          {' '}{bundesland}, {verheiratet ? 'verheiratet' : 'ledig'}. Umwandlung {euro(ma.umwandlungMonat)} in die
          {' '}{weg === 'dv' ? 'Direktversicherung' : 'Unterstützungskasse'}, Matching {euro(matching)}
          {weg === 'dv' && inklusive ? ' einschließlich Pflichtzuschuss' : ''}. Unternehmenssteuer {prozent(steuersatz, 0)}
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
              <AuswahlFeld
                label="Entgeltumwandlung in die" wert={weg} onChange={(v) => setWeg(v)}
                optionen={[
                  { wert: 'dv', text: 'Direktversicherung' },
                  { wert: 'ukasse', text: 'Unterstützungskasse' },
                ]}
              />
              <ZahlFeld label="Umwandlung im Monat" wert={umwandlung} onChange={setUmwandlung} einheit="€" schritt={10} />
              <button
                type="button" onClick={optimal}
                className="flex items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-bold text-indigo-800 hover:bg-indigo-100"
              >
                <Wand2 className="h-3.5 w-3.5" aria-hidden /> Optimal aufteilen
              </button>
              <ZahlFeld
                label="Matching des Arbeitgebers im Monat" wert={matching} onChange={setMatching} einheit="€" schritt={10}
                hilfe="Arbeitgeberfinanziert in eine Unterstützungskasse: unbegrenzt steuer- und sozialabgabenfrei."
              />
              {weg === 'dv' && (
                <Schalter label="Pflichtzuschuss ist im Matching enthalten" wert={inklusive} onChange={setInklusive} />
              )}
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
                unten="nach Steuern und gesparten Abgaben"
              />
              <Kachel
                symbol={<PiggyBank className="h-5 w-5" aria-hidden />} farbe="border-emerald-300 bg-emerald-50 text-emerald-900"
                titel="Fließt in die Altersvorsorge" betrag={r.vertrag.gesamtMonat}
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
                {ag.pflichtzuschussMonat > 0 && (
                  <Zeile text="Pflichtzuschuss 15 % (Direktversicherung)" betrag={ag.pflichtzuschussMonat} />
                )}
                <Zeile text="Matching (Unterstützungskasse)" betrag={ag.ukasseMonat} />
                <Zeile text="− gesparte Sozialabgaben" betrag={ag.svErsparnisMonat} />
                {ag.umlagenErsparnisMonat > 0 && <Zeile text="− gesparte Umlagen" betrag={ag.umlagenErsparnisMonat} />}
                <Zeile text="− Steuerersparnis (Betriebsausgabe)" betrag={ag.steuerersparnisMonat} />
                <p className="pl-3 text-[11px] leading-snug text-slate-500 print:text-[9px]">
                  Zuwendungen an eine rückgedeckte Unterstützungskasse sind Betriebsausgabe (§ 4d EStG), der Pflichtzuschuss in die Direktversicherung ebenso (§ 4b EStG). Die Umwandlung ist ohnehin Lohnaufwand.
                </p>
                <Zeile text="= kostet netto" betrag={ag.nettoKostenMonat} summe />
              </Bon>
            </section>

            {/*
              HERLEITUNG STATT NUR ERGEBNIS. Die Karten oben nennen die
              Nettokosten, der Vergleich rechnet mit den Personalkosten VOR
              Steuern — ohne die Zwischenschritte stehen zwei Zahlen da, deren
              Zusammenhang niemand sieht. Beide Wege Zeile fuer Zeile
              nebeneinander: Sie treffen sich bei denselben Kosten.
            */}
            {g && (
              <GehaltVergleich
                modell="Matching-Modell" g={g} steuersatz={steuersatz} mitUmlagen={umlagen > 0}
                agZahlung={ag.pflichtzuschussMonat + ag.ukasseMonat}
                agAbgabenGespart={ag.svErsparnisMonat + ag.umlagenErsparnisMonat}
                agKostenVorSteuer={ag.kostenVorSteuerMonat}
                agSteuer={ag.steuerersparnisMonat}
                agNetto={ag.nettoKostenMonat}
                gesamtVorsorge={r.vertrag.gesamtMonat}
              />
            )}

            <section className="grid gap-3 sm:grid-cols-2 print:grid-cols-2 print:gap-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm print:p-2 print:shadow-none">
                <h2 className="flex items-center gap-1.5 text-sm font-black text-slate-900">
                  <Link2 className="h-4 w-4 text-indigo-600" aria-hidden /> Bindung
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-600 print:text-[10px] print:leading-snug">
                  Der Arbeitgeberanteil wird erst nach <strong>drei Jahren</strong> Zusagedauer unverfallbar
                  (§ 1b BetrAVG). Wer früher geht, verliert ihn — wer später geht, verliert den laufenden
                  Matching-Beitrag. Die eigene Umwandlung gehört dem Mitarbeiter sofort.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm print:p-2 print:shadow-none">
                <h2 className="text-sm font-black text-slate-900">
                  Bei {n} Mitarbeiter{n === 1 ? '' : 'n'} im Jahr
                </h2>
                <dl className="mt-1 space-y-0.5 text-xs text-slate-700">
                  <div className="flex justify-between gap-2"><dt>Kosten Arbeitgeber, netto</dt><dd className="font-bold tabular-nums">{euro(ag.nettoKostenMonat * 12 * n)}</dd></div>
                  <div className="flex justify-between gap-2"><dt>Altersvorsorge der Mitarbeiter</dt><dd className="font-bold tabular-nums text-emerald-700">{euro(r.vertrag.gesamtMonat * 12 * n)}</dd></div>
                  <div className="flex justify-between gap-2"><dt>davon vom Arbeitgeber</dt><dd className="tabular-nums">{euro((ag.pflichtzuschussMonat + ag.ukasseMonat) * 12 * n)}</dd></div>
                </dl>
              </div>
            </section>


            {r.hinweise.length > 0 && (
              <section className="space-y-1.5">
                {r.hinweise.map((h, i) => (
                  <p key={i} className="rounded-lg bg-slate-200/60 px-3 py-2 text-[11px] leading-relaxed text-slate-700 print:px-2 print:py-1 print:text-[9px]">
                    {h}
                  </p>
                ))}
              </section>
            )}

            <p className="text-[10px] leading-relaxed text-slate-500 print:text-[8px]">
              Modellrechnung zum Rechtsstand {p.jahr}, keine Steuer- oder Rechtsberatung. Nicht enthalten: Beitrag zum
              Pensions-Sicherungs-Verein und Verwaltungskosten der Unterstützungskasse sowie die Besteuerung und
              Verbeitragung der späteren Leistungen.
            </p>


            {/*
              ZWEITE DRUCKSEITE: Umsetzung. Seite 1 ist die Rechnung, Seite 2
              beantwortet die Frage, die jeder Arbeitgeber als naechstes
              stellt — was passiert, wenn jemand geht. Bewusst getrennt statt
              auf eine Seite gepresst.
            */}
            <div className="space-y-4 print:break-before-page print:space-y-2">
              <p className="hidden text-lg font-black text-slate-900 print:block">
                Umsetzung und Arbeitgeberwechsel
              </p>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 print:break-inside-avoid print:p-3 print:shadow-none">
                <h2 className="flex items-center gap-1.5 text-sm font-black text-slate-900">
                  <ArrowRightLeft className="h-4 w-4 text-indigo-600" aria-hidden /> Wenn ein Mitarbeiter wechselt
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  Das Modell trennt die beiden Töpfe: Das Geld des Mitarbeiters liegt in der Direktversicherung und
                  geht mit ihm, das Matching liegt in der Unterstützungskasse und bleibt hier.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-3 print:grid-cols-3 print:gap-2">
                  <WechselSpalte titel="Direktversicherung — nimmt er mit" farbe="border-sky-200 bg-sky-50">
                    <li>Umwandlung und Pflichtzuschuss sind <strong>sofort unverfallbar</strong> (§ 1b Abs. 5 BetrAVG).</li>
                    <li>Mitnahme zum neuen Arbeitgeber: Anspruch <strong>innerhalb eines Jahres</strong> nach dem Ausscheiden
                      (§ 4 Abs. 3 BetrAVG), steuerfrei (§ 3 Nr. 55 EStG). Meist wird einfach der Versicherungsnehmer
                      gewechselt.</li>
                    <li>Alternativ beitragsfrei stellen oder privat weiterführen — dann ohne Steuer- und SV-Vorteil.</li>
                    <li>Kündigen und auszahlen lassen geht nicht (§ 2 Abs. 2 BetrAVG).</li>
                  </WechselSpalte>
                  <WechselSpalte titel="Unterstützungskasse — bleibt hier" farbe="border-emerald-200 bg-emerald-50">
                    <li>Wer <strong>vor drei Jahren</strong> Zusagedauer geht, verliert den Arbeitgeberanteil. Der Wert der
                      Rückdeckung bleibt in der Unterstützungskasse (je nach Satzung).</li>
                    <li>Danach bleibt die Anwartschaft <strong>beitragsfrei stehen</strong>; die Rente zahlt später die
                      Unterstützungskasse.</li>
                    <li>Einen Anspruch auf Mitnahme gibt es nicht. Übertragen lässt sie sich nur, wenn alter und neuer
                      Arbeitgeber und der Mitarbeiter zustimmen (§ 4 Abs. 2 BetrAVG) — in der Praxis selten.</li>
                  </WechselSpalte>
                  <WechselSpalte titel="Für den Arbeitgeber" farbe="border-amber-200 bg-amber-50">
                    <li>Für unverfallbare Anwartschaften bleiben Verwaltung, Auskunft (§ 4a BetrAVG) und
                      <strong> PSV-Beiträge</strong> bis zum Rentenbeginn.</li>
                    <li><strong>Kongruent rückgedeckte</strong> Unterstützungskasse wählen — sonst haftet der Arbeitgeber
                      für eine Lücke (§ 1 Abs. 1 S. 3 BetrAVG).</li>
                    <li>Einseitig abfinden lassen sich nur Kleinstanwartschaften (§ 3 BetrAVG).</li>
                    <li>Ausscheidende auf die Jahresfrist für die Mitnahme der Direktversicherung hinweisen.</li>
                  </WechselSpalte>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm print:break-inside-avoid print:p-2 print:shadow-none">
                <h2 className="flex items-center gap-1.5 text-sm font-black text-slate-900">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden /> In die Versorgungsordnung
                </h2>
                <ul className="mt-1 grid gap-x-4 gap-y-0.5 text-xs leading-relaxed text-slate-600 sm:grid-cols-2 print:grid-cols-2 print:text-[10px] print:leading-snug">
                  <li>• Matching-Regel für alle Beschäftigten gleich (Gleichbehandlung)</li>
                  <li>• Tarifvorrang prüfen (§ 20 BetrAVG)</li>
                  <li>• Pflichtzuschuss fließt in die Direktversicherung (§ 1a Abs. 1a BetrAVG)</li>
                  <li>• Rückgedeckte Unterstützungskasse, Meldung an den PSVaG</li>
                  <li>• Unverfallbarkeit des Matchings: gesetzlich 3 Jahre, kürzer möglich, länger nicht (§ 17 Abs. 3 BetrAVG)</li>
                  <li>• Was mit verfallenen Anteilen geschieht (Satzung der Unterstützungskasse)</li>
                </ul>
              </section>

              <p className="text-[10px] leading-relaxed text-slate-500 print:text-[8px]">
                Überblick zum Rechtsstand {p.jahr}, keine Rechtsberatung. Die Einzelheiten regeln die Versorgungsordnung
                und die Satzung der Unterstützungskasse — die Ausgestaltung sollte ein bAV-Spezialist prüfen.
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
