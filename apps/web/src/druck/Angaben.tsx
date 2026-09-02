import { avdKinderzulageBis, type AvdParameter } from '@renten/engine';
import type { SzenarioParsed } from '../store/szenario';
import { euro, prozent } from '../components/Feld';
import { Untertitel, Angabe, Zweispaltig, Text } from './Bausteine';
import { personName, personNameAus } from '../features/personen';

const KV_TEXT = {
  kvdr: 'Pflichtversichert (KVdR)',
  freiwillig: 'Freiwillig gesetzlich versichert',
  pkv: 'Privat versichert',
} as const;

const ART_TEXT = { grv: 'Gesetzliche Rente', pension: 'Beamtenpension' } as const;

const EINKOMMEN_TEXT = { brutto: 'Brutto', netto: 'Netto', besoldung: 'Besoldung' } as const;

/**
 * "Ihre Angaben" — die Eingaben, mit denen gerechnet wurde.
 *
 * Gibt nur den INHALT zurueck, keine eigene Seite: Angaben und Vertraege
 * fuellen je fuer sich keine A4-Seite und stehen deshalb gemeinsam auf einer.
 * Die Seite baut `Gutachten.tsx`.
 *
 * Das fehlte dem Ausdruck bisher vollstaendig: die Eingabespalte ist im Druck
 * ausgeblendet, und die Vertraege stecken zusaetzlich hinter Reitern, sodass
 * immer nur EINE Schicht ueberhaupt im Dokument steht. Ohne diese Seite ist
 * das Gutachten nicht nachvollziehbar — man sieht Ergebnisse ohne Grundlage.
 */
