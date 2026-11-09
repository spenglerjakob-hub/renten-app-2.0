import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Baby, CalendarClock, Gift, Info as InfoSymbol, Mail, PiggyBank, Printer, RotateCcw,
} from 'lucide-react';
import {
  avdZulagen, avdAnsparphase, avdSteuervorteil, avdProfitabilitaet,
  parameterFuer, bruttoZuNetto,
} from '@renten/engine';
import { SeitenKopf } from '../components/SeitenKopf';
import { AnspracheGeben } from '../components/Ansprache';
import type { Ansprache } from '../lib/ansprache';
import { RechtsLinks } from '../components/RechtsLinks';
import {
  ZahlFeld, ProzentFeld, DatumFeld, Schalter, AkkordeonKarte, GegenueberZeile, NamenFelder,
  euro, euroGenau, prozent,
} from '../components/Feld';
import { AnteilsRing } from '../components/AnteilsRing';
import {
  FELD_LABEL, Hervor, Hinweis, KNOPF, KNOPF_KLEIN, Kernsatz, LINK, Regler, Titel, Zahl,
} from '../components/stil';
import { vollerName, type NamensTeile } from '../lib/namen';
import { KapitalaufbauDiagramm } from './Diagramme';
import { BeratungDialog, type Eckdaten } from './Beratung';
import { Schritt, ruhig } from './Schritt';
import { KinderGeburtsdaten, kinderFuerRechnung, type KindEingabe } from './KinderGeburtsdaten';
import { depotZeitraum, zulagenBisRente } from './zulagen-bis-rente';

/** Feste Effektivkosten. Bewusst nicht einstellbar — siehe Hinweis auf der Seite. */
const KOSTEN = 0.01;

/** Wohin die Beratungsanfrage geht. */
const BERATER_MAIL = 'karkossa@axa.de';

/**
 * DIE ANNAHMEN, mit denen die Seite rechnet, bis der Besucher sie aendert:
 * der Beitrag der vollen Foerderung (150 € im Monat) und 6 % Rendite im Jahr.
 * Sie stehen sichtbar als Annahme da — anders als frueher die Beispielwerte,
 * die so taten, als waeren es die Angaben des Besuchers.
 */
const VORGABE = { beitragMonat: 150, rendite: 0.06 } as const;

/**
 * Pausen zwischen Info und naechster Frage, in Millisekunden. Erst steht die
 * Antwort da, dann kommt die Frage — nicht beides im selben Augenblick. Mit
 * „Bewegung reduzieren“ entfallen sie.
 */
const PAUSE = { nachDatum: 700, nachKindern: 500, nachGehalt: 700, gehaltRuhig: 600, gehaltHinweis: 1500 } as const;
/**
 * Ab hier ist ein Jahresgehalt „fertig getippt“: fuenfstellig. Darunter
 * wartet die Seite, bis das Feld verlassen oder mit Enter bestaetigt wird —
 * sonst rechnete sie schon bei „4“, „45“ und „4.500“.
 */
const GEHALT_AB = 10_000;

/** Die Seite duzt — auch in den geteilten Bausteinen, etwa im Spruch der Kopfzeile. */
const DU: Ansprache = { form: 'du', mehrere: false, name: '' };

/**
 * Landingpage zum Altersvorsorgedepot.
 *
 * Steht bewusst UNABHAENGIG vom Rentenplaner: Sie kommt per QR-Code aus einem
 * Brief, richtet sich an Endverbraucher und beantwortet genau eine Frage —
 * was zahle ich ein, was kostet es mich wirklich, welches Kapital kommt dabei
 * heraus. Kein Verweis in den Rechner und keiner zurueck.
 *
 * GEFUEHRT, STUECK FUER STUECK: Am Anfang steht nur eine Frage — das
 * Geburtsdatum. Jede Antwort bringt eine kurze Info (was das an Zulagen
 * bedeutet) und dann die naechste Frage: Kinder, Gehalt, zum Schluss Regler
 * und Diagramm. Jeder Block blendet weich ein (`Schritt.tsx`); beantwortete
 * Schritte bleiben stehen und lassen sich aendern, alles darunter rechnet
 * sofort neu. Die Seite duzt, wie der Rechner.
 *
 * Gespeichert wird nichts — auch kein Geburtsdatum im Browser: Auf einem
 * geteilten Geraet waere das eine unangenehme Ueberraschung.
 */
