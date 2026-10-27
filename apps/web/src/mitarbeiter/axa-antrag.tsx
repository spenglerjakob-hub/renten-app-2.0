import type { ReactNode } from 'react';
import type { AxaAngaben } from '@renten/schema';
import type { UnterschriftPerson } from '../lib/bav-beratung';
import { namensTeile } from '../lib/namen';
import { beginnDatum } from './rechnung';
import {
  AXA_BELEHRUNG, AXA_ERLAEUTERT, AXA_FRAGEN, AXA_FUSSNOTEN, axaBausteine, axaBerater, axaBetraege, axaOrganr,
  axaVerzichtZuschuss, mitGesundheitsfragen,
} from './axa';
import { Verzicht, type DokumentProps } from './druck';
import { FORMULARCODE } from './axa/formularcode';
import axaLogo from './axa/axa-logo.png';
import axaLogoProtokoll from './axa/axa-logo-protokoll.png';

/*
 * DER AXA-ANTRAG fuer die Mitarbeiterberatung — nachgebaut nach der Vorlage
 * einer AXA-Agentur (Antrag auf Entgeltumwandlung, Einwilligung,
 * Datenschutzhinweise der AXA) und dem AXA-Gespraechsprotokoll 21012882
 * (11.20). Bei Verzicht kommt das Protokoll mit „Nein“ hinter die
 * Verzichtserklaerung (`AxaVerzicht`).
 *
 * Der Wortlaut ist der des Originals, auch wo es sich vertippt hat. Ersetzt
 * sind nur die Angaben, die dort fest fuer eine Firma standen: Arbeitgeber,
 * Kollektivnummer, Ort, die Agentur und der Tarif — und was der Mitarbeiter
 * sonst von Hand eintruege, steht schon da. Unterschrieben wird in den
 * Feldern `data-unterschrift`, wie in den uebrigen Unterlagen (festschreiben.tsx).
 */

const AXA = 'AXA Lebensversicherung AG';
const zahl2 = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const leer = ' ';

/** Ein Wert auf seiner Linie, wie im Formular zum Ausfuellen. */
function Linie({ wert, klasse = 'min-w-[24mm]' }: { wert: string; klasse?: string }) {
  return <span className={`inline-block border-b border-ui-tinte px-1 text-center ${klasse}`}>{wert || leer}</span>;
}

/** Ein Kaestchen zum Ankreuzen. */
function Kaestchen({ an }: { an: boolean }) {
  return (
    <span className="inline-flex h-[3.2mm] w-[3.2mm] shrink-0 items-center justify-center border border-ui-tinte align-[-0.5mm] text-[7pt] leading-none">
      {an ? 'X' : ''}
    </span>
  );
}

function JaNein({ wert }: { wert: '' | 'ja' | 'nein' }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-3 whitespace-nowrap font-semibold">
      <span className="inline-flex items-center gap-1">Ja <Kaestchen an={wert === 'ja'} /></span>
      <span className="inline-flex items-center gap-1">Nein <Kaestchen an={wert === 'nein'} /></span>
    </span>
  );
}

/** Eine Ziffer des Antrags: links die Randspalte, rechts der Text. */
function Ziffer({ rand, children, klasse = 'mt-3', teilbar = false }: {
  rand: ReactNode; children: ReactNode; klasse?: string;
  /** Lange Abschnitte (Einwilligung, Datenschutzhinweise) laufen ueber Seiten; die kurzen bleiben beisammen. */
  teilbar?: boolean;
}) {
  return (
    <div className={`grid grid-cols-[22mm_1fr] gap-3 ${teilbar ? '' : 'break-inside-avoid'} ${klasse}`}>
      <div className="text-[6.5pt] font-semibold leading-tight">{rand}</div>
      <div>{children}</div>
    </div>
  );
}

/** Was eingewilligt wird, eingerahmt wie im Original. */
function Rahmen({ children }: { children: ReactNode }) {
  return <div className="mt-1 border border-ui-tinte px-1.5 py-0.5">{children}</div>;
}

/** Eine Unterschrift: darueber das Feld fuer die Unterschrift am Bildschirm, darunter die Beschriftung. */
function Unterschrift({ feld, unter, hoehe = 'h-[14mm]' }: { feld?: UnterschriftPerson; unter?: string; hoehe?: string }) {
  return (
    <div className="break-inside-avoid">
      <div className={`flex ${hoehe} items-end border-b border-ui-tinte`}>
        {feld && <div data-unterschrift={feld} className="flex h-full min-w-0 flex-1 items-end justify-end" />}
      </div>
      {unter && <p className="text-center">{unter}</p>}
      {feld && <p data-vermerk={feld} className="text-[6.5pt] leading-snug text-ui-schiefer" />}
    </div>
  );
}

/** Der Ort der Firma, aus der letzten Zeile der Anschrift ohne Postleitzahl. */
function ortDerFirma(anschrift: string): string {
  const zeilen = anschrift.split('\n').map((z) => z.trim()).filter(Boolean);
  return (zeilen[zeilen.length - 1] ?? '').replace(/^\d{4,5}\s+/, '');
}

