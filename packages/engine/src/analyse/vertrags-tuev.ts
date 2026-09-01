import type { LegalParameters } from '../params/types.js';
import type { Szenario, Vertrag } from '../model.js';
import { zusatzsteuer } from '../tax/haushalt.js';
import { riesterZulagen, riesterZulagenkuerzung } from '../products/bav.js';
import { avdZulagen, avdSteuervorteil } from '../products/altersvorsorgedepot.js';
import { kennzahlen } from './kennzahlen.js';
import { euroText } from '../util/text.js';

/**
 * VERTRAGS-TUEV
 *
 * Beantwortet fuer einen einzelnen Vertrag die Frage, die kein Kassenbon
 * beantworten kann: Lohnt sich dieser Vertrag ueberhaupt?
 *
 * Dazu wird die Einzahlphase dem gegenuebergestellt, was am Ende netto
 * ankommt — beides in echten Euro, nach Steuern, Sozialabgaben, Zulagen und
 * Arbeitgeberzuschuss.
 *
 * Drei Fehler des Prototyps sind hier bewusst korrigiert:
 *
 * - B3: Er ZEIGTE den Grenzsteuersatz an, RECHNETE aber mit dem
 *   Durchschnittssatz. Hier laeuft alles ueber `zusatzsteuer`, also ueber die
 *   tatsaechliche Mehrbelastung, die genau dieser Vertrag ausloest.
 * - B9: Die Gehaltseingabe war auf "Netto" voreingestellt und wurde mit festen
 *   Faktoren (1,55 bzw. 1,35) auf ein Brutto hochgerechnet. Damit stand der
 *   gesamte TUEV auf einem geratenen zu versteuernden Einkommen. Hier wird die
 *   Bemessungsgrundlage uebergeben, die `bruttoZuNetto`/`nettoZuBrutto`
 *   exakt ermittelt haben.
 * - C9: Die Kuerzung der Riester-Zulagen bei zu geringem Eigenbeitrag fehlte
 *   voellig. Sie wird jetzt ueber `riesterZulagenkuerzung` mitgerechnet.
 */

export interface TuevAnnahmen {
  /** Monatlicher Beitrag zu Beginn der Betrachtung */
  beitragMonat: number;
  /** Jaehrliche Steigerung des Beitrags, z. B. 0.02 */
  dynamik: number;
  /** bAV: monatlicher Arbeitgeberzuschuss (mindert den eigenen Aufwand) */
  agZuschussMonat: number;
  /**
   * RIESTER: Geburtsjahre der Kinder, am Vertrag erfasst.
   *
   * Beim Altersvorsorgedepot wird dieses Feld NICHT gelesen — dort kommen die
   * Kinder aus dem Haushalt, aus derselben Quelle wie die Zeitachse. Sonst
   * zeigten TUEV und Vertragsblatt fuer denselben Vertrag verschiedene
   * Kinderzulagen, und der Nutzer glaubte zu Recht keinem von beiden.
   * Riester behaelt seine vertragseigene Liste, weil gespeicherte Szenarien
   * sie tragen.
   */
  kinder: { geburtsjahr: number }[];
  /** Jahr, ab dem eingezahlt wird */
  beginnJahr: number;
  /** Angenommene Lebenserwartung — bestimmt die Dauer der Auszahlphase */
  lebenserwartung: number;
}

/**
 * Woraus sich die Zulage zusammensetzt.
 *
 * `zulageMonat` bleibt die eine Summe, an der alles andere haengt; das Detail
 * ist eine ZUSAETZLICHE Sicht darauf, keine zweite Rechnung. Die drei
 * Monatswerte ergeben deshalb exakt `zulageMonat` — dafuer gibt es einen Test.
 */
export interface TuevZulageDetail {
  /** Monatswerte des ERSTEN Jahres */
  grundzulageMonat: number;
  kinderzulageMonat: number;
  /** Berufseinsteigerbonus auf den Monat umgelegt — er faellt EINMALIG an */
  bonusMonat: number;
  /** Derselbe Bonus als Jahresbetrag, denn nur so ist er richtig beschriftet */
  bonusEinmalig: number;
  kinderMitAnspruch: number;
  /** Zulagen je Euro Eigenbeitrag, wie sie DAUERHAFT gelten (ohne Bonus) */
  foerderquoteDauerhaft: number;
}

