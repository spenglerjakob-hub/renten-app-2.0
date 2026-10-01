import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Logo } from '../components/Logo';
import { RechtsLinks } from '../components/RechtsLinks';

/**
 * Impressum, Datenschutzerklaerung und Nutzungsbedingungen.
 *
 * ENTWURF. Die Texte bilden ab, was die Anwendung TATSAECHLICH tut — welche
 * Daten wohin gehen, wer sie sieht, wie lange sie bleiben. Rechtlich
 * geprueft sind sie nicht: Alles in [eckigen Klammern] muss der Betreiber
 * ausfuellen, und vor der Veroeffentlichung gehoert beides in die Hand eines
 * Anwalts oder eines Generators mit Abmahnschutz. Der gelbe Vermerk oben
 * bleibt, bis `ENTWURF` auf false steht.
 *
 * Aendert sich die Verarbeitung (neuer Dienst, neue Daten, Stripe fuer das
 * Abo), muss die Datenschutzerklaerung mitgezogen werden.
 */
const ENTWURF = true;
const STAND = '[Datum eintragen]';

export type RechtsSeite = 'impressum' | 'datenschutz' | 'nutzungsbedingungen';

export function Seite({ seite }: { seite: RechtsSeite }) {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <header className="bg-slate-900 text-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4 sm:px-6">
          <Logo klasse="h-9 w-9" />
          <a href="/" className="text-sm font-black tracking-tight hover:underline">JS-Rentenplaner</a>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        {ENTWURF && (
          <div role="note" className="mb-6 flex gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>
              <strong>Entwurf.</strong> Angaben in [eckigen Klammern] sind noch auszufüllen. Vor der
              Veröffentlichung rechtlich prüfen lassen.
            </p>
          </div>
        )}
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          {seite === 'impressum' ? <Impressum /> : seite === 'datenschutz' ? <Datenschutz /> : <Nutzungsbedingungen />}
        </article>
        <RechtsLinks klasse="mt-6 justify-center" />
      </main>
    </div>
  );
}

