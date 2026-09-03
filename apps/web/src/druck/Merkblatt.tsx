import { Seite, Untertitel, Text } from './Bausteine';

/**
 * Das Merkblatt zum Mitnehmen.
 *
 * Reiner Text und bewusst ohne eine einzige Zahl aus dem Szenario: Diese
 * Seite ueberlebt jede Aenderung an den Eingaben und ist genau deshalb die,
 * die am Kuehlschrank landet.
 */

const CHECKLISTE: { was: string; warum: string }[] = [
  {
    was: 'Renteninformation der Deutschen Rentenversicherung prüfen',
    warum: 'Sie kommt jährlich ab 27 und nach 5 Beitragsjahren. Der Betrag darin ist der '
      + 'wichtigste Baustein dieser Rechnung — steht dort etwas anderes als hier, rechnen wir neu.',
  },
  {
    was: 'Kontenklärung beantragen, falls noch nie geschehen',
    warum: 'Ausbildungs-, Studien- und Kindererziehungszeiten fehlen häufig im Versicherungskonto. '
      + 'Sie nachzutragen kostet nichts und erhöht die spätere Rente dauerhaft.',
  },
  {
    was: 'Alle Vorsorgeverträge an einem Ort sammeln',
    warum: 'Police, letzte Standmitteilung und die Kostenübersicht. Ohne diese Unterlagen lässt '
      + 'sich nicht beurteilen, ob ein Vertrag noch trägt.',
  },
  {
    was: 'Beim Arbeitgeber nach der betrieblichen Altersvorsorge fragen',
    warum: 'Seit 2022 muss der Arbeitgeber bei Entgeltumwandlung 15 % zuschießen, viele geben '
      + 'freiwillig mehr. Geschenktes Geld liegen zu lassen ist der teuerste Fehler.',
  },
  {
    was: 'Freistellungsauftrag auf die Sparerpauschbeträge verteilen',
    warum: '1.000 € je Person im Jahr bleiben steuerfrei (2.000 € bei Ehepaaren). Ohne Auftrag '
      + 'behält die Bank Abgeltungsteuer ein, die Sie sich erst über die Steuererklärung zurückholen.',
  },
  {
    was: 'Diese Rechnung einmal im Jahr wiederholen',
    warum: 'Und immer dann sofort, wenn sich etwas Grundlegendes ändert: Heirat, Geburt, '
      + 'Jobwechsel, Selbständigkeit, Erbschaft, Scheidung.',
  },
];

const GLOSSAR: { begriff: string; erklaerung: string }[] = [
  {
    begriff: 'Schicht 1, 2 und 3',
    erklaerung: 'Die drei Ebenen der Altersvorsorge. Schicht 1 ist die Basis — gesetzliche Rente, '
      + 'Beamtenpension, Rürup; sie wird in der Auszahlung wie Einkommen versteuert. Schicht 2 ist '
      + 'das, was über den Arbeitgeber läuft, plus die geförderten Verträge. Schicht 3 ist alles '
      + 'Private: Depot, private Rente, vermietete Immobilie.',
  },
  {
    begriff: 'Brutto und Netto',
    erklaerung: 'Brutto ist, was überwiesen wird. Netto ist, was übrig bleibt, nachdem Steuer und '
      + 'die Beiträge zur Kranken- und Pflegeversicherung abgegangen sind. Nur das Netto können '
      + 'Sie ausgeben — deshalb rechnet dieses Gutachten durchgehend damit.',
  },
  {
    begriff: 'KVdR',
    erklaerung: 'Die Krankenversicherung der Rentner. Wer hineinkommt, zahlt auf die gesetzliche '
      + 'Rente nur den halben Krankenkassenbeitrag — die andere Hälfte trägt die '
      + 'Rentenversicherung. Die Pflegeversicherung zahlen Rentner dagegen allein.',
  },
  {
    begriff: 'Versorgungsbezug',
    erklaerung: 'Eine Rente, die aus einem Arbeitsverhältnis stammt — Betriebsrente, '
      + 'Direktversicherung, Pensionskasse. Auf sie fällt der volle Krankenkassenbeitrag an, '
      + 'nicht der halbe. Ein Freibetrag mildert das bei kleineren Beträgen.',
  },
  {
    begriff: 'Ertragsanteil',
    erklaerung: 'Bei einer privaten Rente wird nicht die ganze Zahlung versteuert, sondern nur '
      + 'der Teil, der als Zinsertrag gilt. Wie hoch er ist, hängt allein vom Alter bei '
      + 'Rentenbeginn ab: mit 67 sind es 17 %.',
  },
  {
    begriff: 'Beitragsbemessungsgrenze',
    erklaerung: 'Bis zu diesem Einkommen werden Sozialbeiträge erhoben, darüber nicht mehr. '
      + 'Sie ist auch der Maßstab für die geförderten Höchstbeträge in der betrieblichen '
      + 'Altersvorsorge.',
  },
  {
    begriff: 'Beitragsdynamik',
    erklaerung: 'Der Beitrag steigt jedes Jahr um einen festen Prozentsatz. Das senkt den '
      + 'Einstieg spürbar und passt sich dem Gehalt an, das über dieselben Jahre meist ebenfalls '
      + 'wächst.',
  },
  {
    begriff: 'Kaufkraft',
    erklaerung: 'Was ein Betrag wirklich wert ist. 3.000 € in dreißig Jahren kaufen bei 2 % '
      + 'Inflation nur noch so viel wie rund 1.650 € heute. Deshalb steht in diesem Gutachten '
      + 'neben jedem künftigen Betrag, was er in heutigem Geld bedeutet.',
  },
];

export function Merkblatt() {
  return (
    <Seite titel="Zum Mitnehmen" nummer="Checkliste und Begriffe">
      <Untertitel>Was Sie in den nächsten Wochen erledigen sollten</Untertitel>
      <ol className="space-y-2">
        {CHECKLISTE.map((x, i) => (
          <li key={x.was} className="flex break-inside-avoid gap-2">
            <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-slate-400 text-[10px] font-bold text-slate-600">
              {i + 1}
            </span>
            <span>
              <span className="block text-[12px] font-semibold text-slate-900">{x.was}</span>
              <span className="block text-[11px] leading-relaxed text-slate-600">{x.warum}</span>
            </span>
          </li>
        ))}
      </ol>

      <Untertitel>Die Begriffe aus diesem Bericht, in Alltagssprache</Untertitel>
      {/*
        Begriff und Erklaerung stehen in EINER Zeile, nicht uebereinander.
        Das ist die uebliche Form eines Glossars und spart acht Zeilen — der
        Platz, den die groessere Schrift auf dieser Seite braucht. Gestrichen
        wird dafuer nichts.
      */}
      <dl className="space-y-1.5">
        {GLOSSAR.map((x) => (
          <div
            key={x.begriff}
            className="break-inside-avoid text-[11px] leading-relaxed text-slate-600"
          >
            <dt className="inline font-bold text-slate-900">{x.begriff}</dt>
            {' — '}
            <dd className="inline">{x.erklaerung}</dd>
          </div>
        ))}
      </dl>

      <Text>
        Diese Seite enthält bewusst keine Zahlen aus Ihrer Berechnung — sie gilt unabhängig davon,
        wie sich Ihre Angaben ändern.
      </Text>
    </Seite>
  );
}