export interface TuevKontext {
  /**
   * Beamter oder Besoldungsempfaenger.
   *
   * Entscheidet zweierlei: eine Entgeltumwandlung spart ihm keine
   * Sozialabgaben (er zahlt keine), und sein Hoechstbetrag nach § 10 Abs. 3
   * EStG ist um den FIKTIVEN Gesamtbeitrag zur Rentenversicherung gekuerzt
   * (§ 10 Abs. 3 S. 3). Ohne diese Angabe bekam er 21 % Ersparnis
   * gutgeschrieben, die es nicht geben kann.
   */
  beamter: boolean;
  /** Jahresbruttogehalt heute — Basis fuer die SV-Ersparnis */
  jahresbrutto: number;
  /** Zu versteuerndes Einkommen heute — Basis fuer die Steuerersparnis */
  zveHeute: number;
  /** Jahr des Rentenbeginns des Vertragsinhabers */
  rentenbeginnJahr: number;
  /** Alter bei Rentenbeginn */
  alterBeiRentenbeginn: number;
  /**
   * Die Auszahlseite VOLLSTAENDIG aus der Projektion — Brutto und Abzuege,
   * nicht nur das Netto. Sonst laesst sich in der Oberflaeche nicht zeigen,
   * wie aus der Bruttorente die Nettorente wird; genau diese Herleitung war
   * im urspruenglichen Entwurf vorhanden und beim Nachbau verloren gegangen.
   */
  /** Monatliche BRUTTO-Rente; 0 bei Kapitalauszahlung */
  bruttoRenteMonat: number;
  /** Monatlicher KV/PV-Abzug auf die Rente */
  kvPvMonat: number;
  /** Monatlicher Steuerabzug auf die Rente */
  steuerMonat: number;
  /** Monatliche NETTO-Rente aus der Projektion; 0 bei Kapitalauszahlung */
  nettoRenteMonat: number;

  /** BRUTTO-Kapital bei Kapitalauszahlung; 0 bei laufender Rente */
  bruttoKapital: number;
  /** Steuer auf die Kapitalauszahlung */
  steuerKapital: number;
  /** NETTO-Kapital bei Kapitalauszahlung; 0 bei laufender Rente */
  nettoKapital: number;
}

export interface TuevErgebnis {
  vertragId: string;
  /** Jahre bis Rentenbeginn */
  jahreEinzahlung: number;
  /** Jahre der Auszahlphase */
  jahreAuszahlung: number;

  /** --- Momentaufnahme des ERSTEN Jahres, monatlich --- */
  beitragMonat: number;
  agZuschussMonat: number;
  zulageMonat: number;
  /**
   * Aufschluesselung der Zulage — nur beim Altersvorsorgedepot gefuellt.
   * Riester kennt keinen Berufseinsteigerbonus und keine Stufen, dort waere
   * die Aufteilung eine Erfindung.
   */
  zulageDetail?: TuevZulageDetail;
  steuerersparnisMonat: number;
  svErsparnisMonat: number;
  /** Was der Vertrag Sie im ersten Jahr wirklich kostet */
  echterAufwandMonat: number;

  /** --- Auszahlseite, monatlich (bei Kapital: einmalig) --- */
  bruttoRenteMonat: number;
  kvPvMonat: number;
  steuerMonat: number;
  nettoRenteMonat: number;
  bruttoKapital: number;
  steuerKapital: number;
  nettoKapital: number;

  /** --- Summen ueber die gesamte Laufzeit --- */
  summeEinzahlung: number;
  summeAuszahlung: number;

  /** --- Kennzahlen --- */
  /** Summe Auszahlung / Summe Einzahlung. Unter 1 = Verlustgeschaeft. */
  nettoHebel: number;
  /** Effektive Nettorendite p. a. als Dezimalzahl */
  rendite: number;
  /** Jahre ab Rentenbeginn, bis die Einzahlungen zurueckgeflossen sind */
  amortisationsJahre: number;
  echterGewinn: number;

