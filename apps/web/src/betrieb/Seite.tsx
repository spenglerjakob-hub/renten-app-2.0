import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, ClipboardPaste, Plus, Printer, Trash2 } from 'lucide-react';
import {
  BUNDESLAENDER, betriebsCheck, lohnlisteLesen, parameterFuer,
  type AnzahlSpalte, type BelegschaftGruppe, type BetriebsModell,
} from '@renten/engine';
import { AuswahlFeld, ProzentFeld, Schalter, ZahlFeld, euro, prozent } from '../components/Feld';
import { RechtsLinks } from '../components/RechtsLinks';
import { UebernehmenKnopf } from '../mitarbeiter/UebernehmenKnopf';
import {
  AKZENT, EINLEITUNG, FELD_LABEL, Hervor, Hinweis, KNOPF, KNOPF_KLEIN, KNOPF_KLEIN_HAUPT, LINK, Titel,
} from '../components/stil';
import {
  AndereModelle, Kasten, Kopf, Punkte, UmlagenErklaerung, Zeile,
  KARTE, KARTE_TITEL, ERKLAERUNG, FUSSNOTE, TABELLE_KOPF, TABELLE_ZEILE, TABELLE_DRUCK, ZELLE, KOPFZELLE,
} from '../arbeitgeber/bausteine';
import { FirmenkundeWahl, firmenWerteSetzer, useFirmenkunde } from '../arbeitgeber/Firmenkunde';
import { gemerkteFirma } from '../arbeitgeber/firmenkunde';
import {
  HOECHSTENS_GRUPPEN, LAGE_TEXT, MODELL_VORGABEN, STAND_SCHLUESSEL, beitragName, durchschnittsGruppe, gruppenZeilen,
  lohnlisteText, modellSeite, modellText, standLesen, standSchreiben, standVorgabe, type BetriebsStand,
} from './belegschaft';

/**
 * Arbeitgeber-Seite „Betriebs-Check“.
 *
 * Die drei Modellseiten rechnen EINEN Beispiel-Mitarbeiter. Hier steht die
 * ganze Belegschaft: Gehaltsgruppen eingeben oder aus der Lohnliste einfuegen,
 * ein Modell waehlen, die Teilnahme in drei Szenarien durchspielen. Jede
 * Gruppe wird einzeln gerechnet (`betriebsCheck` im Rechenkern) — was der
 * Arbeitgeber an Sozialabgaben spart, haengt am Gehalt.
 *
 * Der Ausdruck ist eine Entscheidungsvorlage auf zwei Seiten, mit dem
 * Briefkopf der Arbeitgeber-Seiten (Auftritt des Beraters, Logo der Firma).
 *
 * Eigenes Bundle, nur mit Konto (Zugangsschranke in main.tsx). Die
 * Belegschaft bleibt im Browser dieses Geraets (`belegschaft.ts`); ins Konto
 * geht nur die Firma, fuer die gerechnet wird (arbeitgeber/Firmenkunde.tsx).
 */

const p = parameterFuer(new Date().getFullYear(), { indexRate: 0 });

/* --------------------------------------------------------------------------
 * Der Stand im Browser — je Firma ein Fach.
 * ------------------------------------------------------------------------ */

/** Die Firmen laden noch: Es gilt die Vorgabe, gespeichert wird nichts. */
const WARTET = 'wartet';
const OHNE = 'ohne';

const speicher = (): Storage | null => {
  try { return window.localStorage; } catch { return null; }
};
const sitzung = (): Storage | null => {
  try { return window.sessionStorage; } catch { return null; }
};

function standHolen(fach: string): BetriebsStand | null {
  if (fach === WARTET) return null;
  try {
    return standLesen(speicher()?.getItem(STAND_SCHLUESSEL) ?? null, fach === OHNE ? null : fach);
  } catch {
    return null; // Speicher gesperrt
  }
}

function standAblegen(fach: string, stand: BetriebsStand | null): void {
  if (fach === WARTET) return;
  try {
    const s = speicher();
    if (!s) return;
    const neu = standSchreiben(s.getItem(STAND_SCHLUESSEL), fach === OHNE ? null : fach, stand);
    if (neu === null) s.removeItem(STAND_SCHLUESSEL);
    else s.setItem(STAND_SCHLUESSEL, neu);
  } catch {
    /* voll oder gesperrt: dann gilt der Stand nur fuer diese Sitzung */
  }
}

interface Zustand {
  fach: string;
  stand: BetriebsStand;
  /** Seit dem Laden geaendert — erst dann wird gespeichert */
  beruehrt: boolean;
  /** Im Browser liegt etwas zu diesem Fach */
  abgelegt: boolean;
  /** Der Stand kam aus dem Fach „ohne Firma“ mit — dort wird er entfernt */
  umzugVon: string | null;
}

function zustandFuer(fach: string, firmaModell: BetriebsModell | undefined): Zustand {
  const da = standHolen(fach);
  return { fach, stand: da ?? standVorgabe(firmaModell), beruehrt: false, abgelegt: da !== null, umzugVon: null };
}

/**
 * Der Stand der Seite zur gewaehlten Firma.
 *
 * Wechselt die Firma, wechselt das Fach. Eine Ausnahme: Wer ohne Firma eine
 * Belegschaft eingetragen hat und DANN die Firma waehlt oder anlegt, nimmt sie
 * mit — sonst waere die Eingabe mit der Wahl der Firma scheinbar weg.
 */
