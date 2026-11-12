import { useMemo } from 'react';
import { Gift } from 'lucide-react';
import { foerdercheck, type Jahreszeile } from '@renten/engine';
import { useSzenario } from '../store/szenario';
import { euro, euroGenau, InfoPunkt } from '../components/Feld';
import { foerderBasis } from './tuev-berechnung';
import { EINLEITUNG } from '../components/stil';
import { useAnsprache } from '../components/Ansprache';

/**
 * FÖRDERCHECK — was an Förderung liegen bleibt.
 *
 * Der Vertrags-TÜV prüft, was da ist. Dieser Block prüft, was FEHLT: den
 * ungenutzten Rahmen der Entgeltumwandlung und den freien Höchstbetrag für
 * eine Basisrente. Beides steht im Gesetz und in den Angaben — es wurde nur
 * nie gegenübergestellt.
 *
 * EIN EIGENES STUECK VOR DEN LOESUNGEN, nach dem Vertrags-TÜV: Welche
 * Förderung liegen bleibt, ist das Argument für die Lösungen danach — im
 * Gutachten steht die Seite seit jeher an dieser Stelle. Die laufenden
 * Beiträge, gegen die hier gerechnet wird, werden im TÜV erfasst, dem
 * Stück davor.
 *
 * Ohne Befund rendert der Block nichts. Ein Kasten, der „alles in Ordnung"
 * meldet, kostet Platz und sagt nichts.
 */
