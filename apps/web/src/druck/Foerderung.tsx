import type { ReactNode } from 'react';
import {
  avdAnsparphase, type FoerderBefund, type FoerderKontext, type Jahreszeile, type LegalParameters,
} from '@renten/engine';
import { euro, euroGenau, prozent } from '../components/Feld';
import { Seite, Text } from './Bausteine';

/**
 * „Förderung, die Sie nicht nutzen" — der Fördercheck als eigene Seite.
 *
 * Er stand vorher klein am Ende der Stellschrauben, als Tabellenzeile je
 * Befund. Die Stellschrauben sind entfallen; der Platz geht an das, was ein
 * Kunde tatsaechlich tun kann: je Befund ein Rechenbeispiel fuer einen Monat
 * und eine Hochrechnung bis zum Rentenbeginn.
 *
 * Gerechnet wird mit den Befunden des Foerderchecks — derselben Funktion wie
 * am Bildschirm. Die Hochrechnung multipliziert deren Jahreswerte mit den
 * Jahren bis zur Rente; nur beim Altersvorsorgedepot laeuft die echte
 * Ansparphase, weil dort die Kinderzulage mit dem Kindergeld auslaeuft und
 * eine Multiplikation zu viel versprechen wuerde.
 */
export function Foerderung({
  befunde, kontext, p, zeile, rendite, ohneBeitrag,
}: {
  befunde: FoerderBefund[];
  kontext: FoerderKontext;
  p: LegalParameters;
  zeile: Jahreszeile;
  /** Rendite nach Kosten fuer die Hochrechnung — dieselbe wie beim Sparziel */
  rendite: number;
  ohneBeitrag: number;
}) {
  const jahreBisRente = Math.max(0, zeile.jahr - kontext.jahr);

  return (
    <Seite titel="Förderung, die Sie nicht nutzen" nummer="Geld vom Staat und vom Arbeitgeber">
      <Text>
        Welche Förderung Ihnen heute entgeht — je Weg ein Rechenbeispiel für einen Monat und eine
        Hochrechnung bis zu Ihrem Rentenbeginn {zeile.jahr}. Die Beispielbeträge sind keine
        Empfehlung über die Höhe.
      </Text>

      {befunde.map((b) => (
        <Befund
          key={b.id}
          b={b}
          kontext={kontext}
          p={p}
          zeile={zeile}
          jahreBisRente={jahreBisRente}
          rendite={rendite}
        />
      ))}

      <Text>
        Hochgerechnet mit Ihren heutigen Steuer- und Beitragssätzen, ohne Beitragsdynamik und
        nominal — ein Euro in {jahreBisRente} Jahren ist weniger wert als heute. Das
        Vertragsguthaben ist mit {prozent(rendite)} Rendite nach Kosten gerechnet, derselben
        Annahme wie auf der Seite „Was Sie jetzt tun können“.
        {ohneBeitrag > 0 && (
          <>
            {' '}Zu {ohneBeitrag === 1 ? 'einem Ihrer geförderten Verträge' : `${ohneBeitrag} Ihrer geförderten Verträge`}{' '}
            ist kein laufender Beitrag erfasst; der freie Rahmen ist insoweit zu groß ausgewiesen.
          </>
        )}
      </Text>
    </Seite>
  );
}

/** Endwert einer monatlichen Sparrate — jaehrliche Rendite, monatlich verzinst. */
function endwert(monat: number, jahre: number, rendite: number): number {
  const n = jahre * 12;
  if (n <= 0 || monat <= 0) return 0;
  const i = Math.pow(1 + rendite, 1 / 12) - 1;
  return i === 0 ? monat * n : monat * ((Math.pow(1 + i, n) - 1) / i) * (1 + i);
}