export function AxaAntrag(props: DokumentProps) {
  const { firma, logo, daten, r, auftritt } = props;
  const a = daten.angaben;
  const e = daten.entscheidung;
  const x = e.axa;
  const f = firma.angebot;
  const mitarbeiter = namensTeile(a.name, a.vorname, a.nachname);
  const agentur = auftritt?.firma.trim() ?? '';
  const tarif = f.tarif.trim() || 'Relax Rente';
  const b = axaBetraege(r);
  const ortDatum = [e.ort.trim(), e.datum].filter(Boolean).join(', ');

  return (
    <article className="text-[8.5pt] leading-snug text-ui-tinte">
      {/* --- Antrag und Vereinbarung ------------------------------------------ */}
      <div className="grid grid-cols-3 items-center gap-6">
        <div className="flex justify-start">{logo && <img src={logo} alt={firma.name} className="max-h-[17mm] max-w-[48mm] object-contain" />}</div>
        <div className="flex justify-center">
          {auftritt?.logo && <img src={auftritt.logo} alt={agentur || 'Agentur'} className="max-h-[17mm] max-w-[52mm] object-contain" />}
        </div>
        <div className="flex justify-end"><img src={axaLogo} alt="AXA" className="h-[17mm] w-auto" /></div>
      </div>

      <div className="ml-[25mm] mt-3">
        <p className="text-[9pt] font-semibold">
          Antrag auf Entgeltumwandlung / Vereinbarung über die Umwandlung von Arbeitsentgelt in Beiträge für eine
          Direktversicherung bei der {AXA}
        </p>
        <p className="mt-3 font-semibold">
          Kollektivnummer: <Linie wert={f.kollektivnummer} klasse="min-w-[30mm]" /> Organr.: <Linie wert={axaOrganr(x, f)} klasse="min-w-[30mm]" />
        </p>
        <p className="mt-4 font-semibold">
          Diese Vereinbarung zwischen Arbeitgeber und Arbeitnehmer gilt gleichzeitig als Antrag zum Abschluss einer
          Direktversicherung bei der {AXA}
        </p>
        <p className="mt-3 italic">zwischen</p>
        <p className="font-semibold">Arbeitgeber (Versicherungsnehmer)</p>
        <p className="mt-2 whitespace-pre-line font-semibold">{[firma.name, f.anschrift.trim()].filter(Boolean).join('\n')}</p>
        <p className="mt-3 italic">und</p>
        <p className="font-semibold">Arbeitnehmer (versicherte Person)</p>
        <div className="mt-2 w-[60mm] space-y-2">
          {([['Name', mitarbeiter.nachname], ['Vorname', mitarbeiter.vorname], ['bAV ID', a.bavId]] as const).map(([titel, wert]) => (
            <div key={titel}>
              <p className="border-b border-ui-tinte px-1 font-medium">{wert || leer}</p>
              <p>{titel}</p>
            </div>
          ))}
        </div>
      </div>

      <Ziffer rand={<>1.<br />Vereinbarung der Gehalts&shy;umwandlung</>} klasse="mt-6">
        <p>Der Anspruch des Arbeitnehmers auf laufende Bezüge (Lohn/Gehalt) wird in Höhe eines laufenden</p>
        <p className="mt-1">
          <span className="font-semibold">Betrages von monatlich <Linie wert={b.umwandlung > 0 ? zahl2(b.umwandlung) : ''} /> EUR, erstmals zum{' '}
          <Linie wert={beginnDatum(daten, f)} klasse="min-w-[26mm]" /> herabgesetzt</span> (Umwandlungsbetrag).
        </p>
        <p className="mt-3 font-semibold">Der Arbeitgeberbeitrag beträgt <Linie wert={zahl2(b.arbeitgeber)} /> EUR mtl.:</p>
      </Ziffer>
      <Ziffer rand={<>2.<br />Arbeitgeber&shy;beitrag</>}>
        <p className="font-semibold">Gesamtbeitrag Arbeitgeber und Arbeitnehmer mtl.: <Linie wert={b.gesamt > 0 ? zahl2(b.gesamt) : ''} /> EUR</p>
        <p className="mt-3">
          Der Arbeitgeberbeitrag wird auf einen gesetzlich oder tarifvertraglich verpflichtend zu zahlenden
          Arbeitgeberzuschuss angerechnet und ist nicht befristet.
        </p>
        <p className="mt-2">
          Der Arbeitgeber erteilt auf Grundlage der Vereinbarung eine Versorgungszusage und schließt eine
          Direktversicherung im Sinne des § 1b Abs. 3 Betriebsrentengesetz (BetrAVG) bei der {AXA} ab. Die
          Vertragsinhalte sind im Versicherungssschein (Versicherungsbestätigung) einschließlich der zugrundeliegenden
          Versicherungsbedingungen geregelt. Eine Kopie wird der Arbeitgeber nach Abschluß des Versicherungsschutzes dem
          Arbeitnehmer unverzüglich zuleiten. Die Höhe des Beitrages entspricht dem Umwandlungsbetrag.
        </p>
      </Ziffer>
      <Ziffer rand={<>3.<br />Steuerliche Förderung</>}>
        <p>Der Beitrag zur Direktversicherung ist gemäß § 3 Nr. 63 Einkommensteuergesetz (EStG) steuerfrei.</p>
      </Ziffer>
      <Ziffer rand={<>4.<br />Sozial&shy;versicherungs&shy;beiträge</>}>
        <p>
          Dem Arbeitnehmer ist bekannt, dass - soweit sozialversicherungspflichtiges Arbeitsentgelt umgewandelt wird -
          für einen Umwandlungsbetrag von bis zu 4 % der Beitragsbemessungsgrenze der gesetzlichen Rentenversicherung der
          Arbeiter und Angestellten (West) keine Sozialversicherungsbeiträge zu zahlen sind, wenn die Beiträge gem. § 3 Nr.
          63 EStG steuerfrei sind. Der Arbeitnehmer ist darüber unterrichtet, dass damit eine entsprechende Minderung
          künftiger Ansprüche auf Sozialversicherungsleistungen (z. B. Renten, Arbeitslosengeld, Krankengeld) verbunden ist.
        </p>
      </Ziffer>
      <Ziffer rand={<>5.<br />Gesetzliche Kranken&shy;versicherung</>}>
        <p>
          Dem Arbeitnehmer ist ferner bekannt, dass Leistungen aus der Versorgungszusage - sofern er gesetzlich
          krankenversichert ist - ggf. der Beitragspflicht zu gesetzlichen Kranken- und Pflegeversicherung unterliegen.
        </p>
      </Ziffer>
      <Ziffer rand={<>6.<br />Ausscheiden des Mitarbeiters</>}>
        <p>
          Scheidet der Mitarbeiter vor Eintritt des Versicherungsfalles aus den Diensten des Arbeitgebers aus, so geht die
          Versicherungsnehmerstellung zum Zeitpunkt des Ausscheidens auf den Mitarbeiter über. Er hat dann das Recht, die
          Versicherung mit eigenen Beiträgen fortzuführen oder in eine beitragsfreie Versicherung umwandeln zu lassen. Sind
          die Voraussetzungen für eine Beitragsfreistellung nicht erfüllt, erlischt die Versicherung. Ein eventuell
          vorhandener Zeitwert wird ausgezahlt.
        </p>
      </Ziffer>
      <Ziffer rand={<>7.<br />Vorzeitige Beendigung des Versicherungs&shy;vertrages</>}>
        <p>
          Dem Arbeitnehmer ist bekannt, dass für den Abschluss und den Vertrieb der Versicherung Kosten anfallen, die
          gleichmäßig mindestens auf die ersten fünf Vertragsjahre verteilt werden. Daher fällt bei einer Kündigung des
          Versicherungsverhältnisses in den ersten Jahren nur ein im Verhältnis zu den eingezahlten Beiträgen geringerer
          Rückkaufswert an.
        </p>
      </Ziffer>
      <Ziffer rand={<>8.<br />Kündigung dieser Vereinbarung</>}>
        <p>
          Sollten sich die bei Abschluss dieser Vereinbarung maßgebenden Verhältnisse nachhaltig ändern, kann diese
          Vereinbarung von jedem Vertragspartner mit einer Frist von 4 Wochen gekündigt werden. Beide Vertragspartner werden
          sich dann bemühen, diese Vereinbarung den geänderten Verhältnissen anzupassen und zu einer Absprache über die
          Weiterführung des Versicherungsvertrages mit der {AXA} zu gelangen.
        </p>
      </Ziffer>
      <Ziffer rand={<>9.<br />Bestehende Versorgungs&shy;ordnungen</>}>
        <p>Eine zwischen den Vertragsparteien bereits bestehende Versorgungsregelung bleibt von dieser Vereinbarung unberührt.</p>
      </Ziffer>
      <Ziffer rand={<>10.<br />Beratung{agentur ? ` durch die ${agentur}` : ''}</>}>
        <p>
          Der Arbeitnehmer bestätigt, dass er vom Berater{agentur ? ` der ${agentur}` : ''} umfassend informiert und
          aufgeklärt wurde.
        </p>
      </Ziffer>
      <Ziffer rand={<>11.<br />Wertentwicklung des Vertragsvermögens</>}>
        <p>
          Dem Arbeitnehmer ist bekannt, dass der Arbeitgeber für eine ungünstige Wertentwicklung des Vertragsvermögens keine
          Verantwortung übernimmt. Der Arbeitnehmer ist selbst für die Ausübung der Gestaltungsrechte der {tarif}, die ihm
          im Rahmen der Versicherungsbedingungen für die Direktversicherung mit Indexpartizipation eingeräumt werden,
          verantwortlich.
        </p>
      </Ziffer>
      <Ziffer rand="Unterschriften" klasse="mt-4">
        <div className="w-[80mm]">
          <p>Ort, Datum</p>
          <p className="mt-2 border-b border-ui-tinte px-1">{ortDatum ? `${ortDatum}` : leer}</p>
          <p className="mt-3">Arbeitnehmer</p>
          <div className="mt-1"><Unterschrift feld="mitarbeiter" /></div>
        </div>
      </Ziffer>

      {/* Die Fragen zur Gesundheit gibt es nur mit der Beitragsbefreiung bei Berufsunfaehigkeit. */}
      {mitGesundheitsfragen(x) && (
        <>
          <Ziffer rand={<>Mitarbeiter&shy;erklärung der zu versichernden Person</>} klasse="mt-6" teilbar>
            <p className="font-semibold">Belehrung</p>
            {AXA_BELEHRUNG.map(({ titel, text }, i) => (
              <div key={i} className={i > 0 ? 'mt-2' : ''}>
                {titel && <p>{titel}</p>}
                <p>{text}</p>
              </div>
            ))}
            <p className="mt-2">Erklärung des Arbeitnehmers:</p>
            {AXA_FRAGEN.map(({ feld, text, sterne }) => <Frage key={feld} wert={x[feld]} sterne={sterne}>{text}</Frage>)}
          </Ziffer>

          <div className="mt-6 space-y-0.5 text-[6.5pt] break-inside-avoid">
            {AXA_FUSSNOTEN.map((f) => <p key={f}>{f}</p>)}
          </div>
        </>
      )}

      {/* --- Einwilligung und Schweigepflichtentbindung ---------------------------- */}
      <div className="break-before-page pt-2 text-[6.8pt] leading-[1.3]">
        <Ziffer klasse="mt-0" teilbar rand={<>Einwilligung des Arbeit&shy;nehmers (= versicherte Person) und aller mitzuver&shy;sichernder Personen in die Erhebung und Verwendung von Gesundheits&shy;daten und Schweige&shy;pflicht&shy;entbindungs&shy;erklärung</>}>
          <Einwilligung />
        </Ziffer>
        <Ziffer rand="Unterschriften" klasse="mt-4">
          <div className="grid grid-cols-2 gap-10">
            <div>
              <p className="font-semibold">Arbeitnehmer = versicherte Person</p>
              <p className="mt-4 border-b border-ui-tinte px-1">{ortDatum || leer}</p>
              <p>Ort, Datum</p>
              <div className="mt-2"><Unterschrift feld="mitarbeiter" unter="Unterschrift" /></div>
            </div>
            <div>
              <p className="font-semibold">Unterschrift Berater</p>
              <div className="mt-[17mm]"><Unterschrift feld="berater" unter={agentur || 'Berater'} /></div>
            </div>
          </div>
        </Ziffer>

        <Ziffer rand={<>Information zur Verwendung Ihrer Daten</>} klasse="mt-6" teilbar>
          <Datenschutz />
        </Ziffer>
      </div>

      <AxaProtokoll {...props} />
    </article>
  );
}

/** Bei Verzicht: die Verzichtserklaerung und dahinter, auf eigener Seite, das AXA-Gespraechsprotokoll mit „Nein“. */
export function AxaVerzicht(props: DokumentProps) {
  return (
    <div>
      <Verzicht {...props} />
      <AxaProtokoll {...props} />
    </div>
  );
}

function Frage({ wert, sterne, children }: { wert: '' | 'ja' | 'nein'; sterne: string; children: ReactNode }) {
  return (
    <div className="mt-2 flex items-end justify-between gap-4 break-inside-avoid">
      <p>{children}</p>
      <span className="flex shrink-0 items-center gap-1.5"><JaNein wert={wert} /> <span className="w-[8mm]">{sterne}</span></span>
    </div>
  );
}

/* --- Einwilligungs- und Schweigepflichtentbindungserklaerung (Wortlaut der Vorlage) --- */