export function Angaben({ szenario, avd }: { szenario: SzenarioParsed; avd: AvdParameter }) {
  const h = szenario.haushalt;
  const a = szenario.annahmen;
  const jetzt = new Date().getFullYear();

  const einkommen = (e: SzenarioParsed['einkommenHeute']) =>
    e.modus === 'besoldung'
      ? `${e.besoldungsgruppe}, Stufe ${e.besoldungsstufe} (${e.besoldungsland})`
      : `${euro(e.betrag)} ${EINKOMMEN_TEXT[e.modus]} im Monat, ${e.auszahlungen} Zahlungen`;

  return (
    <>
      <Untertitel>Haushalt</Untertitel>
      <Zweispaltig>
        <Angabe feld="Familienstand" wert={h.verheiratet ? 'Verheiratet (Splitting)' : 'Alleinstehend'} />
        <Angabe feld="Bundesland" wert={h.bundesland} />
        <Angabe feld="Kirchensteuer" wert={h.kirchensteuer ? 'ja' : 'nein'} />
        <Angabe feld="Krankenversicherung" wert={KV_TEXT[h.kvStatus]} />
        {h.kvStatus === 'pkv' && (
          <>
            <Angabe feld="PKV-Beitrag heute" wert={`${euro(h.pkv.praemieMonat)} im Monat`} />
            <Angabe feld="Angenommene Steigerung" wert={`${prozent(h.pkv.steigerung)} p. a.`} />
            {h.pkv.bet.aktiv && (
              <Angabe
                feld="Beitragsentlastungstarif"
                wert={`${euro(h.pkv.bet.beitragMonat)} für ${euro(h.pkv.bet.entlastungMonat)} ab ${h.pkv.bet.abAlter}`}
              />
            )}
          </>
        )}
        <Angabe feld="Gewünschtes Netto im Monat (heute)" wert={euro(h.zielNettoHeute)} />
      </Zweispaltig>

      {h.kinder.length > 0 && (
        <>
          <Untertitel>Kinder</Untertitel>
          <Zweispaltig>
            {h.kinder.map((k, i) => (
              <Angabe
                key={i}
                feld={`${i + 1}. Kind, geboren ${k.geburtsjahr}`}
                wert={
                  k.ausbildungBisJahr !== undefined
                    ? `Ausbildung bis ${k.ausbildungBisJahr} · Zulage bis ${avdKinderzulageBis(k, avd)}`
                    : `Zulage bis ${avdKinderzulageBis(k, avd)}`
                }
              />
            ))}
          </Zweispaltig>
          <Text>
            Die Kinderzulage des Altersvorsorgedepots läuft, solange Kindergeld fließt: bis{' '}
            {avd.kinderzulageBisAlter} — und bei Ausbildung oder Studium so lange, wie diese dauert,
            längstens bis {avd.kinderzulageBisAlterAusbildung}.
          </Text>
        </>
      )}

      <Untertitel>Personen</Untertitel>
      {szenario.personen
        .filter((p) => p.id === 'A' || h.verheiratet)
        .map((p) => (
          <div key={p.id} className="mb-3 break-inside-avoid">
            <div className="mb-1 text-[11px] font-bold text-slate-800">
              {personName(p)}
            </div>
            <Zweispaltig>
              <Angabe feld="Geburtsdatum" wert={p.geburtsdatum || '—'} />
              <Angabe feld="Rentenbeginn" wert={p.rentenbeginn || '—'} />
              <Angabe feld="Versorgung" wert={ART_TEXT[p.art]} />
              {p.art === 'grv' ? (
                <Angabe feld="Heutiger Rentenanspruch" wert={`${euro(p.grvBruttoHeute)} im Monat`} />
              ) : (
                <Angabe
                  feld="End-Besoldung / Ruhegehaltssatz"
                  wert={`${p.besoldungsgruppe} · ${prozent(p.ruhegehaltssatz / 100)}`}
                />
              )}
            </Zweispaltig>
          </div>
        ))}

      {/*
        Name UEBER dem Betrag, nicht daneben: ein Name und ein Satz wie
        "4.000 € Brutto im Monat, 12 Zahlungen" passen in einer halbbreiten
        Spalte nicht nebeneinander — beide brechen dann um, und aus "Jakob
        Spengler" werden zwei Zeilen.
      */}
      <Untertitel>Heutiges Einkommen</Untertitel>
      <Zweispaltig>
        <div className="break-inside-avoid border-b border-dotted border-slate-200 py-1">
          <div className="text-[11px] text-slate-600">
            {szenario.einkommenGetrennt ? personNameAus(szenario.personen, 'A') : 'Haushalt'}
          </div>
          <div className="text-[11px] font-semibold tabular-nums text-slate-900">
            {einkommen(szenario.einkommenHeute)}
          </div>
        </div>
        {h.verheiratet && szenario.einkommenGetrennt && (
          <div className="break-inside-avoid border-b border-dotted border-slate-200 py-1">
            <div className="text-[11px] text-slate-600">
              {personNameAus(szenario.personen, 'B')}
            </div>
            <div className="text-[11px] font-semibold tabular-nums text-slate-900">
              {einkommen(szenario.einkommenPartner)}
            </div>
          </div>
        )}
      </Zweispaltig>

      <Untertitel>Annahmen</Untertitel>
      <Zweispaltig>
        <Angabe feld="Inflation" wert={`${prozent(a.inflation)} pro Jahr`} />
        <Angabe feld="Rentendynamik" wert={`${prozent(a.rentendynamik)} pro Jahr`} />
        <Angabe feld="Gehaltsdynamik" wert={`${prozent(a.gehaltsdynamik)} pro Jahr`} />
        <Angabe feld="Steuertarif-Indexierung" wert={`${prozent(a.tarifIndex)} pro Jahr`} />
      </Zweispaltig>
      <Text>
        Die Annahmen sind Fortschreibungen, keine Zusagen. Sie wirken über Jahrzehnte und
        entscheiden das Ergebnis erheblich mit — eine um einen Prozentpunkt höhere Inflation
        halbiert die Kaufkraft rund 25 Jahre früher. Erstellt am{' '}
        {new Date().toLocaleDateString('de-DE')}; die Rechtslage ist die von {jetzt}.
      </Text>
    </>
  );
}
