import { useMemo, useState } from 'react';
import { Trash2, PlusCircle, ChevronDown } from 'lucide-react';
import {
  parameterFuer,
  type Vertrag, type VertragsTyp, type AvdLauf, type KapitalVerrentung,
} from '@renten/engine';
import { useSzenario } from '../store/szenario';
import { ZahlFeld, ProzentFeld, TextFeld, AuswahlFeld, Schalter, Abschnitt, euro } from '../components/Feld';
import { KinderZeilen, KinderHinweis } from '../components/KinderFelder';
import {
  TYPEN, SCHICHT_TITEL, STRATEGIEN, istKapital, strategieGruppe, typText,
  VERRENTUNG_JAHRE, VERRENTUNG_RENDITE,
} from './vertragsarten';
import { personNameAus } from './personen';

/**
 * Die eine Zahl, die eine zugeklappte Karte kenntlich macht.
 *
 * Welches Feld sie traegt, haengt an der Vertragsart: laufende Renten stehen
 * in `brutto`, Sparvertraege in `monatsbeitrag` oder `sparrate`. Eine Karte
 * ohne Zahl waere nicht wiederzuerkennen.
 */
function kopfBetrag(v: Vertrag): string | null {
  if (istKapital(v.typ) && v.brutto) return `${euro(v.brutto)} Kapital`;
  if (v.brutto) return `${euro(v.brutto)} im Monat`;
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
      Weiss auf getoentem Grund, nicht umgekehrt. Die Karte steht in der
      Eingabespalte, die seit der Farbtrennung indigo hinterlegt ist — und
      IN dieser Karte ist Indigo bereits die Ergebnisfarbe (Depotwert,
      AVD-Werte, Kinder-Block weiter unten). Bliebe die Karte getoent,
      verschwaenden genau diese Bloecke im Untergrund.
    */
    <div className="rounded-lg border border-indigo-100 bg-white">
      <div className="flex items-center gap-1 p-2 sm:p-3">
        <button
          type="button"
          onClick={() => setOffen((x) => !x)}
          aria-expanded={offen}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-slate-50"
        >
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${offen ? 'rotate-180' : ''}`}
            aria-hidden
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-slate-800">
              {v.name || 'Ohne Bezeichnung'}
            </span>
            <span className="block truncate text-[11px] text-slate-500">{typText(v.typ)}</span>
          </span>
          {betrag && (
            <span className="shrink-0 whitespace-nowrap text-xs font-bold tabular-nums text-slate-700">
              {betrag}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => vertragEntfernen(v.id)}
          aria-label={`Vertrag ${v.name || 'ohne Namen'} entfernen`}
          className="shrink-0 rounded-md p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className={`border-t border-indigo-100 p-3 ${offen ? 'block' : 'hidden'}`}>
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
            label={istKapital(v.typ) ? 'Kapitalauszahlung (brutto)' : v.typ === 'immobilie' ? 'Kaltmiete monatlich' : 'Rente monatlich (brutto)'}
            wert={v.brutto} onChange={(n) => vertragAendern(v.id, { brutto: n })} einheit="€" />
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
            <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-2.5 sm:col-span-2">
              <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-800">
                  Kinder — für die Kinderzulage
                </span>
                <span className="text-[10px] text-indigo-700">Aus Ihren Basisdaten</span>
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
              <p className="mt-1 text-[10px] leading-relaxed text-indigo-800">
                Die Kinder gehören zum Haushalt, nicht zum Vertrag — Änderungen hier gelten auch
                in den Basisdaten und im Vertrags-TÜV.
              </p>
            </div>
          </>
        )}

        {v.typ === 'prvKapital' && (
          <>
            <ZahlFeld label="Vertragsbeginn (Jahr)" wert={v.beginnJahr ?? 2010}
              onChange={(n) => vertragAendern(v.id, { beginnJahr: n })} min={1900} max={2200} />
            <ZahlFeld label="Beitrag monatlich" wert={v.monatsbeitrag ?? 0}
              onChange={(n) => vertragAendern(v.id, { monatsbeitrag: n })} einheit="€"
              hilfe="Für die Ermittlung des steuerpflichtigen Ertrags." />
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
        {istKapital(v.typ) && v.strategie === 'rente' && (
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

      {(v.typ === 'bav' || v.typ === 'bavKapital' || v.typ === 'prvRente' || v.typ === 'prvKapital') && (
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
      {istKapital(v.typ) && v.strategie === 'rente' && verrentung && (
        <div className="mt-3 rounded-md border border-emerald-100 bg-emerald-50/60 px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Verrentung über {verrentung.dauerJahre} Jahre ab {verrentung.startjahr}
          </div>
          <div className="text-sm font-black tabular-nums text-emerald-800">
            {euro(verrentung.bruttoMonat)} <span className="text-xs font-normal">brutto / Monat</span>
          </div>
          <div className="mt-0.5 text-[10px] leading-relaxed text-slate-500">
            Kapital {euro(verrentung.bruttoKapital)} − Steuer im Auszahlungsjahr{' '}
            {euro(verrentung.steuerEinmal)} = {euro(verrentung.nettoKapital)}, verteilt auf{' '}
            {verrentung.dauerJahre} Jahre.
          </div>
        </div>
      )}

      {istKapital(v.typ) && v.strategie === 'kapital' && auszahlung && (
        /*
          EINE Zahl, und darunter ihre Herleitung. Steuer und Beitraege gehen
          beim Zufluss ab; die Verteilung der Bemessung auf 120 Monate
          (§ 229 SGB V) ist eine Rechengroesse, kein Zahlungsweg.
        */
        <div className="mt-3 rounded-md border border-indigo-100 bg-indigo-50/60 px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Einmalige Kapitalauszahlung {auszahlung.jahr}
          </div>
          <div className="text-sm font-black tabular-nums text-indigo-900">
            {euro(auszahlung.nettoKapital)} netto
          </div>
          <div className="mt-0.5 text-[10px] leading-relaxed text-slate-500">
            Brutto {euro(auszahlung.bruttoKapital)} − Steuer {euro(auszahlung.steuer)}
            {auszahlung.kvPvGesamt > 0
              && ` − ${euro(auszahlung.kvPvGesamt)} Kranken- und Pflegeversicherung`}.
            Zählt nicht zum monatlichen Netto.
          </div>
        </div>
      )}

      {v.typ === 'etf' && v.strategie === 'kapital' && auszahlung && (
        <div className="mt-3 rounded-md border border-indigo-100 bg-indigo-50/60 px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Einmalige Kapitalauszahlung {auszahlung.jahr}
          </div>
          <div className="text-sm font-black tabular-nums text-indigo-900">
            {euro(auszahlung.nettoKapital)} netto
          </div>
          <div className="mt-0.5 text-[10px] text-slate-500">
            Brutto {euro(auszahlung.bruttoKapital)} − Abgeltungsteuer {euro(auszahlung.steuer)}.
            Zählt nicht zum monatlichen Netto.
          </div>
        </div>
      )}

      {v.typ === 'etf' && v.strategie !== 'kapital' && depot && depot.endkapital > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-3 rounded-md border border-emerald-100 bg-emerald-50/60 px-3 py-2">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Depotwert bei Rentenbeginn
            </div>
            <div className="text-sm font-black tabular-nums text-emerald-800">
              {euro(depot.endkapital)}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Entnahme brutto
            </div>
            <div className="text-sm font-black tabular-nums text-emerald-800">
              {euro(depot.bruttoMonat)} <span className="text-xs font-normal">/ Monat</span>
            </div>
          </div>
        </div>
      )}

      {v.typ === 'avd' && avd && avd.endkapital > 0 && (
        <div className="mt-3 rounded-md border border-emerald-100 bg-emerald-50/60 px-3 py-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Zulagen im 1. Jahr</div>
              <div className="text-sm font-black tabular-nums text-emerald-800">
                {euro(avd.grundzulageJahr1 + avd.kinderzulageJahr1)}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Zulagen gesamt</div>
              <div className="text-sm font-black tabular-nums text-emerald-800">{euro(avd.zulagenGesamt)}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Kapital bei Rentenbeginn</div>
              <div className="text-sm font-black tabular-nums text-emerald-800">{euro(avd.endkapital)}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Auszahlung brutto</div>
              <div className="text-sm font-black tabular-nums text-emerald-800">
                {euro(avd.bruttoJahr / 12)} <span className="text-xs font-normal">/ Monat</span>
              </div>
            </div>
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
            Eigenbeitrag {euro(avd.eigenbeitraege)} über die Laufzeit, dazu {euro(avd.zulagenGesamt)} Zulagen
            vom Staat. Die Auszahlung ist voll mit Ihrem persönlichen Steuersatz zu versteuern —
            nicht mit der Abgeltungsteuer.
          </p>
          {avd.hinweise.map((h) => (
            <p key={h} className="mt-2 rounded bg-amber-50 px-2 py-1 text-[10px] text-amber-900">{h}</p>
          ))}
        </div>
      )}

      {v.typ === 'bavKapital' && !v.altvertrag && (
        <p className="mt-3 rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-600">
          Kapitalauszahlungen aus Direktversicherung, Pensionskasse und Pensionsfonds sind im
          Zuflussjahr <strong>voll steuerpflichtig</strong> (§ 22 Nr. 5 EStG). Die Fünftelregelung
          wird dafür nach ständiger BFH-Rechtsprechung regelmäßig nicht gewährt. Zusätzlich fallen
          über 120 Monate volle KV/PV-Beiträge auf je 1/120 des Betrags an.
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
          <p className="rounded-lg border border-dashed border-indigo-300 px-4 py-6 text-center text-sm text-slate-500">
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
        <button
          type="button"
          onClick={() => vertragHinzufuegen(schicht)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-indigo-300 bg-white/60 py-2 text-sm font-medium text-slate-600 hover:border-indigo-500 hover:text-indigo-700"
        >
          <PlusCircle className="h-4 w-4" aria-hidden /> Vertrag hinzufügen
        </button>
      </div>
    </Abschnitt>
  );
}
