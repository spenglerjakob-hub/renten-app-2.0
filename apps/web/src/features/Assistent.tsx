import { useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, FileText } from 'lucide-react';
import type { ProjektionsErgebnis } from '@renten/engine';
import { Basisdaten, type BasisTeil } from './Basisdaten';

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
function ladeSchritt(): number {
  try {
    const n = Number(localStorage.getItem(SPEICHER));
    if (Number.isInteger(n) && n >= 0 && n < SCHRITTE.length) return n;
  } catch { /* Speicher gesperrt */ }
  return 0;
}

export function Assistent({ ergebnis, onEhepartnerDialog, vertraege, onFertig }: {
  ergebnis: ProjektionsErgebnis | null;
  onEhepartnerDialog: () => void;
  /** Die Versorgungsschichten — dieselbe Eingabe wie im Formular */
  vertraege: ReactNode;
  /** Nach dem letzten Schritt: weiter zum Ergebnis */
  onFertig: () => void;
}) {
  const [i, setI] = useState(ladeSchritt);
  const geheZu = (n: number) => {
    const z = Math.max(0, Math.min(SCHRITTE.length - 1, n));
    setI(z);
    try { localStorage.setItem(SPEICHER, String(z)); } catch { /* Speicher gesperrt */ }
  };
  const s = SCHRITTE[i]!;
  const letzter = i === SCHRITTE.length - 1;

  return (
    <div className="mx-auto max-w-3xl">
      {/* Fortschritt im Kleinen: fuenf Punkte, jeder anklickbar. */}
      <ol className="mb-3 flex flex-wrap items-center gap-1.5" aria-label="Schritte des Assistenten">
        {SCHRITTE.map((x, n) => (
          <li key={x.titel}>
            <button
              type="button"
              onClick={() => geheZu(n)}
              aria-current={n === i ? 'step' : undefined}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors sm:text-xs ${
                n === i
                  ? 'bg-indigo-600 text-white'
                  : n < i ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
              }`}
            >
              {n < i ? <Check className="h-3 w-3" aria-hidden /> : <span>{n + 1}.</span>}
              <span className={n === i ? '' : 'hidden sm:inline'}>{x.titel}</span>
            </button>
          </li>
        ))}
      </ol>

      <section className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 shadow-sm sm:p-5">
        <h3 className="text-base font-black text-slate-900 sm:text-lg">
          <span className="text-indigo-600">{i + 1}.</span> {s.titel}
        </h3>
        <div className="mt-2 flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
          <p className="text-xs leading-relaxed text-amber-900">
            <span className="font-bold">Das brauchen Sie: </span>{s.unterlage}
          </p>
        </div>

        <div className="mt-4">
          {s.teil === 'vertraege'
            ? vertraege
            : <Basisdaten teil={s.teil} ergebnis={ergebnis} onEhepartnerDialog={onEhepartnerDialog} />}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          {i > 0 ? (
            <button
              type="button"
              onClick={() => geheZu(i - 1)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 sm:text-sm"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden /> Zurück
            </button>
          ) : <span />}
          <button
            type="button"
            onClick={() => (letzter ? onFertig() : geheZu(i + 1))}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-500 sm:text-sm"
          >
            {letzter ? 'Fertig — zum Ergebnis' : `Weiter: ${SCHRITTE[i + 1]!.titel}`}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </section>
    </div>
  );
}
