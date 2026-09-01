import { useMemo } from 'react';
import {
  ruhestandsfenster, parameterFuer,
  type ProjektionsErgebnis, type Jahreszeile,
} from '@renten/engine';
import type { SzenarioParsed } from '../store/szenario';
import { euro } from '../components/Feld';
import { Logo } from '../components/Logo';
import { Kassenbon } from '../features/Kassenbon';
import { Rechtsstand } from '../features/Rechtsstand';
import { tuevPositionen } from '../features/tuev-berechnung';
import { Seite, GrosseZahl, Text, Untertitel } from './Bausteine';
import { Angaben } from './Angaben';
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
    () => tuevPositionen(szenario, ergebnis ? zeile : null),
    [szenario, ergebnis, zeile],
  );

  const h = szenario.haushalt;
  const name = h.verheiratet
    ? `${szenario.personen[0]?.name || 'Person A'} und ${szenario.personen[1]?.name || 'Person B'}`
    : szenario.personen[0]?.name || 'Person A';

  const luecke = Math.max(0, zeile.zielNettoMonat - zeile.nettoMonat);
  const gedeckt = zeile.zielNettoMonat > 0
    ? Math.min(100, (zeile.nettoMonat / zeile.zielNettoMonat) * 100)
    : 100;

  const abschnitte = [
    'Ihre Angaben',
    'Ihre Verträge',
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

        <div className="mt-6 grid grid-cols-3 gap-4">
          <GrosseZahl
            titel={`Bedarf im Jahr ${zeile.jahr}`}
            wert={euro(zeile.zielNettoMonat)}
            hinweis="monatlich, Betrag des Jahres"
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

        <div className="mt-3 h-3 w-full overflow-hidden rounded-full border border-slate-300 bg-slate-100">
          <div
            className={`h-full ${luecke > 0 ? 'bg-rose-400' : 'bg-emerald-500'}`}
            style={{ width: `${gedeckt}%` }}
          />
        </div>

        <Text>
          {luecke > 0 ? (
            <>
              Nach heutigem Stand fehlen Ihnen im Jahr {zeile.jahr} monatlich{' '}
              <strong>{euro(luecke)}</strong>, um Ihr gewünschtes Netto zu erreichen. Über die
              Jahre {fenster[0]?.alterA ?? 65} bis {fenster[fenster.length - 1]?.alterA ?? 95}{' '}
              summiert sich das auf etwa{' '}
              <strong>
                {euro(fenster.reduce((s, z) => s + Math.max(0, z.zielNettoMonat - z.nettoMonat) * 12, 0))}
              </strong>
              . Alle Beträge sind Beträge des jeweiligen Jahres; was sie in heutigem Geld wert
              sind, steht auf der Seite „Dieselben Zahlen in heutiger Kaufkraft“.
            </>
          ) : (
            <>
              Nach heutigem Stand ist Ihr gewünschtes Netto im Jahr {zeile.jahr} gedeckt — unter
              den auf der Seite „Ihre Angaben“ genannten Annahmen, insbesondere zur Inflation.
            </>
          )}
        </Text>

        {ergebnis && ergebnis.hinweise.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-2">
            <div className="mb-1 text-[9px] font-bold uppercase tracking-wider text-amber-800">
              Hinweise zur Berechnung
            </div>
            <ul className="list-inside list-disc space-y-0.5 text-[10px] text-amber-900">
              {ergebnis.hinweise.map((x, i) => <li key={i}>{x}</li>)}
            </ul>
          </div>
        )}

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

      <Angaben szenario={szenario} avd={avd} />
      <Vertragsliste szenario={szenario} />

      {ergebnis && (
        <Seite titel={`Ihre Renteneinkünfte im Jahr ${zeile.jahr}`} nummer="Woraus sich das Netto zusammensetzt">
          <Kassenbon ergebnis={ergebnis} zeile={zeile} kaufkraftHeute={false} ohneTitel />
        </Seite>
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
