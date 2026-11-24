import type { LegalParameters } from '../params/types.js';
import { BAV_AG_PFLICHTZUSCHUSS, type FoerderKontext, type SteuerOptionen } from './foerdercheck.js';
import { SV_FREI_QUOTE } from './vertrags-tuev.js';
import { loesungFuer, type Loesung, type LoesungId, type LoesungsOptionen } from './loesungen.js';

/**
 * LOESUNGSMIX — aus dem, was dem Kunden wichtig ist, ein Vorschlag, wie sich
 * sein Beitrag auf die Loesungen verteilt.
 *
 * Der Vergleich (`loesungsvergleich`) stellt vier Loesungen nebeneinander und
 * laesst die Wahl offen. Im Gespraech ist die Frage eine andere: „Was passt
 * zu mir?" Die Antwort ist selten EINE Loesung — wer Zulagen mitnehmen und
 * trotzdem an sein Geld kommen will, braucht zwei. Dieser Baustein mischt.
 *
 * BEWUSST FESTE REGELN, KEIN GELERNTES MODELL. Derselbe Fall ergibt immer
 * denselben Vorschlag, und zu jedem Baustein laesst sich sagen, warum er
 * dabei ist — und zu jedem, der fehlt, warum nicht. Das braucht die
 * Beratung: Der Vorschlag steht spaeter im Gutachten.
 *
 * DIE REGELN, in dieser Reihenfolge:
 *
 *   1. VERFUEGBAR BLEIBT, WAS VERFUEGBAR BLEIBEN SOLL. Je nach Antwort bleibt
 *      nichts, ein Drittel oder zwei Drittel des Beitrags in der privaten
 *      Vorsorge (Schicht 3) — nur dort kommt man vor der Rente an das Geld.
 *      Wer im Alter Kapital will, behaelt mindestens ein Drittel dort: Voll
 *      als Kapital auszahlen laesst sich nur die private Vorsorge.
 *   2. DER REST GEHT DORTHIN, WO ETWAS DAZUKOMMT. Zuerst das
 *      Altersvorsorgedepot (Zulagen) und, wenn der Arbeitgeber eingebunden
 *      werden soll, die Betriebsrente (Arbeitgeberzuschuss) — zu gleichen
 *      Teilen, jeweils bis zum Foerderrahmen. Ist einer voll, bekommt der
 *      andere den Rest. Die Betriebsrente hoechstens bis zur
 *      sozialabgabenfreien Grenze (4 % der Beitragsbemessungsgrenze, der
 *      Arbeitgeberzuschuss zaehlt mit): Darueber spart die Umwandlung nur
 *      noch Steuer, der Pflichtzuschuss entfaellt — und die Rente bleibt im
 *      Alter trotzdem beitragspflichtig.
 *   3. DANACH DIE BASISRENTE — nur, wer eine lebenslange Rente will, das Geld
 *      vorher nicht braucht und mit dem Beitrag mindestens ein Viertel an
 *      Steuer spart. Sie ist die starrste Loesung; deshalb steht sie hinten.
 *   4. WAS DANN NOCH UEBRIG IST, fliesst ohne Foerderung in die private
 *      Vorsorge.
 *
 * Kein Vertrag unter 25 EUR im Monat: Darunter lohnt ein eigener Vertrag
 * nicht, und die Anbieter nehmen ihn meist gar nicht an.
 *
 * GERECHNET WIRD EINE LOESUNG NACH DER ANDEREN, nicht jede fuer sich: Die
 * Betriebsrente mindert das zu versteuernde Einkommen, das Depot und die
 * Basisrente sparen ihre Steuer dann auf dem, was uebrig ist. So ist die
 * Ersparnis zusammen nie groesser als in Wirklichkeit — nebeneinander
 * gerechnet zaehlte der hoechste Steuersatz mehrfach.
 *
 * Wie der Vergleich zeigt der Mix die EINZAHLSEITE. Was im Alter netto
 * ankommt, haengt am Angebot und wird dort gerechnet.
 */

