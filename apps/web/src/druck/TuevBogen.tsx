import type { TuevPosition } from '../features/tuev-berechnung';
import { euro, prozent } from '../components/Feld';
import { typText } from '../features/vertragsarten';
import { personNameAus } from '../features/personen';
import type { SzenarioParsed } from '../store/szenario';
import { Seite, Untertitel, Angabe, Zweispaltig, GrosseZahl, Tabelle, Zeile, Text } from './Bausteine';

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
  const { vertrag: v, ergebnis: r, vergleich, istKapital, wege } = position;
  const t = szenario.tuev.find((x) => x.vertragId === v.id);
  const gut = r.nettoHebel >= 1;

  return (
    <Seite
      titel={`Vertrags-Prüfung: ${v.name || 'ohne Bezeichnung'}`}
      nummer={`${typText(v.typ)} · Schicht ${v.schicht}`}
    >
      <div className="grid grid-cols-3 gap-3">
        <GrosseZahl
          titel="Kostet Sie im Monat"
          wert={euro(r.echterAufwandMonat)}
          hinweis={`Beitrag ${euro(r.beitragMonat)}`}
        />
        <GrosseZahl
          titel={istKapital ? 'Auszahlung netto' : 'Netto-Rente im Monat'}
          wert={istKapital ? euro(r.nettoKapital) : euro(r.nettoRenteMonat)}
          hinweis={`ab ${r.jahreEinzahlung} Jahren Einzahlung`}
        />
        <GrosseZahl
          titel="Aus einem Euro Aufwand werden"
          wert={`${r.nettoHebel.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`}
          ton={gut ? 'gut' : 'schlecht'}
          hinweis={gut ? 'Der Vertrag trägt sich' : 'Unter dem Einsatz'}
        />
      </div>

      <Untertitel>Zugrunde gelegt</Untertitel>
      <Zweispaltig>
        <Angabe feld="Inhaber" wert={personNameAus(szenario.personen, v.inhaber)} />
        <Angabe feld="Beitrag im Monat" wert={euro(r.beitragMonat)} />
        {t && t.dynamik !== 0 && (
          <Angabe feld="Beitragsdynamik" wert={`${prozent(t.dynamik)} pro Jahr`} />
        )}
        {r.agZuschussMonat > 0 && (
          <Angabe feld="Arbeitgeberzuschuss" wert={`${euro(r.agZuschussMonat)} im Monat`} />
        )}
        {t && <Angabe feld="Einzahlung ab" wert={String(t.beginnJahr)} />}
        <Angabe feld="Einzahlungsdauer" wert={`${r.jahreEinzahlung} Jahre`} />
        {t && <Angabe feld="Angenommene Lebenserwartung" wert={`${t.lebenserwartung} Jahre`} />}
        <Angabe feld="Auszahlungsdauer" wert={`${r.jahreAuszahlung} Jahre`} />
      </Zweispaltig>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="break-inside-avoid rounded-lg border border-slate-300 bg-slate-50 p-3">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Was Sie einzahlen (1. Jahr, monatlich)
          </div>
          <Angabe feld="Beitrag" wert={euro(r.beitragMonat)} />
          {r.agZuschussMonat > 0 && (
            <Angabe feld="− Arbeitgeberzuschuss" wert={euro(r.agZuschussMonat)} />
          )}
          {r.svErsparnisMonat >= 0.5 && (
            <Angabe feld="− Ersparnis Sozialabgaben" wert={euro(r.svErsparnisMonat)} />
          )}
          {r.steuerersparnisMonat > 0 && (
            <Angabe feld="− Steuerersparnis" wert={euro(r.steuerersparnisMonat)} />
          )}
          <div className="mt-1 flex items-baseline justify-between border-t border-slate-400 pt-1">
            <span className="text-[12px] font-bold text-slate-800">Kostet Sie wirklich</span>
            <span className="text-[14px] font-black tabular-nums text-slate-900">
              {euro(r.echterAufwandMonat)}
            </span>
          </div>
        </div>

        <div className="break-inside-avoid rounded-lg border border-slate-300 bg-slate-50 p-3">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Was ankommt {istKapital ? '(einmalig)' : '(monatlich)'}
          </div>
          <Angabe
            feld={istKapital ? 'Kapital brutto' : 'Brutto-Rente'}
            wert={euro(istKapital ? r.bruttoKapital : r.bruttoRenteMonat)}
          />
          {!istKapital && r.kvPvMonat > 0 && (
            <Angabe feld="− Kranken- und Pflegeversicherung" wert={euro(r.kvPvMonat)} />
          )}
          <Angabe
            feld={istKapital ? '− Steuer im Zuflussjahr' : '− Steuer'}
            wert={euro(istKapital ? r.steuerKapital : r.steuerMonat)}
          />
          {/* Beitraege auf die Kapitalleistung: beim Zufluss abgezogen, nicht
              ueber zehn Jahre verteilt (§ 229 SGB V bemisst sie mit 1/120 —
              das ist die Bemessung, nicht der Zahlungsweg). */}
          {istKapital && r.kvPvKapital > 0 && (
            <Angabe feld="− Kranken- und Pflegeversicherung" wert={euro(r.kvPvKapital)} />
          )}
          <div className="mt-1 flex items-baseline justify-between border-t border-slate-400 pt-1">
            <span className="text-[12px] font-bold text-slate-800">Bleibt Ihnen</span>
            <span className="text-[14px] font-black tabular-nums text-slate-900">
              {euro(istKapital ? r.nettoKapital : r.nettoRenteMonat)}
            </span>
          </div>
        </div>
      </div>

      {/*
        Die Zulagen stehen BEWUSST ausserhalb der Einzahlungsrechnung: sie
        mindern den Eigenaufwand nicht, sie kommen zusaetzlich vom Staat.
        Als Abzugsposten gebucht zaehlten sie doppelt.
      */}
      {r.zulageMonat > 0 && (
        <div className="mt-4 break-inside-avoid rounded-lg border border-emerald-300 bg-emerald-50 p-3">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
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
            <p className="mt-1 text-[11px] text-emerald-800">
              Dazu <strong>einmalig im ersten Jahr</strong>: Berufseinsteigerbonus{' '}
              {euro(r.zulageDetail.bonusEinmalig)}.
            </p>
          )}
          <p className="mt-1 text-[11px] leading-relaxed text-emerald-800">
            Die Zulagen fließen zusätzlich in den Vertrag — sie senken Ihren Beitrag nicht.
            Im Vertrag kommen an: <strong>{euro(r.beitragMonat + r.zulageMonat)}</strong> im Monat.
          </p>
        </div>
      )}

      <Untertitel>Über die gesamte Laufzeit</Untertitel>
      <Zweispaltig>
        <Angabe feld="Summe Ihres Aufwands" wert={euro(r.summeEinzahlung)} />
        <Angabe feld="Summe der Auszahlung (netto)" wert={euro(r.summeAuszahlung)} />
        <Angabe feld="Überschuss" wert={euro(r.echterGewinn)} />
        <Angabe feld="Rendite auf Ihren Aufwand" wert={prozent(r.rendite)} />
        <Angabe
          feld="Eingesetztes Geld zurück nach"
          wert={r.amortisationsJahre > 0
            ? `${r.amortisationsJahre.toLocaleString('de-DE', { maximumFractionDigits: 1 })} Jahren`
            : 'nicht erreicht'}
        />
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
              `${wege.rente.nettoHebel.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`,
              `${wege.kapital.nettoHebel.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`,
            ]} />
            <Zeile zellen={[
              'Rendite auf Ihren Aufwand',
              prozent(wege.rente.rendite),
              prozent(wege.kapital.rendite),
            ]} />
          </Tabelle>
          <Text>
            <strong>Break-even:</strong> Ohne Verzinsung des Kapitals müssten Sie{' '}
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
        </div>
      ) : vergleich && (
        <>
          <Untertitel>Rente oder Kapital</Untertitel>
          <Text>
            <strong>Ohne Verzinsung des Kapitals</strong> müssten Sie{' '}
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
        <div className="mt-3 break-inside-avoid rounded-lg border border-amber-300 bg-amber-50 p-2">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-amber-800">
            Zu beachten
          </div>
          <ul className="list-inside list-disc space-y-0.5 text-[11px] leading-relaxed text-amber-900">
            {r.hinweise.map((h) => <li key={h}>{h}</li>)}
          </ul>
        </div>
      )}
    </Seite>
  );
}