export function Seite() {
  const jetzt = new Date().getFullYear();
  const p = useMemo(() => parameterFuer(Math.max(jetzt, 2027), { indexRate: 0.01 }), [jetzt]);
  const a = p.avd;

  const [geburtsdatum, setGeburtsdatum] = useState('');
  const [kinderAntwort, setKinderAntwort] = useState<'ja' | 'nein' | null>(null);
  const [kinderEingabe, setKinderEingabe] = useState<KindEingabe[]>([]);
  const [bruttoJahr, setBruttoJahr] = useState(0);
  const [ohneSteuer, setOhneSteuer] = useState(false);
  const [verheiratet, setVerheiratet] = useState(false);
  const [beitragMonat, setBeitragMonat] = useState<number>(VORGABE.beitragMonat);
  const [rendite, setRendite] = useState<number>(VORGABE.rendite);
  const [renditeOffen, setRenditeOffen] = useState(false);
  /** Den Beitrag genau eintippen — fuer Betraege zwischen den Stufen des Reglers oder darueber. */
  const [genau, setGenau] = useState(false);
  /**
   * Der Name — freiwillig, fuer den Ausdruck und die Beratungsanfrage. Er
   * bleibt wie alles hier nur im Speicher der Seite.
   */
  const [name, setName] = useState<NamensTeile>({ vorname: '', nachname: '' });
  const ganzerName = vollerName(name);
  const [wissenOffen, setWissenOffen] = useState(false);
  const [beratungOffen, setBeratungOffen] = useState(false);

  const zeitraum = useMemo(() => depotZeitraum(geburtsdatum, p, jetzt), [geburtsdatum, p, jetzt]);
  const kinderListe = useMemo(
    () => (kinderAntwort === 'ja' ? kinderFuerRechnung(kinderEingabe) : []),
    [kinderAntwort, kinderEingabe],
  );
  const kinder = kinderListe.length;
  const bisZu = useMemo(
    () => (zeitraum && !zeitraum.zuSpaet ? zulagenBisRente(zeitraum, kinderListe, p) : null),
    [zeitraum, kinderListe, p],
  );

  /*
    DAS GEHALT, MIT DEM GERECHNET WIRD. `bruttoJahr` ist, was im Feld steht;
    `gehalt` ist, was davon uebernommen wurde — erst das geht in die Rechnung,
    in die Steuerinfo und in den naechsten Schritt.

    Uebernommen wird ein fuenfstelliger Betrag, sobald eine Weile nicht mehr
    getippt wurde. Ein kleinerer erst, wenn das Feld verlassen oder mit Enter
    bestaetigt wird: Beim Tippen von „45.000“ stehen sonst „4“, „45“ und
    „4.500“ im Feld, und die Info sprang zwischen „bringt nichts“ und einem
    Betrag hin und her.
  */
  const [gehalt, setGehalt] = useState(0);
  useEffect(() => {
    if (bruttoJahr === gehalt) return;
    if (bruttoJahr > 0 && bruttoJahr < GEHALT_AB) return;
    const t = window.setTimeout(() => setGehalt(bruttoJahr), ruhig() ? 0 : PAUSE.gehaltRuhig);
    return () => window.clearTimeout(t);
  }, [bruttoJahr, gehalt]);
  /** Bleibt ein Betrag unter 10.000 € stehen, erinnert ein Satz daran, dass das Jahresgehalt gefragt ist. */
  const [gehaltKlein, setGehaltKlein] = useState(false);
  useEffect(() => {
    setGehaltKlein(false);
    if (!(bruttoJahr > 0 && bruttoJahr < GEHALT_AB)) return;
    const t = window.setTimeout(() => setGehaltKlein(true), ruhig() ? 0 : PAUSE.gehaltHinweis);
    return () => window.clearTimeout(t);
  }, [bruttoJahr]);

  /*
    WIE WEIT DIE EINGABE GEKOMMEN IST. Der Wert waechst nur — was einmal
    erschienen ist, verschwindet nicht wieder, wenn eine Antwort darueber
    geaendert wird. Die naechste Frage kommt jeweils nach einer kurzen Pause.
  */
  const kinderFertig = kinderAntwort === 'nein' || (kinderAntwort === 'ja' && kinder > 0);
  const steuerFertig = ohneSteuer || gehalt > 0;
  const [erreicht, setErreicht] = useState(1);
  useEffect(() => {
    let ziel = 1;
    if (zeitraum && !zeitraum.zuSpaet) {
      ziel = 2;
      if (kinderFertig) {
        ziel = 3;
        if (steuerFertig) ziel = 4;
      }
    }
    if (ziel <= erreicht) return;
    const pause = ruhig() ? 0
      : ziel === 2 ? PAUSE.nachDatum
        : ziel === 3 ? PAUSE.nachKindern
          : ohneSteuer ? 0 : PAUSE.nachGehalt;
    const t = window.setTimeout(() => setErreicht((e) => Math.max(e, ziel)), pause);
    return () => window.clearTimeout(t);
  }, [zeitraum, kinderFertig, steuerFertig, ohneSteuer, erreicht]);
  /** Ein Schritt steht da, wenn er erreicht ist — und nur, solange das Depot nicht zu spaet kommt. */
  const offen = (n: number) => erreicht >= n && zeitraum !== null && !zeitraum.zuSpaet;

  const neuBeginnen = () => {
    setGeburtsdatum('');
    setKinderAntwort(null);
    setKinderEingabe([]);
    setBruttoJahr(0);
    setGehalt(0);
    setOhneSteuer(false);
    setVerheiratet(false);
    setBeitragMonat(VORGABE.beitragMonat);
    setRendite(VORGABE.rendite);
    setRenditeOffen(false);
    setGenau(false);
    setName({ vorname: '', nachname: '' });
    setErreicht(1);
    window.scrollTo({ top: 0, behavior: ruhig() ? 'auto' : 'smooth' });
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

  const rentenbeginn = zeitraum?.rentenbeginn ?? null;
  const alterHeute = zeitraum?.alterHeute ?? 0;
  const startjahr = zeitraum?.startjahr ?? Math.max(jetzt, a.abJahr);
  const jahreBisRente = zeitraum?.jahre ?? 0;
  const alterBeiRente = zeitraum?.alterBeiRente ?? 0;
  const rentenbeginnText = rentenbeginn ? `${String(rentenbeginn.monat).padStart(2, '0')}/${rentenbeginn.jahr}` : '';

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
    if (!zeitraum || jahreBisRente <= 0 || beitragMonat <= 0) return null;
    return avdAnsparphase(
      {
        beitragMonat, dynamik: 0, startkapital: 0, jahre: jahreBisRente,
        renditeBrutto: rendite, ter: KOSTEN,
        kinder: kinderListe, alterHeute, startjahr,
      },
      p,
    );
  }, [zeitraum, jahreBisRente, beitragMonat, rendite, kinderListe, alterHeute, startjahr, p]);

  /**
   * Zu versteuerndes Einkommen von heute — Grundlage des
   * Sonderausgabenabzugs. Wiederverwendet wird dieselbe Funktion, die auch
   * der Rechner fuer die Erwerbsphase nutzt.
   */
  const zveHeute = useMemo(() => {
    if (gehalt <= 0) return 0;
    return bruttoZuNetto(
      gehalt,
      { ...steuerOpt, kinder: { hatKinder: kinder > 0, kinderUnter25: kinder } },
      p,
    ).zve;
  }, [gehalt, kinder, steuerOpt, p]);

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
   * auf und steht ohnehin unter „Deine Förderung je Jahr“.
   */
  const monat = useMemo(() => {
    if (beitragMonat <= 0) return null;
    const zulage = zulagen.dauerhaft / 12;
    const steuer = gehalt > 0
      ? avdSteuervorteil({ eigenbeitragJahr: beitragMonat * 12, zulagenJahr: zulagen.dauerhaft, zveHeute }, steuerOpt, p).ueberZulagen / 12
      : 0;
    const netto = Math.max(0, beitragMonat - steuer);
    const depot = beitragMonat + zulage;
    return { netto, steuer, zulage, depot, hebel: netto > 0 ? depot / netto : 0 };
  }, [beitragMonat, zulagen.dauerhaft, gehalt, zveHeute, steuerOpt, p]);
  const zahl2 = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  /** Die Steuerersparnis eines laufenden Jahres ueber die Zulagen hinaus — fuer die Zwischeninfo */
  const steuerJahr = monat ? monat.steuer * 12 : 0;

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

  /** Die Geburtsdaten der Kinder, die gerechnet werden — fuer den Ausdruck. */
  const kinderDaten = kinderAntwort === 'ja'
    ? kinderEingabe.filter((k) => kinderFuerRechnung([k]).length > 0).map((k) => k.datum)
    : [];

  /*
    Die Anmerkungen zur Kostenkarte — am Bildschirm in der Karte; im Druck
    bei den Annahmen auf Seite 2, damit Seite 1 auch im laengsten Fall (zwei
    Kinder, Bonus, verheiratet) mit dem Ergebnis und der Belastung auskommt.
  */
  const kostenAnmerkungen = profit && (
    <>
      {profit.hinweise.map((h) => <Hinweis key={h} klasse="break-inside-avoid">{h}</Hinweis>)}

      <p className="text-xs leading-relaxed text-ui-schiefer">
        Die Steuerersparnis ist mit deinem heutigen Einkommen gerechnet und auf die Laufzeit
        hochgerechnet. Genauer wäre Jahr für Jahr — dafür müsste man aber eine
        Gehaltsentwicklung unterstellen, die niemand kennt.
        {verheiratet && (
          <> Bei „Verheiratet“ wird der Splittingtarif auf dein eigenes Einkommen angewandt.
          Verdient dein Partner ebenfalls, fällt die Steuerersparnis in Wirklichkeit
          kleiner aus.</>
        )}
      </p>
    </>
  );

  /*
    WAS ES KOSTET, WAS ES BRINGT — einmal gebaut, zweimal gezeigt: am
    Bildschirm unter dem Diagramm, im Druck auf Seite 1 beim Ergebnis
    („Angespart bis …“). Die Fassung am Bildschirm ist im Druck aus und
    umgekehrt, es steht also nie zweimal da.
  */
  const kostenKarte = (mitAnmerkungen: boolean) => (
    <section className={`${KARTE} print:box-decoration-clone`}>
      <h2 className={KARTE_TITEL}>Was es kostet, was es bringt</h2>

      {!profit ? (
        <p className={`mt-4 ${LEER} py-8`}>
          Stell oben einen Beitrag ein — dann steht hier, was der Vertrag dich netto kostet und
          was netto herauskommt.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {/*
            Im Druck stehen Ring und Belastung nebeneinander: untereinander
            passte die Karte nicht mehr auf ein Blatt.
          */}
          <div className="break-inside-avoid space-y-4 print:grid print:grid-cols-2 print:items-start print:gap-4 print:space-y-0">
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
                    + `${zahl2(monat.hebel)}-facher Hebel auf jeden Euro, den du netto zahlst`}
                  klasse="print:h-40 print:w-40"
                />
                <div className="print:hidden">
                  <dl className="space-y-4">
                    <Zahl etikett="Netto-Kosten" punkt={PUNKT.eigen} wert={euroGenau(monat.netto)} zusatz="im Monat" />
                    <Zahl etikett="Steuerersparnis" punkt={PUNKT.steuer}
                      wert={gehalt > 0 ? euroGenau(monat.steuer) : '—'}
                      zusatz={gehalt > 0 ? 'im Monat' : 'ohne Einkommen nicht gerechnet'} />
                    <Zahl etikett="Zulagen" punkt={PUNKT.zulagen} wert={euroGenau(monat.zulage)} zusatz="im Monat" />
                  </dl>
                  <p className="mt-4 text-sm text-ui-tinte">
                    = <span className="font-medium tabular-nums">{euroGenau(monat.depot)}</span> fließen jeden Monat ins Depot.
                  </p>
                </div>
                <dl className="hidden w-full space-y-1.5 print:block">
                  <RingZeile punkt={PUNKT.eigen} text="Netto-Kosten" wert={euroGenau(monat.netto)} />
                  <RingZeile punkt={PUNKT.steuer} text="Steuerersparnis" wert={gehalt > 0 ? euroGenau(monat.steuer) : '—'} />
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
              Deine Belastung (Ansparphase)
            </h3>
            <div className="space-y-1.5">
              <GegenueberZeile
                text={`Deine Eigenbeiträge über ${jahreBisRente} Jahre — bis Alter ${alterBeiRente}`}
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
              <span className="text-sm font-medium text-ui-tinte">Kostet dich wirklich</span>
              <span className="text-xl font-medium tabular-nums text-ui-tinte">
                {euro(profit.eigenaufwandNettoGesamt)}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-ui-schiefer">
              Die Zulagen mindern deine Kosten nicht — sie kommen vom Staat und stehen als
              höheres Kapital auf der anderen Seite.
            </p>
          </div>
          </div>

          {mitAnmerkungen && kostenAnmerkungen}
        </div>
      )}
    </section>
  );

  return (
    <AnspracheGeben wert={DU}>
    <div className="min-h-screen bg-ui-flaeche text-ui-tinte print:min-h-0 print:bg-white">
      {/* Im Druck so knapp wie auf den Arbeitgeber-Seiten: Mit dem Namen unter
          dem Titel passte die erste Ergebniskarte sonst nicht mehr auf Seite 1. */}
      <SeitenKopf innen="print:max-w-none print:px-0 print:py-1" />

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10 print:max-w-none print:px-0 print:py-2">
        {/* Der Titel als Aussage wie in der Beratung; im Druck so gross wie bisher. */}
        <Titel gross klasse="print:text-3xl">
          Altersvorsorgedepot: Was dir der Staat ab 2027 <Hervor>dazugibt</Hervor>
        </Titel>
        {/* Im Druck steht, fuer wen gerechnet wurde — wie „für …“ auf dem Deckblatt des Gutachtens. */}
        {ganzerName && <p className="mt-2 hidden text-lg text-ui-tinte print:block">für {ganzerName}</p>}

        {/*
          DIE ANGABEN FUER DAS PAPIER. Die Fragen bestehen aus Feldern und
          Knoepfen — gedruckt ergaebe das Kaesten ohne Sinn. Stattdessen
          stehen die Werte hier als Text, und die Fragen entfallen im Druck.
        */}
        <section className="mt-4 hidden break-inside-avoid rounded-[10px] border border-ui-linie p-3 print:block">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-medium text-ui-tinte">Deine Angaben</h2>
            <span className="text-xs text-ui-schiefer">Erstellt am {new Date().toLocaleDateString('de-DE')}</span>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-8 gap-y-1 text-xs">
            <DruckAngabe feld="Beitrag monatlich" wert={euro(beitragMonat)} />
            <DruckAngabe
              feld="Geburtsdatum"
              wert={zeitraum ? `${geburtsdatum} · Rente ab ${rentenbeginnText}` : '—'}
            />
            <DruckAngabe
              feld="Kinder mit Kindergeldanspruch"
              wert={kinderDaten.length > 0 ? `${kinderDaten.length} (geboren ${kinderDaten.join(', ')})` : 'keine'}
            />
            <DruckAngabe feld="Bruttoeinkommen im Jahr" wert={gehalt > 0 ? euro(gehalt) : '—'} />
            <DruckAngabe feld="Familienstand" wert={verheiratet ? 'verheiratet (Splittingtarif)' : 'ledig'} />
            <DruckAngabe
              feld="Rendite / Effektivkosten p. a."
              wert={`${prozent(rendite)} / ${prozent(KOSTEN)}`}
            />
          </dl>
        </section>

        {/* --- 1. Das Geburtsdatum: am Anfang die einzige Frage auf der Seite --- */}
        <section aria-labelledby="frage-geburt" className={`mt-8 ${FRAGE} print:hidden`}>
          <h2 id="frage-geburt" className={FRAGE_TITEL}>Wann bist du geboren?</h2>
          <p className={FRAGE_TEXT}>
            Daraus ergibt sich, wann du in Rente gehst — und wie viele Jahre der Staat dazulegt.
          </p>
          <div className="mt-4 max-w-xs">
            <DatumFeld
              label="Geburtsdatum"
              wert={geburtsdatum}
              onChange={setGeburtsdatum}
              hilfe="Acht Ziffern genügen — die Punkte setzt das Feld."
            />
          </div>
        </section>

        {zeitraum && (
          <Schritt klasse="mt-4 print:hidden" beschriftung="Deine Zulagen bis zur Rente">
            {zeitraum.zuSpaet || !bisZu ? (
              <Hinweis symbol={CalendarClock}>
                Dein Rentenbeginn ({rentenbeginnText}) liegt vor dem Start des Depots am 1. Januar{' '}
                {a.abJahr} — für dich kommt das Altersvorsorgedepot leider zu spät.
              </Hinweis>
            ) : (
              <Info
                symbol={<Gift className="h-5 w-5" aria-hidden />}
                etikett="Deine Zulagen bis zur Rente"
                satz={<>Bis zu <Hervor>{euro(bisZu.ohneKinder)}</Hervor> Zulagen vom Staat bis zu deiner Rente</>}
                unter={<>
                  {euro(bisZu.grundzulageJahr)} im Jahr bei {euro(bisZu.beitragVoll)} Beitrag im Monat ·{' '}
                  {zeitraum.jahre === 1 ? '1 Jahr' : `${zeitraum.jahre} Jahre`} bis zu deinem Rentenbeginn {rentenbeginnText}
                  {bisZu.bonus > 0 && <> · darin einmalig {euro(bisZu.bonus)} Berufseinsteigerbonus, weil du jünger als {a.berufseinsteigerAlterMax} bist</>}.
                </>}
              />
            )}
          </Schritt>
        )}

        {/* --- 2. Kinder --- */}
        {offen(2) && (
          <Schritt klasse="mt-6 print:hidden" beschriftung="Kinder">
            <div className={FRAGE}>
              <h2 className={FRAGE_TITEL}>Hast du Kinder? Dann gibt es noch mehr Zulagen.</h2>
              <p className={FRAGE_TEXT}>
                Für jedes Kind, für das Kindergeld fließt, legt der Staat bis zu {euro(a.kinderzulage)} im Jahr dazu.
              </p>
              <div role="group" aria-label="Hast du Kinder?" className="mt-4 flex gap-2">
                <Wahl
                  aktiv={kinderAntwort === 'ja'}
                  onClick={() => {
                    setKinderAntwort('ja');
                    if (kinderEingabe.length === 0) setKinderEingabe([{ datum: '' }]);
                  }}
                >
                  Ja
                </Wahl>
                <Wahl aktiv={kinderAntwort === 'nein'} onClick={() => setKinderAntwort('nein')}>Nein</Wahl>
              </div>
              {kinderAntwort === 'ja' && (
                <Schritt klasse="mt-4">
                  <KinderGeburtsdaten kinder={kinderEingabe} onAendern={setKinderEingabe} a={a} jetzt={jetzt} />
                </Schritt>
              )}
            </div>
          </Schritt>
        )}

        {offen(2) && kinderAntwort === 'ja' && kinder > 0 && bisZu && (
          <Schritt klasse="mt-4 print:hidden" beschriftung="Deine Zulagen mit Kindern">
            <Info
              symbol={<Baby className="h-5 w-5" aria-hidden />}
              etikett={kinder === 1 ? 'Mit deinem Kind' : `Mit deinen ${kinder} Kindern`}
              satz={<>Bis zu <Hervor>{euro(bisZu.mitKindern)}</Hervor> Zulagen vom Staat bis zu deiner Rente</>}
              unter={<>
                Je Kind {euro(a.kinderzulage)} im Jahr, solange Kindergeld fließt — zusammen{' '}
                {euro(bisZu.mitKindern - bisZu.ohneKinder)} mehr als ohne Kinder.
              </>}
            />
          </Schritt>
        )}

        {/* --- 3. Steuerersparnis --- */}
        {offen(3) && (
          <Schritt klasse="mt-6 print:hidden" beschriftung="Steuerersparnis">
            <div className={FRAGE}>
              <h2 className={FRAGE_TITEL}>Willst du noch deine mögliche Steuerersparnis berechnen?</h2>
              <p className={FRAGE_TEXT}>Dann kannst du hier dein Bruttojahresgehalt eingeben.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 sm:items-end">
                <ZahlFeld
                  label="Bruttojahresgehalt"
                  wert={bruttoJahr}
                  onChange={(n) => { setBruttoJahr(n); if (n > 0) setOhneSteuer(false); }}
                  onVerlassen={() => setGehalt(bruttoJahr)}
                  einheit="€"
                  platzhalter="z. B. 45.000"
                  leerBeiNull
                  tausenderpunkte
                  hilfe={gehaltKlein ? 'Gefragt ist das Bruttogehalt im ganzen Jahr, zum Beispiel 45.000 €.' : undefined}
                />
                <div className="pb-2">
                  <Schalter label="Verheiratet (Splittingtarif)" wert={verheiratet} onChange={setVerheiratet} />
                </div>
              </div>
              {bruttoJahr <= 0 && !ohneSteuer && (
                <button type="button" onClick={() => setOhneSteuer(true)} className={`${LINK} mt-4`}>
                  Ohne Steuer weiter
                </button>
              )}
            </div>
          </Schritt>
        )}

        {offen(3) && gehalt > 0 && (
          <Schritt klasse="mt-4 print:hidden" beschriftung="Deine Steuerersparnis">
            {steuerJahr > 0.5 ? (
              <Info
                symbol={<PiggyBank className="h-5 w-5" aria-hidden />}
                etikett="Deine Steuerersparnis"
                satz={<><Hervor>{euro(steuerJahr)}</Hervor> im Jahr zusätzlich</>}
                unter={<>
                  Über die Zulagen hinaus, bei {euro(beitragMonat)} Beitrag im Monat
                  {profit && profit.steuerersparnisGesamt > 0 && <> — bis zur Rente rund {euro(profit.steuerersparnisGesamt)}</>}.
                  Das Finanzamt prüft das von Amts wegen, du musst nichts beantragen.
                </>}
              />
            ) : (
              <Hinweis>
                Bei deinem Einkommen bringt der Steuerabzug <span className="font-medium">nichts über die Zulagen
                hinaus</span> — die Zulage ist der günstigere Weg, und genau den wendet das Finanzamt
                automatisch an.
              </Hinweis>
            )}
          </Schritt>
        )}

        {/*
          IM DRUCK SEITE 1: das Ergebnis und was es kostet — „Angespart bis …“
          zusammen mit der Belastung in der Ansparphase. Wie es sich
          zusammensetzt (Eigenbeitraege, Zulagen, Kursgewinne, Diagramm),
          steht auf Seite 2, dort noch einmal mit der Summe oben.
        */}
        {offen(4) && lauf && (
          <div className="hidden print:mt-4 print:block print:space-y-4">
            <Kernsatz
              gross
              etikett={`Dein Kapital zum Rentenbeginn bei ${euro(beitragMonat)} Beitrag im Monat`}
              klasse="break-inside-avoid print:p-4"
            >
              Angespart bis {rentenbeginn!.jahr}:{' '}
              <span className="whitespace-nowrap tabular-nums"><Hervor>{euro(lauf.endkapital)}</Hervor></span>
            </Kernsatz>
            {kostenKarte(false)}
          </div>
        )}

        {/* --- 4. Regler und Diagramm: was aus dem Beitrag wird --- */}
        {offen(4) && (
          <Schritt klasse={`mt-6 ${lauf ? 'print:break-before-page' : ''}`} beschriftung="Was aus deinem Beitrag wird">
            <section className={`${KARTE} print:box-decoration-clone`}>
              {/* Im Druck auf Seite 2: die Summe von Seite 1 und ihre Teile. */}
              <h2 className={KARTE_TITEL}>
                <span className="print:hidden">Was aus deinem Beitrag wird</span>
                <span className="hidden print:inline">So setzt sich dein Kapital zusammen</span>
              </h2>
              <p className={`${FRAGE_TEXT} print:hidden`}>
                Stell deinen Beitrag ein — das Diagramm zeigt, wie dein Depot bis zur Rente wächst.
              </p>

              {/*
                Der Beitrag am Regler in 10-€-Schritten — bis zur vollen
                Foerderung; darueber kommt keine Zulage mehr dazu. Was
                dazwischen oder darueber liegt, laesst sich genau eintippen.
              */}
              <div className="mt-5 print:hidden">
                <p className={FELD_LABEL}>Dein Beitrag</p>
                <p className="flex flex-wrap items-baseline gap-x-2 tabular-nums">
                  <span className="ui-titel text-[40px] font-normal leading-none text-ui-tinte">{euro(beitragMonat)}</span>
                  <span className="text-sm text-ui-schiefer">im Monat · {euro(beitragMonat * 12)} im Jahr</span>
                </p>
                <div className="print:hidden">
                  <Regler
                    wert={beitragMonat} max={a.stufe2Grenze / 12} schritt={10} onChange={setBeitragMonat}
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
                    <div className="mt-2 max-w-xs">
                      <ZahlFeld label="Beitrag monatlich, genau" wert={beitragMonat} onChange={setBeitragMonat} einheit="€" />
                    </div>
                  )}
                </div>
              </div>

              {!lauf ? (
                <p className={`mt-5 ${LEER}`}>
                  Stell einen Beitrag ein — dann siehst du hier, wie dein Depot bis zur Rente wächst.
                </p>
              ) : (
                <>
                  {/*
                    Das Kapital als Akzent — die eine Zahl der Seite, wie „In
                    Ihre Vorsorge“ in der Beratung. In der grossen Fassung: Sie
                    misst auch am Telefon 26 Punkt und gilt damit als grosse
                    Schrift — Cyan auf Sky Wash erreicht 4,2:1, genug ab 24 Punkt.
                  */}
                  <Kernsatz gross etikett="Dein Kapital zum Rentenbeginn" klasse="mt-6 break-inside-avoid print:mt-4 print:p-4">
                    Angespart bis {rentenbeginn!.jahr}:{' '}
                    <span className="whitespace-nowrap tabular-nums"><Hervor>{euro(lauf.endkapital)}</Hervor></span>
                  </Kernsatz>

                  {/* Die drei Teile mit dem Punkt ihrer Flaeche im Diagramm darunter — wie die Legende der Beratung. */}
                  <dl className="mt-5 grid gap-4 sm:grid-cols-3">
                    <Zahl etikett="Deine Eigenbeiträge" punkt={PUNKT.eigen} wert={euro(lauf.eigenbeitraege)} />
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

                  <p className="mt-4 text-xs leading-relaxed text-ui-schiefer [&_strong]:font-medium [&_strong]:text-ui-tinte">
                    Regelaltersgrenze <strong>{alterBeiRente}</strong>, Rentenbeginn also <strong>{rentenbeginnText}</strong>.
                    Gerechnet ab {startjahr}, das sind {jahreBisRente} Beitragsjahre — mit der Annahme{' '}
                    <strong>{prozent(rendite)} Rendite</strong> und {prozent(KOSTEN)} Effektivkosten im Jahr.
                    Beträge nominal, also ohne Abzug der Inflation — in {jahreBisRente} Jahren ist ein
                    Euro weniger wert als heute.
                  </p>
                  {kostenAnmerkungen && (
                    <div className="hidden space-y-3 print:mt-3 print:block">{kostenAnmerkungen}</div>
                  )}
                  <button
                    type="button"
                    onClick={() => setRenditeOffen((x) => !x)}
                    aria-expanded={renditeOffen}
                    className={`${LINK} mt-2 print:hidden`}
                  >
                    {renditeOffen ? 'Annahme ausblenden' : 'Annahme ändern'}
                  </button>
                  {renditeOffen && (
                    <div className="mt-3 max-w-xs print:hidden">
                      <ProzentFeld label="Erwartete Rendite p. a." wert={rendite} onChange={setRendite} />
                      {/* Fest, nicht einstellbar: ein realistischer Wert fuer ein
                          gefoerdertes Depot. Wer daran dreht, rechnet sich die Sache
                          schoen — und die Seite soll belastbar bleiben. */}
                      <p className="mt-1 text-xs leading-relaxed text-ui-schiefer">
                        Die Effektivkosten bleiben fest bei {prozent(KOSTEN)}: Fondskosten, Depotführung und
                        Produktkosten zusammen.
                      </p>
                    </div>
                  )}
                </>
              )}
            </section>
          </Schritt>
        )}

        {/* --- Danach: Kosten, Foerderung je Jahr, Beratung und Druck, Wissen --- */}
        {offen(4) && (
          <Schritt scrollen={false} klasse="mt-4 space-y-4">
            {/* Im Druck steht diese Karte auf Seite 1, beim Ergebnis (oben). */}
            <div className="print:hidden">{kostenKarte(true)}</div>

            {/* --- Zulagen --- */}
            <section className={`break-inside-avoid ${KARTE}`}>
              <h2 className={KARTE_TITEL}>Deine Förderung je Jahr</h2>

              {beitragMonat <= 0 ? (
                <p className={`mt-4 ${LEER}`}>
                  Stell oben einen monatlichen Beitrag ein.
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
                    {gehalt <= 0 ? (
                      <p className="mt-2 text-sm text-ui-schiefer">
                        Trag oben dein Bruttojahresgehalt ein — ob der Sonderausgabenabzug über die
                        Zulagen hinaus etwas bringt, hängt an deinem Steuersatz.
                      </p>
                    ) : steuervorteil.ueberZulagen <= 0 ? (
                      // Ohne Wirkung braucht es keine vierzeilige Herleitung, die
                      // am Ende null ergibt. Ein Satz sagt dasselbe.
                      <p className="mt-2 text-sm leading-relaxed text-ui-schiefer">
                        Bei deinem Einkommen bringt der Steuerabzug <span className="font-medium text-ui-tinte">nichts über die Zulagen
                        hinaus</span> — die Zulage ist der günstigere Weg, und genau den wendet das
                        Finanzamt automatisch an. Deine {euro(beitragMonat * 12)} Beitrag kosten dich
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
                          Bei deinem Einkommen ist der Abzug günstiger als die bloße Zulage. Das
                          Finanzamt prüft das von Amts wegen — du musst nichts beantragen.
                          Unterm Strich kosten dich {euro(beitragMonat * 12)} Beitrag nur{' '}
                          <strong>{euro(steuervorteil.eigenaufwandNetto)}</strong> im Jahr.
                        </p>
                      </>
                    )}
                  </div>
                </>
              )}
            </section>

            {/* --- Beratung, Ausdruck, neu beginnen --- */}
            <section className={`${KARTE} print:hidden`} aria-label="Beratung und Ausdruck">
              <div className="grid grid-cols-2 gap-3 sm:max-w-md">
                <NamenFelder vorname={name.vorname} nachname={name.nachname} onChange={setName}
                  platzhalter={['Max', 'Mustermann']} eigener />
                <p className="col-span-2 -mt-1 text-xs leading-relaxed text-ui-schiefer">
                  Freiwillig — für den Ausdruck und die Beratungsanfrage. Die Seite speichert nichts.
                </p>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-ui-linie pt-5">
                <button type="button" onClick={() => setBeratungOffen(true)} className={`${KNOPF} flex-1 sm:flex-none`}>
                  <Mail className="h-4 w-4" aria-hidden /> Beratung gewünscht
                </button>
                {/* Der Browser-Druck genuegt: Die Fragen sind im Druck durch eine
                    Textfassung ersetzt, Knoepfe und Dialoge entfallen. */}
                <button type="button" onClick={() => window.print()} className={KNOPF_KLEIN}>
                  <Printer className="h-3.5 w-3.5" aria-hidden /> Ergebnis drucken
                </button>
                <button type="button" onClick={neuBeginnen} className={KNOPF_KLEIN}>
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Neu beginnen
                </button>
              </div>
            </section>

            {/* --- Einordnung --- erklaerender Text, kein Ergebnis. */}
            <AkkordeonKarte
              titel="Was du wissen solltest"
              symbol={<InfoSymbol className="h-4 w-4 text-ui-schiefer" aria-hidden />}
              offen={wissenOffen}
              onUmschalten={() => setWissenOffen((v) => !v)}
            >
              <ul className="space-y-2 text-sm leading-relaxed text-ui-tinte [&_strong]:font-medium">
                <li>
                  <strong>Ab dem 1. Januar {a.abJahr}.</strong> Das Altersvorsorgedepot löst die
                  Riester-Rente ab — das Gesetz ist beschlossen.
                </li>
                <li>
                  <strong>Du sparst in ETFs.</strong> Es gibt keine Beitragsgarantie — dafür die Rendite
                  des Kapitalmarkts.
                </li>
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
                  erreichst du ab {euro(a.kinderzulage)} Jahresbeitrag — unabhängig davon, wie viele
                  Kinder es sind.
                </li>
                <li>
                  <strong>Ausgezahlt wird ab {a.auszahlungAbAlter}</strong>, als lebenslange Rente oder als
                  Auszahlplan, der mindestens bis {a.auszahlplanBisAlter} läuft. Zu Rentenbeginn darfst du
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
                  diesem Punkt — und damit an deinem Steuersatz im Alter.
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
                {euro(a.hoechstbetragEigenbeitrag)} im Jahr <em>zuzüglich</em> deines Zulagenanspruchs — für
                Alleinstehende ohne Kinder also {euro(a.hoechstbetragEigenbeitrag + 540)}. Das Finanzamt
                prüft von Amts wegen, ob der Abzug günstiger ist als die Zulage; wirksam wird davon nur,
                was über die Zulagen hinausgeht.
              </p>
            </AkkordeonKarte>
          </Schritt>
        )}

        <p className="mt-8 text-center text-xs leading-relaxed text-ui-schiefer">
          Modellrechnung ohne Gewähr. Keine Steuer-, Renten- oder Anlageberatung. Rechtsstand des
          am 8. Mai 2026 verabschiedeten Gesetzes, Anwendung ab 1. Januar 2027. Die Berechnung läuft
          vollständig in deinem Browser — deine Eingaben verlassen dieses Gerät nicht.
        </p>
        <RechtsLinks klasse="mt-4" />
      </main>

      <BeratungDialog
        offen={beratungOffen}
        onSchliessen={() => setBeratungOffen(false)}
        empfaenger={BERATER_MAIL}
        eckdaten={eckdaten}
        name={name}
        onName={setName}
      />
    </div>
    </AnspracheGeben>
  );
}

