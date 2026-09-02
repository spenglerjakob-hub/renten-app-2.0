import { useMemo } from 'react';
import {
  projiziere, sparrateZuRente, versorgungsluecke,
  type Jahreszeile, type Szenario,
} from '@renten/engine';
import { euro, prozent } from '../components/Feld';
import type { SzenarioParsed } from '../store/szenario';
import type { SparzielEingaben } from '../features/sparziel-berechnung';
import { Seite, Untertitel, Tabelle, Zeile, Text } from './Bausteine';

/** Der Beitrag, an dem die beiden Spar-Hebel gemessen werden. */
const PROBEBEITRAG = 100;
/** Um wie viele Jahre der Rentenbeginn im ersten Hebel verschoben wird. */
const SPAETER_JAHRE = 2;

/**
 * "Ihre drei Stellschrauben" — was sich aendert, wenn man etwas aendert.
 *
 * Ein Verbraucher versteht Hebel besser als Massstaebe. Die Seite beantwortet
 * drei Fragen mit je einer Zahl, statt Zusammenhaenge zu erklaeren.
 *
 * Der erste Hebel wird ECHT gerechnet: `projiziere` ist eine reine Funktion
 * eines einfachen Objekts, laesst sich also auf einem Klon des Szenarios ein
 * zweites Mal aufrufen. Ein Sensitivitaetsmodul gibt es im Rechenkern nicht,
 * und dafuer eines zu bauen waere hier nicht verhaeltnismaessig.
 */
