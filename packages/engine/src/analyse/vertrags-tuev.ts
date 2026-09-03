import type { LegalParameters } from '../params/types.js';
import { arbeitgeberzuschuss, PKV_BASISANTEIL } from '../social/pkv.js';
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
  /**
   * Privat krankenversichert.
   *
   * Ohne diese Angabe rechnete der TUEV jedem Nicht-Beamten den KV/PV-Anteil
   * als Ersparnis an — bei einem privat Versicherten das Doppelte des
   * Richtigen. Seine Praemie haengt am Vertrag, nicht am Gehalt.
   */
  privatVersichert: boolean;
  /** Monatliche PKV-Praemie — Bezugsgroesse fuer den Arbeitgeberzuschuss */
  pkvPraemieMonat: number;
  /**
   * Selbststaendig.
   *
   * Wirkt an drei Stellen: eine Entgeltumwandlung ist mangels Arbeitgeber
   * unmoeglich, der Hoechstbetrag des § 10 Abs. 3 EStG ist nicht durch
   * fiktive Arbeitgeberbeitraege belegt, und ohne Rentenversicherungspflicht
   * besteht keine unmittelbare Riester-Zulageberechtigung.
   */
  selbststaendig: boolean;
  /** Eigener Jahresbeitrag zur gesetzlichen Rentenversicherung */
  grvBeitragJahr: number;
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
  /** Steuer auf die Kapitalauszahlung im Zuflussjahr — OHNE Beitraege */
  steuerKapital: number;
  /**
   * Kranken- und Pflegeversicherung auf die Kapitalleistung, Summe ueber die
   * 120 Monate des § 229 Abs. 1 S. 3 SGB V.
   *
   * GETRENNT von der Steuer, weil beide verschieden wirken: Die Steuer faellt
   * im Zuflussjahr an und ist mit der Auszahlung erledigt; die Beitraege
   * laufen zehn Jahre lang und mindern in dieser Zeit das MONATLICHE Netto.
   * Zusammengefasst als „Steuern und Abgaben" liess sich nicht mehr erkennen,
   * warum dieselbe Auszahlung an anderer Stelle hoeher ausgewiesen ist.
   */
  kvPvKapital: number;
  /** NETTO-Kapital nach Steuer UND Beitraegen; 0 bei laufender Rente */
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
  kvPvKapital: number;
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
export const STEUER_FREI_QUOTE = 0.08;
export const SV_FREI_QUOTE = 0.04;

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
 * Was `svWirkung` von einem Kontext tatsaechlich braucht.
 *
 * Als Ausschnitt geschrieben, damit auch der Foerdercheck die Funktion
 * benutzen kann: der bilanziert den ungenutzten Rahmen je Haushalt und hat
 * keinen Vertrag, also auch keinen vollstaendigen `TuevKontext`. Ein
 * `TuevKontext` erfuellt den Ausschnitt weiterhin von selbst.
 */
export type SvKontext = Pick<
  TuevKontext,
  'beamter' | 'selbststaendig' | 'privatVersichert' | 'pkvPraemieMonat' | 'jahresbrutto'
>;

/** Was eine Entgeltumwandlung an Sozialabgaben bewirkt. */
export interface SvWirkung {
  /** Ersparnis an Sozialabgaben, Jahresbetrag */
  ersparnis: number;
  /** Um so viel sinkt der abziehbare Vorsorgeaufwand (§ 10 EStG) */
  wegfallenderAbzug: number;
  /**
   * Was vom Arbeitgeberzuschuss zur PKV verloren geht, Jahresbetrag.
   *
   * Steht hier und nicht nur in `ersparnis`, damit der Hinweistext ihn beim
   * Namen nennen kann. Bei gesetzlich Versicherten und Beamten immer 0.
   */
  verlorenerZuschuss: number;
}

/**
 * Der Teil einer Umwandlung, der die Bemessungsgrundlage tatsaechlich senkt.
 *
 * BEFUND: Vorher entschied `jahresbrutto < bbg` ueber das VOLLE Gehalt. Wer
 * knapp ueber der Grenze lag, bekam gar keine Ersparnis zugerechnet — obwohl
 * die Umwandlung ihn darunter bringt. Diese Differenz deckt alle drei Lagen
 * von selbst ab: ganz unterhalb, ueber die Grenze hinweg, ganz oberhalb.
 */
