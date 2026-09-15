import type { ReactNode } from 'react';
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

/* In der Erwerbsphase gibt es nur zwei Faelle: gesetzlich oder privat. */
const KV_ERWERB_TEXT = {
  gesetzlich: 'Freiwillig gesetzlich versichert',
  pkv: 'Privat versichert',
} as const;

const ART_TEXT = { grv: 'Gesetzliche Rente', pension: 'Beamtenpension' } as const;

/**
 * Gegenstueck zu `Zweispaltig` fuer den Fall, dass die Spalte selbst schon
 * eine Haelfte der Seite ist. Ein blosses Fragment taete es auch; als
 * benannter Baustein steht neben `Zweispaltig` aber, dass die Entscheidung
 * zwischen beiden absichtlich getroffen wird.
 */
function Einspaltig({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

const EINKOMMEN_TEXT = {
  brutto: 'Brutto', netto: 'Netto', besoldung: 'Besoldung', selbststaendig: 'Gewinn',
} as const;

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

  /* Wer ueberhaupt gerechnet wird — Person B nur bei Verheirateten. */
  const gerechnete = szenario.personen.filter((p) => p.id === 'A' || h.verheiratet);

  const einkommen = (e: SzenarioParsed['einkommenHeute']) =>
    e.modus === 'besoldung'
      ? `${e.besoldungsgruppe}, Stufe ${e.besoldungsstufe} (${e.besoldungsland})`
      : e.modus === 'selbststaendig'
        ? `${euro(e.betrag)} Gewinn im Monat (selbstständig)`
        : `${euro(e.betrag)} ${EINKOMMEN_TEXT[e.modus]} im Monat, ${e.auszahlungen} Zahlungen`;

  /* Der GRV-Beitrag entscheidet ueber den Hoechstbetrag einer Basisrente —
     er gehoert deshalb in die Angaben, nicht nur in die Rechnung. */
  const eA = szenario.einkommenHeute;
  const grvZeile = eA.modus === 'selbststaendig'
    ? (eA.grvPflicht
        ? `${euro(eA.grvBeitragMonat)} im Monat, allein getragen`
        : 'zahlt nicht ein')
    : null;

  return (
    <>
      <Untertitel>Haushalt</Untertitel>
      <Zweispaltig>
        <Angabe feld="Familienstand" wert={h.verheiratet ? 'Verheiratet (Splitting)' : 'Alleinstehend'} />
        <Angabe feld="Bundesland" wert={h.bundesland} />
        <Angabe feld="Kirchensteuer" wert={h.kirchensteuer ? 'ja' : 'nein'} />
        {/*
          Bei Selbststaendigen sind das zwei Angaben: wer heute freiwillig
          gesetzlich versichert ist, kommt im Ruhestand in die KVdR. Bei allen
          anderen folgt die Erwerbsphase dem Ruhestandsstatus — dort waere die
          zweite Zeile nur eine Wiederholung.
        */}
        {eA.modus === 'selbststaendig' && (
          <Angabe feld="Krankenversicherung heute" wert={KV_ERWERB_TEXT[h.kvErwerb]} />
        )}
        <Angabe feld="Krankenversicherung im Ruhestand" wert={KV_TEXT[h.kvStatus]} />
        {/* Nur wenn er vom gesetzlichen Durchschnitt abweicht — sonst ist es
            keine Angabe des Nutzers, sondern der Rechtsstand. */}
        {h.zusatzbeitrag !== undefined && (
          <Angabe
            feld="Zusatzbeitrag der Krankenkasse"
            /* Die Kasse dazu, wenn sie gewaehlt wurde: Ein blosser Prozentwert
               laesst offen, woher er stammt. Zwei Stellen, weil die Kassen ihn
               so ausweisen. */
            wert={h.krankenkasse
              ? `${prozent(h.zusatzbeitrag, 2)} (${h.krankenkasse})`
              : prozent(h.zusatzbeitrag, 2)}
          />
        )}
        {(h.kvStatus === 'pkv' || h.kvErwerb === 'pkv') && (
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
        {grvZeile && <Angabe feld="Gesetzliche Rentenversicherung" wert={grvZeile} />}
        {/* Nur die Summe; die beiden Anteile stehen bei den Personen. */}
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
          {/* Auf eine Zeile gekuerzt: der Satz stand ueber zwei und sagte in
              der zweiten nur, was die Spalte „Zulage bis“ schon zeigt. */}
          <Text>
            Die Kinderzulage läuft, solange Kindergeld fließt — bis {avd.kinderzulageBisAlter},
            bei Ausbildung längstens bis {avd.kinderzulageBisAlterAusbildung}.
          </Text>
        </>
      )}

      {/*
        BEI EINEM PAAR DIE BEIDEN PERSONEN NEBENEINANDER, je eine Spalte.

        Vorher stand jede Person untereinander und war fuer sich zweispaltig.
        Das kostet die SUMME beider Hoehen; nebeneinander kostet es nur die
        groessere von beiden — der groesste einzelne Posten dieser Seite, die
        dadurch ueberlief, ohne dass ein einziger Vertrag erfasst war.

        Ein Alleinstehender behaelt die zweispaltige Darstellung: Eine Person
        in EINE Spalte zu zwingen liesse die halbe Seitenbreite leer und machte
        den Block dabei doppelt so hoch.
      */}
      <Untertitel>Personen</Untertitel>
      <div className={gerechnete.length > 1 ? 'grid grid-cols-2 gap-x-8' : ''}>
        {gerechnete.map((p) => {
          const Spalte = gerechnete.length > 1 ? Einspaltig : Zweispaltig;
          return (
            <div key={p.id} className="break-inside-avoid">
              <div className="mb-1 text-[12px] font-bold text-slate-800">
                {personName(p)}
              </div>
              <Spalte>
              <Angabe feld="Geburtsdatum" wert={p.geburtsdatum || '—'} />
              <Angabe feld="Rentenbeginn" wert={p.rentenbeginn || '—'} />
              {/*
                Der Zielanteil stand bisher im Haushaltsblock, wo er beide
                Namen in EINE Zeile zwang — bei langen Namen brach die auf
                drei um. Hier traegt ihn die Spalte, unter deren Namen er
                ohnehin gehoert; im Haushalt bleibt die Summe.
              */}
              {gerechnete.length > 1 && (
                <Angabe
                  feld="Eigener Zielanteil"
                  wert={`${euro(p.zielAnteilHeute ?? h.zielNettoHeute / 2)} im Monat`}
                />
              )}
              {/*
                Nur wenn sie vom Haushalt abweicht — sonst stuende dieselbe
                Angabe dreimal auf der Seite. Sie abzudrucken ist wichtig:
                Der Unterschied zwischen KVdR und privat macht im Alter
                mehrere hundert Euro im Monat aus.
              */}
              {p.kvStatus !== undefined && (
                <Angabe
                  feld="Krankenversicherung"
                  wert={p.kvStatus === 'pkv' && p.pkv
                    ? `${KV_TEXT.pkv}, ${euro(p.pkv.praemieMonat)} im Monat`
                    : p.krankenkasse
                      ? `${KV_TEXT[p.kvStatus]} (${p.krankenkasse})`
                      : KV_TEXT[p.kvStatus]}
                />
              )}
              <Angabe feld="Versorgung" wert={ART_TEXT[p.art]} />
              {p.art === 'grv' ? (
                <Angabe feld="Rentenanspruch heute" wert={`${euro(p.grvBruttoHeute)} im Monat`} />
              ) : (
                <Angabe
                  feld="Besoldung / Ruhegehalt"
                  wert={`${p.besoldungsgruppe} · ${prozent(p.ruhegehaltssatz / 100)}`}
                />
              )}
              </Spalte>
            </div>
          );
        })}
      </div>

      {/*
        Name UEBER dem Betrag, nicht daneben: ein Name und ein Satz wie
        "4.000 € Brutto im Monat, 12 Zahlungen" passen in einer halbbreiten
        Spalte nicht nebeneinander — beide brechen dann um, und aus "Jakob
        Spengler" werden zwei Zeilen.
      */}
      <Untertitel>Heutiges Einkommen</Untertitel>
      <Zweispaltig>
        <div className="break-inside-avoid border-b border-dotted border-slate-200 py-1">
          <div className="text-[12px] text-slate-600">
            {szenario.einkommenGetrennt ? personNameAus(szenario.personen, 'A') : 'Haushalt'}
          </div>
          <div className="text-[12px] font-semibold tabular-nums text-slate-900">
            {einkommen(szenario.einkommenHeute)}
          </div>
        </div>
        {h.verheiratet && szenario.einkommenGetrennt && (
          <div className="break-inside-avoid border-b border-dotted border-slate-200 py-1">
            <div className="text-[12px] text-slate-600">
              {personNameAus(szenario.personen, 'B')}
            </div>
            <div className="text-[12px] font-semibold tabular-nums text-slate-900">
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
      {/*
        Auf EINE Zeile gekuerzt. Dass Fortschreibungen ueber Jahrzehnte wirken,
        steht ausfuehrlich auf der Kaufkraftseite; hier zaehlt, dass es
        Annahmen sind und von wann sie stammen.
      */}
      <Text>
        Die Annahmen sind Fortschreibungen, keine Zusagen. Erstellt am{' '}
        {new Date().toLocaleDateString('de-DE')}; Rechtslage {jetzt}.
      </Text>
    </>
  );
}
