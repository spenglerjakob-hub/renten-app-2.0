import {
  loesungsmix, loesungsmixEigen, loesungenGesperrt,
  type Jahreszeile, type LoesungId, type Loesungsmix, type MixAusgelassen, type MixWuensche,
} from '@renten/engine';
import type { Angebot, SzenarioParsed } from '../store/szenario';
import { foerderBasis, loesungsOptionen } from './tuev-berechnung';

/**
 * DER VORSCHLAG — aus den Antworten des Kunden und seinem Beitrag der Mix
 * der Loesungen (`loesungsmix` im Rechenkern). EINE Stelle fuer den
 * Bildschirm, die Zeile der Etappe und das Gutachten: Alle drei zeigen
 * denselben Vorschlag.
 */

export interface VorschlagStand {
  /**
   * Wird nach dem Arbeitgeber gefragt? Nur, wo eine Betriebsrente moeglich
   * ist — Beamte und Selbststaendige wandeln kein Entgelt um.
   */
  mitArbeitgeber: boolean;
  /** Wie viele Antworten noch fehlen. Erst mit allen gibt es einen Vorschlag — ausser von Hand (`eigen`). */
  offen: number;
  /** Die Antworten, sobald alle gegeben sind — auch bei einer Verteilung von Hand, fuer das Gutachten */
  wuensche: MixWuensche | null;
  mix: Loesungsmix | null;
  /**
   * Die Verteilung ist VON HAND eingetragen (`loesungen.eigen`): Der Berater
   * bestimmt Loesungen und Betraege, die Antworten aendern sie nicht. `mix`
   * steht dann auch ohne Antworten da.
   */
  eigen: boolean;
  /** Was es fuer diesen Haushalt nicht gibt — diese Zeilen sperrt die Eingabe und nennt den Grund */
  gesperrt: MixAusgelassen[];
}

export type EigenTeil = SzenarioParsed['loesungen']['eigen']['teile'][number];

/** Die Reihenfolge der Loesungen — im Vorschlag, in der Eingabe und im Gutachten dieselbe. */
export const LOESUNG_REIHENFOLGE: readonly LoesungId[] = ['avd', 'bav', 'basis', 'privat'];

const auf2 = (n: number) => Math.round(n * 100) / 100;

export function vorschlagStand(szenario: SzenarioParsed, zeile: Jahreszeile | null): VorschlagStand {
  const b = foerderBasis(szenario, zeile);
  const mitArbeitgeber = !b.kontext.beamter && !b.kontext.selbststaendig;
  const a = szenario.loesungen.wuensche;
  const offen = [a.verfuegbar, a.auszahlung, a.foerderung, ...(mitArbeitgeber ? [a.arbeitgeber] : [])]
    .filter((x) => x === undefined).length;
  const optionen = loesungsOptionen(szenario.loesungen);
  const gesperrt = loesungenGesperrt(b.kontext, b.steuerOpt, b.p, optionen);
  const wuensche: MixWuensche | null = !a.verfuegbar || !a.auszahlung || !a.foerderung || (mitArbeitgeber && !a.arbeitgeber)
    ? null
    : {
      verfuegbar: a.verfuegbar,
      auszahlung: a.auszahlung,
      foerderung: a.foerderung,
      // Ohne die Frage gibt es keine Antwort — eine frueher gegebene zaehlt dann nicht.
      arbeitgeber: mitArbeitgeber ? a.arbeitgeber ?? 'nein' : 'nein',
    };
  /*
    VON HAND geht vor: Was der Berater eingetragen hat, gilt — auch ohne
    Antworten und gegen jede Regel. Gerechnet wird wie beim Vorschlag aus den
    Antworten, eine Loesung nach der anderen (`loesungsmixEigen`).
  */
  if (szenario.loesungen.eigen.aktiv) {
    const mix = loesungsmixEigen(
      b.kontext, b.steuerOpt, b.p,
      szenario.loesungen.eigen.teile.map((x) => ({ id: x.loesung, betragMonat: x.betragMonat, vorgabe: x.vorgabe })),
      optionen,
    );
    return { mitArbeitgeber, offen, wuensche, mix, eigen: true, gesperrt };
  }
  if (!wuensche) return { mitArbeitgeber, offen, wuensche: null, mix: null, eigen: false, gesperrt };
  const mix = loesungsmix(b.kontext, b.steuerOpt, b.p, szenario.loesungen.nettoMonat, wuensche, optionen);
  return { mitArbeitgeber, offen: 0, wuensche, mix, eigen: false, gesperrt };
}

/**
 * Die Zeilen fuer die Eingabe von Hand, ausgehend vom Vorschlag aus den
 * Antworten: je Baustein sein Netto-Aufwand. So springt beim ersten Aendern
 * nichts — die uebrigen Bausteine bleiben, wie sie vorgeschlagen waren.
 */
export function eigenAusMix(mix: Loesungsmix | null): EigenTeil[] {
  return (mix?.teile ?? []).map((x) => ({
    loesung: x.id, betragMonat: auf2(x.loesung.nettoMonat), vorgabe: 'netto' as const, name: '',
  }));
}

/** Eine Zeile der eigenen Verteilung setzen — je Loesung hoechstens eine, in fester Reihenfolge. */
export function eigenSetzen(teile: readonly EigenTeil[], loesung: LoesungId, p: Partial<Omit<EigenTeil, 'loesung'>>): EigenTeil[] {
  const alt = teile.find((x) => x.loesung === loesung);
  const neu: EigenTeil = { betragMonat: 0, vorgabe: 'netto', name: '', ...alt, ...p, loesung };
  return LOESUNG_REIHENFOLGE.flatMap((id) => (id === loesung ? [neu] : teile.filter((x) => x.loesung === id).slice(0, 1)));
}

/** Die Farbe eines Bausteins im Balken — einfarbig abgestuft, wie alle Daten. */
export const MIX_FARBE: Record<LoesungId, string> = {
  avd: 'bg-ui-tinte',
  bav: 'bg-ui-daten-2',
  basis: 'bg-ui-daten-3',
  privat: 'bg-ui-luecke',
};

type NeuesAngebot = Omit<Angebot, 'id'>;

/**
 * Der Vorschlag als Angebote: je Baustein eines, mit seinem Beitrag als
 * Ausgangspunkt. Die Rente traegt man ein, wenn der Anbieter sie nennt.
 *
 * Von Hand eingetragen (`eigen`) gehen Anbieter und Tarif mit, und ein als
 * Beitrag eingetragener Betrag bleibt auf den Cent, wie er eingetragen ist —
 * ausser der Foerderrahmen hat ihn begrenzt.
 */
export function angeboteAusMix(mix: Loesungsmix, eigen: readonly EigenTeil[] = []): NeuesAngebot[] {
  return mix.teile.map(({ id, loesung }) => {
    const zeile = eigen.find((x) => x.loesung === id);
    return {
      loesung: id,
      name: zeile?.name.trim() ?? '',
      inhaber: 'A' as const,
      beitragMonat: zeile?.vorgabe === 'brutto' ? auf2(loesung.eigenbeitragMonat) : Math.round(loesung.eigenbeitragMonat),
      agZuschussMonat: auf2(loesung.agZuschussMonat),
      dynamik: 0,
      renteMonat: 0,
      kapital: 0,
      // Bis jemand daran arbeitet, weicht es einem neuen Vorschlag (`angeboteMitVorschlag`).
      ausVorschlag: true,
    };
  });
}
