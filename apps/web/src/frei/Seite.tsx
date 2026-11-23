import { useEffect, useMemo, useRef, useState } from 'react';
import { Printer, Wand2 } from 'lucide-react';
import {
  freiesModell, freiStaffel, freiVollAusschoepfen, freiHoechstMonat, zuschussDeckel, parameterFuer, BUNDESLAENDER, betriebUmstieg,
} from '@renten/engine';
import { ZahlFeld, ProzentFeld, AuswahlFeld, Schalter, euro, prozent } from '../components/Feld';
import { RechtsLinks } from '../components/RechtsLinks';
import { UebernehmenKnopf } from '../mitarbeiter/UebernehmenKnopf';
import { EINLEITUNG, Hervor, Hinweis, KNOPF, KNOPF_KLEIN, Titel } from '../components/stil';
import {
  Kopf, Kasten, Kachel, Bon, Zeile, Notiz, GehaltVergleich, UmlagenErklaerung, AndereModelle,
  BisherigeLeistungenFelder, UmstiegVergleich, KEINE_BISHERIGEN, Hinweiszeilen, Punkte,
  KARTE, KARTE_TITEL, ERKLAERUNG, FUSSNOTE, TABELLE_KOPF, TABELLE_ZEILE, TABELLE_DRUCK, ZELLE, KOPFZELLE, STRICHE,
  betriebAngaben, bisherAnnahmen, hatBisherige, BetriebJahr, Nachschlagen, type BisherigeAngaben,
} from '../arbeitgeber/bausteine';
import { FirmenkundeWahl, firmenWerteSetzer, useFirmenkunde } from '../arbeitgeber/Firmenkunde';
import { FreiRegelFelder } from './RegelFelder';
import {
  FREI_LEER, anteilText, freiHatRegel, freiRegelAus, freiRegelKurz, prozentKurz, regelBeimFirmenwechsel, regelGleich, stufenText,
  wirksameStufen, type FreiRegelEingabe,
} from './regel';

/**
 * Arbeitgeber-Seite „Individuelles Modell".
 *
 * Die Regel baut der Berater selbst, OHNE VORBELEGUNG: feste Zuschuesse in
 * Stufen („ab 50 EUR Umwandlung 25 EUR, ab 70 EUR 30 EUR“ — es gilt die
 * hoechste erreichte Stufe) und dazu ein Anteil der GANZEN Umwandlung. Beides
 * zusammen, eines allein oder nichts davon: Der Arbeitgeber zahlt mindestens
 * den gesetzlichen Zuschuss (§ 1a Abs. 1a BetrAVG). Alles fliesst in EINE
 * Direktversicherung — wie beim Zuschussmodell, dessen Verallgemeinerung die
 * Seite ist.
 *
 * Eigenes Bundle, nur mit Konto (Zugangsschranke in main.tsx). Die Rechnung
 * wird nicht gespeichert; die Regel einer Firma steht in ihrem Angebot
 * („Für die Mitarbeiter-Beratung übernehmen“) und kommt von dort zurueck.
 */

const p = parameterFuer(new Date().getFullYear(), { indexRate: 0 });

