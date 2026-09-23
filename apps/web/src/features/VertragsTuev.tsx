import { useMemo } from 'react';
import { SearchCheck, Trash2, Plus, TrendingUp, Calculator } from 'lucide-react';
import { parameterFuer, parseDatum, toDe, type ProjektionsErgebnis } from '@renten/engine';
import {
  tuevPositionen, tuevBasis, belastungsTreppe, laufendeZulageJahr, laufzeitText,
} from './tuev-berechnung';
import { kenntKapitalwahl } from './vertragsarten';
import { EinkommenFelder } from './EinkommenFelder';
import { personNameAus } from './personen';
import { Foerdercheck } from './Foerdercheck';
import { useSzenario, type SzenarioParsed } from '../store/szenario';
import {
  ZahlFeld, ProzentFeld, DatumFeld, Schalter, Kennzahl, GegenueberZeile, Abschnitt, euro, euroGenau,
  prozent, TON,
} from '../components/Feld';
import { KinderZeilen, KinderHinweis } from '../components/KinderFelder';

type TuevEintrag = SzenarioParsed['tuev'][number];

const auf2 = (n: number) => Math.round(n * 100) / 100;

/**
 * „Hat sich der Beitrag zwischenzeitlich geaendert?" — fruehere Beitraege
 * einer bAV, etwa vor einem Arbeitgeberwechsel.
 *
 * EINGABE ALS ARBEITNEHMER + ARBEITGEBER, so wie es auf dem Gehaltszettel
 * steht. Gespeichert wird wie oben (Gesamtbeitrag und AG-Anteil darin),
 * damit Rechenkern und Anzeige eine Logik haben; die Summe steht darunter.
 *
 * „Gezahlt bis" ist der LETZTE Monat mit diesem Beitrag — ab dem Folgemonat
 * gilt die naechste Stufe bzw. der Beitrag oben.
 */
