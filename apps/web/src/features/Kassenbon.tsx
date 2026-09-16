import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  versorgungsluecke, jePerson,
  type ProjektionsErgebnis, type Jahreszeile, type Szenario,
} from '@renten/engine';
import { euro, prozent, Schalter } from '../components/Feld';
import { geteilterFreibetrag, freibetragText } from './bav-freibetrag';
import { personNameAus } from './personen';

/** Farbgebung der drei Schichten, wie im urspruenglichen Entwurf. */
const SCHICHT = {
  1: { titel: 'Schicht 1 (Basis / Pension)', rahmen: 'border-blue-100', text: 'text-blue-900', balken: 'bg-blue-500', punkt: 'bg-blue-500' },
  2: { titel: 'Schicht 2 (Zusatz)', rahmen: 'border-purple-100', text: 'text-purple-900', balken: 'bg-purple-500', punkt: 'bg-purple-500' },
  3: { titel: 'Schicht 3 (Privat)', rahmen: 'border-emerald-100', text: 'text-emerald-900', balken: 'bg-emerald-500', punkt: 'bg-emerald-500' },
} as const;

/** Die beiden Personen und der Haushalt — dieselbe Machart wie die Schichten. */
const PERSON_FARBE = [
  { rahmen: 'border-sky-100', text: 'text-sky-900' },
  { rahmen: 'border-amber-100', text: 'text-amber-900' },
  { rahmen: 'border-slate-200', text: 'text-slate-700' },
] as const;

/**
 * Ein aufklappbarer Block mit Postenzeilen.
 *
 * Titel und Farbe kommen von aussen, seit es ihn zweimal gibt: einmal je
 * Schicht und einmal je Person. Klappmechanik, Kaufkraftformatierung und
 * Zeilenlayout bleiben dabei EINE Sache.
 */
