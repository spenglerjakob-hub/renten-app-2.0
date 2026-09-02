import {
  vertragsTuev, renteOderKapital, bruttoZuNetto, parameterFuer, parseDatum, pkvImJahr,
  type Jahreszeile, type TuevErgebnis, type RenteOderKapital, type Vertrag,
  type ProjektionsErgebnis,
  type LegalParameters,
} from '@renten/engine';
import type { SzenarioParsed } from '../store/szenario';

/**
 * Die Vertrags-TUEV-Rechnung, herausgeloest aus der Oberflaeche.
 *
 * Sie stand bis dahin mitten im JSX von VertragsTuev.tsx. Fuer das gedruckte
 * Gutachten wird dieselbe Rechnung ein zweites Mal gebraucht — sie dort
 * nachzubauen hiesse, zwei Fassungen derselben Rechnung zu pflegen, und die
 * laufen auseinander. Deshalb: eine Funktion, zwei Aufrufer.
 */

export interface TuevPosition {
  vertrag: Vertrag;
  ergebnis: TuevErgebnis;
  vergleich: RenteOderKapital | null;
  /** Wird der Vertrag als Kapital ausgezahlt statt als Rente? */
  istKapital: boolean;
  alterBeiRentenbeginn: number;
  rentenbeginnJahr: number;
}

/** Bemessungsgrundlage: das tatsaechliche Bruttogehalt und das zvE. */
export function tuevBasis(szenario: SzenarioParsed): {
  p: LegalParameters; jahresbrutto: number; zve: number; monatsbrutto: number;
} {
  const jahr = new Date().getFullYear();
  const p = parameterFuer(jahr, { indexRate: szenario.annahmen.tarifIndex });
  const brutto = szenario.einkommenHeute.betrag * szenario.einkommenHeute.auszahlungen;
  const n = bruttoZuNetto(brutto, {
    verheiratet: szenario.haushalt.verheiratet,
    bundesland: szenario.haushalt.bundesland,
    kirchensteuerpflichtig: szenario.haushalt.kirchensteuer,
    kinder: { hatKinder: szenario.haushalt.hatKinder, kinderUnter25: szenario.haushalt.kinderUnter25 },
    beamter: szenario.einkommenHeute.modus === 'besoldung',
    // Der Vertrags-TUEV rechnet mit dem HEUTIGEN Netto, also auch mit der
    // heutigen Praemie — inklusive eines laufenden Entlastungstarifs, denn der
    // belastet das Budget genauso.
    privatVersichert: szenario.haushalt.kvStatus === 'pkv',
    pkvPraemieMonat: szenario.haushalt.kvStatus === 'pkv'
      ? pkvImJahr(szenario.haushalt.pkv, alterHeuteA(szenario), 0).gesamtMonat
      : 0,
  }, p);
  return { p, jahresbrutto: n.jahresbrutto, zve: n.zve, monatsbrutto: n.monatsbrutto };
}

/** Alter von Person A heute — steuert den Praemienverlauf. */
function alterHeuteA(szenario: SzenarioParsed): number {
  const geburt = parseDatum(szenario.personen[0]?.geburtsdatum ?? '');
  return geburt ? new Date().getFullYear() - geburt.jahr : 40;
}

/** Ein Jahr aus einem Datumsfeld, egal ob TT.MM.JJJJ oder JJJJ-MM-TT. */
function jahrAus(datum: string, ersatz: number): number {
  return parseDatum(datum)?.jahr ?? ersatz;
}

