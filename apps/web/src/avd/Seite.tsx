import { useMemo, useState } from 'react';
import { ArrowRight, Calculator, Download, Info, Scale, TrendingUp } from 'lucide-react';
import {
  avdZulagen, avdAnsparphase, avdAuszahlung, avdSteuervorteil, avdGegenFreiesDepot,
  avdProfitabilitaet,
  parameterFuer, regelaltersrentenbeginn, parseDatum, haushaltssteuer,
  schaetzeEntgeltpunkte, rentenfreibetrag, bruttoZuNetto,
} from '@renten/engine';
import { importiere } from '@renten/schema';
import { Logo } from '../components/Logo';
import {
  ZahlFeld, ProzentFeld, DatumFeld, Schalter, Kennzahl, GegenueberZeile, euro, prozent,
} from '../components/Feld';
import { KapitalaufbauDiagramm, FoerderquoteDiagramm } from './Diagramme';

/**
 * Steuerliche Rahmenannahmen der Seite. Die Landingpage kennt weder
 * Familienstand noch Bundesland — wer es genau will, geht in den Rechner.
 * Angesetzt wird deshalb der ungünstigere Fall: einzeln veranlagt, ohne
 * Kirchensteuer.
 */
const STEUER_OPT = {
  verheiratet: false,
  bundesland: 'Baden-Württemberg',
  kirchensteuerpflichtig: false,
} as const;

const SPEICHER_SCHLUESSEL = 'rentenplaner.szenario.v1';

/**
 * Landingpage zum Altersvorsorgedepot.
 *
 * Eigener Einstiegspunkt, nicht Teil des Rechners: Wer ueber eine Suchmaschine
 * kommt, soll eine schnell ladende Seite zu genau dieser Frage sehen — und
 * ausdruecklich NICHT die Daten eines fremden oder eigenen Szenarios. Deshalb
 * startet die Seite mit leeren Feldern; uebernommen wird nur auf Knopfdruck.
 */