function Befund({
  b, kontext, p, zeile, jahreBisRente, rendite,
}: {
  b: FoerderBefund;
  kontext: FoerderKontext;
  p: LegalParameters;
  zeile: Jahreszeile;
  jahreBisRente: number;
  rendite: number;
}) {
  const ag = b.agZuschussMonat ?? 0;
  const mitAg = ag >= 0.5;
  const zufluss = b.zuflussMonat ?? b.probeMonat;
  const steuerUeberZulage = b.probeMonat - b.nettoAufwandMonat;

  /* --- Das Rechenbeispiel fuer EINEN Monat --- */
  const monat: [string, ReactNode, boolean?][] = [];
  if (b.foerderArt === 'zulage') {
    monat.push(['Ihr Beitrag', euro(b.probeMonat)]);
    monat.push(['+ Zulage vom Staat', euro(b.ersparnisJahr / 12)]);
    monat.push(['= fließt ins Depot', euro(zufluss), true]);
    if (steuerUeberZulage >= 0.5) {
      monat.push(['Steuervorteil über die Zulage hinaus', `− ${euro(steuerUeberZulage)}`]);
    }
    monat.push(['Kostet Sie netto', euro(b.nettoAufwandMonat), true]);
  } else if (b.id === 'bav') {
    monat.push(['Ihr Beitrag (Entgeltumwandlung)', euro(b.probeMonat)]);
    if (mitAg) {
      monat.push(['+ Arbeitgeberzuschuss (§ 1a Abs. 1a BetrAVG)', euroGenau(ag)]);
      monat.push(['= fließt in den Vertrag', euroGenau(zufluss), true]);
    }
    monat.push(['− Steuer und Sozialabgaben gespart', euro(b.ersparnisJahr / 12)]);
    monat.push(['Kostet Sie netto', euro(b.nettoAufwandMonat), true]);
  } else {
    monat.push(['Ihr Beitrag', euro(b.probeMonat)]);
    monat.push(['− Steuer gespart', euro(b.ersparnisJahr / 12)]);
    monat.push(['Kostet Sie netto', euro(b.nettoAufwandMonat), true]);
  }

  /* --- Die Hochrechnung bis zum Rentenbeginn --- */
  const rente: [string, ReactNode, boolean?][] = [];
  let jahre = jahreBisRente;
  if (b.id === 'avd') {
    /*
      Die echte Ansparphase, zweimal: mit dem Hoechstbetrag und mit dem
      heutigen Beitrag. Die Differenz ist, was der Befund zusaetzlich
      bringt — dieselbe Blickrichtung wie der Befund selbst.
    */
    const start = Math.max(kontext.jahr, p.avd.abJahr);
    jahre = Math.max(0, zeile.jahr - start);
    const lauf = (beitragMonat: number) => avdAnsparphase(
      {
        beitragMonat, dynamik: 0, startkapital: 0, jahre,
        renditeBrutto: rendite, ter: 0,
        kinder: kontext.kinder, alterHeute: kontext.alter + (start - kontext.jahr), startjahr: start,
      },
      p,
    );
    const voll = lauf(p.avd.hoechstbetragEigenbeitrag / 12);
    const heute = lauf(kontext.avdEigenbeitragJahr / 12);
    rente.push(['Ihre Beiträge', euro(voll.eigenbeitraege - heute.eigenbeitraege)]);
    rente.push(['Zulagen vom Staat', euro(voll.zulagenGesamt - heute.zulagenGesamt), true]);
    rente.push([`Depot bei Rentenbeginn (${prozent(rendite)})`, euro(voll.endkapital - heute.endkapital)]);
  } else {
    const jahr = (monatsbetrag: number) => euro(monatsbetrag * 12 * jahre);
    rente.push(['Ihre Beiträge', jahr(b.probeMonat)]);
    if (mitAg) rente.push(['Vom Arbeitgeber', jahr(ag), true]);
    rente.push([
      b.id === 'bav' ? 'Steuer und Sozialabgaben gespart' : 'Steuer gespart',
      euro(b.ersparnisJahr * jahre), true,
    ]);
    rente.push([`Vertragsguthaben (${prozent(rendite)})`, euro(endwert(zufluss, jahre, rendite))]);
  }

  return (
    <div className="mt-3 break-inside-avoid rounded-lg border border-emerald-300 px-3 py-2">
      <div className="flex items-baseline justify-between gap-4 border-b border-emerald-100 pb-1.5">
        <h4 className="text-[13px] font-bold text-slate-900">{b.titel}</h4>
        <span className="shrink-0 text-right">
          <span className="block text-base font-black tabular-nums text-emerald-700">
            {b.foerderArt === 'zulage' ? euro(b.ersparnisJahr) : euro(b.rahmenMonat)}
          </span>
          <span className="block text-[9px] font-bold uppercase tracking-wider text-emerald-600">
            {b.foerderArt === 'zulage' ? 'Zulage im Jahr' : 'im Monat frei'}
          </span>
        </span>
      </div>

      <p className="mt-1.5 text-[11px] leading-snug text-slate-700">{b.text}</p>

      <div className="mt-1.5 grid grid-cols-2 gap-x-6">
        <dl>
          <div className="mb-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">
            Beispiel für einen Monat
          </div>
          {monat.map(([feld, wert, fett]) => (
            <Posten key={feld} feld={feld} wert={wert} fett={fett} />
          ))}
        </dl>
        <dl>
          <div className="mb-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">
            Bis zum Rentenbeginn — {jahre} Jahre
          </div>
          {rente.map(([feld, wert, fett]) => (
            <Posten key={feld} feld={feld} wert={wert} fett={fett} />
          ))}
        </dl>
      </div>

      {(b.hinweis || b.id === 'bav') && (
        <p className="mt-1.5 text-[10px] leading-snug text-slate-500">
          {/* Bei der bAV ersetzt der eigene Satz den Hinweis auf die zweite
              Stufe — der passt auf dem Bildschirm, hier kostet er Platz, den
              die Hochrechnung braucht. */}
          {b.id === 'bav'
            ? <>
                {mitAg ? 'Den Zuschuss schuldet der Arbeitgeber, soweit er selbst Sozialabgaben spart (Direktversicherung, Pensionskasse, Pensionsfonds; Tarifverträge können abweichen). ' : ''}
                Auf den umgewandelten Betrag fließen keine Rentenbeiträge — die gesetzliche Rente
                fällt dadurch etwas niedriger aus.
              </>
            : b.hinweis}
          <span className="text-slate-400"> · {b.paragraf}</span>
        </p>
      )}
      {!(b.hinweis || b.id === 'bav') && (
        <p className="mt-1 text-[9px] text-slate-400">{b.paragraf}</p>
      )}
    </div>
  );
}

/** Eine Zeile der Beispielrechnung — enger als `Angabe`, damit drei Wege auf eine Seite passen. */
function Posten({ feld, wert, fett }: { feld: string; wert: ReactNode; fett?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 border-b border-dotted border-slate-200 py-0.5 text-[11px] ${fett ? 'font-bold text-slate-900' : 'text-slate-600'}`}>
      <dt>{feld}</dt>
      <dd className="text-right tabular-nums text-slate-900">{wert}</dd>
    </div>
  );
}