function H1({ children }: { children: ReactNode }) {
  return <h1 className="text-2xl font-black tracking-tight text-slate-900">{children}</h1>;
}
function H2({ children }: { children: ReactNode }) {
  return <h2 className="mt-7 text-base font-black text-slate-900">{children}</h2>;
}
function P({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-sm leading-relaxed text-slate-700">{children}</p>;
}
function Liste({ children }: { children: ReactNode }) {
  return <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-700">{children}</ul>;
}

function Impressum() {
  return (
    <>
      <H1>Impressum</H1>

      <H2>Angaben gemäß § 5 DDG</H2>
      <P>
        [Vor- und Nachname bzw. Firma]<br />
        [Straße und Hausnummer]<br />
        [PLZ Ort]
      </P>

      <H2>Kontakt</H2>
      <P>
        E-Mail: info@js-rentenplaner.de<br />
        Telefon: [Telefonnummer]
      </P>

      <H2>Umsatzsteuer</H2>
      <P>
        Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG: [USt-IdNr., falls vorhanden — sonst Abschnitt
        streichen]
      </P>

      <H2>Angaben als Versicherungsvermittler</H2>
      <P>
        [Nur falls zutreffend, sonst Abschnitt streichen: Status nach § 34d GewO (z. B. gebundener
        Versicherungsvertreter), Registrierungsnummer im Vermittlerregister, Registerstelle (DIHK,
        www.vermittlerregister.info), zuständige IHK, Berufsrechtliche Regelungen.]
      </P>

      <H2>Verbraucherstreitbeilegung</H2>
      <P>
        [Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer
        Verbraucherschlichtungsstelle teilzunehmen. — Formulierung prüfen lassen.]
      </P>

      <H2>Hinweis zu den Berechnungen</H2>
      <P>
        Alle Ergebnisse sind Modellrechnungen auf Grundlage der eingegebenen Daten und des jeweils
        hinterlegten Rechtsstands. Sie ersetzen keine Steuer-, Rechts- oder Anlageberatung.
      </P>
    </>
  );
}

function Datenschutz() {
  return (
    <>
      <H1>Datenschutzerklärung</H1>
      <p className="mt-1 text-xs text-slate-500">Stand: {STAND}</p>

      <H2>1. Verantwortlicher</H2>
      <P>
        [Vor- und Nachname bzw. Firma], [Anschrift], E-Mail: info@js-rentenplaner.de. Die vollständigen Angaben
        stehen im <a href="/impressum" className="text-indigo-700 underline">Impressum</a>.
      </P>

      <H2>2. Überblick</H2>
      <P>
        Der JS-Rentenplaner rechnet Altersvorsorge durch — Renten, Steuern, Sozialabgaben und Verträge. Die
        Berechnung läuft vollständig in Ihrem Browser. Auf unseren Server gelangen Daten nur, wenn Sie ein
        Konto nutzen, ein Szenario in Ihrem Konto speichern oder einen Vorsorge-Check an Ihren Berater senden.
        Wir setzen keine Analyse-, Tracking- oder Werbedienste ein und laden keine Inhalte von Drittanbietern
        (etwa Schriftarten) nach.
      </P>

      <H2>3. Aufruf der Website und Server-Logdateien</H2>
      <P>
        Die Website liegt bei [Hostinger — Vertragspartner laut Hosting-Vertrag eintragen]. Beim Aufruf
        verarbeitet der Server technisch notwendige Daten: IP-Adresse, Zeitpunkt, aufgerufene Adresse,
        übertragene Datenmenge, Browser und Betriebssystem. Rechtsgrundlage ist unser berechtigtes Interesse
        an einem sicheren und stabilen Betrieb (Art. 6 Abs. 1 lit. f DSGVO). Die Logdateien werden nach
        [Frist laut Hostinger] gelöscht.
      </P>

      <H2>4. Speicher in Ihrem Browser</H2>
      <P>
        Wir setzen keine Cookies zu Analyse- oder Werbezwecken. Im lokalen Speicher Ihres Browsers legen wir
        ab, was für die von Ihnen genutzte Funktion unbedingt erforderlich ist (§ 25 Abs. 2 Nr. 2 TDDDG):
      </P>
      <Liste>
        <li>Ihre Eingaben im Rechner, damit sie beim nächsten Aufruf noch da sind
          (<code>rentenplaner.szenario.v1</code>),</li>
        <li>Zwischenstände des Vorsorge-Checks (<code>rentenplaner.check.v1…</code>),</li>
        <li>bei Anmeldung die Sitzung (<code>sb-…-auth-token</code>) und der Zeitpunkt Ihrer letzten Nutzung
          (<code>rentenplaner.auth.aktiv</code>) — nach zwei Tagen ohne Nutzung werden Sie abgemeldet.</li>
      </Liste>
      <P>
        Diese Daten verlassen Ihr Gerät nicht. Sie können sie jederzeit über die Einstellungen Ihres Browsers
        löschen.
      </P>

      <H2>5. Konto und Anmeldung</H2>
      <P>
        Für ein Konto verarbeiten wir Ihre E-Mail-Adresse, Ihr Passwort (nur als Prüfwert, nie im Klartext),
        Zeitpunkte der Registrierung und Anmeldung sowie die dabei verwendete IP-Adresse. Bestätigungs- und
        Passwort-E-Mails versenden wir über unser Postfach info@js-rentenplaner.de. Mit dem Konto speichern wir,
        welcher Fassung der Nutzungsbedingungen Sie wann zugestimmt haben. Rechtsgrundlage ist der
        Nutzungsvertrag (Art. 6 Abs. 1 lit. b DSGVO). Die Daten bleiben gespeichert, bis Sie Ihr Konto löschen —
        das können Sie jederzeit selbst unter „Konto“ im Rechner.
      </P>

      <H2>6. Gespeicherte Szenarien</H2>
      <P>
        Speichern Sie ein Szenario in Ihrem Konto, liegen dessen Eingaben auf unserem Server: etwa Namen,
        Geburtsdaten, Einkommen, Rentenansprüche, Kinder, Krankenversicherung und Verträge. Jedes Szenario ist
        ausschließlich für das Konto sichtbar, das es angelegt hat; das erzwingt die Datenbank selbst.
      </P>
      <P>
        Zwei Angaben können <strong>besondere Kategorien personenbezogener Daten</strong> (Art. 9 DSGVO)
        berühren: die Kirchensteuerpflicht (Religionszugehörigkeit) und ein Risikozuschlag der privaten
        Krankenversicherung (Gesundheit). Sie werden nur zur Berechnung genutzt.
      </P>
      <P>
        Geben Berater Daten ihrer Kunden ein, ist der <strong>Berater</strong> für diese Daten verantwortlich
        und benötigt dafür eine Rechtsgrundlage, für die genannten besonderen Kategorien in der Regel die
        ausdrückliche Einwilligung des Kunden (Art. 9 Abs. 2 lit. a DSGVO). Wir verarbeiten sie dann in seinem
        Auftrag (Art. 28 DSGVO).
      </P>

      <H2>7. Vorsorge-Check</H2>
      <P>
        Über den Vorsorge-Check erfassen Sie Ihre Angaben Schritt für Schritt. Ohne persönlichen Link Ihres
        Beraters bleiben sie in Ihrem Browser. Mit Link senden Sie sie — nach Ihrer ausdrücklichen Einwilligung
        (Art. 6 Abs. 1 lit. a, Art. 9 Abs. 2 lit. a DSGVO) — an den Berater, der den Link erstellt hat. Nur er
        kann sie abrufen; verantwortlich für die weitere Verarbeitung ist er.
      </P>
      <P>
        Ein Link gilt 30 Tage und lässt sich einmal nutzen. Eingereichte Angaben werden gelöscht, sobald der
        Berater sie löscht, <strong>spätestens nach 90 Tagen</strong>. Ihre Einwilligung können Sie jederzeit
        mit Wirkung für die Zukunft bei Ihrem Berater widerrufen.
      </P>

      <H2>8. E-Mail-Benachrichtigung an Berater</H2>
      <P>
        Geht ein Vorsorge-Check ein, erhält der Berater eine E-Mail an seine Konto-Adresse. Sie enthält nur den
        Namen, den der Berater selbst beim Erstellen des Links eingetragen hat, keine Angaben des Kunden.
        Versandt wird über unser Postfach bei [Hostinger].
      </P>

      <H2>9. Weitere Seiten</H2>
      <P>
        Die Seiten zum Altersvorsorgedepot, zum Zuschussmodell und zum Matching-Modell rechnen ausschließlich in
        Ihrem Browser und speichern nichts. „Beratung anfragen“ öffnet Ihr eigenes E-Mail-Programm; was Sie
        dort absenden, entscheiden Sie selbst.
      </P>

      <H2>10. Empfänger und Auftragsverarbeiter</H2>
      <Liste>
        <li>
          <strong>Supabase Inc.</strong> (San Francisco, USA) — Datenbank, Anmeldung und Serverfunktionen.
          Die Daten liegen in einem Rechenzentrum in der EU (Paris). Wegen des Sitzes in den USA ist ein
          Zugriff aus einem Drittland nicht ausgeschlossen; abgesichert durch Auftragsverarbeitungsvertrag und
          EU-Standardvertragsklauseln (Art. 46 Abs. 2 lit. c DSGVO). [Aktuellen Stand im DPA von Supabase
          prüfen.]
        </li>
        <li>
          <strong>[Hostinger — Vertragspartner eintragen]</strong> — Webhosting und E-Mail-Versand, auf
          Grundlage eines Auftragsverarbeitungsvertrags.
        </li>
      </Liste>

      <H2>11. Speicherdauer im Überblick</H2>
      <Liste>
        <li>Konto und gespeicherte Szenarien: bis zur Löschung des Kontos.</li>
        <li>Vorsorge-Check: offene Links 30 Tage, eingereichte Angaben höchstens 90 Tage.</li>
        <li>Server-Logdateien: [Frist laut Hostinger].</li>
        <li>Browser-Speicher: bis Sie ihn löschen.</li>
      </Liste>

      <H2>12. Ihre Rechte</H2>
      <P>
        Sie haben das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung
        der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21 DSGVO). Eine
        Einwilligung können Sie jederzeit mit Wirkung für die Zukunft widerrufen (Art. 7 Abs. 3). Ihre Szenarien
        können Sie im Rechner jederzeit als Datei speichern. Wenden Sie sich an info@js-rentenplaner.de.
      </P>
      <P>
        Sie können sich außerdem bei einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77 DSGVO), etwa bei
        [zuständige Behörde am Sitz des Verantwortlichen].
      </P>

      <H2>13. Datensicherheit</H2>
      <P>
        Alle Verbindungen sind verschlüsselt (TLS). Gespeicherte Daten sind je Konto durch Zugriffsregeln der
        Datenbank getrennt; Kunden, die einen Vorsorge-Check senden, können nichts lesen — auch ihre eigenen
        Angaben nicht mehr, sobald sie abgeschickt sind.
      </P>
    </>
  );
}

