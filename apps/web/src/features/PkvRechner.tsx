import { useMemo, useState } from 'react';
import { ChevronDown, HeartPulse, Mail } from 'lucide-react';
import { ZUSCHLAG_BIS_ALTER, PKV_BASISANTEIL, type Jahreszeile } from '@renten/engine';
import { useSzenario } from '../store/szenario';
import { euro, prozent, InfoPunkt } from '../components/Feld';
import { useSchmal } from '../components/useSchmal';
import { pkvRechnen, LEBENSERWARTUNG, SCHWELLE_ANTEIL, type PkvErgebnis } from './pkv-berechnung';

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
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm print:hidden">
      <button
        type="button"
        onClick={() => setOffen((x) => !x)}
        aria-expanded={offen}
        className="flex w-full items-center justify-between gap-3 p-3 text-left sm:p-4"
      >
        <span className="flex items-center gap-2">
          <HeartPulse className="h-4 w-4 shrink-0 text-rose-600" aria-hidden />
          <span>
            <span className="block text-xs font-bold text-slate-800 sm:text-sm">
              Ihre private Krankenversicherung
            </span>
            <span className="block text-[10px] text-slate-500 sm:text-xs">
              Heute {euro(r.heute.gesamtMonat)} — im Jahr {r.rentenjahr} {euro(r.beiRente.praemieMonat)}
            </span>
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${offen ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      <div className={`border-t border-slate-100 p-3 sm:p-4 ${offen ? 'block' : 'hidden'}`}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Kachel titel="Heute" wert={euro(r.heute.gesamtMonat)} hinweis={heuteHinweis} />
          <Kachel
            /* Alles, was dann abfliesst — die Praemie UND der Restbeitrag
               zum Entlastungstarif, der mit Rentenbeginn nicht endet. */
            titel={`Bei Rentenbeginn ${r.rentenjahr}`}
            wert={euro(r.beiRente.gesamtMonat)}
            hinweis={`in heutigem Geld ${euro(r.beiRenteHeutigesGeld)}`}
            akzent
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

        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
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
          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
            <p className="text-xs leading-relaxed text-amber-900">
              <strong>
                Ihr Beitrag verbraucht im Jahr {r.rentenjahr} rund {prozent(r.anteilAmZiel, 0)} Ihres
                Zielnettos
              </strong>{' '}
              — {euro(r.beiRente.gesamtMonat)} von {euro(zeile.zielNettoMonat)}. Ein
              Beitragsentlastungstarif senkt genau diesen Betrag: Sie zahlen heute mehr, um im
              Ruhestand dauerhaft weniger zu zahlen. Ob sich das rechnet, hängt an Beitrag,
              Entlastung und Ihrer Lebenserwartung — tragen Sie ihn oben ein, dann steht die
              Gegenüberstellung hier.
            </p>
            <a
              href={mailto}
              className="mt-2 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-500"
            >
              <Mail className="h-3.5 w-3.5" aria-hidden /> Beratung dazu anfragen
            </a>
          </div>
        )}
      </div>
    </div>
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
            <line x1={L} y1={y(max * q)} x2={B - R} y2={y(max * q)} stroke="#e2e8f0" strokeWidth="1" />
            <text x={L - 6} y={y(max * q) + 4} textAnchor="end" fontSize="12" fill="#64748b">
              {achse(max * q)}
            </text>
          </g>
        ))}
        <path d={pfad} fill="none" stroke="#e11d48" strokeWidth="2" />
        <line x1={L} y1={T + plotH} x2={B - R} y2={T + plotH} stroke="#94a3b8" strokeWidth="1.5" />
        {punkte.map((d, i) =>
          d.alter % (schmal ? 10 : 5) === 0 ? (
            <text key={d.alter} x={x(i)} y={H - 10} textAnchor="middle" fontSize="12" fill="#64748b">
              {d.alter}
            </text>
          ) : null,
        )}
        <text x={B - R} y={H - 1} textAnchor="end" fontSize="11" fill="#94a3b8">Alter</text>
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
      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        Ihr Beitragsentlastungstarif
      </div>
      <table className="w-full overflow-hidden rounded-lg border border-slate-200 text-xs tabular-nums">
        <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-2.5 py-1.5 text-left font-bold" />
            <th className="px-2.5 py-1.5 text-right font-bold">Brutto</th>
            <th className="px-2.5 py-1.5 text-right font-bold text-emerald-700">
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
            <tr key={text} className={`border-t border-slate-100 ${i === zeilen.length - 1 ? 'font-bold' : ''}`}>
              <td className="px-2.5 py-1.5 text-slate-600">{text}</td>
              <td className="px-2.5 py-1.5 text-right text-slate-500">{brutto}</td>
              <td className="px-2.5 py-1.5 text-right font-semibold text-slate-900">{netto}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
        Brutto sind die Beträge aus dem Vertrag, die Ersparnis schon nach dem Restbeitrag.{' '}
        <strong>Netto</strong> nach Arbeitgeberzuschuss und Steuer — darauf kommt es an: Den
        Beitrag mindert heute Ihr höherer Steuersatz, die Entlastung kostet im Ruhestand Abzug zu
        einem meist niedrigeren. Nominal addiert, ohne Abzinsung; die Entlastung ist ein fester
        Betrag und verliert über die Jahre an Kaufkraft. Den genauen abziehbaren Anteil nennt die
        Beitragsbescheinigung Ihres Versicherers.
      </p>
    </div>
  );
}

function Kachel({ titel, wert, hinweis, akzent }: {
  titel: string; wert: string; hinweis: string; akzent?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-3 ${akzent ? 'border-rose-300 bg-rose-50/60' : 'border-slate-200 bg-slate-50'}`}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{titel}</div>
      <div className={`mt-0.5 text-lg font-black tabular-nums ${akzent ? 'text-rose-900' : 'text-slate-900'}`}>
        {wert}
      </div>
      <div className="mt-0.5 text-[10px] leading-tight text-slate-500">{hinweis}</div>
    </div>
  );
}