function Einwilligung() {
  return (
    <div className="space-y-1">
      <p>
        Die Regelungen des Versicherungsvertragsgesetzes, der EU-Datenschutzgrundverordnung, des Bundesdatenschutzgesetzes
        anderer Datenschutzvorschriften enthalten keine ausreichenden Rechtsgrundlagen für die Erhebung, Verarbeitung und
        Nutzung von Gesundheitsdaten durch Versicherungen. Um Ihre Gesundheitsdaten für diesen Antrag und den Vertrag erheben
        und verwenden zu dürfen, benötigt die {AXA} daher Ihre datenschutzrechtliche(n) Einwilligung(en). Darüber hinaus
        benötigt die {AXA} Ihre Schweigepflichtentbindungen, um Ihre Gesundheitsdaten bei schweigepflichtigen Stellen, wie
        z.B. Ärzten, erheben zu dürfen. Als Unternehmen der Lebensversicherung benötigt die {AXA} Ihre
        Schweigepflichtentbindung ferner, um Ihre Gesundheitsdaten oder weitere nach § 203 Strafgesetzbuch geschützte Daten,
        wie z.B. die Tatsache, dass ein Vertrag mit Ihnen besteht, an andere Stellen, z. B. ViaMed weiterleiten zu dürfen.
      </p>
      <p>
        Es steht Ihnen frei, die Einwilligung/Schweigepflichtentbindung nicht abzugeben oder jederzeit später mit Wirkung für
        die Zukunft zu widerrufen. Der Widerruf ist zu richten an: {AXA}, Colonia-Allee 10-20, 51067 Köln oder per Fax an
        0221 148-22750 oder per Email an service@axa.de. Wir weisen jedoch darauf hin, dass ohne Verarbeitung von
        Gesundheitsdaten der Abschluss oder die Durchführung des Versicherungsvertrages in der Regel nicht möglich sein wird.
      </p>
      <p>Die Erklärungen betreffen den Umgang mit Ihren Gesundheitsdaten und sonstiger nach § 203 StGB geschützter Daten</p>
      <p>– durch die {AXA} (unter 1.),</p>
      <p>– im Zusammenhang mit der Abfrage bei Dritten (unter 2.),</p>
      <p>– bei der Weitergabe an Stellen außerhalb der {AXA} (unter 3.) und</p>
      <p>– wenn der Vertrag nicht zustande kommt (unter 4.).</p>
      <p>
        Die Erklärungen gelten für die von Ihnen gesetzlich vertretenen Personen wie Ihre Kinder, soweit diese die Tragweite
        dieser Einwilligung nicht erkennen und daher keine eigenen Erklärungen abgeben können.
      </p>

      <p className="pt-2 font-semibold">1. Erhebung, Speicherung und Nutzung der von Ihnen mitgeteilten Gesundheitsdaten durch die {AXA}</p>
      <Rahmen>
        <p>
          <span className="font-semibold">Ich willige ein</span>, dass die {AXA} die von mir in diesem Antrag und künftig
          mitgeteilten Gesundheitsdaten erhebt, speichert und nutzt, soweit dies zur Antragsprüfung sowie zur Begründung,
          Durchführung oder Beendigung dieses Versicherungsvertrages erforderlich ist.
        </p>
      </Rahmen>
      <Rahmen>
        <p>
          <span className="font-semibold">Ich willige ein</span>, dass die {AXA}, soweit auf Grund von Kooperationen mit
          gesetzlichen Krankenkassen, Vereinen, Verbänden, Firmen oder sonstigen Dritten Vorteilskonditionen gewährt werden,
          zwecks Prüfung, ob eine entsprechende Mitgliedschaft oder Zugehörigkeit mit Anspruch auf Vorteilskonditionen
          besteht, mit den genannten Dritten einen Datenabgleich vornimmt und entbinde insoweit den Versicherer von der
          Schweigepflicht.
        </p>
      </Rahmen>

      <p className="pt-2 font-semibold">2. Abfrage von Gesundheitsdaten bei Dritten</p>
      <p className="font-semibold">2.1. Abfrage von Gesundheitsdaten bei Dritten zur Risikobeurteilung und zur Prüfung der Leistungspflicht</p>
      <p>
        Für die Beurteilung der zu versichernden Risiken kann es notwendig sein, Informationen von Institutionen abzufragen,
        di über Ihre Gesundheitsdaten verfügen. Außerdem kann es zur Prüfung der Leistungspflicht erforderlich sein, dass wir
        die Angaben über Ihre gesundheitlichen Verhältnisse prüfen müssen, die Sie zur Begündung von Ansprüchen gemacht haben
        oder die sich aus eingereichten Unterlagen (z. B. Rechnungen, Verordnungen, Gutachten) oder Mitteilungen z. B. eines
        Arztes oder sonstigen Angehörigen eines Heilberufs ergeben. Diese Überprüfung erfolgt nur, soweit es erforderlich
        ist. Wir benötigen hierfür Ihre Einwilligung einschließlich einer Schweigepflichtentbindung für sich sowie für diese
        Stellen, falls im Rahmen dieser Abfragen Gesundheitsdaten oder weitere nach § 203 Strafgesetzbuch geschützte
        Informationen weitergegeben werden müssen. Wir werden Sie in jedem Einzelfall darüber informieren, von welchen
        Personen oder Einrichtungen zu welchem Zweck eine Auskunft benötigt wird. Sie können dann jeweils entscheiden, ob Sie
      </p>
      <p>– die erforderlichen Unterlagen selbst beibringen</p>
      <p>
        – oder in die Erhebung und Verwendung Ihrer Gesundheitsdaten durch uns einwilligen, die genannten Personen oder
        Einrichtungen sowie deren Mitarbeiter von der Schweigepflicht entbinden und in die Übermittlung Ihrer
        Gesundheitsdaten an die entsprechende Gesellschaft einwilligen.
      </p>
      <p className="pt-1 font-semibold">2.2. Erklärungen für den Fall Ihres Todes</p>
      <p>
        Zur Prüfung der Leistungspflicht kann es auch nach Ihrem Tod erforderlich sein, gesundheitliche Angaben zu prüfen.
        Eine Prüfung kann auch erforderlich sein, wenn sich bis zu zehn Jahre nach Vertragsschluss für uns konkrete
        Anhaltspunkte dafür ergeben, dass bei der Antragstellung unrichtige oder unvollständige Angaben gemacht wurden und
        damit die Risikobeurteilung beeinflusst wurde. Auch dafür bedürfen wir Einwilligung und Schweigepflichtentbindung.
      </p>
      <Rahmen>
        <p>
          Für den Fall meines Todes willige ich in die Erhebung meiner Gesundheitsdaten bei Dritten (Ärzten, Pflegepersonen,
          Bediensteten von Krankenhäusern, sonstigen Krankenanstalten, Pflegeheimen, Personenversicherern, gesetzlichen
          Krankenkassen, Berufsgenossenschaften, Behörden) zur Leistungsprüfung bzw. einer erforderlichen erneuten
          Antragsprüfung ein.
        </p>
        <p>
          Ich befreie die genannten Personen und Mitarbeiter der genannten Einrichtungen von ihrer Schweigepflicht, soweit
          meine zulässigerweise gespeicherten Gesundheitsdaten aus Untersuchungen, Beratungen, Behandlungen sowie
          Versicherungsanträgen und -verträgen aus einem Zeitraum von bis zu zehn Jahren vor Antragstellung übermittelt
          werden.
        </p>
        <p>
          Ich bin darüber hinaus damit einverstanden, dass in diesem Zusammenhang - soweit erforderlich - meine
          Gesundheitsdaten durch die {AXA} an diese Stellen weitergegeben werden und befreie auch insoweit die für die {AXA}{' '}
          tätigen Personen von ihrer Schweigepflicht.
        </p>
      </Rahmen>

      <p className="pt-2 font-semibold">3. Weitergabe Ihrer Gesundheitsdaten und weiterer nach § 203 StGB geschützter Daten an Stellen außerhalb der {AXA}</p>
      <p>
        Die {AXA} verpflichtet die nachfolgenden Stellen vertraglich auf die Einhaltung der Vorschriften über den
        Datenschutz und die Datensicherheit.
      </p>
      <p className="pt-1 font-semibold">3.1. Datenweitergabe zur medizinischen Begutachtung</p>
      <p>
        Für die Beurteilung der zu versichernden Risiken und zur Prüfung der Leistungspflicht kann es notwendig sein,
        medizinische Gutachter einzuschalten. Wir benötigen Ihre Einwilligung und Schweigepflichtentbindung, wenn in diesem
        Zusammenhang Ihre Gesundheitsdaten und weitere nach § 203 StGB geschützte Daten übermittelt werden. Sie werden über
        die jeweilige Datenübermittlung unterrichtet.
      </p>
      <Rahmen>
        <p>
          <span className="font-semibold">Ich willige ein</span>, dass die {AXA} meine Gesundheitsdaten an medizinische
          Gutachter übermitteln, soweit dies im Rahmen der Risikoprüfung oder der Prüfung der Leistungspflicht erforderlich
          ist und meine Gesundheitsdaten dort zweckentsprechend verwendet und die Ergebnisse an diese zurück übermittelt
          werden. Im Hinblick auf meine Gesundheitsdaten und weitere nach § 203 StGB geschützte Daten entbinde ich die für
          die {AXA} tätigen Personen und die Gutachter von ihrer Schweigepflicht.
        </p>
      </Rahmen>
      <p className="pt-1 font-semibold">3.2. Übertragung von Aufgaben auf andere Stellen (Unternehmen oder Personen)</p>
      <p>
        Die {AXA} führt bestimmte Aufgaben, wie zum Beispiel die Risikoprüfung, die Leistungsfallbearbeitung oder die
        telefonische Kundenbetreuung, bei denen es zu einer Erhebung, Verarbeitung oder Nutzung Ihrer Gesundheitsdaten kommen
        kann, nicht selbst durch, sondern überträgt die Erledigung einer anderen Gesellschaft der AXA-Gruppe oder einer
        anderen Stelle. Werden hierbei Ihre nach § 203 StGB geschützten Daten weitergegeben, benötigt die {AXA} Ihre
        Schweigepflichtentbindung für sich und soweit erforderlich für die anderen Stellen.
      </p>
      <p>
        Die {AXA} führt eine fortlaufend aktualisierte Liste über die Stellen und Kategorien von Stellen, die
        vereinbarungsgemäß Gesundheitsdaten für die {AXA} erheben, verarbeiten oder nutzen unter Angabe der übertragenen
        Aufgaben. Die zurzeit gültige Liste ist als Anlage der Einwilligungserklärung angefügt. Eine aktuelle Liste kann auch
        im Internet unter www.axa.de/Datenschutz eingesehen oder bei den in Ihren Vertragsunterlagen genannten
        Ansprechpartner/Betreuer angefordert werden. Für die Weitergabe Ihrer Gesundheitsdaten an und die Verwendung durch
        die in der Liste genannten Stellen benötigt die {AXA} Ihre Einwilligung.
      </p>
      <Rahmen>
        <p>
          <span className="font-semibold">Ich willige ein</span>, dass die {AXA} meine Gesundheitsdaten an die in der oben
          erwähnten Liste genannten Stellen übermittelt und dass die Gesundheitsdaten dort für die angeführten Zwecke im
          gleichen Umfang erhoben, verarbeitet und genutzt werden, wie die {AXA} dies tun dürfte. Soweit erforderlich,
          entbinde ich die Mitarbeiter der AXA Unternehmensgruppe und sonstiger Stellen im Hinblick auf die Weitergabe von
          Gesundheitsdaten und anderer nach § 203 StGB geschützter Daten von ihrer Schweigepflicht.
        </p>
      </Rahmen>
      <p className="pt-1 font-semibold">3.3. Datenweitergabe an Rückversicherungen</p>
      <p>
        Um die Erfüllung Ihrer Ansprüche abzusichern, kann die {AXA} Rückversicherungen einschalten, die das Risiko ganz
        oder teilweise übernehmen. In einigen Fällen bedienen sich die Rückversicherungen dafür weiterer
        Rückversicherungen, denen sie ebenfalls Ihre Daten übergeben. Damit sich die Rückversicherung ein eigenes Bild über
        das Risiko oder den Versicherungsfall machen kann, ist es möglich, dass die {AXA} Ihren Versicherungsantrag oder
        Leistungsantrag der Rückversicherung vorlegt. Das ist insbesondere dann der Fall, wenn die Versicherungssumme
        besonders hoch ist oder es sich um ein schwierig einzustufendes Risiko handelt.
      </p>
      <p>
        Darüber hinaus ist es möglich, dass die Rückversicherung die {AXA} aufgrund ihrer besonderen Sachkunde bei der
        Risiko- oder Leistungsprüfung sowie bei der Bewertung von Verfahrensabläufen unterstützt.
      </p>
      <p>
        Haben Rückversicherungen die Absicherung des Risikos übernommen, können sie kontrollieren, ob die {AXA} das Risiko
        bzw. einen Leistungsfall richtig eingeschätzt hat.
      </p>
      <p>
        Außerdem werden Daten über Ihre bestehenden Verträge und Anträge im erforderlichen Umfang an Rückversicherungen
        weitergegeben, damit diese überprüfen können, ob und in welcher Höhe sie sich an dem Risiko beteiligen können.
      </p>
      <p>Zur Abrechnung von Prämienzahlungen und Leistungsfällen können Daten über Ihre bestehenden Verträge an Rückversicherungen weitergegeben werden.</p>
      <p>
        Zu den oben genannten Zwecken werden möglichst anonymisierte bzw. pseudonymisierte Daten, jedoch auch
        personenbezogene Gesundheitsangaben verwendet.
      </p>
      <p>Ihre personenbezogenen Daten werden von den Rückversicherungen nur zu den vorgenannten Zwecken verwendet.</p>
      <p>Über die Übermittlung Ihrer Gesundheitsdaten an Rückversicherungen werden Sie durch die {AXA} unterrichtet.</p>
      <Rahmen>
        <p>
          <span className="font-semibold">Ich willige ein</span>, dass meine Gesundheitsdaten - soweit erforderlich - an
          Rückversicherungen übermittelt und dort zu den genannten Zwecken verwendet werden. Soweit erforderlich, entbinde
          ich die für die {AXA} tätigen Personen im Hinblick auf die Gesundheitsdaten und weiteren nach § 203 StGB
          geschützter Daten von ihrer Schweigepflicht.
        </p>
      </Rahmen>
      <p className="pt-1 font-semibold">3.4. Datenweitergabe an selbstständige Vermittler</p>
      <p>
        Die {AXA} gibt grundsätzlich keine Angaben zu Ihrer Gesundheit an selbstständige Vermittler weiter. Es kann aber in
        den folgenden Fällen dazu kommen, dass Daten, die Rückschlüsse auf Ihre Gesundheit zulassen oder gemäß § 203 StGB
        geschützte Informationen über Ihren Vertrag Versicherungsvermittlern zur Kenntnis gegeben werden.
      </p>
      <p>
        Soweit es zu vertragsbezogenen Beratungszwecken erforderlich ist, kann der Sie betreuende Vermittler Informationen
        darüber erhalten, ob und ggf. unter welchen Voraussetzungen (z. B. Annahme mit Risikozuschlag, Ausschlüsse
        bestimmter Risiken) Ihr Vertrag angenommen werden kann. Der Vermittler, der Ihren Vertrag vermittelt hat, erfährt,
        dass und mit welchem Inhalt der Vertrag abgeschlossen wurde. Dabei erfährt er auch, ob Risikozuschläge oder
        Ausschlüsse bestimmter Risiken vereinbart wurden.
      </p>
      <p>
        Bei einem Wechsel des Sie betreuenden Vermittlers auf einen anderen Vermittler kann es zur Übermittlung der
        Vertragsdaten mit den Informationen über bestehende Risikozuschläge und Ausschlüsse bestimmter Risiken an den neuen
        Vermittler kommen. Sie werden bei einem Wechsel des Sie betreuenden Vermittlers auf einen anderen Vermittler vor der
        Weitergabe von Gesundheitsdaten informiert sowie auf Ihre Widerspruchsmöglichkeit hingewiesen.
      </p>
      <Rahmen>
        <p>
          <span className="font-semibold">Ich willige ein</span>, dass die {AXA} meine Gesundheitsdaten und sonstigen nach
          § 203 StGB geschützten Daten in den oben genannten Fällen - soweit erforderlich - an den für mich zuständigen
          selbstständigen Versicherungsvermittler übermittelt und diese dort erhoben, gespeichert und zu Beratungszwecken
          genutzt werden dürfen.
        </p>
      </Rahmen>
      <Rahmen>
        <p>
          Diese Einwilligung gilt entsprechend für die Datenverarbeitung von Maklerpools oder anderen Dienstleistern (z.B.
          Betreiber von Vergleichssoftware, Maklerverwaltungsprogrammen), die mein Vermittler zum Abschluss und zur
          Verwaltung meiner Versicherungsverträge einschaltet. Die betreffenden Dienstleister kann ich bei meinem Vermittler
          erfragen.
        </p>
      </Rahmen>

      <p className="pt-2 font-semibold">4. Datenübermittlung an Dienstleister des Arbeitgebers im Rahmen der betrieblichen Altersversorgung</p>
      <p>
        Zur Durchführung der betrieblichen Altersversorgung können die Arbeitgeber die Verwaltung der Versicherungsverträge
        der versicherten Arbeitnehmer und den damit verbundenen Datenverkehr mit dem Versicherer auch über die
        Internetplattform der eVorsorge Systems GmbH, Leopoldstr. 244, 80807 München durchführen. Dieser Datentransfer
        erfolgt zum Schutz vor unbefugtem Zugriff über gesicherte Verbindungen.
      </p>
      <Rahmen>
        <p>
          <span className="font-semibold">Ich willige ein</span>, dass mein Arbeitgeber den Datenverkehr mit der {AXA} zur
          Verwaltung und Durchführung der Versicherungsverträge zu meiner betrieblichen Altersversorgung betreffend meine
          Gesundheitsdaten und sonstigen nach § 203 StGB geschützten Daten über die Internetplattform der eVorsorge Systems
          GmbH durchführt.
        </p>
      </Rahmen>

      <p className="pt-2 font-semibold">5. Speicherung und Verwendung Ihrer Gesundheitsdaten wenn der Vertrag nicht zustande kommt</p>
      <p>
        Kommt der Vertrag mit Ihnen nicht zustande, speichert die {AXA} Ihre im Rahmen der Risikoprüfung erhobenen
        Gesundheitsdaten für den Fall, dass Sie erneut Versicherungsschutz beantragen. Außerdem ist es möglich, dass die {AXA}{' '}
        zu Ihrem Antrag einen Vermerk an das Hinweis- und Informationssystem meldet, der an anfragende Versicherungen für
        deren Risiko- und Leistungsprüfung übermittelt wird (siehe Ziffer 3.4). Die {AXA} speichert Ihre Daten auch, um
        mögliche Anfragen weiterer Versicherungen beantworten zu können. Ihre Daten werden bei der {AXA} und im Hinweis- und
        Informationssystem bis zum Ende des dritten Kalenderjahres nach dem Jahr der Antragstellung gespeichert.
      </p>
      <p>
        Ich willige ein, dass die {AXA} meine Gesundheitsdaten - wenn der Vertrag nicht zustande kommt - für einen Zeitraum
        von drei Jahren ab dem Ende des Kalenderjahres der Antragstellung zu den oben genannten Zwecken speichert und nutzt.
      </p>
    </div>
  );
}

