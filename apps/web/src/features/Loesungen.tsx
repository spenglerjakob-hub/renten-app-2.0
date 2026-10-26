import { useMemo } from 'react';
import { BadgeEuro, FilePlus2, Scale, Trash2, Trophy } from 'lucide-react';
import {
  loesungsvergleich, type Jahreszeile, type Loesung, type LoesungId, type LoesungsVorgabe,
} from '@renten/engine';
import { useSzenario, type SzenarioParsed } from '../store/szenario';
import {
  ZahlFeld, ProzentFeld, TextFeld, AuswahlFeld, euro, euroGenau, prozent, InfoPunkt,
} from '../components/Feld';
import { AKZENT, EINLEITUNG, Hervor, KNOPF_ZWEIT, LINK, Titel } from '../components/stil';
import {
  foerderBasis, loesungsOptionen, auszeichnungen, angebotPositionen, angebotKenntKapital, type AngebotPosition,
} from './tuev-berechnung';
import { personNameAus } from './personen';
import { anteilAmNetto, anteilAnLuecke } from './bezug';

/**
 * LOESUNGEN — die letzte Etappe der Beratung.
 *
 * Oben: Was wird aus einem Netto-Betrag in jeder Schicht? Je Loesung der
 * Beitrag, der nach Steuer- und Abgabenersparnis genau diesen Betrag kostet,
 * und was am Ende im Vertrag landet (`loesungsvergleich` im Rechenkern).
 * Umgeschaltet auf BRUTTO andersherum: derselbe Beitrag in jeder Schicht,
 * und was er netto kostet.
 *
 * Unten: die Angebote. Mit den Beitraegen von oben holt man Angebote ein,
 * traegt die Rente ein, die der Anbieter nennt, und sieht, welches netto am
 * meisten bringt — gerechnet wie ein Vertrag im Vertrags-TUEV, mit der
 * Steuer und Krankenversicherung im Alter.
 */

const LOESUNG_TEXT: Record<LoesungId, string> = {
  avd: 'Altersvorsorgedepot',
  bav: 'Betriebsrente (Entgeltumwandlung)',
  basis: 'Basisrente (Rürup)',
  privat: 'Private Rente / Depot',
};

const zahl = (n: number, stellen = 2) =>
  n.toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen });

