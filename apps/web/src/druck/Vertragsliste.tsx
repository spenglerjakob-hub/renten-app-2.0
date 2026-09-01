import type { Vertrag } from '@renten/engine';
import type { SzenarioParsed } from '../store/szenario';
import { euro, prozent } from '../components/Feld';
import { SCHICHT_TITEL, typText, strategieText } from '../features/vertragsarten';
import { Seite, Untertitel, Tabelle, Zeile, Gruppenzeile, Text } from './Bausteine';

/**
 * Was der Vertrag im Monat kostet bzw. einbringt.
 *
 * Die Vertragsarten fuellen unterschiedliche Felder: laufende Renten tragen
 * ihren Wert in `brutto`, Sparvertraege in `monatsbeitrag` oder `sparrate`.
 * Eine Spalte "Beitrag" zu zeigen, die bei der Haelfte der Vertraege leer
 * bleibt, waere schlechter als eine, die sagt, worum es sich handelt.
 */
function betragText(v: Vertrag): string {
  if (v.monatsbeitrag) return `${euro(v.monatsbeitrag)} Beitrag`;
  if (v.sparrate) return `${euro(v.sparrate)} Sparrate`;
  if (v.brutto) return `${euro(v.brutto)} Rente`;
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
 * "Ihre Verträge" — alle drei Schichten in EINER Liste.
 *
 * Auf dem Bildschirm liegen sie hinter Reitern, im Dokument steht deshalb
 * immer nur eine Schicht. Fuer das Gutachten wird direkt aus dem Szenario
 * gelesen, nicht aus der Oberflaeche.
 */
export function Vertragsliste({ szenario }: { szenario: SzenarioParsed }) {
  const verheiratet = szenario.haushalt.verheiratet;

  if (szenario.vertraege.length === 0) {
    return (
      <Seite titel="Ihre Verträge" nummer="Vorhandene Altersvorsorge">
        <Text>Es wurden keine Verträge erfasst. Die Berechnung beruht allein auf der
          gesetzlichen Versorgung.</Text>
      </Seite>
    );
  }

  return (
    <Seite titel="Ihre Verträge" nummer="Vorhandene Altersvorsorge">
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
        spalten={verheiratet ? [24, 8, 15, 30, 23] : [26, 16, 32, 26]}
        textSpalten={verheiratet ? [1, 3, 4] : [2, 3]}
      >
        {([1, 2, 3] as const).flatMap((schicht) => {
          const dieser = szenario.vertraege.filter((v) => v.schicht === schicht);
          if (dieser.length === 0) return [];
          return [
            <Gruppenzeile
              key={`s${schicht}`}
              text={SCHICHT_TITEL[schicht]}
              spalten={verheiratet ? 5 : 4}
            />,
            ...dieser.map((v) => (
              <Zeile
                key={v.id}
                zellen={[
                  <>
                    <span className="font-semibold">{v.name || 'ohne Bezeichnung'}</span>
                    <span className="block text-slate-500">{typText(v.typ)}</span>
                  </>,
                  ...(verheiratet ? [v.inhaber] : []),
                  betragText(v),
                  detailText(v),
                  strategieText(v),
                ]}
                textSpalten={verheiratet ? [1, 3, 4] : [2, 3]}
              />
            )),
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
        Angegeben sind die erfassten Vertragsdaten. Renditen und Kosten sind Annahmen; sie sind
        keine Zusage des Anbieters. Verträge mit der Verwendung „Nicht einrechnen“ bleiben im
        Ergebnis unberücksichtigt.
      </Text>
    </Seite>
  );
}