function useBetriebsStand(fach: string, firmaModell: BetriebsModell | undefined) {
  const [z, setZ] = useState<Zustand>(() => zustandFuer(fach, firmaModell));
  if (z.fach !== fach) {
    const neu = zustandFuer(fach, firmaModell);
    const mitnehmen = !neu.abgelegt && z.fach === OHNE && fach !== WARTET && !z.stand.beispiel && (z.beruehrt || z.abgelegt);
    setZ(mitnehmen ? { fach, stand: z.stand, beruehrt: true, abgelegt: false, umzugVon: OHNE } : neu);
  }

  useEffect(() => {
    if (!z.beruehrt) return;
    standAblegen(z.fach, z.stand);
    if (z.umzugVon) standAblegen(z.umzugVon, null);
  }, [z]);

  return {
    stand: z.stand,
    abgelegt: z.abgelegt || z.beruehrt,
    aendern: (teil: Partial<BetriebsStand>) => setZ((alt) => ({ ...alt, stand: { ...alt.stand, ...teil }, beruehrt: true })),
    loeschen: () => {
      standAblegen(fach, null);
      setZ({ fach, stand: standVorgabe(firmaModell), beruehrt: false, abgelegt: false, umzugVon: null });
    },
  };
}

/* --------------------------------------------------------------------------
 * Eingaben
 * ------------------------------------------------------------------------ */

/** Eine Gehaltsgruppe: Bezeichnung, Anzahl, Gehalt. */
function GruppeFelder({ nr, gruppe, einzige, onChange, onEntfernen }: {
  nr: number; gruppe: BelegschaftGruppe; einzige: boolean;
  onChange: (teil: Partial<BelegschaftGruppe>) => void; onEntfernen: () => void;
}) {
  const id = useId();
  return (
    <div role="group" aria-label={`Gruppe ${nr}`} className="ui-innen space-y-2 rounded-xl p-3" data-gruppe="">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor={id} className={FELD_LABEL}>Bezeichnung</label>
          <input
            id={id} type="text" value={gruppe.name} maxLength={40} placeholder="z. B. Produktion"
            onChange={(e) => onChange({ name: e.target.value })}
            className="ui-feld w-full p-2 text-sm"
          />
        </div>
        <button
          type="button" onClick={onEntfernen} disabled={einzige} aria-label={`Gruppe ${nr} entfernen`}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-ui-zweit-rand bg-ui-karte text-ui-schiefer hover:text-ui-tinte disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ZahlFeld label="Anzahl" wert={gruppe.anzahl} onChange={(n) => onChange({ anzahl: Math.round(n) })} max={9_999} leerBeiNull />
        <ZahlFeld
          label="Gehalt im Jahr" wert={gruppe.jahresbrutto} onChange={(n) => onChange({ jahresbrutto: n })}
          einheit="€" max={10_000_000} tausenderpunkte leerBeiNull
        />
      </div>
    </div>
  );
}

const GEHAELTER = [
  { wert: '12', text: '12' }, { wert: '12.5', text: '12,5' }, { wert: '13', text: '13' }, { wert: '14', text: '14' },
] as const;

/**
 * Die Lohnliste einfuegen. Der eingefuegte Text — darin koennen Namen stehen —
 * bleibt in diesem Feld und verschwindet mit ihm; uebernommen werden nur
 * Gehaltsgruppen (`lohnlisteLesen`).
 */
