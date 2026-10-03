import { useMemo } from 'react';
import { FilePlus2, Scale, Trash2, Trophy } from 'lucide-react';
import { loesungsvergleich, type Jahreszeile, type Loesung, type LoesungId } from '@renten/engine';
import { useSzenario, type SzenarioParsed } from '../store/szenario';
import {
  ZahlFeld, ProzentFeld, TextFeld, AuswahlFeld, euro, euroGenau, prozent, InfoPunkt, TON,
} from '../components/Feld';
import { foerderBasis, angebotPositionen } from './tuev-berechnung';
import { personNameAus } from './personen';

/**
 * LOESUNGEN — die letzte Etappe der Beratung.
 *
 * Oben: Was wird aus einem Netto-Betrag in jeder Schicht? Je Loesung der
 * Beitrag, der nach Steuer- und Abgabenersparnis genau diesen Betrag kostet,
 * und was am Ende im Vertrag landet (`loesungsvergleich` im Rechenkern).
 *
 * Unten: die Angebote. Mit den Beitraegen von oben holt man Angebote ein,
 * traegt die Rente ein, die der Anbieter nennt, und sieht, welches netto am
 * meisten bringt — gerechnet wie ein Vertrag im Vertrags-TUEV, mit der
 * Steuer und Krankenversicherung im Alter.
 */

const FARBE: Record<1 | 2 | 3, string> = {
  1: 'bg-blue-100 text-blue-700',
  2: 'bg-purple-100 text-purple-700',
  3: 'bg-emerald-100 text-emerald-700',
};

const LOESUNG_TEXT: Record<LoesungId, string> = {
  avd: 'Altersvorsorgedepot',
  bav: 'Betriebsrente (Entgeltumwandlung)',
  basis: 'Basisrente (Rürup)',
  privat: 'Private Rente / Depot',
};

const zahl = (n: number, stellen = 2) =>
  n.toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen });

