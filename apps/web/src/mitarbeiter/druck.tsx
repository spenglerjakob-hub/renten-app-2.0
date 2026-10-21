import type { CSSProperties, ReactNode } from 'react';
import type { MitarbeiterBav } from '@renten/engine';
import type { BeratungDaten } from '@renten/schema';
import type { Firma } from '../lib/bav-beratung';
import { akzentVariablen, fusszeileCss, type Auftritt } from '../features/auftritt';
import { DeckblattKopf } from '../druck/DeckblattKopf';
import { KRANKENKASSEN } from '../features/krankenkassen';
import { euroGenau } from '../components/Feld';
import {
  P, grvMinderungVon, grvVon, hochrechnung, probeabrechnung, rentenbeginnVon,
  type AuszahlungsWerte, type KennzahlenErgebnis, type Leistung, type Versorgungsluecke,
} from './rechnung';
import {
  MODELL_NAME, fazitText, festePunkte, firmenHinweise, minderungText, regelFuerVereinbarung, regelText, traegerText, vertragName, WEG_NAME,
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

function Abschnitt({ titel, children, umbruch = false }: { titel: string; children: ReactNode; umbruch?: boolean }) {
  return (
    <section className={`mt-5 break-inside-avoid ${umbruch ? 'break-before-page' : ''}`}>
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

function Unterschriften({ links, rechts, ort }: { links: string; rechts: string; ort: string }) {
  return (
    <div className="mt-10 grid grid-cols-2 gap-10 text-[9pt] text-slate-700 break-inside-avoid">
      {[links, rechts].map((wer) => (
        <div key={wer}>
          <p className="h-6">{ort}</p>
          <p className="border-t border-slate-500 pt-1">Ort, Datum, Unterschrift {wer}</p>
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
  const minderung = grvMinderungVon(daten, firma.angebot, r);
  const grv = grvVon(a.jahresbrutto, a.grvRente, a.geburtsdatum, rentenbeginnVon(a));
  const abrechnung = probeabrechnung(firma.angebot, daten, r);
  const h = hochrechnung(firma.angebot, daten, r);
  const kz = kennzahlen ? kennzahlen.prognose ?? kennzahlen.garantiert ?? kennzahlen.kapital : null;
  const zahl = (x: number, stellen = 2) => x.toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen });
  const kasse = KRANKENKASSEN.find((k) => k.name === a.krankenkasse);
  const prozent = (x: number) => `${(Math.round(x * 10000) / 100).toLocaleString('de-DE')} %`;
  const kinder = a.kinder.length === 0 ? 'keine' : `${a.kinder.length} (Geburtsjahre ${a.kinder.map((k) => k.geburtsjahr).join(', ')})`;

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
        <Paare zeilen={[
          ['Geburtsdatum', a.geburtsdatum || '—'],
          ['Bruttogehalt im Jahr', euroGenau(a.jahresbrutto)],
          ['Bundesland', a.bundesland || firma.angebot.bundesland],
          ['Familienstand', a.verheiratet ? `verheiratet${a.partnerBrutto > 0 ? `, Partner ${euroGenau(a.partnerBrutto)} brutto im Jahr` : ', Partner ohne Einkommen'}` : 'ledig'],
          ['Kirchensteuer', a.kirchensteuer ? 'ja' : 'nein'],
          ['Kinder', kinder],
          ['Krankenversicherung', a.kv === 'privat'
            ? `privat, ${euroGenau(a.pkvPraemieMonat)} im Monat`
            : `gesetzlich${kasse ? `, ${kasse.name}` : ''}, Zusatzbeitrag ${prozent(a.zusatzbeitrag)}`],
          ['Gesetzliche Rente', grv.monat > 0
            ? `${euroGenau(grv.monat)} im Monat nach heutigem Stand (${grv.geschaetzt ? 'aus dem Gehalt geschätzt' : 'eingetragen'})`
            : 'nicht angegeben'],
          ['Rentenbeginn', rentenbeginnVon(a) ?? '—'],
          ['Bestehende Betriebsrente', a.bavBestandMonat > 0 ? `${euroGenau(a.bavBestandMonat)} Beitrag im Monat` : 'keine'],
        ]} />
      </Abschnitt>

      {luecke && (
        <Abschnitt titel="Versorgungslücke">
          <Paare zeilen={[
            ['Nettolohn heute', `${euroGenau(luecke.lohn.nettoMonat)} im Monat`],
            [`Gesetzliche Rente netto ${luecke.rentenbeginnJahr}`, `${euroGenau(luecke.rente.nettoMonat)} im Monat (heutige Kaufkraft)`],
            ['Versorgungslücke', `${euroGenau(luecke.lueckeMonat)} im Monat`],
          ]} />
          <p className="mt-1 text-[9pt] text-slate-700">
            Die gesetzliche Rente ersetzt rund {Math.round(luecke.anteil * 100)} % des Nettolohns. Angenommen: Inflation{' '}
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
        {minderung.renteMonat > 0.5 && (
          <p className="mt-1 text-[9pt] text-slate-700">
            Die gesetzliche Rente sinkt durch die beitragsfreie Umwandlung um rund {euroGenau(Math.round(minderung.renteMonat))} im Monat.
            So gerechnet: {minderungText(minderung)}
          </p>
        )}
        {h.monate > 0 && (
          <p className="mt-1 text-[9pt] text-slate-700">
            Beispielhafte Hochrechnung ({zahl(h.zins * 100, 0)} % im Jahr nach Kosten, keine Zusage): bis zum Rentenbeginn{' '}
            {euroGenau(Math.round(h.beitraegeSumme))} Beiträge, davon netto aus eigener Tasche {euroGenau(Math.round(h.nettoSumme))};
            mögliches Kapital rund {euroGenau(Math.round(h.kapital))}.
          </p>
        )}
      </Abschnitt>

      {leistung && leistung.vertraege.length > 0 && (
        <Abschnitt titel={`Leistung im Alter laut Angebot — erstes Rentenjahr ${leistung.rentenbeginnJahr}`}>
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
                  <LeistungsZeile titel="Prognose" w={l.prognose} />
                </div>
                {l.kapital && (
                  <p className="mt-1">
                    Oder als Kapital (Prognose): {euroGenau(l.kapital.brutto)} brutto, nach Steuer und Kranken- und Pflegeversicherung{' '}
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
              <p className="mt-1">Fazit: {fazitText(kennzahlen, minderung.renteMonat)}</p>
            </div>
          )}
          {leistung.plusHaushaltMonat !== null && (
            <p className="mt-2 font-bold">
              Unterm Strich steigt das Netto im Ruhestand um rund {euroGenau(Math.round(leistung.plusHaushaltMonat / leistung.kaufkraftfaktor))} im Monat
              (heutige Kaufkraft; mit der Prognose, nach Abzug der geminderten gesetzlichen Rente).
            </p>
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
            ? `Entscheidung: Teilnahme mit ${euroGenau(r.umwandlungMonat)} Umwandlung im Monat${e.beginn ? ` ab ${e.beginn}` : ''}.`
            : e.status === 'verzicht'
              ? `Entscheidung: Verzicht${e.grund.trim() ? ` — ${e.grund.trim()}` : ''}.`
              : 'Entscheidung: noch offen (Bedenkzeit).'}
        </p>
      </Abschnitt>

      <Unterschriften links="Mitarbeiter" rechts="Berater" ort={ortDatum(daten)} />
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
        Der Arbeitnehmer wandelt ab dem {e.beginn || LINIE} monatlich <strong>{euroGenau(r.umwandlungMonat)}</strong> seines
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

      <Unterschriften links="Arbeitgeber" rechts="Arbeitnehmer" ort={ortDatum(daten)} />
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

      <Unterschriften links="Arbeitnehmer" rechts="Arbeitgeber (Kenntnisnahme)" ort={ortDatum(daten)} />
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
