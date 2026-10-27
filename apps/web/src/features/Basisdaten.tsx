import {
  BUNDESLAENDER, BESOLDUNGSGRUPPEN, parameterFuer, durchschnittlicherZusatzbeitrag,
  type ProjektionsErgebnis,
} from '@renten/engine';
import { ArrowRight, RotateCcw, Target } from 'lucide-react';
import { Posten } from '../components/stil';
import { useSzenario, regelaltersgrenzeText } from '../store/szenario';
import { Rentenschaetzer } from './Rentenschaetzer';
import { PkvFelder } from './PkvFelder';
import { KvdrHinweis } from './KvdrHinweis';
import { EinkommenFelder } from './EinkommenFelder';
import {
  ZahlFeld, ProzentFeld, NamenFelder, DatumFeld, AuswahlFeld, Schalter, Abschnitt, euro, prozent,
} from '../components/Feld';
import { KinderZeilen, KinderHinweis } from '../components/KinderFelder';
import { personName, personNameAus } from './personen';
import { mitName, namensTeile } from '../lib/namen';
import { KRANKENKASSEN, KASSEN_STAND, kasseNach } from './krankenkassen';
import { useVorbelegt } from './useVorbelegt';
import { nettoHeuteMonat as nettoHeute } from './bezug';

/**
 * Faustregel fuer das Ziel: 80 % des heutigen Nettos, auf 50 EUR gerundet.
 * Nur ein VORSCHLAG mit einem Klick — das Ziel bleibt die Entscheidung des
 * Mandanten.
 */
const FAUSTREGEL_ZIEL = 0.8;

const laenderOptionen = BUNDESLAENDER.map((l) => ({ wert: l as string, text: l }));

/** Dieselben Bezeichnungen wie im Ausdruck — zwei Woerter fuer dieselbe Sache
    verwirren mehr, als sie erklaeren. */
const KV_TEXT = {
  kvdr: 'gesetzlich pflichtversichert (KVdR)',
  freiwillig: 'gesetzlich freiwillig versichert',
  pkv: 'privat versichert',
} as const;

/**
 * Teile der Basisdaten. Das Formular zeigt alle untereinander, der
 * Assistent je Schritt einen — es sind dieselben Felder auf denselben
 * Speicher, keine zweite Fassung.
 */
export type BasisTeil = 'ziel' | 'haushalt' | 'einkommen' | 'personen';