export function Loesungen({ zeile, szenario, sparrate, nettoHeute = 0 }: {
  zeile: Jahreszeile | null;
  /** Das heutige Haushaltsnetto im Monat — die Bezugsgroesse fuer den Aufwand */
  nettoHeute?: number;
  /** Das Szenario der Ansicht — in der Einzelbetrachtung nur eine Person */
  szenario: SzenarioParsed;
  /** Der Startbeitrag aus dem Sparrechner, falls es eine Luecke gibt */
  sparrate: number | null;
}) {
  const l = szenario.loesungen;
  const setzeLoesungen = useSzenario((x) => x.setzeLoesungen);
  const angebotHinzufuegen = useSzenario((x) => x.angebotHinzufuegen);

  const brutto = l.vorgabe === 'brutto';
  const betrag = brutto ? l.bruttoMonat : l.nettoMonat;
  const festbetrag = l.agZuschussArt === 'festbetrag';
  const loesungen = useMemo(() => {
    const b = foerderBasis(szenario, zeile);
    return loesungsvergleich(b.kontext, b.steuerOpt, b.p, betrag, loesungsOptionen(l));
  }, [szenario, zeile, betrag, l]);

  // „Meiste" und „Guenstigste" — dieselbe Regel wie im Gutachten.
  const auszeichnung = auszeichnungen(loesungen, brutto);
  const bav = loesungen.find((x) => x.id === 'bav' && x.verfuegbar);

  /*
    Prozent oder fester Betrag — beide Werte bleiben gemerkt. Beim ersten
    Wechsel auf Euro steht der Zuschuss von eben im Feld, gerundet: Die
    Ergebnisse springen dann nicht.
  */
  const zuschussArtWechseln = (art: string) => {
    if (art !== 'prozent' && art !== 'festbetrag') return;
    setzeLoesungen(art === 'festbetrag' && l.agZuschussFestMonat === 0 && bav
      ? { agZuschussArt: art, agZuschussFestMonat: Math.round(bav.agZuschussMonat) }
      : { agZuschussArt: art });
  };

  const erfassen = (x: Loesung) => angebotHinzufuegen({
    loesung: x.id,
    name: '',
    inhaber: 'A',
    beitragMonat: Math.round(x.eigenbeitragMonat),
    agZuschussMonat: Math.round(x.agZuschussMonat * 100) / 100,
    dynamik: 0,
    renteMonat: 0,
    kapital: 0,
  });

  return (
    <div className="space-y-8 sm:space-y-10">
      <section aria-labelledby="loesungen-titel">
        {/* Die Frage des Abschnitts als Titel in Inter Tight, der Betrag darin hervorgehoben. */}
        <div className="mb-6">
          <Titel als="h2" id="loesungen-titel" klasse="flex items-center gap-3">
            <Scale className="h-6 w-6 shrink-0 text-ui-schiefer" aria-hidden />
            <span>
              {brutto
                ? <>Was kosten <Hervor>{euro(betrag)}</Hervor> Beitrag im Monat netto?</>
                : <>Was wird aus <Hervor>{euro(betrag)}</Hervor> netto im Monat?</>}
            </span>
          </Titel>
          <p className={`mt-2 ${EINLEITUNG}`}>
            {brutto
              ? 'Derselbe Beitrag in jeder Schicht — und was er Sie nach Steuer- und Abgabenersparnis wirklich '
                + 'kostet. Dazu, was im Vertrag landet: mit Zulagen, Arbeitgeberzuschuss und Ihrem persönlichen '
                + 'Steuersatz, nicht mit einem Durchschnitt.'
              : 'Je Schicht der Beitrag, der Sie nach Steuer- und Abgabenersparnis genau diesen Betrag kostet — '
                + 'und was dann im Vertrag landet: mit Zulagen, Arbeitgeberzuschuss und Ihrem persönlichen '
                + 'Steuersatz, nicht mit einem Durchschnitt.'}
          </p>
        </div>

        {/*
          Der Schalter steht ueber den Feldern, nicht in der ersten Spalte: So
          beginnen alle Felder auf einer Hoehe. Hilfetexte stehen darunter und
          verschieben nichts.
        */}
        <div className="ui-karte mb-6 p-5 sm:p-7">
          <VorgabeSchalter wert={l.vorgabe} onWechsel={(v) => setzeLoesungen({ vorgabe: v })} />
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <ZahlFeld
                label={brutto ? 'Brutto-Beitrag im Monat' : 'Netto-Aufwand im Monat'}
                wert={betrag}
                onChange={(n) => setzeLoesungen(brutto ? { bruttoMonat: n } : { nettoMonat: n })}
                einheit="€"
                schritt={25}
                max={10_000}
                hilfe={brutto ? 'Bei der Betriebsrente die Bruttoumwandlung, beim Altersvorsorgedepot der Eigenbeitrag.' : undefined}
              />
              {sparrate !== null && sparrate > 0.5 && Math.abs(sparrate - betrag) > 0.5 && (
                <button
                  type="button"
                  onClick={() => setzeLoesungen(brutto ? { bruttoMonat: Math.round(sparrate) } : { nettoMonat: Math.round(sparrate) })}
                  className={`mt-1.5 text-left ${LINK} text-xs`}
                >
                  Sparrate aus dem Sparrechner übernehmen ({euro(sparrate)})
                </button>
              )}
            </div>
            {bav && (
              <ZahlFeld
                label="Arbeitgeberzuschuss zur bAV"
                wert={festbetrag ? l.agZuschussFestMonat : Math.round(l.agZuschussQuote * 1000) / 10}
                onChange={(n) => setzeLoesungen(festbetrag
                  ? { agZuschussFestMonat: n }
                  : { agZuschussQuote: Math.max(0.15, n / 100) })}
                min={festbetrag ? 0 : 15}
                max={festbetrag ? 5_000 : 100}
                einheitWahl={{ optionen: ZUSCHUSS_EINHEITEN, aktiv: l.agZuschussArt, onWechsel: zuschussArtWechseln }}
                hilfe={festbetrag
                  ? 'Fester Betrag im Monat. Mindestens gilt der gesetzliche Zuschuss: 15 % der Umwandlung, '
                    + 'soweit der Arbeitgeber Abgaben spart.'
                  : 'Mindestens die gesetzlichen 15 %. Bei einem Zuschussmodell etwa 50 %.'}
              />
            )}
            <ZahlFeld
              label="Lebenserwartung (für die Angebote)"
              wert={l.lebenserwartung}
              onChange={(n) => setzeLoesungen({ lebenserwartung: n })}
              min={60}
              max={120}
              einheit="J."
              stufen
            />
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 sm:gap-6 xl:grid-cols-4">
          {loesungen.map((x) => (
            <LoesungsKarte
              key={x.id}
              x={x}
              brutto={brutto}
              bester={auszeichnung.meiste.includes(x.id)}
              guenstigste={auszeichnung.guenstigste.includes(x.id)}
              onErfassen={() => erfassen(x)}
              nettoHeute={nettoHeute}
            />
          ))}
        </div>
        <p className="mt-4 text-xs leading-relaxed text-ui-schiefer">
          Das ist die Einzahlseite. Was im Alter davon netto ankommt, hängt am Angebot — an der Rente,
          die der Anbieter nennt, und an Steuer und Krankenversicherung. Das rechnet der Vergleich darunter.
        </p>
      </section>

      <Angebote szenario={szenario} nettoHeute={nettoHeute} />
    </div>
  );
}

