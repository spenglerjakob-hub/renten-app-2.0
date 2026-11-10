/**
 * Die Form einer E-Mail-Adresse — so streng wie noetig, um Tippfehler zu
 * finden („anna@beispiel“, Leerzeichen), und so locker, dass keine echte
 * Adresse abgewiesen wird. Ob es die Adresse gibt, weiss nur der Versand.
 */
const FORM = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Ist die Eingabe — ohne Leerzeichen am Rand — eine Adresse? Leer ist keine. */
export function emailGueltig(s: string): boolean {
  const t = s.trim();
  return t.length > 0 && t.length <= 254 && FORM.test(t);
}

/**
 * Der Empfaenger im mailto-Link: nur eine Adresse in gueltiger Form, sonst
 * keiner — dann waehlt ihn der Berater im Mailprogramm. Das @ bleibt lesbar,
 * alles andere, was im Link stoeren koennte (?, &, #), wird kodiert.
 */
export function mailEmpfaenger(email: string): string {
  return emailGueltig(email) ? encodeURIComponent(email.trim()).replace(/%40/g, '@') : '';
}
