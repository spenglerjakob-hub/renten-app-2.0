import type { CSSProperties, ReactNode } from 'react';
import type { MitarbeiterBav } from '@renten/engine';
import type { BeratungDaten } from '@renten/schema';
import type { Firma, UnterschriftPerson } from '../lib/bav-beratung';
import { akzentVariablen, fusszeileCss, type Auftritt } from '../features/auftritt';
import { DeckblattKopf } from '../druck/DeckblattKopf';
import { laufzeitText } from '../features/tuev-berechnung';
import { LueckenRing } from './bausteine';
import { KRANKENKASSEN } from '../features/krankenkassen';
import { euroGenau } from '../components/Feld';
import {
  P, beginnDatum, belastungJeVertrag, grvVon, hochrechnung, probeabrechnung, rentenbeginnVon,
  type AuszahlungsWerte, type BelastungsTreppe, type KennzahlenErgebnis, type KennzahlenWeg, type Leistung, type Versorgungsluecke,
} from './rechnung';
import {
  MODELL_NAME, fazitText, festePunkte, firmenHinweise, regelFuerVereinbarung, regelText, traegerText, vertragName, WEG_NAME,
} from './texte';
import { STATUS_TEXT, anzahlText, type UebersichtSummen, type UebersichtZeile } from './uebersicht-daten';

/**
 * Die Unterlagen der Mitarbeiterberatung — fuer `window.print` (DruckBereich).
 *
 * Das PROTOKOLL ist das Dokument des Beraters: mit seinem Briefkopf aus dem
 * Auftritt und seiner Fusszeile, wie das Gutachten. VEREINBARUNG und
 * VERZICHT schliessen Arbeitgeber und Mitarbeiter: Sie tragen die Firma im
 * Kopf und sind als Muster gekennzeichnet — die Texte muss vor der
 * Verwendung jemand rechtlich pruefen. Die UEBERSICHT fuer den Arbeitgeber
 * kommt wieder vom Berater.
 */
export interface DokumentProps {
  firma: Firma;
  logo: string | null;
  daten: BeratungDaten;
  r: MitarbeiterBav;
  leistung: Leistung | null;
  auftritt: Auftritt | null;
  /** Nur fuer das Protokoll; fehlen sie, entfallen die Abschnitte */
  luecke?: Versorgungsluecke | null;
  kennzahlen?: KennzahlenErgebnis | null;
}

const LINIE = '__________________________';

function Abschnitt({ titel, children, umbruch = false, teilbar = false }: {
  titel: string; children: ReactNode; umbruch?: boolean;
  /** Lange Abschnitte duerfen ueber die Seite laufen; ihre Teile halten dann selbst zusammen */
  teilbar?: boolean;
}) {
  return (
    <section className={`mt-5 ${teilbar ? '' : 'break-inside-avoid'} ${umbruch ? 'break-before-page' : ''}`}>
      <h2 className="border-b border-[color:var(--akzent-linie,#1e293b)] pb-0.5 text-[12pt] font-black text-[color:var(--akzent-titel,#0f172a)]">{titel}</h2>
      <div className="mt-2 text-[10pt] leading-snug">{children}</div>
    </section>
  );
}

function Paare({ zeilen }: { zeilen: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(0,14rem)_minmax(0,1fr)] gap-x-4 gap-y-0.5">
      {zeilen.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-slate-600">{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Betrag({ text, wert, summe = false }: { text: string; wert: number; summe?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${summe ? 'border-t border-slate-400 pt-0.5 font-bold' : ''}`}>
      <span>{text}</span><span className="tabular-nums">{euroGenau(wert)}</span>
    </div>
  );
}

/**
 * Eine Zeile zum Unterschreiben. Mit `feld` kann die Person am Bildschirm
 * unterschreiben: Der Druck der festgeschriebenen Fassung setzt Unterschrift
 * und Vermerk in die Platzhalter (festschreiben.tsx). Leer bleibt die Zeile
 * fuer Papier — wie die des Arbeitgebers.
 */
interface UnterschriftsZeile { wer: string; feld?: UnterschriftPerson }

function Unterschriften({ links, rechts, ort }: { links: UnterschriftsZeile; rechts: UnterschriftsZeile; ort: string }) {
  return (
    <div className="mt-6 grid grid-cols-2 gap-10 text-[9pt] text-slate-700 break-inside-avoid">
      {[links, rechts].map((z) => (
        <div key={z.wer}>
          <div className="flex h-[16mm] items-end justify-between gap-3">
            <p className="shrink-0">{ort}</p>
            {z.feld && <div data-unterschrift={z.feld} className="flex h-full min-w-0 flex-1 items-end justify-end" />}
          </div>
          <p className="border-t border-slate-500 pt-1">Ort, Datum, Unterschrift {z.wer}</p>
          {z.feld && <p data-vermerk={z.feld} className="text-[7.5pt] leading-snug text-slate-500" />}
        </div>
      ))}
    </div>
  );
}

const ortDatum = (d: BeratungDaten) => [d.entscheidung.ort.trim(), d.entscheidung.datum].filter(Boolean).join(', ');

/** Was jede Unterlage als Kopf traegt, wenn sie nicht vom Berater kommt: die Firma. */
export function FirmenKopf({ firma, logo }: { firma: Firma; logo: string | null }) {
  return (
    <div className="flex items-start justify-between gap-6 border-b-2 border-slate-800 pb-3">
      <div>
        <p className="text-[14pt] font-black">{firma.name}</p>
        {firma.angebot.anschrift && <p className="whitespace-pre-line text-[9pt] text-slate-600">{firma.angebot.anschrift}</p>}
      </div>
      {logo && <img src={logo} alt="" className="h-14 max-w-[12rem] object-contain" />}
    </div>
  );
}