/**
 * Nutzungsbedingungen. Sie sollen vor allem das Programm schuetzen: Die
 * Rechenlogik laeuft im Browser und ist damit technisch zugaenglich — wer sie
 * kopiert oder nachbaut, verstoesst gegen das Urheberrecht (§§ 69a ff. UrhG)
 * und gegen diese Bedingungen. Was das Gesetz unabdingbar erlaubt
 * (§§ 69d, 69e UrhG), kann ein Vertrag nicht verbieten (§ 69g Abs. 2 UrhG);
 * die Formulierung nimmt es deshalb ausdruecklich aus.
 */
function Nutzungsbedingungen() {
  return (
    <>
      <H1>Nutzungsbedingungen</H1>
      <p className="mt-1 text-xs text-slate-500">Fassung vom 1. Oktober 2026</p>

      <H2>1. Geltungsbereich</H2>
      <P>
        Diese Bedingungen gelten für die Nutzung des JS-Rentenplaners unter js-rentenplaner.de — des Rechners,
        der Arbeitgeber-Seiten, des Vorsorge-Checks und aller weiteren Inhalte. Anbieter ist [Vor- und Nachname
        bzw. Firma, Anschrift] (im Folgenden „Anbieter“), siehe{' '}
        <a href="/impressum" className="text-indigo-700 underline">Impressum</a>. Mit der Registrierung bzw. der
        Zustimmung im Konto akzeptieren Sie diese Bedingungen.
      </P>

      <H2>2. Leistungen</H2>
      <P>
        Der JS-Rentenplaner erstellt Modellrechnungen zur Altersvorsorge auf Grundlage Ihrer Eingaben und des
        jeweils hinterlegten Rechtsstands. Die Ergebnisse sind keine Steuer-, Rechts- oder Anlageberatung und
        ersetzen diese nicht. Beiträge, Tarife und Leistungen Dritter (etwa Versicherer) sind Beispiele ohne
        Gewähr; maßgeblich sind deren Angebote.
      </P>

      <H2>3. Konto</H2>
      <Liste>
        <li>Ein Konto ist persönlich. Zugangsdaten dürfen nicht an Dritte weitergegeben werden; jede Person
          braucht ein eigenes Konto.</li>
        <li>Sie halten Ihr Passwort geheim und informieren den Anbieter, wenn Sie einen Missbrauch vermuten.</li>
        <li>Sie können Ihr Konto jederzeit selbst löschen (im Rechner unter „Konto“).</li>
      </Liste>

      <H2>4. Rechte am JS-Rentenplaner</H2>
      <P>
        Software, Rechenlogik, Texte, Gestaltung und Grafiken des JS-Rentenplaners sind urheberrechtlich
        geschützt (insbesondere §§ 2, 69a ff. UrhG). Alle Rechte liegen beim Anbieter, soweit nicht anders
        angegeben.
      </P>
      <P>
        Sie erhalten für die Dauer Ihres Kontos ein einfaches, nicht übertragbares Recht, den JS-Rentenplaner im
        Browser für eigene Zwecke und für die Beratung Ihrer Kunden zu nutzen. Ausdrucke und PDF-Ausgaben der
        Ergebnisse dürfen Sie an Ihre Kunden und deren Arbeitgeber weitergeben.
      </P>

      <H2>5. Nicht erlaubt</H2>
      <P>Ohne vorherige schriftliche Zustimmung des Anbieters ist es nicht erlaubt,</P>
      <Liste>
        <li>den Programmcode oder die Rechenlogik ganz oder teilweise zu kopieren, zu speichern, zu verbreiten
          oder öffentlich zugänglich zu machen,</li>
        <li>den Programmcode zu bearbeiten, zurückzuentwickeln oder zu dekompilieren — ausgenommen, soweit
          §§ 69d, 69e UrhG dies zwingend erlauben,</li>
        <li>den JS-Rentenplaner oder wesentliche Teile davon nachzubauen oder in eigene Anwendungen zu
          übernehmen,</li>
        <li>Inhalte automatisiert abzurufen (etwa durch Skripte oder Crawler) oder den Dienst übermäßig zu
          belasten,</li>
        <li>die Zugangsbeschränkung zu umgehen oder Dritten Zugang zu verschaffen.</li>
      </Liste>

      <H2>6. Verfügbarkeit und Änderungen</H2>
      <P>
        Der Anbieter bemüht sich um einen störungsfreien Betrieb, schuldet aber keine bestimmte Verfügbarkeit.
        Funktionen und Rechenregeln können angepasst werden, etwa an einen neuen Rechtsstand.
      </P>

      <H2>7. Haftung</H2>
      <P>
        Der Anbieter haftet unbeschränkt bei Vorsatz und grober Fahrlässigkeit sowie für Schäden aus der
        Verletzung von Leben, Körper oder Gesundheit. Bei leichter Fahrlässigkeit haftet er nur für die
        Verletzung wesentlicher Pflichten und begrenzt auf den vorhersehbaren, typischen Schaden. Für
        Entscheidungen, die auf Grundlage der Modellrechnungen getroffen werden, übernimmt der Anbieter keine
        Haftung. [Haftungsregelung anwaltlich prüfen lassen — insbesondere, falls die Nutzung kostenpflichtig
        wird.]
      </P>

      <H2>8. Sperrung und Kündigung</H2>
      <P>
        Sie können die Nutzung jederzeit beenden, indem Sie Ihr Konto löschen. Bei Verstößen gegen diese
        Bedingungen kann der Anbieter das Konto sperren oder löschen; weitergehende Ansprüche, insbesondere auf
        Unterlassung und Schadensersatz, bleiben vorbehalten.
      </P>

      <H2>9. Änderungen dieser Bedingungen</H2>
      <P>
        Der Anbieter kann diese Bedingungen mit Wirkung für die Zukunft ändern. Eine neue Fassung wird Ihnen
        beim nächsten Besuch angezeigt; die weitere Nutzung setzt Ihre Zustimmung voraus.
      </P>

      <H2>10. Schlussbestimmungen</H2>
      <P>
        Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts. Ist eine
        Bestimmung unwirksam, bleiben die übrigen wirksam. [Gerichtsstand für Kaufleute: Sitz des Anbieters —
        prüfen lassen.]
      </P>
    </>
  );
}

