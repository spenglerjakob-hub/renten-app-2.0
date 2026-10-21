import { useMemo, type ReactNode } from 'react';
import { Building2, CheckCircle2, FileSignature, FileText, HandCoins, PiggyBank, Plus, Printer, Trash2, Wand2, XCircle } from 'lucide-react';
import { BUNDESLAENDER, bavMitarbeiter, type FirmenModell, type MitarbeiterBav } from '@renten/engine';
import type { BeratungAngaben, BeratungDaten, BeratungStatus, VersichererWerte } from '@renten/schema';
import type { Firma } from '../lib/bav-beratung';
import type { Auftritt } from '../features/auftritt';
import { KRANKENKASSEN, KASSEN_STAND } from '../features/krankenkassen';
import { AuswahlFeld, DatumFeld, ProzentFeld, Schalter, TextFeld, ZahlFeld, euro, euroGenau } from '../components/Feld';
import { Bon, Kachel, Zeile } from '../arbeitgeber/bausteine';
import { FirmenZeichen, KNOPF, KNOPF_ZWEIT, Karte, TextBereich, useDrucken } from './bausteine';
import {
  P, grvMinderungVon, grvVon, rahmenVoll, rentenbeginnVon, type AuszahlungsWerte, type Leistung,
} from './rechnung';
import { festePunkte, firmenHinweise, regelText, traegerText, vertragName } from './texte';
import { Protokoll, Vereinbarung, Verzicht } from './druck';

export interface SchrittProps {
  firma: Firma;
  logo: string | null;
  daten: BeratungDaten;
  setze: (fn: (d: BeratungDaten) => BeratungDaten) => void;
  r: MitarbeiterBav;
  leistung: Leistung | null;
  geheZu: (i: number) => void;
}

const LAENDER = BUNDESLAENDER.filter((l) => l !== 'Bund').map((l) => ({ wert: l as string, text: l }));
const KASSEN = [
  { wert: '', text: 'Bitte wählen — oder Satz eintragen' },
  ...KRANKENKASSEN.map((k) => ({ wert: k.name, text: k.name })),
];
const JETZT = new Date().getFullYear();

/** Ein Absatz mit Hinweisen — am Bildschirm wie im Rechner. */
function Hinweise({ titel, punkte }: { titel: string; punkte: string[] }) {
  if (punkte.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-black text-slate-900">{titel}</h3>
      <ul className="mt-1.5 space-y-1.5 text-sm leading-relaxed text-slate-700">
        {punkte.map((p) => (
          <li key={p} className="flex gap-2"><span aria-hidden className="text-indigo-500">•</span><span>{p}</span></li>
        ))}
      </ul>
    </div>
  );
}

/* --- 1. Angebot der Firma ------------------------------------------------ */

export function SchrittAngebot({ firma, logo }: SchrittProps) {
  const a = firma.angebot;
  // Beispiel bei 100 EUR Umwandlung und einem mittleren Gehalt — die eigene Rechnung folgt in Schritt 3.
  const bsp = useMemo(() => bavMitarbeiter(
    a.modell as FirmenModell,
    { jahresbrutto: 45_000, umwandlungMonat: 100, privatVersichert: false, pkvPraemieMonat: 0, kinder: { hatKinder: false, kinderUnter25: 0 }, bavBestandMonat: 0 },
    { verheiratet: false, bundesland: a.bundesland, kirchensteuerpflichtig: false },
    P,
  ), [a.modell, a.bundesland]);
  const vertraege = a.modell.art === 'matching' ? (a.modell.weg === 'dv' ? ['direkt', 'ukasse'] as const : ['ukasse'] as const) : ['direkt'] as const;

  return (
    <Karte>
      <FirmenZeichen name={firma.name} logo={logo} gross />
      <p className="mt-4 whitespace-pre-line text-base leading-relaxed text-slate-700">
        {a.begruessung.trim() || `${firma.name} unterstützt Ihre Altersvorsorge mit einer Betriebsrente.`}
      </p>
      <p className="mt-5 rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 text-lg font-bold leading-snug text-emerald-950">
        {regelText(a.modell)}
      </p>
      <p className="mt-3 text-sm leading-relaxed text-slate-700">
        Ein Beispiel: Wandeln Sie <strong>100 €</strong> im Monat um, legt Ihr Arbeitgeber{' '}
        <strong className="tabular-nums">{euroGenau(bsp.arbeitgeberMonat)}</strong> dazu — in Ihre Vorsorge fließen{' '}
        <strong className="tabular-nums">{euroGenau(bsp.gesamtMonat)}</strong>. Was Sie das netto kostet, rechnen wir gleich mit Ihren Angaben.
      </p>

      <dl className="mt-5 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {vertraege.map((w) => (
          <div key={w}>
            <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{vertragName(w, a)}</dt>
            <dd className="text-slate-800">{traegerText(w, a) || 'Anbieter wird im Gespräch genannt'}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 space-y-4">
        <Hinweise titel={`Was ${firma.name} dazu festgelegt hat`} punkte={firmenHinweise(a)} />
        <Hinweise titel="Gut zu wissen" punkte={festePunkte(a)} />
      </div>
    </Karte>
  );
}

