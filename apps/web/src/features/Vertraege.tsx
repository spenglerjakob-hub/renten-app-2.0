import { useMemo, useState, type ReactNode } from 'react';
import { Trash2, Plus, ChevronDown } from 'lucide-react';
import {
  parameterFuer, parseDatum,
  type Vertrag, type VertragsTyp, type AvdLauf, type KapitalVerrentung,
} from '@renten/engine';
import { useSzenario } from '../store/szenario';
import { ZahlFeld, ProzentFeld, TextFeld, AuswahlFeld, Schalter, Abschnitt, euro } from '../components/Feld';
import { KinderZeilen, KinderHinweis } from '../components/KinderFelder';
import {
  TYPEN, SCHICHT_TITEL, STRATEGIEN, istKapital, kenntKapitalwahl, strategieGruppe, typText,
  VERRENTUNG_JAHRE, VERRENTUNG_RENDITE,
} from './vertragsarten';
import { personNameAus } from './personen';
import { KNOPF_ZWEIT } from '../components/stil';

/** Ein Ergebnis im Vertrag: leises Etikett, darunter der Betrag in Tinte. */
function Wert({ etikett, children }: { etikett: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-xs text-ui-schiefer">{etikett}</div>
      <div className="text-base font-medium tabular-nums text-ui-tinte">{children}</div>
    </div>
  );
}

/**
 * Die eine Zahl, die eine zugeklappte Karte kenntlich macht.
 *
 * Welches Feld sie traegt, haengt an der Vertragsart: laufende Renten stehen
 * in `brutto`, Sparvertraege in `monatsbeitrag` oder `sparrate`. Eine Karte
 * ohne Zahl waere nicht wiederzuerkennen.
 */
function kopfBetrag(v: Vertrag): string | null {
  if (istKapital(v) && v.kapitalAlternative) return `${euro(v.kapitalAlternative)} Kapital`;
  if (v.brutto) return `${euro(v.brutto)} im Monat`;
  if (v.kapitalAlternative) return `${euro(v.kapitalAlternative)} Kapital`;
  if (v.monatsbeitrag) return `${euro(v.monatsbeitrag)} Beitrag`;
  if (v.sparrate) return `${euro(v.sparrate)} Sparrate`;
  if (v.kapitalHeute) return `${euro(v.kapitalHeute)} vorhanden`;
  return null;
}

