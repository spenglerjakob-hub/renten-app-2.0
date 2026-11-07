import { namensTeile } from './namen';

/**
 * DIE ANSPRACHE DES KUNDEN — im Rechner und im Gutachten per Du.
 *
 * Wer angesprochen wird, haengt an der Ansicht: eine Person („du“), ein Paar
 * im ganzen Haushalt („ihr“). In den Kernsaetzen steht der Vorname vorn —
 * „Max, dir fehlen …“; ohne Namen beginnt der Satz gross: „Dir fehlen …“.
 *
 * Die Vorgabe ist `sie`: Seiten, die beim Sie bleiben — Schnellrechnung,
 * Vorsorge-Check, Mitarbeiterberatung —, setzen keine Ansprache, und die
 * Bausteine, die sie mit dem Rechner teilen, sprechen dort wie bisher.
 * Ein Name steht beim Sie nie davor: „Herr“ oder „Frau“ kennt der Rechner nicht.
 */
export interface Ansprache {
  form: 'du' | 'sie';
  /** Ein Paar im ganzen Haushalt: ihr, euch, euer */
  mehrere: boolean;
  /** Der Vorname, bei einem Paar „Max und Erika“ — leer ohne Namen */
  name: string;
}

export const SIE: Ansprache = { form: 'sie', mehrere: false, name: '' };

export const gross = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Die Woerter der Ansprache — kleingeschrieben fuer die Satzmitte, gross fuer den Satzanfang. */
export interface AnspracheWoerter {
  form: Ansprache['form'];
  mehrere: boolean;
  name: string;
  /** du · ihr · Sie */
  du: string;
  Du: string;
  /** dir · euch · Ihnen */
  dir: string;
  Dir: string;
  /** dich · euch · Sie */
  dich: string;
  /** dein · euer · Ihr — mit Endung: deine · eure · Ihre, deinen · euren · Ihren */
  dein: (endung?: string) => string;
  Dein: (endung?: string) => string;
  /**
   * Fuer alles, was sich nicht aus Fuerwoertern zusammensetzt — vor allem Verben:
   * `w('Du schließt', 'Ihr schließt', 'Sie schließen')`. Ohne Sie-Text gilt der Du-Text.
   */
  w: (du: string, ihr?: string, sie?: string) => string;
  /** Der Satzanfang eines Kernsatzes: „Max, dir“ — ohne Namen (und beim Sie) „Dir“. */
  anrede: (anfang: string) => string;
  /**
   * Fuer Angaben, die nur eine Person betreffen (ihr Einkommen, ihre
   * Krankenversicherung): auch beim Paar „du“.
   */
  einzeln: AnspracheWoerter;
}

export function woerter(a: Ansprache): AnspracheWoerter {
  const w = grundwoerter(a) as AnspracheWoerter;
  // Einmal tief: Die Einzelform einer Einzelform ist sie selbst.
  w.einzeln = a.mehrere ? woerter({ ...a, mehrere: false, name: '' }) : w;
  return w;
}

function grundwoerter(a: Ansprache): Omit<AnspracheWoerter, 'einzeln'> {
  const sie = a.form === 'sie';
  const m = a.mehrere;
  const du = sie ? 'Sie' : m ? 'ihr' : 'du';
  const dir = sie ? 'Ihnen' : m ? 'euch' : 'dir';
  const dein = (endung = '') => (sie ? `Ihr${endung}` : m ? (endung ? `eur${endung}` : 'euer') : `dein${endung}`);
  return {
    form: a.form,
    mehrere: m,
    name: sie ? '' : a.name,
    du,
    Du: gross(du),
    dir,
    Dir: gross(dir),
    dich: sie ? 'Sie' : m ? 'euch' : 'dich',
    dein,
    Dein: (endung = '') => gross(dein(endung)),
    w: (duText, ihrText = duText, sieText = duText) => (sie ? sieText : m ? ihrText : duText),
    anrede: (anfang) => (!sie && a.name ? `${a.name}, ${anfang}` : gross(anfang)),
  };
}

/**
 * Die Vornamen der Angesprochenen. Bei einem Paar nur, wenn beide einen
 * haben — „Max, euch fehlen …“ hiesse sonst nur einen von beiden.
 */
export function vornamen(personen: readonly { name: string; vorname?: string; nachname?: string }[]): string {
  const namen = personen
    .map((p) => namensTeile(p.name, p.vorname ?? '', p.nachname ?? '').vorname.trim().replace(/\s+/g, ' '));
  return namen.every(Boolean) ? namen.join(' und ') : '';
}