export function Stellschrauben({
  szenario, zeile, eingaben,
}: {
  szenario: SzenarioParsed;
  zeile: Jahreszeile;
  eingaben: SparzielEingaben;
}) {
  const jetzt = new Date().getFullYear();
  const jahreBisRente = Math.max(0, zeile.jahr - jetzt);

  /**
   * Rentenbeginn um zwei Jahre nach hinten: mehr Beitragsjahre, weniger
   * Abschlag, kuerzere Auszahlzeit. Alles drei steckt bereits in der
   * Zeitachse — deshalb wird sie neu gerechnet statt geschaetzt.
   */
  const spaeter = useMemo(() => {
    const klon: Szenario = {
      ...szenario,
      personen: szenario.personen.map((pn) => {
        const jahr = Number(pn.rentenbeginn.slice(-4)) || Number(pn.rentenbeginn.slice(0, 4));
        if (!Number.isFinite(jahr)) return pn;
        // Das Datumsformat bleibt, nur die Jahreszahl wandert.
        const neu = pn.rentenbeginn.replace(String(jahr), String(jahr + SPAETER_JAHRE));
        return { ...pn, rentenbeginn: neu };
      }),
    };
    const e = projiziere(klon);
    return e.zeilen.find((z) => z.jahr === zeile.jahr + SPAETER_JAHRE) ?? null;
  }, [szenario, zeile.jahr]);

  const mehrDurchSpaeter = spaeter
    // Im gemeinsamen Massstab vergleichen: der spaetere Betrag steht in
    // spaeteren, also inflationierten Euro.
    ? spaeter.nettoMonat / spaeter.kaufkraftfaktor - zeile.nettoMonat / zeile.kaufkraftfaktor
    : null;

  const sparen = (rendite: number) => sparrateZuRente({
    beitragMonat: PROBEBEITRAG,
    jahre: jahreBisRente,
    rendite,
    dynamik: 0,
    auszahldauer: eingaben.auszahldauer,
    entnahmeDynamik: szenario.annahmen.inflation,
  });

  const beiRendite = sparen(eingaben.rendite);
  const beiMehrRendite = sparen(eingaben.rendite + 0.01);
  const luecke = versorgungsluecke(zeile);

  const anteil = (betrag: number) =>
    luecke > 0 ? `${Math.min(100, (betrag / luecke) * 100).toFixed(0)} % der Lücke` : '—';

  return (
    <Seite titel="Ihre drei Stellschrauben" nummer="Was sich ändert, wenn Sie etwas ändern">
      <Text>
        Die vorige Seite nennt einen Betrag. Sie ist aber nicht der einzige Weg: An der Versorgung
        lässt sich an drei Stellen drehen, und die wirken unterschiedlich stark. Alle Beträge
        unten stehen in <strong>heutiger Kaufkraft</strong>, damit sie vergleichbar sind.
      </Text>

      <Untertitel>Was jeder Hebel bringt</Untertitel>
      <Tabelle
        kopf={['Wenn Sie …', 'Mehr Netto im Monat', 'Das entspricht']}
        spalten={[52, 24, 24]}
        textSpalten={[2]}
      >
        <Zeile
          zellen={[
            <>
              <span className="font-semibold">
                {SPAETER_JAHRE} Jahre später in Rente gehen
              </span>
              <span className="block text-slate-500">
                statt {zeile.jahr} erst {zeile.jahr + SPAETER_JAHRE} — höherer Zugangsfaktor,
                zwei Jahre mehr Verzinsung, kürzere Auszahlzeit
              </span>
            </>,
            mehrDurchSpaeter === null ? '—' : euro(Math.max(0, mehrDurchSpaeter)),
            mehrDurchSpaeter === null ? '—' : anteil(mehrDurchSpaeter * zeile.kaufkraftfaktor),
          ]}
          textSpalten={[2]}
        />
        <Zeile
          zellen={[
            <>
              <span className="font-semibold">
                {euro(PROBEBEITRAG)} im Monat zusätzlich sparen
              </span>
              <span className="block text-slate-500">
                {jahreBisRente} Jahre lang, {prozent(eingaben.rendite)} Rendite nach Kosten
              </span>
            </>,
            euro(beiRendite.renteMonat / zeile.kaufkraftfaktor),
            anteil(beiRendite.renteMonat),
          ]}
          textSpalten={[2]}
        />
        <Zeile
          zellen={[
            <>
              <span className="font-semibold">
                … und dabei {prozent(0.01)} mehr Rendite erzielen
              </span>
              <span className="block text-slate-500">
                dieselben {euro(PROBEBEITRAG)}, aber {prozent(eingaben.rendite + 0.01)} statt{' '}
                {prozent(eingaben.rendite)} — <strong>statt</strong> der Zeile darüber,
                nicht zusätzlich
              </span>
            </>,
            euro(beiMehrRendite.renteMonat / zeile.kaufkraftfaktor),
            anteil(beiMehrRendite.renteMonat),
          ]}
          textSpalten={[2]}
        />
      </Tabelle>

      <div className="mt-4 break-inside-avoid rounded-lg border border-slate-300 bg-slate-50 p-3">
        <div className="text-[9px] font-bold uppercase tracking-wider text-slate-600">
          Das Wichtigste dieser Seite
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-800">
          Ein Prozentpunkt mehr Rendite bringt über {jahreBisRente} Jahre{' '}
          <strong>
            {euro((beiMehrRendite.endkapital - beiRendite.endkapital))}
          </strong>{' '}
          mehr Kapital — aus denselben {euro(PROBEBEITRAG)} im Monat. Das ist der Grund, warum
          Kosten eines Vertrags so schwer wiegen: Sie mindern genau diese Rendite, Jahr für Jahr.
          Zeit wirkt in dieselbe Richtung: Wer denselben Betrag fünf Jahre früher beginnt, hat am
          Ende spürbar mehr, ohne einen Euro mehr eingezahlt zu haben.
        </p>
      </div>

      <Text>
        Die Zahlen der ersten Zeile stammen aus einer vollständigen zweiten Berechnung mit
        verschobenem Rentenbeginn, nicht aus einer Faustformel. Sie fallen dabei eher{' '}
        <strong>zu niedrig</strong> aus: Die Rechnung schreibt Ihren heutigen Rentenanspruch fort,
        zählt also die Entgeltpunkte aus zwei weiteren Arbeitsjahren nicht mit. In Wirklichkeit
        wirkt später in Rente zu gehen stärker als hier ausgewiesen. Die beiden Sparzeilen
        unterstellen einen gleichbleibenden Beitrag; mit Dynamik verschiebt sich die Last, nicht
        das Ergebnis.
      </Text>
    </Seite>
  );
}