function Muster() {
  return (
    <p className="mt-6 border-t border-slate-300 pt-1 text-[8pt] text-slate-500">
      Muster, erstellt mit dem JS-Rentenplaner. Vor der Verwendung rechtlich prüfen lassen und mit der Versorgungsordnung abgleichen.
    </p>
  );
}

const WEG_IM_SATZ = (weg: 'direkt' | 'ukasse', firma: Firma) =>
  weg === 'ukasse'
    ? `die Unterstützungskasse${firma.angebot.ukasse ? ` ${firma.angebot.ukasse}` : ''}`
    : `eine ${WEG_NAME[firma.angebot.durchfuehrungsweg]}${traegerText('direkt', firma.angebot) ? ` bei ${traegerText('direkt', firma.angebot)}` : ''}`;

/* --- Beratungsprotokoll --------------------------------------------------- */

const prozentZahl = (x: number) => `${(Math.round(x * 10000) / 100).toLocaleString('de-DE')} %`;

/** Die Angaben des Mitarbeiters — im Protokoll und in den Gespraechsunterlagen dieselben Zeilen. */
function angabenZeilen(daten: BeratungDaten, firma: Firma): [string, ReactNode][] {
  const a = daten.angaben;
  const grv = grvVon(a.jahresbrutto, a.grvRente, a.geburtsdatum, rentenbeginnVon(a));
  const kasse = KRANKENKASSEN.find((k) => k.name === a.krankenkasse);
  const kinder = a.kinder.length === 0 ? 'keine' : `${a.kinder.length} (Geburtsjahre ${a.kinder.map((k) => k.geburtsjahr).join(', ')})`;
  return [
    ['Geburtsdatum', a.geburtsdatum || '—'],
    ['Bruttogehalt im Jahr', euroGenau(a.jahresbrutto)],
    ['Bundesland', a.bundesland || firma.angebot.bundesland],
    ['Familienstand', a.verheiratet ? `verheiratet${a.partnerBrutto > 0 ? `, Partner ${euroGenau(a.partnerBrutto)} brutto im Jahr` : ', Partner ohne Einkommen'}` : 'ledig'],
    ['Kirchensteuer', a.kirchensteuer ? 'ja' : 'nein'],
    ['Kinder', kinder],
    ['Krankenversicherung', a.kv === 'privat'
      ? `privat, ${euroGenau(a.pkvPraemieMonat)} im Monat`
      : `gesetzlich${kasse ? `, ${kasse.name}` : ''}, Zusatzbeitrag ${prozentZahl(a.zusatzbeitrag)}`],
    ['Gesetzliche Rente', grv.monat > 0
      ? `${euroGenau(grv.monat)} im Monat nach heutigem Stand (${grv.geschaetzt ? 'aus dem Gehalt geschätzt' : 'eingetragen'})`
      : 'nicht angegeben'],
    ['Rentenbeginn', rentenbeginnVon(a) ?? '—'],
    ['Bestehende Betriebsrente', a.bavBestandMonat > 0 ? `${euroGenau(a.bavBestandMonat)} Beitrag im Monat` : 'keine'],
  ];
}

/** Woher die Leistung stammt — je Vertrag aus dem Angebot oder aus der geschaetzten Hochrechnung. */
function quelleDerLeistung(ausHochrechnung: boolean[]): string {
  if (ausHochrechnung.every(Boolean)) return 'laut geschätzter Hochrechnung';
  return ausHochrechnung.some(Boolean) ? 'laut Angebot und geschätzter Hochrechnung' : 'laut Angebot';
}

function LeistungsZeile({ titel, w }: { titel: string; w: AuszahlungsWerte | null }) {
  if (!w) return null;
  return (
    <div className="mt-1">
      <p className="font-bold">{titel}</p>
      <Betrag text="Rente brutto" wert={w.bruttoMonat} />
      <Betrag text="− Kranken- und Pflegeversicherung" wert={w.kvPvMonat} />
      <Betrag text="− Steuer" wert={w.steuerMonat} />
      <Betrag text="= netto im Monat" wert={w.nettoMonat} summe />
    </div>
  );
}

