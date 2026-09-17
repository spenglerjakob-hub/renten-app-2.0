import type { Szenario, Person, PersonId, EinkommenHeute } from '../model.js';
import type { LegalParameters } from '../params/types.js';
import { kvProfil, type KvProfil } from '../social/kv-profil.js';
import { pkvImJahr, type PkvAnnahmen } from '../social/pkv.js';
import { kinderImJahr, type KinderStatus } from '../social/kv-pv.js';
import { besoldung } from '../pension/beamte.js';
import { nettoZuBrutto, erwerbHaushalt, type ErwerbHaushaltErgebnis } from './netto.js';
import { parseDatum, alterExakt, heute, type Datum } from '../util/datum.js';

/**
 * DAS ERWERBSEINKOMMEN DES HAUSHALTS, WIE ES HEUTE IST — an EINER Stelle.
 *
 * BEFUND, der diese Datei ausgeloest hat: Die Ableitung stand zweimal da. Die
 * Zeitachse loeste sie vollstaendig auf (Besoldungstabelle, Netto-Umkehrung,
 * zweites Einkommen, Sozialabgaben je Person); der Vertrags-TUEV hatte
 * daneben eine verkuerzte eigene Fassung, und die war an vier Stellen falsch:
 *
 *  1. `modus: 'netto'` wurde als BRUTTO weitergereicht. Das ist die
 *     VORBELEGUNG der Eingabemaske, also der Regelfall. Bei 5.000 EUR netto
 *     im Monat setzte der TUEV ein zvE von 46.674 statt 73.570 EUR an.
 *  2. `modus: 'besoldung'` lieferte NULL, weil dort `betrag` gar nicht
 *     gefuellt ist — die Besoldung kommt aus der Tabelle. Ein Beamter sah
 *     deshalb ueberhaupt keine Steuerersparnis.
 *  3. `einkommenPartner` wurde ignoriert. Bei getrennt erfassten Einkommen
 *     fehlte das zweite vollstaendig, waehrend `verheiratet` den
 *     SPLITTINGTARIF ausloeste — halbes Einkommen zum Tarif fuer zwei.
 *  4. Bei gemeinsamer Erfassung lief der ganze Haushalt als EINE Person durch
 *     `bruttoZuNetto`. Beitragsbemessungsgrenzen und Pauschbetraege stehen
 *     aber jeder Person einzeln zu (derselbe Befund, der `erwerbHaushalt`
 *     ueberhaupt erst noetig gemacht hat — siehe dort).
 *
 * Alle vier wirkten auf das zu versteuernde Einkommen, mit dem der TUEV die
 * Foerderung einer Basisrente misst. Gegen ein Steuerblatt der AXA gerechnet
 * (3.600 EUR Jahresbeitrag, verheiratet): 217 EUR Nettoaufwand im Monat statt
 * 171 EUR. Die STEUERRECHNUNG selbst war dabei nie das Problem — sie trifft
 * das Blatt auf den Cent; falsch war allein, womit sie gefuettert wurde.
 *
 * Deshalb steht die Ableitung jetzt hier, und die Zeitachse benutzt sie
 * ebenso. Zwei Fassungen derselben Rechnung laufen frueher oder spaeter
 * auseinander — diese hier haben es getan.
 */

/** Eine beruecksichtigte Person mit aufgeloestem Geburtsdatum. */
export interface PersonHeute {
  person: Person;
  geburt: Datum;
}

/** Die Krankenversicherung EINER Person, wie sie heute steht. */
export interface KvHeute {
  id: PersonId;
  profil: KvProfil;
  /** Privat versichert IN DER ERWERBSPHASE */
  privat: boolean;
  /** Die Praemienannahmen dieser Person — Haushaltsbetrag bereits verteilt */
  annahmen: PkvAnnahmen;
  /** Alter dieser Person heute; steuert den Praemienverlauf */
  alterHeute: number;
}

/** Erwerbsart und Bruttoeinkommen EINER Person. */
export interface ErwerbsPersonHeute {
  id: PersonId;
  brutto: number;
  beamter: boolean;
  selbststaendig: boolean;
  grvBeitragJahr: number;
}

export interface ErwerbsBasisHeute {
  jahresbrutto: number;
  /** Gemeinsames zu versteuerndes Einkommen des Haushalts */
  zve: number;
  /** Sozialabgaben aller Personen zusammen */
  sv: number;
  /** Erwerbsart und Brutto je Person, in der Reihenfolge von `personen` */
  jePerson: ErwerbsPersonHeute[];
  /** Das volle Ergebnis von `erwerbHaushalt`, falls der Aufrufer mehr braucht */
  haushalt: ErwerbHaushaltErgebnis;
  hinweise: string[];
}