  /** true, wenn die Riester-Zulagen wegen zu geringem Eigenbeitrag gekuerzt werden */
  zulagenGekuerzt: boolean;
  hinweise: string[];
}

/**
 * Grenzen des § 3 Nr. 63 EStG, als Anteil der Beitragsbemessungsgrenze der
 * allgemeinen Rentenversicherung: 8 % steuerfrei, 4 % beitragsfrei.
 */
const STEUER_FREI_QUOTE = 0.08;
const SV_FREI_QUOTE = 0.04;

/** Vorgabe der Auszahldauer, wenn am Vertrag nichts eingetragen ist. */
const AUSZAHLDAUER_VORGABE = 25;

/**
 * Vertragsarten, deren Auszahlung ein AUSZAHLPLAN ist und keine lebenslange
 * Rente: Depot, Altersvorsorgedepot und die verrentete Kapitalauszahlung.
 */
function istAuszahlplan(typ: Vertrag['typ']): boolean {
  return typ === 'etf' || typ === 'avd' || typ === 'bavKapital' || typ === 'prvKapital';
}

/**
 * Wie viele Jahre lang gezahlt wird.
 *
 * Eine lebenslange Rente laeuft bis zur angenommenen Lebenserwartung. Ein
 * Auszahlplan laeuft eine FESTE Zahl von Jahren und ist danach zu Ende — wer
 * ihn ueber die Lebenserwartung rechnet, schreibt ihm Zahlungen zu, die es
 * nicht mehr gibt, und die Rendite faellt zu hoch aus. Umgekehrt zaehlt ein
 * Plan, der ueber die Lebenserwartung hinausreicht, nur bis dorthin: was nach
 * dem Tod ausgezahlt wuerde, kommt beim Vertragsinhaber nicht mehr an.
 */
function auszahlungsdauer(
  v: Vertrag,
  a: TuevAnnahmen,
  k: TuevKontext,
): number {
  const bisLebensende = Math.max(1, Math.round(a.lebenserwartung - k.alterBeiRentenbeginn));
  if (!istAuszahlplan(v.typ)) return bisLebensende;
  const fest = Math.max(1, Math.round(v.entnahmedauer ?? AUSZAHLDAUER_VORGABE));
  return Math.min(bisLebensende, fest);
}

/**
 * Je Euro umgewandeltem Entgelt: um wie viel der abziehbare Vorsorgeaufwand
 * sinkt (§ 10 Abs. 1 Nr. 2 und 3 EStG).
 *
 * Ein SATZ, kein Verhaeltnis. Rentenversicherung voll, Krankenversicherung zu
 * 96 % (der Rest entfaellt auf Krankengeld), Pflegeversicherung voll — je
 * Arbeitnehmeranteil. Die Arbeitslosenversicherung bleibt aussen vor, sie ist
 * kein Vorsorgeaufwand im Sinne der Vorschrift.
 */
function abzugsfaehigeSvQuote(beamter: boolean, p: LegalParameters): number {
  if (beamter) return 0;
  return p.rvSatzGesamt / 2
    + (p.kv.allgemeinerSatz / 2 + p.kv.zusatzbeitrag / 2) * 0.96
    + p.pv.satz / 2;
}

/** Sozialversicherungsersparnis je Euro Entgeltumwandlung. */
function svErsparnisQuote(jahresbrutto: number, beamter: boolean, p: LegalParameters): number {
  // Beamte zahlen weder Renten- noch Arbeitslosenversicherung und sind ueber
  // die Beihilfe abgesichert. Bei ihnen spart eine Entgeltumwandlung nichts.
  if (beamter) return 0;

  // Entgeltumwandlung spart nur, soweit das Gehalt UNTER der jeweiligen
  // Beitragsbemessungsgrenze liegt. Oberhalb der BBG entsteht keine
  // Ersparnis — der Prototyp rechnete sie dort trotzdem an.
  const unterKvBbg = jahresbrutto < p.bbgKvJahr;
  const unterRvBbg = jahresbrutto < p.bbgRvJahr;

  let quote = 0;
  if (unterKvBbg) quote += p.kv.allgemeinerSatz / 2 + p.kv.zusatzbeitrag / 2 + p.pv.satz / 2;
  if (unterRvBbg) quote += p.rvSatzGesamt / 2 + p.avSatzGesamt / 2;
  return quote;
}

