import type { ProjektionsErgebnis, Vertrag } from '@renten/engine';
import type { SzenarioParsed } from '../store/szenario';
import { euro, prozent } from '../components/Feld';
import { SCHICHT_TITEL, typText, strategieText, istKapital } from '../features/vertragsarten';
import { personNameAus } from '../features/personen';
import { Untertitel, Tabelle, Zeile, Gruppenzeile, Hinweiszeile, Text } from './Bausteine';

/**
 * Was der Vertrag im Monat kostet bzw. einbringt.
 *
 * Die Vertragsarten fuellen unterschiedliche Felder: laufende Renten tragen
 * ihren Wert in `brutto`, Sparvertraege in `monatsbeitrag` oder `sparrate`.
 * Eine Spalte "Beitrag" zu zeigen, die bei der Haelfte der Vertraege leer
 * bleibt, waere schlechter als eine, die sagt, worum es sich handelt.
 */
function betragText(v: Vertrag): string {
  /*
    Wer den Kapitalweg gewaehlt hat, bekommt den EINMALbetrag zu sehen — ihn
    als „Rente" zu beschriften machte aus 300.000 EUR Kapital eine
    300.000-EUR-Rente. Stehen beide Betraege am Vertrag, nennt die Zeile den,
    der in die Gesamtuebersicht eingeht; der andere steht im Vertrags-TUEV.
  */
  if (istKapital(v) && v.kapitalAlternative) return `${euro(v.kapitalAlternative)} Kapital`;
  if (v.brutto) return `${euro(v.brutto)} Rente`;
  if (v.monatsbeitrag) return `${euro(v.monatsbeitrag)} Beitrag`;
  if (v.sparrate) return `${euro(v.sparrate)} Sparrate`;
  if (v.kapitalAlternative) return `${euro(v.kapitalAlternative)} Kapital`;
  return '—';
}

function detailText(v: Vertrag): string {
  const teile: string[] = [];
  if (v.kapitalHeute) teile.push(`${euro(v.kapitalHeute)} vorhanden`);
  if (v.renditeAnsparphase !== undefined) teile.push(`${prozent(v.renditeAnsparphase)} Rendite`);
  if (v.ter !== undefined) teile.push(`${prozent(v.ter)} Kosten`);
  if (v.dynamik) teile.push(`${prozent(v.dynamik)} Dynamik`);
  if (v.altvertrag) teile.push('Altvertrag');
  return teile.join(' · ') || '—';
}

/**
 * "Ihre Vertraege" — alle drei Schichten in EINER Liste.
 *
 * Auf dem Bildschirm liegen sie hinter Reitern, im Dokument steht deshalb
 * immer nur eine Schicht. Fuer das Gutachten wird direkt aus dem Szenario
 * gelesen, nicht aus der Oberflaeche.
 *
 * Gibt nur den INHALT zurueck; die Seite baut `Gutachten.tsx` gemeinsam mit
 * den Angaben.
 */
export function Vertragsliste({
  szenario, hinweise = [],
}: {
  szenario: SzenarioParsed;
  /**
   * Hinweise je Vertrag aus der Projektion. Sie standen frueher in einem
   * Sammelkasten auf dem Deckblatt, wo nicht zu erkennen war, worauf sie sich
   * beziehen.
   */
  hinweise?: ProjektionsErgebnis['vertragsHinweise'];
}) {
  const verheiratet = szenario.haushalt.verheiratet;
  const spaltenzahl = verheiratet ? 5 : 4;

  if (szenario.vertraege.length === 0) {
    return (
      <>
        <Untertitel>Verträge</Untertitel>
        <Text>Es wurden keine Verträge erfasst. Die Berechnung beruht allein auf der
          gesetzlichen Versorgung.</Text>
      </>
    );
  }

  return (
    <>
      <Untertitel>Verträge</Untertitel>
      {/*
        EINE Tabelle mit Zwischenueberschriften statt drei Tabellen: drei
        Tabellen richten ihre Spalten unabhaengig voneinander aus, und das
        Ergebnis steht auf dem Papier sichtbar schief.
      */}
      <Tabelle
        kopf={[
          'Bezeichnung und Art',
          ...(verheiratet ? ['Inhaber'] : []),
          'Monatlich',
          'Eckdaten',
          'Verwendung',
        ]}
        spalten={verheiratet ? [22, 14, 14, 27, 23] : [26, 16, 32, 26]}
        textSpalten={verheiratet ? [1, 2, 3, 4] : [1, 2, 3]}
      >
        {([1, 2, 3] as const).flatMap((schicht) => {
          const dieser = szenario.vertraege.filter((v) => v.schicht === schicht);
          if (dieser.length === 0) return [];
          return [
            <Gruppenzeile key={`s${schicht}`} text={SCHICHT_TITEL[schicht]} spalten={spaltenzahl} />,
            ...dieser.flatMap((v) => [
              <Zeile
                key={v.id}
                zellen={[
                  <>
                    <span className="font-semibold">{v.name || 'ohne Bezeichnung'}</span>
                    <span className="block text-slate-500">{typText(v.typ)}</span>
                  </>,
                  ...(verheiratet ? [personNameAus(szenario.personen, v.inhaber)] : []),
                  betragText(v),
                  detailText(v),
                  strategieText(v),
                ]}
                textSpalten={verheiratet ? [1, 2, 3, 4] : [1, 2, 3]}
              />,
              ...hinweise
                .filter((h) => h.vertragId === v.id)
                .map((h, i) => (
                  <Hinweiszeile key={`${v.id}-h${i}`} text={h.text} spalten={spaltenzahl} />
                )),
            ]),
          ];
        })}
      </Tabelle>

      {szenario.planer.startkapital > 0 && (
        <>
          <Untertitel>Entnahmeplaner</Untertitel>
          <Tabelle kopf={['Angabe', 'Wert']} spalten={[70, 30]}>
            <Zeile zellen={['Startkapital', euro(szenario.planer.startkapital)]} />
            <Zeile zellen={['Entnahmedauer', `${szenario.planer.dauerJahre} Jahre`]} />
            <Zeile zellen={['Rendite in der Entnahme', prozent(szenario.planer.rendite)]} />
            <Zeile zellen={[
              'Im Netto enthalten',
              szenario.planer.insNettoEinrechnen ? 'ja' : 'nein',
            ]} />
          </Tabelle>
        </>
      )}

      <Text>
        Renditen und Kosten sind Annahmen, keine Zusage des Anbieters. Verträge mit der Verwendung
        „Nicht einrechnen“ bleiben im Ergebnis unberücksichtigt.
      </Text>
    </>
  );
}