export function Seite() {
  const [brutto, setBrutto] = useState(54_000);
  const [privat, setPrivat] = useState(false);
  const [praemie, setPraemie] = useState(600);
  const [bundesland, setBundesland] = useState<string>('Nordrhein-Westfalen');
  const [verheiratet, setVerheiratet] = useState(false);
  const [kirchensteuer, setKirchensteuer] = useState(false);
  const [umwandlung, setUmwandlung] = useState(100);
  const [regel, setRegel] = useState<FreiRegelEingabe>(FREI_LEER);
  const [steuersatz, setSteuersatz] = useState(0.3);
  const [umlagen, setUmlagen] = useState(0);
  const [anzahl, setAnzahl] = useState(1);
  const [bisher, setBisher] = useState<BisherigeAngaben>(KEINE_BISHERIGEN);

  // Fuer welche Firma gerechnet wird: Name und Logo fuer Kopf und Ausdruck, Sitz, Steuersatz und Umlagen aus ihrem Angebot.
  const kunde = useFirmenkunde({
    werte: { bundesland, steuersatz, umlagen },
    onWerte: firmenWerteSetzer({ bundesland: setBundesland, steuersatz: setSteuersatz, umlagen: setUmlagen }),
  });

  // Hat die gewaehlte Firma schon ein individuelles Modell im Angebot, ist das ihre Regel — sie kommt mit der Firma,
  // solange die Regel hier unberuehrt ist (`regelBeimFirmenwechsel`). Was der Berater selbst eingestellt hat, bleibt.
  const firmaModell = kunde.firma?.angebot.modell;
  const firmaRegel = useMemo(() => (firmaModell?.art === 'frei' ? freiRegelAus(firmaModell) : null), [firmaModell]);
  const firmaId = kunde.firma?.id ?? null;
  const vonFirma = useRef<FreiRegelEingabe | null>(null);
  const regelJetzt = useRef(regel);
  regelJetzt.current = regel;
  useEffect(() => {
    const naechste = regelBeimFirmenwechsel(regelJetzt.current, vonFirma.current, firmaRegel);
    if (naechste === regelJetzt.current) return;
    vonFirma.current = firmaRegel;
    setRegel(naechste);
    // Nur beim Wechsel der Firma — nicht bei jeder Aenderung der Regel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaId]);

  const hatRegel = freiHatRegel(regel);
  const stufen = wirksameStufen(regel.stufen);
  const mitAnteil = regel.quote > 0;
  const mitDeckel = mitAnteil && regel.deckelMonat > 0;

  const eingaben = useMemo(() => ({
    jahresbrutto: brutto,
    umwandlungMonat: umwandlung,
    quote: regel.quote,
    // 0 im Feld heisst ohne Deckel — wie im Angebot der Mitarbeiterberatung, in das „Übernehmen“ die Zahl reicht.
    deckelMonat: zuschussDeckel(regel.deckelMonat),
    stufen: regel.stufen,
    unternehmensSteuersatz: steuersatz,
    umlagenSatz: umlagen,
    privatVersichert: privat,
    pkvPraemieMonat: privat ? praemie : 0,
    kinder: { hatKinder: false, kinderUnter25: 0 },
  }), [brutto, umwandlung, regel, steuersatz, umlagen, privat, praemie]);
  const steuerOpt = useMemo(
    () => ({ verheiratet, bundesland, kirchensteuerpflichtig: kirchensteuer }), [verheiratet, bundesland, kirchensteuer],
  );

  const r = useMemo(() => freiesModell(eingaben, steuerOpt, p), [eingaben, steuerOpt]);
  const staffel = useMemo(() => freiStaffel(eingaben, steuerOpt, p), [eingaben, steuerOpt]);
  const voll = () => setUmwandlung(freiVollAusschoepfen(eingaben, bundesland, p));

  const ma = r.mitarbeiter;
  const ag = r.arbeitgeber;
  const n = Math.max(1, Math.round(anzahl));
  const nachRegel = r.festMonat + r.anteilMonat;
  // Der gesetzliche Zuschuss liegt ueber der Regel: Der Arbeitgeber zahlt die Differenz dazu.
  const aufstockung = Math.max(0, ag.zuschussMonat - nachRegel);
  const aufgestockt = aufstockung > 0.005;
  const staffelAufgestockt = staffel.some((st) => st.zuschussMonat > st.festMonat + st.anteilMonat + 0.005);
  const betrieb = useMemo(
    () => betriebUmstieg((e) => {
      const x = freiesModell(e, steuerOpt, p);
      return {
        kostenVorSteuerMonat: x.arbeitgeber.kostenVorSteuerMonat, vorsorgeMonat: x.vertragMonat,
        agBeitragMonat: x.arbeitgeber.zuschussMonat, agBeitragMaxMonat: freiHoechstMonat(eingaben),
      };
    }, eingaben, betriebAngaben(bisher, n), steuerOpt, p),
    [eingaben, bisher, n, steuerOpt],
  );

  const regelKurz = freiRegelKurz(regel);
  const stufenWorte = stufenText(regel.stufen);
  const anteilWorte = anteilText(regel);

  return (
    <div className="min-h-screen bg-ui-flaeche text-ui-tinte print:min-h-0 print:bg-white">
      <Kopf kunde={kunde.kunde} />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10 print:max-w-none print:px-0 print:py-2">
        {/* Der Titel als Aussage wie in der Beratung; hervorgehoben, was die Seite von den anderen Modellen unterscheidet. */}
        <Titel gross klasse="print:text-xl">
          Betriebsrente nach Ihrer Regel: <Hervor>feste Zuschüsse und Prozente, frei kombiniert</Hervor>
        </Titel>
        <p className={`mt-3 ${EINLEITUNG} print:mt-1 print:text-[10px] print:leading-snug`}>
          Sie legen selbst fest, was der Arbeitgeber dazugibt: feste Beträge in Stufen — je nachdem, wie viel der
          Mitarbeiter umwandelt — und dazu einen Prozentsatz auf die ganze Umwandlung. Alles fließt in eine
          Direktversicherung; der gesetzliche Pflichtzuschuss von 15 % ist enthalten.
        </p>
        <AndereModelle aktuell="/individuelles-modell" />

        <p className="mt-2 hidden text-xs leading-snug text-ui-schiefer print:block print:text-[10px]">
          Annahmen: Bruttogehalt {euro(brutto)} im Jahr, {privat ? `privat versichert (${euro(praemie)} Prämie)` : 'gesetzlich versichert'},
          {' '}{bundesland}, {verheiratet ? 'verheiratet' : 'ledig'}, {kirchensteuer ? 'mit' : 'ohne'} Kirchensteuer. Umwandlung {euro(ma.umwandlungMonat)}.
          {' '}Regel: {regelKurz}. Unternehmenssteuer {prozent(steuersatz, 0)}
          {umlagen > 0 ? `, Umlagen ${prozent(umlagen)}` : ''}. Rechtsstand {p.jahr}.
          {bisherAnnahmen(bisher)}
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6 print:mt-2 print:block">
          {/* --- Eingaben ---------------------------------------------------- */}
          <div className="space-y-4 lg:col-span-4 print:hidden">
            <FirmenkundeWahl kunde={kunde} />

            <Kasten titel="Ihre Regel">
              <FreiRegelFelder wert={regel} onChange={setRegel} />
              {firmaRegel && !regelGleich(firmaRegel, regel) && (
                <button type="button" onClick={() => setRegel(firmaRegel)} className={KNOPF_KLEIN}>
                  Regel aus dem Angebot der Firma
                </button>
              )}
            </Kasten>

            <Kasten titel="Mitarbeiter">
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
            {/* Ohne Vorbelegung: Solange nichts eingetragen ist, sagt die Seite, was sie gerade rechnet. */}
            {!hatRegel && (
              <Hinweis klasse="print:hidden">
                Noch keine Regel eingetragen. Legen Sie unter „Ihre Regel“ eine Stufe an oder tragen Sie einen Prozentsatz
                ein — bis dahin steht hier nur der gesetzliche Pflichtzuschuss.
              </Hinweis>
            )}

            {/* Die Regel in Worten — das, was der Arbeitgeber liest und in die Versorgungsordnung schreibt. */}
            {hatRegel && (
              <section className={`${KARTE} print:break-inside-avoid`} data-regel>
                <h2 className={KARTE_TITEL}>So lautet die Regel</h2>
                <Punkte klasse="mt-3 print:mt-1">
                  {stufenWorte && (
                    <li>
                      <strong>Fester Zuschuss:</strong> {stufenWorte}.{stufen.length > 1 ? ' Es gilt die höchste erreichte Stufe.' : ''}
                    </li>
                  )}
                  {anteilWorte && (
                    <li><strong>{stufenWorte ? 'Dazu' : 'Zuschuss'}:</strong> {anteilWorte} — auf den ganzen Betrag, nicht nur auf den Teil über einer Stufe.</li>
                  )}
                  <li>Mindestens der gesetzliche Pflichtzuschuss von 15 %, soweit Sie Sozialabgaben sparen.</li>
                </Punkte>
              </section>
            )}

            {/* Wie „Ihre Rechnung“ in der Beratung: zwei Wertkarten, die dritte — was in den Vertrag fliesst — als Akzent. */}
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
                  <Notiz klasse="pt-1 text-xs font-medium text-ui-tinte print:text-[11px]">
                    Davon {euro(ma.svPflichtigMonat)} beitragspflichtig — siehe Hinweise.
                  </Notiz>
                )}
                {r.naechsteStufe && r.naechsteStufe.betragMonat > r.festMonat && (
                  <Notiz klasse="pt-1 text-xs leading-snug text-ui-schiefer print:text-[9px]">
                    Ab {euro(r.naechsteStufe.abMonat)} Umwandlung: {euro(r.naechsteStufe.betragMonat)} fester Zuschuss
                    {r.festMonat > 0 ? ` statt ${euro(r.festMonat)}` : ''}.
                  </Notiz>
                )}
              </Bon>
              <Bon titel="Arbeitgeber">
                {stufen.length > 0 && (
                  <Zeile
                    text={r.stufe ? `Fester Zuschuss (Stufe ab ${euro(r.stufe.abMonat)})` : 'Fester Zuschuss (noch keine Stufe erreicht)'}
                    betrag={r.festMonat}
                  />
                )}
                {mitAnteil && (
                  <Zeile text={`${stufen.length > 0 ? '+ ' : ''}${prozentKurz(regel.quote)} der Umwandlung${r.gedeckelt ? ' (gedeckelt)' : ''}`} betrag={r.anteilMonat} />
                )}
                {aufgestockt && <Zeile text={`${hatRegel ? '+ Aufstockung auf den' : 'Gesetzlicher'} Pflichtzuschuss`} betrag={aufstockung} />}
                <Zeile text="= Zuschuss" betrag={ag.zuschussMonat} summe />
                <Notiz klasse="pl-3 text-xs text-ui-schiefer print:text-[11px]">
                  davon {euro(ag.davonPflichtzuschussMonat)} gesetzlicher Pflichtzuschuss
                </Notiz>
                <Zeile text="− gesparte Sozialabgaben" betrag={ag.svErsparnisMonat} />
                {ag.umlagenErsparnisMonat > 0 && <Zeile text="− gesparte Umlagen" betrag={ag.umlagenErsparnisMonat} />}
                <Zeile text="= Kosten vor Steuern" betrag={ag.kostenVorSteuerMonat} summe />
                <Zeile text="− Steuerersparnis (Betriebsausgabe)" betrag={ag.steuerersparnisMonat} />
                <Notiz klasse="pb-1 pl-3 text-xs leading-snug text-ui-schiefer print:pb-0 print:text-[9px]">
                  Beiträge zur Direktversicherung sind sofort abziehbarer Personalaufwand; der Vertrag wird nicht aktiviert (§ 4b EStG). Die Umwandlung ist ohnehin Lohnaufwand — steuerlich zählt nur, was zusätzlich anfällt: Zuschuss minus gesparte Abgaben.
                </Notiz>
                <Zeile text="= kostet netto" betrag={ag.nettoKostenMonat} summe />
              </Bon>
            </section>

            {/*
              DIE STAFFEL: an jeder Schwelle der Regel eine Zeile — dort
              springt der feste Zuschuss, und der Arbeitgeber sieht, was ihn
              der Sprung kostet.
            */}
            <section className={`${KARTE} print:break-inside-avoid`}>
              <h2 className={KARTE_TITEL}>Was kostet mich jeder Mitarbeiter?</h2>
              <p className={ERKLAERUNG}>
                Je nachdem, wie viel er umwandelt — im Monat, nach Steuern und gesparten Abgaben:
              </p>
              <table className={`mt-3 w-full text-sm print:mt-1 ${TABELLE_DRUCK}`} data-staffel>
                <thead>
                  <tr className={TABELLE_KOPF}>
                    <th className={`${KOPFZELLE} text-left font-normal`}>Umwandlung</th>
                    <th className={`${KOPFZELLE} hidden text-right font-normal sm:table-cell print:table-cell`}>fest</th>
                    <th className={`${KOPFZELLE} hidden text-right font-normal sm:table-cell print:table-cell`}>prozentual</th>
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
                          {/* Mit echtem Leerzeichen: Vorgelesen und kopiert hiesse es sonst „50 €Stufe“. */}
                          {st.schwelle && <>{' '}<span className="ml-0.5 text-xs font-normal text-ui-schiefer print:text-[10px]">Stufe</span></>}
                          {st.voll && <>{' '}<span className="ml-0.5 text-xs font-normal text-ui-schiefer print:text-[10px]">Rahmen voll</span></>}
                        </td>
                        <td className={`${ZELLE} hidden text-right tabular-nums sm:table-cell print:table-cell`}>{euro(st.festMonat)}</td>
                        <td className={`${ZELLE} hidden text-right tabular-nums sm:table-cell print:table-cell`}>{euro(st.anteilMonat)}</td>
                        <td className={`${ZELLE} text-right tabular-nums`}>{euro(st.zuschussMonat)}</td>
                        <td className={`${ZELLE} text-right tabular-nums`}>{euro(st.arbeitgeberNettoMonat)}</td>
                        <td className={`${ZELLE} text-right tabular-nums`}>{euro(st.vertragMonat)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className={`${FUSSNOTE} ${staffelAufgestockt || mitDeckel ? '' : 'print:hidden'}`}>
                {staffelAufgestockt && (
                  <>Wo der gesetzliche Pflichtzuschuss über Ihrer Regel liegt, steht er in der Spalte Zuschuss.{' '}</>
                )}
                {mitDeckel && (
                  <>Der prozentuale Zuschuss endet bei {euro(regel.deckelMonat)} im Monat.{' '}</>
                )}
                <span className="print:hidden">Zeile antippen übernimmt den Betrag.</span>
              </p>
            </section>

            <Hinweiszeilen hinweise={r.hinweise} />

            {/*
              Seite 2 des Ausdrucks beginnt hier — frueher als auf den anderen
              Modellseiten: Regel und Staffel (bis zu zehn Zeilen) fuellen
              Seite 1, der Vergleich mit der Gehaltserhoehung passte nicht
              mehr darunter und stuende sonst allein auf einer dritten Seite.
            */}
            <div className="space-y-4 print:break-before-page print:space-y-2">
              {r.gehalt && (
                <GehaltVergleich
                  modell="Individuelles Modell" g={r.gehalt} steuersatz={steuersatz} mitUmlagen={umlagen > 0}
                  agZahlung={ag.zuschussMonat}
                  agAbgabenGespart={ag.svErsparnisMonat + ag.umlagenErsparnisMonat}
                  agKostenVorSteuer={ag.kostenVorSteuerMonat}
                  agSteuer={ag.steuerersparnisMonat}
                  agNetto={ag.nettoKostenMonat}
                  gesamtVorsorge={r.vertragMonat}
                />
              )}
              {hatBisherige(bisher) && (
                <UmstiegVergleich betrieb={betrieb} vlVertrag={bisher.vlVertrag} steuersatz={steuersatz} mitUmlagen={umlagen > 0} druck="folgt" />
              )}

              <p className="ui-titel hidden text-lg text-ui-tinte print:block">Umsetzung</p>

              <section className="grid gap-3 sm:grid-cols-2 print:grid-cols-2 print:gap-2">
                <div className={KARTE}>
                  <h2 className={KARTE_TITEL}>Einfach umzusetzen</h2>
                  <Punkte klasse="mt-3 print:mt-1">
                    <li><strong>Ein Vertrag</strong> je Mitarbeiter, eine Direktversicherung — keine Unterstützungskasse,
                      kein Pensions-Sicherungs-Verein.</li>
                    <li>Der gesetzliche <strong>Pflichtzuschuss ist enthalten</strong> — liegt Ihre Regel einmal darunter,
                      zahlen Sie ihn.</li>
                    <li>Die Stufen <strong>belohnen höhere Umwandlung</strong>: Wer eine Schwelle erreicht, bekommt den
                      Betrag dieser Stufe — nicht die Summe aller Stufen.</li>
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
                  {stufenWorte && <li>Fester Zuschuss nach der Höhe der Umwandlung: {stufenWorte} — es gilt die höchste erreichte Stufe</li>}
                  {anteilWorte && <li>{stufenWorte ? 'Zusätzlich ' : 'Zuschuss '}{anteilWorte}{mitDeckel ? '' : ', ohne Deckel'}</li>}
                  <li>Der gesetzliche Zuschuss (§ 1a Abs. 1a BetrAVG) ist darin enthalten; ist er höher, wird er gezahlt</li>
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
              <UebernehmenKnopf modell={{ art: 'frei', ...regel }} bundesland={bundesland}
                firmaId={kunde.firma?.aenderbar ? kunde.firma.id : null} />
            </div>
            <RechtsLinks />
          </div>
        </div>
      </main>
    </div>
  );
}
