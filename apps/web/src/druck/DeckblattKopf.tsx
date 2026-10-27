import type { ReactNode } from 'react';
import { Logo } from '../components/Logo';
import { euro } from '../components/Feld';
import { auftrittSichtbar, kontaktZeile, type Auftritt } from '../features/auftritt';
import { Untertitel } from './Bausteine';

/**
 * Die obere Haelfte des Deckblatts — im Gutachten UND in den Vorschauen
 * (Schnellrechnung, Fenster „Ihr Auftritt im Gutachten“). Dieselben
 * Komponenten, damit die Vorschau genau dem Druck entspricht.
 */

/**
 * Grund und Schrift des Papiers — das Gutachten und die Vorschau des Deckblatts teilen sie.
 * Hervorgehobenes im Text hoechstens in Gewicht 500, wie am Bildschirm.
 */
export const PAPIER = 'bg-white text-ui-tinte [&_strong]:font-medium';

/**
 * Der Kopf. Ohne Auftritt wie bisher: Logo, Name und Leitsatz des
 * Rentenplaners. Mit Auftritt steht der Berater vorn; „erstellt mit dem
 * JS-Rentenplaner“ bleibt klein dabei — der Mandant soll sehen, womit
 * gerechnet wurde.
 *
 * Der Balken nimmt die Akzentfarbe (`--akzent-linie`), sonst Tinte wie die
 * Trendlinie im Logo — 2 px wie die Linie unter jedem Seitentitel.
 */
export function DeckblattKopf({ auftritt }: { auftritt?: Auftritt | null }) {
  const balken = 'border-b-2 border-[color:var(--akzent-linie,rgb(var(--ui-tinte)))] pb-5';
  if (!auftritt || !auftrittSichtbar(auftritt)) {
    return (
      <div className={`flex items-center gap-5 ${balken}`}>
        <Logo klasse="h-20 w-20" />
        <div>
          <div className="ui-titel text-2xl font-medium text-ui-tinte">JS-Rentenplaner</div>
          <div className="text-sm text-ui-schiefer">Ihre Zukunft. Heute smart geplant.</div>
        </div>
      </div>
    );
  }
  const a = auftritt;
  const firma = a.firma.trim();
  const berater = a.berater.trim();
  const kontakt = kontaktZeile(a);
  /*
    Wie ein Briefkopf: Logo links, daneben Firma, Name und Kontakt — jede
    Angabe in ihrer eigenen Zeile. „erstellt mit dem JS-Rentenplaner“ steht
    klein unter dem Balken; neben dem Logo nahm es dem Text die Breite.
  */
  return (
    <>
      <div className={`flex items-center gap-6 ${balken}`}>
        {a.logo && (
          <img
            src={a.logo}
            alt={firma || 'Logo'}
            data-auftritt-logo=""
            className="max-h-[20mm] max-w-[60mm] shrink-0 object-contain"
          />
        )}
        <div className="min-w-0 flex-1">
          {firma && <div className="ui-titel break-words text-2xl font-medium leading-tight text-ui-tinte">{firma}</div>}
          {berater && <div className="mt-1 break-words text-sm font-medium text-ui-tinte">{berater}</div>}
          {kontakt && <div className="mt-0.5 break-words text-xs text-ui-schiefer">{kontakt}</div>}
          {a.zusatz.trim() && (
            <div className="mt-1 break-words text-[10px] leading-snug text-ui-schiefer">{a.zusatz.trim()}</div>
          )}
        </div>
      </div>
      <div className="mt-1 flex items-center justify-end gap-1.5 text-[10px] text-ui-schiefer">
        <Logo klasse="h-3.5 w-3.5" /> erstellt mit dem JS-Rentenplaner
      </div>
    </>
  );
}

/** Titel, Mandant und Datum. `children` sind Zusatzzeilen (Einzelbetrachtung). */
export function DeckblattTitel({ titel, fuer, children }: { titel: string; fuer: string; children?: ReactNode }) {
  return (
    <>
      <h1 className="ui-titel mt-6 text-3xl font-normal text-ui-tinte">{titel}</h1>
      <p className="mt-2 text-lg text-ui-tinte">für {fuer}</p>
      {children}
      <p className="mt-1 text-xs text-ui-schiefer">
        Erstellt am {new Date().toLocaleDateString('de-DE')}
      </p>
    </>
  );
}

/**
 * Bedarf, Netto und Luecke in heutiger Kaufkraft — ZUERST ohne, dann mit
 * Inflation. Wer nur die hochgerechneten Betraege sieht, hat keinen
 * Bezugspunkt: 4.594 EUR Bedarf im Jahr 2068 wirken willkuerlich hoch,
 * solange daneben nicht steht, dass es dieselben 2.000 EUR von heute sind.
 */
export function DeckblattHeute({ bedarf, netto }: { bedarf: number; netto: number }) {
  const luecke = Math.max(0, bedarf - netto);
  return (
    <>
      <Untertitel>Heute — in der Kaufkraft, die Sie kennen</Untertitel>
      <div className="grid grid-cols-3 gap-4 rounded-[10px] border border-ui-linie bg-ui-innen px-4 py-3">
        {[
          { titel: 'Gewünschtes Netto', wert: bedarf },
          { titel: 'Erwartetes Netto', wert: netto },
          { titel: luecke > 0 ? 'Es fehlen' : 'Darüber hinaus', wert: luecke > 0 ? luecke : netto - bedarf },
        ].map((x) => (
          <div key={x.titel}>
            <div className="text-[11px] text-ui-schiefer">
              {x.titel}
            </div>
            <div className="text-base font-medium tabular-nums text-ui-tinte">
              {euro(Math.abs(x.wert))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
