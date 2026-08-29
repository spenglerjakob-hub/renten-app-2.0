import { useMemo, useState } from 'react';
import { ArrowRight, Download, Info, TrendingUp } from 'lucide-react';
import {
  avdZulagen, avdAnsparphase, avdAuszahlung, parameterFuer,
  regelaltersrentenbeginn, parseDatum, haushaltssteuer,
  schaetzeEntgeltpunkte, rentenfreibetrag,
} from '@renten/engine';
import { importiere } from '@renten/schema';
import { Logo } from '../components/Logo';
import { ZahlFeld, ProzentFeld, DatumFeld, euro, prozent } from '../components/Feld';

const SPEICHER_SCHLUESSEL = 'rentenplaner.szenario.v1';

/**
 * Landingpage zum Altersvorsorgedepot.
 *
 * Eigener Einstiegspunkt, nicht Teil des Rechners: Wer ueber eine Suchmaschine
 * kommt, soll eine schnell ladende Seite zu genau dieser Frage sehen — und
 * ausdruecklich NICHT die Daten eines fremden oder eigenen Szenarios. Deshalb
 * startet die Seite mit leeren Feldern; uebernommen wird nur auf Knopfdruck.
 */
export function Seite() {
  const [beitragMonat, setBeitragMonat] = useState(0);
  const [kinder, setKinder] = useState(0);
  const [geburtsdatum, setGeburtsdatum] = useState('');
  const [bruttoJahr, setBruttoJahr] = useState(0);
  const [rendite, setRendite] = useState(0.06);
  const [uebernommen, setUebernommen] = useState<string | null>(null);

  const jetzt = new Date().getFullYear();
  const p = parameterFuer(Math.max(jetzt, 2027), { indexRate: 0.01 });
  const a = p.avd;

  const geburt = parseDatum(geburtsdatum);
  const rentenbeginn = geburt ? regelaltersrentenbeginn(geburt) : null;
  const alterHeute = geburt ? jetzt - geburt.jahr : 0;
  const startjahr = Math.max(jetzt, a.abJahr);
  const jahreBisRente = rentenbeginn ? Math.max(0, rentenbeginn.jahr - startjahr) : 0;
  const alterBeiRente = geburt && rentenbeginn ? rentenbeginn.jahr - geburt.jahr : 0;

  const zulagen = useMemo(
    () => avdZulagen({ eigenbeitragJahr: beitragMonat * 12, kinder, alter: alterHeute }, a),
    [beitragMonat, kinder, alterHeute, a],
  );

  const lauf = useMemo(() => {
    if (!geburt || jahreBisRente <= 0 || beitragMonat <= 0) return null;
    const anspar = avdAnsparphase(
      {
        beitragMonat, dynamik: 0, startkapital: 0, jahre: jahreBisRente,
        renditeBrutto: rendite, ter: 0.002, kinder, alterHeute, startjahr,
      },
      p,
    );
    const aus = avdAuszahlung(
      { kapital: anspar.endkapital, alterBeiBeginn: alterBeiRente, dauerJahre: 25, rendite: 0.02 },
      a,
    );
    return { anspar, aus };
  }, [geburt, jahreBisRente, beitragMonat, rendite, kinder, alterHeute, startjahr, alterBeiRente, p, a]);

  /**
   * Steuer auf die Auszahlung. Das Altersvorsorgedepot ist VOLLSTAENDIG
   * nachgelagert zu versteuern, mit dem persoenlichen Satz — nicht mit den
   * 25 % der Abgeltungsteuer.
   *
   * Entscheidend ist deshalb der Steuersatz IM ALTER, und der haengt fast
   * immer an der gesetzlichen Rente. Wird nur das Depot gerechnet, bleibt der
   * Betrag oft unter dem Grundfreibetrag und die Auszahlung erscheint
   * steuerfrei — ein Ergebnis, das kaum jemanden betrifft. Ist ein
   * Bruttoeinkommen angegeben, wird daraus die gesetzliche Rente geschaetzt
   * und mitgerechnet; das Depot wird dann mit dem Satz belastet, den es beim
   * Nutzer tatsaechlich ausloest.
   */
  const netto = useMemo(() => {
    if (!lauf || lauf.aus.bruttoJahr <= 0 || !rentenbeginn) return null;
    const pRente = parameterFuer(rentenbeginn.jahr, { indexRate: 0.01 });

    // Geschaetzte gesetzliche Rente, nominal zum Rentenbeginn.
    let grvJahr = 0;
    if (bruttoJahr > 0) {
      const sch = schaetzeEntgeltpunkte(bruttoJahr, alterHeute, alterBeiRente, p);
      grvJahr = sch.monatsrenteHeutigeKaufkraft * 12 * Math.pow(1.01, rentenbeginn.jahr - jetzt);
    }
    const fb = rentenfreibetrag(rentenbeginn.jahr, grvJahr);
    const grvZve = Math.max(0, grvJahr - fb.jahresbetrag - pRente.pauschbetraege.renten);

    const optionen = {
      verheiratet: false, bundesland: 'Baden-Württemberg', kirchensteuerpflichtig: false,
      vorsorgeaufwand: 0, weitereAbzuege: pRente.pauschbetraege.sonderausgaben,
    };
    const depotQuelle = {
      id: 'avd', bezeichnung: 'Altersvorsorgedepot',
      brutto: lauf.aus.bruttoJahr, zveBeitrag: lauf.aus.bruttoJahr, kvPv: 0,
    };
    const grvQuelle = {
      id: 'grv', bezeichnung: 'Gesetzliche Rente', brutto: grvJahr, zveBeitrag: grvZve, kvPv: 0,
    };

    // Die Mehrsteuer, die genau das Depot ausloest — nicht der Durchschnitt
    // ueber beide Einkuenfte. Nur so ist der Vergleich mit einem freien Depot
    // ehrlich, bei dem ebenfalls nur der Ertrag besteuert wird.
    const gesamt = haushaltssteuer(grvJahr > 0 ? [grvQuelle, depotQuelle] : [depotQuelle], optionen, pRente);
    const ohne = grvJahr > 0
      ? haushaltssteuer([grvQuelle], optionen, pRente)
      : { est: 0, soli: 0, kirchensteuer: 0 };

    const summe = (x: { est: number; soli: number; kirchensteuer: number }) =>
      x.est + x.soli + x.kirchensteuer;
    const steuer = Math.max(0, summe(gesamt) - summe(ohne));

    return {
      steuer,
      nettoJahr: lauf.aus.bruttoJahr - steuer,
      grvJahr,
      satz: lauf.aus.bruttoJahr > 0 ? steuer / lauf.aus.bruttoJahr : 0,
    };
  }, [lauf, rentenbeginn, bruttoJahr, alterHeute, alterBeiRente, p, jetzt]);

  const uebernehmen = () => {
    try {
      const roh = localStorage.getItem(SPEICHER_SCHLUESSEL);
      if (!roh) { setUebernommen('Es ist noch keine Planung gespeichert.'); return; }
      const r = importiere(roh);
      if (!r.ok) { setUebernommen('Die gespeicherte Planung ließ sich nicht lesen.'); return; }

      const s = r.szenario;
      const person = s.personen[0];
      if (person?.geburtsdatum) setGeburtsdatum(person.geburtsdatum);
      setKinder(s.haushalt.kinderUnter25);
      const e = s.einkommenHeute;
      if (e.modus !== 'besoldung') setBruttoJahr(Math.round(e.betrag * e.auszahlungen));
      setUebernommen('Geburtsdatum, Kinder und Einkommen wurden übernommen.');
    } catch {
      setUebernommen('Auf den Speicher des Browsers ließ sich nicht zugreifen.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <header className="bg-slate-900 text-white">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-4 sm:px-6">
          <Logo klasse="h-9 w-9" />
          <div>
            <a href="/" className="text-sm font-black tracking-tight hover:underline">JS-Rentenplaner</a>
            <p className="text-[11px] text-slate-400">Ihre Zukunft. Smart geplant.</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
        <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
          Altersvorsorgedepot: Was Ihnen der Staat ab 2027 dazugibt
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
          Ab dem <strong>1. Januar 2027</strong> löst das geförderte Altersvorsorgedepot die
          Riester-Rente ab. Anders als dort gibt es keine Beitragsgarantie und keinen Zwang zur
          Versicherung — Sie sparen in Fonds oder ETFs und bekommen trotzdem Zulagen. Rechnen Sie
          hier aus, wie viel das in Ihrem Fall ist.
        </p>

        {/* --- Rechner --- */}
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Ihre Angaben</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <ZahlFeld label="Beitrag monatlich" wert={beitragMonat} onChange={setBeitragMonat} einheit="€"
              hilfe="Ab 10 € im Monat gibt es Zulagen, ab 150 € die volle Grundzulage." />
            <ZahlFeld label="Kinder mit Kindergeldanspruch" wert={kinder} onChange={setKinder} max={15} />
            <DatumFeld label="Geburtsdatum" wert={geburtsdatum} onChange={setGeburtsdatum}
              hilfe="Acht Ziffern genügen — die Punkte setzt das Feld." />
            <ZahlFeld label="Bruttoeinkommen im Jahr" wert={bruttoJahr} onChange={setBruttoJahr} einheit="€"
              hilfe="Die Zulagen hängen allein vom Beitrag ab. Das Einkommen dient der Schätzung Ihrer gesetzlichen Rente — und damit Ihres Steuersatzes im Alter." />
            <ProzentFeld label="Erwartete Rendite p. a." wert={rendite} onChange={setRendite} />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={uebernehmen}
              className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-4 w-4" aria-hidden /> Daten aus meiner Planung übernehmen
            </button>
            <a
              href="/"
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-bold text-white hover:bg-indigo-500"
            >
              Im Rentenplaner weiterrechnen <ArrowRight className="h-4 w-4" aria-hidden />
            </a>
          </div>
          {uebernommen && (
            <p className="mt-2 text-xs text-slate-600">{uebernommen}</p>
          )}
        </section>

        {/* --- Zulagen --- */}
        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Ihre Förderung je Jahr
          </h2>

          {beitragMonat <= 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
              Tragen Sie oben einen monatlichen Beitrag ein.
            </p>
          ) : (
            <>
              <dl className="mt-3 divide-y divide-slate-100">
                <Zeile text={`Grundzulage Stufe 1 — 50 % auf die ersten ${euro(a.stufe1Grenze)}`} wert={euro(zulagen.stufe1)} />
                <Zeile text={`Grundzulage Stufe 2 — 25 % auf die weiteren ${euro(a.stufe2Grenze - a.stufe1Grenze)}`} wert={euro(zulagen.stufe2)} />
                {kinder > 0 && (
                  <Zeile text={`Kinderzulage — ${euro(a.kinderzulage)} je Kind`} wert={euro(zulagen.kinderzulage)} />
                )}
                {zulagen.bonus > 0 && (
                  <Zeile text={`Berufseinsteigerbonus — einmalig unter ${a.berufseinsteigerAlterMax}`} wert={euro(zulagen.bonus)} />
                )}
                <div className="flex items-baseline justify-between gap-4 pt-3">
                  <dt className="text-sm font-bold text-slate-800">Zulagen im Jahr</dt>
                  <dd className="text-xl font-black tabular-nums text-emerald-700">{euro(zulagen.gesamt)}</dd>
                </div>
              </dl>

              <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                Auf {euro(beitragMonat * 12)} eigenen Beitrag kommen {euro(zulagen.gesamt)} vom Staat —
                das sind <strong>{prozent(zulagen.foerderquote)}</strong> obendrauf.
              </p>

              {zulagen.hinweise.map((h) => (
                <p key={h} className="mt-2 flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {h}
                </p>
              ))}
            </>
          )}
        </section>

        {/* --- Hochrechnung --- */}
        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            <TrendingUp className="h-4 w-4" aria-hidden /> Bis zu Ihrem Rentenbeginn
          </h2>

          {!geburt ? (
            <p className="mt-3 rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
              Tragen Sie oben Ihr Geburtsdatum ein — daraus ergibt sich Ihr Rentenbeginn.
            </p>
          ) : !lauf ? (
            <p className="mt-3 rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
              Tragen Sie oben einen monatlichen Beitrag ein.
            </p>
          ) : (
            <>
              <p className="mt-2 text-sm text-slate-600">
                Regelaltersgrenze <strong>{alterBeiRente}</strong>, Rentenbeginn also{' '}
                <strong>{String(rentenbeginn!.monat).padStart(2, '0')}/{rentenbeginn!.jahr}</strong>.
                Gerechnet ab {startjahr}, das sind {jahreBisRente} Beitragsjahre.
              </p>

              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Kachel titel="Ihre Eigenbeiträge" wert={euro(lauf.anspar.eigenbeitraege)} />
                <Kachel titel="Zulagen vom Staat" wert={euro(lauf.anspar.zulagenGesamt)} farbe="text-emerald-700" />
                <Kachel titel="Kapital bei Rentenbeginn" wert={euro(lauf.anspar.endkapital)} />
                <Kachel
                  titel="Auszahlung netto"
                  wert={netto ? `${euro(netto.nettoJahr / 12)} / Monat` : '—'}
                  farbe="text-indigo-700"
                />
              </div>

              {netto && (
                <p className="mt-3 text-xs leading-relaxed text-slate-600">
                  Über {lauf.aus.dauerJahre} Jahre ausgezahlt: {euro(lauf.aus.bruttoJahr / 12)} brutto im Monat,
                  davon {euro(netto.steuer / 12)} Steuer ({prozent(netto.satz)}). Das Altersvorsorgedepot ist{' '}
                  <strong>voll nachgelagert zu versteuern</strong> — mit Ihrem persönlichen Satz, nicht
                  mit den 25 % der Abgeltungsteuer.{' '}
                  {netto.grvJahr > 0 ? (
                    <>
                      Mitgerechnet ist eine geschätzte gesetzliche Rente von{' '}
                      {euro(netto.grvJahr / 12)} im Monat; ausgewiesen ist die Steuer, die genau das
                      Depot zusätzlich auslöst.
                    </>
                  ) : (
                    <>
                      <strong>Ohne Angabe Ihres Einkommens</strong> ist das Depot hier die einzige
                      Einkunft und bleibt deshalb weitgehend unter dem Grundfreibetrag. Tragen Sie
                      oben Ihr Bruttoeinkommen ein — dann wird die gesetzliche Rente geschätzt und
                      die Auszahlung mit dem Satz belastet, der Sie wirklich trifft.
                    </>
                  )}
                </p>
              )}

              {lauf.aus.hinweise.map((h) => (
                <p key={h} className="mt-2 flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {h}
                </p>
              ))}
            </>
          )}
        </section>

        {/* --- Einordnung --- */}
        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Was Sie wissen sollten
          </h2>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-700">
            <li>
              <strong>Die Förderung ist gestaffelt.</strong> Auf die ersten {euro(a.stufe1Grenze)} im Jahr
              gibt es {Math.round(a.stufe1Satz * 100)} %, auf die weiteren{' '}
              {euro(a.stufe2Grenze - a.stufe1Grenze)} noch {Math.round(a.stufe2Satz * 100)} %. Darüber
              steigt die Grundzulage nicht mehr — die höchste Förderquote erreichen kleine Beiträge.
            </li>
            <li>
              <strong>Unter {euro(a.mindesteigenbeitragJahr)} im Jahr gibt es gar nichts.</strong> Nicht
              anteilig weniger, sondern null. Das war schon bei Riester der häufigste Fehler.
            </li>
            <li>
              <strong>Ausgezahlt wird ab {a.auszahlungAbAlter}</strong>, als lebenslange Rente oder als
              Auszahlplan, der mindestens bis {a.auszahlplanBisAlter} läuft. Eine freie Entnahme des
              Kapitals ist nicht vorgesehen.
            </li>
            <li>
              <strong>In der Ansparphase fällt keine Vorabpauschale an.</strong> Gegenüber einem freien
              Depot bleibt dadurch mehr investiert — der Unterschied wächst über die Jahre.
            </li>
            <li>
              <strong>Dafür ist die Auszahlung voll steuerpflichtig.</strong> Ein freies Depot zahlt
              25 % Abgeltungsteuer nur auf den Gewinn; hier wird der gesamte Betrag mit dem
              persönlichen Satz besteuert. Ob sich die Förderung lohnt, entscheidet sich genau an
              diesem Punkt — und damit an Ihrem Steuersatz im Alter.
            </li>
          </ul>

          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
            <strong>Offener Punkt:</strong> Zum steuerlichen Höchstbetrag des Sonderausgabenabzugs
            widersprechen sich die zugänglichen Quellen. Diese Seite rechnet deshalb <em>ohne</em>{' '}
            Sonderausgabenabzug — die ausgewiesene Förderung ist also die untere Grenze. Die
            Zulagenbeträge selbst sind gesetzlich festgelegt und gesichert.
          </p>
        </section>

        <p className="mt-6 text-center text-xs leading-relaxed text-slate-500">
          Modellrechnung ohne Gewähr. Keine Steuer-, Renten- oder Anlageberatung. Rechtsstand des
          am 8. Mai 2026 verabschiedeten Gesetzes, Anwendung ab 1. Januar 2027. Die Berechnung läuft
          vollständig in Ihrem Browser — Ihre Eingaben verlassen dieses Gerät nicht.
        </p>
      </main>
    </div>
  );
}

function Zeile({ text, wert }: { text: string; wert: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-sm text-slate-600">{text}</dt>
      <dd className="shrink-0 text-sm font-bold tabular-nums text-slate-800">{wert}</dd>
    </div>
  );
}

function Kachel({ titel, wert, farbe = 'text-slate-800' }: { titel: string; wert: string; farbe?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{titel}</div>
      <div className={`text-base font-black tabular-nums ${farbe}`}>{wert}</div>
    </div>
  );
}
