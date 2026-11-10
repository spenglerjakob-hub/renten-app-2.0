import {
  belastungsTreppe, laufendeZulageJahr, laufzeitText, ohneEigenaufwand, beiKind, kindName, desKindes, jahreText,
  type TuevPosition,
} from '../features/tuev-berechnung';
import { parseDatum } from '@renten/engine';
import { euro, euroGenau, prozent } from '../components/Feld';
import { typText, vertragsBezeichnung, kinderpoliceText, monatJahr } from '../features/vertragsarten';
import { personNameAus } from '../features/personen';
import type { SzenarioParsed } from '../store/szenario';
import { useAnsprache } from '../components/Ansprache';
import {
  Seite, Untertitel, Angabe, Zweispaltig, GrosseZahl, Tabelle, Zeile, Text, KASTEN, KASTEN_TITEL, Summe,
} from './Bausteine';

/** Beginn der Beitraege als „12/2026“ — aus dem genauen Datum, sonst Januar des Jahres. */
function beginnText(t: SzenarioParsed['tuev'][number]): string {
  const d = parseDatum(t.beginnDatum);
  return monatJahr(d ?? { monat: 1, jahr: t.beginnJahr });
}

/**
 * Der Vertrags-TUEV als Gutachtenbogen — eine Seite je geprueftem Vertrag.
 *
 * Der Bildschirm zeigt in Spalte 1 EINGABEFELDER. Die Druckregel blendet
 * Knoepfe aus, aber keine `input`-Elemente; auf dem Papier standen deshalb
 * leere Formularkaesten. Hier stehen dieselben Angaben als Text.
 *
 * Gerechnet wird nichts eigenes: die Werte kommen aus `tuevPositionen`,
 * derselben Funktion, die auch der Bildschirm benutzt.
 */
