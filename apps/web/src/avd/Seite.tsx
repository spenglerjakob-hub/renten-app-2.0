import { useMemo, useState, type ReactNode } from 'react';
import {
  CalendarClock, Calculator, Eraser, Gift, Info, LineChart, Mail, TrendingUp,
} from 'lucide-react';
import {
  avdZulagen, avdAnsparphase, avdSteuervorteil, avdProfitabilitaet,
  parameterFuer, regelaltersrentenbeginn, parseDatum, bruttoZuNetto,
  type AvdKind,
} from '@renten/engine';
import { Logo } from '../components/Logo';
import {
  ZahlFeld, ProzentFeld, DatumFeld, Schalter, AkkordeonKarte, GegenueberZeile,
  euro, prozent,
} from '../components/Feld';
import { KinderZeilen, KinderHinweis } from '../components/KinderFelder';
import { KapitalaufbauDiagramm } from './Diagramme';
import { BeratungDialog, type Eckdaten } from './Beratung';
import { GeburtsdatumDialog } from './Geburtsdatum';

/** Feste Effektivkosten. Bewusst nicht einstellbar — siehe Hinweis auf der Seite. */
const KOSTEN = 0.01;

/** Wohin die Beratungsanfrage geht. */
const BERATER_MAIL = 'karkossa@axa.de';

/**
 * Landingpage zum Altersvorsorgedepot.
 *
 * Steht bewusst UNABHAENGIG vom Rentenplaner: Sie kommt per QR-Code aus einem
 * Brief, richtet sich an Endverbraucher und beantwortet genau eine Frage —
 * was zahle ich ein, was kostet es mich wirklich, welches Kapital kommt dabei
 * heraus. Kein Verweis in den Rechner und keiner zurueck.
 */
/**
 * Beispielwerte fuer den ersten Aufruf.
 *
 * Die Seite kommt per QR-Code aus einem Brief. Wer sie leer vorfindet, sieht
 * vor allem Platzhalter und muss erst tippen, um zu verstehen, worum es geht.
 * Mit einem Beispiel rechnet sie ab der ersten Sekunde und erklaert sich
 * dadurch selbst.
 *
 * Das ist etwas anderes als die frueher verworfene Idee, das GESPEICHERTE
 * Szenario zu laden: Diese Zahlen gehoeren niemandem, und die Seite sagt
 * ausdruecklich, dass es ein Beispiel ist.
 */
const BEISPIEL = {
  beitragMonat: 100,
  kinder: [] as readonly AvdKind[],
  geburtsdatum: '1985-01-01',
  bruttoJahr: 45_000,
} as const;

