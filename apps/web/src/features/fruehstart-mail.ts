import { FRUEHSTART_MONATE, FRUEHSTART_RABATT_PROZENT, TESTTAGE } from '@renten/schema/preise';

/**
 * Die vorbereiteten E-Mails zu einer Early-Adopter-Anfrage — Zusage mit dem
 * persoenlichen Link, Absage ohne. Sie oeffnen sich im Mailprogramm des
 * Betreibers (mailto:); er kann sie anpassen und schickt sie selbst. Das
 * System verschickt nichts an Interessenten.
 *
 * Rein, ohne Oberflaeche: damit testbar.
 */

/**
 * Echte Interessenten bekommen immer den Link der Live-Seite — auch wenn der
 * Betreiber auf der Testseite zusagt. Der Link gilt dort wie hier: Beide
 * Seiten teilen dieselbe Datenbank.
 */
export const LIVE_ADRESSE = 'https://js-rentenplaner.de';
export const anfrageLink = (token: string) => `${LIVE_ADRESSE}/?fruehstart=${token}`;

export interface Empfaenger {
  name: string;
  email: string;
}

/** mailto mit Betreff und Text; Zeilen mit CRLF (RFC 6068), das @ bleibt lesbar. */
export function mailto(an: string, betreff: string, zeilen: string[]): string {
  const adresse = encodeURIComponent(an.trim()).replace(/%40/g, '@');
  return `mailto:${adresse}?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(zeilen.join('\r\n'))}`;
}

const anrede = (name: string) => `Guten Tag ${name.trim().replace(/\s+/g, ' ')},`;

export function zusageMail(e: Empfaenger, token: string): string {
  return mailto(e.email, 'Ihr Zugang als Early Adopter beim JS-Rentenplaner', [
    anrede(e.name),
    '',
    'vielen Dank für Ihr Interesse am JS-Rentenplaner! Gern nehmen wir Sie als Early Adopter auf.',
    '',
    'Über diesen persönlichen Link legen Sie Ihr Konto an — oder melden sich an, wenn Sie schon eines haben:',
    anfrageLink(token),
    '',
    `Der Link gilt 30 Tage und nur für Sie. Als Early Adopter nutzen Sie alle Funktionen ${FRUEHSTART_MONATE} Monate `
      + `kostenlos — gezählt ab dem Start des Abos. Danach erhalten Sie ${FRUEHSTART_RABATT_PROZENT} % Rabatt auf das `
      + 'erste Jahr, wenn Sie ein Paket buchen. Im Gegenzug freuen wir uns alle vier Wochen über eine kurze '
      + 'Rückmeldung: was hilft, was fehlt, was stört.',
    '',
    'Viele Grüße',
  ]);
}

export function absageMail(e: Empfaenger): string {
  return mailto(e.email, 'Ihre Anfrage als Early Adopter beim JS-Rentenplaner', [
    anrede(e.name),
    '',
    'vielen Dank für Ihr Interesse am JS-Rentenplaner und Ihre Anfrage als Early Adopter. Leider können wir Sie '
      + 'diesmal nicht aufnehmen.',
    '',
    `Zum Start des Abos können Sie den JS-Rentenplaner ${TESTTAGE} Tage kostenlos und ohne Zahlungsdaten testen — `
      + 'wir würden uns freuen.',
    '',
    'Viele Grüße',
  ]);
}
