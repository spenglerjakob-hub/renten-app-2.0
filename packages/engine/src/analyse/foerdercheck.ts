import type { LegalParameters } from '../params/types.js';
import { zusatzsteuer } from '../tax/haushalt.js';
import { euroText } from '../util/text.js';
import { svWirkung, SV_FREI_QUOTE, STEUER_FREI_QUOTE, type SvKontext } from './vertrags-tuev.js';

/**
 * FOERDERCHECK — was an Foerderung LIEGEN BLEIBT.
 *
 * Der Vertrags-TUEV prueft jeden vorhandenen Vertrag und sagt nichts ueber
 * die Foerderung, die gar nicht genutzt wird. Wer 100 EUR im Monat
 * umwandelt, obwohl 302 EUR steuerfrei moeglich waeren, sieht das nirgends;
 * ein Selbststaendiger ohne Rentenversicherungspflicht hat den vollen
 * Hoechstbetrag des § 10 Abs. 3 EStG frei und erfaehrt es nur, wenn er
 * zufaellig eine Basisrente eintraegt.
 *
 * Gerechnet wird mit denselben Bausteinen wie im TUEV — `svWirkung` und
 * `zusatzsteuer` —, nicht mit einer zweiten Fassung derselben Formeln. Der
 * Unterschied liegt allein in der Blickrichtung: der TUEV bilanziert je
 * Vertrag, der Foerdercheck je Haushalt.
 */

/**
 * Kleinster Rahmen, der noch gemeldet wird — im Monat.
 *
 * Ein Hinweis, auf den niemand handeln kann, ist Rauschen. Bei der bAV ist
 * die Schwelle niedriger, weil der Rahmen dort insgesamt klein ist
 * (8 % der Beitragsbemessungsgrenze, rund 300 EUR im Monat).
 */
const BAGATELLE_BAV = 25;
const BAGATELLE_BASIS = 100;

/**
 * Beitrag, an dem die Wirkung gezeigt wird.
 *
 * Bei der Basisrente ist der freie Rahmen oft vierstellig im Monat — was er
 * netto kostete, waere dann eine Zahl, die niemand einzahlt. Deshalb: der
 * Rahmen wird genannt, gerechnet wird an einem Betrag, den man tatsaechlich
 * ansetzen wuerde.
 */
const PROBE_HOECHSTENS = 250;

/**
 * Ab welchem Foerdersatz die Basisrente allein aus dem Einkommen heraus
 * empfohlen wird.
 *
 * 35 % erreicht ein Alleinstehender bei rund 50.000 EUR zu versteuerndem
 * Einkommen — das ist die Schwelle, ab der man von einem hoeheren Einkommen
 * sprechen kann. Tiefer angesetzt (30 % ab etwa 36.000 EUR) fiele der Befund
 * bei fast jedem an und waere damit keine Auskunft mehr, sondern Tapete.
 */
const GRENZWIRKUNG_SCHWELLE = 0.35;

/** Unter dieser Deckung gilt die gesetzliche Rente als schwache Grundlage. */
const DECKUNG_SCHWACH = 0.5;

export interface FoerderKontext extends SvKontext {
  /** Zu versteuerndes Einkommen heute — Basis fuer die Steuerwirkung */
  zveHeute: number;
  /** Eigener Jahresbeitrag zur gesetzlichen Rentenversicherung */
  grvBeitragJahr: number;
  /**
   * Laufende Entgeltumwandlung im Jahr, OHNE Arbeitgeberzuschuss.
   *
   * Der Zuschuss zaehlt zwar in die Grenzen des § 3 Nr. 63 EStG hinein, aber
   * er ist kein Verzicht auf eigenes Entgelt. Fuer die Frage „was koennte ich
   * noch umwandeln" ist der Eigenanteil die richtige Groesse; die Grenze
   * selbst wird konservativ um den Zuschuss nicht erhoeht.
   */
  bavEigenanteilJahr: number;
  /** Laufende Basisrentenbeitraege im Jahr */
  basisBeitragJahr: number;
  /**
   * Anteil der gesetzlichen Rente bzw. Pension am Zielbedarf im Rentenjahr,
   * als Dezimalzahl. Unter der Haelfte gilt sie als schwache Grundlage.
   */
  grvDeckung: number;
  /** Offene Versorgungsluecke im Monat, in HEUTIGER Kaufkraft */
  lueckeMonat: number;
}

export interface FoerderBefund {
  id: 'bav' | 'basis';
  titel: string;
  /** Freier Foerderrahmen im Monat */
  rahmenMonat: number;
  /** Beitrag im Monat, an dem die Wirkung gerechnet ist */
  probeMonat: number;
  /** Was dieser Beitrag im Jahr an Steuern und Sozialabgaben spart */
  ersparnisJahr: number;
  /** Was er nach Foerderung netto im Monat kostet */
  nettoAufwandMonat: number;
  /** Foerderquote: Ersparnis je eingesetztem Euro */
  foerderquote: number;
  text: string;
  /** Fundstelle, z. B. "§ 3 Nr. 63 EStG" */
  paragraf: string;
}