function anteilUnterGrenze(brutto: number, umwandlung: number, bbg: number): number {
  const vorher = Math.min(Math.max(0, brutto), bbg);
  const nachher = Math.min(Math.max(0, brutto - umwandlung), bbg);
  return Math.max(0, vorher - nachher);
}

/**
 * Was eine Entgeltumwandlung an Sozialabgaben spart — und was sie beim
 * Sonderausgabenabzug kostet.
 *
 * EIN BETRAG, KEIN SATZ. Bei einem privat Versicherten haengt die Wirkung am
 * Deckel des Arbeitgeberzuschusses, und ein Deckel laesst sich nicht als
 * Prozentsatz ausdruecken.
 *
 * BEIDE WIRKUNGEN IN EINER FUNKTION, weil sie dieselbe Grenzlogik brauchen.
 * Vorher standen sie als zwei Saetze nebeneinander, mussten dieselbe
 * Fallunterscheidung treffen und taten es unterschiedlich — genau daran ist
 * der PKV-Fall gescheitert.
 *
 * BEFUND: Beide kannten nur `beamter` und rechneten jedem Nicht-Beamten den
 * KV/PV-Anteil an. Eine private Krankenversicherung haengt aber nicht am
 * Gehalt: sie ist ein Vertragsbeitrag, und ein umgewandelter Euro senkt sie
 * um nichts. Die ausgewiesene Ersparnis war dadurch bei privat Versicherten
 * doppelt so hoch wie in Wirklichkeit (21,15 % statt 10,60 % im Rechtsstand
 * 2026).
 */
