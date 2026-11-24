import { useEffect, useMemo, useState } from 'react';
import type { Jahreszeile } from '@renten/engine';
import { useSzenario } from '../store/szenario';
import { AkkordeonKarte, ZahlFeld, ProzentFeld, euro, prozent } from '../components/Feld';
import { useSchmal } from '../components/useSchmal';
import { anteilAmNetto } from './bezug';
import { Hervor, Karte, Kernsatz, Posten, Regler, SCHWEBEND, Zahl } from '../components/stil';
import { useAnsprache } from '../components/Ansprache';
import {
  sparzielRechnen, wunschbeitragRechnen, SPARZIEL_VORGABE, type SparzielEingaben,
} from './sparziel-berechnung';
import { ScrollBereich } from '../components/ScrollBereich';
import { Stuecke, type Stueck } from '../components/Ablauf';

/**
 * Der Sparrechner: die Versorgungsluecke rueckwaerts.
 *
 * Der Rechner sagt bis hierher nur, DASS eine Luecke besteht. Die Frage, die
 * jeder Kunde danach stellt, ist eine andere: was muss ich monatlich
 * zuruecklegen, damit sie sich schliesst? Genau das steht hier — mit
 * Beitragsdynamik, weil ein Vertrag mit 3 % Steigerung heute deutlich
 * weniger kostet als einer ohne.
 *
 * In drei Stuecken (`components/Ablauf`): was die Luecke kostet (mit den
 * Annahmen darunter und, zum Aufklappen, was die Beitragsdynamik aendert),
 * was Warten kostet — und zuletzt die Frage, mit der es in die Loesungen
 * geht: Was willst du zuruecklegen, und welches Kapital entsteht daraus?
 */
