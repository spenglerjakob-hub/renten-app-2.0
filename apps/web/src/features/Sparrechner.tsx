import { useEffect, useMemo, useState } from 'react';
import type { Jahreszeile } from '@renten/engine';
import { useSzenario } from '../store/szenario';
import { ZahlFeld, ProzentFeld, euro, prozent } from '../components/Feld';
import { useSchmal } from '../components/useSchmal';
import { anteilAmNetto } from './bezug';
import { Hervor, Karte, Kernsatz, SCHWEBEND } from '../components/stil';
import {
  sparzielRechnen, SPARZIEL_VORGABE, type SparzielEingaben,
} from './sparziel-berechnung';

/**
 * Der Sparrechner: die Versorgungsluecke rueckwaerts.
 *
 * Der Rechner sagt bis hierher nur, DASS eine Luecke besteht. Die Frage, die
 * jeder Kunde danach stellt, ist eine andere: was muss ich monatlich
 * zuruecklegen, damit sie sich schliesst? Genau das steht hier — mit
 * Beitragsdynamik, weil ein Vertrag mit 3 % Steigerung heute deutlich
 * weniger kostet als einer ohne.
 */
export function Sparrechner({ zeile, onStartbeitrag, nettoHeute = 0 }: {
  zeile: Jahreszeile;
  /** Das heutige Haushaltsnetto im Monat — die Bezugsgroesse fuer den Startbeitrag */
  nettoHeute?: number;
  /** Meldet den noetigen Startbeitrag — der Titel der Etappe nennt ihn, die Loesungen koennen ihn uebernehmen */
  onStartbeitrag?: (n: number | null) => void;
}) {
  const szenario = useSzenario((x) => x.szenario);
  const schmal = useSchmal();
  const [eingaben, setEingaben] = useState<SparzielEingaben>(SPARZIEL_VORGABE);

  const r = useMemo(
    () => sparzielRechnen(szenario, zeile, eingaben),
    [szenario, zeile, eingaben],
  );

  const startbeitrag = r?.gewaehlt.startbeitrag ?? null;
  useEffect(() => { onStartbeitrag?.(startbeitrag); }, [startbeitrag, onStartbeitrag]);

  const setze = (teil: Partial<SparzielEingaben>) =>
    setEingaben((x) => ({ ...x, ...teil }));

  if (r === null) {
    return (
      <Karte>
        <p className="text-sm text-ui-schiefer">
          Für das Jahr {zeile.jahr} besteht keine Lücke — es gibt nichts zu schließen.
        </p>
      </Karte>
    );
  }
  const anteil = anteilAmNetto(r.gewaehlt.startbeitrag, nettoHeute);
  const gewaehlt = (dynamik: number) => Math.abs(dynamik - eingaben.dynamik) < 1e-9;

  /*
    WIE EIN SCHRITT DER BERATUNG: links die Annahmen, rechts die Rechnung
    als das eine schwebende Stueck — Luecke, Kapital, Startbeitrag —,
    darunter die Tabellen in ruhigen Karten und der Kernsatz, was Warten
    kostet.
  */
  return (
    <div className="grid grid-cols-1 gap-5 sm:gap-6 lg:grid-cols-12">
      <Karte titel="Annahmen" klasse="self-start lg:col-span-4">
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
          <ProzentFeld
            label="Rendite p. a. (nach Kosten)"
            wert={eingaben.rendite}
            onChange={(n) => setze({ rendite: n })}
            max={15}
          />
          <ProzentFeld
            label="Beitragsdynamik p. a."
            wert={eingaben.dynamik}
            onChange={(n) => setze({ dynamik: n })}
            max={15}
            hilfe="Um wie viel der Beitrag jedes Jahr steigt."
          />
          <ZahlFeld
            label="Auszahldauer"
            wert={eingaben.auszahldauer}
            onChange={(n) => setze({ auszahldauer: n })}
            min={1} max={60} einheit="Jahre"
            hilfe="Über wie viele Jahre das Kapital reichen soll."
          />
        </div>
        <p className="mt-6 border-t border-ui-linie pt-5 text-xs leading-relaxed text-ui-schiefer [&_strong]:font-medium [&_strong]:text-ui-tinte">
          Bei <strong>{prozent(eingaben.rendite)}</strong> Rendite nach Kosten und{' '}
          <strong>{prozent(eingaben.dynamik)}</strong> Beitragsdynamik beginnen Sie mit{' '}
          <strong>{euro(r.gewaehlt.startbeitrag)}</strong> und zahlen im letzten Sparjahr{' '}
          <strong>{euro(r.gewaehlt.endbeitrag)}</strong>. Die Rechnung unterstellt, dass die
          Entnahme später mit {prozent(szenario.annahmen.inflation)} Inflation mitwächst, und
          zieht die Abgeltungsteuer auf den Ertragsanteil bereits ab. Sie nennt eine
          Größenordnung, kein Produkt.
        </p>
      </Karte>

      <div className="flex flex-col gap-5 sm:gap-6 lg:col-span-8">
        <section aria-label="Was die Lücke kostet" className={`${SCHWEBEND} p-5 sm:p-7`}>
          <dl className="grid gap-5 sm:grid-cols-3">
            <Kachel
              titel={`Lücke im Jahr ${zeile.jahr}`}
              wert={euro(r.luecke)}
              hinweis={`in heutigem Geld ${euro(r.lueckeHeute)}`}
            />
            <Kachel
              titel="Dafür nötiges Kapital"
              wert={euro(r.zielkapital)}
              hinweis={`bei Rentenbeginn, für ${eingaben.auszahldauer} Jahre`}
            />
            <Kachel
              titel="Ihr Startbeitrag"
              wert={euro(r.gewaehlt.startbeitrag)}
              hinweis={`im Monat, ${r.jahreBisRente} Jahre lang`}
            />
          </dl>
          {/* Der Beitrag im Verhaeltnis — was er fuer den Haushalt bedeutet. */}
          {anteil && (
            <p className="mt-5 border-t border-ui-linie pt-4 text-sm leading-relaxed text-ui-schiefer">
              Der Startbeitrag von {euro(r.gewaehlt.startbeitrag)} sind{' '}
              <strong className="font-medium text-ui-tinte">{anteil}</strong> Ihres
              heutigen Haushaltsnettos von {euro(nettoHeute)} im Monat.
            </p>
          )}
        </section>

        {/*
          Die Dynamik ist der eigentliche Punkt: sie senkt den Einstieg
          und hebt das Ende. Eine Tabelle zeigt das in einem Blick, ein
          einzelner Wert nicht.
        */}
        <Karte titel="Mit Beitragsdynamik">
          {schmal ? (
            <div className="space-y-2">
              {r.varianten.map((v) => (
                <Karteikarte
                  key={v.dynamik}
                  titel={v.dynamik === 0 ? 'Gleichbleibender Beitrag' : `${prozent(v.dynamik)} Beitragsdynamik`}
                  hervor={gewaehlt(v.dynamik)}
                  zeilen={[
                    ['Start heute', euro(v.startbeitrag)],
                    ['Im letzten Sparjahr', euro(v.endbeitrag)],
                    ['Summe aller Beiträge', euro(v.summeBeitraege)],
                  ]}
                />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-ui-linie text-left text-xs text-ui-schiefer">
                    <th className="py-2 pr-3 font-medium">Beitragsdynamik</th>
                    <th className="py-2 pr-3 text-right font-medium">Start heute</th>
                    <th className="py-2 pr-3 text-right font-medium">Im letzten Jahr</th>
                    <th className="py-2 text-right font-medium">Summe aller Beiträge</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Die gewaehlte Zeile in der Innenflaeche — hervorgehoben durch Flaeche und Gewicht, nicht durch Farbe. */}
                  {r.varianten.map((v) => (
                    <tr key={v.dynamik} className={`border-b border-ui-linie ${gewaehlt(v.dynamik) ? 'bg-ui-innen font-medium' : ''}`}>
                      <td className="py-2 pr-3 text-ui-tinte">{prozent(v.dynamik)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-ui-tinte">{euro(v.startbeitrag)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-ui-schiefer">{euro(v.endbeitrag)}</td>
                      <td className="py-2 text-right tabular-nums text-ui-schiefer">{euro(v.summeBeitraege)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Karte>

        {/*
          Was Warten kostet — dieselbe Rechnung, nur mit spaeterem
          Beginn. Die Zeile "heute" bleibt als Bezugspunkt stehen.
        */}
        {r.aufschub.length > 1 && (
          <Karte titel="Was es kostet, damit zu warten">
            {schmal ? (
              <div className="space-y-2">
                {r.aufschub.map((a) => (
                  <Karteikarte
                    key={a.wartenJahre}
                    titel={
                      a.wartenJahre === 0
                        ? `Heute beginnen · ${a.sparjahre} Sparjahre`
                        : `In ${a.wartenJahre} Jahren · ${a.sparjahre} Sparjahre`
                    }
                    hervor={a.wartenJahre === 0}
                    zeilen={[
                      ['Startbeitrag', euro(a.startbeitrag)],
                      ['Summe aller Beiträge', euro(a.summeBeitraege)],
                      ['Mehr als heute', a.wartenJahre === 0 ? '—' : `+ ${euro(a.mehrGesamt)}`],
                    ]}
                  />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-ui-linie text-left text-xs text-ui-schiefer">
                      <th className="py-2 pr-3 font-medium">Beginn</th>
                      <th className="py-2 pr-3 text-right font-medium">Sparjahre</th>
                      <th className="py-2 pr-3 text-right font-medium">Startbeitrag</th>
                      <th className="py-2 pr-3 text-right font-medium">Summe</th>
                      <th className="py-2 text-right font-medium">Mehr als heute</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.aufschub.map((a) => (
                      <tr key={a.wartenJahre} className={`border-b border-ui-linie ${a.wartenJahre === 0 ? 'bg-ui-innen font-medium' : ''}`}>
                        <td className="py-2 pr-3 text-ui-tinte">{a.wartenJahre === 0 ? 'heute' : `in ${a.wartenJahre} Jahren`}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-ui-schiefer">{a.sparjahre}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-ui-tinte">{euro(a.startbeitrag)}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-ui-schiefer">{euro(a.summeBeitraege)}</td>
                        <td className="py-2 text-right tabular-nums text-ui-tinte">
                          {a.wartenJahre === 0 ? <span className="text-ui-schiefer">—</span> : `+ ${euro(a.mehrGesamt)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {/*
              DIE Aussage des ganzen Rechners — der Kernsatz der Etappe, in
              Inter Tight wie in der Beratung. Sachlich gesetzt, nicht in
              Warnrot: Die Zahl ist echt und gehoert ins Gespraech — draengen
              soll sie nicht.
            */}
            <Kernsatz klasse="mt-6">
              Ein Jahr später zu beginnen kostet <Hervor>{euro(r.proJahrWarten.mehrProMonat)}</Hervor> mehr im Monat
              — und {euro(r.proJahrWarten.mehrGesamt)} mehr Beiträge insgesamt.
            </Kernsatz>
            <p className="mt-3 text-xs leading-relaxed text-ui-schiefer">
              Obwohl dann über weniger Jahre gezahlt wird: Den späteren Beiträgen fehlen die
              Erträge der frühen Jahre. Gleiche Rendite und gleiches Ziel unterstellt.
            </p>
          </Karte>
        )}
      </div>
    </div>
  );
}

/**
 * Eine Tabellenzeile als Karte — fuer das Telefon.
 *
 * Fuenf Spalten auf 360 Punkten geben je siebzig, und "227.110 €" braucht
 * allein sechzig. Statt die Betraege umbrechen zu lassen, steht auf dem
 * Telefon jede Zeile untereinander: Beschriftung links, Betrag rechts. Der
 * Inhalt ist derselbe wie in der Tabelle, nur gedreht.
 */
function Karteikarte({ titel, zeilen, hervor }: {
  titel: string;
  zeilen: [string, string][];
  /** Die gewaehlte bzw. heutige Zeile — mit Rand in Tinte statt Farbe */
  hervor?: boolean;
}) {
  return (
    <div className={`rounded-[10px] border p-3 ${hervor ? 'border-ui-tinte bg-ui-karte' : 'border-ui-linie bg-ui-karte'}`}>
      <div className="text-sm font-medium text-ui-tinte">{titel}</div>
      <dl className="mt-1.5 space-y-0.5">
        {zeilen.map(([text, wert]) => (
          <div key={text} className="flex items-baseline justify-between gap-3">
            <dt className="text-xs text-ui-schiefer">{text}</dt>
            <dd className="text-sm font-medium tabular-nums text-ui-tinte">{wert}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Eine Zahl der Rechnung: leises Etikett, die Zahl gross, darunter die Einordnung — wie `Zahl` der Beratung. */
function Kachel({ titel, wert, hinweis }: { titel: string; wert: string; hinweis: string }) {
  return (
    <div>
      <dt className="text-sm text-ui-schiefer">{titel}</dt>
      <dd className="mt-0.5 text-[28px] font-medium leading-tight tabular-nums text-ui-tinte">{wert}</dd>
      <dd className="mt-1 text-xs leading-snug text-ui-schiefer">{hinweis}</dd>
    </div>
  );
}