export function Seite() {
  const [beitragMonat, setBeitragMonat] = useState<number>(BEISPIEL.beitragMonat);
  const [kinderListe, setKinderListe] = useState<readonly AvdKind[]>(BEISPIEL.kinder);
  const kinder = kinderListe.length;
  const [geburtsdatum, setGeburtsdatum] = useState<string>(BEISPIEL.geburtsdatum);
  const [bruttoJahr, setBruttoJahr] = useState<number>(BEISPIEL.bruttoJahr);
  const [rendite, setRendite] = useState(0.04);
  const [verheiratet, setVerheiratet] = useState(false);
  /** Solange nichts angefasst wurde, sind die Zahlen als Beispiel markiert. */
  const [istBeispiel, setIstBeispiel] = useState(true);
  const [wissenOffen, setWissenOffen] = useState(false);
  const [beratungOffen, setBeratungOffen] = useState(false);
  /**
   * Das Geburtsdatum wird beim Aufruf abgefragt, nicht erst irgendwo im
   * Formular. Bewusst bei JEDEM Aufruf und nicht nur beim allerersten: die
   * Seite speichert nichts im Browser, und das soll so bleiben — ein
   * gespeichertes Geburtsdatum waere auf einem geteilten Geraet eine
   * unangenehme Ueberraschung.
   */
  const [geburtsdatumGefragt, setGeburtsdatumGefragt] = useState(false);

  /** Jede eigene Eingabe hebt die Beispiel-Kennzeichnung auf. */
  const eigen = <T,>(setzen: (v: T) => void) => (v: T) => { setIstBeispiel(false); setzen(v); };

  const leeren = () => {
    setIstBeispiel(false);
    setBeitragMonat(0);
    setKinderListe([]);
    setGeburtsdatum('');
    setBruttoJahr(0);
  };

  /**
   * Steuerliche Rahmenannahmen. Bundesland und Kirchensteuer fragt die Seite
   * bewusst nicht ab — sie sollen den Endverbraucher nicht aufhalten. Der
   * Familienstand dagegen aendert das Ergebnis deutlich und wird erfasst.
   */
  const steuerOpt = useMemo(
    () => ({ verheiratet, bundesland: 'Baden-Württemberg', kirchensteuerpflichtig: false }),
    [verheiratet],
  );

  const jetzt = new Date().getFullYear();
  const p = parameterFuer(Math.max(jetzt, 2027), { indexRate: 0.01 });
  const a = p.avd;

  const geburt = parseDatum(geburtsdatum);
  const rentenbeginn = geburt ? regelaltersrentenbeginn(geburt) : null;
  const alterHeute = geburt ? jetzt - geburt.jahr : 0;
  const startjahr = Math.max(jetzt, a.abJahr);
  const jahreBisRente = rentenbeginn ? Math.max(0, rentenbeginn.jahr - startjahr) : 0;
  const alterBeiRente = geburt && rentenbeginn ? rentenbeginn.jahr - geburt.jahr : 0;

  const zulagen = useMemo(
    () => avdZulagen(
      {
        eigenbeitragJahr: beitragMonat * 12, kinder: kinderListe,
        alter: alterHeute, jahr: startjahr,
      },
      a,
    ),
    [beitragMonat, kinderListe, alterHeute, startjahr, a],
  );

  const lauf = useMemo(() => {
    if (!geburt || jahreBisRente <= 0 || beitragMonat <= 0) return null;
    return avdAnsparphase(
      {
        beitragMonat, dynamik: 0, startkapital: 0, jahre: jahreBisRente,
        renditeBrutto: rendite, ter: KOSTEN,
        kinder: kinderListe, alterHeute, startjahr,
      },
      p,
    );
  }, [geburt, jahreBisRente, beitragMonat, rendite, kinderListe,
      alterHeute, startjahr, p]);

  /**
   * Zu versteuerndes Einkommen von heute — Grundlage des
   * Sonderausgabenabzugs. Wiederverwendet wird dieselbe Funktion, die auch
   * der Rechner fuer die Erwerbsphase nutzt.
   */
  const zveHeute = useMemo(() => {
    if (bruttoJahr <= 0) return 0;
    return bruttoZuNetto(
      bruttoJahr,
      { ...steuerOpt, kinder: { hatKinder: kinder > 0, kinderUnter25: kinder } },
      p,
    ).zve;
  }, [bruttoJahr, kinder, steuerOpt, p]);

  /**
   * Sonderausgabenabzug § 10a mit Guenstigerpruefung. Abziehbar ist der
   * Eigenbeitrag bis 1 800 EUR ZUZUEGLICH des Zulagenanspruchs; wirksam wird
   * davon nur, was die Zulagen uebersteigt.
   */
  const steuervorteil = useMemo(
    () => avdSteuervorteil(
      { eigenbeitragJahr: beitragMonat * 12, zulagenJahr: zulagen.gesamt, zveHeute },
      steuerOpt,
      p,
    ),
    [beitragMonat, zulagen.gesamt, zveHeute, steuerOpt, p],
  );

  /**
   * Was das Ansparen kostet und welches Kapital dabei herauskommt.
   *
   * Die Auszahlseite bleibt bewusst leer: Die Seite zeigt bis zum
   * Rentenbeginn und nicht darueber hinaus. Rentenwerte zu erfinden, nur um
   * die Funktion zu fuettern, waere unehrlich.
   */
  const profit = useMemo(() => {
    if (!lauf || jahreBisRente <= 0) return null;
    return avdProfitabilitaet(
      {
        beitragMonat, jahre: jahreBisRente, kinder: kinderListe,
        alterHeute, startjahr, zveHeute, endkapital: lauf.endkapital,
      },
      steuerOpt,
      p,
    );
  }, [lauf, beitragMonat, jahreBisRente, kinderListe,
      alterHeute, startjahr, zveHeute, steuerOpt, p]);

  /** Was in die Beratungsanfrage geschrieben wird. */
  const eckdaten: Eckdaten = {
    beitragMonat,
    geburtsdatum,
    kinder: kinderListe,
    verheiratet,
    zulagenJahr: zulagen.dauerhaft,
    bonus: zulagen.bonus,
    steuerersparnisJahr: steuervorteil.ueberZulagen,
    endkapital: lauf?.endkapital ?? 0,
    rentenbeginnJahr: rentenbeginn?.jahr ?? 0,
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <header className="bg-slate-900 text-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 sm:px-6">
          <Logo klasse="h-9 w-9" />
          <div>
            <span className="text-sm font-black tracking-tight">JS-Rentenplaner</span>
            <p className="text-[11px] text-slate-400">Ihre Zukunft. Smart geplant.</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
          Altersvorsorgedepot: Was Ihnen der Staat ab 2027 dazugibt
        </h1>
        {/* Drei kurze Punkte statt eines Absatzes: Wer die Seite ueber einen
            QR-Code auf dem Telefon oeffnet, ueberspringt einen Textblock — drei
            Zeilen mit Symbol liest er. */}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Punkt
            symbol={<CalendarClock className="h-5 w-5 text-indigo-600" aria-hidden />}
            titel={`Ab ${a.abJahr}`}
            text="Das Altersvorsorgedepot löst die Riester-Rente ab. Gesetz beschlossen, Start am 1. Januar."
          />
          <Punkt
            symbol={<Gift className="h-5 w-5 text-teal-600" aria-hidden />}
            titel={`Bis zu ${euro(540)} im Jahr geschenkt`}
            text={`Der Staat legt auf Ihren Beitrag drauf — mit Kindern ${euro(a.kinderzulage)} je Kind zusätzlich.`}
          />
          <Punkt
            symbol={<LineChart className="h-5 w-5 text-orange-600" aria-hidden />}
            titel="Sie sparen in ETFs"
            text="Keine Beitragsgarantie — dafür die Rendite des Kapitalmarkts."
          />
        </div>

        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-600">
          Rechnen Sie hier aus, was das in Ihrem Fall bedeutet.
        </p>

        {/* Angaben links, Wirkung rechts: so sieht man beim Tippen sofort, was
            sich aendert. Die linke Spalte bleibt beim Scrollen stehen; auf
            schmalen Geraeten stapelt das Raster wie bisher. */}
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
        <div className="space-y-4 lg:col-span-5 lg:sticky lg:top-4 lg:self-start">

        {/* --- Rechner ---
            Eingabe und Ergebnis sollen sich auf den ersten Blick unterscheiden:
            die Eingabespalte steht auf getoentem Grund mit kraeftigem Rand, die
            Ergebnisse rechts auf weissen Karten. */}
        <section className="rounded-2xl border-2 border-indigo-200 bg-indigo-50/50 p-4 shadow-sm sm:p-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Ihre Angaben</h2>
            {istBeispiel && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Beispiel
              </span>
            )}
          </div>
          {istBeispiel && (
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Vorbelegt mit einem Beispiel, damit Sie gleich sehen, worum es geht.
              Tragen Sie einfach Ihre eigenen Zahlen ein.
            </p>
          )}

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div>
              <ZahlFeld label="Beitrag monatlich" wert={beitragMonat} onChange={eigen(setBeitragMonat)} einheit="€"
                hilfe="Ab 10 € im Monat gibt es Zulagen, ab 150 € die volle Grundzulage." />
              {/* Schnellwahl: die Betraege, an denen sich die Foerderung
                  entscheidet, dazu 100 EUR als runder Mittelweg. Einen Knopf
                  "Maximum" gibt es bewusst nicht — oberhalb der Foerdergrenze
                  kommt keine Zulage mehr dazu, er verspraeche also mehr, als
                  es gibt. Zwei Spalten auf dem Telefon: vier Knoepfe
                  nebeneinander waeren dort zu schmal zum Treffen. */}
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <SchnellWahl
                  betragJahr={a.mindesteigenbeitragJahr}
                  text="Mindestbeitrag"
                  aktiv={beitragMonat * 12 === a.mindesteigenbeitragJahr}
                  onWaehlen={() => eigen(setBeitragMonat)(a.mindesteigenbeitragJahr / 12)}
                />
                <SchnellWahl
                  betragJahr={a.kinderzulage}
                  text="Volle Kinderzulage"
                  aktiv={beitragMonat * 12 === a.kinderzulage}
                  onWaehlen={() => eigen(setBeitragMonat)(a.kinderzulage / 12)}
                />
                <SchnellWahl
                  betragJahr={1200}
                  text="Mittelweg"
                  aktiv={beitragMonat * 12 === 1200}
                  onWaehlen={() => eigen(setBeitragMonat)(100)}
                />
                <SchnellWahl
                  betragJahr={a.stufe2Grenze}
                  text="Volle Förderung"
                  aktiv={beitragMonat * 12 === a.stufe2Grenze}
                  onWaehlen={() => eigen(setBeitragMonat)(a.stufe2Grenze / 12)}
                />
              </div>
            </div>

            <DatumFeld label="Geburtsdatum" wert={geburtsdatum} onChange={eigen(setGeburtsdatum)}
              hilfe="Acht Ziffern genügen — die Punkte setzt das Feld." />

            <div>
              <ZahlFeld
                label="Kinder mit Kindergeldanspruch"
                wert={kinder}
                onChange={(n) => {
                  setIstBeispiel(false);
                  // Vorhandene Kinder behalten, fehlende mit einem Vorschlag
                  // auffuellen — sonst verliert man beim Vertippen alles.
                  setKinderListe((bisher) =>
                    Array.from({ length: Math.max(0, Math.min(15, Math.round(n))) },
                      (_, i) => bisher[i] ?? { geburtsjahr: jetzt - 5 }),
                  );
                }}
                max={15}
                hilfe="Die Zulage läuft nur, solange Kindergeld fließt — dafür brauche ich das Geburtsjahr."
              />

              {kinder > 0 && (
                <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2">
                  <KinderZeilen
                    kinder={kinderListe}
                    onKind={(index, aenderung) => {
                      setIstBeispiel(false);
                      setKinderListe((bisher) =>
                        bisher.map((k, i) => (i === index ? { ...k, ...aenderung } : k)));
                    }}
                    a={a}
                    jetzt={jetzt}
                  />
                  <KinderHinweis a={a} />
                </div>
              )}
            </div>

            <div>
              {/* Rot markiert wie die Steuerersparnis im Ergebnis: dieses Feld
                  ist die einzige Stellschraube dafuer. */}
              <div className="border-l-4 border-rose-400 pl-2">
                <ZahlFeld label="Bruttoeinkommen im Jahr" wert={bruttoJahr} onChange={eigen(setBruttoJahr)} einheit="€"
                  hilfe="Ihr eigenes Brutto. Es entscheidet nur über die Steuerersparnis — die Zulagen hängen allein vom Beitrag ab." />
              </div>
              <div className="mt-2">
                <Schalter
                  label="Verheiratet (Splittingtarif)"
                  wert={verheiratet}
                  onChange={eigen(setVerheiratet)}
                />
              </div>
            </div>

            <div>
              <ProzentFeld label="Erwartete Rendite p. a." wert={rendite} onChange={eigen(setRendite)} />
              {/* Fest, nicht einstellbar: ein realistischer Wert fuer ein
                  gefoerdertes Depot. Wer daran dreht, rechnet sich die Sache
                  schoen — und die Seite soll belastbar bleiben. */}
              <div className="mt-2 flex items-baseline justify-between gap-3 rounded-lg bg-slate-100 px-3 py-2">
                <span className="text-xs font-medium text-slate-500">Effektivkosten p. a.</span>
                <span className="text-sm font-bold tabular-nums text-slate-500">{prozent(KOSTEN)}</span>
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                Fest angesetzt: Fondskosten, Depotführung und Produktkosten zusammen.
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setBeratungOffen(true)}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-indigo-500"
            >
              <Mail className="h-4 w-4" aria-hidden /> Beratung gewünscht
            </button>
            <button
              type="button"
              onClick={leeren}
              className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50"
            >
              <Eraser className="h-3.5 w-3.5" aria-hidden /> Felder leeren
            </button>
          </div>
        </section>
        </div>

        <div className="space-y-4 lg:col-span-7">

        {/* --- Profitabilitaet --- */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            <Calculator className="h-4 w-4" aria-hidden /> Was es kostet, was es bringt
          </h2>

          {!profit ? (
            <p className="mt-3 rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
              Tragen Sie links Beitrag, Geburtsdatum und Bruttoeinkommen ein — dann steht hier,
              was der Vertrag Sie netto kostet und was netto herauskommt.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              <div className="rounded-lg border border-slate-200 p-3">
                <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Ihre Belastung (Ansparphase)
                </h3>
                <div className="space-y-1">
                  <GegenueberZeile
                    text={`Ihre Eigenbeiträge über ${jahreBisRente} Jahre — bis Alter ${alterBeiRente}`}
                    wert={euro(profit.eigenbeitraegeGesamt)} />
                  <GegenueberZeile text="+ Zulagen vom Staat"
                    wert={euro(profit.zulagenGesamt)} farbe="text-teal-700" />
                  <div className="!mt-2 border-t border-slate-100 pt-2">
                    <GegenueberZeile text="= fließt ins Depot"
                      wert={euro(profit.zuflussInsDepotGesamt)} />
                  </div>
                  {profit.steuerersparnisGesamt > 0 && (
                    <GegenueberZeile text="− Steuerersparnis"
                      wert={euro(profit.steuerersparnisGesamt)} farbe="text-rose-600" />
                  )}
                </div>
                <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-slate-200 pt-2">
                  <span className="text-xs font-bold text-slate-700">Kostet Sie wirklich</span>
                  <span className="text-lg font-black tabular-nums text-slate-800">
                    {euro(profit.eigenaufwandNettoGesamt)}
                  </span>
                </div>
                <p className="mt-1 text-[10px] text-slate-500">
                  {profit.steuerersparnisGesamt > 0 && (
                    <>
                      Das sind {euro(profit.eigenaufwandNettoMonat)} im Monat statt{' '}
                      {euro(profit.eigenbeitragMonat)}.{' '}
                    </>
                  )}
                  Die Zulagen mindern Ihre Kosten nicht — sie kommen vom Staat und stehen als
                  höheres Kapital auf der anderen Seite.
                </p>
              </div>

              <div className="rounded-lg border-2 border-amber-300 bg-amber-50/60 p-3">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                  Ihr Kapital zum Rentenbeginn
                </h3>
                <div className="mt-1 flex items-baseline justify-between gap-3">
                  <span className="text-xs font-bold text-amber-900">
                    Angespart bis {rentenbeginn!.jahr}
                  </span>
                  <span className="text-2xl font-black tabular-nums text-amber-900">
                    {euro(profit.endkapital)}
                  </span>
                </div>
              </div>

              {profit.hinweise.map((h) => (
                <p key={h} className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {h}
                </p>
              ))}

              <p className="text-[11px] leading-relaxed text-slate-500">
                Die Steuerersparnis ist mit Ihrem heutigen Einkommen gerechnet und auf die Laufzeit
                hochgerechnet. Genauer wäre Jahr für Jahr — dafür müsste man aber eine
                Gehaltsentwicklung unterstellen, die niemand kennt.
                {verheiratet && (
                  <> Bei „Verheiratet" wird der Splittingtarif auf Ihr eigenes Einkommen angewandt.
                  Verdient Ihr Partner ebenfalls, fällt die Steuerersparnis in Wirklichkeit
                  kleiner aus.</>
                )}
              </p>
            </div>
          )}
        </section>

        {/* --- Zulagen --- */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Ihre Förderung je Jahr
          </h2>

          {beitragMonat <= 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
              Tragen Sie links einen monatlichen Beitrag ein.
            </p>
          ) : (
            <>
              <dl className="mt-3 divide-y divide-slate-100">
                <Zeile text={`Grundzulage Stufe 1 — 50 % auf die ersten ${euro(a.stufe1Grenze)}`} wert={euro(zulagen.stufe1)} />
                <Zeile text={`Grundzulage Stufe 2 — 25 % auf die weiteren ${euro(a.stufe2Grenze - a.stufe1Grenze)}`} wert={euro(zulagen.stufe2)} />
                {kinder > 0 && (
                  <Zeile
                    text={
                      zulagen.kinderMitAnspruch > 0
                        ? `Kinderzulage — ${euro(a.kinderzulage)} je Kind, noch für ${zulagen.kinderMitAnspruch} von ${kinder}`
                        : 'Kinderzulage — kein Kind mehr im Kindergeldalter'
                    }
                    wert={euro(zulagen.kinderzulage)}
                  />
                )}
                <div className="flex items-baseline justify-between gap-4 pt-3">
                  <dt className="text-sm font-bold text-slate-800">Zulagen jedes Jahr</dt>
                  <dd className="text-xl font-black tabular-nums text-emerald-700">{euro(zulagen.dauerhaft)}</dd>
                </div>
              </dl>

              {/* Der Bonus steht BEWUSST unter dem Jahresbetrag und nicht darin:
                  Er faellt einmal an. In die Jahressumme gerechnet verspraeche
                  er fuer die ganze Laufzeit eine Foerderung, die es nur im
                  ersten Jahr gibt. */}
              {zulagen.bonus > 0 && (
                <div className="mt-2 flex items-baseline justify-between gap-4 rounded-lg bg-slate-50 px-3 py-2">
                  <span className="text-xs text-slate-600">
                    Dazu <strong>einmalig im ersten Jahr</strong>: Berufseinsteigerbonus
                    (unter {a.berufseinsteigerAlterMax})
                  </span>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-slate-800">
                    {euro(zulagen.bonus)}
                  </span>
                </div>
              )}

              <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                Auf {euro(beitragMonat * 12)} eigenen Beitrag kommen jedes Jahr{' '}
                {euro(zulagen.dauerhaft)} vom Staat — das sind{' '}
                <strong>{prozent(zulagen.foerderquoteDauerhaft)}</strong> obendrauf.
                {zulagen.bonus > 0 && (
                  <> Im ersten Jahr einmalig {euro(zulagen.bonus)} mehr.</>
                )}
              </p>

              {zulagen.hinweise.map((h) => (
                <p key={h} className="mt-2 flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {h}
                </p>
              ))}

              {/* Sonderausgabenabzug: wirkt nur, soweit er die Zulagen uebersteigt. */}
              <div className="mt-4 border-t border-slate-100 pt-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Dazu der Steuervorteil
                </h3>
                {bruttoJahr <= 0 ? (
                  <p className="mt-2 text-sm text-slate-600">
                    Tragen Sie links Ihr Bruttoeinkommen ein — ob der Sonderausgabenabzug über die
                    Zulagen hinaus etwas bringt, hängt an Ihrem Steuersatz.
                  </p>
                ) : steuervorteil.ueberZulagen <= 0 ? (
                  // Ohne Wirkung braucht es keine vierzeilige Herleitung, die
                  // am Ende null ergibt. Ein Satz sagt dasselbe.
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    Bei Ihrem Einkommen bringt der Steuerabzug <strong>nichts über die Zulagen
                    hinaus</strong> — die Zulage ist der günstigere Weg, und genau den wendet das
                    Finanzamt automatisch an. Ihre {euro(beitragMonat * 12)} Beitrag kosten Sie
                    damit auch nach Steuern {euro(steuervorteil.eigenaufwandNetto)} im Jahr.
                  </p>
                ) : (
                  <>
                    <dl className="mt-2 divide-y divide-slate-100">
                      <Zeile text={`Absetzbar (Beitrag bis ${euro(a.hoechstbetragEigenbeitrag)} plus Zulagen)`}
                        wert={euro(steuervorteil.abzugsfaehig)} />
                      <Zeile text="Steuerersparnis daraus" wert={euro(steuervorteil.steuerersparnis)} />
                      <Zeile text="− bereits gewährte Zulagen" wert={`− ${euro(zulagen.gesamt)}`} />
                      <div className="flex items-baseline justify-between gap-4 pt-3">
                        <dt className="text-sm font-bold text-slate-800">Zusätzlich über die Zulagen hinaus</dt>
                        <dd className="text-lg font-black tabular-nums text-emerald-700">
                          {euro(steuervorteil.ueberZulagen)}
                        </dd>
                      </div>
                    </dl>
                    <p className="mt-2 text-xs leading-relaxed text-slate-600">
                      Bei Ihrem Einkommen ist der Abzug günstiger als die bloße Zulage. Das
                      Finanzamt prüft das von Amts wegen — Sie müssen nichts beantragen.
                      Unterm Strich kosten Sie {euro(beitragMonat * 12)} Beitrag nur{' '}
                      <strong>{euro(steuervorteil.eigenaufwandNetto)}</strong> im Jahr.
                    </p>
                  </>
                )}
              </div>

            </>
          )}
        </section>

        {/* --- Hochrechnung --- */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            <TrendingUp className="h-4 w-4" aria-hidden /> Bis zu Ihrem Rentenbeginn
          </h2>

          {!geburt ? (
            <p className="mt-3 rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
              Tragen Sie links Ihr Geburtsdatum ein — daraus ergibt sich Ihr Rentenbeginn.
            </p>
          ) : !lauf ? (
            <p className="mt-3 rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
              Tragen Sie links einen monatlichen Beitrag ein.
            </p>
          ) : (
            <>
              <p className="mt-2 text-sm text-slate-600">
                Regelaltersgrenze <strong>{alterBeiRente}</strong>, Rentenbeginn also{' '}
                <strong>{String(rentenbeginn!.monat).padStart(2, '0')}/{rentenbeginn!.jahr}</strong>.
                Gerechnet ab {startjahr}, das sind {jahreBisRente} Beitragsjahre.
              </p>

              {/* Das Kapital selbst steht schon oben — hier nur, woraus es
                  besteht. Zweimal dieselbe Zahl macht die Seite laenger, nicht
                  klarer. */}
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Kachel titel="Ihre Eigenbeiträge" wert={euro(lauf.eigenbeitraege)} farbe="text-indigo-700" />
                <Kachel titel="Zulagen vom Staat" wert={euro(lauf.zulagenGesamt)} farbe="text-teal-700" />
                <Kachel
                  titel="Kursgewinne"
                  wert={euro(Math.max(0, lauf.endkapital - lauf.eigenbeitraege - lauf.zulagenGesamt))}
                  farbe="text-orange-700"
                />
              </div>

              {lauf.hinweise.map((h) => (
                <p key={h} className="mt-2 flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {h}
                </p>
              ))}

              <div className="mt-5 border-t border-slate-100 pt-4">
                <KapitalaufbauDiagramm
                  verlauf={lauf.verlauf}
                  steuerersparnisKumuliert={profit?.steuerersparnisKumuliert}
                />
              </div>

              <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
                Gerechnet mit {prozent(rendite)} Rendite und {prozent(KOSTEN)} Effektivkosten.
                Beträge nominal, also ohne Abzug der Inflation — in {jahreBisRente} Jahren ist ein
                Euro weniger wert als heute.
              </p>
            </>
          )}
        </section>

        </div>
        </div>

        {/* --- Einordnung ---
            Ueber die volle Breite: erklaerender Text, kein Ergebnis. Er
            braucht keine Spalte neben den Eingaben. */}
        <AkkordeonKarte
          titel="Was Sie wissen sollten"
          symbol={<Info className="h-4 w-4 text-slate-400" aria-hidden />}
          offen={wissenOffen}
          onUmschalten={() => setWissenOffen((v) => !v)}
          klasse="mt-4"
        >
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-700">
            <li>
              <strong>Die Förderung ist gestaffelt.</strong> Auf die ersten {euro(a.stufe1Grenze)} im Jahr
              gibt es {Math.round(a.stufe1Satz * 100)} %, auf die weiteren{' '}
              {euro(a.stufe2Grenze - a.stufe1Grenze)} noch {Math.round(a.stufe2Satz * 100)} %. Darüber
              steigt die Grundzulage nicht mehr — die höchste Förderquote erreichen kleine Beiträge.
            </li>
            <li>
              <strong>Unter {euro(a.mindesteigenbeitragJahr)} im Jahr gibt es gar nichts.</strong> Nicht
              anteilig weniger, sondern null. Das war schon bei Riester der häufigste Fehler.
            </li>
            <li>
              <strong>Die Kinderzulage hängt am Beitrag.</strong> Je Kind gibt es einen Euro für jeden
              eigenen Euro, höchstens {euro(a.kinderzulage)}. Die vollen {euro(a.kinderzulage)} je Kind
              erreichen Sie ab {euro(a.kinderzulage)} Jahresbeitrag — unabhängig davon, wie viele
              Kinder es sind.
            </li>
            <li>
              <strong>Ausgezahlt wird ab {a.auszahlungAbAlter}</strong>, als lebenslange Rente oder als
              Auszahlplan, der mindestens bis {a.auszahlplanBisAlter} läuft. Zu Rentenbeginn dürfen Sie
              einmalig bis zu {Math.round(a.teilauszahlungMax * 100)} % förderunschädlich entnehmen —
              darüber hinaus ist eine freie Entnahme nicht vorgesehen.
            </li>
            <li>
              <strong>In der Ansparphase fällt keine Vorabpauschale an.</strong> Gegenüber einem freien
              Depot bleibt dadurch mehr investiert — der Unterschied wächst über die Jahre.
            </li>
            <li>
              <strong>Dafür ist die Auszahlung voll steuerpflichtig.</strong> Ein freies Depot zahlt
              25 % Abgeltungsteuer nur auf den Gewinn; hier wird der gesamte Betrag mit dem
              persönlichen Satz besteuert. Ob sich die Förderung lohnt, entscheidet sich genau an
              diesem Punkt — und damit an Ihrem Steuersatz im Alter.
            </li>
          </ul>

          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
            <strong>Zum Sparerpauschbetrag:</strong> Er gilt hier <em>nicht</em>. Die Auszahlung ist
            eine sonstige Einkunft nach § 22 Nr. 5 EStG, kein Kapitalertrag — anders als beim freien
            Depot, wo er sehr wohl greift. Der Werbungskosten-Pauschbetrag von 102 € gilt dagegen
            schon; diese Rechnung setzt ihn bei der gesetzlichen Rente an. Wer keine gesetzliche
            Rente bezieht, steht hier deshalb um rund 30 € Steuer im Jahr zu ungünstig da.
          </p>

          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
            <strong>Zum Steuervorteil:</strong> Absetzbar sind Eigenbeiträge bis{' '}
            {euro(a.hoechstbetragEigenbeitrag)} im Jahr <em>zuzüglich</em> Ihres Zulagenanspruchs — für
            Alleinstehende ohne Kinder also {euro(a.hoechstbetragEigenbeitrag + 540)}. Das Finanzamt
            prüft von Amts wegen, ob der Abzug günstiger ist als die Zulage; wirksam wird davon nur,
            was über die Zulagen hinausgeht.
          </p>
        </AkkordeonKarte>

        <p className="mt-6 text-center text-xs leading-relaxed text-slate-500">
          Modellrechnung ohne Gewähr. Keine Steuer-, Renten- oder Anlageberatung. Rechtsstand des
          am 8. Mai 2026 verabschiedeten Gesetzes, Anwendung ab 1. Januar 2027. Die Berechnung läuft
          vollständig in Ihrem Browser — Ihre Eingaben verlassen dieses Gerät nicht.
        </p>
      </main>

      {/*
        Die Beispielwerte fuer Beitrag und Brutto bleiben stehen: die Seite
        soll unmittelbar nach dem Schliessen etwas rechnen und sich dadurch
        selbst erklaeren. Nur das Geburtsdatum ist danach das eigene.
      */}
      <GeburtsdatumDialog
        offen={!geburtsdatumGefragt}
        onFertig={(datum) => {
          setGeburtsdatum(datum);
          setGeburtsdatumGefragt(true);
        }}
      />

      <BeratungDialog
        offen={beratungOffen}
        onSchliessen={() => setBeratungOffen(false)}
        empfaenger={BERATER_MAIL}
        eckdaten={eckdaten}
      />
    </div>
  );
}