export interface SteuerOptionen {
  verheiratet: boolean;
  bundesland: string;
  kirchensteuerpflichtig: boolean;
}

/**
 * Der Hoechstbetrag des § 10 Abs. 3 EStG, soweit er noch FREI ist.
 *
 * Dieselbe Formel wie im Vertrags-TUEV: der Rahmen ist zuerst durch die
 * Beitraege zur gesetzlichen Rentenversicherung verbraucht — beim
 * Angestellten Arbeitnehmer- UND Arbeitgeberanteil, beim Beamten der fiktive
 * Gesamtbeitrag (§ 10 Abs. 3 S. 3), beim Selbststaendigen allein sein eigener
 * Beitrag. Genau daran haengt, ob eine Basisrente ueberhaupt etwas bringt.
 */
export function basisrahmenJahr(
  k: Pick<FoerderKontext, 'selbststaendig' | 'grvBeitragJahr' | 'jahresbrutto' | 'basisBeitragJahr'>,
  verheiratet: boolean,
  p: LegalParameters,
): { rahmen: number; verbraucht: number; hoechstbetrag: number } {
  const verbraucht = k.selbststaendig
    ? Math.max(0, k.grvBeitragJahr)
    : Math.min(Math.max(0, k.jahresbrutto), p.bbgRvJahr) * p.rvSatzGesamt;
  const hoechstbetrag = p.hoechstbetragAltersvorsorge * (verheiratet ? 2 : 1);
  const rahmen = Math.max(0, hoechstbetrag - verbraucht - Math.max(0, k.basisBeitragJahr));
  return { rahmen, verbraucht, hoechstbetrag };
}

export function foerdercheck(
  k: FoerderKontext,
  steuerOpt: SteuerOptionen,
  p: LegalParameters,
): FoerderBefund[] {
  const befunde: FoerderBefund[] = [];
  const bav = bavBefund(k, steuerOpt, p);
  if (bav) befunde.push(bav);
  const basis = basisBefund(k, steuerOpt, p);
  if (basis) befunde.push(basis);
  return befunde;
}

/**
 * Ungenutzter Rahmen der Entgeltumwandlung.
 *
 * Nur fuer Angestellte: ein Beamter wandelt kein Entgelt um, und ein
 * Selbststaendiger hat keinen Arbeitgeber, der es koennte.
 *
 * ZWEI GRENZEN, beide genannt, weil sie auseinanderfallen: beitragsfrei sind
 * 4 % der Beitragsbemessungsgrenze, steuerfrei 8 %. Wer zwischen beiden
 * liegt, spart Steuern, aber keine Sozialabgaben mehr — das ist ein
 * Unterschied, den man vor dem Abschluss kennen sollte und nicht danach.
 */
function bavBefund(
  k: FoerderKontext,
  steuerOpt: SteuerOptionen,
  p: LegalParameters,
): FoerderBefund | null {
  if (k.beamter || k.selbststaendig) return null;

  const genutzt = Math.max(0, k.bavEigenanteilJahr);
  const steuerRahmen = Math.max(0, STEUER_FREI_QUOTE * p.bbgRvJahr - genutzt);
  const svRahmen = Math.max(0, SV_FREI_QUOTE * p.bbgRvJahr - genutzt);
  const rahmenMonat = steuerRahmen / 12;
  if (rahmenMonat < BAGATELLE_BAV) return null;

  const probeJahr = Math.min(steuerRahmen, PROBE_HOECHSTENS * 12);
  const wirkung = svWirkung(Math.min(probeJahr, svRahmen), k, p);
  /*
    Wie im TUEV: die Umwandlung mindert das zvE nicht um den vollen Betrag,
    weil mit dem Bruttolohn auch die abziehbaren Vorsorgeaufwendungen sinken.
  */
  const zveMinderung = Math.max(0, probeJahr - wirkung.wegfallenderAbzug);
  const steuer = zusatzsteuer(k.zveHeute - zveMinderung, zveMinderung, steuerOpt, p);
  const ersparnisJahr = Math.max(0, wirkung.ersparnis + steuer);
  if (ersparnisJahr <= 0) return null;

  const nochBeitragsfrei = Math.max(0, svRahmen) / 12;
  const text = genutzt > 0.5
    ? `Sie wandeln heute ${euroText(genutzt / 12)} im Monat um. Steuerfrei möglich sind `
      + `${euroText(STEUER_FREI_QUOTE * p.bbgRvJahr / 12)} — es bleiben `
      + `${euroText(rahmenMonat)} ungenutzt`
      + (nochBeitragsfrei > 0.5
        ? `, davon ${euroText(nochBeitragsfrei)} auch beitragsfrei.`
        : '. Sozialabgaben sparen Sie darauf allerdings nicht mehr: die 4-Prozent-Grenze '
          + 'ist bereits ausgeschöpft.')
    : `Sie nutzen die Entgeltumwandlung bisher gar nicht. Steuerfrei sind `
      + `${euroText(rahmenMonat)} im Monat möglich, davon `
      + `${euroText(nochBeitragsfrei)} zusätzlich beitragsfrei.`;

  return {
    id: 'bav',
    titel: 'Betriebliche Altersvorsorge nicht ausgeschöpft',
    rahmenMonat,
    probeMonat: probeJahr / 12,
    ersparnisJahr,
    nettoAufwandMonat: Math.max(0, probeJahr - ersparnisJahr) / 12,
    foerderquote: probeJahr > 0 ? ersparnisJahr / probeJahr : 0,
    text,
    paragraf: '§ 3 Nr. 63 EStG',
  };
}

