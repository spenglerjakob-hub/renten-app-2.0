import type { CSSProperties } from 'react';
import type { ProjektionsErgebnis } from '@renten/engine';
import type { SzenarioParsed } from '../store/szenario';
import { ohneEigenaufwand, kindName, type TuevPosition } from '../features/tuev-berechnung';
import { vertragsBezeichnung, kinderpoliceText, typText } from '../features/vertragsarten';
import { personNameAus } from '../features/personen';
import { Rechtsstand } from '../features/Rechtsstand';
import { akzentVariablen, fusszeileCss, type Auftritt } from '../features/auftritt';
import { euro, euroGenau } from '../components/Feld';
import { useAnsprache } from '../components/Ansprache';
import { Seite, Tabelle, Zeile, Text, Untertitel } from './Bausteine';
import { DeckblattKopf, DeckblattTitel, PAPIER } from './DeckblattKopf';
import { TuevBogen } from './TuevBogen';

/** Was ankommt — in einer Zelle der Uebersicht. */
function ankommt(p: TuevPosition): string {
  const r = p.ergebnis;
  if (p.kind && !p.kind.vollstaendig) return 'Geburtsdatum fehlt';
  const betrag = p.istKapital ? `${euro(r.nettoKapital)} einmalig` : `${euro(r.nettoRenteMonat)} im Monat`;
  return p.kind ? `${betrag} an ${kindName(p.kind)}` : betrag;
}

/**
 * DIE VERTRAGSPRUEFUNG AUF PAPIER — ohne Gutachten drumherum.
 *
 * Ein Deckblatt mit dem Auftritt des Beraters und einer Uebersicht aller
 * Vertraege, dann je Vertrag der Bogen des Vertrags-TUEV (derselbe wie im
 * Gutachten, die Kinderpolice in ihrer eigenen Fassung), am Ende Rechtsstand
 * und Vorbehalt. Gerechnet wird nichts eigenes: Die Positionen kommen aus
 * `tuevPositionen`, wie am Bildschirm.
 *
 * Wie das Gutachten `hidden print:block`; die Seite selbst ist im Druck
 * durchgehend ausgeblendet.
 */
export function VertragspruefungDruck({ szenario, ergebnis, positionen, auftritt = null }: {
  szenario: SzenarioParsed;
  ergebnis: ProjektionsErgebnis | null;
  positionen: TuevPosition[];
  auftritt?: Auftritt | null;
}) {
  const an = useAnsprache();
  const h = szenario.haushalt;
  const name = h.verheiratet && szenario.personen.length > 1
    ? `${personNameAus(szenario.personen, 'A')} und ${personNameAus(szenario.personen, 'B')}`
    : personNameAus(szenario.personen, 'A');
  const kinder = positionen.filter((p) => p.kind);
  const fussCss = fusszeileCss(auftritt);

  return (
    <div
      id="vertragspruefung-druck"
      className={`hidden ${PAPIER} print:block`}
      style={akzentVariablen(auftritt) as CSSProperties}
    >
      {fussCss && <style>{fussCss}</style>}

      <Seite erste>
        <DeckblattKopf auftritt={auftritt} />
        <DeckblattTitel titel="Vertragsprüfung" fuer={name} />

        <Text>
          Je Vertrag steht hier, was er {an.dich} im Monat wirklich kostet — nach Steuer- und
          Abgabenersparnis, Zulagen und Arbeitgeberzuschuss — und was am Ende netto ankommt.
          {kinder.length > 0 && (
            <>
              {' '}{kinder.length === 1 ? 'Die Kinderpolice zahlt' : 'Die Kinderpolicen zahlen'} an das versicherte
              Kind aus; gerechnet ist mit seinem Steuersatz im Alter, und sie zählen nicht zu{' '}
              {an.dein('er')} eigenen Rente.
            </>
          )}
        </Text>

        {positionen.length > 0 ? (
          <>
            <Untertitel>Die Verträge im Überblick</Untertitel>
            <Tabelle
              kopf={['Vertrag', `Kostet ${an.dich} im Monat`, 'Was ankommt (netto)', 'Aus 1 € Aufwand werden']}
              spalten={[38, 18, 26, 18]}
            >
              {positionen.map((p) => (
                <Zeile
                  key={p.vertrag.id}
                  zellen={[
                    <>
                      <span className="font-medium text-ui-tinte">{vertragsBezeichnung(p.vertrag)}</span>
                      <span className="block text-ui-schiefer">
                        {kinderpoliceText(p.vertrag) ?? `${typText(p.vertrag.typ)}, Schicht ${p.vertrag.schicht}`}
                      </span>
                    </>,
                    euro(p.ergebnis.echterAufwandMonat),
                    ankommt(p),
                    ohneEigenaufwand(p.ergebnis) || (p.kind && !p.kind.vollstaendig)
                      ? '—'
                      : euroGenau(Math.round(p.ergebnis.nettoHebel * 100) / 100),
                  ]}
                />
              ))}
            </Tabelle>
            <Text>
              Auf den folgenden Seiten jeder Vertrag einzeln: die Annahmen, die Rechnung von der
              Einzahlung bis zur Auszahlung und die Kennzahlen. Renditen, Renten und Kapital sind
              Annahmen und Werte der Anbieter, keine Zusage.
            </Text>
          </>
        ) : (
          <Text>Es wurden keine Verträge erfasst.</Text>
        )}
      </Seite>

      {positionen.map((p) => <TuevBogen key={p.vertrag.id} position={p} szenario={szenario} />)}

      {ergebnis && (
        <Seite titel="Rechtsstand, Methodik und Vorbehalt" nummer="Wie die Zahlen zustande kommen">
          <Rechtsstand
            ergebnis={ergebnis}
            tarifIndex={szenario.annahmen.tarifIndex}
            rentendynamik={szenario.annahmen.rentendynamik}
            inflation={szenario.annahmen.inflation}
            imGutachten
          />
        </Seite>
      )}
    </div>
  );
}