function Lohnliste({ onUebernehmen, onSchliessen }: {
  onUebernehmen: (gruppen: BelegschaftGruppe[]) => void; onSchliessen: () => void;
}) {
  const id = useId();
  const [text, setText] = useState('');
  const [gehaelter, setGehaelter] = useState<(typeof GEHAELTER)[number]['wert']>('12');
  // Die Zahl vor dem Gehalt: Der Rechenkern entscheidet, bis jemand es umstellt — eine neue Liste beginnt wieder so.
  const [spalte, setSpalte] = useState<AnzahlSpalte>('auto');
  const gelesen = useMemo(() => lohnlisteLesen(text, Number(gehaelter), spalte), [text, gehaelter, spalte]);
  const satz = lohnlisteText(gelesen, Number(gehaelter));
  return (
    <div className="space-y-3 rounded-xl border border-ui-linie p-3" data-lohnliste="">
      <div>
        <label htmlFor={id} className={FELD_LABEL}>Lohnliste einfügen</label>
        <textarea
          id={id} rows={6} value={text} maxLength={200_000} spellCheck={false}
          onChange={(e) => { setText(e.target.value); setSpalte('auto'); }}
          placeholder={'3.450,00\n3.450,00\n5.200,00\n\noder: Produktion; 18; 38.000'}
          aria-describedby={`${id}-hilfe`}
          className="ui-feld w-full p-2 font-mono text-xs leading-relaxed"
        />
        <p id={`${id}-hilfe`} className="mt-1 text-xs leading-relaxed text-ui-schiefer">
          Je Zeile ein Gehalt — oder Anzahl und Gehalt, wahlweise mit Bezeichnung davor. Am einfachsten: die
          Gehaltsspalte aus der Tabellenkalkulation kopieren. Namen und Personalnummern werden nicht übernommen;
          einzelne Gehälter werden auf volle 1.000 € gerundet und zusammengefasst.
        </p>
      </div>
      {gelesen.ausMonat && (
        <AuswahlFeld label="Gehälter im Jahr" wert={gehaelter} onChange={setGehaelter} optionen={GEHAELTER} />
      )}
      {gelesen.anzahlSpalte && (
        <Schalter
          label="Die Zahl vor dem Gehalt ist die Anzahl der Mitarbeiter" wert={gelesen.alsAnzahl}
          onChange={(ja) => setSpalte(ja ? 'ja' : 'nein')}
        />
      )}
      <p role="status" className={`text-sm font-medium text-ui-tinte ${satz ? '' : 'hidden'}`}>{satz}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button" disabled={gelesen.gruppen.length === 0} onClick={() => onUebernehmen(gelesen.gruppen)}
          className={`${KNOPF_KLEIN_HAUPT} disabled:cursor-not-allowed disabled:opacity-40`}
        >
          Als Belegschaft übernehmen
        </button>
        <button type="button" onClick={onSchliessen} className={KNOPF_KLEIN}>Abbrechen</button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
 * Ergebnis
 * ------------------------------------------------------------------------ */

/*
 * DIE TABELLEN AM TELEFON. Drei Szenarien nebeneinander sind bei 360 px eng:
 * Die Zahlen bleiben in einer Zeile, der Begriff links weicht aus — er bricht
 * um, wenn noetig mitten im Wort (`overflow-wrap: anywhere` senkt auch die
 * Mindestbreite der Spalte; `hyphens-auto` setzt dabei den Trennstrich). So
 * laeuft die Tabelle auch bei siebenstelligen Betraegen nicht aus der Karte.
 */
const TABELLE = `mt-3 w-full text-xs sm:text-sm print:mt-1 ${TABELLE_DRUCK}`;
const BEGRIFF = 'pr-1 text-left hyphens-auto [overflow-wrap:anywhere]';
const ZAHL = 'whitespace-nowrap pl-2 text-right align-top tabular-nums sm:pl-3';

/** Eine Zeile der Szenario-Tabelle: Begriff links, je Szenario ein Wert. Vorzeichen und Wort haelt ein geschuetztes Leerzeichen zusammen. */
function SzenarioZeile({ text, werte, art }: { text: ReactNode; werte: readonly string[]; art?: 'summe' | 'stark' }) {
  const klasse = art === 'summe' ? 'border-t border-ui-tinte font-medium' : art === 'stark' ? `${TABELLE_ZEILE} font-medium` : TABELLE_ZEILE;
  return (
    <tr className={klasse}>
      <th scope="row" className={`${ZELLE} ${BEGRIFF} ${art ? 'font-medium text-ui-tinte' : 'font-normal text-ui-schiefer'}`}>{text}</th>
      {werte.map((w, i) => (
        <td key={i} className={`${ZELLE} ${ZAHL}`}>{w}</td>
      ))}
    </tr>
  );
}

/**
 * Ein Szenario als Wertkarte — wie `Kachel` der Modellseiten, die mittlere als
 * Akzentkarte. Eigene Groessen, weil hier JAHRESSUMMEN eines Betriebs stehen:
 * Drei Karten nebeneinander tragen „4.563 €“ gross, „1.025.654 €“ nicht. Ab
 * acht Zeichen (`lang`) stehen deshalb alle drei kleiner, und zwischen sm und
 * xl — wo die Karten am schmalsten sind — ohnehin.
 */
function SzenarioKachel({ titel, betrag, unten, akzent, lang }: {
  titel: string; betrag: number; unten: string; akzent: boolean; lang: boolean;
}) {
  const groesse = lang
    ? 'text-[26px] leading-tight sm:text-[20px] lg:text-[22px] xl:text-[28px]'
    : akzent
      ? 'text-[40px] leading-none sm:text-[22px] sm:leading-tight lg:text-[24px] xl:text-[40px] xl:leading-none'
      : 'text-[28px] leading-tight sm:text-[22px] lg:text-[24px] xl:text-[28px]';
  return (
    <div className={`p-5 sm:p-6 print:p-2 print:shadow-none ${akzent ? AKZENT : 'ui-karte text-ui-tinte'}`}>
      <p className={`text-sm print:text-xs ${akzent ? '' : 'text-ui-schiefer'}`}>{titel}</p>
      <p className={`mt-1 whitespace-nowrap tabular-nums ${akzent ? 'ui-titel' : 'font-medium'} ${groesse} print:text-xl`}>
        {akzent ? <Hervor>{euro(betrag)}</Hervor> : euro(betrag)}
      </p>
      <p className={`mt-2 text-xs print:mt-1 print:text-[10px] ${akzent ? '' : 'text-ui-schiefer'}`}>{unten}</p>
    </div>
  );
}

/** Eine grosse Zahl mit Etikett im Vergleich „Betriebsrente oder Gehaltserhöhung“. */
function VergleichWert({ titel, betrag, unten }: { titel: string; betrag: number; unten: string }) {
  return (
    <div className="ui-innen rounded-xl p-4 print:p-2">
      <p className="text-sm text-ui-schiefer print:text-[10px]">{titel}</p>
      <p className="mt-1 text-[28px] font-medium leading-tight tabular-nums text-ui-tinte print:text-lg">{euro(betrag)}</p>
      <p className="mt-1 text-xs leading-relaxed text-ui-schiefer print:text-[9px] print:leading-snug">{unten}</p>
    </div>
  );
}

const koepfeText = (n: number) => `${n.toLocaleString('de-DE')} Mitarbeiter`;

export function Seite() {
  const [bundesland, setBundesland] = useState<string>('Nordrhein-Westfalen');
  const [steuersatz, setSteuersatz] = useState(0.3);
  const [umlagen, setUmlagen] = useState(0);
  const [listeOffen, setListeOffen] = useState(false);
  const [alleGruppen, setAlleGruppen] = useState(false);

  // Fuer welche Firma gerechnet wird: Name und Logo fuer Kopf und Ausdruck, Sitz, Steuersatz und Umlagen aus ihrem Angebot.
  const kunde = useFirmenkunde({
    werte: { bundesland, steuersatz, umlagen },
    onWerte: firmenWerteSetzer({ bundesland: setBundesland, steuersatz: setSteuersatz, umlagen: setUmlagen }),
  });
  // Solange die Firmen laden und der Tab sich eine gemerkt hat, ist noch offen, welches Fach gilt.
  const [gemerkt] = useState(() => gemerkteFirma(window.location.search, sitzung()) !== null);
  const fach = kunde.firmen === 'laedt' && gemerkt ? WARTET : kunde.firma?.id ?? OHNE;
  const firmaModell = kunde.firma?.angebot.modell;
  const { stand, abgelegt, aendern, loeschen } = useBetriebsStand(fach, firmaModell);
  const { gruppen, modell } = stand;

  const gruppeAendern = (stelle: number, teil: Partial<BelegschaftGruppe>) =>
    aendern({ gruppen: gruppen.map((g, i) => (i === stelle ? { ...g, ...teil } : g)), beispiel: false });
  const gruppeEntfernen = (stelle: number) =>
    aendern({ gruppen: gruppen.filter((_, i) => i !== stelle), beispiel: false });
  const gruppeHinzu = () =>
    aendern({ gruppen: [...gruppen, { name: '', anzahl: 0, jahresbrutto: 0 }], beispiel: false });
  const modellAendern = (teil: Partial<BetriebsModell>) => aendern({ modell: { ...modell, ...teil } as BetriebsModell });
  const quoteAendern = (stelle: 0 | 1 | 2, wert: number) => {
    const quoten: [number, number, number] = [...stand.quoten];
    quoten[stelle] = wert;
    aendern({ quoten });
  };

  const steuerOpt = useMemo(() => ({ verheiratet: false, bundesland, kirchensteuerpflichtig: false }), [bundesland]);
  const eingaben = useMemo(() => ({
    gruppen,
    modell,
    umwandlungMonat: stand.umwandlungMonat,
    quoten: stand.quoten,
    unternehmensSteuersatz: steuersatz,
    umlagenSatz: umlagen,
    vl: { betragMonat: stand.vlMonat, anzahl: stand.vlAnzahl },
  }), [gruppen, modell, stand.umwandlungMonat, stand.quoten, stand.vlMonat, stand.vlAnzahl, steuersatz, umlagen]);
  const r = useMemo(() => betriebsCheck(eingaben, steuerOpt, p), [eingaben, steuerOpt]);
  const mitte = r.szenarien[1]!;

  // „Ein Beispiel-Mitarbeiter mal n“: dieselbe Rechnung mit dem Durchschnittsgehalt fuer alle.
  const schnitt = useMemo(() => {
    const d = durchschnittsGruppe(gruppen);
    if (!d || r.gruppen.length < 2) return null;
    const kosten = betriebsCheck({ ...eingaben, gruppen: [d], vl: undefined }, steuerOpt, p).szenarien[1]!.agNettoJahr;
    const abstand = mitte.agNettoJahr - kosten;
    return Math.abs(abstand) >= Math.max(50, Math.abs(mitte.agNettoJahr) * 0.01) ? { gehalt: d.jahresbrutto, kosten, abstand } : null;
  }, [gruppen, eingaben, steuerOpt, r.gruppen.length, mitte.agNettoJahr]);

  const tabelle = useMemo(() => gruppenZeilen(r.gruppen), [r.gruppen]);
  const langeZahlen = r.szenarien.some((s) => euro(s.agNettoJahr).length >= 8);
  const beitrag = beitragName(modell);
  const viele = gruppen.length > 8;
  const zeigeGruppen = !viele || alleGruppen;
  const unterMindest = modell.art === 'festbetrag' && stand.umwandlungMonat < modell.mindestUmwandlungMonat;
  const firmaHatAnderes = firmaModell && JSON.stringify(firmaModell) !== JSON.stringify(modell);

  return (
    <div className="min-h-screen bg-ui-flaeche text-ui-tinte print:min-h-0 print:bg-white">
      <Kopf kunde={kunde.kunde} />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10 print:max-w-none print:px-0 print:py-2">
        <Titel gross klasse="print:text-xl">
          Betriebs-Check: was die Betriebsrente <Hervor>Ihren ganzen Betrieb</Hervor> kostet
        </Titel>
        <p className={`mt-3 ${EINLEITUNG} print:mt-1 print:max-w-none print:text-[10px] print:leading-snug`}>
          Kein Beispiel-Mitarbeiter mal Kopfzahl: Der Betriebs-Check rechnet Ihr Modell für jede Gehaltsgruppe einzeln —
          denn was Sie an Sozialabgaben sparen, hängt am Gehalt. Wie viele mitmachen, weiß vorher niemand; deshalb
          stehen drei Szenarien nebeneinander.
        </p>
        <AndereModelle aktuell="/betriebs-check" />

        <p className="mt-2 hidden text-xs leading-snug text-ui-schiefer print:block print:text-[10px]" data-annahmen="">
          Annahmen: {koepfeText(r.koepfe)} in {r.gruppen.length} Gehaltsgruppe{r.gruppen.length === 1 ? '' : 'n'}, Lohnsumme
          {' '}{euro(r.lohnsummeJahr)} im Jahr{stand.beispiel ? ' (Beispiel-Belegschaft)' : ''}. {modellText(modell)}. Umwandlung
          {' '}{euro(stand.umwandlungMonat)} im Monat je Teilnehmer. Unternehmenssteuer {prozent(steuersatz, 0)}
          {umlagen > 0 ? `, Umlagen ${prozent(umlagen)}` : ''}. Sitz {bundesland}. Rechtsstand {p.jahr}.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6 print:mt-2 print:block">
          {/* --- Eingaben ---------------------------------------------------- */}
          <div className="space-y-4 lg:col-span-4 print:hidden">
            <FirmenkundeWahl kunde={kunde} />

            <Kasten titel="Belegschaft">
              {stand.beispiel && (
                <Hinweis klasse="text-xs">
                  Das ist eine Beispiel-Belegschaft. Tragen Sie die Gruppen des Betriebs ein — oder fügen Sie die
                  Lohnliste ein.
                </Hinweis>
              )}
              <p className="text-sm text-ui-schiefer" data-belegschaft-summe="">
                <span className="font-medium text-ui-tinte">{koepfeText(r.koepfe)}</span> in {gruppen.length}
                {' '}Gruppe{gruppen.length === 1 ? '' : 'n'} · Lohnsumme {euro(r.lohnsummeJahr)}
              </p>

              {zeigeGruppen && gruppen.map((g, i) => (
                <GruppeFelder
                  key={i} nr={i + 1} gruppe={g} einzige={gruppen.length === 1}
                  onChange={(teil) => gruppeAendern(i, teil)} onEntfernen={() => gruppeEntfernen(i)}
                />
              ))}

              <div className="flex flex-wrap gap-2">
                {viele && (
                  <button type="button" onClick={() => setAlleGruppen(!alleGruppen)} aria-expanded={alleGruppen} className={KNOPF_KLEIN}>
                    {alleGruppen ? 'Gruppen einklappen' : `${gruppen.length} Gruppen bearbeiten`}
                  </button>
                )}
                {zeigeGruppen && gruppen.length < HOECHSTENS_GRUPPEN && (
                  <button type="button" onClick={gruppeHinzu} className={KNOPF_KLEIN}>
                    <Plus className="h-3.5 w-3.5" aria-hidden /> Gruppe
                  </button>
                )}
                {!listeOffen && (
                  <button type="button" onClick={() => setListeOffen(true)} className={KNOPF_KLEIN}>
                    <ClipboardPaste className="h-3.5 w-3.5" aria-hidden /> Aus der Lohnliste einfügen
                  </button>
                )}
              </div>
              {listeOffen && (
                <Lohnliste
                  onSchliessen={() => setListeOffen(false)}
                  onUebernehmen={(neu) => { aendern({ gruppen: neu, beispiel: false }); setListeOffen(false); setAlleGruppen(false); }}
                />
              )}

              <p className="text-xs leading-relaxed text-ui-schiefer">
                Die Belegschaft bleibt in diesem Browser — sie geht nicht ins Konto.
                {abgelegt && (
                  <>
                    {' '}
                    <button type="button" onClick={loeschen} className="font-medium text-ui-tinte underline underline-offset-2 hover:no-underline">
                      Hier löschen
                    </button>
                  </>
                )}
              </p>
            </Kasten>

            <Kasten titel="Modell">
              <AuswahlFeld
                label="Modell des Betriebs" wert={modell.art}
                onChange={(art) => aendern({ modell: { ...MODELL_VORGABEN[art] } })}
                optionen={[
                  { wert: 'zuschuss', text: 'Zuschussmodell' },
                  { wert: 'festbetrag', text: 'Festbetrag-Modell' },
                  { wert: 'matching', text: 'Matching-Modell mit Unterstützungskasse' },
                ]}
              />
              {modell.art === 'zuschuss' && (
                <>
                  <ProzentFeld
                    label="Zuschuss des Arbeitgebers" wert={modell.quote} onChange={(quote) => modellAendern({ quote })} min={0} max={100}
                    hilfe="Anteil der Umwandlung. Der gesetzliche Pflichtzuschuss von 15 % ist darin enthalten."
                  />
                  <ZahlFeld
                    label="Höchstens im Monat" wert={modell.deckelMonat} onChange={(deckelMonat) => modellAendern({ deckelMonat })}
                    einheit="€" schritt={10} max={10_000} hilfe="0: ohne Deckel"
                  />
                </>
              )}
              {modell.art === 'festbetrag' && (
                <>
                  <ZahlFeld
                    label="Festbetrag des Arbeitgebers im Monat" wert={modell.festbetragMonat}
                    onChange={(festbetragMonat) => modellAendern({ festbetragMonat })} einheit="€" schritt={10} max={10_000}
                  />
                  <ZahlFeld
                    label="Ab einer Umwandlung von" wert={modell.mindestUmwandlungMonat}
                    onChange={(mindestUmwandlungMonat) => modellAendern({ mindestUmwandlungMonat })} einheit="€" schritt={10} max={10_000}
                  />
                </>
              )}
              {modell.art === 'matching' && (
                <>
                  <AuswahlFeld
                    label="Entgeltumwandlung in die" wert={modell.weg}
                    onChange={(weg) => modellAendern({ weg, zuschussImMatching: weg === 'dv' && modell.zuschussImMatching })}
                    optionen={[
                      { wert: 'dv', text: 'Direktversicherung' },
                      { wert: 'ukasse', text: 'Unterstützungskasse' },
                    ]}
                  />
                  <ZahlFeld
                    label="Matching des Arbeitgebers im Monat" wert={modell.matchingMonat}
                    onChange={(matchingMonat) => modellAendern({ matchingMonat })} einheit="€" schritt={10} max={10_000}
                    hilfe="Arbeitgeberfinanziert in eine Unterstützungskasse: unbegrenzt steuer- und sozialabgabenfrei."
                  />
                  {modell.weg === 'dv' && (
                    <Schalter
                      label="Pflichtzuschuss ist im Matching enthalten" wert={modell.zuschussImMatching}
                      onChange={(zuschussImMatching) => modellAendern({ zuschussImMatching })}
                    />
                  )}
                </>
              )}
              <ZahlFeld
                label="Umwandlung je Teilnehmer im Monat" wert={stand.umwandlungMonat}
                onChange={(umwandlungMonat) => aendern({ umwandlungMonat })} einheit="€" schritt={10} max={10_000}
                hilfe="Im Schnitt — jeder Teilnehmer ist mit diesem Betrag gerechnet."
              />
              {unterMindest && (
                <Hinweis klasse="text-xs">
                  Unter {euro(modell.mindestUmwandlungMonat)} Umwandlung gibt es keinen Festbetrag — nur den gesetzlichen
                  Zuschuss.
                </Hinweis>
              )}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                {firmaHatAnderes && (
                  <button type="button" onClick={() => aendern({ modell: { ...firmaModell } })} className={KNOPF_KLEIN}>
                    Modell aus dem Angebot der Firma
                  </button>
                )}
                <a href={modellSeite(modell)} className={LINK}>
                  Für einen Mitarbeiter ansehen <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </a>
              </div>
            </Kasten>

            <Kasten titel="Teilnahme">
              <p className="text-xs leading-relaxed text-ui-schiefer">
                Wie viele Mitarbeiter mitmachen — drei Annahmen nebeneinander.
              </p>
              <div className="grid grid-cols-3 gap-2">
                <ProzentFeld label="Vorsichtig" wert={stand.quoten[0]} onChange={(v) => quoteAendern(0, v)} min={0} max={100} stellen={0} />
                <ProzentFeld label="Erwartet" wert={stand.quoten[1]} onChange={(v) => quoteAendern(1, v)} min={0} max={100} stellen={0} />
                <ProzentFeld label="Hoch" wert={stand.quoten[2]} onChange={(v) => quoteAendern(2, v)} min={0} max={100} stellen={0} />
              </div>
            </Kasten>

            <Kasten titel="Heute schon: VL">
              <ZahlFeld
                label="Vermögenswirksame Leistungen im Monat" wert={stand.vlMonat} onChange={(vlMonat) => aendern({ vlMonat })}
                einheit="€" schritt={5} max={1_000} hilfe="Je Mitarbeiter. Ohne Angabe kein Vergleich."
              />
              <ZahlFeld
                label="Mitarbeiter mit VL" wert={stand.vlAnzahl} onChange={(n) => aendern({ vlAnzahl: Math.round(n) })}
                max={99_999} schritt={1}
              />
            </Kasten>

            <Kasten titel="Unternehmen">
              <AuswahlFeld
                label="Sitz" wert={bundesland} onChange={setBundesland}
                optionen={BUNDESLAENDER.filter((l) => l !== 'Bund').map((l) => ({ wert: l as string, text: l }))}
              />
              <ProzentFeld
                label="Steuersatz auf den Gewinn" wert={steuersatz} onChange={setSteuersatz} min={0} max={60}
                hilfe="GmbH mit 400 % Hebesatz rund 30 %. Einzelunternehmen und Personengesellschaften: persönlicher Satz."
              />
              <ProzentFeld
                label="Umlagen U1, U2, Insolvenzgeld" wert={umlagen} onChange={setUmlagen} min={0} max={10} stellen={2}
                hilfe="Sparen Sie auf den beitragsfreien Teil zusätzlich. Ohne Angabe nicht eingerechnet."
              />
              <UmlagenErklaerung onWaehlen={setUmlagen} />
            </Kasten>
          </div>

          {/* --- Ergebnis ---------------------------------------------------- */}
          <div className="space-y-4 lg:col-span-8 print:space-y-2">
            {r.koepfe === 0 ? (
              <section className={KARTE} data-leer="">
                <h2 className={KARTE_TITEL}>Noch keine Belegschaft</h2>
                <p className={ERKLAERUNG}>
                  Tragen Sie mindestens eine Gruppe mit Anzahl und Jahresgehalt ein — oder fügen Sie die Lohnliste ein.
                </p>
              </section>
            ) : (
              <>
                {/* Die drei Szenarien als Wertkarten; die erwartete Teilnahme ist die Akzentkarte. */}
                <section className="grid gap-3 sm:grid-cols-3 print:grid-cols-3 print:gap-2" data-szenarien="">
                  {r.szenarien.map((s, i) => (
                    <SzenarioKachel
                      key={i} akzent={i === 1} lang={langeZahlen}
                      titel={`Wenn ${prozent(s.quote, 0)} mitmachen`}
                      betrag={s.agNettoJahr}
                      unten={`netto im Jahr · ${prozent(s.anteilLohnsumme, 2)} der Lohnsumme`}
                    />
                  ))}
                </section>

                <section className={`${KARTE} print:break-inside-avoid`}>
                  <h2 className={KARTE_TITEL}>Die Rechnung für den Betrieb im Jahr</h2>
                  <p className={ERKLAERUNG}>
                    {koepfeText(r.koepfe)}, Lohnsumme {euro(r.lohnsummeJahr)}. Jeder Teilnehmer wandelt
                    {' '}{euro(stand.umwandlungMonat)} im Monat um.
                  </p>
                  <table className={TABELLE} data-rechnung="">
                    <thead>
                      <tr className={TABELLE_KOPF}>
                        <th scope="col" className={`${KOPFZELLE} ${BEGRIFF} font-normal`}>Teilnahme</th>
                        {r.szenarien.map((s, i) => (
                          <th key={i} scope="col" className={`${KOPFZELLE} pl-2 text-right font-medium text-ui-tinte sm:pl-3`}>{prozent(s.quote, 0)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="text-ui-tinte">
                      <SzenarioZeile text="Teilnehmer" werte={r.szenarien.map((s) => Math.round(s.teilnehmer).toLocaleString('de-DE'))} />
                      <SzenarioZeile text={`${beitrag} des Arbeitgebers`} werte={r.szenarien.map((s) => euro(s.agBeitragJahr))} />
                      <SzenarioZeile
                        text={`−\u00a0gesparte Sozialabgaben${umlagen > 0 ? ' und Umlagen' : ''}`}
                        werte={r.szenarien.map((s) => euro(s.agAbgabenGespartJahr))}
                      />
                      <SzenarioZeile text={'=\u00a0Kosten vor Steuern'} werte={r.szenarien.map((s) => euro(s.agKostenVorSteuerJahr))} art="stark" />
                      <SzenarioZeile text={<>{'−\u00a0Steuerersparnis '}<span className="hidden sm:inline print:inline">(Betriebsausgabe)</span></>} werte={r.szenarien.map((s) => euro(s.agSteuerersparnisJahr))} />
                      <SzenarioZeile text={'=\u00a0kostet netto im Jahr'} werte={r.szenarien.map((s) => euro(s.agNettoJahr))} art="summe" />
                      <SzenarioZeile text="je Teilnehmer im Monat" werte={r.szenarien.map((s) => euro(s.agNettoJeTeilnehmerMonat))} />
                      <SzenarioZeile text="Anteil an der Lohnsumme" werte={r.szenarien.map((s) => prozent(s.anteilLohnsumme, 2))} />
                      <SzenarioZeile
                        text="In die Altersvorsorge der Mitarbeiter" werte={r.szenarien.map((s) => euro(s.vorsorgeJahr))} art="stark"
                      />
                    </tbody>
                  </table>
                </section>

                <section className={`${KARTE} print:break-inside-avoid`}>
                  <h2 className={KARTE_TITEL}>Was kostet ein Teilnehmer — je Gehaltsgruppe?</h2>
                  <p className={ERKLAERUNG}>
                    Im Monat, nach Steuern und gesparten Abgaben. Derselbe {beitrag === 'Matching und Pflichtzuschuss' ? 'Beitrag' : beitrag} kostet Sie
                    je nach Gehalt unterschiedlich viel.
                  </p>
                  <table className={TABELLE} data-gruppen="">
                    <thead>
                      <tr className={TABELLE_KOPF}>
                        <th scope="col" className={`${KOPFZELLE} ${BEGRIFF} font-normal`}>{tabelle.baender ? 'Gehalt im Jahr' : 'Gruppe'}</th>
                        <th scope="col" className={`${KOPFZELLE} pl-2 text-right font-normal sm:pl-3`}>Köpfe</th>
                        <th scope="col" className={`${KOPFZELLE} pl-2 text-right font-normal sm:pl-3`}>{tabelle.baender ? 'Schnitt' : 'Gehalt'}</th>
                        <th scope="col" className={`${KOPFZELLE} hidden pl-3 text-right font-normal sm:table-cell print:table-cell`}>
                          {modell.art === 'matching' ? 'Arbeitgeberbeitrag' : beitrag}
                        </th>
                        <th scope="col" className={`${KOPFZELLE} whitespace-nowrap pl-2 text-right font-medium text-ui-tinte sm:pl-3`}>
                          <span className="sm:hidden print:hidden">AG netto</span>
                          <span className="hidden sm:inline print:inline">Arbeitgeber netto</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="text-ui-tinte">
                      {tabelle.zeilen.map((z) => (
                        <tr key={z.schluessel} className={TABELLE_ZEILE}>
                          <th scope="row" className={`${ZELLE} ${BEGRIFF} font-normal`}>
                            <span className="font-medium">{z.text}</span>
                            {/* Im Ausdruck dahinter statt darunter: eine Zeile je Gruppe, damit Seite 1 auch zwölf trägt. */}
                            <span className="hidden text-ui-schiefer print:inline"> · </span>
                            <span className="block text-xs text-ui-schiefer print:inline print:text-[9px]">{LAGE_TEXT[z.lage]}</span>
                          </th>
                          <td className={`${ZELLE} ${ZAHL}`}>{z.anzahl.toLocaleString('de-DE')}</td>
                          <td className={`${ZELLE} ${ZAHL}`}>{z.gehaltText}</td>
                          <td className={`${ZELLE} ${ZAHL} hidden sm:table-cell print:table-cell`}>{euro(z.agBeitragMonat)}</td>
                          <td className={`${ZELLE} ${ZAHL} font-medium`}>{euro(z.agNettoMonat)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className={FUSSNOTE}>
                    Bis {euro(p.bbgKvJahr)} Jahresgehalt sparen Sie auf die Umwandlung alle Sozialabgaben, bis
                    {' '}{euro(p.bbgRvJahr)} noch Renten- und Arbeitslosenversicherung, darüber nichts mehr
                    (Beitragsbemessungsgrenzen {p.jahr}).
                    {tabelle.baender && ' Mehr als zwölf Gruppen sind zu Gehaltsbändern zusammengefasst; die Summen sind je Gruppe gerechnet.'}
                  </p>
                  {schnitt && (
                    <Hinweis klasse="mt-3 print:mt-1 print:px-2 print:py-1 print:text-[10px] print:leading-snug">
                      <span data-schnitt="">
                        Ein Beispiel-Mitarbeiter mit dem Durchschnittsgehalt von {euro(Math.round(schnitt.gehalt / 100) * 100)}, mal
                        {' '}{Math.round(mitte.teilnehmer).toLocaleString('de-DE')} Teilnehmer, ergäbe {euro(schnitt.kosten)} im Jahr —
                        {' '}<strong className="font-medium">{euro(Math.abs(schnitt.abstand))} {schnitt.abstand > 0 ? 'zu wenig' : 'zu viel'}</strong>.
                        {' '}Deshalb rechnet der Betriebs-Check jede Gruppe für sich.
                      </span>
                    </Hinweis>
                  )}
                </section>

                {/* Im Ausdruck beginnt hier Seite 2. */}
                <div className="space-y-4 print:break-before-page print:space-y-2">
                  <p className="ui-titel hidden text-lg text-ui-tinte print:block">Einordnung</p>

                  {mitte.agKostenVorSteuerJahr > 0.5 ? (
                    <section className={`${KARTE} print:break-inside-avoid`} data-gehalt="">
                      <h2 className={KARTE_TITEL}>Dasselbe Geld als Gehaltserhöhung?</h2>
                      <p className={ERKLAERUNG}>
                        Bei {prozent(mitte.quote, 0)} Teilnahme kostet das Modell Sie {euro(mitte.agKostenVorSteuerJahr)} im Jahr vor
                        Steuern. Was kommt von diesem Geld bei Ihren Mitarbeitern an?
                      </p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 print:mt-1 print:grid-cols-2 print:gap-2">
                        <VergleichWert
                          titel="Als Beitrag zur Betriebsrente" betrag={mitte.agBeitragJahr}
                          unten="fließen in die Altersvorsorge — ohne Abzüge"
                        />
                        <VergleichWert
                          titel="Als Gehaltserhöhung" betrag={mitte.gehaltNettoJahr}
                          unten="kommen netto an — nach Steuern und Sozialabgaben"
                        />
                      </div>
                      <p className={FUSSNOTE}>
                        Beides kostet Sie gleich viel. Dazu kommt, was die Mitarbeiter selbst umwandeln: Insgesamt fließen
                        {' '}{euro(mitte.vorsorgeJahr)} im Jahr in ihre Altersvorsorge — das kostet sie netto {euro(mitte.maNettoJahr)}.
                      </p>
                    </section>
                  ) : (
                    <section className={KARTE} data-gehalt="">
                      <h2 className={KARTE_TITEL}>Das Modell trägt sich selbst</h2>
                      <p className={ERKLAERUNG}>
                        Die gesparten Sozialabgaben decken Ihren Beitrag. Insgesamt fließen {euro(mitte.vorsorgeJahr)} im Jahr in
                        die Altersvorsorge der Mitarbeiter.
                      </p>
                    </section>
                  )}

                  {r.vl && (
                    <section className={`${KARTE} print:break-inside-avoid`} data-vl="">
                      <h2 className={KARTE_TITEL}>Ihre VL von heute — als Beitrag zur Betriebsrente</h2>
                      <p className={ERKLAERUNG}>
                        {euro(r.vl.betragMonat)} im Monat für {koepfeText(r.vl.anzahl)}. Heute ist die VL Lohn: Sie zahlen
                        Sozialabgaben darauf, die Mitarbeiter Steuern und Abgaben.
                      </p>
                      <div className="mt-3 grid gap-x-8 gap-y-3 sm:grid-cols-2 print:mt-1 print:grid-cols-2 print:gap-y-1">
                        <dl className="text-sm print:text-xs">
                          <Zeile text="VL heute, kostet Sie netto im Jahr" betrag={r.vl.heuteNettoJahr} />
                          <Zeile text="als Beitrag zur Betriebsrente" betrag={r.vl.alsBetriebsrenteNettoJahr} />
                          <Zeile text="= Sie sparen im Jahr" betrag={r.vl.ersparnisNettoJahr} summe />
                        </dl>
                        <dl className="text-sm print:text-xs">
                          <Zeile text="Heute kommt netto an" betrag={r.vl.heuteBeimMitarbeiterNettoJahr} />
                          <Zeile text="In der Betriebsrente kommt an" betrag={r.vl.alsBetriebsrenteVorsorgeJahr} stark />
                        </dl>
                      </div>
                      <p className={FUSSNOTE}>
                        Als Arbeitgeberbeitrag zur Betriebsrente ist dieselbe VL steuer- und beitragsfrei — sie kommt ungekürzt
                        in der Altersvorsorge an.
                      </p>
                    </section>
                  )}

                  <section className={`${KARTE} print:break-inside-avoid`}>
                    <h2 className={KARTE_TITEL}>So ist gerechnet</h2>
                    <Punkte klasse="mt-3 print:mt-1">
                      <li>Jede Gehaltsgruppe für sich — mit derselben Rechnung wie auf der Seite des Modells.</li>
                      <li>
                        Jeder Teilnehmer wandelt <strong>{euro(stand.umwandlungMonat)} im Monat</strong> um; alle Gruppen
                        nehmen gleich häufig teil.
                      </li>
                      <li>
                        Für das Netto der Mitarbeiter: gesetzlich versichert, ledig, ohne Kinder und Kirchensteuer, Sitz
                        {' '}{bundesland}. <strong>Ihre Kosten</strong> hängen davon nicht ab — nur am Gehalt.
                      </li>
                      <li>
                        Beitragsbemessungsgrenzen {p.jahr}: {euro(p.bbgKvJahr)} in der Kranken- und Pflegeversicherung,
                        {' '}{euro(p.bbgRvJahr)} in der Renten- und Arbeitslosenversicherung.
                      </li>
                    </Punkte>
                  </section>

                  {/* Nur im Ausdruck: Die Vorlage endet mit der Entscheidung. */}
                  <section className={`${KARTE} hidden print:block print:break-inside-avoid`} data-entscheidung="">
                    <h2 className={KARTE_TITEL}>Entscheidung</h2>
                    <p className="mt-1 text-[10px] leading-snug text-ui-tinte">Modell: {modellText(modell)}.</p>
                    <div className="mt-6 grid grid-cols-3 gap-6 text-[9px] text-ui-schiefer">
                      <div className="border-t border-ui-tinte pt-1">Einführung zum</div>
                      <div className="border-t border-ui-tinte pt-1">Ort, Datum</div>
                      <div className="border-t border-ui-tinte pt-1">Unterschrift Arbeitgeber</div>
                    </div>
                  </section>

                  <p className="text-xs leading-relaxed text-ui-schiefer print:text-[8px]">
                    Modellrechnung zum Rechtsstand {p.jahr}, keine Steuer- oder Rechtsberatung. Die Teilnahme ist eine
                    Annahme. Nicht enthalten: die Besteuerung und Verbeitragung der späteren Leistungen. Die Ausgestaltung
                    sollte ein bAV-Spezialist prüfen.
                  </p>
                </div>
              </>
            )}

            <div className="flex flex-wrap gap-2 print:hidden">
              <button type="button" onClick={() => window.print()} className={KNOPF} disabled={r.koepfe === 0}>
                <Printer className="h-4 w-4" aria-hidden /> Entscheidungsvorlage drucken
              </button>
              <UebernehmenKnopf modell={modell} bundesland={bundesland} firmaId={kunde.firma?.eigene ? kunde.firma.id : null} />
            </div>
            <RechtsLinks />
          </div>
        </div>
      </main>
    </div>
  );
}