export function vertragsTuev(
  v: Vertrag,
  a: TuevAnnahmen,
  k: TuevKontext,
  s: Szenario,
  p: LegalParameters,
): TuevErgebnis {
  const hinweise: string[] = [];
  const steuerOpt = {
    verheiratet: s.haushalt.verheiratet,
    bundesland: s.haushalt.bundesland,
    kirchensteuerpflichtig: s.haushalt.kirchensteuer,
  };

  const jahreEinzahlung = Math.max(1, k.rentenbeginnJahr - a.beginnJahr);
  const jahreAuszahlung = auszahlungsdauer(v, a, k);

  const svQuote = svErsparnisQuote(k.jahresbrutto, k.beamter, p);
  if (svQuote === 0 && v.typ.startsWith('bav')) {
    hinweise.push(k.beamter
      ? 'Als Beamter zahlen Sie keine Sozialabgaben. Eine Entgeltumwandlung spart hier '
        + 'nur Steuern, keine Beiträge.'
      : 'Das Gehalt liegt über beiden Beitragsbemessungsgrenzen. Eine Entgeltumwandlung '
        + 'spart hier keine Sozialabgaben mehr.');
  }

  const einzahlungenJeJahr: number[] = [];
  let summeEinzahlung = 0;
  let zulagenGekuerzt = false;
  let bonusVerbraucht = false;
  // Alter der Person im Beitragsjahr — aus Rentenbeginn und Alter dort
  // zurueckgerechnet, damit der Berufseinsteigerbonus im richtigen Jahr faellt.
  const alterImJahr = (jahr: number) => k.alterBeiRentenbeginn - (k.rentenbeginnJahr - jahr);

  // Momentaufnahme des ersten Jahres
  let beitragMonat = 0, agZuschussMonat = 0, zulageMonat = 0;
  let zulageDetail: TuevZulageDetail | undefined;
  let steuerersparnisMonat = 0, svErsparnisMonat = 0, echterAufwandMonat = 0;

  let beitragJahr = Math.max(0, a.beitragMonat) * 12;

  for (let t = 0; t < jahreEinzahlung; t++) {
    const jahr = a.beginnJahr + t;
    let aufwandJahr: number;
    let zulageJahr = 0, steuerJahr = 0, svJahr = 0, agJahr = 0;

    if (v.typ === 'riester') {
      // Zulagen zuerst, dann der Steuervorteil ueber den Hoechstbetrag § 10a
      // ABZUEGLICH der Zulagen (Guenstigerpruefung in vereinfachter Form).
      const roh = riesterZulagen(a.kinder, jahr, p);
      const kuerzung = riesterZulagenkuerzung(
        { eigenbeitragJahr: beitragJahr, vorjahresbruttoRvPflichtig: k.jahresbrutto, zulagenGesamt: roh },
        p,
      );
      if (kuerzung.gekuerzt) zulagenGekuerzt = true;
      zulageJahr = roh * kuerzung.faktor;

      const abzugsfaehig = Math.min(beitragJahr + zulageJahr, p.riester.hoechstbetrag);
      steuerJahr = Math.max(0, zusatzsteuer(k.zveHeute - abzugsfaehig, abzugsfaehig, steuerOpt, p) - zulageJahr);
      aufwandJahr = Math.max(0, beitragJahr - steuerJahr);
    } else if (v.typ === 'avd') {
      // Altersvorsorgedepot: erst die Zulagen, dann der Sonderausgabenabzug
      // ABZUEGLICH der Zulagen — dieselbe Guenstigerpruefung wie bei Riester,
      // der Gesetzgeber hat die Mechanik unveraendert uebernommen.
      //
      // Ohne diesen Zweig fiel der Vertrag in den Fall "aus versteuertem Geld"
      // und wurde damit erheblich zu schlecht gezeigt: ohne Zulagen und ohne
      // Steuervorteil.
      // Die Kinder kommen aus dem HAUSHALT — derselben Quelle, aus der auch
      // die Zeitachse rechnet (timeline.ts, avdLauf). Waeren sie zusaetzlich
      // am Vertrag erfassbar, zeigten TUEV und Vertragsblatt fuer denselben
      // Vertrag verschiedene Kinderzulagen.
      const z = avdZulagen(
        {
          eigenbeitragJahr: beitragJahr,
          kinder: s.haushalt.kinder,
          alter: alterImJahr(jahr),
          jahr,
        },
        p.avd,
      );
      // Der Berufseinsteigerbonus faellt nur einmal an.
      const bonus = bonusVerbraucht ? 0 : z.bonus;
      if (bonus > 0) bonusVerbraucht = true;
      zulageJahr = z.grundzulage + z.kinderzulage + bonus;
      if (t === 0) {
        zulageDetail = {
          grundzulageMonat: z.grundzulage / 12,
          kinderzulageMonat: z.kinderzulage / 12,
          bonusMonat: bonus / 12,
          bonusEinmalig: bonus,
          kinderMitAnspruch: z.kinderMitAnspruch,
          foerderquoteDauerhaft: z.foerderquoteDauerhaft,
        };
      }

      // Sonst bliebe unerklaert, warum ein vor 2027 beginnender Vertrag in
      // den ersten Jahren ohne Zulage dasteht.
      for (const h of z.hinweise) if (!hinweise.includes(h)) hinweise.push(h);

      const vorteil = avdSteuervorteil(
        { eigenbeitragJahr: beitragJahr, zulagenJahr: zulageJahr, zveHeute: k.zveHeute },
        steuerOpt,
        p,
      );
      steuerJahr = vorteil.ueberZulagen;
      aufwandJahr = vorteil.eigenaufwandNetto;
    } else if (v.typ.startsWith('bav')) {
      // Der Arbeitgeberzuschuss mindert den eigenen Aufwand; er waechst mit
      // dem Beitrag mit.
      const skala = a.beitragMonat > 0 ? beitragJahr / (a.beitragMonat * 12) : 1;
      agJahr = Math.min(beitragJahr, Math.max(0, a.agZuschussMonat) * 12 * skala);
      const eigenanteil = Math.max(0, beitragJahr - agJahr);

      // GRENZEN DES § 3 Nr. 63 EStG. Entgeltumwandlung ist nur bis 8 % der
      // Beitragsbemessungsgrenze steuerfrei und nur bis 4 % beitragsfrei.
      // Was darueber liegt, ist normales Gehalt — der Vertrag kostet dann
      // fast den vollen Beitrag. Ohne diese Deckelung wies der TUEV bei
      // 1.000 EUR im Monat einen um 280 EUR zu niedrigen Aufwand aus.
      const svFrei = Math.min(eigenanteil, SV_FREI_QUOTE * p.bbgRvJahr);
      // Unterstuetzungskasse und Direktzusage fallen NICHT unter § 3 Nr. 63:
      // sie sind ohne Grenze lohnsteuerfrei (Zuflussprinzip), aber
      // beitragsfrei ebenfalls nur bis 4 %.
      const steuerFrei = v.typ === 'bavUkasse'
        ? eigenanteil
        : Math.min(eigenanteil, STEUER_FREI_QUOTE * p.bbgRvJahr);

      svJahr = svFrei * svQuote;

      // Die Entgeltumwandlung mindert das zvE nicht um den vollen Betrag: mit
      // dem Bruttolohn sinken auch die abzugsfaehigen Vorsorgeaufwendungen.
      // Naeherung — der genaue Wert haengt davon ab, welche Beitraege im
      // Einzelfall unter den Hoechstbetrag des § 10 Abs. 3 EStG passen.
      const wegfallenderVorsorgeabzug = svFrei * abzugsfaehigeSvQuote(k.beamter, p);
      const zveMinderung = Math.max(0, steuerFrei - wegfallenderVorsorgeabzug);

      steuerJahr = zusatzsteuer(k.zveHeute - zveMinderung, zveMinderung, steuerOpt, p);
      aufwandJahr = Math.max(0, eigenanteil - steuerJahr - svJahr);

      if (t === 0) {
        if (eigenanteil > svFrei + 0.5) {
          hinweise.push(
            `Nur ${euroText(SV_FREI_QUOTE * p.bbgRvJahr / 12)} im Monat sind beitragsfrei `
            + `(4 % der Beitragsbemessungsgrenze). Auf die darüber liegenden `
            + `${euroText((eigenanteil - svFrei) / 12)} zahlen Sie volle Sozialabgaben.`,
          );
        }
        if (eigenanteil > steuerFrei + 0.5) {
          hinweise.push(
            `Steuerfrei sind nur ${euroText(STEUER_FREI_QUOTE * p.bbgRvJahr / 12)} im Monat `
            + `(8 % der Beitragsbemessungsgrenze). Die darüber liegenden `
            + `${euroText((eigenanteil - steuerFrei) / 12)} zahlen Sie aus versteuertem `
            + 'Gehalt — der Vertrag lohnt sich insoweit nur noch wegen der Rendite.',
          );
        }
      }
    } else if (v.typ === 'basis') {
      // HOECHSTBETRAG DES § 10 Abs. 3 EStG. Der Rahmen ist ZUERST durch die
      // Beitraege zur gesetzlichen Rentenversicherung verbraucht —
      // Arbeitnehmer- UND Arbeitgeberanteil. Bei Beamten tritt an deren
      // Stelle der fiktive Gesamtbeitrag (§ 10 Abs. 3 S. 3); beide Male
      // dieselbe Formel. Ohne diese Deckelung zog der TUEV auch Beitraege
      // ab, die das Finanzamt gar nicht anerkennt.
      const verbraucht = Math.min(k.jahresbrutto, p.bbgRvJahr) * p.rvSatzGesamt;
      const rahmen = Math.max(0,
        p.hoechstbetragAltersvorsorge * (steuerOpt.verheiratet ? 2 : 1) - verbraucht);
      const abziehbar = Math.min(beitragJahr, rahmen);

      steuerJahr = zusatzsteuer(k.zveHeute - abziehbar, abziehbar, steuerOpt, p);
      aufwandJahr = Math.max(0, beitragJahr - steuerJahr);

      if (t === 0 && beitragJahr > abziehbar + 0.5) {
        hinweise.push(
          `Absetzbar sind hier nur ${euroText(rahmen / 12)} im Monat: der Höchstbetrag von `
          + `${euroText(p.hoechstbetragAltersvorsorge * (steuerOpt.verheiratet ? 2 : 1))} im Jahr `
          + `ist bereits durch ${euroText(verbraucht)} Beiträge zur gesetzlichen `
          + 'Rentenversicherung belegt (Arbeitnehmer- und Arbeitgeberanteil). Die darüber '
          + `liegenden ${euroText((beitragJahr - abziehbar) / 12)} im Monat bringen keine `
          + 'Steuerersparnis.',
        );
      }
    } else {
      // Private Vertraege und Depots werden aus versteuertem Geld bespart.
      aufwandJahr = beitragJahr;
    }

    if (t === 0) {
      beitragMonat = beitragJahr / 12;
      agZuschussMonat = agJahr / 12;
      zulageMonat = zulageJahr / 12;
      steuerersparnisMonat = steuerJahr / 12;
      svErsparnisMonat = svJahr / 12;
      echterAufwandMonat = aufwandJahr / 12;
    }

    einzahlungenJeJahr.push(aufwandJahr);
    summeEinzahlung += aufwandJahr;
    beitragJahr *= 1 + a.dynamik;
  }

  const istKapital = k.nettoKapital > 0;
  const auszahlungJeJahr = k.nettoRenteMonat * 12;

  const kz = kennzahlen({
    einzahlungenJeJahr,
    auszahlungJeJahr: istKapital ? 0 : auszahlungJeJahr,
    jahreAuszahlung: istKapital ? 0 : jahreAuszahlung,
    kapitalEinmalig: istKapital ? k.nettoKapital : 0,
  });
  const { summeAuszahlung, nettoHebel, rendite, amortisationsJahre } = kz;

  if (nettoHebel > 0 && nettoHebel < 1) {
    hinweise.push(
      'Ueber die gesamte Laufzeit kommt weniger heraus, als eingezahlt wurde. ' +
      'Der Vertrag verliert selbst ohne Beruecksichtigung der Inflation Geld.',
    );
  }
  if (!istKapital && amortisationsJahre > jahreAuszahlung) {
    hinweise.push(
      `Die Einzahlungen sind erst nach ${amortisationsJahre.toFixed(0)} Rentenjahren zurueckgeflossen — ` +
      `das liegt hinter der angenommenen Lebenserwartung von ${a.lebenserwartung} Jahren.`,
    );
  }

  return {
    vertragId: v.id,
    jahreEinzahlung,
    jahreAuszahlung,

    bruttoRenteMonat: k.bruttoRenteMonat,
    kvPvMonat: k.kvPvMonat,
    steuerMonat: k.steuerMonat,
    nettoRenteMonat: k.nettoRenteMonat,
    bruttoKapital: k.bruttoKapital,
    steuerKapital: k.steuerKapital,
    nettoKapital: k.nettoKapital,
    beitragMonat,
    agZuschussMonat,
    zulageMonat,
    zulageDetail,
    steuerersparnisMonat,
    svErsparnisMonat,
    echterAufwandMonat,
    summeEinzahlung,
    summeAuszahlung,
    nettoHebel,
    rendite,
    amortisationsJahre,
    echterGewinn: kz.echterGewinn,
    zulagenGekuerzt,
    hinweise,
  };
}

