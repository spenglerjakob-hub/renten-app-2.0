import { useMemo, useState, type ReactNode } from 'react';
import { CheckCircle2, FileSignature, FileText, Plus, Printer, Trash2, Wand2, XCircle } from 'lucide-react';
import { BUNDESLAENDER, bavMitarbeiter, type FirmenModell, type MitarbeiterBav } from '@renten/engine';
import type { BeratungAngaben, BeratungDaten, BeratungStatus, VersichererWerte } from '@renten/schema';
import type { Firma } from '../lib/bav-beratung';
import type { Auftritt } from '../features/auftritt';
import { KRANKENKASSEN, KASSEN_STAND } from '../features/krankenkassen';
import {
  AuswahlFeld, DatumFeld, GegenueberZeile, InfoPunkt, Kennzahl, ProzentFeld, Schalter, TextFeld, ZahlFeld, euro, euroGenau,
} from '../components/Feld';
import { laufzeitText } from '../features/tuev-berechnung';
import {
  ETIKETT, FirmenZeichen, KNOPF, KNOPF_ZWEIT, Karte, LINK, LueckenRing, PFIRSICH, SCHWEBEND, TextBereich, Titel, Vermerk, useDrucken,
} from './bausteine';
import {
  P, automatischerBeginn, belastungJeVertrag, grvVon, hochrechnung, hochrechnungJeVertrag, probeabrechnung,
  reglerGrenzen, rentenbeginnVon, umwandlungFuerNetto,
  type AuszahlungsWerte, type BelastungsTreppe, type Hochrechnung, type KennzahlenErgebnis, type KennzahlenWeg, type Leistung,
  type Probeabrechnung, type Versorgungsluecke,
} from './rechnung';
import { fazitText, festePunkte, firmenHinweise, regelText, traegerText, vertragName } from './texte';
import { Gespraechsunterlagen, Protokoll, Vereinbarung, Verzicht } from './druck';