export function Sparrechner({ zeile, onStartbeitrag, nettoHeute = 0, kaufkraftHeute = true }: {
  zeile: Jahreszeile;
  /**
   * In welchem Geld die LUECKE steht — derselbe Schalter wie im Ergebnis und
   * in der Fussleiste. Sonst stuenden auf einem Bildschirm zwei Luecken: hier
   * die des Rentenjahres, unten die in heutiger Kaufkraft. Kapital und
   * Beitraege sind davon unberuehrt: Sie sind Geld ihres Jahres.
   */
  kaufkraftHeute?: boolean;
  /** Das heutige Haushaltsnetto im Monat — die Bezugsgroesse fuer den Startbeitrag */
  nettoHeute?: number;
  /** Meldet den noetigen Startbeitrag — der Titel der Etappe nennt ihn, die Loesungen koennen ihn uebernehmen */
  onStartbeitrag?: (n: number | null) => void;
}) {
  const szenario = useSzenario((x) => x.szenario);
  const t = useAnsprache();
  const schmal = useSchmal();
  const [eingaben, setEingaben] = useState<SparzielEingaben>(SPARZIEL_VORGABE);
  const [dynamikOffen, setDynamikOffen] = useState(false);

  const r = useMemo(
    () => sparzielRechnen(szenario, zeile, eingaben),
    [szenario, zeile, eingaben],
  );

  const startbeitrag = r?.gewaehlt.startbeitrag ?? null;
  useEffect(() => { onStartbeitrag?.(startbeitrag); }, [startbeitrag, onStartbeitrag]);

  /*
    DER WUNSCHBEITRAG ist der Netto-Aufwand der Loesungen: Was hier gewaehlt
    wird, verteilt der Vorschlag danach auf die Loesungen (`Vorschlag.tsx`).
    Ein Speicher, keine zweite Zahl.
  */
  const wunsch = szenario.loesungen.nettoMonat;
  const setzeLoesungen = useSzenario((x) => x.setzeLoesungen);
  const setzeWunsch = (n: number) => setzeLoesungen({ nettoMonat: Math.max(0, n), vorgabe: 'netto' });
  const w = useMemo(
    () => wunschbeitragRechnen(szenario, zeile, eingaben, wunsch),
    [szenario, zeile, eingaben, wunsch],
  );

  // Der Regler reicht bis zum Doppelten des noetigen Beitrags; der Balken misst am groesseren von Ziel und Angespartem.
  const reglerMax = w ? Math.max(100, Math.ceil((2 * w.noetig) / 50) * 50) : 100;
  const balkenBasis = w ? Math.max(w.zielkapital, w.kapital, 1) : 1;

  const setze = (teil: Partial<SparzielEingaben>) =>
    setEingaben((x) => ({ ...x, ...teil }));

  if (r === null) {
    return (
      <Stuecke
        kennung="sparen"
        beschriftung="Stücke des Sparrechners"
        stuecke={[{
          id: 'keine',
          titel: 'Keine Lücke',
          inhalt: (
            <Karte>
              <p className="text-sm text-ui-schiefer">
                Für das Jahr {zeile.jahr} besteht keine Lücke — es gibt nichts zu schließen.
              </p>
            </Karte>
          ),
        }]}
      />
    );
  }
  const anteil = anteilAmNetto(r.gewaehlt.startbeitrag, nettoHeute);
  const gewaehlt = (dynamik: number) => Math.abs(dynamik - eingaben.dynamik) < 1e-9;

  /*
    EINS NACH DEM ANDEREN. Zuerst die Rechnung als das eine schwebende
    Stueck — Luecke, Kapital, Startbeitrag —, darunter die Annahmen zum
    Verstellen und zugeklappt die Beitragsdynamik. Dann der Kernsatz, was
    Warten kostet, zuletzt der eigene Beitrag. Die Annahmen gelten fuer alle.
  */
  // Die staerkste Dynamik der Tabelle — sie zeigt am deutlichsten, wie weit der Einstieg sinkt.
  const steilste = r.varianten.reduce((a, v) => (v.dynamik > a.dynamik ? v : a), r.varianten[0]!);
  const stuecke: Stueck[] = [
    {
      id: 'kosten',
      titel: 'Was die Lücke kostet',
      ergebnis: `${euro(r.zielkapital)} Kapital, ${euro(r.gewaehlt.startbeitrag)} im Monat ab heute`,
      inhalt: (
        <div className="flex flex-col gap-5 sm:gap-6">
          <section aria-label="Was die Lücke kostet" className={`${SCHWEBEND} p-5 sm:p-7`}>
            <dl className="grid gap-5 sm:grid-cols-3">
              {kaufkraftHeute ? (
                <Kachel
                  titel="Lücke im Monat"
                  wert={euro(r.lueckeHeute)}
                  hinweis={`in heutiger Kaufkraft — im Jahr ${zeile.jahr} sind das ${euro(r.luecke)}`}
                />
              ) : (
                <Kachel
                  titel={`Lücke im Jahr ${zeile.jahr}`}
                  wert={euro(r.luecke)}
                  hinweis={`in heutigem Geld ${euro(r.lueckeHeute)}`}
                />
              )}
              <Kachel
                titel="Dafür nötiges Kapital"
                wert={euro(r.zielkapital)}
                hinweis={`bei Rentenbeginn, für ${eingaben.auszahldauer} Jahre`}
              />
              <Kachel
                titel={`${t.Dein()} Startbeitrag`}
                wert={euro(r.gewaehlt.startbeitrag)}
                hinweis={`im Monat, ${r.jahreBisRente} Jahre lang`}
              />
            </dl>
            {/* Der Beitrag im Verhaeltnis — was er fuer den Haushalt bedeutet. */}
            {anteil && (
              <p className="mt-5 border-t border-ui-linie pt-4 text-sm leading-relaxed text-ui-schiefer">
                Der Startbeitrag von {euro(r.gewaehlt.startbeitrag)} sind{' '}
                <strong className="font-medium text-ui-tinte">{anteil}</strong> {t.dein('es')}{' '}
                heutigen Haushaltsnettos von {euro(nettoHeute)} im Monat.
              </p>
            )}
          </section>

          <Karte titel="Annahmen">
            <div className="grid gap-4 sm:grid-cols-3">
              <ProzentFeld
                label="Rendite p. a. (nach Kosten)"
                wert={eingaben.rendite}
                onChange={(n) => setze({ rendite: n })}
                max={15}
              />
              <ProzentFeld
                label="Beitragsdynamik p. a."
                wert={eingaben.dynamik}
                onChange={(n) => setze({ dynamik: n })}
                max={15}
                hilfe="Um wie viel der Beitrag jedes Jahr steigt."
              />
              <ZahlFeld
                label="Auszahldauer"
                wert={eingaben.auszahldauer}
                onChange={(n) => setze({ auszahldauer: n })}
                min={1} max={60} einheit="Jahre"
                hilfe="Über wie viele Jahre das Kapital reichen soll."
              />
            </div>
            {/* Der Startbeitrag steht darueber schon im Titel und in der Kachel — hier nur, was die Rechnung unterstellt. */}
            <p className="mt-6 border-t border-ui-linie pt-5 text-xs leading-relaxed text-ui-schiefer">
              Die Rechnung unterstellt, dass die Entnahme später mit {prozent(szenario.annahmen.inflation)} Inflation
              mitwächst, und zieht die Abgeltungsteuer auf den Ertragsanteil bereits ab. Sie nennt eine
              Größenordnung, kein Produkt.
            </p>
          </Karte>

          {/*
            MIT BEITRAGSDYNAMIK — zum Aufklappen, zu als Vorgabe. War ein
            eigenes Stueck des Wegs; ein steigender Beitrag ist aber nicht fuer
            jeden ein Thema, und wer ihn nicht braucht, musste trotzdem daran
            vorbei. Zugeklappt nennt die Kopfzeile, wie weit der Einstieg sinkt.
          */}
          <AkkordeonKarte
            titel="Mit Beitragsdynamik"
            offen={dynamikOffen}
            onUmschalten={() => setDynamikOffen((x) => !x)}
            kopfzeile={steilste.dynamik > 0 && !dynamikOffen ? (
              <span className="hidden text-sm text-ui-schiefer sm:inline">
                mit {prozent(steilste.dynamik)} Dynamik {euro(steilste.startbeitrag)} zum Start
              </span>
            ) : undefined}
          >
            <p className="mb-4 max-w-3xl text-sm leading-relaxed text-ui-schiefer">
              Steigt der Beitrag jedes Jahr, beginnt er niedriger und endet höher.
            </p>
            {schmal ? (
              <div className="space-y-2">
                {r.varianten.map((v) => (
                  <Karteikarte
                    key={v.dynamik}
                    titel={v.dynamik === 0 ? 'Gleichbleibender Beitrag' : `${prozent(v.dynamik)} Beitragsdynamik`}
                    hervor={gewaehlt(v.dynamik)}
                    zeilen={[
                      ['Start heute', euro(v.startbeitrag)],
                      ['Im letzten Sparjahr', euro(v.endbeitrag)],
                      ['Summe aller Beiträge', euro(v.summeBeitraege)],
                    ]}
                  />
                ))}
              </div>
            ) : (
              <ScrollBereich name="Tabelle: Beitragsdynamik im Vergleich">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-ui-linie text-left text-xs text-ui-schiefer">
                      <th className="py-2 pr-3 font-medium">Beitragsdynamik</th>
                      <th className="py-2 pr-3 text-right font-medium">Start heute</th>
                      <th className="py-2 pr-3 text-right font-medium">Im letzten Jahr</th>
                      <th className="py-2 text-right font-medium">Summe aller Beiträge</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Die gewaehlte Zeile in der Innenflaeche — hervorgehoben durch Flaeche und Gewicht, nicht durch Farbe. */}
                    {r.varianten.map((v) => (
                      <tr key={v.dynamik} className={`border-b border-ui-linie ${gewaehlt(v.dynamik) ? 'bg-ui-innen font-medium' : ''}`}>
                        <td className="py-2 pr-3 text-ui-tinte">{prozent(v.dynamik)}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-ui-tinte">{euro(v.startbeitrag)}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-ui-schiefer">{euro(v.endbeitrag)}</td>
                        <td className="py-2 text-right tabular-nums text-ui-schiefer">{euro(v.summeBeitraege)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollBereich>
            )}
          </AkkordeonKarte>
        </div>
      ),
    },
    /*
      Was Warten kostet — dieselbe Rechnung, nur mit spaeterem
      Beginn. Die Zeile "heute" bleibt als Bezugspunkt stehen.
    */
    ...(r.aufschub.length > 1 ? [{
      id: 'warten',
      titel: 'Was Warten kostet',
      ergebnis: `Ein Jahr später: ${euro(r.proJahrWarten.mehrProMonat)} mehr im Monat`,
      inhalt: (
        <Karte titel="Was es kostet, damit zu warten">
          {schmal ? (
            <div className="space-y-2">
              {r.aufschub.map((a) => (
                <Karteikarte
                  key={a.wartenJahre}
                  titel={
                    a.wartenJahre === 0
                      ? `Heute beginnen · ${a.sparjahre} Sparjahre`
                      : `In ${a.wartenJahre} Jahren · ${a.sparjahre} Sparjahre`
                  }
                  hervor={a.wartenJahre === 0}
                  zeilen={[
                    ['Startbeitrag', euro(a.startbeitrag)],
                    ['Summe aller Beiträge', euro(a.summeBeitraege)],
                    ['Mehr als heute', a.wartenJahre === 0 ? '—' : `+ ${euro(a.mehrGesamt)}`],
                  ]}
                />
              ))}
            </div>
          ) : (
            <ScrollBereich name="Tabelle: Späterer Beginn im Vergleich">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-ui-linie text-left text-xs text-ui-schiefer">
                    <th className="py-2 pr-3 font-medium">Beginn</th>
                    <th className="py-2 pr-3 text-right font-medium">Sparjahre</th>
                    <th className="py-2 pr-3 text-right font-medium">Startbeitrag</th>
                    <th className="py-2 pr-3 text-right font-medium">Summe</th>
                    <th className="py-2 text-right font-medium">Mehr als heute</th>
                  </tr>
                </thead>
                <tbody>
                  {r.aufschub.map((a) => (
                    <tr key={a.wartenJahre} className={`border-b border-ui-linie ${a.wartenJahre === 0 ? 'bg-ui-innen font-medium' : ''}`}>
                      <td className="py-2 pr-3 text-ui-tinte">{a.wartenJahre === 0 ? 'heute' : `in ${a.wartenJahre} Jahren`}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-ui-schiefer">{a.sparjahre}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-ui-tinte">{euro(a.startbeitrag)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-ui-schiefer">{euro(a.summeBeitraege)}</td>
                      <td className="py-2 text-right tabular-nums text-ui-tinte">
                        {a.wartenJahre === 0 ? <span className="text-ui-schiefer">—</span> : `+ ${euro(a.mehrGesamt)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollBereich>
          )}
          {/*
            DIE Aussage des ganzen Rechners — der Kernsatz der Etappe, in
            Inter Tight wie in der Beratung. Sachlich gesetzt, nicht in
            Warnrot: Die Zahl ist echt und gehoert ins Gespraech — draengen
            soll sie nicht.
          */}
          <Kernsatz klasse="mt-6">
            Ein Jahr später zu beginnen kostet <Hervor>{euro(r.proJahrWarten.mehrProMonat)}</Hervor> mehr im Monat
            — und {euro(r.proJahrWarten.mehrGesamt)} mehr Beiträge insgesamt.
          </Kernsatz>
          <p className="mt-3 text-xs leading-relaxed text-ui-schiefer">
            Obwohl dann über weniger Jahre gezahlt wird: Den späteren Beiträgen fehlen die
            Erträge der frühen Jahre. Gleiche Rendite und gleiches Ziel unterstellt.
          </p>
        </Karte>
      ),
    }] : []),
    /*
      DIE BRUECKE ZU DEN LOESUNGEN. Bis hierher steht, was die ganze Luecke
      kostet — oft mehr, als jemand zuruecklegen will, manchmal weniger. Hier
      waehlt der Kunde seinen Betrag; mit ihm rechnet der Vergleich der
      Loesungen weiter.

      DAS ERGEBNIS STEHT ALS KAPITAL DA, nicht als Anteil der Luecke: Eine
      Summe laesst sich greifen. Links, was der Beitrag anspart; rechts, was
      zur Rentenluecke noch fehlt; darunter die Summe, die die ganze Luecke
      braucht. Der Regler reicht bis zum DOPPELTEN des noetigen Beitrags: Ist
      die Luecke geschlossen, steht links das Kapital fuer die Altersvorsorge,
      rechts kommt hinzu, was darueber hinaus Vermoegen aufbaut, und darunter
      die Gesamtsumme.
    */
    ...(w ? [{
      id: 'wunsch',
      titel: `Was ${t.w('willst du', 'wollt ihr')} zurücklegen?`,
      ergebnis: !w.geschlossen
        ? `${euro(wunsch)} im Monat · ${euro(w.kapital)} Kapital, ${euro(w.kapitalFehlt)} fehlen zur Lücke`
        : w.kapitalMehr >= 1
          ? `${euro(wunsch)} im Monat · Lücke geschlossen, dazu ${euro(w.kapitalMehr)} Vermögensaufbau`
          : `${euro(wunsch)} im Monat schließen die Lücke ganz`,
      inhalt: (
        <section aria-labelledby="wunsch-titel" className={`${SCHWEBEND} p-5 sm:p-7`}>
          <h3 id="wunsch-titel" className="text-lg font-medium tracking-[-0.01em] text-ui-tinte sm:text-xl">
            Was {t.w('willst du', 'wollt ihr')} zurücklegen?
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ui-schiefer">
            Die ganze Lücke kostet {euro(w.noetig)} im Monat. Es muss nicht alles auf einmal sein — und mehr geht
            auch: Was darüber liegt, baut zusätzlich Vermögen auf. Mit dem Betrag, den {t.du} hier{' '}
            {t.w('wählst', 'wählt')}, entsteht danach {t.dein()} Vorschlag.
          </p>

          <div className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] sm:items-start">
            <ZahlFeld
              label={`${t.Dein()} Beitrag im Monat`}
              wert={wunsch}
              onChange={setzeWunsch}
              einheit="€"
              schritt={25}
              max={10_000}
            />
            {/* Bis zum Doppelten des noetigen Beitrags, aufgerundet — mehr laesst sich im Feld eintragen. */}
            <div className="sm:mt-8">
              <Regler
                wert={wunsch}
                max={reglerMax}
                schritt={5}
                onChange={setzeWunsch}
                beschriftung="Beitrag im Monat"
                wertText={`${wunsch} Euro im Monat`}
              />
              {/* Wo die Luecke schliesst: in der Mitte des Reglers. Nur zur Orientierung — der Satz darunter sagt es ohnehin. */}
              <div aria-hidden className="relative mt-2 h-4 text-xs text-ui-schiefer">
                <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${(w.noetig / reglerMax) * 100}%` }}>
                  {euro(w.noetig)} schließt die Lücke
                </span>
                <span className="absolute right-0 whitespace-nowrap tabular-nums">{euro(reglerMax)}</span>
              </div>
            </div>
          </div>

          <Kernsatz klasse="mt-6">
            {!w.geschlossen
              ? <>Mit <Hervor>{euro(wunsch)}</Hervor> im Monat {t.w('sparst du', 'spart ihr')} bis {zeile.jahr} <Hervor>{euro(w.kapital)}</Hervor> an.</>
              : w.kapitalMehr >= 1
                ? <>Mit <Hervor>{euro(wunsch)}</Hervor> im Monat {t.w('schließt du', 'schließt ihr')} die Lücke — und {t.w('baust', 'baut')} dazu <Hervor>{euro(w.kapitalMehr)}</Hervor> Vermögen auf.</>
                : <>Mit <Hervor>{euro(wunsch)}</Hervor> im Monat {t.w('schließt du', 'schließt ihr')} die Lücke <Hervor>ganz</Hervor>.</>}
          </Kernsatz>

          {/*
            Das Kapital als Balken, in den Farben der beiden Zahlen darunter:
            angespart in Tinte, was fehlt im Stein der Luecke — und sobald sie
            geschlossen ist, der Vermoegensaufbau daneben in Grau.
          */}
          <div
            role="img"
            aria-label={w.geschlossen
              ? `Die Lücke ist geschlossen, dazu ${euro(w.kapitalMehr)} Vermögensaufbau`
              : `${euro(w.kapital)} von ${euro(w.zielkapital)} angespart`}
            className="mt-5 flex h-2.5 w-full overflow-hidden rounded-full bg-ui-luecke"
          >
            <div className="h-full bg-ui-tinte transition-all duration-500" style={{ width: `${(Math.min(w.kapital, w.zielkapital) / balkenBasis) * 100}%` }} />
            {w.kapitalMehr > 0 && (
              <div className="h-full bg-ui-daten-2 transition-all duration-500" style={{ width: `${(w.kapitalMehr / balkenBasis) * 100}%` }} />
            )}
          </div>
          <dl className="mt-5 grid gap-x-6 gap-y-5 sm:grid-cols-2">
            {w.geschlossen ? (
              <>
                <Zahl punkt="bg-ui-tinte" etikett="Kapital für die Altersvorsorge" wert={euro(w.zielkapital)} unter="schließt die Rentenlücke" />
                <Zahl punkt="bg-ui-daten-2" etikett="+ Vermögensaufbau" wert={euro(w.kapitalMehr)} unter="zusätzliches Kapital, über die Lücke hinaus" />
              </>
            ) : (
              <>
                <Zahl punkt="bg-ui-tinte" etikett="Damit angespart" wert={euro(w.kapital)} unter={`bis zum Rentenbeginn ${zeile.jahr}`} />
                <Zahl punkt="bg-ui-luecke" etikett="Fehlt zur Rentenlücke" wert={euro(w.kapitalFehlt)} unter={`mit ${euro(w.noetig)} im Monat wäre sie geschlossen`} />
              </>
            )}
          </dl>
          <dl className="mt-4 text-sm">
            {w.geschlossen
              ? <Posten summe text={`Gesamtsumme bis ${zeile.jahr}`} wert={euro(w.zielkapital + w.kapitalMehr)} />
              : <Posten summe text="Kapital für die ganze Rentenlücke" wert={euro(w.zielkapital)} />}
            {anteilAmNetto(wunsch, nettoHeute) && (
              <Posten text={`Anteil an ${t.dein('em')} heutigen Netto`} wert={<span className="whitespace-nowrap">{anteilAmNetto(wunsch, nettoHeute)}</span>} />
            )}
          </dl>
          <p className="mt-4 text-xs leading-relaxed text-ui-schiefer">
            Kapital bei Rentenbeginn, gerechnet wie die Lücke darüber: {prozent(eingaben.rendite)} Rendite nach Kosten,{' '}
            {eingaben.dynamik > 0 ? `${prozent(eingaben.dynamik)} Beitragsdynamik` : 'gleichbleibender Beitrag'}, ohne
            Förderung. Mit Zulagen, Steuerersparnis oder dem Zuschuss des Arbeitgebers reicht derselbe Aufwand
            weiter — das zeigt der Vorschlag danach.
          </p>
        </section>
      ),
    }] : []),
  ];

  return <Stuecke kennung="sparen" beschriftung="Stücke des Sparrechners" stuecke={stuecke} />;
}

/**
 * Eine Tabellenzeile als Karte — fuer das Telefon.
 *
 * Fuenf Spalten auf 360 Punkten geben je siebzig, und "227.110 €" braucht
 * allein sechzig. Statt die Betraege umbrechen zu lassen, steht auf dem
 * Telefon jede Zeile untereinander: Beschriftung links, Betrag rechts. Der
 * Inhalt ist derselbe wie in der Tabelle, nur gedreht.
 */
function Karteikarte({ titel, zeilen, hervor }: {
  titel: string;
  zeilen: [string, string][];
  /** Die gewaehlte bzw. heutige Zeile — mit Rand in Tinte statt Farbe */
  hervor?: boolean;
}) {
  return (
    <div className={`rounded-[10px] border p-3 ${hervor ? 'border-ui-tinte bg-ui-karte' : 'border-ui-linie bg-ui-karte'}`}>
      <div className="text-sm font-medium text-ui-tinte">{titel}</div>
      <dl className="mt-1.5 space-y-0.5">
        {zeilen.map(([text, wert]) => (
          <div key={text} className="flex items-baseline justify-between gap-3">
            <dt className="text-xs text-ui-schiefer">{text}</dt>
            <dd className="text-sm font-medium tabular-nums text-ui-tinte">{wert}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Eine Zahl der Rechnung: leises Etikett, die Zahl gross, darunter die Einordnung — wie `Zahl` der Beratung. */
function Kachel({ titel, wert, hinweis }: { titel: string; wert: string; hinweis: string }) {
  return (
    <div>
      <dt className="text-sm text-ui-schiefer">{titel}</dt>
      <dd className="mt-0.5 text-[28px] font-medium leading-tight tabular-nums text-ui-tinte">{wert}</dd>
      <dd className="mt-1 text-xs leading-snug text-ui-schiefer">{hinweis}</dd>
    </div>
  );
}