export interface RenteOderKapital {
  /** Alter, ab dem die Rente das Kapital ueberholt, ohne Verzinsung */
  breakEvenOhneZins: number;
  /** Dasselbe bei 2 % Verzinsung des Kapitals */
  breakEvenMitZins: number;
  /**
   * true, wenn der Kapitalertrag allein die Rente traegt. Dann rechnet sich
   * die Verrentung finanziell nie.
   */
  kapitalTraegtSichSelbst: boolean;
}

/**
 * Rente oder Kapital? Vergleicht beide Auszahlungswege ueber das Alter, ab dem
 * die laufende Rente die Einmalzahlung eingeholt hat.
 */
export function renteOderKapital(
  nettoRenteMonat: number,
  nettoKapital: number,
  alterBeiRentenbeginn: number,
  zins = 0.02,
): RenteOderKapital {
  if (nettoRenteMonat <= 0 || nettoKapital <= 0) {
    return { breakEvenOhneZins: alterBeiRentenbeginn, breakEvenMitZins: alterBeiRentenbeginn, kapitalTraegtSichSelbst: false };
  }

  const breakEvenOhneZins = alterBeiRentenbeginn + nettoKapital / (nettoRenteMonat * 12);

  // Mit Verzinsung: Wie lange traegt das Kapital eine Entnahme in Hoehe der
  // Rente? Uebersteigt der monatliche Zinsertrag die Rente, reicht es ewig.
  const zinsMonat = zins / 12;
  const ertragMonat = nettoKapital * zinsMonat;
  if (nettoRenteMonat <= ertragMonat) {
    return { breakEvenOhneZins, breakEvenMitZins: Infinity, kapitalTraegtSichSelbst: true };
  }

  const monate =
    -Math.log(1 - (nettoKapital * zinsMonat) / nettoRenteMonat) / Math.log(1 + zinsMonat);

  return {
    breakEvenOhneZins,
    breakEvenMitZins: alterBeiRentenbeginn + monate / 12,
    kapitalTraegtSichSelbst: false,
  };
}
