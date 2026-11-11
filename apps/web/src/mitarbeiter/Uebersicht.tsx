import { useEffect, useId, useMemo, useState } from 'react';
import { Download, Printer, SlidersHorizontal } from 'lucide-react';
import { firmenAngebotSchema } from '@renten/schema';
import { firmaSpeichern, type Beratung, type Firma } from '../lib/bav-beratung';
import { Dialog } from '../components/Dialog';
import { ProzentFeld, ZahlFeld, euroGenau } from '../components/Feld';
import { KNOPF, KNOPF_KLEIN, KNOPF_ZWEIT, Karte } from '../components/stil';
import { UmlagenErklaerung } from '../arbeitgeber/bausteine';
import { StatusChip, useBeraterAuftritt, useDrucken } from './bausteine';
import { UebersichtDruck } from './druck';
import {
  AUFGESTOCKT_TEXT, anzahlText, belastungsZeilen, csvDateiname, durchdringung, durchdringungText, quoteText, satzText, uebersichtCsv,
  uebersichtSummen, uebersichtZeilen, type BelastungsZeile, type Durchdringung,
} from './uebersicht-daten';

/**
 * Die Uebersicht fuer den Arbeitgeber: am Bildschirm, gedruckt (als PDF)
 * und als CSV fuer die Lohnabrechnung. Sie entsteht beim Berater — der
 * Arbeitgeber bekommt nur, was der Berater ihm gibt.
 *
 * Unter den Summen: was die Beitraege den Arbeitgeber netto kosten und wie
 * viele aus der Belegschaft mitmachen. Die Annahmen dafuer (Steuersatz,
 * Umlagen, Mitarbeiterzahl) gehoeren zur Firma und gelten fuer alle, die sie
 * sehen; aendern kann sie, wer die Firma angelegt hat.
 */