export function Foerdercheck({ zeile }: { zeile: Jahreszeile | null }) {
  const szenario = useSzenario((s) => s.szenario);
  // `t` fuer den Haushalt (Steuer, Rahmen), `e` fuer die Person des Beitrags (Arbeitgeber, Depot)
  const t = useAnsprache();
  const e = t.einzeln;

  const { befunde, ohneBeitrag } = useMemo(() => {
    const b = foerderBasis(szenario, zeile);
    return { befunde: foerdercheck(b.kontext, b.steuerOpt, b.p), ohneBeitrag: b.ohneBeitrag };
  }, [szenario, zeile]);

  if (befunde.length === 0) return null;

  return (
    <section aria-labelledby="foerdercheck-titel" className="print:hidden">
      {/* Derselbe Kopf-Aufbau wie beim Vertrags-TÜV — ohne eigene Farbe, die Foerderung steht in den Zahlen. */}
      <div className="mb-5 flex items-start gap-3">
        <Gift className="mt-1 h-5 w-5 shrink-0 text-ui-schiefer" aria-hidden />
        <div>
          <h2 id="foerdercheck-titel" className="ui-titel text-[22px] font-normal leading-snug text-ui-tinte sm:text-[26px]">
            Fördercheck
          </h2>
          <p className={`mt-1 ${EINLEITUNG}`}>
            Welche Förderung {t.du} heute nicht {t.w('ausschöpfst', 'ausschöpft')} — und was ein geförderter
            Beitrag {t.dich} nach Steuern und Abgaben tatsächlich kostet.
          </p>
        </div>
      </div>

      {/*
        Zwei Spalten erst ab `lg`. Bei 640 Punkten blieben je Karte rund 300
        uebrig, und darin bricht der erklaerende Satz in sieben Zeilen um.
      */}
      <div className="grid gap-5 sm:gap-6 lg:grid-cols-2">
        {befunde.map((b) => (
          <article
            key={b.id}
            className="ui-karte overflow-hidden"
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
            <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-ui-linie px-5 py-4 sm:px-6">
              <h3 className="min-w-0 break-words text-base font-medium text-ui-tinte hyphens-auto">{b.titel}</h3>
              {b.foerderArt === 'zulage' ? (
                <span className="shrink-0 text-right">
                  <span className="block text-2xl font-medium leading-none tabular-nums text-ui-tinte">
                    {euro(b.ersparnisJahr)}
                  </span>
                  <span className="mt-1 block text-xs text-ui-schiefer">
                    Zulage im Jahr
                  </span>
                </span>
              ) : (
                <span className="shrink-0 text-sm font-medium tabular-nums text-ui-tinte">
                  {euro(b.rahmenMonat)} / Monat frei
                </span>
              )}
            </header>

            <div className="p-5 sm:p-6">
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
                <p className="mb-2 text-sm font-medium text-ui-tinte">
                  {euro(b.rahmenMonat)} im Monat einzahlen — der Staat legt{' '}
                  {euro(b.ersparnisJahr / 12)} obendrauf.
                </p>
              )}

              <p className="text-xs leading-relaxed text-ui-tinte/80">{b.text}</p>

              {/* Die Einschraenkung steht kleiner darunter — im Ausdruck
                  entfaellt sie ganz, dort zaehlt der Befund. */}
              {b.hinweis && (
                <p className="mt-1.5 text-xs leading-relaxed text-ui-schiefer">
                  {b.hinweis}
                </p>
              )}

              {/*
                Die eine Zeile, auf die es ankommt. Der Rahmen sagt, was ginge;
                erst der Netto-Aufwand sagt, was es kostet — und das ist die
                Zahl, nach der jemand entscheidet.
              */}
              <p className="ui-innen mt-3 px-3 py-2.5 text-xs leading-relaxed text-ui-tinte/80 [&_strong]:font-medium [&_strong]:text-ui-tinte">
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
                    Monat obendrauf — {Math.round(b.foerderquote * 100)} % auf {e.dein('en')} Beitrag.
                    {b.probeMonat - b.nettoAufwandMonat >= 0.5 && (
                      <>
                        {' '}Über die Zulage hinaus spart der Sonderausgabenabzug{' '}
                        {euro(b.probeMonat - b.nettoAufwandMonat)} Steuer im Monat; netto kostet
                        {' '}{e.dich} der Beitrag dann <strong>{euro(b.nettoAufwandMonat)}</strong>.
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <strong>{euro(b.probeMonat)}</strong> im Monat kosten {e.dich} nach Förderung nur{' '}
                    <strong>{euro(b.nettoAufwandMonat)}</strong> — der Staat trägt{' '}
                    {Math.round(b.foerderquote * 100)} % ({euro(b.ersparnisJahr / 12)} im Monat).
                    {/*
                      Der Pflichtzuschuss des Arbeitgebers kommt OBENDRAUF wie
                      eine Zulage — er gehoert in den Vertrag, nicht in den
                      Aufwand.
                    */}
                    {(b.agZuschussMonat ?? 0) >= 0.5 && (
                      <>
                        {' '}Dazu legt {e.dein()} Arbeitgeber <strong>{euroGenau(b.agZuschussMonat!)}</strong>{' '}
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
                      keine Steuerersparnis — es fließt unabhängig von {e.dein('em')} Steuersatz und wird
                      dem Vertrag <strong>zusätzlich</strong> gutgeschrieben. {e.Dein()} eigener Beitrag
                      wird dadurch nicht kleiner, {e.dein()} Depot aber um{' '}
                      {Math.round(b.foerderquote * 100)} % größer als das, was {e.du} {e.w('einzahlst', undefined, 'einzahlen')}.
                    </>
                  ) : (
                    <>
                      Der Beitrag von {euro(b.probeMonat * 12)} im Jahr mindert {t.dein()} zu
                      versteuerndes Einkommen. Gerechnet wird die <strong>Differenz</strong> {t.dein('er')}{' '}
                      Jahressteuer mit und ohne Beitrag — nicht ein Durchschnittssatz. Das ergibt{' '}
                      {euro(b.ersparnisJahr)} im Jahr, also{' '}
                      {Math.round(b.foerderquote * 100)} % des Einsatzes. {t.Dein()} persönlicher
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

              <p className="mt-2 text-xs text-ui-schiefer">{b.paragraf}</p>
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
        <p className="ui-innen mt-5 px-4 py-3 text-xs leading-relaxed text-ui-schiefer">
          Zu {ohneBeitrag === 1 ? 'einem geförderten Vertrag' : `${ohneBeitrag} geförderten Verträgen`}{' '}
          ist kein laufender Beitrag erfasst. Er gehört in die Prüfung der bestehenden Verträge — sonst
          erscheint hier mehr freier Rahmen, als {t.du} tatsächlich {t.w('hast', 'habt')}.
        </p>
      )}
    </section>
  );
}