export function Protokoll({ firma, logo, daten, r, leistung, auftritt, luecke, kennzahlen }: DokumentProps) {
  const a = daten.angaben;
  const e = daten.entscheidung;
  const fussCss = fusszeileCss(auftritt);
  const abrechnung = probeabrechnung(firma.angebot, daten, r);
  const h = hochrechnung(firma.angebot, daten, r);
  const kz = kennzahlen ? kennzahlen.prognose ?? kennzahlen.garantiert ?? kennzahlen.kapital : null;
  const zahl = (x: number, stellen = 2) => x.toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen });
  const prozent = prozentZahl;

  return (
    <article className="text-slate-900" style={akzentVariablen(auftritt) as CSSProperties}>
      {fussCss && <style>{fussCss}</style>}
      <DeckblattKopf auftritt={auftritt} />
      {/* Oben der Berater, neben dem Titel die Firma, um deren Angebot es geht */}
      <div className="mt-5 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-[18pt] font-black text-[color:var(--akzent-titel,#0f172a)]">Beratungsprotokoll betriebliche Altersversorgung</h1>
          <p className="mt-1 text-[11pt]">für {a.name || 'den Mitarbeiter'}, {firma.name}</p>
          {ortDatum(daten) && <p className="text-[9pt] text-slate-600">Beratung: {ortDatum(daten)}</p>}
        </div>
        {logo && <img src={logo} alt="" className="h-12 max-w-[10rem] shrink-0 object-contain" />}
      </div>

      <Abschnitt titel="Anlass und Angebot der Firma">
        <p>{firma.name} bietet ihren Mitarbeitern eine Betriebsrente an. {regelText(firma.angebot.modell)}</p>
        <ul className="mt-1 list-disc pl-5">
          {r.vertraege.map((v) => (
            <li key={v.weg}>{vertragName(v.weg, firma.angebot)}{traegerText(v.weg, firma.angebot) ? `: ${traegerText(v.weg, firma.angebot)}` : ''}</li>
          ))}
        </ul>
        {firmenHinweise(firma.angebot).length > 0 && (
          <ul className="mt-1 list-disc pl-5">{firmenHinweise(firma.angebot).map((h) => <li key={h}>{h}</li>)}</ul>
        )}
      </Abschnitt>

      <Abschnitt titel="Angaben">
        <Paare zeilen={angabenZeilen(daten, firma)} />
      </Abschnitt>

      {luecke && (
        <Abschnitt titel="Versorgungslücke">
          <Paare zeilen={[
            ['Nettolohn heute', `${euroGenau(luecke.lohn.nettoMonat)} im Monat`],
            [`Gesetzliche Rente netto ${luecke.rentenbeginnJahr}`, `${euroGenau(luecke.rente.nettoMonat)} im Monat (heutige Kaufkraft)`],
            ['Versorgungslücke', `${euroGenau(luecke.lueckeMonat)} im Monat — ${luecke.lueckeProzent} % des Nettolohns`],
          ]} />
          <p className="mt-1 text-[9pt] text-slate-700">
            Die gesetzliche Rente ersetzt rund {luecke.renteProzent} % des Nettolohns{luecke.lueckeProzent > 0 ? `; es fehlen ${luecke.lueckeProzent} %` : ''}. Angenommen: Inflation{' '}
            {zahl(luecke.inflation * 100, 1)} %, Rentenanpassung {zahl(luecke.rentenanpassung * 100, 1)} % im Jahr; Steuer als Monatsanteil
            der Jahressteuer.
          </p>
        </Abschnitt>
      )}

      <Abschnitt titel="Rechnung im Monat">
        <div className="grid grid-cols-2 gap-8">
          <div>
            <Betrag text="Umwandlung" wert={r.umwandlungMonat} />
            <Betrag text="− gesparte Sozialabgaben" wert={r.svErsparnisMonat} />
            <Betrag text="− gesparte Steuer" wert={r.steuerersparnisMonat} />
            <Betrag text="= kostet netto" wert={r.nettoAufwandMonat} summe />
          </div>
          <div>
            <Betrag text="Umwandlung" wert={r.umwandlungMonat} />
            {r.pflichtzuschussMonat > 0.005 && <Betrag text="+ gesetzlicher Zuschuss" wert={r.pflichtzuschussMonat} />}
            {r.freiwilligMonat > 0.005 && <Betrag text="+ Beitrag des Arbeitgebers" wert={r.freiwilligMonat} />}
            <Betrag text="= in die Vorsorge" wert={r.gesamtMonat} summe />
          </div>
        </div>
        {r.hebel > 0 && (
          <p className="mt-1">Je 1 € netto fließen {r.hebel.toLocaleString('de-DE', { maximumFractionDigits: 2 })} € in die Vorsorge.</p>
        )}
        {r.hinweise.map((h) => <p key={h} className="mt-1 text-[9pt] text-slate-700">{h}</p>)}
        <p className="mt-1">
          Netto im Monat: {euroGenau(abrechnung.netto.ohne)} ohne, {euroGenau(abrechnung.netto.mit)} mit Betriebsrente — Eigenbeteiligung{' '}
          {euroGenau(abrechnung.eigenbeteiligungMonat)} für {euroGenau(abrechnung.gesamtMonat)} Gesamtbeitrag.
        </p>
        {h.monate > 0 && (
          <p className="mt-1 text-[9pt] text-slate-700">
            Beispielhafte, geschätzte Hochrechnung mit {prozent(h.annahmen.renditeAnsparphase)} Rendite im Jahr (keine Zusage): bis zum
            Rentenbeginn {euroGenau(Math.round(h.beitraegeSumme))} Beiträge, davon netto aus eigener Tasche{' '}
            {euroGenau(Math.round(h.nettoSumme))}; Kapital bei Rentenbeginn rund {euroGenau(Math.round(h.kapital))}, geschätzte Rente
            rund {euroGenau(Math.round(h.renteMonat))} im Monat brutto.
          </p>
        )}
      </Abschnitt>

      {leistung && leistung.vertraege.length > 0 && (
        <Abschnitt titel={`Leistung im Alter ${quelleDerLeistung(leistung.vertraege.map((l) => daten.versicherer[l.weg].ausHochrechnung))} — erstes Rentenjahr ${leistung.rentenbeginnJahr}`}>
          {leistung.vertraege.map((l) => {
            const w = daten.versicherer[l.weg];
            return (
              <div key={l.weg} className="mt-2 break-inside-avoid">
                <p className="font-bold">{vertragName(l.weg, firma.angebot)}{traegerText(l.weg, firma.angebot) ? ` — ${traegerText(l.weg, firma.angebot)}` : ''}</p>
                <p className="text-[9pt] text-slate-600">
                  Beitrag {euroGenau(w.beitragMonat > 0 ? w.beitragMonat : r.vertraege.find((v) => v.weg === l.weg)?.beitragMonat ?? 0)} im Monat
                  {w.dynamik > 0 ? `, Dynamik ${(w.dynamik * 100).toLocaleString('de-DE')} %` : ''}
                </p>
                <div className="grid grid-cols-2 gap-8">
                  <LeistungsZeile titel="Garantiert" w={l.garantiert} />
                  <LeistungsZeile titel={w.ausHochrechnung ? 'Prognose (geschätzt)' : 'Prognose'} w={l.prognose} />
                </div>
                {l.kapital && (
                  <p className="mt-1">
                    Oder als Kapital ({w.ausHochrechnung ? 'geschätzt' : 'Prognose'}): {euroGenau(l.kapital.brutto)} brutto, nach Steuer und Kranken- und Pflegeversicherung{' '}
                    {euroGenau(l.kapital.netto)}.
                    {l.breakEven && Number.isFinite(l.breakEven.breakEvenOhneZins)
                      ? ` Die Rente holt das Kapital mit rund ${Math.floor(l.breakEven.breakEvenOhneZins)} Jahren ein.` : ''}
                  </p>
                )}
              </div>
            );
          })}
          {kennzahlen && kz && (
            <div className="mt-2 break-inside-avoid">
              <p className="font-bold">Kennzahlen (Vertrag allein, Rente bis {kennzahlen.lebenserwartung})</p>
              <p>
                Netto-Hebel {zahl(kz.nettoHebel)} × · Nettorendite {zahl(kz.rendite * 100)} % p. a. · Netto-Gewinn{' '}
                {euroGenau(Math.round(kz.echterGewinn))}
                {kz.art !== 'kapital' ? ` · Amortisation ${zahl(kz.amortisationsJahre, 1)} Jahre ab Rentenbeginn` : ''}
              </p>
              <p className="mt-1">Fazit: {fazitText(kennzahlen)}</p>
            </div>
          )}
        </Abschnitt>
      )}

      <Abschnitt titel="Hinweise und Risiken">
        <ul className="list-disc space-y-0.5 pl-5">
          {festePunkte(firma.angebot).map((p) => <li key={p}>{p}</li>)}
          <li>Prognosen sind nicht garantiert. Verbindlich sind das Angebot und die Bedingungen des Versorgungsträgers.</li>
        </ul>
      </Abschnitt>

      <Abschnitt titel="Empfehlung und Entscheidung">
        {e.empfehlung.trim() && <p className="whitespace-pre-line">{e.empfehlung}</p>}
        <p className="mt-1 font-bold">
          {e.status === 'teilnahme'
            ? `Entscheidung: Teilnahme mit ${euroGenau(r.umwandlungMonat)} Umwandlung im Monat ab ${beginnDatum(daten, firma.angebot)}.`
            : e.status === 'verzicht'
              ? `Entscheidung: Verzicht${e.grund.trim() ? ` — ${e.grund.trim()}` : ''}.`
              : 'Entscheidung: noch offen (Bedenkzeit).'}
        </p>
      </Abschnitt>

      <Unterschriften links={{ wer: 'Mitarbeiter', feld: 'mitarbeiter' }} rechts={{ wer: 'Berater', feld: 'berater' }} ort={ortDatum(daten)} />
      <p className="mt-6 text-[8pt] text-slate-500">
        Modellrechnung zum Rechtsstand {P.jahr}, keine Steuer- oder Rechtsberatung. Steuer und Krankenversicherung im Alter sind
        mit den Regeln von heute fortgeschrieben.
      </p>
    </article>
  );
}