/* --- 2. Angaben ------------------------------------------------------------ */

export function SchrittAngaben({ firma, daten, setze }: SchrittProps) {
  const a = daten.angaben;
  const setzeA = (p: Partial<BeratungAngaben>) => setze((d) => ({ ...d, angaben: { ...d.angaben, ...p } }));
  const regel = rentenbeginnVon({ ...a, rentenbeginn: '' });
  const grv = grvVon(a.jahresbrutto, a.grvRente, a.geburtsdatum, rentenbeginnVon(a));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Karte titel="Zur Person">
        <div className="space-y-3">
          <TextFeld label="Name" wert={a.name} onChange={(name) => setzeA({ name })} maxLaenge={120} autoComplete="off" />
          <DatumFeld label="Geburtsdatum" wert={a.geburtsdatum} onChange={(geburtsdatum) => setzeA({ geburtsdatum })} />
          <DatumFeld label="Rentenbeginn" wert={a.rentenbeginn} onChange={(rentenbeginn) => setzeA({ rentenbeginn })}
            hilfe={regel ? `Leer: Regelaltersgrenze, ${regel}.` : 'Leer: Regelaltersgrenze aus dem Geburtsdatum.'} />
        </div>
      </Karte>

      <Karte titel="Einkommen und Steuer">
        <div className="space-y-3">
          <ZahlFeld label="Bruttogehalt im Jahr" wert={a.jahresbrutto} onChange={(jahresbrutto) => setzeA({ jahresbrutto })} einheit="€" schritt={1000} />
          <AuswahlFeld label="Bundesland" wert={a.bundesland || firma.angebot.bundesland} optionen={LAENDER} onChange={(bundesland) => setzeA({ bundesland })} />
          <Schalter label="verheiratet" wert={a.verheiratet} onChange={(verheiratet) => setzeA({ verheiratet })} />
          {a.verheiratet && (
            <ZahlFeld label="Bruttogehalt des Partners im Jahr" wert={a.partnerBrutto} onChange={(partnerBrutto) => setzeA({ partnerBrutto })} einheit="€" schritt={1000}
              hilfe="Für die Steuer im Splittingtarif. 0, wenn der Partner kein Einkommen hat." />
          )}
          <Schalter label="kirchensteuerpflichtig" wert={a.kirchensteuer} onChange={(kirchensteuer) => setzeA({ kirchensteuer })} />
          <div>
            <span className="mb-1 block text-xs font-bold text-slate-700">Kinder</span>
            <div className="space-y-2">
              {a.kinder.map((k, i) => (
                <div key={i} className="flex items-end gap-2">
                  <div className="flex-1">
                    <ZahlFeld label={`Kind ${i + 1}: Geburtsjahr`} wert={k.geburtsjahr} min={1950} max={JETZT}
                      onChange={(geburtsjahr) => setzeA({ kinder: a.kinder.map((x, j) => (j === i ? { ...x, geburtsjahr: Math.round(geburtsjahr) } : x)) })} />
                  </div>
                  <button type="button" aria-label={`Kind ${i + 1} entfernen`} onClick={() => setzeA({ kinder: a.kinder.filter((_, j) => j !== i) })}
                    className="mb-1 rounded p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-700">
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              ))}
              {a.kinder.length < 15 && (
                <button type="button" onClick={() => setzeA({ kinder: [...a.kinder, { geburtsjahr: JETZT - 5 }] })} className={KNOPF_ZWEIT}>
                  <Plus className="h-4 w-4" aria-hidden /> Kind hinzufügen
                </button>
              )}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Kinder senken den Beitrag zur Pflegeversicherung — heute und im Alter.</p>
          </div>
        </div>
      </Karte>

      <Karte titel="Krankenversicherung">
        <div className="space-y-3">
          <AuswahlFeld label="Versichert" wert={a.kv} onChange={(kv) => setzeA({ kv })}
            optionen={[{ wert: 'gesetzlich', text: 'gesetzlich' }, { wert: 'privat', text: 'privat' }]} />
          {a.kv === 'gesetzlich' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <AuswahlFeld label="Krankenkasse" wert={a.krankenkasse} optionen={KASSEN} hilfe={KASSEN_STAND}
                onChange={(v) => {
                  const k = KRANKENKASSEN.find((kk) => kk.name === v);
                  setzeA({ krankenkasse: v, ...(k ? { zusatzbeitrag: k.zusatzbeitrag } : {}) });
                }} />
              <ProzentFeld label="Zusatzbeitrag" wert={a.zusatzbeitrag} max={10} stellen={2}
                onChange={(zusatzbeitrag) => setzeA({ zusatzbeitrag, krankenkasse: '' })} />
            </div>
          ) : (
            <ZahlFeld label="Beitrag zur privaten Kranken- und Pflegeversicherung im Monat" wert={a.pkvPraemieMonat}
              onChange={(pkvPraemieMonat) => setzeA({ pkvPraemieMonat })} einheit="€" schritt={10} />
          )}
        </div>
      </Karte>

      <Karte titel="Bisherige Vorsorge">
        <div className="space-y-3">
          <ZahlFeld label="Gesetzliche Rente laut Renteninformation (im Monat)" wert={a.grvRente} onChange={(grvRente) => setzeA({ grvRente })} einheit="€" schritt={50}
            hilfe={a.grvRente > 0 ? 'Die künftige Regelaltersrente aus der Renteninformation.'
              : grv.monat > 0 ? `Leer: aus dem Gehalt geschätzt — rund ${euro(grv.monat)} in heutiger Kaufkraft.`
              : 'Leer: wird aus Gehalt und Geburtsdatum geschätzt.'} />
          <ZahlFeld label="Bestehende Betriebsrente: Beitrag im Monat" wert={a.bavBestandMonat} onChange={(bavBestandMonat) => setzeA({ bavBestandMonat })} einheit="€" schritt={10}
            hilfe="Direktversicherung oder Pensionskasse, Mitarbeiter und Arbeitgeber zusammen. Sie belegt die Freigrenzen zuerst." />
        </div>
      </Karte>
    </div>
  );
}