export function Seite() {
  const [beitragMonat, setBeitragMonat] = useState(0);
  const [kinder, setKinder] = useState(0);
  const [geburtsdatum, setGeburtsdatum] = useState('');
  const [bruttoJahr, setBruttoJahr] = useState(0);
  const [rendite, setRendite] = useState(0.06);
  const [kosten, setKosten] = useState(0.01);
  const [teilauszahlung, setTeilauszahlung] = useState(false);
  const [uebernommen, setUebernommen] = useState<string | null>(null);

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
    () => avdZulagen({ eigenbeitragJahr: beitragMonat * 12, kinder, alter: alterHeute }, a),
    [beitragMonat, kinder, alterHeute, a],
  );

  // Auszahldauer: bis mindestens 85, wie es das Gesetz verlangt.
  const auszahldauer = Math.max(1, a.auszahlplanBisAlter - Math.max(alterBeiRente, a.auszahlungAbAlter));
  const teilauszahlungQuote = teilauszahlung ? a.teilauszahlungMax : 0;

  const lauf = useMemo(() => {
    if (!geburt || jahreBisRente <= 0 || beitragMonat <= 0) return null;
    const anspar = avdAnsparphase(
      {
        beitragMonat, dynamik: 0, startkapital: 0, jahre: jahreBisRente,
        renditeBrutto: rendite, ter: kosten, kinder, alterHeute, startjahr,
      },
      p,
    );
    // Ohne Rendite in der Auszahlphase: der Bestand wird schlicht verteilt.
    const aus = avdAuszahlung(
      {
        kapital: anspar.endkapital, alterBeiBeginn: alterBeiRente,
        dauerJahre: auszahldauer, rendite: 0, teilauszahlungQuote,
      },
      a,
    );
    return { anspar, aus };
  }, [geburt, jahreBisRente, beitragMonat, rendite, kosten, kinder, alterHeute, startjahr,
      alterBeiRente, auszahldauer, teilauszahlungQuote, p, a]);

  /**
   * Zu versteuerndes Einkommen von heute — Grundlage des
   * Sonderausgabenabzugs. Wiederverwendet wird dieselbe Funktion, die auch
   * der Rechner fuer die Erwerbsphase nutzt.
   */
  const zveHeute = useMemo(() => {
    if (bruttoJahr <= 0) return 0;
    return bruttoZuNetto(
      bruttoJahr,
      { ...STEUER_OPT, kinder: { hatKinder: kinder > 0, kinderUnter25: kinder } },
      p,
    ).zve;
  }, [bruttoJahr, kinder, p]);

  /**
   * Sonderausgabenabzug § 10a mit Guenstigerpruefung. Abziehbar ist der
   * Eigenbeitrag bis 1 800 EUR ZUZUEGLICH des Zulagenanspruchs; wirksam wird
   * davon nur, was die Zulagen uebersteigt.
   */
  const steuervorteil = useMemo(
    () => avdSteuervorteil(
      { eigenbeitragJahr: beitragMonat * 12, zulagenJahr: zulagen.gesamt, zveHeute },
      STEUER_OPT,
      p,
    ),
    [beitragMonat, zulagen.gesamt, zveHeute, p],
  );

  /** Die Foerderquote ueber den ganzen Beitragsbereich, fuer das Diagramm. */
  const foerderkurve = useMemo(() => {
    const punkte: { beitrag: number; quote: number }[] = [];
    for (let b = 0; b <= 3600; b += 60) {
      punkte.push({ beitrag: b, quote: avdZulagen({ eigenbeitragJahr: b, kinder, alter: alterHeute }, a).foerderquote });
    }
    return punkte;
  }, [kinder, alterHeute, a]);

  /**
   * Steuer auf die Auszahlung. Das Altersvorsorgedepot ist VOLLSTAENDIG
   * nachgelagert zu versteuern, mit dem persoenlichen Satz — nicht mit den
   * 25 % der Abgeltungsteuer.
   *
   * Entscheidend ist deshalb der Steuersatz IM ALTER, und der haengt fast
   * immer an der gesetzlichen Rente. Wird nur das Depot gerechnet, bleibt der
   * Betrag oft unter dem Grundfreibetrag und die Auszahlung erscheint
   * steuerfrei — ein Ergebnis, das kaum jemanden betrifft. Ist ein
   * Bruttoeinkommen angegeben, wird daraus die gesetzliche Rente geschaetzt
   * und mitgerechnet; das Depot wird dann mit dem Satz belastet, den es beim
   * Nutzer tatsaechlich ausloest.
   */
  const netto = useMemo(() => {
    if (!lauf || lauf.aus.bruttoJahr <= 0 || !rentenbeginn) return null;
    const pRente = parameterFuer(rentenbeginn.jahr, { indexRate: 0.01 });

    // Geschaetzte gesetzliche Rente, nominal zum Rentenbeginn.
    let grvJahr = 0;
    if (bruttoJahr > 0) {
      const sch = schaetzeEntgeltpunkte(bruttoJahr, alterHeute, alterBeiRente, p);
      grvJahr = sch.monatsrenteHeutigeKaufkraft * 12 * Math.pow(1.01, rentenbeginn.jahr - jetzt);
    }
    const fb = rentenfreibetrag(rentenbeginn.jahr, grvJahr);
    const grvZve = Math.max(0, grvJahr - fb.jahresbetrag - pRente.pauschbetraege.renten);

    const optionen = {
      verheiratet: false, bundesland: 'Baden-Württemberg', kirchensteuerpflichtig: false,
      vorsorgeaufwand: 0, weitereAbzuege: pRente.pauschbetraege.sonderausgaben,
    };
    const depotQuelle = {
      id: 'avd', bezeichnung: 'Altersvorsorgedepot',
      brutto: lauf.aus.bruttoJahr, zveBeitrag: lauf.aus.bruttoJahr, kvPv: 0,
    };
    const grvQuelle = {
      id: 'grv', bezeichnung: 'Gesetzliche Rente', brutto: grvJahr, zveBeitrag: grvZve, kvPv: 0,
    };

    // Die Mehrsteuer, die genau das Depot ausloest — nicht der Durchschnitt
    // ueber beide Einkuenfte. Nur so ist der Vergleich mit einem freien Depot
    // ehrlich, bei dem ebenfalls nur der Ertrag besteuert wird.
    const gesamt = haushaltssteuer(grvJahr > 0 ? [grvQuelle, depotQuelle] : [depotQuelle], optionen, pRente);
    const ohne = grvJahr > 0
      ? haushaltssteuer([grvQuelle], optionen, pRente)
      : { est: 0, soli: 0, kirchensteuer: 0 };

    const summe = (x: { est: number; soli: number; kirchensteuer: number }) =>
      x.est + x.soli + x.kirchensteuer;
    const steuer = Math.max(0, summe(gesamt) - summe(ohne));

    // Die Teilauszahlung trifft ZUSAETZLICH im selben Jahr — und weil sie auf
    // einen Schlag kommt, in den hohen Tarifzonen. Genau das macht sie teuer,
    // und genau das muss die Seite zeigen statt es zu verschweigen.
    let steuerEinmal = 0;
    if (lauf.aus.teilauszahlung > 0) {
      const mitEinmal = haushaltssteuer(
        [
          ...(grvJahr > 0 ? [grvQuelle] : []),
          depotQuelle,
          {
            id: 'einmal', bezeichnung: 'Teilauszahlung',
            brutto: lauf.aus.teilauszahlung, zveBeitrag: lauf.aus.teilauszahlung, kvPv: 0,
          },
        ],
        optionen,
        pRente,
      );
      steuerEinmal = Math.max(0, summe(mitEinmal) - summe(gesamt));
    }

    return {
      steuer,
      nettoJahr: lauf.aus.bruttoJahr - steuer,
      grvJahr,
      satz: lauf.aus.bruttoJahr > 0 ? steuer / lauf.aus.bruttoJahr : 0,
      steuerEinmal,
      nettoEinmal: lauf.aus.teilauszahlung - steuerEinmal,
      satzEinmal: lauf.aus.teilauszahlung > 0 ? steuerEinmal / lauf.aus.teilauszahlung : 0,
    };
  }, [lauf, rentenbeginn, bruttoJahr, alterHeute, alterBeiRente, p, jetzt]);

  /**
   * Gefoerdertes gegen freies Depot — die eigentliche Frage.
   *
   * Gerechnet wird mit dem Steuersatz, der sich oben aus der geschaetzten
   * Rente ergeben hat. Ohne Einkommensangabe waere er kuenstlich niedrig und
   * das gefoerderte Depot kaeme zu gut weg; dann bleibt der Vergleich aus.
   */
  const vergleich = useMemo(() => {
    if (!lauf || !netto || bruttoJahr <= 0 || jahreBisRente <= 0) return null;
    return avdGegenFreiesDepot(
      {
        beitragMonat, jahre: jahreBisRente, renditeBrutto: rendite, kosten,
        kinder, alterHeute, alterBeiRente, startjahr,
        auszahldauer, renditeAuszahlung: 0, teilauszahlungQuote,
        zveHeute, steuersatzImAlter: netto.satz,
      },
      STEUER_OPT,
      p,
    );
  }, [lauf, netto, bruttoJahr, beitragMonat, jahreBisRente, rendite, kosten, kinder,
      alterHeute, alterBeiRente, startjahr, auszahldauer, teilauszahlungQuote, zveHeute, p]);

  /**
   * Profitabilitaet — dieselbe Rechnung und dieselben Kennzahlen wie im
   * Vertrags-TUEV. Die AUSZAHLSEITE wird uebergeben, nicht neu gerechnet:
   * `netto` oben hat sie bereits ueber den Haushaltstarif mit geschaetzter
   * gesetzlicher Rente ermittelt. Zwei Rechnungen wuerden auseinanderlaufen,
   * und die Seite widerspraeche sich dann selbst.
   */
  const profit = useMemo(() => {
    if (!lauf || !netto || bruttoJahr <= 0 || jahreBisRente <= 0) return null;
    return avdProfitabilitaet(
      {
        beitragMonat, jahre: jahreBisRente, kinder, alterHeute, startjahr,
        zveHeute,
        bruttoRenteJahr: lauf.aus.bruttoJahr,
        steuerRenteJahr: netto.steuer,
        jahreAuszahlung: lauf.aus.dauerJahre,
        bruttoEinmal: lauf.aus.teilauszahlung,
        steuerEinmal: netto.steuerEinmal,
      },
      STEUER_OPT,
      p,
    );
  }, [lauf, netto, bruttoJahr, beitragMonat, jahreBisRente, kinder, alterHeute, startjahr, zveHeute, p]);

  const uebernehmen = () => {
    try {
      const roh = localStorage.getItem(SPEICHER_SCHLUESSEL);
      if (!roh) { setUebernommen('Es ist noch keine Planung gespeichert.'); return; }
      const r = importiere(roh);
      if (!r.ok) { setUebernommen('Die gespeicherte Planung ließ sich nicht lesen.'); return; }

      const s = r.szenario;
      const person = s.personen[0];
      if (person?.geburtsdatum) setGeburtsdatum(person.geburtsdatum);
      setKinder(s.haushalt.kinderUnter25);
      const e = s.einkommenHeute;
      if (e.modus !== 'besoldung') setBruttoJahr(Math.round(e.betrag * e.auszahlungen));
      setUebernommen('Geburtsdatum, Kinder und Einkommen wurden übernommen.');
    } catch {
      setUebernommen('Auf den Speicher des Browsers ließ sich nicht zugreifen.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <header className="bg-slate-900 text-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 sm:px-6">
          <Logo klasse="h-9 w-9" />
          <div>
            <a href="/" className="text-sm font-black tracking-tight hover:underline">JS-Rentenplaner</a>
            <p className="text-[11px] text-slate-400">Ihre Zukunft. Smart geplant.</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
          Altersvorsorgedepot: Was Ihnen der Staat ab 2027 dazugibt
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
          Ab dem <strong>1. Januar 2027</strong> löst das geförderte Altersvorsorgedepot die
          Riester-Rente ab. Anders als dort gibt es keine Beitragsgarantie und keinen Zwang zur
          Versicherung — Sie sparen in Fonds oder ETFs und bekommen trotzdem Zulagen. Rechnen Sie
          hier aus, wie viel das in Ihrem Fall ist.
        </p>

        {/* Angaben links, Wirkung rechts: so sieht man beim Tippen sofort, was
            sich aendert. Die linke Spalte bleibt beim Scrollen stehen; auf
            schmalen Geraeten stapelt das Raster wie bisher. */}
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
        <div className="space-y-4 lg:col-span-5 lg:sticky lg:top-4 lg:self-start">

        {/* --- Rechner --- */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Ihre Angaben</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <ZahlFeld label="Beitrag monatlich" wert={beitragMonat} onChange={setBeitragMonat} einheit="€"
              hilfe="Ab 10 € im Monat gibt es Zulagen, ab 150 € die volle Grundzulage." />
            <ZahlFeld label="Kinder mit Kindergeldanspruch" wert={kinder} onChange={setKinder} max={15} />
            <DatumFeld label="Geburtsdatum" wert={geburtsdatum} onChange={setGeburtsdatum}
              hilfe="Acht Ziffern genügen — die Punkte setzt das Feld." />
            <ZahlFeld label="Bruttoeinkommen im Jahr" wert={bruttoJahr} onChange={setBruttoJahr} einheit="€"
              hilfe="Die Zulagen hängen allein vom Beitrag ab. Das Einkommen dient der Schätzung Ihrer gesetzlichen Rente — und damit Ihres Steuersatzes im Alter." />
            <ProzentFeld label="Erwartete Rendite p. a." wert={rendite} onChange={setRendite} />
            <ProzentFeld label="Effektivkosten p. a." wert={kosten} onChange={setKosten} max={5}
              hilfe="Alles zusammen: Fondskosten, Depotführung, Produktkosten." />
          </div>

          <div className="mt-3">
            <Schalter
              label={`${Math.round(a.teilauszahlungMax * 100)} % zu Rentenbeginn auf einen Schlag auszahlen lassen`}
              wert={teilauszahlung}
              onChange={setTeilauszahlung}
            />
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Bis zu {Math.round(a.teilauszahlungMax * 100)} % dürfen förderunschädlich auf einmal entnommen
              werden. Der Rest läuft als Auszahlplan weiter. Achtung: Der Einmalbetrag ist im Jahr des
              Zuflusses voll zu versteuern — auf einen Schlag landet er in den hohen Tarifzonen.
            </p>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={uebernehmen}
              className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-4 w-4" aria-hidden /> Daten aus meiner Planung übernehmen
            </button>
            <a
              href="/"
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-bold text-white hover:bg-indigo-500"
            >
              Im Rentenplaner weiterrechnen <ArrowRight className="h-4 w-4" aria-hidden />
            </a>
          </div>
          {uebernommen && (
            <p className="mt-2 text-xs text-slate-600">{uebernommen}</p>
          )}
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
                    text={`Ihre Eigenbeiträge über ${jahreBisRente} Jahre`}
                    wert={euro(profit.eigenbeitraegeGesamt)} />
                  <GegenueberZeile text="+ Zulagen vom Staat"
                    wert={euro(profit.zulagenGesamt)} farbe="text-teal-700" />
                  <div className="!mt-2 border-t border-slate-100 pt-2">
                    <GegenueberZeile text="= fließt ins Depot"
                      wert={euro(profit.zuflussInsDepotGesamt)} />
                  </div>
                  <GegenueberZeile text="− Steuerersparnis"
                    wert={euro(profit.steuerersparnisGesamt)} farbe="text-teal-700" />
                </div>
                <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-slate-200 pt-2">
                  <span className="text-xs font-bold text-slate-700">Kostet Sie wirklich</span>
                  <span className="text-lg font-black tabular-nums text-slate-800">
                    {euro(profit.eigenaufwandNettoGesamt)}
                  </span>
                </div>
                <p className="mt-1 text-[10px] text-slate-500">
                  Das sind {euro(profit.eigenaufwandNettoMonat)} im Monat statt{' '}
                  {euro(profit.eigenbeitragMonat)}. Die Zulagen mindern Ihre Kosten nicht — sie
                  kommen vom Staat und stehen als höheres Kapital auf der anderen Seite.
                </p>
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
                <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                  Ihr Ertrag (Auszahlungsphase)
                </h3>
                <div className="space-y-1">
                  <GegenueberZeile text="Brutto-Rente / Monat" wert={euro(profit.bruttoRenteMonat)} />
                  <GegenueberZeile text="− Steuer" wert={euro(profit.steuerRenteMonat)} farbe="text-rose-600" />
                </div>
                <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-amber-200 pt-2">
                  <span className="text-xs font-bold text-amber-900">Echte Netto-Rente</span>
                  <span className="text-lg font-black tabular-nums text-amber-900">
                    {euro(profit.nettoRenteMonat)} <span className="text-xs font-bold">/ Monat</span>
                  </span>
                </div>
                {profit.nettoEinmal > 0 && (
                  <p className="mt-1 text-[10px] text-amber-900">
                    Dazu einmalig {euro(profit.nettoEinmal)} netto zu Rentenbeginn
                    ({euro(profit.bruttoEinmal)} brutto − {euro(profit.steuerEinmal)} Steuer).
                  </p>
                )}
                <p className="mt-1 text-[10px] text-slate-500">
                  Über {profit.jahreAuszahlung} Auszahlungsjahre zusammen{' '}
                  {euro(profit.summeAuszahlung)}.
                </p>
              </div>

              <div className={`rounded-lg border p-3 ${profit.nettoHebel >= 1 ? 'border-emerald-200 bg-emerald-50/50' : 'border-rose-200 bg-rose-50/50'}`}>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Kennzahl
                    titel="Netto-Hebel"
                    wert={`${profit.nettoHebel.toLocaleString('de-DE', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} ×`}
                    farbe={profit.nettoHebel >= 1 ? 'text-emerald-700' : 'text-rose-700'}
                    fussnote="Auszahlung je Euro Einzahlung"
                  />
                  <Kennzahl
                    titel="Nettorendite"
                    wert={prozent(profit.rendite, 2)}
                    farbe={profit.rendite > 0 ? 'text-emerald-700' : 'text-rose-700'}
                    fussnote="p. a. nach allen Abzügen"
                  />
                  <Kennzahl
                    titel="Netto-Gewinn"
                    wert={euro(profit.echterGewinn)}
                    farbe={profit.echterGewinn >= 0 ? 'text-emerald-700' : 'text-rose-700'}
                  />
                  <Kennzahl
                    titel="Amortisation"
                    wert={`${profit.amortisationsJahre.toLocaleString('de-DE', { maximumFractionDigits: 1 })} J.`}
                    fussnote="ab Rentenbeginn"
                  />
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
                  <Zeile text={`Kinderzulage — ${euro(a.kinderzulage)} je Kind`} wert={euro(zulagen.kinderzulage)} />
                )}
                {zulagen.bonus > 0 && (
                  <Zeile text={`Berufseinsteigerbonus — einmalig unter ${a.berufseinsteigerAlterMax}`} wert={euro(zulagen.bonus)} />
                )}
                <div className="flex items-baseline justify-between gap-4 pt-3">
                  <dt className="text-sm font-bold text-slate-800">Zulagen im Jahr</dt>
                  <dd className="text-xl font-black tabular-nums text-emerald-700">{euro(zulagen.gesamt)}</dd>
                </div>
              </dl>

              <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                Auf {euro(beitragMonat * 12)} eigenen Beitrag kommen {euro(zulagen.gesamt)} vom Staat —
                das sind <strong>{prozent(zulagen.foerderquote)}</strong> obendrauf.
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
                ) : (
                  <>
                    <dl className="mt-2 divide-y divide-slate-100">
                      <Zeile text="Absetzbar (Beitrag bis 1.800 € plus Zulagen)"
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
                      {steuervorteil.guenstigerAlsZulage ? (
                        <>
                          Bei Ihrem Einkommen ist der Abzug günstiger als die bloße Zulage. Das
                          Finanzamt prüft das von Amts wegen — Sie müssen nichts beantragen.
                          Unterm Strich kosten Sie {euro(beitragMonat * 12)} Beitrag nur{' '}
                          <strong>{euro(steuervorteil.eigenaufwandNetto)}</strong> im Jahr.
                        </>
                      ) : (
                        <>
                          Bei Ihrem Einkommen bringt der Abzug nichts über die Zulagen hinaus — die
                          Zulage ist der günstigere Weg, und genau den wendet das Finanzamt an.
                          Unterm Strich kosten Sie {euro(beitragMonat * 12)} Beitrag{' '}
                          <strong>{euro(steuervorteil.eigenaufwandNetto)}</strong> im Jahr.
                        </>
                      )}
                    </p>
                  </>
                )}
              </div>

              <div className="mt-5 border-t border-slate-100 pt-4">
                <FoerderquoteDiagramm
                  punkte={foerderkurve}
                  eigenbeitragJahr={beitragMonat * 12}
                  quoteHier={zulagen.foerderquote}
                />
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

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Kachel titel="Kapital bei Rentenbeginn" wert={euro(lauf.anspar.endkapital)} />
                <Kachel titel="Davon Zulagen" wert={euro(lauf.anspar.zulagenGesamt)} farbe="text-teal-700" />
                <Kachel
                  titel="Davon Kursgewinne"
                  wert={euro(Math.max(0, lauf.anspar.endkapital - lauf.anspar.eigenbeitraege - lauf.anspar.zulagenGesamt))}
                  farbe="text-orange-700"
                />
              </div>

              {netto && (
                <p className="mt-3 text-xs leading-relaxed text-slate-600">
                  Über {lauf.aus.dauerJahre} Jahre ausgezahlt: {euro(lauf.aus.bruttoJahr / 12)} brutto im Monat,
                  davon {euro(netto.steuer / 12)} Steuer ({prozent(netto.satz)}). Das Altersvorsorgedepot ist{' '}
                  <strong>voll nachgelagert zu versteuern</strong> — mit Ihrem persönlichen Satz, nicht
                  mit den 25 % der Abgeltungsteuer.{' '}
                  {netto.grvJahr > 0 ? (
                    <>
                      Mitgerechnet ist eine geschätzte gesetzliche Rente von{' '}
                      {euro(netto.grvJahr / 12)} im Monat; ausgewiesen ist die Steuer, die genau das
                      Depot zusätzlich auslöst.
                    </>
                  ) : (
                    <>
                      <strong>Ohne Angabe Ihres Einkommens</strong> ist das Depot hier die einzige
                      Einkunft und bleibt deshalb weitgehend unter dem Grundfreibetrag. Tragen Sie
                      links Ihr Bruttoeinkommen ein — dann wird die gesetzliche Rente geschätzt und
                      die Auszahlung mit dem Satz belastet, der Sie wirklich trifft.
                    </>
                  )}
                </p>
              )}

              {netto && lauf.aus.teilauszahlung > 0 && (
                <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-700">
                  Die Teilauszahlung kostet {prozent(netto.satzEinmal)} Steuer — mehr als die{' '}
                  {prozent(netto.satz)} auf die laufende Rente, weil der ganze Betrag in einem
                  einzigen Jahr anfällt und dadurch in höhere Tarifzonen rutscht.
                </p>
              )}

              {lauf.aus.hinweise.map((h) => (
                <p key={h} className="mt-2 flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {h}
                </p>
              ))}

              <div className="mt-5 border-t border-slate-100 pt-4">
                <KapitalaufbauDiagramm verlauf={lauf.anspar.verlauf} />
              </div>

              <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
                Gerechnet mit {prozent(rendite)} Rendite und {prozent(kosten)} Effektivkosten in der
                Ansparphase, ohne Rendite in der Auszahlphase, über {lauf.aus.dauerJahre} Jahre bis
                zum {a.auszahlplanBisAlter}. Lebensjahr. Beträge nominal, also ohne Abzug der
                Inflation — in {jahreBisRente} Jahren ist ein Euro weniger wert als heute.
              </p>
            </>
          )}
        </section>

        {/* --- Vergleich mit einem freien Depot --- */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            <Scale className="h-4 w-4" aria-hidden /> Lohnt sich die Förderung?
          </h2>

          {!vergleich || !netto ? (
            <p className="mt-3 rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
              Für den Vergleich brauche ich Beitrag, Geburtsdatum und Bruttoeinkommen. Der Steuersatz
              im Alter entscheidet die Frage — ohne Einkommen wäre die Antwort geschönt.
            </p>
          ) : (
            <>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Derselbe Beitrag, dieselbe Rendite, dieselben Kosten — einmal gefördert, einmal als
                freies Wertpapierdepot. So misst der Vergleich nur, was die Förderung und die Steuer
                ausmachen.
              </p>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Saeule
                  titel="Gefördertes Altersvorsorgedepot"
                  hervor
                  zeilen={[
                    ['Kapital bei Rentenbeginn', euro(vergleich.gefoerdert.endkapital)],
                    ['Auszahlung brutto / Monat', euro(vergleich.gefoerdert.bruttoJahr / 12)],
                    ['− Steuer (persönlicher Satz)', euro(vergleich.gefoerdert.steuerJahr / 12)],
                  ]}
                  ergebnis={`${euro(vergleich.gefoerdert.nettoMonat)} netto`}
                  fuss={`Aus Ihrer Tasche: ${euro(vergleich.gefoerdert.eigenaufwandNetto)}`}
                />
                <Saeule
                  titel="Freies Wertpapierdepot"
                  zeilen={[
                    ['Kapital bei Rentenbeginn', euro(vergleich.frei.endkapital)],
                    ['Auszahlung brutto / Monat', euro(vergleich.frei.bruttoJahr / 12)],
                    ['− Abgeltungsteuer auf den Gewinn', euro(vergleich.frei.steuerJahr / 12)],
                  ]}
                  ergebnis={`${euro(vergleich.frei.nettoMonat)} netto`}
                  fuss={`Aus Ihrer Tasche: ${euro(vergleich.frei.eigenaufwandNetto)}`}
                />
              </div>

              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-700">
                {vergleich.gefoerdert.nettoMonat >= vergleich.frei.nettoMonat ? (
                  <>
                    Das <strong>geförderte Depot liegt vorn</strong>, um{' '}
                    {euro(vergleich.gefoerdert.nettoMonat - vergleich.frei.nettoMonat)} im Monat —
                    bei praktisch gleichem eigenem Einsatz. Die Zulagen kommen obendrauf, sie
                    ersetzen Ihren Beitrag nicht.
                  </>
                ) : (
                  <>
                    Das <strong>freie Depot liegt vorn</strong>, um{' '}
                    {euro(vergleich.frei.nettoMonat - vergleich.gefoerdert.nettoMonat)} im Monat. Die
                    volle Besteuerung im Alter wiegt hier schwerer als Zulagen und Steuervorteil
                    zusammen.
                  </>
                )}{' '}
                Entschieden wird das an Ihrem Steuersatz im Alter, hier {prozent(netto.satz)}.
              </p>

              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                Für beide Wege sind {prozent(kosten)} Kosten angesetzt. In der Praxis kosten
                geförderte Produkte oft mehr als ein schlichter ETF-Sparplan — rechnen Sie das
                links durch, indem Sie die Kosten verändern.
              </p>
            </>
          )}
        </section>

        </div>
        </div>

        {/* --- Einordnung ---
            Ueber die volle Breite: erklaerender Text, kein Ergebnis. Er
            braucht keine Spalte neben den Eingaben. */}
        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Was Sie wissen sollten
          </h2>
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

          <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
            <strong>Zum Steuervorteil:</strong> Absetzbar sind Eigenbeiträge bis{' '}
            {euro(a.hoechstbetragEigenbeitrag)} im Jahr <em>zuzüglich</em> Ihres Zulagenanspruchs — für
            Alleinstehende ohne Kinder also {euro(a.hoechstbetragEigenbeitrag + 540)}. Das Finanzamt
            prüft von Amts wegen, ob der Abzug günstiger ist als die Zulage; wirksam wird davon nur,
            was über die Zulagen hinausgeht.
          </p>
        </section>

        <p className="mt-6 text-center text-xs leading-relaxed text-slate-500">
          Modellrechnung ohne Gewähr. Keine Steuer-, Renten- oder Anlageberatung. Rechtsstand des
          am 8. Mai 2026 verabschiedeten Gesetzes, Anwendung ab 1. Januar 2027. Die Berechnung läuft
          vollständig in Ihrem Browser — Ihre Eingaben verlassen dieses Gerät nicht.
        </p>
      </main>
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