function PostenBlock({
  titel, farbe, netto, kinder, w, leerText,
}: {
  titel: string;
  farbe: { rahmen: string; text: string };
  netto: number;
  kinder: Jahreszeile['posten'];
  w: (n: number) => string;
  /** Was dastehen soll, wenn der Block keine Zeile ueber null enthaelt. */
  leerText?: string;
}) {
  const [offen, setOffen] = useState(true);
  const f = farbe;

  return (
    <div className={`overflow-hidden rounded-lg border ${f.rahmen} print:border-slate-300`}>
      <button
        type="button"
        onClick={() => setOffen((v) => !v)}
        aria-expanded={offen}
        className="druck-kopf flex w-full items-center justify-between gap-3 border-b border-slate-50 bg-white p-2.5 text-left sm:p-4"
      >
        <span className={`text-[11px] font-bold sm:text-base ${f.text}`}>{titel}</span>
        <span className="flex items-center gap-2">
          <span className="text-[11px] font-bold tabular-nums sm:text-base">{w(netto)}</span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-slate-400 transition-transform print:hidden ${offen ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </span>
      </button>

      <div className={`space-y-2 bg-white p-2.5 text-xs sm:p-3 ${offen ? 'block' : 'hidden'} druck-inhalt`}>
        {kinder.length === 0 && leerText && (
          <p className="rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-[11px] leading-relaxed text-slate-500 sm:p-3">
            {leerText}
          </p>
        )}
        {kinder.map((p) => (
          <div key={p.id} className="rounded-lg border border-slate-100 bg-slate-50 p-2.5 sm:p-3">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className={`truncate text-[11px] font-semibold sm:text-sm ${f.text}`}>
                {p.bezeichnung}
              </span>
              <span className="whitespace-nowrap text-[11px] font-bold tabular-nums text-slate-800 sm:text-base">
                {w(p.nettoJahr)}
              </span>
            </div>
            <div className="flex flex-col gap-1 text-[11px] text-slate-500 sm:flex-row sm:items-end sm:justify-between sm:gap-0 sm:text-[10px]">
              <span>Brutto: {w(p.bruttoJahr)}</span>
              <span className="leading-tight text-rose-500 sm:text-right">
                KV/PV: {w(p.kvPvJahr)} | Steuer: {w(p.steuerJahr)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Die Zeile kommt von aussen, damit Kassenbon, Steuer-Engine und Fussleiste
 * garantiert dieselbe zeigen — und damit bei fehlender Zeitachse dieselbe
 * Nullzeile greift, statt dass hier eine abweichende Ersatzkarte erscheint.
 */
export function Kassenbon({
  ergebnis, zeile, szenario, kaufkraftHeute, person,
}: {
  ergebnis: ProjektionsErgebnis;
  zeile: Jahreszeile;
  szenario: Szenario;
  kaufkraftHeute: boolean;
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
    farbe: PERSON_FARBE[b.person === 'A' ? 0 : b.person === 'B' ? 1 : 2],
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

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm druckbereich sm:p-6">
      <h2 className="mb-3 text-xs font-bold sm:mb-4 sm:text-sm">
        {person ? `Netto von ${person} im Jahr ${zeile.jahr}` : `Ihr Haushalts-Netto im Jahr ${zeile.jahr}`}
        <span className="ml-2 font-normal text-slate-500">
          {kaufkraftHeute ? '(Kaufkraft heute)' : '(nominal)'}
        </span>
      </h2>

      {/* Gestapelter Fortschrittsbalken */}
      <div className="mb-5 sm:mb-6">
        <div className="mb-1 flex justify-between text-[11px] font-bold uppercase text-slate-500 sm:text-[10px]">
          <span>Ziel-Erreichung</span>
          <span>
            {luecke > 0
              ? `${prozent(zeile.nettoMonat / Math.max(1, zeile.zielNettoMonat), 1)} erreicht`
              : 'Ziel erreicht / übertroffen'}
          </span>
        </div>
        <div className="flex h-3 w-full overflow-hidden rounded-full border border-slate-200 bg-slate-100 shadow-inner sm:h-4">
          {nachSchicht.map(({ schicht, netto }) =>
            netto <= 0 ? null : (
              <div
                key={schicht}
                style={{ width: anteil(netto) }}
                className={`${SCHICHT[schicht].balken} transition-all duration-500`}
              />
            ),
          )}
          {luecke > 0 && (
            <div style={{ width: `${(luecke / skala) * 100}%` }} className="bg-white transition-all duration-500" />
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] font-semibold text-slate-500 sm:mt-2 sm:gap-3 sm:text-[9px]">
          {nachSchicht.map(({ schicht }) => (
            <span key={schicht} className="flex items-center gap-1">
              <span className={`h-1.5 w-1.5 rounded-full sm:h-2 sm:w-2 ${SCHICHT[schicht].punkt}`} />
              Schicht {schicht}
            </span>
          ))}
          {luecke > 0 && (
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full border border-slate-300 bg-white sm:h-2 sm:w-2" />
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
        <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 print:hidden">
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

      <div className="space-y-2 sm:space-y-3">
        {getrennt
          /*
            Hier wird der Block AUCH gezeigt, wenn keine Zeile ueber null
            liegt — anders als bei den Schichten. Wer gerade auf "je Person"
            umgeschaltet hat, sucht genau diese Person; verschwindet sie
            stillschweigend, bleibt die Frage offen, die er gestellt hat.
          */
          ? nachPerson.map((b) => (
            <PostenBlock
              key={b.person ?? 'haushalt'}
              titel={b.titel}
              farbe={b.farbe}
              netto={b.nettoJahr}
              kinder={b.sichtbar}
              w={w}
              leerText="Keine eigenen Einkünfte in diesem Jahr."
            />
          ))
          : nachSchicht.map(({ schicht, posten, netto }) =>
            posten.length === 0 ? null : (
              <PostenBlock
                key={schicht}
                titel={SCHICHT[schicht].titel}
                farbe={SCHICHT[schicht]}
                netto={netto}
                kinder={posten}
                w={w}
              />
            ),
          )}

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

        <div className="flex items-baseline justify-between rounded-lg bg-slate-900 px-4 py-3 text-white">
          <span className="font-bold">Gesamt-Netto</span>
          <span className="text-xl font-bold tabular-nums">{w(zeile.nettoGesamt)}</span>
        </div>
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
                <div className="mt-0.5 flex flex-wrap justify-between gap-x-3 text-[11px] text-slate-500 sm:text-[10px]">
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
                  <div className="mt-0.5 text-right text-[11px] text-rose-500 sm:text-[10px]">
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
                  <div className="mt-1 border-t border-indigo-100 pt-1 text-[11px] leading-relaxed text-indigo-900 sm:text-[10px]">
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
          <p className="mt-2 text-[10px] leading-relaxed text-slate-600">
            Einmalbeträge — im monatlichen Netto oben sind sie <strong>nicht</strong> enthalten.
          </p>
        </div>
      )}
    </div>
  );
}