/* --- 3. Rechnung ------------------------------------------------------------ */

export function SchrittRechnung({ firma, daten, setze, r }: SchrittProps) {
  const a = daten.angaben;
  const setzeU = (u: number) => setze((d) => ({ ...d, umwandlungMonat: Math.max(0, Math.round(u * 100) / 100) }));
  const voll = () => setzeU(rahmenVoll(firma.angebot, a));
  const minderung = grvMinderungVon(a, r);
  const fehltGehalt = a.jahresbrutto <= 0;

  return (
    <div className="space-y-4">
      <Karte titel="Wie viel möchten Sie umwandeln?">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-48">
            <ZahlFeld label="Umwandlung im Monat" wert={daten.umwandlungMonat} onChange={setzeU} einheit="€" schritt={10} gross />
          </div>
          {[50, 100, 150, 200].map((b) => (
            <button key={b} type="button" onClick={() => setzeU(b)} className={KNOPF_ZWEIT}>{b} €</button>
          ))}
          <button type="button" onClick={voll} disabled={fehltGehalt} className={KNOPF_ZWEIT}>
            <Wand2 className="h-4 w-4" aria-hidden /> Rahmen voll nutzen
          </button>
        </div>
        {fehltGehalt && <p className="mt-2 text-sm text-amber-800">Für die Rechnung fehlt das Bruttogehalt (Schritt 2).</p>}
      </Karte>

      <section className="grid gap-3 sm:grid-cols-3">
        <Kachel symbol={<HandCoins className="h-5 w-5" aria-hidden />} farbe="border-sky-200 bg-sky-50 text-sky-900"
          titel="Sie zahlen netto" betrag={r.nettoAufwandMonat} unten={`von ${euro(r.umwandlungMonat)} Umwandlung`} genau />
        <Kachel symbol={<Building2 className="h-5 w-5" aria-hidden />} farbe="border-amber-200 bg-amber-50 text-amber-900"
          titel="Ihr Arbeitgeber gibt dazu" betrag={r.arbeitgeberMonat} unten="jeden Monat" genau />
        <Kachel symbol={<PiggyBank className="h-5 w-5" aria-hidden />} farbe="border-emerald-300 bg-emerald-50 text-emerald-900"
          titel="In Ihre Vorsorge" betrag={r.gesamtMonat} gross genau
          unten={r.hebel > 0 ? `je 1 € netto ${r.hebel.toLocaleString('de-DE', { maximumFractionDigits: 1 })} € Vorsorge` : 'jeden Monat'} />
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Bon titel="Was es Sie kostet">
          <Zeile text="Umwandlung" betrag={r.umwandlungMonat} />
          <Zeile text="− gesparte Sozialabgaben" betrag={r.svErsparnisMonat} />
          <Zeile text="− gesparte Steuer" betrag={r.steuerersparnisMonat} />
          <Zeile text="= kostet Sie netto" betrag={r.nettoAufwandMonat} summe />
        </Bon>
        <Bon titel="Was in Ihre Vorsorge fließt">
          <Zeile text="Ihre Umwandlung" betrag={r.umwandlungMonat} />
          {r.pflichtzuschussMonat > 0.005 && <Zeile text="+ gesetzlicher Zuschuss" betrag={r.pflichtzuschussMonat} />}
          {r.freiwilligMonat > 0.005 && (
            <Zeile text={firma.angebot.modell.art === 'matching' ? '+ Arbeitgeber (Unterstützungskasse)' : '+ Zuschuss des Arbeitgebers'} betrag={r.freiwilligMonat} />
          )}
          <Zeile text="= in Ihre Vorsorge" betrag={r.gesamtMonat} summe />
          {r.vertraege.length > 1 && r.vertraege.map((v) => (
            <p key={v.weg} className="flex justify-between gap-2 pl-3 text-xs text-slate-500">
              <span>davon {vertragName(v.weg, firma.angebot)}</span><span className="tabular-nums">{euro(v.beitragMonat)}</span>
            </p>
          ))}
        </Bon>
      </section>

      {(r.hinweise.length > 0 || minderung.renteMonat > 0.5) && (
        <section className="space-y-1.5">
          {r.hinweise.map((h) => (
            <p key={h} className="rounded-lg bg-slate-200/60 px-3 py-2 text-xs leading-relaxed text-slate-700">{h}</p>
          ))}
          {minderung.renteMonat > 0.5 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
              Für den beitragsfreien Teil zahlen Sie keine Rentenbeiträge. Ihre gesetzliche Rente sinkt dadurch um rund{' '}
              <strong>{euro(minderung.renteMonat)}</strong> im Monat — in heutiger Kaufkraft, bei gleichem Gehalt bis zum Rentenbeginn.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

/* --- 4. Leistung im Alter -------------------------------------------------- */

function Wertezeile({ titel, w, kk }: { titel: string; w: AuszahlungsWerte | null; kk: number }) {
  if (!w) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <h4 className="text-sm font-black text-slate-900">{titel}</h4>
      <dl className="mt-1 space-y-0.5 text-[13px]">
        <Zeile text="Rente brutto" betrag={w.bruttoMonat} />
        <Zeile text="− Kranken- und Pflegeversicherung" betrag={w.kvPvMonat} />
        <Zeile text="− Steuer" betrag={w.steuerMonat} />
        <Zeile text="= netto im Monat" betrag={w.nettoMonat} summe />
      </dl>
      <p className="mt-1 text-xs text-slate-500">in heutiger Kaufkraft rund {euro(w.nettoMonat / kk)}</p>
    </div>
  );
}

export function SchrittLeistung({ firma, daten, setze, r, leistung, aktuell }: SchrittProps & { aktuell: boolean }) {
  const a = firma.angebot;
  const setzeW = (weg: 'direkt' | 'ukasse', p: Partial<VersichererWerte>) =>
    setze((d) => ({ ...d, versicherer: { ...d.versicherer, [weg]: { ...d.versicherer[weg], ...p } } }));
  const ohneGeburt = !rentenbeginnVon(daten.angaben);

  if (r.vertraege.length === 0) {
    return <Karte><p className="text-sm text-slate-600">Ohne Umwandlung gibt es keinen Vertrag — bitte in Schritt 3 einen Betrag wählen.</p></Karte>;
  }
  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-slate-600">
        Tragen Sie die Werte aus dem Angebot des Versicherers ein. Daraus wird die Rente nach Kranken- und Pflegeversicherung
        und Steuer im ersten Rentenjahr{leistung ? ` (${leistung.rentenbeginnJahr})` : ''}.
      </p>
      {r.vertraege.map((v) => {
        const w = daten.versicherer[v.weg];
        const l = leistung?.vertraege.find((x) => x.weg === v.weg) ?? null;
        const traeger = traegerText(v.weg, a);
        return (
          <Karte key={v.weg} titel={`${vertragName(v.weg, a)}${traeger ? ` — ${traeger}` : ''}`}>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <div className="space-y-3 lg:col-span-5">
                <ZahlFeld label="Beitrag laut Angebot im Monat" wert={w.beitragMonat > 0 ? w.beitragMonat : Math.round(v.beitragMonat * 100) / 100}
                  onChange={(beitragMonat) => setzeW(v.weg, { beitragMonat })} einheit="€" schritt={10}
                  hilfe={`Aus der Rechnung: ${euroGenau(v.beitragMonat)}, davon Arbeitgeber ${euroGenau(v.arbeitgeberMonat)}.`} />
                <ZahlFeld label="Garantierte Rente im Monat" wert={w.garantierteRente} onChange={(garantierteRente) => setzeW(v.weg, { garantierteRente })} einheit="€" schritt={10} />
                <ZahlFeld label="Prognostizierte Rente im Monat" wert={w.prognoseRente} onChange={(prognoseRente) => setzeW(v.weg, { prognoseRente })} einheit="€" schritt={10} />
                <ZahlFeld label="Kapital zum Rentenbeginn (Prognose)" wert={w.prognoseKapital} onChange={(prognoseKapital) => setzeW(v.weg, { prognoseKapital })} einheit="€" schritt={1000} />
                <ProzentFeld label="Dynamik des Beitrags" wert={w.dynamik} onChange={(dynamik) => setzeW(v.weg, { dynamik })} max={10} />
              </div>
              <div className={`space-y-3 lg:col-span-7 ${aktuell ? '' : 'opacity-60'}`}>
                {ohneGeburt && <p className="text-sm text-amber-800">Für die Rechnung fehlt das Geburtsdatum (Schritt 2).</p>}
                {!ohneGeburt && !l && <p className="text-sm text-slate-500">Mit einer Rente oder einem Kapital aus dem Angebot erscheint hier, was netto bleibt.</p>}
                {l && leistung && (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Wertezeile titel="Garantiert" w={l.garantiert} kk={leistung.kaufkraftfaktor} />
                      <Wertezeile titel="Prognose" w={l.prognose} kk={leistung.kaufkraftfaktor} />
                    </div>
                    {l.kapital && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <h4 className="text-sm font-black text-slate-900">Oder als Kapital (Prognose)</h4>
                        <dl className="mt-1 space-y-0.5 text-[13px]">
                          <Zeile text="Kapital brutto" betrag={l.kapital.brutto} />
                          <Zeile text="− Steuer" betrag={l.kapital.steuer} />
                          <Zeile text="− Kranken- und Pflegeversicherung (10 Jahre)" betrag={l.kapital.kvPv} />
                          <Zeile text="= netto" betrag={l.kapital.netto} summe />
                        </dl>
                        {l.breakEven && Number.isFinite(l.breakEven.breakEvenOhneZins) && (
                          <p className="mt-1 text-xs text-slate-600">
                            Die Rente holt das Kapital mit rund {Math.floor(l.breakEven.breakEvenOhneZins)} Jahren ein.
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </Karte>
        );
      })}

      {leistung && (
        <Karte titel="Unterm Strich">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-2">
              <dt>Gesetzliche Rente{leistung.grv.geschaetzt ? ' (geschätzt)' : ''}, heutige Kaufkraft</dt>
              <dd className="tabular-nums">{euro(leistung.grv.monat)}</dd>
            </div>
            <div className="flex justify-between gap-2 text-amber-900">
              <dt>Minderung durch die beitragsfreie Umwandlung</dt>
              <dd className="tabular-nums">− {euro(leistung.grvMinderungMonat)}</dd>
            </div>
            {leistung.plusHaushaltMonat !== null && (
              <div className="flex justify-between gap-2 border-t border-slate-200 pt-1 font-black text-emerald-800">
                <dt>Ihr Netto im Ruhestand steigt um</dt>
                <dd className="tabular-nums">{euro(leistung.plusHaushaltMonat / leistung.kaufkraftfaktor)} im Monat</dd>
              </div>
            )}
          </dl>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            Mit der prognostizierten Rente, nach Steuer und Krankenversicherung und nach Abzug der geminderten gesetzlichen Rente —
            in heutiger Kaufkraft ({euro(leistung.plusHaushaltMonat ?? 0)} im Jahr {leistung.rentenbeginnJahr}).
            Prognosen sind nicht garantiert; maßgeblich ist das Angebot des Versicherers.
          </p>
        </Karte>
      )}
    </div>
  );
}

/* --- 5. Entscheidung ------------------------------------------------------ */

const WAHL: { status: BeratungStatus; text: string; symbol: ReactNode }[] = [
  { status: 'teilnahme', text: 'Ich nehme teil', symbol: <CheckCircle2 className="h-5 w-5" aria-hidden /> },
  { status: 'verzicht', text: 'Ich verzichte', symbol: <XCircle className="h-5 w-5" aria-hidden /> },
  { status: 'offen', text: 'Ich überlege noch', symbol: <FileText className="h-5 w-5" aria-hidden /> },
];

export function SchrittEntscheidung({ daten, setze, r, geheZu }: SchrittProps) {
  const e = daten.entscheidung;
  const setzeE = (p: Partial<BeratungDaten['entscheidung']>) => setze((d) => ({ ...d, entscheidung: { ...d.entscheidung, ...p } }));
  const heute = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <div className="space-y-4">
      <Karte titel="Die Entscheidung">
        <div role="radiogroup" aria-label="Entscheidung" className="grid gap-2 sm:grid-cols-3">
          {WAHL.map((w) => (
            <button key={w.status} type="button" role="radio" aria-checked={e.status === w.status}
              onClick={() => setzeE({ status: w.status, datum: e.datum || heute })}
              className={`flex items-center gap-2 rounded-xl border-2 p-3 text-left text-sm font-bold ${
                e.status === w.status ? 'border-indigo-600 bg-indigo-50 text-indigo-900' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}>
              {w.symbol}{w.text}
            </button>
          ))}
        </div>

        {e.status === 'teilnahme' && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <span className="mb-1 block text-xs font-bold text-slate-700">Umwandlung im Monat</span>
              <p className="text-lg font-black tabular-nums text-slate-900">{euroGenau(r.umwandlungMonat)}</p>
              <button type="button" onClick={() => geheZu(2)} className="text-xs font-bold text-indigo-700 hover:underline">Betrag ändern</button>
            </div>
            <DatumFeld label="Beginn" wert={e.beginn} onChange={(beginn) => setzeE({ beginn })} hilfe="Leer: der nächste Monatserste." />
          </div>
        )}
        {e.status === 'verzicht' && (
          <div className="mt-4">
            <TextBereich label="Grund (freiwillig)" wert={e.grund} onChange={(grund) => setzeE({ grund })} maxLaenge={500} zeilen={2} />
          </div>
        )}
      </Karte>

      <Karte titel="Empfehlung und Ort">
        <div className="space-y-3">
          <TextBereich label="Empfehlung des Beraters" wert={e.empfehlung} onChange={(empfehlung) => setzeE({ empfehlung })} maxLaenge={2000} zeilen={4}
            hilfe="Steht im Beratungsprotokoll." />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextFeld label="Ort" wert={e.ort} onChange={(ort) => setzeE({ ort })} maxLaenge={120} />
            <DatumFeld label="Datum" wert={e.datum} onChange={(datum) => setzeE({ datum })} />
          </div>
        </div>
      </Karte>
    </div>
  );
}

/* --- 6. Unterlagen ---------------------------------------------------------- */

export function SchrittUnterlagen(props: SchrittProps & { auftritt: Auftritt | null; sichern: (d: BeratungDaten) => Promise<boolean> }) {
  const { firma, logo, daten, r, leistung, auftritt, sichern } = props;
  const drucken = useDrucken();
  const status = daten.entscheidung.status;
  const dok = { firma, logo, daten, r, leistung, auftritt };

  const knopf = (text: string, symbol: ReactNode, inhalt: ReactNode, haupt = false) => (
    <button type="button" className={`${haupt ? KNOPF : KNOPF_ZWEIT} max-w-full text-left`}
      onClick={() => { void sichern(daten); drucken(inhalt); }}>
      {symbol}{text}
    </button>
  );

  return (
    <Karte titel="Unterlagen">
      <p className="text-sm leading-relaxed text-slate-600">
        Drucken Sie die Unterlagen aus oder speichern Sie sie als PDF. Unterschrieben gehen sie an die Personalabteilung,
        eine Kopie bekommt {daten.angaben.name || 'der Mitarbeiter'}.
      </p>
      {/* Das weiche Trennzeichen bricht das lange Wort auf dem Telefon, statt es ueber den Rand ragen zu lassen. */}
      <div className="mt-4 flex flex-wrap gap-2">
        {knopf('Beratungsprotokoll', <Printer className="h-4 w-4" aria-hidden />, <Protokoll {...dok} />, true)}
        {status === 'teilnahme' && knopf('Entgeltumwandlungs\u00ADvereinbarung', <FileSignature className="h-4 w-4" aria-hidden />, <Vereinbarung {...dok} />)}
        {status === 'verzicht' && knopf('Verzichtserklärung', <FileSignature className="h-4 w-4" aria-hidden />, <Verzicht {...dok} />)}
      </div>
      {status === 'offen' && (
        <p className="mt-3 text-sm text-slate-600">
          Noch keine Entscheidung — das Protokoll hält den Stand fest. Vereinbarung oder Verzicht gibt es, sobald entschieden ist.
        </p>
      )}
      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        Vereinbarung und Verzichtserklärung sind Muster. Bitte vor der Verwendung rechtlich prüfen lassen und mit der
        Versorgungsordnung der Firma abgleichen.
      </p>
    </Karte>
  );
}