function FruehereBeitraege({ t, aendern }: {
  t: TuevEintrag;
  aendern: (p: Partial<TuevEintrag>) => void;
}) {
  const stufen = t.fruehereBeitraege;
  const beginn = parseDatum(t.beginnDatum ?? `01.01.${t.beginnJahr}`);
  const jetzt = new Date();
  const heuteIndex = jetzt.getFullYear() * 12 + jetzt.getMonth();
  const monatsIndex = (s: string) => {
    const d = parseDatum(s);
    return d ? d.jahr * 12 + d.monat - 1 : null;
  };

  const setzeStufe = (i: number, p: Partial<TuevEintrag['fruehereBeitraege'][number]>) =>
    aendern({ fruehereBeitraege: stufen.map((st, j) => (j === i ? { ...st, ...p } : st)) });

  const neueStufe = () => {
    // Vorbelegt mit dem heutigen Beitrag; das Datum eine Stufe weiter zurueck.
    const aeltestes = stufen.map((st) => parseDatum(st.bis)).filter((d) => d !== null)
      .sort((x, y) => (x.jahr * 12 + x.monat) - (y.jahr * 12 + y.monat))[0];
    const bisJahr = aeltestes ? aeltestes.jahr - 1 : jetzt.getFullYear() - 1;
    // Ein Monatsende, denn gemeint ist ein ganzer letzter Monat.
    const monat = aeltestes?.monat ?? 12;
    const tag = new Date(Date.UTC(bisJahr, monat, 0)).getUTCDate();
    return {
      bis: toDe({ jahr: bisJahr, monat, tag }),
      beitragMonat: t.beitragMonat,
      agZuschussMonat: t.agZuschussMonat,
    };
  };

  return (
    <div className="space-y-2">
      <Schalter
        label="Hat sich der Beitrag zwischenzeitlich geändert?"
        wert={stufen.length > 0}
        onChange={(b) => aendern({ fruehereBeitraege: b ? [neueStufe()] : [] })}
      />
      {stufen.map((st, i) => {
        const an = auf2(Math.max(0, st.beitragMonat - st.agZuschussMonat));
        const bis = monatsIndex(st.bis);
        const vorBeginn = bis !== null && beginn !== null && bis < beginn.jahr * 12 + beginn.monat - 1;
        const zukunft = bis !== null && bis >= heuteIndex;
        return (
          <div key={i} className="space-y-2 rounded-lg border border-slate-200 bg-white p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {stufen.length > 1 ? `Früherer Beitrag ${i + 1}` : 'Früherer Beitrag'}
              </span>
              {stufen.length > 1 && (
                <button
                  type="button"
                  onClick={() => aendern({ fruehereBeitraege: stufen.filter((_, j) => j !== i) })}
                  aria-label={`Früheren Beitrag ${i + 1} entfernen`}
                  className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 print:hidden"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ZahlFeld
                label="Arbeitnehmer"
                wert={an}
                onChange={(n) => setzeStufe(i, { beitragMonat: auf2(n + st.agZuschussMonat) })}
                einheit="€"
              />
              <ZahlFeld
                label="Arbeitgeber"
                wert={st.agZuschussMonat}
                onChange={(n) => setzeStufe(i, { agZuschussMonat: n, beitragMonat: auf2(an + n) })}
                einheit="€"
              />
            </div>
            <DatumFeld
              label="Gezahlt bis"
              wert={st.bis}
              onChange={(s) => setzeStufe(i, { bis: s })}
              hilfe={`Letzter Monat mit diesem Beitrag — zusammen ${euroGenau(st.beitragMonat)}. Danach gilt der Beitrag oben.`}
            />
            {(vorBeginn || zukunft) && (
              <p className="text-[11px] leading-relaxed text-amber-700">
                {vorBeginn
                  ? 'Dieses Datum liegt vor dem Beginn des Vertrags — die Stufe wirkt dann nicht.'
                  : 'Dieses Datum liegt in der Zukunft — bis dahin rechnet der TÜV mit diesem Beitrag statt mit dem oben.'}
              </p>
            )}
          </div>
        );
      })}
      {stufen.length > 0 && stufen.length < 5 && (
        <button
          type="button"
          onClick={() => aendern({ fruehereBeitraege: [...stufen, neueStufe()] })}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 hover:bg-indigo-50 print:hidden"
        >
          <Plus className="h-3 w-3" aria-hidden /> Noch eine frühere Änderung
        </button>
      )}
    </div>
  );
}

/** Eine Zeile im Vergleich der beiden Auszahlungswege. */
function WegZeile({ text, rente, kapital, hervor }: {
  text: string; rente: string; kapital: string; hervor?: 'rente' | 'kapital';
}) {
  const stark = 'font-black text-emerald-700';
  return (
    <tr className="border-b border-slate-50 last:border-0">
      <td className="px-3 py-1.5 text-slate-600">{text}</td>
      <td className={`px-2 py-1.5 text-right ${hervor === 'rente' ? stark : 'text-slate-800'}`}>{rente}</td>
      <td className={`px-3 py-1.5 text-right ${hervor === 'kapital' ? stark : 'text-slate-800'}`}>{kapital}</td>
    </tr>
  );
}

/**
 * VERTRAGS-TUEV
 *
 * Stellt Vertraege nebeneinander und beantwortet je Vertrag, ob er sich
 * rechnet: was er netto wirklich kostet gegen das, was netto ankommt.
 */
export function VertragsTuev({
  ergebnis, szenario,
}: {
  ergebnis: ProjektionsErgebnis | null;
  szenario: SzenarioParsed;
}) {
  const tuev = useSzenario((x) => x.szenario.tuev);
  const vertraege = useSzenario((x) => x.szenario.vertraege);
  const tuevHinzufuegen = useSzenario((x) => x.tuevHinzufuegen);
  const tuevAendern = useSzenario((x) => x.tuevAendern);
  const tuevEntfernen = useSzenario((x) => x.tuevEntfernen);
  const tuevKindHinzufuegen = useSzenario((x) => x.tuevKindHinzufuegen);
  const tuevKindAendern = useSzenario((x) => x.tuevKindAendern);
  const tuevKindEntfernen = useSzenario((x) => x.tuevKindEntfernen);
  const setzeKinderAnzahl = useSzenario((x) => x.setzeKinderAnzahl);
  const setzeKind = useSzenario((x) => x.setzeKind);
  /*
    Dieselben Setzer wie die Basisdaten — deshalb zieht die eine Stelle mit,
    wenn man die andere aendert, ohne dass hier etwas dafuer getan wird.
  */
  const setzeEinkommen = useSzenario((x) => x.setzeEinkommen);
  const setzeEinkommenPartner = useSzenario((x) => x.setzeEinkommenPartner);

  // Die Altersgrenzen 18 und 25 stehen im Rechtsstand, nicht im Markup.
  const jetzt = new Date().getFullYear();
  const avdParam = parameterFuer(
    Math.max(jetzt, 2027), { indexRate: szenario.annahmen.tarifIndex },
  ).avd;

  // Bemessungsgrundlage: das TATSAECHLICHE Bruttogehalt und zvE.
  // Der Prototyp schaetzte hier aus dem Netto mit festen Faktoren (Befund B9).
  // Dieselbe Bemessungsgrundlage wie die Rechnung selbst — sie stand hier
  // frueher ein zweites Mal im Code.
  const basis = useMemo(() => tuevBasis(szenario), [szenario]);

  const nichtGeprueft = vertraege.filter((v) => !tuev.some((t) => t.vertragId === v.id));

  const zeile = ergebnis?.zeilen.find((z) => z.jahr === ergebnis.ruhestandsjahr);

  const positionen = useMemo(
    () => tuevPositionen(szenario, zeile ?? null, ergebnis?.kapitalauszahlungen ?? []),
    [szenario, zeile, ergebnis],
  );

  return (
    <section className="mx-auto mb-24 max-w-6xl p-2 sm:p-6 print:break-before-page">
      <div className="mb-4 flex flex-col items-start justify-between gap-4 border-b-2 border-amber-200 px-2 pb-3 sm:mb-6 sm:pb-4 md:flex-row md:items-center">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-amber-800 sm:gap-3 sm:text-2xl">
            <SearchCheck className="h-6 w-6 sm:h-8 sm:w-8" aria-hidden /> Vertrags-TÜV
          </h2>
          <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-slate-600 sm:mt-2 sm:text-sm">
            Stellen Sie Ihre Verträge nebeneinander. Gerechnet wird mit Ihrem tatsächlichen
            Einkommen — es steht gleich darunter und lässt sich dort ändern — und mit der
            Steuer, die genau dieser Vertrag auslöst, nicht mit einem Durchschnittssatz.
          </p>
        </div>

        <div className="w-full shrink-0 rounded-xl border border-amber-200 bg-amber-100 p-1.5 shadow-sm sm:p-2 md:w-auto print:hidden">
          <label htmlFor="tuev-auswahl" className="sr-only">Vertrag zur Prüfung hinzufügen</label>
          <select
            id="tuev-auswahl"
            value=""
            disabled={nichtGeprueft.length === 0}
            onChange={(e) => { if (e.target.value) tuevHinzufuegen(e.target.value); }}
            className="w-full cursor-pointer rounded-lg border-2 border-amber-300 bg-white p-2 text-xs font-bold text-amber-900 shadow-sm outline-none hover:border-amber-400 disabled:cursor-not-allowed disabled:opacity-60 sm:p-2.5 sm:text-sm"
          >
            <option value="">
              {vertraege.length === 0
                ? 'Erst einen Vertrag anlegen …'
                : nichtGeprueft.length === 0
                  ? 'Alle Verträge geprüft'
                  : '➕ Vertrag hinzufügen …'}
            </option>
            {nichtGeprueft.map((v) => (
              <option key={v.id} value={v.id}>
                Schicht {v.schicht} | {v.name || v.typ.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/*
        DAS EINKOMMEN, AN DEM ALLES HAENGT — hier unten noch einmal.

        Es steht in den Basisdaten ganz oben; wer hier unten einen Vertrag
        prueft, hat es zwei Bildschirmlaengen hinter sich. Genau hier will man
        aber ausprobieren, was eine Gehaltserhoehung an der Foerderung aendert.

        BEIDE STELLEN SIND DASSELBE FELD: `EinkommenFelder` schreibt ueber
        `setzeEinkommen` in denselben Speicher wie die Basisdaten. Die
        Uebernahme in beide Richtungen ist damit keine Verdrahtung, die man
        vergessen koennte, sondern ergibt sich von selbst.

        `print:hidden`, weil das Gutachten die Angaben auf seinem eigenen
        Blatt fuehrt.
      */}
      <div className="mb-4 px-2 print:hidden sm:mb-6">
        <Abschnitt
          titel={szenario.einkommenGetrennt
            ? `Ihr Einkommen (Ausgangsbasis) — ${personNameAus(szenario.personen, 'A')}`
            : 'Ihr Einkommen (Ausgangsbasis)'}
          einklappbar
        >
          <EinkommenFelder wert={szenario.einkommenHeute} onChange={setzeEinkommen} />

          {szenario.haushalt.verheiratet && szenario.einkommenGetrennt && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                {personNameAus(szenario.personen, 'B')}
              </p>
              <EinkommenFelder wert={szenario.einkommenPartner} onChange={setzeEinkommenPartner} />
            </div>
          )}

          {/*
            Die Herleitung offen hingelegt: Wer Brutto eintraegt, sieht sein
            Netto; wer Netto eintraegt, das Brutto dahinter. Beides ist
            dieselbe Rechnung, einmal vorwaerts und einmal rueckwaerts
            (`erwerbsBasisHeute` kehrt ein eingegebenes Netto mit
            `nettoZuBrutto` um) — die drei Zahlen koennen deshalb nicht
            auseinanderlaufen.
          */}
          <div className="mt-4 grid grid-cols-3 gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <Kennzahl
              titel="Ø Brutto im Monat"
              wert={euro(basis.monatsbrutto)}
              info={(
                <>
                  Das Jahresbrutto durch zwölf. Bei 13 oder 14 Gehältern ist das <strong>mehr
                  als Ihr Monatsgehalt</strong> — Sonderzahlungen sind darin verteilt. Beiträge
                  und Steuer hängen am Jahresbetrag, deshalb wird so gerechnet.
                </>
              )}
            />
            <Kennzahl
              titel="Jahresbrutto"
              wert={euro(basis.jahresbrutto)}
              farbe="text-slate-900"
              info={(
                <>
                  {szenario.einkommenHeute.modus === 'netto'
                    ? 'Aus Ihrem eingegebenen Netto zurückgerechnet: Gesucht wird das Brutto, '
                      + 'das nach Sozialabgaben und Steuer genau dieses Netto ergibt.'
                    : szenario.einkommenHeute.modus === 'besoldung'
                      ? 'Aus der Besoldungstabelle Ihres Dienstherrn — Gruppe und Erfahrungsstufe '
                        + 'bestimmen den Betrag.'
                      : 'Betrag × Auszahlungen pro Jahr.'}
                  {' '}Hierauf rechnen Beitragsbemessungsgrenzen, Höchstbeträge und Steuertarif.
                  {szenario.einkommenGetrennt && ' Beide Einkommen zusammen.'}
                </>
              )}
            />
            <Kennzahl
              titel="Ø Netto im Monat"
              wert={euro(basis.jahresnetto / 12)}
              farbe="text-indigo-700"
              info={(
                <>
                  Brutto abzüglich Sozialabgaben, Einkommensteuer, Soli und — falls
                  angegeben — Kirchensteuer, nach dem Rechtsstand {basis.p.jahr}. Ihr zu
                  versteuerndes Einkommen beträgt dabei {euro(basis.zve)} im Jahr; daran hängt
                  die Steuerersparnis jedes geförderten Beitrags.
                </>
              )}
            />
          </div>
        </Abschnitt>
      </div>

      {tuev.length === 0 ? (
        <p className="rounded-xl border border-dashed border-amber-300 bg-amber-50/40 px-4 py-8 text-center text-sm text-amber-900">
          Noch kein Vertrag zur Prüfung ausgewählt. Wählen Sie oben einen aus, um zu sehen,
          was er Sie wirklich kostet und was er wirklich bringt.
        </p>
      ) : (
        <div className="space-y-4 sm:space-y-6">
          {tuev.map((t) => {
            const v = vertraege.find((x) => x.id === t.vertragId);
            if (!v) return null;

            // Gerechnet wird in `tuevPositionen` — DERSELBEN Funktion, die auch
            // das gedruckte Gutachten benutzt. Vorher stand die Verdrahtung
            // hier ein zweites Mal; zwei Kopien derselben Rechnung laufen
            // frueher oder spaeter auseinander, und dann zeigt der Bildschirm
            // andere Zahlen als der Ausdruck.
            const pos = positionen.find((x) => x.vertrag.id === v.id);
            if (!pos) return null;
            const { ergebnis: r, vergleich, istKapital, wege } = pos;

            const gut = r.nettoHebel >= 1;
            /*
              Die Erklaerungen brauchen das zvE und die Erwerbsart DIESES
              Inhabers — das zvE ist eine Haushaltsgroesse, die Erwerbsart
              nicht. Beides liegt in `basis`; der Ausdruck laesst das zweite
              Argument weg und bekommt die Treppe ohne Erklaerungen.
            */
            const erwerb = basis.jePerson.find((x) => x.id === v.inhaber) ?? basis.jePerson[0];
            const treppe = belastungsTreppe(r, {
              zve: basis.zve,
              p: basis.p,
              beamter: erwerb?.beamter ?? false,
              selbststaendig: erwerb?.selbststaendig ?? false,
              privatVersichert: szenario.haushalt.kvErwerb === 'pkv'
                || szenario.haushalt.kvStatus === 'pkv',
            });

            return (
              <article key={t.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm druckbereich">
                <header className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
                  <h3 className="flex items-center gap-2 truncate text-sm font-bold text-slate-800">
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      v.schicht === 1 ? 'bg-blue-100 text-blue-700'
                        : v.schicht === 2 ? 'bg-purple-100 text-purple-700'
                          : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      Schicht {v.schicht}
                    </span>
                    <span className="truncate">{v.name || v.typ}</span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => tuevEntfernen(t.id)}
                    aria-label={`${v.name || v.typ} aus der Prüfung entfernen`}
                    className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 print:hidden"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </header>

                <div className="grid gap-4 p-4 lg:grid-cols-3 lg:gap-6">
                  {/* 1) ANNAHMEN
                      Getoent wie die Eingabespalte oben: die Regel „hier
                      tragen Sie ein" soll auch hier unten gelten, wo Eingabe
                      und Auswertung dicht nebeneinander stehen. */}
                  <div className={`space-y-3 rounded-lg border p-3 ${TON.eingabe}`}>
                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">
                      1. Ihre Annahmen
                    </h4>
                    <ZahlFeld
                      label="Beitrag monatlich"
                      wert={t.beitragMonat}
                      onChange={(n) => tuevAendern(t.id, { beitragMonat: n })}
                      einheit="€"
                      hilfe={v.typ.startsWith('bav')
                        ? 'Gesamtbeitrag: Ihr Anteil und der des Arbeitgebers zusammen.'
                        : undefined}
                    />
                    <ProzentFeld
                      label="Beitragsdynamik p. a."
                      wert={t.dynamik}
                      onChange={(n) => tuevAendern(t.id, { dynamik: n })}
                      max={10}
                    />
                    {v.typ.startsWith('bav') && (
                      <>
                        <ZahlFeld
                          label="AG-Zuschuss monatlich"
                          wert={t.agZuschussMonat}
                          onChange={(n) => tuevAendern(t.id, { agZuschussMonat: n })}
                          einheit="€"
                          hilfe={`Mindert Ihren eigenen Aufwand. Ihr Anteil: ${
                            euroGenau(Math.max(0, t.beitragMonat - t.agZuschussMonat))}.`}
                        />
                        <FruehereBeitraege
                          t={t}
                          aendern={(p) => tuevAendern(t.id, p)}
                        />
                      </>
                    )}
                    {/*
                      Das genaue Datum, weil Beitraege monatlich fliessen: Ein
                      Vertrag ab 01.10.2020 hat im ersten Jahr drei Beitraege,
                      nicht zwoelf. Die Knoepfe verstellen das Jahr — so wie
                      das Feld frueher nur das Jahr kannte.
                    */}
                    <div className="grid grid-cols-2 gap-2">
                      <DatumFeld
                        label="Beginn"
                        wert={t.beginnDatum ?? `01.01.${t.beginnJahr}`}
                        onChange={(s) => {
                          const d = parseDatum(s);
                          if (d) tuevAendern(t.id, { beginnDatum: s, beginnJahr: d.jahr });
                        }}
                        hilfe="Gerechnet ab diesem Monat."
                        stufen
                      />
                      <ZahlFeld
                        label="Lebenserwartung"
                        wert={t.lebenserwartung}
                        onChange={(n) => tuevAendern(t.id, { lebenserwartung: n })}
                        min={60}
                        max={120}
                        einheit="J."
                        stufen
                      />
                    </div>

                    {v.typ === 'riester' && (
                      <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Kinder (Zulage) — für diesen Vertrag
                          </span>
                          <button
                            type="button"
                            onClick={() => tuevKindHinzufuegen(t.id)}
                            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 hover:bg-indigo-50 print:hidden"
                          >
                            <Plus className="h-3 w-3" aria-hidden /> Kind
                          </button>
                        </div>
                        {t.kinder.length === 0 ? (
                          <p className="text-[10px] text-slate-500">Keine Kinderzulage.</p>
                        ) : (
                          <ul className="space-y-1.5">
                            {t.kinder.map((kind) => (
                              <li key={kind.id} className="flex items-center gap-2">
                                <label className="sr-only" htmlFor={`kind-${kind.id}`}>Geburtsjahr</label>
                                <input
                                  id={`kind-${kind.id}`}
                                  type="number"
                                  value={kind.geburtsjahr}
                                  min={1900}
                                  max={2200}
                                  onChange={(e) => tuevKindAendern(t.id, kind.id, Number(e.target.value))}
                                  className="w-full rounded border border-slate-300 p-1 text-xs tabular-nums"
                                />
                                <span className="shrink-0 text-[10px] text-slate-500">
                                  {kind.geburtsjahr >= 2008 ? '300 €' : '185 €'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => tuevKindEntfernen(t.id, kind.id)}
                                  aria-label={`Kind ${kind.geburtsjahr} entfernen`}
                                  className="shrink-0 rounded p-0.5 text-slate-400 hover:text-rose-600 print:hidden"
                                >
                                  <Trash2 className="h-3 w-3" aria-hidden />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}

                    {/*
                      Beim Altersvorsorgedepot kommen die Kinder aus dem
                      HAUSHALT, nicht vom Vertrag — aus derselben Quelle, aus
                      der auch die Zeitachse und das Vertragsblatt rechnen.
                      Zwei Listen fuer dieselben Kinder hiessen zwei Wahrheiten,
                      und der Nutzer glaubte zu Recht keiner von beiden. Dass
                      Riester es anders macht, steht in beiden Ueberschriften.
                    */}
                    {v.typ === 'avd' && (
                      /* Weiss, nicht indigo: der Kasten steht jetzt selbst auf
                         indigofarbenem Grund und waere darin untergegangen. */
                      <div className="rounded-lg border border-indigo-300 bg-white p-2.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-800">
                          Kinder (Zulage) — aus Ihren Basisdaten
                        </span>
                        <div className="mt-1.5">
                          <ZahlFeld
                            label="Kinder mit Kindergeldanspruch"
                            wert={szenario.haushalt.kinder.length}
                            onChange={setzeKinderAnzahl}
                            max={15}
                          />
                        </div>
                        <KinderZeilen
                          kinder={szenario.haushalt.kinder}
                          onKind={setzeKind}
                          a={avdParam}
                          jetzt={jetzt}
                        />
                        <KinderHinweis a={avdParam} />
                        <p className="mt-1 text-[10px] leading-relaxed text-indigo-800">
                          Gilt für den ganzen Haushalt: Änderungen wirken auch in den Basisdaten,
                          auf der Zeitachse und im Vertragsblatt.
                        </p>
                      </div>
                    )}

                    <Schalter
                      label="Rente gegen Kapital vergleichen"
                      wert={t.vergleichen}
                      onChange={(b) => tuevAendern(t.id, { vergleichen: b })}
                    />
                    {t.vergleichen && r.nettoKapital === 0 && (
                      <ZahlFeld
                        label="Alternative Kapitalauszahlung (netto)"
                        wert={t.vergleichKapitalNetto}
                        onChange={(n) => tuevAendern(t.id, { vergleichKapitalNetto: n })}
                        einheit="€"
                        hilfe="Der Einmalbetrag, den der Anbieter statt der Rente zahlen würde."
                      />
                    )}
                  </div>

                  {/* 2) EINZAHLUNG GEGEN AUSZAHLUNG */}
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      2. Einzahlung gegen Auszahlung
                    </h4>

                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Ihre Belastung (Ansparphase)
                      </div>
                      {/*
                        Oben steht, was der Vertrag monatlich BEKOMMT, nicht
                        was der Sparer einzahlt. Bei einem gefoerderten Vertrag
                        sind das zwei verschiedene Zahlen — und die groessere
                        stand bisher nur als Nebensatz in einem anderen Kasten.
                      */}
                      <div className="space-y-1.5">
                        <GegenueberZeile text="Gesamtbeitrag" wert={euro(treppe.zufluss)} />
                        {treppe.zeilen.map((z) => (
                          z.art === 'summe' ? (
                            <div key={z.text} className="!mt-2 border-t border-slate-200 pt-2">
                              <GegenueberZeile text={z.text} wert={euro(z.betrag)} />
                            </div>
                          ) : (
                            <GegenueberZeile
                              key={z.text}
                              text={z.text}
                              wert={euro(z.betrag)}
                              farbe="text-emerald-600"
                              info={z.erklaerung}
                            />
                          )
                        ))}
                        <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-slate-200 pt-2">
                          <span className="text-xs font-bold text-slate-700">Kostet Sie wirklich</span>
                          <span className="text-base font-black tabular-nums text-slate-900">
                            {euro(treppe.aufwand)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/*
                      Dieser Kasten schluesselt die Zulagenzeile der Treppe auf:
                      woraus sie sich zusammensetzt und was sie im JAHR ausmacht.

                      Die Zulagen mindern den Eigenaufwand weiterhin NICHT. Sie
                      kommen nicht vom Sparer, sondern vom Staat, und stehen
                      bereits als hoeheres Kapital auf der Habenseite
                      (avdSteuervorteil.eigenaufwandNetto rechnet genau so). In
                      der Treppe heben sie die oberste Zeile an und gehen in der
                      naechsten wieder ab — unten steht unveraendert derselbe
                      Betrag. Als blosser Minusposten gebucht zaehlten sie
                      doppelt, und "Kostet Sie wirklich" ginge nicht mehr auf.
                    */}
                    {r.zulageMonat > 0 && (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                        <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                          Was der Staat dazugibt — monatlich, 1. Jahr
                        </div>
                        <div className="space-y-1.5">
                          {r.zulageDetail ? (
                            <>
                              <GegenueberZeile
                                text="Grundzulage"
                                wert={euro(r.zulageDetail.grundzulageMonat)}
                              />
                              <GegenueberZeile
                                text={r.zulageDetail.kinderMitAnspruch > 0
                                  ? `Kinderzulage — für ${r.zulageDetail.kinderMitAnspruch} Kind${r.zulageDetail.kinderMitAnspruch > 1 ? 'er' : ''}`
                                  : 'Kinderzulage — kein Kind im Kindergeldalter'}
                                wert={euro(r.zulageDetail.kinderzulageMonat)}
                              />
                              {/*
                                MAL ZWOELF. Die Zeilen darueber sind
                                Monatswerte; hier stand ihre blosse Summe unter
                                der Ueberschrift "Jedes Jahr". Aus 540 EUR
                                Foerderung wurden so 45.
                              */}
                              <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-emerald-200 pt-2">
                                <span className="text-xs font-bold text-emerald-900">Jedes Jahr</span>
                                <span className="text-base font-black tabular-nums text-emerald-700">
                                  {euro(laufendeZulageJahr(r))}
                                </span>
                              </div>
                              {/*
                                Der Bonus faellt EINMAL an. Neben die laufenden
                                Zulagen gestellt verspraeche er eine Foerderung
                                fuer die ganze Laufzeit, die es nur im ersten
                                Jahr gibt.
                              */}
                              {r.zulageDetail.bonusEinmalig > 0 && (
                                <p className="mt-1 text-[10px] leading-relaxed text-emerald-800">
                                  Dazu <strong>einmalig im ersten Jahr</strong>: Berufseinsteigerbonus{' '}
                                  {euro(r.zulageDetail.bonusEinmalig)}.
                                </p>
                              )}
                            </>
                          ) : (
                            <GegenueberZeile text="Zulage" wert={euro(r.zulageMonat)} />
                          )}
                        </div>
                        <p className="mt-2 text-[10px] leading-relaxed text-emerald-800">
                          Die Zulagen sind der Anteil des Staates am Gesamtbeitrag oben — sie
                          fließen zusätzlich in den Vertrag und senken Ihren eigenen Beitrag
                          nicht. Deshalb stehen sie dort als Abzug vom Zufluss und nicht als
                          Abzug von Ihren Kosten.
                        </p>
                      </div>
                    )}

                    {/*
                      Der Gegenpol zum Kasten darueber: dort geht der BRUTTO-
                      Beitrag nach Netto, hier die BRUTTO-Rente. Erst so steht
                      nebeneinander, was der Vertrag monatlich netto kostet und
                      was er monatlich netto bringt.
                    */}
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                        Ihr Ertrag (Auszahlungsphase)
                      </div>
                      <div className="space-y-1.5">
                        <GegenueberZeile
                          text={istKapital ? 'Brutto-Kapital' : 'Brutto-Rente'}
                          wert={euro(istKapital ? r.bruttoKapital : r.bruttoRenteMonat)}
                        />
                        {!istKapital && r.kvPvMonat > 0 && (
                          <GegenueberZeile text="− KV/PV-Abzug" wert={euro(r.kvPvMonat)} farbe="text-rose-500" />
                        )}
                        {!istKapital && r.steuerMonat > 0 && (
                          <GegenueberZeile text="− Steuer-Abzug" wert={euro(r.steuerMonat)} farbe="text-rose-500" />
                        )}
                        {/*
                          Steuer und Beitraege GETRENNT: Die Steuer faellt im
                          Zuflussjahr an, die Beitraege laufen zehn Jahre
                          (§ 229 SGB V) und stehen deshalb auch im monatlichen
                          Kassenbon. Zusammengefasst als „Steuern und Abgaben"
                          liess sich nicht erkennen, warum dieselbe Auszahlung
                          in der Eingabemaske hoeher ausgewiesen ist.
                        */}
                        {istKapital && r.steuerKapital > 0 && (
                          <GegenueberZeile text="− Steuer im Zuflussjahr" wert={euro(r.steuerKapital)} farbe="text-rose-500" />
                        )}
                        {istKapital && r.kvPvKapital > 0 && (
                          <GegenueberZeile
                            text="− Kranken- und Pflegeversicherung"
                            wert={euro(r.kvPvKapital)}
                            farbe="text-rose-500"
                          />
                        )}

                        <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-amber-200 pt-2">
                          <span className="text-xs font-bold text-amber-900">
                            {istKapital ? 'Echtes Netto-Kapital' : 'Echte Netto-Rente'}
                          </span>
                          <span className="text-base font-black tabular-nums text-amber-700">
                            {euro(istKapital ? r.nettoKapital : r.nettoRenteMonat)}
                            {!istKapital && <span className="text-xs font-normal"> / Monat</span>}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Über die gesamte Laufzeit
                      </div>
                      <div className="space-y-1.5">
                        <GegenueberZeile
                          text={`Eingezahlt (${laufzeitText(r.monateEinzahlung)})`}
                          wert={euro(r.summeEinzahlung)}
                          farbe="text-rose-600"
                        />
                        <GegenueberZeile
                          text={istKapital ? 'Ausgezahlt (einmalig)' : `Ausgezahlt (${r.jahreAuszahlung} Jahre)`}
                          wert={euro(r.summeAuszahlung)}
                          farbe="text-emerald-600"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 3) KENNZAHLEN UND FAZIT */}
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      3. Kennzahlen und Fazit
                    </h4>

                    <div className={`rounded-lg border p-3 ${gut ? 'border-emerald-200 bg-emerald-50/50' : 'border-rose-200 bg-rose-50/50'}`}>
                      <div className="grid grid-cols-2 gap-3">
                        <Kennzahl
                          titel="Netto-Hebel"
                          wert={`${r.nettoHebel.toLocaleString('de-DE', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} ×`}
                          farbe={gut ? 'text-emerald-700' : 'text-rose-700'}
                          fussnote="Auszahlung je Euro Einzahlung"
                          info={(
                            <>
                              {euro(r.summeAuszahlung)} Auszahlung geteilt durch{' '}
                              {euro(r.summeEinzahlung)} eigenen Aufwand über{' '}
                              {laufzeitText(r.monateEinzahlung)}. <strong>Beide Seiten netto</strong>: oben
                              nach Steuer und KV/PV im Alter, unten nach Förderung. Ohne
                              Verzinsung gerechnet — ein Euro von heute zählt hier so viel wie
                              einer in {r.jahreEinzahlung} Jahren. Was das Geld dann wert ist,
                              sagt erst die Rendite daneben.
                            </>
                          )}
                        />
                        <Kennzahl
                          titel="Nettorendite"
                          wert={prozent(r.rendite, 2)}
                          farbe={r.rendite > 0 ? 'text-emerald-700' : 'text-rose-700'}
                          fussnote="p. a. nach allen Abzügen"
                          info={(
                            <>
                              Der interne Zinsfuß Ihrer Zahlungsreihe: der Zinssatz, bei dem
                              {' '}{laufzeitText(r.monateEinzahlung)} Einzahlung und{' '}
                              {istKapital ? 'die Kapitalauszahlung' : `${r.jahreAuszahlung} Jahre Rente`}
                              {' '}genau aufgehen. Anders als der Hebel <strong>berücksichtigt
                              er, wann</strong> jeder Euro fließt. Gerechnet nach Steuer, KV/PV
                              und Förderung — mit einem Depot zum selben Satz wäre es ein
                              fairer Vergleich.
                            </>
                          )}
                        />
                        <Kennzahl
                          titel="Netto-Gewinn"
                          wert={euro(r.echterGewinn)}
                          farbe={r.echterGewinn >= 0 ? 'text-emerald-700' : 'text-rose-700'}
                        />
                        {!istKapital && (
                          <Kennzahl
                            titel="Amortisation"
                            wert={`${r.amortisationsJahre.toLocaleString('de-DE', { maximumFractionDigits: 1 })} J.`}
                            fussnote="ab Rentenbeginn"
                          />
                        )}
                      </div>
                    </div>

                    {/*
                      BEIDE WEGE NEBENEINANDER. Frueher standen Rente und
                      Kapital unter zwei Vertragsarten und liessen sich nie
                      vergleichen; jetzt traegt ein Vertrag beide Betraege,
                      und jeder Weg bekommt seine eigene volle Rechnung.
                    */}
                    {wege && (
                      <div className="overflow-hidden rounded-lg border border-slate-200">
                        <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Rente gegen Kapital — beide Wege gerechnet
                        </div>
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr className="border-b border-slate-100 text-slate-500">
                              <th className="px-3 py-1.5 text-left font-semibold"> </th>
                              <th className="px-2 py-1.5 text-right font-semibold">Rente</th>
                              <th className="px-3 py-1.5 text-right font-semibold">Kapital</th>
                            </tr>
                          </thead>
                          <tbody className="tabular-nums">
                            <WegZeile
                              text="Netto"
                              rente={`${euro(wege.rente.nettoRenteMonat)} / Mon.`}
                              kapital={euro(wege.kapital.nettoKapital)}
                            />
                            <WegZeile
                              text="Über die Laufzeit"
                              rente={euro(wege.rente.summeAuszahlung)}
                              kapital={euro(wege.kapital.summeAuszahlung)}
                            />
                            <WegZeile
                              text="Netto-Gewinn"
                              rente={euro(wege.rente.echterGewinn)}
                              kapital={euro(wege.kapital.echterGewinn)}
                              hervor={wege.rente.echterGewinn >= wege.kapital.echterGewinn ? 'rente' : 'kapital'}
                            />
                            <WegZeile
                              text="Netto-Hebel"
                              rente={`${wege.rente.nettoHebel.toLocaleString('de-DE', { maximumFractionDigits: 2 })} ×`}
                              kapital={`${wege.kapital.nettoHebel.toLocaleString('de-DE', { maximumFractionDigits: 2 })} ×`}
                            />
                            <WegZeile
                              text="Nettorendite"
                              rente={prozent(wege.rente.rendite, 2)}
                              kapital={prozent(wege.kapital.rendite, 2)}
                            />
                          </tbody>
                        </table>
                        <p className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
                          {/*
                            Der Wert ist ein ALTER, nicht eine Dauer:
                            `renteOderKapital` rechnet ab dem Alter bei
                            Rentenbeginn. "Ab 12 Jahren" waere schlicht falsch.
                          */}
                          <strong>Break-even:</strong> Die Rente holt das Kapital ein, wenn Sie{' '}
                          <strong className="text-slate-900">
                            {wege.breakEven.breakEvenOhneZins.toLocaleString('de-DE', { maximumFractionDigits: 1 })} Jahre
                          </strong>{' '}
                          alt werden — ohne Verzinsung.
                          {wege.breakEven.kapitalTraegtSichSelbst
                            ? ' Mit 2 % Verzinsung nie: der Kapitalertrag allein trägt die Rente.'
                            : ` Mit 2 % Verzinsung erst mit ${wege.breakEven.breakEvenMitZins.toLocaleString('de-DE', { maximumFractionDigits: 1 })} Jahren.`}
                          {' '}In die Gesamtübersicht geht{' '}
                          <strong>{istKapital ? 'das Kapital' : 'die Rente'}</strong> ein — links
                          umstellbar.
                        </p>
                      </div>
                    )}

                    {r.zulagenGekuerzt && (
                      <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
                        <strong>Zulagen werden gekürzt.</strong> Ihr Eigenbeitrag liegt unter dem
                        Mindesteigenbeitrag nach § 86 EStG (4 % des Vorjahresbruttos abzüglich
                        Zulagen). Die Zulagen fallen dadurch anteilig geringer aus.
                      </p>
                    )}

                    {r.hinweise.map((h, i) => (
                      <p key={i} className="rounded-lg bg-slate-100 px-3 py-2 text-[11px] leading-relaxed text-slate-700">
                        {h}
                      </p>
                    ))}

                    {!wege && kenntKapitalwahl(v.typ) && (
                      <p className="rounded-lg bg-slate-100 px-3 py-2 text-[11px] leading-relaxed text-slate-700">
                        Für den Vergleich fehlt {v.brutto > 0 ? 'die Kapitalauszahlung' : 'die monatliche Rente'}.
                        Tragen Sie beide Beträge am Vertrag ein — dann rechnet der TÜV beide Wege
                        und nennt den Break-even. Geschätzt wird nichts.
                      </p>
                    )}

                    {/*
                      Nur der ALTE Weg des Vergleichs: eine von Hand erfasste
                      Kapitalalternative oder ein Depotwert. Stehen beide
                      Betraege am Vertrag, nennt der Block darueber denselben
                      Break-even bereits — zweimal dieselbe Zahl in zwei
                      Aufmachungen liest sich wie zwei verschiedene Aussagen.
                    */}
                    {!wege && vergleich && (
                      <div className="space-y-2">
                        <div className="flex items-start gap-2.5 rounded-xl bg-slate-50 p-2.5 sm:p-3">
                          <Calculator className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                          <p className="text-[11px] leading-relaxed text-slate-700">
                            <strong className="text-slate-900">Ohne Verzinsung:</strong> Sie müssten{' '}
                            <strong className="text-rose-600">
                              {vergleich.breakEvenOhneZins.toLocaleString('de-DE', { maximumFractionDigits: 1 })} Jahre
                            </strong>{' '}
                            alt werden, damit die Rente das Kapital einholt.
                          </p>
                        </div>
                        <div className="flex items-start gap-2.5 rounded-xl border border-indigo-50 bg-indigo-50/50 p-2.5 sm:p-3">
                          <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" aria-hidden />
                          <p className="text-[11px] leading-relaxed text-indigo-900">
                            <strong>Mit 2 % Verzinsung:</strong>{' '}
                            {vergleich.kapitalTraegtSichSelbst
                              ? 'Der Kapitalertrag allein trägt die Rente — die Verrentung rechnet sich finanziell nie.'
                              : (
                                <>
                                  Sie müssten{' '}
                                  <strong className="text-rose-600">
                                    {vergleich.breakEvenMitZins.toLocaleString('de-DE', { maximumFractionDigits: 1 })} Jahre
                                  </strong>{' '}
                                  alt werden.
                                </>
                              )}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/*
        Der Foerdercheck schliesst diesen Bereich ab: erst was die Vertraege
        leisten, dann was an Foerderung liegen bleibt. Er steht AUSSERHALB der
        Liste, weil er nicht an der Auswahl haengt — auch wer noch keinen
        Vertrag zur Pruefung gewaehlt hat, soll seinen freien Rahmen sehen.
      */}
      <Foerdercheck zeile={zeile ?? null} />
    </section>
  );
}
