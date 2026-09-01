import {
  vertragsTuev, renteOderKapital, bruttoZuNetto, parameterFuer, parseDatum,
  type Jahreszeile, type TuevErgebnis, type RenteOderKapital, type Vertrag,
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
    pkvPraemieMonat: szenario.haushalt.kvStatus === 'pkv' ? szenario.haushalt.pkvPraemieMonat : 0,
  }, p);
  return { p, jahresbrutto: n.jahresbrutto, zve: n.zve, monatsbrutto: n.monatsbrutto };
}

/** Ein Jahr aus einem Datumsfeld, egal ob TT.MM.JJJJ oder JJJJ-MM-TT. */
function jahrAus(datum: string, ersatz: number): number {
  return parseDatum(datum)?.jahr ?? ersatz;
}

export function tuevPositionen(
  szenario: SzenarioParsed,
  zeile: Jahreszeile | null,
): TuevPosition[] {
  const basis = tuevBasis(szenario);
  const jetzt = new Date().getFullYear();

  return szenario.tuev.flatMap((t) => {
    const v = szenario.vertraege.find((x) => x.id === t.vertragId);
    if (!v) return [];

    const posten = zeile?.posten.find((x) => x.id === v.id);
    const istKapital = v.typ === 'bavKapital' || v.typ === 'prvKapital';

    // Die Auszahlseite kommt VOLLSTAENDIG aus der Projektion — Brutto und
    // Abzuege, nicht nur das Netto. Nur so koennen Bildschirm, Gutachten und
    // Zeitachse nicht auseinanderlaufen.
    const nettoRenteMonat = !istKapital && posten ? posten.nettoJahr / 12 : 0;
    const bruttoRenteMonat = !istKapital && posten ? posten.bruttoJahr / 12 : 0;
    const kvPvMonat = !istKapital && posten ? posten.kvPvJahr / 12 : 0;
    const steuerMonat = !istKapital && posten ? posten.steuerJahr / 12 : 0;

    const nettoKapital = istKapital && posten ? posten.nettoJahr : 0;
    const bruttoKapital = istKapital && posten ? posten.bruttoJahr : 0;
    const steuerKapital = istKapital && posten ? posten.steuerJahr + posten.kvPvJahr : 0;

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
