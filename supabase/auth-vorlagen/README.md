# Mails der Anmeldung (Supabase Auth)

Bestätigung, „Passwort vergessen“ und Adressänderung verschickt Supabase Auth
selbst — über das eigene Postfach `info@js-rentenplaner.de`. Die Vorlagen hier
werden im Dashboard eingefügt; das Repo hält sie nur fest.

## Warum die Links auf die eigene Seite zeigen

Die Links haben die Form `https://js-rentenplaner.de/?token_hash=…&type=…`.
Die Seite dahinter zeigt nur einen Knopf; erst der Klick löst den Link ein
(`verifyOtp`, siehe `apps/web/src/store/auth.ts`). Firmen-Mailfilter wie
Microsoft Defender rufen jeden Link einer Mail vorab auf. Bei der
Standard-Vorlage (`{{ .ConfirmationURL }}`) bestätigt schon dieser Aufruf das
Konto — ohne dass der Empfänger etwas getan hat.

## Einstellungen im Dashboard

Projekt `ardzirxpurlkaishhuqv` → **Authentication**:

1. **Emails → SMTP Settings → Enable custom SMTP**
   - Sender email `info@js-rentenplaner.de`, Sender name `JS-Rentenplaner`
   - Host `smtp.hostinger.com`, Port `465`
   - Username `info@js-rentenplaner.de`, Password: Passwort des Postfachs
     (nur hier eintragen, nirgends sonst)
2. **URL Configuration**
   - Site URL `https://js-rentenplaner.de` (ohne Schrägstrich am Ende)
   - Redirect URLs `https://js-rentenplaner.de/**`, `https://www.js-rentenplaner.de/**`
3. **Sign In / Providers → Email**: „Confirm email“ an, „Secure email change“ an.
4. **Rate Limits**: „Rate limit for sending emails“ auf etwa 30 pro Stunde.
5. **Emails → Templates** — jeweils Betreff und den Inhalt der Datei (Reiter „Source“):

   | Vorlage              | Betreff                                          | Datei                          |
   |----------------------|--------------------------------------------------|--------------------------------|
   | Confirm signup       | Bitte bestätigen Sie Ihre E-Mail-Adresse         | `bestaetigung.html`            |
   | Reset password       | Neues Passwort für den JS-Rentenplaner           | `passwort-zuruecksetzen.html`  |
   | Change email address | Neue E-Mail-Adresse bestätigen                   | `email-aendern.html`           |

## Hostinger

hPanel → **E-Mails → js-rentenplaner.de → DNS-Einstellungen / Zustellbarkeit**:
SPF, DKIM und DMARC müssen als „aktiv“ angezeigt werden. Sonst landen die
Mails im Spam, bei Firmenadressen oft gar nicht.

## Abmeldung nach Pause

Unabhängig von den Mails: Wer den Rechner zwei Tage nicht benutzt hat, wird
beim nächsten Öffnen abgemeldet (`PAUSE_BIS_ABMELDUNG_MS` in
`apps/web/src/store/auth.ts`). Supabase selbst hält Sitzungen unbefristet.