/** Karten der Ergebnisse — wie die Karten der Beratung, im Druck enger und ohne Schatten. */
const KARTE = 'ui-karte p-5 sm:p-7 print:p-3 print:shadow-none';
const KARTE_TITEL = 'text-lg font-medium tracking-[-0.01em] text-ui-tinte sm:text-xl';
/** Eine Frage der gefuehrten Eingabe: weisse Karte, die Frage gross wie ein Kernsatz. */
const FRAGE = 'ui-karte p-5 sm:p-7';
const FRAGE_TITEL = 'ui-titel text-balance text-[24px] font-normal leading-snug text-ui-tinte sm:text-[28px]';
const FRAGE_TEXT = 'mt-1.5 text-sm leading-relaxed text-ui-schiefer';
/** Was steht, solange eine Angabe fehlt. */
const LEER = 'rounded-[10px] border border-dashed border-ui-feld-rand px-4 py-6 text-center text-sm text-ui-schiefer';
/** Die Punkte der Flaechen — dieselben Farben wie im Diagramm (Diagramme.tsx); Asche fuer die Steuerersparnis im Ring. */
const PUNKT = { eigen: 'bg-ui-tinte', steuer: 'bg-ui-daten-3', zulagen: 'bg-ui-knopf', gewinn: 'bg-ui-luecke' } as const;