export function Loesungen({ zeile, szenario, sparrate }: {
  zeile: Jahreszeile | null;
  /** Das Szenario der Ansicht — in der Einzelbetrachtung nur eine Person */
  szenario: SzenarioParsed;
  /** Der Startbeitrag aus dem Sparrechner, falls es eine Luecke gibt */
  sparrate: number | null;
}) {
  const l = szenario.loesungen;
  const setzeLoesungen = useSzenario((x) => x.setzeLoesungen);
  const angebotHinzufuegen = useSzenario((x) => x.angebotHinzufuegen);

  const loesungen = useMemo(() => {
    const b = foerderBasis(szenario, zeile);
    return loesungsvergleich(b.kontext, b.steuerOpt, b.p, l.nettoMonat, { agZuschussQuote: l.agZuschussQuote });
  }, [szenario, zeile, l.nettoMonat, l.agZuschussQuote]);

  const verfuegbar = loesungen.filter((x) => x.verfuegbar && x.nettoMonat > 0);
  const besterHebel = verfuegbar.reduce((m, x) => Math.max(m, x.hebel), 0);
  const bavDa = loesungen.some((x) => x.id === 'bav' && x.verfuegbar);

  const erfassen = (x: Loesung) => angebotHinzufuegen({
    loesung: x.id,
    name: '',
    inhaber: 'A',
    beitragMonat: Math.round(x.eigenbeitragMonat),
    agZuschussMonat: Math.round(x.agZuschussMonat * 100) / 100,
    dynamik: 0,
    renteMonat: 0,
  });

  return (
    <div className="space-y-8 sm:space-y-10">
      <section aria-labelledby="loesungen-titel">
        <div className="mb-4 border-b-2 border-indigo-200 px-1 pb-3">
          <h3 id="loesungen-titel" className="flex items-center gap-2 text-base font-bold text-indigo-900 sm:text-xl">
            <Scale className="h-5 w-5 shrink-0 text-indigo-600 sm:h-6 sm:w-6" aria-hidden />
            Was wird aus {euro(l.nettoMonat)} netto im Monat?
          </h3>
          <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-slate-600 sm:text-sm">
            Je Schicht der Beitrag, der Sie nach Steuer- und Abgabenersparnis genau diesen Betrag kostet —
            und was dann im Vertrag landet: mit Zulagen, Arbeitgeberzuschuss und Ihrem persönlichen
            Steuersatz, nicht mit einem Durchschnitt.
          </p>
        </div>

        <div className={`mb-4 grid gap-3 rounded-xl border p-3 sm:grid-cols-3 sm:p-4 ${TON.eingabe}`}>
          <div>
            <ZahlFeld
              label="Netto-Aufwand im Monat"
              wert={l.nettoMonat}
              onChange={(n) => setzeLoesungen({ nettoMonat: n })}
              einheit="€"
              schritt={25}
              max={10_000}
              gross
            />
            {sparrate !== null && sparrate > 0.5 && Math.abs(sparrate - l.nettoMonat) > 0.5 && (
              <button
                type="button"
                onClick={() => setzeLoesungen({ nettoMonat: Math.round(sparrate) })}
                className="mt-1 text-xs font-bold text-indigo-700 hover:underline"
              >
                Sparrate aus dem Sparrechner übernehmen ({euro(sparrate)})
              </button>
            )}
          </div>
          {bavDa && (
            <ProzentFeld
              label="Arbeitgeberzuschuss zur bAV"
              wert={l.agZuschussQuote}
              onChange={(n) => setzeLoesungen({ agZuschussQuote: Math.max(0.15, n) })}
              min={15}
              max={100}
              hilfe="Mindestens die gesetzlichen 15 %. Bei einem Zuschussmodell etwa 50 %."
            />
          )}
          <ZahlFeld
            label="Lebenserwartung (für die Angebote)"
            wert={l.lebenserwartung}
            onChange={(n) => setzeLoesungen({ lebenserwartung: n })}
            min={60}
            max={120}
            einheit="J."
            stufen
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
          {loesungen.map((x) => (
            <LoesungsKarte
              key={x.id}
              x={x}
              bester={x.verfuegbar && x.nettoMonat > 0 && Math.abs(x.hebel - besterHebel) < 1e-6}
              onErfassen={() => erfassen(x)}
            />
          ))}
        </div>
        <p className="mt-3 px-1 text-[11px] leading-relaxed text-slate-500">
          Das ist die Einzahlseite. Was im Alter davon netto ankommt, hängt am Angebot — an der Rente,
          die der Anbieter nennt, und an Steuer und Krankenversicherung. Das rechnet der Vergleich darunter.
        </p>
      </section>

      <Angebote szenario={szenario} />
    </div>
  );
}

