import { useMemo, useState } from 'react';
import { Printer, Wand2 } from 'lucide-react';
import {
  zuschussModell, zuschussStaffel, zuschussVollAusschoepfen, parameterFuer, BUNDESLAENDER, betriebUmstieg,
} from '@renten/engine';
import { ZahlFeld, ProzentFeld, AuswahlFeld, Schalter, euro, euroGenau, prozent } from '../components/Feld';
import { RechtsLinks } from '../components/RechtsLinks';
import { UebernehmenKnopf } from '../mitarbeiter/UebernehmenKnopf';
import { EINLEITUNG, Hervor, KNOPF, KNOPF_KLEIN, Titel } from '../components/stil';
import {
  Kopf, Kasten, Kachel, Bon, Zeile, GehaltVergleich, UmlagenErklaerung, AndereModelle,
  BisherigeLeistungenFelder, UmstiegVergleich, KEINE_BISHERIGEN, Hinweiszeilen, Punkte,
  KARTE, KARTE_TITEL, ERKLAERUNG, FUSSNOTE, TABELLE_KOPF, TABELLE_ZEILE, TABELLE_DRUCK, ZELLE, KOPFZELLE, STRICHE,
  betriebAngaben, bisherAnnahmen, hatBisherige, BetriebJahr, Nachschlagen, type BisherigeAngaben,
} from '../arbeitgeber/bausteine';

