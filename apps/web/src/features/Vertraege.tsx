import { Trash2, PlusCircle } from 'lucide-react';
import type { Vertrag, VertragsTyp } from '@renten/engine';
import { useSzenario } from '../store/szenario';
import { ZahlFeld, ProzentFeld, TextFeld, AuswahlFeld, Schalter, Karte } from '../components/Feld';

const TYPEN: Record<1 | 2 | 3, { wert: VertragsTyp; text: string }[]> = {
  1: [{ wert: 'basis', text: 'Rürup / Basisrente' }],
  2: [
    { wert: 'bav', text: 'bAV (laufende Rente)' },
    { wert: 'bavUkasse', text: 'Unterstützungskasse / Direktzusage' },
    { wert: 'bavKapital', text: 'bAV (Kapitalauszahlung)' },
    { wert: 'riester', text: 'Riester-Rente' },
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

function VertragsKarte({ v }: { v: Vertrag }) {
  const { vertragAendern, vertragEntfernen } = useSzenario();
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

        {v.typ !== 'etf' && (
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
            <ProzentFeld label="Laufende Kosten (TER)" wert={v.ter ?? 0.002}
              onChange={(n) => vertragAendern(v.id, { ter: n })} max={5} />
            <ZahlFeld label="Entnahmedauer" wert={v.entnahmedauer ?? 25}
              onChange={(n) => vertragAendern(v.id, { entnahmedauer: n })} min={1} max={60} einheit="Jahre" />
            <ProzentFeld label="Teilfreistellung" wert={v.teilfreistellung ?? 0.3}
              onChange={(n) => vertragAendern(v.id, { teilfreistellung: n })} max={80}
              hilfe="Aktienfonds 30 %, Mischfonds 15 %, Rentenfonds 0 %." />
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
          optionen={[
            { wert: 'rente', text: 'Als laufende Rente ins Netto' },
            { wert: 'planer', text: 'Kapital in den Entnahmeplaner' },
            { wert: 'ignorieren', text: 'Nicht einrechnen' },
          ]} />
      </div>

      {(v.typ === 'bav' || v.typ === 'bavKapital' || v.typ === 'prvRente' || v.typ === 'prvKapital') && (
        <div className="mt-3">
          <Schalter label="Vertrag vor 2005 abgeschlossen (Steuerprivileg)"
            wert={v.altvertrag} onChange={(b) => vertragAendern(v.id, { altvertrag: b })} />
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

export function Vertraege({ schicht }: { schicht: 1 | 2 | 3 }) {
  const vertraege = useSzenario((x) => x.szenario.vertraege.filter((v) => v.schicht === schicht));
  const { vertragHinzufuegen } = useSzenario();

  return (
    <Karte titel={SCHICHT_TITEL[schicht]}>
      <div className="space-y-3">
        {vertraege.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
            Noch kein Vertrag in dieser Schicht.
          </p>
        )}
        {vertraege.map((v) => <VertragsKarte key={v.id} v={v} />)}
        <button
          type="button"
          onClick={() => vertragHinzufuegen(schicht)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 py-2 text-sm font-medium text-slate-600 hover:border-indigo-400 hover:text-indigo-700"
        >
          <PlusCircle className="h-4 w-4" aria-hidden /> Vertrag hinzufügen
        </button>
      </div>
    </Karte>
  );
}
