import { AUFTRITT_LEER, type Auftritt } from '../features/auftritt';
import type { Angaben } from '../lib/auftritt-konto';
import { vollerName } from '../lib/namen';

/*
 * DIE ANGABEN DES BERATERS — fuer Zugaenge einer Agentur Pflicht.
 *
 * Wer ueber einen Einladungslink in eine Agentur kommt, traegt beim ersten
 * Aufruf der Mitarbeiterberatung ein, wer er ist: Vorname, Nachname, Telefon,
 * E-Mail. Damit steht er von der ersten Beratung an als Berater auf den
 * Unterlagen — im Briefkopf, im Protokoll und im AXA-Antrag —, ohne dass je
 * Beratung jemand „Wer hat beraten?“ ausfuellen muss.
 *
 * Gespeichert wird in `berater_profil`, derselben Zeile wie „Ihr Auftritt“.
 * Name der Firma, Logo und Farbe kommen von der Agentur (`agenturAuftritt`).
 */

export interface BeraterAngaben {
  vorname: string;
  nachname: string;
  telefon: string;
  email: string;
}

export type BeraterFeld = keyof BeraterAngaben;

export const BERATER_FELDER: readonly BeraterFeld[] = ['vorname', 'nachname', 'telefon', 'email'];

const FELD_NAME: Record<BeraterFeld, string> = {
  vorname: 'Vorname', nachname: 'Nachname', telefon: 'Telefon', email: 'E-Mail',
};

/** Eine Adresse, an die sich schreiben laesst — bewusst grob: ein @, davor und danach etwas, ein Punkt in der Domain. */
export const emailPlausibel = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

/** Die Angaben, wie das Formular beginnt: was schon gespeichert ist — die E-Mail sonst die des Kontos. */
export function beraterAngabenAus(a: Auftritt | null, anmeldeAdresse: string | null): BeraterAngaben {
  const b = a ?? AUFTRITT_LEER;
  return {
    vorname: b.vorname.trim(), nachname: b.nachname.trim(), telefon: b.telefon.trim(),
    email: b.email.trim() || (anmeldeAdresse ?? '').trim(),
  };
}

/** Was noch fehlt oder nicht stimmt — je Feld ein Satz; leer: alles da. */
export function beraterAngabenFehler(b: BeraterAngaben): Partial<Record<BeraterFeld, string>> {
  const f: Partial<Record<BeraterFeld, string>> = {};
  for (const k of BERATER_FELDER) {
    if (b[k].trim() === '') f[k] = `Bitte ${k === 'email' ? 'eine E-Mail-Adresse' : k === 'telefon' ? 'eine Telefonnummer' : `Ihren ${FELD_NAME[k]}n`} eintragen.`;
  }
  if (!f.email && !emailPlausibel(b.email)) f.email = 'Diese E-Mail-Adresse ist unvollständig.';
  return f;
}

/**
 * Hat der Zugang seine Angaben schon gemacht? Geprueft wird der GESPEICHERTE
 * Auftritt — die E-Mail des Kontos allein zaehlt nicht: Sie soll bestaetigt
 * sein, bevor sie auf Unterlagen steht.
 */
export function beraterAngabenVollstaendig(a: Auftritt | null): boolean {
  if (!a) return false;
  return BERATER_FELDER.every((k) => a[k].trim() !== '') && emailPlausibel(a.email);
}

/**
 * Was gespeichert wird: die vier Angaben und der ganze Name — alles andere
 * der Zeile (Internetadresse, Zusatzzeile, eigene Farbe) bleibt, wie es ist.
 */
export function beraterAngabenSpeichern(bisher: Auftritt | null, b: BeraterAngaben): Angaben {
  const { logo: _logo, ...rest } = bisher ?? AUFTRITT_LEER;
  const vorname = b.vorname.trim();
  const nachname = b.nachname.trim();
  return {
    ...rest, vorname, nachname, berater: vollerName({ vorname, nachname }),
    telefon: b.telefon.trim(), email: b.email.trim(),
  };
}