export function svWirkung(
  umwandlungJahr: number,
  k: SvKontext,
  p: LegalParameters,
): SvWirkung {
  /*
    Beamte zahlen weder Renten- noch Arbeitslosenversicherung und sind ueber
    die Beihilfe abgesichert. Bei ihnen spart eine Entgeltumwandlung nichts.

    Selbststaendige koennen gar nicht umwandeln: es gibt kein Entgelt und
    keinen Arbeitgeber. Ihr GRV-Beitrag steht fest — ein Vertragsbeitrag
    senkt ihn um nichts.
  */
  if (k.beamter || k.selbststaendig) {
    return { ersparnis: 0, wegfallenderAbzug: 0, verlorenerZuschuss: 0 };
  }

  const u = Math.max(0, umwandlungJahr);
  const rvTeil = anteilUnterGrenze(k.jahresbrutto, u, p.bbgRvJahr);
  const rvSatz = p.rvSatzGesamt / 2;
  const avSatz = p.avSatzGesamt / 2;

  if (k.privatVersichert) {
    /*
      Kranken- und Pflegeversicherung sparen nichts — die Praemie haengt am
      Vertrag, nicht am Gehalt. Stattdessen KOSTET die Umwandlung etwas: der
      Arbeitgeberzuschuss nach § 257 SGB V bemisst sich am beitragspflichtigen
      Entgelt, und eine Umwandlung nach § 3 Nr. 63 EStG senkt genau dieses
      Entgelt.

      Als Differenz gerechnet, damit der Deckel "hoechstens die halbe Praemie"
      sich von selbst regelt. WANN er ueberhaupt greift, ist der Punkt: der
      Zuschuss bewegt sich nur, solange die GEHALTSBEZOGENE Groesse die
      kleinere ist — also solange die Praemie mehr als rund 21 % des
      Monatsbruttos ausmacht. Das ist der Fall einer Familienpraemie auf einem
      mittleren Gehalt, nicht der Regelfall.

      Trifft er zu, frisst der verlorene Zuschuss (10,55 %) die Ersparnis bei
      Renten- und Arbeitslosenversicherung (10,60 %) nahezu vollstaendig auf:
      es bleiben Cent. Andernfalls steht der Zuschuss am Praemiendeckel und
      ruehrt sich nicht.
    */
    const verlorenerZuschuss = Math.max(0,
      arbeitgeberzuschuss(k.pkvPraemieMonat, k.jahresbrutto, p)
      - arbeitgeberzuschuss(k.pkvPraemieMonat, k.jahresbrutto - u, p)) * 12;

    return {
      verlorenerZuschuss,
      ersparnis: rvTeil * (rvSatz + avSatz) - verlorenerZuschuss,
      /*
        Kein Vorzeichenfehler: sinkt der Zuschuss, steigt der EIGENE
        Praemienanteil — und der ist zu 80 % Sonderausgabe. Der abziehbare
        Aufwand faellt also weniger stark, als die Rentenversicherung allein
        ergaebe, und kann sogar steigen. Dann ist der Wert negativ, und die
        zvE-Minderung faellt entsprechend groesser aus. Das ist richtig so.
      */
      wegfallenderAbzug: rvTeil * rvSatz - verlorenerZuschuss * PKV_BASISANTEIL,
    };
  }

  const kvTeil = anteilUnterGrenze(k.jahresbrutto, u, p.bbgKvJahr);
  const kvSatz = p.kv.allgemeinerSatz / 2 + p.kv.zusatzbeitrag / 2;
  const pvSatz = p.pv.satz / 2;

  return {
    verlorenerZuschuss: 0,
    ersparnis: kvTeil * (kvSatz + pvSatz) + rvTeil * (rvSatz + avSatz),
    /*
      Rentenversicherung voll, Krankenversicherung zu 96 % (der Rest entfaellt
      auf das Krankengeld, § 10 Abs. 1 Nr. 3 Buchst. a S. 4 EStG),
      Pflegeversicherung voll. Die Arbeitslosenversicherung bleibt aussen vor,
      sie ist kein Vorsorgeaufwand im Sinne der Vorschrift.
    */
    wegfallenderAbzug: rvTeil * rvSatz + kvTeil * (kvSatz * 0.96 + pvSatz),
  };
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

  /*
    Zur Beurteilung der Lage genuegt eine Probe mit dem tatsaechlichen
    Beitrag: nur so schlaegt der Deckel des Arbeitgeberzuschusses richtig
    durch. Der Betrag selbst wird spaeter je Jahr neu gerechnet, weil er mit
    der Beitragsdynamik waechst.
  */
  const probe = svWirkung(a.beitragMonat * 12, k, p);

  /*
    Unmittelbar zulageberechtigt ist nach § 10a EStG, wer in der gesetzlichen
    Rentenversicherung pflichtversichert ist. Ein Selbststaendiger, der nicht
    einzahlt, ist es nicht. Mittelbar ueber einen zulageberechtigten
    Ehepartner bleibt moeglich — deshalb steht es im Hinweis und wird nicht
    stillschweigend unterstellt.
  */
  const ohneZulageberechtigung = k.selbststaendig && k.grvBeitragJahr <= 0;

  if (v.typ === 'riester' && ohneZulageberechtigung) {
    hinweise.push(
      'Ohne Pflichtversicherung in der gesetzlichen Rentenversicherung besteht keine '
      + 'unmittelbare Zulageberechtigung (§ 10a EStG) — die Zulagen sind hier deshalb nicht '
      + 'angesetzt. Über einen zulageberechtigten Ehepartner ist eine mittelbare '
      + 'Berechtigung möglich; dann gilt ein Sockelbetrag von 60 € im Jahr.',
    );
  }

  if (v.typ === 'avd' && k.selbststaendig) {
    hinweise.push(
      'Selbstständige sind beim Altersvorsorgedepot ab 2027 ausdrücklich förderberechtigt — '
      + 'die Reform weitet den Kreis darauf aus. Für Sie ist es damit der geförderte Weg, '
      + 'den Riester nie geboten hat.',
    );
  }
  if (v.typ.startsWith('bav')) {
    if (k.selbststaendig) {
      hinweise.push(
        'Als Selbstständiger können Sie kein Entgelt umwandeln — dafür bräuchte es einen '
        + 'Arbeitgeber. Ein bestehender Vertrag aus früherer Anstellung lässt sich hier '
        + 'trotzdem bewerten; ausgewiesen wird dann nur die Steuerwirkung.',
      );
    } else if (k.beamter) {
      hinweise.push(
        'Als Beamter zahlen Sie keine Sozialabgaben. Eine Entgeltumwandlung spart hier '
        + 'nur Steuern, keine Beiträge.',
      );
    } else if (k.privatVersichert) {
      /*
        Der wichtigste der drei Hinweise: er dreht die Aussage um. Wer privat
        versichert ist und unter der Beitragsbemessungsgrenze verdient, spart
        durch eine Entgeltumwandlung sozialversicherungsrechtlich fast nichts
        — der verlorene Arbeitgeberzuschuss frisst die Ersparnis bei Renten-
        und Arbeitslosenversicherung nahezu auf.
      */
      hinweise.push(
        'Sie sind privat krankenversichert: Ihre Prämie hängt am Vertrag, nicht am Gehalt. '
        + 'Eine Entgeltumwandlung spart deshalb keine Kranken- und Pflegebeiträge, sondern '
        + 'nur Renten- und Arbeitslosenversicherung.',
      );
      if (probe.verlorenerZuschuss > 0.5) {
        hinweise.push(
          'Ihre Prämie ist im Verhältnis zum Gehalt so hoch, dass sich der Zuschuss Ihres '
          + 'Arbeitgebers nach dem beitragspflichtigen Entgelt bemisst (§ 257 SGB V) — und '
          + 'mit der Umwandlung sinkt. Das kostet Sie '
          + `${euroText(probe.verlorenerZuschuss / 12)} im Monat und hebt die Ersparnis bei `
          + 'Renten- und Arbeitslosenversicherung nahezu auf. Die Umwandlung lohnt sich für '
          + 'Sie über die Steuer, nicht über die Sozialabgaben.',
        );
      }
    } else if (probe.ersparnis <= 0.01) {
      hinweise.push(
        'Das Gehalt liegt über beiden Beitragsbemessungsgrenzen. Eine Entgeltumwandlung '
        + 'spart hier keine Sozialabgaben mehr.',
      );
    }
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
      //
      // Unmittelbar zulageberechtigt ist nach § 10a EStG, wer in der
      // gesetzlichen Rentenversicherung pflichtversichert ist. Ein
      // Selbststaendiger ohne diese Pflicht ist es nicht — ihm Zulagen
      // gutzuschreiben verspraeche Geld, das nicht fliesst.
      const roh = ohneZulageberechtigung ? 0 : riesterZulagen(a.kinder, jahr, p);
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

      /*
        Beitragsfrei ist nur, was unter 4 % der Beitragsbemessungsgrenze
        bleibt — also wirkt auch nur dieser Teil auf die Sozialabgaben.
      */
      const wirkung = svWirkung(svFrei, k, p);
      svJahr = wirkung.ersparnis;

      // Die Entgeltumwandlung mindert das zvE nicht um den vollen Betrag: mit
      // dem Bruttolohn sinken auch die abzugsfaehigen Vorsorgeaufwendungen.
      // Naeherung — der genaue Wert haengt davon ab, welche Beitraege im
      // Einzelfall unter den Hoechstbetrag des § 10 Abs. 3 EStG passen.
      const zveMinderung = Math.max(0, steuerFrei - wirkung.wegfallenderAbzug);

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
      /*
        BEFUND: `min(brutto, bbgRv) × 18,6 %` unterstellte JEDEM, sein
        Hoechstbetrag sei durch Arbeitnehmer- UND Arbeitgeberbeitraege belegt.
        Ein Selbststaendiger hat aber keinen Arbeitgeber — und die Mehrheit
        zahlt gar nicht in die gesetzliche Rentenversicherung ein. Bei ihm
        zaehlt allein sein eigener Beitrag, ohne ihn steht der volle
        Hoechstbetrag bereit. Genau deshalb ist die Basisrente das klassische
        Produkt dieser Gruppe, und genau das konnte der Rechner nicht zeigen.
      */
      const verbraucht = k.selbststaendig
        ? Math.max(0, k.grvBeitragJahr)
        : Math.min(k.jahresbrutto, p.bbgRvJahr) * p.rvSatzGesamt;
      const rahmen = Math.max(0,
        p.hoechstbetragAltersvorsorge * (steuerOpt.verheiratet ? 2 : 1) - verbraucht);
      const abziehbar = Math.min(beitragJahr, rahmen);

      if (t === 0 && k.selbststaendig && verbraucht <= 0.5) {
        hinweise.push(
          `Als Selbstständiger ohne Rentenversicherungspflicht steht Ihnen der Höchstbetrag `
          + `nach § 10 Abs. 3 EStG in voller Höhe zur Verfügung: `
          + `${euroText(rahmen / 12)} im Monat sind absetzbar. Bei einem Angestellten ist er `
          + 'bereits durch die Beiträge zur gesetzlichen Rentenversicherung weitgehend belegt.',
        );
      }

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
    kvPvKapital: k.kvPvKapital,
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