/** Was dem Kunden wichtig ist — die vier Fragen vor dem Vorschlag. */
export interface MixWuensche {
  /** Vor der Rente an das Geld kommen: nein, einen Teil, moeglichst alles */
  verfuegbar: 'nein' | 'teil' | 'ja';
  /** Wie es im Alter fliessen soll: lebenslange Rente, offen, Kapital */
  auszahlung: 'rente' | 'offen' | 'kapital';
  /** Zulagen und Steuervorteile mitnehmen — auch wenn das Geld dann gebunden ist */
  foerderung: 'ja' | 'nein';
  /** Den Arbeitgeber einbinden: Betriebsrente durch Entgeltumwandlung */
  arbeitgeber: 'ja' | 'nein';
}

/** Regel 1: Anteil des Beitrags, der vor der Rente verfuegbar bleibt. */
export const MIX_VERFUEGBAR: Record<MixWuensche['verfuegbar'], number> = { nein: 0, teil: 1 / 3, ja: 2 / 3 };
/** Regel 1: Wer im Alter Kapital will, behaelt mindestens diesen Anteil in der privaten Vorsorge. */
export const MIX_KAPITAL_MINDESTENS = 1 / 3;
/** Kein Vertrag unter diesem Netto-Aufwand im Monat. */
export const MIX_MINDESTBEITRAG = 25;
/** Regel 3: Basisrente erst ab dieser Steuerersparnis je Euro Beitrag. */
export const MIX_BASIS_AB_STEUERQUOTE = 0.25;

/** Die Anteile in glatten Betraegen — 65 EUR liest sich wie eine Entscheidung, 66,67 EUR wie ein Rechenrest. */
const SCHRITT = 5;
const glatt = (n: number) => Math.round(n / SCHRITT) * SCHRITT;

/** Warum eine Loesung im Vorschlag fehlt. */
export type MixGrund =
  /** Foerderung bzw. Arbeitgeber sind nicht gewuenscht */
  | 'nichtGewuenscht'
  /** Fuer diesen Haushalt nicht zu haben — etwa die Betriebsrente fuer Beamte */
  | 'nichtMoeglich'
  /** Der Foerderrahmen ist mit den bestehenden Vertraegen schon voll */
  | 'ausgeschoepft'
  /** Der Beitrag reicht nicht fuer einen weiteren Vertrag */
  | 'zuKlein'
  /** Basisrente: zahlt nur eine lebenslange Rente — gewuenscht ist Kapital oder Offenheit */
  | 'nurRente'
  /** Basisrente: der Kunde will vor der Rente an sein Geld kommen */
  | 'gebunden'
  /** Basisrente: die Steuerersparnis ist zu klein */
  | 'steuerGering'
  /** Basisrente: erst, wenn Depot und Betriebsrente ausgeschoepft sind */
  | 'nachrangig'
  /** Private Vorsorge: der ganze Beitrag passt in gefoerderte Vertraege */
  | 'nichtNoetig';

export interface MixAusgelassen {
  id: LoesungId;
  grund: MixGrund;
  /** Der Satz der Loesung selbst, wo sie einen hat („Beamte wandeln kein Entgelt um.") */
  hinweis?: string;
}

export interface MixTeil {
  id: LoesungId;
  /** Die Loesung mit IHREM Anteil gerechnet: Netto-Aufwand, Beitrag, Foerderung, Vertrag */
  loesung: Loesung;
  /** Anteil am Netto-Aufwand des ganzen Vorschlags, 0 bis 1 */
  anteil: number;
}

