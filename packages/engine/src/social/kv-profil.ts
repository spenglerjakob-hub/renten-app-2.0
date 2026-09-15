import type { Szenario, Person } from '../model.js';
import type { KvStatus, KvErwerb } from './kv-pv.js';
import type { PkvAnnahmen } from './pkv.js';

/**
 * Die Krankenversicherung EINER Person — Haushalt plus Ausnahmen.
 *
 * WOZU: Bis hierher galt ein Status fuer den ganzen Haushalt. Ein Paar aus
 * Beamtem und Angestellter war damit nicht abbildbar, ein Selbststaendiger
 * neben einer Arbeitnehmerin ebenso wenig — und gerade dort ist die Frage
 * teuer: Die Praemie eines privat Versicherten ist im Alter oft der groesste
 * einzelne Posten.
 *
 * WARUM AUSNAHMEN UND KEIN UMZUG: Die Angaben am Haushalt bleiben die
 * Vorgabe; die Person ueberschreibt sie nur, wenn sie abweicht. Das haelt
 * gespeicherte Dateien ohne Migration lesbar, und es bildet den Regelfall ab
 * — die meisten Paare sind gleich versichert. Dieselbe Machart wie beim
 * eigenen Versorgungsziel der Person.
 *
 * WARUM AN EINER STELLE: Die Regel „Person, sonst Haushalt" stand sonst in
 * der Zeitachse, im Erwerbsnetto, im Vertrags-TUEV, in der Eingabemaske und
 * im Ausdruck. Fuenf Kopien laufen frueher oder spaeter auseinander.
 */
export interface KvProfil {
  /** Krankenversicherung im Ruhestand */
  status: KvStatus;
  /** Krankenversicherung in der Erwerbsphase */
  erwerb: KvErwerb;
  /** Zusatzbeitrag der eigenen Kasse; `undefined` = der des Rechtsstands */
  zusatzbeitrag?: number;
  krankenkasse?: string;
  pkv: PkvAnnahmen;
}

export function kvProfil(s: Szenario, person: Person | undefined): KvProfil {
  const h = s.haushalt;
  const status = person?.kvStatus ?? h.kvStatus;
  return {
    status,
    /*
      Die Erwerbsphase folgt dem Ruhestandsstatus, solange sie nicht
      ausdruecklich anders angegeben ist — aber DEM EIGENEN. Fiele sie auf
      den Haushalt zurueck, waere eine privat versicherte Partnerin in einem
      gesetzlichen Haushalt waehrend der Erwerbsphase gesetzlich versichert
      und ab Rentenbeginn privat. Das ist ein Weg, den es nicht gibt.
    */
    erwerb: person?.kvErwerb
      ?? (person?.kvStatus !== undefined
        ? (status === 'pkv' ? 'pkv' : 'gesetzlich')
        : h.kvErwerb),
    zusatzbeitrag: person?.zusatzbeitrag ?? h.zusatzbeitrag,
    krankenkasse: person?.krankenkasse ?? h.krankenkasse,
    pkv: person?.pkv ?? h.pkv,
  };
}

/** Kurzform, wenn nur die Kennung vorliegt. */
export function kvProfilVon(s: Szenario, id: string): KvProfil {
  return kvProfil(s, s.personen.find((p) => p.id === id));
}

/** Ist im Haushalt ueberhaupt jemand privat versichert? */
export function irgendwerPrivat(s: Szenario): boolean {
  return s.personen
    .filter((p) => p.id === 'A' || s.haushalt.verheiratet)
    .some((p) => {
      const k = kvProfil(s, p);
      return k.status === 'pkv' || k.erwerb === 'pkv';
    });
}
