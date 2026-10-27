import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { SeitenKopf } from '../components/SeitenKopf';
import { RechtsLinks } from '../components/RechtsLinks';
import { Hinweis } from '../components/stil';

/**
 * Impressum, Datenschutzerklaerung und Nutzungsbedingungen.
 *
 * ENTWURF. Die Texte bilden ab, was die Anwendung TATSAECHLICH tut — welche
 * Daten wohin gehen, wer sie sieht, wie lange sie bleiben. Rechtlich
 * geprueft sind sie nicht: Alles in [eckigen Klammern] muss der Betreiber
 * ausfuellen, und vor der Veroeffentlichung gehoert beides in die Hand eines
 * Anwalts oder eines Generators mit Abmahnschutz. Der Vermerk oben bleibt,
 * bis `ENTWURF` auf false steht.
 *
 * Aendert sich die Verarbeitung (neuer Dienst, neue Daten), muss die
 * Datenschutzerklaerung mitgezogen werden. Aendern sich die
 * Nutzungsbedingungen, auch NUTZUNGSBEDINGUNGEN_FASSUNG in
 * lib/nutzungsbedingungen.ts hochsetzen, damit jedes Konto neu zustimmt.
 */
const ENTWURF = true;
const STAND = '[Datum eintragen]';

export type RechtsSeite = 'impressum' | 'datenschutz' | 'nutzungsbedingungen';

/*
 * GESTALT: ein Blatt Papier auf dem Stein der Seite — Titel in Inter Tight
 * wie in der Mitarbeiterberatung, Abschnitte mit Luft, Lesetext in
 * Lesebreite, Listen mit Gedankenstrich wie die Hinweise der Beratung.
 *
 * Gestaltet wird nur hier, in Rahmen und Helfern (H1, H2, P, Liste) — nicht
 * in den Texten selbst: Auf `live` haelt ein eigener Commit die
 * Nutzungsbedingungen in einer aelteren Fassung, und jede Zeile, die beide
 * Seiten aendern, wuerde beim Zusammenfuehren zum Konflikt.
 */
export function Seite({ seite }: { seite: RechtsSeite }) {
  return (
    <div className="min-h-screen bg-ui-flaeche text-ui-tinte">
      <SeitenKopf breite="max-w-3xl" verlinkt />

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6 sm:py-10">
        {ENTWURF && (
          <Hinweis symbol={AlertTriangle}>
            <p>
              <strong className="font-medium">Entwurf.</strong> Angaben in [eckigen Klammern] sind noch auszufüllen. Vor der
              Veröffentlichung rechtlich prüfen lassen.
            </p>
          </Hinweis>
        )}
        <article className="ui-karte px-5 py-8 sm:px-12 sm:py-12 [&_strong]:font-medium [&_strong]:text-ui-tinte">
          {seite === 'impressum' ? <Impressum /> : seite === 'datenschutz' ? <Datenschutz /> : <Nutzungsbedingungen />}
        </article>
        <RechtsLinks klasse="justify-center pb-4" />
      </main>
    </div>
  );
}

/*
 * Am Telefon kleiner als `Titel gross`: „Datenschutzerklärung“ ist ein
 * einziges langes Wort und lief in 34 px ueber den Rand des Blatts. Die
 * Silbentrennung faengt ab, was noch laenger waere.
 */