export interface Loesungsmix {
  /** Die Bausteine des Vorschlags — Depot, Betriebsrente, Basisrente, privat; nur, was Geld bekommt */
  teile: MixTeil[];
  /** Was der Kunde im Monat netto aufwendet — die Summe der Bausteine */
  nettoMonat: number;
  /** Was im Monat in den Vertraegen landet */
  vertragMonat: number;
  zulageMonat: number;
  agZuschussMonat: number;
  steuerErsparnisMonat: number;
  svErsparnisMonat: number;
  /** Was zum eigenen Netto-Aufwand dazukommt: Vertrag minus Aufwand */
  dazuMonat: number;
  /** Regel 1: der Anteil, der verfuegbar bleiben soll (0, 1/3 oder 2/3) */
  verfuegbarQuote: number;
  /** Davon in der privaten Vorsorge: der Teil, der verfuegbar bleiben SOLL */
  verfuegbarMonat: number;
  /** … und der Teil, der dort landet, weil die Foerderrahmen voll sind */
  ueberlaufMonat: number;
  /** Vom Wunsch nicht verplant: zu wenig fuer einen weiteren Vertrag */
  uebrigMonat: number;
  ausgelassen: MixAusgelassen[];
  /** Die Kapital-Regel hat gegriffen: mindestens ein Drittel bleibt privat */
  kapitalRegel: boolean;
  /** Der Beitrag reicht nur fuer EINEN Vertrag — die Aufteilung nach Regel 1 entfaellt */
  einVertrag: boolean;
  /** Die Betriebsrente steht an der sozialabgabenfreien Grenze — mehr waere nur noch steuerfrei */
  bavAnGrenze: boolean;
}

const REIHENFOLGE: readonly LoesungId[] = ['avd', 'bav', 'basis', 'privat'];