/** Was zum Drucken der Unterlagen gebraucht wird — in der Entscheidung und bei den Unterlagen. */
interface UnterlagenProps {
  auftritt: Auftritt | null;
  sichern: (d: BeratungDaten) => Promise<boolean>;
  luecke: Versorgungsluecke | null;
  kennzahlen: KennzahlenErgebnis | null;
}

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
      <h3 className="text-base font-medium text-mb-tinte">{titel}</h3>
      <ul className="mt-2 space-y-2 text-sm leading-relaxed text-mb-tinte">
        {punkte.map((p) => (
          <li key={p} className="flex gap-3"><span aria-hidden className="text-mb-asche">—</span><span>{p}</span></li>
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
    <div className="space-y-8">
      {/* Der Einstieg fuer den Mitarbeiter: grosser Name in Serifen auf Weiss, die Regel als Akzentkarte. */}
      <div>
        <FirmenZeichen name={firma.name} logo={logo} gross />
        <p className="mt-4 max-w-3xl whitespace-pre-line text-lg leading-relaxed text-mb-schiefer">
          {a.begruessung.trim() || `${firma.name} unterstützt Ihre Altersvorsorge mit einer Betriebsrente.`}
        </p>
      </div>
      <div className={`${PFIRSICH} p-6 sm:p-10`}>
        <p className="text-sm">Ihr Angebot</p>
        <p className="mt-2 max-w-3xl text-balance font-titel text-[26px] font-normal leading-[1.25] tracking-[-0.01em] sm:text-[34px]">
          {regelText(a.modell)}
        </p>
        <p className="mt-4 max-w-3xl text-base leading-relaxed">
        Ein Beispiel: Wandeln Sie <strong>100 €</strong> im Monat um, legt Ihr Arbeitgeber{' '}
        <strong className="tabular-nums">{euroGenau(bsp.arbeitgeberMonat)}</strong> dazu — in Ihre Vorsorge fließen{' '}
        <strong className="tabular-nums">{euroGenau(bsp.gesamtMonat)}</strong>. Was Sie das netto kostet, rechnen wir gleich mit Ihren Angaben.
        </p>
      </div>

      <Karte>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          {vertraege.map((w) => (
            <div key={w}>
              <dt className={ETIKETT}>{vertragName(w, a)}</dt>
              <dd className="mt-0.5 text-base text-mb-tinte">{traegerText(w, a) || 'Anbieter wird im Gespräch genannt'}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-6 space-y-6">
          <Hinweise titel={`Was ${firma.name} dazu festgelegt hat`} punkte={firmenHinweise(a)} />
          <Hinweise titel="Gut zu wissen" punkte={festePunkte(a)} />
        </div>
      </Karte>
    </div>
  );
}

/* --- 2. Angaben ------------------------------------------------------------ */

export function SchrittAngaben({ firma, daten, setze }: SchrittProps) {
  const a = daten.angaben;
  const setzeA = (p: Partial<BeratungAngaben>) => setze((d) => ({ ...d, angaben: { ...d.angaben, ...p } }));
  const regel = rentenbeginnVon({ ...a, rentenbeginn: '' });

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Karte titel="Zur Person">
        <div className="space-y-3">
          <TextFeld label="Name" wert={a.name} onChange={(name) => setzeA({ name })} maxLaenge={120} autoComplete="off" />
          <DatumFeld label="Geburtsdatum" wert={a.geburtsdatum} onChange={(geburtsdatum) => setzeA({ geburtsdatum })} />
          <div>
            <DatumFeld label="Rentenbeginn" wert={a.rentenbeginn || regel || ''} onChange={(rentenbeginn) => setzeA({ rentenbeginn })}
              hilfe={!regel ? 'Wird aus dem Geburtsdatum berechnet: die Regelaltersgrenze.'
                : a.rentenbeginn ? 'Eingetragen.' : 'Automatisch: die Regelaltersgrenze aus dem Geburtsdatum. Ändern, wenn die Rente früher oder später beginnt.'} />
            {regel && a.rentenbeginn && a.rentenbeginn !== regel && (
              <button type="button" onClick={() => setzeA({ rentenbeginn: '' })} className={`mt-1 ${LINK} text-xs`}>
                Regelaltersgrenze verwenden ({regel})
              </button>
            )}
          </div>
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
            <span className="mb-1 block text-xs font-semibold text-slate-600">Kinder</span>
            <div className="space-y-2">
              {a.kinder.map((k, i) => (
                <div key={i} className="flex items-end gap-2">
                  <div className="flex-1">
                    <ZahlFeld label={`Kind ${i + 1}: Geburtsjahr`} wert={k.geburtsjahr} min={1950} max={JETZT}
                      onChange={(geburtsjahr) => setzeA({ kinder: a.kinder.map((x, j) => (j === i ? { ...x, geburtsjahr: Math.round(geburtsjahr) } : x)) })} />
                  </div>
                  <button type="button" aria-label={`Kind ${i + 1} entfernen`} onClick={() => setzeA({ kinder: a.kinder.filter((_, j) => j !== i) })}
                    className="mb-1 rounded-full p-2 text-mb-asche hover:bg-rose-50 hover:text-rose-700">
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
            <p className="mt-1 text-xs text-mb-schiefer">Kinder senken den Beitrag zur Pflegeversicherung — heute und im Alter.</p>
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
          <p className="text-xs leading-relaxed text-mb-schiefer">
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
        <p className="text-sm text-mb-tinte">Für die Versorgungslücke fehlen Geburtsdatum und Bruttogehalt (Schritt 2).</p>
      </Karte>
    );
  }
  const reicht = luecke !== null && luecke.lueckeMonat < 0.5;

  return (
    <div className="space-y-8">
      <div>
        <Titel als="h2" gross>
          {reicht ? 'Ihre gesetzliche Rente im Vergleich zum Nettolohn' : 'Ihre gesetzliche Rente reicht nicht aus'}
        </Titel>
        <p className="mt-3 max-w-3xl text-base leading-relaxed text-mb-schiefer">
          Im Alter brauchen die meisten etwas weniger Geld als heute — trotzdem reicht die gesetzliche Rente oft nicht. Die
          Differenz zum heutigen Nettolohn heißt Versorgungslücke. Eine Betriebsrente kann sie verkleinern.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Der Ring als schwebendes Stueck Produkt; die Luecke selbst in der Akzentkarte darunter. */}
        <div className={`${SCHWEBEND} self-start p-5 sm:p-7 ${aktuell ? '' : 'opacity-60'}`}>
          {luecke ? (
            <>
              <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-center">
                <LueckenRing nettolohn={luecke.lohn.nettoMonat} rente={luecke.rente.nettoMonat} luecke={luecke.lueckeMonat}
                  renteProzent={luecke.renteProzent} lueckeProzent={luecke.lueckeProzent} />
                <dl className="space-y-4">
                  <div>
                    <dt className="flex items-center gap-2 text-sm text-mb-schiefer">
                      <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-mb-tinte" />Netto-Altersrente
                    </dt>
                    <dd className="mt-0.5 text-[28px] font-medium leading-tight tabular-nums text-mb-tinte">
                      {euro(luecke.rente.nettoMonat)} <span className="text-base text-mb-schiefer">· {luecke.renteProzent} %</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="flex items-center gap-2 text-sm text-mb-schiefer">
                      <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-mb-pfirsich ring-1 ring-mb-siena/40" />Versorgungslücke
                    </dt>
                    <dd className="mt-0.5 text-[28px] font-medium leading-tight tabular-nums text-mb-tinte">
                      {euro(luecke.lueckeMonat)} <span className="text-base text-mb-schiefer">· {luecke.lueckeProzent} %</span>
                    </dd>
                  </div>
                </dl>
              </div>
              {luecke.lueckeProzent > 0 && (
                <div className={`${PFIRSICH} mt-6 px-5 py-4`}>
                  <p className="font-titel text-[22px] leading-snug sm:text-[26px]">
                    Im Alter fehlen Ihnen <span className="whitespace-nowrap tabular-nums">{luecke.lueckeProzent} %</span> Ihres heutigen Nettolohns.
                  </p>
                </div>
              )}
              <p className="mt-3 text-xs leading-relaxed text-mb-schiefer">
                Die gesetzliche Rente ersetzt {luecke.renteProzent} % Ihres Nettolohns — in heutiger Kaufkraft.
              </p>
            </>
          ) : (
            <p className="text-sm text-mb-schiefer">Wird gerechnet …</p>
          )}
        </div>

        <Karte titel="Berechnungsgrundlagen">
          <div>
            <ZahlFeld label="Gesetzliche Rente nach heutigem Stand (im Monat)" wert={eingetragen ? a.grvRente : Math.round(schaetzung.monat)}
              onChange={(grvRente) => setzeA({ grvRente })} einheit="€" schritt={50}
              hilfe={eingetragen
                ? 'Eingetragen — etwa aus der Renteninformation.'
                : 'Aus dem Gehalt geschätzt: Berufsstart mit 22, Gehalt im Verhältnis zum Durchschnitt wie heute. '
                  + 'Mit dem Wert der Renteninformation überschreiben.'} />
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              {eingetragen ? (
                <button type="button" onClick={() => setzeA({ grvRente: 0 })} className={`${LINK} text-xs`}>
                  Schätzung verwenden ({euro(schaetzung.monat)})
                </button>
              ) : (
                <Vermerk>geschätzt</Vermerk>
              )}
            </div>
          </div>
          {luecke && (
            <dl className={`mt-4 divide-y divide-mb-linie text-sm ${aktuell ? '' : 'opacity-60'}`}>
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
                <div key={k} className="flex justify-between gap-3 py-1.5">
                  <dt className="text-mb-schiefer">{k}</dt><dd className="shrink-0 tabular-nums text-mb-tinte">{v}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-3 py-2 font-medium">
                <dt className="text-mb-tinte">= Netto-Altersrente</dt><dd className="shrink-0 tabular-nums text-mb-tinte">{euro(luecke.rente.nettoMonat)}</dd>
              </div>
            </dl>
          )}
        </Karte>
      </div>

      <p className="max-w-4xl text-xs leading-relaxed text-mb-schiefer">
        Näherungswerte nach heutigem Recht. Die Rente steigt bis zum Rentenbeginn mit der Rentenanpassung, die Kaufkraft sinkt
        mit der Inflation — deshalb ist die Rente im ersten Rentenjahr in heutiger Kaufkraft niedriger als nach heutigem Stand.
        Der Nettolohn rechnet die Steuer als Monatsanteil der Jahressteuer
        {a.verheiratet && a.partnerBrutto > 0 ? ', bei Verheirateten mit eigenem Einkommen des Partners wie Steuerklasse IV' : ''}.
        Nicht berücksichtigt: bestehende Vorsorge außer der gesetzlichen Rente.
      </p>
    </div>
  );
}

/* --- 4. Rechnung ------------------------------------------------------------ */

/**
 * Der Regler fuer den Netto-Aufwand: Der Mitarbeiter sagt, was er netto
 * entbehren kann; die Umwandlung brutto folgt daraus (`umwandlungFuerNetto`).
 * Er reicht bis zum Rahmen, der frei von Sozialabgaben bleibt (4 % der BBG,
 * mit dem Arbeitgeberbeitrag) — darueber lohnt sich die Umwandlung fuer den
 * Mitarbeiter kaum. Den genauen Bruttobetrag kann man darunter eintippen.
 */
function NettoRegler({ firma, daten, setze, r }: SchrittProps) {
  const [genau, setGenau] = useState(false);
  // Die Grenzen haengen an den Angaben, nicht am Betrag — beim Ziehen am Regler nicht jedes Mal neu.
  const grenzen = useMemo(() => reglerGrenzen(firma.angebot, daten), [firma.angebot, daten.angaben]);
  const netto = Math.round(r.nettoAufwandMonat);
  // Das Ende des Reglers ist der volle Rahmen
  const ende = Math.max(1, Math.round(grenzen.maxNetto));
  const ohneRahmen = grenzen.maxUmwandlung < 0.005;
  const darueber = daten.umwandlungMonat > grenzen.maxUmwandlung + 0.005;
  // Was den Rahmen mit fuellt: der Zuschuss — im Matching-Modell nur der gesetzliche in die Direktversicherung;
  // der Beitrag in die Unterstuetzungskasse liegt ausserhalb.
  const m = firma.angebot.modell;
  const mitImRahmen = m.art !== 'matching' ? ' für Umwandlung und Arbeitgeberbeitrag zusammen'
    : m.weg === 'dv' ? ' für Umwandlung und gesetzlichen Zuschuss zusammen' : '';
  const setzeU = (u: number) => setze((d) => ({ ...d, umwandlungMonat: Math.min(grenzen.maxUmwandlung, Math.max(0, Math.round(u * 100) / 100)) }));
  const setzeNetto = (n: number) => (n >= ende
    ? setzeU(grenzen.maxUmwandlung)
    : setze((d) => ({ ...d, umwandlungMonat: umwandlungFuerNetto(firma.angebot, d, n, P, grenzen.maxUmwandlung) })));
  const fehltGehalt = daten.angaben.jahresbrutto <= 0;

  return (
    <Karte>
      <Titel als="h2">Wie viel möchten Sie netto wandeln?</Titel>
      {fehltGehalt ? (
        <p className="mt-3 text-sm text-mb-tinte">Für die Rechnung fehlt das Bruttogehalt (Schritt 2).</p>
      ) : (
        <>
          {/* Die eine Zahl, um die es im Gespraech geht — in Serifen, gross wie eine Schlagzeile. */}
          <p className="mt-4 font-titel text-[56px] font-normal leading-none tracking-[-0.02em] tabular-nums text-mb-tinte sm:text-[72px]">
            {euro(netto)} <span className="font-sans text-base tracking-normal text-mb-schiefer">netto im Monat</span>
          </p>
          <div className="mt-4">
            <input type="range" min={0} max={ende} step={1} value={Math.min(netto, ende)} disabled={ohneRahmen}
              onChange={(e) => setzeNetto(Number(e.target.value))}
              aria-label="Netto-Aufwand im Monat"
              aria-valuetext={`${netto} Euro netto, ${Math.round(r.umwandlungMonat)} Euro Umwandlung brutto`}
              className="block w-full accent-[#17191c] disabled:opacity-50" />
          </div>
          <div className="mt-1 flex justify-between text-xs tabular-nums text-mb-schiefer">
            <span>0 €</span><span>{euro(ende / 2)}</span><span>{euro(ende)} · Rahmen voll</span>
          </div>
          <p className="mt-4 text-base leading-relaxed text-mb-tinte">
            = <strong className="font-medium tabular-nums">{euroGenau(r.umwandlungMonat)}</strong> Umwandlung brutto · + {euroGenau(r.arbeitgeberMonat)} vom
            Arbeitgeber · <strong className="font-medium tabular-nums">{euroGenau(r.gesamtMonat)}</strong> in Ihre Vorsorge
          </p>
          <p className="mt-2 max-w-4xl text-xs leading-relaxed text-mb-schiefer">
            {ohneRahmen
              ? 'Der Rahmen, der frei von Sozialabgaben bleibt, ist schon voll — durch den Beitrag des Arbeitgebers oder eine bestehende Betriebsrente.'
              : `Der Regler reicht bis zum Rahmen, der frei von Sozialabgaben bleibt: 4 % der Beitragsbemessungsgrenze, ${euro(grenzen.rahmenMonat)} im Monat`
                + `${mitImRahmen} — bei Ihnen mit ${euroGenau(grenzen.maxUmwandlung)} Umwandlung voll. `
                + 'Darüber fielen auf die Umwandlung Sozialabgaben an; das lohnt sich für Sie kaum.'
                + (m.art === 'matching' ? ' Der Beitrag des Arbeitgebers in die Unterstützungskasse kommt obendrauf.' : '')}
          </p>
          {darueber && (
            <p role="status" className="mt-3 rounded-2xl bg-white px-4 py-3 text-xs leading-relaxed text-mb-tinte">
              Eingetragen sind {euroGenau(daten.umwandlungMonat)} Umwandlung — mehr als der Rahmen frei von Sozialabgaben.{' '}
              <button type="button" onClick={() => setzeU(grenzen.maxUmwandlung)} className="font-medium underline underline-offset-4">
                Auf {euroGenau(grenzen.maxUmwandlung)} setzen
              </button>
            </p>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <button type="button" onClick={() => setzeU(grenzen.maxUmwandlung)} disabled={ohneRahmen} className={KNOPF_ZWEIT}>
              <Wand2 className="h-4 w-4" aria-hidden /> Rahmen voll nutzen
            </button>
            <button type="button" onClick={() => setGenau((x) => !x)} aria-expanded={genau} className={LINK}>
              {genau ? 'Bruttobetrag ausblenden' : 'Betrag brutto genau eingeben'}
            </button>
          </div>
          {genau && (
            <div className="mt-3 w-56">
              <ZahlFeld label="Umwandlung brutto im Monat" wert={daten.umwandlungMonat} onChange={setzeU} einheit="€" schritt={10}
                max={grenzen.maxUmwandlung} />
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
  const farbe = art === 'info' ? 'text-mb-asche' : art === 'summe' ? 'font-medium text-mb-tinte' : 'text-mb-tinte';
  return (
    <tr className={`${art === 'summe' ? 'border-t border-mb-tinte' : 'border-t border-mb-linie'} ${farbe}`}>
      <td className="py-2 pr-2">
        {text}
        {zusatz && <span className="block text-xs font-normal text-mb-schiefer">{zusatz}</span>}
      </td>
      <td className="py-2 pl-2 text-right tabular-nums">{wert(ohne)}</td>
      <td className="py-2 pl-2 text-right tabular-nums">{wert(mit)}</td>
    </tr>
  );
}

/** Der Monat ohne und mit Betriebsrente — wie eine Gehaltsabrechnung. */
function ProbeabrechnungKarte({ a }: { a: Probeabrechnung }) {
  const anteil = a.gesamtMonat > 0 ? Math.min(1, a.eigenbeteiligungMonat / a.gesamtMonat) : 0;
  return (
    /* Wie ein Gehaltszettel, der ueber der Seite liegt — das schwebende Artefakt dieses Schritts. */
    <section className={`${SCHWEBEND} p-5 sm:p-7`}>
      <h2 className="mb-4 text-lg font-medium tracking-[-0.01em] text-mb-tinte sm:text-xl">Probeabrechnung: Ihr Monat ohne und mit Betriebsrente</h2>
      <table className="w-full text-[13px] sm:text-sm">
        <thead>
          <tr className="text-xs text-mb-schiefer">
            <th className="pb-2 text-left font-normal" />
            <th className="pb-2 pl-2 text-right font-normal">ohne bAV</th>
            <th className="pb-2 pl-2 text-right font-medium text-mb-tinte">mit bAV</th>
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
      <div className="mt-5 rounded-2xl bg-mb-nebel p-4">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <p className="text-sm text-mb-schiefer">
            Eigenbeteiligung aus dem Nettolohn
            <span className="block text-2xl font-medium tabular-nums text-mb-tinte">{euroGenau(a.eigenbeteiligungMonat)}</span>
          </p>
          <p className="text-right text-sm text-mb-schiefer">
            Gesamtbeitrag
            <span className="block text-2xl font-medium tabular-nums text-mb-tinte">{euroGenau(a.gesamtMonat)}</span>
          </p>
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-mb-pfirsich" aria-hidden>
          <div className="h-1.5 rounded-full bg-mb-tinte" style={{ width: `${anteil * 100}%` }} />
        </div>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-mb-schiefer">
        ¹ Als Monatsanteil der Jahressteuer. Auf der Gehaltsabrechnung verteilt sich die Lohnsteuer je nach Steuerklasse
        anders; über das Jahr gleicht die Steuererklärung das aus.
      </p>
    </section>
  );
}

/**
 * Was bis zum Rentenbeginn zusammenkommen kann und welche Rente daraus
 * geschaetzt wird — gerechnet wie das ETF-Depot im Rechner. Verstellbar ist
 * allein die Rendite; die uebrigen Annahmen laufen fest im Hintergrund
 * (`HOCHRECHNUNG_FEST`) und stehen bewusst nirgends.
 */
function HochrechnungKarte({ h, rentenbeginn, setzeRendite }: {
  h: Hochrechnung; rentenbeginn: string | null; setzeRendite: (rendite: number) => void;
}) {
  if (h.monate <= 0) return null;
  const teile = [
    // Grautoene fuer das Eingezahlte, Pfirsich fuer die Ertraege — was der Markt dazugibt.
    { text: 'Ihr Netto-Aufwand', wert: h.nettoSumme, farbe: 'bg-mb-tinte' },
    { text: 'Steuer- und SV-Ersparnis', wert: h.ersparnisSumme, farbe: 'bg-[#8a8e98]' },
    { text: 'Arbeitgeber', wert: h.arbeitgeberSumme, farbe: 'bg-[#cfd1d6]' },
    { text: 'Erträge', wert: h.ertrag, farbe: 'bg-mb-pfirsich' },
  ];
  const summe = teile.reduce((x, t) => x + Math.max(0, t.wert), 0);
  return (
    <Karte titel="Beispielhafte Hochrechnung" rechts={<Vermerk>geschätzt</Vermerk>}>
      <p className="text-sm text-mb-schiefer">
        {euro(h.beitragMonat)} im Monat in Ihre Vorsorge, {laufzeitText(h.monate)} bis zum Rentenbeginn{rentenbeginn ? ` am ${rentenbeginn}` : ''}.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ProzentFeld label="Angenommene Rendite" wert={h.annahmen.renditeAnsparphase} onChange={setzeRendite}
          hilfe="Wertentwicklung im Jahr bis zum Rentenbeginn." />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 rounded-2xl bg-white p-4">
        <div>
          <div className={ETIKETT}>Kapital bei Rentenbeginn</div>
          <div className="mt-0.5 text-2xl font-medium tabular-nums text-mb-tinte">{euro(h.kapital)}</div>
        </div>
        <div>
          <div className={ETIKETT}>Geschätzte Rente brutto</div>
          <div className="mt-0.5 text-2xl font-medium tabular-nums text-mb-tinte">
            {euro(h.renteMonat)} <span className="text-sm font-normal text-mb-schiefer">/ Monat</span>
          </div>
        </div>
      </div>
      <p className={`mt-5 ${ETIKETT}`}>Woraus das Kapital besteht</p>
      <div className="mt-2 flex h-3 gap-0.5 overflow-hidden rounded-full" aria-hidden>
        {teile.map((t) => (
          <div key={t.text} className={t.farbe} style={{ width: `${summe > 0 ? (Math.max(0, t.wert) / summe) * 100 : 0}%` }} />
        ))}
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {teile.map((t) => (
          <div key={t.text} className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-2 text-mb-schiefer"><span className={`h-2.5 w-2.5 rounded-full ${t.farbe}`} aria-hidden />{t.text}</dt>
            <dd className="tabular-nums text-mb-tinte">{euro(t.wert)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-xs leading-relaxed text-mb-schiefer">
        Beispielhafte und geschätzte Hochrechnung mit der angenommenen Rendite und gleichbleibenden Beiträgen — keine
        Zusage. Die tatsächliche Leistung hängt von der Wertentwicklung und vom Tarif ab. Die Rente ist brutto, vor
        Kranken- und Pflegeversicherung und Steuer. Verbindlich ist allein das Angebot des Versicherers (nächster Schritt).
      </p>
    </Karte>
  );
}

/** Eine Zahl mit Etikett — flach auf Nebel, oder als die eine Akzentkarte. */
function WertKarte({ titel, wert, unten, akzent = false }: { titel: string; wert: string; unten: string; akzent?: boolean }) {
  return (
    <div className={`rounded-3xl p-5 sm:p-6 ${akzent ? 'bg-mb-pfirsich text-mb-siena' : 'bg-mb-nebel text-mb-tinte'}`}>
      <p className={`text-sm ${akzent ? '' : 'text-mb-schiefer'}`}>{titel}</p>
      <p className={`mt-1 tabular-nums ${akzent ? 'font-titel text-[40px] leading-none tracking-[-0.02em]' : 'text-[28px] font-medium leading-tight'}`}>{wert}</p>
      <p className={`mt-2 text-xs ${akzent ? '' : 'text-mb-schiefer'}`}>{unten}</p>
    </div>
  );
}

/** Eine Zeile einer kleinen Aufstellung — die Summe unter einer Linie in Tinte. */
function Posten({ text, wert, summe = false }: { text: string; wert: string; summe?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 py-1 ${summe ? 'mt-1 border-t border-mb-tinte pt-2 font-medium text-mb-tinte' : 'text-mb-schiefer'}`}>
      <dt>{text}</dt>
      <dd className={`tabular-nums ${summe ? '' : 'text-mb-tinte'}`}>{wert}</dd>
    </div>
  );
}

export function SchrittRechnung(props: SchrittProps) {
  const { firma, daten, setze, r } = props;
  const abrechnung = useMemo(() => probeabrechnung(firma.angebot, daten, r), [firma.angebot, daten, r]);
  const h = useMemo(() => hochrechnung(firma.angebot, daten, r), [firma.angebot, daten, r]);

  return (
    <div className="space-y-6">
      <NettoRegler {...props} />

      {/* Drei Zahlen nebeneinander; die dritte — was in der Vorsorge ankommt — als Akzentkarte. */}
      <section className="grid gap-4 sm:grid-cols-3">
        <WertKarte titel="Sie zahlen netto" wert={euroGenau(r.nettoAufwandMonat)} unten={`von ${euro(r.umwandlungMonat)} Umwandlung`} />
        <WertKarte titel="Ihr Arbeitgeber gibt dazu" wert={euroGenau(r.arbeitgeberMonat)} unten="jeden Monat" />
        <WertKarte titel="In Ihre Vorsorge" wert={euroGenau(r.gesamtMonat)} akzent
          unten={r.hebel > 0 ? `je 1 € netto ${r.hebel.toLocaleString('de-DE', { maximumFractionDigits: 1 })} € Vorsorge` : 'jeden Monat'} />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <ProbeabrechnungKarte a={abrechnung} />
        </div>
        <div className="space-y-4 lg:col-span-2">
          <Karte titel="Was in Ihre Vorsorge fließt im Monat">
            <dl className="text-sm">
              <Posten text="Ihre Umwandlung" wert={euro(r.umwandlungMonat)} />
              {r.pflichtzuschussMonat > 0.005 && <Posten text="+ gesetzlicher Zuschuss" wert={euro(r.pflichtzuschussMonat)} />}
              {r.freiwilligMonat > 0.005 && (
                <Posten text={firma.angebot.modell.art === 'matching' ? '+ Arbeitgeber (Unterstützungskasse)' : '+ Zuschuss des Arbeitgebers'} wert={euro(r.freiwilligMonat)} />
              )}
              <Posten text="= in Ihre Vorsorge" wert={euro(r.gesamtMonat)} summe />
            </dl>
            {r.vertraege.length > 1 && r.vertraege.map((v) => (
              <p key={v.weg} className="mt-1 flex justify-between gap-2 pl-3 text-xs text-mb-schiefer">
                <span>davon {vertragName(v.weg, firma.angebot)}</span><span className="tabular-nums">{euro(v.beitragMonat)}</span>
              </p>
            ))}
          </Karte>
          {r.hinweise.map((h2) => (
            <p key={h2} className="rounded-2xl bg-mb-nebel px-4 py-3 text-xs leading-relaxed text-mb-tinte">{h2}</p>
          ))}
        </div>
      </div>

      <HochrechnungKarte h={h} rentenbeginn={rentenbeginnVon(daten.angaben)}
        setzeRendite={(renditeAnsparphase) => setze((d) => ({ ...d, hochrechnung: { ...d.hochrechnung, renditeAnsparphase } }))} />
    </div>
  );
}

/* --- 5. Leistung im Alter -------------------------------------------------- */

function Wertezeile({ titel, w, kk }: { titel: string; w: AuszahlungsWerte | null; kk: number }) {
  if (!w) return null;
  return (
    <div className="rounded-2xl bg-white p-4">
      <h4 className="text-base font-medium text-mb-tinte">{titel}</h4>
      <dl className="mt-2 text-[13px]">
        <Posten text="Rente brutto" wert={euro(w.bruttoMonat)} />
        <Posten text="− Kranken- und Pflegeversicherung" wert={euro(w.kvPvMonat)} />
        <Posten text="− Steuer" wert={euro(w.steuerMonat)} />
        <Posten text="= netto im Monat" wert={euro(w.nettoMonat)} summe />
      </dl>
      <p className="mt-2 text-xs text-mb-schiefer">in heutiger Kaufkraft rund {euro(w.nettoMonat / kk)}</p>
    </div>
  );
}

/**
 * „Ihre Belastung“ — dieselbe Treppe wie im Vertrags-TUEV: vom Beitrag in den
 * Vertrag zu dem, was es wirklich kostet. Im Rahmen der Kaesten daneben.
 */
function BelastungKasten({ treppe }: { treppe: BelastungsTreppe }) {
  return (
    <div className="rounded-2xl bg-white p-4">
      <h4 className="text-base font-medium text-mb-tinte">Ihre Belastung</h4>
      <p className="text-xs text-mb-schiefer">Ansparphase, im Monat</p>
      <div className="mt-3 space-y-1.5">
        <GegenueberZeile text="Gesamtbeitrag" wert={euroGenau(treppe.zufluss)} />
        {treppe.zeilen.map((z) => (
          z.art === 'summe' ? (
            <div key={z.text} className="!mt-2 border-t border-mb-linie pt-2">
              <GegenueberZeile text={z.text} wert={euroGenau(z.betrag)} />
            </div>
          ) : (
            <GegenueberZeile key={z.text} text={z.text} wert={euroGenau(z.betrag)} farbe="text-mb-tinte" info={z.erklaerung} />
          )
        ))}
        <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-mb-tinte pt-2">
          <span className="text-sm font-medium text-mb-tinte">Kostet Sie wirklich</span>
          <span className="text-xl font-medium tabular-nums text-mb-tinte">{euroGenau(treppe.aufwand)}</span>
        </div>
      </div>
    </div>
  );
}

const WEG_TITEL: Record<KennzahlenWeg['art'], string> = { garantiert: 'Garantiert', prognose: 'Prognose', kapital: 'Kapital' };
const zahl = (x: number, stellen = 2) => x.toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen });

/**
 * Kennzahlen und Fazit — wie im Vertrags-TUEV (`VertragsTuev.tsx`, „3.
 * Kennzahlen und Fazit“), fuer den Vertrag allein: Netto-Aufwand gegen
 * Netto-Auszahlung.
 */
function KennzahlenKarte({ k, daten, setze, aktuell }: {
  k: KennzahlenErgebnis; daten: BeratungDaten; setze: SchrittProps['setze']; aktuell: boolean;
}) {
  const haupt = k.prognose ?? k.garantiert ?? k.kapital;
  if (!haupt) return null;
  const istKapital = haupt.art === 'kapital';
  const wege = [k.garantiert, k.prognose, k.kapital].filter((x): x is KennzahlenWeg => x !== null);
  const laufzeit = laufzeitText(k.monateEinzahlung);

  return (
    <Karte titel="Kennzahlen und Fazit">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-xl text-sm leading-relaxed text-mb-schiefer">
          Ihr Netto-Aufwand gegen die Netto-Auszahlung — der Vertrag allein,{' '}
          {istKapital ? `mit der ${k.geschaetzt ? 'geschätzten ' : ''}Kapitalauszahlung`
            : haupt.art === 'prognose' ? (k.geschaetzt ? 'mit der geschätzten Rente aus der Hochrechnung' : 'mit der prognostizierten Rente')
              : 'mit der garantierten Rente'}.
        </p>
        <div className="w-44">
          <ZahlFeld label="Rente bis zum Alter von" wert={daten.lebenserwartung} min={60} max={120} schritt={1} stufen einheit="J."
            onChange={(n) => setze((d) => ({ ...d, lebenserwartung: Math.min(120, Math.max(60, Math.round(n))) }))} />
        </div>
      </div>

      {/* Ohne Ampel: Ob sich der Vertrag rechnet, sagen die Zahlen und das Fazit — nicht Gruen oder Rot. */}
      <div className={`mt-4 rounded-2xl bg-white p-4 sm:p-5 ${aktuell ? '' : 'opacity-60'}`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kennzahl titel="Netto-Hebel" wert={`${zahl(haupt.nettoHebel)} ×`} farbe="text-mb-tinte"
            fussnote="Auszahlung je Euro Einzahlung"
            info={(
              <>
                {euro(haupt.summeAuszahlung)} Auszahlung geteilt durch {euro(haupt.summeEinzahlung)} eigenen Aufwand über {laufzeit}.{' '}
                <strong>Beide Seiten netto</strong>: oben nach Steuer und Kranken- und Pflegeversicherung im Alter, unten nach der
                Steuer- und Sozialabgabenersparnis. Ohne Verzinsung gerechnet — was das Geld dann wert ist, sagt die Rendite daneben.
              </>
            )} />
          <Kennzahl titel="Nettorendite" wert={`${zahl(haupt.rendite * 100)} %`} farbe="text-mb-tinte"
            fussnote="p. a. nach allen Abzügen"
            info={(
              <>
                Der interne Zinsfuß Ihrer Zahlungsreihe: der Zinssatz, bei dem {laufzeit} Einzahlung und{' '}
                {istKapital ? 'die Kapitalauszahlung' : `${k.jahreAuszahlung} Jahre Rente`} genau aufgehen. Anders als der Hebel{' '}
                <strong>berücksichtigt er, wann</strong> jeder Euro fließt.
              </>
            )} />
          <Kennzahl titel="Netto-Gewinn" wert={euro(haupt.echterGewinn)} farbe="text-mb-tinte"
            fussnote={istKapital ? 'mit der Kapitalauszahlung' : `bis ${k.lebenserwartung}`} />
          {!istKapital && (
            <Kennzahl titel="Amortisation" wert={`${zahl(haupt.amortisationsJahre, 1)} J.`} fussnote="ab Rentenbeginn" />
          )}
        </div>
        <div className="mt-4 space-y-1.5 border-t border-mb-linie pt-3">
          <GegenueberZeile text={`Eingezahlt, netto (${laufzeit})`} wert={euro(haupt.summeEinzahlung)} farbe="text-mb-tinte" />
          <GegenueberZeile text={istKapital ? 'Ausgezahlt, netto (einmalig)' : `Ausgezahlt, netto (${k.jahreAuszahlung} Jahre bis ${k.lebenserwartung})`}
            wert={euro(haupt.summeAuszahlung)} farbe="text-mb-tinte" />
        </div>
      </div>

      {wege.length > 1 && (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[20rem] text-sm">
            <thead>
              <tr className="text-mb-schiefer">
                <th className="py-2 text-left font-normal" />
                {wege.map((w) => <th key={w.art} className="py-2 pl-2 text-right font-normal">{WEG_TITEL[w.art]}</th>)}
              </tr>
            </thead>
            <tbody className="tabular-nums text-mb-tinte">
              {([
                ['Netto', (w: KennzahlenWeg) => (w.art === 'kapital' ? euro(w.netto) : `${euro(w.netto)} / Mon.`)],
                ['Netto-Hebel', (w: KennzahlenWeg) => `${zahl(w.nettoHebel)} ×`],
                ['Nettorendite', (w: KennzahlenWeg) => `${zahl(w.rendite * 100)} %`],
                ['Netto-Gewinn', (w: KennzahlenWeg) => euro(w.echterGewinn)],
                ['Amortisation', (w: KennzahlenWeg) => (w.art === 'kapital' ? '—' : `${zahl(w.amortisationsJahre, 1)} J.`)],
              ] as const).map(([text, wert]) => (
                <tr key={text} className="border-t border-mb-linie">
                  <td className="py-2 text-mb-schiefer">{text}</td>
                  {wege.map((w) => <td key={w.art} className="py-2 pl-2 text-right">{wert(w)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Das Fazit ist die Aussage dieses Schritts — die eine Akzentkarte. */}
      <div className={`${PFIRSICH} mt-6 p-6 sm:p-8`}>
        <p className="text-sm">Fazit</p>
        <p className="mt-2 max-w-4xl font-titel text-[20px] leading-[1.45] sm:text-[24px]">{fazitText(k)}</p>
      </div>
    </Karte>
  );
}

export function SchrittLeistung({ firma, daten, setze, r, leistung, kennzahlen, aktuell }: SchrittProps & {
  kennzahlen: KennzahlenErgebnis | null; aktuell: boolean;
}) {
  const a = firma.angebot;
  const setzeW = (weg: 'direkt' | 'ukasse', p: Partial<VersichererWerte>) =>
    setze((d) => ({ ...d, versicherer: { ...d.versicherer, [weg]: { ...d.versicherer[weg], ...p } } }));
  // Von Hand geaenderte Prognosewerte stammen nicht mehr aus der Hochrechnung
  const setzePrognose = (weg: 'direkt' | 'ukasse', p: Partial<VersichererWerte>) => setzeW(weg, { ...p, ausHochrechnung: false });
  const ohneGeburt = !rentenbeginnVon(daten.angaben);
  const h = hochrechnung(firma.angebot, daten, r);

  if (r.vertraege.length === 0) {
    return <Karte><p className="text-sm text-mb-tinte">Ohne Umwandlung gibt es keinen Vertrag — bitte in Schritt 4 einen Betrag wählen.</p></Karte>;
  }
  return (
    <div className="space-y-6">
      <p className="max-w-4xl text-base leading-relaxed text-mb-schiefer">
        Tragen Sie die Werte aus dem Angebot des Versicherers ein — oder übernehmen Sie die geschätzte Hochrechnung aus „Ihre
        Rechnung“. Daraus wird die Rente nach Kranken- und Pflegeversicherung und Steuer im ersten
        Rentenjahr{leistung ? ` (${leistung.rentenbeginnJahr})` : ''}.
      </p>
      {r.vertraege.map((v) => {
        const w = daten.versicherer[v.weg];
        const l = leistung?.vertraege.find((x) => x.weg === v.weg) ?? null;
        const traeger = traegerText(v.weg, a);
        const schaetzung = h.monate > 0 ? hochrechnungJeVertrag(h, r, v.weg) : null;
        const veraltet = w.ausHochrechnung && schaetzung !== null
          && (Math.abs(w.prognoseRente - schaetzung.renteMonat) >= 1 || Math.abs(w.prognoseKapital - schaetzung.kapital) >= 1);
        // Die Hochrechnung rechnet mit gleichbleibenden Beitraegen — deshalb ohne Dynamik
        const uebernehmen = () => schaetzung && setzeW(v.weg, {
          prognoseRente: schaetzung.renteMonat, prognoseKapital: schaetzung.kapital, dynamik: 0, ausHochrechnung: true,
        });
        // „Ihre Belastung“ steht beim Vertrag, in den die Umwandlung fliesst
        const belastung = belastungJeVertrag(v, r, daten.angaben, firma.angebot);
        return (
          <Karte key={v.weg} titel={`${vertragName(v.weg, a)}${traeger ? ` — ${traeger}` : ''}`}
            rechts={w.ausHochrechnung ? <Vermerk>Prognose aus der geschätzten Hochrechnung</Vermerk> : undefined}>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
              <div className="space-y-3 lg:col-span-5">
                <ZahlFeld label="Beitrag laut Angebot im Monat" wert={w.beitragMonat > 0 ? w.beitragMonat : Math.round(v.beitragMonat * 100) / 100}
                  onChange={(beitragMonat) => setzeW(v.weg, { beitragMonat })} einheit="€" schritt={10}
                  hilfe={`Aus der Rechnung: ${euroGenau(v.beitragMonat)}, davon Arbeitgeber ${euroGenau(v.arbeitgeberMonat)}.`} />
                <ZahlFeld label="Garantierte Rente im Monat" wert={w.garantierteRente} onChange={(garantierteRente) => setzeW(v.weg, { garantierteRente })} einheit="€" schritt={10} />
                <ZahlFeld label="Prognostizierte Rente im Monat" wert={w.prognoseRente} onChange={(prognoseRente) => setzePrognose(v.weg, { prognoseRente })} einheit="€" schritt={10} />
                <ZahlFeld label="Kapital zum Rentenbeginn (Prognose)" wert={w.prognoseKapital} onChange={(prognoseKapital) => setzePrognose(v.weg, { prognoseKapital })} einheit="€" schritt={1000} />
                <ProzentFeld label="Dynamik des Beitrags" wert={w.dynamik} onChange={(dynamik) => setzeW(v.weg, { dynamik })} max={10} />
                {schaetzung && (!w.ausHochrechnung || veraltet) && (
                  <div className="rounded-2xl bg-white p-4">
                    <button type="button" onClick={uebernehmen} className={KNOPF_ZWEIT}>
                      <Wand2 className="h-4 w-4" aria-hidden /> {veraltet ? 'Hochrechnung erneut übernehmen' : 'Geschätzte Hochrechnung übernehmen'}
                    </button>
                    <p className="mt-2 text-xs leading-relaxed text-mb-schiefer">
                      {veraltet ? <strong className="font-medium text-mb-tinte">Die Hochrechnung hat sich seit der Übernahme geändert. </strong> : ''}
                      Aus „Ihre Rechnung“: Kapital {euro(schaetzung.kapital)} und Rente {euro(schaetzung.renteMonat)} im Monat — als
                      Prognose, gekennzeichnet als geschätzt.
                    </p>
                  </div>
                )}
                {w.ausHochrechnung && !veraltet && (
                  <p className="text-xs leading-relaxed text-mb-schiefer">
                    Rente und Kapital stammen aus der geschätzten Hochrechnung — keine Zusage. Liegt das Angebot des Versicherers vor,
                    tragen Sie dessen Werte einfach darüber ein.
                  </p>
                )}
              </div>
              <div className={`space-y-3 lg:col-span-7 ${aktuell ? '' : 'opacity-60'}`}>
                {/* Oben die Belastung neben der Prognose; die garantierten Werte stehen nur unten in den Kennzahlen. */}
                {(belastung || l?.prognose) && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {belastung && <BelastungKasten treppe={belastung} />}
                    {l && leistung && (
                      <Wertezeile titel={w.ausHochrechnung ? 'Prognose (geschätzt)' : 'Prognose'} w={l.prognose} kk={leistung.kaufkraftfaktor} />
                    )}
                  </div>
                )}
                {ohneGeburt && <p className="text-sm text-mb-tinte">Für die Rechnung fehlt das Geburtsdatum (Schritt 2).</p>}
                {!ohneGeburt && !l && <p className="text-sm text-mb-schiefer">Mit einer Rente oder einem Kapital aus dem Angebot erscheint hier, was netto bleibt.</p>}
                {l?.kapital && (
                  <div className="rounded-2xl bg-white p-4">
                    <h4 className="text-base font-medium text-mb-tinte">Oder als Kapital ({w.ausHochrechnung ? 'geschätzt' : 'Prognose'})</h4>
                    <dl className="mt-2 text-[13px]">
                      <Posten text="Kapital brutto" wert={euro(l.kapital.brutto)} />
                      <Posten text="− Steuer" wert={euro(l.kapital.steuer)} />
                      <Posten text="− Kranken- und Pflegeversicherung (10 Jahre)" wert={euro(l.kapital.kvPv)} />
                      <Posten text="= netto" wert={euro(l.kapital.netto)} summe />
                    </dl>
                    {l.breakEven && Number.isFinite(l.breakEven.breakEvenOhneZins) && (
                      <p className="mt-2 text-xs text-mb-schiefer">
                        Die Rente holt das Kapital mit rund {Math.floor(l.breakEven.breakEvenOhneZins)} Jahren ein.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Karte>
        );
      })}

      {kennzahlen && (
        <KennzahlenKarte k={kennzahlen} daten={daten} setze={setze} aktuell={aktuell} />
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

export function SchrittEntscheidung(props: SchrittProps & UnterlagenProps) {
  const { firma, logo, daten, setze, r, leistung, geheZu, auftritt, sichern, luecke, kennzahlen } = props;
  const drucken = useDrucken();
  const e = daten.entscheidung;
  const setzeE = (p: Partial<BeratungDaten['entscheidung']>) => setze((d) => ({ ...d, entscheidung: { ...d.entscheidung, ...p } }));
  const heute = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  // Vorbelegt mit dem naechsten Monatsersten (oder dem Beginn laut Angebot); mit „Ich nehme teil“ steht er fest.
  const autoBeginn = automatischerBeginn(firma.angebot);
  const waehle = (status: BeratungStatus) => setzeE({
    status,
    datum: e.datum || heute,
    ...(status === 'teilnahme' && !e.beginn ? { beginn: autoBeginn } : {}),
  });

  return (
    <div className="space-y-6">
      <Karte titel="Die Entscheidung">
        <div role="radiogroup" aria-label="Entscheidung" className="grid gap-2 sm:grid-cols-3">
          {WAHL.map((w) => (
            <button key={w.status} type="button" role="radio" aria-checked={e.status === w.status}
              onClick={() => waehle(w.status)}
              className={`flex items-center gap-2 rounded-full border px-5 py-3 text-left text-sm font-medium transition-colors ${
                e.status === w.status ? 'border-mb-tinte bg-mb-tinte text-white' : 'border-mb-linie bg-white text-mb-tinte hover:border-mb-tinte'
              }`}>
              {w.symbol}{w.text}
            </button>
          ))}
        </div>

        {e.status === 'teilnahme' && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <span className="mb-1 block text-xs font-semibold text-slate-600">Umwandlung im Monat</span>
              <p className="font-titel text-[34px] leading-tight tabular-nums text-mb-tinte">{euroGenau(r.umwandlungMonat)}</p>
              <button type="button" onClick={() => geheZu(3)} className={`${LINK} text-xs`}>Betrag ändern →</button>
            </div>
            <div>
              <DatumFeld label="Beginn" wert={e.beginn || autoBeginn} onChange={(beginn) => setzeE({ beginn })}
                hilfe={e.beginn && e.beginn !== autoBeginn ? 'Eingetragen.'
                  : firma.angebot.beginn ? 'Automatisch: der Beginn laut Angebot der Firma.' : 'Automatisch: der nächste Monatserste. Ändern, wenn die Umwandlung später beginnt.'} />
              {e.beginn && e.beginn !== autoBeginn && (
                <button type="button" onClick={() => setzeE({ beginn: autoBeginn })} className={`mt-1 ${LINK} text-xs`}>
                  {firma.angebot.beginn ? 'Beginn laut Angebot' : 'Nächsten Monatsersten'} verwenden ({autoBeginn})
                </button>
              )}
            </div>
          </div>
        )}
        {e.status === 'verzicht' && (
          <div className="mt-4">
            <TextBereich label="Grund (freiwillig)" wert={e.grund} onChange={(grund) => setzeE({ grund })} maxLaenge={500} zeilen={2} />
          </div>
        )}
        {e.status === 'offen' && (
          <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl bg-white p-4">
            <p className="min-w-0 flex-1 basis-64 text-sm leading-relaxed text-mb-tinte">
              Bedenkzeit? Geben Sie die Gesprächsunterlagen mit — alles aus dem Gespräch zum Nachlesen, mit Ihrem Kontakt für
              Rückfragen.
            </p>
            <button type="button" className={`${KNOPF} max-w-full text-left`}
              onClick={() => { void sichern(daten); drucken(<Gespraechsunterlagen {...{ firma, logo, daten, r, leistung, auftritt, luecke, kennzahlen }} />); }}>
              <Printer className="h-4 w-4" aria-hidden /> Gesprächsunterlagen drucken
            </button>
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

export function SchrittUnterlagen(props: SchrittProps & UnterlagenProps) {
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
      <p className="text-sm leading-relaxed text-mb-schiefer">
        Drucken Sie die Unterlagen aus oder speichern Sie sie als PDF. Unterschrieben gehen sie an die Personalabteilung,
        eine Kopie bekommt {daten.angaben.name || 'der Mitarbeiter'}.
      </p>
      {/* Das weiche Trennzeichen bricht das lange Wort auf dem Telefon, statt es ueber den Rand ragen zu lassen. */}
      <div className="mt-5 flex flex-wrap gap-2">
        {status === 'offen' && knopf('Gesprächsunterlagen', <FileText className="h-4 w-4" aria-hidden />, <Gespraechsunterlagen {...dok} />, true)}
        {knopf('Beratungsprotokoll', <Printer className="h-4 w-4" aria-hidden />, <Protokoll {...dok} />, status !== 'offen')}
        {status === 'teilnahme' && knopf('Entgeltumwandlungs\u00ADvereinbarung', <FileSignature className="h-4 w-4" aria-hidden />, <Vereinbarung {...dok} />)}
        {status === 'verzicht' && knopf('Verzichtserklärung', <FileSignature className="h-4 w-4" aria-hidden />, <Verzicht {...dok} />)}
        {status !== 'offen' && knopf('Gesprächsunterlagen', <FileText className="h-4 w-4" aria-hidden />, <Gespraechsunterlagen {...dok} />)}
      </div>
      {status === 'offen' && (
        <p className="mt-3 text-sm text-mb-schiefer">
          Noch keine Entscheidung — die Gesprächsunterlagen bekommt {daten.angaben.name || 'der Mitarbeiter'} zum Nachlesen mit,
          das Protokoll hält den Stand fest. Vereinbarung oder Verzicht gibt es, sobald entschieden ist.
        </p>
      )}
      <p className="mt-5 text-xs leading-relaxed text-mb-schiefer">
        Vereinbarung und Verzichtserklärung sind Muster. Bitte vor der Verwendung rechtlich prüfen lassen und mit der
        Versorgungsordnung der Firma abgleichen.
      </p>
    </Karte>
  );
}