/**
 * Die beruecksichtigten Personen: A immer, B nur bei Verheirateten.
 *
 * Wer kein lesbares Geburtsdatum hat, faellt heraus — dieselbe Regel wie in
 * der Zeitachse, die ohne Geburts- und Rentenbeginndatum gar nicht rechnet.
 */
export function personenHeute(s: Szenario): PersonHeute[] {
  return s.personen
    .filter((p) => p.id === 'A' || s.haushalt.verheiratet)
    .map((person) => {
      const geburt = parseDatum(person.geburtsdatum);
      return geburt ? { person, geburt } : null;
    })
    .filter((x): x is PersonHeute => x !== null);
}

/**
 * Die Krankenversicherung je Person, mit verteilter Haushaltspraemie.
 *
 * `kvProfil` haelt die Regel „Person, sonst Haushalt" an einer Stelle; hier
 * kommt nur die Verteilung des Haushaltsbetrags dazu: Wer eine eigene Praemie
 * eingetragen hat, traegt sie ganz, die uebrigen privat Versicherten teilen
 * sich den Haushaltsbetrag. Ohne diese Quote zahlte bei zwei privat
 * Versicherten jeder die volle Haushaltspraemie, der Haushalt also die
 * doppelte.
 */
export function kvJePersonHeute(
  s: Szenario,
  personen: readonly PersonHeute[],
  jahr: number,
): KvHeute[] {
  const roh = personen.map((k) => {
    const profil = kvProfil(s, k.person);
    return {
      k,
      profil,
      /*
        ERWERBSPHASE UND RUHESTAND SIND ZWEI FRAGEN. Bei Selbststaendigen
        wird die Erwerbsphase eigens erfasst; fuer alle anderen ist sie aus
        dem Ruhestandsstatus eindeutig ableitbar.
      */
      privat: s.einkommenHeute.modus === 'selbststaendig'
        ? profil.erwerb === 'pkv'
        : profil.status === 'pkv',
      eigene: k.person.pkv !== undefined,
    };
  });

  const teilen = Math.max(
    1,
    roh.filter((x) => (x.privat || x.profil.status === 'pkv') && !x.eigene).length,
  );

  return roh.map(({ k, profil, privat, eigene }) => {
    const gebraucht = privat || profil.status === 'pkv';
    const quote = !gebraucht ? 0 : eigene ? 1 : 1 / teilen;
    const b = profil.pkv;
    return {
      id: k.person.id,
      profil,
      privat,
      /*
        Die Quote wirkt auf die EINGABE, nicht auf das Ergebnis: Die
        Entlastung des Beitragsentlastungstarifs ist ein fester Betrag, den
        nachtraeglich zu skalieren etwas anderes ergaebe.
      */
      annahmen: {
        ...b,
        praemieMonat: b.praemieMonat * quote,
        bet: {
          ...b.bet,
          aktiv: b.bet.aktiv && quote > 0,
          beitragMonat: b.bet.beitragMonat * quote,
          entlastungMonat: b.bet.entlastungMonat * quote,
        },
      } as PkvAnnahmen,
      alterHeute: alterExakt(k.geburt, { jahr, monat: 7, tag: 1 }),
    };
  });
}

/**
 * Jahresbrutto aus einer Einkommensangabe, EGAL IN WELCHER FORM ERFASST.
 *
 * Genau die drei Faelle, die der TUEV bisher auf einen verkuerzt hatte:
 * Besoldung kommt aus der Tabelle, ein eingegebenes Netto wird umgekehrt, und
 * nur Brutto und Gewinn sind der Betrag selbst.
 *
 * `kv` ist die Versicherung DIESER Person — beim Umkehren von Netto auf
 * Brutto zaehlt ihre Praemie, nicht die eines anderen Haushaltsmitglieds.
 */
export function bruttoAusEinkommen(
  e: EinkommenHeute,
  s: Szenario,
  kv: KvHeute,
  p: LegalParameters,
  jahr: number,
  hinweise: string[],
): number {
  if (e.modus === 'besoldung') {
    const b = besoldung(e.besoldungsgruppe, e.besoldungsstufe, e.besoldungsland, jahr, {
      verheiratet: s.haushalt.verheiratet,
      kinder: s.haushalt.kinderUnter25,
    });
    if (!b.belegt) {
      const hinweis = 'Die Besoldung beruht auf einer Naeherung, nicht auf der amtlichen '
        + 'Tabelle des Dienstherrn. Der ausgewiesene Betrag kann um mehrere hundert Euro '
        + 'im Monat abweichen.';
      if (!hinweise.includes(hinweis)) hinweise.push(hinweis);
    }
    return b.brutto * 12;
  }
  if (e.modus === 'netto') {
    return nettoZuBrutto(e.betrag * e.auszahlungen, {
      verheiratet: s.haushalt.verheiratet,
      bundesland: s.haushalt.bundesland,
      kirchensteuerpflichtig: s.haushalt.kirchensteuer,
      kinder: kinderImJahr(s.haushalt, jahr),
      beamter: false,
      privatVersichert: kv.privat,
      // Beim Umkehren zaehlt die Praemie von HEUTE: das eingegebene Netto
      // ist ein heutiges.
      pkvPraemieMonat: pkvImJahr(kv.annahmen, kv.alterHeute, 0).gesamtMonat,
    }, p).jahresbrutto;
  }
  return e.betrag * e.auszahlungen;
}

