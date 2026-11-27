import { useMemo } from 'react';
import { ClipboardCheck, FilePlus2, Trash2 } from 'lucide-react';
import type { LoesungId } from '@renten/engine';
import { useSzenario, type SzenarioParsed } from '../store/szenario';
import {
  ZahlFeld, ProzentFeld, TextFeld, AuswahlFeld, Kennzahl, GegenueberZeile, InfoPunkt, euro, euroGenau, prozent,
} from '../components/Feld';
import { EINLEITUNG, Hervor, Kernsatz, KNOPF, KNOPF_ZWEIT, Titel } from '../components/stil';
import { useAnsprache } from '../components/Ansprache';
import {
  angebotPositionen, angebotKenntKapital, belastungsTreppe, laufzeitText, ohneEigenaufwand,
  ohneEigenaufwandText, tuevBasis, type AngebotPosition,
} from './tuev-berechnung';
import { personNameAus } from './personen';
import { anteilAmNetto, anteilAnLuecke } from './bezug';
import { BLOCK, BLOCK_TITEL, SUMME, WegZeile, ZulagenBlock } from './TuevTeile';

/**
 * DIE ANGEBOTE — nach dem Vorschlag (`Vorschlag.tsx`) der zweite Schritt zu
 * den Loesungen; die angenommenen Angebote rechnet danach die Etappe
 * „Abschluss“ ins Ergebnis.
 *
 * Der Vorschlag legt je Baustein ein Angebot mit seinem Beitrag an. Damit
 * holt man Angebote ein und traegt die Rente ein, die der Anbieter nennt.
 *
 * JEDES ANGEBOT STEHT FUER SICH, als Karte ueber die ganze Breite wie ein
 * Vertrag im Vertrags-TUEV: links das Angebot, in der Mitte Einzahlung gegen
 * Auszahlung, rechts seine Kennzahlen. Bis November 2026 stand darunter eine
 * Tabelle, die alle Angebote nebeneinanderstellte und das mit der hoechsten
 * Nettorendite als „Bestes“ auszeichnete. Die Loesungen eines Vorschlags
 * ergaenzen einander aber — das Depot fuer die Zulagen, die private Rente
 * fuer das Kapital — und treten nicht gegeneinander an.
 */

const LOESUNG_TEXT: Record<LoesungId, string> = {
  avd: 'Altersvorsorgedepot',
  bav: 'Betriebsrente (Entgeltumwandlung)',
  basis: 'Basisrente (Rürup)',
  privat: 'Private Rente / Depot',
};

const zahl = (n: number, stellen = 2) =>
  n.toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen });

const jahre = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 });

/** Gerechnet ist ein Angebot, sobald es eine Rente oder ein Kapital hat, das ins Ergebnis kann. */
const gerechnet = (p: AngebotPosition) => Boolean(p.rente || p.kapital);

/* ---------------------------------------------------------------------- */

/**
 * Die Angebote zu den Loesungen: je Angebot eine Karte mit dem, was der
 * Anbieter nennt, was es netto kostet und was im Alter ankommt — mit dem
 * Haekchen „Annehmen“ und dem Knopf zum Abschluss. Ein eigenes Stueck der
 * Etappe, nach dem Vorschlag.
 */