export function Uebersicht({ firma, logo, beratungen, onGespeichert }: {
  firma: Firma; logo: string | null; beratungen: readonly Beratung[];
  /** Nach dem Speichern der Annahmen: die Firma mit dem neuen Angebot */
  onGespeichert: (f: Firma) => void;
}) {
  const zeilen = useMemo(() => uebersichtZeilen(firma, beratungen), [firma, beratungen]);
  const summen = useMemo(() => uebersichtSummen(zeilen), [zeilen]);
  const quote = useMemo(() => durchdringung(summen, firma.angebot.belegschaft), [summen, firma.angebot.belegschaft]);
  const drucken = useDrucken();
  const auftritt = useBeraterAuftritt();
  const [geladen, setGeladen] = useState(false);
  const [annahmen, setAnnahmen] = useState(false);

  const herunterladen = () => {
    const url = URL.createObjectURL(new Blob([uebersichtCsv(zeilen)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = csvDateiname(firma.name);
    a.click();
    URL.revokeObjectURL(url);
    setGeladen(true);
  };

  const zelle = 'border-b border-ui-linie px-2 py-2.5 align-top';
  const zahl = `${zelle} text-right tabular-nums`;

  return (
    <Karte
      titel="Übersicht für den Arbeitgeber"
      rechts={zeilen.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={KNOPF}
            onClick={() => drucken(<UebersichtDruck firma={firma} logo={logo} zeilen={zeilen} summen={summen} auftritt={auftritt} />)}>
            <Printer className="h-4 w-4" aria-hidden /> Drucken
          </button>
          <button type="button" className={KNOPF_ZWEIT} onClick={herunterladen}>
            <Download className="h-4 w-4" aria-hidden /> CSV
          </button>
        </div>
      )}
    >
      <p className="text-sm leading-relaxed text-ui-schiefer">
        Wer teilnimmt, mit welchem Betrag und ab wann — für die Lohnabrechnung. Gehälter und persönliche Angaben aus den
        Gesprächen stehen nicht darin.
      </p>

      {zeilen.length === 0 ? (
        <p className="mt-3 text-sm text-ui-schiefer">Noch keine Beratung — die Übersicht füllt sich mit den Gesprächen.</p>
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="ui-innen p-4">
              <dt className="text-sm text-ui-schiefer">Beratungen</dt>
              <dd className="mt-1 text-sm font-medium leading-snug text-ui-tinte">
                {anzahlText('teilnahme', summen.teilnahmen)}<br />{anzahlText('verzicht', summen.verzichte)}<br />{anzahlText('offen', summen.offen)}
              </dd>
            </div>
            {[
              { titel: 'Umwandlung', wert: summen.umwandlungMonat },
              { titel: 'Arbeitgeber', wert: summen.arbeitgeberMonat },
              { titel: 'In die Vorsorge', wert: summen.gesamtMonat },
            ].map((k) => (
              <div key={k.titel} className="ui-innen p-4">
                <dt className="text-sm text-ui-schiefer">{k.titel} im Monat</dt>
                <dd className="mt-1 text-xl font-medium tabular-nums text-ui-tinte">{euroGenau(k.wert)}</dd>
                <dd className="text-xs tabular-nums text-ui-schiefer">{euroGenau(k.wert * 12)} im Jahr</dd>
              </div>
            ))}
          </dl>

          {/* Auf dem Telefon je Mitarbeiter ein Eintrag — die Tabelle braucht mehr Breite. Die Summen stehen oben. */}
          <ul className="mt-4 divide-y divide-ui-linie sm:hidden" aria-label="Entscheidungen">
            {zeilen.map((z, i) => (
              <li key={`${z.name}-${i}`} className="py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 break-words text-sm font-medium text-ui-tinte">{z.name}</span>
                  <StatusChip status={z.status} />
                </div>
                {z.status === 'teilnahme' && (
                  <p className="mt-0.5 text-xs tabular-nums text-ui-schiefer">
                    {euroGenau(z.umwandlungMonat)} + {euroGenau(z.arbeitgeberMonat)}{z.aufgestockt ? '*' : ''} Arbeitgeber = {euroGenau(z.gesamtMonat)}
                    {z.beginn ? `, ab ${z.beginn}` : ''}
                  </p>
                )}
              </li>
            ))}
          </ul>

          <div className="mt-4 hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[34rem] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs text-ui-schiefer">
                  <th className={zelle}>Name</th>
                  <th className={zelle}>Entscheidung</th>
                  <th className={`${zelle} text-right`}>Umwandlung</th>
                  <th className={`${zelle} text-right`}>Arbeitgeber</th>
                  <th className={`${zelle} text-right`}>Gesamt</th>
                  <th className={zelle}>Beginn</th>
                </tr>
              </thead>
              <tbody>
                {zeilen.map((z, i) => (
                  <tr key={`${z.name}-${i}`}>
                    <td className={`${zelle} break-words font-medium text-ui-tinte`}>{z.name}</td>
                    <td className={zelle}><StatusChip status={z.status} /></td>
                    <td className={zahl}>{z.status === 'teilnahme' ? euroGenau(z.umwandlungMonat) : '—'}</td>
                    <td className={zahl}>{z.status === 'teilnahme' ? `${euroGenau(z.arbeitgeberMonat)}${z.aufgestockt ? '*' : ''}` : '—'}</td>
                    <td className={zahl}>{z.status === 'teilnahme' ? euroGenau(z.gesamtMonat) : '—'}</td>
                    <td className={`${zelle} tabular-nums`}>{z.beginn || (z.status === 'teilnahme' ? 'offen' : '')}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-medium text-ui-tinte">
                  <td className={zelle} colSpan={2}>Summe im Monat</td>
                  <td className={zahl}>{euroGenau(summen.umwandlungMonat)}</td>
                  <td className={zahl}>{euroGenau(summen.arbeitgeberMonat)}</td>
                  <td className={zahl}>{euroGenau(summen.gesamtMonat)}</td>
                  <td className={zelle} />
                </tr>
              </tfoot>
            </table>
          </div>

          {zeilen.some((z) => z.aufgestockt) && <p className="mt-2 text-xs leading-relaxed text-ui-schiefer">{AUFGESTOCKT_TEXT}</p>}

          {/* Unter den Summen: was der Arbeitgeber netto traegt — und rechts, wie viele mitmachen. */}
          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
            <NettoBelastung
              zeilen={belastungsZeilen(summen.belastung, firma.angebot)}
              teilnahmen={summen.teilnahmen}
              annahmen={`Steuersatz auf den Gewinn ${satzText(firma.angebot.unternehmensSteuersatz)}, ${
                firma.angebot.umlagenSatz > 0 ? `Umlagen ${satzText(firma.angebot.umlagenSatz)}` : 'ohne Umlagen'}.`}
              aendern={firma.eigene ? () => setAnnahmen(true) : null}
            />
            <DurchdringungKasten d={quote} />
          </div>

          <p role="status" className="mt-3 text-xs leading-relaxed text-ui-schiefer">
            {geladen
              ? 'Die CSV-Datei liegt in Ihrem Download-Ordner. Sie öffnet sich direkt in Excel.'
              : 'Die CSV-Datei öffnet sich direkt in Excel. Beträge laut Beratung — maßgeblich sind die unterschriebenen Vereinbarungen.'}
          </p>
        </>
      )}

      {firma.eigene && (
        <AnnahmenDialog offen={annahmen} firma={firma} onSchliessen={() => setAnnahmen(false)} onGespeichert={onGespeichert} />
      )}
    </Karte>
  );
}

/**
 * Was die Beitraege den Arbeitgeber netto kosten: Beitrag, abzueglich der
 * gesparten Sozialabgaben und der Steuer. Am Telefon nur der Monat, das Jahr
 * der Summe darunter — drei Spalten passen dort nicht neben die Texte.
 */
function NettoBelastung({ zeilen, teilnahmen, annahmen, aendern }: {
  zeilen: BelastungsZeile[]; teilnahmen: number; annahmen: string;
  /** null: Die Annahmen pflegt, wer die Firma angelegt hat */
  aendern: (() => void) | null;
}) {
  const titel = useId();
  const summe = zeilen[zeilen.length - 1]!;
  const zelle = 'py-1.5 align-top';
  const betrag = `${zelle} pl-3 text-right tabular-nums whitespace-nowrap`;
  return (
    <section aria-labelledby={titel} className="ui-innen p-4 sm:p-5">
      <h3 id={titel} className="text-base font-medium text-ui-tinte">{summe.text.replace(/^= /, '')} des Arbeitgebers</h3>
      <p className="mt-1 text-sm leading-relaxed text-ui-schiefer">
        Was die Beiträge den Arbeitgeber wirklich kosten: Er spart Sozialabgaben auf die umgewandelten Gehälter, und sein
        Beitrag ist Betriebsausgabe.
      </p>
      <table className="mt-3 w-full border-collapse text-sm">
        <thead>
          <tr className="text-xs text-ui-schiefer">
            <th className={`${zelle} text-left font-normal`}><span className="sr-only">Posten</span></th>
            <th className={`${betrag} font-normal`}>im Monat</th>
            <th className={`${betrag} hidden font-normal sm:table-cell`}>im Jahr</th>
          </tr>
        </thead>
        <tbody>
          {zeilen.map((z) => {
            const art = z.art === 'summe'
              ? 'border-t border-ui-tinte font-medium text-ui-tinte'
              : z.art === 'zwischensumme' ? 'border-t border-ui-linie text-ui-tinte' : 'text-ui-schiefer';
            return (
              <tr key={z.text} className={art}>
                <td className={zelle}>{z.text}</td>
                <td className={`${betrag} ${z.art === 'posten' ? 'text-ui-tinte' : ''}`}>{euroGenau(z.monat)}</td>
                <td className={`${betrag} hidden sm:table-cell ${z.art === 'posten' ? 'text-ui-tinte' : ''}`}>{euroGenau(z.monat * 12)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-sm tabular-nums text-ui-tinte sm:hidden">
        {summe.text.replace(/^= /, '')} im Jahr: {euroGenau(summe.monat * 12)}
      </p>
      {teilnahmen > 1 && (
        <p className="mt-2 text-sm tabular-nums text-ui-schiefer">
          Im Schnitt {euroGenau(summe.monat / teilnahmen)} je Teilnehmer im Monat.
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-ui-linie pt-3 text-xs leading-relaxed text-ui-schiefer">
        <span>{annahmen}</span>
        {aendern
          ? (
            <button type="button" onClick={aendern} className={KNOPF_KLEIN}>
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden /> Annahmen ändern
            </button>
          )
          : <span>Die Annahmen pflegt, wer die Firma angelegt hat.</span>}
      </div>
    </section>
  );
}

/** Wie viele aus der Belegschaft das Angebot nutzen — die Zahl gross, darunter ein Balken und der Satz dazu. */
function DurchdringungKasten({ d }: { d: Durchdringung }) {
  const titel = useId();
  const anteil = d.quote === null ? 0 : Math.min(1, Math.max(0, d.quote));
  return (
    <section aria-labelledby={titel} className="ui-innen self-start p-4 sm:p-5">
      <h3 id={titel} className="text-base font-medium text-ui-tinte">Durchdringungsquote</h3>
      <p className="ui-titel mt-2 text-[40px] leading-none tabular-nums text-ui-tinte">{quoteText(d.quote)}</p>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-ui-luecke" aria-hidden>
        <div className="h-full rounded-full bg-ui-tinte" style={{ width: `${anteil * 100}%` }} />
      </div>
      <p className="mt-3 text-sm leading-relaxed text-ui-tinte">{durchdringungText(d)}</p>
      {d.angebotZuKlein && (
        <p className="mt-2 text-xs leading-relaxed text-ui-schiefer">
          Die Mitarbeiterzahl unter „Annahmen“ ist kleiner als die Liste — gezählt sind deshalb die Mitarbeiter in der Liste.
        </p>
      )}
      {d.quelle === 'liste' && !d.angebotZuKlein && (
        <p className="mt-2 text-xs leading-relaxed text-ui-schiefer">
          Gezählt sind alle Mitarbeiter in der Liste, auch mit Verzicht oder offener Entscheidung. Mit der Mitarbeiterzahl
          unter „Annahmen“ zählt die ganze Belegschaft.
        </p>
      )}
    </section>
  );
}

/**
 * Steuersatz, Umlagen und Mitarbeiterzahl der Firma — gespeichert im Angebot,
 * wie alles, was die Firma ausmacht. Gespeichert wird erst mit „Übernehmen“,
 * geprueft mit demselben Schema, mit dem gelesen wird.
 */
function AnnahmenDialog({ offen, firma, onSchliessen, onGespeichert }: {
  offen: boolean; firma: Firma; onSchliessen: () => void; onGespeichert: (f: Firma) => void;
}) {
  const a = firma.angebot;
  const [steuersatz, setSteuersatz] = useState(a.unternehmensSteuersatz);
  const [umlagen, setUmlagen] = useState(a.umlagenSatz);
  const [belegschaft, setBelegschaft] = useState(a.belegschaft);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);

  // Bei jedem Oeffnen die gespeicherten Werte — Abbrechen verwirft, was eingetippt war.
  useEffect(() => {
    if (!offen) return;
    setSteuersatz(a.unternehmensSteuersatz);
    setUmlagen(a.umlagenSatz);
    setBelegschaft(a.belegschaft);
    setMeldung(null);
  }, [offen, a.unternehmensSteuersatz, a.umlagenSatz, a.belegschaft]);

  const uebernehmen = async () => {
    const geprueft = firmenAngebotSchema.safeParse({
      ...a, unternehmensSteuersatz: steuersatz, umlagenSatz: umlagen, belegschaft: Math.max(0, Math.round(belegschaft)),
    });
    if (!geprueft.success) {
      setMeldung('Bitte die Angaben prüfen: Steuersatz bis 60 %, Umlagen bis 10 %.');
      return;
    }
    setLaeuft(true);
    setMeldung(null);
    const ok = await firmaSpeichern({ id: firma.id, name: firma.name, angebot: geprueft.data, logoPfad: firma.logoPfad });
    setLaeuft(false);
    if (!ok) {
      setMeldung('Die Annahmen konnten nicht gespeichert werden. Bitte versuchen Sie es noch einmal.');
      return;
    }
    onGespeichert({ ...firma, angebot: geprueft.data });
    onSchliessen();
  };

  return (
    <Dialog offen={offen} titel="Annahmen für den Arbeitgeber" onSchliessen={() => { if (!laeuft) onSchliessen(); }}>
      <div className="space-y-3">
        <ZahlFeld label="Mitarbeiter im Unternehmen" wert={belegschaft} onChange={setBelegschaft} min={0} schritt={1} leerBeiNull
          hilfe="Für die Durchdringungsquote. Leer: alle Mitarbeiter in der Liste." />
        <ProzentFeld label="Steuersatz auf den Gewinn" wert={steuersatz} onChange={setSteuersatz} min={0} max={60}
          hilfe="GmbH mit 400 % Hebesatz rund 30 %. Einzelunternehmen und Personengesellschaften: persönlicher Satz." />
        <ProzentFeld label="Umlagen U1, U2, Insolvenzgeld" wert={umlagen} onChange={setUmlagen} min={0} max={10} stellen={2}
          hilfe="Spart der Arbeitgeber auf den beitragsfreien Teil zusätzlich. 0: nicht eingerechnet." />
        <UmlagenErklaerung onWaehlen={setUmlagen} />
      </div>
      {meldung && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900">{meldung}</p>}
      <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-ui-linie pt-4">
        <button type="button" onClick={onSchliessen} disabled={laeuft} className={KNOPF_ZWEIT}>Abbrechen</button>
        <button type="button" onClick={() => void uebernehmen()} disabled={laeuft} className={KNOPF}>
          {laeuft ? 'Wird gespeichert …' : 'Übernehmen'}
        </button>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ui-schiefer">
        Die Annahmen gehören zur Firma: Sie gelten für die Übersicht und ihren Ausdruck, nicht für die Beratung der Mitarbeiter.
      </p>
    </Dialog>
  );
}