export function loesungsmix(
  k: FoerderKontext,
  steuerOpt: SteuerOptionen,
  p: LegalParameters,
  nettoMonat: number,
  w: MixWuensche,
  opt: LoesungsOptionen = {},
): Loesungsmix {
  const wunsch = Math.max(0, nettoMonat);
  const o: LoesungsOptionen = { ...opt, vorgabe: 'netto' };
  const rechne = (id: LoesungId, kontext: FoerderKontext, betrag: number) =>
    loesungFuer(id, kontext, steuerOpt, p, betrag, o);
  /** Der Kontext, nachdem eine Loesung das zu versteuernde Einkommen gemindert hat. */
  const nach = (kontext: FoerderKontext, l: Loesung): FoerderKontext => ({
    ...kontext,
    zveHeute: Math.max(0, kontext.zveHeute - l.zveMinderungMonat * 12),
  });

  const ausgelassen: MixAusgelassen[] = [];
  const lassen = (id: LoesungId, grund: MixGrund, hinweis?: string) =>
    ausgelassen.push({ id, grund, ...(hinweis ? { hinweis } : {}) });

  /*
    Wie viel Netto-Aufwand die Betriebsrente hoechstens bekommt: die
    Umwandlung, die mit dem Arbeitgeberzuschuss gerade noch frei von
    Sozialabgaben bleibt. Der Zuschuss verbraucht die Grenze mit.
  */
  const bavHoechstens = (() => {
    const genutzt = Math.max(0, k.bavEigenanteilJahr) + Math.max(0, k.bavArbeitgeberJahr);
    const frei = Math.max(0, SV_FREI_QUOTE * p.bbgRvJahr - genutzt);
    const jeEuro = frei / (1 + Math.max(BAV_AG_PFLICHTZUSCHUSS, o.agZuschussQuote ?? BAV_AG_PFLICHTZUSCHUSS));
    const umwandlung = o.agZuschussFestMonat === undefined
      ? jeEuro
      : Math.min(frei / (1 + BAV_AG_PFLICHTZUSCHUSS), Math.max(0, frei - Math.max(0, o.agZuschussFestMonat) * 12));
    return umwandlung <= 0 ? 0 : loesungFuer('bav', k, steuerOpt, p, umwandlung / 12, { ...o, vorgabe: 'brutto' }).nettoMonat;
  })();

  /* Was kommt in Frage? Jede Loesung einmal mit dem ganzen Wunsch — das zeigt, ob und wie weit ihr Rahmen frei ist. */
  const probe = { avd: rechne('avd', k, wunsch), bav: rechne('bav', k, wunsch), basis: rechne('basis', k, wunsch) };
  const kommt = { avd: false, bav: false, basis: false };

  if (w.foerderung !== 'ja') lassen('avd', 'nichtGewuenscht');
  else if (!probe.avd.verfuegbar) lassen('avd', 'ausgeschoepft');
  else kommt.avd = true;

  if (!probe.bav.verfuegbar) lassen('bav', 'nichtMoeglich', probe.bav.hinweise[0]);
  else if (w.arbeitgeber !== 'ja') lassen('bav', 'nichtGewuenscht');
  else if (wunsch > 0 && Math.min(probe.bav.nettoMonat, bavHoechstens) <= 0.5) lassen('bav', 'ausgeschoepft');
  else kommt.bav = true;

  if (w.foerderung !== 'ja') lassen('basis', 'nichtGewuenscht');
  else if (w.auszahlung !== 'rente') lassen('basis', 'nurRente');
  else if (w.verfuegbar === 'ja') lassen('basis', 'gebunden');
  else if (!probe.basis.verfuegbar) lassen('basis', 'ausgeschoepft');
  else kommt.basis = true;

  /* Regel 1: der verfuegbare Teil. Ohne gefoerderte Loesung ist alles privat — dann gibt es nichts aufzuteilen. */
  const gefoerdert = kommt.avd || kommt.bav || kommt.basis;
  const kapitalRegel = gefoerdert && w.auszahlung === 'kapital' && MIX_VERFUEGBAR[w.verfuegbar] < MIX_KAPITAL_MINDESTENS;
  const quote = Math.max(MIX_VERFUEGBAR[w.verfuegbar], w.auszahlung === 'kapital' ? MIX_KAPITAL_MINDESTENS : 0);
  let verfuegbar = !gefoerdert ? wunsch : quote > 0 ? Math.min(wunsch, glatt(wunsch * quote)) : 0;
  let einVertrag = false;
  if (gefoerdert && quote > 0 && (verfuegbar < MIX_MINDESTBEITRAG || wunsch - verfuegbar < MIX_MINDESTBEITRAG)) {
    if (wunsch >= 2 * MIX_MINDESTBEITRAG) {
      verfuegbar = verfuegbar < MIX_MINDESTBEITRAG ? MIX_MINDESTBEITRAG : wunsch - MIX_MINDESTBEITRAG;
    } else {
      // Fuer zwei Vertraege zu wenig: der eine, der dem Wunsch naeher ist.
      verfuegbar = quote > 0.5 ? wunsch : 0;
      einVertrag = wunsch > 0;
    }
  }
  const gebunden = wunsch - verfuegbar;

  /* Regel 2: Depot und Betriebsrente, zu gleichen Teilen bis zum Rahmen. */
  const bausteine: Loesung[] = [];
  let kontext = k;
  let bavAnGrenze = false;
  if (gebunden > 0.5) {
    if (kommt.avd && kommt.bav && gebunden >= 2 * MIX_MINDESTBEITRAG) {
      const haelfte = Math.min(bavHoechstens, glatt(gebunden / 2));
      let bav = rechne('bav', k, haelfte);
      let avd = rechne('avd', nach(k, bav), gebunden - bav.nettoMonat);
      if (avd.nettoMonat < gebunden - bav.nettoMonat - 0.5 && haelfte < bavHoechstens - 0.5) {
        /*
          Das Depot ist voll — die Betriebsrente bekommt, was dort nicht mehr
          hineinpasst. Mit jeder Umwandlung sinkt das Einkommen, auf dem das
          Depot Steuer spart, und sein Netto-Aufwand steigt um ein paar Cent:
          deshalb ein paar Runden, bis beides zusammenpasst. Das Depot bleibt
          dabei am Hoechstbetrag (gerechnet mit dem ganzen Teil, begrenzt ihn
          der Rahmen).
        */
        for (let i = 0; i < 4; i += 1) {
          bav = rechne('bav', k, Math.min(bavHoechstens, gebunden - avd.nettoMonat));
          avd = rechne('avd', nach(k, bav), gebunden);
        }
      }
      bavAnGrenze = bav.nettoMonat >= bavHoechstens - 0.5;
      bausteine.push(avd, bav);
      kontext = nach(nach(k, bav), avd);
    } else if (kommt.avd || kommt.bav) {
      const l = kommt.avd ? rechne('avd', k, gebunden) : rechne('bav', k, Math.min(bavHoechstens, gebunden));
      bavAnGrenze = l.id === 'bav' && gebunden >= bavHoechstens - 0.5;
      bausteine.push(l);
      kontext = nach(k, l);
      if (kommt.avd && kommt.bav) lassen('bav', 'zuKlein');
    }
  } else if (einVertrag && kommt.avd && kommt.bav) {
    lassen('bav', 'zuKlein');
  }
  const verplant = () => bausteine.reduce((s, l) => s + l.nettoMonat, 0);
  let rest = Math.max(0, gebunden - verplant());

  /* Regel 3: die Basisrente — hinter Depot und Betriebsrente, und nur mit spuerbarer Steuerersparnis. */
  if (kommt.basis) {
    const allein = bausteine.length === 0 && rest > 0.5;
    if (rest >= MIX_MINDESTBEITRAG || allein) {
      const basis = rechne('basis', kontext, rest);
      const steuerquote = basis.eigenbeitragMonat > 0 ? basis.steuerErsparnisMonat / basis.eigenbeitragMonat : 0;
      if (steuerquote >= MIX_BASIS_AB_STEUERQUOTE) {
        bausteine.push(basis);
        rest = Math.max(0, gebunden - verplant());
      } else {
        lassen('basis', 'steuerGering');
      }
    } else {
      lassen('basis', rest > 0.5 ? 'zuKlein' : 'nachrangig');
    }
  }

  /* Regel 4: was verfuegbar bleiben soll und was nirgends mehr hineinpasst. */
  const privatNetto = verfuegbar + rest;
  let uebrigMonat = 0;
  if (privatNetto >= MIX_MINDESTBEITRAG || (privatNetto > 0.5 && (verfuegbar > 0 || bausteine.length === 0))) {
    bausteine.push(rechne('privat', k, privatNetto));
  } else if (privatNetto > 0.5) {
    uebrigMonat = privatNetto;
    lassen('privat', 'zuKlein');
  } else if (wunsch > 0) {
    lassen('privat', 'nichtNoetig');
  }

  const netto = verplant();
  const summe = (f: (l: Loesung) => number) => bausteine.reduce((s, l) => s + f(l), 0);
  const vertragMonat = summe((l) => l.vertragMonat);
  const hatPrivat = bausteine.some((l) => l.id === 'privat');
  return {
    teile: [...bausteine]
      .sort((a, b) => REIHENFOLGE.indexOf(a.id) - REIHENFOLGE.indexOf(b.id))
      .map((l) => ({ id: l.id, loesung: l, anteil: netto > 0 ? l.nettoMonat / netto : 0 })),
    nettoMonat: netto,
    vertragMonat,
    zulageMonat: summe((l) => l.zulageMonat),
    agZuschussMonat: summe((l) => l.agZuschussMonat),
    steuerErsparnisMonat: summe((l) => l.steuerErsparnisMonat),
    svErsparnisMonat: summe((l) => l.svErsparnisMonat),
    dazuMonat: Math.max(0, vertragMonat - netto),
    verfuegbarQuote: gefoerdert ? quote : 1,
    verfuegbarMonat: hatPrivat ? verfuegbar : 0,
    ueberlaufMonat: hatPrivat ? rest : 0,
    uebrigMonat,
    // Jede Loesung hoechstens einmal — der erste Grund ist der, der gilt.
    ausgelassen: ausgelassen.filter((a, i) => ausgelassen.findIndex((x) => x.id === a.id) === i
      && !bausteine.some((l) => l.id === a.id)),
    kapitalRegel,
    einVertrag,
    bavAnGrenze,
  };
}