/* --- Gespraechsunterlagen ------------------------------------------------- */

const heuteText = () => new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

function AbrechnungsZeileDruck({ text, ohne, mit, summe = false }: { text: string; ohne: number | null; mit: number; summe?: boolean }) {
  return (
    <tr className={summe ? 'border-t border-slate-400 font-bold' : ''}>
      <td className="py-0.5 pr-2">{text}</td>
      <td className="py-0.5 pl-2 text-right">{ohne === null ? '—' : euroGenau(ohne)}</td>
      <td className="py-0.5 pl-2 text-right">{euroGenau(mit)}</td>
    </tr>
  );
}

function BelastungDruck({ t }: { t: BelastungsTreppe }) {
  return (
    <div className="max-w-[22rem]">
      <Betrag text="Gesamtbeitrag" wert={t.zufluss} />
      {t.zeilen.map((z) => <Betrag key={z.text} text={z.text} wert={z.betrag} summe={z.art === 'summe'} />)}
      <Betrag text="Kostet Sie wirklich" wert={t.aufwand} summe />
    </div>
  );
}

const WEG_SPALTE: Record<KennzahlenWeg['art'], string> = { garantiert: 'Garantiert', prognose: 'Prognose', kapital: 'Kapital' };

/**
 * Die Unterlagen zum Mitnehmen — fuer den Mitarbeiter geschrieben, vor allem
 * fuer den, der es sich noch ueberlegt. Sie zeichnen das Gespraech Schritt fuer
 * Schritt nach, mit seinen Angaben und Zahlen, so wie am Bildschirm: Angebot,
 * Angaben, Versorgungsluecke, Rechnung mit Probeabrechnung und Belastung,
 * Hochrechnung, Leistung im Alter. Keine Unterschriften; am Ende steht der
 * Kontakt des Beraters. Die Abschnitte sind fortlaufend nummeriert — fehlt
 * einer (etwa die Luecke ohne Geburtsdatum), rueckt der naechste nach.
 */