/* --- Information zur Verwendung Ihrer Daten (Datenschutzhinweise der AXA) ---------- */

const KONZERN = [
  'AXA ART Versicherung AG', 'AXA Bank AG', 'AXA Customer Care GmbH', 'AXA Direktberatung GmbH', 'AXA easy Versicherung AG',
  'AXA Konzern AG', 'AXA Krankenversicherung AG', 'AXA Lebensversicherung AG',
  'AXA MATRIX Risk Consultants Deutschland, ZN der AXA Matrix Risk Consultants S.A., Paris', 'AXA Service & Direct Solutions GmbH',
  'AXA Versicherung AG', 'clerita GmbH', 'DBV Deutsche Beamtenversicherung ZN der AXA Versicherung AG', 'Deutsche Ärzteversicherung AG',
  'Deutsche Ärzte Finanz Beratungs- und Vermittlungs-AG', 'E.C.A. LEUE GmbH + Co. KG', 'Helmsauer & Preuss GmbH', 'INREKA Finanz AG',
  'Kölner Spezial Beratungs-GmbH für betriebliche Altersversorgung', 'winExpertisa Gesellschaft zur Förderung beruflicher Vorsorge mbH',
];

/** [Auftraggebende Gesellschaft (nur in der ersten Zeile ihrer Gruppe), Dienstleister, Gegenstand, Gesundheitsdaten] */
type Zeile = [string, string, string, string];
const EINZELN: Zeile[] = [
  ['Alle Konzerngesellschaften', 'AXA Konzern AG', 'Antrags-, Vertrags-, Leistungs- und Regressbearbeitung, Vermittlerbetreuung', 'ja'],
  ['', 'AXA Group Solutions S.A. einschl. Ndl. Deutschland', 'Betrieb gruppenweiter IT-Anwendungen', 'nein'],
  ['', 'AXA Logistik Service GmbH', 'Post-, Antrags-, Vertrags-, Leistungsbearbeitung', 'ja'],
  ['', 'AXA Technology Services Germany GmbH und GIE AXA Tech Belgium', 'Rechenzentrumsbetreiber', 'ja'],
  ['', 'AXA Customer Care Center GmbH', 'Telefonischer Kundendienst, Kundenbetreuung', 'ja'],
  ['', 'ARA GmbH', 'Telefonischer Kundendienst', 'nein'],
  ['', 'AXA Assistance Deutschland GmbH', 'Telefonischer Kundendienst', 'ja'],
  ['', 'GIE AXA', 'Hosting, Datenselektionen', 'nein'],
  ['', 'GDV Dienstleistungs GmbH', 'Datentransfer mit Vermittlern und Dienstleistern', 'nein'],
  ['AXA ART Versicherung AG', 'ACS Information Technologies UK Ltd.', 'Rechenzentrumsbetreiber', 'nein'],
  ['AXA Krankenversicherung AG', 'ViaMed GmbH', 'Leistungsprüfung', 'ja'],
  ['', 'ROLAND Assistance GmbH', 'Diseasemanagement', 'ja (1)'],
  ['', 'MedicalContact AG', 'Diseasemanagement', 'ja (1)'],
  ['', 'Sanvartis GmbH', 'Diseasemanagement', 'ja (1)'],
  ['', 'IMB Consult GmbH', 'Medizinische Gutachten', 'ja (1)'],
  ['', 'unternehmen online GmbH & Co. KG', 'Betrieb online-Anwendungen (Angebots-/Antragsaufnahme)', 'ja'],
  ['AXA Lebensversicherung AG', 'AXA Bank AG', 'Depotverwaltung für Fondspolicen', 'nein'],
  ['', 'April Deutschland AG', 'Bestands- und Leistungsbearbeitung', 'ja'],
  ['', 'Vorsorge Lebensversicherung AG', 'Antrags-/Leistungsbearbeitung (Zahlungssystem ERGO und Münchner Rück)', 'ja'],
  ['', 'unternehmen online GmbH & Co. KG', 'Betrieb online-Anwendungen (Angebots-/Antragsaufnahme)', 'ja'],
  ['', 'SP Consult AG', 'Antrags- und Leistungsbearbeitung, Bestandsverwaltung', 'nein'],
  ['AXA Versicherung AG / AXA easy Versicherung AG / DBV Deutsche Beamtenversicherung ZN der AXA Versicherung AG',
    'AXA Assistance Deutschland GmbH',
    'Diseasemanagement, Durchführung KFZ-Versicherung für Kreditkarteninhaber, Bestandsverwaltung, Leistungsbearbeitung für Mietwagen-KFZ-Versicherung, Handwerker- und Dienstleisternetz, Anlage Neuschäden',
    'ja (1)'],
  ['', 'April Deutschland AG', 'Bestands- und Leistungsbearbeitung', 'ja'],
  ['', 'Versicherungsforen medi-part GmbH', 'Leistungsbearbeitung', 'ja (1)'],
  ['', 'Actineo GmbH', 'Anforderung medizinische Auskünfte', 'ja (1)'],
  ['', 'Inter Partner Assistance S.A.', 'Schutzbriefleistungen', 'nein'],
  ['', 'Öconsult Assekuranzberatung OHG', 'Regressprüfung', 'ja'],
];
const KATEGORIEN: Zeile[] = [
  ['Alle Konzerngesellschaften', 'Adressermittler', 'Adressprüfung', 'nein'],
  ['', 'Gutachter/med. Experten/Berater', 'Antrags-/Leistungs-/Regressprüfung/Beratung', 'zum Teil (1)'],
  ['', 'Assisteure', 'Assistanceleistungen', 'zum Teil (1)'],
  ['', 'Marktforschungsunternehmen', 'Marktforschung, Kundenzufriedenheitsanalyse', 'nein'],
  ['', 'Marketingagenturen/-provider', 'Marketingaktionen', 'nein'],
  ['', 'Lettershops/Druckereien', 'Postsendungen/Newsletter (E-Mail)', 'ja'],
  ['', 'Aktenlager', 'Lagerung von Akten', 'ja'],
  ['', 'IT-Dienstleister', 'Wartung/Betrieb/Entwicklung Systeme/Anwendungen/ Onlineservices', 'ja'],
  ['', 'Rechtsanwaltskanzleien', 'Forderungseinzug', 'ja'],
  ['', 'Inkassounternehmen/Auskunfteien', 'Forderungsbearbeitung, Existenznachweis', 'nein'],
  ['', 'Rückversicherer', 'Monitoring', 'ja'],
  ['', 'Entsorgungsunternehmen', 'Abfallbeseitigung', 'ja'],
  ['', 'Routenplaner', 'Schadenbearbeitung/Terminplanung', 'nein'],
  ['', 'Rehabilitationsdienst', 'Rehabilitationsmanagement', 'ja'],
  ['', 'Service-Gesellschaften', 'Leistungs- und Bestandsbearbeitung im Massengeschäft (techn. Versicherungen)', 'nein'],
  ['', 'Vermittler', 'Antrags-, Leistungs- und Schadenbearbeitung Beratung', 'zum Teil (1)'],
  ['', 'Telefonischer Kundendienst', 'Temporärer Kundendienst in bes. Geschäftsprozessen Kundenbetreuung', 'ja'],
  ['AXA Krankenversicherung AG', 'Heil-/Hilfsmittellieferant', 'Lieferung von Heil- und Hilfsmitteln', 'ja'],
];