function VertragsKarte({ v, depot, auszahlung, avd, verrentung }: {
  v: Vertrag; depot?: DepotAnzeige; auszahlung?: AuszahlungAnzeige; avd?: AvdLauf;
  verrentung?: KapitalVerrentung;
}) {
  const vertragAendern = useSzenario((x) => x.vertragAendern);
  const vertragEntfernen = useSzenario((x) => x.vertragEntfernen);
  const verheiratet = useSzenario((x) => x.szenario.haushalt.verheiratet);
  const haushaltsKinder = useSzenario((x) => x.szenario.haushalt.kinder);
  const personen = useSzenario((x) => x.szenario.personen);
  const tarifIndex = useSzenario((x) => x.szenario.annahmen.tarifIndex);
  const setzeKinderAnzahl = useSzenario((x) => x.setzeKinderAnzahl);
  const setzeKind = useSzenario((x) => x.setzeKind);

  const jetzt = new Date().getFullYear();
  const avdParam = parameterFuer(Math.max(jetzt, 2027), { indexRate: tarifIndex }).avd;
  /*
    Der Rentenbeginn DES INHABERS — er ist die Vorgabe fuer das Vertragsende
    und zugleich die Grenze, ab der ein Ablauf ueberhaupt „vorgezogen" ist.
  */
  const rentenbeginnJahr =
    parseDatum(personen.find((x) => x.id === v.inhaber)?.rentenbeginn ?? '')?.jahr ?? jetzt + 20;

  /*
    Ein FRISCH angelegter Vertrag steht offen, ein bereits ausgefuellter
    geschlossen. Die Karte haengt an `key={v.id}`, der Anfangswert gilt also
    genau einmal beim Einhaengen: wer einen Vertrag hinzufuegt, kann sofort
    tippen; wer ein gespeichertes Szenario laedt, sieht eine kurze Liste
    statt einer Bildschirmlaenge Formularfelder.
  */
  const [offen, setOffen] = useState(
    () => !v.name && !v.brutto && !v.monatsbeitrag && !v.sparrate && !v.kapitalHeute,
  );
  const betrag = kopfBetrag(v);

  return (
    /*
      Eine weisse Karte mit Haarlinie in der Karte des Schritts — die
      Ergebnisse darin (Depotwert, Zulagen, Auszahlung) stehen in der
      Innenflaeche, ohne Farbton.
    */
    <div className="rounded-[10px] border border-ui-linie bg-ui-karte">
      <div className="flex items-center gap-1 p-2 sm:p-3">
        <button
          type="button"
          onClick={() => setOffen((x) => !x)}
          aria-expanded={offen}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-ui-innen"
        >
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-ui-schiefer transition-transform ${offen ? 'rotate-180' : ''}`}
            aria-hidden
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ui-tinte">
              {v.name || 'Ohne Bezeichnung'}
            </span>
            <span className="block truncate text-xs text-ui-schiefer">{typText(v.typ)}</span>
          </span>
          {betrag && (
            <span className="shrink-0 whitespace-nowrap text-xs font-medium tabular-nums text-ui-tinte">
              {betrag}
            </span>
          )}
        </button>
        {/* Loeschen bleibt rot — erst beim Darueberfahren, damit die Liste ruhig bleibt. */}
        <button
          type="button"
          onClick={() => vertragEntfernen(v.id)}
          aria-label={`Vertrag ${v.name || 'ohne Namen'} entfernen`}
          className="shrink-0 rounded-full p-2 text-ui-schiefer hover:bg-rose-50 hover:text-rose-700"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className={`border-t border-ui-linie p-3 sm:p-4 ${offen ? 'block' : 'hidden'}`}>
      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <AuswahlFeld label="Vertragsart" wert={v.typ}
          onChange={(t) => vertragAendern(v.id, { typ: t })}
          optionen={TYPEN[v.schicht]} />
        <TextFeld label="Bezeichnung" wert={v.name}
          onChange={(n) => vertragAendern(v.id, { name: n })} platzhalter="z. B. Allianz" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {verheiratet && (
          <AuswahlFeld label="Inhaber" wert={v.inhaber}
            onChange={(i) => vertragAendern(v.id, { inhaber: i })}
            optionen={[
              { wert: 'A', text: personNameAus(personen, 'A') },
              { wert: 'B', text: personNameAus(personen, 'B') },
            ]} />
        )}

        {v.typ !== 'etf' && v.typ !== 'avd' && (
          <ZahlFeld
            label={v.typ === 'immobilie' ? 'Kaltmiete monatlich' : 'Rente monatlich (brutto)'}
            wert={v.brutto} onChange={(n) => vertragAendern(v.id, { brutto: n })} einheit="€" />
        )}

        {/*
          BEIDE WEGE AN EINEM VERTRAG. Frueher waren das zwei Vertragsarten,
          und man musste sich beim Anlegen entscheiden — ein Vergleich war
          damit unmoeglich. Wer beide Betraege eintraegt, bekommt ihn im
          Vertrags-TUEV samt Break-even.
        */}
        {kenntKapitalwahl(v.typ) && (
          <ZahlFeld
            label="Alternativ: Kapitalauszahlung (brutto)"
            wert={v.kapitalAlternative ?? 0}
            onChange={(n) => vertragAendern(v.id, { kapitalAlternative: n })}
            einheit="€"
            hilfe="Was der Anbieter stattdessen einmalig zahlen würde." />
        )}

        {v.typ === 'immobilie' && (
          <>
            <ZahlFeld label="Bewirtschaftungskosten" wert={v.bewirtschaftungskostenProzent ?? 20}
              onChange={(n) => vertragAendern(v.id, { bewirtschaftungskostenProzent: n })} max={100} einheit="%" />
            <ProzentFeld label="Mietsteigerung p. a." wert={v.dynamik ?? 0.015}
              onChange={(n) => vertragAendern(v.id, { dynamik: n })} />
          </>
        )}

        {v.typ === 'etf' && (
          <>
            <ZahlFeld label="Depotwert heute" wert={v.kapitalHeute ?? 0}
              onChange={(n) => vertragAendern(v.id, { kapitalHeute: n })} einheit="€" />
            <ZahlFeld label="Sparrate monatlich" wert={v.sparrate ?? 0}
              onChange={(n) => vertragAendern(v.id, { sparrate: n })} einheit="€" />
            <ProzentFeld label="Rendite Ansparphase" wert={v.renditeAnsparphase ?? 0.06}
              onChange={(n) => vertragAendern(v.id, { renditeAnsparphase: n })} />
            <ProzentFeld label="Rendite Entnahmephase" wert={v.renditeEntnahme ?? 0.02}
              onChange={(n) => vertragAendern(v.id, { renditeEntnahme: n })}
              hilfe="In der Entnahmephase wird meist vorsichtiger angelegt." />
            <ProzentFeld label="Ausgabeaufschlag" wert={v.ausgabeaufschlag ?? 0}
              onChange={(n) => vertragAendern(v.id, { ausgabeaufschlag: n })} max={10} />
            <ProzentFeld label="Laufende Kosten (TER)" wert={v.ter ?? 0.002}
              onChange={(n) => vertragAendern(v.id, { ter: n })} max={5} />
            <ZahlFeld label="Entnahmedauer" wert={v.entnahmedauer ?? 25}
              onChange={(n) => vertragAendern(v.id, { entnahmedauer: n })} min={1} max={60} einheit="Jahre" />
            <ProzentFeld label="Teilfreistellung" wert={v.teilfreistellung ?? 0.3}
              onChange={(n) => vertragAendern(v.id, { teilfreistellung: n })} max={80}
              hilfe="Aktienfonds 30 %, Mischfonds 15 %, Rentenfonds 0 %." />
          </>
        )}

        {v.typ === 'avd' && (
          <>
            <ZahlFeld label="Beitrag monatlich" wert={v.monatsbeitrag ?? 0}
              onChange={(n) => vertragAendern(v.id, { monatsbeitrag: n })} einheit="€"
              hilfe="Ab 120 € im Jahr (10 € im Monat) gibt es Zulagen, ab 150 € im Monat die volle Grundzulage." />
            <ProzentFeld label="Beitragsdynamik p. a." wert={v.dynamik ?? 0}
              onChange={(n) => vertragAendern(v.id, { dynamik: n })} />
            <ZahlFeld label="Bereits vorhandenes Kapital" wert={v.kapitalHeute ?? 0}
              onChange={(n) => vertragAendern(v.id, { kapitalHeute: n })} einheit="€" />
            <ProzentFeld label="Rendite Ansparphase" wert={v.renditeAnsparphase ?? 0.06}
              onChange={(n) => vertragAendern(v.id, { renditeAnsparphase: n })} />
            <ProzentFeld label="Rendite Auszahlphase" wert={v.renditeEntnahme ?? 0.02}
              onChange={(n) => vertragAendern(v.id, { renditeEntnahme: n })} />
            <ProzentFeld label="Laufende Kosten (TER)" wert={v.ter ?? 0.002}
              onChange={(n) => vertragAendern(v.id, { ter: n })} max={5} />
            <ZahlFeld label="Auszahlungsdauer" wert={v.entnahmedauer ?? 25}
              onChange={(n) => vertragAendern(v.id, { entnahmedauer: n })} min={1} max={60} einheit="Jahre"
              hilfe="Ein Auszahlplan muss mindestens bis zum 85. Lebensjahr laufen." />

            {/*
              Ohne dieses Feld war die Kinderzulage hier stillschweigend null:
              Sie haengt an den Kindern, und die wurden beim Vertrag nirgends
              abgefragt. Erfasst werden sie am HAUSHALT — dieselbe Quelle, aus
              der auch der Vertrags-TUEV und die Zeitachse rechnen. Zwei
              Listen fuer dieselben Kinder waeren zwei Wahrheiten.
            */}
            <div className="ui-innen p-3 sm:col-span-2 sm:p-4">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-xs font-medium text-ui-tinte">
                  Kinder — für die Kinderzulage
                </span>
                <span className="text-xs text-ui-schiefer">Aus Ihren Basisdaten</span>
              </div>
              <ZahlFeld
                label="Kinder mit Kindergeldanspruch"
                wert={haushaltsKinder.length}
                onChange={setzeKinderAnzahl}
                max={15}
                hilfe="Je Kind ein Euro für jeden eigenen Euro, höchstens 300 € im Jahr."
              />
              <KinderZeilen
                kinder={haushaltsKinder}
                onKind={setzeKind}
                a={avdParam}
                jetzt={jetzt}
              />
              <KinderHinweis a={avdParam} />
              <p className="mt-1 text-xs leading-relaxed text-ui-schiefer">
                Die Kinder gehören zum Haushalt, nicht zum Vertrag — Änderungen hier gelten auch
                in den Basisdaten und im Vertrags-TÜV.
              </p>
            </div>
          </>
        )}

        {v.typ === 'prvRente' && (v.kapitalAlternative ?? 0) > 0 && (
          <>
            <ZahlFeld label="Vertragsbeginn (Jahr)" wert={v.beginnJahr ?? 2010}
              onChange={(n) => vertragAendern(v.id, { beginnJahr: n })} min={1900} max={2200} />
            <ZahlFeld label="Beitrag monatlich" wert={v.monatsbeitrag ?? 0}
              onChange={(n) => vertragAendern(v.id, { monatsbeitrag: n })} einheit="€"
              hilfe="Für die Ermittlung des steuerpflichtigen Ertrags." />
            {/*
              VERTRAGSENDE. Laeuft der Vertrag vor dem Ruhestand ab, fliesst
              das Geld frueher — und wird frueher besteuert. Bis hierher lag
              die Auszahlung immer auf dem Rentenbeginn; die 12/62-Regel des
              § 20 Abs. 1 Nr. 6 EStG wurde damit an einem Alter geprueft, das
              der Vertrag nie erreicht.
            */}
            <ZahlFeld label="Vertragsende (Jahr)"
              wert={v.ablaufJahr ?? rentenbeginnJahr}
              onChange={(n) => vertragAendern(v.id, { ablaufJahr: n })}
              min={1900} max={2200}
              hilfe="Leer lassen heißt: läuft bis zum Rentenbeginn." />
            {(v.ablaufJahr ?? rentenbeginnJahr) < rentenbeginnJahr && (
              <ProzentFeld label="Kapital wächst bis zur Rente mit"
                wert={v.wachstumBisRente ?? 0}
                onChange={(n) => vertragAendern(v.id, { wachstumBisRente: n })}
                max={15}
                hilfe="Der Vertrag ist dann beendet — der Zuwachs trägt Abgeltungsteuer." />
            )}
          </>
        )}

        <AuswahlFeld label="Auszahlungsstrategie" wert={v.strategie}
          onChange={(st) => vertragAendern(v.id, { strategie: st })}
          optionen={STRATEGIEN[strategieGruppe(v.typ)]} />

        {/*
          Ohne diese beiden Felder gab es fuer eine Kapitalauszahlung keinen
          Verrentungsweg: der gesamte Betrag wurde als Einkommen EINES Jahres
          gebucht, und aus 300.000 € Kapital wurden 25.000 € "Rente im Monat".
        */}
        {v.strategie === 'verrenten' && (
          <>
            <ZahlFeld label="Verrentungsdauer" wert={v.entnahmedauer ?? VERRENTUNG_JAHRE}
              onChange={(n) => vertragAendern(v.id, { entnahmedauer: n })}
              min={1} max={60} einheit="Jahre"
              hilfe="Über wie viele Jahre das ausgezahlte Kapital verbraucht wird." />
            <ProzentFeld label="Rendite in der Auszahlphase"
              wert={v.renditeEntnahme ?? VERRENTUNG_RENDITE}
              onChange={(n) => vertragAendern(v.id, { renditeEntnahme: n })}
              hilfe="Das noch nicht verbrauchte Kapital wird weiter angelegt." />
          </>
        )}
      </div>

      {(v.typ === 'bav' || v.typ === 'prvRente') && (
        <div className="mt-3">
          <Schalter label="Vertrag vor 2005 abgeschlossen (Steuerprivileg)"
            wert={v.altvertrag} onChange={(b) => vertragAendern(v.id, { altvertrag: b })} />
        </div>
      )}

      {/*
        Die Steuer auf die Kapitalleistung faellt IM ZUFLUSSJAHR an und in
        voller Hoehe (§ 22 Nr. 5 EStG bzw. § 20 Abs. 1 Nr. 6 EStG). Sie ist
        der Grund, warum aus dem Kapital eine deutlich kleinere Monatsrente
        wird — und muss deshalb sichtbar sein, nicht im Ergebnis verschwinden.
      */}
      {v.strategie === 'verrenten' && verrentung && (
        <div className="ui-innen mt-3 px-3 py-2.5">
          <Wert etikett={`Verrentung über ${verrentung.dauerJahre} Jahre ab ${verrentung.startjahr}`}>
            {euro(verrentung.bruttoMonat)} <span className="text-xs font-normal text-ui-schiefer">brutto / Monat</span>
          </Wert>
          <div className="mt-1 text-xs leading-relaxed text-ui-schiefer">
            Kapital {euro(verrentung.bruttoKapital)} − Steuer im Auszahlungsjahr{' '}
            {euro(verrentung.steuerEinmal)} = {euro(verrentung.nettoKapital)}, verteilt auf{' '}
            {verrentung.dauerJahre} Jahre.
          </div>
        </div>
      )}

      {istKapital(v) && v.strategie === 'kapital' && auszahlung && (
        /*
          EINE Zahl, und darunter ihre Herleitung. Steuer und Beitraege gehen
          beim Zufluss ab; die Verteilung der Bemessung auf 120 Monate
          (§ 229 SGB V) ist eine Rechengroesse, kein Zahlungsweg.
        */
        <div className="ui-innen mt-3 px-3 py-2.5">
          <Wert etikett={`Einmalige Kapitalauszahlung ${auszahlung.jahr}`}>
            {euro(auszahlung.nettoKapital)} netto
          </Wert>
          <div className="mt-1 text-xs leading-relaxed text-ui-schiefer">
            Brutto {euro(auszahlung.bruttoKapital)} − Steuer {euro(auszahlung.steuer)}
            {auszahlung.kvPvGesamt > 0
              && ` − ${euro(auszahlung.kvPvGesamt)} Kranken- und Pflegeversicherung`}.
            Zählt nicht zum monatlichen Netto.
          </div>
        </div>
      )}

      {v.typ === 'etf' && v.strategie === 'kapital' && auszahlung && (
        <div className="ui-innen mt-3 px-3 py-2.5">
          <Wert etikett={`Einmalige Kapitalauszahlung ${auszahlung.jahr}`}>
            {euro(auszahlung.nettoKapital)} netto
          </Wert>
          <div className="mt-1 text-xs text-ui-schiefer">
            Brutto {euro(auszahlung.bruttoKapital)} − Abgeltungsteuer {euro(auszahlung.steuer)}.
            Zählt nicht zum monatlichen Netto.
          </div>
        </div>
      )}

      {v.typ === 'etf' && v.strategie !== 'kapital' && depot && depot.endkapital > 0 && (
        <div className="ui-innen mt-3 grid grid-cols-2 gap-3 px-3 py-2.5">
          <Wert etikett="Depotwert bei Rentenbeginn">{euro(depot.endkapital)}</Wert>
          <Wert etikett="Entnahme brutto">
            {euro(depot.bruttoMonat)} <span className="text-xs font-normal text-ui-schiefer">/ Monat</span>
          </Wert>
        </div>
      )}

      {v.typ === 'avd' && avd && avd.endkapital > 0 && (
        <div className="ui-innen mt-3 px-3 py-2.5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Wert etikett="Zulagen im 1. Jahr">{euro(avd.grundzulageJahr1 + avd.kinderzulageJahr1)}</Wert>
            <Wert etikett="Zulagen gesamt">{euro(avd.zulagenGesamt)}</Wert>
            <Wert etikett="Kapital bei Rentenbeginn">{euro(avd.endkapital)}</Wert>
            <Wert etikett="Auszahlung brutto">
              {euro(avd.bruttoJahr / 12)} <span className="text-xs font-normal text-ui-schiefer">/ Monat</span>
            </Wert>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-ui-schiefer">
            Eigenbeitrag {euro(avd.eigenbeitraege)} über die Laufzeit, dazu {euro(avd.zulagenGesamt)} Zulagen
            vom Staat. Die Auszahlung ist voll mit Ihrem persönlichen Steuersatz zu versteuern —
            nicht mit der Abgeltungsteuer.
          </p>
          {/* Die Hinweise des Rechenkerns als Liste mit Gedankenstrich — lesen, nicht erschrecken. */}
          {avd.hinweise.length > 0 && (
            <ul className="mt-2 space-y-1 border-t border-ui-linie pt-2 text-xs leading-relaxed text-ui-tinte">
              {avd.hinweise.map((h) => (
                <li key={h} className="flex gap-2"><span aria-hidden className="text-ui-asche">—</span><span>{h}</span></li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/*
        JE SCHICHT EIN ANDERER HINWEIS. Hier stand einer fuer alle, und der
        beschrieb die Betriebsrente: voll steuerpflichtig nach § 22 Nr. 5 EStG
        und Beitraege ueber 120 Monate. Bei einer privaten Rentenversicherung
        der Schicht 3 ist beides falsch — steuerpflichtig ist nur der ERTRAG,
        und Beitraege fallen gar nicht an. Sie ist kein Versorgungsbezug; die
        Zeitachse setzt dort folgerichtig `kvArt: null`.
      */}
      {istKapital(v) && !v.altvertrag && (
        <p className="ui-innen mt-3 px-3 py-2.5 text-xs leading-relaxed text-ui-schiefer [&_strong]:font-medium [&_strong]:text-ui-tinte">
          {v.typ === 'prvRente' ? (
            <>
              Steuerpflichtig ist nicht die Auszahlung, sondern nur der <strong>Ertrag</strong> —
              die Auszahlung abzüglich Ihrer eingezahlten Beiträge (§ 20 Abs. 1 Nr. 6 EStG).
              Läuft der Vertrag mindestens <strong>12 Jahre</strong> und wird nach dem{' '}
              <strong>62. Lebensjahr</strong> ausgezahlt (bei Abschluss bis 2011: nach dem 60.),
              zählt davon nur die <strong>Hälfte</strong>, versteuert mit Ihrem persönlichen Satz.
              Wird eine der beiden Bedingungen verfehlt, ist der ganze Ertrag steuerpflichtig.
              Kranken- und Pflegeversicherungsbeiträge fallen <strong>nicht</strong> an — anders
              als bei einer Betriebsrente.
            </>
          ) : (
            <>
              Kapitalauszahlungen aus Direktversicherung, Pensionskasse und Pensionsfonds sind im
              Zuflussjahr <strong>voll steuerpflichtig</strong> (§ 22 Nr. 5 EStG). Die
              Fünftelregelung wird dafür nach ständiger BFH-Rechtsprechung regelmäßig nicht
              gewährt. Zusätzlich fallen über 120 Monate volle KV/PV-Beiträge auf je 1/120 des
              Betrags an.
            </>
          )}
        </p>
      )}
      </div>
    </div>
  );
}

export interface DepotAnzeige { vertragId: string; endkapital: number; bruttoMonat: number }
export interface AuszahlungAnzeige {
  vertragId: string; jahr: number; bruttoKapital: number; steuer: number; nettoKapital: number;
  /** Beitraege auf die Kapitalleistung ueber 120 Monate (§ 229 SGB V); beim Depot 0 */
  kvPvGesamt: number;
}

export function Vertraege({
  schicht, depots = [], auszahlungen = [], avdLaeufe = [], verrentungen = [],
}: {
  schicht: 1 | 2 | 3;
  depots?: DepotAnzeige[];
  auszahlungen?: AuszahlungAnzeige[];
  avdLaeufe?: readonly AvdLauf[];
  verrentungen?: readonly KapitalVerrentung[];
}) {
  // WICHTIG: Im Selektor darf nicht gefiltert werden. filter() liefert bei
  // jedem Aufruf ein NEUES Array; zustand vergleicht mit Object.is, haelt es
  // deshalb fuer eine Aenderung und rendert endlos neu (React-Fehler #185).
  // Deshalb die unveraenderte Liste abonnieren und erst hier filtern.
  const alle = useSzenario((x) => x.szenario.vertraege);
  const vertraege = useMemo(() => alle.filter((v) => v.schicht === schicht), [alle, schicht]);
  const vertragHinzufuegen = useSzenario((x) => x.vertragHinzufuegen);

  return (
    <Abschnitt titel={SCHICHT_TITEL[schicht]}>
      <div className="space-y-3">
        {vertraege.length === 0 && (
          <p className="rounded-[10px] border border-dashed border-ui-feld-rand px-4 py-6 text-center text-sm text-ui-schiefer">
            Noch kein Vertrag in dieser Schicht.
          </p>
        )}
        {vertraege.map((v) => (
          <VertragsKarte
            key={v.id}
            v={v}
            depot={depots.find((d) => d.vertragId === v.id)}
            auszahlung={auszahlungen.find((a) => a.vertragId === v.id)}
            avd={avdLaeufe.find((a) => a.vertragId === v.id)}
            verrentung={verrentungen.find((x) => x.vertragId === v.id)}
          />
        ))}
        {/* Wie „Kind hinzufügen“ in der Beratung: der zweite Knopf mit Plus. */}
        <button type="button" onClick={() => vertragHinzufuegen(schicht)} className={KNOPF_ZWEIT}>
          <Plus className="h-4 w-4" aria-hidden /> Vertrag hinzufügen
        </button>
      </div>
    </Abschnitt>
  );
}
