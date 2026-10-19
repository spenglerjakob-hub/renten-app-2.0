import { useState } from 'react';
import {
  versorgungsluecke, jePerson,
  type ProjektionsErgebnis, type Jahreszeile, type Szenario,
} from '@renten/engine';
import { euro, prozent, Schalter } from '../components/Feld';
import { KaufkraftSchalter } from '../components/KaufkraftSchalter';
import { geteilterFreibetrag, freibetragText } from './bav-freibetrag';
import { personNameAus } from './personen';

/**
 * Die drei Schichten. Farben aus der Palette der Oberflaeche: Indigo wie
 * Knoepfe und Logo, Gruen wie „gedeckt“, dazwischen ein helles Violett.
 * Vorher Blau, Lila und Gruen mit farbigen Ueberschriften je Block — der
 * Kassenbon sah aus wie aus einer anderen Anwendung.
 */
const SCHICHT = {
  1: { titel: 'Schicht 1', zusatz: 'Basis / Pension', punkt: 'bg-indigo-600' },
  2: { titel: 'Schicht 2', zusatz: 'Zusatz', punkt: 'bg-violet-400' },
  3: { titel: 'Schicht 3', zusatz: 'Privat', punkt: 'bg-emerald-500' },
} as const;

/** Die beiden Personen und der Haushalt — dieselbe Machart wie die Schichten. */
const PERSON_PUNKT = ['bg-sky-500', 'bg-amber-500', 'bg-slate-400'] as const;

/** Spalten, die am Telefon in die Zeile unter dem Namen wandern. */
const NEBEN = 'hidden px-2 text-right sm:table-cell';

/**
 * Eine Gruppe von Postenzeilen — je Schicht oder je Person. Kopfzeile mit
 * Farbpunkt und Zwischensumme, darunter die Posten. Keine Karten in Karten:
 * Brutto, Abzuege und Netto stehen in Spalten, damit man sie vergleichen kann.
 */
