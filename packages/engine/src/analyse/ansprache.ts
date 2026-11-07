/**
 * Die Ansprache der Hinweise und Befunde. Vorgabe ist das Sie — so stehen sie
 * in den Tests und in jedem Werkzeug ausser dem Rechner, der per Du spricht
 * (`ansprache: 'du'` in `TuevKontext` und `FoerderKontext`).
 *
 * Die Saetze betreffen stets eine Person — ihren Vertrag, ihren Rahmen —,
 * deshalb gibt es hier nur die Einzahl.
 */
export type Ansprache = 'sie' | 'du';

export function anrede(a: Ansprache = 'sie') {
  const du = a === 'du';
  return {
    /** du · Sie — in der Satzmitte */
    sie: du ? 'du' : 'Sie',
    /** Du · Sie — am Satzanfang */
    Sie: du ? 'Du' : 'Sie',
    /** dir · Ihnen */
    ihnen: du ? 'dir' : 'Ihnen',
    /** dich · Sie */
    dich: du ? 'dich' : 'Sie',
    /** dein · Ihr, mit Endung: deine · Ihre, deinem · Ihrem */
    ihr: (endung = '') => (du ? `dein${endung}` : `Ihr${endung}`),
    Ihr: (endung = '') => (du ? `Dein${endung}` : `Ihr${endung}`),
    /** Fuer Verben: `w('zahlst', 'zahlen')` */
    w: (duText: string, sieText: string) => (du ? duText : sieText),
  };
}