export function Gespraechsunterlagen({ firma, logo, daten, r, leistung, auftritt, luecke, kennzahlen }: DokumentProps) {
  const a = daten.angaben;
  const angebot = firma.angebot;
  const fussCss = fusszeileCss(auftritt);
  const abrechnung = probeabrechnung(angebot, daten, r);
  const h = hochrechnung(angebot, daten, r);
  const zahl = (x: number, stellen = 2) => x.toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen });
  const offen = daten.entscheidung.status === 'offen';
  const datum = daten.entscheidung.datum || heuteText();
  const belastungen = r.vertraege
    .map((v) => ({ v, t: belastungJeVertrag(v, r, a, angebot) }))
    .filter((x): x is { v: typeof x.v; t: BelastungsTreppe } => x.t !== null);
  const haupt = kennzahlen ? kennzahlen.prognose ?? kennzahlen.garantiert ?? kennzahlen.kapital : null;
  const wege = kennzahlen ? [kennzahlen.garantiert, kennzahlen.prognose, kennzahlen.kapital].filter((x): x is KennzahlenWeg => x !== null) : [];
  const kontakt = auftritt
    ? [auftritt.berater, auftritt.firma, auftritt.telefon && `Telefon ${auftritt.telefon}`, auftritt.email, auftritt.web].filter(Boolean)
    : [];
  let n = 0;
  const nr = () => `${(n += 1)}. `;

  return (
    <article className="text-slate-900" style={akzentVariablen(auftritt) as CSSProperties}>
      {fussCss && <style>{fussCss}</style>}
      <DeckblattKopf auftritt={auftritt} />
      <div className="mt-5 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-[18pt] font-black text-[color:var(--akzent-titel,#0f172a)]">Ihre betriebliche Altersversorgung</h1>
          <p className="mt-1 text-[11pt]">Unterlagen zu unserem Gespräch am {datum}</p>
          <p className="text-[11pt]">für {a.name || 'Sie'}, {firma.name}</p>
        </div>
        {logo && <img src={logo} alt="" className="h-12 max-w-[10rem] shrink-0 object-contain" />}
      </div>
      <p className="mt-3 text-[10.5pt] leading-relaxed">
        {offen
          ? 'Nehmen Sie sich Zeit — hier steht alles aus unserem Gespräch zum Nachlesen. Wenn Sie Fragen haben oder sich '
            + 'entschieden haben, melden Sie sich gern.'
          : 'Hier steht alles aus unserem Gespräch zum Nachlesen.'}
      </p>

      <Abschnitt titel={`${nr()}Das Angebot Ihres Arbeitgebers`}>
        {angebot.begruessung.trim() && <p className="whitespace-pre-line">{angebot.begruessung.trim()}</p>}
        <p className="mt-1 font-bold">{regelText(angebot.modell)}</p>
        <ul className="mt-1 list-disc pl-5">
          {r.vertraege.map((v) => (
            <li key={v.weg}>{vertragName(v.weg, angebot)}{traegerText(v.weg, angebot) ? `: ${traegerText(v.weg, angebot)}` : ''}</li>
          ))}
        </ul>
        {firmenHinweise(angebot).length > 0 && (
          <>
            <p className="mt-2 font-bold">Was {firma.name} dazu festgelegt hat</p>
            <ul className="list-disc pl-5">{firmenHinweise(angebot).map((x) => <li key={x}>{x}</li>)}</ul>
          </>
        )}
      </Abschnitt>

      <Abschnitt titel={`${nr()}Ihre Angaben`}>
        <Paare zeilen={angabenZeilen(daten, firma)} />
      </Abschnitt>

      {luecke && (
        <Abschnitt titel={`${nr()}Ihre Versorgungslücke`}>
          <div className="flex items-center gap-6">
            <LueckenRing nettolohn={luecke.lohn.nettoMonat} rente={luecke.rente.nettoMonat} luecke={luecke.lueckeMonat}
              renteProzent={luecke.renteProzent} lueckeProzent={luecke.lueckeProzent} />
            <div className="min-w-0 flex-1">
              <Paare zeilen={[
                ['Ihr Nettolohn heute', `${euroGenau(luecke.lohn.nettoMonat)} im Monat`],
                [`Gesetzliche Rente netto ${luecke.rentenbeginnJahr}`, `${euroGenau(luecke.rente.nettoMonat)} im Monat — ${luecke.renteProzent} %`],
                ['Versorgungslücke', `${euroGenau(luecke.lueckeMonat)} im Monat — ${luecke.lueckeProzent} %`],
              ]} />
              {luecke.lueckeProzent > 0 && (
                <p className="mt-2 font-bold">Im Alter fehlen Ihnen {luecke.lueckeProzent} % Ihres heutigen Nettolohns.</p>
              )}
              <p className="mt-1 text-[9pt] text-slate-700">
                In heutiger Kaufkraft. Angenommen: Inflation {zahl(luecke.inflation * 100, 1)} %, Rentenanpassung{' '}
                {zahl(luecke.rentenanpassung * 100, 1)} % im Jahr.
              </p>
            </div>
          </div>
        </Abschnitt>
      )}

      <Abschnitt titel={`${nr()}Ihre Rechnung`} teilbar>
        <p className="break-inside-avoid">
          Sie wandeln <strong>{euroGenau(r.umwandlungMonat)}</strong> brutto im Monat um, Ihr Arbeitgeber gibt{' '}
          {euroGenau(r.arbeitgeberMonat)} dazu — in Ihre Vorsorge fließen <strong>{euroGenau(r.gesamtMonat)}</strong>. Netto kostet
          Sie das <strong>{euroGenau(r.nettoAufwandMonat)}</strong> im Monat.
        </p>
        <div className="mt-3 break-inside-avoid">
          <p className="font-bold">Probeabrechnung: Ihr Monat ohne und mit Betriebsrente</p>
          <table className="mt-1 w-full max-w-[34rem] tabular-nums">
            <thead>
              <tr className="text-[9pt] text-slate-600">
                <th className="text-left font-semibold" />
                <th className="pl-2 text-right font-semibold">ohne bAV</th>
                <th className="pl-2 text-right font-semibold">mit bAV</th>
              </tr>
            </thead>
            <tbody>
              <AbrechnungsZeileDruck text="Bruttogehalt" ohne={abrechnung.bruttoMonat} mit={abrechnung.bruttoMonat} />
              <AbrechnungsZeileDruck text="− Entgeltumwandlung" ohne={null} mit={abrechnung.umwandlungMonat} />
              <AbrechnungsZeileDruck text="Beitrag des Arbeitgebers (fließt in den Vertrag)" ohne={null} mit={abrechnung.arbeitgeberMonat} />
              <AbrechnungsZeileDruck text="Steuerpflichtiges Brutto" ohne={abrechnung.steuerBrutto.ohne} mit={abrechnung.steuerBrutto.mit} />
              <AbrechnungsZeileDruck text="Brutto für die Sozialabgaben" ohne={abrechnung.svBrutto.ohne} mit={abrechnung.svBrutto.mit} />
              <AbrechnungsZeileDruck text="− Steuern" ohne={abrechnung.steuern.ohne} mit={abrechnung.steuern.mit} />
              <AbrechnungsZeileDruck text="− Sozialabgaben" ohne={abrechnung.sv.ohne} mit={abrechnung.sv.mit} />
              <AbrechnungsZeileDruck text="= Netto" ohne={abrechnung.netto.ohne} mit={abrechnung.netto.mit} summe />
            </tbody>
          </table>
          <p className="mt-1 text-[9pt] text-slate-700">
            Eigenbeteiligung aus dem Nettolohn {euroGenau(abrechnung.eigenbeteiligungMonat)} für {euroGenau(abrechnung.gesamtMonat)}{' '}
            Gesamtbeitrag. Steuern als Monatsanteil der Jahressteuer — auf der Gehaltsabrechnung verteilt sich die Lohnsteuer je
            nach Steuerklasse anders.
          </p>
        </div>
        {belastungen.map(({ v, t }) => (
          <div key={v.weg} className="mt-3 break-inside-avoid">
            <p className="font-bold">Ihre Belastung im Monat{belastungen.length > 1 ? ` — ${vertragName(v.weg, angebot)}` : ''}</p>
            <BelastungDruck t={t} />
          </div>
        ))}
        {h.monate > 0 && (
          <div className="mt-3 break-inside-avoid">
            <p className="font-bold">Beispielhafte und geschätzte Hochrechnung</p>
            <Paare zeilen={[
              ['Angenommene Rendite', `${prozentZahl(h.annahmen.renditeAnsparphase)} im Jahr`],
              ['Bis zum Rentenbeginn', `${laufzeitText(h.monate)}${rentenbeginnVon(a) ? `, am ${rentenbeginnVon(a)}` : ''}`],
              ['Kapital bei Rentenbeginn', euroGenau(Math.round(h.kapital))],
              ['Geschätzte Rente brutto', `${euroGenau(Math.round(h.renteMonat))} im Monat`],
            ]} />
            <p className="mt-1">
              Woraus das Kapital besteht: Ihr Netto-Aufwand {euroGenau(Math.round(h.nettoSumme))}, Steuer- und SV-Ersparnis{' '}
              {euroGenau(Math.round(h.ersparnisSumme))}, Arbeitgeber {euroGenau(Math.round(h.arbeitgeberSumme))}, Erträge{' '}
              {euroGenau(Math.round(h.ertrag))}.
            </p>
            <p className="mt-1 text-[9pt] text-slate-700">
              Beispielhafte und geschätzte Hochrechnung mit der angenommenen Rendite und gleichbleibenden Beiträgen — keine Zusage.
              Die tatsächliche Leistung hängt von der Wertentwicklung und vom Tarif ab; die Rente ist brutto, vor Kranken- und
              Pflegeversicherung und Steuer. Verbindlich ist allein das Angebot des Versicherers.
            </p>
          </div>
        )}
      </Abschnitt>

      {leistung && leistung.vertraege.length > 0 && (
        <Abschnitt titel={`${nr()}Ihre Leistung im Alter ${quelleDerLeistung(leistung.vertraege.map((l) => daten.versicherer[l.weg].ausHochrechnung))}`} teilbar>
          <p className="text-[9pt] text-slate-700">
            Im ersten Rentenjahr {leistung.rentenbeginnJahr}, nach Kranken- und Pflegeversicherung und Steuer.
          </p>
          {leistung.vertraege.map((l) => {
            const w = daten.versicherer[l.weg];
            return (
              <div key={l.weg} className="mt-2 break-inside-avoid">
                <p className="font-bold">{vertragName(l.weg, angebot)}{traegerText(l.weg, angebot) ? ` — ${traegerText(l.weg, angebot)}` : ''}</p>
                <div className="max-w-[22rem]">
                  <LeistungsZeile titel={w.ausHochrechnung ? 'Prognose (geschätzt)' : 'Prognose'} w={l.prognose} />
                </div>
                {l.kapital && (
                  <p className="mt-1">
                    Oder als Kapital ({w.ausHochrechnung ? 'geschätzt' : 'Prognose'}): {euroGenau(l.kapital.brutto)} brutto, nach Steuer und
                    Kranken- und Pflegeversicherung {euroGenau(l.kapital.netto)}.
                  </p>
                )}
              </div>
            );
          })}
          {kennzahlen && haupt && (
            <div className="mt-3 break-inside-avoid">
              <p className="font-bold">Kennzahlen (Vertrag allein, Rente bis {kennzahlen.lebenserwartung})</p>
              <p>
                Netto-Hebel {zahl(haupt.nettoHebel)} × · Nettorendite {zahl(haupt.rendite * 100)} % p. a. · Netto-Gewinn{' '}
                {euroGenau(Math.round(haupt.echterGewinn))}
                {haupt.art !== 'kapital' ? ` · Amortisation ${zahl(haupt.amortisationsJahre, 1)} Jahre ab Rentenbeginn` : ''}
              </p>
              {wege.length > 1 && (
                <table className="mt-1 w-full max-w-[34rem] tabular-nums">
                  <thead>
                    <tr className="text-[9pt] text-slate-600">
                      <th className="text-left font-semibold" />
                      {wege.map((x) => <th key={x.art} className="pl-2 text-right font-semibold">{WEG_SPALTE[x.art]}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      ['Netto', (x: KennzahlenWeg) => (x.art === 'kapital' ? euroGenau(Math.round(x.netto)) : `${euroGenau(Math.round(x.netto))} / Mon.`)],
                      ['Netto-Hebel', (x: KennzahlenWeg) => `${zahl(x.nettoHebel)} ×`],
                      ['Nettorendite', (x: KennzahlenWeg) => `${zahl(x.rendite * 100)} %`],
                      ['Netto-Gewinn', (x: KennzahlenWeg) => euroGenau(Math.round(x.echterGewinn))],
                      ['Amortisation', (x: KennzahlenWeg) => (x.art === 'kapital' ? '—' : `${zahl(x.amortisationsJahre, 1)} J.`)],
                    ] as const).map(([text, wert]) => (
                      <tr key={text} className="border-t border-slate-200">
                        <td className="py-0.5">{text}</td>
                        {wege.map((x) => <td key={x.art} className="py-0.5 pl-2 text-right">{wert(x)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="mt-2">Fazit: {fazitText(kennzahlen)}</p>
            </div>
          )}
        </Abschnitt>
      )}

      <Abschnitt titel={`${nr()}Gut zu wissen`}>
        <ul className="list-disc space-y-0.5 pl-5">
          {festePunkte(angebot).map((x) => <li key={x}>{x}</li>)}
          <li>Prognosen sind nicht garantiert. Verbindlich sind das Angebot und die Bedingungen des Versorgungsträgers.</li>
        </ul>
      </Abschnitt>

      <Abschnitt titel="Ihre Fragen beantworte ich gern">
        {kontakt.length > 0
          ? <p className="whitespace-pre-line">{kontakt.join('\n')}</p>
          : <p>Sprechen Sie mich jederzeit an.</p>}
      </Abschnitt>

      <p className="mt-6 text-[8pt] text-slate-500">
        Modellrechnung zum Rechtsstand {P.jahr}, keine Steuer- oder Rechtsberatung. Steuer und Krankenversicherung im Alter sind
        mit den Regeln von heute fortgeschrieben.
      </p>
    </article>
  );
}

/* --- Entgeltumwandlungsvereinbarung (Muster) ----------------------------- */

export function Vereinbarung({ firma, logo, daten, r }: DokumentProps) {
  const a = daten.angaben;
  const e = daten.entscheidung;
  const m = firma.angebot.modell;
  const direkt = r.vertraege.find((v) => v.weg === 'direkt');
  const ukasse = r.vertraege.find((v) => v.weg === 'ukasse');
  const umwandlungIn = m.art === 'matching' && m.weg === 'ukasse' ? 'ukasse' : 'direkt';

  return (
    <article className="text-[10.5pt] leading-relaxed text-slate-900">
      <FirmenKopf firma={firma} logo={logo} />
      <h1 className="mt-6 text-[16pt] font-black">Vereinbarung über Entgeltumwandlung</h1>
      <p className="mt-3">
        zwischen <strong>{firma.name}</strong>{firma.angebot.anschrift ? `, ${firma.angebot.anschrift.replace(/\n+/g, ', ')}` : ''} — Arbeitgeber —
      </p>
      <p>
        und <strong>{a.name || LINIE}</strong>, geboren am {a.geburtsdatum || LINIE} — Arbeitnehmer —
      </p>

      <h2 className="mt-5 font-black">1. Entgeltumwandlung</h2>
      <p>
        Der Arbeitnehmer wandelt ab dem {beginnDatum(daten, firma.angebot)} monatlich <strong>{euroGenau(r.umwandlungMonat)}</strong> seines
        Bruttoentgelts in einen Beitrag zur betrieblichen Altersversorgung um (§ 1a BetrAVG). Bei Teilzahlungsmonaten gilt
        der Betrag anteilig.
      </p>

      <h2 className="mt-4 font-black">2. Durchführung</h2>
      <p>
        Der umgewandelte Betrag fließt in {WEG_IM_SATZ(umwandlungIn, firma)}. Der Arbeitgeber schließt den Vertrag ab und zahlt
        die Beiträge; versorgungsberechtigt ist der Arbeitnehmer.
      </p>

      <h2 className="mt-4 font-black">3. Beitrag des Arbeitgebers</h2>
      <p>{regelFuerVereinbarung(m)}</p>
      <p className="mt-1">
        Bei der vereinbarten Umwandlung sind das {euroGenau(r.arbeitgeberMonat)} im Monat
        {direkt && direkt.arbeitgeberMonat > 0.005 ? ` (${euroGenau(direkt.arbeitgeberMonat)} in die ${WEG_NAME[firma.angebot.durchfuehrungsweg]})` : ''}
        {ukasse && ukasse.arbeitgeberMonat > 0.005 ? ` (${euroGenau(ukasse.arbeitgeberMonat)} in die Unterstützungskasse)` : ''}.
        {r.pflichtzuschussMonat > 0.005 ? ` Darin enthalten ist der Zuschuss nach § 1a Abs. 1a BetrAVG von ${euroGenau(r.pflichtzuschussMonat)}.` : ''}
      </p>

      <h2 className="mt-4 font-black">4. Änderung und Ende</h2>
      <p>
        Höhe und Ende der Umwandlung kann der Arbeitnehmer für die Zukunft ändern; Einzelheiten und Fristen regelt die
        Versorgungsordnung. Änderungen bedürfen der Textform.
      </p>

      <h2 className="mt-4 font-black">5. Hinweise</h2>
      <p>
        Die Anwartschaft aus der Entgeltumwandlung ist sofort unverfallbar (§ 1b Abs. 5 BetrAVG). Die Umwandlung mindert das
        beitragspflichtige Entgelt; daraus können sich geringere Leistungen der gesetzlichen Sozialversicherung ergeben.
      </p>

      <Unterschriften links={{ wer: 'Arbeitgeber' }} rechts={{ wer: 'Arbeitnehmer', feld: 'mitarbeiter' }} ort={ortDatum(daten)} />
      <Muster />
    </article>
  );
}

/* --- Verzichtserklaerung (Muster) ------------------------------------------ */

export function Verzicht({ firma, logo, daten, r }: DokumentProps) {
  const a = daten.angaben;
  const e = daten.entscheidung;
  return (
    <article className="text-[10.5pt] leading-relaxed text-slate-900">
      <FirmenKopf firma={firma} logo={logo} />
      <h1 className="mt-6 text-[16pt] font-black">Erklärung zum Verzicht auf die Entgeltumwandlung</h1>
      <p className="mt-4">
        Ich, <strong>{a.name || LINIE}</strong>, geboren am {a.geburtsdatum || LINIE}, wurde{e.datum ? ` am ${e.datum}` : ''} über mein
        Recht auf Entgeltumwandlung nach § 1a BetrAVG und über das Angebot von {firma.name} informiert:
      </p>
      <p className="mt-2 rounded border border-slate-300 px-3 py-2">{regelText(firma.angebot.modell)}</p>
      {r.umwandlungMonat > 0 && (
        <p className="mt-2">
          In der Beratung wurde mir gezeigt: Bei einer Umwandlung von {euroGenau(r.umwandlungMonat)} im Monat gibt der
          Arbeitgeber {euroGenau(r.arbeitgeberMonat)} dazu, und mich kostet sie netto rund {euroGenau(r.nettoAufwandMonat)}.
        </p>
      )}
      <p className="mt-3">
        Ich nehme das Angebot derzeit nicht in Anspruch. Mir ist bekannt, dass ich mich jederzeit später für eine
        Entgeltumwandlung entscheiden kann; einen Zuschuss für die Zeit bis dahin gibt es nicht.
      </p>
      {e.grund.trim() && <p className="mt-3"><span className="text-slate-600">Grund (freiwillig):</span> {e.grund.trim()}</p>}

      <Unterschriften links={{ wer: 'Arbeitnehmer', feld: 'mitarbeiter' }} rechts={{ wer: 'Arbeitgeber (Kenntnisnahme)' }} ort={ortDatum(daten)} />
      <Muster />
    </article>
  );
}

/* --- Uebersicht fuer den Arbeitgeber ----------------------------------------- */

/**
 * Was der Berater der Personalabteilung gibt: wer teilnimmt, mit welchem
 * Betrag und ab wann. Ein Dokument des Beraters — mit seinem Briefkopf.
 */
export function UebersichtDruck({ firma, logo, zeilen, summen, auftritt }: {
  firma: Firma; logo: string | null; zeilen: readonly UebersichtZeile[]; summen: UebersichtSummen; auftritt: Auftritt | null;
}) {
  const fussCss = fusszeileCss(auftritt);
  const zelle = 'border-b border-slate-200 px-1.5 py-1 align-top';
  const zahl = `${zelle} text-right tabular-nums`;
  return (
    <article className="text-slate-900" style={akzentVariablen(auftritt) as CSSProperties}>
      {fussCss && <style>{fussCss}</style>}
      <DeckblattKopf auftritt={auftritt} />
      <div className="mt-5 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-[18pt] font-black text-[color:var(--akzent-titel,#0f172a)]">Betriebliche Altersversorgung: Stand der Beratungen</h1>
          <p className="mt-1 text-[11pt]">{firma.name}</p>
          <p className="text-[9pt] text-slate-600">
            {MODELL_NAME[firma.angebot.modell.art]}: {regelText(firma.angebot.modell)} Stand {new Date().toLocaleDateString('de-DE')}.
          </p>
        </div>
        {logo && <img src={logo} alt="" className="h-12 max-w-[10rem] shrink-0 object-contain" />}
      </div>

      <p className="mt-4 text-[10pt]">
        {[anzahlText('teilnahme', summen.teilnahmen), anzahlText('verzicht', summen.verzichte), anzahlText('offen', summen.offen)].join(' · ')}
      </p>

      <table className="mt-2 w-full border-collapse text-[9.5pt]">
        <thead>
          <tr className="text-left text-[8.5pt] text-slate-600">
            <th className={zelle}>Name</th>
            <th className={zelle}>Entscheidung</th>
            <th className={`${zelle} text-right`}>Umwandlung</th>
            <th className={`${zelle} text-right`}>Arbeitgeber</th>
            <th className={`${zelle} text-right`}>Beitrag gesamt</th>
            <th className={zelle}>Beginn</th>
          </tr>
        </thead>
        <tbody>
          {zeilen.map((z, i) => (
            <tr key={`${z.name}-${i}`} className="break-inside-avoid">
              <td className={zelle}>{z.name}</td>
              <td className={zelle}>{STATUS_TEXT[z.status]}</td>
              <td className={zahl}>{z.status === 'teilnahme' ? euroGenau(z.umwandlungMonat) : ''}</td>
              <td className={zahl}>{z.status === 'teilnahme' ? euroGenau(z.arbeitgeberMonat) : ''}</td>
              <td className={zahl}>{z.status === 'teilnahme' ? euroGenau(z.gesamtMonat) : ''}</td>
              <td className={zelle}>{z.beginn}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="font-bold">
          <tr>
            <td className={zelle} colSpan={2}>Summe im Monat</td>
            <td className={zahl}>{euroGenau(summen.umwandlungMonat)}</td>
            <td className={zahl}>{euroGenau(summen.arbeitgeberMonat)}</td>
            <td className={zahl}>{euroGenau(summen.gesamtMonat)}</td>
            <td className={zelle} />
          </tr>
          <tr className="text-slate-700">
            <td className={zelle} colSpan={2}>Im Jahr</td>
            <td className={zahl}>{euroGenau(summen.umwandlungMonat * 12)}</td>
            <td className={zahl}>{euroGenau(summen.arbeitgeberMonat * 12)}</td>
            <td className={zahl}>{euroGenau(summen.gesamtMonat * 12)}</td>
            <td className={zelle} />
          </tr>
        </tfoot>
      </table>

      <p className="mt-4 text-[8.5pt] leading-snug text-slate-600">
        Beträge im Monat laut Beratung. Maßgeblich sind die unterschriebenen Vereinbarungen. Der Arbeitgeberbeitrag enthält
        den Zuschuss nach § 1a Abs. 1a BetrAVG, soweit er anfällt. Gehälter und weitere persönliche Angaben enthält diese
        Übersicht bewusst nicht.
      </p>
    </article>
  );
}
