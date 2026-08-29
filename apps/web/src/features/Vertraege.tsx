import { useMemo } from 'react';
import { Trash2, PlusCircle } from 'lucide-react';
import type { Vertrag, VertragsTyp, AvdLauf } from '@renten/engine';
import { useSzenario } from '../store/szenario';
import { ZahlFeld, ProzentFeld, TextFeld, AuswahlFeld, Schalter, Abschnitt, euro } from '../components/Feld';

const TYPEN: Record<1 | 2 | 3, { wert: VertragsTyp; text: string }[]> = {
  1: [{ wert: 'basis', text: 'Rürup / Basisrente' }],
  2: [
    { wert: 'bav', text: 'bAV (laufende Rente)' },
    { wert: 'bavUkasse', text: 'Unterstützungskasse / Direktzusage' },
    { wert: 'bavKapital', text: 'bAV (Kapitalauszahlung)' },
    { wert: 'riester', text: 'Riester-Rente' },
    { wert: 'avd', text: 'Altersvorsorgedepot (ab 2027)' },
  ],
  3: [
    { wert: 'prvRente', text: 'Private Rente (monatlich)' },
    { wert: 'prvKapital', text: 'Private Rente (Kapitalwahl)' },
    { wert: 'immobilie', text: 'Vermietete Immobilie' },
    { wert: 'etf', text: 'Wertpapierdepot (ETF)' },
  ],
};

const SCHICHT_TITEL: Record<1 | 2 | 3, string> = {
  1: 'Schicht 1 — Basisversorgung',
  2: 'Schicht 2 — Betrieblich und gefördert',
  3: 'Schicht 3 — Privat',
};

function istKapital(t: VertragsTyp) { return t === 'bavKapital' || t === 'prvKapital'; }

/**
 * "Kapitalauszahlung" gibt es nur beim Depot. Bei Ruerup ist eine Kapitalwahl
 * gesetzlich ausgeschlossen (§ 10 EStG verlangt eine lebenslange Rente), bei
 * bAV und privater Rente gibt es dafuer eigene Vertragsarten.
 */
const STRATEGIEN: Record<'etf' | 'avd' | 'sonst', { wert: Vertrag['strategie']; text: string }[]> = {
  etf: [
    { wert: 'rente', text: 'Als laufende Rente ins Netto' },
    { wert: 'planer', text: 'Kapital in den Entnahmeplaner' },
    { wert: 'kapital', text: 'Kapitalauszahlung (einmalig)' },
  ],
  // Beim Altersvorsorgedepot schreibt das Gesetz die Auszahlung als
  // Leibrente oder Auszahlplan bis mindestens 85 vor. Eine freie
  // Kapitalentnahme steht deshalb bewusst nicht zur Wahl.
  avd: [
    { wert: 'rente', text: 'Als laufende Rente ins Netto' },
    { wert: 'ignorieren', text: 'Nicht einrechnen' },
  ],
  sonst: [
    { wert: 'rente', text: 'Als laufende Rente ins Netto' },
    { wert: 'planer', text: 'Kapital in den Entnahmeplaner' },
    { wert: 'ignorieren', text: 'Nicht einrechnen' },
  ],
};

function VertragsKarte({ v, depot, auszahlung, avd }: {
  v: Vertrag; depot?: DepotAnzeige; auszahlung?: AuszahlungAnzeige; avd?: AvdLauf;
}) {
  const vertragAendern = useSzenario((x) => x.vertragAendern);
  const vertragEntfernen = useSzenario((x) => x.vertragEntfernen);
  const verheiratet = useSzenario((x) => x.szenario.haushalt.verheiratet);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          <AuswahlFeld label="Vertragsart" wert={v.typ}
            onChange={(t) => vertragAendern(v.id, { typ: t })}
            optionen={TYPEN[v.schicht]} />
          <TextFeld label="Bezeichnung" wert={v.name}
            onChange={(n) => vertragAendern(v.id, { name: n })} platzhalter="z. B. Allianz" />
        </div>
        <button
          type="button"
          onClick={() => vertragEntfernen(v.id)}
          aria-label={`Vertrag ${v.name || 'ohne Namen'} entfernen`}
          className="mt-5 rounded-md p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {verheiratet && (
          <AuswahlFeld label="Inhaber" wert={v.inhaber}
            onChange={(i) => vertragAendern(v.id, { inhaber: i })}
            optionen={[{ wert: 'A', text: 'Person A' }, { wert: 'B', text: 'Person B' }]} />
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
          optionen={STRATEGIEN[v.typ === 'etf' ? 'etf' : v.typ === 'avd' ? 'avd' : 'sonst']} />
      </div>

      {(v.typ === 'bav' || v.typ === 'bavKapital' || v.typ === 'prvRente' || v.typ === 'prvKapital') && (
        <div className="mt-3">
          <Schalter label="Vertrag vor 2005 abgeschlossen (Steuerprivileg)"
            wert={v.altvertrag} onChange={(b) => vertragAendern(v.id, { altvertrag: b })} />
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
  );
}

export interface DepotAnzeige { vertragId: string; endkapital: number; bruttoMonat: number }
export interface AuszahlungAnzeige {
  vertragId: string; jahr: number; bruttoKapital: number; steuer: number; nettoKapital: number;
}

export function Vertraege({
  schicht, depots = [], auszahlungen = [], avdLaeufe = [],
}: {
  schicht: 1 | 2 | 3;
  depots?: DepotAnzeige[];
  auszahlungen?: AuszahlungAnzeige[];
  avdLaeufe?: readonly AvdLauf[];
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
          <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
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
          />
        ))}
        <button
          type="button"
          onClick={() => vertragHinzufuegen(schicht)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 py-2 text-sm font-medium text-slate-600 hover:border-indigo-400 hover:text-indigo-700"
        >
          <PlusCircle className="h-4 w-4" aria-hidden /> Vertrag hinzufügen
        </button>
      </div>
    </Abschnitt>
  );
}