export function tuevPositionen(
  szenario: SzenarioParsed,
  zeile: Jahreszeile | null,
  /**
   * Einmalige Kapitalauszahlungen. Sie stehen BEWUSST nicht in der
   * Jahreszeile — eine Einmalzahlung ist keine laufende Rente. Der TUEV
   * braucht sie trotzdem, sonst zeigt er bei genau diesen Vertraegen null.
   */
  kapitalauszahlungen: ProjektionsErgebnis['kapitalauszahlungen'] = [],
): TuevPosition[] {
  const basis = tuevBasis(szenario);
  const jetzt = new Date().getFullYear();

  return szenario.tuev.flatMap((t) => {
    const v = szenario.vertraege.find((x) => x.id === t.vertragId);
    if (!v) return [];

    const posten = zeile?.posten.find((x) => x.id === v.id);
    // Nicht die Vertragsart entscheidet, sondern die gewaehlte Verwendung:
    // eine Kapitalauszahlung, die ueber 25 Jahre verrentet wird, liefert in
    // der Zeitachse eine MONATSRENTE. Wer hier nach der Art fragt, sucht
    // einen Einmalbetrag, den es nicht gibt, und zeigt 0 EUR an.
    const einmal = kapitalauszahlungen.find((x) => x.vertragId === v.id);
    const istKapital = einmal !== undefined;

    // Die Auszahlseite kommt VOLLSTAENDIG aus der Projektion — Brutto und
    // Abzuege, nicht nur das Netto. Nur so koennen Bildschirm, Gutachten und
    // Zeitachse nicht auseinanderlaufen.
    const nettoRenteMonat = !istKapital && posten ? posten.nettoJahr / 12 : 0;
    const bruttoRenteMonat = !istKapital && posten ? posten.bruttoJahr / 12 : 0;
    const kvPvMonat = !istKapital && posten ? posten.kvPvJahr / 12 : 0;
    const steuerMonat = !istKapital && posten ? posten.steuerJahr / 12 : 0;

    // Bei der Einmalzahlung mindern zwei Posten den Betrag: die Steuer im
    // Zuflussjahr und die KV/PV auf die Kapitalleistung (§ 229 SGB V, 1/120
    // ueber 120 Monate). Beide kommen fertig aus dem Rechenkern.
    const bruttoKapital = einmal?.bruttoKapital ?? 0;
    const steuerKapital = einmal ? einmal.steuer + einmal.kvPvGesamt : 0;
    const nettoKapital = einmal ? Math.max(0, einmal.nettoKapital - einmal.kvPvGesamt) : 0;

    const person = szenario.personen.find((x) => x.id === v.inhaber) ?? szenario.personen[0]!;
    const rentenbeginnJahr = jahrAus(person.rentenbeginn, jetzt + 20);
    const alterBeiRentenbeginn = rentenbeginnJahr - jahrAus(person.geburtsdatum, 1980);

    const ergebnis = vertragsTuev(
      v,
      {
        beitragMonat: t.beitragMonat,
        dynamik: t.dynamik,
        agZuschussMonat: t.agZuschussMonat,
        kinder: t.kinder,
        beginnJahr: t.beginnJahr,
        lebenserwartung: t.lebenserwartung,
      },
      {
        jahresbrutto: basis.jahresbrutto,
        zveHeute: basis.zve,
        beamter: szenario.einkommenHeute.modus === 'besoldung',
        /*
          Ohne diese beiden Angaben rechnete der TUEV jedem Nicht-Beamten den
          KV/PV-Anteil als Ersparnis an — bei einem privat Versicherten das
          Doppelte des Richtigen. Die Praemie ist Bezugsgroesse fuer den
          Arbeitgeberzuschuss, der mit dem umgewandelten Entgelt sinkt; ohne
          Entlastungstarif, denn der Zuschuss haengt an der Praemie.
        */
        privatVersichert: szenario.haushalt.kvStatus === 'pkv',
        pkvPraemieMonat: szenario.haushalt.kvStatus === 'pkv'
          ? pkvImJahr(szenario.haushalt.pkv, alterHeuteA(szenario), 0).praemieMonat
          : 0,
        rentenbeginnJahr,
        alterBeiRentenbeginn,
        bruttoRenteMonat, kvPvMonat, steuerMonat, nettoRenteMonat,
        bruttoKapital, steuerKapital, nettoKapital,
      },
      szenario,
      basis.p,
    );

    // Der Vergleich braucht eine ECHTE Kapitalalternative. Ohne sie verglichen
    // wir die Rente mit ihrer eigenen Auszahlungssumme — das ergibt immer
    // wieder die Lebenserwartung, also nichts.
    const vergleichsKapital = nettoKapital > 0 ? nettoKapital : t.vergleichKapitalNetto;
    const vergleich = t.vergleichen && vergleichsKapital > 0 && nettoRenteMonat > 0
      ? renteOderKapital(nettoRenteMonat, vergleichsKapital, alterBeiRentenbeginn)
      : null;

    return [{ vertrag: v, ergebnis, vergleich, istKapital, alterBeiRentenbeginn, rentenbeginnJahr }];
  });
}
