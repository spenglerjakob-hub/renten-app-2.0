import { useMemo } from 'react';
import {
  ruhestandsfenster, parameterFuer,
  type ProjektionsErgebnis, type Jahreszeile,
} from '@renten/engine';
import type { SzenarioParsed } from '../store/szenario';
import { euro, prozent } from '../components/Feld';
import { Logo } from '../components/Logo';
import { Rechtsstand } from '../features/Rechtsstand';
import { tuevPositionen } from '../features/tuev-berechnung';
import { personNameAus } from '../features/personen';
import { Seite, GrosseZahl, Text, Untertitel } from './Bausteine';
import { Angaben } from './Angaben';
import { Renteneinkuenfte } from './Renteneinkuenfte';
import { Vertragsliste } from './Vertragsliste';
import { RuhestandVerlauf } from './RuhestandVerlauf';
import { Kaufkraft } from './Kaufkraft';
import { TuevBogen } from './TuevBogen';

/**
 * Das gedruckte Gutachten.
 *
 * WARUM EIN EIGENES DOKUMENT UND KEIN DRUCK-CSS: Der Ausdruck war ein Abzug
 * der Bedienoberflaeche. Die besteht aus Formularfeldern, Reitern und
 * Scrollbereichen — auf Papier ergibt das leere Eingabekaesten, fehlende
 * Vertraege (immer nur EIN Reiter ist im Dokument) und abgeschnittene
 * Tabellen (Scrollbereiche werden nicht umbrochen, sondern gekappt).
 *
 * Gerechnet wird hier NICHTS neu. Alle Zahlen stammen aus demselben
 * `ProjektionsErgebnis` und derselben TUEV-Funktion, die auch der Bildschirm
 * benutzt.
 *
 * Eingehaengt wird es in App.tsx als `hidden print:block`; der Bildschirmpfad
 * ist im Gegenzug durchgehend `print:hidden`. So gibt es genau eine Quelle
 * fuer das Papier, und eine Aenderung an der Oberflaeche kann den Ausdruck
 * nicht mehr versehentlich zerlegen.
 */
