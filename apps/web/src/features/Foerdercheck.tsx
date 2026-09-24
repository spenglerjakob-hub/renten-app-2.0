import { useMemo } from 'react';
import { Gift } from 'lucide-react';
import { foerdercheck, type Jahreszeile } from '@renten/engine';
import { useSzenario } from '../store/szenario';
import { euro, euroGenau, InfoPunkt } from '../components/Feld';
import { foerderBasis } from './tuev-berechnung';

/**
 * FÖRDERCHECK — was an Förderung liegen bleibt.
 *
 * Der Vertrags-TÜV prüft, was da ist. Dieser Block prüft, was FEHLT: den
 * ungenutzten Rahmen der Entgeltumwandlung und den freien Höchstbetrag für
 * eine Basisrente. Beides steht im Gesetz und in den Angaben — es wurde nur
 * nie gegenübergestellt.
 *
 * ER STEHT UNTER DEM VERTRAGS-TÜV und nicht mehr in der Ergebnisspalte: Es
 * geht um Verträge und ihre Förderrahmen, und die laufenden Beiträge, gegen
 * die hier gerechnet wird, werden im TÜV erfasst. Der Hinweis „zu diesem
 * Vertrag ist kein Beitrag erfasst" findet sein Eingabefeld dadurch
 * unmittelbar über sich statt zwei Bildschirmlängen entfernt.
 *
 * Ohne Befund rendert der Block nichts. Ein Kasten, der „alles in Ordnung"
 * meldet, kostet Platz und sagt nichts.
 */