function LoesungsKarte({ x, bester, onErfassen }: { x: Loesung; bester: boolean; onErfassen: () => void }) {
  const zeilen: [string, number, string?][] = [
    ['Ihr Netto-Aufwand', x.nettoMonat],
    ...(x.steuerErsparnisMonat >= 0.5 ? [['+ Steuerersparnis', x.steuerErsparnisMonat, 'text-emerald-700'] as [string, number, string]] : []),
    ...(x.svErsparnisMonat >= 0.5 ? [['+ Sozialabgaben gespart', x.svErsparnisMonat, 'text-emerald-700'] as [string, number, string]] : []),
  ];
  const zusatz: [string, number][] = [
    ...(x.zulageMonat >= 0.5 ? [['+ Zulagen', x.zulageMonat] as [string, number]] : []),
    ...(x.agZuschussMonat >= 0.5 ? [['+ Arbeitgeberzuschuss', x.agZuschussMonat] as [string, number]] : []),
  ];
  return (
    <article
      className={`flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm ${
        bester ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-slate-200'
      } ${x.verfuegbar ? '' : 'opacity-70'}`}
    >
      <header className="flex items-start justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2.5">
        <div className="min-w-0">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${FARBE[x.schicht]}`}>
            Schicht {x.schicht}
          </span>
          <h4 className="mt-1 text-sm font-bold leading-snug text-slate-800">{x.titel}</h4>
        </div>
        {bester && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">
            <Trophy className="h-3 w-3" aria-hidden /> Meiste
          </span>
        )}
      </header>

      {x.verfuegbar ? (
        <div className="flex flex-1 flex-col p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Im Vertrag</span>
            <span className="text-2xl font-black tabular-nums text-indigo-800">{euroGenau(Math.round(x.vertragMonat * 100) / 100)}</span>
          </div>
          <p className="text-right text-xs font-bold text-emerald-700">
            {zahl(x.hebel)} × Ihr Netto-Aufwand
          </p>

          <dl className="mt-3 space-y-1 text-xs">
            {zeilen.map(([t, w, f]) => (
              <div key={t} className="flex justify-between gap-2">
                <dt className="text-slate-600">{t}</dt>
                <dd className={`tabular-nums ${f ?? 'text-slate-800'}`}>{euroGenau(Math.round(w * 100) / 100)}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-2 border-t border-slate-100 pt-1 font-bold">
              <dt className="text-slate-700">
                {x.id === 'bav' ? '= Bruttoumwandlung' : '= Ihr Beitrag'}
              </dt>
              <dd className="tabular-nums text-slate-900">{euroGenau(Math.round(x.eigenbeitragMonat * 100) / 100)}</dd>
            </div>
            {zusatz.map(([t, w]) => (
              <div key={t} className="flex justify-between gap-2">
                <dt className="text-slate-600">{t}</dt>
                <dd className="tabular-nums text-emerald-700">{euroGenau(Math.round(w * 100) / 100)}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            <strong className="text-slate-600">Im Alter:</strong> {x.besteuerung}
          </p>
          {x.hinweise.map((h) => (
            <p key={h} className={`mt-1.5 text-[11px] leading-relaxed ${x.begrenzt ? 'text-amber-800' : 'text-slate-500'}`}>{h}</p>
          ))}

          <div className="flex-1" />
          <button
            type="button"
            onClick={onErfassen}
            className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-800 hover:bg-indigo-100 print:hidden"
          >
            <FilePlus2 className="h-4 w-4" aria-hidden /> Angebot mit diesem Beitrag erfassen
          </button>
        </div>
      ) : (
        <div className="p-3 text-xs leading-relaxed text-slate-600">
          {x.hinweise.map((h) => <p key={h}>{h}</p>)}
        </div>
      )}
    </article>
  );
}

/* ---------------------------------------------------------------------- */

function Angebote({ szenario }: { szenario: SzenarioParsed }) {
  const angebote = szenario.loesungen.angebote;
  const angebotAendern = useSzenario((x) => x.angebotAendern);
  const angebotEntfernen = useSzenario((x) => x.angebotEntfernen);
  const angebotHinzufuegen = useSzenario((x) => x.angebotHinzufuegen);
  const paar = szenario.haushalt.verheiratet && szenario.personen.length > 1;

  const positionen = useMemo(() => angebotPositionen(szenario), [szenario]);
  const gerechnet = positionen.filter((x) => x.ergebnis !== null);
  const besteRendite = gerechnet.reduce((m, x) => Math.max(m, x.ergebnis!.rendite), -Infinity);

  return (
    <section aria-labelledby="angebote-titel">
      <div className="mb-4 flex flex-col items-start justify-between gap-3 border-b-2 border-indigo-200 px-1 pb-3 sm:flex-row sm:items-end">
        <div>
          <h3 id="angebote-titel" className="text-base font-bold text-indigo-900 sm:text-xl">Angebote vergleichen</h3>
          <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-slate-600 sm:text-sm">
            Holen Sie mit den Beiträgen oben Angebote ein und tragen Sie die Rente ein, die der Anbieter
            zum Rentenbeginn nennt. Gerechnet wird wie im Vertrags-TÜV: was das Angebot Sie netto kostet,
            gegen das, was im Alter nach Steuer und Krankenversicherung ankommt.
          </p>
        </div>
        {angebote.length < 12 && (
          <button
            type="button"
            onClick={() => angebotHinzufuegen({
              loesung: 'privat', name: '', inhaber: 'A', beitragMonat: 100, agZuschussMonat: 0, dynamik: 0, renteMonat: 0,
            })}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-indigo-300 bg-white px-3 py-2 text-xs font-bold text-indigo-800 hover:bg-indigo-50 print:hidden"
          >
            <FilePlus2 className="h-4 w-4" aria-hidden /> Leeres Angebot
          </button>
        )}
      </div>

      {angebote.length === 0 ? (
        <p className="rounded-xl border border-dashed border-indigo-300 bg-indigo-50/40 px-4 py-8 text-center text-sm text-indigo-900">
          Noch kein Angebot erfasst. Über „Angebot mit diesem Beitrag erfassen“ oben übernehmen Sie den
          Beitrag einer Lösung als Ausgangspunkt.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
            {positionen.map(({ angebot: a }, i) => (
              <article key={a.id} className={`rounded-xl border p-3 shadow-sm ${TON.eingabe}`}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-800">Angebot {i + 1}</span>
                  <button
                    type="button"
                    onClick={() => angebotEntfernen(a.id)}
                    aria-label={`Angebot ${i + 1} entfernen`}
                    className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 print:hidden"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
                <div className="grid gap-2.5">
                  <TextFeld
                    label="Anbieter / Tarif"
                    wert={a.name}
                    onChange={(v) => angebotAendern(a.id, { name: v })}
                    platzhalter={LOESUNG_TEXT[a.loesung]}
                  />
                  <div className={paar ? 'grid grid-cols-2 gap-2' : 'grid gap-2'}>
                    <AuswahlFeld
                      label="Lösung"
                      wert={a.loesung}
                      onChange={(v) => angebotAendern(a.id, { loesung: v })}
                      optionen={(Object.keys(LOESUNG_TEXT) as LoesungId[]).map((id) => ({ wert: id, text: LOESUNG_TEXT[id] }))}
                    />
                    {paar && (
                      <AuswahlFeld
                        label="Für"
                        wert={a.inhaber}
                        onChange={(v) => angebotAendern(a.id, { inhaber: v })}
                        optionen={szenario.personen.map((p) => ({ wert: p.id, text: personNameAus(szenario.personen, p.id) }))}
                      />
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <ZahlFeld
                      label={a.loesung === 'bav' ? 'Umwandlung brutto' : a.loesung === 'avd' ? 'Eigenbeitrag' : 'Beitrag'}
                      wert={a.beitragMonat}
                      onChange={(n) => angebotAendern(a.id, { beitragMonat: n })}
                      einheit="€"
                    />
                    {a.loesung === 'bav' ? (
                      <ZahlFeld
                        label="Arbeitgeber"
                        wert={a.agZuschussMonat}
                        onChange={(n) => angebotAendern(a.id, { agZuschussMonat: n })}
                        einheit="€"
                      />
                    ) : (
                      <ProzentFeld
                        label="Dynamik p. a."
                        wert={a.dynamik}
                        onChange={(n) => angebotAendern(a.id, { dynamik: n })}
                        max={10}
                      />
                    )}
                  </div>
                  {a.loesung === 'bav' && (
                    <ProzentFeld
                      label="Dynamik p. a."
                      wert={a.dynamik}
                      onChange={(n) => angebotAendern(a.id, { dynamik: n })}
                      max={10}
                    />
                  )}
                  <ZahlFeld
                    label="Rente laut Angebot (brutto, Monat)"
                    wert={a.renteMonat}
                    onChange={(n) => angebotAendern(a.id, { renteMonat: n })}
                    einheit="€"
                    hilfe="Garantiert oder prognostiziert — so, wie der Anbieter sie zum Rentenbeginn nennt."
                  />
                </div>
              </article>
            ))}
          </div>

          <AngebotsTabelle positionen={positionen} besteRendite={besteRendite} />
        </>
      )}
    </section>
  );
}

function AngebotsTabelle({ positionen, besteRendite }: {
  positionen: ReturnType<typeof angebotPositionen>;
  besteRendite: number;
}) {
  const zeilen: { text: string; info?: string; wert: (r: NonNullable<typeof positionen[number]['ergebnis']>) => string; stark?: boolean }[] = [
    { text: 'Kostet Sie netto im Monat', wert: (r) => euro(r.echterAufwandMonat) },
    { text: 'Fließt in den Vertrag', wert: (r) => euro(r.beitragMonat + r.zulageMonat) },
    { text: 'Rente brutto', wert: (r) => euro(r.bruttoRenteMonat) },
    { text: 'Rente netto', info: 'Nach Steuer und Kranken-/Pflegeversicherung im ersten Rentenjahr — anteilig an der Steuer des Haushalts, wie im Kassenbon.', wert: (r) => euro(r.nettoRenteMonat), stark: true },
    { text: 'Netto-Rente je 100 € Aufwand', wert: (r) => (r.echterAufwandMonat > 0 ? euroGenau(Math.round(r.nettoRenteMonat / r.echterAufwandMonat * 10_000) / 100) : '—') },
    { text: 'Netto-Hebel', info: 'Netto-Auszahlung über die Laufzeit je Euro Netto-Aufwand, ohne Verzinsung.', wert: (r) => `${zahl(r.nettoHebel)} ×` },
    { text: 'Nettorendite p. a.', info: 'Der interne Zinsfuß aller Netto-Zahlungen: Aufwand in der Ansparphase gegen Netto-Rente bis zur Lebenserwartung.', wert: (r) => prozent(r.rendite, 2), stark: true },
    { text: 'Amortisation ab Rentenbeginn', wert: (r) => `${r.amortisationsJahre.toLocaleString('de-DE', { maximumFractionDigits: 1 })} J.` },
  ];

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left">
              <th className="sticky left-0 bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Vergleich</th>
              {positionen.map(({ angebot: a, ergebnis: r }, i) => (
                <th key={a.id} className="px-3 py-2 text-right align-bottom">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Angebot {i + 1}</span>
                  <span className="block font-bold leading-tight text-slate-800">{a.name || LOESUNG_TEXT[a.loesung]}</span>
                  {r && Math.abs(r.rendite - besteRendite) < 1e-9 && positionen.filter((x) => x.ergebnis).length > 1 && (
                    <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">
                      <Trophy className="h-3 w-3" aria-hidden /> Bestes
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {zeilen.map((z) => (
              <tr key={z.text} className={`border-b border-slate-100 last:border-0 ${z.stark ? 'bg-indigo-50/40 font-bold' : ''}`}>
                <td className={`sticky left-0 px-3 py-1.5 text-slate-600 ${z.stark ? 'bg-indigo-50' : 'bg-white'}`}>
                  {z.text}{z.info && <InfoPunkt titel={z.text}>{z.info}</InfoPunkt>}
                </td>
                {positionen.map(({ angebot: a, ergebnis: r }) => (
                  <td key={a.id} className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-slate-900">
                    {r ? z.wert(r) : <span className="font-normal text-slate-400">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {positionen.some((x) => x.ergebnis === null) && (
        <p className="border-t border-slate-100 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
          Bei Angeboten ohne Beitrag oder ohne Rente fehlt die Rechnung — tragen Sie beides ein.
        </p>
      )}
    </div>
  );
}

