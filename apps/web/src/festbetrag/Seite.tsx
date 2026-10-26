import { useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import {
  festbetragModell, festbetragGehaltsStaffel, parameterFuer, BUNDESLAENDER, betriebUmstieg,
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
  }), [brutto, umwandlung, festbetrag, mindest, steuersatz, umlagen, privat, praemie]);
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
    () => betriebUmstieg((e) => {
      const x = festbetragModell(e, steuerOpt, p);
      return { kostenVorSteuerMonat: x.arbeitgeber.kostenVorSteuerMonat, vorsorgeMonat: x.vertragMonat, agBeitragMonat: x.arbeitgeber.zuschussMonat, agBeitragMaxMonat: festbetrag };
    }, eingaben, betriebAngaben(bisher, n), steuerOpt, p),
    [eingaben, bisher, n, steuerOpt],
  );

  return (
    <div className="min-h-screen bg-ui-flaeche text-ui-tinte print:min-h-0 print:bg-white">
      <Kopf />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10 print:max-w-none print:px-0 print:py-2">
        {/* Der Titel als Aussage wie in der Beratung; hervorgehoben, was jeder bekommt. */}
        <Titel gross klasse="print:text-xl">
          Betriebsrente mit festem Arbeitgeberbeitrag: <Hervor>{euro(festbetrag)} für jeden</Hervor>
        </Titel>
        <p className={`mt-3 ${EINLEITUNG} print:mt-1 print:text-[10px] print:leading-snug`}>
          Jeder Mitarbeiter, der mindestens {euro(mindest)} im Monat für seine Betriebsrente umwandelt, bekommt
          {' '}{euro(festbetrag)} von Ihnen dazu — gleich viel für alle, unabhängig vom Gehalt und davon, wie viel
          sich jemand leisten kann. Weil Sie auf die Umwandlung Sozialabgaben sparen, kostet Sie das nur einen
          Bruchteil.
        </p>
        <AndereModelle aktuell="/festbetrag" />

        <p className="mt-2 hidden text-xs leading-snug text-ui-schiefer print:block print:text-[10px]">
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
                  <button key={b} type="button" onClick={() => setUmwandlung(b)} className={KNOPF_KLEIN}>
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
                unten={`für ${euro(ag.zuschussMonat)} Beitrag`}
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
                <Zeile text={r.schwelleErreicht ? 'Festbetrag' : 'Pflichtzuschuss (Schwelle nicht erreicht)'} betrag={ag.zuschussMonat} />
                {r.schwelleErreicht && (
                  <p className="pl-3 text-xs text-ui-schiefer print:text-[11px]">
                    davon {euro(ag.davonPflichtzuschussMonat)} gesetzlicher Pflichtzuschuss
                  </p>
                )}
                <Zeile text="− gesparte Sozialabgaben" betrag={ag.svErsparnisMonat} />
                {ag.umlagenErsparnisMonat > 0 && <Zeile text="− gesparte Umlagen" betrag={ag.umlagenErsparnisMonat} />}
                <Zeile text="= Kosten vor Steuern" betrag={ag.kostenVorSteuerMonat} summe />
                <Zeile text="− Steuerersparnis (Betriebsausgabe)" betrag={ag.steuerersparnisMonat} />
                <p className="pb-1 pl-3 text-xs leading-snug text-ui-schiefer print:pb-0 print:text-[9px]">
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
            <section className={`${KARTE} print:break-inside-avoid`}>
              <h2 className={KARTE_TITEL}>Gleich für alle — was es Sie je Mitarbeiter kostet</h2>
              <p className={ERKLAERUNG}>
                Bei {euro(mindest)} Umwandlung, im Monat, nach Steuern und gesparten Abgaben:
              </p>
              {/* Die Spalten, nach denen der Arbeitgeber fragt, in Tinte — statt je einer eigenen Farbe. */}
              <table className={`mt-3 w-full text-sm print:mt-1 ${TABELLE_DRUCK}`}>
                <thead>
                  <tr className={TABELLE_KOPF}>
                    <th className={`${KOPFZELLE} text-left font-normal`}>
                      <span className="sm:hidden">Brutto</span><span className="hidden sm:inline">Bruttogehalt im Jahr</span>
                    </th>
                    <th className={`${KOPFZELLE} text-right font-normal`}>
                      <span className="sm:hidden">Beitrag</span><span className="hidden sm:inline">Ihr Beitrag</span>
                    </th>
                    <th className={`${KOPFZELLE} text-right font-medium text-ui-tinte`}>
                      <span className="sm:hidden">AG netto</span><span className="hidden sm:inline">Sie netto</span>
                    </th>
                    <th className={`${KOPFZELLE} text-right font-normal`}>
                      <span className="sm:hidden">MA netto</span><span className="hidden sm:inline">Mitarbeiter netto</span>
                    </th>
                    <th className={`${KOPFZELLE} text-right font-medium text-ui-tinte`}>
                      <span className="sm:hidden">Vertrag</span><span className="hidden sm:inline">im Vertrag</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="text-ui-tinte">
                  {staffel.map((st) => (
                    <tr key={st.jahresbrutto} className={TABELLE_ZEILE}>
                      <td className={ZELLE}>{euro(st.jahresbrutto)}</td>
                      <td className={`${ZELLE} text-right tabular-nums`}>{euro(st.zuschussMonat)}</td>
                      <td className={`${ZELLE} text-right tabular-nums`}>{euro(st.arbeitgeberNettoMonat)}</td>
                      <td className={`${ZELLE} text-right tabular-nums`}>{euro(st.mitarbeiterNettoMonat)}</td>
                      <td className={`${ZELLE} text-right tabular-nums`}>{euro(st.vertragMonat)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className={FUSSNOTE}>
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
              <UmstiegVergleich betrieb={betrieb} vlVertrag={bisher.vlVertrag} steuersatz={steuersatz} mitUmlagen={umlagen > 0} />
            )}

            <Hinweiszeilen hinweise={r.hinweise} />

            {/* Mit VL beginnt Seite 2 schon beim Vergleich mit heute (siehe UmstiegVergleich). */}
            <div className={`space-y-4 print:space-y-2 ${hatBisherige(bisher) ? '' : 'print:break-before-page'}`}>
              <p className="ui-titel hidden text-lg text-ui-tinte print:block">Umsetzung</p>

              {/* „Einfach und fair“ wie „Gut zu wissen“ in der Beratung: Punkte mit Gedankenstrich, ohne gruenen Kasten. */}
              <section className="grid gap-3 sm:grid-cols-2 print:grid-cols-2 print:gap-2">
                <div className={KARTE}>
                  <h2 className={KARTE_TITEL}>Einfach und fair</h2>
                  <Punkte klasse="mt-3 print:mt-1">
                    <li><strong>Ein fester Betrag für alle</strong> — leicht zu erklären, niemand fühlt sich benachteiligt.</li>
                    <li>Der gesetzliche <strong>Pflichtzuschuss ist enthalten</strong>; ab rund {euro(festbetrag / 0.15)} Umwandlung
                      wäre er höher als der Festbetrag, dann gilt er.</li>
                    <li><strong>Eine Direktversicherung</strong> je Mitarbeiter, kein Pensions-Sicherungs-Verein; beim Wechsel
                      nimmt der Mitarbeiter sie mit (§ 4 Abs. 3 BetrAVG).</li>
                    <li>Umwandlung und Pflichtzuschuss sind sofort unverfallbar, der <strong>freiwillige Teil</strong> erst nach
                      drei Jahren (§ 1b BetrAVG) — das Bezugsrecht dafür mit dem Versicherer gestalten.</li>
                    <li>Für <strong>Geringverdiener</strong> kann zusätzlich der BAV-Förderbetrag nach § 100 EStG greifen —
                      die Voraussetzungen mit dem Steuerberater prüfen.</li>
                  </Punkte>
                </div>
                {hatBisherige(bisher) ? <BetriebJahr betrieb={betrieb} /> : (
                  <div className={KARTE}>
                    <h2 className={KARTE_TITEL}>
                      Bei {n} Mitarbeiter{n === 1 ? '' : 'n'} im Jahr
                    </h2>
                    <dl className="mt-3 text-sm print:mt-1 print:text-xs">
                      <Zeile text="Kosten Arbeitgeber, netto" betrag={ag.nettoKostenMonat * 12 * n} stark />
                      <Zeile text="Beiträge in die Altersvorsorge" betrag={ag.zuschussMonat * 12 * n} />
                      <Zeile text="Altersvorsorge insgesamt" betrag={r.vertragMonat * 12 * n} stark />
                    </dl>
                  </div>
                )}
              </section>

              <Nachschlagen titel="In die Versorgungsordnung">
                <ul className={`grid gap-x-6 gap-y-1 text-sm leading-relaxed text-ui-tinte sm:grid-cols-2 print:mt-1 print:grid-cols-2 print:gap-y-0.5 print:text-[10px] print:leading-snug ${STRICHE}`}>
                  <li>{euro(festbetrag)} im Monat für jeden, der mindestens {euro(mindest)} umwandelt</li>
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
              <UebernehmenKnopf modell={{ art: 'festbetrag', festbetragMonat: festbetrag, mindestUmwandlungMonat: mindest }} bundesland={bundesland} />
            </div>
            <RechtsLinks />
          </div>
        </div>
      </main>
    </div>
  );
}