function Gruppe({
  titel, zusatz, punkt, netto, posten, w, leerText,
}: {
  titel: string;
  zusatz?: string;
  punkt: string;
  netto: number;
  posten: Jahreszeile['posten'];
  w: (n: number) => string;
  /** Was dastehen soll, wenn die Gruppe keine Zeile ueber null enthaelt. */
  leerText?: string;
}) {
  return (
    <tbody className="break-inside-avoid">
      <tr className="border-t border-slate-200">
        {/* Keine colSpan ueber die Nebenspalten: Am Telefon sind die
            ausgeblendet, und eine Zelle ueber vier Spalten legte dort
            Phantomspalten an — Netto rutschte in die Mitte. */}
        <th scope="rowgroup" className="pb-1 pt-3 text-left font-bold text-slate-900">
          <span className="flex items-center gap-2">
            <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${punkt}`} />
            {titel}
            {zusatz && <span className="font-normal text-slate-500">{zusatz}</span>}
          </span>
        </th>
        <td colSpan={3} className="hidden sm:table-cell" />
        <td className="pb-1 pt-3 text-right font-bold tabular-nums text-slate-900">{w(netto)}</td>
      </tr>
      {posten.length === 0 && leerText && (
        <tr>
          <td className="pb-2 pl-[1.125rem] text-xs text-slate-500">{leerText}</td>
          <td colSpan={3} className="hidden sm:table-cell" />
          <td />
        </tr>
      )}
      {posten.map((p) => (
        <tr key={p.id} className="align-top text-slate-700">
          <td className="py-1 pl-[1.125rem] pr-2">
            {p.bezeichnung}
            {/* Am Telefon fehlen die Spalten — die Zahlen stehen dann hier. */}
            <span className="block text-xs tabular-nums text-slate-500 sm:hidden">
              Brutto {w(p.bruttoJahr)} · KV/PV {w(p.kvPvJahr)} · Steuer {w(p.steuerJahr)}
            </span>
          </td>
          <td className={`${NEBEN} py-1 tabular-nums text-slate-600`}>{w(p.bruttoJahr)}</td>
          <td className={`${NEBEN} py-1 tabular-nums text-slate-500`}>{w(p.kvPvJahr)}</td>
          <td className={`${NEBEN} py-1 tabular-nums text-slate-500`}>{w(p.steuerJahr)}</td>
          <td className="py-1 pl-2 text-right tabular-nums text-slate-900">{w(p.nettoJahr)}</td>
        </tr>
      ))}
    </tbody>
  );
}

/**
 * Die Zeile kommt von aussen, damit Kassenbon, Steuer-Engine und Fussleiste
 * garantiert dieselbe zeigen — und damit bei fehlender Zeitachse dieselbe
 * Nullzeile greift, statt dass hier eine abweichende Ersatzkarte erscheint.
 */
export function Kassenbon({
  ergebnis, zeile, szenario, kaufkraftHeute, onKaufkraftHeute, person,
}: {
  ergebnis: ProjektionsErgebnis;
  zeile: Jahreszeile;
  szenario: Szenario;
  kaufkraftHeute: boolean;
  /** Mit Umschalter „Nominal | Kaufkraft heute“ im Kopf der Tabelle */
  onKaufkraftHeute?: (b: boolean) => void;
  /**
   * Gesetzt in der Einzelbetrachtung: der Name der Person, um die es geht.
   *
   * Das Szenario selbst weiss davon nichts — es ist zusammengestrichen und
   * sieht aus wie das eines Alleinstehenden. Ohne diese Angabe stuende ueber
   * einer Einzelrechnung weiter "Ihr Haushalts-Netto".
   */
  person?: string;
}) {
  const f = kaufkraftHeute ? 1 / zeile.kaufkraftfaktor : 1;
  const w = (n: number) => euro((n / 12) * f);

  /**
   * Abzinsung fuer ein BELIEBIGES Jahr.
   *
   * Die Einmalzahlungen fallen in ihrem eigenen Jahr an, nicht im
   * Ruhestandsjahr. Sie standen bisher immer nominal da — auch bei
   * eingeschaltetem Kaufkraft-Schalter, also nominale Betraege mitten
   * zwischen abgezinsten.
   */
  const kaufkraft = (jahr: number) => {
    if (!kaufkraftHeute) return 1;
    const z = ergebnis.zeilen.find((x) => x.jahr === jahr);
    return z ? 1 / z.kaufkraftfaktor : f;
  };

  const nachSchicht = ([1, 2, 3] as const).map((sch) => ({
    schicht: sch,
    posten: zeile.posten.filter((p) => p.schicht === sch && p.nettoJahr !== 0),
    netto: zeile.posten.filter((p) => p.schicht === sch).reduce((s, p) => s + p.nettoJahr, 0),
  }));

  /*
    Die zweite Sicht auf dieselben Posten: nach Person statt nach Schicht.

    Nur bei Ehepaaren — allein steht ohnehin alles bei einer Person, und ein
    Schalter, der nichts umschaltet, ist Rauschen. Er bleibt bewusst im
    Zustand der Ansicht und wandert NICHT ins Szenario: Zod entfernt
    unbekannte Schluessel still, ein dort abgelegter Ansichtsschalter ginge
    beim naechsten Laden verloren.
  */
  const [jePersonAnsicht, setJePersonAnsicht] = useState(false);
  const paar = szenario.haushalt.verheiratet && szenario.personen.length > 1;
  const nachPerson = jePerson(zeile).map((b) => ({
    ...b,
    titel: b.person === null ? 'Haushalt' : personNameAus(szenario.personen, b.person),
    punkt: PERSON_PUNKT[b.person === 'A' ? 0 : b.person === 'B' ? 1 : 2],
    sichtbar: b.posten.filter((p) => p.nettoJahr !== 0),
  }));
  const getrennt = paar && jePersonAnsicht;

  const luecke = versorgungsluecke(zeile);
  // Mehrere Betriebsrenten bei einer Person: Der Freibetrag gilt fuer ihre
  // Summe. Ohne diesen Hinweis wirken die Abzuege wie ein Rechenfehler, weil
  // jeder Vertrag fuer sich unter der Grenze liegt.
  const geteilt = geteilterFreibetrag(szenario, zeile.jahr);
  const skala = Math.max(zeile.zielNettoMonat, zeile.nettoMonat, 1);
  const anteil = (n: number) => `${Math.max(0, (n / 12 / skala) * 100)}%`;

  const deckung = Math.round(Math.min(1, zeile.nettoMonat / Math.max(1, zeile.zielNettoMonat)) * 100);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm druckbereich sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-bold text-slate-900">
          {person ? `Netto von ${person} im Jahr ${zeile.jahr}` : `Ihr Haushalts-Netto im Jahr ${zeile.jahr}`}
        </h2>
        {onKaufkraftHeute ? (
          <KaufkraftSchalter wert={kaufkraftHeute} onChange={onKaufkraftHeute} klasse="print:hidden" />
        ) : (
          <span className="text-xs text-slate-500">
            Monatsbeträge, {kaufkraftHeute ? 'in heutiger Kaufkraft' : 'nominal'}
          </span>
        )}
      </div>

      {/*
        Wie viel des Ziels gedeckt ist — gestapelt nach Schicht. Gleiche
        Machart wie in der Schnellrechnung: Satz, schmaler Balken, Legende.
      */}
      <div className="mt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm text-slate-700">
          <span>
            {luecke > 0
              ? <>Das Netto deckt <strong className="tabular-nums">{deckung} %</strong> des Ziels</>
              : <strong className="text-emerald-700">Ziel erreicht</strong>}
          </span>
          {luecke > 0 && (
            <span className="text-rose-700">es fehlen <strong className="tabular-nums">{100 - deckung} %</strong></span>
          )}
        </div>
        <div className={`mt-1.5 flex h-2 w-full overflow-hidden rounded-full ${luecke > 0 ? 'bg-rose-100' : 'bg-slate-100'}`}>
          {nachSchicht.map(({ schicht, netto }) =>
            netto <= 0 ? null : (
              <div
                key={schicht}
                style={{ width: anteil(netto) }}
                className={`${SCHICHT[schicht].punkt} transition-all duration-500`}
              />
            ),
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
          {nachSchicht.map(({ schicht }) => (
            <span key={schicht} className="flex items-center gap-1.5">
              <span aria-hidden className={`h-2 w-2 rounded-full ${SCHICHT[schicht].punkt}`} />
              {SCHICHT[schicht].titel}
            </span>
          ))}
          {luecke > 0 && (
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="h-2 w-2 rounded-full bg-rose-100 ring-1 ring-rose-200" />
              Lücke
            </span>
          )}
        </div>
      </div>

      {/*
        Nur bei Ehepaaren. Der Balken darueber bleibt schichtfarbig: er
        beantwortet die Frage "Ziel erreicht?", und die ist eine des
        Haushalts, nicht einer Person.
      */}
      {paar && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 print:hidden">
          <Schalter
            label="Je Person aufschlüsseln"
            wert={jePersonAnsicht}
            onChange={setJePersonAnsicht}
          />
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            {jePersonAnsicht
              ? 'Dieselben Zahlen, nach Inhaber sortiert statt nach Schicht.'
              : 'Zeigt getrennt, womit jeder von Ihnen beiden dasteht.'}
          </p>
        </div>
      )}

      <table className="mt-4 w-full border-collapse text-sm">
        <caption className="sr-only">Einkünfte im Monat, nach {getrennt ? 'Person' : 'Schicht'}</caption>
        <thead>
          <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <th scope="col" className="pb-2 text-left font-semibold">Posten</th>
            <th scope="col" className={`${NEBEN} pb-2 font-semibold`}>Brutto</th>
            <th scope="col" className={`${NEBEN} pb-2 font-semibold`}>KV/PV</th>
            <th scope="col" className={`${NEBEN} pb-2 font-semibold`}>Steuer</th>
            <th scope="col" className="pb-2 pl-2 text-right font-semibold">Netto</th>
          </tr>
        </thead>
        {getrennt
          /*
            Hier wird die Gruppe AUCH gezeigt, wenn keine Zeile ueber null
            liegt — anders als bei den Schichten. Wer gerade auf "je Person"
            umgeschaltet hat, sucht genau diese Person; verschwindet sie
            stillschweigend, bleibt die Frage offen, die er gestellt hat.
          */
          ? nachPerson.map((b) => (
            <Gruppe
              key={b.person ?? 'haushalt'}
              titel={b.titel}
              punkt={b.punkt}
              netto={b.nettoJahr}
              posten={b.sichtbar}
              w={w}
              leerText="Keine eigenen Einkünfte in diesem Jahr."
            />
          ))
          : nachSchicht.map(({ schicht, posten, netto }) =>
            posten.length === 0 ? null : (
              <Gruppe
                key={schicht}
                titel={SCHICHT[schicht].titel}
                zusatz={SCHICHT[schicht].zusatz}
                punkt={SCHICHT[schicht].punkt}
                netto={netto}
                posten={posten}
                w={w}
              />
            ),
          )}
        <tfoot>
          <tr className="border-t-2 border-slate-900 text-slate-900">
            <th scope="row" className="pt-3 text-left text-base font-black">Gesamt-Netto</th>
            <td className={`${NEBEN} pt-3 tabular-nums text-slate-600`}>{w(zeile.bruttoGesamt)}</td>
            <td className={`${NEBEN} pt-3 tabular-nums text-slate-500`}>{w(zeile.kvPvGesamt)}</td>
            <td className={`${NEBEN} pt-3 tabular-nums text-slate-500`}>{w(zeile.steuerGesamt)}</td>
            <td className="pl-2 pt-3 text-right text-lg font-black tabular-nums">{w(zeile.nettoGesamt)}</td>
          </tr>
        </tfoot>
      </table>

      <div className="mt-4 space-y-2 empty:hidden">
        {/*
          Der Satz, ohne den die Aufteilung mehr verspricht, als sie haelt.
          Er steht nur in der getrennten Ansicht — dort, wo die Zahl steht,
          die er einordnet.
        */}
        {getrennt && (
          <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
            <strong>Die Steuer je Person ist ein Anteil, keine eigene Rechnung.</strong>{' '}
            Verheiratete werden zusammen veranlagt; die gemeinsame Steuer wird hier nach dem
            Beitrag zum zu versteuernden Einkommen aufgeteilt. Allein veranlagt zahlte jeder
            von beiden mehr — der Splittingvorteil entsteht nur gemeinsam und gehört beiden.
            {nachPerson.some((b) => b.person === null) && (
              <> Was keiner Person zuzuordnen ist, steht unter <strong>Haushalt</strong>.</>
            )}
          </p>
        )}

        {/*
          Der Satz zur Einzelbetrachtung. Er steht hier und nicht oben beim
          Umschalter, weil er die Zahlen einordnet, die daneben stehen — und
          weil die beiden Naeherungen sonst nirgends benannt waeren.
        */}
        {person && (
          <p className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-[11px] leading-relaxed text-sky-900">
            <strong>Allein gerechnet, nicht anteilig.</strong> Hier stehen nur die eigenen
            Verträge und Einkünfte von {person} — mit dem <strong>Grundtarif</strong> statt des
            Splittings, mit einfachen Pauschbeträgen, und ohne die beitragsfreie Mitversicherung
            des § 10 SGB V: Wer wenig eigene Rente hat, zahlt allein den Mindestbeitrag.
            {szenario.haushalt.pkv.praemieMonat > 0 && (
              <> Die private Krankenversicherung ist im Szenario ein Haushaltsbeitrag; hier
                zählt die <strong>Hälfte</strong>.</>
            )}
            {' '}Ein Startkapital des Entnahmeplans bleibt außen vor — es gehört beiden.
            {' '}Gemessen wird an dem Zielnetto, das oben für {person} eingetragen ist.
          </p>
        )}

        {geteilt && (
          <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
            <strong>Mehrere Betriebsrenten zählen zusammen.</strong> Der Freibetrag von{' '}
            <strong>{freibetragText(geteilt.betragMonat)}</strong> im Monat steht{' '}
            {geteilt.personen.length > 1 ? 'jeder Person' : geteilt.personen[0]} nur{' '}
            <strong>einmal</strong> zu und gilt für die Summe aller Bezüge (§ 226 Abs. 2 SGB V).
            Deshalb fallen Beiträge an, obwohl jeder Vertrag für sich darunter liegt. In der
            Pflegeversicherung ist es sogar eine Freigrenze: oberhalb trägt die volle Summe.
          </p>
        )}

      </div>

      {/*
        Einmalzahlungen stehen BEWUSST ausserhalb der Monatsrechnung. Sie in
        das Monatsnetto zu mischen liesse die Zahl im Rentenjahr sinnlos nach
        oben springen.
      */}
      {ergebnis.kapitalauszahlungen.length > 0 && (
        <div className="mt-5 rounded-lg border border-indigo-100 bg-indigo-50/50 p-3 sm:mt-6 sm:p-4">
          <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-indigo-900 sm:text-xs">
            Einmalige Kapitalauszahlungen
          </h3>
          <div className="space-y-2">
            {ergebnis.kapitalauszahlungen.map((a) => (
              <div key={a.vertragId} className="rounded-md bg-white px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[11px] font-semibold text-indigo-900 sm:text-sm">
                    {a.bezeichnung} <span className="font-normal text-slate-500">({a.jahr})</span>
                  </span>
                  <span className="whitespace-nowrap text-[11px] font-bold tabular-nums text-slate-800 sm:text-base">
                    {euro(a.nettoKapital * kaufkraft(a.jahr))}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap justify-between gap-x-3 text-[11px] text-slate-500">
                  <span>Brutto: {euro(a.bruttoKapital * kaufkraft(a.jahr))}</span>
                  {/*
                    NICHT "Abgeltungsteuer": beim Depot stimmt das, bei einer
                    bAV-Kapitalleistung faellt die tarifliche Einkommensteuer
                    an (§ 22 Nr. 5 EStG), bei der privaten Kapitalwahl je nach
                    Laufzeit das eine oder das andere.
                  */}
                  <span className="text-rose-500">
                    Steuer: {euro(a.steuer * kaufkraft(a.jahr))}
                  </span>
                </div>
                {/*
                  Beitraege stehen NEBEN der Steuer, nicht in der
                  Monatsrechnung: Die Kasse zieht sie beim Zufluss ab. Die
                  Verteilung der Bemessung auf 120 Monate (§ 229 SGB V) ist
                  eine Rechengroesse, kein Zahlungsweg.
                */}
                {a.kvPvGesamt > 0 && (
                  <div className="mt-0.5 text-right text-[11px] text-rose-500">
                    Kranken- und Pflegeversicherung: {euro(a.kvPvGesamt * kaufkraft(a.jahr))}
                  </div>
                )}
                {/*
                  Laeuft der Vertrag VOR dem Ruhestand ab, ist der Betrag von
                  damals nicht der, der zum Rentenbeginn da ist. Beide Zahlen
                  stehen nebeneinander — sonst fragt man sich, wo die Jahre
                  dazwischen geblieben sind.
                */}
                {a.wachstumJahre > 0 && (
                  <div className="mt-1 border-t border-indigo-100 pt-1 text-[11px] leading-relaxed text-indigo-900">
                    Bis zum Rentenbeginn in {a.wachstumJahre} Jahren daraus:{' '}
                    <strong>{euro(a.wertBeiRentenbeginn * kaufkraft(a.jahr + a.wachstumJahre))}</strong>
                    {a.steuerWachstum > 0 && (
                      <span className="text-slate-500">
                        {' '}(nach {euro(a.steuerWachstum * kaufkraft(a.jahr + a.wachstumJahre))} Abgeltungsteuer)
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
            Einmalbeträge — im monatlichen Netto oben sind sie <strong>nicht</strong> enthalten.
          </p>
        </div>
      )}
    </div>
  );
}
