import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, FileText } from 'lucide-react';
import type { ProjektionsErgebnis } from '@renten/engine';
import { Basisdaten, type BasisTeil } from './Basisdaten';
import { useSzenario } from '../store/szenario';
import { eintragVon, offenePfade, relevant } from './vorbelegung';
import type { FallSchrittId } from './fortschritt';
import { Etappen, KNOPF, KNOPF_ZWEIT } from '../components/stil';

/**
 * DER ASSISTENT fuer die erste Etappe: dieselben Angaben wie im Formular,
 * aber einzeln abgefragt — mit der Unterlage, in der die Zahl steht.
 *
 * Er schreibt in denselben Speicher wie das Formular und der Rechner. Es gibt
 * also nichts zu „uebernehmen": Wer mitten im Assistenten auf das Formular
 * umschaltet, findet dort alles, was er gerade eingetragen hat. Darin liegt
 * der Unterschied zum Vorsorge-Check fuer Kunden, der seine Antworten erst am
 * Ende als Szenario uebergibt.
 */

interface AssistentSchritt {
  titel: string;
  unterlage: ReactNode;
  /** Ein Teil der Basisdaten — oder die Vertraege, die der Aufrufer mitgibt */
  teil: BasisTeil | 'vertraege';
}

const SCHRITTE: AssistentSchritt[] = [
  {
    titel: 'Haushalt & Krankenversicherung',
    teil: 'haushalt',
    unterlage: (
      <>
        Gesetzlich versichert: der <strong>Name Ihrer Krankenkasse</strong> — den Zusatzbeitrag kennt
        der Rechner. Privat versichert: Ihre <strong>Beitragsrechnung</strong>. Bei Kindern genügt das
        Geburtsjahr; es entscheidet über Pflegeversicherung, Kinderfreibetrag und Zulagen.
      </>
    ),
  },
  {
    titel: 'Sie & Ihre gesetzliche Rente',
    teil: 'personen',
    unterlage: (
      <>
        Die <strong>Renteninformation</strong> der Deutschen Rentenversicherung: der Betrag unter{' '}
        <em>„Höhe Ihrer künftigen Regelaltersrente“</em>. Beamte: die <strong>Versorgungsauskunft</strong>{' '}
        mit dem Ruhegehaltssatz. Keine Renteninformation zur Hand? Der Rentenschätzer rechnet aus
        Ihrem Einkommen.
      </>
    ),
  },
  {
    titel: 'Einkommen',
    teil: 'einkommen',
    unterlage: (
      <>
        Die letzte <strong>Gehaltsabrechnung</strong>: das Gesamtbrutto eines normalen Monats —
        Weihnachts- und Urlaubsgeld stecken in der Anzahl der Gehälter. Beamte: die{' '}
        <strong>Bezügemitteilung</strong>. Selbstständige: der Gewinn aus dem letzten{' '}
        <strong>Steuerbescheid</strong>.
      </>
    ),
  },
  {
    titel: 'Bestehende Vorsorge',
    teil: 'vertraege',
    unterlage: (
      <>
        Die jährliche <strong>Standmitteilung</strong> jedes Vertrags: garantierte bzw. prognostizierte
        Monatsrente, Beitrag und Beginn. Bei Betriebsrenten den Anteil des Arbeitgebers
        (Gehaltsabrechnung), bei Depots den <strong>Depotauszug</strong>. Kein Vertrag? Dann einfach
        weiter.
      </>
    ),
  },
  {
    titel: 'Ihr Ziel',
    teil: 'ziel',
    unterlage: (
      <>
        Keine Unterlage — nur eine Überlegung: Wie viel Geld im Monat brauchen Sie im Ruhestand,
        gerechnet in <strong>heutigem Geld</strong>? Die Preissteigerung bis dahin rechnet der
        Planer selbst hinzu.
      </>
    ),
  },
];

const SPEICHER = 'rentenplaner.assistent.v1';

/** Der zuletzt offene Schritt — eine Bequemlichkeit je Geraet. */
export function ladeAssistentSchritt(): number {
  try {
    const n = Number(localStorage.getItem(SPEICHER));
    if (Number.isInteger(n) && n >= 0 && n < SCHRITTE.length) return n;
  } catch { /* Speicher gesperrt */ }
  return 0;
}

export function merkeAssistentSchritt(n: number): number {
  const z = Math.max(0, Math.min(SCHRITTE.length - 1, n));
  try { localStorage.setItem(SPEICHER, String(z)); } catch { /* Speicher gesperrt */ }
  return z;
}

/**
 * Wohin ein offener Schritt des Fortschritts fuehrt. Die Einkuenfte stehen
 * in zwei Schritten: die gesetzliche Rente bei der Person, das Gehalt
 * darunter — gesprungen wird dorthin, wo noch ein Beispielwert steht.
 */
export function assistentSchrittFuer(id: FallSchrittId, offen: readonly string[]): number | null {
  switch (id) {
    case 'mandant': return SCHRITTE.findIndex((x) => x.teil === 'personen');
    // Nur Beispielwerte zaehlen — Standardwerte wie „12 Gehaelter“ fehlen nicht.
    case 'einkuenfte': return offen.some((p) => p.startsWith('einkommen') && eintragVon(p)?.art === 'beispiel')
      ? SCHRITTE.findIndex((x) => x.teil === 'einkommen')
      : SCHRITTE.findIndex((x) => x.teil === 'personen');
    case 'vertraege': return SCHRITTE.findIndex((x) => x.teil === 'vertraege');
    case 'ziel': return SCHRITTE.findIndex((x) => x.teil === 'ziel');
    default: return null;
  }
}