export function Foerdercheck({ zeile }: { zeile: Jahreszeile | null }) {
  const szenario = useSzenario((s) => s.szenario);

  const { befunde, ohneBeitrag } = useMemo(() => {
    const b = foerderBasis(szenario, zeile);
    return { befunde: foerdercheck(b.kontext, b.steuerOpt, b.p), ohneBeitrag: b.ohneBeitrag };
  }, [szenario, zeile]);

  if (befunde.length === 0) return null;

  return (
    <section aria-labelledby="foerdercheck-titel" className="mt-8 sm:mt-12 print:hidden">
      {/*
        Derselbe Kopf-Aufbau wie beim Vertrags-TÜV, eine Stufe kleiner: Der
        Block ist ein Teil dieses Bereichs, nicht ein zweiter daneben. Grün
        statt Bernstein, weil Bernstein hier für die Prüfung steht und Grün
        für die Förderung.
      */}
      <div className="mb-4 flex items-start gap-2 border-b-2 border-emerald-200 px-2 pb-3 sm:gap-3">
        <Gift className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 sm:h-6 sm:w-6" aria-hidden />
        <div>
          <h3 id="foerdercheck-titel" className="text-base font-bold text-emerald-800 sm:text-xl">
            Fördercheck
          </h3>
          <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-slate-600 sm:text-sm">
            Oben steht, was Ihre Verträge leisten. Hier steht, welche Förderung Sie heute nicht
            ausschöpfen — und was ein geförderter Beitrag Sie nach Steuern und Abgaben
            tatsächlich kostet.
          </p>
        </div>
      </div>

      {/*
        Zwei Spalten erst ab `lg`. Bei 640 Punkten blieben je Karte rund 300
        uebrig, und darin bricht der erklaerende Satz in sieben Zeilen um.
      */}
      <div className="grid gap-4 px-2 sm:gap-6 lg:grid-cols-2">
        {befunde.map((b) => (
          <article
            key={b.id}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
          >
            {/*
              `min-w-0` am Titel und `shrink-0` am Betrag: sonst schiebt ein
              langer Titel den Betrag in die naechste Zeile, und zwei Karten
              nebeneinander haben verschieden hohe Koepfe.
            */}
            {/*
              DER KOPF ZEIGT, WORAUF ES BEI DIESEM BEFUND ANKOMMT.

              Bei einer ZULAGE ist das die Jahressumme: Sie ist Geld vom
              Staat, eine feste Zahl, die man jemandem nennen kann — und sie
              stand bisher mitten im Fliesstext, waehrend oben der Rahmen
              prangte. Bei einer Steuerersparnis bleibt es beim Rahmen: Was
              sie wert ist, haengt an Einkommen und Familienstand und laesst
              sich nicht in eine Schlagzahl fassen.
            */}
            <header className="flex items-baseline justify-between gap-3 border-b border-slate-100 bg-emerald-50/70 px-3 py-2.5 sm:px-4 sm:py-3">
              <h4 className="min-w-0 text-xs font-bold text-slate-800 sm:text-sm">{b.titel}</h4>
              {b.foerderArt === 'zulage' ? (
                <span className="shrink-0 text-right">
                  <span className="block text-lg font-black leading-none tabular-nums text-emerald-700 sm:text-2xl">
                    {euro(b.ersparnisJahr)}
                  </span>
                  <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
                    Zulage im Jahr
                  </span>
                </span>
              ) : (
                <span className="shrink-0 text-xs font-black tabular-nums text-emerald-700 sm:text-sm">
                  {euro(b.rahmenMonat)} / Monat frei
                </span>
              )}
            </header>

            <div className="p-3 sm:p-4">
              {/*
                Bei der Zulage rueckt der Rahmen hierher — er ist die
                Voraussetzung („so viel muessten Sie einzahlen"), nicht das
                Ergebnis.
              */}
              {/*
                OBENDRAUF, nicht „davon". Hier stand „70 EUR davon traegt der
                Staat" — als zahle man selbst nur 80. Die Zulage kommt aber
                ZUSAETZLICH in den Vertrag; der eigene Beitrag bleibt, was er ist.
              */}
              {b.foerderArt === 'zulage' && (
                <p className="mb-2 text-[11px] font-semibold text-emerald-800 sm:text-xs">
                  {euro(b.rahmenMonat)} im Monat einzahlen — der Staat legt{' '}
                  {euro(b.ersparnisJahr / 12)} obendrauf.
                </p>
              )}

              <p className="text-[11px] leading-relaxed text-slate-600 sm:text-xs">{b.text}</p>

              {/* Die Einschraenkung steht kleiner darunter — im Ausdruck
                  entfaellt sie ganz, dort zaehlt der Befund. */}
              {b.hinweis && (
                <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500 sm:text-[11px]">
                  {b.hinweis}
                </p>
              )}

              {/*
                Die eine Zeile, auf die es ankommt. Der Rahmen sagt, was ginge;
                erst der Netto-Aufwand sagt, was es kostet — und das ist die
                Zahl, nach der jemand entscheidet.
              */}
              <p className="mt-2.5 rounded-lg bg-emerald-50 px-2.5 py-2 text-[11px] leading-relaxed text-emerald-900 sm:text-xs">
                {b.foerderArt === 'zulage' ? (
                  /*
                    Die Zulage SENKT den Beitrag nicht, sie VERGROESSERT das Depot.
                    Deshalb die Rechnung in diese Richtung: aus 150 werden 220.
                    Nur ein Steuervorteil, der ueber die Zulage hinausgeht, mindert
                    den eigenen Aufwand — und nur dann steht das auch da.
                  */
                  <>
                    Aus <strong>{euro(b.probeMonat)}</strong> Eigenbeitrag werden{' '}
                    <strong>{euro(b.zuflussMonat ?? b.probeMonat + b.ersparnisJahr / 12)}</strong>{' '}
                    im Depot: Der Staat legt <strong>{euro(b.ersparnisJahr / 12)}</strong> im
                    Monat obendrauf — {Math.round(b.foerderquote * 100)} % auf Ihren Beitrag.
                    {b.probeMonat - b.nettoAufwandMonat >= 0.5 && (
                      <>
                        {' '}Über die Zulage hinaus spart der Sonderausgabenabzug{' '}
                        {euro(b.probeMonat - b.nettoAufwandMonat)} Steuer im Monat; netto kostet
                        Sie der Beitrag dann <strong>{euro(b.nettoAufwandMonat)}</strong>.
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <strong>{euro(b.probeMonat)}</strong> im Monat kosten Sie nach Förderung nur{' '}
                    <strong>{euro(b.nettoAufwandMonat)}</strong> — der Staat trägt{' '}
                    {Math.round(b.foerderquote * 100)} % ({euro(b.ersparnisJahr / 12)} im Monat).
                    {/*
                      Der Pflichtzuschuss des Arbeitgebers kommt OBENDRAUF wie
                      eine Zulage — er gehoert in den Vertrag, nicht in den
                      Aufwand.
                    */}
                    {(b.agZuschussMonat ?? 0) >= 0.5 && (
                      <>
                        {' '}Dazu legt Ihr Arbeitgeber <strong>{euroGenau(b.agZuschussMonat!)}</strong>{' '}
                        obendrauf (§ 1a Abs. 1a BetrAVG) — im Vertrag landen{' '}
                        <strong>{euroGenau(b.zuflussMonat ?? b.probeMonat)}</strong>.
                      </>
                    )}
                  </>
                )}
                <InfoPunkt titel="Wie die Förderquote entsteht">
                  {b.foerderArt === 'zulage' ? (
                    <>
                      Auf {euro(b.probeMonat)} im Monat ({euro(b.probeMonat * 12)} im Jahr) gibt
                      es {euro(b.ersparnisJahr)} Zulage. Das ist <strong>Geld vom Staat</strong>,
                      keine Steuerersparnis — es fließt unabhängig von Ihrem Steuersatz und wird
                      dem Vertrag <strong>zusätzlich</strong> gutgeschrieben. Ihr eigener Beitrag
                      wird dadurch nicht kleiner, Ihr Depot aber um{' '}
                      {Math.round(b.foerderquote * 100)} % größer als das, was Sie einzahlen.
                    </>
                  ) : (
                    <>
                      Der Beitrag von {euro(b.probeMonat * 12)} im Jahr mindert Ihr zu
                      versteuerndes Einkommen. Gerechnet wird die <strong>Differenz</strong> Ihrer
                      Jahressteuer mit und ohne Beitrag — nicht ein Durchschnittssatz. Das ergibt{' '}
                      {euro(b.ersparnisJahr)} im Jahr, also{' '}
                      {Math.round(b.foerderquote * 100)} % des Einsatzes. Ihr persönlicher
                      Steuersatz bestimmt diese Quote; sie ist keine feste Zusage.
                      {(b.agZuschussMonat ?? 0) >= 0.5 && (
                        <>
                          {' '}Der Arbeitgeberzuschuss ist Pflicht: 15 % des umgewandelten Betrags,
                          soweit er selbst Sozialabgaben spart — gilt für Direktversicherung,
                          Pensionskasse und Pensionsfonds; ein Tarifvertrag kann abweichen.
                        </>
                      )}
                    </>
                  )}
                </InfoPunkt>
              </p>

              <p className="mt-1.5 text-[10px] text-slate-400">{b.paragraf}</p>
            </div>
          </article>
        ))}
      </div>

      {ohneBeitrag > 0 && (
        /*
          Ehrlichkeitsvorbehalt: Ein laufender Vertrag ohne erfassten Beitrag
          verbraucht Foerderrahmen, den der Check nicht sehen kann. Ohne
          diesen Satz waere der ausgewiesene freie Rahmen zu gross.
        */
        <p className="mx-2 mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] leading-relaxed text-slate-500 sm:text-[11px]">
          Zu {ohneBeitrag === 1 ? 'einem geförderten Vertrag' : `${ohneBeitrag} geförderten Verträgen`}{' '}
          ist kein laufender Beitrag erfasst. Tragen Sie ihn oben in der Prüfung ein — sonst
          erscheint hier mehr freier Rahmen, als Sie tatsächlich haben.
        </p>
      )}
    </section>
  );
}