function Tabelle({ zweite, zeilen }: { zweite: string; zeilen: Zeile[] }) {
  return (
    <table className="mt-1 w-full border-collapse text-left align-top text-[6.5pt] leading-tight">
      <thead>
        <tr className="font-semibold">
          <th className="w-[27%] pr-2 font-semibold">Auftraggebende Gesellschaft</th>
          <th className="w-[27%] pr-2 font-semibold">{zweite}</th>
          <th className="pr-2 font-semibold">Gegenstand/Zweck der Beauftragung</th>
          <th className="w-[12%] font-semibold">Gesundheitsdaten</th>
        </tr>
      </thead>
      <tbody>
        {zeilen.map(([wer, dienst, zweck, gesundheit], i) => {
          // Jede auftraggebende Gesellschaft beginnt mit etwas Abstand, wie im Original
          const abstand = wer && i > 0 ? 'pt-1.5' : '';
          return (
            <tr key={i} className="align-top">
              <td className={`pr-2 ${abstand}`}>{wer}</td>
              <td className={`pr-2 ${abstand}`}>{dienst}</td>
              <td className={`pr-2 ${abstand}`}>{zweck}</td>
              <td className={abstand}>{gesundheit}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Datenschutz() {
  return (
    <div className="space-y-1">
      <p>
        Mit diesen Hinweisen informieren wir Sie über die Verarbeitung Ihrer personenbezogenen Daten durch AXA und die Ihnen
        nach dem Datenschutzrecht zustehenden Rechte. Diese Informationen gelten auch für die versicherte Person. Wenn die
        versicherte Person nicht zugleich Versicherungsnehmer ist, wird der Versicherungsnehmer diese Informationen an die
        versicherte Person weitergeben.
      </p>
      <p className="pt-1">Verantwortlicher für die Datenverarbeitung</p>
      <p>
        {AXA}<br />Kunden-, Partner- und Prozess-Service<br />Colonia-Allee 10-20, 51067 Köln<br />Tel: 0221/148 41003<br />E-Mail: service@axa.de
      </p>
      <p>
        Unseren Datenschutzbeauftragten erreichen Sie per Post unter den oben angegebenen Daten mit dem Zusatz –
        Datenschutzbeauftragter – oder per E-Mail unter: Datenschutz@axa.de
      </p>
      <p className="pt-1 font-semibold">Zwecke und Rechtsgrundlagen der Datenverarbeitung</p>
      <p>
        Wir verarbeiten Ihre personenbezogenen Daten unter Beachtung der EU-Datenschutz-Grundverordnung (DSGVO), des
        Bundesdatenschutzgesetzes (BDSG), der datenschutzrechtlich relevanten Bestimmungen des Versicherungsvertragsgesetzes
        (VVG), sowie aller weiteren maßgeblichen Gesetze. Darüber hinaus hat sich unser Unternehmen auf die
        „Verhaltensregeln für den Umgang mit personenbezogenen Daten durch die deutsche Versicherungswirtschaft“
        verpflichtet, die die oben genannten Gesetze für die Versicherungswirtschaft präzisieren. Diese können Sie im
        Internet unter www.axa.de/Datenschutz abrufen.
      </p>
      <p>
        Stellen Sie einen Antrag auf Versicherungsschutz, benötigen wir die von Ihnen hierbei gemachten Angaben für den
        Abschluss des Vertrages und zur Einschätzung des von uns zu übernehmenden Risikos. Kommt der Versicherungsvertrag
        zustande, verarbeiten wir diese Daten zur Durchführung des Vertragsverhältnisses, z. B. zur Policierung oder
        Rechnungsstellung. Angaben zum Schaden benötigen wir etwa, um prüfen zu können, ob ein
        Leistungs-/Versicherungsfall eingetreten und wie hoch der Schaden ist.
      </p>
      <p className="font-semibold">
        Der Abschluss bzw. die Durchführung des Versicherungsvertrages ist ohne die Verarbeitung Ihrer personenbezogenen
        Daten nicht möglich.
      </p>
      <p>
        Darüber hinaus benötigen wir Ihre personenbezogenen Daten zur Erstellung von versicherungsspezifischen Statistiken,
        z. B. für die Entwicklung neuer Tarife oder zur Erfüllung aufsichtsrechtlicher Vorgaben. Die Daten aller mit einer
        AXA-Gesellschaft bestehenden Verträge nutzen wir für eine Betrachtung der gesamten Kundenbeziehung, beispielsweise
        zur Beratung hinsichtlich einer Vertragsanpassung, -ergänzung, für Kulanzentscheidungen oder für umfassende
        Auskunftserteilungen.
      </p>
      <p>
        Rechtsgrundlage für diese Verarbeitungen personenbezogener Daten für vorvertragliche und vertragliche Zwecke ist Art.
        6 Abs. 1 b) DSGVO. Soweit dafür besondere Kategorien personenbezogener Daten (z. B. Ihre Gesundheitsdaten bei
        Abschluss eines Lebensversicherungsvertrages) erforderlich sind, holen wir Ihre Einwilligung nach Art. 9 Abs. 2 a)
        i. V. m. Art. 7 DSGVO ein. Erstellen wir Statistiken mit diesen Datenkategorien, erfolgt dies auf Grundlage von Art.
        9 Abs. 2 j) DSGVO i. V. m. § 27 BDSG.
      </p>
      <p>
        Ihre Daten verarbeiten wir auch, um berechtigte Interessen von uns oder von Dritten zu wahren (Art. 6 Abs. 1 f)
        DSGVO). Dies kann insbesondere erforderlich sein:
      </p>
      <p>– zur Gewährleistung der IT-Sicherheit und des IT-Betriebs einschließlich Tests (sofern nicht bereits für die Vertragsdurchführung erforderlich),</p>
      <p>– zur Werbung für unsere eigenen Versicherungsprodukte und für andere Produkte der Unternehmen der AXA-Gruppe und deren Kooperationspartner sowie für Markt- und Meinungsumfragen,</p>
      <p>– zur Verhinderung und Aufklärung von Straftaten, insbesondere nutzen wir Datenanalysen zur Erkennung von Hinweisen, die auf Versicherungsmissbrauch hindeuten können,</p>
      <p>– zur Risikosteuerung innerhalb des Unternehmens sowie des AXA Konzerns insgesamt,</p>
      <p>– zur Geschäftssteuerung und Weiterentwicklung von Prozessen, Dienstleistungen und Produkten.</p>
      <p>
        Darüber hinaus verarbeiten wir Ihre personenbezogenen Daten zur Erfüllung gesetzlicher Verpflichtungen wie z. B.
        aufsichtsrechtlicher Vorgaben, handels- und steuerrechtlicher Aufbewahrungspflichten oder unserer Beratungspflicht.
        Als Rechtsgrundlage für die Verarbeitung dienen in diesem Fall die jeweiligen gesetzlichen Regelungen i. V. m. Art. 6
        Abs. 1 c) DSGVO.
      </p>
      <p>
        Sollten wir Ihre personenbezogenen Daten für einen oben nicht genannten Zweck verarbeiten wollen, werden wir Sie im
        Rahmen der gesetzlichen Bestimmungen darüber u. a. auf unserer Webseite (www.axa.de/Datenschutz) zuvor informieren.
      </p>

      <p className="pt-1 font-semibold">Kategorien von Empfängern der personenbezogenen Daten</p>
      <p className="underline">Rückversicherer:</p>
      <p>
        Von uns übernommene Risiken versichern wir bei speziellen Versicherungsunternehmen (Rückversicherer). Dafür kann es
        erforderlich sein, Ihre Vertrags- und ggf. Leistungs-/Schadendaten an einen Rückversicherer zu übermitteln, damit
        dieser sich ein eigenes Bild über das Risiko oder den Versicherungsfall machen kann. Darüber hinaus ist es möglich,
        dass der Rückversicherer unser Unternehmen aufgrund seiner besonderen Sachkunde bei der Risiko- oder
        Leistungsprüfung sowie bei der Bewertung von Verfahrensabläufen unterstützt. Wir übermitteln Ihre Daten an den
        Rückversicherer nur soweit dies für die Erfüllung unseres Versicherungsvertrages mit Ihnen erforderlich ist bzw. im
        zur Wahrung unserer berechtigten Interessen erforderlichen Umfang.
      </p>
      <p className="underline">Vermittler:</p>
      <p>
        Soweit Sie hinsichtlich Ihrer Versicherungsverträge von einem Vermittler betreut werden, verarbeitet Ihr Vermittler
        die zum Abschluss und zur Durchführung des Vertrages benötigten Antrags-, Vertrags- und Schadendaten. Auch
        übermittelt unser Unternehmen diese Daten an die Sie betreuenden Vermittler, soweit diese die Informationen zu Ihrer
        Betreuung und Beratung in ihren Versicherungs- und Finanzdienstleistungsangelegenheiten benötigen.
      </p>
      <p className="underline">Datenverarbeitung in der Unternehmensgruppe:</p>
      <p>
        Spezialisierte Unternehmen bzw. Bereiche unserer Unternehmensgruppe nehmen bestimmte Datenverarbeitungsaufgaben für
        die in der Gruppe verbundenen Unternehmen zentral wahr. Soweit ein Versicherungsvertrag zwischen Ihnen und einem oder
        mehreren Unternehmen unserer Gruppe besteht, können Ihre Daten etwa zur zentralen Verwaltung von Anschriftendaten,
        für den telefonischen Kundenservice, zur Vertrags- und Leistungs-/Schadenbearbeitung, für In- und Exkasso oder zur
        gemeinsamen Postbearbeitung zentral durch ein Unternehmen der Gruppe verarbeitet werden. In unserer
        Dienstleisterliste finden Sie die Unternehmen, die an einer zentralisierten Datenverarbeitung teilnehmen.
      </p>
      <p className="underline">Externe Auftragnehmer und Dienstleister:</p>
      <p>Wir bedienen uns zur Erfüllung unserer vertraglichen und gesetzlichen Pflichten zum Teil externer Auftragnehmer und Dienstleister.</p>
      <p>
        Eine Auflistung der von uns eingesetzten Auftragnehmer und Dienstleister, zu denen nicht nur vorübergehende
        Geschäftsbeziehungen bestehen, können Sie der Übersicht im Anhang sowie in der jeweils aktuellen Version auf unserer
        Internetseite unter www.axa.de/datenschutz entnehmen.
      </p>
      <p className="underline">Weitere Empfänger:</p>
      <p>
        Darüber hinaus können wir Ihre personenbezogenen Daten an weitere Empfänger übermitteln, wie etwa an Behörden zur
        Erfüllung gesetzlicher Mitteilungspflichten (z. B. Sozialversicherungsträger, Finanzbehörden oder
        Strafverfolgungsbehörden).
      </p>

      <p className="pt-1 font-semibold">Dauer der Datenspeicherung</p>
      <p>
        Wir löschen Ihre personenbezogenen Daten, sobald sie für die oben genannten Zwecke nicht mehr erforderlich sind.
        Dabei kann es vorkommen, dass personenbezogene Daten für die Zeit aufbewahrt werden, in der Ansprüche gegen unser
        Unternehmen geltend gemacht werden können (gesetzliche Verjährungsfrist von drei oder bis zu dreißig Jahren). Zudem
        speichern wir Ihre personenbezogenen Daten, soweit wir dazu gesetzlich verpflichtet sind. Entsprechende Nachweis- und
        Aufbewahrungspflichten ergeben sich unter anderem aus dem Handelsgesetzbuch, der Abgabenordnung und dem
        Geldwäschegesetz. Die Speicherfristen betragen danach bis zu zehn Jahre.
      </p>
      <p className="pt-1 font-semibold">Betroffenenrechte</p>
      <p>
        Sie können unter den oben genannten Daten Auskunft über die zu Ihrer Person gespeicherten Daten verlangen. Darüber
        hinaus können Sie unter bestimmten Voraussetzungen die Berichtigung oder die Löschung Ihrer Daten verlangen. Ihnen
        kann weiterhin ein Recht auf Einschränkung der Verarbeitung Ihrer Daten sowie ein Recht auf Herausgabe der von Ihnen
        bereitgestellten Daten in einem strukturierten, gängigen und maschinenlesbaren Format zustehen.
      </p>
      <Rahmen>
        <p className="font-semibold">Widerspruchsrecht</p>
        <p className="font-semibold">Sie haben das Recht, einer Verarbeitung Ihrer personenbezogenen Daten zu Zwecken der Direktwerbung zu widersprechen.</p>
        <p className="font-semibold">
          Verarbeiten wir Ihre Daten zur Wahrung berechtigter Interessen, können Sie dieser Verarbeitung widersprechen, wenn
          sich aus Ihrer besonderen Situation Gründe ergeben, die gegen die Datenverarbeitung sprechen.
        </p>
      </Rahmen>
      <p className="pt-1 font-semibold">Beschwerderecht</p>
      <p>
        Sie haben die Möglichkeit, sich mit einer Beschwerde an den oben genannten Datenschutzbeauftragten oder an eine
        Datenschutzaufsichtsbehörde zu wenden. Die für uns zuständige Datenschutzaufsichtsbehörde ist:
      </p>
      <p>
        Landesbeauftragte für Datenschutz und Informationsfreiheit<br />Nordrhein-Westfalen<br />Kavalleriestraße 2 – 4<br />40213 Düsseldorf
      </p>
      <p className="pt-1 font-semibold">Datenübermittlung in ein Drittland</p>
      <p>
        Sollten wir personenbezogene Daten an Dienstleister außerhalb des Europäischen Wirtschaftsraums (EWR) übermitteln,
        erfolgt die Übermittlung nur, soweit dem Drittland durch die EU-Kommission ein angemessenes Datenschutzniveau
        bestätigt wurde oder andere angemessene Datenschutzgarantien (z. B. verbindliche unternehmensinterne
        Datenschutzvorschriften, EU-Standardvertragsklauseln oder EU-US Privacy Shield) vorhanden sind. Detaillierte
        Information dazu sowie über das Datenschutzniveau bei unseren Dienstleistern können Sie unter den oben genannten
        Kontaktinformationen anfordern.
      </p>
      <p className="pt-1 font-semibold">Automatisierte Einzelfallentscheidungen</p>
      <p>
        Auf Basis Ihrer Angaben zum Risiko, zu denen wir Sie bei Antragstellung befragen, entscheiden wir vollautomatisiert
        etwa über das Zustandekommen oder die Kündigung des Vertrages, mögliche Risikoausschlüsse oder über die Höhe der von
        Ihnen zu zahlenden Versicherungsprämie.
      </p>
      <p>
        Aufgrund Ihrer Angaben zum Versicherungsfall, der zu Ihrem Vertrag gespeicherten Daten (sowie ggf. von Dritten hierzu
        erhaltenen Informationen) entscheiden wir vollautomatisiert über unsere Leistungspflicht, Bonifikationen und
        Zusatzdienstleistungen.
      </p>
      <p>
        Die vollautomatisierten Entscheidungen beruhen auf vom Unternehmen vorher festgelegten Regeln zur Gewichtung der
        Informationen. So erfolgt bei der Antragstellung die Berechnung und Bewertung auf Basis versicherungsmathematischer
        Kriterien und Kalkulationen.
      </p>
      <p>
        Soweit wir automatisierte Einzelfallentscheidungen in den vorherig beschriebenen Fällen durchführen, haben Sie das
        Recht auf Erwirkung des Eingreifens einer Person seitens des Verantwortlichen, auf Darlegung des eigenen Standpunkts
        und Anfechtung der Entscheidung.
      </p>
      <p>Dieses Recht besteht nicht, wenn Ihrem Begehren vollumfänglich stattgegeben wurde.</p>

      <div className="pt-2">
        <p className="font-semibold">Übersicht der Dienstleister des AXA Konzerns</p>
        <p className="border-b border-ui-tinte pb-0.5 font-semibold underline">gemäß der Einwilligungs- und Schweigepflichtentbindungserklärung</p>
        <p className="mt-1 font-semibold">Konzerngesellschaften, die an einer gemeinsamen Verarbeitung von Daten innerhalb der Unternehmensgruppe teilnehmen:</p>
        <ul className="mt-1 grid grid-cols-2 gap-x-6 text-[6.5pt] leading-tight">
          {KONZERN.map((k) => <li key={k}>• {k}</li>)}
        </ul>
        <p className="mt-2 font-semibold">Dienstleister mit Datenverarbeitung als Hauptgegenstand des Auftrags (Einzelbenennung):</p>
        <Tabelle zweite="Dienstleister" zeilen={EINZELN} />
        <p className="mt-2 font-semibold">
          Dienstleisterkategorien, bei denen Datenverarbeitung kein Hauptgegenstand des Auftrages ist und/oder
          Dienstleistungserbringung erfolgt durch viele verschiedene Dienstleister
        </p>
        <Tabelle zweite="Dienstleisterkategorie" zeilen={KATEGORIEN} />
        <p className="mt-2">(1) ggf. mit separater Einwilligung</p>
        <p className="mt-2">Eine aktuelle Version dieser Dienstleisterübersicht ist im Internet unter www.AXA.de/Datenschutz einsehbar.</p>
        <p>
          Hinweis: Steht Ihre besondere persönliche Situation den berechtigten Interessen des Unternehmens an einer
          Beauftragung entgegen, können Sie dieser Beauftragung ggf. widersprechen.
        </p>
      </div>
    </div>
  );
}

/* --- AXA-Gespraechsprotokoll (Formular 21012882, 11.20) ------------------------------ */

const BLAU = 'text-[#00008f]';

function ProtokollZeile({ titel, feld, wert }: { titel: string; feld: string; wert: string }) {
  return (
    <div className="mt-1 grid grid-cols-[23mm_1fr] gap-3">
      <p className={`text-right font-semibold ${BLAU}`}>{titel}</p>
      <div>
        <p className="text-[6.5pt] text-ui-schiefer">{feld}</p>
        <p className="min-h-[4mm] border-b border-l border-ui-tinte px-1 text-[8pt]">{wert || leer}</p>
      </div>
    </div>
  );
}

/** Ein Punkt der Aufzaehlung: das blaue Quadrat des Formulars. */
function Punkt({ children }: { children: ReactNode }) {
  return <li className="flex gap-2"><span className="mt-[1.2mm] h-[1.6mm] w-[1.6mm] shrink-0 bg-[#00008f]" /><span className="min-w-0 flex-1">{children}</span></li>;
}

function Wahl({ an, text }: { an: boolean; text: ReactNode }) {
  return <span className="inline-flex items-center gap-1"><Kaestchen an={an} /> {text}</span>;
}

/** Datum und die Unterschriften von Vermittler/in und versicherter Person — zweimal im Protokoll. */
function ProtokollUnterschriften({ titel, datum }: { titel: ReactNode; datum: string }) {
  return (
    <div className="mt-1.5 grid grid-cols-[23mm_1fr] gap-3 border-t border-ui-tinte pt-1.5 break-inside-avoid">
      <p className={`text-right font-semibold ${BLAU}`}>{titel}</p>
      <div className="grid grid-cols-[30mm_1fr_1fr] gap-4">
        <div>
          <p className="text-[6.5pt] text-ui-schiefer">Datum</p>
          <p className="mt-[5mm] border-b border-l border-ui-tinte px-1 text-[8pt]">{datum || leer}</p>
        </div>
        <div>
          <p className="text-[6.5pt] text-ui-schiefer">Vermittler/in</p>
          <Unterschrift feld="berater" hoehe="h-[9mm]" />
        </div>
        <div>
          <p className="text-[6.5pt] text-ui-schiefer">Versicherte Person</p>
          <Unterschrift feld="mitarbeiter" hoehe="h-[9mm]" />
        </div>
      </div>
    </div>
  );
}

/**
 * Das AXA-Gespraechsprotokoll, ausgefuellt aus der Beratung: beim AXA-Antrag
 * mit „Ja“ und den gewaehlten Bausteinen, bei Verzicht mit „Nein“ und dem
 * Zuschuss, auf den der Mitarbeiter verzichtet. Eine eigene Druckseite mit
 * schmalem Rand (`@page axa-formular`, index.css), wie das Formular.
 */
function AxaProtokoll({ firma, daten, r, auftritt }: DokumentProps) {
  const a = daten.angaben;
  const e = daten.entscheidung;
  const x = e.axa;
  const f = firma.angebot;
  const ja = e.status === 'teilnahme';
  const mitarbeiter = namensTeile(a.name, a.vorname, a.nachname);
  const berater = axaBerater(x, auftritt);
  const zuschuss = ja ? { prozent: null, euro: null } : axaVerzichtZuschuss(f, r);

  return (
    <section className="break-before-page text-[6.4pt] leading-[1.18] text-ui-tinte [page:axa-formular]">
      <div className="flex items-start justify-between gap-6">
        <img src={axaLogoProtokoll} alt="AXA" className="h-[14mm] w-[14mm]" />
        <p className={`mt-[6mm] w-[124mm] text-[10pt] font-semibold leading-tight ${BLAU}`}>
          Gesprächsprotokoll betriebliche Altersversorgung (bAV)<br />im Wege einer Entgeltumwandlung (Direktversicherung)
        </p>
      </div>
      <p className="mt-1 border-b border-ui-tinte pb-0.5 font-semibold">Bitte in Druckbuchstaben ausfüllen</p>

      <ProtokollZeile titel="Unternehmen" feld="Firma (mit Rechtsform), Ort"
        wert={[firma.name, ortDerFirma(f.anschrift) || e.ort.trim()].filter(Boolean).join(', ')} />
      <ProtokollZeile titel="Mitarbeiter/in" feld="Name, Vorname, Geburtsdatum"
        wert={[mitarbeiter.nachname, mitarbeiter.vorname, a.geburtsdatum].filter(Boolean).join(', ')} />
      <ProtokollZeile titel="Berater/in" feld="Name, Vorname" wert={[berater.nachname, berater.vorname].filter(Boolean).join(', ')} />
      <ProtokollZeile titel="Weitere Teilnehmer/in" feld="Name, Vorname" wert="" />
      <div className="mt-1 grid grid-cols-[23mm_1fr] gap-3">
        <p className={`text-right font-semibold ${BLAU}`}>Tag der Beratung</p>
        <div className="flex items-start justify-between gap-6">
          <div className="w-[45mm]">
            <p className="text-[6.5pt] text-ui-schiefer">Datum</p>
            <p className="min-h-[4mm] border-b border-l border-ui-tinte px-1 text-[8pt]">{e.datum || leer}</p>
          </div>
          <div className="flex gap-6">
            <p>Die Beratung erfolgte</p>
            <div className="space-y-0.5">
              <p><Wahl an={x.kanal === 'persoenlich'} text="persönlich" /></p>
              <p><Wahl an={x.kanal === 'telefonisch'} text="telefonisch" /></p>
              <p><Wahl an={x.kanal === 'online'} text="Onlineberatung z. B. Videotelofonie/Skype" /></p>
            </div>
          </div>
        </div>
      </div>

      <p className="mt-2 border-t border-ui-tinte pt-1 font-semibold">
        Vielen Dank für das Vertrauen, das Sie uns in unserem heutigen Gespräch entgegengebracht haben. Sie wünschten{' '}
        <span className="underline">ausschließlich eine Beratung</span> über die betriebliche Altersversorgung.
      </p>

      <div className="mt-1.5 grid grid-cols-[23mm_1fr] gap-3 border-t border-ui-tinte pt-1.5">
        <p className={`text-right font-semibold ${BLAU}`}>Kundenwünsche</p>
        <div>
          <p>Der Arbeitgeber wählt sowohl den Durchführungsweg als auch den Anbieter der betrieblichen Altersversorgung.</p>
          <p>Im Folgenden werden die Eigenschaften des Durchführungswegs in der betrieblichen Altersversorgung erläutert:</p>
          <p className="mt-1 font-semibold">Direktversicherung mit Arbeitgeberzuschuss zur Entgeltumwandlung</p>
          <p className="mt-1">Eigenschaften des Durchführungswegs Direktversicherung:</p>
          <ul className="mt-0.5">
            <Punkt>Die Direktversicherung ermöglicht Ihnen die Umsetzung Ihres Anspruchs auf Entgeltumwandlung.</Punkt>
            <Punkt>Bei der Direktversicherung ist ein Arbeitgeberzuschusses nach § 1a Abs. 1a Betriebsrentengesetz (BetrAVG) zu gewähren.</Punkt>
            <Punkt>Die Direktversicherung lässt eine chancen-/aktienorientierte Kapitalanlage (insbesondere für jüngere Mitarbeiter) zu.</Punkt>
            <Punkt>Die Direktversicherung ermöglicht bei Ausscheiden aus dem Unternehmen eine Übertragung Sie (privat) oder auf Ihren neuen Arbeitgeber.</Punkt>
            <Punkt>
              Bei der Direktversicherung gibt es zwei Alternativen, wie Versicherungsbeiträge und -leistungen bei Ihnen
              steuer- und sozialversicherungsrechtlich behandelt werden:
              <span className="mt-0.5 block">a) Behandlung der Versicherungsbeiträge nach § 3 Nr. 63 EStG:</span>
              <span className="block pl-3">
                Steuerfreiheit der Versicherungsbeiträge in Höhe von max. 8 % der jeweiligen Beitragsbemessungsgrenze in der
                gRV und Sozialversicherungsfreiheit in Höhe von max. 4 % der jeweiligen Beitragsbemessungsgrenze in der gRV.
              </span>
              <span className="block">b) Zulagen-/Riester-Förderung:</span>
              <span className="block pl-3">
                Steuer- und Sozialversicherungspflicht der Versicherungsbeiträge, aber steuerliche Förderung über
                Zulagen/Sonderausgabenabzug.
              </span>
            </Punkt>
          </ul>
          <p className="mt-1 flex justify-between gap-4 font-semibold">
            <span>Wünschen Sie eine Versorgung über den Durchführungsweg Direktversicherung?</span>
            <span className="flex gap-3"><Wahl an={ja} text="ja" /><Wahl an={!ja} text="nein" /></span>
          </p>
          <p className="mt-1">
            Sofern die Versorgungsordnung eine Wahlmöglichkeit des Arbeitnehmers zwischen verschiedenen
            Bausteinen/Leistungsarten vorsieht, entscheiden Sie sich für den/die folgenden Baustein(e)/Leistungsart (en):
          </p>
          <p className="min-h-[4mm] border-b border-l border-ui-tinte px-1 text-[8pt]">{(ja && axaBausteine(f, x)) || leer}</p>

          <p className="mt-2 border-t border-ui-linie pt-1 font-semibold">Folgende Besonderheiten in der betrieblichen Altersversorgung wurden erläutert:</p>
          <ul className="mt-0.5">
            {AXA_ERLAEUTERT.map(({ feld, text }) => (
              <Punkt key={feld}>
                <span className="flex justify-between gap-4">
                  <span>{text}</span>
                  <span className="flex shrink-0 gap-3"><Wahl an={x.erlaeutert[feld] === 'ja'} text="ja" /><Wahl an={x.erlaeutert[feld] === 'nein'} text="nein" /></span>
                </span>
                {feld === 'versteuerung' && (
                  <span className="block">
                    Derzeit unterliegen die Leistungen aus einer betrieblichen Altersversorgung der Einkommensteuer und sind
                    beitragspflichtig in der gesetzlichen Kranken- und Pflegeversicherung, sofern dort eine
                    Versicherung/Mitgliedschaft besteht (Ausnahme: Die Direktversicherung mit Zulagen/Riesterförderung
                    unterliegt zwar der Besteuerung, ist aber nicht beitragspflichtig in der gesetzlichen Kranken- und
                    Pflegeversicherung.).
                  </span>
                )}
              </Punkt>
            ))}
          </ul>
        </div>
      </div>

      <ProtokollUnterschriften titel={<>Unterschriften zum Gesprächsinhalt</>} datum={e.datum} />

      <div className="mt-1.5 grid grid-cols-[23mm_1fr] gap-3 border-t border-ui-tinte pt-1.5 break-inside-avoid">
        <p className={`text-right font-semibold ${BLAU}`}>Entscheidung</p>
        <div>
          <p className="font-semibold">Entscheidung des Mitarbeiters/der Mitarbeiterin zur Entgeltumwandlung:</p>
          <div className="mt-1 flex gap-1.5">
            <Kaestchen an={ja} />
            <p>
              Ja, ich möchte Entgeltumwandlung zugunsten einer betrieblichen Altersversorgung betreiben.<br />
              Das Weitere wird gesondert vereinbart (vgl. Versorgungszusage des Arbeitgebers und Entgeltumwandlungsvereinbarung).
            </p>
          </div>
          <div className="mt-1 flex gap-1.5">
            <Kaestchen an={!ja} />
            <div className="min-w-0 flex-1">
              <p>Nein, eine betriebliche Altersversorgung interessiert mich momentan nicht. Das bedeutet:</p>
              <ul className="mt-0.5 pl-2">
                <Punkt>Ich habe jederzeit die Möglichkeit, dieses Angebot auch zu einem späteren Zeitpunkt in Anspruch zu nehmen.</Punkt>
                <Punkt>Ich bin mir bewusst, dass ich auf mögliche staatliche und betriebliche Förderungen verzichte.</Punkt>
                <Punkt>
                  {/* Feld und Einheit bleiben beisammen, wenn die Zeile umbricht. */}
                  Ich bin mir bewusst, dass ich auf den Arbeitgeberzuschuss in Höhe von{' '}
                  <span className="whitespace-nowrap">
                    <Linie wert={zuschuss.prozent === null ? '' : zuschuss.prozent.toLocaleString('de-DE')} klasse="min-w-[12mm]" />% des
                  </span>{' '}
                  Entgeltumwandlungsbetrages bzw.{' '}
                  <span className="whitespace-nowrap">
                    <Linie wert={zuschuss.euro === null ? '' : zahl2(zuschuss.euro)} klasse="min-w-[14mm]" />EUR verzichte.
                  </span>
                </Punkt>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-1.5 grid grid-cols-[23mm_1fr] gap-3 border-t border-ui-tinte pt-1.5">
        <p className={`text-right font-semibold ${BLAU}`}>Anmerkungen</p>
        <p className="min-h-[6mm] border-b border-l border-ui-tinte" />
      </div>
      <p className="mt-2 border-t border-ui-tinte pt-1 font-semibold">
        Dieses Gesprächsprotokoll wird zusammen mit dem Versicherungsantrag/der Anmeldung zur Versicherung zum Zweck der
        Archivierung und Bearbeitung von Beanstandungen übermittelt.
      </p>
      <ProtokollUnterschriften titel={<>Unterschriften zu Entscheidung</>} datum={e.datum} />
      <div className="mt-1 flex items-end justify-between">
        <svg viewBox={`0 0 ${FORMULARCODE.module} ${FORMULARCODE.module}`} className="h-[10mm] w-[10mm]" role="img" aria-label="Formularcode">
          <path d={FORMULARCODE.pfad} fill="#000" />
        </svg>
        <p className="text-[6.5pt]">21012882 (11.20)</p>
      </div>
    </section>
  );
}
