import { useMemo } from 'react';
import { SearchCheck, Trash2, Plus, TrendingUp, Calculator } from 'lucide-react';
import { parameterFuer, type ProjektionsErgebnis } from '@renten/engine';
import { tuevPositionen, tuevBasis } from './tuev-berechnung';
import { Foerdercheck } from './Foerdercheck';
import { useSzenario, type SzenarioParsed } from '../store/szenario';
import {
  ZahlFeld, ProzentFeld, Schalter, Kennzahl, GegenueberZeile, euro, prozent, TON,
} from '../components/Feld';
import { KinderZeilen, KinderHinweis } from '../components/KinderFelder';

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
            Bruttogehalt von <strong>{euro(basis.monatsbrutto)}</strong> im Monat und der
            Steuer, die genau dieser Vertrag auslöst — nicht mit einem Durchschnittssatz.
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
            const { ergebnis: r, vergleich, istKapital } = pos;

            const gut = r.nettoHebel >= 1;

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
                    />
                    <ProzentFeld
                      label="Beitragsdynamik p. a."
                      wert={t.dynamik}
                      onChange={(n) => tuevAendern(t.id, { dynamik: n })}
                      max={10}
                    />
                    {v.typ.startsWith('bav') && (
                      <ZahlFeld
                        label="AG-Zuschuss monatlich"
                        wert={t.agZuschussMonat}
                        onChange={(n) => tuevAendern(t.id, { agZuschussMonat: n })}
                        einheit="€"
                        hilfe="Mindert Ihren eigenen Aufwand."
                      />
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <ZahlFeld
                        label="Beginn"
                        wert={t.beginnJahr}
                        onChange={(n) => tuevAendern(t.id, { beginnJahr: n })}
                        min={1900}
                        max={2200}
                      />
                      <ZahlFeld
                        label="Lebenserwartung"
                        wert={t.lebenserwartung}
                        onChange={(n) => tuevAendern(t.id, { lebenserwartung: n })}
                        min={60}
                        max={120}
                        einheit="J."
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
                      <div className="space-y-1.5">
                        <GegenueberZeile text="Beitrag" wert={euro(r.beitragMonat)} />
                        {r.agZuschussMonat > 0 && (
                          <GegenueberZeile text="− AG-Zuschuss" wert={euro(r.agZuschussMonat)} farbe="text-emerald-600" />
                        )}
                        {/* Erst ab einem halben Euro: bei privat
                            Versicherten bleiben nach dem wegfallenden
                            Arbeitgeberzuschuss manchmal Cent uebrig, und eine
                            Zeile "SV-Ersparnis 0 \u20ac" sagt weniger als keine. */}
                        {r.svErsparnisMonat >= 0.5 && (
                          <GegenueberZeile text="− SV-Ersparnis" wert={euro(r.svErsparnisMonat)} farbe="text-emerald-600" />
                        )}
                        {r.steuerersparnisMonat > 0 && (
                          <GegenueberZeile text="− Steuerersparnis" wert={euro(r.steuerersparnisMonat)} farbe="text-emerald-600" />
                        )}
                        <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-slate-200 pt-2">
                          <span className="text-xs font-bold text-slate-700">Kostet Sie wirklich</span>
                          <span className="text-base font-black tabular-nums text-slate-900">
                            {euro(r.echterAufwandMonat)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/*
                      Die Zulagen stehen BEWUSST ausserhalb des Kastens darueber.
                      Sie mindern den Eigenaufwand nicht: sie kommen nicht vom
                      Sparer, sondern vom Staat, und stehen bereits als hoeheres
                      Kapital auf der Habenseite (avdSteuervorteil.eigenaufwandNetto
                      rechnet genau so). Als Minusposten in der Belastung gebucht
                      zaehlten sie doppelt — und die Zeile "Kostet Sie wirklich"
                      ging sichtbar nicht mehr auf. Das war sie vorher weder beim
                      Altersvorsorgedepot noch bei Riester.
                    */}
                    {r.zulageMonat > 0 && (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                        <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                          Was der Staat dazugibt (1. Jahr)
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
                              <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-emerald-200 pt-2">
                                <span className="text-xs font-bold text-emerald-900">Jedes Jahr</span>
                                <span className="text-base font-black tabular-nums text-emerald-700">
                                  {euro(r.zulageDetail.grundzulageMonat + r.zulageDetail.kinderzulageMonat)}
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
                          Die Zulagen fließen zusätzlich in den Vertrag — sie senken Ihren Beitrag
                          nicht. Deshalb stehen sie hier getrennt und nicht in der Rechnung darüber.
                        </p>
                        <p className="mt-1 text-[10px] text-emerald-800">
                          Im Vertrag kommen an:{' '}
                          <strong>{euro(r.beitragMonat + r.zulageMonat)}</strong> im Monat.
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
                        {istKapital && r.steuerKapital > 0 && (
                          <GegenueberZeile text="− Steuern und Abgaben" wert={euro(r.steuerKapital)} farbe="text-rose-500" />
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
                          text={`Eingezahlt (${r.jahreEinzahlung} Jahre)`}
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
                        />
                        <Kennzahl
                          titel="Nettorendite"
                          wert={prozent(r.rendite, 2)}
                          farbe={r.rendite > 0 ? 'text-emerald-700' : 'text-rose-700'}
                          fussnote="p. a. nach allen Abzügen"
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

                    {t.vergleichen && !vergleich && (
                      <p className="rounded-lg bg-slate-100 px-3 py-2 text-[11px] leading-relaxed text-slate-700">
                        Für den Vergleich fehlt die alternative Kapitalauszahlung. Tragen Sie
                        links ein, was der Anbieter statt der Rente einmalig zahlen würde.
                      </p>
                    )}

                    {vergleich && (
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