export function TuevBogen({
  position, szenario,
}: {
  position: TuevPosition;
  szenario: SzenarioParsed;
}) {
  const { vertrag: v, ergebnis: r, vergleich, istKapital, wege, kind } = position;
  /*
    KINDERPOLICE: Der Kunde zahlt, ausgezahlt wird an ein Kind oder Enkel —
    Jahrzehnte spaeter und versteuert zu dessen Satz. Derselbe Bogen, aber
    „was ankommt“ kommt beim Kind an; dazu die versicherte Person, das Ende
    der Beitraege und was man ueber Schenkung und Beitragszahler wissen muss.
  */
  const vp = kind ? v.versichertePerson : undefined;
  const offen = kind !== undefined && !kind.vollstaendig;
  // Ein Vertrag gehoert einer Person — auch beim Paar „du“, wie am Bildschirm
  const e = useAnsprache().einzeln;
  const t = szenario.tuev.find((x) => x.vertragId === v.id);
  const treppe = belastungsTreppe(r, undefined, e);
  const gut = r.nettoHebel >= 1;
  // Rein arbeitgeberfinanziert: Hebel und Rendite messen am eigenen Aufwand — ohne ihn gibt es sie nicht.
  const ohne = ohneEigenaufwand(r);
  const hebel = (x: number) => (ohne ? '—'
    : `${x.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);

  return (
    <Seite
      titel={`Vertrags-Prüfung: ${vertragsBezeichnung(v)}`}
      nummer={kind ? `${kinderpoliceText(v)} — nicht in ${e.dein('er')} Rente` : `${typText(v.typ)} · Schicht ${v.schicht}`}
    >
      <div className="grid grid-cols-3 gap-3">
        <GrosseZahl
          titel={`Kostet ${e.dich} im Monat`}
          wert={euro(r.echterAufwandMonat)}
          hinweis={`Beitrag ${euro(r.beitragMonat)}`}
        />
        {kind ? (
          <GrosseZahl
            titel={istKapital ? `Kapital für ${kindName(kind)} (netto)` : `Rente für ${kindName(kind)} im Monat (netto)`}
            wert={offen ? '—' : istKapital ? euro(r.nettoKapital) : euro(r.nettoRenteMonat)}
            hinweis={offen || !kind.rentenbeginn
              ? 'Geburtsdatum fehlt'
              : `${istKapital ? 'Ausgezahlt' : 'Ab'} ${monatJahr(kind.rentenbeginn)}, mit ${kind.alterBeiRentenbeginn}`}
          />
        ) : (
          <GrosseZahl
            titel={istKapital ? 'Auszahlung netto' : 'Netto-Rente im Monat'}
            wert={istKapital ? euro(r.nettoKapital) : euro(r.nettoRenteMonat)}
            hinweis={`Einzahlung: ${laufzeitText(r.monateEinzahlung)}`}
          />
        )}
        <GrosseZahl
          titel="Aus einem Euro Aufwand werden"
          wert={offen ? '—' : hebel(r.nettoHebel)}
          ton={ohne || offen ? 'neutral' : gut ? 'gut' : 'schlecht'}
          hinweis={ohne ? 'Rein arbeitgeberfinanziert' : gut ? 'Der Vertrag trägt sich' : 'Unter dem Einsatz'}
        />
      </div>

      <Untertitel>Zugrunde gelegt</Untertitel>
      <Zweispaltig>
        <Angabe feld={kind ? 'Beitragszahler' : 'Inhaber'} wert={personNameAus(szenario.personen, v.inhaber)} />
        {vp && (
          <Angabe
            feld="Versicherte Person"
            wert={`${vp.vorname.trim() || 'Kind'}${vp.geburtsdatum.trim() ? `, geboren ${vp.geburtsdatum.trim()}` : ', Geburtsdatum fehlt'}`}
          />
        )}
        <Angabe feld="Beitrag im Monat" wert={euroGenau(r.beitragMonat)} />
        {t && t.dynamik !== 0 && (
          <Angabe feld="Beitragsdynamik" wert={`${prozent(t.dynamik)} pro Jahr`} />
        )}
        {r.agZuschussMonat > 0 && (
          <Angabe feld="Arbeitgeberzuschuss" wert={`${euroGenau(r.agZuschussMonat)} im Monat`} />
        )}
        {/* Kinderpolice: Beginn und Ende der Beitraege in einer Zeile — danach ruht der Vertrag. */}
        {t && (kind ? (
          <Angabe
            feld="Beiträge"
            wert={kind.beitragBis
              ? `${beginnText(t)} bis ${monatJahr(kind.beitragBis)}${kind.beitragBisVorgeschlagen ? ' (18. Geburtstag)' : ''}`
              : `ab ${beginnText(t)}`}
          />
        ) : (
          <Angabe feld="Einzahlung ab" wert={t.beginnDatum ?? `01.01.${t.beginnJahr}`} />
        ))}
        {/* Fruehere Beitraege stehen hier, weil sie die Summe der
            Einzahlungen tragen, die Treppe unten aber nur den heutigen Monat. */}
        {t?.fruehereBeitraege.map((st, i) => (
          <Angabe
            key={i}
            feld={`Früherer Beitrag bis ${st.bis.slice(3).replace('.', '/')}`}
            wert={st.agZuschussMonat > 0
              ? `${euroGenau(st.beitragMonat)} (davon AG ${euroGenau(st.agZuschussMonat)})`
              : euroGenau(st.beitragMonat)}
          />
        ))}
        <Angabe feld="Einzahlungsdauer" wert={laufzeitText(r.monateEinzahlung)} />
        {kind && kind.ruhezeitJahre > 0 && (
          <Angabe feld="Danach ohne Beitrag" wert={jahreText(kind.ruhezeitJahre)} />
        )}
        {/* Rentenbeginn und Alter stehen in der Kachel oben — als Zeile nur, solange sie dort fehlen. */}
        {kind?.rentenbeginn && offen && (
          <Angabe feld={istKapital ? 'Auszahlung' : 'Rentenbeginn'} wert={monatJahr(kind.rentenbeginn)} />
        )}
        {t && (
          <Angabe
            feld={kind ? `Lebenserwartung ${desKindes(kind)}` : 'Angenommene Lebenserwartung'}
            wert={kind && !istKapital && !offen
              ? `${t.lebenserwartung} Jahre (${jahreText(r.jahreAuszahlung)} Rente)`
              : `${t.lebenserwartung} Jahre`}
          />
        )}
        {!kind && <Angabe feld="Auszahlungsdauer" wert={`${r.jahreAuszahlung} Jahre`} />}
        {kind && (
          <Angabe feld={`Steuersatz ${desKindes(kind)} im Alter`} wert={`${prozent(kind.steuersatz, 0)} (Annahme)`} />
        )}
      </Zweispaltig>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className={KASTEN}>
          <div className={KASTEN_TITEL}>
            Was {e.du} {e.w('einzahlst', undefined, 'einzahlen')} (laufender Beitrag, monatlich)
          </div>
          {/* Dieselbe Treppe wie am Bildschirm, aus derselben Funktion: oben
              was der Vertrag bekommt, unten was es kostet. */}
          <Angabe feld="Gesamtbeitrag" wert={euro(treppe.zufluss)} />
          {treppe.zeilen.map((z) => (
            <div key={z.text} className={z.art === 'summe' ? 'border-t border-ui-asche' : ''}>
              <Angabe feld={z.text} wert={euro(z.betrag)} />
            </div>
          ))}
          <Summe text={`Kostet ${e.dich} wirklich`} wert={euro(treppe.aufwand)} />
        </div>

        {kind && offen ? (
          <div className={KASTEN}>
            <div className={KASTEN_TITEL}>Was {beiKind(kind)} ankommt</div>
            <p className="text-[11px] leading-relaxed text-ui-tinte">
              Am Vertrag fehlt das Geburtsdatum {vp?.vorname.trim() ? `von ${vp.vorname.trim()}` : 'des Kindes'} —
              ohne es lässt sich nicht rechnen, was nach Steuer ankommt.
            </p>
          </div>
        ) : (
        <div className={KASTEN}>
          <div className={KASTEN_TITEL}>
            Was {kind ? `${beiKind(kind)} ` : ''}ankommt {istKapital ? '(einmalig)' : '(monatlich)'}
          </div>
          <Angabe
            feld={istKapital ? 'Kapital brutto' : 'Brutto-Rente'}
            wert={euro(istKapital ? r.bruttoKapital : r.bruttoRenteMonat)}
          />
          {!istKapital && r.kvPvMonat > 0 && (
            <Angabe feld="− Kranken- und Pflegeversicherung" wert={euro(r.kvPvMonat)} />
          )}
          {/* Bei der Kinderpolice steht dabei, WIE versteuert wird: Ertragsanteil
              bzw. Ertrag zum angenommenen Satz des Kindes. */}
          <Angabe
            feld={kind
              ? istKapital
                ? `− Steuer (${kind.halbeinkuenfte ? 'halber Ertrag' : 'Ertrag'} zu ${prozent(kind.steuersatz, 0)})`
                : `− Steuer (Ertragsanteil ${prozent(kind.ertragsanteil, 0)} zu ${prozent(kind.steuersatz, 0)})`
              : istKapital ? '− Steuer im Zuflussjahr' : '− Steuer'}
            wert={euro(istKapital ? r.steuerKapital : r.steuerMonat)}
          />
          {/* Beitraege auf die Kapitalleistung: beim Zufluss abgezogen, nicht
              ueber zehn Jahre verteilt (§ 229 SGB V bemisst sie mit 1/120 —
              das ist die Bemessung, nicht der Zahlungsweg). */}
          {istKapital && r.kvPvKapital > 0 && (
            <Angabe feld="− Kranken- und Pflegeversicherung" wert={euro(r.kvPvKapital)} />
          )}
          <Summe
            text={kind ? `Bleibt ${kindName(kind)}` : `Bleibt ${e.dir}`}
            wert={euro(istKapital ? r.nettoKapital : r.nettoRenteMonat)}
          />
          {/* Jahrzehnte entfernt: was der Betrag in heutigem Geld wert ist. */}
          {kind && kind.kaufkraftfaktor > 1.0001 && (
            <p className="mt-1 text-[11px] leading-relaxed text-ui-schiefer">
              In heutigem Geld rund{' '}
              <strong className="font-medium text-ui-tinte">
                {euro((istKapital ? r.nettoKapital : r.nettoRenteMonat) / kind.kaufkraftfaktor)}
              </strong>{' '}
              ({prozent(szenario.annahmen.inflation)} Inflation pro Jahr)
            </p>
          )}
        </div>
        )}
      </div>

      {/*
        Dieser Kasten schluesselt die Zulagenzeile der Treppe auf. Die Zulagen
        mindern den Eigenaufwand weiterhin nicht: Sie heben den Zufluss an und
        gehen davon wieder ab; unten steht derselbe Betrag wie zuvor.
      */}
      {r.zulageMonat > 0 && (
        <div className={`mt-4 ${KASTEN}`}>
          <div className={KASTEN_TITEL}>
            Was der Staat dazugibt (1. Jahr, monatlich)
          </div>
          {r.zulageDetail ? (
            <Zweispaltig>
              <Angabe feld="Grundzulage" wert={euro(r.zulageDetail.grundzulageMonat)} />
              <Angabe
                feld={r.zulageDetail.kinderMitAnspruch > 0
                  ? `Kinderzulage (${r.zulageDetail.kinderMitAnspruch} Kind${r.zulageDetail.kinderMitAnspruch > 1 ? 'er' : ''})`
                  : 'Kinderzulage'}
                wert={euro(r.zulageDetail.kinderzulageMonat)}
              />
            </Zweispaltig>
          ) : (
            <Angabe feld="Zulage" wert={euro(r.zulageMonat)} />
          )}
          {r.zulageDetail && r.zulageDetail.bonusEinmalig > 0 && (
            <p className="mt-1 text-[11px] text-ui-tinte">
              Dazu <strong>einmalig im ersten Jahr</strong>: Berufseinsteigerbonus{' '}
              {euro(r.zulageDetail.bonusEinmalig)}.
            </p>
          )}
          <p className="mt-1 text-[11px] leading-relaxed text-ui-tinte">
            Die Zulagen sind der Anteil des Staates am Gesamtbeitrag — sie fließen zusätzlich in
            den Vertrag und senken {e.dein('en')} eigenen Beitrag nicht. Über das Jahr sind das{' '}
            <strong>{euro(laufendeZulageJahr(r))}</strong>.
          </p>
        </div>
      )}

      <Untertitel>Über die gesamte Laufzeit</Untertitel>
      <Zweispaltig>
        <Angabe feld={`Summe ${e.dein('es')} Aufwands`} wert={euro(r.summeEinzahlung)} />
        <Angabe
          feld={kind ? `Summe der Auszahlung an ${kindName(kind)} (netto)` : 'Summe der Auszahlung (netto)'}
          wert={offen ? '—' : euro(r.summeAuszahlung)}
        />
        <Angabe feld="Überschuss" wert={offen ? '—' : euro(r.echterGewinn)} />
        <Angabe feld={`Rendite auf ${e.dein('en')} Aufwand`} wert={ohne || offen ? '—' : prozent(r.rendite)} />
        {/* Bei der Kinderpolice nicht: Das Geld fliesst an das Kind, nie zurueck an den Beitragszahler. */}
        {!kind && (
          <Angabe
            feld="Eingesetztes Geld zurück nach"
            wert={ohne ? 'kein eigener Aufwand' : r.amortisationsJahre > 0
              ? `${r.amortisationsJahre.toLocaleString('de-DE', { maximumFractionDigits: 1 })} Jahren`
              : 'nicht erreicht'}
          />
        )}
      </Zweispaltig>

      {/*
        BEIDE WEGE NEBENEINANDER, sobald am Vertrag beide Betraege stehen.
        Rente und Kapital waren frueher zwei Vertragsarten — man musste sich
        beim Anlegen entscheiden und konnte nie vergleichen. Jeder Weg bekommt
        hier seine eigene vollstaendige Rechnung, den Netto-Gewinn
        eingeschlossen: Er ist die Zahl, an der die Entscheidung haengt.
      */}
      {wege ? (
        // mt-5 am Rahmen: `Untertitel` traegt `first:mt-0`, und als erstes
        // Kind dieses div verloere die Ueberschrift sonst ihren Abstand nach
        // oben — sie klebte am vorigen Block.
        <div className="mt-5 break-inside-avoid">
          <Untertitel>Rente oder Kapital — beide Wege gerechnet</Untertitel>
          <Tabelle kopf={['', 'Laufende Rente', 'Kapitalauszahlung']} spalten={[46, 27, 27]}>
            <Zeile zellen={[
              'Was ankommt (netto)',
              `${euro(wege.rente.nettoRenteMonat)} / Monat`,
              `${euro(wege.kapital.nettoKapital)} einmalig`,
            ]} />
            <Zeile zellen={[
              'Summe der Auszahlung (netto)',
              euro(wege.rente.summeAuszahlung),
              euro(wege.kapital.summeAuszahlung),
            ]} />
            <Zeile fett zellen={[
              'Überschuss über den Aufwand',
              euro(wege.rente.echterGewinn),
              euro(wege.kapital.echterGewinn),
            ]} />
            <Zeile zellen={[
              'Aus einem Euro Aufwand werden',
              hebel(wege.rente.nettoHebel),
              hebel(wege.kapital.nettoHebel),
            ]} />
            <Zeile zellen={[
              `Rendite auf ${e.dein('en')} Aufwand`,
              ohne ? '—' : prozent(wege.rente.rendite),
              ohne ? '—' : prozent(wege.kapital.rendite),
            ]} />
          </Tabelle>
          {kind ? (
            <Text>
              <strong>Break-even:</strong> Ohne Verzinsung des Kapitals müsste {kindName(kind)}{' '}
              <strong>{wege.breakEven.breakEvenOhneZins.toLocaleString('de-DE', { maximumFractionDigits: 1 })} Jahre</strong>{' '}
              alt werden, damit die laufende Rente die Einmalzahlung einholt
              {wege.breakEven.kapitalTraegtSichSelbst
                ? '; mit 2 % Verzinsung holt sie das Kapital nie ein.'
                : <>; mit 2 % Verzinsung{' '}
                  <strong>{wege.breakEven.breakEvenMitZins.toLocaleString('de-DE', { maximumFractionDigits: 1 })} Jahre</strong>.</>}{' '}
              Oben gerechnet ist <strong>{istKapital ? 'die Kapitalauszahlung' : 'die laufende Rente'}</strong>.
            </Text>
          ) : (
          <Text>
            <strong>Break-even:</strong> Ohne Verzinsung des Kapitals {e.w('müsstest', undefined, 'müssten')} {e.du}{' '}
            <strong>{wege.breakEven.breakEvenOhneZins.toLocaleString('de-DE', { maximumFractionDigits: 1 })} Jahre</strong>{' '}
            alt werden, damit die laufende Rente die Einmalzahlung einholt.{' '}
            {wege.breakEven.kapitalTraegtSichSelbst ? (
              <>Mit 2 % Verzinsung trägt der Kapitalertrag allein bereits die Rente — dann
              holt sie das Kapital rechnerisch nie ein.</>
            ) : (
              <>Mit 2 % Verzinsung wären es{' '}
              <strong>{wege.breakEven.breakEvenMitZins.toLocaleString('de-DE', { maximumFractionDigits: 1 })} Jahre</strong>.</>
            )}{' '}
            Wer älter wird, fährt mit der Rente besser; wer früher stirbt, mit dem Kapital. Die
            Rente sichert dafür gegen ein langes Leben ab — das Kapital tut das nicht. In die
            Gesamtübersicht dieses Gutachtens geht{' '}
            <strong>{istKapital ? 'die Kapitalauszahlung' : 'die laufende Rente'}</strong> ein.
          </Text>
          )}
        </div>
      ) : vergleich && (
        <>
          <Untertitel>Rente oder Kapital</Untertitel>
          <Text>
            <strong>Ohne Verzinsung des Kapitals</strong> {e.w('müsstest', undefined, 'müssten')} {e.du}{' '}
            <strong>{vergleich.breakEvenOhneZins.toLocaleString('de-DE', { maximumFractionDigits: 1 })} Jahre</strong>{' '}
            alt werden, damit die laufende Rente die Einmalzahlung einholt.{' '}
            {vergleich.kapitalTraegtSichSelbst ? (
              <>
                <strong>Mit 2 % Verzinsung</strong> trägt der Kapitalertrag allein bereits die
                Rente — die Verrentung rechnet sich dann finanziell nie.
              </>
            ) : (
              <>
                <strong>Mit 2 % Verzinsung</strong> wären es{' '}
                <strong>{vergleich.breakEvenMitZins.toLocaleString('de-DE', { maximumFractionDigits: 1 })} Jahre</strong>.
              </>
            )}{' '}
            Wer älter wird, fährt mit der Rente besser; wer früher stirbt, mit dem Kapital. Die
            Rente sichert dafür gegen ein langes Leben ab — das Kapital tut das nicht.
          </Text>
        </>
      )}

      {r.hinweise.length > 0 && (
        <div className="mt-3 break-inside-avoid rounded-[10px] border border-ui-linie bg-ui-innen p-2">
          <div className="mb-1 text-[11px] font-medium text-ui-schiefer">
            Zu beachten
          </div>
          <ul className="list-inside list-disc space-y-0.5 text-[11px] leading-relaxed text-ui-tinte">
            {r.hinweise.map((h) => <li key={h}>{h}</li>)}
          </ul>
        </div>
      )}

      {/*
        Was bei einer Kinderpolice ausserhalb der Rechnung zaehlt. Bewusst
        kurz und ohne Ratschlag: Schenkung und Beitragsbefreiung haengen am
        Vertrag und an der Familie, nicht an dieser Rechnung.
      */}
      {kind && (
        <div className="mt-3 break-inside-avoid rounded-[10px] border border-ui-linie bg-ui-innen p-2">
          <div className="mb-1 text-[11px] font-medium text-ui-schiefer">
            Gut zu wissen bei einer Kinderpolice
          </div>
          <ul className="list-inside list-disc space-y-0.5 text-[11px] leading-relaxed text-ui-tinte">
            <li>
              <strong>Steuer beim Kind:</strong> die Rente mit dem Ertragsanteil, ein Kapital mit dem Ertrag
              — zur Hälfte nach 12 Jahren Laufzeit und Auszahlung ab 62. Satz{' '}
              {prozent(kind.steuersatz, 0)} angenommen; in der Krankenversicherung der Rentner beitragsfrei.
            </li>
            <li>
              <strong>Schenkung:</strong> Was {kindName(kind)} erhält, gilt als Zuwendung des Beitragszahlers —
              steuerfrei je Schenker in zehn Jahren bis 400.000 € an ein Kind, 200.000 € an ein Enkelkind
              (§§ 14, 16 ErbStG).
            </li>
            <li>
              <strong>Tod des Beitragszahlers:</strong> Ohne vereinbarte Beitragsbefreiung muss jemand
              weiterzahlen, sonst sinkt die Leistung.
            </li>
            <li>
              <strong>Angebot:</strong> Rente und Kapital sind Werte des Versicherers; garantiert ist meist nur
              ein Teil davon.
            </li>
          </ul>
        </div>
      )}
    </Seite>
  );
}