/**
 * Freier Hoechstbetrag fuer eine Basisrente.
 *
 * ZWEI ANLAESSE, ein Befund: ein hoher Foerdersatz auf einen grossen freien
 * Rahmen, oder eine gesetzliche Rente, die den Bedarf kaum deckt. Der Text
 * nennt, was zutrifft.
 *
 * DIE FALLE, DIE HIER NICHT GEBAUT WERDEN DARF: Beim gesetzlich
 * rentenversicherten Angestellten ist der Hoechstbetrag durch Arbeitnehmer-
 * und Arbeitgeberbeitrag weitgehend belegt. Eine schwache gesetzliche Rente
 * allein darf deshalb keine Empfehlung ausloesen — sonst empfiehlt das
 * Gutachten ein Produkt, dessen Foerderung der Betreffende gar nicht bekommt.
 * Beide Anlaesse setzen einen tatsaechlich freien Rahmen voraus.
 */
function basisBefund(
  k: FoerderKontext,
  steuerOpt: SteuerOptionen,
  p: LegalParameters,
): FoerderBefund | null {
  const { rahmen, verbraucht, hoechstbetrag } = basisrahmenJahr(k, steuerOpt.verheiratet, p);
  const rahmenMonat = rahmen / 12;
  if (rahmenMonat < BAGATELLE_BASIS) return null;

  const probeJahr = Math.min(rahmen, PROBE_HOECHSTENS * 12);
  const ersparnisJahr = zusatzsteuer(k.zveHeute - probeJahr, probeJahr, steuerOpt, p);
  if (ersparnisJahr <= 0) return null;

  const quote = ersparnisJahr / probeJahr;
  /*
    Der Einkommens-Anlass setzt voraus, dass ueberhaupt noch keine Basisrente
    laeuft: Wer schon eine hat, braucht keinen Hinweis darauf, dass es sie
    gibt. Bleibt bei ihm der Rahmen weit offen UND ist die gesetzliche Rente
    schwach, meldet sich der zweite Anlass ohnehin.
  */
  const anlassEinkommen = quote >= GRENZWIRKUNG_SCHWELLE && k.basisBeitragJahr <= 0.5;
  const anlassRente = k.grvDeckung < DECKUNG_SCHWACH && k.lueckeMonat > 0;
  if (!anlassEinkommen && !anlassRente) return null;

  const rahmenSatz = verbraucht <= 0.5
    ? `Ihr Höchstbetrag von ${euroText(hoechstbetrag / 12)} im Monat ist unverbraucht — `
      + 'Sie zahlen nicht in die gesetzliche Rentenversicherung ein.'
    : `Von Ihrem Höchstbetrag (${euroText(hoechstbetrag / 12)} im Monat) sind `
      + `${euroText(verbraucht / 12)} durch Beiträge zur gesetzlichen Rentenversicherung `
      + `belegt; ${euroText(rahmenMonat)} sind noch frei.`;

  const anlassSatz = anlassRente
    ? ` Ihre gesetzliche Rente deckt nur ${Math.round(k.grvDeckung * 100)} % Ihres Bedarfs, `
      + `und es fehlen ${euroText(k.lueckeMonat)} im Monat in heutiger Kaufkraft — `
      + 'eine lebenslange Rente aus '
      + 'geförderten Beiträgen schließt genau diese Lücke.'
    : ` Jeder eingezahlte Euro wird derzeit mit ${Math.round(quote * 100)} % gefördert.`;

  return {
    id: 'basis',
    titel: 'Basisrente: Höchstbetrag ungenutzt',
    rahmenMonat,
    probeMonat: probeJahr / 12,
    ersparnisJahr,
    nettoAufwandMonat: Math.max(0, probeJahr - ersparnisJahr) / 12,
    foerderquote: quote,
    text: rahmenSatz + anlassSatz,
    paragraf: '§ 10 Abs. 1 Nr. 2 b, Abs. 3 EStG',
  };
}