/**
 * Eine Zwischeninfo: was die Antwort davor an Geld bedeutet. Kein Kernsatz in
 * der Akzentkarte — den gibt es hoechstens einmal je Ansicht, und er gehoert
 * dem Kapital zum Rentenbeginn. Die Zahl ist hervorgehoben, der Satz gross
 * genug (mindestens 24 px), dass das Cyan auf Sky Wash reicht.
 */
function Info({ symbol, etikett, satz, unter }: {
  symbol: ReactNode; etikett: string; satz: ReactNode; unter?: ReactNode;
}) {
  return (
    // Am Telefon steht das Symbol ueber dem Satz — daneben naehme es ihm ein Viertel der Breite.
    <div className="ui-karte flex flex-col gap-3 p-5 sm:flex-row sm:gap-4 sm:p-6">
      <span className="ui-innen flex h-10 w-10 shrink-0 items-center justify-center text-ui-tinte">{symbol}</span>
      <div className="min-w-0">
        <p className="text-sm text-ui-schiefer">{etikett}</p>
        <p className="ui-titel mt-1 text-balance text-[24px] font-normal leading-snug text-ui-tinte sm:text-[28px]">{satz}</p>
        {unter && <p className="mt-2 text-sm leading-relaxed text-ui-schiefer">{unter}</p>}
      </div>
    </div>
  );
}

/** Eine Antwort zum Antippen — gedrueckt dunkel wie die aktive Pille. */
function Wahl({ aktiv, onClick, children }: { aktiv: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={aktiv}
      onClick={onClick}
      className={`min-w-24 rounded-full border px-5 py-2.5 text-sm font-medium transition-colors ${
        aktiv ? 'border-ui-dunkel bg-ui-dunkel text-white' : 'border-ui-zweit-rand bg-ui-karte text-ui-tinte hover:bg-ui-hover'
      }`}
    >
      {children}
    </button>
  );
}

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