const ZUSCHUSS_EINHEITEN = [
  { id: 'prozent', text: '%', titel: 'Zuschuss in Prozent der Umwandlung' },
  { id: 'festbetrag', text: '€', titel: 'Zuschuss als fester Betrag im Monat' },
] as const;

/** Netto-Aufwand oder Beitrag vorgeben — die beiden Fragen aus dem Gespraech. */
function VorgabeSchalter({ wert, onWechsel }: { wert: LoesungsVorgabe; onWechsel: (v: LoesungsVorgabe) => void }) {
  return (
    /* Als Pillen wie die Zahlweise auf der Preisseite. */
    <div role="radiogroup" aria-label="Vorgabe" className="inline-flex gap-1 rounded-full border border-ui-linie bg-ui-karte p-1 print:hidden">
      {([['netto', 'Netto-Aufwand'], ['brutto', 'Brutto-Beitrag']] as const).map(([id, text]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={wert === id}
          onClick={() => onWechsel(id)}
          className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
            wert === id ? 'bg-ui-dunkel text-white' : 'text-ui-schiefer hover:text-ui-tinte'
          }`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

function LoesungsKarte({ x, brutto, bester, guenstigste, onErfassen, nettoHeute }: {
  x: Loesung; brutto: boolean; bester: boolean; guenstigste: boolean; onErfassen: () => void;
  nettoHeute: number;
}) {
  const anteil = anteilAmNetto(x.nettoMonat, nettoHeute);
  const beitragText = x.id === 'bav' ? 'Bruttoumwandlung' : 'Ihr Beitrag';
  const ersparnis: [string, number][] = [
    ...(x.steuerErsparnisMonat >= 0.5 ? [['Steuerersparnis', x.steuerErsparnisMonat] as [string, number]] : []),
    ...(x.svErsparnisMonat >= 0.5 ? [['Sozialabgaben gespart', x.svErsparnisMonat] as [string, number]] : []),
  ];
  const zusatz: [string, number][] = [
    ...(x.zulageMonat >= 0.5 ? [['+ Zulagen', x.zulageMonat] as [string, number]] : []),
    ...(x.agZuschussMonat >= 0.5 ? [['+ Arbeitgeberzuschuss', x.agZuschussMonat] as [string, number]] : []),
  ];
  /*
    Die Rechnung laeuft in Leserichtung: Netto-Vorgabe von unten nach oben
    (Aufwand plus Ersparnis ist der Beitrag), Brutto-Vorgabe von oben nach
    unten (Beitrag minus Ersparnis ist der Aufwand).
  */
  // Die erste Zeile der Brutto-Rechnung ist ihr Ausgangsbetrag — betont durch Gewicht, nicht durch Farbe.
  const zeilen: [string, number, boolean?][] = brutto
    ? [
        [`${beitragText} (brutto)`, x.eigenbeitragMonat, true],
        ...ersparnis.map(([t, w]) => [`− ${t}`, w] as [string, number]),
      ]
    : [
        ['Ihr Netto-Aufwand', x.nettoMonat],
        ...ersparnis.map(([t, w]) => [`+ ${t}`, w] as [string, number]),
      ];
  const summe: [string, number] = brutto
    ? ['= Kostet Sie netto', x.nettoMonat]
    : [x.id === 'bav' ? '= Bruttoumwandlung' : '= Ihr Beitrag', x.eigenbeitragMonat];
  const geld = (n: number) => euroGenau(Math.round(n * 100) / 100);
  /*
    Die ausgezeichnete Loesung („Meiste“, „Günstigste“) ist die Akzentkarte:
    die Marke wie „Empfohlen“ auf der Preisseite, der Betrag hervorgehoben.
    Gruen und ein Ring sagten dasselbe lauter.
    Akzentkarte und Karte sehen gleich aus — der Akzent sitzt im Betrag.
  */
  const ausgezeichnet = guenstigste || bester;
  return (
    <article
      className={`flex flex-col overflow-hidden ${ausgezeichnet ? AKZENT : 'ui-karte'} ${x.verfuegbar ? '' : 'opacity-70'}`}
    >
      <header className="flex items-start justify-between gap-2 px-5 pt-5">
        <div className="min-w-0">
          <span className="text-xs text-ui-schiefer">Schicht {x.schicht}</span>
          {/* Mit Silbentrennung: „(Entgeltumwandlung)“ passt in vier Spalten sonst nicht in die Karte. */}
          <h4 className="mt-0.5 break-words text-base font-medium leading-snug text-ui-tinte hyphens-auto">{x.titel}</h4>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {guenstigste && (
            <span className="ui-marke flex items-center gap-1 px-2 py-0.5 text-xs font-medium">
              <BadgeEuro className="h-3 w-3" aria-hidden /> Günstigste
            </span>
          )}
          {bester && (
            <span className="ui-marke flex items-center gap-1 px-2 py-0.5 text-xs font-medium">
              <Trophy className="h-3 w-3" aria-hidden /> Meiste
            </span>
          )}
        </div>
      </header>

      {x.verfuegbar ? (
        <div className="flex flex-1 flex-col p-5 pt-4">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-ui-schiefer">
              {brutto ? 'Kostet Sie netto' : 'Im Vertrag'}
            </span>
            <span className="ui-titel text-[28px] font-normal leading-none tabular-nums text-ui-tinte">
              {ausgezeichnet
                ? <Hervor>{geld(brutto ? x.nettoMonat : x.vertragMonat)}</Hervor>
                : geld(brutto ? x.nettoMonat : x.vertragMonat)}
            </span>
          </div>
          <p className="mt-1.5 text-right text-xs text-ui-schiefer">
            {brutto && <>Im Vertrag {geld(x.vertragMonat)} · </>}
            <span className="font-medium text-ui-tinte">{zahl(x.hebel)} ×</span> {brutto ? 'je Netto-Euro' : 'Ihr Netto-Aufwand'}
          </p>

          {/* Die Rechnung als Posten mit Summenlinie in Tinte — wie die Aufstellungen der Beratung. */}
          <dl className="mt-4 space-y-1 text-xs">
            {zeilen.map(([t, w, betont]) => (
              <div key={t} className="flex justify-between gap-2">
                <dt className={betont ? 'font-medium text-ui-tinte' : 'text-ui-schiefer'}>{t}</dt>
                <dd className={`tabular-nums text-ui-tinte ${betont ? 'font-medium' : ''}`}>{geld(w)}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-2 border-t border-ui-tinte pt-1.5 font-medium">
              <dt className="text-ui-tinte">{summe[0]}</dt>
              <dd className="tabular-nums text-ui-tinte">{geld(summe[1])}</dd>
            </div>
            {zusatz.length > 0 && brutto && (
              <p className="pt-1.5 text-xs font-medium text-ui-schiefer">Zusätzlich im Vertrag</p>
            )}
            {zusatz.map(([t, w]) => (
              <div key={t} className="flex justify-between gap-2">
                <dt className="text-ui-schiefer">{t}</dt>
                <dd className="tabular-nums text-ui-tinte">{geld(w)}</dd>
              </div>
            ))}
          </dl>

          {/*
            DER AUFWAND IM VERHAELTNIS. Bewusst nur der Aufwand: Wie viel der
            Luecke eine Loesung schliesst, steht erst fest, wenn ein Angebot die
            Rente nennt — dann rechnet es der Vergleich darunter nach Steuer und
            Krankenversicherung. Eine Schaetzung hier fiele bei der bAV zu hoch
            aus, deren Rente spaeter voll steuer- und beitragspflichtig ist.
          */}
          {anteil && (
            <p className="mt-3 text-xs text-ui-schiefer">
              Netto-Aufwand {geld(x.nettoMonat)} = <strong className="font-medium text-ui-tinte">{anteil}</strong> Ihres heutigen Nettos
            </p>
          )}
          <p className="mt-3 text-xs leading-relaxed text-ui-schiefer">
            <strong className="font-medium text-ui-tinte">Im Alter:</strong> {x.besteuerung}
          </p>
          {/* Begrenzte Loesungen sagen es in Tinte statt in Bernstein — der Satz selbst traegt die Einschraenkung. */}
          {x.hinweise.map((h) => (
            <p key={h} className={`mt-1.5 text-xs leading-relaxed ${x.begrenzt ? 'text-ui-tinte' : 'text-ui-schiefer'}`}>{h}</p>
          ))}

          <div className="flex-1" />
          <button type="button" onClick={onErfassen} className={`mt-4 w-full print:hidden ${KNOPF_ZWEIT}`}>
            <FilePlus2 className="h-4 w-4 shrink-0" aria-hidden /> Angebot mit diesem Beitrag erfassen
          </button>
        </div>
      ) : (
        <div className="p-5 pt-3 text-xs leading-relaxed text-ui-schiefer">
          {x.hinweise.map((h) => <p key={h}>{h}</p>)}
        </div>
      )}
    </article>
  );
}

/* ---------------------------------------------------------------------- */

function Angebote({ szenario, nettoHeute }: { szenario: SzenarioParsed; nettoHeute: number }) {
  const angebote = szenario.loesungen.angebote;
  const angebotAendern = useSzenario((x) => x.angebotAendern);
  const angebotEntfernen = useSzenario((x) => x.angebotEntfernen);
  const angebotHinzufuegen = useSzenario((x) => x.angebotHinzufuegen);
  const paar = szenario.haushalt.verheiratet && szenario.personen.length > 1;

  const positionen = useMemo(() => angebotPositionen(szenario), [szenario]);

  return (
    <section aria-labelledby="angebote-titel">
      <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <Titel als="h2" id="angebote-titel">Angebote vergleichen</Titel>
          <p className={`mt-2 ${EINLEITUNG}`}>
            Holen Sie mit den Beiträgen oben Angebote ein und tragen Sie die Rente ein, die der Anbieter
            zum Rentenbeginn nennt — und, wo es sie gibt, die Kapitalabfindung. Gerechnet wird wie im
            Vertrags-TÜV: was das Angebot Sie netto kostet, gegen das, was im Alter nach Steuer und
            Krankenversicherung ankommt.
          </p>
        </div>
        {angebote.length < 12 && (
          <button
            type="button"
            onClick={() => angebotHinzufuegen({
              loesung: 'privat', name: '', inhaber: 'A', beitragMonat: 100, agZuschussMonat: 0, dynamik: 0,
              renteMonat: 0, kapital: 0,
            })}
            className={`shrink-0 print:hidden ${KNOPF_ZWEIT}`}
          >
            <FilePlus2 className="h-4 w-4" aria-hidden /> Leeres Angebot
          </button>
        )}
      </div>

      {angebote.length === 0 ? (
        <p className="rounded-[10px] border border-dashed border-ui-feld-rand px-4 py-8 text-center text-sm text-ui-schiefer">
          Noch kein Angebot erfasst. Über „Angebot mit diesem Beitrag erfassen“ oben übernehmen Sie den
          Beitrag einer Lösung als Ausgangspunkt.
        </p>
      ) : (
        <>
          <div className="grid gap-5 sm:grid-cols-2 sm:gap-6 xl:grid-cols-3">
            {positionen.map(({ angebot: a }, i) => {
              const kapitalMoeglich = angebotKenntKapital(a.loesung);
              return (
                <article key={a.id} className="ui-karte p-5">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="text-base font-medium text-ui-tinte">Angebot {i + 1}</span>
                    <button
                      type="button"
                      onClick={() => angebotEntfernen(a.id)}
                      aria-label={`Angebot ${i + 1} entfernen`}
                      className="rounded-full p-1.5 text-ui-schiefer hover:bg-rose-50 hover:text-rose-700 print:hidden"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                  <div className="grid gap-2.5">
                    <TextFeld
                      label="Anbieter / Tarif"
                      wert={a.name}
                      onChange={(v) => angebotAendern(a.id, { name: v })}
                      platzhalter={LOESUNG_TEXT[a.loesung]}
                    />
                    <div className={paar ? 'grid grid-cols-2 gap-2' : 'grid gap-2'}>
                      <AuswahlFeld
                        label="Lösung"
                        wert={a.loesung}
                        onChange={(v) => angebotAendern(a.id, { loesung: v })}
                        optionen={(Object.keys(LOESUNG_TEXT) as LoesungId[]).map((id) => ({ wert: id, text: LOESUNG_TEXT[id] }))}
                      />
                      {paar && (
                        <AuswahlFeld
                          label="Für"
                          wert={a.inhaber}
                          onChange={(v) => angebotAendern(a.id, { inhaber: v })}
                          optionen={szenario.personen.map((p) => ({ wert: p.id, text: personNameAus(szenario.personen, p.id) }))}
                        />
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <ZahlFeld
                        label={a.loesung === 'bav' ? 'Umwandlung brutto' : a.loesung === 'avd' ? 'Eigenbeitrag' : 'Beitrag'}
                        wert={a.beitragMonat}
                        onChange={(n) => angebotAendern(a.id, { beitragMonat: n })}
                        einheit="€"
                      />
                      {a.loesung === 'bav' ? (
                        <ZahlFeld
                          label="Arbeitgeber"
                          wert={a.agZuschussMonat}
                          onChange={(n) => angebotAendern(a.id, { agZuschussMonat: n })}
                          einheit="€"
                        />
                      ) : (
                        <ProzentFeld
                          label="Dynamik p. a."
                          wert={a.dynamik}
                          onChange={(n) => angebotAendern(a.id, { dynamik: n })}
                          max={10}
                        />
                      )}
                    </div>
                    {a.loesung === 'bav' && (
                      <ProzentFeld
                        label="Dynamik p. a."
                        wert={a.dynamik}
                        onChange={(n) => angebotAendern(a.id, { dynamik: n })}
                        max={10}
                      />
                    )}
                    <ZahlFeld
                      label="Rente laut Angebot (brutto, Monat)"
                      wert={a.renteMonat}
                      onChange={(n) => angebotAendern(a.id, { renteMonat: n })}
                      einheit="€"
                      hilfe={kapitalMoeglich
                        ? 'Garantiert oder prognostiziert, zum Rentenbeginn. Nennt das Angebot nur ein Kapital, genügt das Feld darunter.'
                        : 'Garantiert oder prognostiziert — so, wie der Anbieter sie zum Rentenbeginn nennt.'}
                    />
                    {kapitalMoeglich ? (
                      <ZahlFeld
                        label="Kapital laut Angebot (einmalig, brutto)"
                        wert={a.kapital}
                        onChange={(n) => angebotAendern(a.id, { kapital: n })}
                        einheit="€"
                        schritt={1000}
                        hilfe="Statt der Rente — die Abfindung zum Rentenbeginn."
                      />
                    ) : (
                      <p className="text-xs leading-relaxed text-ui-schiefer">
                        Eine volle Kapitalauszahlung ist {a.loesung === 'basis' ? 'bei der Basisrente' : 'beim Altersvorsorgedepot'} nicht
                        vorgesehen — gerechnet wird die Rente.
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          <AngebotsTabelle positionen={positionen} nettoHeute={nettoHeute} />
        </>
      )}
    </section>
  );
}

type Position = AngebotPosition;
type Zeile =
  | { gruppe: string }
  | { text: string; info?: string; stark?: boolean; wert: (p: Position) => string | null };

const jahre = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 });

/** Die Einzahlseite ist bei beiden Wegen dieselbe — sie kommt aus dem, der gerechnet ist. */
const einzahlung = (p: Position) => p.rente ?? p.kapital;

/** Die hoechste Nettorendite eines Angebots ueber beide Wege. */
const besteRenditeVon = (p: Position) => Math.max(p.rente?.rendite ?? -Infinity, p.kapital?.rendite ?? -Infinity);

function AngebotsTabelle({ positionen, nettoHeute }: { positionen: Position[]; nettoHeute: number }) {
  const mitRente = positionen.some((p) => p.rente);
  const mitKapital = positionen.some((p) => p.kapital);
  const mitVergleich = positionen.some((p) => p.breakEven);
  const gerechnet = positionen.filter((p) => p.rente || p.kapital);
  const beste = gerechnet.reduce((m, p) => Math.max(m, besteRenditeVon(p)), -Infinity);

  const zeilen: Zeile[] = [
    { text: 'Kostet Sie netto im Monat', wert: (p) => { const e = einzahlung(p); return e ? euro(e.echterAufwandMonat) : null; } },
    ...(nettoHeute > 0 ? [{
      text: 'In % Ihres heutigen Nettos',
      info: `Der Netto-Aufwand im Verhältnis zum heutigen Haushaltsnetto von ${euro(nettoHeute)} im Monat.`,
      wert: (p: Position) => { const e = einzahlung(p); return e ? anteilAmNetto(e.echterAufwandMonat, nettoHeute) : null; },
    }] : []),
    { text: 'Fließt in den Vertrag', wert: (p) => { const e = einzahlung(p); return e ? euro(e.beitragMonat + e.zulageMonat) : null; } },
    ...(mitRente ? [
      { gruppe: 'Als Rente' },
      { text: 'Rente brutto', wert: (p: Position) => (p.rente ? euro(p.rente.bruttoRenteMonat) : null) },
      {
        text: 'Rente netto', stark: true,
        info: 'Nach Steuer und Kranken-/Pflegeversicherung im ersten Rentenjahr — anteilig an der Steuer des Haushalts, wie im Kassenbon.',
        wert: (p: Position) => (p.rente ? euro(p.rente.nettoRenteMonat) : null),
      },
      ...(positionen.some((p) => p.lueckeAnteil) ? [{
        text: 'Schließt von der Lücke',
        info: 'So viel steigt das Netto des Haushalts im ersten Rentenjahr mit diesem Angebot — geteilt durch die Lücke im selben Jahr. Nach Steuer und Krankenversicherung.',
        wert: (p: Position) => (p.lueckeAnteil ? anteilAnLuecke(p.lueckeAnteil.anteil) : null),
      }] : []),
      {
        text: 'Netto-Rente je 100 € Aufwand',
        wert: (p: Position) => (p.rente && p.rente.echterAufwandMonat > 0
          ? euroGenau(Math.round(p.rente.nettoRenteMonat / p.rente.echterAufwandMonat * 10_000) / 100) : null),
      },
      {
        text: 'Netto-Hebel', info: 'Netto-Auszahlung über die Laufzeit je Euro Netto-Aufwand, ohne Verzinsung.',
        wert: (p: Position) => (p.rente ? `${zahl(p.rente.nettoHebel)} ×` : null),
      },
      {
        text: 'Nettorendite p. a.', stark: true,
        info: 'Der interne Zinsfuß aller Netto-Zahlungen: Aufwand in der Ansparphase gegen Netto-Rente bis zur Lebenserwartung.',
        wert: (p: Position) => (p.rente ? prozent(p.rente.rendite, 2) : null),
      },
      {
        text: 'Amortisation ab Rentenbeginn',
        wert: (p: Position) => (p.rente ? `${jahre(p.rente.amortisationsJahre)} J.` : null),
      },
    ] : []),
    ...(mitKapital ? [
      { gruppe: 'Als Kapital' },
      { text: 'Kapital brutto', wert: (p: Position) => (p.kapital ? euro(p.kapital.bruttoKapital) : null) },
      {
        text: '− Steuer im Zuflussjahr',
        info: 'bAV: voll steuerpflichtig. Private Rentenversicherung: nur der Ertrag, nach 12 Jahren und ab 62 zur Hälfte.',
        wert: (p: Position) => (p.kapital ? euro(p.kapital.steuerKapital) : null),
      },
      {
        text: '− Kranken- und Pflegeversicherung',
        info: 'Bei der bAV verteilt auf zehn Jahre (§ 229 SGB V), hier in einer Summe. Private Rentenversicherung in der KVdR beitragsfrei.',
        wert: (p: Position) => (p.kapital ? euro(p.kapital.kvPvKapital) : null),
      },
      { text: 'Kapital netto', stark: true, wert: (p: Position) => (p.kapital ? euro(p.kapital.nettoKapital) : null) },
      { text: 'Netto-Hebel', wert: (p: Position) => (p.kapital ? `${zahl(p.kapital.nettoHebel)} ×` : null) },
      { text: 'Nettorendite p. a.', stark: true, wert: (p: Position) => (p.kapital ? prozent(p.kapital.rendite, 2) : null) },
    ] : []),
    ...(mitVergleich ? [
      { gruppe: 'Rente oder Kapital?' },
      {
        text: 'Rente holt das Kapital ein mit',
        info: 'Ab diesem Alter hat die Netto-Rente zusammengerechnet mehr gebracht als das Netto-Kapital — ohne Verzinsung des Kapitals.',
        wert: (p: Position) => (p.breakEven ? `${jahre(p.breakEven.breakEvenOhneZins)} Jahren` : null),
      },
      {
        text: '… mit 2 % Zins auf das Kapital',
        wert: (p: Position) => (p.breakEven
          ? (p.breakEven.kapitalTraegtSichSelbst ? 'nie' : `${jahre(p.breakEven.breakEvenMitZins)} Jahren`)
          : null),
      },
    ] : []),
  ];
  const spalten = positionen.length + 1;

  return (
    <div className="ui-karte mt-6 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-ui-linie bg-ui-innen text-left">
              <th className="sticky left-0 bg-ui-innen px-4 py-2.5 text-xs font-medium text-ui-schiefer">Vergleich</th>
              {positionen.map((p, i) => (
                <th key={p.angebot.id} className="px-4 py-2.5 text-right align-bottom">
                  <span className="block text-xs font-normal text-ui-schiefer">Angebot {i + 1}</span>
                  <span className="block font-medium leading-tight text-ui-tinte">{p.angebot.name || LOESUNG_TEXT[p.angebot.loesung]}</span>
                  {gerechnet.length > 1 && (p.rente || p.kapital) && Math.abs(besteRenditeVon(p) - beste) < 1e-9 && (
                    <span className="ui-marke mt-1 inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium">
                      <Trophy className="h-3 w-3" aria-hidden /> Bestes
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {zeilen.map((z) => ('gruppe' in z ? (
              <tr key={z.gruppe} className="border-b border-ui-linie bg-ui-innen">
                <td colSpan={spalten} className="sticky left-0 px-4 pb-1.5 pt-3 text-xs font-medium text-ui-schiefer">
                  {z.gruppe}
                </td>
              </tr>
            ) : (
              /* Die entscheidenden Zeilen (Netto, Rendite) durch Gewicht betont, nicht durch Farbe. */
              <tr key={z.text} className={`border-b border-ui-linie last:border-0 ${z.stark ? 'font-medium' : ''}`}>
                <td className={`sticky left-0 bg-ui-karte px-4 py-2 ${z.stark ? 'text-ui-tinte' : 'text-ui-schiefer'}`}>
                  {z.text}{z.info && <InfoPunkt titel={z.text}>{z.info}</InfoPunkt>}
                </td>
                {positionen.map((p) => {
                  const w = z.wert(p);
                  return (
                    <td key={p.angebot.id} className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-ui-tinte">
                      {w ?? <span className="font-normal text-ui-schiefer">—</span>}
                    </td>
                  );
                })}
              </tr>
            )))}
          </tbody>
        </table>
      </div>
      {positionen.some((p) => !p.rente && !p.kapital) && (
        <p className="border-t border-ui-linie bg-ui-innen px-4 py-3 text-xs text-ui-tinte">
          Bei Angeboten ohne Beitrag oder ohne Rente bzw. Kapital fehlt die Rechnung — tragen Sie beides ein.
        </p>
      )}
    </div>
  );
}