export function Gutachten({
  szenario, ergebnis, zeile,
}: {
  szenario: SzenarioParsed;
  ergebnis: ProjektionsErgebnis | null;
  zeile: Jahreszeile;
}) {
  const jetzt = new Date().getFullYear();
  const avd = useMemo(
    () => parameterFuer(Math.max(jetzt, 2027), { indexRate: szenario.annahmen.tarifIndex }).avd,
    [jetzt, szenario.annahmen.tarifIndex],
  );

  const fenster = useMemo(
    () => (ergebnis ? ruhestandsfenster(ergebnis) : []),
    [ergebnis],
  );

  const positionen = useMemo(
    () => tuevPositionen(szenario, ergebnis ? zeile : null, ergebnis?.kapitalauszahlungen ?? []),
    [szenario, ergebnis, zeile],
  );

  const h = szenario.haushalt;
  const name = h.verheiratet
    ? `${personNameAus(szenario.personen, 'A')} und ${personNameAus(szenario.personen, 'B')}`
    : personNameAus(szenario.personen, 'A');

  const luecke = Math.max(0, zeile.zielNettoMonat - zeile.nettoMonat);
  const gedeckt = zeile.zielNettoMonat > 0
    ? Math.min(100, (zeile.nettoMonat / zeile.zielNettoMonat) * 100)
    : 100;

  // Dieselben drei Groessen in heutiger Kaufkraft. Der Kaufkraftfaktor der
  // Zeile rechnet einen Betrag des Rentenjahres auf das heutige Preisniveau
  // zurueck; gerechnet wird also nichts Neues.
  const heute = (n: number) => n / zeile.kaufkraftfaktor;
  const bedarfHeute = h.zielNettoHeute;
  const nettoHeute = heute(zeile.nettoMonat);
  const lueckeHeute = Math.max(0, bedarfHeute - nettoHeute);

  const abschnitte = [
    'Ihre Angaben und Verträge',
    `Ihre Renteneinkünfte im Jahr ${zeile.jahr}`,
    'Ihre Einkünfte im Ruhestand',
    'Dieselben Zahlen in heutiger Kaufkraft',
    ...positionen.map((p) => `Vertrags-Prüfung: ${p.vertrag.name || 'ohne Bezeichnung'}`),
    'Rechtsstand, Methodik und Vorbehalt',
  ];

  return (
    <div className="hidden bg-white text-slate-800 print:block">
      {/* DECKBLATT */}
      <Seite erste>
        <div className="flex items-center gap-5 border-b-4 border-emerald-500 pb-5">
          <Logo klasse="h-20 w-20" />
          <div>
            <div className="text-2xl font-black tracking-tight text-slate-900">JS-Rentenplaner</div>
            <div className="text-sm font-medium text-slate-500">Ihre Zukunft. Heute smart geplant.</div>
          </div>
        </div>

        <h1 className="mt-8 text-3xl font-black tracking-tight text-slate-900">
          Altersvorsorge-Analyse
        </h1>
        <p className="mt-2 text-lg text-slate-700">für {name}</p>
        <p className="mt-1 text-xs text-slate-500">
          Erstellt am {new Date().toLocaleDateString('de-DE')}
        </p>

        {/*
          ZUERST ohne, dann mit Inflation.
          Wer nur die hochgerechneten Betraege sieht, hat keinen Bezugspunkt:
          4.594 EUR Bedarf im Jahr 2068 wirken willkuerlich hoch, solange
          daneben nicht stehen, dass es dieselben 2.000 EUR von heute sind.
        */}
        <Untertitel>Heute — in der Kaufkraft, die Sie kennen</Untertitel>
        <div className="grid grid-cols-3 gap-4 rounded-lg border border-slate-300 bg-slate-50 px-4 py-3">
          {[
            { titel: 'Gewünschtes Netto', wert: bedarfHeute },
            { titel: 'Erwartetes Netto', wert: nettoHeute },
            {
              titel: lueckeHeute > 0 ? 'Es fehlen' : 'Darüber hinaus',
              wert: lueckeHeute > 0 ? lueckeHeute : nettoHeute - bedarfHeute,
            },
          ].map((x) => (
            <div key={x.titel}>
              <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                {x.titel}
              </div>
              <div className="text-base font-black tabular-nums text-slate-900">
                {euro(Math.abs(x.wert))}
              </div>
            </div>
          ))}
        </div>

        <Text>
          Bis zu Ihrem Rentenbeginn im Jahr {zeile.jahr} steigen die Preise — bei angenommenen{' '}
          <strong>{prozent(szenario.annahmen.inflation)}</strong> Inflation im Jahr. Deshalb stehen
          in den Kacheln darunter größere Zahlen: Es ist dieselbe Rechnung, nur im Geld des
          Rentenjahres statt im Geld von heute. Wie sich beide Maßstäbe über den ganzen Ruhestand
          entwickeln, zeigt die Seite „Dieselben Zahlen in heutiger Kaufkraft“.
        </Text>

        <Untertitel>Im Jahr {zeile.jahr} — mit Inflation gerechnet</Untertitel>
        <div className="grid grid-cols-3 gap-4">
          <GrosseZahl
            titel="Bedarf"
            wert={euro(zeile.zielNettoMonat)}
            hinweis={`monatlich, Betrag des Jahres ${zeile.jahr}`}
          />
          <GrosseZahl
            titel="Erwartetes Netto"
            wert={euro(zeile.nettoMonat)}
            hinweis={`entspricht ${gedeckt.toFixed(0)} % des Bedarfs`}
          />
          <GrosseZahl
            titel="Versorgungslücke"
            wert={luecke > 0 ? euro(luecke) : 'Gedeckt'}
            ton={luecke > 0 ? 'schlecht' : 'gut'}
            hinweis={luecke > 0 ? 'monatlich fehlend' : 'kein Fehlbetrag'}
          />
        </div>

        {/*
          Der Balken misst den Fortschritt und bewertet ihn nicht: ob eine
          Luecke bleibt, sagt schon die Kachel darueber ueber ihre Farbe.
        */}
        <div className="mt-3 flex items-center gap-3">
          <div className="h-3 flex-1 overflow-hidden rounded-full border border-slate-300 bg-slate-100">
            <div className="h-full bg-blue-500" style={{ width: `${gedeckt}%` }} />
          </div>
          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
            {gedeckt.toFixed(0)} % erreicht
          </span>
        </div>

        <div className="mt-6">
          <Untertitel>Inhalt</Untertitel>
          <ol className="list-inside list-decimal space-y-1 text-[11px] text-slate-700">
            {abschnitte.map((a) => <li key={a}>{a}</li>)}
          </ol>
        </div>

        <div className="mt-5 rounded-lg border border-slate-300 bg-slate-50 p-3">
          <Text>
            <strong>Was dieses Dokument ist.</strong> Eine Modellrechnung auf Grundlage der von
            Ihnen gemachten Angaben und der auf Seite „Ihre Angaben“ genannten Annahmen. Es ist
            keine Steuer-, Renten- oder Anlageberatung und keine Zusage über künftige Leistungen.
            Rechtslage und Rechenwege sind am Ende des Dokuments beschrieben.
          </Text>
        </div>
      </Seite>

      {/*
        Angaben und Vertraege auf EINER Seite: einzeln fuellte keiner der
        beiden Bloecke auch nur die halbe Seite. Passt es bei vielen
        Vertraegen doch nicht, bricht der Browser zwischen ihnen um — also
        genau das alte Bild, aber nur dann, wenn es noetig ist.
      */}
      <Seite titel="Ihre Angaben und Verträge" nummer="Grundlage der Berechnung">
        <Angaben szenario={szenario} avd={avd} />
        <Vertragsliste szenario={szenario} hinweise={ergebnis?.vertragsHinweise ?? []} />
      </Seite>

      {ergebnis && (
        <Renteneinkuenfte
          ergebnis={ergebnis}
          zeile={zeile}
          zielNettoHeute={h.zielNettoHeute}
          inflation={szenario.annahmen.inflation}
        />
      )}

      <RuhestandVerlauf zeilen={fenster} />
      <Kaufkraft zeilen={fenster} inflation={szenario.annahmen.inflation} bezugsjahr={zeile.jahr} />

      {positionen.map((p) => (
        <TuevBogen key={p.vertrag.id} position={p} szenario={szenario} />
      ))}

      {/*
        Rechtsstand und Methodik stehen ans ENDE. Der vorhandene Abschnitt
        traegt bereits eine ausfuehrliche Druckfassung; sie wird uebernommen,
        statt sie ein zweites Mal zu schreiben.
      */}
      {ergebnis && (
        <Seite titel="Rechtsstand, Methodik und Vorbehalt" nummer="Wie die Zahlen zustande kommen">
          <Rechtsstand
            ergebnis={ergebnis}
            tarifIndex={szenario.annahmen.tarifIndex}
            rentendynamik={szenario.annahmen.rentendynamik}
            inflation={szenario.annahmen.inflation}
            ohneTitel
          />
        </Seite>
      )}
    </div>
  );
}
