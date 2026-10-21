import { useMemo, useState, type ReactNode } from 'react';
import { Building2, CheckCircle2, FileSignature, FileText, HandCoins, PiggyBank, Plus, Printer, Trash2, Wand2, XCircle } from 'lucide-react';
import { BUNDESLAENDER, bavMitarbeiter, type FirmenModell, type MitarbeiterBav } from '@renten/engine';
import type { BeratungAngaben, BeratungDaten, BeratungStatus, HochrechnungAnnahmen, VersichererWerte } from '@renten/schema';
import type { Firma } from '../lib/bav-beratung';
import type { Auftritt } from '../features/auftritt';
import { KRANKENKASSEN, KASSEN_STAND } from '../features/krankenkassen';
import {
  AuswahlFeld, DatumFeld, GegenueberZeile, InfoPunkt, Kennzahl, ProzentFeld, Schalter, TextFeld, ZahlFeld, euro, euroGenau,
} from '../components/Feld';
import { laufzeitText } from '../features/tuev-berechnung';
import { Bon, Kachel, Zeile } from '../arbeitgeber/bausteine';
import { FirmenZeichen, KNOPF, KNOPF_ZWEIT, Karte, LueckenRing, TextBereich, useDrucken } from './bausteine';
import {
  P, grvMinderungVon, grvVon, hochrechnung, probeabrechnung, reglerGrenzen, rentenbeginnVon, umwandlungFuerNetto,
  type AuszahlungsWerte, type Hochrechnung, type KennzahlenErgebnis, type KennzahlenWeg, type Leistung,
  type Probeabrechnung, type Versorgungsluecke,
} from './rechnung';
import { fazitText, festePunkte, firmenHinweise, minderungText, regelText, traegerText, vertragName } from './texte';
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
  // Beispiel bei 100 EUR Umwandlung und einem mittleren Gehalt — die eigene Rechnung folgt in Schritt 4.
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
          <ZahlFeld label="Bestehende Betriebsrente: Beitrag im Monat" wert={a.bavBestandMonat} onChange={(bavBestandMonat) => setzeA({ bavBestandMonat })} einheit="€" schritt={10}
            hilfe="Direktversicherung oder Pensionskasse, Mitarbeiter und Arbeitgeber zusammen. Sie belegt die Freigrenzen zuerst." />
          <p className="text-xs leading-relaxed text-slate-500">
            Die gesetzliche Rente folgt im nächsten Schritt — aus dem Gehalt geschätzt und mit der Renteninformation anpassbar.
          </p>
        </div>
      </Karte>
    </div>
  );
}

/* --- 3. Versorgungsluecke -------------------------------------------------- */

const prozentText = (x: number, stellen = 1) => `${(x * 100).toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen })} %`;