/** Welche offenen Pfade zu einem Schritt des Assistenten gehoeren. */
const PFADE_JE_TEIL: Record<AssistentSchritt['teil'], (p: string) => boolean> = {
  haushalt: (p) => p.startsWith('haushalt.') && p !== 'haushalt.zielNettoHeute',
  personen: (p) => /^personen\.[AB]\.(geburtsdatum|grvBruttoHeute)$/.test(p),
  einkommen: (p) => p.startsWith('einkommen'),
  vertraege: () => false,
  ziel: (p) => p === 'haushalt.zielNettoHeute',
};

export function Assistent({ ergebnis, onEhepartnerDialog, vertraege, onFertig, schritt: i, onSchritt }: {
  ergebnis: ProjektionsErgebnis | null;
  onEhepartnerDialog: () => void;
  /** Die Versorgungsschichten — dieselbe Eingabe wie im Formular */
  vertraege: ReactNode;
  /** Nach dem letzten Schritt: weiter zum Ergebnis */
  onFertig: () => void;
  /**
   * Der Schritt kommt von aussen: Die Fortschrittsleiste springt an die
   * Stelle, an der noch etwas fehlt.
   */
  schritt: number;
  onSchritt: (n: number) => void;
}) {
  const szenario = useSzenario((x) => x.szenario);
  const pruefen = useSzenario((x) => x.pruefen);
  const offen = offenePfade(szenario).filter((p) => relevant(szenario, p));
  const vertraegeOffen = offen.includes('vertraege');
  /*
    Keine Haken nach Position mehr: Ein Schritt, an dem man vorbeigeklickt
    hat, ist nicht erledigt. Was erledigt ist, zeigt die Fortschrittsleiste
    oben; hier markiert ein Punkt, wo noch Beispielwerte stehen.
  */
  const beispielOffen = (x: AssistentSchritt) => (x.teil === 'vertraege'
    ? vertraegeOffen
    : offen.some((p) => PFADE_JE_TEIL[x.teil](p) && eintragVon(p)?.art === 'beispiel'));
  const geheZu = (n: number) => onSchritt(Math.max(0, Math.min(SCHRITTE.length - 1, n)));
  const s = SCHRITTE[i] ?? SCHRITTE[0]!;
  const letzter = i === SCHRITTE.length - 1;

  /*
    Wie die Schritte der Mitarbeiterberatung: duenne Linien, ein leerer
    Kreis, wo noch Beispielwerte stehen (bei den Vertraegen: noch nichts
    erfasst), darunter der Schritt und am Ende „Zurueck“ und „Weiter“ unter
    einer Haarlinie. Die Linien stehen IN der Karte: Ueber ihr stuende eine
    zweite Leiste, die genauso aussieht wie die Etappen der Seite.
  */
  return (
    <section aria-labelledby="assistent-titel" className="ui-karte p-5 sm:p-7">
      <Etappen
        schritte={SCHRITTE.map((x) => x.titel)}
        aktiv={i}
        onWechsel={geheZu}
        beschriftung="Schritte des Assistenten"
        erledigt={() => false}
        offen={(n) => beispielOffen(SCHRITTE[n]!)}
        offenText={(n) => (SCHRITTE[n]!.teil === 'vertraege' ? 'noch nicht erfasst' : 'Beispielwerte offen')}
      />

      <div className="mt-6 sm:mt-8">
        <h3 id="assistent-titel" className="text-lg font-medium tracking-[-0.01em] text-ui-tinte sm:text-xl">{s.titel}</h3>
        {/* Die Unterlage als leiser Satz unter dem Titel — wie die Hilfetexte der Beratung, kein gelber Kasten. */}
        <p className="mt-2 flex max-w-3xl gap-2.5 text-sm leading-relaxed text-ui-schiefer [&_strong]:font-medium [&_strong]:text-ui-tinte">
          <FileText className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span><span className="font-medium text-ui-tinte">Das brauchen Sie: </span>{s.unterlage}</span>
        </p>

        <div className="mt-6">
          {s.teil === 'vertraege'
            ? (
              <>
                {/*
                  KEINE VERTRAEGE ist auch eine Antwort — aber eine, die man
                  geben muss. Ohne diesen Knopf bliebe der Schritt offen, nur
                  weil es nichts zu erfassen gibt.
                */}
                {szenario.vertraege.length === 0 && (vertraegeOffen ? (
                  <button
                    type="button"
                    onClick={() => { pruefen('vertraege'); geheZu(i + 1); }}
                    className={`mb-5 ${KNOPF_ZWEIT}`}
                  >
                    <Check className="h-4 w-4" aria-hidden /> Keine bestehenden Verträge
                  </button>
                ) : (
                  <p className="mb-5 text-sm text-ui-schiefer">Vermerkt: keine bestehenden Verträge.</p>
                ))}
                {vertraege}
              </>
            )
            : <Basisdaten teil={s.teil} ergebnis={ergebnis} onEhepartnerDialog={onEhepartnerDialog} />}
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-ui-linie pt-6">
          {i > 0 ? (
            <button type="button" onClick={() => geheZu(i - 1)} className={KNOPF_ZWEIT}>
              <ArrowLeft className="h-4 w-4" aria-hidden /> Zurück
            </button>
          ) : <span />}
          <button type="button" onClick={() => (letzter ? onFertig() : geheZu(i + 1))} className={`ml-auto ${KNOPF}`}>
            {letzter ? 'Fertig — zum Ergebnis' : `Weiter: ${SCHRITTE[i + 1]!.titel}`}
            <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
          </button>
        </div>
      </div>
    </section>
  );
}
