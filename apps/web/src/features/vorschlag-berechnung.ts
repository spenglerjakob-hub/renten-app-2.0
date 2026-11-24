import {
  loesungsmix, type Jahreszeile, type LoesungId, type Loesungsmix, type MixWuensche,
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
  /** Wie viele Antworten noch fehlen. Erst mit allen gibt es einen Vorschlag. */
  offen: number;
  wuensche: MixWuensche | null;
  mix: Loesungsmix | null;
}

export function vorschlagStand(szenario: SzenarioParsed, zeile: Jahreszeile | null): VorschlagStand {
  const b = foerderBasis(szenario, zeile);
  const mitArbeitgeber = !b.kontext.beamter && !b.kontext.selbststaendig;
  const a = szenario.loesungen.wuensche;
  const offen = [a.verfuegbar, a.auszahlung, a.foerderung, ...(mitArbeitgeber ? [a.arbeitgeber] : [])]
    .filter((x) => x === undefined).length;
  if (!a.verfuegbar || !a.auszahlung || !a.foerderung || (mitArbeitgeber && !a.arbeitgeber)) {
    return { mitArbeitgeber, offen, wuensche: null, mix: null };
  }
  const wuensche: MixWuensche = {
    verfuegbar: a.verfuegbar,
    auszahlung: a.auszahlung,
    foerderung: a.foerderung,
    // Ohne die Frage gibt es keine Antwort — eine frueher gegebene zaehlt dann nicht.
    arbeitgeber: mitArbeitgeber ? a.arbeitgeber ?? 'nein' : 'nein',
  };
  const mix = loesungsmix(
    b.kontext, b.steuerOpt, b.p, szenario.loesungen.nettoMonat, wuensche, loesungsOptionen(szenario.loesungen),
  );
  return { mitArbeitgeber, offen: 0, wuensche, mix };
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
 */
export function angeboteAusMix(mix: Loesungsmix): NeuesAngebot[] {
  return mix.teile.map(({ id, loesung }) => ({
    loesung: id,
    name: '',
    inhaber: 'A' as const,
    beitragMonat: Math.round(loesung.eigenbeitragMonat),
    agZuschussMonat: Math.round(loesung.agZuschussMonat * 100) / 100,
    dynamik: 0,
    renteMonat: 0,
    kapital: 0,
  }));
}