export function SchrittLuecke({ daten, setze, luecke, aktuell }: SchrittProps & { luecke: Versorgungsluecke | null; aktuell: boolean }) {
  const a = daten.angaben;
  const setzeA = (p: Partial<BeratungAngaben>) => setze((d) => ({ ...d, angaben: { ...d.angaben, ...p } }));
  const rentenbeginn = rentenbeginnVon(a);
  const schaetzung = grvVon(a.jahresbrutto, 0, a.geburtsdatum, rentenbeginn);
  const eingetragen = a.grvRente > 0;

  if (!rentenbeginn || a.jahresbrutto <= 0) {
    return (
      <Karte>
        <p className="text-sm text-amber-800">Für die Versorgungslücke fehlen Geburtsdatum und Bruttogehalt (Schritt 2).</p>
      </Karte>
    );
  }
  const reicht = luecke !== null && luecke.lueckeMonat < 0.5;

  return (
    <Karte>
      <h2 className="text-lg font-black text-slate-900 sm:text-xl">
        {reicht ? 'Ihre gesetzliche Rente im Vergleich zum Nettolohn' : 'Ihre gesetzliche Rente reicht nicht aus'}
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-slate-600">
        Im Alter brauchen die meisten etwas weniger Geld als heute — trotzdem reicht die gesetzliche Rente oft nicht. Die
        Differenz zum heutigen Nettolohn heißt Versorgungslücke. Eine Betriebsrente kann sie verkleinern.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className={`flex flex-col items-center gap-4 sm:flex-row sm:justify-center ${aktuell ? '' : 'opacity-60'}`}>
          {luecke ? (
            <>
              <LueckenRing nettolohn={luecke.lohn.nettoMonat} rente={luecke.rente.nettoMonat} luecke={luecke.lueckeMonat} />
              <dl className="space-y-3">
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wide text-emerald-700">Netto-Altersrente</dt>
                  <dd className="text-2xl font-black tabular-nums text-emerald-700">{euro(luecke.rente.nettoMonat)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wide text-rose-700">Versorgungslücke</dt>
                  <dd className="text-2xl font-black tabular-nums text-rose-600">{euro(luecke.lueckeMonat)}</dd>
                </div>
                <p className="max-w-[14rem] text-xs leading-relaxed text-slate-500">
                  Die gesetzliche Rente ersetzt {prozentText(luecke.anteil, 0)} Ihres Nettolohns — in heutiger Kaufkraft.
                </p>
              </dl>
            </>
          ) : (
            <p className="text-sm text-slate-500">Wird gerechnet …</p>
          )}
        </div>

        <div>
          <h3 className="text-sm font-black text-slate-900">Berechnungsgrundlagen</h3>
          <div className="mt-2">
            <ZahlFeld label="Gesetzliche Rente nach heutigem Stand (im Monat)" wert={eingetragen ? a.grvRente : Math.round(schaetzung.monat)}
              onChange={(grvRente) => setzeA({ grvRente })} einheit="€" schritt={50}
              hilfe={eingetragen
                ? 'Eingetragen — etwa aus der Renteninformation.'
                : 'Aus dem Gehalt geschätzt: Berufsstart mit 22, Gehalt im Verhältnis zum Durchschnitt wie heute. '
                  + 'Mit dem Wert der Renteninformation überschreiben.'} />
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              {eingetragen ? (
                <button type="button" onClick={() => setzeA({ grvRente: 0 })} className="font-bold text-indigo-700 hover:underline">
                  Schätzung verwenden ({euro(schaetzung.monat)})
                </button>
              ) : (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-900">geschätzt</span>
              )}
            </div>
          </div>
          {luecke && (
            <dl className={`mt-3 divide-y divide-slate-100 text-sm ${aktuell ? '' : 'opacity-60'}`}>
              {([
                ['Ihr monatlicher Bruttolohn', euro(luecke.lohn.bruttoMonat)],
                ['Ihr Nettolohn heute', euro(luecke.lohn.nettoMonat)],
                ['Rentenbeginn', `${luecke.rentenbeginn} (mit ${luecke.alterBeiRentenbeginn})`],
                ['Angenommene Inflation', prozentText(luecke.inflation)],
                ['Angenommene Rentenanpassung', prozentText(luecke.rentenanpassung)],
                [`Brutto-Altersrente ${luecke.rentenbeginnJahr}, heutige Kaufkraft`, euro(luecke.rente.bruttoMonat)],
                ['− Kranken- und Pflegeversicherung', euro(luecke.rente.kvPvMonat)],
                ['− Steuer', euro(luecke.rente.steuerMonat)],
              ] as const).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 py-1">
                  <dt className="text-slate-600">{k}</dt><dd className="shrink-0 tabular-nums text-slate-900">{v}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-3 py-1 font-black">
                <dt className="text-slate-900">= Netto-Altersrente</dt><dd className="shrink-0 tabular-nums text-emerald-700">{euro(luecke.rente.nettoMonat)}</dd>
              </div>
            </dl>
          )}
        </div>
      </div>

      <p className="mt-5 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">
        Näherungswerte nach heutigem Recht. Die Rente steigt bis zum Rentenbeginn mit der Rentenanpassung, die Kaufkraft sinkt
        mit der Inflation — deshalb ist die Rente im ersten Rentenjahr in heutiger Kaufkraft niedriger als nach heutigem Stand.
        Der Nettolohn rechnet die Steuer als Monatsanteil der Jahressteuer
        {a.verheiratet && a.partnerBrutto > 0 ? ', bei Verheirateten mit eigenem Einkommen des Partners wie Steuerklasse IV' : ''}.
        Nicht berücksichtigt: bestehende Vorsorge außer der gesetzlichen Rente.
      </p>
    </Karte>
  );
}

/* --- 4. Rechnung ------------------------------------------------------------ */

/**
 * Der Regler fuer den Netto-Aufwand: Der Mitarbeiter sagt, was er netto
 * entbehren kann; die Umwandlung brutto folgt daraus (`umwandlungFuerNetto`).
 * Den genauen Bruttobetrag fuer die Vereinbarung kann man darunter eintippen.
 */
function NettoRegler({ firma, daten, setze, r }: SchrittProps) {
  const [genau, setGenau] = useState(false);
  // Die Grenzen haengen an den Angaben, nicht am Betrag — beim Ziehen am Regler nicht jedes Mal neu.
  const grenzen = useMemo(() => reglerGrenzen(firma.angebot, daten), [firma.angebot, daten.angaben]);
  const netto = Math.round(r.nettoAufwandMonat);
  const max = Math.max(1, grenzen.maxNetto, netto);
  const setzeU = (u: number) => setze((d) => ({ ...d, umwandlungMonat: Math.max(0, Math.round(u * 100) / 100) }));
  const setzeNetto = (n: number) => setze((d) => ({ ...d, umwandlungMonat: umwandlungFuerNetto(firma.angebot, d, n) }));
  // Die Marke sitzt ueber der Mitte des Reglerknopfs: Der Knopf (16 px) laeuft nicht ganz bis an die Raender.
  const lage = (x: number) => {
    const q = Math.min(1, Math.max(0, x / max));
    return `calc(${q * 100}% + ${(0.5 - q) * 16}px)`;
  };
  const fehltGehalt = daten.angaben.jahresbrutto <= 0;

  return (
    <Karte titel="Wie viel möchten Sie netto wandeln?">
      {fehltGehalt ? (
        <p className="text-sm text-amber-800">Für die Rechnung fehlt das Bruttogehalt (Schritt 2).</p>
      ) : (
        <>
          <p className="text-3xl font-black tabular-nums text-slate-900">
            {euro(netto)} <span className="text-base font-bold text-slate-500">netto im Monat</span>
          </p>
          <div className="relative mt-4 pb-6">
            <input type="range" min={0} max={max} step={1} value={netto}
              onChange={(e) => setzeNetto(Number(e.target.value))}
              aria-label="Netto-Aufwand im Monat"
              aria-valuetext={`${netto} Euro netto, ${Math.round(r.umwandlungMonat)} Euro Umwandlung brutto`}
              className="block w-full accent-indigo-600" />
            {grenzen.vollNetto > 0.5 && grenzen.vollNetto < max && (
              <span aria-hidden className="pointer-events-none absolute top-6 -translate-x-1/2 whitespace-nowrap text-[11px] font-bold text-emerald-700"
                style={{ left: lage(grenzen.vollNetto) }}>
                ▲ Rahmen voll
              </span>
            )}
          </div>
          <div className="flex justify-between text-xs tabular-nums text-slate-500">
            <span>0 €</span><span>{euro(max / 2)}</span><span>{euro(max)}</span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            = <strong className="tabular-nums">{euroGenau(r.umwandlungMonat)}</strong> Umwandlung brutto · + {euroGenau(r.arbeitgeberMonat)} vom
            Arbeitgeber · <strong className="tabular-nums">{euroGenau(r.gesamtMonat)}</strong> in Ihre Vorsorge
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => setzeU(grenzen.vollUmwandlung)} className={KNOPF_ZWEIT}>
              <Wand2 className="h-4 w-4" aria-hidden /> Rahmen voll nutzen
            </button>
            <button type="button" onClick={() => setGenau((x) => !x)} aria-expanded={genau}
              className="text-xs font-bold text-indigo-700 hover:underline">
              {genau ? 'Bruttobetrag ausblenden' : 'Betrag brutto genau eingeben'}
            </button>
          </div>
          {genau && (
            <div className="mt-3 w-56">
              <ZahlFeld label="Umwandlung brutto im Monat" wert={daten.umwandlungMonat} onChange={setzeU} einheit="€" schritt={10} />
            </div>
          )}
        </>
      )}
    </Karte>
  );
}

function AbrechnungsZeile({ text, ohne, mit, art = 'normal', zusatz }: {
  text: string; ohne: number | null; mit: number | null; art?: 'normal' | 'abzug' | 'info' | 'summe'; zusatz?: string;
}) {
  const wert = (x: number | null) => (x === null ? '—' : `${art === 'abzug' && x > 0.004 ? '− ' : ''}${euroGenau(x)}`);
  const farbe = art === 'info' ? 'text-slate-400' : art === 'summe' ? 'font-black text-slate-900' : 'text-slate-700';
  return (
    <tr className={`${art === 'summe' ? 'border-t-2 border-slate-300' : 'border-t border-slate-100'} ${farbe}`}>
      <td className="py-1.5 pr-2">
        {text}
        {zusatz && <span className="block text-[11px] font-normal text-slate-400">{zusatz}</span>}
      </td>
      <td className="py-1.5 pl-2 text-right tabular-nums">{wert(ohne)}</td>
      <td className="py-1.5 pl-2 text-right tabular-nums">{wert(mit)}</td>
    </tr>
  );
}

/** Der Monat ohne und mit Betriebsrente — wie eine Gehaltsabrechnung. */
function ProbeabrechnungKarte({ a }: { a: Probeabrechnung }) {
  const anteil = a.gesamtMonat > 0 ? Math.min(1, a.eigenbeteiligungMonat / a.gesamtMonat) : 0;
  return (
    <Karte titel="Probeabrechnung: Ihr Monat ohne und mit Betriebsrente">
      <table className="w-full text-[13px] sm:text-sm">
        <thead>
          <tr className="text-xs text-slate-500">
            <th className="pb-1 text-left font-semibold" />
            <th className="pb-1 pl-2 text-right font-semibold">ohne bAV</th>
            <th className="pb-1 pl-2 text-right font-bold text-indigo-700">mit bAV</th>
          </tr>
        </thead>
        <tbody>
          <AbrechnungsZeile text="Bruttogehalt" ohne={a.bruttoMonat} mit={a.bruttoMonat} />
          <AbrechnungsZeile text="Entgeltumwandlung" ohne={null} mit={a.umwandlungMonat} art="abzug" />
          <AbrechnungsZeile text="Beitrag des Arbeitgebers" zusatz="steuer- und beitragsfrei, fließt in den Vertrag" ohne={null} mit={a.arbeitgeberMonat} art="info" />
          <AbrechnungsZeile text="Steuerpflichtiges Brutto" ohne={a.steuerBrutto.ohne} mit={a.steuerBrutto.mit} />
          <AbrechnungsZeile text="Brutto für die Sozialabgaben" ohne={a.svBrutto.ohne} mit={a.svBrutto.mit} />
          <AbrechnungsZeile text="Steuern¹" zusatz="Lohnsteuer, Solidaritätszuschlag, Kirchensteuer" ohne={a.steuern.ohne} mit={a.steuern.mit} art="abzug" />
          <AbrechnungsZeile text="Sozialabgaben" zusatz="Kranken-, Pflege-, Renten-, Arbeitslosenversicherung" ohne={a.sv.ohne} mit={a.sv.mit} art="abzug" />
          <AbrechnungsZeile text="Netto" ohne={a.netto.ohne} mit={a.netto.mit} art="summe" />
        </tbody>
      </table>
      <div className="mt-4 rounded-xl bg-indigo-50 p-3">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <p className="text-xs text-indigo-900">
            Eigenbeteiligung aus dem Nettolohn
            <span className="block text-xl font-black tabular-nums">{euroGenau(a.eigenbeteiligungMonat)}</span>
          </p>
          <p className="text-right text-xs text-indigo-900">
            Gesamtbeitrag
            <span className="block text-xl font-black tabular-nums text-emerald-700">{euroGenau(a.gesamtMonat)}</span>
          </p>
        </div>
        <div className="mt-2 h-2 rounded-full bg-emerald-200" aria-hidden>
          <div className="h-2 rounded-full bg-indigo-600" style={{ width: `${anteil * 100}%` }} />
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
        ¹ Als Monatsanteil der Jahressteuer. Auf der Gehaltsabrechnung verteilt sich die Lohnsteuer je nach Steuerklasse
        anders; über das Jahr gleicht die Steuererklärung das aus.
      </p>
    </Karte>
  );
}

/**
 * Was bis zum Rentenbeginn zusammenkommt und was daraus im Monat entnommen
 * werden kann — mit denselben Annahmen wie das ETF-Depot im Rechner, als Beispiel.
 */
function HochrechnungKarte({ h, rentenbeginn, setzeAnnahmen }: {
  h: Hochrechnung; rentenbeginn: string | null; setzeAnnahmen: (a: Partial<HochrechnungAnnahmen>) => void;
}) {
  if (h.monate <= 0) return null;
  const a = h.annahmen;
  const teile = [
    { text: 'Ihr Netto-Aufwand', wert: h.nettoSumme, farbe: 'bg-sky-500' },
    { text: 'Steuer- und SV-Ersparnis', wert: h.ersparnisSumme, farbe: 'bg-indigo-400' },
    { text: 'Arbeitgeber', wert: h.arbeitgeberSumme, farbe: 'bg-amber-400' },
    { text: 'Erträge nach Kosten', wert: h.ertrag, farbe: 'bg-emerald-500' },
  ];
  const summe = teile.reduce((x, t) => x + Math.max(0, t.wert), 0);
  return (
    <Karte titel="Beispielhafte Hochrechnung">
      <p className="text-sm text-slate-600">
        {euro(h.beitragMonat)} im Monat in Ihre Vorsorge, {laufzeitText(h.monate)} bis zum Rentenbeginn{rentenbeginn ? ` am ${rentenbeginn}` : ''}.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ProzentFeld label="Rendite Ansparphase" wert={a.renditeAnsparphase}
          onChange={(renditeAnsparphase) => setzeAnnahmen({ renditeAnsparphase })} />
        <ProzentFeld label="Rendite Entnahmephase" wert={a.renditeEntnahme}
          onChange={(renditeEntnahme) => setzeAnnahmen({ renditeEntnahme })}
          hilfe="In der Entnahmephase wird meist vorsichtiger angelegt." />
        <ProzentFeld label="Ausgabeaufschlag" wert={a.ausgabeaufschlag} max={10}
          onChange={(ausgabeaufschlag) => setzeAnnahmen({ ausgabeaufschlag })}
          hilfe="Kosten auf jeden Beitrag, bei Versicherungen etwa die Abschlusskosten." />
        <ProzentFeld label="Laufende Kosten (TER)" wert={a.ter} max={5}
          onChange={(ter) => setzeAnnahmen({ ter })}
          hilfe="Gehen von der Rendite ab, in beiden Phasen." />
        <ZahlFeld label="Entnahmedauer" wert={a.entnahmedauer} min={1} max={60} einheit="Jahre"
          onChange={(n) => setzeAnnahmen({ entnahmedauer: Math.min(60, Math.max(1, Math.round(n))) })} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Kapital bei Rentenbeginn</div>
          <div className="text-lg font-black tabular-nums text-emerald-800">{euro(h.kapital)}</div>
        </div>
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Entnahme brutto</div>
          <div className="text-lg font-black tabular-nums text-emerald-800">
            {euro(h.entnahmeMonat)} <span className="text-xs font-normal">/ Monat</span>
          </div>
          <div className="text-xs text-slate-500">{a.entnahmedauer} Jahre lang</div>
        </div>
      </div>
      <p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">Woraus das Kapital besteht</p>
      <div className="mt-1.5 flex h-4 overflow-hidden rounded-full bg-slate-100" aria-hidden>
        {teile.map((t) => (
          <div key={t.text} className={t.farbe} style={{ width: `${summe > 0 ? (Math.max(0, t.wert) / summe) * 100 : 0}%` }} />
        ))}
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {teile.map((t) => (
          <div key={t.text} className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-2 text-slate-600"><span className={`h-2.5 w-2.5 rounded-sm ${t.farbe}`} aria-hidden />{t.text}</dt>
            <dd className="tabular-nums text-slate-900">{euro(t.wert)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        Beispiel mit angenommenen Werten und gleichbleibenden Beiträgen — keine Zusage. Gerechnet wie bei einem Fondsdepot:
        In der Ansparphase wächst das Geld mit der Rendite abzüglich der laufenden Kosten, der Ausgabeaufschlag geht von
        jedem Beitrag ab; ab Rentenbeginn wird das Kapital mit der Rendite der Entnahmephase über {a.entnahmedauer} Jahre
        verteilt. Die Entnahme ist brutto, vor Kranken- und Pflegeversicherung und Steuer. Was der Vertrag tatsächlich
        verspricht, steht im Angebot des Versicherers (nächster Schritt).
      </p>
    </Karte>
  );
}

export function SchrittRechnung(props: SchrittProps) {
  const { firma, daten, setze, r } = props;
  const minderung = grvMinderungVon(daten, firma.angebot, r);
  const abrechnung = useMemo(() => probeabrechnung(firma.angebot, daten, r), [firma.angebot, daten, r]);
  const h = useMemo(() => hochrechnung(firma.angebot, daten, r), [firma.angebot, daten, r]);

  return (
    <div className="space-y-4">
      <NettoRegler {...props} />

      <section className="grid gap-3 sm:grid-cols-3">
        <Kachel symbol={<HandCoins className="h-5 w-5" aria-hidden />} farbe="border-sky-200 bg-sky-50 text-sky-900"
          titel="Sie zahlen netto" betrag={r.nettoAufwandMonat} unten={`von ${euro(r.umwandlungMonat)} Umwandlung`} genau />
        <Kachel symbol={<Building2 className="h-5 w-5" aria-hidden />} farbe="border-amber-200 bg-amber-50 text-amber-900"
          titel="Ihr Arbeitgeber gibt dazu" betrag={r.arbeitgeberMonat} unten="jeden Monat" genau />
        <Kachel symbol={<PiggyBank className="h-5 w-5" aria-hidden />} farbe="border-emerald-300 bg-emerald-50 text-emerald-900"
          titel="In Ihre Vorsorge" betrag={r.gesamtMonat} gross genau
          unten={r.hebel > 0 ? `je 1 € netto ${r.hebel.toLocaleString('de-DE', { maximumFractionDigits: 1 })} € Vorsorge` : 'jeden Monat'} />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <ProbeabrechnungKarte a={abrechnung} />
        </div>
        <div className="space-y-3 lg:col-span-2">
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
          {r.hinweise.map((h2) => (
            <p key={h2} className="rounded-lg bg-slate-200/60 px-3 py-2 text-xs leading-relaxed text-slate-700">{h2}</p>
          ))}
          {minderung.renteMonat > 0.5 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
              Für den beitragsfreien Teil zahlen Sie keine Rentenbeiträge. Ihre gesetzliche Rente sinkt dadurch um rund{' '}
              <strong>{euro(minderung.renteMonat)}</strong> im Monat — nach heutigem Stand, bei gleichem Gehalt bis zum Rentenbeginn.
              <InfoPunkt titel="So gerechnet">{minderungText(minderung)}</InfoPunkt>
            </p>
          )}
        </div>
      </div>

      <HochrechnungKarte h={h} rentenbeginn={rentenbeginnVon(daten.angaben)}
        setzeAnnahmen={(a) => setze((d) => ({ ...d, hochrechnung: { ...d.hochrechnung, ...a } }))} />
    </div>
  );
}

/* --- 5. Leistung im Alter -------------------------------------------------- */

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

const WEG_TITEL: Record<KennzahlenWeg['art'], string> = { garantiert: 'Garantiert', prognose: 'Prognose', kapital: 'Kapital' };
const zahl = (x: number, stellen = 2) => x.toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen });

/**
 * Kennzahlen und Fazit — wie im Vertrags-TUEV (`VertragsTuev.tsx`, „3.
 * Kennzahlen und Fazit“), fuer den Vertrag allein: Netto-Aufwand gegen
 * Netto-Auszahlung. Die geringere gesetzliche Rente steht im Fazit und
 * darunter in „Unterm Strich“.
 */
function KennzahlenKarte({ k, minderungMonat, daten, setze, aktuell }: {
  k: KennzahlenErgebnis; minderungMonat: number; daten: BeratungDaten;
  setze: SchrittProps['setze']; aktuell: boolean;
}) {
  const haupt = k.prognose ?? k.garantiert ?? k.kapital;
  if (!haupt) return null;
  const gut = haupt.nettoHebel >= 1;
  const istKapital = haupt.art === 'kapital';
  const wege = [k.garantiert, k.prognose, k.kapital].filter((x): x is KennzahlenWeg => x !== null);
  const laufzeit = laufzeitText(k.monateEinzahlung);

  return (
    <Karte titel="Kennzahlen und Fazit">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-xl text-xs leading-relaxed text-slate-500">
          Ihr Netto-Aufwand gegen die Netto-Auszahlung — der Vertrag allein,{' '}
          {istKapital ? 'mit der Kapitalauszahlung' : `mit der ${haupt.art === 'prognose' ? 'prognostizierten' : 'garantierten'} Rente`}.
        </p>
        <div className="w-44">
          <ZahlFeld label="Rente bis zum Alter von" wert={daten.lebenserwartung} min={60} max={120} schritt={1} stufen einheit="J."
            onChange={(n) => setze((d) => ({ ...d, lebenserwartung: Math.min(120, Math.max(60, Math.round(n))) }))} />
        </div>
      </div>

      <div className={`mt-3 rounded-lg border p-3 ${gut ? 'border-emerald-200 bg-emerald-50/50' : 'border-rose-200 bg-rose-50/50'} ${aktuell ? '' : 'opacity-60'}`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kennzahl titel="Netto-Hebel" wert={`${zahl(haupt.nettoHebel)} ×`} farbe={gut ? 'text-emerald-700' : 'text-rose-700'}
            fussnote="Auszahlung je Euro Einzahlung"
            info={(
              <>
                {euro(haupt.summeAuszahlung)} Auszahlung geteilt durch {euro(haupt.summeEinzahlung)} eigenen Aufwand über {laufzeit}.{' '}
                <strong>Beide Seiten netto</strong>: oben nach Steuer und Kranken- und Pflegeversicherung im Alter, unten nach der
                Steuer- und Sozialabgabenersparnis. Ohne Verzinsung gerechnet — was das Geld dann wert ist, sagt die Rendite daneben.
              </>
            )} />
          <Kennzahl titel="Nettorendite" wert={`${zahl(haupt.rendite * 100)} %`} farbe={haupt.rendite > 0 ? 'text-emerald-700' : 'text-rose-700'}
            fussnote="p. a. nach allen Abzügen"
            info={(
              <>
                Der interne Zinsfuß Ihrer Zahlungsreihe: der Zinssatz, bei dem {laufzeit} Einzahlung und{' '}
                {istKapital ? 'die Kapitalauszahlung' : `${k.jahreAuszahlung} Jahre Rente`} genau aufgehen. Anders als der Hebel{' '}
                <strong>berücksichtigt er, wann</strong> jeder Euro fließt.
              </>
            )} />
          <Kennzahl titel="Netto-Gewinn" wert={euro(haupt.echterGewinn)} farbe={haupt.echterGewinn >= 0 ? 'text-emerald-700' : 'text-rose-700'}
            fussnote={istKapital ? 'mit der Kapitalauszahlung' : `bis ${k.lebenserwartung}`} />
          {!istKapital && (
            <Kennzahl titel="Amortisation" wert={`${zahl(haupt.amortisationsJahre, 1)} J.`} fussnote="ab Rentenbeginn" />
          )}
        </div>
        <div className="mt-3 space-y-1.5">
          <GegenueberZeile text={`Eingezahlt, netto (${laufzeit})`} wert={euro(haupt.summeEinzahlung)} farbe="text-rose-600" />
          <GegenueberZeile text={istKapital ? 'Ausgezahlt, netto (einmalig)' : `Ausgezahlt, netto (${k.jahreAuszahlung} Jahre bis ${k.lebenserwartung})`}
            wert={euro(haupt.summeAuszahlung)} farbe="text-emerald-600" />
        </div>
      </div>

      {wege.length > 1 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[20rem] text-xs">
            <thead>
              <tr className="text-slate-500">
                <th className="py-1 text-left font-semibold" />
                {wege.map((w) => <th key={w.art} className="py-1 pl-2 text-right font-semibold">{WEG_TITEL[w.art]}</th>)}
              </tr>
            </thead>
            <tbody className="tabular-nums text-slate-700">
              {([
                ['Netto', (w: KennzahlenWeg) => (w.art === 'kapital' ? euro(w.netto) : `${euro(w.netto)} / Mon.`)],
                ['Netto-Hebel', (w: KennzahlenWeg) => `${zahl(w.nettoHebel)} ×`],
                ['Nettorendite', (w: KennzahlenWeg) => `${zahl(w.rendite * 100)} %`],
                ['Netto-Gewinn', (w: KennzahlenWeg) => euro(w.echterGewinn)],
                ['Amortisation', (w: KennzahlenWeg) => (w.art === 'kapital' ? '—' : `${zahl(w.amortisationsJahre, 1)} J.`)],
              ] as const).map(([text, wert]) => (
                <tr key={text} className="border-t border-slate-100">
                  <td className="py-1 text-slate-600">{text}</td>
                  {wege.map((w) => <td key={w.art} className="py-1 pl-2 text-right">{wert(w)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-sm leading-relaxed text-slate-800">
        <strong>Fazit:</strong> {fazitText(k, minderungMonat)}
      </p>
    </Karte>
  );
}

export function SchrittLeistung({ firma, daten, setze, r, leistung, kennzahlen, aktuell }: SchrittProps & {
  kennzahlen: KennzahlenErgebnis | null; aktuell: boolean;
}) {
  const a = firma.angebot;
  const minderung = grvMinderungVon(daten, firma.angebot, r);
  const setzeW = (weg: 'direkt' | 'ukasse', p: Partial<VersichererWerte>) =>
    setze((d) => ({ ...d, versicherer: { ...d.versicherer, [weg]: { ...d.versicherer[weg], ...p } } }));
  const ohneGeburt = !rentenbeginnVon(daten.angaben);

  if (r.vertraege.length === 0) {
    return <Karte><p className="text-sm text-slate-600">Ohne Umwandlung gibt es keinen Vertrag — bitte in Schritt 4 einen Betrag wählen.</p></Karte>;
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

      {kennzahlen && (
        <KennzahlenKarte k={kennzahlen} minderungMonat={minderung.renteMonat} daten={daten} setze={setze} aktuell={aktuell} />
      )}

      {leistung && (
        <Karte titel="Unterm Strich">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-2">
              <dt>Gesetzliche Rente nach heutigem Stand{leistung.grv.geschaetzt ? ' (geschätzt)' : ''}</dt>
              <dd className="tabular-nums">{euro(leistung.grv.monat)}</dd>
            </div>
            <div className="flex justify-between gap-2 text-amber-900">
              <dt>
                Minderung durch die beitragsfreie Umwandlung
                <InfoPunkt titel="So gerechnet">{minderungText(minderung)}</InfoPunkt>
              </dt>
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

/* --- 6. Entscheidung ------------------------------------------------------ */

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
              <button type="button" onClick={() => geheZu(3)} className="text-xs font-bold text-indigo-700 hover:underline">Betrag ändern</button>
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

/* --- 7. Unterlagen ---------------------------------------------------------- */

export function SchrittUnterlagen(props: SchrittProps & {
  auftritt: Auftritt | null; sichern: (d: BeratungDaten) => Promise<boolean>;
  luecke: Versorgungsluecke | null; kennzahlen: KennzahlenErgebnis | null;
}) {
  const { firma, logo, daten, r, leistung, auftritt, sichern, luecke, kennzahlen } = props;
  const drucken = useDrucken();
  const status = daten.entscheidung.status;
  const dok = { firma, logo, daten, r, leistung, auftritt, luecke, kennzahlen };

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