function Zeile({ text, wert }: { text: string; wert: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-sm text-slate-600">{text}</dt>
      <dd className="shrink-0 text-sm font-bold tabular-nums text-slate-800">{wert}</dd>
    </div>
  );
}

function SchnellWahl({ betragJahr, text, aktiv, onWaehlen }: {
  betragJahr: number; text: string; aktiv: boolean; onWaehlen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onWaehlen}
      aria-pressed={aktiv}
      className={`rounded-lg border px-2 py-1.5 text-center transition-colors ${
        aktiv ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-slate-400'
      }`}
    >
      <span className="block text-sm font-bold tabular-nums text-slate-800">
        {euro(betragJahr / 12)}
      </span>
      <span className="block text-[10px] leading-tight text-slate-500">
        {text} · {euro(betragJahr)} im Jahr
      </span>
    </button>
  );
}

function Punkt({ symbol, titel, text }: { symbol: ReactNode; titel: string; text: string }) {
  return (
    <div className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3">
      <span className="mt-0.5 shrink-0">{symbol}</span>
      <span>
        <span className="block text-sm font-bold text-slate-800">{titel}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-slate-600">{text}</span>
      </span>
    </div>
  );
}

function Saeule({
  titel, zeilen, ergebnis, fuss, hervor = false,
}: {
  titel: string;
  zeilen: readonly (readonly [string, string])[];
  ergebnis: string;
  fuss: string;
  hervor?: boolean;
}) {
  return (
    <div className={`rounded-xl border-2 p-3 ${hervor ? 'border-indigo-200 bg-indigo-50/40' : 'border-slate-200'}`}>
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">{titel}</h3>
      <dl className="mt-2 space-y-1">
        {zeilen.map(([t, w]) => (
          <div key={t} className="flex items-baseline justify-between gap-3">
            <dt className="text-xs text-slate-600">{t}</dt>
            <dd className="shrink-0 text-xs font-medium tabular-nums text-slate-800">{w}</dd>
          </div>
        ))}
      </dl>
      <div className={`mt-2 border-t pt-2 text-lg font-black tabular-nums ${hervor ? 'border-indigo-200 text-indigo-800' : 'border-slate-200 text-slate-800'}`}>
        {ergebnis}
      </div>
      <p className="mt-1 text-[11px] text-slate-500">{fuss}</p>
    </div>
  );
}

function Kachel({ titel, wert, farbe = 'text-slate-800' }: { titel: string; wert: string; farbe?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{titel}</div>
      <div className={`text-base font-black tabular-nums ${farbe}`}>{wert}</div>
    </div>
  );
}
