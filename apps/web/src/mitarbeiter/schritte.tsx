import { createContext, useContext, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { CheckCircle2, FileSignature, FileText, Plus, Printer, Trash2, Wand2, XCircle } from 'lucide-react';
import { BUNDESLAENDER, bavMitarbeiter, type FirmenModell, type MitarbeiterBav } from '@renten/engine';
import {
  AXA_KANAELE, RENTENZIELE, steuerklasseAus,
  type AxaAngaben, type BeratungAngaben, type BeratungDaten, type BeratungStatus, type FirmenAngebot, type VersichererWerte,
} from '@renten/schema';
import {
  linkErstellen, speicherungenAbwarten, unterschreiben, type Firma, type NeuerLink, type UnterlagenArt, type Unterlagen,
  type UnterlagenHtml, type UnterschriftPerson,
} from '../lib/bav-beratung';
import { linkSeite } from '../lib/unterschrift-link';
import type { Auftritt } from '../features/auftritt';
import { KRANKENKASSEN, KASSEN_STAND, KASSEN_STAND_EN } from '../features/krankenkassen';
import {
  AuswahlFeld, DatumFeld, GegenueberZeile, InfoPunkt, Kennzahl, NamenFelder, ProzentFeld, TextFeld, ZahlFeld, euro, euroGenau,
} from '../components/Feld';
import { JA_NEIN, Wahl } from '../components/Frage';
import { mitName, namensTeile, vollerName } from '../lib/namen';
import { emailGueltig } from '../lib/email';
import { laufzeitText } from '../features/tuev-berechnung';
import {
  AKZENT, Anteile, ETIKETT, FELD_LABEL, Hervor, Hinweise, KNOPF, KNOPF_ZWEIT, Karte, LINK, Posten, SCHWEBEND, TextBereich, Titel,
  Vermerk, WertKarte, Zahl,
} from '../components/stil';
import { LueckenRing, RENTENZIEL_RING, RENTENZIEL_RING_EN } from '../components/LueckenRing';
import { AnteilsRing } from '../components/AnteilsRing';
import { Stuecke as AblaufStuecke, type Stueck } from '../components/Ablauf';
import { useSprache, useW, type Sprache } from '../lib/sprache';
import { stueckAusgeblendet, type Kennung } from './gespraech';
import { FirmenZeichen, useDrucken } from './bausteine';
import {
  P, automatischerBeginn, beitragsHinweise, belastungJeVertrag, grvVon, hochrechnung, hochrechnungJeVertrag, lueckeMitBetriebsrente, monatsgehalt,
  einrasten, probeabrechnung, reglerGrenzen, reglerStufen, rentenbeginnVon, spaeterBeginnen, stufeWeiter, umwandlungFuerNetto,
  type AuszahlungsWerte, type BelastungsTreppe, type Hochrechnung, type KennzahlenErgebnis, type KennzahlenWeg, type Leistung,
  type LueckeMitBetriebsrente, type Probeabrechnung, type SpaeterZeile, type Versorgungsluecke,
} from './rechnung';
import {
  fazitText, festePunkte, firmenHinweise, gehaelterOptionen, lohnsteuerHinweis, mindestzuschussText,
  nettolohnGrundlage, regelKern, regelText, reglerErklaerung, steuerklasseOptionen, traegerText, vertragName,
} from './texte';
import { Gespraechsunterlagen, Protokoll, Vereinbarung, Verzicht } from './druck';
import { AxaAntrag, AxaVerzicht } from './axa-antrag';
import { AXA_BELEHRUNG, AXA_ERLAEUTERT, AXA_FRAGEN, AXA_FUSSNOTEN, axaBerater, axaFehlt, istAxaAntrag } from './axa';
import { unterlageErfassen } from './festschreiben';
import { UnterschriftenKarte, festgeschriebenDrucken, type Luecke, type Unterzeichner } from './Unterschrift';
import { ScrollBereich } from '../components/ScrollBereich';
import {
  abrechnungZeile, anbieterSatz, angebotSatz, angebotVertraege, axaZeile, einkommenUndKvZeile, entscheidungZeile, grvZeile,
  beitragZeile, kennzahlenZeile, lueckeMitZeile, lueckeZeile, ortZeile, personZeile, spaeterZeile,
  unterlagenZeile, vertragZeile, vorsorgeZeile,
} from './zeilen';

/** Was zum Drucken der Unterlagen gebraucht wird — in der Entscheidung und bei den Unterlagen. */
interface UnterlagenProps {
  auftritt: Auftritt | null;
  sichern: (d: BeratungDaten) => Promise<boolean>;
  luecke: Versorgungsluecke | null;
  kennzahlen: KennzahlenErgebnis | null;
}

/** Fuer die Unterschrift am Bildschirm — nur bei den Unterlagen. */
interface UnterschriftProps {
  beratungId: string;
  /** null: noch nicht unterschrieben */
  unterlagen: Unterlagen | null | 'fehler';
  aktualisieren: () => Promise<void>;
  /** Die aufgeschobenen Projektionen sind auf dem neuesten Stand — erst dann wird festgeschrieben. */
  aktuell: boolean;
}

export interface SchrittProps {
  firma: Firma;
  logo: string | null;
  daten: BeratungDaten;
  setze: (fn: (d: BeratungDaten) => BeratungDaten) => void;
  r: MitarbeiterBav;
  leistung: Leistung | null;
  /** Zu einem Schritt — und dort, wenn genannt, zu einem seiner Stuecke */
  geheZu: (i: number, stueck?: string) => void;
  /** Unterschrieben: alles nur noch zum Ansehen */
  gesperrt: boolean;
}

/*
 * JEDER SCHRITT BESTEHT AUS STUECKEN (`components/Ablauf.tsx`): Eins ist
 * offen, „Weiter“ zeigt das naechste, das vorige wird zur Zeile mit seinem
 * Ergebnis (`zeilen.ts`). So erklaert der Berater eins nach dem anderen,
 * statt dass ein Schritt alles auf einmal zeigt.
 *
 * DEUTSCH UND ENGLISCH (`lib/sprache.tsx`): Jeder Text steht als
 * `w('Deutsch', 'English')` da — der deutsche unveraendert, der englische
 * daneben. Zahlen und Daten bleiben in deutscher Schreibweise. Was die AXA
 * im Wortlaut vorgibt (Belehrung, Fragen zur Gesundheit) und die Unterlagen
 * selbst bleiben deutsch.
 */

/**
 * Der Inhalt eines Stuecks. Unterschrieben steht er nur noch zum Ansehen da:
 * Ein deaktiviertes fieldset sperrt jedes Feld und jeden Knopf darin. Die
 * Zeilen der Stuecke und „Weiter“ liegen ausserhalb und bleiben bedienbar.
 *
 * Der Inhalt liegt in einem eigenen Block, nicht direkt im fieldset: Kommt
 * dort ein Kind dazu oder faellt eines weg (ein Hinweis zum gewaehlten
 * Betrag), baut Chrome das fieldset neu auf — und bricht damit ab, was
 * darin gerade gezogen wird, etwa den Regler.
 */
function Inhalt({ gesperrt, klasse, children }: { gesperrt: boolean; klasse?: string; children: ReactNode }) {
  // `handy-eingaben`: am Telefon Eingaben in 16 px und daumenhoch (index.css) — darunter zoomt iOS beim Antippen hinein.
  return <fieldset disabled={gesperrt} className="handy-eingaben min-w-0"><div className={klasse}>{children}</div></fieldset>;
}

/** Name der Liste der Stuecke fuer Screenreader. */
const stueckeVon = (schritt: string, s: Sprache = 'de') => (s === 'en' ? `Parts of the step “${schritt}”` : `Stücke des Schritts „${schritt}“`);

/**
 * Die im Gespraech ausgeblendeten Seiten (`gespraech.ts`) — null in der
 * Vorbereitung: Dann steht jede Seite da. Die Beratung gibt sie vor, die
 * Schritte lesen sie hier, statt sie durch jeden Aufruf zu reichen.
 */
export const GespraechKontext = createContext<ReadonlySet<string> | null>(null);

/**
 * Die Stuecke eines Schritts — im Gespraech ohne die ausgeblendeten Seiten.
 * Was fehlt, steht weder als Zeile da noch fuehrt „Weiter“ dorthin; der Weg
 * schliesst sich um die Luecke. Vertiefungen bleiben, solange ihr Schritt
 * dasteht.
 */
function Stuecke({ kennung, stuecke, beschriftung }: { kennung: Kennung; stuecke: readonly Stueck[]; beschriftung: string }) {
  const ausgeblendet = useContext(GespraechKontext);
  const gezeigt = ausgeblendet ? stuecke.filter((x) => !stueckAusgeblendet(ausgeblendet, kennung, x.id)) : stuecke;
  return <AblaufStuecke kennung={kennung} stuecke={gezeigt} beschriftung={beschriftung} />;
}

const LAENDER = BUNDESLAENDER.filter((l) => l !== 'Bund').map((l) => ({ wert: l as string, text: l }));
const kassen = (s: Sprache) => [
  // Kurz: In der halben Spalte wuerde ein laengerer Text abgeschnitten. Was gilt, wenn die Kasse fehlt, steht am Zusatzbeitrag.
  { wert: '', text: s === 'en' ? 'Please choose' : 'Bitte wählen' },
  ...KRANKENKASSEN.map((k) => ({ wert: k.name, text: k.name })),
];
const JETZT = new Date().getFullYear();
type JaNeinOptionen = readonly { wert: 'ja' | 'nein'; text: string }[];
const JA_NEIN_EN: JaNeinOptionen = [{ wert: 'ja', text: 'Yes' }, { wert: 'nein', text: 'No' }];

/* --- 1. Angebot der Firma ------------------------------------------------ */

/** Die Regel der Firma, ihr Kern („50 % Ihres Beitrags“) hervorgehoben. */
function RegelMitKern({ modell }: { modell: FirmenModell }) {
  const s = useSprache();
  const text = regelText(modell, s);
  const kern = regelKern(modell, s);
  const i = text.indexOf(kern);
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<Hervor>{kern}</Hervor>{text.slice(i + kern.length)}</>;
}

export function SchrittAngebot({ firma, logo }: SchrittProps) {
  const w = useW();
  const s = useSprache();
  const a = firma.angebot;
  // Beispiel bei 100 EUR Umwandlung und einem mittleren Gehalt — die eigene Rechnung folgt in Schritt 4.
  const bsp = useMemo(() => bavMitarbeiter(
    a.modell as FirmenModell,
    { jahresbrutto: 45_000, umwandlungMonat: 100, privatVersichert: false, pkvPraemieMonat: 0, kinder: { hatKinder: false, kinderUnter25: 0 }, bavBestandMonat: 0 },
    { verheiratet: false, bundesland: a.bundesland, kirchensteuerpflichtig: false },
    P,
  ), [a.modell, a.bundesland]);

  const stuecke: Stueck[] = [
    {
      id: 'angebot',
      titel: w('Ihr Angebot', 'Your offer'),
      ergebnis: angebotSatz(a, s),
      inhalt: (
        <div className="space-y-6 sm:space-y-8">
          {/* Der Einstieg fuer den Mitarbeiter: grosser Name in Inter Tight, die Regel als Akzentkarte. */}
          <div>
            <FirmenZeichen name={firma.name} logo={logo} gross />
            <p className="mt-4 max-w-3xl whitespace-pre-line text-lg leading-relaxed text-ui-schiefer">
              {a.begruessung.trim() || w(`${firma.name} unterstützt Ihre Altersvorsorge mit einer Betriebsrente.`,
                `${firma.name} supports your retirement provision with a company pension.`)}
            </p>
          </div>
          <div className={`${AKZENT} p-6 sm:p-10`}>
            {/* Ueberschrift, nicht blosser Absatz: Zwischen dem Firmennamen (h1) und den Hinweisen (h3) fehlte sonst eine Ebene. */}
            <h2 className="text-sm">{w('Ihr Angebot', 'Your offer')}</h2>
            <p className="ui-titel mt-2 max-w-3xl text-balance text-[26px] font-normal leading-[1.25] sm:text-[34px]">
              <RegelMitKern modell={a.modell} />
            </p>
            <p className="mt-4 max-w-3xl text-base leading-relaxed">
              {w(
                <>
                  Ein Beispiel: Wandeln Sie <strong>100 €</strong> im Monat um, legt Ihr Arbeitgeber{' '}
                  <strong className="tabular-nums">{euroGenau(bsp.arbeitgeberMonat)}</strong> dazu — in Ihre Vorsorge fließen{' '}
                  <strong className="tabular-nums">{euroGenau(bsp.gesamtMonat)}</strong>. Was Sie das netto kostet, rechnen wir gleich mit Ihren Angaben.
                </>,
                <>
                  An example: if you convert <strong>100 €</strong> of your salary a month, your employer adds{' '}
                  <strong className="tabular-nums">{euroGenau(bsp.arbeitgeberMonat)}</strong> — so{' '}
                  <strong className="tabular-nums">{euroGenau(bsp.gesamtMonat)}</strong> go into your pension. What this costs you net, we
                  will work out in a moment with your details.
                </>,
              )}
            </p>
          </div>
        </div>
      ),
    },
    /*
      ZUM VERTIEFEN, nicht auf dem Weg: eine Liste von Bedingungen, bevor der
      Mitarbeiter seine eigenen Zahlen gesehen hat, haelt nur auf. Sie steht
      unter dem Angebot als Zeile und in den gedruckten Unterlagen.
    */
    {
      id: 'bedingungen',
      vertiefung: true,
      titel: w('Anbieter und Bedingungen', 'Provider and terms'),
      ergebnis: anbieterSatz(a, s),
      inhalt: (
        <Karte titel={w('Anbieter und Bedingungen', 'Provider and terms')}>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            {angebotVertraege(a).map((weg) => (
              <div key={weg}>
                <dt className={ETIKETT}>{vertragName(weg, a, s)}</dt>
                <dd className="mt-0.5 text-base text-ui-tinte">
                  {traegerText(weg, a, s) || w('Anbieter wird im Gespräch genannt', 'The provider will be named in the consultation')}
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-6 space-y-6">
            {/* Die eigenen Hinweise der Firma stehen da, wie der Berater sie eingetragen hat — uebersetzt wird nur die Ueberschrift. */}
            <Hinweise titel={w(`Was ${firma.name} dazu festgelegt hat`, `What ${firma.name} has specified`)} punkte={firmenHinweise(a)} />
            <Hinweise titel={w('Gut zu wissen', 'Good to know')} punkte={festePunkte(a, s)} />
          </div>
        </Karte>
      ),
    },
  ];

  return <Stuecke kennung="angebot" beschriftung={stueckeVon(w('Angebot', 'Your offer'), s)} stuecke={stuecke} />;
}

/* --- 2. Angaben ------------------------------------------------------------ */

export function SchrittAngaben({ firma, daten, setze, gesperrt }: SchrittProps) {
  const w = useW();
  const s = useSprache();
  const a = daten.angaben;
  const setzeA = (p: Partial<BeratungAngaben>) => setze((d) => ({ ...d, angaben: { ...d.angaben, ...p } }));
  const regel = rentenbeginnVon({ ...a, rentenbeginn: '' });
  // Auf einen Tippfehler erst hinweisen, wenn das Feld verlassen ist — nicht mitten im Tippen.
  const [mailVerlassen, setMailVerlassen] = useState(false);
  const mailFehler = mailVerlassen && a.email.trim() !== '' && !emailGueltig(a.email)
    ? w('Bitte prüfen Sie die Adresse — etwa name@beispiel.de.', 'Please check the address — for example name@example.com.') : null;

  // Die Felder stehen ab mittlerer Breite zu zweit nebeneinander — ein einzelnes fuellt eine halbe Zeile.
  const ZWEI = 'grid gap-3 sm:grid-cols-2';

  const stuecke: Stueck[] = [
    {
      id: 'person',
      titel: w('Zur Person', 'About you'),
      ...personZeile(a, new Date(), s),
      inhalt: (
        <Inhalt gesperrt={gesperrt}>
          <Karte titel={w('Zur Person', 'About you')}>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <NamenFelder {...namensTeile(a.name, a.vorname, a.nachname)} onChange={(teile) => setzeA(mitName(teile))} />
              </div>
              {/* Kontakt fuer Rueckfragen und die Unterlagen per E-Mail. „off“: nicht die eigenen Daten des Beraters vorschlagen. */}
              <div className={ZWEI}>
                <TextFeld label={w('E-Mail', 'Email')} typ="email" wert={a.email} onChange={(email) => setzeA({ email })} onBlur={() => setMailVerlassen(true)}
                  fehler={mailFehler} maxLaenge={120} autoComplete="off" />
                <TextFeld label={w('Telefon', 'Phone')} typ="tel" wert={a.telefon} onChange={(telefon) => setzeA({ telefon })} maxLaenge={40} autoComplete="off" />
              </div>
              <div className={ZWEI}>
                <DatumFeld label={w('Geburtsdatum', 'Date of birth')} wert={a.geburtsdatum} onChange={(geburtsdatum) => setzeA({ geburtsdatum })} />
                <div>
                  <DatumFeld label={w('Rentenbeginn', 'Start of retirement')} wert={a.rentenbeginn || regel || ''} onChange={(rentenbeginn) => setzeA({ rentenbeginn })}
                    hilfe={!regel ? w('Wird aus dem Geburtsdatum berechnet: die Regelaltersgrenze.', 'Calculated from the date of birth: the standard retirement age.')
                      : a.rentenbeginn ? w('Eingetragen.', 'Entered.')
                        : w('Automatisch: die Regelaltersgrenze aus dem Geburtsdatum. Ändern, wenn die Rente früher oder später beginnt.',
                          'Automatic: the standard retirement age from the date of birth. Change it if the pension starts earlier or later.')} />
                  {regel && a.rentenbeginn && a.rentenbeginn !== regel && (
                    <button type="button" onClick={() => setzeA({ rentenbeginn: '' })} className={`mt-1 ${LINK} text-xs`}>
                      {w('Regelaltersgrenze verwenden', 'Use the standard retirement age')} ({regel})
                    </button>
                  )}
                </div>
              </div>
              {istAxaAntrag(firma.angebot) && (
                <div className={ZWEI}>
                  <TextFeld label={w('Derzeitige Tätigkeit (für den AXA-Antrag)', 'Current occupation (for the AXA application)')} wert={a.taetigkeit} onChange={(taetigkeit) => setzeA({ taetigkeit })}
                    maxLaenge={80} />
                </div>
              )}
            </div>
          </Karte>
        </Inhalt>
      ),
    },
    /*
      EINKOMMEN, STEUER UND KRANKENVERSICHERUNG in einem Stueck: Die
      Krankenversicherung war ein eigenes — fuer zwei Felder ein „Weiter“
      mehr. Zwei Karten untereinander, eine Zeile im Ablauf.
    */
    {
      id: 'einkommen',
      titel: w('Einkommen, Steuer und Krankenversicherung', 'Income, tax and health insurance'),
      ...einkommenUndKvZeile(a, s),
      inhalt: (
        <Inhalt gesperrt={gesperrt} klasse="space-y-5 sm:space-y-6">
          <Karte titel={w('Einkommen und Steuer', 'Income and tax')}>
            <div className="space-y-3">
              {/* Das Monatsgehalt wie auf der Abrechnung; gespeichert wird das Jahr mit Sonderzahlungen. */}
              <div>
                <div className={ZWEI}>
                  <ZahlFeld label={w('Bruttogehalt im Monat', 'Gross salary a month')} wert={Math.round(monatsgehalt(a) * 100) / 100} einheit="€" schritt={100}
                    onChange={(m) => setzeA({ jahresbrutto: m * a.gehaelter })} />
                  <AuswahlFeld label={w('Gehälter im Jahr', 'Salaries a year')} wert={String(a.gehaelter)} optionen={gehaelterOptionen(s)}
                    onChange={(v) => setzeA({ gehaelter: Number(v), jahresbrutto: monatsgehalt(a) * Number(v) })} />
                </div>
                <p className="mt-1 text-xs text-ui-schiefer">
                  = {euro(a.jahresbrutto)} {w('im Jahr', 'a year')}{a.gehaelter > 12 ? w(', mit Weihnachts- und Urlaubsgeld', ', including Christmas and holiday pay') : ''}
                </p>
              </div>
              <div className={ZWEI}>
                <AuswahlFeld label={w('Bundesland', 'Federal state')} wert={a.bundesland || firma.angebot.bundesland} optionen={LAENDER} onChange={(bundesland) => setzeA({ bundesland })} />
                {/* „verheiratet“ wird mitgeschrieben — fuer Fassungen, die die Steuerklasse noch nicht kennen */}
                <AuswahlFeld label={w('Steuerklasse', 'Tax class')} wert={String(a.steuerklasse)} optionen={steuerklasseOptionen(s)}
                  onChange={(v) => { const steuerklasse = steuerklasseAus({ steuerklasse: Number(v), verheiratet: false, partnerBrutto: 0 }); setzeA({ steuerklasse, verheiratet: steuerklasse >= 3 }); }}
                  hilfe={w('Wie auf der Gehaltsabrechnung. Bei III/V gleicht die Steuererklärung aus.', 'As on your payslip. For III/V the tax return evens it out.')} />
              </div>
              {/* Ja oder Nein als zwei Knoepfe — beide Antworten stehen da, ein Tipp genuegt. */}
              <div className={ZWEI}>
                <Wahl label={w('Kirchensteuerpflichtig?', 'Liable to church tax?')} wert={a.kirchensteuer ? 'ja' : 'nein'}
                  optionen={w<JaNeinOptionen>(JA_NEIN, JA_NEIN_EN)}
                  onChange={(v) => setzeA({ kirchensteuer: v === 'ja' })} />
              </div>
              <div>
                <span className={FELD_LABEL}>{w('Kinder', 'Children')}</span>
                <div className="space-y-2">
                  {a.kinder.map((k, i) => (
                    <div key={i} className="flex items-end gap-2 sm:max-w-sm">
                      <div className="flex-1">
                        <ZahlFeld label={w(`Kind ${i + 1}: Geburtsjahr`, `Child ${i + 1}: year of birth`)} wert={k.geburtsjahr} min={1950} max={JETZT}
                          onChange={(geburtsjahr) => setzeA({ kinder: a.kinder.map((x, j) => (j === i ? { ...x, geburtsjahr: Math.round(geburtsjahr) } : x)) })} />
                      </div>
                      <button type="button" aria-label={w(`Kind ${i + 1} entfernen`, `Remove child ${i + 1}`)} onClick={() => setzeA({ kinder: a.kinder.filter((_, j) => j !== i) })}
                        className="mb-1 rounded-full p-2 text-ui-schiefer hover:bg-rose-50 hover:text-rose-700">
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  ))}
                  {a.kinder.length < 15 && (
                    <button type="button" onClick={() => setzeA({ kinder: [...a.kinder, { geburtsjahr: JETZT - 5 }] })} className={KNOPF_ZWEIT}>
                      <Plus className="h-4 w-4" aria-hidden /> {w('Kind hinzufügen', 'Add a child')}
                    </button>
                  )}
                </div>
                <p className="mt-1 text-xs text-ui-schiefer">
                  {w('Kinder senken den Beitrag zur Pflegeversicherung — heute und im Alter.',
                    'Children lower the contribution to long-term care insurance — today and in retirement.')}
                </p>
              </div>
            </div>
          </Karte>
          <Karte titel={w('Krankenversicherung', 'Health insurance')}>
            <div className="space-y-3">
              <div className={ZWEI}>
                <Wahl label={w('Wie sind Sie krankenversichert?', 'How is your health insured?')} wert={a.kv} onChange={(kv) => setzeA({ kv })}
                  optionen={[{ wert: 'gesetzlich', text: w('Gesetzlich', 'Statutory') }, { wert: 'privat', text: w('Privat', 'Private') }]} />
              </div>
              {a.kv === 'gesetzlich' ? (
                <div className={ZWEI}>
                  <AuswahlFeld label={w('Krankenkasse', 'Health insurance fund')} wert={a.krankenkasse} optionen={kassen(s)} hilfe={w(KASSEN_STAND, KASSEN_STAND_EN)}
                    onChange={(v) => {
                      const k = KRANKENKASSEN.find((kk) => kk.name === v);
                      setzeA({ krankenkasse: v, ...(k ? { zusatzbeitrag: k.zusatzbeitrag } : {}) });
                    }} />
                  <ProzentFeld label={w('Zusatzbeitrag', 'Additional contribution')} wert={a.zusatzbeitrag} max={10} stellen={2}
                    hilfe={w('Kasse nicht dabei? Satz hier eintragen.', 'Fund not listed? Enter its rate here.')}
                    onChange={(zusatzbeitrag) => setzeA({ zusatzbeitrag, krankenkasse: '' })} />
                </div>
              ) : (
                <div className={ZWEI}>
                  <ZahlFeld label={w('Beitrag zur privaten Kranken- und Pflegeversicherung im Monat', 'Premium for private health and long-term care insurance a month')} wert={a.pkvPraemieMonat}
                    onChange={(pkvPraemieMonat) => setzeA({ pkvPraemieMonat })} einheit="€" schritt={10} />
                </div>
              )}
            </div>
          </Karte>
        </Inhalt>
      ),
    },
    {
      id: 'vorsorge',
      titel: w('Bisherige Vorsorge', 'Existing provision'),
      ...vorsorgeZeile(a, s),
      inhalt: (
        <Inhalt gesperrt={gesperrt}>
          <Karte titel={w('Bisherige Vorsorge', 'Existing provision')}>
            <div className="space-y-3">
              <div className={ZWEI}>
                <ZahlFeld label={w('Bestehende Betriebsrente: Beitrag im Monat', 'Existing company pension: contribution a month')} wert={a.bavBestandMonat} onChange={(bavBestandMonat) => setzeA({ bavBestandMonat })} einheit="€" schritt={10}
                  hilfe={w('Direktversicherung oder Pensionskasse, Mitarbeiter und Arbeitgeber zusammen. Sie belegt die Freigrenzen zuerst.',
                    'Direct insurance or Pensionskasse, employee and employer together. It uses up the allowances first.')} />
              </div>
              <p className="text-xs leading-relaxed text-ui-schiefer">
                {w('Die gesetzliche Rente folgt im nächsten Schritt — aus dem Gehalt geschätzt und mit der Renteninformation anpassbar.',
                  'The statutory pension follows in the next step — estimated from your salary and adjustable with your pension statement (Renteninformation).')}
              </p>
            </div>
          </Karte>
        </Inhalt>
      ),
    },
  ];

  return <Stuecke kennung="angaben" beschriftung={stueckeVon(w('Ihre Angaben', 'Your details'), s)} stuecke={stuecke} />;
}

/* --- 3. Versorgungsluecke -------------------------------------------------- */

const prozentText = (x: number, stellen = 1) => `${(x * 100).toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen })} %`;

/** Die drei Rentenziele als Pillen — wie die Vorgabe im Loesungsvergleich. */
function RentenzielWahl({ wert, onWahl, titelId }: { wert: number; onWahl: (ziel: number) => void; titelId: string }) {
  return (
    <div role="radiogroup" aria-labelledby={titelId} className="inline-flex gap-1 rounded-full border border-ui-linie bg-ui-karte p-1">
      {RENTENZIELE.map((ziel) => {
        const aktiv = Math.abs(wert - ziel) < 1e-9;
        return (
          <button key={ziel} type="button" role="radio" aria-checked={aktiv} onClick={() => onWahl(ziel)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium tabular-nums transition-colors ${
              aktiv ? 'bg-ui-dunkel text-white' : 'text-ui-schiefer hover:text-ui-tinte'
            }`}>
            {Math.round(ziel * 100)}&nbsp;%
          </button>
        );
      })}
    </div>
  );
}

export function SchrittLuecke({ daten, setze, luecke, aktuell, gesperrt }: SchrittProps & { luecke: Versorgungsluecke | null; aktuell: boolean }) {
  const w = useW();
  const s = useSprache();
  const zielTitel = useId();
  const a = daten.angaben;
  const setzeA = (p: Partial<BeratungAngaben>) => setze((d) => ({ ...d, angaben: { ...d.angaben, ...p } }));
  const rentenbeginn = rentenbeginnVon(a);
  const schaetzung = grvVon(a.jahresbrutto, 0, a.geburtsdatum, rentenbeginn);
  const eingetragen = a.grvRente > 0;

  if (!rentenbeginn || a.jahresbrutto <= 0) {
    return (
      <Stuecke kennung="luecke" beschriftung={stueckeVon(w('Versorgungslücke', 'Pension gap'), s)} stuecke={[{
        id: 'luecke',
        titel: w('Ihre Versorgungslücke', 'Your pension gap'),
        fehlt: w('Geburtsdatum und Bruttogehalt fehlen', 'Date of birth and gross salary missing'),
        inhalt: (
          <Karte>
            <p className="text-sm text-ui-tinte">
              {w('Für die Versorgungslücke fehlen Geburtsdatum und Bruttogehalt (Schritt 2).',
                'The pension gap needs your date of birth and gross salary (step 2).')}
            </p>
          </Karte>
        ),
      }]} />
    );
  }
  const reicht = luecke !== null && luecke.lueckeMonat < 0.5;

  const stuecke: Stueck[] = [
    {
      id: 'luecke',
      titel: w('Ihre Versorgungslücke', 'Your pension gap'),
      ...lueckeZeile(luecke, s),
      inhalt: (
        <Inhalt gesperrt={gesperrt} klasse="space-y-6">
          <div>
            <Titel als="h2" gross>
              {reicht
                ? w(<>Ihre gesetzliche Rente im Vergleich zum <Hervor>Rentenziel</Hervor></>,
                  <>Your statutory pension compared with your <Hervor>pension target</Hervor></>)
                : w(<>Ihre gesetzliche Rente <Hervor>reicht nicht aus</Hervor></>,
                  <>Your statutory pension <Hervor>will not be enough</Hervor></>)}
            </Titel>
            <p className="mt-3 max-w-3xl text-base leading-relaxed text-ui-schiefer">
              {w(
                <>
                  Im Alter brauchen die meisten etwas weniger Geld als heute: Als Rentenziel gelten meist 70 bis 85 % des heutigen
                  Nettolohns. Was die gesetzliche Rente bis dahin offenlässt, heißt Versorgungslücke. Eine Betriebsrente kann sie
                  verkleinern.
                </>,
                <>
                  In retirement most people need a little less money than today: a common pension target is 70 to 85 % of
                  today’s net pay. Whatever the statutory pension leaves open up to that target is called the pension gap.
                  A company pension can make it smaller.
                </>,
              )}
            </p>
          </div>

          {/* Der Ring als schwebendes Stueck Produkt; die Luecke selbst in der Akzentkarte darunter. Oben die Wahl des Rentenziels. */}
          <div className={`${SCHWEBEND} p-5 sm:p-7`}>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div>
                <p id={zielTitel} className="text-sm font-medium text-ui-tinte">{w('Ihr Rentenziel', 'Your pension target')}</p>
                <p className="text-xs tabular-nums text-ui-schiefer">
                  {luecke
                    ? w(`${euro(luecke.zielMonat)} im Monat — ${luecke.zielProzent} % von ${euro(luecke.lohn.nettoMonat)} Nettolohn`,
                      `${euro(luecke.zielMonat)} a month — ${luecke.zielProzent} % of ${euro(luecke.lohn.nettoMonat)} net pay`)
                    : w('ein Anteil am heutigen Nettolohn', 'a share of today’s net pay')}
                </p>
              </div>
              <RentenzielWahl wert={daten.rentenziel} onWahl={(rentenziel) => setze((d) => ({ ...d, rentenziel }))} titelId={zielTitel} />
            </div>
            <div className={`mt-6 ${aktuell ? '' : 'opacity-60'}`}>
              {luecke ? (
                <>
                  <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-center sm:gap-10">
                    <LueckenRing ganz={luecke.zielMonat} gedeckt={luecke.rente.nettoMonat} luecke={luecke.lueckeMonat}
                      gedecktProzent={luecke.renteProzent} lueckeProzent={luecke.lueckeProzent} texte={w(RENTENZIEL_RING, RENTENZIEL_RING_EN)} />
                    <dl className="space-y-4">
                      <Zahl etikett={w('Netto-Altersrente', 'Net pension')} punkt="bg-ui-tinte" wert={euro(luecke.rente.nettoMonat)} zusatz={`${luecke.renteProzent} %`} />
                      <Zahl etikett={w('Versorgungslücke', 'Pension gap')} punkt="bg-ui-luecke ring-1 ring-ui-tinte/20" wert={euro(luecke.lueckeMonat)}
                        zusatz={`${luecke.lueckeProzent} %`} />
                    </dl>
                  </div>
                  {luecke.lueckeProzent > 0 && (
                    <div className={`${AKZENT} mt-6 px-5 py-4`}>
                      <p className="ui-titel text-[24px] leading-snug sm:text-[26px]">
                        {w(
                          <>Bis zu Ihrem Rentenziel fehlen Ihnen <span className="whitespace-nowrap tabular-nums"><Hervor>{luecke.lueckeProzent} %</Hervor></span> Ihres heutigen Nettolohns.</>,
                          <>You are <span className="whitespace-nowrap tabular-nums"><Hervor>{luecke.lueckeProzent} %</Hervor></span> of today’s net pay short of your pension target.</>,
                        )}
                      </p>
                    </div>
                  )}
                  <p className="mt-3 text-xs leading-relaxed text-ui-schiefer">
                    {w(`Die gesetzliche Rente ersetzt ${luecke.renteProzent} % Ihres Nettolohns — in heutiger Kaufkraft.`,
                      `The statutory pension replaces ${luecke.renteProzent} % of your net pay — in today’s purchasing power.`)}
                    {luecke.lueckeProzent > 0
                      ? w(` Zum Rentenziel von ${luecke.zielProzent} % fehlen ${luecke.lueckeProzent} %.`,
                        ` You are ${luecke.lueckeProzent} % short of the pension target of ${luecke.zielProzent} %.`)
                      : w(` Ihr Rentenziel von ${luecke.zielProzent} % ist damit erreicht.`,
                        ` Your pension target of ${luecke.zielProzent} % is therefore reached.`)}
                  </p>
                </>
              ) : (
                <p className="text-sm text-ui-schiefer">{w('Wird gerechnet …', 'Calculating …')}</p>
              )}
            </div>
          </div>

          {/* Die eine Zahl, die der Mitarbeiter mitbringt: Mit der Renteninformation wird aus der Schaetzung sein Wert. */}
          <Karte titel={w('Ihre gesetzliche Rente', 'Your statutory pension')}>
            <div className="grid gap-3 sm:grid-cols-2">
              <ZahlFeld label={w('Gesetzliche Rente nach heutigem Stand (im Monat)', 'Statutory pension as it stands today (a month)')} wert={eingetragen ? a.grvRente : Math.round(schaetzung.monat)}
                onChange={(grvRente) => setzeA({ grvRente })} einheit="€" schritt={50}
                hilfe={eingetragen
                  ? w('Eingetragen — etwa aus der Renteninformation.', 'Entered — for example from your pension statement (Renteninformation).')
                  : w('Aus dem Gehalt geschätzt: Berufsstart mit 22, Gehalt im Verhältnis zum Durchschnitt wie heute. '
                    + 'Mit dem Wert der Renteninformation überschreiben.',
                    'Estimated from your salary: working since the age of 22, salary relative to the average as today. '
                    + 'Overwrite it with the figure from your pension statement (Renteninformation).')} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              {eingetragen ? (
                <button type="button" onClick={() => setzeA({ grvRente: 0 })} className={`${LINK} text-xs`}>
                  {w('Schätzung verwenden', 'Use the estimate')} ({euro(schaetzung.monat)})
                </button>
              ) : (
                <Vermerk>{w('geschätzt', 'estimated')}</Vermerk>
              )}
            </div>
          </Karte>

          <p className="max-w-3xl text-xs leading-relaxed text-ui-schiefer">
            {w('Näherungswerte nach heutigem Recht. Wie gerechnet wird, steht darunter in den Berechnungsgrundlagen.',
              'Approximate figures under current law. How they are calculated is shown below under “Basis of calculation”.')}
          </p>
        </Inhalt>
      ),
    },
    // Wer nachrechnen will: der Weg vom Bruttolohn zur Netto-Rente, mit allen Annahmen.
    ...(luecke ? [{
      id: 'grundlagen',
      vertiefung: true,
      titel: w('Berechnungsgrundlagen', 'Basis of calculation'),
      ...grvZeile(a, schaetzung.monat, s),
      inhalt: (
        <Karte titel={w('Berechnungsgrundlagen', 'Basis of calculation')}>
          <dl className={`divide-y divide-ui-linie text-sm ${aktuell ? '' : 'opacity-60'}`}>
            {([
              [a.gehaelter > 12 ? w('Ihr Bruttolohn im Monatsdurchschnitt', 'Your gross pay, monthly average') : w('Ihr monatlicher Bruttolohn', 'Your monthly gross pay'), euro(luecke.lohn.bruttoMonat)],
              [a.gehaelter > 12 ? w('Ihr Nettolohn heute, im Monatsdurchschnitt', 'Your net pay today, monthly average') : w('Ihr Nettolohn heute', 'Your net pay today'), euro(luecke.lohn.nettoMonat)],
              [w(`Ihr Rentenziel: ${luecke.zielProzent} % davon`, `Your pension target: ${luecke.zielProzent} % of that`), euro(luecke.zielMonat)],
              [w('Rentenbeginn', 'Start of retirement'), w(`${luecke.rentenbeginn} (mit ${luecke.alterBeiRentenbeginn})`, `${luecke.rentenbeginn} (at ${luecke.alterBeiRentenbeginn})`)],
              [w('Angenommene Inflation', 'Assumed inflation'), prozentText(luecke.inflation)],
              [w('Angenommene Rentenanpassung', 'Assumed pension increases'), prozentText(luecke.rentenanpassung)],
              [w('Gesetzliche Rente nach heutigem Stand', 'Statutory pension as it stands today'), `${euro(eingetragen ? a.grvRente : schaetzung.monat)}${eingetragen ? '' : w(' (geschätzt)', ' (estimated)')}`],
              [w(`Brutto-Altersrente ${luecke.rentenbeginnJahr}, heutige Kaufkraft`, `Gross pension in ${luecke.rentenbeginnJahr}, today’s purchasing power`), euro(luecke.rente.bruttoMonat)],
              [w('− Kranken- und Pflegeversicherung', '− Health and long-term care insurance'), euro(luecke.rente.kvPvMonat)],
              [w('− Steuer', '− Tax'), euro(luecke.rente.steuerMonat)],
            ] as const).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 py-1.5">
                <dt className="text-ui-schiefer">{k}</dt><dd className="shrink-0 tabular-nums text-ui-tinte">{v}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-3 py-2 font-medium">
              <dt className="text-ui-tinte">{w('= Netto-Altersrente', '= Net pension')}</dt><dd className="shrink-0 tabular-nums text-ui-tinte">{euro(luecke.rente.nettoMonat)}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs leading-relaxed text-ui-schiefer">
            {w(
              <>
                Näherungswerte nach heutigem Recht. Die Rente steigt bis zum Rentenbeginn mit der Rentenanpassung, die Kaufkraft sinkt
                mit der Inflation — deshalb ist die Rente im ersten Rentenjahr in heutiger Kaufkraft niedriger als nach heutigem Stand.
                Der Nettolohn rechnet {nettolohnGrundlage(a.steuerklasse, a.gehaelter)}
                {a.steuerklasse === 5 ? ' — den höheren Abzug der Klasse V gleicht die Steuererklärung aus' : ''}, die Steuer im Alter
                {a.steuerklasse === 3 ? ' mit dem Splittingtarif' : ' mit dem Grundtarif'}.
                Das Rentenziel ist eine Faustregel: Im Alter fallen manche Ausgaben weg, etwa die Fahrt zur Arbeit oder das Sparen
                fürs Alter. Nicht berücksichtigt: bestehende Vorsorge außer der gesetzlichen Rente.
              </>,
              <>
                Approximate figures under current law. Until retirement the pension rises with the pension increases, while
                purchasing power falls with inflation — which is why the pension in the first year of retirement, in today’s
                purchasing power, is lower than as it stands today.
                Net pay is calculated {nettolohnGrundlage(a.steuerklasse, a.gehaelter, 'en')}
                {a.steuerklasse === 5 ? ' — the higher deduction in class V is evened out by the tax return' : ''}, tax in retirement
                {a.steuerklasse === 3 ? ' at the joint (splitting) rate' : ' at the basic rate'}.
                The pension target is a rule of thumb: in retirement some expenses fall away, such as commuting or saving for
                old age. Not taken into account: existing provision other than the statutory pension.
              </>,
            )}
          </p>
        </Karte>
      ),
    }] : []),
  ];

  return <Stuecke kennung="luecke" beschriftung={stueckeVon(w('Versorgungslücke', 'Pension gap'), s)} stuecke={stuecke} />;
}

/* --- 4. Rechnung ------------------------------------------------------------ */

/**
 * Der Regler fuer den Netto-Aufwand: Der Mitarbeiter sagt, was er netto
 * entbehren kann; die Umwandlung brutto folgt daraus (`umwandlungFuerNetto`).
 * Er reicht bis zum steuerfreien Rahmen — 8 % der BBG Gesamtbeitrag, 2026
 * 676 € —, markiert ist der Rahmen frei von Sozialabgaben (4 %, mit dem
 * Arbeitgeberbeitrag): Bis dahin spart der Mitarbeiter Sozialabgaben und
 * Steuer, darueber nur noch Steuer. Kompakt, damit die drei Zahlen darunter
 * den Blick bekommen. Den genauen Bruttobetrag kann man darunter eintippen.
 */
/** Tasten am Netto-Regler: so viele Stufen weiter (Pos1/Ende: ganz an den Anfang/das Ende). */
const TASTEN_STUFEN: Record<string, number | undefined> = {
  ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10, Home: -Infinity, End: Infinity,
};

function NettoRegler({ firma, daten, setze, r }: SchrittProps) {
  const w = useW();
  const s = useSprache();
  const [genau, setGenau] = useState(false);
  // Die Grenzen haengen an den Angaben, nicht am Betrag — beim Ziehen am Regler nicht jedes Mal neu.
  const grenzen = useMemo(() => reglerGrenzen(firma.angebot, daten), [firma.angebot, daten.angaben]);
  const netto = Math.round(r.nettoAufwandMonat);
  // Das Ende des Reglers ist der steuerfreie Rahmen; markiert ist der Rahmen frei von Sozialabgaben.
  const ende = Math.max(1, Math.round(grenzen.maxNetto));
  const marke = Math.round(grenzen.rahmenNetto);
  const markeAnteil = Math.min(1, Math.max(0, marke / ende));
  const ohneRegler = grenzen.maxUmwandlung < 0.005;
  const ohneRahmen = grenzen.rahmenUmwandlung < 0.005;
  const ueberMarke = daten.umwandlungMonat > grenzen.rahmenUmwandlung + 0.005 && r.svPflichtigMonat > 0.005;
  const darueber = daten.umwandlungMonat > grenzen.maxUmwandlung + 0.005;
  const setzeU = (u: number) => setze((d) => ({ ...d, umwandlungMonat: Math.min(grenzen.maxUmwandlung, Math.max(0, Math.round(u * 100) / 100)) }));
  // Auf der Markierung rastet der Regler genau beim vollen Rahmen ein — wie „Rahmen voll nutzen“.
  const setzeNetto = (n: number) => (n >= ende
    ? setzeU(grenzen.maxUmwandlung)
    : !ohneRahmen && n === marke
      ? setzeU(grenzen.rahmenUmwandlung)
      : setze((d) => ({ ...d, umwandlungMonat: umwandlungFuerNetto(firma.angebot, d, n, P, grenzen.maxUmwandlung) })));
  const fehltGehalt = daten.angaben.jahresbrutto <= 0;
  // Die Beschriftung an der Markierung nur, wo sie nicht mit den Enden kollidiert — sonst steht es im Satz darunter.
  const markeBeschriften = !ohneRahmen && markeAnteil > 0.15 && markeAnteil < 0.72;
  const markeLinks = `calc(11px + (100% - 22px) * ${markeAnteil})`;

  // Stufen von 5 € netto, dazu die Markierung und das Ende. Ziehen rastet auf der naechsten Stufe ein;
  // Tasten (und Bildschirmleser, die den Wert um 1 aendern) gehen Stufe fuer Stufe — mit `step` 5 waeren
  // Markierung und Ende, die meist zwischen zwei Fuenfern liegen, gar nicht erreichbar.
  const stufen = useMemo(() => reglerStufen(ende, ohneRahmen ? null : marke), [ende, marke, ohneRahmen]);
  const wert = Math.min(netto, ende);
  const ziehen = useRef(false);
  const zuStufe = (n: number) => { if (n !== wert) setzeNetto(n); };

  return (
    <Karte>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        {/* 24 px auch am Telefon: Das hervorgehobene Wort hat 4,2:1 — das reicht erst ab 24 px (grosse Schrift). */}
        <h2 className="ui-titel text-balance text-[24px] font-normal leading-tight text-ui-tinte">
          {w(<>Wie viel möchten Sie <Hervor>netto</Hervor> wandeln?</>, <>How much would you like to convert, <Hervor>net</Hervor>?</>)}
        </h2>
        {!fehltGehalt && (
          <p className="tabular-nums text-ui-tinte">
            <span className="ui-titel text-[40px] leading-none sm:text-[44px]">{euro(netto)}</span>{' '}
            <span className="text-sm text-ui-schiefer">{w('netto im Monat', 'net a month')}</span>
          </p>
        )}
      </div>
      {fehltGehalt ? (
        <p className="mt-3 text-sm text-ui-tinte">
          {w('Für die Rechnung fehlt das Bruttogehalt (Schritt 2).', 'The calculation needs your gross salary (step 2).')}
        </p>
      ) : (
        <>
          <div className="mt-4">
            <input type="range" min={0} max={ende} step={1} value={wert} disabled={ohneRegler}
              onPointerDown={() => { ziehen.current = true; }}
              onPointerUp={() => { ziehen.current = false; }}
              onPointerCancel={() => { ziehen.current = false; }}
              onBlur={() => { ziehen.current = false; }}
              onKeyDown={(e) => {
                const schritte = TASTEN_STUFEN[e.key];
                if (schritte === undefined) return;
                e.preventDefault();
                ziehen.current = false;
                zuStufe(stufeWeiter(stufen, wert, schritte));
              }}
              onChange={(e) => {
                const roh = Number(e.target.value);
                zuStufe(ziehen.current ? einrasten(stufen, roh, ohneRahmen ? null : marke) : stufeWeiter(stufen, wert, roh > wert ? 1 : -1));
              }}
              aria-label={w('Netto-Aufwand im Monat', 'Net cost a month')}
              aria-valuetext={w(`${netto} Euro netto, ${Math.round(r.umwandlungMonat)} Euro Umwandlung brutto`,
                `${netto} euros net, ${Math.round(r.umwandlungMonat)} euros converted gross`)}
              style={{ '--anteil': `${(wert / ende) * 100}%` } as CSSProperties}
              className="ui-regler block w-full" />
          </div>
          {/* Unter der Spur: die Markierung des Rahmens frei von Sozialabgaben, darunter die Enden */}
          <div className="relative mt-1 h-7 text-xs tabular-nums text-ui-schiefer">
            {!ohneRahmen && (
              <span aria-hidden data-marke className="absolute top-0 h-2 w-0.5 -translate-x-1/2 rounded-full bg-ui-tinte/60" style={{ left: markeLinks }} />
            )}
            <span className="absolute bottom-0 left-0">0 €</span>
            {markeBeschriften && (
              <span className="absolute bottom-0 hidden -translate-x-1/2 whitespace-nowrap sm:block" style={{ left: markeLinks }}>
                {euro(marke)} · {w('frei von Sozialabgaben', 'free of social security contributions')}
              </span>
            )}
            <span className="absolute bottom-0 right-0">{euro(ende)} · {euro(grenzen.steuerRahmenMonat)} {w('gesamt', 'in total')}</span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-ui-tinte">
            {w(
              <>
                = <strong className="font-medium tabular-nums">{euroGenau(r.umwandlungMonat)}</strong> Umwandlung brutto · + {euroGenau(r.arbeitgeberMonat)} vom
                Arbeitgeber · <strong className="font-medium tabular-nums">{euroGenau(r.gesamtMonat)}</strong> in Ihre Vorsorge
              </>,
              <>
                = <strong className="font-medium tabular-nums">{euroGenau(r.umwandlungMonat)}</strong> converted gross · + {euroGenau(r.arbeitgeberMonat)} from
                your employer · <strong className="font-medium tabular-nums">{euroGenau(r.gesamtMonat)}</strong> into your pension
              </>,
            )}
          </p>
          <p className="mt-1.5 max-w-4xl text-xs leading-relaxed text-ui-schiefer">{reglerErklaerung(grenzen, firma.angebot.modell, s)}</p>
          {ueberMarke && !darueber && (
            <p role="status" className="ui-innen mt-3 px-4 py-2.5 text-xs leading-relaxed text-ui-tinte">
              {w(`Über der Markierung: Auf ${euroGenau(r.svPflichtigMonat)} Ihrer Umwandlung zahlen Sie Sozialabgaben — steuerfrei bleibt sie.`,
                `Above the mark: on ${euroGenau(r.svPflichtigMonat)} of your conversion you pay social security contributions — it stays tax-free.`)}
            </p>
          )}
          {darueber && (
            <p role="status" className="ui-innen mt-3 px-4 py-2.5 text-xs leading-relaxed text-ui-tinte">
              {w(`Eingetragen sind ${euroGenau(daten.umwandlungMonat)} Umwandlung — mehr als der steuerfreie Rahmen.`,
                `${euroGenau(daten.umwandlungMonat)} of conversion are entered — more than the tax-free allowance.`)}{' '}
              <button type="button" onClick={() => setzeU(grenzen.maxUmwandlung)} className="font-medium underline underline-offset-4">
                {w(`Auf ${euroGenau(grenzen.maxUmwandlung)} setzen`, `Set to ${euroGenau(grenzen.maxUmwandlung)}`)}
              </button>
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <button type="button" onClick={() => setzeU(grenzen.rahmenUmwandlung)} disabled={ohneRahmen} className={KNOPF_ZWEIT}>
              <Wand2 className="h-4 w-4" aria-hidden /> {w('Rahmen voll nutzen', 'Use the full allowance')}
            </button>
            <button type="button" onClick={() => setGenau((x) => !x)} aria-expanded={genau} className={LINK}>
              {genau ? w('Bruttobetrag ausblenden', 'Hide the gross amount') : w('Betrag brutto genau eingeben', 'Enter the exact gross amount')}
            </button>
          </div>
          {genau && (
            <div className="mt-3 w-56">
              <ZahlFeld label={w('Umwandlung brutto im Monat', 'Conversion, gross a month')} wert={daten.umwandlungMonat} onChange={setzeU} einheit="€" schritt={10}
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
  const farbe = art === 'info' ? 'text-ui-schiefer' : art === 'summe' ? 'font-medium text-ui-tinte' : 'text-ui-tinte';
  return (
    <tr className={`${art === 'summe' ? 'border-t border-ui-tinte' : 'border-t border-ui-linie'} ${farbe}`}>
      <td className="py-2 pr-2">
        {text}
        {zusatz && <span className="block text-xs font-normal text-ui-schiefer">{zusatz}</span>}
      </td>
      <td className="py-2 pl-2 text-right tabular-nums">{wert(ohne)}</td>
      <td className="py-2 pl-2 text-right tabular-nums">{wert(mit)}</td>
    </tr>
  );
}

/** Der Monat ohne und mit Betriebsrente — wie eine Gehaltsabrechnung. */
function ProbeabrechnungKarte({ a }: { a: Probeabrechnung }) {
  const w = useW();
  const s = useSprache();
  const anteil = a.gesamtMonat > 0 ? Math.min(1, a.eigenbeteiligungMonat / a.gesamtMonat) : 0;
  return (
    /* Wie ein Gehaltszettel, der ueber der Seite liegt — das schwebende Artefakt dieses Schritts. */
    <section className={`${SCHWEBEND} p-5 sm:p-7`}>
      <h2 className="mb-4 text-lg font-medium text-ui-tinte sm:text-xl">
        {w('Probeabrechnung: Ihr Monat ohne und mit Betriebsrente', 'Sample payslip: your month without and with a company pension')}
      </h2>
      <table className="w-full text-[13px] sm:text-sm">
        <thead>
          <tr className="text-xs text-ui-schiefer">
            <td className="pb-2 text-left font-normal" />
            <th className="pb-2 pl-2 text-right font-normal">{w('ohne bAV', 'without')}</th>
            <th className="pb-2 pl-2 text-right font-medium text-ui-tinte">{w('mit bAV', 'with pension')}</th>
          </tr>
        </thead>
        <tbody>
          <AbrechnungsZeile text={w('Bruttogehalt', 'Gross salary')} ohne={a.bruttoMonat} mit={a.bruttoMonat} />
          <AbrechnungsZeile text={w('Entgeltumwandlung', 'Salary conversion')} ohne={null} mit={a.umwandlungMonat} art="abzug" />
          <AbrechnungsZeile text={w('Beitrag des Arbeitgebers', 'Employer contribution')}
            zusatz={w('steuer- und beitragsfrei, fließt in den Vertrag', 'free of tax and contributions, goes into the contract')} ohne={null} mit={a.arbeitgeberMonat} art="info" />
          <AbrechnungsZeile text={w('Steuerpflichtiges Brutto', 'Taxable gross pay')} ohne={a.steuerBrutto.ohne} mit={a.steuerBrutto.mit} />
          <AbrechnungsZeile text={w('Brutto für die Sozialabgaben', 'Gross pay for social security')} ohne={a.svBrutto.ohne} mit={a.svBrutto.mit} />
          <AbrechnungsZeile text={w('Steuern¹', 'Taxes¹')} zusatz={w('Lohnsteuer, Solidaritätszuschlag, Kirchensteuer', 'wage tax, solidarity surcharge, church tax')} ohne={a.steuern.ohne} mit={a.steuern.mit} art="abzug" />
          <AbrechnungsZeile text={w('Sozialabgaben', 'Social security contributions')}
            zusatz={w('Kranken-, Pflege-, Renten-, Arbeitslosenversicherung', 'health, long-term care, pension, unemployment insurance')} ohne={a.sv.ohne} mit={a.sv.mit} art="abzug" />
          <AbrechnungsZeile text={w('Netto', 'Net pay')} ohne={a.netto.ohne} mit={a.netto.mit} art="summe" />
        </tbody>
      </table>
      <div className="ui-innen mt-5 p-4">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <p className="text-sm text-ui-schiefer">
            {w('Eigenbeteiligung aus dem Nettolohn', 'Your share, out of net pay')}
            <span className="block text-2xl font-medium tabular-nums text-ui-tinte">{euroGenau(a.eigenbeteiligungMonat)}</span>
          </p>
          <p className="text-right text-sm text-ui-schiefer">
            {w('Gesamtbeitrag', 'Total contribution')}
            <span className="block text-2xl font-medium tabular-nums text-ui-tinte">{euroGenau(a.gesamtMonat)}</span>
          </p>
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-ui-luecke" aria-hidden>
          <div className="h-1.5 rounded-full bg-ui-tinte" style={{ width: `${anteil * 100}%` }} />
        </div>
      </div>
      <p className="mt-3 text-pretty text-xs leading-relaxed text-ui-schiefer">
        ¹ {lohnsteuerHinweis(a.steuerklasse, s)}
      </p>
    </section>
  );
}

/**
 * Was bis zum Rentenbeginn zusammenkommen kann und welche Rente daraus
 * geschaetzt wird — gerechnet wie das ETF-Depot im Rechner. Verstellbar ist
 * allein die Rendite; die uebrigen Annahmen laufen fest im Hintergrund
 * (`HOCHRECHNUNG_FEST`) und stehen bewusst nirgends.
 *
 * SIE STEHT DIREKT UNTER DEM BEITRAG (seit November 2026; vorher ein eigenes
 * Stueck zwei Schritte weiter): Wer am Regler zieht, sieht im selben Blick,
 * was aus diesem Betrag werden kann. Deshalb das Ergebnis vorn — Kapital und
 * Rente —, der erste Satz nennt den Netto-Aufwand, aus dem es entsteht, und
 * auf breiter Flaeche steht die Zusammensetzung daneben statt darunter:
 * So bleibt die Karte kurz genug, um mit dem Regler auf einen Bildschirm zu
 * passen.
 */
function HochrechnungKarte({ h, nettoMonat, rentenbeginn, setzeRendite }: {
  h: Hochrechnung;
  /** Der Netto-Aufwand vom Regler — der Betrag, aus dem die Hochrechnung entsteht */
  nettoMonat: number;
  rentenbeginn: string | null; setzeRendite: (rendite: number) => void;
}) {
  const w = useW();
  if (h.monate <= 0) return null;
  const teile = [
    // Abgestufte Grautoene fuer das Eingezahlte, die Rolle „Luecke“ (Stein) fuer die Ertraege.
    { text: w('Ihr Netto-Aufwand', 'Your net cost'), wert: h.nettoSumme, farbe: 'bg-ui-tinte' },
    { text: w('Steuer- und SV-Ersparnis', 'Tax and social security saved'), wert: h.ersparnisSumme, farbe: 'bg-ui-daten-2' },
    { text: w('Arbeitgeber', 'Employer'), wert: h.arbeitgeberSumme, farbe: 'bg-ui-daten-3' },
    { text: w('Erträge', 'Returns'), wert: h.ertrag, farbe: 'bg-ui-luecke' },
  ];
  return (
    <Karte titel={w('Beispielhafte Hochrechnung', 'Illustrative projection')} rechts={<Vermerk>{w('geschätzt', 'estimated')}</Vermerk>}>
      <p className="text-sm text-ui-schiefer">
        {w(
          <>
            Was aus <span className="font-medium tabular-nums text-ui-tinte">{euro(nettoMonat)} netto</span> im Monat werden
            kann: {euro(h.beitragMonat)} fließen in Ihre Vorsorge, {laufzeitText(h.monate)} bis zum
            Rentenbeginn{rentenbeginn ? ` am ${rentenbeginn}` : ''}.
          </>,
          <>
            What <span className="font-medium tabular-nums text-ui-tinte">{euro(nettoMonat)} net</span> a month can
            become: {euro(h.beitragMonat)} go into your pension, for {laufzeitText(h.monate, 'en')} until
            retirement{rentenbeginn ? ` on ${rentenbeginn}` : ''}.
          </>,
        )}
      </p>
      <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-5 lg:grid-cols-2">
        <div>
          <div className="ui-innen grid grid-cols-2 gap-3 p-4">
            <div>
              <div className={ETIKETT}>{w('Kapital bei Rentenbeginn', 'Capital at retirement')}</div>
              <div className="mt-0.5 whitespace-nowrap text-2xl font-medium tabular-nums text-ui-tinte">{euro(h.kapital)}</div>
            </div>
            <div>
              <div className={ETIKETT}>{w('Geschätzte Rente brutto', 'Estimated pension, gross')}</div>
              {/* Am Telefon steht „im Monat“ unter dem Betrag — daneben braeche es mitten in der Angabe um. */}
              <div className="mt-0.5 text-2xl font-medium tabular-nums text-ui-tinte">
                <span className="whitespace-nowrap">{euro(h.renteMonat)}</span>{' '}
                <span className="block text-sm font-normal text-ui-schiefer sm:inline">{w('im Monat', 'a month')}</span>
              </div>
            </div>
          </div>
          <div className="mt-4 sm:max-w-[16rem]">
            <ProzentFeld label={w('Angenommene Rendite', 'Assumed return')} wert={h.annahmen.renditeAnsparphase} onChange={setzeRendite}
              hilfe={w('Wertentwicklung im Jahr bis zum Rentenbeginn.', 'Growth per year until retirement.')} />
          </div>
        </div>
        <div>
          <p className={ETIKETT}>{w('Woraus das Kapital besteht', 'What the capital is made up of')}</p>
          <Anteile teile={teile} format={euro} />
        </div>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-ui-schiefer">
        {w(
          'Beispielhafte und geschätzte Hochrechnung mit der angenommenen Rendite und gleichbleibenden Beiträgen — keine '
          + 'Zusage. Die tatsächliche Leistung hängt von der Wertentwicklung und vom Tarif ab. Die Rente ist brutto, vor '
          + 'Kranken- und Pflegeversicherung und Steuer. Verbindlich ist allein das Angebot des Versicherers (nächster Schritt).',
          'An illustrative, estimated projection with the assumed return and unchanged contributions — not a commitment. '
          + 'The actual benefit depends on performance and on the tariff. The pension is gross, before health and '
          + 'long-term care insurance and tax. Only the insurer’s offer is binding (next step).',
        )}
      </p>
    </Karte>
  );
}

/** „1 Jahr später“, „2 Jahre später“ — die erste Zeile ist der Beginn wie geplant. Am Telefon kurz: „+ 1 Jahr“. */
function BeginnText({ jahre }: { jahre: number }) {
  const w = useW();
  if (jahre === 0) return <>{w('wie geplant', 'as planned')}</>;
  const jahr = jahre === 1 ? w('Jahr', 'year') : w('Jahre', 'years');
  return <><span className="sm:hidden">+ {jahre} {jahr}</span><span className="hidden sm:inline">{jahre} {jahr} {w('später', 'later')}</span></>;
}

/**
 * Was es kostet, spaeter zu beginnen — dieselbe Hochrechnung, je Jahr Warten
 * zwoelf Beitraege weniger. Daneben, was man bis dahin netto nicht aufwendet:
 * Das fehlende Kapital ist stets mehr, denn mit dem Netto-Aufwand fehlen auch
 * Arbeitgeber, Steuer- und Sozialabgabenersparnis und die Ertraege.
 */
function SpaeterKarte({ zeilen }: { zeilen: SpaeterZeile[] }) {
  const w = useW();
  const eins = zeilen[1];
  if (!eins) return null;
  return (
    <Karte titel={w('Später beginnen? Was das kostet', 'Start later? What that costs')} rechts={<Vermerk>{w('geschätzt', 'estimated')}</Vermerk>}>
      <div className={`${AKZENT} px-5 py-4`}>
        {/* 24 px auch am Telefon — wie die Ueberschrift am Regler: Der hervorgehobene Betrag braucht grosse Schrift. */}
        <p className="ui-titel text-[24px] leading-snug">
          {w(
            <>
              Ein Jahr warten spart Ihnen {euro(eins.nettoGespart)} netto — und kostet{' '}
              <span className="whitespace-nowrap tabular-nums"><Hervor>{euro(eins.wenigerKapital)}</Hervor></span> Kapital.
            </>,
            <>
              Waiting one year saves you {euro(eins.nettoGespart)} net — and costs{' '}
              <span className="whitespace-nowrap tabular-nums"><Hervor>{euro(eins.wenigerKapital)}</Hervor></span> in capital.
            </>,
          )}
        </p>
      </div>
      <ScrollBereich name={w('Tabelle: Später beginnen', 'Table: starting later')} klasse="mt-4">
        <table className="w-full min-w-[17rem] text-[13px] tabular-nums sm:text-sm">
          <thead>
            <tr className="whitespace-nowrap text-xs text-ui-schiefer">
              <th className="py-2 text-left font-normal">{w('Beginn', 'Start')}</th>
              <th className="py-2 pl-2 text-right font-normal">{w('Kapital', 'Capital')}</th>
              <th className="py-2 pl-2 text-right font-normal">{w('Rente', 'Pension')}<span className="hidden sm:inline">{w(' im Monat', ' a month')}</span></th>
              <th className="py-2 pl-2 text-right font-normal">{w('weniger', 'less')}<span className="hidden sm:inline">{w(' Kapital', ' capital')}</span></th>
            </tr>
          </thead>
          <tbody className="whitespace-nowrap text-ui-tinte">
            {zeilen.map((z) => (
              <tr key={z.jahre} className={`border-t border-ui-linie ${z.jahre === 0 ? 'font-medium' : ''}`}>
                <td className="py-2"><BeginnText jahre={z.jahre} /></td>
                <td className="py-2 pl-2 text-right">{euro(z.kapital)}</td>
                <td className="py-2 pl-2 text-right">{euro(z.renteMonat)}</td>
                <td className="py-2 pl-2 text-right">
                  {z.jahre === 0 ? '—' : (
                    <>− {euro(z.wenigerKapital)}<span className="hidden text-ui-schiefer sm:inline"> ({Math.round(z.wenigerAnteil * 100)}{'\u00a0'}%)</span></>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollBereich>
      <p className="mt-3 text-pretty text-xs leading-relaxed text-ui-schiefer">
        {w(
          `Dieselbe beispielhafte Hochrechnung mit gleichem Beitrag und gleicher Rendite, nur später begonnen; Rente brutto. `
          + `Jedes Jahr Warten spart ${euro(eins.nettoGespart)} Netto-Aufwand — dafür fehlen im Vertrag auch der Arbeitgeberbeitrag, die `
          + 'Steuer- und Sozialabgabenersparnis und die Erträge dieser Jahre.',
          `The same illustrative projection with the same contribution and return, only started later; pension gross. `
          + `Each year of waiting saves ${euro(eins.nettoGespart)} of net cost — but the contract then also lacks the employer `
          + 'contribution, the tax and social security savings and the returns of those years.',
        )}
      </p>
    </Karte>
  );
}

export function SchrittRechnung(props: SchrittProps) {
  const { firma, daten, setze, r, gesperrt } = props;
  const w = useW();
  const s = useSprache();
  const abrechnung = useMemo(() => probeabrechnung(firma.angebot, daten, r), [firma.angebot, daten, r]);
  const h = useMemo(() => hochrechnung(firma.angebot, daten, r), [firma.angebot, daten, r]);
  const spaeter = spaeterBeginnen(h, r.nettoAufwandMonat);

  const stuecke: Stueck[] = [
    {
      id: 'beitrag',
      titel: w('Ihr Beitrag', 'Your contribution'),
      ...beitragZeile(r, h, s),
      // Volle Breite: Die drei grossen Zahlen brauchen sie — in der schmalen Spalte passt ein vierstelliger Betrag nicht.
      breit: true,
      inhalt: (
        <Inhalt gesperrt={gesperrt} klasse="space-y-5 sm:space-y-6">
          <NettoRegler {...props} />

          {/* Was der Rechenkern zum gewaehlten Betrag anmerkt — beim Regler, an dem der Betrag gewaehlt wird. */}
          {beitragsHinweise(firma.angebot, daten, r, s).map((h2) => (
            <p key={h2} className="ui-karte px-4 py-3 text-xs leading-relaxed text-ui-tinte">{h2}</p>
          ))}

          {/* Drei Zahlen nebeneinander, gross — um sie geht es; die dritte, was in der Vorsorge ankommt, als Akzentkarte. */}
          <section className="grid gap-4 sm:grid-cols-3 lg:gap-5">
            <WertKarte gross titel={w('Sie zahlen netto', 'You pay net')} wert={euroGenau(r.nettoAufwandMonat)}
              unten={w(`von ${euro(r.umwandlungMonat)} Umwandlung`, `of ${euro(r.umwandlungMonat)} converted`)} />
            <WertKarte gross titel={w('Ihr Arbeitgeber gibt dazu', 'Your employer adds')} wert={euroGenau(r.arbeitgeberMonat)}
              unten={r.mindestzuschuss?.aufgestockt ? w('der gesetzliche Zuschuss', 'the statutory subsidy') : w('jeden Monat', 'every month')} />
            <WertKarte gross titel={w('In Ihre Vorsorge', 'Into your pension')} wert={euroGenau(r.gesamtMonat)} akzent
              unten={r.hebel > 0
                ? w(`je 1 € netto ${r.hebel.toLocaleString('de-DE', { maximumFractionDigits: 1 })} € Vorsorge`,
                  `${r.hebel.toLocaleString('de-DE', { maximumFractionDigits: 1 })} € of pension for every 1 € net`)
                : w('jeden Monat', 'every month')} />
          </section>

          {/* Direkt darunter, was daraus werden kann — sie rechnet mit jedem Zug am Regler neu. */}
          <HochrechnungKarte h={h} nettoMonat={r.nettoAufwandMonat} rentenbeginn={rentenbeginnVon(daten.angaben)}
            setzeRendite={(renditeAnsparphase) => setze((d) => ({ ...d, hochrechnung: { ...d.hochrechnung, renditeAnsparphase } }))} />
        </Inhalt>
      ),
    },
    {
      id: 'abrechnung',
      titel: w('Probeabrechnung', 'Sample payslip'),
      ...abrechnungZeile(abrechnung, s),
      breit: true,
      inhalt: (
        <Inhalt gesperrt={gesperrt}>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <ProbeabrechnungKarte a={abrechnung} />
            </div>
            <div className="lg:col-span-2">
              <Karte titel={w('Was in Ihre Vorsorge fließt im Monat', 'What goes into your pension each month')}>
                <dl className="text-sm">
                  <Posten text={w('Ihre Umwandlung', 'Your conversion')} wert={euro(r.umwandlungMonat)} />
                  {r.pflichtzuschussMonat > 0.005 && <Posten text={w('+ gesetzlicher Zuschuss', '+ statutory subsidy')} wert={euro(r.pflichtzuschussMonat)} />}
                  {r.freiwilligMonat > 0.005 && (
                    <Posten text={firma.angebot.modell.art === 'matching'
                      ? w('+ Arbeitgeber (Unterstützungskasse)', '+ employer (support fund)') : w('+ Zuschuss des Arbeitgebers', '+ employer contribution')} wert={euro(r.freiwilligMonat)} />
                  )}
                  <Posten text={w('= in Ihre Vorsorge', '= into your pension')} wert={euro(r.gesamtMonat)} summe />
                </dl>
                {r.vertraege.length > 1 && r.vertraege.map((v) => (
                  <p key={v.weg} className="mt-1 flex justify-between gap-2 pl-3 text-xs text-ui-schiefer">
                    <span>{w('davon', 'of which')} {vertragName(v.weg, firma.angebot, s)}</span><span className="tabular-nums">{euro(v.beitragMonat)}</span>
                  </p>
                ))}
                {/* Die Pruefung des gesetzlichen Zuschusses — gerechnet ist er immer, hier steht, ob die Regel reicht. */}
                {r.mindestzuschuss && (
                  <div data-pruefung="mindestzuschuss" className="mt-4 flex gap-2 border-t border-ui-linie pt-3 text-xs leading-relaxed text-ui-schiefer">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ui-tinte" aria-hidden />
                    <p>
                      <span className="font-medium text-ui-tinte">{w('Gesetzlicher Mindestzuschuss eingehalten', 'Statutory minimum subsidy met')}</span>{' '}
                      {w('(§ 1a Abs. 1a BetrAVG).', '(§ 1a (1a) BetrAVG).')}{' '}
                      {mindestzuschussText(r.mindestzuschuss, firma.angebot.modell, s)}
                    </p>
                  </div>
                )}
              </Karte>
            </div>
          </div>
        </Inhalt>
      ),
    },
    ...(spaeter[1] ? [{
      id: 'spaeter',
      titel: w('Später beginnen?', 'Start later?'),
      ...spaeterZeile(spaeter[1], s),
      inhalt: <SpaeterKarte zeilen={spaeter} />,
    }] : []),
  ];

  return <Stuecke kennung="rechnung" beschriftung={stueckeVon(w('Ihre Rechnung', 'Your calculation'), s)} stuecke={stuecke} />;
}

/* --- 5. Leistung im Alter -------------------------------------------------- */

function Wertezeile({ titel, w: werte, kk }: { titel: string; w: AuszahlungsWerte | null; kk: number }) {
  const w = useW();
  if (!werte) return null;
  return (
    <div className="ui-innen p-4">
      <h3 className="text-base font-medium text-ui-tinte">{titel}</h3>
      <dl className="mt-2 text-[13px]">
        <Posten text={w('Rente brutto', 'Pension, gross')} wert={euro(werte.bruttoMonat)} />
        <Posten text={w('− Kranken- und Pflegeversicherung', '− Health and long-term care insurance')} wert={euro(werte.kvPvMonat)} />
        <Posten text={w('− Steuer', '− Tax')} wert={euro(werte.steuerMonat)} />
        <Posten text={w('= netto im Monat', '= net a month')} wert={euro(werte.nettoMonat)} summe />
      </dl>
      <p className="mt-2 text-xs text-ui-schiefer">
        {w(`in heutiger Kaufkraft rund ${euro(werte.nettoMonat / kk)}`, `about ${euro(werte.nettoMonat / kk)} in today’s purchasing power`)}
      </p>
    </div>
  );
}

/**
 * „Ihre Belastung“ — dieselbe Treppe wie im Vertrags-TUEV: vom Beitrag in den
 * Vertrag zu dem, was es wirklich kostet. Im Rahmen der Kaesten daneben.
 */
function BelastungKasten({ treppe }: { treppe: BelastungsTreppe }) {
  const w = useW();
  return (
    <div className="ui-innen p-4">
      <h3 className="text-base font-medium text-ui-tinte">{w('Ihre Belastung', 'What it costs you')}</h3>
      <p className="text-xs text-ui-schiefer">{w('Ansparphase, im Monat', 'Savings phase, a month')}</p>
      <div className="mt-3 space-y-1.5">
        <GegenueberZeile text={w('Gesamtbeitrag', 'Total contribution')} wert={euroGenau(treppe.zufluss)} />
        {treppe.zeilen.map((z) => (
          z.art === 'summe' ? (
            <div key={z.text} className="!mt-2 border-t border-ui-linie pt-2">
              <GegenueberZeile text={z.text} wert={euroGenau(z.betrag)} />
            </div>
          ) : (
            <GegenueberZeile key={z.text} text={z.text} wert={euroGenau(z.betrag)} farbe="text-ui-tinte" info={z.erklaerung} />
          )
        ))}
        <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-ui-tinte pt-2">
          <span className="text-sm font-medium text-ui-tinte">{w('Kostet Sie wirklich', 'Your real cost')}</span>
          <span className="text-xl font-medium tabular-nums text-ui-tinte">{euroGenau(treppe.aufwand)}</span>
        </div>
      </div>
    </div>
  );
}

const WEG_TITEL: Record<KennzahlenWeg['art'], string> = { garantiert: 'Garantiert', prognose: 'Prognose', kapital: 'Kapital' };
const WEG_TITEL_EN: Record<KennzahlenWeg['art'], string> = { garantiert: 'Guaranteed', prognose: 'Projection', kapital: 'Lump sum' };
const zahl = (x: number, stellen = 2) => x.toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen });

/**
 * Kennzahlen und Fazit — wie im Vertrags-TUEV (`VertragsTuev.tsx`, „3.
 * Kennzahlen und Fazit“), fuer den Vertrag allein: Netto-Aufwand gegen
 * Netto-Auszahlung.
 */
function KennzahlenKarte({ k, daten, setze, aktuell }: {
  k: KennzahlenErgebnis; daten: BeratungDaten; setze: SchrittProps['setze']; aktuell: boolean;
}) {
  const w = useW();
  const s = useSprache();
  const haupt = k.prognose ?? k.garantiert ?? k.kapital;
  if (!haupt) return null;
  const istKapital = haupt.art === 'kapital';
  const wege = [k.garantiert, k.prognose, k.kapital].filter((x): x is KennzahlenWeg => x !== null);
  const laufzeit = laufzeitText(k.monateEinzahlung, s);
  const jahreKurz = w('J.', 'yrs');

  return (
    <Karte titel={w('Kennzahlen und Fazit', 'Key figures and conclusion')}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-xl text-sm leading-relaxed text-ui-schiefer">
          {w('Ihr Netto-Aufwand gegen die Netto-Auszahlung — der Vertrag allein,', 'Your net cost against the net payout — the contract on its own,')}{' '}
          {istKapital ? w(`mit der ${k.geschaetzt ? 'geschätzten ' : ''}Kapitalauszahlung`, `with the ${k.geschaetzt ? 'estimated ' : ''}lump sum`)
            : haupt.art === 'prognose'
              ? (k.geschaetzt ? w('mit der geschätzten Rente aus der Hochrechnung', 'with the estimated pension from the projection')
                : w('mit der prognostizierten Rente', 'with the projected pension'))
              : w('mit der garantierten Rente', 'with the guaranteed pension')}.
        </p>
        <div className="w-44">
          <ZahlFeld label={w('Rente bis zum Alter von', 'Pension up to the age of')} wert={daten.lebenserwartung} min={60} max={120} schritt={1} stufen einheit={jahreKurz}
            onChange={(n) => setze((d) => ({ ...d, lebenserwartung: Math.min(120, Math.max(60, Math.round(n))) }))} />
        </div>
      </div>

      {/* Ohne Ampel: Ob sich der Vertrag rechnet, sagen die Zahlen und das Fazit — nicht Gruen oder Rot. */}
      <div className={`ui-innen mt-4 p-4 sm:p-5 ${aktuell ? '' : 'opacity-60'}`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kennzahl titel={w('Netto-Hebel', 'Net leverage')} wert={`${zahl(haupt.nettoHebel)} ×`} farbe="text-ui-tinte"
            fussnote={w('Auszahlung je Euro Einzahlung', 'payout per euro paid in')}
            info={w(
              <>
                {euro(haupt.summeAuszahlung)} Auszahlung geteilt durch {euro(haupt.summeEinzahlung)} eigenen Aufwand über {laufzeit}.{' '}
                <strong>Beide Seiten netto</strong>: oben nach Steuer und Kranken- und Pflegeversicherung im Alter, unten nach der
                Steuer- und Sozialabgabenersparnis. Ohne Verzinsung gerechnet — was das Geld dann wert ist, sagt die Rendite daneben.
              </>,
              <>
                {euro(haupt.summeAuszahlung)} paid out, divided by {euro(haupt.summeEinzahlung)} of your own cost over {laufzeit}.{' '}
                <strong>Both sides net</strong>: the payout after tax and health and long-term care insurance in retirement, the
                cost after the tax and social security savings. Calculated without interest — what the money is worth by then is
                shown by the return next to it.
              </>,
            )} />
          <Kennzahl titel={w('Nettorendite', 'Net return')} wert={`${zahl(haupt.rendite * 100)} %`} farbe="text-ui-tinte"
            fussnote={w('p. a. nach allen Abzügen', 'p.a. after all deductions')}
            info={w(
              <>
                Der interne Zinsfuß Ihrer Zahlungsreihe: der Zinssatz, bei dem {laufzeit} Einzahlung und{' '}
                {istKapital ? 'die Kapitalauszahlung' : `${k.jahreAuszahlung} Jahre Rente`} genau aufgehen. Anders als der Hebel{' '}
                <strong>berücksichtigt er, wann</strong> jeder Euro fließt.
              </>,
              <>
                The internal rate of return of your payments: the interest rate at which {laufzeit} of paying in and{' '}
                {istKapital ? 'the lump sum' : `${k.jahreAuszahlung} years of pension`} balance exactly. Unlike the leverage, it{' '}
                <strong>takes into account when</strong> each euro flows.
              </>,
            )} />
          <Kennzahl titel={w('Netto-Gewinn', 'Net gain')} wert={euro(haupt.echterGewinn)} farbe="text-ui-tinte"
            fussnote={istKapital ? w('mit der Kapitalauszahlung', 'with the lump sum') : w(`bis ${k.lebenserwartung}`, `up to age ${k.lebenserwartung}`)} />
          {!istKapital && (
            <Kennzahl titel={w('Amortisation', 'Break-even')} wert={`${zahl(haupt.amortisationsJahre, 1)} ${jahreKurz}`}
              fussnote={w('ab Rentenbeginn', 'from retirement')} />
          )}
        </div>
        <div className="mt-4 space-y-1.5 border-t border-ui-linie pt-3">
          <GegenueberZeile text={w(`Eingezahlt, netto (${laufzeit})`, `Paid in, net (${laufzeit})`)} wert={euro(haupt.summeEinzahlung)} farbe="text-ui-tinte" />
          <GegenueberZeile text={istKapital ? w('Ausgezahlt, netto (einmalig)', 'Paid out, net (once)')
            : w(`Ausgezahlt, netto (${k.jahreAuszahlung} Jahre bis ${k.lebenserwartung})`, `Paid out, net (${k.jahreAuszahlung} years, up to age ${k.lebenserwartung})`)}
            wert={euro(haupt.summeAuszahlung)} farbe="text-ui-tinte" />
        </div>
      </div>

      {wege.length > 1 && (
        <ScrollBereich name={w('Tabelle: Auszahlungswege im Vergleich', 'Table: payout options compared')} klasse="mt-5">
          <table className="w-full min-w-[20rem] text-sm">
            <thead>
              <tr className="text-ui-schiefer">
                <td className="py-2 text-left font-normal" />
                {wege.map((x) => <th key={x.art} className="py-2 pl-2 text-right font-normal">{w(WEG_TITEL, WEG_TITEL_EN)[x.art]}</th>)}
              </tr>
            </thead>
            <tbody className="tabular-nums text-ui-tinte">
              {([
                [w('Netto', 'Net'), (x: KennzahlenWeg) => (x.art === 'kapital' ? euro(x.netto) : `${euro(x.netto)} / ${w('Mon.', 'mth')}`)],
                [w('Netto-Hebel', 'Net leverage'), (x: KennzahlenWeg) => `${zahl(x.nettoHebel)} ×`],
                [w('Nettorendite', 'Net return'), (x: KennzahlenWeg) => `${zahl(x.rendite * 100)} %`],
                [w('Netto-Gewinn', 'Net gain'), (x: KennzahlenWeg) => euro(x.echterGewinn)],
                [w('Amortisation', 'Break-even'), (x: KennzahlenWeg) => (x.art === 'kapital' ? '—' : `${zahl(x.amortisationsJahre, 1)} ${jahreKurz}`)],
              ] as const).map(([text, wert]) => (
                <tr key={text} className="border-t border-ui-linie">
                  <td className="py-2 text-ui-schiefer">{text}</td>
                  {wege.map((x) => <td key={x.art} className="py-2 pl-2 text-right">{wert(x)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollBereich>
      )}

      {/* Das Fazit ist die Aussage dieses Schritts — die eine Akzentkarte. */}
      <div className={`${AKZENT} mt-6 p-6 sm:p-8`}>
        <p className="text-sm">{w('Fazit', 'Conclusion')}</p>
        <p className="ui-titel mt-2 max-w-4xl text-[20px] leading-[1.45] sm:text-[24px]">{fazitText(k, s)}</p>
      </div>
    </Karte>
  );
}

/**
 * Wie viel der Versorgungsluecke die Betriebsrente schliesst — der Ring aus
 * Schritt 3, um die Betriebsrente ergaenzt: gesetzliche Rente, Betriebsrente,
 * was offen bleibt. Alles netto im Monat, in heutiger Kaufkraft.
 */
function LueckeMitBetriebsrenteKarte({ luecke, x, aktuell }: { luecke: Versorgungsluecke; x: LueckeMitBetriebsrente; aktuell: boolean }) {
  const w = useW();
  const haupt = x.prognose ?? x.garantiert!;
  const art = x.prognose
    ? (x.geschaetzt ? w('Prognose, geschätzt', 'projection, estimated') : w('Prognose', 'projection'))
    : w('garantiert', 'guaranteed');
  // Im Ring hoechstens die Luecke — was darueber hinausgeht, hat im Rentenziel keinen Platz
  const imRing = Math.min(haupt.betriebsrenteMonat, x.lueckeMonat);
  return (
    <Karte titel={w('Ihre Versorgungslücke mit Betriebsrente', 'Your pension gap with the company pension')}>
      <div className={`grid grid-cols-1 items-center gap-6 lg:grid-cols-2 ${aktuell ? '' : 'opacity-60'}`}>
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-center">
          <AnteilsRing
            teile={[
              { wert: luecke.rente.nettoMonat, rolle: 'tinte' },
              { wert: imRing, rolle: 'knopf' },
              { wert: haupt.restMonat, rolle: 'luecke' },
            ]}
            mitte={`${haupt.prozent} %`}
            zeilen={w(['der Lücke', 'geschlossen'], ['of the gap', 'closed'])}
            beschreibung={w(
              `Rentenziel ${euro(luecke.zielMonat)}: gesetzliche Rente ${euro(luecke.rente.nettoMonat)}, `
              + `Betriebsrente ${euro(haupt.betriebsrenteMonat)}, offen ${euro(haupt.restMonat)} — `
              + `die Betriebsrente schließt ${haupt.prozent} % der Versorgungslücke`,
              `Pension target ${euro(luecke.zielMonat)}: statutory pension ${euro(luecke.rente.nettoMonat)}, `
              + `company pension ${euro(haupt.betriebsrenteMonat)}, still open ${euro(haupt.restMonat)} — `
              + `the company pension closes ${haupt.prozent} % of the pension gap`,
            )}
          />
          <dl className="space-y-4">
            <Zahl etikett={w('Gesetzliche Rente', 'Statutory pension')} punkt="bg-ui-tinte" wert={euro(luecke.rente.nettoMonat)} />
            <Zahl etikett={w('Betriebsrente', 'Company pension')} punkt="bg-ui-knopf" wert={euro(haupt.betriebsrenteMonat)} zusatz={art} />
            <Zahl etikett={w('Bleibt offen', 'Still open')} punkt="bg-ui-luecke ring-1 ring-ui-tinte/20" wert={euro(haupt.restMonat)} />
          </dl>
        </div>
        <div>
          <div className={`${AKZENT} px-5 py-4`}>
            <p className="ui-titel text-[24px] leading-snug sm:text-[26px]">
              {haupt.anteil >= 1
                ? w(<>Ihre Betriebsrente schließt Ihre Versorgungslücke <Hervor>ganz</Hervor>.</>,
                  <>Your company pension closes your pension gap <Hervor>completely</Hervor>.</>)
                : w(<>Ihre Betriebsrente schließt <span className="whitespace-nowrap tabular-nums"><Hervor>{haupt.prozent} %</Hervor></span> Ihrer Versorgungslücke.</>,
                  <>Your company pension closes <span className="whitespace-nowrap tabular-nums"><Hervor>{haupt.prozent} %</Hervor></span> of your pension gap.</>)}
            </p>
          </div>
          <p className="mt-3 text-pretty text-xs leading-relaxed text-ui-schiefer">
            {w(`Netto im Monat, in heutiger Kaufkraft: Von ${euro(x.lueckeMonat)} Versorgungslücke (Schritt 3) schließt die `
              + `Betriebsrente ${euro(Math.min(haupt.betriebsrenteMonat, x.lueckeMonat))}`,
              `Net a month, in today’s purchasing power: of the ${euro(x.lueckeMonat)} pension gap (step 3), the company `
              + `pension closes ${euro(Math.min(haupt.betriebsrenteMonat, x.lueckeMonat))}`)}
            {x.prognose && x.garantiert
              ? w(` — mit der garantierten Rente\u00a0${x.garantiert.prozent}\u00a0%`, ` — with the guaranteed pension\u00a0${x.garantiert.prozent}\u00a0%`) : ''}.
          </p>
        </div>
      </div>
    </Karte>
  );
}

export function SchrittLeistung({ firma, daten, setze, r, leistung, kennzahlen, luecke, aktuell, gesperrt }: SchrittProps & {
  kennzahlen: KennzahlenErgebnis | null; luecke: Versorgungsluecke | null; aktuell: boolean;
}) {
  const w = useW();
  const s = useSprache();
  const a = firma.angebot;
  const geschlossen = lueckeMitBetriebsrente(luecke, leistung, daten);
  const setzeWerte = (weg: 'direkt' | 'ukasse', p: Partial<VersichererWerte>) =>
    setze((d) => ({ ...d, versicherer: { ...d.versicherer, [weg]: { ...d.versicherer[weg], ...p } } }));
  // Von Hand geaenderte Prognosewerte stammen nicht mehr aus der Hochrechnung
  const setzePrognose = (weg: 'direkt' | 'ukasse', p: Partial<VersichererWerte>) => setzeWerte(weg, { ...p, ausHochrechnung: false });
  const ohneGeburt = !rentenbeginnVon(daten.angaben);
  const h = hochrechnung(firma.angebot, daten, r);

  if (r.vertraege.length === 0) {
    return (
      <Stuecke kennung="leistung" beschriftung={stueckeVon(w('Leistung im Alter', 'Benefits in retirement'), s)} stuecke={[{
        id: 'vertrag-direkt',
        titel: w('Ihr Vertrag', 'Your contract'),
        fehlt: w('Ohne Umwandlung kein Vertrag', 'No contract without a conversion'),
        inhalt: (
          <Karte>
            <p className="text-sm text-ui-tinte">
              {w('Ohne Umwandlung gibt es keinen Vertrag — bitte in Schritt 4 einen Betrag wählen.',
                'Without a conversion there is no contract — please choose an amount in step 4.')}
            </p>
          </Karte>
        ),
      }]} />
    );
  }

  const stuecke: Stueck[] = [
    // Je Vertrag ein Stueck: links die Werte aus dem Angebot, rechts, was davon netto bleibt.
    ...r.vertraege.map((v, nr): Stueck => {
      const werte = daten.versicherer[v.weg];
      const l = leistung?.vertraege.find((x) => x.weg === v.weg) ?? null;
      const traeger = traegerText(v.weg, a, s);
      const schaetzung = h.monate > 0 ? hochrechnungJeVertrag(h, r, v.weg) : null;
      const veraltet = werte.ausHochrechnung && schaetzung !== null
        && (Math.abs(werte.prognoseRente - schaetzung.renteMonat) >= 1 || Math.abs(werte.prognoseKapital - schaetzung.kapital) >= 1);
      // Die Hochrechnung rechnet mit gleichbleibenden Beitraegen — deshalb ohne Dynamik
      const uebernehmen = () => schaetzung && setzeWerte(v.weg, {
        prognoseRente: schaetzung.renteMonat, prognoseKapital: schaetzung.kapital, dynamik: 0, ausHochrechnung: true,
      });
      // „Ihre Belastung“ steht beim Vertrag, in den die Umwandlung fliesst
      const belastung = belastungJeVertrag(v, r, daten.angaben, firma.angebot, P, s);
      const titel = `${vertragName(v.weg, a, s)}${traeger ? ` — ${traeger}` : ''}`;
      return {
        id: `vertrag-${v.weg}`,
        titel,
        ...vertragZeile(l, werte.ausHochrechnung, s),
        breit: true,
        inhalt: (
          <Inhalt gesperrt={gesperrt} klasse="space-y-5">
            {nr === 0 && (
              <p className="max-w-4xl text-base leading-relaxed text-ui-schiefer">
                {w(
                  'Tragen Sie die Werte aus dem Angebot des Versicherers ein — oder übernehmen Sie die geschätzte Hochrechnung aus „Ihre '
                  + 'Rechnung“. Daraus wird die Rente nach Kranken- und Pflegeversicherung und Steuer im ersten '
                  + `Rentenjahr${leistung ? ` (${leistung.rentenbeginnJahr})` : ''}.`,
                  'Enter the figures from the insurer’s offer — or take over the estimated projection from “Your calculation”. '
                  + 'They give the pension after health and long-term care insurance and tax in the first year of '
                  + `retirement${leistung ? ` (${leistung.rentenbeginnJahr})` : ''}.`,
                )}
              </p>
            )}
            <Karte titel={titel}
              rechts={werte.ausHochrechnung ? <Vermerk>{w('Prognose aus der geschätzten Hochrechnung', 'Projection from the estimated calculation')}</Vermerk> : undefined}>
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
                <div className="space-y-3 lg:col-span-5">
                  <ZahlFeld label={w('Beitrag laut Angebot im Monat', 'Contribution per the offer, a month')} wert={werte.beitragMonat > 0 ? werte.beitragMonat : Math.round(v.beitragMonat * 100) / 100}
                    onChange={(beitragMonat) => setzeWerte(v.weg, { beitragMonat })} einheit="€" schritt={10}
                    hilfe={w(`Aus der Rechnung: ${euroGenau(v.beitragMonat)}, davon Arbeitgeber ${euroGenau(v.arbeitgeberMonat)}.`,
                      `From the calculation: ${euroGenau(v.beitragMonat)}, of which employer ${euroGenau(v.arbeitgeberMonat)}.`)} />
                  <ZahlFeld label={w('Garantierte Rente im Monat', 'Guaranteed pension a month')} wert={werte.garantierteRente} onChange={(garantierteRente) => setzeWerte(v.weg, { garantierteRente })} einheit="€" schritt={10} />
                  <ZahlFeld label={w('Prognostizierte Rente im Monat', 'Projected pension a month')} wert={werte.prognoseRente} onChange={(prognoseRente) => setzePrognose(v.weg, { prognoseRente })} einheit="€" schritt={10} />
                  <ZahlFeld label={w('Kapital zum Rentenbeginn (Prognose)', 'Capital at retirement (projection)')} wert={werte.prognoseKapital} onChange={(prognoseKapital) => setzePrognose(v.weg, { prognoseKapital })} einheit="€" schritt={1000} />
                  <ProzentFeld label={w('Dynamik des Beitrags', 'Annual increase of the contribution')} wert={werte.dynamik} onChange={(dynamik) => setzeWerte(v.weg, { dynamik })} max={10} />
                  {schaetzung && (!werte.ausHochrechnung || veraltet) && (
                    <div className="ui-innen p-4">
                      <button type="button" onClick={uebernehmen} className={KNOPF_ZWEIT}>
                        <Wand2 className="h-4 w-4" aria-hidden />{' '}
                        {veraltet ? w('Hochrechnung erneut übernehmen', 'Take over the projection again') : w('Geschätzte Hochrechnung übernehmen', 'Take over the estimated projection')}
                      </button>
                      <p className="mt-2 text-xs leading-relaxed text-ui-schiefer">
                        {veraltet
                          ? <strong className="font-medium text-ui-tinte">{w('Die Hochrechnung hat sich seit der Übernahme geändert. ', 'The projection has changed since it was taken over. ')}</strong>
                          : ''}
                        {w(`Aus „Ihre Rechnung“: Kapital ${euro(schaetzung.kapital)} und Rente ${euro(schaetzung.renteMonat)} im Monat — als `
                          + 'Prognose, gekennzeichnet als geschätzt.',
                          `From “Your calculation”: capital of ${euro(schaetzung.kapital)} and a pension of ${euro(schaetzung.renteMonat)} a month — as a `
                          + 'projection, marked as estimated.')}
                      </p>
                    </div>
                  )}
                  {werte.ausHochrechnung && !veraltet && (
                    <p className="text-xs leading-relaxed text-ui-schiefer">
                      {w('Rente und Kapital stammen aus der geschätzten Hochrechnung — keine Zusage. Liegt das Angebot des Versicherers vor, '
                        + 'tragen Sie dessen Werte einfach darüber ein.',
                        'Pension and capital come from the estimated projection — not a commitment. Once the insurer’s offer is '
                        + 'available, simply enter its figures above.')}
                    </p>
                  )}
                </div>
                <div className={`space-y-3 lg:col-span-7 ${aktuell ? '' : 'opacity-60'}`}>
                  {/* Oben die Belastung neben der Prognose; die garantierten Werte stehen nur unten in den Kennzahlen. */}
                  {(belastung || l?.prognose) && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {belastung && <BelastungKasten treppe={belastung} />}
                      {l && leistung && (
                        <Wertezeile titel={werte.ausHochrechnung ? w('Prognose (geschätzt)', 'Projection (estimated)') : w('Prognose', 'Projection')}
                          w={l.prognose} kk={leistung.kaufkraftfaktor} />
                      )}
                    </div>
                  )}
                  {ohneGeburt && (
                    <p className="text-sm text-ui-tinte">
                      {w('Für die Rechnung fehlt das Geburtsdatum (Schritt 2).', 'The calculation needs your date of birth (step 2).')}
                    </p>
                  )}
                  {!ohneGeburt && !l && (
                    <p className="text-sm text-ui-schiefer">
                      {w('Mit einer Rente oder einem Kapital aus dem Angebot erscheint hier, was netto bleibt.',
                        'With a pension or a capital figure from the offer, what remains net appears here.')}
                    </p>
                  )}
                  {l?.kapital && (
                    <div className="ui-innen p-4">
                      <h3 className="text-base font-medium text-ui-tinte">
                        {w(`Oder als Kapital (${werte.ausHochrechnung ? 'geschätzt' : 'Prognose'})`, `Or as a lump sum (${werte.ausHochrechnung ? 'estimated' : 'projection'})`)}
                      </h3>
                      <dl className="mt-2 text-[13px]">
                        <Posten text={w('Kapital brutto', 'Lump sum, gross')} wert={euro(l.kapital.brutto)} />
                        <Posten text={w('− Steuer', '− Tax')} wert={euro(l.kapital.steuer)} />
                        <Posten text={w('− Kranken- und Pflegeversicherung (10 Jahre)', '− Health and long-term care insurance (10 years)')} wert={euro(l.kapital.kvPv)} />
                        <Posten text={w('= netto', '= net')} wert={euro(l.kapital.netto)} summe />
                      </dl>
                      {l.breakEven && Number.isFinite(l.breakEven.breakEvenOhneZins) && (
                        <p className="mt-2 text-xs text-ui-schiefer">
                          {w(`Die Rente holt das Kapital mit rund ${Math.floor(l.breakEven.breakEvenOhneZins)} Jahren ein.`,
                            `The pension catches up with the lump sum at the age of about ${Math.floor(l.breakEven.breakEvenOhneZins)}.`)}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Karte>
          </Inhalt>
        ),
      };
    }),
    ...(luecke && geschlossen ? [{
      id: 'luecke',
      titel: w('Ihre Versorgungslücke mit Betriebsrente', 'Your pension gap with the company pension'),
      ...lueckeMitZeile(geschlossen, s),
      breit: true,
      inhalt: <LueckeMitBetriebsrenteKarte luecke={luecke} x={geschlossen} aktuell={aktuell} />,
    }] : []),
    /*
      ZUM VERTIEFEN: Netto-Hebel, Nettorendite und Amortisation sind Zahlen
      fuer den Berater. Fuer den Mitarbeiter endet der Weg mit dem Stueck
      davor — was von seiner Luecke die Betriebsrente schliesst.
    */
    ...(kennzahlen ? [{
      id: 'kennzahlen',
      vertiefung: true,
      titel: w('Kennzahlen und Fazit', 'Key figures and conclusion'),
      ...kennzahlenZeile(kennzahlen, s),
      breit: true,
      inhalt: (
        <Inhalt gesperrt={gesperrt}>
          <KennzahlenKarte k={kennzahlen} daten={daten} setze={setze} aktuell={aktuell} />
        </Inhalt>
      ),
    }] : []),
  ];

  return <Stuecke kennung="leistung" beschriftung={stueckeVon(w('Leistung im Alter', 'Benefits in retirement'), s)} stuecke={stuecke} />;
}

/* --- 6. Entscheidung ------------------------------------------------------ */

const WAHL: { status: BeratungStatus; text: string; en: string; symbol: ReactNode }[] = [
  { status: 'teilnahme', text: 'Ich nehme teil', en: 'I’ll take part', symbol: <CheckCircle2 className="h-5 w-5" aria-hidden /> },
  { status: 'verzicht', text: 'Ich verzichte', en: 'I’ll opt out', symbol: <XCircle className="h-5 w-5" aria-hidden /> },
  { status: 'offen', text: 'Ich überlege noch', en: 'I’m still thinking', symbol: <FileText className="h-5 w-5" aria-hidden /> },
];

export function SchrittEntscheidung(props: SchrittProps & UnterlagenProps) {
  const { firma, logo, daten, setze, r, leistung, geheZu, auftritt, sichern, luecke, kennzahlen, gesperrt } = props;
  const w = useW();
  const s = useSprache();
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
  const axa = e.status !== 'offen' && istAxaAntrag(firma.angebot);
  const antrag = e.status === 'teilnahme';

  const stuecke: Stueck[] = [
    {
      id: 'wahl',
      titel: w('Die Entscheidung', 'Your decision'),
      ...entscheidungZeile(daten, r, autoBeginn, s),
      inhalt: (
        <Inhalt gesperrt={gesperrt}>
          <Karte titel={w('Die Entscheidung', 'Your decision')}>
            <div role="radiogroup" aria-label={w('Entscheidung', 'Decision')} className="grid gap-2 sm:grid-cols-3">
              {WAHL.map((x) => (
                <button key={x.status} type="button" role="radio" aria-checked={e.status === x.status}
                  onClick={() => waehle(x.status)}
                  className={`flex items-center gap-2 rounded-full border px-5 py-3 text-left text-sm font-medium transition-colors ${
                    e.status === x.status ? 'border-ui-dunkel bg-ui-dunkel text-white' : 'border-ui-linie bg-ui-karte text-ui-tinte hover:border-ui-tinte'
                  }`}>
                  {x.symbol}{w(x.text, x.en)}
                </button>
              ))}
            </div>

            {e.status === 'teilnahme' && (
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div>
                  <span className={FELD_LABEL}>{w('Umwandlung im Monat', 'Conversion a month')}</span>
                  <p className="ui-titel text-[34px] leading-tight tabular-nums text-ui-tinte">{euroGenau(r.umwandlungMonat)}</p>
                  <button type="button" onClick={() => geheZu(3, 'beitrag')} className={`${LINK} text-xs`}>{w('Betrag ändern →', 'Change the amount →')}</button>
                </div>
                <div>
                  <DatumFeld label={w('Beginn', 'Start')} wert={e.beginn || autoBeginn} onChange={(beginn) => setzeE({ beginn })}
                    hilfe={e.beginn && e.beginn !== autoBeginn ? w('Eingetragen.', 'Entered.')
                      : firma.angebot.beginn ? w('Automatisch: der Beginn laut Angebot der Firma.', 'Automatic: the start date in the company’s offer.')
                        : w('Automatisch: der nächste Monatserste. Ändern, wenn die Umwandlung später beginnt.',
                          'Automatic: the first of next month. Change it if the conversion starts later.')} />
                  {e.beginn && e.beginn !== autoBeginn && (
                    <button type="button" onClick={() => setzeE({ beginn: autoBeginn })} className={`mt-1 ${LINK} text-xs`}>
                      {firma.angebot.beginn
                        ? w('Beginn laut Angebot verwenden', 'Use the start date in the offer')
                        : w('Nächsten Monatsersten verwenden', 'Use the first of next month')} ({autoBeginn})
                    </button>
                  )}
                </div>
              </div>
            )}
            {e.status === 'verzicht' && (
              <div className="mt-4">
                <TextBereich label={w('Grund (freiwillig)', 'Reason (optional)')} wert={e.grund} onChange={(grund) => setzeE({ grund })} maxLaenge={500} zeilen={2} />
              </div>
            )}
            {e.status === 'offen' && (
              <div className="ui-innen mt-6 flex flex-wrap items-center gap-3 p-4">
                <p className="min-w-0 flex-1 basis-64 text-sm leading-relaxed text-ui-tinte">
                  {w('Bedenkzeit? Geben Sie die Gesprächsunterlagen mit — alles aus dem Gespräch zum Nachlesen, mit Ihrem Kontakt für '
                    + 'Rückfragen.',
                    'Time to think it over? Hand out the consultation papers — everything from the conversation to read again, with '
                    + 'your contact details for questions. They are in German.')}
                </p>
                <button type="button" className={`${KNOPF} max-w-full text-left`}
                  onClick={() => { void sichern(daten); drucken(<Gespraechsunterlagen {...{ firma, logo, daten, r, leistung, auftritt, luecke, kennzahlen }} />); }}>
                  <Printer className="h-4 w-4" aria-hidden /> {w('Gesprächsunterlagen drucken', 'Print the consultation papers')}
                </button>
              </div>
            )}
          </Karte>
        </Inhalt>
      ),
    },
    ...(axa ? [{
      id: 'axa',
      titel: antrag ? w('Für den AXA-Antrag', 'For the AXA application') : w('Für das AXA-Gesprächsprotokoll', 'For the AXA consultation record'),
      ...axaZeile(axaFehlt(daten, vollerName(axaBerater(e.axa, auftritt))), s),
      inhalt: (
        <Inhalt gesperrt={gesperrt}>
          <AxaKarte x={e.axa} setze={(p) => setzeE({ axa: { ...e.axa, ...p } })} antrag={antrag}
            auftritt={auftritt} angebot={firma.angebot} />
        </Inhalt>
      ),
    }] : []),
    {
      id: 'empfehlung',
      titel: w('Empfehlung und Ort', 'Recommendation and place'),
      ...ortZeile(e, s),
      inhalt: (
        <Inhalt gesperrt={gesperrt}>
          <Karte titel={w('Empfehlung und Ort', 'Recommendation and place')}>
            <div className="space-y-3">
              <TextBereich label={w('Empfehlung des Beraters', 'Adviser’s recommendation')} wert={e.empfehlung} onChange={(empfehlung) => setzeE({ empfehlung })} maxLaenge={2000} zeilen={4}
                hilfe={w('Steht im Beratungsprotokoll.', 'Appears in the consultation record.')} />
              <div className="grid gap-3 sm:grid-cols-2">
                <TextFeld label={w('Ort', 'Place')} wert={e.ort} onChange={(ort) => setzeE({ ort })} maxLaenge={120} />
                <DatumFeld label={w('Datum', 'Date')} wert={e.datum} onChange={(datum) => setzeE({ datum })} />
              </div>
            </div>
          </Karte>
        </Inhalt>
      ),
    },
  ];

  return <Stuecke kennung="entscheidung" beschriftung={stueckeVon(w('Entscheidung', 'Decision'), s)} stuecke={stuecke} />;
}

/** Ja oder Nein als Pillen, wie die Vorgabe im Loesungsvergleich. */
function JaNeinWahl({ label, wert, onChange }: { label: string; wert: '' | 'ja' | 'nein'; onChange: (w: 'ja' | 'nein') => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex shrink-0 gap-1 rounded-full border border-ui-linie bg-ui-karte p-1">
      {(['ja', 'nein'] as const).map((w) => (
        <button key={w} type="button" role="radio" aria-checked={wert === w} onClick={() => onChange(w)}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            wert === w ? 'bg-ui-dunkel text-white' : 'text-ui-schiefer hover:text-ui-tinte'
          }`}>
          {w === 'ja' ? 'Ja' : 'Nein'}
        </button>
      ))}
    </div>
  );
}

const KANAL_TEXT: Record<(typeof AXA_KANAELE)[number], string> = {
  persoenlich: 'persönlich', telefonisch: 'telefonisch', online: 'online (z. B. Video)',
};

/**
 * Was AXA-Antrag und AXA-Gespraechsprotokoll ueber die Beratung hinaus
 * fragen: wer beraten hat (mit Organr.), ob die Beitragsbefreiung bei
 * Berufsunfaehigkeit eingeschlossen ist und dann die drei Fragen zur
 * Gesundheit mit der Belehrung davor, wie die Beratung erfolgte und was
 * erlaeutert wurde. Bei Verzicht nur, was ins Protokoll gehoert. Fuer die
 * Unterschrift am Bildschirm oder per Link muss alles beantwortet sein; auf
 * Papier kreuzt man von Hand an.
 */
function AxaKarte({ x, setze, antrag, auftritt, angebot }: {
  x: AxaAngaben; setze: (p: Partial<AxaAngaben>) => void; antrag: boolean; auftritt: Auftritt | null; angebot: FirmenAngebot;
}) {
  // Leer gelten der Name aus „Ihr Auftritt“ und die Organr. der Firma — eingetragen die der Beratung.
  const eigenerName = vollerName({ vorname: x.beraterVorname, nachname: x.beraterNachname }) !== '';
  const berater = eigenerName ? { vorname: x.beraterVorname, nachname: x.beraterNachname } : axaBerater(x, auftritt);
  const organr = x.organisationsnummer || angebot.organisationsnummer;
  const herkunft = [
    eigenerName ? 'Name für diese Beratung eingetragen.'
      : vollerName(berater) ? 'Name aus „Ihr Auftritt“ — ändern, wenn ein Kollege berät.' : 'Name bitte eintragen.',
    antrag && (x.organisationsnummer ? 'Organr. für diese Beratung eingetragen.' : organr ? 'Organr. laut Firma.' : ''),
  ].filter(Boolean).join(' ');
  const s = useSprache();

  return (
    <Karte titel={antrag ? 'Für den AXA-Antrag' : 'Für das AXA-Gesprächsprotokoll'}>
      {/*
        Die Karte bleibt deutsch: Belehrung und Fragen sind der Wortlaut der AXA
        und stehen so im Antrag. In einer Beratung auf Englisch sagt ein Satz
        davor, warum — der Berater erlaeutert sie im Gespraech.
      */}
      {s === 'en' && (
        <p lang="en" className="ui-innen mb-4 px-4 py-3 text-sm leading-relaxed text-ui-tinte">
          This section stays in German: it follows AXA’s own wording, exactly as it appears in the application.
          Your adviser will go through it with you.
        </p>
      )}
      <p className="text-sm leading-relaxed text-ui-schiefer">
        {antrag
          ? 'Bei dieser Firma tritt der AXA-Antrag an die Stelle der Mustervereinbarung. Diese Angaben stehen darin und im '
            + 'AXA-Gesprächsprotokoll; vor der Unterschrift braucht es alle.'
          : 'Bei dieser Firma kommt zur Verzichtserklärung das AXA-Gesprächsprotokoll mit „Nein“. Diese Angaben stehen '
            + 'darin; vor der Unterschrift braucht es alle.'}
      </p>

      <h3 className="mt-5 text-sm font-medium text-ui-tinte">Beratung durch</h3>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <NamenFelder {...berater} beschriftung={['Vorname des Beraters', 'Nachname des Beraters']}
          onChange={(t) => setze({ beraterVorname: t.vorname, beraterNachname: t.nachname })} />
        {antrag && (
          <TextFeld label="Organisationsnummer (Organr.)" wert={organr} onChange={(organisationsnummer) => setze({ organisationsnummer })}
            maxLaenge={40} />
        )}
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-ui-schiefer">{herkunft}</p>

      {antrag && (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <div className="min-w-0 flex-1 basis-72">
              <h3 className="text-sm font-medium text-ui-tinte">Beitragsbefreiung bei Berufsunfähigkeit</h3>
              <p className="mt-0.5 text-xs leading-relaxed text-ui-schiefer">Nur mit diesem Zusatz stellt der Antrag die Fragen zur Gesundheit.</p>
            </div>
            {/* Ohne den Zusatz braucht es keine Angaben zur Gesundheit — schon gegebene werden geloescht. */}
            <JaNeinWahl label="Beitragsbefreiung bei Berufsunfähigkeit" wert={x.buBefreiung}
              onChange={(w) => setze(w === 'ja' ? { buBefreiung: w } : { buBefreiung: w, arbeitsunfaehig: '', einschraenkung: '', buRente: '' })} />
          </div>

          {x.buBefreiung === 'ja' && (
            <>
              <h3 className="mt-5 text-sm font-medium text-ui-tinte">Erklärung des Mitarbeiters zur Gesundheit</h3>
              <div className="ui-innen mt-2 space-y-1.5 p-4 text-xs leading-relaxed text-ui-tinte">
                <p className="font-medium">Belehrung</p>
                {AXA_BELEHRUNG.map(({ titel, text }) => <p key={text}>{titel && <>{titel} </>}{text}</p>)}
              </div>
              <ul className="mt-2 divide-y divide-ui-linie">
                {AXA_FRAGEN.map(({ feld, text }) => (
                  <li key={feld} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3">
                    <p className="min-w-0 flex-1 basis-72 text-sm leading-relaxed text-ui-tinte">{text}</p>
                    <JaNeinWahl label={text} wert={x[feld]} onChange={(w) => setze({ [feld]: w })} />
                  </li>
                ))}
              </ul>
              <div className="mt-1 space-y-0.5 text-xs leading-relaxed text-ui-schiefer">
                {AXA_FUSSNOTEN.map((f) => <p key={f}>{f}</p>)}
              </div>
            </>
          )}
        </>
      )}

      <h3 className="mt-6 text-sm font-medium text-ui-tinte">Die Beratung erfolgte</h3>
      <div role="radiogroup" aria-label="Die Beratung erfolgte" className="mt-2 inline-flex max-w-full flex-wrap gap-1 rounded-[22px] border border-ui-linie bg-ui-karte p-1">
        {AXA_KANAELE.map((k) => (
          <button key={k} type="button" role="radio" aria-checked={x.kanal === k} onClick={() => setze({ kanal: k })}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              x.kanal === k ? 'bg-ui-dunkel text-white' : 'text-ui-schiefer hover:text-ui-tinte'
            }`}>
            {KANAL_TEXT[k]}
          </button>
        ))}
      </div>

      <h3 className="mt-6 text-sm font-medium text-ui-tinte">Erläutert wurden</h3>
      <ul className="mt-1 divide-y divide-ui-linie">
        {AXA_ERLAEUTERT.map(({ feld, text }) => (
          <li key={feld} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3">
            <p className="min-w-0 flex-1 basis-72 text-sm leading-relaxed text-ui-tinte">{text}</p>
            <JaNeinWahl label={text} wert={x.erlaeutert[feld]} onChange={(w) => setze({ erlaeutert: { ...x.erlaeutert, [feld]: w } })} />
          </li>
        ))}
      </ul>
    </Karte>
  );
}

/* --- 7. Unterlagen ---------------------------------------------------------- */

export function SchrittUnterlagen(props: SchrittProps & UnterlagenProps & UnterschriftProps) {
  const {
    firma, logo, daten, r, leistung, geheZu, auftritt, sichern, luecke, kennzahlen, beratungId, unterlagen, aktualisieren, aktuell,
  } = props;
  const drucken = useDrucken();
  const w = useW();
  const s = useSprache();
  const [meldung, setMeldung] = useState<string | null>(null);
  const status = daten.entscheidung.status;
  const dok = { firma, logo, daten, r, leistung, auftritt, luecke, kennzahlen };
  const fest = unterlagen && typeof unterlagen === 'object' ? unterlagen : null;
  const name = daten.angaben.name.trim();
  // Bei AXA und Direktversicherung tritt der AXA-Antrag an die Stelle der Mustervereinbarung;
  // bei Verzicht kommt das AXA-Gespraechsprotokoll mit „Nein“ zur Verzichtserklaerung.
  const axa = istAxaAntrag(firma.angebot);
  const Zweites = axa ? AxaAntrag : Vereinbarung;
  const VerzichtDokument = axa ? AxaVerzicht : Verzicht;
  const beraterName = axa ? vollerName(axaBerater(daten.entscheidung.axa, auftritt)) : auftritt?.berater.trim() ?? '';
  const axaZiel = status === 'teilnahme' ? w('für den AXA-Antrag', 'for the AXA application') : w('für das AXA-Gesprächsprotokoll', 'for the AXA consultation record');
  const derMitarbeiter = name || w('der Mitarbeiter', 'the employee');

  // Festgeschrieben druckt die unterschriebene Fassung; sonst wie bisher die aktuelle.
  const knopf = (text: string, symbol: ReactNode, inhalt: ReactNode, haupt = false, art?: UnterlagenArt) => (
    <button type="button" className={`${haupt ? KNOPF : KNOPF_ZWEIT} max-w-full text-left`}
      onClick={() => {
        setMeldung(null);
        if (fest && art) { void festgeschriebenDrucken(beratungId, fest, art, drucken).then(setMeldung); return; }
        void sichern(daten);
        drucken(inhalt);
      }}>
      {symbol}{text}{fest && art ? w(' (unterschrieben)', ' (signed)') : ''}
    </button>
  );

  const unterzeichner: Unterzeichner[] = [
    { person: 'mitarbeiter', rolle: w('Mitarbeiter', 'Employee'), name, nameFest: true },
    { person: 'berater', rolle: w('Berater', 'Adviser'), name: beraterName, nameFest: false },
  ];
  // Jede Luecke fuehrt an das Stueck, in dem das Feld steht.
  const luecken: Luecke[] = [
    ...(name ? [] : [{ text: w('der Name des Mitarbeiters', 'the employee’s name'), schritt: 1, stueck: 'person' }]),
    ...(daten.entscheidung.ort.trim() ? [] : [{ text: w('der Ort der Beratung', 'the place of the consultation'), schritt: 5, stueck: 'empfehlung' }]),
    ...(status === 'teilnahme' && r.umwandlungMonat <= 0 ? [{ text: w('eine Umwandlung über 0 €', 'a conversion above 0 €'), schritt: 3, stueck: 'beitrag' }] : []),
    ...(status !== 'offen' && axa
      ? axaFehlt(daten, beraterName).map((text) => ({ text: `${axaZiel} ${text}`, schritt: 5, stueck: 'axa' })) : []),
  ];

  // Die erste Unterschrift — oder der erste Link — schreibt die Unterlagen fest: erst speichern, dann genau das, was
  // gedruckt wuerde. Sind sie schon festgeschrieben: null.
  const festzuschreiben = async (): Promise<UnterlagenHtml | null | 'fehler'> => {
    if (fest) return null;
    await speicherungenAbwarten();
    if (!(await sichern(daten))) return 'fehler';
    const protokoll = await unterlageErfassen(<Protokoll {...dok} />);
    return status === 'teilnahme'
      ? { protokoll, vereinbarung: await unterlageErfassen(<Zweites {...dok} />) }
      : { protokoll, verzicht: await unterlageErfassen(<VerzichtDokument {...dok} />) };
  };
  const NICHT_GESPEICHERT = w('Die Beratung konnte nicht gespeichert werden. Bitte versuchen Sie es noch einmal.',
    'The consultation could not be saved. Please try again.');

  const unterschreibenUndFestschreiben = async (person: UnterschriftPerson, n: string, zug: string): Promise<true | string> => {
    const html = await festzuschreiben();
    if (html === 'fehler') return NICHT_GESPEICHERT;
    const u = await unterschreiben(beratungId, person, n, zug, html);
    await aktualisieren();
    return u === 'fehler'
      ? w('Die Unterschrift konnte nicht gespeichert werden. Bitte versuchen Sie es noch einmal.', 'The signature could not be saved. Please try again.')
      : true;
  };

  const linkErstellenUndFestschreiben = async (): Promise<NeuerLink | string> => {
    const html = await festzuschreiben();
    if (html === 'fehler') return NICHT_GESPEICHERT;
    const l = await linkErstellen(beratungId, linkSeite(window.location.origin), html);
    await aktualisieren();
    if (l === 'ohne_name') return w('Es fehlt der Name des Mitarbeiters (Schritt 2).', 'The employee’s name is missing (step 2).');
    if (l === 'unterschrieben') return w(`${name || 'Der Mitarbeiter'} hat schon unterschrieben.`, `${name || 'The employee'} has already signed.`);
    return l === 'fehler'
      ? w('Der Link konnte nicht erstellt werden. Bitte versuchen Sie es noch einmal.', 'The link could not be created. Please try again.')
      : l;
  };

  // Unterschreiben und Drucken gehoeren zusammen — ein Stueck, das auch unterschrieben bedienbar bleibt.
  return (
    <Stuecke kennung="unterlagen" beschriftung={stueckeVon(w('Unterlagen', 'Documents'), s)} stuecke={[{
      id: 'unterlagen',
      titel: w('Unterschrift und Unterlagen', 'Signature and documents'),
      ...unterlagenZeile(unterlagen, s),
      breit: true,
      inhalt: (
        <div className="space-y-6">
          <UnterschriftenKarte status={status} unterlagen={unterlagen} unterzeichner={unterzeichner} luecken={luecken}
            bereit={aktuell} geheZu={geheZu} onUnterschreiben={unterschreibenUndFestschreiben}
            onLinkErstellen={linkErstellenUndFestschreiben} onAufgehoben={aktualisieren}
            beratungId={beratungId} axa={axa} kontakt={{ email: daten.angaben.email, telefon: daten.angaben.telefon }} />

          <Karte titel={w('Unterlagen', 'Documents')}>
            {/* Die Unterlagen selbst bleiben deutsch — das sagt eine Beratung auf Englisch, bevor jemand unterschreibt oder druckt. */}
            {s === 'en' && (
              <p className="ui-innen mb-4 px-4 py-3 text-sm leading-relaxed text-ui-tinte">
                <strong className="font-medium">The documents are in German.</strong> They are the binding version of what you
                have seen on screen; your adviser will go through them with you before you sign.
              </p>
            )}
            <p className="text-sm leading-relaxed text-ui-schiefer">
              {fest
                ? w('Die Unterlagen tragen die elektronischen Unterschriften. Drucken Sie sie aus oder speichern Sie sie als PDF; der '
                  + `Arbeitgeber unterschreibt auf Papier. Dann gehen sie an die Personalabteilung, eine Kopie bekommt ${derMitarbeiter}.`,
                  'The documents carry the electronic signatures. Print them or save them as a PDF; the employer signs on paper. '
                  + `They then go to the HR department, and ${derMitarbeiter} receives a copy.`)
                : w('Drucken Sie die Unterlagen aus oder speichern Sie sie als PDF. Unterschrieben gehen sie an die Personalabteilung, '
                  + `eine Kopie bekommt ${derMitarbeiter}.`,
                  'Print the documents or save them as a PDF. Once signed they go to the HR department, and '
                  + `${derMitarbeiter} receives a copy.`)}
            </p>
            {/* Das weiche Trennzeichen bricht das lange Wort auf dem Telefon, statt es ueber den Rand ragen zu lassen. */}
            <div className="mt-5 flex flex-wrap gap-2">
              {/* Die Namen der Unterlagen: auf Englisch mit dem deutschen Titel dahinter — so heissen sie auf dem Papier. */}
              {status === 'offen' && knopf(w('Gesprächsunterlagen', 'Consultation papers (Gesprächsunterlagen)'), <FileText className="h-4 w-4" aria-hidden />, <Gespraechsunterlagen {...dok} />, true)}
              {knopf(w('Beratungsprotokoll', 'Consultation record (Beratungsprotokoll)'), <Printer className="h-4 w-4" aria-hidden />, <Protokoll {...dok} />, status !== 'offen', 'protokoll')}
              {status === 'teilnahme' && knopf(axa
                ? w('AXA-Antrag auf Entgelt\u00ADumwandlung', 'AXA application for salary conversion (AXA-Antrag)')
                : w('Entgeltumwandlungs\u00ADvereinbarung', 'Salary conversion agreement (Entgeltumwandlungs\u00ADvereinbarung)'),
                <FileSignature className="h-4 w-4" aria-hidden />, <Zweites {...dok} />, false, 'vereinbarung')}
              {status === 'verzicht' && knopf(axa
                ? w('Verzichtserklärung mit AXA-Protokoll', 'Waiver with AXA record (Verzichtserklärung)')
                : w('Verzichtserklärung', 'Waiver (Verzichtserklärung)'),
                <FileSignature className="h-4 w-4" aria-hidden />, <VerzichtDokument {...dok} />, false, 'verzicht')}
              {status !== 'offen' && knopf(w('Gesprächsunterlagen', 'Consultation papers (Gesprächsunterlagen)'), <FileText className="h-4 w-4" aria-hidden />, <Gespraechsunterlagen {...dok} />)}
            </div>
            {meldung && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900">{meldung}</p>}
            {status === 'offen' && (
              <p className="mt-3 text-sm text-ui-schiefer">
                {w(`Noch keine Entscheidung — die Gesprächsunterlagen bekommt ${derMitarbeiter} zum Nachlesen mit, `
                  + 'das Protokoll hält den Stand fest. Vereinbarung oder Verzicht gibt es, sobald entschieden ist.',
                  `No decision yet — ${derMitarbeiter} takes the consultation papers along to read again, and the record `
                  + 'documents where things stand. The agreement or waiver follows once the decision is made.')}
              </p>
            )}
            <p className="mt-5 text-xs leading-relaxed text-ui-schiefer">
              {axa
                ? w('AXA-Antrag und AXA-Gesprächsprotokoll folgen im Wortlaut den Vorlagen der AXA. Die Verzichtserklärung ist ein '
                  + 'Muster: Bitte vor der Verwendung rechtlich prüfen lassen und mit der Versorgungsordnung der Firma abgleichen.',
                  'The AXA application and the AXA consultation record follow AXA’s templates word for word. The waiver is a '
                  + 'template: please have it checked legally before use and compare it with the company’s pension plan.')
                : w('Vereinbarung und Verzichtserklärung sind Muster. Bitte vor der Verwendung rechtlich prüfen lassen und mit der '
                  + 'Versorgungsordnung der Firma abgleichen.',
                  'The agreement and the waiver are templates. Please have them checked legally before use and compare them '
                  + 'with the company’s pension plan.')}
            </p>
          </Karte>
        </div>
      ),
    }]} />
  );
}