/**
 * Erwerbseinkommen je Person, in der Reihenfolge von `personen`.
 *
 * BEI GETRENNTER ERFASSUNG die echten Betraege — `einkommenHeute` gehoert
 * dann Person A, `einkommenPartner` Person B. SONST ist `einkommenHeute` der
 * HAUSHALTSBETRAG und wird auf die Koepfe verteilt: Die
 * Beitragsbemessungsgrenzen gelten je Person, und ein Haushaltsbetrag als
 * eine Person gerechnet setzte sie nur einmal an.
 */
export function einkommenJePersonHeute(
  s: Szenario,
  kv: readonly KvHeute[],
  p: LegalParameters,
  jahr: number,
  hinweise: string[],
): ErwerbsPersonHeute[] {
  const kvA = kv[0];
  if (!kvA) return [];

  /** Erwerbsart und GRV-Beitrag EINER Einkommensangabe. */
  const art = (e: EinkommenHeute, id: PersonId, brutto: number): ErwerbsPersonHeute => ({
    id,
    brutto,
    beamter: e.modus === 'besoldung',
    selbststaendig: e.modus === 'selbststaendig',
    /*
      Der EINGETRAGENE Beitrag, nicht ein Satz darauf. Die Oberflaeche belegt
      das Feld mit dem vollen Satz vor; wer freiwillig einen anderen Betrag
      zahlt, traegt ihn ein. Was hier steht, ist deshalb, was tatsaechlich
      fliesst.
    */
    grvBeitragJahr: e.modus === 'selbststaendig' && e.grvPflicht
      ? Math.max(0, e.grvBeitragMonat) * 12
      : 0,
  });

  const getrennt = s.einkommenGetrennt === true && kv.length > 1;
  if (getrennt) {
    const zweites = s.einkommenPartner ?? s.einkommenHeute;
    return kv.map((x, i) => {
      const e = i === 0 ? s.einkommenHeute : zweites;
      return art(e, x.id, bruttoAusEinkommen(e, s, x, p, jahr, hinweise));
    });
  }
  const gesamt = bruttoAusEinkommen(s.einkommenHeute, s, kvA, p, jahr, hinweise);
  return kv.map((x) => art(s.einkommenHeute, x.id, gesamt / kv.length));
}

/**
 * Die bequeme Fassung fuer Aufrufer, die nur das Ergebnis brauchen.
 *
 * Der Vertrags-TUEV und der Foerdercheck gehen diesen Weg; die Zeitachse
 * benutzt die Bausteine einzeln, weil sie `kvJePerson` ohnehin fuer den
 * Ruhestand braucht und die Jahresschleife das Einkommen fortschreibt.
 */
export function erwerbsBasisHeute(
  s: Szenario,
  p: LegalParameters,
  jahr = heute().jahr,
): ErwerbsBasisHeute {
  const hinweise: string[] = [];
  const personen = personenHeute(s);
  const kv = kvJePersonHeute(s, personen, jahr);
  const jePerson = einkommenJePersonHeute(s, kv, p, jahr, hinweise);

  const haushalt = erwerbHaushalt(
    jePerson.map((e, i) => {
      const x = kv[i]!;
      return {
        jahresbrutto: e.brutto,
        beamter: e.beamter,
        selbststaendig: e.selbststaendig,
        grvBeitragJahr: e.grvBeitragJahr,
        privatVersichert: x.privat,
        zusatzbeitrag: x.profil.zusatzbeitrag,
        pkvPraemieMonat: x.privat ? pkvImJahr(x.annahmen, x.alterHeute, 0).gesamtMonat : 0,
      };
    }),
    {
      verheiratet: s.haushalt.verheiratet,
      bundesland: s.haushalt.bundesland,
      kirchensteuerpflichtig: s.haushalt.kirchensteuer,
      kinder: kinderImJahr(s.haushalt, jahr),
      beamter: false,
    },
    p,
  );

  return {
    jahresbrutto: haushalt.jahresbrutto,
    zve: haushalt.zve,
    sv: haushalt.sv,
    jePerson,
    haushalt,
    hinweise,
  };
}

export type { KinderStatus };
