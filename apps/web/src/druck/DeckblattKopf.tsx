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

/** Grund und Schrift des Papiers — das Gutachten und die Vorschau des Deckblatts teilen sie. */
export const PAPIER = 'bg-white text-slate-800';

/**
 * Der Kopf. Ohne Auftritt wie bisher: Logo, Name und Leitsatz des
 * Rentenplaners. Mit Auftritt steht der Berater vorn; „erstellt mit dem
 * JS-Rentenplaner“ bleibt klein dabei — der Mandant soll sehen, womit
 * gerechnet wurde.
 *
 * Der Balken nimmt die Akzentfarbe (`--akzent-linie`), sonst Tinte wie die
 * Trendlinie im Logo. Vorher Gruen — die Farbe des alten Logos, das es im
 * Stil „Seline“ nicht mehr gibt.
 */
export function DeckblattKopf({ auftritt }: { auftritt?: Auftritt | null }) {
  const balken = 'border-b-4 border-[color:var(--akzent-linie,#0c0a09)] pb-5';
  if (!auftritt || !auftrittSichtbar(auftritt)) {
    return (
      <div className={`flex items-center gap-5 ${balken}`}>
        <Logo klasse="h-20 w-20" />
        <div>
          <div className="text-2xl font-black tracking-tight text-slate-900">JS-Rentenplaner</div>
          <div className="text-sm font-medium text-slate-500">Ihre Zukunft. Heute smart geplant.</div>
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
          {firma && <div className="break-words text-2xl font-black leading-tight tracking-tight text-slate-900">{firma}</div>}
          {berater && <div className="mt-1 break-words text-sm font-semibold text-slate-700">{berater}</div>}
          {kontakt && <div className="mt-0.5 break-words text-xs text-slate-600">{kontakt}</div>}
          {a.zusatz.trim() && (
            <div className="mt-1 break-words text-[10px] leading-snug text-slate-500">{a.zusatz.trim()}</div>
          )}
        </div>
      </div>
      <div className="mt-1 flex items-center justify-end gap-1.5 text-[10px] font-medium text-slate-500">
        <Logo klasse="h-3.5 w-3.5" /> erstellt mit dem JS-Rentenplaner
      </div>
    </>
  );
}

/** Titel, Mandant und Datum. `children` sind Zusatzzeilen (Einzelbetrachtung). */
export function DeckblattTitel({ titel, fuer, children }: { titel: string; fuer: string; children?: ReactNode }) {
  return (
    <>
      <h1 className="mt-6 text-3xl font-black tracking-tight text-slate-900">{titel}</h1>
      <p className="mt-2 text-lg text-slate-700">für {fuer}</p>
      {children}
      <p className="mt-1 text-xs text-slate-500">
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
      <div className="grid grid-cols-3 gap-4 rounded-lg border border-slate-300 bg-slate-50 px-4 py-3">
        {[
          { titel: 'Gewünschtes Netto', wert: bedarf },
          { titel: 'Erwartetes Netto', wert: netto },
          { titel: luecke > 0 ? 'Es fehlen' : 'Darüber hinaus', wert: luecke > 0 ? luecke : netto - bedarf },
        ].map((x) => (
          <div key={x.titel}>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {x.titel}
            </div>
            <div className="text-base font-black tabular-nums text-slate-900">
              {euro(Math.abs(x.wert))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