export function Angebote({ szenario, nettoHeute = 0, onAnnehmen }: {
  szenario: SzenarioParsed;
  /** Das heutige Haushaltsnetto im Monat — die Bezugsgroesse fuer den Aufwand */
  nettoHeute?: number;
  /** „Lösungen annehmen“ — weiter zur Etappe „Abschluss“ */
  onAnnehmen?: () => void;
}) {
  const angebote = szenario.loesungen.angebote;
  const t = useAnsprache();
  const angebotHinzufuegen = useSzenario((x) => x.angebotHinzufuegen);
  const setzeLoesungen = useSzenario((x) => x.setzeLoesungen);

  const positionen = useMemo(() => angebotPositionen(szenario), [szenario]);
  /*
    ANGENOMMEN werden nur Angebote, die gerechnet sind — nur sie haben eine
    Rente oder ein Kapital, das ins Ergebnis kann. Eine Annahme, deren
    Angebot nicht mehr rechenbar ist, laesst sich weiter zuruecknehmen.
  */
  const angenommen = new Set(szenario.loesungen.angenommen);
  const anzahl = positionen.filter((p) => angenommen.has(p.angebot.id) && gerechnet(p)).length;

  return (
    <section aria-labelledby="angebote-titel">
      <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <Titel als="h2" id="angebote-titel">Angebote prüfen</Titel>
          <p className={`mt-2 ${EINLEITUNG}`}>
            Mit den Beiträgen aus dem Vorschlag Angebote einholen und die Rente eintragen, die der Anbieter
            zum Rentenbeginn nennt — und, wo es sie gibt, die Kapitalabfindung. Jedes Angebot steht für sich,
            gerechnet wie ein Vertrag im Vertrags-TÜV: was es {t.dich} netto kostet, gegen das, was im Alter
            nach Steuer und Krankenversicherung ankommt.
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
          Noch kein Angebot erfasst. Über „Vorschlag übernehmen“ im Schritt davor steht je Baustein
          ein Angebot mit seinem Beitrag bereit — oder oben ein leeres Angebot anlegen.
        </p>
      ) : (
        <>
          <div className="space-y-5 sm:space-y-6">
            {positionen.map((p, i) => (
              <AngebotKarte
                key={p.angebot.id}
                position={p}
                nummer={i + 1}
                szenario={szenario}
                nettoHeute={nettoHeute}
                angenommen={angenommen.has(p.angebot.id)}
              />
            ))}
          </div>

          {/* Bis wohin die Rente in Rendite und Hebel zaehlt — die eine Annahme, die alle Angebote teilen. */}
          <div className="mt-6 max-w-[16rem]">
            <ZahlFeld
              label="Lebenserwartung"
              wert={szenario.loesungen.lebenserwartung}
              onChange={(n) => setzeLoesungen({ lebenserwartung: n })}
              min={60}
              max={120}
              einheit="J."
              stufen
              hilfe="Gilt für alle Angebote: Bis zu diesem Alter zählt die Rente in Nettorendite und Netto-Hebel."
            />
          </div>

          {/*
            LOESUNGEN ANNEHMEN: Aus Angeboten werden Entscheidungen. Die
            Etappe „Abschluss“ rechnet die angenommenen Angebote gemeinsam ins
            Ergebnis und kennzeichnet sie dort als neu.
          */}
          <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
            <p className="text-sm leading-relaxed text-ui-schiefer">
              {anzahl > 0
                ? <>{anzahl === 1 ? 'Ein Angebot ist' : `${anzahl} Angebote sind`} angenommen — im Abschluss steht {t.dein()} Ergebnis mit {anzahl === 1 ? 'dieser Lösung' : 'diesen Lösungen'}.</>
                : `Bei den Angeboten, für die ${t.du} ${t.w('dich entscheidest', 'euch entscheidet')}, das Häkchen „Annehmen“ setzen.`}
            </p>
            <button type="button" onClick={onAnnehmen} disabled={anzahl === 0 || !onAnnehmen} className={`shrink-0 ${KNOPF}`}>
              <ClipboardCheck className="h-4 w-4" aria-hidden /> Lösungen annehmen{anzahl > 0 ? ` (${anzahl})` : ''}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * EIN ANGEBOT ALS KARTE — aufgebaut wie ein Vertrag im Vertrags-TUEV
 * (`VertragsTuev.tsx`), aus denselben Bausteinen (`TuevTeile.tsx`):
 *
 *   1. das Angebot, wie es der Anbieter nennt (zum Eintragen),
 *   2. Einzahlung gegen Auszahlung,
 *   3. seine Kennzahlen und das Fazit.
 *
 * Gerechnet wird in `angebotPositionen` — je Angebot fuer sich. Nennt es
 * Rente UND Kapital, stehen beide Auszahlungen da; die Kennzahlen gelten der
 * Rente, und die Tabelle darunter stellt beide Wege desselben Angebots
 * gegenueber. Verglichen wird nur dort — nie ein Angebot mit einem anderen.
 */
function AngebotKarte({ position: p, nummer, szenario, nettoHeute, angenommen: an }: {
  position: AngebotPosition;
  nummer: number;
  szenario: SzenarioParsed;
  nettoHeute: number;
  angenommen: boolean;
}) {
  const a = p.angebot;
  // `t` fuer den Haushalt (ein Paar: ihr), `e` fuer die Person des Angebots — wie im Vertrags-TUEV
  const t = useAnsprache();
  const e = t.einzeln;
  const angebotAendern = useSzenario((x) => x.angebotAendern);
  const angebotEntfernen = useSzenario((x) => x.angebotEntfernen);
  const angebotAnnehmen = useSzenario((x) => x.angebotAnnehmen);
  const paar = szenario.haushalt.verheiratet && szenario.personen.length > 1;
  const inhaber = a.inhaber === 'B' && szenario.haushalt.verheiratet ? 'B' : 'A';
  const basis = useMemo(() => tuevBasis(szenario), [szenario]);

  const kapitalMoeglich = angebotKenntKapital(a.loesung);
  // Die Einzahlseite ist bei beiden Wegen dieselbe — sie kommt aus dem, der gerechnet ist.
  const r = p.rente ?? p.kapital;
  const rechenbar = r !== null;

  return (
    <article className="ui-karte overflow-hidden druckbereich">
      <header className="flex items-center justify-between gap-3 border-b border-ui-linie px-5 py-4 sm:px-7">
        <h3 className="min-w-0">
          <span className="block text-xs text-ui-schiefer">
            Angebot {nummer}{a.name ? ` · ${LOESUNG_TEXT[a.loesung]}` : ''}{paar ? ` · für ${personNameAus(szenario.personen, inhaber)}` : ''}
          </span>
          <span className="block truncate text-lg font-medium tracking-[-0.01em] text-ui-tinte">{a.name || LOESUNG_TEXT[a.loesung]}</span>
        </h3>
        <button
          type="button"
          onClick={() => angebotEntfernen(a.id)}
          aria-label={`Angebot ${nummer} entfernen`}
          className="shrink-0 rounded-full p-2 text-ui-schiefer hover:bg-rose-50 hover:text-rose-700 print:hidden"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </header>

      <div className="grid gap-5 p-5 sm:p-7 lg:grid-cols-3 lg:gap-6">
        {/* 1) DAS ANGEBOT — in der Innenflaeche: hier wird eingetragen, daneben steht die Auswertung. */}
        <div className="ui-innen space-y-3 p-4">
          <h4 className="text-sm font-medium text-ui-tinte">1. Das Angebot</h4>
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
                optionen={szenario.personen.map((x) => ({ wert: x.id, text: personNameAus(szenario.personen, x.id) }))}
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
          {a.loesung === 'bav' && a.beitragMonat <= 0 && a.agZuschussMonat > 0 && (
            <p className="text-xs leading-relaxed text-ui-schiefer">
              Rein arbeitgeberfinanziert, etwa für den Geschäftsführer: gerechnet ohne eigenen Aufwand.
            </p>
          )}
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

        {r === null ? (
          /* Gestrichelt wie ueberall, wo noch etwas fehlt: unfertig, aber kein Fehler. */
          <div className="flex items-center rounded-[10px] border border-dashed border-ui-feld-rand px-5 py-8 text-center text-sm leading-relaxed text-ui-schiefer lg:col-span-2">
            <p className="mx-auto max-w-md">
              Noch nicht gerechnet. Mit Beitrag und Rente bzw. Kapital laut Angebot steht hier, was es {e.dich} netto
              kostet und was im Alter ankommt. Bei der Betriebsrente genügt der Beitrag des Arbeitgebers.
            </p>
          </div>
        ) : (
          <Auswertung position={p} ergebnis={r} szenario={szenario} basis={basis} inhaber={inhaber} nettoHeute={nettoHeute} />
        )}
      </div>

      {/* Das Haekchen fuer „Lösungen annehmen“ — die Entscheidung des Kunden fuer dieses Angebot. */}
      <label
        className={`flex items-start gap-2.5 border-t px-5 py-4 text-sm sm:px-7 print:hidden ${
          an ? 'border-ui-tinte bg-ui-innen' : 'border-ui-linie'
        } ${rechenbar || an ? 'cursor-pointer' : 'cursor-not-allowed'}`}
      >
        <input
          type="checkbox"
          checked={an}
          disabled={!rechenbar && !an}
          onChange={(ev) => angebotAnnehmen(a.id, ev.target.checked)}
          aria-label={`Angebot ${nummer} annehmen`}
          className="mt-0.5 h-4 w-4 shrink-0"
        />
        <span className="min-w-0">
          <span className={`font-medium ${rechenbar || an ? 'text-ui-tinte' : 'text-ui-schiefer'}`}>Annehmen</span>
          {!rechenbar && (
            <span className="block text-xs leading-relaxed text-ui-schiefer">
              Erst mit Beitrag und Rente bzw. Kapital{an ? ' — so zählt es im Abschluss nicht' : ''}.
            </span>
          )}
        </span>
      </label>
    </article>
  );
}

/** Die Spalten 2 und 3 der Karte: Einzahlung gegen Auszahlung, dann Kennzahlen und Fazit. */
function Auswertung({ position: p, ergebnis: r, szenario, basis, inhaber, nettoHeute }: {
  position: AngebotPosition;
  /** Der gerechnete Weg — die Rente, und nur ohne sie das Kapital */
  ergebnis: NonNullable<AngebotPosition['rente']>;
  szenario: SzenarioParsed;
  basis: ReturnType<typeof tuevBasis>;
  inhaber: 'A' | 'B';
  nettoHeute: number;
}) {
  const t = useAnsprache();
  const e = t.einzeln;
  const { rente, kapital } = p;
  const beide = rente !== null && kapital !== null;
  const istKapital = rente === null;
  const gut = r.nettoHebel >= 1;
  // Rein arbeitgeberfinanziert: Hebel, Rendite und Amortisation messen am eigenen Aufwand.
  const ohne = ohneEigenaufwand(r);
  /*
    Die Erklaerungen der Treppe brauchen das zvE und die Erwerbsart DIESES
    Inhabers — das zvE ist eine Haushaltsgroesse, die Erwerbsart nicht.
  */
  const erwerb = basis.jePerson.find((x) => x.id === inhaber) ?? basis.jePerson[0];
  const treppe = belastungsTreppe(r, {
    zve: basis.zve,
    p: basis.p,
    beamter: erwerb?.beamter ?? false,
    selbststaendig: erwerb?.selbststaendig ?? false,
    privatVersichert: szenario.haushalt.kvErwerb === 'pkv' || szenario.haushalt.kvStatus === 'pkv',
  }, e);
  const anteilNetto = anteilAmNetto(r.echterAufwandMonat, nettoHeute);

  return (
    <>
      {/* 2) EINZAHLUNG GEGEN AUSZAHLUNG */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-ui-tinte">2. Einzahlung gegen Auszahlung</h4>

        <div className={BLOCK}>
          <div className={BLOCK_TITEL}>{e.Dein('e')} Belastung (Ansparphase)</div>
          {/* Oben, was der Vertrag monatlich BEKOMMT — unten, was es aus der eigenen Tasche kostet. */}
          <div className="space-y-1.5">
            <GegenueberZeile text="Gesamtbeitrag" wert={euro(treppe.zufluss)} />
            {treppe.zeilen.map((z) => (
              z.art === 'summe' ? (
                <div key={z.text} className="!mt-2 border-t border-ui-linie pt-2">
                  <GegenueberZeile text={z.text} wert={euro(z.betrag)} />
                </div>
              ) : (
                <GegenueberZeile key={z.text} text={z.text} wert={euro(z.betrag)} info={z.erklaerung} />
              )
            ))}
            <div className={SUMME}>
              <span className="text-xs font-medium text-ui-tinte">Kostet {e.dich} wirklich</span>
              <span className="text-base font-medium tabular-nums text-ui-tinte">{euro(treppe.aufwand)}</span>
            </div>
            {anteilNetto && (
              <p className="text-xs leading-relaxed text-ui-schiefer">
                Das sind <span className="font-medium tabular-nums text-ui-tinte">{anteilNetto}</span> {t.dein('es')} heutigen
                Nettos von {euro(nettoHeute)} im Monat.
              </p>
            )}
          </div>
        </div>

        <ZulagenBlock r={r} e={e} />

        {rente && (
          <div className={BLOCK}>
            <div className={BLOCK_TITEL}>
              {beide ? `${e.Dein()} Ertrag als Rente` : `${e.Dein()} Ertrag (Auszahlungsphase)`}
            </div>
            <div className="space-y-1.5">
              <GegenueberZeile text="Brutto-Rente" wert={euro(rente.bruttoRenteMonat)} />
              {rente.kvPvMonat > 0 && <GegenueberZeile text="− KV/PV-Abzug" wert={euro(rente.kvPvMonat)} />}
              {rente.steuerMonat > 0 && <GegenueberZeile text="− Steuer-Abzug" wert={euro(rente.steuerMonat)} />}
              <div className={SUMME}>
                <span className="text-xs font-medium text-ui-tinte">
                  Echte Netto-Rente
                  <InfoPunkt titel="Echte Netto-Rente">
                    Nach Steuer und Kranken-/Pflegeversicherung im ersten Rentenjahr — anteilig an der Steuer des
                    Haushalts, wie im Kassenbon.
                  </InfoPunkt>
                </span>
                <span className="text-base font-medium tabular-nums text-ui-tinte">
                  {euro(rente.nettoRenteMonat)}
                  <span className="text-xs font-normal text-ui-schiefer"> / Monat</span>
                </span>
              </div>
            </div>
          </div>
        )}

        {kapital && (
          <div className={BLOCK}>
            <div className={BLOCK_TITEL}>
              {beide ? `${e.Dein()} Ertrag als Kapital` : `${e.Dein()} Ertrag (Auszahlungsphase)`}
            </div>
            <div className="space-y-1.5">
              <GegenueberZeile text="Brutto-Kapital" wert={euro(kapital.bruttoKapital)} />
              <GegenueberZeile
                text="− Steuer im Zuflussjahr"
                wert={euro(kapital.steuerKapital)}
                info="bAV: voll steuerpflichtig. Private Rentenversicherung: nur der Ertrag, nach 12 Jahren und ab 62 zur Hälfte."
              />
              <GegenueberZeile
                text="− Kranken- und Pflegeversicherung"
                wert={euro(kapital.kvPvKapital)}
                info="Bei der bAV verteilt auf zehn Jahre (§ 229 SGB V), hier in einer Summe. Private Rentenversicherung in der KVdR beitragsfrei."
              />
              <div className={SUMME}>
                <span className="text-xs font-medium text-ui-tinte">Echtes Netto-Kapital</span>
                <span className="text-base font-medium tabular-nums text-ui-tinte">{euro(kapital.nettoKapital)}</span>
              </div>
            </div>
          </div>
        )}

        <div className={BLOCK}>
          <div className={BLOCK_TITEL}>Über die gesamte Laufzeit</div>
          <div className="space-y-1.5">
            <GegenueberZeile text={`Eingezahlt (${laufzeitText(r.monateEinzahlung)})`} wert={euro(r.summeEinzahlung)} />
            {rente && (
              <GegenueberZeile
                text={`Ausgezahlt ${beide ? 'als Rente ' : ''}(${rente.jahreAuszahlung} Jahre)`}
                wert={euro(rente.summeAuszahlung)}
              />
            )}
            {kapital && (
              <GegenueberZeile
                text={`Ausgezahlt ${beide ? 'als Kapital ' : ''}(einmalig)`}
                wert={euro(kapital.summeAuszahlung)}
              />
            )}
          </div>
        </div>
      </div>

      {/* 3) KENNZAHLEN UND FAZIT */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-ui-tinte">3. Kennzahlen und Fazit</h4>

        {/* Das Fazit als Satz, wie im Vertrags-TUEV: was netto von jedem eingezahlten Euro zurueckkommt. */}
        <Kernsatz>
          {ohne ? (
            <>
              Rein arbeitgeberfinanziert: {e.Du} {e.w('zahlst', undefined, 'zahlen')} nichts selbst, netto kommen{' '}
              <Hervor>{istKapital ? euro(r.nettoKapital) : `${euro(r.nettoRenteMonat)} im Monat`}</Hervor> dazu.
            </>
          ) : (
            <>
              Je eingezahltem Euro kommen netto{gut ? '' : ' nur'}{' '}
              <Hervor>{euroGenau(Math.round(r.nettoHebel * 100) / 100)}</Hervor> zurück.
            </>
          )}
        </Kernsatz>

        <div className={BLOCK}>
          {beide && <div className={BLOCK_TITEL}>Als Rente gerechnet</div>}
          <div className="grid grid-cols-2 gap-3">
            <Kennzahl
              titel="Netto-Hebel"
              wert={ohne ? '—' : `${zahl(r.nettoHebel)} ×`}
              fussnote={ohne ? 'ohne eigenen Aufwand' : 'Auszahlung je Euro Einzahlung'}
              info={ohne ? undefined : (
                <>
                  {euro(r.summeAuszahlung)} Auszahlung geteilt durch {euro(r.summeEinzahlung)} eigenen Aufwand
                  über {laufzeitText(r.monateEinzahlung)}. <strong>Beide Seiten netto</strong>: oben nach Steuer und
                  KV/PV im Alter, unten nach Förderung. Ohne Verzinsung gerechnet — ein Euro von heute zählt hier
                  so viel wie einer in {r.jahreEinzahlung} Jahren. Was das Geld dann wert ist, sagt erst die
                  Rendite daneben.
                </>
              )}
            />
            <Kennzahl
              titel="Nettorendite"
              wert={ohne ? '—' : prozent(r.rendite, 2)}
              fussnote={ohne ? 'ohne eigenen Aufwand' : 'p. a. nach allen Abzügen'}
              info={ohne ? undefined : (
                <>
                  Der interne Zinsfuß aller Netto-Zahlungen: der Zinssatz, bei dem{' '}
                  {laufzeitText(r.monateEinzahlung)} Einzahlung und{' '}
                  {istKapital ? 'die Kapitalauszahlung' : `${r.jahreAuszahlung} Jahre Rente`} genau aufgehen.
                  Anders als der Hebel <strong>berücksichtigt er, wann</strong> jeder Euro fließt. Gerechnet nach
                  Steuer, KV/PV und Förderung, bis zur Lebenserwartung.
                </>
              )}
            />
            <Kennzahl titel="Netto-Gewinn" wert={euro(r.echterGewinn)} />
            {!istKapital && (
              <Kennzahl
                titel="Amortisation"
                wert={ohne ? '—' : `${jahre(r.amortisationsJahre)} J.`}
                fussnote={ohne ? 'ohne eigenen Aufwand' : 'ab Rentenbeginn'}
              />
            )}
            {p.lueckeAnteil && (
              <Kennzahl
                titel="Lücke gedeckt"
                wert={anteilAnLuecke(p.lueckeAnteil.anteil)}
                fussnote={`im Jahr ${p.lueckeAnteil.jahr}`}
                info="So viel steigt das Netto des Haushalts im ersten Rentenjahr mit diesem Angebot — geteilt durch die Lücke im selben Jahr. Nach Steuer und Krankenversicherung."
              />
            )}
            {rente && rente.echterAufwandMonat > 0 && (
              <Kennzahl
                titel="Je 100 € Aufwand"
                wert={euroGenau(Math.round(rente.nettoRenteMonat / rente.echterAufwandMonat * 10_000) / 100)}
                fussnote="Netto-Rente im Monat"
              />
            )}
          </div>
        </div>

        {/*
          BEIDE WEGE DESSELBEN ANGEBOTS NEBENEINANDER, sobald es Rente und
          Kapital nennt — jeder mit seiner eigenen vollen Rechnung.
        */}
        {rente && kapital && (
          <div className="overflow-hidden rounded-[8px] border border-ui-linie">
            <div className="border-b border-ui-linie bg-ui-innen px-3 py-2 text-xs font-medium text-ui-schiefer">
              Rente gegen Kapital — beide Wege gerechnet
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-ui-linie text-ui-schiefer">
                  <td className="px-3 py-1.5" />
                  <th className="px-2 py-1.5 text-right font-medium">Rente</th>
                  <th className="px-3 py-1.5 text-right font-medium">Kapital</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                <WegZeile text="Netto" rente={`${euro(rente.nettoRenteMonat)} / Mon.`} kapital={euro(kapital.nettoKapital)} />
                <WegZeile text="Über die Laufzeit" rente={euro(rente.summeAuszahlung)} kapital={euro(kapital.summeAuszahlung)} />
                <WegZeile
                  text="Netto-Gewinn"
                  rente={euro(rente.echterGewinn)}
                  kapital={euro(kapital.echterGewinn)}
                  hervor={rente.echterGewinn >= kapital.echterGewinn ? 'rente' : 'kapital'}
                />
                <WegZeile
                  text="Netto-Hebel"
                  rente={ohne ? '—' : `${zahl(rente.nettoHebel)} ×`}
                  kapital={ohne ? '—' : `${zahl(kapital.nettoHebel)} ×`}
                />
                <WegZeile
                  text="Nettorendite"
                  rente={ohne ? '—' : prozent(rente.rendite, 2)}
                  kapital={ohne ? '—' : prozent(kapital.rendite, 2)}
                />
              </tbody>
            </table>
            <p className="border-t border-ui-linie bg-ui-innen px-3 py-2 text-xs leading-relaxed text-ui-schiefer [&_strong]:font-medium [&_strong]:text-ui-tinte">
              {/* Der Wert ist ein ALTER, nicht eine Dauer: `renteOderKapital` rechnet ab dem Alter bei Rentenbeginn. */}
              {p.breakEven && (
                <>
                  <strong>Break-even:</strong> Die Rente holt das Kapital ein, wenn {e.du}{' '}
                  <strong>{jahre(p.breakEven.breakEvenOhneZins)} Jahre</strong> alt {e.w('wirst', undefined, 'werden')} —
                  ohne Verzinsung.
                  {p.breakEven.kapitalTraegtSichSelbst
                    ? ' Mit 2 % Verzinsung nie: der Kapitalertrag allein trägt die Rente.'
                    : ` Mit 2 % Verzinsung erst mit ${jahre(p.breakEven.breakEvenMitZins)} Jahren.`}{' '}
                </>
              )}
              Das Kapital fließt in einer Summe, die Laufzeit ist kürzer — seine Rendite pro Jahr fällt deshalb fast
              immer höher aus. Angenommen zählt im Abschluss <strong>die Rente</strong>.
            </p>
          </div>
        )}

        {ohne && (
          <p className="ui-innen px-3 py-2 text-xs leading-relaxed text-ui-tinte/80">{ohneEigenaufwandText(e)}</p>
        )}

        {r.hinweise.map((h) => (
          <p key={h} className="ui-innen px-3 py-2 text-xs leading-relaxed text-ui-tinte/80">{h}</p>
        ))}
      </div>
    </>
  );
}
