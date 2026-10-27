import { useMemo, useState, type ReactNode } from 'react';
import {
  CalendarClock, Eraser, Gift, Info, LineChart, Mail, Printer,
} from 'lucide-react';
import {
  avdZulagen, avdAnsparphase, avdSteuervorteil, avdProfitabilitaet,
  parameterFuer, regelaltersrentenbeginn, parseDatum, toDe, bruttoZuNetto,
  type AvdKind,
} from '@renten/engine';
import { SeitenKopf } from '../components/SeitenKopf';
import { RechtsLinks } from '../components/RechtsLinks';
import {
  ZahlFeld, ProzentFeld, DatumFeld, Schalter, AkkordeonKarte, GegenueberZeile, NamenFelder,
  euro, euroGenau, prozent,
} from '../components/Feld';
import { AnteilsRing } from '../components/AnteilsRing';
import { KinderZeilen, KinderHinweis } from '../components/KinderFelder';
import {
  EINLEITUNG, FELD_LABEL, Hervor, Hinweis, KNOPF, KNOPF_KLEIN, Karte, Kernsatz, LINK, Regler, Titel, Vermerk, Zahl,
} from '../components/stil';
import { vollerName, type NamensTeile } from '../lib/namen';
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
  /**
   * Der Name — freiwillig, fuer den Ausdruck und die Beratungsanfrage. Er
   * bleibt wie alles hier nur im Speicher der Seite und hebt das Beispiel
   * nicht auf: Es geht um die Zahlen.
   */
  const [name, setName] = useState<NamensTeile>({ vorname: '', nachname: '' });
  const ganzerName = vollerName(name);
  /** Den Beitrag genau eintippen — fuer Betraege zwischen den Stufen des Reglers oder darueber. */
  const [genau, setGenau] = useState(false);
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
    setName({ vorname: '', nachname: '' });
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

  /**
   * Ein Monat eines laufenden Jahres — fuer den Ring: Was der Beitrag netto
   * kostet, was davon die Steuer traegt und was der Staat dazulegt. Zusammen
   * fliesst das ins Depot; geteilt durch die Netto-Kosten ist es der Hebel
   * auf jeden Euro, wie „Je Euro Netto-Aufwand“ im Loesungsvergleich des
   * Rechners. Ohne den einmaligen Berufseinsteigerbonus: Er bliese den Hebel
   * auf und steht ohnehin unter „Ihre Förderung je Jahr“.
   */
  const monat = useMemo(() => {
    if (beitragMonat <= 0) return null;
    const zulage = zulagen.dauerhaft / 12;
    const steuer = bruttoJahr > 0
      ? avdSteuervorteil({ eigenbeitragJahr: beitragMonat * 12, zulagenJahr: zulagen.dauerhaft, zveHeute }, steuerOpt, p).ueberZulagen / 12
      : 0;
    const netto = Math.max(0, beitragMonat - steuer);
    const depot = beitragMonat + zulage;
    return { netto, steuer, zulage, depot, hebel: netto > 0 ? depot / netto : 0 };
  }, [beitragMonat, zulagen.dauerhaft, bruttoJahr, zveHeute, steuerOpt, p]);
  const zahl2 = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
    <div className="min-h-screen bg-ui-flaeche text-ui-tinte print:min-h-0 print:bg-white">
      <SeitenKopf />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        {/* Der Titel als Aussage wie in der Beratung; im Druck so gross wie bisher. */}
        <Titel gross klasse="print:text-3xl">
          Altersvorsorgedepot: Was Ihnen der Staat ab 2027 <Hervor>dazugibt</Hervor>
        </Titel>
        {/* Im Druck steht, fuer wen gerechnet wurde — wie „für …“ auf dem Deckblatt des Gutachtens. */}
        {ganzerName && <p className="mt-2 hidden text-lg text-ui-tinte print:block">für {ganzerName}</p>}
        {/* Drei kurze Punkte statt eines Absatzes: Wer die Seite ueber einen
            QR-Code auf dem Telefon oeffnet, ueberspringt einen Textblock — drei
            Zeilen mit Symbol liest er. */}
        {/* Im Druck entfallen die drei Werbepunkte: Das Blatt ist ein
            Ergebnis, keine Landingpage. */}
        <div className="mt-6 grid gap-3 sm:grid-cols-3 print:hidden">
          <Punkt
            symbol={<CalendarClock className="h-5 w-5" aria-hidden />}
            titel={`Ab ${a.abJahr}`}
            text="Das Altersvorsorgedepot löst die Riester-Rente ab. Gesetz beschlossen, Start am 1. Januar."
          />
          <Punkt
            symbol={<Gift className="h-5 w-5" aria-hidden />}
            titel={`Bis zu ${euro(540)} im Jahr geschenkt`}
            text={`Der Staat legt auf Ihren Beitrag drauf — mit Kindern ${euro(a.kinderzulage)} je Kind zusätzlich.`}
          />
          <Punkt
            symbol={<LineChart className="h-5 w-5" aria-hidden />}
            titel="Sie sparen in ETFs"
            text="Keine Beitragsgarantie — dafür die Rendite des Kapitalmarkts."
          />
        </div>

        <p className={`mt-5 ${EINLEITUNG} print:hidden`}>
          Rechnen Sie hier aus, was das in Ihrem Fall bedeutet.
        </p>

        {/*
          DIE ANGABEN FUER DAS PAPIER. Die Eingabespalte besteht aus
          Formularfeldern, Schnellwahlknoepfen und Hilfetexten — gedruckt
          ergaebe das Kaesten und Knoepfe ohne Sinn. Stattdessen stehen die
          Werte hier als Text, und die Eingabespalte entfaellt im Druck.
        */}
        <section className="mt-4 hidden break-inside-avoid rounded-[10px] border border-ui-linie p-3 print:block">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-medium text-ui-tinte">Ihre Angaben</h2>
            <span className="text-xs text-ui-schiefer">
              {istBeispiel ? 'Beispielwerte · ' : ''}Erstellt am {new Date().toLocaleDateString('de-DE')}
            </span>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-8 gap-y-1 text-xs">
            <DruckAngabe feld="Beitrag monatlich" wert={euro(beitragMonat)} />
            <DruckAngabe
              feld="Geburtsdatum"
              wert={geburt ? `${toDe(geburt)}${rentenbeginn ? ` · Rente ab ${String(rentenbeginn.monat).padStart(2, '0')}/${rentenbeginn.jahr}` : ''}` : '—'}
            />
            <DruckAngabe
              feld="Kinder mit Kindergeldanspruch"
              wert={kinder > 0
                ? `${kinder} (geboren ${kinderListe.map((k) => k.geburtsjahr).join(', ')})`
                : 'keine'}
            />
            <DruckAngabe feld="Bruttoeinkommen im Jahr" wert={bruttoJahr > 0 ? euro(bruttoJahr) : '—'} />
            <DruckAngabe feld="Familienstand" wert={verheiratet ? 'verheiratet (Splittingtarif)' : 'ledig'} />
            <DruckAngabe
              feld="Rendite / Effektivkosten p. a."
              wert={`${prozent(rendite)} / ${prozent(KOSTEN)}`}
            />
          </dl>
        </section>

        {/* Angaben links, Wirkung rechts: so sieht man beim Tippen sofort, was
            sich aendert. Die linke Spalte bleibt beim Scrollen stehen; auf
            schmalen Geraeten stapelt das Raster wie bisher. */}
        {/* Im Druck kein Raster: Chrome bricht Rasterzellen nur ungern um
            und schob jeden Abschnitt auf ein eigenes Blatt. */}
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6 print:mt-4 print:block">
        <div className="space-y-4 lg:col-span-5 lg:sticky lg:top-4 lg:self-start print:hidden">

        {/* --- Rechner ---
            Eingabe und Ergebnis sollen sich auf den ersten Blick unterscheiden:
            die Eingabespalte steht auf getoentem Grund mit kraeftigem Rand, die
            Ergebnisse rechts auf weissen Karten. */}
        {/* Die Angaben auf einer weissen Karte wie die Berechnungsgrundlagen der Beratung; das Beispiel steht als Hinweis darin. */}
        <Karte titel="Ihre Angaben" rechts={istBeispiel ? <Vermerk>Beispiel</Vermerk> : undefined} klasse="print:hidden">
          {istBeispiel && (
            <Hinweis klasse="mb-5">
              Vorbelegt mit einem Beispiel, damit Sie gleich sehen, worum es geht.
              Tragen Sie einfach Ihre eigenen Zahlen ein.
            </Hinweis>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <div className="grid grid-cols-2 gap-3 sm:col-span-2 lg:col-span-1">
              <NamenFelder vorname={name.vorname} nachname={name.nachname} onChange={setName}
                platzhalter={['Max', 'Mustermann']} eigener />
              <p className="col-span-2 -mt-1 text-xs leading-relaxed text-ui-schiefer">
                Freiwillig — für den Ausdruck. Die Seite speichert nichts.
              </p>
            </div>

            {/*
              Der Beitrag am Regler in 10-€-Schritten wie der Regler der
              Beratung — bis zur vollen Foerderung; darueber kommt keine Zulage
              mehr dazu. Was dazwischen oder darueber liegt (25 € fuer die volle
              Kinderzulage, 200 €), laesst sich genau eintippen.
            */}
            <div className="sm:col-span-2 lg:col-span-1">
              <p className={FELD_LABEL}>Beitrag monatlich</p>
              <p className="flex flex-wrap items-baseline gap-x-2 tabular-nums">
                <span className="ui-titel text-[40px] font-normal leading-none text-ui-tinte">{euro(beitragMonat)}</span>
                <span className="text-sm text-ui-schiefer">im Monat · {euro(beitragMonat * 12)} im Jahr</span>
              </p>
              <Regler
                wert={beitragMonat} max={a.stufe2Grenze / 12} schritt={10} onChange={eigen(setBeitragMonat)}
                beschriftung="Beitrag im Monat" wertText={`${beitragMonat} Euro im Monat`} klasse="mt-4"
              />
              <div className="mt-1 flex justify-between text-xs tabular-nums text-ui-schiefer">
                <span>{euro(0)}</span><span>{euro(a.stufe2Grenze / 12)} · volle Förderung</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-ui-schiefer">
                Ab 10 € im Monat gibt es Zulagen, ab 150 € die volle Grundzulage.
              </p>
              <button type="button" onClick={() => setGenau((x) => !x)} aria-expanded={genau} className={`${LINK} mt-2`}>
                {genau ? 'Genaue Eingabe ausblenden' : 'Betrag genau eingeben'}
              </button>
              {genau && (
                <div className="mt-2">
                  <ZahlFeld label="Beitrag monatlich, genau" wert={beitragMonat} onChange={eigen(setBeitragMonat)} einheit="€" />
                </div>
              )}
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
                <div className="ui-innen mt-2 p-3">
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
              <ZahlFeld label="Bruttoeinkommen im Jahr" wert={bruttoJahr} onChange={eigen(setBruttoJahr)} einheit="€"
                hilfe="Ihr eigenes Brutto. Es entscheidet nur über die Steuerersparnis — die Zulagen hängen allein vom Beitrag ab." />
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
              <div className="ui-innen mt-2 flex items-baseline justify-between gap-3 px-3 py-2">
                <span className="text-xs font-medium text-ui-schiefer">Effektivkosten p. a.</span>
                <span className="text-sm font-medium tabular-nums text-ui-tinte">{prozent(KOSTEN)}</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-ui-schiefer">
                Fest angesetzt: Fondskosten, Depotführung und Produktkosten zusammen.
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-ui-linie pt-5">
            <button type="button" onClick={() => setBeratungOffen(true)} className={`${KNOPF} flex-1`}>
              <Mail className="h-4 w-4" aria-hidden /> Beratung gewünscht
            </button>
            {/* Der Browser-Druck genuegt: Die Eingabespalte ist im Druck
                durch eine Textfassung ersetzt, Knoepfe und Dialoge
                entfallen, der Rest steht untereinander. */}
            <button type="button" onClick={() => window.print()} className={KNOPF_KLEIN}>
              <Printer className="h-3.5 w-3.5" aria-hidden /> Ergebnis drucken
            </button>
            <button type="button" onClick={leeren} className={KNOPF_KLEIN}>
              <Eraser className="h-3.5 w-3.5" aria-hidden /> Felder leeren
            </button>
          </div>
        </Karte>
        </div>

        <div className="space-y-4 lg:col-span-7">

        {/* --- Profitabilitaet --- */}
        <section className={`break-inside-avoid ${KARTE}`}>
          <h2 className={KARTE_TITEL}>Was es kostet, was es bringt</h2>

          {!profit ? (
            <p className={`mt-4 ${LEER} py-8`}>
              Tragen Sie links Beitrag, Geburtsdatum und Bruttoeinkommen ein — dann steht hier,
              was der Vertrag Sie netto kostet und was netto herauskommt.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              {/*
                Im Druck stehen Ring und Belastung nebeneinander: untereinander
                passte die Karte nicht mehr auf das erste Blatt und zog alles
                Folgende eine Seite weiter.
              */}
              <div className="space-y-4 print:grid print:grid-cols-2 print:items-start print:gap-4 print:space-y-0">
              {/*
                Der Monat als Ring wie die Versorgungsluecke: links der Ring mit
                dem Hebel, rechts die drei Teile. Im Druck ist neben der
                Belastung nur eine halbe Breite frei — dort stehen die Teile als
                kleine Aufstellung unter dem Ring, wie die Belastung daneben.
              */}
              {monat && (
                <div className="break-inside-avoid print:pt-3">
                  <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-center print:flex-col print:gap-3">
                    <h3 className="hidden w-full text-sm font-medium text-ui-tinte print:block">Jeden Monat</h3>
                    <AnteilsRing
                      teile={[
                        { wert: monat.netto, rolle: 'tinte' },
                        { wert: monat.steuer, rolle: 'daten-3' },
                        { wert: monat.zulage, rolle: 'knopf' },
                      ]}
                      mitte={`${zahl2(monat.hebel)} ×`}
                      zeilen={['Hebel auf', 'jeden Euro']}
                      beschreibung={`Im Monat fließen ${euroGenau(monat.depot)} ins Depot: ${euroGenau(monat.netto)} Netto-Kosten, `
                        + `${euroGenau(monat.steuer)} Steuerersparnis und ${euroGenau(monat.zulage)} Zulagen — `
                        + `${zahl2(monat.hebel)}-facher Hebel auf jeden Euro, den Sie netto zahlen`}
                      klasse="print:h-40 print:w-40"
                    />
                    <div className="print:hidden">
                      <dl className="space-y-4">
                        <Zahl etikett="Netto-Kosten" punkt={PUNKT.eigen} wert={euroGenau(monat.netto)} zusatz="im Monat" />
                        <Zahl etikett="Steuerersparnis" punkt={PUNKT.steuer}
                          wert={bruttoJahr > 0 ? euroGenau(monat.steuer) : '—'}
                          zusatz={bruttoJahr > 0 ? 'im Monat' : 'ohne Einkommen nicht gerechnet'} />
                        <Zahl etikett="Zulagen" punkt={PUNKT.zulagen} wert={euroGenau(monat.zulage)} zusatz="im Monat" />
                      </dl>
                      <p className="mt-4 text-sm text-ui-tinte">
                        = <span className="font-medium tabular-nums">{euroGenau(monat.depot)}</span> fließen jeden Monat ins Depot.
                      </p>
                    </div>
                    <dl className="hidden w-full space-y-1.5 print:block">
                      <RingZeile punkt={PUNKT.eigen} text="Netto-Kosten" wert={euroGenau(monat.netto)} />
                      <RingZeile punkt={PUNKT.steuer} text="Steuerersparnis" wert={bruttoJahr > 0 ? euroGenau(monat.steuer) : '—'} />
                      <RingZeile punkt={PUNKT.zulagen} text="Zulagen" wert={euroGenau(monat.zulage)} />
                      <div className="!mt-2 border-t border-ui-linie pt-2">
                        <RingZeile text="= fließt ins Depot" wert={euroGenau(monat.depot)} />
                      </div>
                    </dl>
                  </div>
                  {zulagen.bonus > 0 && (
                    <p className="mt-3 text-xs leading-relaxed text-ui-schiefer">
                      Ein laufendes Jahr — ohne den einmaligen Berufseinsteigerbonus von {euro(zulagen.bonus)}.
                    </p>
                  )}
                </div>
              )}

              <div className="ui-innen p-4 print:p-3">
                <h3 className="mb-2 text-sm font-medium text-ui-tinte">
                  Ihre Belastung (Ansparphase)
                </h3>
                <div className="space-y-1.5">
                  <GegenueberZeile
                    text={`Ihre Eigenbeiträge über ${jahreBisRente} Jahre — bis Alter ${alterBeiRente}`}
                    wert={euro(profit.eigenbeitraegeGesamt)} />
                  <GegenueberZeile text="+ Zulagen vom Staat"
                    wert={euro(profit.zulagenGesamt)} />
                  <div className="!mt-2 border-t border-ui-linie pt-2">
                    <GegenueberZeile text="= fließt ins Depot"
                      wert={euro(profit.zuflussInsDepotGesamt)} />
                  </div>
                  {profit.steuerersparnisGesamt > 0 && (
                    <GegenueberZeile text="− Steuerersparnis"
                      wert={euro(profit.steuerersparnisGesamt)} />
                  )}
                </div>
                {/* Die Summe unter einer Linie in Tinte, wie in den Aufstellungen der Beratung. */}
                <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-ui-tinte pt-2">
                  <span className="text-sm font-medium text-ui-tinte">Kostet Sie wirklich</span>
                  <span className="text-xl font-medium tabular-nums text-ui-tinte">
                    {euro(profit.eigenaufwandNettoGesamt)}
                  </span>
                </div>
                {/* Was das im Monat heisst, zeigt der Ring darueber. */}
                <p className="mt-1 text-xs leading-relaxed text-ui-schiefer">
                  Die Zulagen mindern Ihre Kosten nicht — sie kommen vom Staat und stehen als
                  höheres Kapital auf der anderen Seite.
                </p>
              </div>
              </div>

              {/*
                Das Kapital als Akzent — die eine Zahl der Seite, wie „In Ihre
                Vorsorge“ in der Beratung. In der grossen Fassung: Sie misst auch
                am Telefon 26 Punkt und gilt damit als grosse Schrift — Cyan auf
                Sky Wash erreicht 4,2:1, genug ab 24 Punkt, zu wenig darunter.
              */}
              <Kernsatz gross etikett="Ihr Kapital zum Rentenbeginn" klasse="print:p-4">
                Angespart bis {rentenbeginn!.jahr}:{' '}
                <span className="whitespace-nowrap tabular-nums"><Hervor>{euro(profit.endkapital)}</Hervor></span>
              </Kernsatz>

              {profit.hinweise.map((h) => <Hinweis key={h}>{h}</Hinweis>)}

              <p className="text-xs leading-relaxed text-ui-schiefer">
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
        <section className={`break-inside-avoid ${KARTE}`}>
          <h2 className={KARTE_TITEL}>Ihre Förderung je Jahr</h2>

          {beitragMonat <= 0 ? (
            <p className={`mt-4 ${LEER}`}>
              Tragen Sie links einen monatlichen Beitrag ein.
            </p>
          ) : (
            <>
              <dl className="mt-3 divide-y divide-ui-linie">
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
                <Summe text="Zulagen jedes Jahr" wert={euro(zulagen.dauerhaft)} />
              </dl>

              {/* Der Bonus steht BEWUSST unter dem Jahresbetrag und nicht darin:
                  Er faellt einmal an. In die Jahressumme gerechnet verspraeche
                  er fuer die ganze Laufzeit eine Foerderung, die es nur im
                  ersten Jahr gibt. */}
              {zulagen.bonus > 0 && (
                <div className="ui-innen mt-3 flex items-baseline justify-between gap-4 px-3 py-2">
                  <span className="text-xs text-ui-schiefer">
                    Dazu <span className="font-medium text-ui-tinte">einmalig im ersten Jahr</span>: Berufseinsteigerbonus
                    (unter {a.berufseinsteigerAlterMax})
                  </span>
                  <span className="shrink-0 text-sm font-medium tabular-nums text-ui-tinte">
                    {euro(zulagen.bonus)}
                  </span>
                </div>
              )}

              {/* Die Foerderquote als Satz in Tinte — statt eines gruenen Kastens. */}
              <p className="mt-4 text-base leading-relaxed text-ui-tinte">
                Auf {euro(beitragMonat * 12)} eigenen Beitrag kommen jedes Jahr{' '}
                {euro(zulagen.dauerhaft)} vom Staat — das sind{' '}
                <span className="font-medium">{prozent(zulagen.foerderquoteDauerhaft)}</span> obendrauf.
                {zulagen.bonus > 0 && (
                  <> Im ersten Jahr einmalig {euro(zulagen.bonus)} mehr.</>
                )}
              </p>

              {zulagen.hinweise.map((h) => <Hinweis key={h} klasse="mt-3">{h}</Hinweis>)}

              {/* Sonderausgabenabzug: wirkt nur, soweit er die Zulagen uebersteigt. */}
              <div className="mt-5 border-t border-ui-linie pt-5">
                <h3 className="text-base font-medium text-ui-tinte">
                  Dazu der Steuervorteil
                </h3>
                {bruttoJahr <= 0 ? (
                  <p className="mt-2 text-sm text-ui-schiefer">
                    Tragen Sie links Ihr Bruttoeinkommen ein — ob der Sonderausgabenabzug über die
                    Zulagen hinaus etwas bringt, hängt an Ihrem Steuersatz.
                  </p>
                ) : steuervorteil.ueberZulagen <= 0 ? (
                  // Ohne Wirkung braucht es keine vierzeilige Herleitung, die
                  // am Ende null ergibt. Ein Satz sagt dasselbe.
                  <p className="mt-2 text-sm leading-relaxed text-ui-schiefer">
                    Bei Ihrem Einkommen bringt der Steuerabzug <span className="font-medium text-ui-tinte">nichts über die Zulagen
                    hinaus</span> — die Zulage ist der günstigere Weg, und genau den wendet das
                    Finanzamt automatisch an. Ihre {euro(beitragMonat * 12)} Beitrag kosten Sie
                    damit auch nach Steuern {euro(steuervorteil.eigenaufwandNetto)} im Jahr.
                  </p>
                ) : (
                  <>
                    <dl className="mt-2 divide-y divide-ui-linie">
                      <Zeile text={`Absetzbar (Beitrag bis ${euro(a.hoechstbetragEigenbeitrag)} plus Zulagen)`}
                        wert={euro(steuervorteil.abzugsfaehig)} />
                      <Zeile text="Steuerersparnis daraus" wert={euro(steuervorteil.steuerersparnis)} />
                      <Zeile text="− bereits gewährte Zulagen" wert={`− ${euro(zulagen.gesamt)}`} />
                      <Summe text="Zusätzlich über die Zulagen hinaus" wert={euro(steuervorteil.ueberZulagen)} />
                    </dl>
                    <p className="mt-2 text-xs leading-relaxed text-ui-schiefer [&_strong]:font-medium [&_strong]:text-ui-tinte">
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
        <section className={`break-inside-avoid ${KARTE}`}>
          <h2 className={KARTE_TITEL}>Bis zu Ihrem Rentenbeginn</h2>

          {!geburt ? (
            <p className={`mt-4 ${LEER}`}>
              Tragen Sie links Ihr Geburtsdatum ein — daraus ergibt sich Ihr Rentenbeginn.
            </p>
          ) : !lauf ? (
            <p className={`mt-4 ${LEER}`}>
              Tragen Sie links einen monatlichen Beitrag ein.
            </p>
          ) : (
            <>
              <p className="mt-2 text-sm leading-relaxed text-ui-schiefer [&_strong]:font-medium [&_strong]:text-ui-tinte">
                Regelaltersgrenze <strong>{alterBeiRente}</strong>, Rentenbeginn also{' '}
                <strong>{String(rentenbeginn!.monat).padStart(2, '0')}/{rentenbeginn!.jahr}</strong>.
                Gerechnet ab {startjahr}, das sind {jahreBisRente} Beitragsjahre.
              </p>

              {/* Das Kapital selbst steht schon oben — hier nur, woraus es
                  besteht. Zweimal dieselbe Zahl macht die Seite laenger, nicht
                  klarer. */}
              {/* Die drei Teile mit dem Punkt ihrer Flaeche im Diagramm darunter — wie die Legende der Beratung. */}
              <dl className="mt-4 grid gap-4 sm:grid-cols-3">
                <Zahl etikett="Ihre Eigenbeiträge" punkt={PUNKT.eigen} wert={euro(lauf.eigenbeitraege)} />
                <Zahl etikett="Zulagen vom Staat" punkt={PUNKT.zulagen} wert={euro(lauf.zulagenGesamt)} />
                <Zahl
                  etikett="Kursgewinne" punkt={PUNKT.gewinn}
                  wert={euro(Math.max(0, lauf.endkapital - lauf.eigenbeitraege - lauf.zulagenGesamt))}
                />
              </dl>

              {lauf.hinweise.map((h) => <Hinweis key={h} klasse="mt-3">{h}</Hinweis>)}

              <div className="mt-5 border-t border-ui-linie pt-5">
                <KapitalaufbauDiagramm
                  verlauf={lauf.verlauf}
                  steuerersparnisKumuliert={profit?.steuerersparnisKumuliert}
                />
              </div>

              <p className="mt-4 text-xs leading-relaxed text-ui-schiefer">
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
          symbol={<Info className="h-4 w-4 text-ui-schiefer" aria-hidden />}
          offen={wissenOffen}
          onUmschalten={() => setWissenOffen((v) => !v)}
          klasse="mt-4"
        >
          <ul className="space-y-2 text-sm leading-relaxed text-ui-tinte [&_strong]:font-medium">
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

          <p className="ui-innen mt-4 px-3 py-2 text-xs leading-relaxed text-ui-schiefer [&_strong]:font-medium [&_strong]:text-ui-tinte">
            <strong>Zum Sparerpauschbetrag:</strong> Er gilt hier <em>nicht</em>. Die Auszahlung ist
            eine sonstige Einkunft nach § 22 Nr. 5 EStG, kein Kapitalertrag — anders als beim freien
            Depot, wo er sehr wohl greift. Der Werbungskosten-Pauschbetrag von 102 € gilt dagegen
            schon; diese Rechnung setzt ihn bei der gesetzlichen Rente an. Wer keine gesetzliche
            Rente bezieht, steht hier deshalb um rund 30 € Steuer im Jahr zu ungünstig da.
          </p>

          <p className="ui-innen mt-3 px-3 py-2 text-xs leading-relaxed text-ui-schiefer [&_strong]:font-medium [&_strong]:text-ui-tinte">
            <strong>Zum Steuervorteil:</strong> Absetzbar sind Eigenbeiträge bis{' '}
            {euro(a.hoechstbetragEigenbeitrag)} im Jahr <em>zuzüglich</em> Ihres Zulagenanspruchs — für
            Alleinstehende ohne Kinder also {euro(a.hoechstbetragEigenbeitrag + 540)}. Das Finanzamt
            prüft von Amts wegen, ob der Abzug günstiger ist als die Zulage; wirksam wird davon nur,
            was über die Zulagen hinausgeht.
          </p>
        </AkkordeonKarte>

        <p className="mt-6 text-center text-xs leading-relaxed text-ui-schiefer">
          Modellrechnung ohne Gewähr. Keine Steuer-, Renten- oder Anlageberatung. Rechtsstand des
          am 8. Mai 2026 verabschiedeten Gesetzes, Anwendung ab 1. Januar 2027. Die Berechnung läuft
          vollständig in Ihrem Browser — Ihre Eingaben verlassen dieses Gerät nicht.
        </p>
        <RechtsLinks klasse="mt-4" />
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
        name={name}
        onName={setName}
      />
    </div>
  );
}

/** Karten der Ergebnisspalte — wie die Karten der Beratung, im Druck enger und ohne Schatten. */
const KARTE = 'ui-karte p-5 sm:p-7 print:p-3 print:shadow-none';
const KARTE_TITEL = 'text-lg font-medium tracking-[-0.01em] text-ui-tinte sm:text-xl';
/** Was steht, solange eine Angabe fehlt. */
const LEER = 'rounded-[10px] border border-dashed border-ui-feld-rand px-4 py-6 text-center text-sm text-ui-schiefer';
/** Die Punkte der Flaechen — dieselben Farben wie im Diagramm (Diagramme.tsx); Asche fuer die Steuerersparnis im Ring. */
const PUNKT = { eigen: 'bg-ui-tinte', steuer: 'bg-ui-daten-3', zulagen: 'bg-ui-knopf', gewinn: 'bg-ui-luecke' } as const;

function DruckAngabe({ feld, wert }: { feld: string; wert: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dotted border-ui-linie py-0.5">
      <dt className="text-ui-schiefer">{feld}</dt>
      <dd className="text-right font-medium tabular-nums text-ui-tinte">{wert}</dd>
    </div>
  );
}

/** Eine Zeile der Ring-Legende im Druck: Farbpunkt wie im Ring, so klein wie die Belastung daneben. */
function RingZeile({ punkt, text, wert }: { punkt?: string; text: string; wert: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <dt className="flex items-center gap-2 text-ui-tinte/80">
        {punkt && <span aria-hidden className={`h-2 w-2 rounded-full ${punkt}`} />}{text}
      </dt>
      <dd className="shrink-0 font-medium tabular-nums text-ui-tinte">{wert}</dd>
    </div>
  );
}

/** Eine Zeile einer Aufstellung: Text leise, Betrag in Tinte. */
function Zeile({ text, wert }: { text: string; wert: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-sm text-ui-schiefer">{text}</dt>
      <dd className="shrink-0 text-sm font-medium tabular-nums text-ui-tinte">{wert}</dd>
    </div>
  );
}

/** Die Summe einer Aufstellung — unter einer Linie in Tinte, wie in der Beratung. */
function Summe({ text, wert }: { text: string; wert: string }) {
  return (
    <div className="!border-t-ui-tinte flex items-baseline justify-between gap-4 pt-3">
      <dt className="text-sm font-medium text-ui-tinte">{text}</dt>
      <dd className="text-xl font-medium tabular-nums text-ui-tinte">{wert}</dd>
    </div>
  );
}

/** Einer der drei Punkte am Anfang — wie die Karten am Anfang des Rechners: Symbol in der Innenflaeche, ohne Farbe. */
function Punkt({ symbol, titel, text }: { symbol: ReactNode; titel: string; text: string }) {
  return (
    <div className="ui-karte flex gap-3 p-4">
      <span className="ui-innen flex h-10 w-10 shrink-0 items-center justify-center text-ui-tinte">{symbol}</span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ui-tinte">{titel}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-ui-schiefer">{text}</span>
      </span>
    </div>
  );
}