/**
 * Arbeitgeber-Seite „Zuschussmodell".
 *
 * Die einfache Schwester des Matching-Modells: Der Arbeitgeber gibt einen
 * festen Anteil der Entgeltumwandlung dazu (Vorgabe 50 %, hoechstens 100 EUR),
 * alles fliesst in EINE Direktversicherung. Keine Unterstuetzungskasse, kein
 * PSV, der Mitarbeiter nimmt den Vertrag beim Wechsel mit.
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
  const [umwandlung, setUmwandlung] = useState(200);
  const [quote, setQuote] = useState(0.5);
  const [deckel, setDeckel] = useState(100);
  const [steuersatz, setSteuersatz] = useState(0.3);
  const [umlagen, setUmlagen] = useState(0);
  const [anzahl, setAnzahl] = useState(1);
  const [bisher, setBisher] = useState<BisherigeAngaben>(KEINE_BISHERIGEN);

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
    () => ({ verheiratet, bundesland, kirchensteuerpflichtig: kirchensteuer }), [verheiratet, bundesland, kirchensteuer],
  );

  const r = useMemo(() => zuschussModell(eingaben, steuerOpt, p), [eingaben, steuerOpt]);
  const staffel = useMemo(() => zuschussStaffel(eingaben, steuerOpt, p), [eingaben, steuerOpt]);
  const voll = () => setUmwandlung(zuschussVollAusschoepfen(eingaben, bundesland, p));

  const ma = r.mitarbeiter;
  const ag = r.arbeitgeber;
  const n = Math.max(1, Math.round(anzahl));
  const betrieb = useMemo(
    () => betriebUmstieg((e) => {
      const x = zuschussModell(e, steuerOpt, p);
      return { kostenVorSteuerMonat: x.arbeitgeber.kostenVorSteuerMonat, vorsorgeMonat: x.vertragMonat, agBeitragMonat: x.arbeitgeber.zuschussMonat, agBeitragMaxMonat: deckel };
    }, eingaben, betriebAngaben(bisher, n), steuerOpt, p),
    [eingaben, bisher, n, steuerOpt],
  );

  return (
    <div className="min-h-screen bg-ui-flaeche text-ui-tinte print:min-h-0 print:bg-white">
      <Kopf />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10 print:max-w-none print:px-0 print:py-2">
        {/* Der Titel als Aussage wie in der Beratung; hervorgehoben, was der Arbeitgeber dazulegt. */}
        <Titel gross klasse="print:text-xl">
          Betriebsrente mit Arbeitgeberzuschuss: <Hervor>{prozent(quote, 0)} obendrauf</Hervor>
        </Titel>
        <p className={`mt-3 ${EINLEITUNG} print:mt-1 print:text-[10px] print:leading-snug`}>
          Der Mitarbeiter wandelt einen Teil seines Gehalts um, Sie legen {prozent(quote, 0)} davon dazu — höchstens
          {' '}{euro(deckel)} im Monat. Alles fließt in eine Direktversicherung. Weil Sie auf die Umwandlung
          Sozialabgaben sparen, kostet Sie der Zuschuss nur einen Bruchteil.
        </p>
        <AndereModelle aktuell="/zuschussmodell" />

        <p className="mt-2 hidden text-xs leading-snug text-ui-schiefer print:block print:text-[10px]">
          Annahmen: Bruttogehalt {euro(brutto)} im Jahr, {privat ? `privat versichert (${euro(praemie)} Prämie)` : 'gesetzlich versichert'},
          {' '}{bundesland}, {verheiratet ? 'verheiratet' : 'ledig'}, {kirchensteuer ? 'mit' : 'ohne'} Kirchensteuer. Umwandlung {euro(ma.umwandlungMonat)}, Zuschuss
          {' '}{prozent(quote, 0)} bis {euro(deckel)}. Unternehmenssteuer {prozent(steuersatz, 0)}
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
                {[100, 200].map((b) => (
                  <button key={b} type="button" onClick={() => setUmwandlung(b)} className={KNOPF_KLEIN}>
                    {euro(b)}
                  </button>
                ))}
                <button type="button" onClick={voll} className={KNOPF_KLEIN}>
                  <Wand2 className="h-3.5 w-3.5" aria-hidden /> Rahmen voll ausschöpfen
                </button>
              </div>
              <ProzentFeld
                label="Zuschuss des Arbeitgebers" wert={quote} onChange={setQuote} min={0} max={100}
                hilfe="Anteil der Umwandlung. Der gesetzliche Pflichtzuschuss von 15 % ist darin enthalten."
              />
              <ZahlFeld label="Höchstens im Monat" wert={deckel} onChange={setDeckel} einheit="€" schritt={10} />
            </Kasten>

            <BisherigeLeistungenFelder wert={bisher} onChange={setBisher} />

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
            {/* Wie „Ihre Rechnung“ in der Beratung: zwei Wertkarten, die dritte — was in den Vertrag fliesst — als Akzent. Kurze Etiketten, damit die Zahlen auf einer Hoehe stehen. */}
            <section className="grid gap-3 sm:grid-cols-3 print:grid-cols-3 print:gap-2">
              <Kachel
                titel="Mitarbeiter zahlt netto" betrag={ma.nettoAufwandMonat}
                unten={`von ${euro(ma.umwandlungMonat)} Umwandlung`}
              />
              <Kachel
                titel="Arbeitgeber zahlt netto" betrag={ag.nettoKostenMonat}
                unten={`für ${euro(ag.zuschussMonat)} Zuschuss`}
              />
              <Kachel
                titel="In die Direktversicherung" betrag={r.vertragMonat}
                unten={r.hebelMitarbeiter > 0
                  ? `${r.hebelMitarbeiter.toLocaleString('de-DE', { maximumFractionDigits: 1 })}-fach der Nettokosten des Mitarbeiters`
                  : 'jeden Monat'}
                akzent
              />
            </section>

            <section className="grid gap-3 sm:grid-cols-2 print:grid-cols-2 print:gap-2">
              <Bon titel="Mitarbeiter">
                <Zeile text="Entgeltumwandlung" betrag={ma.umwandlungMonat} />
                <Zeile text="− gesparte Sozialabgaben" betrag={ma.svErsparnisMonat} />
                <Zeile text="− gesparte Steuer" betrag={ma.steuerersparnisMonat} />
                <Zeile text="= kostet netto" betrag={ma.nettoAufwandMonat} summe />
                {ma.svPflichtigMonat > 0.5 && (
                  <p className="pt-1 text-xs font-medium text-ui-tinte print:text-[11px]">
                    Davon {euro(ma.svPflichtigMonat)} beitragspflichtig — siehe Hinweise.
                  </p>
                )}
              </Bon>
              <Bon titel="Arbeitgeber">
                <Zeile text={`Zuschuss ${prozent(quote, 0)}${r.gedeckelt ? ' (gedeckelt)' : ''}`} betrag={ag.zuschussMonat} />
                <p className="pl-3 text-xs text-ui-schiefer print:text-[11px]">
                  davon {euro(ag.davonPflichtzuschussMonat)} gesetzlicher Pflichtzuschuss
                </p>
                <Zeile text="− gesparte Sozialabgaben" betrag={ag.svErsparnisMonat} />
                {ag.umlagenErsparnisMonat > 0 && <Zeile text="− gesparte Umlagen" betrag={ag.umlagenErsparnisMonat} />}
                <Zeile text="= Kosten vor Steuern" betrag={ag.kostenVorSteuerMonat} summe />
                <Zeile text="− Steuerersparnis (Betriebsausgabe)" betrag={ag.steuerersparnisMonat} />
                <p className="pb-1 pl-3 text-xs leading-snug text-ui-schiefer print:pb-0 print:text-[9px]">
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
            <section className={`${KARTE} print:break-inside-avoid`}>
              <h2 className={KARTE_TITEL}>Was kostet mich jeder Mitarbeiter?</h2>
              <p className={ERKLAERUNG}>
                Je nachdem, wie viel er umwandelt — im Monat, nach Steuern und gesparten Abgaben:
              </p>
              {/* Die gewaehlte Zeile liegt auf der Innenflaeche — wie die hervorgehobene Zeile der Vergleiche, ohne Gelb. */}
              <table className={`mt-3 w-full text-sm print:mt-1 ${TABELLE_DRUCK}`}>
                <thead>
                  <tr className={TABELLE_KOPF}>
                    <th className={`${KOPFZELLE} text-left font-normal`}>Umwandlung</th>
                    <th className={`${KOPFZELLE} text-right font-normal`}>Zuschuss</th>
                    <th className={`${KOPFZELLE} text-right font-medium text-ui-tinte`}>
                      <span className="sm:hidden">AG netto</span><span className="hidden sm:inline">Arbeitgeber netto</span>
                    </th>
                    <th className={`${KOPFZELLE} text-right font-medium text-ui-tinte`}>
                      <span className="sm:hidden">Vertrag</span><span className="hidden sm:inline">im Vertrag</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="text-ui-tinte">
                  {staffel.map((st) => {
                    const aktiv = Math.abs(st.umwandlungMonat - ma.umwandlungMonat) < 0.5;
                    return (
                      <tr key={st.umwandlungMonat}
                        className={`${TABELLE_ZEILE} ${aktiv ? 'bg-ui-innen font-medium' : ''} cursor-pointer hover:bg-ui-innen print:cursor-auto`}
                        onClick={() => setUmwandlung(st.umwandlungMonat)}>
                        <td className={ZELLE}>
                          {euro(st.umwandlungMonat)}
                          {st.voll && <span className="ml-1.5 text-xs font-normal text-ui-schiefer print:text-[10px]">Rahmen voll</span>}
                        </td>
                        <td className={`${ZELLE} text-right tabular-nums`}>{euro(st.zuschussMonat)}</td>
                        <td className={`${ZELLE} text-right tabular-nums`}>{euro(st.arbeitgeberNettoMonat)}</td>
                        <td className={`${ZELLE} text-right tabular-nums`}>{euro(st.vertragMonat)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className={FUSSNOTE}>
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
            {hatBisherige(bisher) && (
              <UmstiegVergleich betrieb={betrieb} vlVertrag={bisher.vlVertrag} steuersatz={steuersatz} mitUmlagen={umlagen > 0} />
            )}

            <Hinweiszeilen hinweise={r.hinweise} />

            {/* Mit VL beginnt Seite 2 schon beim Vergleich mit heute (siehe UmstiegVergleich). */}
            <div className={`space-y-4 print:space-y-2 ${hatBisherige(bisher) ? '' : 'print:break-before-page'}`}>
              <p className="ui-titel hidden text-lg text-ui-tinte print:block">Umsetzung</p>

              {/* „Einfach umzusetzen“ wie „Gut zu wissen“ in der Beratung: Punkte mit Gedankenstrich, ohne gruenen Kasten. */}
              <section className="grid gap-3 sm:grid-cols-2 print:grid-cols-2 print:gap-2">
                <div className={KARTE}>
                  <h2 className={KARTE_TITEL}>Einfach umzusetzen</h2>
                  <Punkte klasse="mt-3 print:mt-1">
                    <li><strong>Ein Vertrag</strong> je Mitarbeiter, eine Direktversicherung — keine Unterstützungskasse,
                      kein Pensions-Sicherungs-Verein.</li>
                    <li>Der gesetzliche <strong>Pflichtzuschuss ist enthalten</strong> — nichts kommt obendrauf.</li>
                    <li>Beim Wechsel <strong>nimmt der Mitarbeiter den Vertrag mit</strong> (Anspruch innerhalb eines
                      Jahres, § 4 Abs. 3 BetrAVG); für Sie ist er danach erledigt.</li>
                    <li>Umwandlung und Pflichtzuschuss sind sofort unverfallbar. Der <strong>freiwillige Teil</strong> darüber
                      hinaus erst nach drei Jahren (§ 1b BetrAVG) — das Bezugsrecht dafür mit dem Versicherer gestalten.</li>
                  </Punkte>
                </div>
                {hatBisherige(bisher) ? <BetriebJahr betrieb={betrieb} /> : (
                  <div className={KARTE}>
                    <h2 className={KARTE_TITEL}>
                      Bei {n} Mitarbeiter{n === 1 ? '' : 'n'} im Jahr
                    </h2>
                    <dl className="mt-3 text-sm print:mt-1 print:text-xs">
                      <Zeile text="Kosten Arbeitgeber, netto" betrag={ag.nettoKostenMonat * 12 * n} stark />
                      <Zeile text="Zuschüsse in die Altersvorsorge" betrag={ag.zuschussMonat * 12 * n} />
                      <Zeile text="Altersvorsorge insgesamt" betrag={r.vertragMonat * 12 * n} stark />
                    </dl>
                  </div>
                )}
              </section>

              <Nachschlagen titel="In die Versorgungsordnung">
                <ul className={`grid gap-x-6 gap-y-1 text-sm leading-relaxed text-ui-tinte sm:grid-cols-2 print:mt-1 print:grid-cols-2 print:gap-y-0.5 print:text-[10px] print:leading-snug ${STRICHE}`}>
                  <li>Zuschuss {prozent(quote, 0)} der Umwandlung, höchstens {euro(deckel)} im Monat</li>
                  <li>Der gesetzliche Zuschuss (§ 1a Abs. 1a BetrAVG) ist darin enthalten</li>
                  <li>Für alle Beschäftigten gleich (Gleichbehandlung)</li>
                  <li>Tarifvorrang prüfen (§ 20 BetrAVG)</li>
                  <li>Unverfallbarkeit des freiwilligen Teils: gesetzlich 3 Jahre, kürzer möglich</li>
                  <li>Ein Anbieter, ein Tarif — neue Mitarbeiter können mitgebrachte Verträge übertragen</li>
                </ul>
              </Nachschlagen>

              <p className="text-xs leading-relaxed text-ui-schiefer print:text-[8px]">
                Modellrechnung zum Rechtsstand {p.jahr}, keine Steuer- oder Rechtsberatung. Nicht enthalten: die
                Besteuerung und Verbeitragung der späteren Leistungen. Die Ausgestaltung sollte ein bAV-Spezialist prüfen.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 print:hidden">
              <button type="button" onClick={() => window.print()} className={KNOPF}>
                <Printer className="h-4 w-4" aria-hidden /> Für den Arbeitgeber drucken
              </button>
              <UebernehmenKnopf modell={{ art: 'zuschuss', quote, deckelMonat: deckel }} bundesland={bundesland} />
            </div>
            <RechtsLinks />
          </div>
        </div>
      </main>
    </div>
  );
}