export function Basisdaten({ ergebnis, onEhepartnerDialog, teil, onAssistent }: {
  ergebnis?: ProjektionsErgebnis | null;
  onEhepartnerDialog?: () => void;
  /** Nur diesen Teil zeigen, ohne Einklappen — fuer den Assistenten */
  teil?: BasisTeil;
  /** Wechsel in den Assistenten; ohne Angabe fuehrt der Hinweis zum Vorsorge-Check */
  onAssistent?: () => void;
} = {}) {
  const zeige = (t: BasisTeil) => teil === undefined || teil === t;
  const einklappbar = teil === undefined;
  const s = useSzenario((x) => x.szenario);
  const { setzeHaushalt, setzeEinkommen, setzePerson, partnerHinzufuegen } = useSzenario();
  const setzeEinkommenPartner = useSzenario((x) => x.setzeEinkommenPartner);
  const setzeEinkommenGetrennt = useSzenario((x) => x.setzeEinkommenGetrennt);
  const rentenbeginnZuruecksetzen = useSzenario((x) => x.rentenbeginnZuruecksetzen);
  const setzeKinderAnzahl = useSzenario((x) => x.setzeKinderAnzahl);
  const setzeKind = useSzenario((x) => x.setzeKind);
  const setzeZielAnteil = useSzenario((x) => x.setzeZielAnteil);
  const marke = useVorbelegt();

  // Die Altersgrenzen 18 und 25 stehen im Rechtsstand, nicht im Markup.
  const jetzt = new Date().getFullYear();
  const avdParam = parameterFuer(Math.max(jetzt, 2027), { indexRate: s.annahmen.tarifIndex }).avd;

  const nameVon = (id: string) => personNameAus(s.personen, id);
  // Dieselbe Auswahl, die auch der Rechenkern trifft: Person B bleibt beim
  // Umschalten auf "Single" erhalten, wird aber nicht mitgerechnet.
  const gerechnetePersonen = s.personen.filter((p) => p.id === 'A' || s.haushalt.verheiratet);
  const paar = s.haushalt.verheiratet && gerechnetePersonen.length > 1;
  const selbststaendig = s.einkommenHeute.modus === 'selbststaendig';

  /*
    Das heutige Haushaltsnetto als Bezugsgroesse fuer das Zielnetto.

    `zeilen[0]` ist immer das laufende Kalenderjahr (die Zeitachse beginnt
    in timeline.ts bei `jetzt.jahr`), also steht dort das Netto von heute —
    und `zielNettoHeute` ist ausdruecklich in heutiger Kaufkraft angegeben.
    Der Vergleich ist damit sauber, ohne Abzinsung.

    Er unterbleibt, sobald er etwas anderes behaupten wuerde, als er sagt:
    ohne Ergebnis, ohne Einkommen, und wenn der Ruhestand bereits begonnen
    hat — dann ist `zeilen[0]` kein Erwerbsjahr mehr.
  */
  const nettoHeuteMonat = nettoHeute(ergebnis);
  const zielAnteil =
    nettoHeuteMonat > 0 ? s.haushalt.zielNettoHeute / nettoHeuteMonat : null;
  const zielVorschlag = nettoHeuteMonat > 0
    ? Math.round((nettoHeuteMonat * FAUSTREGEL_ZIEL) / 50) * 50
    : null;

  return (
    <div className="space-y-4">
      {/* Wer lieber gefuehrt wird: derselbe Datensatz, Schritt fuer Schritt
          und mit Hinweis auf die jeweilige Unterlage. */}
      {/* In der neutralen Innenflaeche wie ein Hinweis — ein Angebot, kein Alarm. */}
      {teil === undefined && (onAssistent ? (
        <button
          type="button"
          onClick={onAssistent}
          className="ui-innen flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3 text-left text-sm text-ui-tinte transition-colors hover:bg-ui-linie/40 print:hidden"
        >
          <span>
            <strong className="font-medium">Lieber Schritt für Schritt?</strong> Der Assistent fragt alle Angaben
            einzeln ab und sagt, welche Unterlage Sie dafür brauchen.
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 font-medium">Zum Assistenten <ArrowRight className="h-3.5 w-3.5" aria-hidden /></span>
        </button>
      ) : (
        <a
          href="/vorsorge-check"
          className="ui-innen flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3 text-sm text-ui-tinte transition-colors hover:bg-ui-linie/40 print:hidden"
        >
          <span>
            <strong className="font-medium">Lieber Schritt für Schritt?</strong> Der Vorsorge-Check fragt alle Angaben
            einzeln ab und sagt, welche Unterlage Sie dafür brauchen.
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 font-medium">Zum Check <ArrowRight className="h-3.5 w-3.5" aria-hidden /></span>
        </a>
      ))}

      {/*
        Das Zielnetto steht VOR dem Haushaltsraster und in einem eigenen
        Kasten. Es war bisher eines von fuenf gleichrangigen Feldern —
        dabei misst sich alles Weitere an dieser Zahl: der Bedarf, die
        Versorgungsluecke, die noetige Sparrate, das ganze Gutachten.
      */}
      {/*
        Im Formular in der Innenflaeche, damit es aus dem Raster faellt; im
        Assistenten ist der Schritt selbst das Ziel — dort ohne Kasten und
        ohne zweiten Titel.
      */}
      {zeige('ziel') && <section className={einklappbar ? 'ui-innen p-4 sm:p-5' : ''}>
        {einklappbar && (
          <h3 className="mb-3 flex items-center gap-2 text-base font-medium text-ui-tinte">
            <Target className="h-4 w-4 text-ui-schiefer" aria-hidden /> Ihr Ziel
          </h3>
        )}
        {/*
          BEI PAAREN ZWEI FELDER, darunter die Summe.

          Erfasst wird, welchen Anteil am gemeinsamen Ziel jeder beansprucht;
          das Haushaltsziel ist ihr Ergebnis und kein Eingabefeld mehr. Eine
          Zahl, die man nicht aendern kann, soll auch nicht wie ein Feld
          aussehen — deshalb steht sie darunter als Zeile und nicht als
          gesperrtes Eingabefeld.

          Alleinstehende sehen unveraendert das eine Feld: Ein Anteil an
          nichts waere dort nur eine Rechenstufe ohne Aussage.
        */}
        {paar ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {gerechnetePersonen.map((p) => (
                <ZahlFeld
                  key={p.id}
                  label={`Zielnetto ${personName(p)}`}
                  wert={Math.round(p.zielAnteilHeute ?? s.haushalt.zielNettoHeute / 2)}
                  onChange={(n) => setzeZielAnteil(p.id, n)}
                  einheit="€"
                  vorbelegt={marke('haushalt.zielNettoHeute')}
                />
              ))}
            </div>
            {/* Die Summe unter einer Linie in Tinte, wie in den Aufstellungen der Beratung. */}
            <dl className="mt-3 text-sm">
              <Posten summe text="Haushaltsziel gesamt" wert={euro(s.haushalt.zielNettoHeute)} />
            </dl>
          </>
        ) : (
          <ZahlFeld
            label="Zielnetto im Alter (Kaufkraft heute)"
            wert={s.haushalt.zielNettoHeute}
            onChange={(n) => setzeHaushalt({ zielNettoHeute: n })}
            einheit="€"
            gross
            vorbelegt={marke('haushalt.zielNettoHeute')}
          />
        )}
        {zielAnteil !== null && (
          <p className="mt-2 text-xs leading-relaxed text-ui-schiefer">
            Das sind <strong className="font-medium text-ui-tinte">{prozent(zielAnteil, 0)}</strong> Ihres
            heutigen Haushaltsnettos von {euro(nettoHeuteMonat)}.
          </p>
        )}
        {/*
          Ein Vorschlag, kein Automatismus: Wer ihn uebernimmt, hat das Ziel
          bewusst gesetzt. Bei Paaren entfaellt er — dort ist das Ziel die
          Summe zweier Anteile, und welcher Anteil wie gross sein soll, sagt
          keine Faustregel.
        */}
        {!paar && zielVorschlag !== null && zielVorschlag > 0 && zielVorschlag !== s.haushalt.zielNettoHeute && (
          <button
            type="button"
            onClick={() => setzeHaushalt({ zielNettoHeute: zielVorschlag })}
            className="mt-3 inline-flex items-center rounded-full border border-ui-zweit-rand bg-ui-karte px-3 py-1.5 text-left text-xs font-medium text-ui-tinte transition-colors hover:bg-ui-hover print:hidden"
          >
            Faustregel {prozent(FAUSTREGEL_ZIEL, 0)} des heutigen Nettos: {euro(zielVorschlag)} übernehmen
          </button>
        )}
        <p className="mt-2 text-xs leading-relaxed text-ui-schiefer [&_strong]:font-medium [&_strong]:text-ui-tinte">
          An dieser Zahl misst sich alles Weitere: Bedarf, Versorgungslücke und die Sparrate,
          die nötig wäre, um sie zu schließen.
          {paar && (
            <> Die beiden Beträge oben sind <strong>Anteile am gemeinsamen Budget</strong>; in
              der Einzelbetrachtung gilt jeder <strong>unverändert</strong> als Ziel der
              jeweiligen Person.</>
          )}
        </p>
      </section>}

      {/* Einklappbar: Der Block wird einmal ausgefuellt und danach selten
          wieder angefasst — offen kostet er jedes Mal eine halbe
          Bildschirmlaenge auf dem Weg zu den Personen darunter. */}
      {zeige('haushalt') && <Abschnitt titel="Haushalt" einklappbar={einklappbar}>
        <div className="grid gap-3 sm:grid-cols-2">
          {/* Kurze Beschriftung: Die lange brach um, und das Feld stand tiefer als sein Nachbar. */}
          <AuswahlFeld
            label="Bundesland"
            wert={s.haushalt.bundesland}
            onChange={(v) => setzeHaushalt({ bundesland: v })}
            optionen={laenderOptionen}
            hilfe="Bestimmt Kirchensteuersatz und Besoldungstabelle."
            vorbelegt={marke('haushalt.bundesland')}
          />
          {/*
            ZWEI FRAGEN, nicht eine. Bis hierher galt die Angabe fuer beide
            Phasen — das ist bei Selbststaendigen regelmaessig falsch: wer
            heute freiwillig gesetzlich versichert ist, kommt im Ruhestand in
            die KVdR, und dort gilt eine ganz andere Rechnung.
          */}
          <AuswahlFeld
            label="Krankenversicherung im Ruhestand"
            wert={s.haushalt.kvStatus}
            onChange={(v) => setzeHaushalt({ kvStatus: v })}
            hilfe={selbststaendig
              ? undefined
              : 'Aus der PKV führt praktisch kein Weg zurück — die Erwerbsphase folgt dieser Angabe.'}
            optionen={[
              { wert: 'kvdr', text: 'Gesetzlich pflichtversichert (KVdR)' },
              { wert: 'freiwillig', text: 'Gesetzlich freiwillig versichert' },
              { wert: 'pkv', text: 'Privat versichert' },
            ]}
            vorbelegt={marke('haushalt.kvStatus')}
          />

          {/*
            Nur bei Selbststaendigen. Bei Angestellten und Beamten ist die
            Erwerbsphase aus dem Ruhestandsstatus eindeutig — ein zweites Feld
            braechte dort keine Information, nur eine weitere Gelegenheit,
            sich zu widersprechen. Die Ableitung steht im Rechenkern.
          */}
          {selbststaendig && (
            <AuswahlFeld
              label="Krankenversicherung in der Erwerbsphase"
              wert={s.haushalt.kvErwerb}
              onChange={(v) => setzeHaushalt({ kvErwerb: v })}
              hilfe="Als Selbstständiger tragen Sie den gesetzlichen Beitrag allein — einen Arbeitgeberanteil gibt es nicht."
              optionen={[
                { wert: 'gesetzlich', text: 'Gesetzlich freiwillig versichert' },
                { wert: 'pkv', text: 'Privat versichert' },
              ]}
            />
          )}
          {/*
            Die Kasse waehlen, statt ihren Satz zu suchen: Die wenigsten
            kennen ihn auswendig, und die Spanne ist gross — 2,18 % bis
            4,39 %. Die Auswahl SCHREIBT den Satz ins Feld darunter; gerechnet
            wird danach mit der Zahl, nicht mit der Kasse. Sonst aenderte sich
            ein ausgedrucktes Gutachten rueckwirkend, sobald die Kasse erhoeht.
          */}
          {KRANKENKASSEN.length > 0 && (
            <AuswahlFeld
              label="Krankenkasse"
              wert={s.haushalt.krankenkasse ?? ''}
              onChange={(name) => {
                const k = kasseNach(name);
                setzeHaushalt(k
                  ? { krankenkasse: k.name, zusatzbeitrag: k.zusatzbeitrag }
                  : { krankenkasse: undefined });
              }}
              hilfe={`${KASSEN_STAND}. Findet sich Ihre Kasse nicht, tragen Sie den Satz unten von Hand ein.`}
              optionen={[
                { wert: '', text: 'Keine Angabe — Satz selbst eintragen' },
                ...KRANKENKASSEN.map((k) => ({
                  wert: k.name,
                  text: `${k.name} — ${prozent(k.zusatzbeitrag, 2)}`,
                })),
              ]}
            />
          )}
          {/*
            Der individuelle Zusatzbeitrag. Vorbelegt mit dem gesetzlichen
            Durchschnitt des Rechtsstands — wer seine Kasse kennt, traegt
            ihren Satz ein; ein Punkt Unterschied sind auf 60.000 EUR Brutto
            rund 300 EUR im Jahr.

            ZWEI Nachkommastellen: Die Kassen weisen den Satz so aus (2,29 %),
            und auf eine Stelle gerundet stuende hier ein Satz, den es nicht
            gibt.
          */}
          <ProzentFeld
            label="Zusatzbeitrag Ihrer Krankenkasse"
            wert={s.haushalt.zusatzbeitrag ?? durchschnittlicherZusatzbeitrag(jetzt)}
            /*
              Von Hand geaendert heisst: Es ist nicht mehr der Satz der
              gewaehlten Kasse. Der Name muss weg, sonst behauptet der
              Ausdruck eine Kasse, deren Satz gar nicht mehr dasteht.
            */
            onChange={(n) => setzeHaushalt({
              zusatzbeitrag: n,
              krankenkasse: kasseNach(s.haushalt.krankenkasse ?? '')?.zusatzbeitrag === n
                ? s.haushalt.krankenkasse
                : undefined,
            })}
            max={10}
            stellen={2}
            hilfe={s.haushalt.zusatzbeitrag === undefined
              ? `Gesetzlicher Durchschnitt ${prozent(durchschnittlicherZusatzbeitrag(jetzt), 2)}. Ihre Kasse weicht davon ab.`
              : `Zum Vergleich: Der Durchschnitt liegt bei ${prozent(durchschnittlicherZusatzbeitrag(jetzt), 2)}.`}
            vorbelegt={marke('haushalt.zusatzbeitrag')}
          />
          {/*
            „Heute" ist hier woertlich zu nehmen: Die Abschlaege enden mit dem
            25. Geburtstag, und die Rechnung laesst sie mit den Geburtsjahren
            darunter auslaufen. Ohne diesen Zusatz sah es aus, als senke ein
            heute kleines Kind den Beitrag bis ans Lebensende.
          */}
          <ZahlFeld
            label="Kinder unter 25 (heute)"
            wert={s.haushalt.kinderUnter25}
            onChange={setzeKinderAnzahl}
            max={15}
            hilfe="Ab dem 2. Kind sinkt der Pflegeversicherungsbeitrag — bis zum 25. Geburtstag des Kindes. Danach steigt er wieder; die Rechnung berücksichtigt das über die Geburtsjahre."
            vorbelegt={marke('haushalt.kinderUnter25')}
          />
        </div>

        {selbststaendig
          && s.haushalt.kvErwerb === 'gesetzlich'
          && s.haushalt.kvStatus === 'kvdr'
          && <KvdrHinweis szenario={s} />}

        {/* Die Praemie wird gebraucht, sobald EINE der beiden Phasen privat
            ist — sonst koennte man sie bei getrennten Angaben nicht eintragen. */}
        {(s.haushalt.kvStatus === 'pkv' || s.haushalt.kvErwerb === 'pkv') && (
          <PkvFelder vorbelegt={marke('haushalt.pkv')} />
        )}

        {s.haushalt.kinder.length > 0 && (
          <div className="ui-innen mt-4 p-3 sm:p-4">
            <p className="text-xs font-medium text-ui-tinte">
              Für die Kinderzulage des Altersvorsorgedepots
            </p>
            <KinderZeilen
              kinder={s.haushalt.kinder}
              onKind={setzeKind}
              a={avdParam}
              jetzt={jetzt}
            />
            <KinderHinweis a={avdParam} />
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-4">
          <Schalter label="Verheiratet (Splittingtarif)" wert={s.haushalt.verheiratet}
            onChange={(b) => {
              setzeHaushalt({ verheiratet: b });
              if (b) { partnerHinzufuegen(); onEhepartnerDialog?.(); }
            }}
            vorbelegt={marke('haushalt.verheiratet')} />
          <Schalter label="Kirchensteuerpflichtig" wert={s.haushalt.kirchensteuer}
            onChange={(b) => setzeHaushalt({ kirchensteuer: b })}
            vorbelegt={marke('haushalt.kirchensteuer')} />
        </div>
        {/*
          DIE STEUERKLASSE fragt der Rechner bewusst nicht ab: Er rechnet die
          Jahressteuer, und an der aendert die Steuerklasse nichts — sie
          verteilt nur den Lohnsteuerabzug uebers Jahr. Weil Berater sie aus
          jedem anderen Rechner kennen, steht hier, warum sie fehlt.
        */}
        <p className="mt-2 text-xs leading-relaxed text-ui-schiefer">
          Eine Steuerklasse brauchen Sie nicht: Gerechnet wird die Jahressteuer, bei Verheirateten
          mit Splitting. Die Steuerklasse regelt nur, wie viel Lohnsteuer monatlich einbehalten wird.
        </p>
      </Abschnitt>}

      {/*
        Einklappbar wie der Haushalt darueber, und aus demselben Grund: Die
        Bloecke werden einmal ausgefuellt und danach selten wieder angefasst,
        stehen aber jedes Mal zwischen dem Ziel oben und den Vertraegen unten.
        Offen als Vorgabe — wer Platz will, klappt zu.

        ACHTUNG beim Aendern: Der Schalter „Einkommen je Partner getrennt
        erfassen" steht IN diesem Block und entscheidet, ob es einen Block fuer
        Person B ueberhaupt gibt. Zugeklappt ist er mit weg. Das ist
        hinnehmbar, solange der Block offen startet.
      */}
      {zeige('einkommen') && <Abschnitt
        titel={s.einkommenGetrennt ? `Einkommen — ${nameVon('A')}` : 'Heutiges Einkommen'}
        einklappbar={einklappbar}
      >
        <EinkommenFelder wert={s.einkommenHeute} onChange={setzeEinkommen}
          marke={(f) => marke(`einkommenHeute.${f}`)} />

        {s.haushalt.verheiratet && (
          <div className="mt-4 border-t border-ui-linie pt-3">
            <Schalter
              label="Einkommen je Partner getrennt erfassen"
              wert={s.einkommenGetrennt}
              onChange={setzeEinkommenGetrennt}
            />
            <p className="mt-1 text-xs text-ui-schiefer">
              {s.einkommenGetrennt
                ? 'Die Sozialabgaben werden je Person mit eigener Beitragsbemessungsgrenze gerechnet.'
                : 'Der Haushaltsbetrag wird für die Sozialabgaben hälftig auf beide verteilt.'}
            </p>
          </div>
        )}
      </Abschnitt>}

      {zeige('einkommen') && s.haushalt.verheiratet && s.einkommenGetrennt && (
        <Abschnitt titel={`Einkommen — ${nameVon('B')}`} einklappbar={einklappbar}>
          <EinkommenFelder wert={s.einkommenPartner} onChange={setzeEinkommenPartner}
            marke={(f) => marke(`einkommenPartner.${f}`)} />
        </Abschnitt>
      )}

      {/*
        Person B nur zeigen, solange sie auch gerechnet wird. Der Rechenkern
        filtert seit jeher genauso (timeline.ts, projiziere); die Karte blieb
        aber stehen, wenn man auf "Single" zurueckschaltete — mit Feldern, die
        nichts mehr bewirkten. Geloescht wird nichts: schaltet man wieder auf
        "Verheiratet", sind alle Eingaben von Person B noch da.
      */}
      {zeige('personen') && s.personen.filter((p) => p.id === 'A' || s.haushalt.verheiratet).map((p) => (
        <Abschnitt key={p.id} titel={personName(p)} einklappbar={einklappbar}>
          <div className="grid gap-3 sm:grid-cols-2">
            <NamenFelder {...namensTeile(p.name, p.vorname, p.nachname)}
              onChange={(teile) => setzePerson(p.id, mitName(teile))} />
            <AuswahlFeld label="Versorgungsart" wert={p.art}
              onChange={(v) => setzePerson(p.id, { art: v })}
              optionen={[{ wert: 'grv', text: 'Gesetzliche Rente' }, { wert: 'pension', text: 'Beamtenpension' }]} />
            <DatumFeld label="Geburtsdatum" wert={p.geburtsdatum}
              onChange={(v) => setzePerson(p.id, { geburtsdatum: v })}
              hilfe="Acht Ziffern genügen — die Punkte setzt das Feld."
              vorbelegt={marke(`personen.${p.id}.geburtsdatum`)} />
            <DatumFeld
              label="Rentenbeginn"
              wert={p.rentenbeginn}
              onChange={(v) => setzePerson(p.id, { rentenbeginn: v })}
              vorbelegt={marke(`personen.${p.id}.rentenbeginn`)}
              hilfe={
                p.rentenbeginnManuell
                  ? 'Von Hand gesetzt.'
                  : `Automatisch: Regelaltersgrenze ${regelaltersgrenzeText(p.geburtsdatum) ?? '67 Jahre'}.`
              }
              zusatz={p.rentenbeginnManuell ? (
                <button
                  type="button"
                  onClick={() => rentenbeginnZuruecksetzen(p.id)}
                  className="mt-1 flex items-center gap-1 text-xs font-medium text-ui-tinte underline-offset-2 hover:underline"
                >
                  <RotateCcw className="h-3 w-3" aria-hidden /> Auf Regelaltersgrenze zurücksetzen
                </button>
              ) : null}
            />
            {p.art === 'grv' ? (
              <>
                <ZahlFeld label="Heutiger Rentenanspruch monatlich" wert={p.grvBruttoHeute}
                  onChange={(n) => setzePerson(p.id, { grvBruttoHeute: n })} einheit="€"
                  hilfe="Wert aus der Renteninformation: „Höhe Ihrer künftigen Regelaltersrente“."
                  vorbelegt={marke(`personen.${p.id}.grvBruttoHeute`)} />
                <Rentenschaetzer personId={p.id} />
              </>
            ) : (
              <>
                <AuswahlFeld label="End-Besoldungsgruppe" wert={p.besoldungsgruppe}
                  onChange={(v) => setzePerson(p.id, { besoldungsgruppe: v })}
                  optionen={BESOLDUNGSGRUPPEN.map((g) => ({ wert: g as string, text: g }))} />
                <ZahlFeld label="Ruhegehaltssatz" wert={p.ruhegehaltssatz}
                  onChange={(n) => setzePerson(p.id, { ruhegehaltssatz: n })} max={71.75} einheit="%"
                  hilfe="Maximal 71,75 % (§ 14 BeamtVG)." />
              </>
            )}
          </div>

          {/*
            ABWEICHEND VERSICHERT — nur bei Paaren, und nur auf Wunsch.

            Der Regelfall ist, dass beide gleich versichert sind; dann steht
            die Angabe einmal oben und nicht zweimal hier. Wer abweicht, ist
            aber kein Randfall: Beamter und Angestellte, Selbststaendiger und
            Arbeitnehmerin. Fuer die war bis hierher gar kein Platz.
          */}
          {s.haushalt.verheiratet && (
            <div className="mt-3 border-t border-ui-linie pt-3">
              <Schalter
                label="Abweichend krankenversichert"
                wert={p.kvStatus !== undefined}
                onChange={(b) => setzePerson(p.id, b
                  ? { kvStatus: s.haushalt.kvStatus }
                  : { kvStatus: undefined, kvErwerb: undefined, zusatzbeitrag: undefined,
                      krankenkasse: undefined, pkv: undefined })}
              />
              <p className="mt-1 text-xs leading-relaxed text-ui-schiefer">
                {p.kvStatus !== undefined
                  ? 'Eigener Status, eigene Kasse, eigener Beitrag — unabhängig vom Haushalt.'
                  : `Versichert wie der Haushalt: ${KV_TEXT[s.haushalt.kvStatus]}.`}
              </p>

              {p.kvStatus !== undefined && (
                <>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <AuswahlFeld
                      label="Krankenversicherung im Ruhestand"
                      wert={p.kvStatus}
                      onChange={(v) => setzePerson(p.id, { kvStatus: v })}
                      optionen={[
                        { wert: 'kvdr', text: 'Gesetzlich pflichtversichert (KVdR)' },
                        { wert: 'freiwillig', text: 'Gesetzlich freiwillig versichert' },
                        { wert: 'pkv', text: 'Privat versichert' },
                      ]}
                    />
                    {p.kvStatus !== 'pkv' && KRANKENKASSEN.length > 0 && (
                      <AuswahlFeld
                        label="Krankenkasse"
                        wert={p.krankenkasse ?? ''}
                        onChange={(name) => {
                          const k = kasseNach(name);
                          setzePerson(p.id, k
                            ? { krankenkasse: k.name, zusatzbeitrag: k.zusatzbeitrag }
                            : { krankenkasse: undefined });
                        }}
                        hilfe={KASSEN_STAND}
                        optionen={[
                          { wert: '', text: 'Wie der Haushalt' },
                          ...KRANKENKASSEN.map((k) => ({
                            wert: k.name, text: `${k.name} — ${prozent(k.zusatzbeitrag, 2)}`,
                          })),
                        ]}
                      />
                    )}
                  </div>
                  {p.kvStatus === 'pkv' && (
                    <PkvFelder
                      titel={`Private Krankenversicherung von ${personName(p)}`}
                      wert={p.pkv ?? s.haushalt.pkv}
                      onChange={(neu) => setzePerson(p.id, { pkv: neu })}
                    />
                  )}
                </>
              )}
            </div>
          )}
        </Abschnitt>
      ))}

      {zeige('personen') && !s.haushalt.verheiratet && (
        <p className="text-xs text-ui-schiefer">
          Für einen zweiten Haushaltspartner oben &bdquo;Verheiratet&ldquo; aktivieren.
        </p>
      )}
    </div>
  );
}
