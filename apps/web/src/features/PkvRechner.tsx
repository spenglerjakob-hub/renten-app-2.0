import { useMemo, useState } from 'react';
import { ChevronDown, HeartPulse, Mail } from 'lucide-react';
import { ZUSCHLAG_BIS_ALTER, PKV_BASISANTEIL, type Jahreszeile } from '@renten/engine';
import { useSzenario } from '../store/szenario';
import { euro, prozent, InfoPunkt } from '../components/Feld';
import { useSchmal } from '../components/useSchmal';
import { pkvRechnen, LEBENSERWARTUNG, SCHWELLE_ANTEIL, type PkvErgebnis } from './pkv-berechnung';
import { KNOPF_ZWEIT } from '../components/stil';

/**
 * Was die private Krankenversicherung im Ruhestand kostet.
 *
 * Der Rechner nahm die eingetragene Praemie bisher als feste Groesse durch
 * alle Jahrzehnte. Diese Ansicht zeigt, was daraus tatsaechlich wird — und
 * die Stufe bei 61, an der der gesetzliche Zuschlag wegfaellt (§ 149 VAG).
 */
export function PkvRechner({ zeile }: { zeile: Jahreszeile }) {
  const szenario = useSzenario((x) => x.szenario);
  const schmal = useSchmal();
  const [offen, setOffen] = useState(false);

  const r = useMemo(
    () => pkvRechnen(szenario, zeile),
    [szenario, zeile],
  );

  if (r === null) return null;

  const mailto = `mailto:?subject=${encodeURIComponent('Beitragsentlastungstarif — Beratung')}`;

  /*
    Beide Angaben stehen nebeneinander, weil sie verschiedene Dinge sind: der
    Entlastungstarif erhoeht, was heute abfliesst, der Arbeitgeberzuschuss
    senkt es. Der Zuschuss gilt fuer den GESAMTbeitrag, den Entlastungstarif
    eingeschlossen — bis zum Hoechstzuschuss. Selbststaendige bekommen keinen.
  */
  const teile: string[] = [];
  if (r.heute.betBeitragMonat > 0) {
    teile.push(`inkl. ${euro(r.heute.betBeitragMonat)} Entlastungstarif`);
  }
  if (r.zuschussHeute > 0) {
    teile.push(`abzüglich ${euro(r.zuschussHeute)} Arbeitgeberzuschuss auf den Beitrag`);
  }
  const heuteHinweis = teile.length > 0 ? teile.join(' · ') : 'im Monat';

  return (
    /* Einklappbar wie die Steuer-Engine: weisse Karte, Symbol in der Innenflaeche, Zahlen einfarbig. */
    <section className="ui-karte overflow-hidden print:hidden">
      <button
        type="button"
        onClick={() => setOffen((x) => !x)}
        aria-expanded={offen}
        className="flex w-full items-center justify-between gap-3 p-5 text-left transition-colors hover:bg-ui-innen sm:px-7 sm:py-6"
      >
        <span className="flex items-center gap-3">
          <span className="ui-innen flex h-10 w-10 shrink-0 items-center justify-center text-ui-tinte">
            <HeartPulse className="h-5 w-5" aria-hidden />
          </span>
          <span>
            <span className="block text-lg font-medium tracking-[-0.01em] text-ui-tinte sm:text-xl">
              Ihre private Krankenversicherung
            </span>
            <span className="mt-0.5 block text-sm text-ui-schiefer">
              Heute {euro(r.heute.gesamtMonat)} — im Jahr {r.rentenjahr} {euro(r.beiRente.praemieMonat)}
            </span>
          </span>
        </span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-ui-schiefer transition-transform ${offen ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      <div className={`px-5 pb-5 sm:px-7 sm:pb-7 ${offen ? 'block' : 'hidden'}`}>
        {/* So viele Spalten, wie mit lesbarer Breite passen: drei ueber die volle Breite, zwei in der Spalte des Ergebnisses. */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-3">
          <Kachel titel="Heute" wert={euro(r.heute.gesamtMonat)} hinweis={heuteHinweis} />
          <Kachel
            /* Alles, was dann abfliesst — die Praemie UND der Restbeitrag
               zum Entlastungstarif, der mit Rentenbeginn nicht endet. */
            titel={`Bei Rentenbeginn ${r.rentenjahr}`}
            wert={euro(r.beiRente.gesamtMonat)}
            hinweis={`in heutigem Geld ${euro(r.beiRenteHeutigesGeld)}`}
          />
          {r.mitAchtzig && (
            <Kachel
              titel="Mit 80"
              wert={euro(r.mitAchtzig.gesamtMonat)}
              hinweis={`in heutigem Geld ${euro(r.mitAchtzigHeutigesGeld)}`}
            />
          )}
        </div>

        <Verlaufskurve
          punkte={r.verlauf.map((x) => ({ alter: x.alter, wert: x.gesamtMonat }))}
          schmal={schmal}
        />

        <p className="mt-3 text-xs leading-relaxed text-ui-schiefer [&_strong]:font-medium [&_strong]:text-ui-tinte">
          Die Stufe nach unten liegt bei <strong>{ZUSCHLAG_BIS_ALTER + 1}</strong>: bis zum
          Kalenderjahr Ihres {ZUSCHLAG_BIS_ALTER}. Geburtstags wird der gesetzliche Zuschlag von
          10 % erhoben, danach entfällt er (§ 149 VAG). Ab 65 senken die daraus angesparten Mittel
          den Beitrag <em>nicht</em> — sie finanzieren Erhöhungen (§ 150 Abs. 3 VAG), die Kurve
          steigt dort also flacher. Ab 80 mindern nicht verbrauchte Mittel den Beitrag; das ist
          hier <strong>nicht</strong> gerechnet, die Kurve fällt insoweit eher zu hoch aus.
        </p>

        {r.bet && r.betNetto && (
          <BetKarte bet={r.bet} n={r.betNetto} abAlter={r.betAbAlter} />
        )}

        {/*
          Kein Banner, sondern eine Zahl mit einer Folgerung. Er erscheint nur,
          wenn der Beitrag im Ruhestand wirklich ins Gewicht faellt — sonst
          waere es Werbung statt eines Befunds.
        */}
        {!r.bet && r.anteilAmZiel >= SCHWELLE_ANTEIL && (
          <div className="ui-innen mt-5 p-4">
            <p className="text-xs leading-relaxed text-ui-tinte/80">
              <strong className="font-medium text-ui-tinte">
                Ihr Beitrag verbraucht im Jahr {r.rentenjahr} rund {prozent(r.anteilAmZiel, 0)} Ihres
                Zielnettos
              </strong>{' '}
              — {euro(r.beiRente.gesamtMonat)} von {euro(zeile.zielNettoMonat)}. Ein
              Beitragsentlastungstarif senkt genau diesen Betrag: Sie zahlen heute mehr, um im
              Ruhestand dauerhaft weniger zu zahlen. Ob sich das rechnet, hängt an Beitrag,
              Entlastung und Ihrer Lebenserwartung — tragen Sie ihn oben ein, dann steht die
              Gegenüberstellung hier.
            </p>
            <a href={mailto} className={`mt-3 ${KNOPF_ZWEIT}`}>
              <Mail className="h-4 w-4" aria-hidden /> Beratung dazu anfragen
            </a>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Der Beitragsverlauf als Kurve.
 *
 * Von Hand als SVG, wie der Einkommensverlauf und die Diagramme der
 * Landingpage — eine Bibliothek waere fuer eine Linie das Vielfache des
 * uebrigen Bundles. Auf dem Telefon eine schmalere viewBox statt einer
 * Mindestbreite, damit die Achsenschrift lesbar bleibt.
 */
function Verlaufskurve({ punkte, schmal }: {
  punkte: { alter: number; wert: number }[];
  schmal: boolean;
}) {
  if (punkte.length < 2) return null;

  const B = schmal ? 360 : 780;
  const H = schmal ? 220 : 260;
  const L = schmal ? 42 : 54;
  const R = schmal ? 18 : 16;
  const T = 12, U = 30;
  const plotB = B - L - R, plotH = H - T - U;

  const max = Math.max(...punkte.map((d) => d.wert), 1) * 1.1;
  const x = (i: number) => L + (i / (punkte.length - 1)) * plotB;
  const y = (v: number) => T + plotH - (v / max) * plotH;

  const pfad = punkte
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(d.wert).toFixed(1)}`)
    .join(' ');

  // Keine k-Abkuerzung: "1k" neben "616" las sich wie zwei verschiedene
  // Einheiten, und ein Monatsbeitrag hat hoechstens vier Stellen.
  const achse = (v: number) => Math.round(v).toLocaleString('de-DE');

  return (
    <figure className="m-0 mt-4">
      <svg viewBox={`0 0 ${B} ${H}`} className="h-auto w-full" role="img" aria-label="Beitragsverlauf">
        {[0, 0.5, 1].map((q) => (
          <g key={q}>
            <line x1={L} y1={y(max * q)} x2={B - R} y2={y(max * q)} style={{ stroke: 'rgb(var(--ui-linie))' }} strokeWidth="1" />
            <text x={L - 6} y={y(max * q) + 4} textAnchor="end" fontSize="12" style={{ fill: 'rgb(var(--ui-schiefer))' }}>
              {achse(max * q)}
            </text>
          </g>
        ))}
        {/* Die Kurve in Tinte — ein Beitrag ist keine Warnung. */}
        <path d={pfad} fill="none" style={{ stroke: 'rgb(var(--ui-tinte))' }} strokeWidth="2" />
        <line x1={L} y1={T + plotH} x2={B - R} y2={T + plotH} style={{ stroke: 'rgb(var(--ui-asche))' }} strokeWidth="1.5" />
        {punkte.map((d, i) =>
          d.alter % (schmal ? 10 : 5) === 0 ? (
            <text key={d.alter} x={x(i)} y={H - 10} textAnchor="middle" fontSize="12" style={{ fill: 'rgb(var(--ui-schiefer))' }}>
              {d.alter}
            </text>
          ) : null,
        )}
        <text x={B - R} y={H - 1} textAnchor="end" fontSize="11" style={{ fill: 'rgb(var(--ui-schiefer))' }}>Alter</text>
      </svg>
    </figure>
  );
}

/**
 * Der Entlastungstarif brutto UND netto.
 *
 * Brutto steht weiter da, weil es die Zahlen des Versicherers sind und man
 * sie im Vertrag wiederfindet. Netto ist, was entscheidet: Heute tragen
 * Arbeitgeber und Finanzamt einen Teil des Beitrags, im Ruhestand kostet die
 * niedrigere Praemie Sonderausgabenabzug — zu einem meist niedrigeren Satz.
 */
function BetKarte({ bet, n, abAlter }: {
  bet: NonNullable<PkvErgebnis['bet']>;
  n: NonNullable<PkvErgebnis['betNetto']>;
  abAlter: number;
}) {
  const alter = (x: number | null) =>
    x !== null ? `${x.toLocaleString('de-DE', { maximumFractionDigits: 0 })} Jahren` : 'nie';
  const zeilen: [string, string, string][] = [
    ['Beitrag heute im Monat', euro(n.beitragMonat), euro(n.aufwandMonat)],
    [`Ab ${abAlter} im Monat gespart`, euro(n.entlastungMonat - n.restbeitragMonat), euro(n.ersparnisMonat)],
    [`Eingezahlt über ${bet.jahreEinzahlung} Jahre`, euro(bet.eingezahlt), euro(n.eingezahlt)],
    [`Erspart bis ${LEBENSERWARTUNG}`, euro(bet.erspart - bet.restbeitrag), euro(n.erspart)],
    ['Getragen hat er sich mit', alter(bet.breakEvenAlter), alter(n.breakEvenAlter)],
  ];
  return (
    <div className="mt-5">
      <div className="mb-2 text-sm font-medium text-ui-tinte">
        Ihr Beitragsentlastungstarif
      </div>
      <table className="w-full overflow-hidden rounded-[8px] border border-ui-linie text-xs tabular-nums">
        <thead className="bg-ui-innen text-xs text-ui-schiefer">
          <tr>
            <th className="px-2.5 py-1.5 text-left font-medium" />
            <th className="px-2.5 py-1.5 text-right font-medium">Brutto</th>
            <th className="px-2.5 py-1.5 text-right font-medium text-ui-tinte">
              Netto
              <InfoPunkt titel="Wie aus brutto netto wird">
                <strong>Heute:</strong>{' '}
                {n.agMonat >= 0.5
                  ? <>Von {euro(n.beitragMonat)} Beitrag trägt Ihr Arbeitgeber {euro(n.agMonat)}.</>
                  : <>Einen Arbeitgeberzuschuss auf die {euro(n.beitragMonat)} gibt es nicht —
                      Selbstständige und Beamte bekommen keinen, Angestellte nicht mehr, wenn die
                      Prämie den Höchstzuschuss schon ausschöpft.</>}{' '}
                Ihr eigener Anteil zählt zu {prozent(PKV_BASISANTEIL, 0)} als Sonderausgabe und spart
                bei Ihrem heutigen Steuersatz {euro(n.steuerMonat)} — so kostet der Tarif Sie{' '}
                {euro(n.aufwandMonat)}.{' '}
                <strong>Ab {abAlter}:</strong> {euro(n.entlastungMonat)} Entlastung, abzüglich{' '}
                {euro(n.restbeitragMonat)} Restbeitrag, der weiterläuft. Die niedrigere Prämie
                mindert aber auch Ihren Sonderausgabenabzug; das kostet zum Steuersatz im Ruhestand{' '}
                {euro(n.steuerRuhestandMonat)}. Es bleiben {euro(n.ersparnisMonat)}. Gerechnet mit{' '}
                {prozent(n.steuersatzHeute, 0)} heute und {prozent(n.steuersatzRuhestand, 0)} im
                Ruhestand, jeweils je Euro Sonderausgabe samt Soli und Kirchensteuer.
              </InfoPunkt>
            </th>
          </tr>
        </thead>
        <tbody>
          {zeilen.map(([text, brutto, netto], i) => (
            <tr key={text} className={`border-t border-ui-linie ${i === zeilen.length - 1 ? 'font-medium' : ''}`}>
              <td className="px-2.5 py-1.5 text-ui-tinte/80">{text}</td>
              <td className="px-2.5 py-1.5 text-right text-ui-schiefer">{brutto}</td>
              <td className="px-2.5 py-1.5 text-right font-medium text-ui-tinte">{netto}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs leading-relaxed text-ui-schiefer">
        Brutto sind die Beträge aus dem Vertrag, die Ersparnis schon nach dem Restbeitrag.{' '}
        <strong className="font-medium text-ui-tinte">Netto</strong> nach Arbeitgeberzuschuss und Steuer — darauf kommt es an: Den
        Beitrag mindert heute Ihr höherer Steuersatz, die Entlastung kostet im Ruhestand Abzug zu
        einem meist niedrigeren. Nominal addiert, ohne Abzinsung; die Entlastung ist ein fester
        Betrag und verliert über die Jahre an Kaufkraft. Den genauen abziehbaren Anteil nennt die
        Beitragsbescheinigung Ihres Versicherers.
      </p>
    </div>
  );
}

/** Eine Zahl in der Innenflaeche: leises Etikett, der Betrag, darunter die Einordnung — einfarbig. */
function Kachel({ titel, wert, hinweis }: { titel: string; wert: string; hinweis: string }) {
  return (
    <div className="ui-innen p-4">
      <div className="text-xs text-ui-schiefer">{titel}</div>
      <div className="mt-0.5 text-xl font-medium tabular-nums text-ui-tinte">{wert}</div>
      <div className="mt-1 break-words text-xs leading-snug text-ui-schiefer hyphens-auto">{hinweis}</div>
    </div>
  );
}