function H1({ children }: { children: ReactNode }) {
  return (
    <h1 className="ui-titel text-balance break-words text-[28px] font-normal leading-[1.15] text-ui-tinte hyphens-auto sm:text-[44px]">
      {children}
    </h1>
  );
}
function H2({ children }: { children: ReactNode }) {
  return <h2 className="ui-titel mt-10 text-[22px] font-normal leading-snug text-ui-tinte sm:text-2xl">{children}</h2>;
}
function P({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-[15px] leading-[1.7] text-ui-tinte/80">{children}</p>;
}
function Liste({ children }: { children: ReactNode }) {
  return (
    <ul className="mt-3 space-y-2 text-[15px] leading-[1.7] text-ui-tinte/80 [&>li]:relative [&>li]:pl-7 [&>li]:before:absolute [&>li]:before:left-0 [&>li]:before:text-ui-asche [&>li]:before:content-['—']">
      {children}
    </ul>
  );
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
      <p className="mt-1 text-xs text-ui-schiefer">Stand: {STAND}</p>

      <H2>1. Verantwortlicher</H2>
      <P>
        [Vor- und Nachname bzw. Firma], [Anschrift], E-Mail: info@js-rentenplaner.de. Die vollständigen Angaben
        stehen im <a href="/impressum" className="text-ui-tinte underline underline-offset-2">Impressum</a>.
      </P>

      <H2>2. Überblick</H2>
      <P>
        Der JS-Rentenplaner rechnet Altersvorsorge durch — Renten, Steuern, Sozialabgaben und Verträge. Die
        Berechnung läuft vollständig in Ihrem Browser. Auf unseren Server gelangen Daten nur, wenn Sie ein
        Konto nutzen, ein Szenario oder eine Mitarbeiterberatung in Ihrem Konto speichern, einen
        Vorsorge-Check an Ihren Berater senden, uns eine Rückmeldung schicken oder ein Abo buchen.
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
          (<code>rentenplaner.auth.aktiv</code>) — nach zwei Tagen ohne Nutzung werden Sie abgemeldet,</li>
        <li>der zuletzt abgefragte Zugang Ihres Kontos (<code>rentenplaner.zugang.v1</code>) und weggeklickte
          Hinweise (<code>rentenplaner.band.…</code>),</li>
        <li>ein persönlicher Einladungs- oder Early-Adopter-Link, bis er nach Ihrer Anmeldung eingelöst ist
          (<code>rentenplaner.einladung</code>, <code>rentenplaner.fruehstart</code>; höchstens 14 Tage),</li>
        <li>ein Fall aus der Schnellrechnung, den Sie mit „Fall speichern“ vorgemerkt haben, bis Sie ihn nach der
          Anmeldung übernehmen oder verwerfen (<code>rentenplaner.musterfall.v1</code>; höchstens 14 Tage),</li>
        <li>Logo, Firmenname und Farbe, die Sie in der Schnellrechnung für das Gutachten eingetragen haben, bis
          sie nach der Anmeldung in Ihr Konto übernommen sind oder Sie sie entfernen
          (<code>rentenplaner.auftritt.v1</code>; höchstens 14 Tage).</li>
      </Liste>
      <P>
        Diese Daten verlassen Ihr Gerät nicht — bis auf den persönlichen Link, der zum Einlösen an unseren
        Server geht, und Logo, Firmenname und Farbe aus der Schnellrechnung, die nach Ihrer Anmeldung in Ihr
        Konto übernommen werden (Abschnitt 5). Sie können sie jederzeit über die Einstellungen Ihres Browsers
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
      <P>
        <strong>Ihr Auftritt im Gutachten.</strong> Richten Sie ihn ein, speichern wir in Ihrem Konto das Logo und
        die Angaben, die Sie dafür eintragen: Firmenname, Ihren Namen, Telefon, E-Mail-Adresse, Website, eine
        Zusatzzeile und eine Farbe. Sie erscheinen auf den Gutachten, die Sie drucken. Das Logo liegt in einem
        nicht öffentlichen Speicher bei Supabase in der EU; abrufen können Logo und Angaben nur Sie mit Ihrem
        Konto. Sie können den Auftritt jederzeit ändern oder entfernen; mit dem Konto wird er gelöscht.
        Rechtsgrundlage ist der Nutzungsvertrag (Art. 6 Abs. 1 lit. b DSGVO).
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

      <H2>7. bAV-Mitarbeiterberatung</H2>
      <P>
        In der bAV-Mitarbeiterberatung legen Berater Firmen und Beratungen in ihrem Konto an. Zu einer Firma
        speichern wir Name, Anschrift, Begrüßung und Hinweise, das Modell der Betriebsrente, Versicherer und Tarif
        sowie ein Logo. Zu einer Beratung speichern wir die Eingaben aus dem Gespräch: Name, Geburtsdatum, Gehalt,
        Familienstand und Einkommen des Partners, Kinder, Krankenversicherung, Ansprüche auf gesetzliche und
        betriebliche Rente, die Werte des Versicherers sowie Entscheidung, Empfehlung, Ort und Datum. Gerechnet wird
        im Browser; gespeichert werden die Eingaben. Firmen und Beratungen sind ausschließlich für das Konto
        sichtbar, das sie angelegt hat; das erzwingt die Datenbank selbst. Logos liegen in einem nicht öffentlichen
        Speicher bei Supabase in der EU.
      </P>
      <P>
        Unterschreiben Mitarbeiter und Berater am Bildschirm, speichern wir die Unterlagen so, wie sie unterschrieben
        wurden (Beratungsprotokoll und Vereinbarung oder Verzichtserklärung, mit den Zahlen darin), dazu je
        Unterschrift den Linienzug, den Namen und den Zeitpunkt. Vom Linienzug speichern wir nur die Form — keine
        Schreibdynamik wie Druck oder Tempo. Danach lässt sich die Beratung nicht mehr ändern, bis der Berater die
        Unterschriften aufhebt.
      </P>
      <P>
        Für die Daten der Mitarbeiter ist der <strong>Berater</strong> verantwortlich, wir verarbeiten sie in seinem
        Auftrag (Art. 28 DSGVO) — wie bei den Szenarien (Abschnitt 6), auch für die Kirchensteuerpflicht als Angabe
        besonderer Kategorie. Arbeitgeber und Mitarbeiter haben keinen Zugang zum JS-Rentenplaner; sie erhalten nur,
        was der Berater ihnen zeigt, druckt oder als Datei gibt. Die Übersicht für den Arbeitgeber enthält Namen,
        Entscheidung, Beträge und Beginn, aber keine Gehälter und keine weiteren persönlichen Angaben.
      </P>
      <P>
        Gelöscht wird eine Beratung, sobald der Berater sie löscht, mit ihren unterschriebenen Unterlagen und
        Unterschriften; diese auch dann, wenn er die Unterschriften aufhebt. Mit einer Firma werden ihre Beratungen
        und ihr Logo gelöscht, mit dem Konto alles.
      </P>

      <H2>8. Vorsorge-Check</H2>
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
      <P>
        <strong>Hochgeladene Unterlagen.</strong> Mit Link können Sie statt abzutippen Fotos, Scans oder PDFs
        Ihrer Unterlagen hochladen (etwa Gehaltsabrechnung, Renteninformation, Standmitteilungen) — nach Ihrer
        ausdrücklichen Einwilligung vor der ersten Datei, auch für Angaben besonderer Kategorien, die darauf
        stehen können (Art. 9 Abs. 2 lit. a DSGVO). Fotos werden schon in Ihrem Browser verkleinert und ohne
        eingebettete Metadaten wie den Aufnahmeort gespeichert. Die Dateien liegen in einem nicht öffentlichen
        Speicher bei Supabase in der EU. Sie selbst können sie nicht mehr abrufen, aber bis zum Absenden
        wieder entfernen; Ihr Berater kann sie erst nach dem Absenden ansehen. Gelöscht werden sie mit den
        Angaben, sobald der Berater sie löscht, <strong>spätestens 90 Tage nach dem Absenden</strong> — senden
        Sie nicht ab, mit Ablauf des Links.
      </P>

      <H2>9. E-Mail-Benachrichtigung an Berater</H2>
      <P>
        Geht ein Vorsorge-Check ein, erhält der Berater eine E-Mail an seine Konto-Adresse. Sie enthält nur den
        Namen, den der Berater selbst beim Erstellen des Links eingetragen hat, keine Angaben des Kunden.
        Versandt wird über unser Postfach bei [Hostinger].
      </P>

      <H2>10. Rückmeldungen und Anfragen als Early Adopter</H2>
      <P>
        Über „Feedback geben“ können Sie uns eine Rückmeldung schicken: eine Bewertung mit Sternen, einen Text
        oder beides. Gespeichert werden Bewertung, Text, die Seite, auf der Sie gerade waren, der Zeitpunkt und
        Ihr Konto. Wir erhalten die Rückmeldung zusätzlich per E-Mail; haben Sie Rückfragen erlaubt, steht Ihre
        E-Mail-Adresse als Antwortadresse darin. Wir nutzen Rückmeldungen nur, um den JS-Rentenplaner zu
        verbessern. Rechtsgrundlage ist unser berechtigtes Interesse an der Weiterentwicklung (Art. 6 Abs. 1
        lit. f DSGVO); für Early Adopter gehören Rückmeldungen zur Vereinbarung über die kostenlosen Monate
        (Art. 6 Abs. 1 lit. b DSGVO). Gelöscht werden sie mit Ihrem Konto. Bitte schreiben Sie keine Angaben
        über Ihre Kunden hinein.
      </P>
      <P>
        Auf der Preisseite können Sie eine Teilnahme als <strong>Early Adopter</strong> anfragen. Dafür verarbeiten
        wir Ihren Namen, Ihre E-Mail-Adresse und — wenn Sie sie angeben — Ihr Büro und die Zahl der Berater, um
        Ihre Anfrage zu prüfen und zu beantworten (Art. 6 Abs. 1 lit. b DSGVO, vorvertragliche Maßnahme). Die
        Anfrage liegt bei Supabase in der EU; wir erhalten sie zusätzlich per E-Mail, versandt über unser Postfach
        bei [Hostinger]. Eine automatische Antwort an die eingetragene Adresse schicken wir nicht. Nach 180 Tagen
        wird die Anfrage gelöscht, unabhängig von ihrem Ausgang.
      </P>

      <H2>11. Abo, Büro und Zahlung</H2>
      <P>
        <strong>Büro und Team.</strong> Buchen Sie ein Abo, legen wir für Ihr Konto ein Büro an. Dazu speichern wir
        den Namen des Büros, wer ihm angehört und seit wann, wer es verwaltet, die Einladungslinks (wer sie wann
        erstellt und wer sie wann eingelöst hat) sowie den Stand des Abos: Paket, Zahlweise, Zahl der Plätze,
        Status, Laufzeit und gegebenenfalls das Kündigungsdatum. Die Mitglieder eines Büros sehen die
        E-Mail-Adressen der anderen Mitglieder; sonst sieht niemand diese Angaben. Rechtsgrundlage ist der
        Nutzungsvertrag (Art. 6 Abs. 1 lit. b DSGVO). Die Angaben werden mit dem Konto der Person gelöscht, die das
        Büro verwaltet.
      </P>
      <P>
        <strong>Zahlung über Stripe.</strong> Bezahlt wird über den Zahlungsdienstleister Stripe Payments Europe,
        Ltd., 1 Grand Canal Street Lower, Grand Canal Dock, Dublin, D02 H210, Irland. Bei der Buchung und im
        Kundenportal sind Sie auf Seiten von Stripe. Dort geben Sie Ihre Zahlungsdaten (etwa Kartennummer oder
        IBAN), Ihren Namen bzw. Ihre Firma, die Rechnungsanschrift und gegebenenfalls Ihre
        Umsatzsteuer-Identifikationsnummer ein. Ihre Zahlungsdaten erhalten wir nicht. Wir übermitteln Stripe
        Ihre E-Mail-Adresse und eine interne Kennung Ihres Büros. Von Stripe erhalten wir eine Kundennummer
        und den Stand des Abos (siehe oben). Rechnungen erstellt und verschickt Stripe in unserem Auftrag.
        Stripe erhebt auf seinen Seiten zur Betrugsvorbeugung zusätzlich technische Daten Ihres Geräts und
        verantwortet diese Verarbeitung selbst. Rechtsgrundlage ist der Vertrag über das Abo (Art. 6 Abs. 1
        lit. b DSGVO), für die Aufbewahrung von Rechnungen unsere gesetzliche Pflicht (Art. 6 Abs. 1 lit. c
        DSGVO). Stripe kann Daten an die Stripe, Inc. in den USA übermitteln. Grundlage dafür ist das
        EU-US Data Privacy Framework, ergänzend gelten EU-Standardvertragsklauseln. Mehr dazu in der
        Datenschutzerklärung von Stripe:{' '}
        <a href="https://stripe.com/de/privacy" className="text-ui-tinte underline underline-offset-2" target="_blank" rel="noopener">stripe.com/de/privacy</a>.
        [Rolle von Stripe — Auftragsverarbeiter bzw. eigener Verantwortlicher — und Angaben zur Übermittlung
        anhand des aktuellen Stripe-DPA prüfen.]
      </P>
      <P>
        Löschen Sie Ihr Konto, bleiben Kundendatensatz und Rechnungen bei Stripe sowie unsere
        Buchhaltungsunterlagen erhalten, solange wir sie aufbewahren müssen. Bei Rechnungen sind das in der Regel
        acht Jahre (§ 147 AO, § 257 HGB) [Fristen prüfen lassen].
      </P>

      <H2>12. Weitere Seiten</H2>
      <P>
        Die Seiten zum Altersvorsorgedepot, zum Zuschussmodell und zum Matching-Modell rechnen ausschließlich in
        Ihrem Browser und speichern nichts — es sei denn, Sie übernehmen ein Modell mit „Für die
        Mitarbeiter-Beratung übernehmen“ in Ihr Konto (Abschnitt 7). „Beratung anfragen“ öffnet Ihr eigenes
        E-Mail-Programm; was Sie dort absenden, entscheiden Sie selbst.
      </P>

      <H2>13. Empfänger und Auftragsverarbeiter</H2>
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
        <li>
          <strong>Stripe Payments Europe, Ltd.</strong> (Dublin, Irland) — Zahlungsabwicklung, Rechnungen und
          Kundenportal für das Abo, siehe Abschnitt 11.
        </li>
      </Liste>

      <H2>14. Speicherdauer im Überblick</H2>
      <Liste>
        <li>
          Konto, gespeicherte Szenarien, Firmen und Beratungen der Mitarbeiterberatung samt unterschriebener
          Unterlagen, Ihr Auftritt im Gutachten und Rückmeldungen: bis zur Löschung des Kontos, sofern Sie sie nicht
          vorher löschen.
        </li>
        <li>Büro, Mitglieder, Einladungen und Stand des Abos: bis zur Löschung des Kontos, das das Büro verwaltet.</li>
        <li>Rechnungen und Buchhaltungsunterlagen: solange gesetzlich vorgeschrieben, in der Regel acht Jahre.</li>
        <li>Anfragen als Early Adopter: 180 Tage nach Eingang.</li>
        <li>
          Vorsorge-Check: offene Links 30 Tage, eingereichte Angaben und hochgeladene Unterlagen höchstens
          90 Tage; Unterlagen eines nicht abgesendeten Checks bis zum Ablauf des Links.
        </li>
        <li>Server-Logdateien: [Frist laut Hostinger].</li>
        <li>Browser-Speicher: bis Sie ihn löschen.</li>
      </Liste>

      <H2>15. Ihre Rechte</H2>
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

      <H2>16. Datensicherheit</H2>
      <P>
        Alle Verbindungen sind verschlüsselt (TLS). Gespeicherte Daten sind je Konto durch Zugriffsregeln der
        Datenbank getrennt; Kunden, die einen Vorsorge-Check senden, können nichts lesen — auch ihre eigenen
        Angaben nicht mehr, sobald sie abgeschickt sind. Hochgeladene Unterlagen liegen in einem nicht
        öffentlichen Speicher; abrufen kann sie nur der Berater, dem der Link gehört, und nur über kurz
        gültige, signierte Verweise. Ebenso liegen das Logo für Ihr Gutachten und die Firmenlogos der
        Mitarbeiterberatung in nicht öffentlichen Speichern, die nur Ihr Konto lesen kann. Zahlungsdaten gibt
        es bei uns nicht; Meldungen von Stripe über Ihr Abo nehmen wir nur mit gültiger Signatur an.
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
      <p className="mt-1 text-xs text-ui-schiefer">Fassung vom 1. Oktober 2026</p>

      <H2>1. Geltungsbereich</H2>
      <P>
        Diese Bedingungen gelten für die Nutzung des JS-Rentenplaners unter js-rentenplaner.de — des Rechners,
        der Arbeitgeber-Seiten, des Vorsorge-Checks und aller weiteren Inhalte. Anbieter ist [Vor- und Nachname
        bzw. Firma, Anschrift] (im Folgenden „Anbieter“), siehe{' '}
        <a href="/impressum" className="text-ui-tinte underline underline-offset-2">Impressum</a>. Mit der Registrierung bzw. der
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

